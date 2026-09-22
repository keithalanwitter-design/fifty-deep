// 50 Deep service worker: offline fallback + daily reminders.
// Network first so updates show right away; the cache is only a fallback.
const CACHE = "fifty-deep-v4";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.png", "./icon-192.png", "./icon-512.png"];
const BOARD = "https://firestore.googleapis.com/v1/projects/fifty-deep/databases/(default)/documents/status/board?key=AIzaSyBPVyPhfu5XzA_x65X11cG7x_8qQ3kF2Yc";

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== "fd-meta").map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // leave Firebase, fonts and the reminder service alone
  e.respondWith(fetch(e.request).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});

/* ---------- reminders ---------- */
function fsVal(v){
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue; if ("integerValue" in v) return +v.integerValue; if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue; if ("nullValue" in v) return null;
  if ("mapValue" in v){ const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fsVal(x); return o; }
  return null;
}
async function readBoard(){
  try { const r = await fetch(BOARD, { cache: "no-store" }); if (!r.ok) return null; const d = await r.json(); const o = {}; for (const [k, x] of Object.entries(d.fields || {})) o[k] = fsVal(x); return o; } catch { return null; }
}
async function whoAmI(){ try { const c = await caches.open("fd-meta"); const r = await c.match("./__me"); return r ? await r.json() : null; } catch { return null; } }
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

function compose(board, me){
  const hr = new Date().getHours();
  const fresh = board && board.date === localDate() && board.players;
  const p = fresh && me ? board.players[me.me] : null;
  const first = fresh ? Object.values(board.players).find(x => x.first) : null;
  const title = board && board.day ? `50 Deep · Day ${board.day}` : "50 Deep";
  const name = (me && me.name) || "";
  const streak = p && p.streak ? ` Your ${p.streak}-day streak is on the line.` : "";
  if (!p) return { title, body: hr < 12 ? `${name ? name + ", " : ""}new day, new 50s. Sets of 10, good form. Get round 1 in early.` : "Your 50s are waiting. Five rounds of 10. Get after it." };
  if (hr < 12){
    if (p.rank === 1) return { title, body: `You're #1 with ${p.pts} points. Finish first today and nobody catches you.` };
    if (p.gap > 0) return { title, body: `You're #${p.rank}, ${p.gap} back of ${p.ahead}. Today's the day to take the spot. Early sets win the tiebreak.` };
    return { title, body: `You're tied with ${p.ahead}. First one done today takes the spot. Go get round 1.` };
  }
  if (p.full) return { title, body: `Full day banked. You're #${p.rank} on the board. Discipline looks good on you.` };
  if (hr < 19){
    const who = first && first.name !== name ? `${first.name} already finished.` : "Nobody has finished yet. Be first.";
    return { title, body: `${p.rounds} of 5 rounds done. ${who}${streak}` };
  }
  return { title: "Last call · 50 Deep", body: `Still time. Finish today's 50s before bed.${streak || " Don't hand out free points."}` };
}

self.addEventListener("push", e => {
  e.waitUntil((async () => {
    const [board, me] = await Promise.all([readBoard(), whoAmI()]);
    let { title, body } = compose(board, me);
    if (new Date().getDay() === 0 || localDate() === "2026-10-22") body += " Your weekly check-in is open on the Family Wall.";
    await self.registration.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", tag: "fifty-deep-daily", renotify: true, data: { url: "./" } });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all){ if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  })());
});
