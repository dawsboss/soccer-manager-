/* Minutes' service worker. Two jobs, and only two.

   1. Show what the server pushes (functions/push.js): a team notice or a
      family message, with the phone's screen off and Minutes closed.
   2. Open the right place when the notification is tapped: the
      conversation, in the right club.

   No fetch handler, on purpose. The app already works with no signal (the
   browser's cache holds the page, localStorage holds the club), and a
   worker that serves the page from its own cache is a second copy of every
   file that can disagree with the build the page says it is: the
   cached-page failure app.js's stale() check exists for, made permanent. If
   offline loading is ever wanted it is its own decision, with its own test.

   Kept as a plain file with no imports, so test/push.js runs it as it is. */

const STORE = 'minutes-sw';
const ME_KEY = 'me';   // who is signed in on this phone, as the page last said

/* Pushes are meant for one account. The page tells this worker who is signed
   in whenever that changes (signing out says nobody). A push for anybody else
   is shown without its words: a phone handed to somebody else, or signed out
   with no signal so its address could not be taken down, says only that
   there is something in Minutes, never what. Unknown (a worker installed
   before the page ever said) shows it: the token was only ever left by the
   account that was signed in. */
async function whoIsHere() {
  try {
    const c = await caches.open(STORE);
    const r = await c.match(ME_KEY);
    return r ? await r.text() : null;
  } catch (e) { return null; }
}
async function setHere(uid) {
  try { const c = await caches.open(STORE); await c.put(ME_KEY, new Response(String(uid || ''))); } catch (e) { }
}

/* What this phone changed on the calendar itself, for ten minutes. The
   database does not record who moved a practice, so the server tells the
   whole team, the coach who moved it included; her own phone, which the page
   told, keeps quiet about it. Her other phones still say it, which is a fair
   confirmation that it went. */
const MINE_KEY = 'mine', MINE_MS = 10 * 60000;
async function mineNow() {
  try {
    const c = await caches.open(STORE);
    const r = await c.match(MINE_KEY);
    const all = r ? JSON.parse(await r.text()) : {};
    const now = Date.now(), out = {};
    for (const [k, at] of Object.entries(all || {})) if (now - at < MINE_MS) out[k] = at;
    return out;
  } catch (e) { return {}; }
}
async function noteMine(key) {
  try {
    const all = await mineNow();
    all[String(key)] = Date.now();
    const c = await caches.open(STORE);
    await c.put(MINE_KEY, new Response(JSON.stringify(all)));
  } catch (e) { }
}

/* Safari takes away push from a site that gets one and shows nothing, so on
   an Apple device a notification is always shown, even with Minutes open in
   front of her. Elsewhere, a page she is looking at already shows its own
   pop-up and alert bar, and a system notification on top would be the same
   news twice. */
const apple = () => {
  const ua = (self.navigator && self.navigator.userAgent) || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && !/Chrome|Chromium|Firefox|Edg/.test(ua));
};

function payload(e) {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = {}; }
  // Cloud Messaging wraps what the server sent under data
  const d = (p && p.data) || p || {};
  const n = (p && p.notification) || {};
  return {
    title: String(d.title || n.title || 'Minutes'),
    body: String(d.body || n.body || ''),
    tag: String(d.tag || ''),
    code: String(d.code || ''),
    hash: String(d.hash || '#/messages'),
    uid: String(d.uid || ''),
    key: String(d.key || ''),
    urgent: d.urgent === '1'
  };
}

async function onPush(e) {
  const d = payload(e);
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const looking = wins.some(c => c.visibilityState === 'visible' && c.focused);
  if (looking && !apple()) return;
  // a change this phone made itself is not news to it (Apple aside, as above)
  if (d.key && !apple() && (await mineNow())[d.key]) return;
  const here = await whoIsHere();
  const theirs = here !== null && d.uid && here !== d.uid;
  return self.registration.showNotification(theirs ? 'Minutes' : d.title, {
    body: theirs ? 'Something new for an account that was signed in on this phone.' : d.body,
    tag: d.tag || undefined,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    requireInteraction: d.urgent && !theirs,
    // a tap opens the conversation only for whoever it was for
    data: theirs ? { code: '', hash: '' } : { code: d.code, hash: d.hash }
  });
}

/* A tap: an open Minutes is brought forward and told where to go (it switches
   club itself if it has to, as an alert's Open does); with none open, a new
   one opens there, with the club on the address for the page to switch to
   once it has checked she is still in it. */
async function onClick(e) {
  e.notification.close();
  const { code, hash } = e.notification.data || {};
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const win = wins.find(c => c.focused) || wins[0];
  if (win) {
    try { await win.focus(); } catch (err) { }
    if (hash) win.postMessage({ type: 'open', code: code || '', hash });
    return;
  }
  const base = self.registration.scope;
  return self.clients.openWindow(base + (code ? '?open=' + encodeURIComponent(code) : '') + (hash || ''));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'me') e.waitUntil(setHere(e.data.uid));
  if (e.data && e.data.type === 'mine' && e.data.key) e.waitUntil(noteMine(e.data.key));
});
self.addEventListener('push', e => e.waitUntil(onPush(e)));
self.addEventListener('notificationclick', e => e.waitUntil(onClick(e)));
