/* Minutes — soccer sub & minutes tracker.
   Static app. Data lives in localStorage, and mirrors to Firebase Realtime
   Database when a config + workspace code are present. */

const BUILD = '77';
const BUILT = '2026-10-03';
/* index.html carries the build it was published with. If this file is newer, the
   browser handed us a cached page — the exact failure that has eaten hours. */
const pageBuild = () => {
  const m = document.querySelector('meta[name="build"]');
  return m ? m.content : null;
};
const stale = () => { const p = pageBuild(); return p !== null && p !== BUILD; };

const LS_DATA = 'sm.data.v1';
const LS_UI = 'sm.ui.v1';
const LS_WS = 'sm.workspace';
const LS_WHO = 'sm.tracker';
const LS_SYNCED = 'sm.synced';   // last good sync, per club
const LS_DENIED = 'sm.denied';   // first refusal, per club
const LS_ENV = 'sm.env';         // which Firebase environment this device talks to
const LS_ME = 'sm.me';           // who was last verified signed in on this device
const DENY_GRACE_H = 24;
/* A club whose code starts with this is invented data for rehearsing on. */
const SANDBOX_PREFIX = 'test-';

/* The workspace node was already organisation-shaped — many teams, their
   matches — so membership hangs off it directly and nothing has to migrate. */
/* rsvp/{tid}/{item}/{pid}: who is coming, answered by a parent for her own
   child (or by a coach for anyone). Its own node, not inside the game or the
   entry, for two reasons. A coach saving a game writes the whole game, so an
   answer stored inside it would be lost to any edit made while a parent was
   answering; and the rule that lets a parent write here grants this node and
   nothing else, so a parent can never touch the team or the game. */
let state = { teams: {}, matches: {}, access: {}, rsvp: {} };
let ui = { view: 'matches', gameView: 'subs', teamId: null, matchId: null, picked: null, dragging: false, editFid: null, sortBy: 'need', plan: null, snapAt: null, snapSid: null };
let lastLog = [];
let lastScreen = null;   // the screen render() last drew, so a redraw of the same one keeps its scroll

const ROLES = ['GK', 'Back', 'Mid', 'Wing', 'Forward'];
const S = (label, role, x, y) => ({ id: 's' + label + x, label, role, x, y });

/* Built-in shapes, keyed by how many are on the pitch. Coaches can copy one,
   drag it around and save it as a team default. */
const PRESETS = {
  11: {
    '4-4-2': [S('GK', 'GK', 50, 92), S('LB', 'Back', 16, 74), S('LCB', 'Back', 38, 79), S('RCB', 'Back', 62, 79), S('RB', 'Back', 84, 74),
    S('LM', 'Mid', 16, 50), S('LCM', 'Mid', 38, 53), S('RCM', 'Mid', 62, 53), S('RM', 'Mid', 84, 50),
    S('LS', 'Forward', 40, 22), S('RS', 'Forward', 60, 22)],
    '4-3-3': [S('GK', 'GK', 50, 92), S('LB', 'Back', 16, 74), S('LCB', 'Back', 38, 79), S('RCB', 'Back', 62, 79), S('RB', 'Back', 84, 74),
    S('LCM', 'Mid', 32, 55), S('CM', 'Mid', 50, 61), S('RCM', 'Mid', 68, 55),
    S('LW', 'Wing', 18, 27), S('ST', 'Forward', 50, 18), S('RW', 'Wing', 82, 27)],
    '3-5-2': [S('GK', 'GK', 50, 92), S('LCB', 'Back', 30, 80), S('CB', 'Back', 50, 83), S('RCB', 'Back', 70, 80),
    S('LWB', 'Wing', 12, 58), S('LCM', 'Mid', 35, 57), S('CM', 'Mid', 50, 63), S('RCM', 'Mid', 65, 57), S('RWB', 'Wing', 88, 58),
    S('LS', 'Forward', 40, 22), S('RS', 'Forward', 60, 22)]
  },
  9: {
    '3-3-2': [S('GK', 'GK', 50, 92), S('LB', 'Back', 22, 76), S('CB', 'Back', 50, 81), S('RB', 'Back', 78, 76),
    S('LM', 'Mid', 22, 53), S('CM', 'Mid', 50, 57), S('RM', 'Mid', 78, 53),
    S('LS', 'Forward', 38, 23), S('RS', 'Forward', 62, 23)],
    '3-2-3': [S('GK', 'GK', 50, 92), S('LB', 'Back', 22, 76), S('CB', 'Back', 50, 81), S('RB', 'Back', 78, 76),
    S('LCM', 'Mid', 36, 56), S('RCM', 'Mid', 64, 56),
    S('LW', 'Wing', 20, 27), S('ST', 'Forward', 50, 20), S('RW', 'Wing', 80, 27)],
    '2-5-1': [S('GK', 'GK', 50, 92), S('LB', 'Back', 32, 78), S('RB', 'Back', 68, 78),
    S('LM', 'Wing', 12, 50), S('LCM', 'Mid', 31, 56), S('CM', 'Mid', 50, 60), S('RCM', 'Mid', 69, 56), S('RM', 'Wing', 88, 50),
    S('ST', 'Forward', 50, 23)]
  },
  7: {
    '2-3-1': [S('GK', 'GK', 50, 92), S('LB', 'Back', 32, 77), S('RB', 'Back', 68, 77),
    S('LM', 'Mid', 20, 53), S('CM', 'Mid', 50, 57), S('RM', 'Mid', 80, 53), S('ST', 'Forward', 50, 23)],
    '3-2-1': [S('GK', 'GK', 50, 92), S('LB', 'Back', 22, 77), S('CB', 'Back', 50, 81), S('RB', 'Back', 78, 77),
    S('LM', 'Mid', 35, 53), S('RM', 'Mid', 65, 53), S('ST', 'Forward', 50, 23)]
  },
  5: {
    '1-2-1': [S('GK', 'GK', 50, 92), S('CB', 'Back', 50, 77), S('LM', 'Mid', 28, 51), S('RM', 'Mid', 72, 51), S('ST', 'Forward', 50, 25)]
  }
};

const presetsFor = size => PRESETS[size] || {};
const clone = o => JSON.parse(JSON.stringify(o));

/* How well a player suits a spot. Neutral (0) means "fine here" — the default
   for youth players, who can go anywhere. */
function fit(p, slot) {
  if (!slot) return 0;
  if (slot.role === 'GK') return p.gk || p.preferred === 'GK' ? 3 : -3;
  if (p.gk) return -1;
  if (p.preferred === slot.role) return 2;
  if ((p.canPlay || []).includes(slot.role)) return 1;
  return p.anywhere === false ? -1 : 0;
}

/* Greedy best-fit assignment of an XI to the shape's spots. prev keeps players
   in the role they held last block rather than rotating them for no reason. */
function assignSlots(chosen, slots, prev) {
  if (!slots || !slots.length) return {};
  const pairs = [];
  for (const p of chosen) for (const s of slots)
    pairs.push({ pid: p.id, sid: s.id, v: fit(p, s) + (prev && prev[s.id] === p.id ? 0.5 : 0) });
  pairs.sort((a, b) => b.v - a.v);
  const assign = {}, usedP = new Set(), usedS = new Set();
  for (const x of pairs) {
    if (usedP.has(x.pid) || usedS.has(x.sid)) continue;
    assign[x.sid] = x.pid; usedP.add(x.pid); usedS.add(x.sid);
  }
  return assign;
}

const slotById = (m, sid) => ((m.formation && m.formation.slots) || []).find(s => s.id === sid) || null;
function slotIdOf(m, pid) {
  const o = openStint(m, pid);
  return (o && o[1].slot) || (((m.positions || {})[pid] || {}).slot) || null;
}
const spotLabel = st => st ? (st.label || st.role || null) : null;
function currentSpot(m, pid) {
  const o = openStint(m, pid);
  if (!o) return null;
  const sl = o[1].slot ? slotById(m, o[1].slot) : null;
  return sl ? sl.label : (o[1].role || null);
}
/* seconds played broken down by role — the point of tracking switches */
function byRole(m, pid, now = nowMs()) {
  const e = elapsedSec(m, now), out = {};
  for (const [, st] of stintsOf(m, pid)) {
    const sl = st.slot ? slotById(m, st.slot) : null;
    const key = (sl && sl.role) || st.role || 'Unassigned';
    out[key] = (out[key] || 0) + Math.max(0, (st.off == null ? e : st.off) - st.on);
  }
  return out;
}
const roleSummary = (m, pid, now) => Object.entries(byRole(m, pid, now))
  .filter(([, v]) => v >= 30).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${mins(v)} at ${k}`).join(' · ');
const slotOf = (m, pid) => slotById(m, slotIdOf(m, pid));
const slotTaken = (m, sid) => fieldIds(m).some(pid => slotIdOf(m, pid) === sid);

/* Old players stored a flat positions[] list; fold it into the new fields. */
function migrate(p) {
  if (p.preferred !== undefined || !Array.isArray(p.positions)) return p;
  const [first, ...rest] = p.positions;
  return { ...p, preferred: first || '', canPlay: rest, anywhere: true };
}

/* ---------------- utils ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function mmss(sec) {
  sec = Math.max(0, Math.floor(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function mins(sec) { return Math.round(sec / 60); }

function setDeep(obj, path, value) {
  const k = path.split('/');
  let o = obj;
  for (let i = 0; i < k.length - 1; i++) { if (typeof o[k[i]] !== 'object' || o[k[i]] === null) o[k[i]] = {}; o = o[k[i]]; }
  o[k[k.length - 1]] = value;
}
function delDeep(obj, path) {
  const k = path.split('/');
  let o = obj;
  for (let i = 0; i < k.length - 1; i++) { if (!o[k[i]]) return; o = o[k[i]]; }
  delete o[k[k.length - 1]];
}

/* ---------------- storage ---------------- */
const wsCode = () => (localStorage.getItem(LS_WS) || '').trim();

/* Who was signed in here last time. Firebase Auth restores a session from its
   own storage, but only once its module has loaded from the CDN — which does
   not happen at a field with no signal. Without a local copy of the identity a
   locked-down club would show its lock screen to the coach it belongs to, on
   the one occasion this app exists for.

   So remember it, and clear it the instant she signs out. That second half is
   what makes signing out mean something straight away, rather than three
   seconds later when the database gets around to refusing the read. It is not a
   permission: the rules decide what this uid may actually touch, and anyone who
   can read this key can already read the cached roster sitting beside it. */
function cacheMe(v) {
  try { v ? localStorage.setItem(LS_ME, JSON.stringify(v)) : localStorage.removeItem(LS_ME); } catch (e) { }
}
function cachedMe() {
  try { const v = JSON.parse(localStorage.getItem(LS_ME) || 'null'); return v && v.uid ? v : null; }
  catch (e) { return null; }
}

/* Which Firebase environment this device talks to. Empty is production.

   A second workspace code gives auth work somewhere safe to click, but it
   cannot rehearse a rules change, and that is the change worth rehearsing.
   Rules belong to a database instance, not to a code: the lockdown block is
   written against workspaces/$code, so publishing it to try it on a test club
   applies it to the real one in the same instant. Nor can you carve a stricter
   sandbox out of an open wildcard — a rule grants and a child can never take
   that back, so the open rule would still win. A separate database is the only
   thing that actually isolates them.

   firebase-config.js declares the environments; this picks one. An entry only
   needs the keys it changes: a second Realtime Database in the same project is
   a databaseURL and nothing else, and a whole separate project is a full config
   object. Switching reloads, so nothing has to unpick a live connection. */
const envName = () => (localStorage.getItem(LS_ENV) || '').trim();
const envList = () => window.SOCCER_FIREBASE_ENVS || {};
function fbConfig() {
  const base = window.SOCCER_FIREBASE_CONFIG || {};
  const over = envList()[envName()];
  return over ? { ...base, ...over } : base;
}
/* Local copies are kept per club. Namespace them by environment as well, or the
   same code in two environments shares one bucket on this device and a test run
   quietly overwrites the real season. Production keeps the bare key, so nothing
   already on anyone's phone has to move. */
const envPrefix = () => (envName() ? envName() + '~' : '');
const clubKey = () => envPrefix() + (wsCode() || 'local');

/* Marked in two places on purpose. The code prefix is local and readable before
   any database round-trip — schedulePublish() has to know before it fires. The
   access/org flag syncs, so a second device opening the same club also knows it
   is a rehearsal. */
const isSandbox = () => wsCode().startsWith(SANDBOX_PREFIX) || !!(acc().org || {}).sandbox;
/* Who is tapping on this device. Never synced, never a permission — anyone can
   type anything. It exists so two people can track one game and untangle it after. */
const typedName = () => (localStorage.getItem(LS_WHO) || '').trim();
const whoAmI = () => (me && me.name) || typedName();

/* uid is the identity, byName is a display snapshot. A stamp with no uid is
   unverified, which is exactly what an unsigned device should produce. */
const stampedBy = () => me
  ? { by: me.uid, byName: me.name }
  : (typedName() ? { by: null, byName: typedName() } : {});

/* Events written before auth put a typed name straight into `by`. They are told
   apart by having no `byName` at all, so no guessing is needed. */
function stampOf(x) {
  if (x.byName !== undefined) return { uid: x.by || null, name: x.byName || null, verified: !!x.by };
  if (x.by) return { uid: null, name: x.by, verified: false };
  return { uid: null, name: null, verified: false };
}
const stampKey = x => { const st = stampOf(x); return st.uid || (st.name ? 'n:' + st.name : '?'); };
const stampLabel = x => { const st = stampOf(x); return st.name || 'unnamed'; };

function trackersIn(m) {
  const c = {};
  for (const src of [m.goals, m.shots, m.events, m.poss])
    for (const x of Object.values(src || {})) {
      const k = stampKey(x);
      if (!c[k]) c[k] = { name: stampLabel(x), verified: stampOf(x).verified, n: 0 };
      c[k].n++;
    }
  return c;
}
const dataKey = () => LS_DATA + ':' + clubKey();

/* Every store that holds data goes through here, because a phone whose
   storage is full refuses the write, and before this the refusal was
   swallowed: the change looked saved, lived only in the open page, and was
   gone when the page closed. That is the one way an unsent change could
   vanish, so it is said out loud, once when it starts, and on every screen
   until a save gets through again. Screen preferences don't come through
   here; losing those loses nothing. */
let storeFail = 0;
function keepStored(key, text) {
  try {
    localStorage.setItem(key, text);
    if (storeFail) { storeFail = 0; paintSync(); }
    return true;
  } catch (e) {
    if (!storeFail) {
      storeFail = nowMs();
      toast('This phone is out of storage space, so your latest change could not be kept on it. Free up some space before you close the app.');
    }
    return false;
  }
}
function saveLocal() { keepStored(dataKey(), JSON.stringify(state)); }
function saveUi() {
  try { localStorage.setItem(LS_UI, JSON.stringify({ view: ui.view, teamId: ui.teamId, matchId: ui.matchId, sortBy: ui.sortBy, plan: ui.plan, gameView: ui.gameView, follow: ui.follow || null, feedAll: !!ui.feedAll, practice: ui.practice || null, sess: ui.sess ? { tab: ui.sess.tab, scope: ui.sess.scope, month: ui.sess.month } : null, tabs: 2 })); } catch (e) { }
}
function loadLocal() {
  try {
    // one-time move of pre-v5 data into the bucket for the current code
    const legacy = localStorage.getItem(LS_DATA);
    if (legacy !== null && localStorage.getItem(dataKey()) === null) {
      localStorage.setItem(dataKey(), legacy);
      localStorage.removeItem(LS_DATA);
    }
    const d = JSON.parse(localStorage.getItem(dataKey()) || 'null');
    if (d) state = { teams: d.teams || {}, matches: d.matches || {}, access: d.access || {}, rsvp: d.rsvp || {} };
    const u = JSON.parse(localStorage.getItem(LS_UI) || 'null');
    if (u) Object.assign(ui, u);
    /* Before build 61 'live' was the coach's subs screen. Someone who left a
       game open on it expects to come back to the same screen, not the feed
       that took the name. */
    if (u && !u.tabs && ui.gameView === 'live') ui.gameView = 'subs';
    // pre-v26 the game screens were top-level tabs
    const oldTabs = { live: 'live', track: 'track', match: 'pitch' };
    if (oldTabs[ui.view]) { ui.gameView = oldTabs[ui.view]; ui.view = 'game'; }
    // a staged batch belongs to one game; drop it if we are somewhere else
    if (ui.plan && ui.plan.matchId !== ui.matchId) ui.plan = null;
  } catch (e) { }
  loadTrain();
  loadSess();
  loadPending();
}

/* A local copy is a cache, not an archive. Three things end it: the club is
   retired, access is withdrawn, or nobody has opened it in a long time. None of
   this can reach a copy someone deliberately exported — nothing can — but it
   stops a stale shadow of a roster sitting on a phone forever by default. */
function purgeClub(code, why) {
  const k = envPrefix() + code;
  try {
    localStorage.removeItem(LS_DATA + ':' + k);
    localStorage.removeItem(LS_SYNCED + ':' + k);
    localStorage.removeItem(LS_DENIED + ':' + k);
    localStorage.removeItem(LS_TRAIN + ':' + k);
    localStorage.removeItem(LS_SESS + ':' + k);
    localStorage.removeItem(LS_PENDING + ':' + k);
    localStorage.removeItem(LS_SEEN + ':' + k);
  } catch (e) { }
  if (code === wsCode()) { state = { teams: {}, matches: {}, access: {}, rsvp: {} }; train = TRAIN_BLANK(); sess = SESS_BLANK(); pending = { seq: 0, w: {} }; purged = why; render(); }
}

function markSynced() {
  try {
    localStorage.setItem(LS_SYNCED + ':' + clubKey(), String(Date.now()));
    localStorage.removeItem(LS_DENIED + ':' + clubKey());
  } catch (e) { }
}

/* Refusal is not instant deletion: a botched rules change would otherwise wipe a
   coach's offline copy before anyone noticed. It has to persist for a day. */
function noteDenied() {
  const k = LS_DENIED + ':' + clubKey();
  try {
    const first = Number(localStorage.getItem(k) || 0);
    if (!first) { localStorage.setItem(k, String(Date.now())); return false; }
    if (Date.now() - first > DENY_GRACE_H * 3600e3) { purgeClub(wsCode(), 'access'); return true; }
  } catch (e) { }
  return false;
}

/* ---------------- firebase sync ---------------- */
let fbApp = null, fbAuth = null, authMod = null;
let me = null;              // { uid, name, email } when signed in
let fb = null; // { db, ref, set, remove, onValue, base }
let clockSkew = 0;           // serverTime - deviceTime, in ms
let online = false;          // .info/connected, as the database last said
let wsRead = false;          // the workspace has been read from the database this session
const nowMs = () => Date.now() + clockSkew;

function setSync(stateName, label) {
  syncBase = [stateName, label];
  paintSync();
}

let fbAppPromise = null;
async function getApp() {
  if (fbApp) return fbApp;
  const cfg = fbConfig();
  if (!cfg || !cfg.apiKey) return null;
  // initAuth() and initSync() both call this at boot; without caching the
  // in-flight promise they can race and call initializeApp() twice, which
  // throws and silently kills whichever one loses.
  if (!fbAppPromise) {
    fbAppPromise = import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js')
      .then(appMod => { fbApp = appMod.initializeApp(cfg); return fbApp; });
  }
  return fbAppPromise;
}

/* Resolves once after Firebase Auth has restored (or ruled out) a session.
   initSync() must wait on this before reading the workspace: onAuthStateChanged
   can fire after the database listener would otherwise have already gone out
   with no auth.uid attached, and a rule keyed on auth.uid denies that request
   even for someone who is, a moment later, fully signed in. That denial then
   sticks, because the base read below is only ever tried once. */
let authReadyResolve;
const authReady = new Promise(res => { authReadyResolve = res; });
let attachWorkspace = () => { };   // set by initSync once fb/db exist; re-runnable

/* Signing in is optional for now. Nothing gates on it yet — it exists so stamps
   carry a real identity, and so the org model has something to hang off next. */
async function initAuth() {
  const app = await getApp();
  if (!app) { authReadyResolve(); return; }
  try {
    authMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    fbAuth = authMod.getAuth(app);

    // arriving back from a magic link
    if (authMod.isSignInWithEmailLink(fbAuth, location.href)) {
      const mail = localStorage.getItem('sm.emailForLink') || prompt('Confirm your email to finish signing in');
      if (mail) {
        try {
          await authMod.signInWithEmailLink(fbAuth, mail, location.href);
          localStorage.removeItem('sm.emailForLink');
          history.replaceState(null, '', location.pathname);
        } catch (e) { toast('That sign-in link did not work'); }
      }
    }

    let prevUid;
    authMod.onAuthStateChanged(fbAuth, u => {
      me = u ? { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] || 'Signed in', email: u.email || '', photo: u.photoURL || '' } : null;
      cacheMe(me);   // signing out clears it, which is what locks the club now
      const uid = me ? me.uid : null;
      // her own drills are hers, not the phone's: gone the moment she is
      if (mineUid && mineUid !== uid) forgetMine();
      // identity changed after boot — e.g. someone signs in from the lock
      // screen — so any earlier refusal is stale; read the workspace again
      if (prevUid !== undefined && prevUid !== uid) {
        denied = false; attachWorkspace();
        resetTrainWatch();
        // an invite read as the last account says nothing about this one
        if (invite && invite.status !== 'working') { invite.status = 'idle'; invite.doc = null; }
        if (join && join.status !== 'working') { join.status = 'idle'; join.sent = false; }
      }
      prevUid = uid;
      if (me && fb) {
        // put myself on the roster of people so an admin has someone to assign
        const known = (acc().members || {})[me.uid];
        if (!known || known.name !== me.name || known.email !== me.email) {
          quiet(`access/members/${me.uid}`, { name: me.name, email: me.email, at: (known && known.at) || nowMs() });
          saveLocal();
        }
      }
      authReadyResolve();
      maybeLoadInvite();
      maybeLoadJoin();
      watchMyClubs();
      render();
    });
  } catch (e) {
    console.warn('auth unavailable', e);
    authReadyResolve(); // no auth module at all still counts as "resolved, signed out"
  }
}

async function initSync() {
  const cfg = fbConfig();
  const code = localStorage.getItem(LS_WS);
  if (!cfg || !cfg.apiKey || !cfg.databaseURL) { setSync('off', 'this device'); return; }
  try {
    const app = await getApp();
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const db = dbMod.getDatabase(app);
    rtdb = { db, mod: dbMod };
    // an invite and the list of my clubs are both read before any workspace,
    // because a device with neither code nor role is exactly who needs them
    authReady.then(() => { maybeLoadInvite(); maybeLoadJoin(); watchMyClubs(); });

    // appOwners is root-level and has nothing to do with any one workspace —
    // read it before a code even exists. A device with no workspace still
    // needs to know whether the signed-in account is the app owner, so the
    // stopgap "connect to a workspace" control in Setup can find them.
    dbMod.onValue(dbMod.ref(db, 'appOwners'), s => { appOwners = s.val() || {}; render(); }, () => { });

    dbMod.onValue(dbMod.ref(db, '.info/serverTimeOffset'), s => {
      clockSkew = s.val() || 0;
      if (Math.abs(clockSkew) > 30000) console.warn('device clock is off by', Math.round(clockSkew / 1000), 's');
    });

    dbMod.onValue(dbMod.ref(db, '.info/connected'), s => {
      online = !!s.val();
      setSync(s.val() ? 'live' : 'off', s.val() ? 'synced' : 'offline');
    });

    if (!code) { setSync('off', 'no code'); return; }

    fb = { db, ref: dbMod.ref, set: dbMod.set, remove: dbMod.remove, base: 'workspaces/' + code };
    fb.childAdded = dbMod.onChildAdded;

    // One full read to get in sync, then child-level listeners so an update to
    // one match can never touch another, or the teams tree.
    const onDenied = err => {
      if (!/permission|denied/i.test((err && err.code) || '')) return;
      denied = true; setSync('off', 'sign in');
      noteDenied();
      render();
    };

    // a retired club tells every device still holding a copy to let it go —
    // the app owner's device included. The workspace data is never deleted by
    // this; retiring only writes the retired/{code} marker. An owner who needs
    // to see a retired club again can still open it from Club settings ›
    // Retired clubs, which reads it straight from the database.
    dbMod.onValue(dbMod.ref(db, 'retired/' + code), rs => {
      if (rs.val()) purgeClub(code, 'retired');
    }, () => { });

    /* .read is granted on retired/$code and never on the parent, so
       subscribing to the whole node is refused the moment a club is locked
       down — silently, because the error handler here can do nothing useful.
       The owner's archive card then never appears at all, which is the one
       escape hatch README promises for exporting a closed club. Ask for the
       codes this device already knows instead: that is exactly what the rules
       do grant, and a club this device has never opened was never in the list. */
    const watching = new Set();
    const watchRetired = code => {
      if (!code || watching.has(code)) return;
      watching.add(code);
      dbMod.onValue(dbMod.ref(db, 'retired/' + code), rs => {
        const v = rs.val();
        if (v) retiredClubs[code] = v; else delete retiredClubs[code];
        render();
      }, () => { });
    };
    for (const c of knownClubs()) watchRetired(c.code);
    watchRetired(code);

    function wireBase(attempt) {
      dbMod.onValue(dbMod.ref(db, fb.base), snap => {
        denied = false;
        const v = snap.val();
        if (!v) pushAll();
        else {
          // merged, never replaced: what this phone owes the club goes back on top, and back out
          const owed = mergeConnect(v);
          wsRead = true;
          saveLocal(); markSynced(); render();
          flushPending();
          for (const [p, x] of owed) remoteSet(p, x);
          /* Close the migration bridge without anybody being told to. The
             per-team rules fall back to the old club-wide index while
             access/teamIndex is missing; an admin's device is the only one
             allowed to write it, so it does, once, on the way in. */
          if (canAdmin()) { syncAllTeamIndex(); syncAllCoachIndex(); }
          else if (me) syncCoachIndex(me.uid);
          // an admin, or each coach for her own team, heals the parent list
          syncAllTeamParents();
          noteMyClub();
        }
        flushTraining();
        schedulePublish();   // republish on load, so a fixed config heals itself

        // membership is small and read whole; it does not need child-level listeners
        dbMod.onValue(dbMod.ref(db, fb.base + '/access'), cs => {
          state.access = cs.val() || {};
          overlayPending(state.access, 'access');
          saveLocal(); noteMyClub(); render();
        });

        // rsvp per team, like teams and matches: one parent's answer never redraws from a whole-club read
        for (const coll of ['teams', 'matches', 'rsvp']) {
          if (!state[coll]) state[coll] = {};
          const r = dbMod.ref(db, fb.base + '/' + coll);
          const upsert = cs => {
            if (ui.dragging) return;
            const inc = cs.val(); if (!inc) return;
            state[coll][cs.key] = mergeNode(state[coll][cs.key], inc);
            noteSeen(coll, cs.key);
            // a change still on its way to the club stays on top of what the club last said
            const own = { [cs.key]: state[coll][cs.key] };
            overlayPending(own, coll);
            if (own[cs.key]) state[coll][cs.key] = own[cs.key]; else delete state[coll][cs.key];
            saveLocal(); render();
          };
          dbMod.onChildAdded(r, upsert);
          dbMod.onChildChanged(r, upsert);
          dbMod.onChildRemoved(r, cs => {
            if (ui.dragging) return;
            if (pendingList().some(([p, e]) => p.startsWith(coll + '/' + cs.key) && e.v !== null)) return;
            delete state[coll][cs.key]; saveLocal(); render();
          });
        }
      }, err => {
        // A denial in the first second or two after boot is usually the ID
        // token not having reached the database connection yet, not a real
        // refusal — this read only ever runs once, so retry with backoff
        // before showing someone the lock screen for a race, not a rule.
        if (/permission|denied/i.test((err && err.code) || '') && attempt < 2) {
          setTimeout(() => wireBase(attempt + 1), (attempt + 1) * 900);
          return;
        }
        onDenied(err);
      }, { onlyOnce: true });
    }

    await authReady;   // don't read the workspace until we know who, if anyone, is signed in
    attachWorkspace = () => wireBase(0);
    attachWorkspace();
  } catch (e) {
    console.error(e);
    setSync('off', 'sync failed');
  }
}

/* ---- the outbox: nothing lives only on this phone ---- */
/* Firebase keeps a write it couldn't send yet in memory only. A coach who
   tracks a game with no signal and then closes the page, or whose phone
   reloads it, has that game in localStorage and nowhere else, and the
   connect-time read used to replace local state with the club's, which has
   never heard of it. So every write to the workspace is also recorded here,
   per club, until the database acknowledges it:

     sm.pending.v1:{club}  { seq, w: { path: { v, n, refused? } } }

   A write to a path supersedes anything still queued beneath it. On the
   connect-time read the club's copy is taken, everything still pending is
   laid back over it in the order it was made, and sent again; that is the
   merge CLAUDE.md asks for, done with what this phone actually knows rather
   than guessed from shapes. A write the rules refuse stays in the outbox,
   marked, and is tried again on every connect (the rules may simply not be
   pasted yet); the coach is told, and can see the list and choose to drop
   it. Nothing is ever dropped without her saying so.

   Top-level teams and games also get a second net, for copies saved before
   this outbox existed: `seen` remembers which ids this phone has ever read
   from the club. One the club doesn't have that it has seen was deleted
   somewhere else; one it has never seen and isn't pending was made here and
   never reached the club, and is sent now. On the first connect after this
   build nothing has been seen yet, so a game deleted elsewhere while this
   phone was away can come back once: the safe way round, against losing a
   game for good. */
const LS_PENDING = 'sm.pending.v1';
const LS_SEEN = 'sm.seen.v1';
const pendKey = () => LS_PENDING + ':' + clubKey();
const seenKey = () => LS_SEEN + ':' + clubKey();
let pending = { seq: 0, w: {} };
let seen = { teams: {}, matches: {} };
function loadPending() {
  pending = { seq: 0, w: {} }; seen = { teams: {}, matches: {} };
  try {
    const p = JSON.parse(localStorage.getItem(pendKey()) || 'null');
    if (p && typeof p === 'object' && p.w && typeof p.w === 'object') pending = { seq: Number(p.seq) || 0, w: p.w };
    const s = JSON.parse(localStorage.getItem(seenKey()) || 'null');
    if (s && typeof s === 'object') seen = { teams: s.teams || {}, matches: s.matches || {} };
  } catch (e) { }
}
function savePending() { keepStored(pendKey(), JSON.stringify(pending)); paintSync(); }
function saveSeen() { keepStored(seenKey(), JSON.stringify(seen)); }
function noteSeen(coll, id) { if ((coll === 'teams' || coll === 'matches') && id && !seen[coll][id]) { seen[coll][id] = 1; saveSeen(); } }
const pendingList = () => Object.entries(pending.w).sort((a, b) => a[1].n - b[1].n);
/* Everything else this phone still owes the club: practice plans, the club's
   drills, her own drills, and training sessions with their bookings,
   registers and fees. Each keeps its own dirty list (they live outside the
   workspace, with their own rules), but a coach shouldn't have to know that:
   the badge, the banner and "Not saved to the club yet" count all of it, so
   "synced" is never said while any of it is still only here. */
const SESS_WHAT = { sessions: 'a training session', booked: 'a place in a training session', came: 'a training session\'s register',
  fees: 'a training session fee', pay: 'a coach\'s pay rate', splans: 'a training session\'s drills' };
function otherOwed() {
  const out = [];
  for (const k of Object.keys(train.dirty || {})) {
    const tid = k.split('/')[0], t = state.teams[tid];
    out.push({ label: 'a practice plan' + (t && t.name ? ' for ' + t.name : ''), refused: trainState[tid] === 'refused' });
  }
  for (const id of Object.keys((train.drillDirty) || {})) out.push({ label: 'a drill shared with the club', refused: shelfState.club === 'refused' });
  if (me && mineUid === me.uid) for (const id of Object.keys(mine.dirty || {})) out.push({ label: 'one of your own drills', refused: shelfState.mine === 'refused' });
  for (const k of Object.keys(sess.dirty || {})) out.push({ label: SESS_WHAT[k.split('/')[0]] || 'a training record', refused: !!(sess.refused || {})[k], sess: k });
  return out;
}
const pendingCount = () => Object.keys(pending.w).length + otherOwed().length;
const refusedCount = () => Object.values(pending.w).filter(e => e.refused).length + otherOwed().filter(x => x.refused).length;

function notePending(path, v, del) {
  for (const p of Object.keys(pending.w)) if (p === path || p.startsWith(path + '/')) delete pending.w[p];
  const n = ++pending.seq;
  pending.w[path] = { v: v === undefined ? null : clone(v), n, ...(del ? { del: true } : {}) };
  savePending();
  return n;
}
/* The write settles: gone from the outbox if the club has it and nothing newer
   was queued for that path since; marked if the rules said no. */
function settle(path, n, ok, err) {
  const e = pending.w[path];
  if (ok) { const top = /^(teams|matches)\/([^/]+)$/.exec(path); if (top && e && e.v !== null) noteSeen(top[1], top[2]); }
  if (!e || e.n !== n) return;
  if (ok) delete pending.w[path];
  else if (/permission|denied/i.test((err && (err.code || err.message)) || '')) { if (e.refused) return; e.refused = true; }
  else return;          // anything else: still owed, and sent again on the next connect
  savePending(); render();
}
function sendPending(path, n, v, del) {
  let w;
  try { w = del ? fb.remove(fb.ref(fb.db, fb.base + '/' + path)) : fb.set(fb.ref(fb.db, fb.base + '/' + path), v); }
  catch (e) { return Promise.reject(e); }
  const p = Promise.resolve(w);
  p.then(() => settle(path, n, true), e => settle(path, n, false, e));
  return p;
}
/* A caller that undoes its own change when it's refused (an answer taken back
   off the screen) takes it out of the outbox too, or it would come back. */
function forgetPending(path) { if (pending.w[path]) { delete pending.w[path]; savePending(); } }
/* Lay what this phone still owes over a copy of the club's, in the order it
   was made. `under` limits it to one part of the tree. */
function overlayPending(target, under) {
  for (const [p, e] of pendingList()) {
    if (under && p !== under && !p.startsWith(under + '/')) continue;
    const rel = under ? p.slice(under.length + 1) : p;
    if (!rel) continue;
    if (e.v === null) delDeep(target, rel); else setDeep(target, rel, clone(e.v));
  }
}
/* The connect-time read: the club's copy, with what this phone made and the
   club hasn't got laid over it, then all of that sent again. */
function mergeConnect(v) {
  const remote = { teams: v.teams || {}, matches: v.matches || {}, access: v.access || {}, rsvp: v.rsvp || {} };
  const owed = [];
  for (const coll of ['teams', 'matches']) {
    for (const [id, x] of Object.entries(state[coll] || {})) {
      if (remote[coll][id] || seen[coll][id] || !x || typeof x !== 'object') continue;
      if (pendingList().some(([p]) => p === coll + '/' + id || p.startsWith(coll + '/' + id + '/'))) continue;
      remote[coll][id] = x; owed.push([coll + '/' + id, x]);
    }
    for (const id of Object.keys(remote[coll])) if (!seen[coll][id]) seen[coll][id] = 1;
  }
  saveSeen();
  overlayPending(remote);
  state = remote;
  return owed;
}
function flushPending() {
  if (!fb) return;
  for (const [p, e] of pendingList()) sendPending(p, e.n, e.v, e.del).catch(() => { });
}

/* What a pending write is, in words: the coach is deciding whether to drop
   it, and "matches/abc/goals/x" tells her nothing. */
function pendingLabel(p) {
  const [coll, id, sub] = p.split('/');
  if (coll === 'matches') {
    const m = state.matches[id], vs = m && m.opponent ? ` against ${m.opponent}` : '';
    const what = { goals: 'a goal', shots: 'a shot', stints: 'a sub', events: 'a set piece or foul', periods: 'the clock', plan: 'the plan', out: 'who is out', poss: 'possession' }[sub];
    return (what ? what + ' in the game' : 'the game') + vs;
  }
  if (coll === 'teams') {
    const t = state.teams[id], n = t && t.name ? ' ' + t.name : '';
    const what = { players: 'the squad of', events: 'the calendar of', attend: 'the register of' }[sub];
    return (what ? what : 'the team') + n;
  }
  if (coll === 'rsvp') return 'an answer to who is coming';
  if (p.startsWith('access/org/venues')) return 'the club\'s fields';
  if (p === 'access/org/money') return 'the currency fees are shown in';
  if (coll === 'access') return 'who has which role';
  return p;
}
function sheetPending() {
  const list = [...pendingList().map(([p, e]) => [pendingLabel(p), e.refused]), ...otherOwed().map(x => [x.label, x.refused])];
  const r = list.filter(([, refused]) => refused);
  openSheet(`<h3>Not saved to the club yet</h3>
    <p class="muted" style="margin-top:0">${list.length} change${list.length === 1 ? ' is' : 's are'} on this phone and nowhere else${r.length ? `, ${r.length} of them refused by the club's database` : ''}. They stay here, and are sent again every time this phone connects. Nothing is dropped unless you drop it.</p>
    ${r.length ? `<p class="muted">A refusal usually means the club's database rules haven't been updated yet (an admin pastes them from README), or this account isn't a coach of that team any more.</p>` : ''}
    <div class="plist">${list.slice(0, 40).map(([label, refused]) => `<div class="prow" style="grid-template-columns:1fr auto"><span class="pname">${esc(label)}</span>${refused ? '<span class="tag wait">refused</span>' : '<span class="tag">waiting</span>'}</div>`).join('')}</div>
    ${list.length > 40 ? `<p class="muted">…and ${list.length - 40} more.</p>` : ''}
    <button class="btn wide" data-act="pendingretry" style="margin-top:12px">Try again now</button>
    ${Object.values(pending.w).some(e => e.refused) || Object.keys(sess.refused || {}).length ? `<button class="btn quiet danger wide" data-act="pendingdrop" style="margin-top:8px">Drop the refused ones</button>` : ''}
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Done</button>`, true);
}
/* A phone used before it joined a club kept its teams under 'local', which
   no club ever reads. Bringing them in is an import (it merges, adds only
   what is missing, and is admin-only), offered from the data itself. */
function localOnlyData() {
  if (!wsCode()) return null;
  try {
    const d = JSON.parse(localStorage.getItem(LS_DATA + ':' + envPrefix() + 'local') || 'null');
    if (!d || typeof d !== 'object' || !d.teams || !Object.keys(d.teams).length) return null;
    const data = { teams: d.teams, matches: d.matches || {} };
    const plan = importPlan(data);
    return plan.errors.length || !plan.writes.length ? null : { data, plan };
  } catch (e) { return null; }
}

/* The badge in the corner says what the club has, not what this phone has:
   "synced" while something is still owed would be the lie that loses a game. */
let syncBase = ['off', 'this device'];
function paintSync() {
  const b = $('#syncBadge'); if (!b) return;
  const n = pendingCount(), r = refusedCount();
  if (fb && r) { b.dataset.state = 'off'; b.textContent = `${r} not saved`; }
  else if (fb && n) { b.dataset.state = 'off'; b.textContent = `${n} to send`; }
  else { b.dataset.state = syncBase[0]; b.textContent = syncBase[1]; }
}
/* Everything else this phone keeps until the club has it: plans, drills, her
   own library, training sessions. Each re-sends its own pending list when its screen opens;
   this sends it on every connect too, so a plan made offline reaches the
   club even if nobody opens Plans again. Messages do the same from their
   outbox whenever the app is open. */
function flushTraining() {
  if (!fb || !me) return;
  for (const k of Object.keys(train.dirty || {})) { const i = k.indexOf('/'); if (i > 0) sendPractice(k.slice(0, i), k.slice(i + 1)); }
  for (const s of ['club', 'mine']) for (const id of Object.keys(SHELF[s].store().dirty)) sendDrill(s, id);
  for (const k of Object.keys(sess.dirty || {})) sessSend(k);
}

/* A write that was rejected can leave a parent node holding only the child that
   got through — a team with players but no name. Never let that wipe an identity
   field we already have locally. */
const IDENTITY = ['name', 'opponent', 'date', 'teamId', 'periodCount', 'periodMinutes', 'onFieldCount'];
function mergeNode(local, remote) {
  if (!local || typeof local !== 'object') return remote;
  const out = { ...remote };
  for (const k of IDENTITY) if (out[k] === undefined && local[k] !== undefined) out[k] = local[k];
  return out;
}

/* There is no .write at workspaces/$code — only on its children — so one set()
   of the whole node is refused the moment a club is locked down, and that is
   exactly the call that creates a club. Write the children in the order the
   rules can actually grant: admins while it is still empty, then the index
   (which is what every other rule checks), then the data those two authorise.
   Realtime Database applies one client's writes in the order they are made, so
   sequencing them here is enough; no chaining needed.

   rsvp is skipped for the same reason as the log below: each answer must be
   stamped by whoever writes it, so replaying other people's is refused.

   access/log is skipped deliberately. Its rule is append-only and demands each
   entry stamp the writer's own uid, so replaying somebody else's entries would
   be refused — and a club being pushed for the first time has no log anyway. */
function pushAll() {
  if (!fb) return;
  const a = state.access || {};
  const mine = me && me.uid;
  const steps = [];
  /* Each write goes at the exact depth its rule sits at. A rule on $uid or $tid
     does not grant the parent, so pushing a whole collection is refused even
     where pushing each child is fine — the difference is invisible until a club
     is locked down and then it is total. */
  if (a.admins) steps.push(['access/admins', a.admins]);
  else if (mine) steps.push(['access/admins/' + mine, true]);
  if (a.index) for (const u of Object.keys(a.index)) steps.push(['access/index/' + u, a.index[u]]);
  else if (mine) steps.push(['access/index/' + mine, true]);
  if (a.teamIndex) steps.push(['access/teamIndex', a.teamIndex]);
  if (a.coachIndex) steps.push(['access/coachIndex', a.coachIndex]);
  for (const u of Object.keys(a.members || {})) steps.push(['access/members/' + u, a.members[u]]);
  for (const k of ['org', 'teams']) if (a[k]) steps.push(['access/' + k, a[k]]);
  for (const tid of Object.keys(state.teams || {})) steps.push(['teams/' + tid, state.teams[tid]]);
  for (const mid of Object.keys(state.matches || {})) steps.push(['matches/' + mid, state.matches[mid]]);
  for (const [path, value] of steps) remoteSet(path, value);
}
/* Hands back the write's promise, which settles when the database has it. Most
   callers ignore it; locking in a plan waits on it, because "saved" is the
   whole point of that button and has to mean the club has it, not this phone. */
/* The four lookup tables are rebuilt from the roles on every connect
   (syncIndex() and the rest), so they never need the outbox; queuing them
   would only mean a refused copy of something derived nagging forever. */
const DERIVED = /^access\/(index|teamIndex|coachIndex|teamParents)(\/|$)/;
function remoteSet(path, value) {
  if (!fb) return;
  const v = value === undefined ? null : value;
  if (DERIVED.test(path)) { const w = Promise.resolve(fb.set(fb.ref(fb.db, fb.base + '/' + path), v)); w.catch(() => { }); return w; }
  return sendPending(path, notePending(path, v), v);
}
function remoteDel(path) {
  if (!fb) return;
  if (DERIVED.test(path)) { Promise.resolve(fb.remove(fb.ref(fb.db, fb.base + '/' + path))).catch(() => { }); return; }
  sendPending(path, notePending(path, null, true), null, true).catch(() => { });
}

function quiet(path, value) { setDeep(state, path, value); remoteSet(path, value); }
function commit(path, value) { setDeep(state, path, value); saveLocal(); remoteSet(path, value); render(); schedulePublish(); }
function drop(path) { delDeep(state, path); saveLocal(); remoteDel(path); render(); schedulePublish(); }

/* ---------------- roles ---------------- */
/* Roles are derived from where a uid appears, never stored as a string on the
   user — a role string is a second source of truth that goes stale the moment
   someone changes team. Nothing is enforced here yet; the rules do that. */
const acc = () => state.access || {};
const members = () => Object.entries(acc().members || {}).map(([uid, v]) => ({ uid, ...v }))
  .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
const anyAdmins = () => Object.keys(acc().admins || {}).length > 0;
const isAdmin = uid => !!(uid && (acc().admins || {})[uid]);
const teamAccess = tid => ((acc().teams || {})[tid] || {});
const isCoach = (tid, uid) => !!(uid && (isAdmin(uid) || (teamAccess(tid).coaches || {})[uid]));
const isTracker = (tid, uid) => !!(uid && (teamAccess(tid).trackers || {})[uid]);
function isGuardian(tid, uid) {
  if (!uid) return false;
  const t = state.teams[tid];
  return Object.values((t && t.players) || {}).some(p => ((p.guardians || {})[uid]));
}
function roleIn(tid, uid) {
  if (!uid) return null;
  if (me && me.uid === uid && isOwner()) return 'owner';
  if (isAdmin(uid)) return 'admin';
  if (isCoach(tid, uid)) return 'coach';
  if (isTracker(tid, uid)) return 'tracker';
  if (isGuardian(tid, uid)) return 'parent';
  return null;
}
const ROLE_LABEL = { owner: 'App owner', admin: 'Org admin', coach: 'Coach', tracker: 'Tracker', parent: 'Parent', viewer: 'Viewer' };

/* Whoever looks after the app itself. Read from the database root, never from
   this file — a personal email committed to a public repo gets scraped, sticks
   around in history, and needs a deploy to change. Set it by hand in the
   Firebase console; the rules make it read-only to everyone. */
let appOwners = {};
const isOwner = () => !!(me && appOwners[me.uid]);
const canAdmin = () => isOwner() || (me && isAdmin(me.uid));
/* Mirrors what the security rule checks, so the UI and the database agree. */
const approved = uid => !!(uid && (acc().index || {})[uid]);

/* Security rules can only look a path up directly — they cannot walk every team
   asking whether a uid is in it. So every approved person is mirrored into one
   flat node that a rule can check in a single lookup. */
function hasAnyRole(uid) {
  const a = acc();
  if ((a.admins || {})[uid]) return true;
  for (const ta of Object.values(a.teams || {}))
    if ((ta.coaches || {})[uid] || (ta.trackers || {})[uid]) return true;
  for (const t of Object.values(state.teams || {}))
    if (Object.values(t.players || {}).some(p => (p.guardians || {})[uid])) return true;
  return false;
}
function logAccess(act, targetUid, extra) {
  const u = (acc().members || {})[targetUid] || {};
  quiet(`access/log/${uid()}`, {
    at: nowMs(), act,
    by: (me && me.uid) || null, byName: (me && me.name) || null,
    target: targetUid, targetName: u.name || u.email || null,
    ...(extra || {})
  });
  saveLocal();
}
const auditLog = () => Object.values(acc().log || {}).sort((a, b) => b.at - a.at);

function syncIndex(uid) {
  if (!uid) return;
  syncCoachIndex(uid);
  if (hasAnyRole(uid)) quiet(`access/index/${uid}`, true);
  else {
    forgetInvite((acc().index || {})[uid]);
    delDeep(state, `access/index/${uid}`); remoteDel(`access/index/${uid}`);
    // their bookmark to this club goes too, so no other device of theirs opens it
    if (fb && wsCode()) Promise.resolve(fb.remove(fb.ref(fb.db, `userOrgs/${uid}/${wsCode()}`))).catch(() => { });
  }
  saveLocal();
}

/* access/index answers "may this uid read the club". It cannot answer "may this
   uid change *this* team", which is why every indexed account — a tracker, a
   parent — could write every team's data. Rules cannot iterate, so the answer
   has to be one direct lookup, and that is what this node is:

     access/teamIndex/{teamId}/{uid} = 'coach' | 'tracker'

   The value carries the role because the two are not the same permission. A
   coach may change the squad; a tracker may only log events on a game and make
   the coach's locked-in subs, so the rules let 'coach' write teams/{tid} and let
   either write a match belonging to that team. Admins are deliberately absent — the rule checks access/admins
   directly, and mirroring them here would be a second place to forget.

   A tracker can still write more of a match than the interface offers her. That
   is the limit of what a rule can express without per-field rules, and AUTH.md
   already says so; what this closes is the cross-team hole and the parent one. */
function syncTeamIndex(tid) {
  if (!tid) return;
  const ta = teamAccess(tid), want = {};
  for (const u of Object.keys(ta.trackers || {})) want[u] = 'tracker';
  for (const u of Object.keys(ta.coaches || {})) want[u] = 'coach';   // coach wins
  const now = ((acc().teamIndex || {})[tid]) || {};
  // this runs on every connect, so say nothing when there is nothing to say
  if (JSON.stringify(now) === JSON.stringify(want)) return;
  if (Object.keys(want).length) quiet(`access/teamIndex/${tid}`, want);
  else { delDeep(state, `access/teamIndex/${tid}`); remoteDel(`access/teamIndex/${tid}`); }
  saveLocal();
}
/* Called when the club is first pushed and whenever readiness is checked, so a
   club that predates teamIndex grows one without anybody migrating anything. */
function syncAllTeamIndex() { for (const tid of Object.keys(state.teams || {})) syncTeamIndex(tid); }

/* access/coachIndex/{uid} names one team she coaches. It's the third flat
   table, for the one question the training rules ask that the other two can't
   answer in a single hop: is this account a coach of ANY team? index says
   "member", and teamIndex needs a team to look in. The value is a team rather
   than `true` because that's what lets her own device write her entry: the
   rule checks she really coaches the team it names. Everything that reads it
   asks only whether the entry is there.

   An admin's device writes everyone's, the same as teamIndex; a coach's own
   device also writes hers, so a coach whose admin hasn't connected since is
   not shut out of her own plans. */
function coachTeamOf(uid) {
  const ts = acc().teams || {};
  return Object.keys(ts).sort().find(tid => ((ts[tid] || {}).coaches || {})[uid]) || null;
}
function syncCoachIndex(uid) {
  if (!uid) return;
  const now = (acc().coachIndex || {})[uid] || null;
  // any team she coaches will do, so only rewrite it once the one it names stops being true
  if (now && (teamAccess(now).coaches || {})[uid]) return;
  const want = coachTeamOf(uid);
  if (want === now) return;
  if (want) quiet(`access/coachIndex/${uid}`, want);
  else { delDeep(state, `access/coachIndex/${uid}`); remoteDel(`access/coachIndex/${uid}`); }
  saveLocal();
}
function syncAllCoachIndex() {
  const uids = new Set(Object.keys(acc().coachIndex || {}));
  for (const ta of Object.values(acc().teams || {})) for (const u of Object.keys((ta || {}).coaches || {})) uids.add(u);
  for (const u of uids) syncCoachIndex(u);
}

/* teamIndex's counterpart for parents, which it cannot hold: a parent is a
   guardian of a player, and a rule cannot walk the squad to find her. So
   "is this uid a parent on THIS team" gets its own one-hop answer —

     access/teamParents/{teamId}/{uid} = a playerId she is a guardian of

   — and the value is a player id rather than `true` because that is what lets
   the rule check it: a write is only accepted if that player really lists her
   in guardians. So this table can never say more than the squad already does,
   and nobody can put themselves in it. It is what narrows a team's notices to
   that team's own families, and lets only them open a conversation with its
   coaches.

   Derived, like teamIndex: rebuilt from the guardians wherever a guardian
   changes, and on every connect by an admin or that team's coach. Only an
   admin may create the table — the rules fall back to the club-wide index
   while it is missing, and one stray first entry would close that bridge on
   every other team at once. */
function parentsWanted(tid) {
  const want = {};
  for (const p of players(state.teams[tid]))
    for (const u of Object.keys(p.guardians || {})) if (!want[u]) want[u] = p.id;
  return want;
}
function syncTeamParents(tid) {
  if (!tid || !me || !state.teams[tid]) return;
  if (!isAdmin(me.uid) && !isCoach(tid, me.uid)) return;
  const all = acc().teamParents;
  if (!all && !isAdmin(me.uid)) return;
  const want = parentsWanted(tid), now = (all || {})[tid] || {};
  const team = state.teams[tid];
  const holds = (u, pid) => !!((((team.players || {})[pid] || {}).guardians || {})[u]);
  let changed = false;
  // one entry at a time: a coach's rule sits on $uid, not on the team
  for (const [u, pid] of Object.entries(want))
    if (!now[u] || !holds(u, now[u])) { quiet(`access/teamParents/${tid}/${u}`, pid); changed = true; }
  for (const u of Object.keys(now))
    if (!want[u]) { delDeep(state, `access/teamParents/${tid}/${u}`); remoteDel(`access/teamParents/${tid}/${u}`); changed = true; }
  if (changed) saveLocal();
}
function syncAllTeamParents() { for (const tid of Object.keys(state.teams || {})) syncTeamParents(tid); }

/* Who may publish a team's read-only mirror. public/{share} is world-readable
   by design, but its write rule is the one hole AUTH.md names outright, and it
   is closed by a list the rule can look up in one hop. Anonymous auth is not an
   option here and AUTH.md says why. */
function claimShare(tid) {
  const t = (state.teams || {})[tid];
  if (!fb || !t || !t.share) return;
  const owners = {};
  for (const u of Object.keys(acc().admins || {})) owners[u] = true;
  for (const u of Object.keys(teamAccess(tid).coaches || {})) owners[u] = true;
  if (me) owners[me.uid] = true;
  fb.set(fb.ref(fb.db, 'shareOwners/' + t.share), owners).catch(() => { });
}
function claimAllShares() { for (const t of Object.values(state.teams || {})) if (t.share) claimShare(t.id); }
/* A team now publishes under more ids than its season link: one per game, so a
   game link carries that game and nothing else, and one for the members'
   calendar feed. Each needs its owners claimed before the first write, exactly
   as the season link does. Once a session per id is enough — the season link
   above keeps being refreshed on every publish, as it always was. */
const claimed = new Set();
function claimTeamIds(tid) {
  const t = (state.teams || {})[tid];
  if (!fb || !t) return;
  const owners = {};
  for (const u of Object.keys(acc().admins || {})) owners[u] = true;
  for (const u of Object.keys(teamAccess(tid).coaches || {})) owners[u] = true;
  if (me) owners[me.uid] = true;
  const ids = [t.calFeed, ...(t.share ? teamMatches(tid).map(m => m.share) : [])].filter(Boolean);
  for (const id of ids) {
    if (claimed.has(id)) continue;
    claimed.add(id);
    fb.set(fb.ref(fb.db, 'shareOwners/' + id), owners).catch(() => claimed.delete(id));
  }
}
/* Every game gets its own share id the first time a coach publishes with
   sharing on. The id lives on the game, so it follows the game and dies with
   it. Readers never make one: the button that needs it waits for the coach's
   phone to have published. */
function ensureFixtureShares(t) {
  if (!t || !t.share || !canEditTeam(t.id)) return false;
  let made = false;
  for (const m of teamMatches(t.id)) if (!m.share) { quiet(`matches/${m.id}/share`, 'f' + uid() + uid()); made = true; }
  if (made) saveLocal();
  return made;
}

/* What has to be true before the tighter rules can be published. Every line is
   a way to lock the club out, and all of them are invisible until you try to
   write something at a game. */
function readiness() {
  const a = acc();
  const rows = [];
  const nAdmins = Object.keys(a.admins || {}).length;
  const nIndex = Object.keys(a.index || {}).length;
  rows.push({ ok: nAdmins > 0, label: 'Someone administers this club', detail: nAdmins + ' admin' + (nAdmins === 1 ? '' : 's') });
  rows.push({ ok: nIndex > 0, label: 'The read index is not empty', detail: nIndex + ' account' + (nIndex === 1 ? '' : 's') + (nIndex ? '' : ' — every write would be refused') });
  rows.push({ ok: !me || !!(a.index || {})[me.uid], label: 'Your own account is in it', detail: me ? (a.index || {})[me.uid] ? 'yes' : 'no — you would lose access' : 'not signed in' });
  const withRoles = teams().filter(t => Object.keys(teamAccess(t.id).coaches || {}).length || Object.keys(teamAccess(t.id).trackers || {}).length);
  const indexed = withRoles.filter(t => Object.keys((a.teamIndex || {})[t.id] || {}).length);
  rows.push({
    ok: indexed.length === withRoles.length,
    label: 'Every team with a role has a team index',
    detail: withRoles.length ? indexed.length + ' of ' + withRoles.length : 'no team roles granted yet'
  });
  const coaches = new Set();
  for (const ta of Object.values(a.teams || {})) for (const u of Object.keys((ta || {}).coaches || {})) coaches.add(u);
  const inCoachIndex = [...coaches].filter(u => (a.coachIndex || {})[u]).length;
  rows.push({
    ok: inCoachIndex === coaches.size,
    label: 'Every coach is in the coach index',
    detail: coaches.size ? inCoachIndex + ' of ' + coaches.size + (inCoachIndex === coaches.size ? '' : ' — practice plans need it') : 'no coaches yet'
  });
  const withParents = teams().filter(t => Object.keys(parentsWanted(t.id)).length);
  const listed = withParents.filter(t => Object.keys((a.teamParents || {})[t.id] || {}).length);
  rows.push({
    ok: listed.length === withParents.length,
    label: 'Every team with parents has a parent list',
    detail: withParents.length ? listed.length + ' of ' + withParents.length + (listed.length < withParents.length ? ' — notices are readable club-wide until then' : '') : 'no parents linked yet'
  });
  const shared = teams().filter(t => t.share);
  rows.push({ ok: true, label: 'Shared teams have an owner list', detail: shared.length ? shared.length + ' published' : 'nothing shared' });
  rows.push({ ok: Object.keys(appOwners).length > 0, label: 'An app owner exists', detail: Object.keys(appOwners).length ? 'yes' : 'set appOwners in the console' });
  return rows;
}

/* A club with an admin is past its bootstrap, so its data is somebody's to
   protect and a signed-out device has no business rendering it. The local copy
   is still held — an unsynced game lives only there, and purging on sign-out
   would throw it away — but holding it and drawing it are separate decisions.

   Access control only bites once a club has an admin AND there is somewhere to
   authenticate: a device running with no Firebase config has inert access lists
   and no way to sign in, so hiding anything there would be a dead end rather
   than a protection. One predicate for both, or the lock screen and the team
   list end up disagreeing about whether the club is protected. */
const gated = () => anyAdmins() && !!fbConfig().apiKey;
const needsSignIn = () => !me && gated();

/* Who may see and change which team.
   Admin: everything. Coach: edits her own team, reads the rest of the club —
   comparing against the other age groups is the point of being in a club.
   Tracker and parent: only the teams they are actually attached to. */
function myTeams() {
  const all = teams();
  if (!gated()) return all;                   // before lockdown, nothing is hidden
  if (!me) return [];                          // after it, signed out sees nothing
  if (canAdmin()) return all;
  const coachAnywhere = all.some(t => isCoach(t.id, me.uid));
  if (coachAnywhere) return all;
  const mine = all.filter(t => isTracker(t.id, me.uid) || isGuardian(t.id, me.uid));
  return mine;
}
/* Every player this account is a guardian of, across every team it can see.
   Cuts across teams deliberately — a parent with three children in two age
   groups should not have to know which team each is on. */
function myPlayers() {
  if (!me) return [];
  const out = [];
  for (const t of teams())
    for (const p of Object.values(t.players || {}))
      if ((p.guardians || {})[me.uid]) out.push({ t, p });
  return out.sort((a, b) => (a.p.name || '').localeCompare(b.p.name || ''));
}
const guardsAnyone = () => myPlayers().length > 0;

function canEditTeam(tid) {
  if (!gated()) return true;                  // a fresh club has to be set up somehow
  if (!me) return false;
  return canAdmin() || isCoach(tid, me.uid);
}
const readOnlyHere = () => !canEditTeam(ui.teamId);
/* The squad and the fixture list are the coach's. A tracker logs a game and a
   parent reads one; neither adds a player or a game, and nor does a coach of
   another age group. The button is only drawn for whoever may press it. */
const addGameBtn = cls => readOnlyHere() ? '' : `<button class="${cls}" data-act="newmatch">Add a game</button>`;

/* My role here. Nobody is locked out by an empty membership list: until someone
   is actually given a role, everyone keeps the access they have today. */
function myRole() {
  if (!me) return null;
  return roleIn(ui.teamId, me.uid);
}
/* Tracker and parent are roles; 'viewer' is not — it is what a coach is on
   every team that is not hers. myTeams() lets her read the rest of the club,
   and without this she read it through her own coach's screens: clock, subs,
   plan, Add a game, Add a player, all offered on a team she has no say in.
   canEditTeam() already knew the answer; nothing that draws a screen asked it.
   Folding it in here means every place that already narrows the interface for
   a restricted account narrows it for her too. */
const restricted = () => {
  if (isOwner()) return null;
  const r = myRole();
  if (r === 'tracker' || r === 'parent') return r;
  return me && !canEditTeam(ui.teamId) ? 'viewer' : null;
};

/* The click handler's own check, so a hidden button is not the only thing
   standing between an account and a write — a stale screen, a sheet left open
   while roles changed, or a tab restored from the last session can all still
   put one under a finger. Two kinds of action, because a tracker holds exactly
   one of them: the squad, the fixture list, the clock, the lineup and the plan
   are the coach's; logging what happened is the tracker's too. Parents and
   coaches of other teams hold neither. The rules are the real line, and
   `node test/rules.js` says where they still fall short of this. */
const COACH_ACTS = new Set([
  // the squad
  'addplayer', 'editplayer', 'saveplayer', 'delplayer', 'pickphoto', 'dropphoto', 'toggleguard',
  // the fixture list
  'newmatch', 'editmatch', 'savematch', 'delmatch',
  // the team's own settings
  'editteam', 'saveteam', 'picklogo', 'droplogo', 'setpossmin', 'trackcfg', 'savetrackcfg',
  'formations', 'newformation', 'saveshapeteam', 'savefname', 'setdefault', 'delformation',
  'addslot', 'saveslot', 'delslot', 'makeshare', 'rotateshare', 'republish',
  // running the game: clock, subs, lineup, plan
  'tap', 'taplive', 'puton', 'doswitch', 'stageadd', 'startplan', 'applyplan', 'applyblock', 'fillslot',
  'start', 'pause', 'endhalf', 'endgame', 'reopengame', 'restartgame', 'fixclock', 'nudgeclock',
  'fixsub', 'nudgesub', 'setsubtime', 'addsub', 'doaddsub', 'fixminutes', 'addstint', 'delstint', 'savestints',
  'repair', 'makeplan', 'planall', 'saveplan', 'evensplit', 'availability', 'toggleavail', 'toggleout',
  'editgameshape', 'gameshapepreset', 'planlock', 'planunlock',
  'snapstart', 'snapadd', 'snapdel', 'snaptime', 'snapslot', 'snapclear', 'snapplayer', 'snapwipe', 'snapfill',
  'delsub', 'aiimport',
  // the calendar
  'calnew', 'caledit', 'calsave', 'caldel', 'calcall', 'caleditgame', 'calsyncon', 'calsyncnew', 'attend', 'attsave'
]);
const LOG_ACTS = new Set([
  'goal', 'savegoal', 'delgoal', 'shot', 'saveshot', 'delshot', 'ev', 'saveev', 'delev',
  'poss', 'saveposs', 'delposs', 'undoposs', 'trackerclean', 'dropby'
]);
function mayAct(a, m, d) {
  const coach = COACH_ACTS.has(a), log = LOG_ACTS.has(a);
  if (!coach && !log) return true;
  /* An action on a game answers to that game's team, whichever team is open.
     A calendar entry (and its register) names its team on the button,
     because "All my teams" puts several teams' entries on one screen. */
  const tid = (a.startsWith('cal') || a === 'attend' || a === 'attsave') && d && d.tid ? d.tid
    : m && m.teamId && !['newmatch', 'addplayer', 'editplayer', 'saveplayer', 'delplayer'].includes(a) ? m.teamId : ui.teamId;
  if (canEditTeam(tid)) return true;
  return log && !!me && isTracker(tid, me.uid);
}

/* ---------------- invites ---------------- */
/* How somebody new gets into a club. The workspace code stopped being
   something anyone types, but a device still has to learn it, and an account
   with no role still has to be given one — and in a locked club it cannot read
   a thing until it has. An invite does both in one step, which is AUTH.md's
   point: "redeeming it is one step instead of a request followed by an
   approval".

     invites/{id}               the invite itself, at the root, because the
                                person holding it cannot read the club yet.
                                The id is the secret; .read sits on {id}, so
                                nobody can list them.
     clubInvites/{code}/{id}    the admin's list. Not under the workspace:
                                everybody indexed can read all of that, and a
                                parent holding a list of unspent coach invites
                                is a parent who can make herself a coach.
     userOrgs/{uid}/{code}      which clubs this account is in, so a second
                                device can find them without an invite.

   Redeeming is a chain of small writes, each checked by its own rule against
   the spent invite: spend it, then write the role it names, then the index.
   The role entries carry the invite id as their value rather than `true` —
   that value is what the rule looks up, and everything that reads a role asks
   only whether the entry is there. An admin's plain `true` still wins.

   Invites expire after two weeks, and the rules stop honouring a spent one
   then too, so a role an admin later withdraws cannot be re-granted from the
   same invite — the redeemer also deletes it once used, and withdrawing a role
   deletes the invite it came from. */
const LS_INVITE = 'sm.invite';
const INVITE_DAYS = 14;
const INVITE_ROLES = { coach: 'Coach', tracker: 'Tracker', parent: 'Parent' };
let rtdb = null;        // { db, mod } once the database module has loaded, code or not
let invite = null;      // { id, status, doc, err } while an invite link is being handled
let clubInv = {};       // clubInvites/{code}, for an admin
let clubInvWatch = null;
let myClubs = null;     // userOrgs/{uid}
let myClubsUid = null;

/* Long enough that guessing one is not a plan. Share ids get away with
   Math.random because a share is read-only; an invite is a grant. */
function secretId() {
  try {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    return 'i' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { return 'i' + uid() + uid() + uid() + uid(); }
}

const inviteLink = id => location.origin + location.pathname + '?invite=' + encodeURIComponent(id);

/* Taken off the address bar at load, before initAuth() reads it for a magic
   link, and kept in localStorage: signing in by popup, redirect or email can
   each lose the page, and the invite has to survive that. Only the invite
   parameter goes — a magic link's own parameters are still needed. */
function captureInvite() {
  try {
    const q = new URLSearchParams(location.search || '');
    const id = (q.get('invite') || '').trim();
    if (id) {
      localStorage.setItem(LS_INVITE, id);
      q.delete('invite');
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + (location.hash || ''));
    }
    const held = (localStorage.getItem(LS_INVITE) || '').trim();
    invite = held ? { id: held, status: 'idle', doc: null, err: null } : null;
  } catch (e) { invite = null; }
}

function dropInvite() {
  try { localStorage.removeItem(LS_INVITE); } catch (e) { }
  invite = null;
}

/* Read the invite once there is someone signed in to read it as. Re-run on
   every change of account: the first one may be the wrong person. */
function maybeLoadInvite() {
  if (!invite || !rtdb || !me) return;
  if (invite.status !== 'idle') return;
  const id = invite.id, who = me.uid;
  invite.status = 'loading';
  const { db, mod } = rtdb;
  mod.onValue(mod.ref(db, 'invites/' + id), s => {
    if (!invite || invite.id !== id || !me || me.uid !== who) return;
    const v = s.val();
    invite.doc = v;
    invite.status = !v ? 'gone'
      : v.used && v.used.by !== who ? 'taken'
        : v.used ? 'ready'                                 // ours, half finished: carry on
          : (v.expiresAt || 0) <= nowMs() ? 'expired'
            : v.email && v.email !== String(me.email || '').toLowerCase() ? 'wrongemail'
              : 'ready';
    render();
  }, err => {
    if (!invite || invite.id !== id) return;
    invite.status = 'error';
    invite.err = (err && err.code) || String(err);
    render();
  }, { onlyOnce: true });
  render();
}

function inviteWhat(v) {
  const role = INVITE_ROLES[v.role] || v.role;
  return v.role === 'parent'
    ? `a parent of ${v.playerNo ? '#' + esc(v.playerNo) : 'a player'} on <b>${esc(v.teamName || 'a team')}</b>`
    : `${role.toLowerCase()} of <b>${esc(v.teamName || 'a team')}</b>`;
}

function inviteScreen() {
  const v = (invite && invite.doc) || {};
  const club = esc(v.clubName || 'a club');
  const later = `<button class="btn quiet" data-act="invitedismiss">Not now</button>`;
  const box = (title, body, btns) => `<div class="stack"><div class="empty"><strong>${title}</strong>${body}
    <div class="row" style="margin-top:14px;justify-content:center">${btns}</div></div></div>`;
  const s = invite.status;
  if (!fbConfig().apiKey) return box('An invite', 'This copy of the app is not connected to a database, so it cannot accept one.', later);
  if (!me) return box('You have been invited to a club',
    'Sign in to see what it is and accept it. Use the account you want to keep — it is the one the club will know you by.',
    `<button class="btn" data-act="signinsheet">Sign in</button>${later}`);
  if (s === 'idle' || s === 'loading') return box('Opening your invite…', 'This needs a signal. It will carry on by itself once there is one.', later);
  if (s === 'working') return box('Joining…', `Setting you up at ${club}.`, '');
  if (s === 'gone') return box('That invite no longer exists',
    'It has been used, or withdrawn by whoever sent it. Ask them for a new link.', `<button class="btn" data-act="invitedismiss">OK</button>`);
  if (s === 'taken') return box('That invite has already been used',
    'Each invite works once, for one account. Ask for a new link.', `<button class="btn" data-act="invitedismiss">OK</button>`);
  if (s === 'expired') return box('That invite has expired',
    `Invites last ${INVITE_DAYS} days. Ask ${esc(v.byName || 'whoever sent it')} for a new one.`, `<button class="btn" data-act="invitedismiss">OK</button>`);
  if (s === 'wrongemail') return box('That invite is for someone else',
    `It was sent to <b>${esc(v.email)}</b>, and you are signed in as <b>${esc(me.email || me.name)}</b>. Sign in with that address to accept it.`,
    `<button class="btn" data-act="signout">Switch account</button>${later}`);
  if (s === 'error') return box('Could not open the invite',
    `${esc(invite.err || 'Something went wrong')}. Check the signal and try again.`,
    `<button class="btn" data-act="inviteretry">Try again</button>${later}`);
  return box(`Join ${club}`,
    `${esc(v.byName || 'An admin')} has invited you as ${inviteWhat(v)}. You are signed in as <b>${esc(me.email || me.name)}</b>.`,
    `<button class="btn" data-act="inviteaccept">Accept</button>${later}`);
}

/* Order matters and each step is awaited: every rule after the first checks
   that the invite has been spent by this account, and the database evaluates
   a write against what is there when it arrives. The first four writes are
   the grant; the rest is bookkeeping, and a refusal there leaves the grant
   standing — an admin's device rebuilds the team index on its next connect. */
async function redeemInvite() {
  if (!invite || invite.status !== 'ready' || !rtdb || !me) return;
  const id = invite.id, v = invite.doc, who = me.uid, ws = v.ws, at = nowMs();
  const { db, mod } = rtdb;
  const put = (p, val) => mod.set(mod.ref(db, p), val);
  const soft = pr => Promise.resolve(pr).catch(() => { });
  const W = 'workspaces/' + ws + '/';
  invite.status = 'working'; render();
  try {
    if (!v.used) await put('invites/' + id + '/used', { by: who, at });
    await put(W + 'access/members/' + who, { name: me.name || '', email: me.email || '', at });
    if (v.role === 'parent') await put(W + `teams/${v.team}/players/${v.player}/guardians/${who}`, id);
    else await put(W + `access/teams/${v.team}/${v.role === 'coach' ? 'coaches' : 'trackers'}/${who}`, id);
    await put(W + 'access/index/' + who, id);
  } catch (e) {
    invite.status = 'error';
    invite.err = /permission|denied/i.test((e && e.code) || '') ? 'The database refused it — the invite may have expired or been withdrawn'
      : ((e && e.code) || String(e));
    render(); return;
  }
  if (v.role !== 'parent') await soft(put(W + `access/teamIndex/${v.team}/${who}`, v.role));
  /* Refused while the table does not exist yet, which is fine: the rules fall
     back to the club-wide index until an admin's device creates it, and that
     device puts her in it. */
  else await soft(put(W + `access/teamParents/${v.team}/${who}`, v.player));
  await soft(put('clubInvites/' + ws + '/' + id + '/used', { by: who, at, name: me.name || '' }));
  await soft(put('userOrgs/' + who + '/' + ws, { name: v.clubName || '', at }));
  await soft(put(W + 'access/log/' + uid(), {
    at, act: 'joined by invite as', by: who, byName: me.name || null,
    target: who, targetName: INVITE_ROLES[v.role] || v.role, team: v.team, teamName: v.teamName || null
  }));
  await soft(mod.remove(mod.ref(db, 'invites/' + id)));   // spent: nothing left to replay
  dropInvite();
  try { localStorage.setItem(LS_WS, ws); } catch (e) { }
  location.reload();
}

/* A role that came from an invite carries the invite's id. Withdrawing the
   role deletes the invite too, or its holder could spend it again until it
   expired. Usually it is gone already; this is for the redeemer who stopped
   halfway. */
function forgetInvite(v) {
  if (fb && typeof v === 'string' && v) Promise.resolve(fb.remove(fb.ref(fb.db, 'invites/' + v))).catch(() => { });
}

function watchClubInvites() {
  const code = wsCode();
  if (!rtdb || !code || !canAdmin() || clubInvWatch === code) return;
  clubInvWatch = code;
  const { db, mod } = rtdb;
  mod.onValue(mod.ref(db, 'clubInvites/' + code), s => {
    if (wsCode() !== code) return;
    clubInv = s.val() || {};
    render();
  }, () => { });   // not an admin as far as the rules know; the list just stays empty
}

function watchMyClubs() {
  if (!rtdb || !me) { myClubs = null; myClubsUid = null; return; }
  if (myClubsUid === me.uid) return;
  const who = myClubsUid = me.uid;
  const { db, mod } = rtdb;
  mod.onValue(mod.ref(db, 'userOrgs/' + who), s => {
    if (!me || me.uid !== who) return;
    myClubs = s.val() || {};
    noteMyClub();
    maybeOpenMyClub();
    render();
  }, () => { });
}

/* Keep this account's list of clubs true without anybody being told to: any
   device that reads a club it holds a role in writes the bookmark, so people
   who joined before this existed pick it up on their next connect. */
function noteMyClub() {
  const code = wsCode();
  if (!rtdb || !me || !code || !myClubs || isSandbox()) return;
  if (!approved(me.uid) && !isAdmin(me.uid)) return;
  const name = (acc().org || {}).name || '';
  const had = myClubs[code];
  if (had && had.name === name) return;
  myClubs[code] = { name, at: (had && had.at) || nowMs() };
  const { db, mod } = rtdb;
  Promise.resolve(mod.set(mod.ref(db, 'userOrgs/' + me.uid + '/' + code), myClubs[code])).catch(() => { });
}

/* A signed-in device with no club open, whose account belongs to exactly one:
   open it. Not when this device has teams of its own on it — that is somebody
   using the app on its own, and switching would hide their squad. */
function maybeOpenMyClub() {
  if (wsCode() || invite || !myClubs) return;
  const codes = Object.keys(myClubs);
  if (codes.length !== 1 || Object.keys(state.teams || {}).length) return;
  try { localStorage.setItem(LS_WS, codes[0]); } catch (e) { return; }
  location.reload();
}

function inviteStatus(v) {
  if (v.used) return { k: 'used', label: `Joined${v.used.name ? ' — ' + esc(v.used.name) : ''}` };
  if ((v.expiresAt || 0) <= nowMs()) return { k: 'expired', label: 'Expired' };
  return { k: 'open', label: `Waiting · until ${new Date(v.expiresAt).toLocaleDateString()}` };
}

const inviteList = () => Object.entries(clubInv || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.at || 0) - (a.at || 0));
const inviteFor = v => `${esc(INVITE_ROLES[v.role] || v.role)}${v.role === 'parent' && v.playerName ? ' of ' + esc(v.playerName) : ''} · ${esc(v.teamName || '')}`;

/* Open invites first and all of them, because those are the ones an admin
   comes back for: to copy the link again, or to kill it. Used and expired
   ones are history, folded away behind a count. Every row opens the invite
   itself, which is where the link, who used it and the revoke button live. */
function invitesCard() {
  if (!canAdmin()) return '';
  watchClubInvites();
  const list = inviteList();
  const open = list.filter(v => inviteStatus(v).k === 'open');
  const past = list.filter(v => inviteStatus(v).k !== 'open');
  const row = v => {
    const st = inviteStatus(v);
    return `<div class="opt spread invrow" data-k="${st.k}">
      <button type="button" class="linkish" data-act="inviteopen" data-id="${esc(v.id)}"><b>${esc(v.email || 'Anyone with the link')}</b>
        <span class="rowsub">${inviteFor(v)} · ${st.label}</span></button>
      <span class="row">${st.k === 'open' ? `<button class="btn quiet sm" data-act="copylink" data-v="${esc(inviteLink(v.id))}">Copy link</button>` : ''}
        <button class="btn quiet sm" data-act="inviteopen" data-id="${esc(v.id)}">Details</button></span></div>`;
  };
  return `<div class="card"><div class="spread"><h2 style="margin:0">Invites</h2>
      <button class="btn sm" data-act="invitenew">Invite someone</button></div>
    <p class="muted">A link that makes one account a coach, tracker or parent on one team. It works once and lasts ${INVITE_DAYS} days. Tap one to copy its link again, see who used it, or revoke it.</p>
    ${open.length ? open.map(row).join('') : `<p class="muted" style="margin:0">No open invites.</p>`}
    ${past.length ? `<button class="btn quiet sm" data-act="invitepast" style="margin-top:8px">${ui.invPast ? 'Hide' : 'Show'} used and expired (${past.length})</button>
    ${ui.invPast ? `<div style="margin-top:8px">${past.map(row).join('')}</div>` : ''}` : ''}</div>`;
}

/* One invite, everything about it. The link is only the id, so it can be
   shown again at any point — which is what an admin who closed the "Invite
   ready" sheet too soon needs. Once used, the redeemer deletes the invite
   itself, so the link is dead and says so; what is left is who took it. */
function sheetInviteDetail(id) {
  const v = clubInv[id];
  if (!v) { closeSheet(); toast('That invite is gone'); return; }
  const st = inviteStatus(v), link = inviteLink(id);
  const when = ms => ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown';
  const who = v.used && (acc().members || {})[v.used.by];
  const stillHas = v.used && (v.role === 'parent'
    ? !!(((((state.teams[v.team] || {}).players || {})[v.player] || {}).guardians || {})[v.used.by])
    : v.role === 'coach' ? isCoach(v.team, v.used.by) : isTracker(v.team, v.used.by));
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const line = (k, val) => `<div class="spread" style="padding:6px 0;border-top:1px solid var(--line)"><span class="muted">${k}</span><span style="text-align:right">${val}</span></div>`;
  openSheet(`<h3>${esc(v.email || 'Invite link')}</h3>
    <p class="muted" style="margin-top:0">${inviteFor(v)}</p>
    <div style="margin-bottom:14px">
      ${line('Status', st.k === 'open' ? '<b>Waiting to be used</b>' : st.k === 'used' ? '<b>Used</b>' : '<b>Expired</b>')}
      ${line('For', v.email ? esc(v.email) + ' only' : 'Whoever opens it first')}
      ${line('Made by', `${esc(v.byName || 'an admin')} · ${when(v.at)}`)}
      ${st.k === 'used'
      ? line('Used by', `<b>${esc(v.used.name || (who && who.name) || 'someone')}</b>${who && who.email ? `<span class="rowsub">${esc(who.email)}</span>` : ''}<span class="rowsub">${when(v.used.at)}</span>`)
        + line('Role now', stillHas ? 'Still has it' : 'Since removed')
      : line(st.k === 'open' ? 'Works until' : 'Expired', when(v.expiresAt))}
    </div>
    ${st.k === 'open' ? `<p class="lbl">The link</p>
    <div class="codebox">${esc(link)}</div>
    <div class="row" style="margin-bottom:12px"><button class="btn" data-act="copylink" data-v="${esc(link)}">Copy link</button>
      ${canShare ? `<button class="btn quiet" data-act="inviteshare" data-v="${esc(link)}">Share…</button>` : ''}</div>
    ${v.email ? `<button class="btn quiet wide" data-act="invitemail" data-v="${esc(link)}" data-email="${esc(v.email)}" style="margin-bottom:12px">Send them the sign-in email again</button>` : ''}
    <button class="btn danger wide" data-act="invitedrop" data-id="${esc(id)}">Revoke — the link stops working</button>`
      : `<p class="muted">${st.k === 'used' ? 'This link has been used and no longer works. To take the role away, remove it from their roles.' : 'This link no longer works. Make a new one if they still need to join.'}</p>
    ${st.k === 'used' && who ? `<button class="btn quiet wide" data-act="personedit" data-uid="${esc(v.used.by)}" style="margin-bottom:8px">Their roles</button>` : ''}
    <button class="btn quiet wide" data-act="invitedrop" data-id="${esc(id)}">Remove from the list</button>`}
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Done</button>`);
}

function sheetInvite() {
  const f = ui.inv || (ui.inv = { role: 'coach', team: ui.teamId || (teams()[0] || {}).id || null, player: null });
  const t = state.teams[f.team] || null;
  const players = t ? Object.values(t.players || {}).filter(p => p.active !== false)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999)) : [];
  openSheet(`<h3>Invite someone</h3>
    <p class="lbl">As</p>
    <div class="chips" style="margin-bottom:12px">${Object.entries(INVITE_ROLES).map(([k, l]) =>
    `<button class="chip" type="button" data-act="invitepick" data-k="role" data-v="${k}" aria-pressed="${f.role === k}">${l}</button>`).join('')}</div>
    <p class="lbl">Team</p>
    ${pickOne('invitepick', 'team', f.team, teams().map(x => [x.id, esc(x.name || 'Team')]), 'Add a team first.')}
    ${f.role === 'parent' ? `<p class="lbl">Parent of</p>
    ${pickOne('invitepick', 'player', f.player, players.map(p => [p.id, `${p.number ? '#' + esc(p.number) + ' ' : ''}${esc(p.name || '')}`]), 'No players on this team.')}` : ''}
    <label class="field"><span>Their email — optional</span><input type="email" id="invEmail" placeholder="Leave empty for a link anyone can use once" autocapitalize="off" autocorrect="off"></label>
    <p class="muted">With an email, only that address can accept it, and you can have the sign-in email sent for you. Without one, whoever opens the link first gets the role — send it somewhere private.</p>
    <button class="btn wide" data-act="invitemake">Make the invite</button>`);
}

/* One invite, written where the rules want it: the invite itself, then the
   admin's list. Throws if either is refused, so a caller making a squad's
   worth stops at the first refusal instead of making fifteen half-invites. */
async function writeInvite(t, role, p, email) {
  const id = secretId(), at = nowMs();
  /* What the invitee sees before joining. Club, team and who sent it — never
     the child's name: the invite is readable by anyone holding the link, and a
     link gets forwarded. The admin's own list can carry it; only admins read that. */
  const doc = {
    ws: wsCode(), team: t.id, teamName: t.name || '', role,
    clubName: (acc().org || {}).name || '', by: me.uid, byName: me.name || '',
    at, expiresAt: at + INVITE_DAYS * 864e5
  };
  if (p) { doc.player = p.id; if (p.number) doc.playerNo = String(p.number); }
  if (email) doc.email = email;
  const listed = { role: doc.role, team: doc.team, teamName: doc.teamName, by: doc.by, byName: doc.byName, at, expiresAt: doc.expiresAt };
  if (p) { listed.playerName = p.name || ''; listed.player = p.id; }
  if (email) listed.email = email;
  await fb.set(fb.ref(fb.db, 'invites/' + id), doc);
  await fb.set(fb.ref(fb.db, 'clubInvites/' + wsCode() + '/' + id), listed);
  clubInv[id] = listed;
  return { id, doc, listed };
}

/* A squad's parents, one link per family, in one go. Every player with no
   parent linked yet and no open invite gets one; a player who already has an
   open invite keeps it, so running this twice makes nothing new and the list
   is also where an admin finds a link to send again. Personal links rather
   than one team link: each works once and needs no approving — the team link
   below is the other way in, for when typing fifteen texts is the problem. */
const openParentInvite = (tid, p) => inviteList().find(v => v.role === 'parent' && v.team === tid && !v.used
  && (v.expiresAt || 0) > nowMs() && (v.player ? v.player === p.id : v.playerName === p.name));
const needsParent = (t, p) => p.active !== false && !Object.keys(p.guardians || {}).length;
function sheetSquadInvites(tid) {
  const t = state.teams[tid]; if (!t) return;
  const list = players(t).filter(p => needsParent(t, p));
  const missing = list.filter(p => !openParentInvite(tid, p));
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const row = p => {
    const v = openParentInvite(tid, p), link = v ? inviteLink(v.id) : '';
    return `<div class="prow" style="grid-template-columns:auto 1fr auto">
      <span class="pnum">${esc(p.number ?? '')}</span><span><span class="pname">${esc(p.name || '')}</span>
        <span class="rowsub">${v ? `Link ready · until ${esc(new Date(v.expiresAt).toLocaleDateString())}` : 'No link yet'}</span></span>
      <span class="row">${v ? `<button class="btn sm" data-act="copylink" data-v="${esc(link)}">Copy</button>
        ${canShare ? `<button class="btn quiet sm" data-act="inviteshare" data-v="${esc(link)}">Share</button>` : ''}` : ''}</span></div>`;
  };
  openSheet(`<h3>Invite ${teamLabel(t)}'s parents</h3>
    ${list.length ? `<p class="muted" style="margin-top:0">One link per family, for the ${list.length} player${list.length === 1 ? '' : 's'} with no parent linked yet. Each works once, for ${INVITE_DAYS} days, and makes whoever opens it that child's parent — so send each one to that family only.</p>
      ${missing.length ? `<button class="btn wide" data-act="squadinvitego" data-tid="${tid}">Make ${missing.length} link${missing.length === 1 ? '' : 's'}</button>` : ''}
      <div class="plist" style="margin-top:10px">${list.map(row).join('')}</div>`
    : `<p class="muted">Every player on the squad has a parent linked.</p>`}
    <button class="btn quiet wide" data-act="closesheet">Done</button>`);
}
async function inviteSquad(tid) {
  const t = state.teams[tid];
  if (!t || !canAdmin()) { toast('Club admins only'); return; }
  if (!fb || !rtdb || !me) { toast(me ? 'Needs a connection to the database' : 'Sign in first'); return; }
  const todo = players(t).filter(p => needsParent(t, p) && !openParentInvite(tid, p));
  let n = 0;
  for (const p of todo) {
    try { await writeInvite(t, 'parent', p, ''); n++; } catch (e) {
      toast(/permission|denied/i.test((e && e.code) || '') ? 'The database refused it — are the invite rules from README published?' : 'Stopped — no connection');
      break;
    }
  }
  if (n) logAccess('invited', null, { targetName: n + ' parent' + (n === 1 ? '' : 's') + ' by link', team: t.id, teamName: t.name || null });
  sheetSquadInvites(tid);
}

async function makeInvite() {
  if (!canAdmin()) { toast('Club admins only'); return; }
  if (!fb || !rtdb || !me) { toast(me ? 'Needs a connection to the database' : 'Sign in first'); return; }
  const f = ui.inv || {};
  const t = state.teams[f.team];
  if (!t) { toast('Pick a team'); return; }
  if (!INVITE_ROLES[f.role]) { toast('Pick a role'); return; }
  const p = f.role === 'parent' ? (t.players || {})[f.player] : null;
  if (f.role === 'parent' && !p) { toast('Pick the player'); return; }
  const el = $('#invEmail');
  const email = ((el && el.value) || '').trim().toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('That email does not look right'); return; }
  let made;
  try { made = await writeInvite(t, f.role, p, email); } catch (e) {
    toast(/permission|denied/i.test((e && e.code) || '') ? 'The database refused it — are the invite rules from README published?' : 'Could not make the invite');
    return;
  }
  const { id, doc } = made;
  logAccess('invited', null, { targetName: (email || 'someone') + ' as ' + f.role, team: t.id, teamName: t.name || null });
  ui.inv = null;
  const link = inviteLink(id);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  openSheet(`<h3>Invite ready</h3>
    <p class="muted" style="margin-top:0">${esc(INVITE_ROLES[doc.role])} on <b>${esc(doc.teamName)}</b>${email ? ` for <b>${esc(email)}</b>` : ''}. Works once, for ${INVITE_DAYS} days.</p>
    <div class="codebox">${esc(link)}</div>
    <div class="row" style="margin-bottom:10px"><button class="btn" data-act="copylink" data-v="${esc(link)}">Copy link</button>
    ${canShare ? `<button class="btn quiet" data-act="inviteshare" data-v="${esc(link)}">Share…</button>` : ''}</div>
    ${email ? `<button class="btn quiet wide" data-act="invitemail" data-v="${esc(link)}" data-email="${esc(email)}">Send them the sign-in email</button>
    <p class="muted">Firebase sends it, worded as a sign-in link rather than an invitation — worth a text to say it is coming.</p>` : ''}
    <button class="btn quiet wide" data-act="closesheet">Done</button>`);
  render();
}

/* ---------------- team links: parents ask, coaches approve ---------------- */
/* AUTH.md's bulk path. One link per team, posted once in the team chat; each
   parent signs in, types their child's shirt number, and a coach of the team
   approves with a tap. A parent sees no names before that — the roster is the
   thing being protected, and a link in a group chat travels.

     joinCodes/{code}               what the link points at: club, team, and
                                    names for the screen. Readable by id only,
                                    like an invite. Grants nothing by itself.
     claims/{code}/{teamId}/{uid}   a request: the shirt number and, if given,
                                    the child's first name, to help the coach
                                    match it. Its author and that team's coaches
                                    and the admins read it.
     teams/{teamId}/join            the team's current link, so its coaches can
                                    show it again. "New link" deletes the old
                                    code, which is how a link in last season's
                                    chat stops working.

   Approving is the coach's device doing what she can already do — link a
   guardian, add to the parent list — plus one write she could not do before:
   putting the parent in access/index. The rules let her only for someone with
   an approved request on her own team, and the value is that team's id, which
   is what the rule checks. Nobody waits on the parent's phone to come back. */
const LS_JOIN = 'sm.join';
let join = null;            // { code, status, doc, err } while a team link is being handled
let claimsSeen = {};        // claims/{code}/{teamId}, for that team's coaches
let claimFor = null, claimSubs = {};

const joinLink = c => location.origin + location.pathname + '?join=' + encodeURIComponent(c);

function captureJoin() {
  try {
    const q = new URLSearchParams(location.search || '');
    const c = (q.get('join') || '').trim();
    if (c) {
      localStorage.setItem(LS_JOIN, JSON.stringify({ code: c }));
      q.delete('join');
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + (location.hash || ''));
    }
    const held = JSON.parse(localStorage.getItem(LS_JOIN) || 'null');
    join = held && held.code ? { code: held.code, status: 'idle', doc: held.doc || null, err: null, hidden: !!held.hidden } : null;
  } catch (e) { join = null; }
}
function holdJoin() {
  if (!join) return;
  try { localStorage.setItem(LS_JOIN, JSON.stringify({ code: join.code, doc: join.doc, hidden: !!join.hidden })); } catch (e) { }
}
function dropJoin() {
  try { localStorage.removeItem(LS_JOIN); } catch (e) { }
  join = null;
}

/* Read the link, then the request this account may already have made with it
   — a parent who comes back tomorrow should see "waiting", not the form. The
   request is watched, not read once: approval arrives from somebody else's
   phone, and this is how the parent's finds out. */
function maybeLoadJoin() {
  if (!join || !rtdb || !me || join.status !== 'idle') return;
  const code = join.code, who = me.uid;
  join.status = 'loading';
  const { db, mod } = rtdb;
  mod.onValue(mod.ref(db, 'joinCodes/' + code), s => {
    if (!join || join.code !== code || !me || me.uid !== who) return;
    const v = s.val();
    if (!v) { join.status = join.doc && join.sent ? join.status : 'gone'; render(); return; }
    join.doc = v; holdJoin();
    if (wsCode() === v.ws && isGuardian(v.team, who)) { dropJoin(); toast(`You're already in ${v.teamName || 'that team'}`); render(); return; }
    mod.onValue(mod.ref(db, `claims/${v.ws}/${v.team}/${who}`), cs => {
      if (!join || join.code !== code || !me || me.uid !== who) return;
      const c = cs.val();
      if (c && c.approved) { joinApproved(v); return; }
      if (c) { join.status = 'sent'; join.sent = true; }
      else join.status = join.sent ? 'declined' : 'ready';
      render();
    }, () => { join.status = 'ready'; render(); });
  }, err => {
    if (!join || join.code !== code) return;
    join.status = 'error'; join.err = (err && err.code) || String(err);
    render();
  }, { onlyOnce: true });
  render();
}

/* Let in. The coach has done the granting; what is left is this account's
   own bookkeeping, then the club. A device already using another club is not
   switched out from under whoever is using it — the club goes on the account's
   list instead, where the club switcher finds it. */
async function joinApproved(v) {
  const { db, mod } = rtdb, who = me.uid, soft = pr => Promise.resolve(pr).catch(() => { });
  await soft(mod.set(mod.ref(db, 'userOrgs/' + who + '/' + v.ws), { name: v.clubName || '', at: nowMs() }));
  await soft(mod.remove(mod.ref(db, `claims/${v.ws}/${v.team}/${who}`)));
  dropJoin();
  const here = wsCode();
  if (!here || here === v.ws) {
    try { localStorage.setItem(LS_WS, v.ws); } catch (e) { }
    location.reload(); return;
  }
  toast(`You're in at ${v.clubName || 'the club'} — open it from the club switcher`);
  render();
}

async function sendClaim() {
  if (!join || !join.doc || !rtdb || !me) return;
  const v = join.doc, who = me.uid;
  const sEl = $('#joinShirt'), cEl = $('#joinChild');
  const shirt = String((sEl && sEl.value) || '').trim().slice(0, 40);
  const child = String((cEl && cEl.value) || '').trim().slice(0, 40);
  if (!shirt) { toast('Type the shirt number'); return; }
  const { db, mod } = rtdb;
  const at = nowMs();
  join.status = 'working'; render();
  try {
    // so a coach or admin sees who is asking, as they would anyone who signed in
    await mod.set(mod.ref(db, `workspaces/${v.ws}/access/members/${who}`), { name: me.name || '', email: me.email || '', at });
    await mod.set(mod.ref(db, `claims/${v.ws}/${v.team}/${who}`), {
      code: join.code, shirt, ...(child ? { child } : {}), name: me.name || '', email: me.email || '', at
    });
  } catch (e) {
    join.status = 'error';
    join.err = /permission|denied/i.test((e && e.code) || '') ? 'The database refused it — the link may have been replaced. Ask the coach for the new one'
      : ((e && e.code) || String(e));
    render(); return;
  }
  join.status = 'sent'; join.sent = true; holdJoin(); render();
}

function joinScreen() {
  const v = (join && join.doc) || {};
  const club = esc(v.clubName || 'a club'), tm = esc(v.teamName || 'a team');
  const later = `<button class="btn quiet" data-act="joinhide">Not now</button>`;
  const box = (title, body, btns) => `<div class="stack"><div class="empty"><strong>${title}</strong>${body}
    <div class="row" style="margin-top:14px;justify-content:center">${btns}</div></div></div>`;
  const s = join.status;
  if (!fbConfig().apiKey) return box('A team link', 'This copy of the app is not connected to a database, so it cannot use one.', `<button class="btn quiet" data-act="joindrop">OK</button>`);
  if (!me) return box('Join your child’s team',
    'Sign in first. Use the account you want to keep — it is the one the coaches will know you by.',
    `<button class="btn" data-act="signinsheet">Sign in</button>${later}`);
  if (s === 'idle' || s === 'loading') return box('Opening the team link…', 'This needs a signal. It will carry on by itself once there is one.', later);
  if (s === 'working') return box('Sending…', `Asking the coaches of ${tm}.`, '');
  if (s === 'gone') return box('That team link no longer works',
    'The coach has made a new one. Ask them for the latest link.', `<button class="btn" data-act="joindrop">OK</button>`);
  if (s === 'error') return box('Something went wrong', `${esc(join.err || '')}. Check the signal and try again.`,
    `<button class="btn" data-act="joinretry">Try again</button>${later}`);
  if (s === 'sent') return box(`Waiting for a coach of ${tm}`,
    `Your request to join ${club} is with the team's coaches. Once one of them lets you in, this opens the club by itself — you can close it meanwhile.`,
    `<button class="btn quiet" data-act="joincancel">Cancel the request</button>${later}`);
  if (s === 'declined') return box('Not approved',
    `A coach of ${tm} did not approve the request. If that is a mistake, check the shirt number with them and ask again.`,
    `<button class="btn" data-act="joinagain">Ask again</button><button class="btn quiet" data-act="joindrop">OK</button>`);
  return `<div class="stack"><div class="card">
    <h2>Join ${tm}</h2>
    <p class="muted" style="margin-top:4px">${club} · as a parent. You are signed in as <b>${esc(me.email || me.name)}</b>.</p>
    <label class="field"><span>Your child's shirt number</span><input type="text" inputmode="numeric" id="joinShirt" maxlength="40" placeholder="7 — or 7, 12 for two"></label>
    <label class="field"><span>Their first name — optional, helps the coach</span><input type="text" id="joinChild" maxlength="40" autocomplete="off"></label>
    <p class="muted">A coach of the team checks this and lets you in. You see nothing of the team until then.</p>
    <div class="row"><button class="btn" data-act="joinsend">Send to the coaches</button>${later}</div>
  </div></div>`;
}

/* ---- the coach's side ---- */
async function makeJoinCode(tid) {
  const t = state.teams[tid];
  if (!t || !mayGrant(tid)) { toast('Club admins and that team’s coaches only'); return; }
  if (!fb || !me) { toast(me ? 'Needs a connection to the database' : 'Sign in first'); return; }
  const code = secretId().replace(/^i/, 'j'), at = nowMs(), old = (t.join || {}).code;
  try {
    await fb.set(fb.ref(fb.db, 'joinCodes/' + code), {
      ws: wsCode(), team: tid, teamName: t.name || '', clubName: (acc().org || {}).name || '',
      by: me.uid, byName: me.name || '', at
    });
  } catch (e) {
    toast(/permission|denied/i.test((e && e.code) || '') ? 'The database refused it — are the team link rules from README published?' : 'Could not make the link');
    return;
  }
  if (old) Promise.resolve(fb.remove(fb.ref(fb.db, 'joinCodes/' + old))).catch(() => { });
  commit(`teams/${tid}/join`, { code, at, by: me.uid });
  logAccess(old ? 'replaced the team link' : 'made a team link', null, { team: tid, teamName: t.name || null });
  toast(old ? 'New link made — the old one has stopped working' : 'Team link made');
}

/* Requests for the teams this account may approve on. Same shape as the
   message watchers: attach what the roles call for, drop what they no longer
   do, start over on a change of club or account. */
function watchClaims() {
  const key = me && rtdb && fb && wsCode() && !needsSignIn() ? clubKey() + '|' + me.uid : null;
  if (key !== claimFor) {
    for (const off of Object.values(claimSubs)) { try { off(); } catch (e) { } }
    claimSubs = {}; claimsSeen = {}; claimFor = key;
  }
  if (!key) return;
  const want = {};
  for (const t of teams()) if (mayGrant(t.id)) want[`claims/${wsCode()}/${t.id}`] = t.id;
  for (const p of Object.keys(claimSubs)) if (!want[p]) { try { claimSubs[p](); } catch (e) { } delete claimSubs[p]; }
  const { db, mod } = rtdb;
  for (const [p, tid] of Object.entries(want)) {
    if (claimSubs[p]) continue;
    let off = null;
    claimSubs[p] = () => { if (off) off(); };
    off = mod.onValue(mod.ref(db, p), s => { claimsSeen[tid] = s.val() || {}; render(); }, () => { });
    if (typeof off !== 'function') off = null;
  }
}
const pendingClaims = tid => Object.entries(claimsSeen[tid] || {}).filter(([, c]) => c && !c.approved)
  .map(([u, c]) => ({ uid: u, ...c })).sort((a, b) => (a.at || 0) - (b.at || 0));
// the shirt numbers a request names, matched to the squad; never a guess beyond that
function claimMatches(t, c) {
  const nums = String(c.shirt || '').split(/[^0-9A-Za-z]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  return players(t).filter(p => p.active !== false && nums.includes(String(p.number ?? '').trim().toLowerCase()));
}

async function approveClaim(tid, u, pids) {
  const t = state.teams[tid];
  if (!t || !mayGrant(tid)) { toast('Club admins and that team’s coaches only'); return; }
  const c = (claimsSeen[tid] || {})[u];
  const picked = pids.filter(pid => (t.players || {})[pid]);
  if (!c || !picked.length) { toast('Pick their child'); return; }
  const at = nowMs();
  try {
    // first, because the index rule looks for it
    await fb.set(fb.ref(fb.db, `claims/${wsCode()}/${tid}/${u}/approved`), { by: me.uid, at, players: Object.fromEntries(picked.map(x => [x, true])) });
  } catch (e) {
    toast(/permission|denied/i.test((e && e.code) || '') ? 'The database refused it — are the team link rules from README published?' : 'Not approved — no connection');
    return;
  }
  setDeep(claimsSeen, `${tid}/${u}/approved`, { by: me.uid, at });
  for (const pid of picked) if (!(((t.players[pid] || {}).guardians) || {})[u]) commit(`teams/${tid}/players/${pid}/guardians/${u}`, true);
  // the team id, not `true`: that is what the rule checks a coach's write against
  if (!(acc().index || {})[u]) quiet(`access/index/${u}`, tid);
  if (!(acc().members || {})[u]) quiet(`access/members/${u}`, { name: c.name || '', email: c.email || '', at: c.at || at });
  syncTeamParents(tid);
  logAccess('approved as parent', u, { team: tid, teamName: t.name || null, player: picked.map(x => t.players[x].name).join(', ') });
  saveLocal(); render();
  toast(`${c.name || c.email || 'They'} can open the team now`);
}
function declineClaim(tid, u) {
  if (!mayGrant(tid)) { toast('Club admins and that team’s coaches only'); return; }
  if (!confirm('Turn this request down? They can ask again.')) return;
  delete (claimsSeen[tid] || {})[u];
  Promise.resolve(fb.remove(fb.ref(fb.db, `claims/${wsCode()}/${tid}/${u}`))).catch(() => toast('Not removed — no connection'));
  render();
}

/* On Squad, for whoever can let people in: the team link, the requests that
   came through it, and — admins — a personal link per family. */
function joinCard(t) {
  if (!mayGrant(t.id) || !fbConfig().apiKey || !anyAdmins()) return '';
  const j = t.join, link = j && j.code ? joinLink(j.code) : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const reqs = pendingClaims(t.id);
  const pick = ui.claimPick || {};
  const req = c => {
    const m = claimMatches(t, c);
    const chosen = (pick[c.uid] || m.map(p => p.id)).filter(pid => (t.players || {})[pid]);
    return `<div class="claim">
      <div><b>${esc(c.name || c.email || 'Someone')}</b>${c.email && c.name ? ` <span class="muted">${esc(c.email)}</span>` : ''}</div>
      <div class="rowsub">Says: #${esc(c.shirt)}${c.child ? ' · ' + esc(c.child) : ''} · ${esc(whenShort(c.at))}</div>
      <div class="chips" style="margin:8px 0">${players(t).filter(p => p.active !== false).map(p =>
      chosen.includes(p.id) || m.some(x => x.id === p.id) || pick['all:' + c.uid]
        ? `<button class="chip" type="button" data-act="claimpick" data-uid="${esc(c.uid)}" data-pid="${p.id}" aria-pressed="${chosen.includes(p.id)}">${chipName(p)}</button>` : '').join('')}
        <button class="chip" type="button" data-act="claimall" data-uid="${esc(c.uid)}">${pick['all:' + c.uid] ? 'Fewer' : m.length ? 'Someone else' : 'Pick from the squad'}</button></div>
      ${!m.length ? '<p class="muted" style="margin:0 0 8px">No player on the squad has that number — check with them before letting them in.</p>' : ''}
      <div class="row"><button class="btn sm" data-act="claimok" data-tid="${t.id}" data-uid="${esc(c.uid)}"${chosen.length ? '' : ' disabled'}>Let in as parent${chosen.length ? ' of ' + chosen.map(pid => esc(t.players[pid].name || '')).join(' & ') : ''}</button>
        <button class="btn quiet sm" data-act="claimno" data-tid="${t.id}" data-uid="${esc(c.uid)}">Turn down</button></div></div>`;
  };
  const without = players(t).filter(p => needsParent(t, p)).length;
  return `<div class="card">
    <div class="spread"><h2>Parents</h2>${reqs.length ? `<span class="pill asking">${reqs.length} asking</span>` : ''}</div>
    ${reqs.length ? `<div class="claims">${reqs.map(req).join('')}</div>` : ''}
    <p class="muted" style="margin:8px 0">${link ? 'Post this link in the team chat. Parents sign in, type their child’s shirt number, and wait for you to let them in here.' : 'One link for the whole team: parents sign in, type their child’s shirt number, and you let them in here with a tap.'}</p>
    ${link ? `<div class="codebox">${esc(link)}</div>
      <div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="copylink" data-v="${esc(link)}">Copy link</button>
      ${canShare ? `<button class="btn quiet sm" data-act="inviteshare" data-v="${esc(link)}">Share…</button>` : ''}
      <button class="btn quiet sm" data-act="joinnew" data-tid="${t.id}">New link</button></div>`
    : `<button class="btn wide" data-act="joinnew" data-tid="${t.id}">Make a team link</button>`}
    ${canAdmin() ? `<button class="btn quiet wide" data-act="squadinvites" data-tid="${t.id}">Or a personal link per family${without ? ` (${without} without a parent)` : ''}</button>` : ''}
  </div>`;
}

/* ---------------- messages ---------------- */
/* Talking to the families: team notices from the coaches, and a private
   conversation between each family and their team's coaches.

   Where it lives matters more than how it looks. Not under workspaces/{code}:
   everyone indexed reads all of that, so a parent's message about her
   daughter would be readable by every other parent in the club, and the
   connect-time read would drag every conversation onto every phone. So, at the
   root, each with rules of its own (README has them; test/rules.js pins them):

     board/{code}/{teamId}/{id}           a notice. Coaches of that team and
                                          admins post; anyone indexed in the
                                          club reads. seen/{uid} is each
                                          reader's own tick, which is also how
                                          a coach knows who has not seen it.
     dm/{code}/{teamId}/{familyUid}/m/{id}
                                          one conversation per family per team,
                                          readable by that family, every coach
                                          of the team and the admins — never one
                                          coach alone. Append-only, like the
                                          audit log: nobody edits or deletes a
                                          message, admins included.
     dm/.../{familyUid}/seen/{uid}        each side's read marker.

   A notice board readable club-wide is no wider than what the rules already
   let a parent read (every team's games and squad); the app shows each person
   only their own teams. Rules cannot ask "is this uid a guardian on this team"
   without a parent lookup table, and AUTH.md's teamMembers index is that table.

   Notifications are honest about the platform, as the Live tab's are: with no
   server there is nothing to push from, so a message pops up while Minutes is
   open, in any tab, and is waiting with a badge the next time it is opened.
   Reaching a phone that has closed it means Email the parents, which needs
   nothing but the addresses the club already has, or a push service — ROADMAP
   has what that would take. */
const LS_MSGS = 'sm.msgs';
const MSG_MAX = 4000;
const MSG_SHOW = 25;           // notices drawn before "Show older"
let msgs = { board: {}, dm: {}, outbox: {} };
let msgFor = null;             // { key, ls, uid, code } the watchers belong to
let msgSubs = {};              // path -> unsubscribe
let msgPrimed = {};            // path -> keys already there at the first read
const msgSentHere = new Set(); // ids this page has handed to the database itself

const msgsKey = u => LS_MSGS + ':' + clubKey() + ':' + u;
const isStaff = tid => !!me && (canAdmin() || isCoach(tid, me.uid));
/* Every team whose notices this account reads: the ones it works on or has a
   child in. A coach reading another age group is a viewer there, not a member,
   and that team's notices are not hers. */
function msgTeams() {
  if (!me || !fb || !wsCode() || needsSignIn() || !anyAdmins()) return [];
  return teams().filter(t => isStaff(t.id) || isTracker(t.id, me.uid) || isGuardian(t.id, me.uid));
}
const staffTeams = () => msgTeams().filter(t => isStaff(t.id));
// a coach whose own child is in her squad talks to herself as staff, not as a family
const famTeams = () => msgTeams().filter(t => !isStaff(t.id) && isGuardian(t.id, me.uid));
const msgOn = () => msgTeams().length > 0;

function saveMsgs() {
  if (!msgFor) return;
  keepStored(msgFor.ls, JSON.stringify(msgs));
}
function rootSet(p, v) {
  if (!fb) return Promise.reject(new Error('not connected'));
  try { return Promise.resolve(fb.set(fb.ref(fb.db, p), v)); } catch (e) { return Promise.reject(e); }
}

/* Attach exactly the listeners this account's roles call for, and drop any it
   no longer has. Run from render(), so a role granted or withdrawn while the
   page is open changes what is being listened to without a reload. A change of
   account or club starts over, and signing out drops this account's copy: the
   squad's cache is kept for an unsynced game, but nothing here exists only on
   this device except the outbox, and a private conversation does not belong on
   a phone somebody else may sign in on next. */
function watchMessages() {
  const key = me && rtdb && fb && wsCode() && !needsSignIn() ? clubKey() + '|' + me.uid : null;
  if (key !== (msgFor && msgFor.key)) {
    for (const off of Object.values(msgSubs)) { try { off(); } catch (e) { } }
    if (msgFor && !me) { try { localStorage.removeItem(msgFor.ls); } catch (e) { } }
    msgSubs = {}; msgPrimed = {};
    msgs = { board: {}, dm: {}, outbox: {} };
    msgFor = key ? { key, ls: msgsKey(me.uid), uid: me.uid, code: wsCode() } : null;
    if (msgFor) {
      try {
        const c = JSON.parse(localStorage.getItem(msgFor.ls) || 'null');
        if (c) msgs = { board: c.board || {}, dm: c.dm || {}, outbox: c.outbox || {} };
      } catch (e) { }
    }
  }
  if (!msgFor) return;
  const code = msgFor.code, want = {};
  for (const t of msgTeams()) want[`board/${code}/${t.id}`] = { kind: 'board', tid: t.id };
  for (const t of staffTeams()) want[`dm/${code}/${t.id}`] = { kind: 'dm', tid: t.id };
  for (const t of famTeams()) want[`dm/${code}/${t.id}/${me.uid}`] = { kind: 'dm', tid: t.id, fam: me.uid };
  for (const p of Object.keys(msgSubs)) if (!want[p]) {
    try { msgSubs[p](); } catch (e) { }
    delete msgSubs[p]; delete msgPrimed[p];
  }
  const { db, mod } = rtdb;
  for (const [p, w] of Object.entries(want)) {
    if (msgSubs[p]) continue;
    /* Claimed before asking: a listener that answers synchronously from the
       cache renders, and render() comes straight back here — without the
       placeholder that is a second listener, and a third, and so on. */
    let off = null;
    msgSubs[p] = () => { if (off) off(); };
    off = mod.onValue(mod.ref(db, p), s => onMsgs(p, w, s.val()), () => { });
    if (typeof off !== 'function') off = null;
  }
}

/* What a listener delivers is the truth for its path; the outbox is what this
   device has sent that the database has not said it has. */
function onMsgs(p, w, v) {
  if (!msgFor) return;
  if (w.kind === 'board') msgs.board[w.tid] = v || {};
  else if (w.fam) {
    const all = { ...(msgs.dm[w.tid] || {}) };
    if (v) all[w.fam] = v; else delete all[w.fam];
    msgs.dm[w.tid] = all;
  } else msgs.dm[w.tid] = v || {};
  const landed = id => w.kind === 'board' ? !!((v || {})[id])
    : w.fam ? !!(((v || {}).m || {})[id]) : Object.values(v || {}).some(th => (th.m || {})[id]);
  const first = !msgPrimed[p];
  for (const [id, o] of Object.entries(msgs.outbox)) {
    if (!o.path.startsWith(p + '/')) continue;
    /* Firebase shows this page its own write at once, before the server has
       it, and forgets it on a reload. So only the write's own answer clears
       something sent from here; seeing it in a read only clears what an
       earlier page sent, because then it came from the server. */
    if (landed(id) && !msgSentHere.has(id)) delete msgs.outbox[id];
    // queued before a reload, which a database write does not survive: send it again
    else if (first && o.status === 'sending') sendOut(id);
  }
  const fresh = msgNews(p, w);
  saveMsgs();
  for (const x of fresh) ping(x.title, x.body, 'minutes-msg-' + x.id, x.urgent ? [200, 80, 200, 80, 200] : [150, 60, 150]);
  msgPaint();
}

/* The first read of a path only takes note of what is already there — opening
   the app should not fire a week of notices — after which anything new from
   somebody else, that this account has not already seen elsewhere, is news. */
function msgNews(p, w) {
  const items = [];
  const tn = (state.teams[w.tid] || {}).name || 'Your team';
  if (w.kind === 'board') {
    for (const [id, x] of Object.entries(msgs.board[w.tid] || {}))
      items.push({ id, by: x.by, seen: !!(x.seen || {})[msgFor.uid], urgent: !!x.urgent,
        title: `${x.urgent ? 'Urgent · ' : ''}${tn} · ${x.byName || 'a coach'}`, body: x.text });
  } else {
    for (const [fam, th] of Object.entries(msgs.dm[w.tid] || {})) {
      if (w.fam && fam !== w.fam) continue;
      const mark = (th.seen || {})[msgFor.uid] || 0;
      for (const [id, x] of Object.entries(th.m || {}))
        items.push({ id, by: x.by, seen: (x.at || 0) <= mark,
          title: w.fam ? `${x.byName || 'A coach'} · ${tn}` : `${familyName(fam)} · ${tn}`, body: x.text });
    }
  }
  const known = msgPrimed[p];
  msgPrimed[p] = new Set(items.map(x => x.id));
  if (!known) return [];
  return items.filter(x => !known.has(x.id) && x.by !== msgFor.uid && !x.seen);
}

/* ---- reading ---- */
const outFor = (kind, tid, fam) => Object.entries(msgs.outbox || {})
  .filter(([, o]) => o.kind === kind && o.tid === tid && (kind === 'board' || o.fam === fam))
  .map(([id, o]) => ({ id, ...o.value, status: o.status }));
// the outbox's copy wins over the database's echo of it, so it keeps its status
const withOut = (sent, out) => { const ids = new Set(out.map(x => x.id)); return sent.filter(x => !ids.has(x.id)).concat(out); };
function notices(tid) {
  const sent = Object.entries(msgs.board[tid] || {}).map(([id, x]) => ({ id, tid, ...x }));
  return withOut(sent, outFor('board', tid).map(x => ({ ...x, tid }))).sort((a, b) => (b.at || 0) - (a.at || 0));
}
const thread = (tid, fam) => ((msgs.dm[tid] || {})[fam]) || {};
function threadMsgs(tid, fam) {
  const sent = Object.entries(thread(tid, fam).m || {}).map(([id, x]) => ({ id, ...x }));
  return withOut(sent, outFor('dm', tid, fam)).sort((a, b) => (a.at || 0) - (b.at || 0));
}
const noticeUnread = x => !!me && x.by !== me.uid && !x.status && !(x.seen || {})[me.uid];
function threadUnread(tid, fam) {
  if (!me) return 0;
  const mark = (thread(tid, fam).seen || {})[me.uid] || 0;
  return threadMsgs(tid, fam).filter(x => x.by !== me.uid && !x.status && (x.at || 0) > mark).length;
}
function unreadCount() {
  if (!msgFor) return 0;
  let n = 0;
  for (const t of msgTeams()) n += notices(t.id).filter(noticeUnread).length;
  for (const t of staffTeams()) for (const fam of Object.keys(msgs.dm[t.id] || {})) n += threadUnread(t.id, fam) ? 1 : 0;
  for (const t of famTeams()) n += threadUnread(t.id, me.uid) ? 1 : 0;
  return n;
}

/* Families on a team, by account: a parent of two in the same squad is one
   family, and it is families a coach is asking about when she asks who has
   seen the notice. */
function families(tid) {
  const out = new Set();
  for (const p of Object.values(((state.teams[tid] || {}).players) || {}))
    for (const u of Object.keys(p.guardians || {})) if (!isStaff(tid) || u !== me.uid) out.add(u);
  return [...out];
}
function familyName(u) {
  const x = (acc().members || {})[u] || {};
  return x.name || (x.email ? x.email.split('@')[0] : '') || 'A parent';
}
// the coach sees whose parent this is; nobody else is ever shown this
function childrenOf(tid, u) {
  return players(state.teams[tid]).filter(p => (p.guardians || {})[u]).map(p => p.name).filter(Boolean);
}
function staffNames(tid) {
  const out = new Set();
  for (const u of Object.keys(teamAccess(tid).coaches || {})) out.add(familyName(u));
  return [...out];
}
const guardianEmails = tid => [...new Set(families(tid).map(u => ((acc().members || {})[u] || {}).email).filter(Boolean))];

function whenShort(ms) {
  if (!ms) return '';
  const d = new Date(ms), now = new Date(nowMs());
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday ' + time;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + time;
}
const msgText = s => esc(s).replace(/\n/g, '<br>');

/* Opening the screen is reading it. Only while the page is actually in front
   of somebody: a tab left on Messages in the background has not read what
   arrives there. */
function markSeen() {
  if (!msgFor || (typeof document !== 'undefined' && document.hidden)) return;
  const u = msgFor.uid, code = msgFor.code, at = nowMs();
  if (ui.view === 'inbox') {
    for (const t of msgTeams()) for (const x of notices(t.id)) {
      if (!noticeUnread(x)) continue;
      setDeep(msgs.board, `${t.id}/${x.id}/seen/${u}`, at);
      rootSet(`board/${code}/${t.id}/${x.id}/seen/${u}`, at).catch(() => { });
    }
    saveMsgs();
  }
  if (ui.view === 'thread' && ui.thread) {
    const { tid, fam } = ui.thread;
    if (!threadUnread(tid, fam)) return;
    setDeep(msgs.dm, `${tid}/${fam}/seen/${u}`, at);
    rootSet(`dm/${code}/${tid}/${fam}/seen/${u}`, at).catch(() => { });
    saveMsgs();
  }
}

/* ---- sending ---- */
function sendOut(id) {
  const o = msgs.outbox[id]; if (!o) return;
  o.status = 'sending'; saveMsgs();
  msgSentHere.add(id);
  rootSet(o.path, o.value).then(() => {
    delete msgs.outbox[id]; saveMsgs(); render();
  }, err => {
    if (!msgs.outbox[id]) return;
    msgs.outbox[id].status = 'refused'; saveMsgs(); render();
    toast(/permission|denied/i.test((err && (err.code || err.message)) || '')
      ? 'Not sent — the database refused it. Are the messaging rules published?' : 'Not sent');
  });
}
/* The outbox is what lets a coach at a pitch with no signal post "we are
   running ten minutes late" and put the phone away: it goes when the signal
   comes back, even if the page was reloaded in between. */
function queueMsg(kind, tid, fam, text, extra) {
  const id = uid();
  const value = { by: me.uid, byName: me.name || 'Someone', at: nowMs(), text, ...(extra || {}) };
  const path = kind === 'board' ? `board/${msgFor.code}/${tid}/${id}` : `dm/${msgFor.code}/${tid}/${fam}/m/${id}`;
  msgs.outbox[id] = { kind, tid, fam: fam || null, path, value, status: 'sending' };
  sendOut(id);
  return id;
}

/* ---- screens ---- */
function viewInbox() {
  if (!msgOn() && !wsRead && fbConfig().apiKey) return `<div class="empty"><strong>Connecting…</strong>Messages appear once Minutes has reached the club.</div>`;
  if (!msgOn()) return `<div class="empty"><strong>No messages here</strong>
    ${!anyAdmins() ? 'Messages start once the club has an admin.' : 'Messages are for the teams you coach, track or have a child in.'}</div>`;
  const mine = msgTeams(), staff = staffTeams(), fams = famTeams();
  const many = mine.length > 1;
  const all = mine.flatMap(t => notices(t.id)).sort((a, b) => (b.at || 0) - (a.at || 0));
  const shown = ui.msgAll ? all : all.slice(0, MSG_SHOW);

  const canPop = typeof Notification !== 'undefined';
  const alerts = canPop && Notification.permission === 'default' ? `<div class="card"><div class="spread"><b>Pop-ups on this device</b>
      <button class="btn sm" data-act="msgalerts">Turn on</button></div>
    <p class="muted" style="margin:6px 0 0">A message pops up while Minutes is open, even in another tab.</p></div>` : '';

  const notice = x => {
    const t = state.teams[x.tid] || {};
    const fam = families(x.tid);
    const seen = fam.filter(u => (x.seen || {})[u]).length;
    return `<div class="msgcard${noticeUnread(x) ? ' unread' : ''}${x.urgent ? ' urgent' : ''}">
      <div class="msghead"><b>${esc(x.byName || 'A coach')}</b>${many ? `<span class="pill">${esc(t.name || 'Team')}</span>` : ''}
        ${x.urgent ? '<span class="pill urgent">Urgent</span>' : ''}<span class="msgwhen">${esc(whenShort(x.at))}</span></div>
      <div class="msgbody">${msgText(x.text)}</div>
      ${x.status === 'sending' ? '<div class="msgfoot">Sending — goes when there is a signal</div>' : ''}
      ${x.status === 'refused' ? `<div class="msgfoot bad">Not sent <button class="linkbtn" data-act="msgretry" data-id="${x.id}">Try again</button> <button class="linkbtn" data-act="msgdiscard" data-id="${x.id}">Discard</button></div>` : ''}
      ${!x.status && isStaff(x.tid) ? `<div class="msgfoot"><button class="linkbtn" data-act="postseen" data-tid="${x.tid}" data-id="${x.id}">Seen by ${seen} of ${fam.length} famil${fam.length === 1 ? 'y' : 'ies'}</button>
        <button class="linkbtn" data-act="postshare" data-tid="${x.tid}" data-id="${x.id}">Email or share</button>
        ${x.by === me.uid || canAdmin() ? `<button class="linkbtn" data-act="postdel" data-tid="${x.tid}" data-id="${x.id}">Delete</button>` : ''}</div>` : ''}
    </div>`;
  };

  const convRow = (tid, fam, label, sub) => {
    const l = threadMsgs(tid, fam), last = l[l.length - 1], n = threadUnread(tid, fam);
    return `<button class="prow convrow${n ? ' unread' : ''}" data-act="thread" data-tid="${tid}" data-fam="${fam}">
      <span><span class="pname">${label}</span>
        <span class="rowsub">${last ? `${last.by === me.uid ? 'You: ' : ''}${esc(String(last.text || '').slice(0, 80))}` : esc(sub)}</span></span>
      <span class="msgwhen">${n ? `<span class="msgdot">${n}</span>` : last ? esc(whenShort(last.at)) : ''}</span></button>`;
  };
  const famConvs = fams.map(t => convRow(t.id, me.uid, `Coaches of ${teamLabel(t)}`, 'Ask a question, say she is ill, anything for the coaches'));
  const staffConvs = staff.flatMap(t => Object.keys(msgs.dm[t.id] || {})
    .concat(Object.values(msgs.outbox || {}).filter(o => o.kind === 'dm' && o.tid === t.id).map(o => o.fam))
    .filter((f, i, a) => a.indexOf(f) === i)
    .map(fam => ({ t, fam, last: (threadMsgs(t.id, fam).slice(-1)[0] || {}).at || 0 })))
    .sort((a, b) => (threadUnread(b.t.id, b.fam) ? 1 : 0) - (threadUnread(a.t.id, a.fam) ? 1 : 0) || b.last - a.last)
    .map(({ t, fam }) => {
      const kids = childrenOf(t.id, fam);
      return convRow(t.id, fam, `${esc(familyName(fam))}${kids.length ? ` <span class="muted">· ${esc(kids.join(', '))}</span>` : ''}${many ? ` <span class="pill">${esc(t.name || '')}</span>` : ''}`, '');
    });

  return `<div class="stack">
    <div class="spread"><h2>Messages</h2>
      ${staff.length ? `<button class="btn sm" data-act="postnew">Post a notice</button>` : ''}</div>
    ${alerts}
    ${fams.length || staff.length ? `<div class="card"><h2 style="margin-bottom:8px">${staff.length ? 'From families' : 'Talk to the coaches'}</h2>
      ${staff.length && !staffConvs.length && !famConvs.length ? `<p class="muted" style="margin:0">Nothing yet. A parent's message to the coaches lands here.</p>` : ''}
      <div class="plist">${famConvs.join('')}${staffConvs.join('')}</div></div>` : ''}
    <div class="card"><h2 style="margin-bottom:8px">Team notices</h2>
      ${shown.length ? shown.map(notice).join('') : `<p class="muted" style="margin:0">${staff.length ? 'Nothing posted yet. A notice goes to every family on the team.' : 'Nothing from the coaches yet.'}</p>`}
      ${all.length > shown.length ? `<button class="btn quiet wide" data-act="msgall">Show ${all.length - shown.length} older</button>` : ''}</div>
    <p class="muted">Messages pop up while Minutes is open on a phone, and wait here with a badge until then.${staff.length ? ' To reach everyone right now, use <b>Email or share</b> on a notice.' : ''}</p>
  </div>`;
}

function viewThread() {
  const th = ui.thread || {};
  const t = state.teams[th.tid];
  const mayRead = t && me && (isStaff(t.id) || (th.fam === me.uid && isGuardian(t.id, me.uid)));
  if (!mayRead) { ui.view = 'inbox'; ui.thread = null; return viewInbox(); }
  const asStaff = isStaff(t.id) && th.fam !== me.uid;
  const kids = asStaff ? childrenOf(t.id, th.fam) : [];
  const coaches = staffNames(t.id);
  const head = asStaff
    ? `<b>${esc(familyName(th.fam))}</b><span class="rowsub">${kids.length ? 'Parent of ' + esc(kids.join(', ')) + ' · ' : ''}${teamLabel(t)}</span>`
    : `<b>Coaches of ${teamLabel(t)}</b><span class="rowsub">${coaches.length ? esc(coaches.join(', ')) : 'The team’s coaches'}</span>`;
  const draftKey = th.tid + '/' + th.fam;
  return `<div class="stack">
    <div class="row"><button class="btn quiet sm" data-act="inbox">‹ Messages</button></div>
    <div class="card">${head}</div>
    <div class="card"><div class="thread" id="thread">${threadHtml(t.id, th.fam)}</div>
      <textarea id="msgText" rows="3" maxlength="${MSG_MAX}" placeholder="Write a message" data-draft="${esc(draftKey)}">${esc((ui.msgDraft || {})[draftKey] || '')}</textarea>
      <div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn" data-act="msgsend" data-tid="${t.id}" data-fam="${esc(th.fam)}">Send</button></div></div>
    <p class="muted">Every coach of ${teamLabel(t)} and the club's admins can read this conversation — never one coach alone. Nobody can edit or delete a message once it is sent.</p>
  </div>`;
}
function threadHtml(tid, fam) {
  const l = threadMsgs(tid, fam);
  if (!l.length) return `<p class="muted" style="margin:0">No messages yet.</p>`;
  // "Seen" under my last message once anybody on the other side has opened it since
  const other = Object.entries(thread(tid, fam).seen || {}).filter(([u]) => u !== me.uid).map(([, v]) => v);
  const lastMine = [...l].reverse().find(x => x.by === me.uid && !x.status);
  const seenMine = lastMine && other.some(v => v >= (lastMine.at || 0));
  return l.map(x => `<div class="bubble${x.by === me.uid ? ' me' : ''}">
      ${x.by === me.uid ? '' : `<span class="bwho">${esc(x.byName || 'Someone')}</span>`}
      <span class="btext">${msgText(x.text)}</span>
      <span class="bwhen">${x.status === 'sending' ? 'Sending…' : x.status === 'refused'
      ? `Not sent · <button class="linkbtn" data-act="msgretry" data-id="${x.id}">Try again</button>` : esc(whenShort(x.at))}${x === lastMine && seenMine ? ' · Seen' : ''}</span></div>`).join('');
}

function sheetPost(tid, text = '', urgent = false) {
  const list = staffTeams();
  if (!list.length) return;
  if (!list.some(t => t.id === tid)) tid = (list.find(t => t.id === ui.teamId) || list[0]).id;
  ui.postTid = tid; ui.postUrgent = urgent;
  const n = families(tid).length;
  openSheet(`<h3>Post a notice</h3>
    ${list.length > 1 ? `<div class="field"><label>To</label>${pickOne('postteam', 'tid', tid, list.map(t => [t.id, teamLabel(t)]), '')}</div>` : ''}
    <p class="muted" style="margin-top:0">Goes to every family on <b>${teamLabel(state.teams[tid])}</b> (${n} with an account), and to its coaches and trackers.</p>
    <textarea id="postText" rows="5" maxlength="${MSG_MAX}" placeholder="Training moved to 6pm on Thursday — same pitch.">${esc(text)}</textarea>
    <div class="chips" style="margin:10px 0"><button class="chip" type="button" data-act="posturgent" aria-pressed="${urgent}">Urgent</button></div>
    <button class="btn wide" data-act="postsend">Post</button>
    <button class="btn quiet wide" data-act="closesheet">Cancel</button>`);
}

/* After posting, the honest part: only people with the page open got it just
   now. Email reaches the rest without a server — the club already holds every
   parent's address from their sign-in. */
function sheetPostShare(tid, id) {
  const x = notices(tid).find(n => n.id === id); if (!x) { closeSheet(); return; }
  const t = state.teams[tid] || {};
  const mails = guardianEmails(tid);
  const subject = `${t.name || 'Team'}${x.urgent ? ' — urgent' : ''}: message from ${x.byName || 'the coach'}`;
  const body = String(x.text || '').slice(0, 1500);
  const href = `mailto:?bcc=${encodeURIComponent(mails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  openSheet(`<h3>Reach everyone now</h3>
    <p class="muted" style="margin-top:0">Families with Minutes open have it already; everyone else sees it with a badge next time they open it. To get it to their phones now:</p>
    ${mails.length ? `<a class="btn wide" href="${esc(href)}" data-act="closesheet">Email the parents (${mails.length})</a>
      <p class="muted">Opens your email app with them in Bcc, so nobody sees anyone else's address.</p>`
      : `<p class="muted">No parent on this team has an account with an email address yet.</p>`}
    <button class="btn quiet wide" data-act="postsharetext" data-tid="${tid}" data-id="${id}">Share or copy the text</button>
    <button class="btn quiet wide" data-act="closesheet">Done</button>`);
}

function sheetPostSeen(tid, id) {
  const x = notices(tid).find(n => n.id === id); if (!x) return;
  const fam = families(tid);
  const yes = fam.filter(u => (x.seen || {})[u]), no = fam.filter(u => !(x.seen || {})[u]);
  const row = u => {
    const kids = childrenOf(tid, u);
    return `<div class="prow" style="grid-template-columns:1fr auto"><span><span class="pname">${esc(familyName(u))}</span>
      ${kids.length ? `<span class="rowsub">${esc(kids.join(', '))}</span>` : ''}</span>
      <span class="muted">${(x.seen || {})[u] ? esc(whenShort(x.seen[u])) : ''}</span></div>`;
  };
  openSheet(`<h3>Who has seen it</h3>
    <p class="muted" style="margin-top:0">Families whose parents have an account. A parent who only gets the email is not counted.</p>
    ${no.length ? `<h4>Not yet (${no.length})</h4><div class="plist">${no.map(row).join('')}</div>` : ''}
    ${yes.length ? `<h4>Seen (${yes.length})</h4><div class="plist">${yes.map(row).join('')}</div>` : ''}
    ${!fam.length ? '<p class="muted">No parent on this team has an account yet — invite them from People.</p>' : ''}
    <button class="btn quiet wide" data-act="closesheet">Done</button>`);
}

/* Draws what arrived without taking the reply box away from a thumb that is
   typing in it: a full render rewrites #app, and the keyboard closes. */
function msgPaint() {
  const a = typeof document !== 'undefined' ? document.activeElement : null;
  if (ui.view === 'thread' && ui.thread && a && a.id === 'msgText') {
    const el = $('#thread'); if (el) el.innerHTML = threadHtml(ui.thread.tid, ui.thread.fam);
    paintBell(); markSeen(); return;
  }
  render();
}
function paintBell(shut) {
  const n = shut ? 0 : unreadCount();
  const b = $('#inboxBtn');
  if (b) { b.hidden = !!shut || !msgOn(); b.dataset.n = n ? String(n) : ''; }
  const c = $('#inboxN'); if (c) c.textContent = n ? (n > 9 ? '9+' : String(n)) : '';
  if (typeof document !== 'undefined') document.title = (n ? `(${n}) ` : '') + 'Minutes — soccer sub tracker';
}

/* ---------------- the test club ---------------- */
/* A club of invented data, for rehearsing what is frightening to try on a real
   one: claiming admin, granting and withdrawing roles, the readiness check,
   locking down, being refused, retiring. Every name here is made up.

   It is seeded in the state a real club is in the moment its coaches have all
   signed in and nobody has been given a role yet — no admins, no index, people
   waiting in access/members. That is precisely where README's lockdown steps
   begin, so the rehearsal begins there too. */
const SANDBOX_NAMES = ['Ada', 'Bea', 'Cleo', 'Dara', 'Edie', 'Fern', 'Gia', 'Hana',
  'Ines', 'Juno', 'Kira', 'Lena', 'Mira', 'Nell', 'Orla', 'Posy'];

function sandboxTeam(id, name, n, from) {
  const players = {};
  for (let i = 0; i < n; i++) {
    const pid = id + '_p' + (i + 1);
    players[pid] = {
      id: pid, name: SANDBOX_NAMES[(from + i) % SANDBOX_NAMES.length],
      number: String(from + i + 2), active: true, anywhere: true,
      rating: 2 + (i % 4), gk: i === 0
    };
  }
  return { id, name, players };
}

/* Stints carry elapsed match seconds; periods carry epoch milliseconds. A
   period with no end is what makes a clock tick, because elapsedSec() reads
   `s.end || now` — so exactly one game is seeded that way, and the others are
   closed with every stint closed too, which is the shape endGame() leaves. */
function sandboxGame(t, o) {
  const len = o.periodMinutes * 60000, gap = 5 * 60000;
  const ids = Object.keys(t.players);
  const periods = {}, stints = {}, goals = {}, planned = {};
  const t0 = o.live ? nowMs() - ((o.periodCount - 1) * (len + gap) + 8 * 60000)
    : nowMs() - o.daysAgo * 86400000;
  for (let i = 0; i < o.periodCount; i++) {
    periods[i] = { half: i + 1, start: t0 + i * (len + gap) };
    if (!(o.live && i === o.periodCount - 1)) periods[i].end = periods[i].start + len;
  }
  // the same sum elapsedSec() does, so the seed and the clock cannot disagree
  const mark = Math.floor(Object.values(periods)
    .reduce((a, s) => a + ((s.end || nowMs()) - s.start), 0) / 1000);

  const onCount = Math.min(o.onFieldCount, ids.length);
  const starters = ids.slice(0, onCount), bench = ids.slice(onCount);
  for (const pid of starters) stints[uid()] = { pid, on: 0, slot: null, role: null };
  const subs = Math.min(bench.length, 4);
  for (let k = 0; k < subs; k++) {
    const at = Math.round(mark * (k + 1) / (subs + 2));
    const open = Object.values(stints).find(s => s.pid === starters[k] && s.off == null);
    if (open) open.off = at;
    stints[uid()] = { pid: bench[k], on: at, slot: null, role: null };
  }
  if (!o.live) for (const s of Object.values(stints)) if (s.off == null) s.off = mark;

  const total = o.us + o.them + 1;
  for (let k = 0; k < o.us; k++)
    goals[uid()] = { t: Math.round(mark * (k + 1) / total), side: 'us', pid: starters[(k + 1) % starters.length] };
  for (let k = 0; k < o.them; k++)
    goals[uid()] = { t: Math.round(mark * (o.us + k + 1) / total), side: 'them' };
  for (const pid of ids) planned[pid] = Math.round(o.periodCount * o.periodMinutes * onCount / ids.length);

  return {
    id: o.id, teamId: t.id, opponent: o.opponent,
    date: new Date(t0).toISOString().slice(0, 10), kickoff: '10:00', venue: 'Sandbox Park',
    periodCount: o.periodCount, periodMinutes: o.periodMinutes, onFieldCount: onCount,
    currentHalf: o.periodCount, periods, stints, goals, planned,
    ...(o.live ? {} : { ended: t0 + o.periodCount * (len + gap) })
  };
}

/* A season of calendar around the seeded games: practice twice a week either
   side of today, one of them called off, and a team photo marked for the
   share link — enough to see every state the calendar draws. */
function sandboxEvents(t) {
  const out = {}, today = todayStr(), series = 'sbs_' + t.id;
  seriesDates(addDays(today, -21), addDays(today, 35), [1, 3]).forEach((date, i) => {
    const id = t.id + '_e' + i;
    out[id] = { id, kind: 'practice', title: 'Practice', date, start: '18:00', end: '19:15', venue: 'Sandbox Park, field 2', series, createdAt: nowMs() };
  });
  const off = Object.values(out).find(e => e.date > addDays(today, 6));
  if (off) off.called = 'cancelled';
  out[t.id + '_photo'] = {
    id: t.id + '_photo', kind: 'event', title: 'Team photo', date: addDays(today, 10), start: '09:15',
    venue: 'Sandbox Park pavilion', notes: 'Full kit, hair tied back', public: true, createdAt: nowMs()
  };
  return out;
}

function seedSandbox() {
  const code = SANDBOX_PREFIX + uid();
  const a = sandboxTeam('sbA', 'Test Squad A', 14, 0);
  const b = sandboxTeam('sbB', 'Test Squad B', 9, 6);
  const teams = { [a.id]: a, [b.id]: b }, matches = {};
  for (const g of [
    sandboxGame(a, { id: 'sbg1', opponent: 'Riverside', daysAgo: 21, periodCount: 2, periodMinutes: 30, onFieldCount: 11, us: 3, them: 1 }),
    sandboxGame(a, { id: 'sbg2', opponent: 'Northgate', daysAgo: 7, periodCount: 2, periodMinutes: 30, onFieldCount: 11, us: 1, them: 2 }),
    sandboxGame(a, { id: 'sbg3', opponent: 'Hill End', live: true, periodCount: 2, periodMinutes: 30, onFieldCount: 11, us: 1, them: 1 }),
    sandboxGame(b, { id: 'sbg4', opponent: 'Lakeside B', daysAgo: 14, periodCount: 4, periodMinutes: 12, onFieldCount: 7, us: 2, them: 2 })
  ]) matches[g.id] = g;
  // one still to come, so the calendar has a next game with everything filled in
  matches.sbg5 = {
    id: 'sbg5', teamId: a.id, opponent: 'Eastfield', date: addDays(todayStr(), 5), kickoff: '10:00', arrive: '09:30',
    venue: 'Eastfield Rec, pitch 1', home: 'away', kit: 'Blue shirts, white socks', notes: 'Parking is behind the clubhouse',
    periodCount: 2, periodMinutes: 30, onFieldCount: 11, currentHalf: 1, periods: {}, stints: {}, planned: {}, createdAt: nowMs()
  };
  a.events = sandboxEvents(a);

  /* access/members is the knocking-on-the-door list and grants nothing on its
     own, so these invented accounts are people to practise assigning roles to
     and taking them off again, without any of them being able to reach
     anything even if the club were locked down around them. */
  const members = {};
  if (me) members[me.uid] = { name: me.name, email: me.email, at: nowMs() };
  [['Jaz Aldritt', 'jaz@example.test'], ['Sam Okoro', 'sam@example.test'], ['Wren Bailey', 'wren@example.test']]
    .forEach(([name, email], i) => { members['sbu' + (i + 1)] = { name, email, at: nowMs() - (i + 1) * 3600000 }; });

  const seeded = { teams, matches, access: { org: { name: 'Sandbox FC', sandbox: true }, members } };
  try {
    localStorage.setItem(LS_DATA + ':' + envPrefix() + code, JSON.stringify(seeded));
    localStorage.setItem(LS_WS, code);
  } catch (e) { toast('Could not create it — this device is out of storage'); return; }
  location.reload();
}

/* ---------------- bulk import ---------------- */
/* An admin setting a club up for a season has every team, every roster and the
   whole fixture list in a spreadsheet somewhere, and typing it in one sheet at a
   time is an evening. This takes it as one JSON file instead.

   Two decisions shape it. First, it merges and never replaces: a team is found
   by name, a player by name within the team, a game by team, date and opponent,
   and anything found is updated field by field while everything else in the
   club is left exactly as it was. That makes a second run of the same file a
   no-op rather than a second copy of the season, and it keeps the invariant the
   connect-time read keeps — a game tracked offline on this device must never be
   lost to somebody's import. Second, it is planned before it is applied: the
   plan is a list of writes plus what they mean in words, so the admin reads
   "adds 3 teams, 40 players, 28 games" and the problems line by line before a
   single write goes out, and the tests can check the plan without a database.

   A backup file (Setup → Backup) is recognised by its shape — `teams` and
   `matches` keyed by id — and goes through the same door: whatever it has that
   this club does not is added, and anything already here is kept as it is. */
const IMPORT_ROLES = {
  gk: 'GK', goalkeeper: 'GK', keeper: 'GK', goalie: 'GK',
  back: 'Back', defender: 'Back', defence: 'Back', defense: 'Back', def: 'Back', cb: 'Back', fullback: 'Back',
  mid: 'Mid', midfield: 'Mid', midfielder: 'Mid', cm: 'Mid',
  wing: 'Wing', winger: 'Wing', wide: 'Wing',
  forward: 'Forward', striker: 'Forward', attack: 'Forward', attacker: 'Forward', fwd: 'Forward', st: 'Forward'
};
const importRole = v => IMPORT_ROLES[String(v || '').trim().toLowerCase().replace(/[^a-z]/g, '')] || null;
const importKey = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const firstOf = (o, ...ks) => { for (const k of ks) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };

const IMPORT_EXAMPLE = {
  teams: [{
    name: 'Lakeside Thunder G12',
    birthYear: 2015,
    players: [
      { name: 'Ada Lovelace', number: 1, gk: true },
      { name: 'Bea Smith', number: 7, position: 'Forward', also: ['Wing'], rating: 4 },
      { name: 'Cleo Jones', number: 10, position: 'Mid', maxStint: 20, note: 'Strong left foot' }
    ],
    games: [
      { opponent: 'Riverside', date: '2026-09-06', kickoff: '10:00', venue: 'Lakeside Park', periods: 2, minutes: 30, side: 9, score: '3-1', scorers: [7, 7, 10] },
      { opponent: 'Northgate', date: '2026-10-04', kickoff: '09:30', venue: 'Northgate Rec, field 2', periods: 2, minutes: 30, side: 9, shape: '3-3-2' }
    ]
  }],
  fields: [{
    name: 'Lakeside Park', address: '1 Lake Rd', pitches: 2, surface: 'Grass', lights: true,
    permits: [{ days: ['Mon', 'Wed'], start: '16:00', end: '20:00', from: '2026-09-01', until: '2026-11-30', number: 'City parks #4471' }]
  }],
  /* "coach" is the name or email of a coach or admin here; left out, the
     session is whoever imports it. */
  sessions: [
    { type: '1-1', title: 'Finishing', date: '2026-10-05', start: '17:00', end: '18:00', field: 'Lakeside Park', price: 25, team: 'Lakeside Thunder G12', players: ['Bea Smith'] },
    { type: 'group', title: 'Keeper group', date: '2026-10-07', start: '16:30', end: '17:30', field: 'Lakeside Park', where: 'the goalmouth', spots: 4, ages: 'U10-U13', price: 15, open: true, weekly: { days: ['Wed'], until: '2026-11-25' }, focus: 'Handling and diving' }
  ]
};

/* Reads a score however a spreadsheet export is likely to write it. */
function importScore(v) {
  if (v === undefined || v === null || v === '') return null;
  let us, them;
  if (Array.isArray(v)) [us, them] = v;
  else if (typeof v === 'object') { us = firstOf(v, 'us', 'for'); them = firstOf(v, 'them', 'against'); }
  else { const x = String(v).match(/^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/); if (x) [, us, them] = x; }
  us = Number(us); them = Number(them);
  return Number.isInteger(us) && Number.isInteger(them) && us >= 0 && them >= 0 && us < 100 && them < 100 ? { us, them } : false;
}

/* Pure: reads `data` against the club as it stands and returns what importing
   it would do. Nothing in state changes until applyImport(). */
function importPlan(data, cur = state) {
  const out = { writes: [], sessWrites: [], trainWrites: [], errors: [], warnings: [], counts: { newTeams: 0, teams: 0, newPlayers: 0, players: 0, newGames: 0, games: 0, results: 0, newFields: 0, fields: 0, newSessions: 0, sessions: 0, bookings: 0, training: 0 } };
  const put = (path, value) => out.writes.push([path, value]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) { out.errors.push('The file should be one JSON object with a "teams", "fields" or "sessions" list in it.'); return out; }

  if (isBackupData(data)) return importBackup(data, cur, out);

  /* Drafts, not the live objects: updating an existing player or game below
     edits these copies, and state only changes when the writes are applied. */
  const acc0 = cur.access || {};
  cur = { teams: clone(cur.teams || {}), matches: clone(cur.matches || {}) };
  const fresh = new Set();
  const teamList = Array.isArray(data.teams) ? data.teams : [];
  const looseGames = Array.isArray(data.games) ? data.games : [];
  const training = ['fields', 'sessions'].some(k => data[k] !== undefined);
  if (!teamList.length && !looseGames.length && !training) { out.errors.push('Nothing to import: expected a "teams" list, and optionally "games", "fields" and "sessions" lists.'); return out; }

  // drafts of every team touched, so later rows in the file see earlier ones
  const byName = {};
  for (const t of Object.values(cur.teams || {})) if (t && t.name) byName[importKey(t.name)] = { t, isNew: false };
  const gameIndex = {};
  for (const m of Object.values(cur.matches || {})) if (m && m.teamId) gameIndex[[m.teamId, m.date || '', importKey(m.opponent)].join('|')] = m;

  const teamFor = (name, where, create) => {
    const k = importKey(name);
    if (!k) { out.errors.push(`${where}: a team needs a name.`); return null; }
    if (byName[k]) return byName[k];
    if (!create) { out.errors.push(`${where}: there is no team called "${name}" here or in the file.`); return null; }
    const id = uid();
    const t = { id, name: String(name).trim(), players: {} };
    put(`teams/${id}`, t);
    out.counts.newTeams++;
    return (byName[k] = { t, isNew: true, seenPlayers: {} });
  };

  const addPlayer = (entry, p, where) => {
    const t = entry.t;
    if (!p || typeof p !== 'object') { out.errors.push(`${where}: expected a player like {"name": "...", "number": 7}.`); return; }
    const name = String(firstOf(p, 'name') ?? '').trim();
    if (!name) { out.errors.push(`${where}: a player needs a name.`); return; }
    const fields = {};
    const num = firstOf(p, 'number', 'shirt', 'no');
    if (num !== undefined) fields.number = String(num).trim();
    const gk = firstOf(p, 'gk', 'keeper', 'goalkeeper');
    if (gk !== undefined) fields.gk = gk === true || /^(y|yes|true|1)$/i.test(String(gk));
    const pos = firstOf(p, 'position', 'preferred');
    if (pos !== undefined) {
      const r = importRole(pos);
      if (r) fields.preferred = r; else out.warnings.push(`${where} (${name}): "${pos}" is not a position here (GK, Back, Mid, Wing, Forward), so it was left out.`);
    }
    const also = firstOf(p, 'also', 'canPlay');
    if (also !== undefined) {
      const list = (Array.isArray(also) ? also : String(also).split(/[,/;]/)).map(x => String(x).trim()).filter(Boolean);
      const ok = list.map(importRole).filter(Boolean);
      if (ok.length < list.length) out.warnings.push(`${where} (${name}): some of "${list.join(', ')}" are not positions here, so they were left out.`);
      fields.canPlay = [...new Set(ok)];
    }
    const rt = firstOf(p, 'rating');
    if (rt !== undefined) {
      const n = Number(rt);
      if (Number.isInteger(n) && n >= 1 && n <= 5) fields.rating = n;
      else out.warnings.push(`${where} (${name}): rating ${JSON.stringify(rt)} is not 1 to 5, so it was left out.`);
    }
    const ms = firstOf(p, 'maxStint', 'longestStint');
    if (ms !== undefined) {
      const n = Number(ms);
      if (n > 0) fields.maxStint = n; else out.warnings.push(`${where} (${name}): longest stint ${JSON.stringify(ms)} is not a number of minutes, so it was left out.`);
    }
    const note = firstOf(p, 'note', 'notes');
    if (note !== undefined) fields.note = String(note).trim();
    const act = firstOf(p, 'active');
    if (act !== undefined) fields.active = !(act === false || /^(n|no|false|0)$/i.test(String(act)));

    // the same player twice in one file merges into the first, as it would on a second run
    const k = importKey(name);
    const found = Object.values(t.players || {}).find(x => importKey(x.name) === k);
    if (found) {
      const changed = Object.entries(fields).filter(([f, v]) => JSON.stringify(found[f]) !== JSON.stringify(v));
      if (!changed.length) return;
      for (const [f, v] of changed) { found[f] = v; if (!entry.isNew) put(`teams/${t.id}/players/${found.id}/${f}`, v); }
      if (!entry.isNew && !(entry.seenPlayers = entry.seenPlayers || {})[found.id]) { entry.seenPlayers[found.id] = true; out.counts.players++; }
      return;
    }
    const id = uid();
    const pl = { id, name, number: '', active: true, anywhere: true, preferred: '', canPlay: [], rating: 3, ...fields };
    t.players = t.players || {};
    t.players[id] = pl;
    // a brand-new team is written whole once below, so its players ride along with it
    if (!entry.isNew) put(`teams/${t.id}/players/${id}`, pl);
    (entry.seenPlayers = entry.seenPlayers || {})[id] = true;
    out.counts.newPlayers++;
  };

  const addGame = (entry, g, where) => {
    const t = entry.t;
    if (!g || typeof g !== 'object') { out.errors.push(`${where}: expected a game like {"opponent": "...", "date": "2026-10-04"}.`); return; }
    const opponent = String(firstOf(g, 'opponent', 'vs', 'against') ?? '').trim();
    if (!opponent) { out.errors.push(`${where}: a game needs an opponent.`); return; }
    const label = `${where} (${opponent})`;
    const date = String(firstOf(g, 'date') ?? '').trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { out.errors.push(`${label}: date "${date}" should be written 2026-10-04.`); return; }
    const kickoff = String(firstOf(g, 'kickoff', 'time') ?? '').trim();
    if (kickoff && !/^\d{1,2}:\d{2}$/.test(kickoff)) { out.errors.push(`${label}: kick-off "${kickoff}" should be written 09:30.`); return; }
    const fields = { opponent };
    if (date) fields.date = date;
    if (kickoff) fields.kickoff = kickoff.padStart(5, '0');
    const venue = firstOf(g, 'venue', 'where', 'location');
    if (venue !== undefined) fields.venue = String(venue).trim();
    const pc = firstOf(g, 'periods', 'periodCount');
    if (pc !== undefined) {
      if (Number(pc) === 2 || Number(pc) === 4) fields.periodCount = Number(pc);
      else out.warnings.push(`${label}: ${pc} periods is not 2 halves or 4 quarters, so it was left at the default.`);
    }
    const len = firstOf(g, 'minutes', 'periodMinutes');
    if (len !== undefined) {
      if (Number(len) > 0 && Number(len) <= 60) fields.periodMinutes = Number(len);
      else out.warnings.push(`${label}: ${len} minutes a period does not look right, so it was left at the default.`);
    }
    const side = firstOf(g, 'side', 'onFieldCount', 'players');
    if (side !== undefined) {
      if ([5, 7, 9, 11].includes(Number(side))) fields.onFieldCount = Number(side);
      else out.warnings.push(`${label}: ${side}-a-side is not 5, 7, 9 or 11, so it was left at the default.`);
    }
    const veo = firstOf(g, 'veo', 'veoUrl');
    if (veo !== undefined) fields.veoUrl = String(veo).trim();
    const sc = importScore(firstOf(g, 'score', 'result'));
    if (sc === false) out.warnings.push(`${label}: score ${JSON.stringify(firstOf(g, 'score', 'result'))} should be written "3-1", so it was left out.`);

    const key = [t.id, date, importKey(opponent)].join('|');
    const existing = gameIndex[key];
    if (existing) {
      const changed = Object.entries(fields).filter(([f, v]) => existing[f] !== v);
      const isFresh = fresh.has(existing.id);
      for (const [f, v] of changed) { existing[f] = v; if (!isFresh) put(`matches/${existing.id}/${f}`, v); }
      if (changed.length && !isFresh) out.counts.games++;
      if (sc && !isFresh) {
        const now = score(existing);
        if (now.us !== sc.us || now.them !== sc.them)
          out.warnings.push(`${label}: this game already has goals recorded here (${now.us}-${now.them}), so the ${sc.us}-${sc.them} in the file was not added on top.`);
      }
      if (isFresh) out.warnings.push(`${label}: appears twice in the file, so it was imported once.`);
      return;
    }

    const size = fields.onFieldCount || 11;
    const shape = firstOf(g, 'shape', 'formation');
    let formation;
    if (shape !== undefined) {
      const k = String(shape).trim();
      const f = Object.values(t.formations || {}).find(x => importKey(x.name) === importKey(k) && x.size === size);
      formation = f ? resolveShape(t, 'team:' + f.id, size)
        : presetsFor(size)[k] ? resolveShape(t, `preset:${size}:${k}`, size) : undefined;
      if (formation === undefined) out.warnings.push(`${label}: there is no "${k}" shape for ${size} v ${size}, so it gets the team default.`);
    }
    if (formation === undefined) formation = resolveShape(t, 'auto', size);

    const id = uid();
    const m = {
      id, teamId: t.id, currentHalf: 1, periods: {}, planned: {}, positions: {}, stints: {}, createdAt: Date.now(),
      periodCount: 2, periodMinutes: 40, onFieldCount: size, kickoff: '', venue: '', veoUrl: '', date: '',
      ...fields, formation
    };
    /* A result from before the app was in use has no minutes to go with it, only
       a score. It is written as goals at 0:00 and a finished game, so the season
       record adds up; there is no clock to close because none was ever started.
       Scorers are matched by shirt number or name, and anyone not found is still
       a goal, just not credited. */
    if (sc) {
      const scorers = firstOf(g, 'scorers', 'goals');
      const list = Array.isArray(scorers) ? scorers : scorers !== undefined ? String(scorers).split(/[,;]/) : [];
      const roster = Object.values(t.players || {});
      m.goals = {};
      for (let i = 0; i < sc.us; i++) {
        const who = list[i] !== undefined ? String(list[i]).trim() : '';
        const p = who ? roster.find(x => String(x.number ?? '').trim() === who) || roster.find(x => importKey(x.name) === importKey(who)) : null;
        if (who && !p) out.warnings.push(`${label}: scorer "${who}" is not on the roster, so that goal is not credited to anyone.`);
        m.goals[uid()] = { t: 0, side: 'us', ...(p ? { pid: p.id } : {}) };
      }
      if (list.length > sc.us) out.warnings.push(`${label}: ${list.length} scorers for ${sc.us} goals; the extra ones were left out.`);
      for (let i = 0; i < sc.them; i++) m.goals[uid()] = { t: 0, side: 'them' };
      m.currentHalf = m.periodCount;
      m.ended = (date ? Date.parse(date + 'T' + (m.kickoff || '12:00') + ':00') : NaN) || Date.now();
      out.counts.results++;
    }
    if (!date) out.warnings.push(`${label}: no date, so it will sort as undated until one is set.`);
    fresh.add(id);
    gameIndex[key] = m;
    put(`matches/${id}`, m);
    out.counts.newGames++;
  };

  teamList.forEach((tt, i) => {
    const where = `Team ${i + 1}`;
    if (!tt || typeof tt !== 'object') { out.errors.push(`${where}: expected a team like {"name": "...", "players": [...]}.`); return; }
    const entry = teamFor(tt.name, where, true); if (!entry) return;
    const w = `${entry.t.name}`;
    /* The age group, as a birth year. A team already here keeps the one it
       has: the import fills gaps, it doesn't overrule what a coach set. */
    const by = firstOf(tt, 'birthYear', 'born');
    if (by !== undefined && by !== null && by !== '') {
      const n = Number(by);
      if (uAge(n) == null) out.warnings.push(`${w}: birth year ${JSON.stringify(by)} doesn't look like a year, so it was left out.`);
      else if (entry.isNew) entry.t.birthYear = n;
      else if (!entry.t.birthYear) { entry.t.birthYear = n; put(`teams/${entry.t.id}/birthYear`, n); out.counts.teams++; }
      else if (Number(entry.t.birthYear) !== n) out.warnings.push(`${w}: already born ${entry.t.birthYear} here, so ${n} was left out.`);
    }
    if (tt.players !== undefined && !Array.isArray(tt.players)) out.errors.push(`${w}: "players" should be a list.`);
    else (tt.players || []).forEach((p, j) => addPlayer(entry, p, `${w}, player ${j + 1}`));
    if (tt.games !== undefined && !Array.isArray(tt.games)) out.errors.push(`${w}: "games" should be a list.`);
    else (tt.games || []).forEach((g, j) => addGame(entry, g, `${w}, game ${j + 1}`));
  });
  looseGames.forEach((g, j) => {
    const where = `Game ${j + 1}`;
    const entry = teamFor(g && g.team, where, false); if (!entry) return;
    addGame(entry, g, where);
  });

  // after the teams, so a session can book a player the same file has just added
  importTraining(data, out, byName, acc0);

  /* A new team's write holds the draft object itself, so the players gathered
     into it after it was queued go out with it in the one write. */
  return out;
}

/* ---- the backup, training included ---- */
/* A backup used to be `state`: teams, games, roles and fields. Everything that
   lives outside the workspace (training sessions with their bookings,
   registers and fees, pay rates, practice plans, the club's drills) was left
   out, so a club keeping the file for safety would have lost its fee records
   without knowing. It now carries them under `training`, as completely as
   this phone can get them: its own copy, laid over the club's wherever the
   club could be asked, and the download says if some of it could not be. */
let lastBackup = null;     // the last download's contents, for the tests and for nothing else
const TRAIN_KINDS = [['sessions', 1], ['booked', 2], ['came', 1], ['fees', 2], ['pay', 1], ['splans', 1]];
const isBackupData = data => !!(data && data.teams && !Array.isArray(data.teams) && typeof data.teams === 'object'
  && (data.matches === undefined || (typeof data.matches === 'object' && !Array.isArray(data.matches))));
function fetchOnce(path, ms = 6000) {
  return new Promise(res => {
    let done = false;
    const fin = r => { if (!done) { done = true; res(r); } };
    if (!rtdb) { fin({ ok: false }); return; }
    try { rtdb.mod.onValue(rtdb.mod.ref(rtdb.db, path), s => fin({ ok: true, v: s.val() }), () => fin({ ok: false }), { onlyOnce: true }); }
    catch (e) { fin({ ok: false }); }
    setTimeout(() => fin({ ok: false }), ms);
  });
}
// records from two copies, `depth` levels down; the second wins where both have one
function overlayRecords(a, b, depth) {
  const out = a && typeof a === 'object' ? clone(a) : {};
  for (const [k, v] of Object.entries(b && typeof b === 'object' ? b : {}))
    out[k] = depth <= 1 ? clone(v) : overlayRecords(out[k], v, depth - 1);
  return out;
}
/* This phone's training records, laid over the club's where it could ask.
   `known` is what the club said it has, path by path; `missed` names the
   paths it could not ask about (no signal, or rules that refuse). With no
   database at all, this phone's copy is the club's, and `known` is null. */
async function trainingCopy(extra = {}) {
  const T = { practices: clone(train.practices || {}), drills: clone(SHELF.club.store().items || {}) };
  for (const [k] of TRAIN_KINDS) T[k] = clone(sess[k] || {});
  const missed = new Set(), known = {};
  if (!(fb && rtdb && me && wsCode())) return { T, missed, known: null };
  const base = `training/${wsCode()}/`;
  const sids = new Set([...Object.keys(T.sessions), ...(extra.sids || [])]);
  const tids = new Set([...teams().map(t => t.id), ...(extra.tids || [])]);
  // splans has no read on the whole, so one per session; practices one per team, as their rules sit
  const jobs = TRAIN_KINDS.filter(([k]) => k !== 'splans').map(([k, d]) => [k, d]);
  for (const sid of sids) jobs.push(['splans/' + sid, 0]);
  for (const tid of tids) jobs.push(['practices/' + tid, 1]);
  jobs.push(['drills', 1]);
  const res = await Promise.all(jobs.map(([key]) => fetchOnce(base + key)));
  jobs.forEach(([key, depth], i) => {
    const r = res[i];
    if (!r.ok) { missed.add(key); return; }
    known[key] = r.v == null ? null : r.v;
    const local = getDeep(T, key);
    const merged = depth === 0 ? (local !== undefined ? local : r.v) : overlayRecords(r.v, local, depth);
    if (merged != null && (depth === 0 || Object.keys(merged).length)) setDeep(T, key, merged);
  });
  return { T, missed, known };
}
async function backupDoc() {
  const { T, missed } = await trainingCopy();
  return { doc: { ...clone(state), training: T, savedAt: nowMs(), build: BUILD }, missed };
}

/* Restoring it: like teams and games, only what the club is missing, and
   never on top of something the club has. A training record this phone could
   not check against the club is not restored at all, and the check says so:
   writing it blind could put last month's copy over this week's. */
function restoreTraining(T, cur, out) {
  if (!T || typeof T !== 'object') return;
  const tk = cur.trainingKnown;
  const coverOf = path => {
    const s = path.split('/');
    if (s[0] === 'splans') return ['splans/' + s[1], s.slice(2)];
    if (s[0] === 'practices') return ['practices/' + s[1], s.slice(2)];
    return [s[0], s.slice(1)];
  };
  // true, false, or null for "could not be checked"
  const has = path => {
    const local = path.startsWith('practices/') ? getDeep(train, path) : path.startsWith('drills/') ? getDeep(SHELF.club.store().items, path.slice(7)) : getDeep(sess, path);
    if (local !== undefined) return true;
    if (!fb) return false;
    if (!tk || !tk.known) return null;
    const [key, rest] = coverOf(path);
    if (tk.missed.has(key) || !Object.prototype.hasOwnProperty.call(tk.known, key)) return null;
    const v = tk.known[key];
    return (rest.length ? getDeep(v || {}, rest.join('/')) : v) != null;
  };
  let unknown = 0;
  const leaves = (v, prefix, left, out2) => {
    if (left <= 0) { if (v != null) out2.push([prefix, v]); return out2; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (/^[\w-]+$/.test(k)) leaves(x, prefix + '/' + k, left - 1, out2);
    return out2;
  };
  // sessions first: the rules that let bookings, registers and fees be written find the coach through the session
  for (const [kind, depth] of TRAIN_KINDS) {
    for (const [p, v] of leaves(T[kind], kind, depth, [])) {
      if (kind === 'sessions' && !(v && v.id === p.split('/')[1] && okDay(v.date) && v.coach)) continue;
      const h = has(p);
      if (h === null) { unknown++; continue; }
      if (h) continue;
      out.sessWrites.push([p, clone(v)]); out.counts.training++;
    }
  }
  for (const [p, v] of leaves(T.practices, 'practices', 2, [])) {
    const [, tid, pid] = p.split('/');
    if (!(cur.teams || {})[tid]) continue;
    const h = has(p);
    if (h === null) { unknown++; continue; }
    if (h || !v || typeof v !== 'object' || !okDay(v.date)) continue;
    out.trainWrites.push(['practice', { ...clone(v), id: pid, teamId: tid }]); out.counts.training++;
  }
  for (const [p, v] of leaves(T.drills, 'drills', 1, [])) {
    const h = has(p);
    if (h === null) { unknown++; continue; }
    if (h || !v || typeof v !== 'object' || !v.name) continue;
    out.trainWrites.push(['drill', { ...clone(v), id: p.slice(7) }]); out.counts.training++;
  }
  if (unknown) out.warnings.push(`${unknown} training record${unknown === 1 ? ' was' : 's were'} not restored, because this phone could not check whether the club already has ${unknown === 1 ? 'it' : 'them'}. Try again with a signal, signed in as an admin.`);
}

function importBackup(data, cur, out) {
  for (const [tid, t] of Object.entries(data.teams || {})) {
    if (!t || typeof t !== 'object' || !/^[\w-]+$/.test(tid)) { out.errors.push(`Team "${tid}" in the backup could not be read.`); continue; }
    if ((cur.teams || {})[tid]) { out.warnings.push(`${t.name || tid} is already here, so this club's copy was kept.`); continue; }
    out.writes.push([`teams/${tid}`, { ...clone(t), id: tid }]);
    out.counts.newTeams++;
    out.counts.newPlayers += Object.keys(t.players || {}).length;
  }
  let kept = 0;
  for (const [mid, m] of Object.entries(data.matches || {})) {
    if (!m || typeof m !== 'object' || !/^[\w-]+$/.test(mid)) { out.errors.push(`Game "${mid}" in the backup could not be read.`); continue; }
    if ((cur.matches || {})[mid]) { kept++; continue; }
    if (!(cur.teams || {})[m.teamId] && !(data.teams || {})[m.teamId]) { out.warnings.push(`A game against ${m.opponent || 'someone'} belongs to a team that is in neither the backup nor this club, so it was left out.`); continue; }
    out.writes.push([`matches/${mid}`, { ...clone(m), id: mid }]);
    out.counts.newGames++;
  }
  if (kept) out.warnings.push(`${kept} game${kept === 1 ? ' is' : 's are'} already here, so this club's cop${kept === 1 ? 'y was' : 'ies were'} kept.`);
  // fields the club doesn't have, by id or by name; one it has keeps the club's copy
  const have = ((cur.access || {}).org || {}).venues || {};
  const names = new Set(Object.values(have).map(f => importKey(f && f.name)));
  for (const [id, f] of Object.entries((((data.access || {}).org || {}).venues) || {})) {
    if (!f || typeof f !== 'object' || !f.name || !/^[\w-]+$/.test(id) || have[id] || names.has(importKey(f.name))) continue;
    out.writes.push([`access/org/venues/${id}`, { ...clone(f), id }]);
    out.counts.newFields++;
  }
  restoreTraining(data.training, cur, out);
  out.backup = true;
  return out;
}

/* ---- fields and training sessions, in the same file ---- */
/* The same promises as the rest of the importer: matched against what is
   already here, so running a file twice changes nothing; nothing here is ever
   removed; and every write sits where its rule does. A field is matched by
   name and updated in place, and its permits are only ever added to. A session
   is matched by date, start and coach, so a re-run updates it rather than
   making a second; a booking that is already here, whatever the coach made of
   it, is left as it is. Fields are club settings and go out with the rest of
   the workspace writes; sessions and bookings go to training/{code} through
   the session store, so they get its merge-on-read and its resend. */
const IMPORT_DAYS = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
function importDays(v) {
  if (v === undefined || v === null || v === '') return { days: [], bad: [] };
  // split before lowering, so a day it cannot read is quoted back as it was typed
  const raw = Array.isArray(v) ? v.map(String) : String(v).replace(/every ?day/gi, 'daily').split(/[\s,;/&+]+/);
  const out = new Set(), bad = [];
  for (const w0 of raw) {
    const w = String(w0).trim().toLowerCase();
    if (!w || w === 'and') continue;
    if (w === 'weekdays') [0, 1, 2, 3, 4].forEach(d => out.add(d));
    else if (w === 'weekends') [5, 6].forEach(d => out.add(d));
    else if (w === 'daily') [0, 1, 2, 3, 4, 5, 6].forEach(d => out.add(d));
    else if (IMPORT_DAYS[w.slice(0, 3)] !== undefined) out.add(IMPORT_DAYS[w.slice(0, 3)]);
    else bad.push(w0);
  }
  return { days: [...out].sort(), bad };
}
/* "17:30", "5:30pm" or "5pm". A bare "17" is not a time: it is as likely to be
   a number of minutes. */
function importTime(v) {
  const x = String(v ?? '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!x || (x[2] === undefined && !x[3])) return null;
  let h = Number(x[1]); const m = Number(x[2] || 0);
  if (x[3]) { if (h < 1 || h > 12) return null; h = h % 12 + (x[3] === 'pm' ? 12 : 0); }
  return h <= 23 && m <= 59 ? pad2(h) + ':' + pad2(m) : null;
}
const importDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? String(v).trim() : null);
const importBool = (v, dflt) => (v === undefined || v === null || v === '' ? dflt : !(v === false || /^(n|no|false|0|off)$/i.test(String(v).trim())));
function importMoney(v) {
  if (v === undefined || v === null || v === '' || /^free$/i.test(String(v).trim())) return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n >= 0 && String(v).replace(/[^0-9.]/g, '') !== '' ? Math.round(n * 100) / 100 : null;
}
// "U10-U12", "U11", "10–12", [10, 12] or "any"
function importAges(v) {
  if (v === undefined || v === null || v === '' || /^any$/i.test(String(v).trim())) return { ages: null };
  const ns = (Array.isArray(v) ? v : String(v).match(/\d+/g) || []).map(Number);
  if (!ns.length || ns.length > 2 || ns.some(n => !Number.isInteger(n) || n < 4 || n > 19)) return { bad: true };
  return { ages: [Math.min(...ns), Math.max(...ns)] };
}
const importKind = v => {
  const k = String(v ?? '').trim().toLowerCase();
  if (!k) return '';
  if (/^(1|one|1-1|1:1|1 ?on ?1|1v1|one ?to ?one|one ?on ?one|private|individual|solo)$/.test(k)) return 'one';
  if (/group|clinic|small/.test(k)) return 'group';
  return null;
};
// a permit's identity, so a second run adds no copy of one already listed
const permitKey = p => [[...(p.days || [])].sort().join(','), p.start || '', p.end || '', p.from || '', p.until || ''].join('|');

function importPermit(p, label, out) {
  if (!p || typeof p !== 'object') { out.errors.push(`${label}: expected a permit like {"days": ["Mon", "Wed"], "start": "16:00", "end": "20:00"}.`); return null; }
  const d = importDays(firstOf(p, 'days', 'day'));
  if (d.bad.length) { out.errors.push(`${label}: "${d.bad.join(', ')}" ${d.bad.length === 1 ? 'is not a day' : 'are not days'} (Mon, Tue, … or weekdays).`); return null; }
  if (!d.days.length) { out.errors.push(`${label}: a permit needs the days it covers.`); return null; }
  // "from" and "to" are read as times or as dates, whichever they look like
  const pick = (...ks) => { for (const k of ks) { const v = p[k]; if (v !== undefined && v !== null && v !== '') return String(v).trim(); } return ''; };
  const looseFrom = pick('from'), looseTo = pick('to');
  const st = pick('start', 'opens') || (importTime(looseFrom) ? looseFrom : '');
  const en = pick('end', 'closes') || (importTime(looseTo) ? looseTo : '');
  const df = pick('starting', 'startDate', 'validFrom') || (importDate(looseFrom) ? looseFrom : '');
  const du = pick('ending', 'until', 'endDate', 'validUntil') || (importDate(looseTo) ? looseTo : '');
  const start = st ? importTime(st) : '', end = en ? importTime(en) : '';
  if (start === null || end === null) { out.errors.push(`${label}: "${start === null ? st : en}" should be a time like 16:00 or 4pm.`); return null; }
  if (!!start !== !!end) { out.errors.push(`${label}: give both a start and an end time, or neither for the whole day.`); return null; }
  if (start && minOf(end) <= minOf(start)) { out.errors.push(`${label}: it ends at ${end}, before it starts at ${start}.`); return null; }
  const from = df ? importDate(df) : '', until = du ? importDate(du) : '';
  if (from === null || until === null) { out.errors.push(`${label}: "${from === null ? df : du}" should be a date like 2026-09-01.`); return null; }
  if (from && until && until < from) { out.errors.push(`${label}: it ends on ${until}, before it starts on ${from}.`); return null; }
  return { days: d.days, start, end, from, until,
    ref: String(firstOf(p, 'number', 'ref', 'permit') ?? '').trim().slice(0, 60), note: String(firstOf(p, 'note', 'notes') ?? '').trim().slice(0, 120) };
}

function importTraining(data, out, byName, acc0) {
  const put = (p, v) => out.writes.push([p, v]);
  const sput = (p, v) => out.sessWrites.push([p, v]);

  /* -- fields -- */
  const venues = clone((acc0.org || {}).venues || {});
  const fieldByName = {};
  for (const f of Object.values(venues)) if (f && f.id && f.name) fieldByName[importKey(f.name)] = { f, isNew: false };
  if (data.fields !== undefined && !Array.isArray(data.fields)) out.errors.push('"fields" should be a list.');
  else (data.fields || []).forEach((x, i) => {
    const where = `Field ${i + 1}`;
    if (!x || typeof x !== 'object') { out.errors.push(`${where}: expected a field like {"name": "Lakeside Park", "permits": [...]}.`); return; }
    const name = String(firstOf(x, 'name') ?? '').trim().slice(0, 80);
    if (!name) { out.errors.push(`${where}: a field needs a name.`); return; }
    const label = `${where} (${name})`;
    const fields = {};
    const addr = firstOf(x, 'address');
    if (addr !== undefined) fields.address = String(addr).trim().slice(0, 160);
    const pc = firstOf(x, 'pitches');
    if (pc !== undefined) {
      const n = Number(pc);
      if (Number.isInteger(n) && n >= 1 && n <= 20) fields.pitches = n;
      else out.warnings.push(`${label}: ${JSON.stringify(pc)} pitches is not 1 to 20, so it was left out.`);
    }
    const sf = firstOf(x, 'surface');
    if (sf !== undefined) { const v = String(sf).trim(); fields.surface = ['Grass', 'Turf', 'Indoor'].find(s => s.toLowerCase() === v.toLowerCase()) || v.slice(0, 20); }
    const li = firstOf(x, 'lights');
    if (li !== undefined) fields.lights = importBool(li, false);
    const nt = firstOf(x, 'notes', 'note');
    if (nt !== undefined) fields.notes = String(nt).trim().slice(0, 1000);
    const pin = firstOf(x, 'permits', 'permit');
    const permits = [];
    if (pin !== undefined && !Array.isArray(pin)) out.errors.push(`${label}: "permits" should be a list.`);
    else (pin || []).forEach((p, j) => { const pm = importPermit(p, `${label}, permit ${j + 1}`, out); if (pm) permits.push(pm); });

    const k = importKey(name), had = fieldByName[k];
    if (had && had.isNew) { out.warnings.push(`${label}: appears twice in the file, so it was imported once.`); return; }
    if (had) {
      const f = had.f;
      let changed = false;
      for (const [fk, v] of Object.entries(fields)) if (JSON.stringify(f[fk]) !== JSON.stringify(v)) { f[fk] = v; put(`access/org/venues/${f.id}/${fk}`, v); changed = true; }
      const have = new Set(permitsOf(f).map(permitKey));
      for (const pm of permits) {
        if (have.has(permitKey(pm))) continue;
        const pid = uid(); have.add(permitKey(pm));
        (f.permits = f.permits || {})[pid] = { id: pid, ...pm };
        put(`access/org/venues/${f.id}/permits/${pid}`, { id: pid, ...pm });
        changed = true;
      }
      if (changed) out.counts.fields++;
      return;
    }
    const id = uid(), pms = {};
    const seen = new Set();
    for (const pm of permits) { if (seen.has(permitKey(pm))) continue; seen.add(permitKey(pm)); const pid = uid(); pms[pid] = { id: pid, ...pm }; }
    const f = { id, name, address: '', pitches: 1, surface: '', lights: false, notes: '', ...fields, permits: pms };
    put(`access/org/venues/${id}`, f);
    fieldByName[k] = { f, isNew: true };
    out.counts.newFields++;
  });

  /* -- sessions -- */
  if (data.sessions !== undefined && !Array.isArray(data.sessions)) { out.errors.push('"sessions" should be a list.'); return; }
  const members_ = acc0.members || {};
  const staff = new Set([...Object.values(acc0.teams || {}).flatMap(ta => Object.keys((ta || {}).coaches || {})), ...Object.keys(acc0.admins || {})]);
  let defaulted = false;     // said only for a session actually added, so a second run is quiet
  const coachFor = (v, label) => {
    if (v === undefined || v === null || String(v).trim() === '' || /^(me|mine)$/i.test(String(v).trim())) {
      if (me) { defaulted = v === undefined || v === null || String(v).trim() === ''; return me.uid; }
      out.errors.push(`${label}: a session needs a coach: the name or email of a coach or admin here.`); return null;
    }
    const k = importKey(v);
    const hits = [...staff].filter(u => u === String(v).trim() || importKey((members_[u] || {}).name) === k || importKey((members_[u] || {}).email) === k);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) { out.errors.push(`${label}: more than one coach is called "${v}", so give an email instead.`); return null; }
    const names = [...staff].map(u => (members_[u] || {}).name).filter(Boolean);
    out.errors.push(`${label}: no coach or admin called "${v}" here${names.length ? ` (there are ${names.slice(0, 8).join(', ')})` : ''}. A coach has to have signed in once to be found.`);
    return null;
  };
  const playerFor = (spec, teamName, label) => {
    const o = spec && typeof spec === 'object' ? spec : { [typeof spec === 'number' || /^\d+$/.test(String(spec).trim()) ? 'number' : 'name']: spec };
    const tn = firstOf(o, 'team') ?? teamName;
    const num = firstOf(o, 'number', 'shirt', 'no');
    const nm = firstOf(o, 'name');
    const what = nm !== undefined ? `"${nm}"` : `number ${num}`;
    const inTeam = t => Object.values(t.players || {}).filter(p => (nm !== undefined ? importKey(p.name) === importKey(nm) : String(p.number ?? '').trim() === String(num).trim()));
    if (nm === undefined && num === undefined) { out.errors.push(`${label}: a player needs a name or a shirt number.`); return null; }
    if (tn !== undefined && tn !== null && String(tn).trim()) {
      const e = byName[importKey(tn)];
      if (!e) { out.errors.push(`${label}: there is no team called "${tn}" here or in the file.`); return null; }
      const hit = inTeam(e.t);
      if (hit.length === 1) return { t: e.t, p: hit[0] };
      out.errors.push(hit.length ? `${label}: two players on ${e.t.name} match ${what}.` : `${label}: nobody on ${e.t.name} matches ${what}.`);
      return null;
    }
    if (nm === undefined) { out.errors.push(`${label}: a shirt number needs a team to look in ("team": "...").`); return null; }
    const hits = Object.values(byName).flatMap(e => inTeam(e.t).map(p => ({ t: e.t, p })));
    if (hits.length === 1) return hits[0];
    out.errors.push(hits.length ? `${label}: more than one player is called ${what}, so say which team ("team": "...").` : `${label}: nobody in the club is called ${what}.`);
    return null;
  };

  const known = {};      // date|start|coach -> { id, raw, fresh }
  for (const s of sessAll()) known[[s.date, s.start, s.coach].join('|')] = { id: s.id, raw: (sess.sessions || {})[s.id], fresh: false };
  const ins = {};        // sid -> places given, so a file cannot overfill a session
  const by = (me && me.uid) || 'import';

  (data.sessions || []).forEach((x, i) => {
    const where = `Session ${i + 1}`;
    if (!x || typeof x !== 'object') { out.errors.push(`${where}: expected a session like {"date": "2026-10-06", "start": "17:00", "end": "18:00", "coach": "..."}.`); return; }
    const title = String(firstOf(x, 'title', 'name', 'what') ?? '').trim().slice(0, 80);
    const label = `${where}${title ? ` (${title})` : ''}`;
    const errs = out.errors.length;
    defaulted = false;
    const date = importDate(firstOf(x, 'date'));
    if (!date) out.errors.push(`${label}: date ${JSON.stringify(firstOf(x, 'date') ?? '')} should be written 2026-10-06.`);
    const st0 = firstOf(x, 'start', 'time', 'from'), en0 = firstOf(x, 'end', 'until', 'to');
    const start = importTime(st0), end = importTime(en0);
    if (!start || !end) out.errors.push(`${label}: needs a start and an end, like "17:00" and "18:00".`);
    else if (minOf(end) <= minOf(start)) out.errors.push(`${label}: it ends at ${end}, before it starts at ${start}.`);
    const kind0 = importKind(firstOf(x, 'type', 'kind'));
    if (kind0 === null) out.errors.push(`${label}: type ${JSON.stringify(firstOf(x, 'type', 'kind'))} should be "1-1" or "group".`);
    const coach = coachFor(firstOf(x, 'coach', 'runBy', 'trainer'), label);
    const ag = importAges(firstOf(x, 'ages', 'age'));
    if (ag.bad) out.errors.push(`${label}: ages ${JSON.stringify(firstOf(x, 'ages', 'age'))} should be written like "U10-U12".`);
    const price = importMoney(firstOf(x, 'price', 'fee', 'cost'));
    if (price === null) out.errors.push(`${label}: price ${JSON.stringify(firstOf(x, 'price', 'fee', 'cost'))} is not an amount.`);
    const plist = firstOf(x, 'players', 'booked');
    if (plist !== undefined && !Array.isArray(plist)) out.errors.push(`${label}: "players" should be a list.`);
    const who = (Array.isArray(plist) ? plist : []).map((p, j) => playerFor(p, firstOf(x, 'team'), `${label}, player ${j + 1}`));
    const rep = firstOf(x, 'weekly', 'repeat', 'repeats');
    let days = [], until = '';
    if (rep !== undefined && rep !== false) {
      const r = typeof rep === 'object' ? rep : { until: rep };
      until = importDate(firstOf(r, 'until', 'to', 'end', 'ending'));
      const d = importDays(firstOf(r, 'days', 'day'));
      if (!until) out.errors.push(`${label}: a weekly session needs the date of the last one ("until": "2026-12-16").`);
      if (d.bad.length) out.errors.push(`${label}: "${d.bad.join(', ')}" ${d.bad.length === 1 ? 'is not a day' : 'are not days'}.`);
      days = d.days;
    }
    if (out.errors.length > errs) return;

    const kind = kind0 || ((Number(firstOf(x, 'spots', 'cap', 'size', 'max')) || 2) > 1 ? 'group' : 'one');
    const capRaw = firstOf(x, 'spots', 'cap', 'size', 'max');
    let cap = kind === 'one' ? 1 : 6;
    if (kind === 'group' && capRaw !== undefined) {
      const n = Number(capRaw);
      if (Number.isInteger(n) && n >= 1 && n <= 60) cap = n; else out.warnings.push(`${label}: ${JSON.stringify(capRaw)} spots is not 1 to 60, so it has 6.`);
    }
    const fName = firstOf(x, 'field', 'venue');
    let field = '', place = String(firstOf(x, 'where', 'place', 'pitch') ?? '').trim();
    if (fName !== undefined && String(fName).trim()) {
      const f = fieldByName[importKey(fName)];
      if (f) field = f.f.id;
      else { place = [String(fName).trim(), place].filter(Boolean).join(', '); out.warnings.push(`${label}: "${fName}" is not a field here or in the file, so it is kept as the place.`); }
    }
    const fieldObj = field ? (Object.values(fieldByName).find(e => e.f.id === field) || {}).f : null;
    const fields = {
      kind, title, coach, coachName: (members_[coach] || {}).name || (me && coach === me.uid ? whoAmI() : '') || 'Coach',
      start, end, field, place: place.slice(0, 120), cap, price, open: importBool(firstOf(x, 'open', 'openToAsk', 'familiesCanAsk'), !who.length),
      focus: String(firstOf(x, 'focus', 'workingOn', 'skills') ?? '').trim().slice(0, 200), notes: String(firstOf(x, 'notes', 'note') ?? '').trim().slice(0, 2000),
      ...(ag.ages ? { ages: ag.ages } : {})
    };
    const dates = until ? seriesDates(date, until, days.length ? days : [weekdayOf(date)]) : [date];
    if (until && !dates.length) { out.warnings.push(`${label}: no days between ${date} and ${until}, so nothing was added.`); return; }
    const old = dates.map(d => known[[d, start, coach].join('|')]).find(e => e && !e.fresh && e.raw && e.raw.series);
    const series = dates.length > 1 ? (old ? old.raw.series : uid()) : null;
    let twice = false, added = 0;
    for (const d of dates) {
      const k = [d, start, coach].join('|'), had = known[k];
      let sid;
      if (had && had.fresh) { twice = true; continue; }
      if (had) {
        sid = had.id;
        const raw = had.raw || {};
        const changed = Object.entries(fields).filter(([f, v]) => JSON.stringify(raw[f] ?? (f === 'ages' ? null : raw[f])) !== JSON.stringify(v));
        if (changed.length) { const next = { ...raw, ...Object.fromEntries(changed), at: nowMs() }; known[k] = { ...had, raw: next }; sput(`sessions/${sid}`, next); out.counts.sessions++; }
      } else {
        sid = uid();
        const s = { id: sid, ...fields, date: d, ...(series ? { series } : {}), by, made: nowMs(), at: nowMs() };
        known[k] = { id: sid, raw: s, fresh: true };
        sput(`sessions/${sid}`, s);
        out.counts.newSessions++; added++;
        if (fieldObj && permitsOf(fieldObj).length && !permitsOf(fieldObj).some(p => permitCovers(p, d, minOf(start), minOf(end))))
          out.warnings.push(`${label}: ${d} at ${start} is outside the club's permit for ${fieldObj.name}.`);
      }
      // the places, at most the spots; past that, the waiting list
      ins[sid] = ins[sid] ?? (had ? bookingsOf(sid).filter(b => b.st === 'in').length : 0);
      const named = new Set();
      who.forEach((w, j) => {
        // a name and her shirt number in the same list are one player, booked once
        if (!w || named.has(w.p.id)) return;
        named.add(w.p.id);
        const b = had ? bookOf(sid, w.p.id) : null;
        if (b) { if (b.st !== 'in') out.warnings.push(`${label}, player ${j + 1}: ${w.p.name} is already "${BOOK[b.st].toLowerCase()}" for ${d} here, so that was left as it is.`); return; }
        const stt = ins[sid] < (kind === 'one' ? 1 : cap) ? 'in' : 'wait';
        if (stt === 'in') ins[sid]++;
        else out.warnings.push(`${label}: ${d} is full, so ${w.p.name} goes on its waiting list.`);
        sput(`booked/${sid}/${w.p.id}`, { tid: w.t.id, st: stt, by, at: nowMs() });
        out.counts.bookings++;
      });
    }
    if (twice) out.warnings.push(`${label}: appears twice in the file, so it was imported once.`);
    if (defaulted && added) out.warnings.push(`${label}: no coach given, so ${added === 1 ? 'it is' : 'they are'} yours.`);
  });
}

function importSummary(c) {
  const bits = [];
  const n = (k, one, many) => c[k] ? `${c[k]} ${c[k] === 1 ? one : many}` : null;
  const add = [n('newTeams', 'team', 'teams'), n('newPlayers', 'player', 'players'), n('newGames', 'game', 'games'),
    n('newFields', 'field', 'fields'), n('newSessions', 'session', 'sessions'), n('bookings', 'booking', 'bookings'),
    n('training', 'training record', 'training records')].filter(Boolean);
  if (add.length) bits.push('adds ' + add.join(', '));
  const upd = [n('teams', 'team', 'teams'), n('players', 'player', 'players'), n('games', 'game', 'games'),
    n('fields', 'field', 'fields'), n('sessions', 'session', 'sessions')].filter(Boolean);
  if (upd.length) bits.push('updates ' + upd.join(', '));
  if (c.results) bits.push(`${c.results} with a final score`);
  return bits.length ? bits.join(' · ') : 'nothing new — everything in it is already here';
}

/* Writes at the depth the rules sit at: a whole team or game only when it is
   new, a single field of one that already exists. The same order a
   hand-entered team and its games would go out in. */
function applyImport(plan) {
  for (const [path, value] of plan.writes) { setDeep(state, path, value); remoteSet(path, value); }
  saveLocal();
  // sessions after the teams and fields they name, through the store that resends them
  for (const [path, value] of plan.sessWrites || []) sessPut(path, value);
  for (const [what, value] of plan.trainWrites || []) { if (what === 'practice') putPractice(value); else if (what === 'drill') putDrill('club', value); }
  render(); schedulePublish();
}

let pendingImport = null;
/* A backup carrying training records needs the club's answer to "what do you
   already have" before it can be planned, so the sheet asks once per file and
   draws again when the answer comes. Undefined: nothing to ask. */
function restoreKnown(data, txt) {
  if (!isBackupData(data) || !data.training || !fb) return undefined;
  const pi = pendingImport;
  if (pi && pi.knownFor === txt) return pi.known;
  if (pi && pi.asking === txt) return 'checking';
  if (pi) pi.asking = txt;
  trainingCopy({ sids: Object.keys(data.training.sessions || {}), tids: Object.keys(data.training.practices || {}) }).then(r => {
    if (!pendingImport || pendingImport.asking !== txt) return;
    pendingImport.known = r; pendingImport.knownFor = txt; pendingImport.asking = null;
    if (!$('#sheet').hidden) sheetImport(null);
  });
  return 'checking';
}
function sheetImport(text) {
  pendingImport = text == null ? pendingImport : { text };
  const txt = (pendingImport && pendingImport.text) || '';
  let plan = null, bad = null, checking = false;
  if (txt.trim()) {
    try {
      const data = JSON.parse(txt);
      const k = restoreKnown(data, txt);
      if (k === 'checking') checking = true; else plan = importPlan(data, k ? { ...state, trainingKnown: k } : state);
    } catch (err) { bad = 'That is not valid JSON: ' + err.message; }
  }
  const list = (items, cls) => items.length ? `<div class="implist ${cls}">${items.slice(0, 30).map(esc).join('<br>')}${items.length > 30 ? `<br>…and ${items.length - 30} more` : ''}</div>` : '';
  openSheet(`<h3>Bulk import</h3>
    <p class="muted" style="margin-top:0">Teams, rosters, games, fields and training sessions from one JSON file. Teams, players and fields are matched by name, games by team, date and opponent, and sessions by date, start and coach, so running the same file twice changes nothing. Nothing already here is removed.</p>
    <div class="row" style="margin-bottom:10px">
      <button class="btn quiet sm" data-act="importfile">Choose a file</button>
      <button class="btn quiet sm" data-act="importexample">Show an example</button>
    </div>
    <label class="field"><span>Or paste it here</span><textarea id="impText" rows="8" spellcheck="false" placeholder='{"teams": [{"name": "...", "players": [...], "games": [...]}]}'>${esc(txt)}</textarea></label>
    <button class="btn quiet wide" data-act="importcheck" style="margin-bottom:10px">Check it</button>
    ${bad ? list([bad], 'warn alert') : ''}
    ${checking ? '<p class="muted"><b>Checking what the club already has…</b> A backup with training records is only restored where the club has nothing, so it asks first.</p>' : ''}
    ${plan ? `${list(plan.errors, 'warn alert')}
      ${plan.errors.length ? '<p class="muted">Fix those and check again — nothing is imported while any are left.</p>'
      : `<p><b>This ${plan.backup ? 'backup' : 'file'} ${esc(importSummary(plan.counts))}.</b></p>`}
      ${list(plan.warnings, '')}
      ${!plan.errors.length && (plan.writes.length || plan.sessWrites.length || plan.trainWrites.length) ? `<button class="btn wide" data-act="importgo">Import it</button>` : ''}` : ''}
    <p class="muted" style="margin-bottom:0">It holds children's names, so treat the file the way you would the roster itself. Names never reach the parent pages.</p>`);
}

/* ---------------- model helpers ---------------- */
const teams = () => Object.values(state.teams).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
const teamLabel = t => t && t.name ? esc(t.name) : '<span class="untitled">Untitled team</span>';
const teamStats = t => {
  const n = Object.keys((t && t.players) || {}).length, g = teamMatches(t.id).length;
  return `${n} player${n === 1 ? '' : 's'} · ${g} game${g === 1 ? '' : 's'} · id ${t.id.slice(0, 4)}`;
};
const team = () => state.teams[ui.teamId] || null;
const players = t => Object.values((t && t.players) || {}).sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999) || (a.name || '').localeCompare(b.name || ''));
const teamMatches = id => Object.values(state.matches).filter(m => m.teamId === id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
const match = () => state.matches[ui.matchId] || null;

function segments(m) {
  return Object.keys(m.periods || {}).map(Number).sort((a, b) => a - b).map(i => ({ i, ...m.periods[i] }));
}
function elapsedSec(m, now = nowMs()) {
  let t = 0;
  for (const s of segments(m)) { if (!s.start) continue; t += ((s.end || now) - s.start); }
  return Math.floor(t / 1000);
}
function halfSec(m, now = nowMs()) {
  const h = m.currentHalf || 1;
  let t = 0;
  for (const s of segments(m)) { if (!s.start || (s.half || 1) !== h) continue; t += ((s.end || now) - s.start); }
  return Math.floor(t / 1000);
}
function openSeg(m) { const l = segments(m); const last = l[l.length - 1]; return last && last.start && !last.end ? last : null; }
const running = m => !!openSeg(m);

function halfName(m, n) {
  const c = m.periodCount || 2;
  if (c === 2) return n === 1 ? '1st half' : n === 2 ? '2nd half' : 'Extra ' + (n - 2);
  if (c === 4) return ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter'][n - 1] || 'Extra ' + (n - 4);
  return 'Period ' + n;
}

function stintsOf(m, pid) { return Object.entries(m.stints || {}).filter(([, s]) => s.pid === pid); }
function openStint(m, pid) { return stintsOf(m, pid).find(([, s]) => s.off == null); }

function playedSec(m, pid, now = nowMs()) {
  const e = elapsedSec(m, now);
  let t = 0;
  for (const [, s] of stintsOf(m, pid)) { const off = s.off == null ? e : s.off; t += Math.max(0, off - s.on); }
  return t;
}
/* Match seconds <-> wall clock. Periods already store epoch milliseconds, so
   every event has a real timestamp — which is what lines events up with video. */
function absAt(m, sec) {
  let acc = 0, last = null;
  for (const s of segments(m)) {
    if (!s.start) continue;
    last = s;
    const dur = Math.floor(((s.end || nowMs()) - s.start) / 1000);
    if (acc + dur >= sec) return s.start + (sec - acc) * 1000;
    acc += dur;
  }
  return last ? last.start + (sec - acc) * 1000 : null;
}
function secFromAbs(m, ms) {
  let acc = 0;
  for (const s of segments(m)) {
    if (!s.start) continue;
    const end = s.end || nowMs();
    if (ms < s.start) return acc;
    if (ms <= end) return acc + Math.floor((ms - s.start) / 1000);
    acc += Math.floor((end - s.start) / 1000);
  }
  return acc;
}

/* Which half a given match second fell in — needed to split anything by half. */
function halfOfSec(m, sec) {
  let acc = 0;
  for (const x of segments(m)) {
    if (!x.start) continue;
    const dur = Math.floor(((x.end || nowMs()) - x.start) / 1000);
    if (sec < acc + dur) return x.half || 1;
    acc += dur;
  }
  return m.currentHalf || 1;
}

function spellSec(m, pid, now) {
  const o = openStint(m, pid);
  return o ? Math.max(0, elapsedSec(m, now) - o[1].on) : null;
}
function restSec(m, pid, now) {
  const offs = stintsOf(m, pid).filter(([, x]) => x.off != null).map(([, x]) => x.off);
  return offs.length ? Math.max(0, elapsedSec(m, now) - Math.max(...offs)) : null;
}

function goalList(m) {
  return Object.entries(m.goals || {}).map(([id, g]) => ({ id, ...g })).sort((a, b) => a.t - b.t);
}
function score(m) {
  const g = goalList(m);
  return { us: g.filter(x => x.side === 'us').length, them: g.filter(x => x.side === 'them').length };
}

/* `who` spells out what a side means for that kind. It is not the same for all
   of them: a corner is credited to whoever takes it, a foul to whoever gave it
   away. Leaving that implicit is what makes these ambiguous at the sideline. */
const EVENTS = [
  { k: 'corner', label: 'Corners', who: 'won by', attr: 'Who took it' },
  { k: 'foul', label: 'Fouls', who: 'given away by', attr: 'Who committed it' },
  { k: 'throw', label: 'Throw-ins', who: 'taken by', attr: 'Who took it' },
  { k: 'goalkick', label: 'Goal kicks', who: 'taken by', attr: 'Who took it' },
  { k: 'keeper', label: 'Keeper claims', who: 'grabbed by', attr: 'Which keeper' }
];
const evOf = k => EVENTS.find(e => e.k === k) || { label: k, who: '', attr: 'Who' };
const evLabel = k => evOf(k).label;
const tracked = t => EVENTS.filter(e => ((t.track || {})[e.k] !== false));
/* Off by default. Tapping every turnover while actually watching a game is not
   realistic, so possession is expected to arrive from film instead. The model
   and the editor stay put for whenever that lands. */
const possOn = t => (t.track || {}).possession === true;
const evList = m => Object.entries(m.events || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => a.t - b.t);
const evCount = (m, k, side) => evList(m).filter(x => x.kind === k && x.side === side).length;

const shotList = m => Object.entries(m.shots || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => a.t - b.t);
function shotTally(m) {
  const sh = shotList(m), g = goalList(m);
  const f = (side, on) => sh.filter(x => x.side === side && !!x.onTarget === on).length;
  return {
    usOn: f('us', true) + g.filter(x => x.side === 'us').length,
    usOff: f('us', false),
    themOn: f('them', true) + g.filter(x => x.side === 'them').length,
    themOff: f('them', false)
  };
}

/* Possession is the gaps between turnovers: whoever won it last holds it until
   the next tap. Only as honest as the tapping, which is why the card says so. */
const possList = m => Object.entries(m.poss || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => a.t - b.t);
/* A clear answered by a clear answered by a clear is not possession, and with
   young players that churn is most of the game. Anything held for less than the
   threshold counts as contested and is kept out of both teams' share. */
/* A throw-in, corner, goal kick or keeper claim all say who has the ball, and a
   foul says who just lost it. Folding those in means possession costs almost no
   extra tapping — you are already counting them. */
function possMarkers(m) {
  const out = [];
  for (const [id, x] of Object.entries(m.poss || {})) out.push({ t: x.t, to: x.to, src: 'tap', id, coll: 'poss' });
  for (const [id, x] of Object.entries(m.events || {})) {
    const other = x.side === 'us' ? 'them' : 'us';
    out.push({ t: x.t, to: x.kind === 'foul' ? other : x.side, src: x.kind, id, coll: 'events' });
  }
  // a goal restarts with the conceding team
  for (const [id, x] of Object.entries(m.goals || {})) out.push({ t: x.t, to: x.side === 'us' ? 'them' : 'us', src: 'goal', id, coll: 'goals' });
  return out.sort((a, b) => a.t - b.t);
}

function possession(m, now = nowMs(), minSec) {
  const evs = possMarkers(m), end = elapsedSec(m, now);
  const MIN = minSec != null ? minSec : (team() && team().possMin != null ? Number(team().possMin) : 5);
  let us = 0, them = 0, contested = 0;
  evs.forEach((e, i) => {
    const to = i + 1 < evs.length ? evs[i + 1].t : end;
    const d = Math.max(0, to - e.t);
    if (d < MIN) contested += d;
    else if (e.to === 'us') us += d; else them += d;
  });
  return {
    us, them, contested, settled: us + them, total: us + them + contested,
    changes: evs.length, tapped: possList(m).length, min: MIN
  };
}

function plannedSec(m, pid) { return (m.planned && m.planned[pid] != null ? Number(m.planned[pid]) : 0) * 60; }
/* Truth is the stints: a player is on if she has a spell that has not closed.
   `positions` now only carries coordinates, so a clash there is harmless. */
const onField = (m, pid) => !!openStint(m, pid);
const fieldIds = m => [...new Set(Object.values(m.stints || {}).filter(x => x.off == null).map(x => x.pid))];
function posOf(m, pid) {
  const p = (m.positions || {})[pid];
  if (p && p.x != null) return p;
  const sl = slotById(m, slotIdOf(m, pid));
  return sl ? { x: sl.x, y: sl.y, slot: sl.id } : { x: 50, y: 45, slot: null };
}

/* Things that should never be true. Surfaced for repair rather than prevented —
   locking a sideline app is worse than showing the coach what went wrong. */
function anomalies(m) {
  const open = {};
  for (const [sid, x] of Object.entries(m.stints || {})) if (x.off == null) (open[x.pid] = open[x.pid] || []).push(sid);
  const out = [];
  for (const [pid, list] of Object.entries(open)) if (list.length > 1) out.push({ kind: 'double', pid, sids: list });
  const n = Object.keys(open).length, cap = m.onFieldCount || 11;
  if (n > cap) out.push({ kind: 'toomany', n, cap });
  return out;
}

/* Who is not available for a game. The coach's own word wins either way;
   without one, the family's answer does, so a "not going" leaves her out of the
   bench, the plan and the even split without the coach copying it across.
   `out[pid] === false` is the coach saying she is playing after all, and
   toggleout keeps an entry only while it disagrees with what the family said —
   so a family that changes its mind still flows through, unless the coach has
   decided otherwise. */
function isOut(m, pid) {
  const o = ((m && m.out) || {})[pid];
  if (o === false) return false;
  if (o) return true;
  return familySaidNo(m, pid);
}
const familySaidNo = (m, pid) => !!m && ((rsvpOf(m.teamId, 'g_' + m.id, pid) || {}).v === 'no');
// everyone left out of a game, by whichever route — never Object.keys(m.out), which misses the families' answers
const outIds = (t, m) => players(t).filter(p => p.active !== false && isOut(m, p.id)).map(p => p.id);
function squad(t, m) {
  return players(t).filter(p => p.active !== false && (!m || !isOut(m, p.id)));
}
const keeperOf = (t, m) => squad(t, m).find(p => p.gk) || null;
const pairsWith = (a, b) => !!((a.pairs || {})[b.id] || (b.pairs || {})[a.id]);
const avoidsWith = (a, b) => !!((a.avoid || {})[b.id] || (b.avoid || {})[a.id]);
const rating = p => Number(p.rating) || 3;
const matchMinutes = m => (m.periodCount || 2) * (m.periodMinutes || 40);

function evenSplit(m, roster) {
  const gk = roster.find(p => p.gk);
  const slots = (m.onFieldCount || 11) - (gk ? 1 : 0);
  const outfield = roster.filter(p => !p.gk).length;
  const total = matchMinutes(m) * slots;
  return outfield ? Math.round(total / outfield) : 0;
}

function clashesOn(t, m) {
  const on = fieldIds(m).map(id => (t.players || {})[id]).filter(Boolean);
  const out = [];
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++)
    if (avoidsWith(on[i], on[j])) out.push([on[i], on[j]]);
  return out;
}

/* Greedy block planner. Each block is a stretch of the game with a fixed XI;
   substitutions happen at block boundaries. */
function buildPlan(m, roster) {
  const blockLen = Number(m.blockMinutes) || 10;
  const perHalf = Math.max(1, Math.round((m.periodMinutes || 40) / blockLen));
  const total = perHalf * (m.periodCount || 2);
  const realLen = (m.periodMinutes || 40) / perHalf;

  const gk = roster.find(p => p.gk) || null;
  const field = roster.filter(p => !gk || p.id !== gk.id);
  const slots = Math.min((m.onFieldCount || 11) - (gk ? 1 : 0), field.length);
  const teamAvg = field.length ? field.reduce((s, p) => s + rating(p), 0) / field.length : 3;

  const need = {}, consec = {}, got = {};
  for (const p of field) { need[p.id] = (m.planned && m.planned[p.id] != null ? Number(m.planned[p.id]) : 0); consec[p.id] = 0; got[p.id] = 0; }

  const shape = (m.formation && m.formation.slots) || [];
  const blocks = [];
  let prevAssign = null;
  for (let b = 0; b < total; b++) {
    const left = total - b;
    const cap = p => p.maxStint ? Math.max(1, Math.round(Number(p.maxStint) / realLen)) : 99;
    const score = new Map(field.map(p => [p.id,
      (need[p.id] / left) + rating(p) * 0.02 - (consec[p.id] >= cap(p) ? 500 : 0)]));

    const pool = [...field];
    const chosen = [];
    while (chosen.length < slots && pool.length) {
      pool.sort((a, c) => score.get(c.id) - score.get(a.id));
      const pick = pool.find(p => !chosen.some(c => avoidsWith(c, p))) || pool[0];
      pool.splice(pool.indexOf(pick), 1);
      chosen.push(pick);
      for (const p of pool) if (pairsWith(pick, p)) score.set(p.id, score.get(p.id) + 0.8);
    }

    // one balance pass: if this block is much weaker than the squad average, upgrade
    const avg = chosen.length ? chosen.reduce((s, p) => s + rating(p), 0) / chosen.length : teamAvg;
    if (avg < teamAvg - 0.35 && pool.length) {
      const weakest = [...chosen].sort((a, c) => rating(a) - rating(c))[0];
      const best = [...pool].filter(p => consec[p.id] < cap(p)).sort((a, c) => rating(c) - rating(a))[0];
      if (best && rating(best) > rating(weakest) &&
        !chosen.some(c => c.id !== weakest.id && avoidsWith(c, best))) {
        chosen[chosen.indexOf(weakest)] = best;
      }
    }

    const ids = chosen.map(p => p.id);
    for (const p of field) {
      const on = ids.includes(p.id);
      consec[p.id] = on ? consec[p.id] + 1 : 0;
      if (on) { need[p.id] -= realLen; got[p.id] += realLen; }
    }
    const all = gk ? [gk, ...chosen] : chosen;
    const assign = assignSlots(all, shape, prevAssign);
    prevAssign = assign;
    blocks.push({ start: Math.round(b * realLen * 60), ids: all.map(p => p.id), assign });
  }

  const projected = {};
  for (const p of field) projected[p.id] = Math.round(got[p.id]);
  if (gk) projected[gk.id] = matchMinutes(m);
  return { blockMinutes: realLen, blocks, projected };
}

/* A plan is a list of snapshots: from `start` (seconds of game time) until the
   next one, these players in these spots. The auto planner and the coach's own
   snapshots write the same shape, so "Make these subs" and the live card work
   on either without knowing which built it. Read blocks through here: the
   database hands an array back as an object once it has a gap in it. */
function planBlocks(m) {
  const b = m && m.plan && m.plan.blocks;
  if (!b) return [];
  return (Array.isArray(b) ? b : Object.values(b)).filter(x => x && x.start != null)
    .sort((a, c) => a.start - c.start);
}
function planBlockAt(m, sec) {
  let cur = null;
  for (const b of planBlocks(m)) if (b.start <= sec) cur = b;
  return cur;
}
function nextPlanBlock(m, sec) {
  return planBlocks(m).find(b => b.start > sec) || null;
}
/* Seconds each player gets if the plan is followed: a snapshot lasts until the
   next one, the last until full time. Worked out from the snapshots every time
   rather than stored, so a hand-edited plan can never disagree with its total.
   With `until`, only what is played before that mark: what a player has had by
   the time a change comes round, which is what the coach decides it on. */
function planSeconds(m, until) {
  const bl = planBlocks(m), end = Math.min(matchMinutes(m) * 60, until == null ? Infinity : until), out = {};
  bl.forEach((b, i) => {
    const len = Math.max(0, Math.min(end, i + 1 < bl.length ? bl[i + 1].start : end) - b.start);
    for (const id of b.ids || []) out[id] = (out[id] || 0) + len;
  });
  return out;
}
/* "Kick-off", "2nd half", or the minute and which half it falls in. */
function snapLabel(m, sec) {
  if (!sec) return 'Kick-off';
  const per = (m.periodMinutes || 40) * 60;
  const n = Math.floor(sec / per) + 1;
  return sec % per === 0 ? halfName(m, n) : `${mmss(sec)} · ${halfName(m, n)}`;
}

/* ---------------- planned subs, at the sideline ----------------
   A locked-in plan is what the sideline follows. The coach draws it at the
   kitchen table; whoever tracks the game — often a parent — gets told when each
   change is due and taps once when the referee actually lets the subs on. The
   tracker is told when, never who: the plan is the coach's, and a parent reading
   the whole afternoon's lineups before kick-off is not what locking it in is for.

   The lock lives inside the plan (plan/locked), so any rewrite of the plan —
   an edit, a redraft — unlocks it: a changed plan is not the one that was locked
   in. What has been done lives beside it (planDone), because the tracker writes
   it mid-game and a whole-plan write from the coach must never be able to
   clobber it. Keys are 's' + start: a node keyed by small integers comes back
   from the database as an array. */
const SUB_LEAD = 180;          // how long before a planned change "coming up" opens, in seconds
const SUB_UNDO_MS = 120000;    // how long a mis-tap can be taken back from the card
const planLocked = m => !!(m && m.plan && m.plan.locked && planBlocks(m).length);
const doneKey = b => 's' + b.start;
const doneOf = (m, b) => (b && (m.planDone || {})[doneKey(b)]) || null;

/* Plan times are nominal — the 2nd half starts at 40:00 whatever the clock
   says — but a real half runs short or long. So "how long until" is asked in the
   half the change belongs to, against that half's own clock, and a change set
   for the start of a half comes due when the half before it is ended, not when
   the running total happens to pass the mark. */
function subsUntil(m, b, now = nowMs()) {
  const per = (m.periodMinutes || 40) * 60;
  const h = m.currentHalf || 1, into = halfSec(m, now);
  const half = Math.floor(b.start / per) + 1, at = b.start % per;
  if (half <= h) return (half - h) * per + at - into;
  return Math.max(1, per - into) + (half - h - 1) * per + at;
}
/* "at kick-off", "at half-time", "at 20:00 of the 1st half" — the same clock
   the Track tab shows under the big one. */
function subsWhen(m, b) {
  if (!b.start) return 'at kick-off';
  const per = (m.periodMinutes || 40) * 60;
  const half = Math.floor(b.start / per) + 1, at = b.start % per;
  if (!at) return (m.periodCount || 2) === 2 && half === 2 ? 'at half-time' : `at the start of the ${halfName(m, half).toLowerCase()}`;
  return `at ${mmss(at)} of the ${halfName(m, half).toLowerCase()}`;
}
/* What this snapshot would change on the pitch as it stands, which is not
   always what it changes from the snapshot before: the coach may have made a
   sub by hand in between. */
function subsDiff(m, b) {
  const want = b.assign || {}, ids = (b.ids && b.ids.length ? b.ids : Object.values(want));
  const cur = fieldIds(m);
  const spot = pid => Object.keys(want).find(k => want[k] === pid) || null;
  return {
    on: ids.filter(pid => !cur.includes(pid)),
    off: cur.filter(pid => !ids.includes(pid)),
    moved: ids.filter(pid => cur.includes(pid) && spot(pid) && slotIdOf(m, pid) !== spot(pid))
  };
}
const subsCount = x => x.on.length + x.off.length + x.moved.length;

/* The planned change that wants doing, if any. The latest snapshot inside the
   window is the one that counts: a missed change is superseded by the next
   rather than stacking up, and since a snapshot is a whole lineup, putting the
   newest one on is also what catches up the one that was missed. A snapshot is
   done once somebody has said so, or when the pitch already matches it — the
   coach may have made the subs by hand — and kick-off is done the moment anyone
   is on, because starters the coach has already set must not be swapped back
   by a tap on another phone. */
function subsDue(m, now = nowMs()) {
  if (!planLocked(m) || m.ended) return null;
  const blocks = planBlocks(m);
  const inWin = blocks.filter(b => subsUntil(m, b, now) <= SUB_LEAD);
  const b = inWin[inWin.length - 1] || null;
  const next = blocks.find(x => subsUntil(m, x, now) > SUB_LEAD) || null;
  if (b) {
    const d = subsDiff(m, b);
    const handled = doneOf(m, b) || (b.start === 0 ? fieldIds(m).length > 0 : !subsCount(d));
    if (!handled) {
      const u = subsUntil(m, b, now);
      return { kind: u > 0 ? 'soon' : 'due', b, until: u, diff: d, next };
    }
  }
  return { kind: next ? 'wait' : 'over', b: next, until: next ? subsUntil(m, next, now) : null, last: b, lastDone: doneOf(m, b), next };
}

/* Turn a picker value into a standalone copy. Always a copy: a game must never
   point at a team shape that a coach might edit next month. */
function resolveShape(t, pick, size) {
  if (pick === 'none') return null;
  if (pick.startsWith('team:')) {
    const f = (t.formations || {})[pick.slice(5)];
    return f ? { name: f.name, size: f.size, slots: clone(f.slots) } : null;
  }
  if (pick.startsWith('preset:')) {
    const [, sz, k] = pick.split(':');
    const sl = presetsFor(Number(sz))[k];
    return sl ? { name: k, size: Number(sz), slots: clone(sl) } : null;
  }
  // 'auto' — the team default for this side size, else the first preset
  const fid = (t.defaults || {})[size];
  const f = fid && (t.formations || {})[fid];
  if (f) return { name: f.name, size: f.size, slots: clone(f.slots) };
  const k = Object.keys(presetsFor(size))[0];
  return k ? { name: k, size, slots: clone(presetsFor(size)[k]) } : null;
}

/* The shape editor works on one of two things: a shape the team keeps, or the
   copy a single game carries. They are edited the same way but live in
   different places, and the difference matters — a game's copy is what its
   spots and plan point at, and changing it must never reach back into the
   team's saved shape (or the other way round). GAME_SHAPE in ui.editFid means
   "the open game's own copy". */
const GAME_SHAPE = '@game';
function shapeTarget() {
  const t = team(); if (!t) return null;
  if (ui.editFid === GAME_SHAPE) {
    if (restricted() || readOnlyHere()) return null;
    const m = match();
    return m && m.teamId === t.id && m.formation ? { game: true, t, m, f: m.formation, path: `matches/${m.id}/formation` } : null;
  }
  const f = (t.formations || {})[ui.editFid];
  return f ? { game: false, t, f, path: `teams/${t.id}/formations/${f.id}` } : null;
}
/* A blank shape still needs its keeper: every side size here plays with one. */
const blankShape = size => ({ name: 'Custom', size, slots: [S('GK', 'GK', 50, 92)] });

function parseTime(str, fallback) {
  const s = String(str || '').trim();
  if (/^\d+:\d{1,2}$/.test(s)) { const [a, b] = s.split(':').map(Number); return a * 60 + b; }
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  return fallback;
}

/* ---------------- actions ---------------- */
function startClock(m) {
  if (running(m)) return;
  const idx = segments(m).length;
  commit(`matches/${m.id}/periods/${idx}`, { half: m.currentHalf || 1, start: nowMs() });
}
function pauseClock(m) {
  const s = openSeg(m);
  if (!s) return;
  commit(`matches/${m.id}/periods/${s.i}/end`, nowMs());
}
function endHalf(m) {
  const s = openSeg(m);
  if (s) { const tEnd = nowMs(); setDeep(state, `matches/${m.id}/periods/${s.i}/end`, tEnd); remoteSet(`matches/${m.id}/periods/${s.i}/end`, tEnd); }
  const next = (m.currentHalf || 1) + 1;
  commit(`matches/${m.id}/currentHalf`, next);
  toast(halfName(m, next - 1) + ' ended');
}

/* Ending a game freezes it: closes whatever period is still open (like
   endHalf) and, crucially, closes every open stint — otherwise elapsedSec()
   and playedSec() keep counting against "now" forever, and minutes silently
   drift after everyone has gone home. The explicit `ended` flag is then what
   gameStatus() and Stats trust, regardless of currentHalf vs periodCount. */
function endGame(m) {
  const path = `matches/${m.id}`;
  const t = elapsedSec(m);
  const s = openSeg(m);
  if (s) { const tEnd = nowMs(); setDeep(state, `${path}/periods/${s.i}/end`, tEnd); remoteSet(`${path}/periods/${s.i}/end`, tEnd); }
  for (const [sid, st] of Object.entries(m.stints || {})) {
    if (st.off == null) { setDeep(state, `${path}/stints/${sid}/off`, t); remoteSet(`${path}/stints/${sid}/off`, t); }
  }
  commit(`${path}/ended`, nowMs());
  toast('Game ended — ready for stats');
}

function putOnField(m, pid, x, y, slot) {
  const path = `matches/${m.id}`;
  const pos = { x, y, slot: slot || null };
  setDeep(state, `${path}/positions/${pid}`, pos);
  remoteSet(`${path}/positions/${pid}`, pos);
  if (!openStint(m, pid)) {
    const sl = slot ? slotById(m, slot) : null;
    const sid = uid(), rec = { pid, on: elapsedSec(m), slot: slot || null, role: sl ? sl.role : null };
    setDeep(state, `${path}/stints/${sid}`, rec);
    remoteSet(`${path}/stints/${sid}`, rec);
  }
  saveLocal(); render();
}
function takeOffField(m, pid) {
  const path = `matches/${m.id}`;
  const open = openStint(m, pid);
  if (open) { const t = elapsedSec(m); setDeep(state, `${path}/stints/${open[0]}/off`, t); remoteSet(`${path}/stints/${open[0]}/off`, t); }
  delDeep(state, `${path}/positions/${pid}`); remoteDel(`${path}/positions/${pid}`);
  saveLocal(); render();
}
/* The spot comes from her spell, not from positions: a token dragged before it
   had a positions entry carries x/y and no slot, and the player coming on would
   inherit that blank — a keeper subbed in who never counts as one. */
function swap(m, outPid, inPid) {
  const pos = posOf(m, outPid), sid = slotIdOf(m, outPid);
  takeOffField(m, outPid);
  putOnField(m, inPid, pos.x, pos.y, sid);
}

function subEvents(m) {
  const evs = [];
  for (const [sid, s] of Object.entries(m.stints || {})) {
    if (s.on > 0) evs.push({ t: s.on, pid: s.pid, sid, type: 'on' });
    if (s.off != null) evs.push({ t: s.off, pid: s.pid, sid, type: 'off' });
  }
  evs.sort((a, b) => a.t - b.t);
  const rows = [];
  const used = new Set();
  evs.forEach((e, i) => {
    if (used.has(i)) return;
    if (e.type === 'off') {
      const j = evs.findIndex((x, k) => k > i && !used.has(k) && x.type === 'on' && Math.abs(x.t - e.t) <= 3);
      if (j > -1) {
        used.add(i); used.add(j);
        const same = evs[j].pid === e.pid;
        rows.push({
          t: e.t, off: e.pid, offSid: e.sid, on: evs[j].pid, onSid: evs[j].sid,
          move: same, spot: same ? spotLabel((m.stints || {})[evs[j].sid] && slotById(m, (m.stints || {})[evs[j].sid].slot)) || ((m.stints || {})[evs[j].sid] || {}).role : null
        });
        return;
      }
    }
    used.add(i);
    rows.push({
      t: e.t,
      off: e.type === 'off' ? e.pid : null, offSid: e.type === 'off' ? e.sid : null,
      on: e.type === 'on' ? e.pid : null, onSid: e.type === 'on' ? e.sid : null
    });
  });
  return rows.reverse();
}

/* move a whole sub (both sides) to a new match time */
function moveSub(m, row, t) {
  t = clamp(Math.round(t), 0, elapsedSec(m));
  const p = `matches/${m.id}/stints`;
  if (row.offSid) { setDeep(state, `${p}/${row.offSid}/off`, t); remoteSet(`${p}/${row.offSid}/off`, t); }
  if (row.onSid) { setDeep(state, `${p}/${row.onSid}/on`, t); remoteSet(`${p}/${row.onSid}/on`, t); }
  saveLocal(); render();
}

/* Take a sub out of the log: it did not happen. What that means for the
   minutes depends on the row. A swap gives the player who "went off" the
   spell of the one who "came on", and that spell goes; a move to a new spot
   joins her two spells back into one; a lone "on" goes; a lone "off" joins up
   with her next spell, or reopens her if she has none. A spell of no length is
   simply removed — it is what a lineup set and changed before kick-off left
   behind. Where the answer would overlap another spell of the same player it
   is refused, with Fix minutes as the way through, rather than guessed.
   Returns a reason when refused, nothing when done. */
function deleteSub(m, row) {
  const path = `matches/${m.id}`, S = m.stints || {};
  const A = row.offSid && S[row.offSid] ? { ...S[row.offSid] } : null;
  const B = row.onSid && S[row.onSid] ? { ...S[row.onSid] } : null;
  if (!A && !B) return 'That sub is not there any more';
  const gone = sid => { delDeep(state, `${path}/stints/${sid}`); remoteDel(`${path}/stints/${sid}`); };
  const put = (sid, s) => { const v = { ...s }; if (v.off == null) delete v.off; delDeep(state, `${path}/stints/${sid}`); quiet(`${path}/stints/${sid}`, v); };
  const unpos = pid => { delDeep(state, `${path}/positions/${pid}`); remoteDel(`${path}/positions/${pid}`); };
  const pos = (pid, s, from) => {
    const sl = s.slot ? slotById(m, s.slot) : null;
    const p = from && (m.positions || {})[from];
    quiet(`${path}/positions/${pid}`, sl ? { x: sl.x, y: sl.y, slot: sl.id } : p ? { ...p } : { x: 50, y: 45, slot: null });
  };
  const zero = s => s && s.off != null && s.off <= s.on;
  if (zero(A) || zero(B)) {
    if (zero(A)) gone(row.offSid);
    if (zero(B)) gone(row.onSid);
    saveLocal(); return null;
  }
  // does pid have another spell that starts inside [from, to)?
  const clash = (pid, from, to, skip) => Object.entries(S).some(([sid, s]) => !skip.includes(sid) && s.pid === pid && s.on >= from && (to == null || s.on < to));
  if (A && B) {
    /* Swapped straight back later (Mia off for Jo, then Jo off for Mia): with
       the first gone she simply played on, so her next spell joins this one.
       Any other spell of hers inside Jo's would be her on the pitch twice. */
    const back = B.off == null || A.pid === B.pid ? null : Object.entries(S).find(([sid, s]) => sid !== row.offSid && s.pid === A.pid && Math.abs(s.on - B.off) <= 3);
    if (clash(A.pid, A.off, back ? back[1].on : B.off, [row.offSid, row.onSid])) return 'She came back on later — use Fix minutes for this one';
    // back in another spot is a move, and stays one; anywhere else it is one spell
    const join = back && (!back[1].slot || back[1].slot === A.slot);
    put(row.offSid, { ...A, off: join ? back[1].off : back ? back[1].on : B.off });
    if (join) gone(back[0]);
    gone(row.onSid);
    if (B.off == null) { if (A.pid !== B.pid) unpos(B.pid); pos(A.pid, A, B.pid); }
    saveLocal(); return null;
  }
  if (B) {
    gone(row.onSid);
    if (B.off == null) unpos(B.pid);
    saveLocal(); return null;
  }
  // a lone "off": join her next spell, or reopen her
  const next = Object.entries(S).filter(([sid, s]) => sid !== row.offSid && s.pid === A.pid && s.on >= A.off).sort((x, y) => x[1].on - y[1].on)[0];
  if (next) {
    put(row.offSid, { ...A, off: next[1].off });
    gone(next[0]);
  } else {
    if (m.ended) return 'That is the final whistle, not a sub';
    put(row.offSid, { ...A, off: null });
    pos(A.pid, A);
  }
  saveLocal(); return null;
}

const staged = () => (ui.plan && ui.plan.items) || [];
const stagedIds = () => staged().flatMap(x => x.k === 'sub' ? [x.out, x.in] : [x.pid]);
const isStaged = pid => stagedIds().includes(pid);
function stage(item) {
  if (!ui.plan) ui.plan = { matchId: ui.matchId, items: [] };
  ui.plan.items.push(item);
  saveUi();
}

/* One sub, no render — used when applying a whole batch at a single timestamp. */
function subQuiet(m, outPid, inPid, t) {
  const path = `matches/${m.id}`;
  const pos = posOf(m, outPid), sid = slotIdOf(m, outPid);
  const open = openStint(m, outPid);
  if (open) quiet(`${path}/stints/${open[0]}/off`, t);
  delDeep(state, `${path}/positions/${outPid}`); remoteDel(`${path}/positions/${outPid}`);
  quiet(`${path}/positions/${inPid}`, { x: pos.x, y: pos.y, slot: sid || null });
  const sl = sid ? slotById(m, sid) : null;
  quiet(`${path}/stints/${uid()}`, { pid: inPid, on: t, slot: sid || null, role: sl ? sl.role : (open && open[1].role) || null });
}

/* Everything staged goes in at the same second, because it all happened at the
   same stoppage. Subs first so a move can target a spot a sub just vacated. */
function applyStaged(m) {
  const items = staged();
  if (!items.length) return;
  const t = elapsedSec(m);
  for (const it of items) if (it.k === 'sub') subQuiet(m, it.out, it.in, t);
  for (const it of items) if (it.k === 'add') {
    const sl = ((m.formation && m.formation.slots) || []).find(x => !slotTaken(m, x.id));
    quiet(`matches/${m.id}/positions/${it.pid}`, sl ? { x: sl.x, y: sl.y, slot: sl.id } : { x: 50, y: 45, slot: null });
    quiet(`matches/${m.id}/stints/${uid()}`, { pid: it.pid, on: t, slot: sl ? sl.id : null, role: sl ? sl.role : null });
  }
  for (const it of items) if (it.k === 'move') {
    const mine = slotIdOf(m, it.pid);
    const holder = it.sid ? fieldIds(m).find(x => x !== it.pid && slotIdOf(m, x) === it.sid) : null;
    movePos(m, it.pid, it.sid, it.role, t);
    if (holder) movePos(m, holder, mine, null, t);
  }
  const n = items.length;
  ui.plan = null; ui.picked = null;
  saveLocal(); render();
  toast(`${n} change${n === 1 ? '' : 's'} made at ${mins(t)}′`);
}

/* Put a planned snapshot on the pitch: everyone off, on and moved at the same
   second, because it all happened at one stoppage. Each player coming on opens
   a spell in the planned spot, and a player who stays on but changes spot
   closes one spell and opens the next, like movePos — so minutes by
   position come out right, not just who was on.

   Returns what it changed and what was there before, so the one tap can be
   taken back: `made` is every spell it opened, `prev` every spell it closed or
   rewrote as it was, `pos` every position it replaced. Nulls are left out of
   `prev` and `pos` on purpose — the database drops null children, so a record
   that relied on them would not survive the round trip. */
function applyBlock(m, b, t = elapsedSec(m)) {
  const path = `matches/${m.id}`;
  const want = b.assign || {};
  const ids = b.ids && b.ids.length ? b.ids : Object.values(want);
  const spot = pid => Object.keys(want).find(k => want[k] === pid) || null;
  const rec = { t, made: [], prev: {}, pos: {} };
  const keepPos = pid => { const p = (m.positions || {})[pid]; if (p && !(pid in rec.pos)) rec.pos[pid] = { ...p }; };
  const open = (pid, sid) => {
    const sl = sid ? slotById(m, sid) : null, id = uid();
    quiet(`${path}/stints/${id}`, { pid, on: t, slot: sid || null, role: sl ? sl.role : null });
    rec.made.push(id);
  };
  const d = subsDiff(m, b);
  for (const pid of d.off) {
    const o = openStint(m, pid);
    /* On at this very second — usually a lineup put on before kick-off and
       then swapped for another. Closing it would leave a spell of no length,
       and the match log reads every closed spell as a player going off: a
       string of subs before a ball was kicked. She was never on, so the spell
       goes; `prev` still holds it, so Undo puts it back. */
    if (o && o[1].on >= t) { rec.prev[o[0]] = { ...o[1] }; delDeep(state, `${path}/stints/${o[0]}`); remoteDel(`${path}/stints/${o[0]}`); }
    else if (o) { rec.prev[o[0]] = { ...o[1] }; quiet(`${path}/stints/${o[0]}/off`, t); }
    keepPos(pid);
    delDeep(state, `${path}/positions/${pid}`); remoteDel(`${path}/positions/${pid}`);
  }
  for (const pid of d.moved) {
    const o = openStint(m, pid);
    if (!o) continue;
    rec.prev[o[0]] = { ...o[1] };
    const sid = spot(pid), sl = slotById(m, sid);
    // on at this very second already: correct the spell rather than open a zero-length one
    if (o[1].on >= t) quiet(`${path}/stints/${o[0]}`, { ...o[1], slot: sid, role: sl ? sl.role : null });
    else { quiet(`${path}/stints/${o[0]}/off`, t); open(pid, sid); }
  }
  d.on.forEach(pid => open(pid, spot(pid)));
  // coordinates follow the spot; a player with no spot still gets somewhere on the pitch
  ids.forEach((pid, i) => {
    const sl = slotById(m, spot(pid));
    const cur = (m.positions || {})[pid];
    const next = sl ? { x: sl.x, y: sl.y, slot: sl.id } : cur && cur.x != null ? null : { x: 50, y: 25 + (i * 9) % 55, slot: null };
    if (!next || (cur && cur.x === next.x && cur.y === next.y && cur.slot === next.slot)) return;
    keepPos(pid);
    quiet(`${path}/positions/${pid}`, next);
  });
  saveLocal();
  return { rec, diff: d };
}

/* Take back one planned change, if nothing has happened on top of it. A spell it
   opened that has since been closed means somebody subbed after it, and undoing
   under that would leave a hole in someone's minutes — the match log is the tool for
   that, not a blind rewind. */
function undoBlock(m, key) {
  const rec = (m.planDone || {})[key];
  if (!rec) return false;
  const path = `matches/${m.id}`;
  const made = rec.made || [];
  if (made.some(id => !(m.stints || {})[id] || (m.stints || {})[id].off != null)) return false;
  const touched = new Set(Object.keys(rec.pos || {}));
  for (const id of made) {
    touched.add(m.stints[id].pid);
    delDeep(state, `${path}/stints/${id}`); remoteDel(`${path}/stints/${id}`);
  }
  for (const [id, s] of Object.entries(rec.prev || {})) { touched.add(s.pid); quiet(`${path}/stints/${id}`, s); }
  for (const pid of touched) {
    const p = (rec.pos || {})[pid];
    if (p) quiet(`${path}/positions/${pid}`, p);
    else { delDeep(state, `${path}/positions/${pid}`); remoteDel(`${path}/positions/${pid}`); }
  }
  delDeep(state, `${path}/planDone/${key}`); remoteDel(`${path}/planDone/${key}`);
  saveLocal();
  return true;
}

/* A position change. Closes the current spell and opens a new one at the same
   second, so total minutes are untouched but minutes-per-role become real. */
function movePos(m, pid, slotId, role, atT) {
  const t = atT != null ? atT : elapsedSec(m);
  const path = `matches/${m.id}`;
  const sl = slotId ? slotById(m, slotId) : null;
  const nextRole = sl ? sl.role : (role || null);
  const o = openStint(m, pid);
  if (o) {
    if (o[1].on >= t) {
      quiet(`${path}/stints/${o[0]}`, { ...o[1], slot: slotId || null, role: nextRole });
    } else {
      quiet(`${path}/stints/${o[0]}/off`, t);
      quiet(`${path}/stints/${uid()}`, { pid, on: t, slot: slotId || null, role: nextRole });
    }
  }
  const cur = posOf(m, pid);
  quiet(`${path}/positions/${pid}`, sl ? { x: sl.x, y: sl.y, slot: sl.id } : { x: cur.x, y: cur.y, slot: null });
  saveLocal();
}

/* Move her, and if someone already holds that spot the two trade places. */
function switchTo(m, pid, slotId, role) {
  const mine = slotIdOf(m, pid);
  const holder = slotId ? fieldIds(m).find(x => x !== pid && slotIdOf(m, x) === slotId) : null;
  movePos(m, pid, slotId, role);
  if (holder) movePos(m, holder, mine, null);
  render();
  const t = team(), p = (t.players || {})[pid];
  const sl = slotId ? slotById(m, slotId) : null;
  toast(`${p.name} to ${sl ? sl.label : (role || 'no spot')} at ${mins(elapsedSec(m))}′`);
}

/* record a sub that happened earlier than you tapped it */
function subAt(m, outPid, inPid, t) {
  const e = elapsedSec(m);
  const open = openStint(m, outPid);
  const floor = open ? open[1].on : 0;
  t = clamp(Math.round(t), floor, e);
  const pos = posOf(m, outPid);
  const p = `matches/${m.id}`;
  if (open) { setDeep(state, `${p}/stints/${open[0]}/off`, t); remoteSet(`${p}/stints/${open[0]}/off`, t); }
  delDeep(state, `${p}/positions/${outPid}`); remoteDel(`${p}/positions/${outPid}`);
  const sid = uid(), rec = { pid: inPid, on: t };
  setDeep(state, `${p}/stints/${sid}`, rec); remoteSet(`${p}/stints/${sid}`, rec);
  setDeep(state, `${p}/positions/${inPid}`, pos); remoteSet(`${p}/positions/${inPid}`, pos);
  saveLocal(); render();
}

/* Wipe the clock back to 0:00. Whoever is on the pitch stays on and starts a
   fresh spell at 0; everything measured against the old clock has to go. */
function restartMatch(m) {
  const stints = {};
  // a fresh spell in the spot she is in now, so her minutes by position count from 0:00
  for (const pid of fieldIds(m)) {
    const o = openStint(m, pid)[1];
    stints[uid()] = { pid, on: 0, slot: o.slot || null, role: o.role || null };
  }
  // which planned changes were made belongs to the old clock too
  commit(`matches/${m.id}`, { ...m, periods: {}, currentHalf: 1, stints, goals: null, planDone: null });
}

/* nudge the match clock when it was started late or left running */
function adjustClock(m, deltaSec) {
  const segs = segments(m).filter(s => (s.half || 1) === (m.currentHalf || 1) && s.start);
  const first = segs[0];
  if (!first) { toast('Start the clock first'); return; }
  const span = (first.end || nowMs()) - first.start;
  const shift = clamp(-deltaSec * 1000, -60 * 60000, span - 1000);
  commit(`matches/${m.id}/periods/${first.i}/start`, first.start + shift);
}

/* ---------------- sheet / toast ---------------- */
/* A sheet opened fresh starts at its top: without this it kept the scroll of
   whichever sheet was open last, so a long card could open halfway down. One
   redrawn while it's open (a filter chip, Moving / Still) keeps her place, or
   every tap would throw her back up. `top` is for one sheet replacing another
   without closing, like a drill opened from the card of the one it goes with. */
function openSheet(html, top) {
  const s = $('#sheet'), fresh = top || s.hidden;
  s.innerHTML = html;
  s.hidden = false;
  if (fresh) s.scrollTop = 0;
  $('#scrim').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; }
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------------- rendering ---------------- */
function render() {
  /* Settle whether this device may see the club before drawing a single thing.
     The crumbs are chrome, but they carry the club and the team name, so a lock
     screen with the crumbs still drawn has leaked most of what there was. */
  const inviting = !!invite;
  const joining = !inviting && !!join && !join.hidden;
  const shut = inviting || joining || !!purged || denied || needsSignIn();
  const t = team();
  if (!t && teams().length) { ui.teamId = teams()[0].id; }
  const vis = myTeams();
  if (vis.length && !vis.some(x => x.id === ui.teamId)) ui.teamId = vis[0].id;
  const cb = $('#crumbs'); if (cb) cb.innerHTML = shut ? '' : crumbs();
  const av = $('#avatar');
  if (av) {
    const ph = me && me.photo;
    av.innerHTML = ph ? `<img src="${esc(ph)}" alt="">`
      : `<span>${me ? esc((me.name || '?').slice(0, 1).toUpperCase()) : '\u00b7'}</span>`;
    av.dataset.on = me ? '1' : '0';
  }
  const vr = $('#ver');
  if (vr) { vr.textContent = 'v' + BUILD; vr.dataset.stale = stale() ? '1' : '0'; }

  const lim = restricted();
  document.body.dataset.role = lim || '';
  let inGame = ui.view === 'game';
  // a game screen with no game is just four buttons that do nothing
  if (inGame && !match() && !teamMatches(ui.teamId).length) { ui.view = 'matches'; inGame = false; }
  if (ui.view === 'admin' && !canAdmin()) ui.view = 'club';
  if (ui.view === 'mine' && !guardsAnyone()) ui.view = 'matches';
  /* Not before the club has been read: a link to #/messages opened cold on a
     new phone renders before it knows anybody's role, and sending it to the
     club then would lose where it was going for good. */
  if ((ui.view === 'inbox' || ui.view === 'thread') && !shut && (wsRead || !fbConfig().apiKey) && !msgOn()) ui.view = 'club';
  // the same wait, for the same reason: a family's link to a session opened cold
  if (ui.view === 'sessions' && !shut && (wsRead || !fbConfig().apiKey) && !canSessions()) ui.view = 'club';
  // a parent has no business reading the rest of the squad's names or the plan
  const hideForParent = ['roster', 'teamset'];
  for (const v of hideForParent) {
    const b = document.querySelector(`#tabs [data-view="${v}"]`);
    if (b) b.hidden = lim === 'parent' || (v === 'teamset' && lim === 'tracker');
  }
  if (hideForParent.includes(ui.view) && lim === 'parent') ui.view = guardsAnyone() ? 'mine' : 'matches';
  if (ui.view === 'teamset' && lim === 'tracker') ui.view = 'matches';
  /* Practice is a coach's and an admin's, on any team: the library isn't
     about one team, and a parent or a tracker never gets the tab at all. */
  const train = canTrain();
  const pb = document.querySelector('#tabs [data-view="practice"]');
  if (pb) pb.hidden = !train;
  if (ui.view === 'practice' && !train) ui.view = 'matches';
  // club admin and account settings are not team-level, so the tab row steps aside
  const teamLevel = ['matches', 'calendar', 'practice', 'roster', 'season', 'teamset'].includes(ui.view);
  if (ui.view === 'people' && !canAdmin() && !teams().some(x => isCoach(x.id, me && me.uid))) ui.view = 'club';
  const tabView = ui.view === 'formation' ? (ui.editFid === GAME_SHAPE ? 'matches' : 'admin') : inGame ? 'matches' : ui.view;
  for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-current', String(b.dataset.view === tabView));
  /* Live is the one game screen everybody gets. Where a role lands when its
     tab is not allowed is its working screen, not the first in the list: a
     tracker is there to log, a coach to make subs. */
  const allowed = lim === 'tracker' ? ['live', 'track', 'stats'] : lim === 'parent' || lim === 'viewer' ? ['live', 'stats'] : ['live', 'subs', 'track', 'stats', 'pitch', 'plan'];
  if (!allowed.includes(ui.gameView)) ui.gameView = lim === 'tracker' ? 'track' : lim ? 'live' : 'subs';
  for (const b of document.querySelectorAll('#subtabs button')) {
    b.hidden = !allowed.includes(b.dataset.gview);
    b.setAttribute('aria-current', String(b.dataset.gview === ui.gameView));
  }
  const openM = inGame ? match() : null;
  const st = $('#subtabs'); if (st) st.hidden = shut || !(inGame && openM);
  // two stacked rows of tabs read as a mistake; show whichever one applies
  const tb = $('#tabs'); if (tb) tb.hidden = shut || !!(inGame && openM) || !teamLevel;
  const app = $('#app');
  const v = ui.view;
  paintBell(shut);
  if (inviting) { app.innerHTML = inviteScreen(); saveUi(); watchMessages(); return; }
  if (joining) { app.innerHTML = joinScreen(); saveUi(); watchMessages(); return; }
  if (purged) { app.innerHTML = purgedScreen(); saveUi(); watchMessages(); return; }
  if (denied || needsSignIn()) { app.innerHTML = lockScreen(); saveUi(); watchMessages(); return; }
  const roNote = lim === 'viewer' && team()
    ? `<div class="rolebar">Viewing <b>${teamLabel(team())}</b> from another team in the club. You can read it, not change it.</div>` : '';
  // "you can read, not change" is about the team; on Messages a parent writes, and on the Calendar she answers
  const roleNote = lim && lim !== 'viewer' && v !== 'inbox' && v !== 'thread'
    ? `<div class="rolebar">Signed in as <b>${esc(ROLE_LABEL[lim])}</b> — ${lim === 'tracker' ? "you can log events and make the coach's planned subs when they are due, but not run the clock or make other subs" : lim === 'parent' && v === 'sessions' ? 'you can ask for a place for your child, and withdraw her' : lim === 'parent' ? 'you can read, and say from the Calendar whether your child is coming' : 'you can read, not change'}.</div>`
    : '';
  /* Never let a rehearsal pass for the real thing. Both facts are worth saying
     out loud: a test club holds invented data and publishes nothing, and a
     non-production environment is a different database with its own rules. */
  const envNote = (isSandbox() || envName())
    ? `<div class="rolebar test">${isSandbox() ? '<b>Test club</b> — invented data, nothing here is published to parents' : ''}${isSandbox() && envName() ? ' · ' : ''}${envName() ? `Environment <b>${esc(envName())}</b>` : ''}</div>`
    : '';
  const g = ui.gameView;
  /* The brackets are load-bearing. `===` binds looser than `+`, so without them
     this reads as (roleNote + roNote + v) === 'game': the banners are swallowed
     by the comparison instead of rendered, and anybody who has one — a tracker,
     a parent, a coach reading another team — falls all the way through the chain
     to the games list the moment they open a game. A tracker could not reach the
     Track tab at all, which is the only screen her role exists for. */
  // a request still waiting, from a team link put aside with "Not now"
  const joinNote = join && join.hidden && join.status === 'sent'
    ? `<div class="rolebar">Waiting for a coach of <b>${esc((join.doc || {}).teamName || 'a team')}</b> to let you in. <button class="linkbtn dark" data-act="joinshow">Open</button></div>` : '';
  // said on every screen, because a change the club refused is one that exists only here
  const nRef = fb ? refusedCount() : 0;
  const fullNote = storeFail ? `<div class="rolebar warn"><b>This phone is out of storage space.</b> Changes since ${esc(niceTime(pad2(new Date(storeFail).getHours()) + ':' + pad2(new Date(storeFail).getMinutes())))} may not be kept on it if the app closes. ${fb && online ? 'Anything already sent to the club is safe. ' : ''}Free up space (photos, other apps or sites), and this goes once a save gets through.</div>` : '';
  const saveNote = fullNote + (nRef ? `<div class="rolebar warn">${nRef} change${nRef === 1 ? '' : 's'} on this phone ha${nRef === 1 ? 's' : 've'}n't been accepted by the club's database. ${nRef === 1 ? 'It is' : 'They are'} kept here and tried again each time you connect. <button class="linkbtn dark" data-act="pendingsheet">See ${nRef === 1 ? 'it' : 'them'}</button></div>` : '');
  /* Redrawing is how every tap shows its result, and replacing the whole page
     can leave the window somewhere else: on the Plan tab, picking the 60:00
     snapshot dropped the coach back at the top every time. When this draw is
     the same screen as the last one, put her back where she was. A different
     screen keeps the old behaviour (and toTop() where a caller asks for it). */
  const here = [v, g, ui.matchId, ui.teamId].join('|');
  const keepY = here === lastScreen && typeof window !== 'undefined' ? window.scrollY || 0 : null;
  lastScreen = here;
  app.innerHTML = envNote + saveNote + joinNote + roleNote + roNote + (
    v === 'game' ? (g === 'track' ? viewTrack() : g === 'stats' ? viewStats() : g === 'pitch' ? viewMatch() : g === 'plan' ? viewPlan() : g === 'subs' ? viewSubs() : viewFeed()) :
      v === 'roster' ? viewRoster() :
        v === 'season' ? viewSeason() : v === 'calendar' ? viewCalendar() :
          v === 'formation' ? viewFormation() : v === 'club' ? viewClub() : v === 'people' ? viewPeople() : v === 'admin' ? viewAdmin()
            : v === 'mine' ? viewMine() : v === 'teamset' ? viewTeamSet() : v === 'practice' ? viewPractice()
              : v === 'inbox' ? viewInbox() : v === 'thread' ? viewThread() : v === 'sessions' ? viewSessions()
              : v === 'setup' ? viewSetup() : viewMatches());
  syncHash();
  if (keepY && (window.scrollY || 0) !== keepY) { try { window.scrollTo(0, keepY); } catch (e) { } }
  if (v === 'game' && g === 'pitch') wireDrag();
  if (v === 'formation') wireFormationDrag();
  saveUi();
  markSeen();
  paintBell();
  // last, because a listener that answers at once from its cache renders again
  watchMessages();
  watchClaims();
  watchSess();
}

/* Shown when the rules refuse us. Deliberately not a dead end: both the code and
   the account can be changed from here. */
function purgedScreen() {
  const why = {
    retired: 'This club has been retired by its admin.',
    access: 'Your access to this club was withdrawn more than a day ago.'
  }[purged] || 'This club is no longer available.';
  return `<div class="stack"><div class="empty"><strong>Local copy removed</strong>
    ${esc(why)} The copy this device was holding has been cleared.
    <div class="row" style="margin-top:14px;justify-content:center">
      <button class="btn quiet" data-act="clubswitch">Other clubs</button></div></div>
    <p class="muted" style="text-align:center">Anything downloaded with <b>Download a copy</b> is yours and is not affected.</p></div>`;
}

function lockScreen() {
  return `<div class="stack">
    <div class="empty"><strong>This workspace needs a sign-in</strong>
      ${me ? `You are signed in as <b>${esc(me.name)}</b>, but no role has been granted to this account yet. Ask the club admin for an invite link.`
      : 'The data here is protected. Sign in with the account a coach has given access to.'}
      <div class="row" style="margin-top:14px;justify-content:center">
        ${me ? `<button class="btn quiet" data-act="signout">Sign out</button>` : `<button class="btn" data-act="signinsheet">Sign in</button>`}
      </div></div>
    <p class="muted" style="text-align:center">Read-only score pages need none of this — they keep working from their own link.</p>
  </div>`;
}

/* Club › Team › Game. Each segment is its own switcher, so the structure of the
   app is the navigation rather than something you have to learn. */
function crumbs() {
  const org = (acc().org || {}).name || 'Club';
  const t = team();
  const m = ui.view === 'game' ? match() : null;
  const out = [`<button class="crumb crumb-club" data-act="goview" data-v="club">${clubCrest('xs')}<span><span class="crumb-k">Club</span>${esc(org)}</span></button>`];
  if (t) out.push(`<span class="crumb-sep">\u203a</span>
    <button class="crumb" data-act="goteam" data-id="${t.id}"><span class="crumb-k">Team</span>${teamLabel(t)}</button>`);
  if (m) out.push(`<span class="crumb-sep">\u203a</span>
    <button class="crumb" data-act="pickgame"><span class="crumb-k">Game</span>${esc(m.opponent || 'Game')}</button>`);
  return out.join('');
}

function viewClub() {
  const org = (acc().org || {}).name || 'Club';
  const list = myTeams();
  const now = nowMs();
  return `<div class="stack">
    <h2>${esc(org)}</h2>
    <div class="clubhead">${clubCrest('lg')}<div><b>${esc(org)}</b>
      <span class="rowsub">${myTeams().length} team${myTeams().length === 1 ? '' : 's'} you can reach</span></div></div>
    ${guardsAnyone() ? `<button class="card" data-act="goview" data-v="mine" style="text-align:left;width:100%">
      <b>My players</b><span class="rowsub">${myPlayers().map(x => esc(x.p.name)).join(', ')}</span></button>` : ''}
    ${canSessions() ? `<button class="card" data-act="goview" data-v="sessions" style="text-align:left;width:100%">
      <b>Training sessions</b><span class="rowsub">${esc(sessClubLine())}</span></button>` : ''}
    ${list.length ? list.map(t => {
    const ms = teamMatches(t.id);
    const live = ms.find(x => gameStatus(x) === 'live');
    const next = ms.filter(x => gameStatus(x) === 'upcoming' && !CALLED[x.called]).slice(-1)[0];
    const last = ms.find(x => gameStatus(x) === 'done');
    const sub = live ? `Playing now — ${esc(live.opponent || 'TBC')} ${score(live).us}–${score(live).them}`
      : next ? `Next: ${esc(next.opponent || 'TBC')}${next.date ? ' · ' + shortDate(next.date) : ''}`
        : last ? `Last: ${esc(last.opponent || 'TBC')} ${score(last).us}–${score(last).them}` : 'No games yet';
    return `<button class="card teamcard" data-act="goteam" data-id="${t.id}">
      ${teamCrest(t)}
      <span class="tc-main"><b>${teamLabel(t)}</b>
        <span class="rowsub">${sub}</span>
        <span class="rowsub">${Object.keys(t.players || {}).length} players · ${ms.length} game${ms.length === 1 ? '' : 's'}${canEditTeam(t.id) ? '' : ' · view only'}</span></span>
      ${live ? '<span class="pill live">live</span>' : ''}
    </button>`;
  }).join('')
      : `<div class="empty"><strong>No teams yet</strong>${canAdmin() ? 'Add one from Club settings.' : 'Nothing has been shared with your account.'}</div>`}
    ${canAdmin() ? `<button class="btn quiet wide" data-act="newteam">Add a team</button>
    <button class="btn quiet wide" data-act="goview" data-v="admin">Club settings</button>` : ''}
  </div>`;
}

function sheetAccount() {
  const r = myRole();
  openSheet(`<h3>${esc(me.name)}</h3>
    <p class="muted" style="margin-top:0">${esc(me.email || '')}${r ? ` · ${esc(ROLE_LABEL[r])}` : ''}</p>
    <button class="opt" data-act="goview" data-v="setup"><b>Settings</b>
      <span class="rowsub">Workspace, sharing, backup, version</span></button>
    ${guardsAnyone() ? `<button class="opt" data-act="goview" data-v="mine"><b>My players</b>
      <span class="rowsub">${myPlayers().map(x => esc(x.p.name)).join(', ')}</span></button>` : ''}
    <button class="btn danger wide" data-act="signout" style="margin-top:8px">Sign out</button>
    <p class="muted">Club settings live under the club itself, since you may belong to more than one.</p>`);
}

/* The clubs this device keeps a copy of, plus the ones this account belongs to
   (userOrgs, AUTH.md's reverse index) that it has never opened — which is how
   a coach's second device finds her club without a code or a fresh invite. */
function knownClubs() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_DATA + ':')) continue;
      let code = k.slice(LS_DATA.length + 1);
      // a bucket belonging to another environment is not a club of this one
      const pre = envPrefix();
      if (pre) { if (!code.startsWith(pre)) continue; code = code.slice(pre.length); }
      else if (code.includes('~')) continue;
      if (code === 'local') continue;
      let name = code;
      try { const d = JSON.parse(localStorage.getItem(k)); name = ((d.access || {}).org || {}).name || code; } catch (e) { }
      out.push({ code, name });
    }
  } catch (e) { }
  // clubs this account belongs to that this device has never opened
  for (const [code, v] of Object.entries(myClubs || {}))
    if (!out.some(c => c.code === code)) out.push({ code, name: (v && v.name) || code });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function sheetClubSwitch() {
  const here = wsCode();
  const list = knownClubs();
  openSheet(`<h3>Clubs</h3>
    ${list.map(c => `<div class="opt spread">
      <button class="plainbtn" data-act="switchclub" data-code="${esc(c.code)}" style="flex:1;text-align:left">
        <b>${esc(c.name)}</b><span class="rowsub">${c.code === here ? 'open now' : 'tap to open'}</span></button>
      ${c.code === here ? '<span class="muted">here</span>'
      : `<button class="btn quiet sm" data-act="forgetclub" data-code="${esc(c.code)}">Forget</button>`}</div>`).join('')}
    <p class="muted">Forget removes this device's copy only. Deleting a club for everyone is a Firebase console job — see below.</p>
    <button class="opt" data-act="goview" data-v="club"><b>Club home</b>
      <span class="rowsub">Teams, stats and settings for ${esc((acc().org || {}).name || 'this club')}</span></button>
    <p class="muted">Clubs are invite only. If one is missing, ask its admin for an invite link.</p>`);
}

function sheetClubMenu() {
  const org = (acc().org || {}).name || 'Club';
  openSheet(`<h3>${esc(org)}</h3>
    ${canAdmin() ? `<button class="opt" data-act="goview" data-v="admin"><b>Club admin</b>
      <span class="rowsub">Teams, people and roles, club details</span></button>` : ''}
    ${guardsAnyone() ? `<button class="opt" data-act="goview" data-v="mine"><b>My players</b>
      <span class="rowsub">${myPlayers().length} linked to your account</span></button>` : ''}
    <button class="opt" data-act="goview" data-v="setup"><b>Your settings</b>
      <span class="rowsub">Account, workspace, sharing, backup</span></button>
    ${me ? `<button class="opt" data-act="signout"><b>Sign out</b>
      <span class="rowsub">${esc(me.email || me.name)}</span></button>`
      : `<button class="opt" data-act="signinsheet"><b>Sign in</b></button>`}`);
}

function needTeam() {
  const c = wsCode();
  return `<div class="empty"><strong>No teams here</strong>${c ? `Nothing is stored under <code>${esc(c)}</code>. If you expected teams, check the code character by character — it is case sensitive and order matters.` : 'Add a team, then its players. Everything else hangs off that.'}
  <div style="margin-top:14px"><button class="btn" data-act="newteam">Add a team</button></div></div>`;
}


function shortDate(d) {
  if (!d) return '';
  const [y, mo, da] = d.split('-').map(Number);
  return da + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1];
}

function gameBar(t, m) {
  const sc = score(m);
  const n = teamMatches(t.id).length;
  const list = teamMatches(t.id);
  const i = list.findIndex(x => x.id === m.id);
  const older = i > -1 ? list[i + 1] : null;     // list runs newest first
  const newer = i > 0 ? list[i - 1] : null;
  return `<button class="backbtn" data-act="backgames" aria-label="All games">
    <svg viewBox="0 0 12 12" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 2L3.5 6l4 4"/></svg></button>
  ${older ? `<button class="stepbtn" data-act="pickgame2" data-id="${older.id}" aria-label="Older game" title="${esc(older.opponent || '')}">‹</button>` : ''}
  <button class="gamebar" data-act="pickgame">
    <span class="gb-name">${esc(m.opponent || 'Unnamed')}${m.date ? ' · ' + shortDate(m.date) : ''}</span>
    <span class="gb-score">${sc.us}–${sc.them}</span>
    ${n > 1 ? `<span class="gb-hint">${i + 1}/${n}</span>` : ''}
  </button>
  ${newer ? `<button class="stepbtn" data-act="pickgame2" data-id="${newer.id}" aria-label="Newer game" title="${esc(newer.opponent || '')}">›</button>` : ''}
  <button class="sharebtn" data-act="sharesheet" aria-label="Share">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></button>`;
}

function sheetPickGame() {
  const t = team(), cur = ui.matchId;
  const list = teamMatches(t.id);
  openSheet(`<h3>Which game?</h3>
    ${list.map(g => {
    const sc = score(g);
    return `<button class="opt spread" type="button" data-act="pickgame2" data-id="${g.id}" aria-current="${g.id === cur}">
      <span>${esc(g.opponent || 'Unnamed')}<span class="rowsub">${esc(g.date || '')} · <span data-live="gmins" data-mid="${g.id}">${mins(elapsedSec(g))}</span> min played${running(g) ? ' · running' : ''}</span></span>
      <span class="pmins">${sc.us}<small>–${sc.them}</small></span></button>
`;
  }).join('') || '<p class="muted">No games yet.</p>'}
    ${cur && state.matches[cur] && !readOnlyHere() ? `<button class="btn quiet wide" data-act="editmatch" data-id="${cur}" style="margin-bottom:8px">Edit this game's details</button>` : ''}
    ${addGameBtn('btn wide')}`);
}

function anomalyBanner(t, m) {
  const list = anomalies(m);
  if (!list.length) return '';
  const nm = pid => esc(((t.players || {})[pid] || {}).name || 'someone');
  return `<div class="warn alert"><div class="spread">
    <span>${list.map(a => a.kind === 'double'
    ? `${nm(a.pid)} has two open spells — she was probably subbed on from two phones at once`
    : `${a.n} players on the pitch, ${a.cap} expected`).join(' · ')}</span>
    ${list.some(a => a.kind === 'double') ? '<button class="btn sm" data-act="repair">Fix</button>' : ''}
  </div></div>`;
}

function clockCard(m, now, controls) {
  const el = elapsedSec(m, now);
  if (m.ended) {
    return `<div class="clockwrap">
      <div class="clockline">
        <div class="clock" id="clock">${mmss(el)}</div>
        <div class="clockmeta"><b>Full time</b></div>
      </div>
      ${controls ? `<div class="clockbtns">
        <span class="pill live" style="align-self:center">Ended · ready for stats</span>
      </div>
      <button class="linkbtn" data-act="reopengame">Ended by mistake?</button>`
        : `<p class="clocknote">Game ended.</p>`}</div>`;
  }
  return `<div class="clockwrap">
    <div class="clockline">
      <div class="clock" id="clock">${mmss(el)}</div>
      <div class="clockmeta"><b>${esc(halfName(m, m.currentHalf || 1))}</b><span id="halfclock">${mmss(halfSec(m, now))}</span> of ${m.periodMinutes || 40}:00</div>
    </div>
    ${controls ? `<div class="clockbtns">
      ${running(m)
      ? `<button class="btn stop" data-act="pause">Pause</button><button class="btn stop" data-act="endhalf">End ${esc(halfName(m, m.currentHalf || 1)).toLowerCase()}</button>`
      : `<button class="btn" data-act="start">${el ? 'Resume' : 'Start clock'}</button>${el ? `<button class="btn stop" data-act="endhalf">End ${esc(halfName(m, m.currentHalf || 1)).toLowerCase()}</button>` : ''}`}
    </div>
    ${el || running(m) ? `<button class="btn quiet wide" data-act="endgame" style="margin-top:8px">End game</button>` : ''}
    <button class="linkbtn" data-act="fixclock">Clock reading wrong?</button>`
      : `<p class="clocknote">${running(m) ? 'Running' : el ? 'Paused' : 'Not started'} — the coach runs the clock.</p>`}</div>`;
}

function scoreCard(t, m) {
  const sc = score(m);
  return `<div class="card scorecard">
    <div class="scoreside"><span class="scorelbl">${teamLabel(t)}</span><span class="scorenum">${sc.us}</span>
      <button class="btn sm" data-act="goal" data-side="us">Goal</button></div>
    <div class="scoresep"></div>
    <div class="scoreside"><span class="scorelbl">${esc(m.opponent || 'Them')}</span><span class="scorenum">${sc.them}</span>
      <button class="btn quiet sm" data-act="goal" data-side="them">Goal</button></div>
  </div>`;
}

/* Everything that happened, in one list, so the Track tab stops being four
   separate scrolling piles. */
function timeline(t, m) {
  const us = teamLabel(t), them = esc(m.opponent || 'Them');
  const nm = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : null; };
  const who = x => stampOf(x).name ? ` <span class="muted">· ${esc(stampLabel(x))}</span>` : '';
  const side = sd => sd === 'us' ? `<span class="on">${us}</span>` : `<span class="off">${them}</span>`;
  const rows = [];

  for (const [id, x] of Object.entries(m.goals || {}))
    rows.push({ t: x.t, g: 'goal', act: 'fixgoal', id, h: `<b>Goal</b> ${side(x.side)}${x.pid ? ' — ' + nm(x.pid) : ''}${x.assist ? ` <span class="muted">(assist ${nm(x.assist)})</span>` : ''}${who(x)}` });
  for (const [id, x] of Object.entries(m.shots || {}))
    rows.push({ t: x.t, g: 'shot', act: 'fixshot', id, h: `Shot ${x.onTarget ? 'on target' : 'off target'} ${side(x.side)}${x.pid ? ' — ' + nm(x.pid) : ''}${who(x)}` });
  for (const [id, x] of Object.entries(m.events || {}))
    rows.push({ t: x.t, g: 'set', act: 'fixev', id, h: `${esc(evLabel(x.kind).replace(/s$/, ''))} ${side(x.side)}${x.pid ? ' — ' + nm(x.pid) : ''}${who(x)}` });
  for (const [id, x] of Object.entries(m.poss || {}))
    rows.push({ t: x.t, g: 'poss', act: 'fixposs', id, h: `Turnover — ${side(x.to)} won it${x.pid ? ' — ' + nm(x.pid) : ''}${who(x)}` });
  /* A tap on the planned-subs card, as its own line: which planned change it
     was, and who said so. The subs it made follow it by name (it is pushed
     first, and the sort keeps ties in order); a skip made none, so without this
     line it would leave no trace at all. Not editable here — Undo is on the card. */
  for (const [key, x] of Object.entries(m.planDone || {})) {
    const start = Number(String(key).slice(1));
    if (!x || isNaN(start)) continue;
    const when = start ? esc(snapLabel(m, start)) : null;
    rows.push({
      t: x.t != null ? x.t : secFromAbs(m, x.at || 0), g: 'sub', id: key, fixed: true,
      h: `<b>${when ? 'Planned subs' : 'Starting lineup'} ${x.skipped ? 'skipped' : when ? 'made' : 'on'}</b> `
        + `<span class="muted">(${when || 'from the plan'})</span>${who(x)}`
    });
  }
  subEvents(m).forEach((r, i) => rows.push({
    t: r.t, g: 'sub', act: 'fixsub', id: String(i),
    h: r.move ? `${nm(r.on)} moved to <span class="on">${esc(r.spot || 'a new spot')}</span>`
      : `${r.on ? `<span class="on">${nm(r.on)} on</span>` : ''}${r.on && r.off ? ' for ' : ''}${r.off ? `<span class="off">${nm(r.off)} off</span>` : ''}`
  }));

  return rows.sort((a, b) => b.t - a.t);
}

/* --- track: everything a second pair of hands can log --- */
function viewTrack() {
  const t = team(); if (!t) return needTeam();
  let m = match();
  if (!m || m.teamId !== t.id) { const l = teamMatches(t.id); m = l[0] || null; ui.matchId = m ? m.id : null; }
  if (!m) return `<div class="empty"><strong>No game yet</strong>Create a game first.
    ${readOnlyHere() ? '' : `<div style="margin-top:14px">${addGameBtn('btn')}</div>`}</div>`;

  const now = nowMs();
  const name = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : 'Unknown'; };
  const us = teamLabel(t), them = esc(m.opponent || 'Them');


  const sh = shotTally(m);
  const shotsCard = `<div class="card"><div class="spread" style="margin-bottom:10px">
      <h2>Shots</h2><span class="muted">goals count as on target</span></div>
    <div class="tallygrid">
      <span></span><span class="tallyhead">${us}</span><span class="tallyhead">${them}</span>
      <span class="tallylbl">On target</span>
      <button class="tallybtn" data-act="shot" data-side="us" data-on="1"><b>${sh.usOn}</b><span>tap</span></button>
      <button class="tallybtn" data-act="shot" data-side="them" data-on="1"><b>${sh.themOn}</b><span>tap</span></button>
      <span class="tallylbl">Off target</span>
      <button class="tallybtn" data-act="shot" data-side="us" data-on="0"><b>${sh.usOff}</b><span>tap</span></button>
      <button class="tallybtn" data-act="shot" data-side="them" data-on="0"><b>${sh.themOff}</b><span>tap</span></button>
    </div>
</div>`;

  lastLog = subEvents(m);
  const tl = timeline(t, m);
  const F = ui.logFilter || 'all';
  const shown = F === 'all' ? tl : tl.filter(r => r.g === F);
  const logCard = `<div class="card" id="matchlog"><div class="spread" style="margin-bottom:10px">
      <h2>Match log</h2><span class="muted">${tl.length} entr${tl.length === 1 ? 'y' : 'ies'}</span></div>
    <div class="chips" style="margin-bottom:10px">
      ${[['all', 'All'], ['goal', 'Goals'], ['shot', 'Shots'], ['set', 'Set pieces'], ['sub', 'Subs'], ['poss', 'Turnovers']]
      .map(([k, l]) => `<button class="chip" type="button" data-act="logfilter" data-v="${k}" aria-pressed="${F === k}">${l}</button>`).join('')}
    </div>
    ${shown.length ? `<div class="log">${shown.slice(0, 40).map(r => r.fixed
      ? `<div class="logrow"><span class="t">${mmss(r.t)}</span><span>${r.h}</span><span></span></div>`
      : `<button type="button" data-act="${r.act}" data-id="${r.id}" data-i="${r.id}">
      <span class="t">${mmss(r.t)}</span><span>${r.h}</span><span class="muted">edit</span></button>`).join('')}</div>
      ${shown.length > 40 ? `<p class="muted" style="margin-bottom:0">Showing the last 40 of ${shown.length}.</p>` : ''}`
      : '<p class="muted" style="margin:0">Nothing logged yet.</p>'}</div>`;

  const rows = tracked(t);
  const setCard = `<div class="card"><div class="spread" style="margin-bottom:10px">
      <h2>Set pieces and fouls</h2>${canEditTeam(t.id) ? '<button class="btn quiet sm" data-act="trackcfg">Choose</button>' : ''}</div>
    ${rows.length ? `<div class="tallygrid">
      <span></span><span class="tallyhead">${us}</span><span class="tallyhead">${them}</span>
      ${rows.map(e => `<span class="tallylbl">${e.label}<span class="conv">${e.who}</span></span>
        <button class="tallybtn" data-act="ev" data-kind="${e.k}" data-side="us"><b>${evCount(m, e.k, 'us')}</b><span>tap</span></button>
        <button class="tallybtn" data-act="ev" data-kind="${e.k}" data-side="them"><b>${evCount(m, e.k, 'them')}</b><span>tap</span></button>`).join('')}
    </div>` : `<p class="muted" style="margin:0">Nothing switched on. ${canEditTeam(t.id) ? 'Tap Choose to pick what you want to count.' : "The team's coach picks what to count."}</p>`}
</div>`;

  const who = whoAmI();
  const whoBar = `<button class="gamebar" data-act="setwho">
    <span class="gb-label">Logging as</span>
    <span class="gb-name">${who ? esc(who) : 'nobody — tap to set a name'}</span>
    <span class="gb-hint">${me ? 'signed in' : 'change'}</span></button>`;

  const possButtons = possOn(t) ? `<div class="card"><h2 style="margin-bottom:10px">Turnovers</h2>
    <div class="row"><button class="btn sm" data-act="poss" data-side="us" style="flex:1">${us} won it</button>
      <button class="btn quiet sm" data-act="poss" data-side="them" style="flex:1">${them} won it</button></div>
    ${possList(m).length ? `<button class="linkbtn dark" data-act="undoposs">Undo the last one</button>` : ''}</div>` : '';

  const whoTidy = Object.keys(trackersIn(m)).length > 1 ? `<div class="card"><h2 style="margin-bottom:8px">Who logged what</h2>
      <p class="muted" style="margin-top:0">More than one person has been tapping. If someone double-counted, you can drop everything they logged without touching anyone else's.</p>
      <button class="btn quiet wide" data-act="trackerclean">Review by tracker</button></div>` : '';

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    ${clockCard(m, now, !restricted())}
    ${subsCard(t, m, now)}
    ${scoreCard(t, m)}
    ${shotsCard}
    ${setCard}
    ${possButtons}
    ${logCard}
    ${whoBar}
    ${whoTidy}
  </div>`;
}


/* --- stats: read, do not tap. Safe mid-game or days later. --- */
function viewStats() {
  const t = team(); if (!t) return needTeam();
  let m = match();
  if (!m || m.teamId !== t.id) { const l = teamMatches(t.id); m = l[0] || null; ui.matchId = m ? m.id : null; }
  if (!m) return `<div class="empty"><strong>No game yet</strong>Create a game first.</div>`;

  const now = nowMs();
  const us = teamLabel(t), them = esc(m.opponent || 'Them');
  const nm = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : 'Unknown'; };
  const sc = score(m), sh = shotTally(m);
  const halves = [...new Set(segments(m).map(x => x.half || 1))].sort();
  const byHalf = (list, pick) => halves.map(h => list.filter(x => halfOfSec(m, x.t) === h).filter(pick).length);

  const po = possession(m, now);
  const pct = po.settled ? Math.round(po.us / po.settled * 100) : 50;
  const cpct = po.total ? Math.round(po.contested / po.total * 100) : 0;
  const located = shotList(m).filter(x => x.xy && x.xy.x != null);
  const roster = squad(t, m);
  const shotsAll = sh.usOn + sh.usOff, shotsThemAll = sh.themOn + sh.themOff;

  const headline = `<div class="card">
    <h2>${us} ${sc.us} — ${sc.them} ${them}</h2>
    <div class="muted">${gameStatus(m) === 'done' ? (m.ended ? 'Final' : 'Full time') : gameStatus(m) === 'live' ? 'In progress' : 'Not started'} · <span data-live="clock" data-mid="${m.id}">${mmss(elapsedSec(m, now))}</span> played${m.date ? ' · ' + esc(shortDate(m.date)) : ''}</div></div>`;

  const halfTable = halves.length > 1 ? `<div class="card"><h2 style="margin-bottom:10px">By half</h2>
    <div class="statgrid" style="grid-template-columns:1fr ${halves.map(() => '48px').join(' ')}">
      <span></span>${halves.map(h => `<span class="tallyhead">${esc(halfName(m, h)).replace(' half', '')}</span>`).join('')}
      <span class="tallylbl">Goals ${us}</span>${byHalf(goalList(m), x => x.side === 'us').map(v => `<b>${v}</b>`).join('')}
      <span class="tallylbl">Goals ${them}</span>${byHalf(goalList(m), x => x.side === 'them').map(v => `<b>${v}</b>`).join('')}
      <span class="tallylbl">Shots ${us}</span>${byHalf(shotList(m), x => x.side === 'us').map(v => `<b>${v}</b>`).join('')}
      <span class="tallylbl">Shots ${them}</span>${byHalf(shotList(m), x => x.side === 'them').map(v => `<b>${v}</b>`).join('')}
    </div></div>` : '';

  const shotsCard = (shotsAll + shotsThemAll) ? `<div class="card"><h2 style="margin-bottom:10px">Shots</h2>
    <div class="statgrid" style="grid-template-columns:1fr 48px 48px">
      <span></span><span class="tallyhead">${us}</span><span class="tallyhead">${them}</span>
      <span class="tallylbl">On target</span><b>${sh.usOn}</b><b>${sh.themOn}</b>
      <span class="tallylbl">Off target</span><b>${sh.usOff}</b><b>${sh.themOff}</b>
      <span class="tallylbl">Scored from</span><b>${shotsAll ? Math.round(sc.us / shotsAll * 100) : 0}%</b><b>${shotsThemAll ? Math.round(sc.them / shotsThemAll * 100) : 0}%</b>
    </div></div>` : '';

  const evRows = tracked(t).filter(e => evCount(m, e.k, 'us') + evCount(m, e.k, 'them') > 0);
  const evCard = evRows.length ? `<div class="card"><h2 style="margin-bottom:10px">Set pieces and fouls</h2>
    <div class="statgrid" style="grid-template-columns:1fr 48px 48px">
      <span></span><span class="tallyhead">${us}</span><span class="tallyhead">${them}</span>
      ${evRows.map(e => `<span class="tallylbl">${e.label}<span class="conv">${e.who}</span></span>
        <b>${evCount(m, e.k, 'us')}</b><b>${evCount(m, e.k, 'them')}</b>`).join('')}
    </div></div>` : '';

  const possCard = po.total ? `<div class="card"><div class="spread" style="margin-bottom:10px">
      <h2>Possession</h2><span class="muted">${po.changes} markers</span></div>
    <div class="possbar"><i style="width:${Math.round(po.us / po.total * 100)}%"></i><u style="width:${cpct}%"></u></div>
    <div class="spread" style="margin:6px 0 4px"><span>${pct}% ${us}</span><span class="muted">${100 - pct}% ${them}</span></div>
    <p class="muted" style="margin:0">Of settled play. ${cpct}% was scrappy — held under ${po.min}s, counted for neither side. Built from ${po.tapped} tap${po.tapped === 1 ? '' : 's'} plus every set piece, foul and kick-off.</p></div>` : '';

  const mapCard = located.length ? `<div class="card"><div class="spread" style="margin-bottom:10px">
      <h2>Shot map</h2><span class="muted">${located.length} of ${shotList(m).length} placed</span></div>
    <div class="minipitch">
      <svg viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".5">
          <rect x="2" y="2" width="64" height="96"/><line x1="2" y1="50" x2="66" y2="50"/>
          <circle cx="34" cy="50" r="9"/><rect x="16" y="2" width="36" height="15"/>
          <rect x="26" y="2" width="16" height="6"/></g></svg>
      ${located.map(x => `<button class="dot" data-act="fixshot" data-id="${x.id}" data-side="${x.side}" data-on="${x.onTarget ? 1 : 0}"
        style="left:${clamp(x.xy.x, 2, 98)}%;top:${clamp(x.xy.y, 2, 98)}%" title="${mmss(x.t)}"></button>`).join('')}
    </div>
    <p class="muted" style="margin-bottom:0">Both teams attacking upward. Filled means on target.</p></div>` : '';

  const goals = goalList(m).slice().reverse();
  const goalsCard = goals.length ? `<div class="card"><h2 style="margin-bottom:10px">Goals</h2>
    <div class="log">${goals.map(g => `<button type="button" data-act="fixgoal" data-id="${g.id}">
      <span class="t">${mmss(g.t)}</span>
      <span>${g.side === 'us' ? `<span class="on">${us}</span>` : `<span class="off">${them}</span>`}${g.pid ? ' — ' + nm(g.pid) : ''}${g.assist ? ` <span class="muted">(assist ${nm(g.assist)})</span>` : ''}</span>
      <span class="muted">edit</span></button>`).join('')}</div></div>` : '';

  const minutesCard = `<div class="card"><h2 style="margin-bottom:10px">Minutes</h2>
    <div class="plist">${roster.map(p => {
    const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
    const rs = roleSummary(m, p.id, now);
    return `<div class="prow">
      <span class="pnum">${esc(p.number ?? '')}</span>
      <span><span class="pname">${esc(p.name)}</span><span class="psub">${esc(rs) || (pd > 0 ? mins(pd) + ' min planned' : 'no plan set')}</span></span>
      <span class="pmins"><span data-live="pmins" data-mid="${m.id}" data-pid="${p.id}">${mins(pl)}</span><small> min</small><span data-live="diff" data-mid="${m.id}" data-pid="${p.id}">${diffTag(pl, pd)}</span></span>
    </div>`;
  }).join('')}</div></div>`;

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    ${headline}${halfTable}${shotsCard}${mapCard}${possCard}${evCard}${goalsCard}${minutesCard}
    ${restricted() ? '' : aiButton('game')}
  </div>`;
}

/* --- live: the game as it happens, in words, for anyone following ---
   The Subs tab is the coach's working screen and nobody else can use it; Stats
   is the tallies. Neither answers "what's going on?" for a parent in the car
   park or a grandparent at home. This does, and it is the one game screen every
   role gets. Built entirely from what is already stored — periods, goals,
   stints, shots, events — so it needs no new data and cannot disagree with the
   other tabs. Items are plain text, escaped once at render, because the same
   words go into a system notification where HTML means nothing. */
function feedItems(t, m) {
  const us = (t && t.name) || 'Us', them = m.opponent || 'Them';
  const sideName = sd => sd === 'us' ? us : them;
  const nm = id => { const p = ((t && t.players) || {})[id]; return p ? p.name || 'Unknown' : 'Unknown'; };
  const pc = m.periodCount || 2;
  const out = [];

  /* Kick-off and the breaks come from the periods. A half's end only counts
     once the game has moved past it: pausing the clock closes a segment too,
     and a pause is not half time. */
  const segs = segments(m).filter(s => s.start);
  const halves = [...new Set(segs.map(s => s.half || 1))].sort((a, b) => a - b);
  let acc = 0;
  const startAt = {}, endAt = {};
  for (const s of segs) {
    const h = s.half || 1;
    if (startAt[h] == null) startAt[h] = acc;
    acc += Math.floor(((s.end || nowMs()) - s.start) / 1000);
    if (s.end) endAt[h] = acc; else delete endAt[h];
  }
  let fullTime = false;
  for (const h of halves) {
    out.push({
      t: startAt[h], key: 'start:' + h, kind: 'start', big: true,
      title: h === 1 ? 'Kick-off' : `${halfName(m, h)} under way`,
      detail: h === 1 ? `${us} v ${them}` : ''
    });
    const over = endAt[h] != null && ((m.currentHalf || 1) > h || m.ended);
    if (!over) continue;
    const last = h >= pc || (m.ended && h === halves[halves.length - 1]);
    if (last) fullTime = true;
    out.push({
      t: endAt[h], key: last ? 'ft' : 'brk:' + h, kind: last ? 'end' : 'break', big: true,
      title: last ? 'Full time' : pc === 2 && h === 1 ? 'Half time' : `End of the ${halfName(m, h).toLowerCase()}`,
      detail: ''
    });
  }
  if (m.ended && !fullTime) out.push({ t: elapsedSec(m), key: 'ft', kind: 'end', big: true, title: 'Full time', detail: '' });

  // the score after each goal, which is what anyone following wants next
  let u = 0, th = 0;
  for (const g of goalList(m)) {
    if (g.side === 'us') u++; else th++;
    const by = g.side === 'us' && g.pid ? nm(g.pid) + (g.assist ? `, assist ${nm(g.assist)}` : '') : '';
    out.push({ t: g.t, key: 'goal:' + g.id, kind: 'goal', side: g.side, big: true, title: `Goal — ${sideName(g.side)}`, detail: by, score: `${u}–${th}` });
  }

  // starters are part of kick-off; a move between spots is the coach's business
  for (const r of subEvents(m)) {
    if (r.move) continue;
    const title = r.on && r.off ? `${nm(r.on)} on for ${nm(r.off)}` : r.on ? `${nm(r.on)} on` : `${nm(r.off)} off`;
    out.push({ t: r.t, key: `sub:${r.onSid || ''}:${r.offSid || ''}`, kind: 'sub', title: 'Sub', detail: title });
  }

  for (const x of shotList(m))
    out.push({ t: x.t, key: 'shot:' + x.id, kind: 'shot', side: x.side, minor: true,
      title: `Shot ${x.onTarget ? 'on target' : 'off target'} — ${sideName(x.side)}`, detail: x.side === 'us' && x.pid ? nm(x.pid) : '' });
  for (const x of evList(m))
    out.push({ t: x.t, key: 'ev:' + x.id, kind: 'set', side: x.side, minor: true,
      title: `${evLabel(x.kind).replace(/s$/, '')} — ${sideName(x.side)}`, detail: '' });

  /* Newest first. The clock stands still through a break, so a half's end, the
     next half's start and anything logged in between share a second: the start
     goes above the break, and the break above what was logged during it, which
     belongs to the half before. Kick-off goes under anything at 0:00. */
  const lift = x => x.kind === 'end' ? .3 : x.kind === 'start' ? (x.key === 'start:1' ? -.1 : .2) : x.kind === 'break' ? .1 : 0;
  const rank = { goal: 0, sub: 1, shot: 2, set: 3 };
  return out.sort((a, b) => (b.t + lift(b)) - (a.t + lift(a)) || (rank[a.kind] || 0) - (rank[b.kind] || 0));
}

// football minutes: the first minute is 1', not 0'
const feedMin = t => Math.floor((t || 0) / 60) + 1 + '′';

function viewFeed() {
  const t = team(); if (!t) return needTeam();
  let m = match();
  if (!m || m.teamId !== t.id) { const l = teamMatches(t.id); m = l[0] || null; ui.matchId = m ? m.id : null; }
  if (!m) return `<div class="empty"><strong>No game yet</strong>Nothing to follow until a game is set up.</div>`;

  const now = nowMs(), sc = score(m), st = gameStatus(m);
  const us = teamLabel(t), them = esc(m.opponent || 'Them');
  const status = st === 'done' ? 'Full time'
    : st === 'live' ? `${running(m) ? 'Live' : 'Paused'} · ${esc(halfName(m, m.currentHalf || 1))}`
      : `Not started${m.date ? ' · ' + esc(shortDate(m.date)) : ''}`;
  const head = `<div class="card feedhead" data-st="${st}">
    <div class="feedstatus">${st === 'live' && running(m) ? '<i class="livedot"></i>' : ''}${status}${st === 'upcoming' ? '' : ` · <span data-live="clock" data-mid="${m.id}">${mmss(elapsedSec(m, now))}</span>`}</div>
    <div class="feedscore"><span class="fs-side">${us}</span><span class="fs-num">${sc.us}–${sc.them}</span><span class="fs-side">${them}</span></div></div>`;

  const all = feedItems(t, m);
  const everything = !!ui.feedAll;
  const shown = everything ? all : all.filter(x => !x.minor);
  const starters = squad(t, m).filter(p => stintsOf(m, p.id).some(([, s]) => s.on === 0));
  const row = x => `<div class="feedrow" data-kind="${x.kind}"${x.side ? ` data-side="${x.side}"` : ''}>
      <span class="t">${x.kind === 'end' ? 'FT' : x.kind === 'break' ? 'HT' : feedMin(x.t)}</span>
      <span><b>${esc(x.title)}</b>${x.detail ? `<span class="fd">${esc(x.detail)}</span>` : ''}
        ${x.key === 'start:1' && starters.length ? `<span class="fd">Starting: ${starters.map(p => esc(p.name)).join(', ')}</span>` : ''}</span>
      ${x.score ? `<span class="fscore">${x.score}</span>` : '<span></span>'}</div>`;
  const feed = `<div class="card"><h2 style="margin-bottom:8px">What's happened</h2>
      <div class="chips" style="margin-bottom:10px"><button class="chip" type="button" data-act="feedall" data-v="0" aria-pressed="${!everything}">Key moments</button>
      <button class="chip" type="button" data-act="feedall" data-v="1" aria-pressed="${everything}">Everything</button></div>
    ${shown.length ? `<div class="feed">${shown.map(row).join('')}</div>`
      : `<p class="muted" style="margin:0">${st === 'upcoming' ? 'Nothing yet — this fills in from kick-off.' : 'Nothing logged yet.'}</p>`}</div>`;

  /* Notifications are honest about what a static site can do: there is no
     server to push from, so they come from this page while it is open — a
     background tab or a phone with the page left up, not a phone that has
     closed it. */
  const following = ui.follow === m.id;
  const canNotify = typeof Notification !== 'undefined';
  const follow = st === 'done' ? '' : `<div class="card"><div class="spread"><h2>Notify me</h2>
      <button class="btn ${following ? 'quiet ' : ''}sm" data-act="feedfollow" data-v="${following ? 0 : 1}">${following ? 'Stop' : 'Turn on'}</button></div>
    <p class="muted" style="margin:6px 0 0">${following
      ? `On for this game. Goals, kick-off, half time and full time ${canNotify && Notification.permission === 'granted' ? 'pop up on this device' : 'buzz and show here'} while this page is open.`
      : 'Get goals, kick-off, half time and full time on this device while this page is open, even in another tab.'}</p></div>`;

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    ${head}${follow}${feed}
  </div>`;
}

/* Run from the once-a-second ticker, so it sees changes from any phone the
   moment the sync lands. The first look at a game only takes note of what is
   already there — opening a game at half time should not fire every goal. */
let feedSeen = null, feedSeenFor = null;
function watchFeed() {
  const m = ui.follow ? state.matches[ui.follow] : null;
  if (!m) { feedSeen = null; feedSeenFor = null; return []; }
  const t = state.teams[m.teamId];
  const big = feedItems(t, m).filter(x => x.big);
  if (feedSeenFor !== m.id || !feedSeen) { feedSeen = new Set(big.map(x => x.key)); feedSeenFor = m.id; return []; }
  const fresh = big.filter(x => !feedSeen.has(x.key)).reverse();
  for (const x of fresh) { feedSeen.add(x.key); feedNotify(t, m, x); }
  return fresh;
}
function feedNotify(t, m, x) {
  const sc = score(m);
  const body = [x.detail, `${(t && t.name) || 'Us'} ${sc.us}–${sc.them} ${m.opponent || 'Them'}`].filter(Boolean).join(' · ');
  ping(x.title, body, 'minutes-' + m.id + '-' + x.key, x.kind === 'goal' ? [120, 60, 120, 60, 120] : [150]);
}
/* One way to get somebody's attention from a page that is open: a system
   notification when the tab is in the background and they said yes, otherwise
   a toast on the screen they are looking at, and a buzz either way. The Live
   tab's goals and the messages both come through here. */
function ping(title, body, tag, buzz) {
  let shown = false;
  try {
    if (typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, tag });
      shown = true;
    }
  } catch (e) { }   // Android Chrome refuses a page-made Notification; the buzz and toast still land
  if (!shown) toast(`${title} · ${String(body || '').slice(0, 140)}`);
  try { if (navigator.vibrate) navigator.vibrate(buzz || [150]); } catch (e) { }
}

/* --- subs: minutes and subs only, no pitch. This was the Live tab until Live
   became the feed everyone can follow; it is still the coach's main screen. --- */
function viewSubs() {
  const t = team(); if (!t) return needTeam();
  let m = match();
  if (!m || m.teamId !== t.id) { const l = teamMatches(t.id); m = l[0] || null; ui.matchId = m ? m.id : null; }
  if (!m) return `<div class="empty"><strong>No game yet</strong>Create a game to start tracking minutes.
    ${readOnlyHere() ? '' : `<div style="margin-top:14px">${addGameBtn('btn')}</div>`}</div>`;

  const now = nowMs();
  const el = elapsedSec(m, now);
  const roster = squad(t, m);
  const name = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : 'Unknown'; };

  const byNumber = ui.sortBy === 'number';
  const num = (a, b) => (Number(a.number) || 999) - (Number(b.number) || 999);
  // by need: longest on the pitch first, she is the one most likely due a rest
  const on = roster.filter(p => onField(m, p.id))
    .sort(byNumber ? num : (a, b) => (spellSec(m, b.id, now) || 0) - (spellSec(m, a.id, now) || 0));
  // by need: furthest behind planned first, she is the one most likely due to go on
  const bench = roster.filter(p => !onField(m, p.id))
    .sort(byNumber ? num : (a, b) => (plannedSec(m, b.id) - playedSec(m, b.id, now)) - (plannedSec(m, a.id) - playedSec(m, a.id, now)));

  const clock = clockCard(m, now, true);

  const planning = !!ui.plan;
  const items = staged();
  const pname = id => esc(((t.players || {})[id] || {}).name || '?');
  const planBar = planning ? `<div class="planbar">
    <div class="spread" style="margin-bottom:${items.length ? '8px' : '0'}">
      <b>Staging changes${items.length ? ` (${items.length})` : ''}</b>
      <button class="btn quiet sm" data-act="cancelplan">Cancel</button></div>
    ${items.length ? `<div class="planlist">${items.map((it, i) => `<div class="spread">
      <span>${it.k === 'sub' ? `${pname(it.in)} on for ${pname(it.out)}`
      : it.k === 'add' ? `${pname(it.pid)} on`
        : `${pname(it.pid)} moves to ${esc(it.label || 'a new spot')}`}</span>
      <button class="xbtn" data-act="unstage" data-i="${i}" aria-label="remove">×</button></div>`).join('')}</div>
      <button class="btn wide" data-act="applyplan" style="margin-top:10px">Make ${items.length} change${items.length === 1 ? '' : 's'} now</button>`
      : `<p class="muted" style="margin:8px 0 0;color:rgba(255,255,255,.8)">Pair players as usual, or tap a spot chip to move someone. Nothing happens until you send it.</p>`}
  </div>` : '';

  const picked = ui.picked ? (t.players || {})[ui.picked] : null;
  const pickedOn = picked && onField(m, picked.id);
  const room = on.length < (m.onFieldCount || 11);
  const banner = picked ? `<div class="pickbar">
    <span><b>${esc(picked.name)}</b> ${pickedOn ? 'coming off — tap who takes her place' : room ? 'going on' : 'going on — tap who she replaces'}</span>
    <span class="row">${!pickedOn && room ? `<button class="btn sm" data-act="${planning ? 'stageadd' : 'puton'}" data-pid="${picked.id}">Put on</button>` : ''}
    <button class="btn quiet sm" data-act="clearpick">Cancel</button></span></div>` : '';

  const row = (p, isOn) => {
    const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
    const diff = Math.round((pl - pd) / 60);
    const spell = isOn ? spellSec(m, p.id, now) : restSec(m, p.id, now);
    const tag = spell == null ? 'not on yet' : (isOn ? 'on ' : 'off ') + mmss(spell);
    const spot = isOn ? currentSpot(m, p.id) : null;
    return `<div class="liverow" data-on="${isOn ? 1 : 0}" data-picked="${ui.picked === p.id ? 1 : 0}" data-staged="${isStaged(p.id) ? 1 : 0}">
      <button class="lrmain" type="button" data-act="taplive" data-pid="${p.id}">
        <span class="pnum">${esc(p.number ?? '')}</span>
        <span><span class="pname">${esc(p.name)}</span>
          <span class="psub" data-spell="${p.id}">${tag}</span></span>
        <span class="livemins"><span data-mins="${p.id}">${mins(pl)}<small> min</small></span>
          ${pd > 0 ? `<span class="diff ${diff < 0 ? 'owed' : 'over'}">${diff < 0 ? -diff + ' owed' : diff > 0 ? diff + ' over' : 'on plan'}</span>` : ''}</span>
      </button>
      ${isOn ? `<button class="lrspot" type="button" data-act="switchpos" data-pid="${p.id}">
        <span>${esc(spot || 'set')}</span><span class="lrspot-hint">move</span></button>` : ''}
    </div>`;
  };

  const clashes = clashesOn(t, m);
  const warn = (clashes.length
    ? `<div class="warn">${clashes.map(([a, b]) => `${esc(a.name)} and ${esc(b.name)} are on together`).join(' · ')}</div>` : '')
    + anomalyBanner(t, m);

  lastLog = subEvents(m);
  const recent = lastLog.slice(0, 4);
  const logHtml = recent.length
    ? `<div class="log">${recent.map((r, i) => `<button type="button" data-act="fixsub" data-i="${i}">
        <span class="t">${mmss(r.t)}</span>
        <span>${r.move ? `${name(r.on)} moved to <span class="on">${esc(r.spot || 'a new spot')}</span>`
        : `${r.on ? `<span class="on">${name(r.on)} on</span>` : ''}${r.on && r.off ? ' for ' : ''}${r.off ? `<span class="off">${name(r.off)} off</span>` : ''}`}</span>
        <span class="muted">fix</span></button>`).join('')}</div>`
    : `<p class="muted" style="margin:0">Nothing yet.</p>`;

  const scCard = scoreCard(t, m);

  const startHint = on.length === 0 ? `<p class="muted" style="margin:0 0 10px">Tap a player on the bench, then <b>Put on</b>. Repeat until your starters are out there.
    ${planBlocks(m).length ? ' Or fill the whole lineup from the plan.' : ''}</p>
    ${planBlocks(m).length ? `<button class="btn quiet wide" data-act="applyblock" data-start="${(planBlockAt(m, el) || planBlocks(m)[0]).start}" style="margin-bottom:10px">Use the planned lineup</button>` : ''}` : '';

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    ${clock}
    ${subsCard(t, m, now)}
    ${scCard}
    ${planBar}
    ${banner}
    ${warn}
    <div class="card"><div class="spread" style="margin-bottom:8px">
      <h2>On the pitch</h2>
      <span class="row"><button class="btn quiet sm" data-act="togglesort">${byNumber ? 'By number' : 'By need'}</button>
      ${planning ? '' : '<button class="btn quiet sm" data-act="startplan">Batch</button>'}</span></div>
      <p class="muted" style="margin:0 0 10px">${on.length} of ${m.onFieldCount || 11} on${byNumber ? ', in shirt-number order' : ', longest spell first'}</p>
      ${startHint}
      <div class="plist">${on.map(p => row(p, true)).join('') || ''}</div></div>
    <div class="card"><div class="spread" style="margin-bottom:8px">
      <h2>Bench</h2><span class="muted">${byNumber ? 'by number' : 'most owed first'}</span></div>
      <div class="plist">${bench.map(p => row(p, false)).join('') || '<p class="muted" style="margin:0">Everyone is on.</p>'}</div></div>
    <div class="card"><div class="spread" style="margin-bottom:10px"><h2>Subs and switches</h2>
      <div class="row"><button class="btn quiet sm" data-act="addsub">Add</button>
      <button class="btn quiet sm" data-act="fixminutes">Fix</button></div></div>${logHtml}</div>
  </div>`;
}

function putOn(m, pid) {
  const t = team(), p = (t.players || {})[pid];
  const sl = ((m.formation && m.formation.slots) || []).find(x => !slotTaken(m, x.id));
  putOnField(m, pid, sl ? sl.x : 50, sl ? sl.y : 40 + (fieldIds(m).length * 7) % 40, sl ? sl.id : null);
  if (p) toast(`${p.name} on at ${mins(elapsedSec(m))}′`);
}

/* Simpler than the pitch version: one on, one off, that is a sub. */
function tapLive(pid) {
  const m = match(), t = team();
  const p = (t.players || {})[pid]; if (!p) return;
  if (ui.plan && isStaged(pid)) { toast(`${p.name} is already in this batch`); return; }
  if (!ui.picked) { ui.picked = pid; render(); return; }
  if (ui.picked === pid) { ui.picked = null; render(); return; }
  const a = ui.picked, b = pid;
  const aOn = onField(m, a), bOn = onField(m, b);
  if (aOn === bOn) {
    if (!aOn && !ui.plan && fieldIds(m).length < (m.onFieldCount || 11)) { ui.picked = null; putOn(m, a); ui.picked = b; render(); return; }
    ui.picked = b; render(); return;
  }
  ui.picked = null;
  const outPid = aOn ? a : b, inPid = aOn ? b : a;
  if (ui.plan) { stage({ k: 'sub', out: outPid, in: inPid }); render(); return; }
  swap(m, outPid, inPid);
  toast(`${(t.players || {})[inPid].name} on for ${(t.players || {})[outPid].name} at ${mins(elapsedSec(m))}′`);
}

/* --- match --- */
function viewMatch() {
  const t = team(); if (!t) return needTeam();
  let m = match();
  if (!m || m.teamId !== t.id) { const l = teamMatches(t.id); m = l[0] || null; ui.matchId = m ? m.id : null; }
  if (!m) return `<div class="empty"><strong>No game yet</strong>Create a game to start tracking minutes.
    ${readOnlyHere() ? '' : `<div style="margin-top:14px">${addGameBtn('btn')}</div>`}</div>`;

  const roster = squad(t, m);
  const now = nowMs();
  const el = elapsedSec(m, now);
  const bench = roster.filter(p => !onField(m, p.id));
  const field = roster.filter(p => onField(m, p.id));
  const cap = m.onFieldCount || 11;

  const tokens = field.map(p => {
    const pos = posOf(m, p.id);
    const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
    const owed = pd > 0 && pl < pd ? 1 : 0;
    const sl = slotOf(m, p.id);
    return `<div class="token" data-pid="${p.id}" data-owed="${owed}" data-picked="${ui.picked === p.id ? 1 : 0}"
      style="left:${pos.x}%;top:${pos.y}%">
      ${sl ? `<span class="role">${esc(sl.label)}</span>` : ''}
      <span class="num">${esc(p.number ?? '')}</span>
      <span class="mins" data-tokmins="${p.id}">${mins(pl)}′</span>
      <span class="nm">${esc(p.name.split(' ')[0])}</span></div>`;
  }).join('');

  const shape = (m.formation && m.formation.slots) || [];
  const ghosts = shape.filter(s => !slotTaken(m, s.id)).map(s =>
    `<button type="button" class="ghost" data-act="fillslot" data-sid="${s.id}"
      style="left:${s.x}%;top:${s.y}%">${esc(s.label)}</button>`).join('');

  const pitch = `<div class="pitch" id="pitch">
    <svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".5">
        <rect x="2" y="2" width="64" height="96"/>
        <line x1="2" y1="50" x2="66" y2="50"/>
        <circle cx="34" cy="50" r="9"/>
        <rect x="16" y="2" width="36" height="15"/><rect x="16" y="83" width="36" height="15"/>
        <rect x="26" y="2" width="16" height="6"/><rect x="26" y="92" width="16" height="6"/>
      </g>
    </svg>${ghosts}${tokens}
    <div class="pitchhint">${ui.picked ? 'Tap a spot, a player to swap, or anywhere on the grass' : field.length ? 'Drag to move · tap to pick' : 'Tap a bench player, then tap where she starts'}</div>
  </div>`;

  const clock = `<div class="clockwrap">
    <div class="clockline">
      <div class="clock" id="clock">${mmss(el)}</div>
      <div class="clockmeta"><b>${esc(halfName(m, m.currentHalf || 1))}</b><span id="halfclock">${mmss(halfSec(m, now))}</span> of ${m.periodMinutes || 40}:00</div>
    </div>
    <div class="clockbtns">
      ${running(m)
      ? `<button class="btn stop" data-act="pause">Pause clock</button><button class="btn stop" data-act="endhalf">End ${esc(halfName(m, m.currentHalf || 1)).toLowerCase()}</button>`
      : `<button class="btn" data-act="start">${el ? 'Resume clock' : 'Start clock'}</button>${el ? `<button class="btn stop" data-act="endhalf">End ${esc(halfName(m, m.currentHalf || 1)).toLowerCase()}</button>` : ''}`}
    </div>
    <button class="linkbtn" data-act="fixclock">Clock reading wrong?</button></div>`;

  const benchRows = bench.map(p => playerRow(m, p, now, false)).join('') ||
    `<p class="muted" style="margin:2px 0">Everyone is on the pitch.</p>`;
  const fieldRows = field.map(p => playerRow(m, p, now, true)).join('') ||
    `<p class="muted" style="margin:2px 0">Nobody placed yet. Pick from the bench below.</p>`;

  lastLog = subEvents(m);
  const name = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : 'Unknown'; };
  const logHtml = lastLog.length
    ? `<div class="log">${lastLog.map((r, i) => `<button type="button" data-act="fixsub" data-i="${i}">
        <span class="t">${mmss(r.t)}</span>
        <span>${r.move ? `${name(r.on)} moved to <span class="on">${esc(r.spot || 'a new spot')}</span>`
        : `${r.on ? `<span class="on">${name(r.on)} on</span>` : ''}${r.on && r.off ? ' for ' : ''}${r.off ? `<span class="off">${name(r.off)} off</span>` : ''}`}</span>
        <span class="muted">fix</span></button>`).join('')}</div>`
    : `<p class="muted" style="margin:0">Subs and switches show up here with the minute they happened. Tap one to correct the time.</p>`;

  const clashes = clashesOn(t, m);
  const warn = (clashes.length
    ? `<div class="warn">${clashes.map(([a, b]) => `${esc(a.name)} and ${esc(b.name)} are on together`).join(' · ')}</div>` : '')
    + anomalyBanner(t, m);

  const planHtml = nextChange(m, el, name);

  const outCount = outIds(t, m).length;

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    ${clock}
    ${warn}
    <div class="split">
      <div class="stack">
        ${pitch}
        ${restricted() || readOnlyHere() ? '' : `<div class="spread"><span class="muted">Shape: <b>${esc(m.formation ? m.formation.name : 'none')}</b></span>
          <button class="btn quiet sm" data-act="editgameshape">${m.formation ? 'Edit shape' : 'Make a shape'}</button></div>`}
        <div class="card"><div class="spread" style="margin-bottom:10px">
          <h2>On the pitch</h2><span class="muted">${field.length} of ${cap}</span></div>
          <div class="plist">${fieldRows}</div></div>
      </div>
      <div class="stack">
        <div class="card"><div class="spread" style="margin-bottom:10px">
          <h2>Bench</h2><button class="btn quiet sm" data-act="planall">Planned minutes</button></div>
          <div class="plist">${benchRows}</div>
          <div style="margin-top:10px"><button class="btn quiet sm" data-act="availability">Who is unavailable${outCount ? ` (${outCount})` : ''}</button></div></div>
        <div class="card"><h2 style="margin-bottom:10px">Game plan</h2>${planHtml}</div>
        <div class="card"><div class="spread" style="margin-bottom:10px"><h2>Subs</h2>
          <div class="row"><button class="btn quiet sm" data-act="addsub">Add a sub</button>
          <button class="btn quiet sm" data-act="fixminutes">Fix minutes</button></div></div>${logHtml}</div>
      </div>
    </div></div>`;
}

/* ---------------- telling the bench ----------------
   A plan is pictures of the pitch, but what a coach actually says at the bench
   is a list of calls: "Hana, on at left back for Bea. Cleo, over to left mid.
   Bea and Gia, you're coming off." This turns two lineups into exactly that, so
   it can be read out, or copied to whoever is standing with the subs.

   Both sides are { assign: spot → player, ids }. During a game `from` is the
   pitch as it really is — the coach may have subbed by hand since the plan was
   drawn, and the calls have to get from here to there, not from the snapshot
   before. Before kick-off it is the snapshot before, or nothing at all, which
   makes the calls a starting lineup. */
function pitchNow(m) {
  const assign = {};
  for (const pid of fieldIds(m)) {
    const sid = slotIdOf(m, pid);
    if (sid && slotById(m, sid) && !assign[sid]) assign[sid] = pid;
  }
  return { assign, ids: fieldIds(m) };
}
function benchCalls(m, from, to) {
  const fa = (from && from.assign) || {}, ta = to.assign || {};
  const fIds = from ? (from.ids && from.ids.length ? from.ids : Object.values(fa)) : [];
  const tIds = to.ids && to.ids.length ? to.ids : Object.values(ta);
  const spotIn = (a, pid) => Object.keys(a).find(k => a[k] === pid) || null;
  const slots = (m.formation && m.formation.slots) || [];
  const order = sid => { const i = slots.findIndex(s => s.id === sid); return i < 0 ? slots.length : i; };
  const off = fIds.filter(p => !tIds.includes(p));
  const on = tIds.filter(p => !fIds.includes(p)).map(pid => {
    const sid = spotIn(ta, pid), was = sid ? fa[sid] : null;
    return { pid, sid, for: was && off.includes(was) ? was : null };
  }).sort((a, b) => order(a.sid) - order(b.sid));
  /* Coming on into a spot a teammate moved out of is still coming on for
     somebody: pair what is left over, in order, so every call has a "for". */
  const paired = new Set(on.map(x => x.for).filter(Boolean));
  const spare = off.filter(p => !paired.has(p));
  for (const x of on) if (!x.for && spare.length) x.for = spare.shift();
  const moves = tIds.filter(p => fIds.includes(p))
    .map(pid => ({ pid, from: spotIn(fa, pid), to: spotIn(ta, pid) }))
    .filter(x => x.to && x.from !== x.to)
    .sort((a, b) => order(a.to) - order(b.to));
  return { on, off, moves, kickoff: !fIds.length };
}
/* Where the calls for one snapshot start from: the pitch, once anyone is on it. */
function benchFrom(m, b) {
  if (fieldIds(m).length) return pitchNow(m);
  const bl = planBlocks(m), i = bl.findIndex(x => x.start === b.start);
  return i > 0 ? bl[i - 1] : null;
}
const benchName = (t, pid) => {
  const p = (t.players || {})[pid];
  if (!p) return 'someone';
  return p.number != null && p.number !== '' ? `${p.name} (${p.number})` : p.name;
};
const spotName = (m, sid) => { const s = sid && slotById(m, sid); return s ? s.label : null; };

/* The same calls twice over: once to look at, big enough to read in the rain,
   and once as plain text to paste into a message. */
function benchHtml(t, m, c, squadIds) {
  const nm = pid => esc(benchName(t, pid));
  const row = (spot, main, sub) => `<div class="benchrow"><span class="benchspot">${spot ? esc(spot) : '—'}</span>
    <span><b>${main}</b>${sub ? `<small>${sub}</small>` : ''}</span></div>`;
  if (c.kickoff) {
    const bench = (squadIds || []).filter(p => !c.on.some(x => x.pid === p));
    return `<div class="bench"><div class="benchgrp"><h4>Starting lineup</h4>
      ${c.on.map(x => row(spotName(m, x.sid), nm(x.pid))).join('') || '<p class="muted" style="margin:0">Nobody in this snapshot yet.</p>'}</div>
      ${bench.length ? `<div class="benchgrp"><h4>On the bench</h4><p class="benchlist">${bench.map(nm).join(', ')}</p></div>` : ''}</div>`;
  }
  if (!c.on.length && !c.off.length && !c.moves.length)
    return `<div class="bench"><p class="muted" style="margin:0">Nothing to change — the pitch already looks like this.</p></div>`;
  return `<div class="bench">
    ${c.on.length ? `<div class="benchgrp"><h4>Going on</h4>${c.on.map(x => row(spotName(m, x.sid), nm(x.pid), x.for ? 'for ' + nm(x.for) : '')).join('')}</div>` : ''}
    ${c.moves.length ? `<div class="benchgrp"><h4>Switching spots</h4>${c.moves.map(x => row(spotName(m, x.to), nm(x.pid), spotName(m, x.from) ? 'from ' + esc(spotName(m, x.from)) : '')).join('')}</div>` : ''}
    ${c.off.length ? `<div class="benchgrp"><h4>Coming off</h4><p class="benchlist">${c.off.map(nm).join(', ')}</p></div>` : ''}</div>`;
}
function benchText(t, m, c, squadIds) {
  const nm = pid => benchName(t, pid);
  const at = sid => spotName(m, sid) ? ' at ' + spotName(m, sid) : '';
  if (c.kickoff) {
    const bench = (squadIds || []).filter(p => !c.on.some(x => x.pid === p));
    return c.on.map(x => `- ${spotName(m, x.sid) || 'On'}: ${nm(x.pid)}`).join('\n')
      + (bench.length ? `\nBench: ${bench.map(nm).join(', ')}` : '');
  }
  const out = [];
  if (c.on.length) out.push('Going on:', ...c.on.map(x => `- ${nm(x.pid)}${at(x.sid)}${x.for ? ', for ' + nm(x.for) : ''}`));
  if (c.moves.length) out.push('Switching spots:', ...c.moves.map(x => `- ${nm(x.pid)}: ${spotName(m, x.from) || 'no spot'} to ${spotName(m, x.to)}`));
  if (c.off.length) out.push(`Coming off: ${c.off.map(nm).join(', ')}`);
  return out.join('\n') || 'No changes.';
}
let benchCopy = '';    // what the open bench sheet's Copy button copies

/* One change, from the pitch as it stands. */
function sheetBench(t, m, start) {
  const b = planBlocks(m).find(x => String(x.start) === String(start)); if (!b) return;
  const from = benchFrom(m, b), c = benchCalls(m, from, b);
  const ids = squad(t, m).map(p => p.id);
  const head = c.kickoff ? 'Starting lineup' : `Subs ${subsWhen(m, b)}`;
  benchCopy = `${head}${m.opponent ? ' — v ' + m.opponent : ''}\n${benchText(t, m, c, ids)}`;
  openSheet(`<h3>Tell the bench</h3>
    <p class="muted" style="margin-top:0">${esc(head.charAt(0).toUpperCase() + head.slice(1))}${c.kickoff ? '' : fieldIds(m).length ? ' — worked out from who is on the pitch now.' : ' — from the snapshot before.'}</p>
    ${benchHtml(t, m, c, ids)}
    <div class="row" style="margin-top:14px"><button class="btn" data-act="benchcopy" style="flex:1">Copy as a message</button>
      <button class="btn quiet" data-act="benchall" style="flex:1">Whole game</button></div>
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Done</button>`);
}
/* Every change in the plan, in order — the thing to read through at warm-up,
   or send to an assistant coach the night before. Snapshot to snapshot, since
   the pitch at 30:00 is not known yet. */
function sheetBenchAll(t, m) {
  const bl = planBlocks(m); if (!bl.length) return;
  const ids = squad(t, m).map(p => p.id);
  const parts = bl.map((b, i) => ({ b, c: benchCalls(m, i ? bl[i - 1] : null, b) }));
  benchCopy = `Game plan${m.opponent ? ' — v ' + m.opponent : ''}\n\n`
    + parts.map(({ b, c }) => `${snapLabel(m, b.start)}\n${benchText(t, m, c, ids)}`).join('\n\n');
  openSheet(`<h3>Bench sheet</h3>
    <p class="muted" style="margin-top:0">Every change in the plan, as calls to make: who goes on, where and for whom, who switches spot, who comes off.</p>
    ${parts.map(({ b, c }) => `<div class="benchstep"><h4 class="benchwhen">${esc(snapLabel(m, b.start))}</h4>${benchHtml(t, m, c, ids)}</div>`).join('')}
    <button class="btn wide" data-act="benchcopy" style="margin-top:14px">Copy as a message</button>
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Done</button>`);
}

/* "in 3:12", or "1:40 ago" once it is over a minute late — for the first
   minute the card's own "due now" says it. A countdown only makes sense inside
   the half it counts down in: across half-time nobody knows how long the break
   will be. */
function subsClock(m, b, u) {
  if (!b || !b.start) return '';
  if (u > 0) return Math.floor(b.start / ((m.periodMinutes || 40) * 60)) + 1 === (m.currentHalf || 1) ? 'in ' + mmss(u) : '';
  return u > -60 ? '' : mmss(-u) + ' ago';
}
/* The one change to who is on the pitch a tracker may make: the coach decided
   it and locked it in, and the tracker only says when it happened. Anyone who
   may edit the team may too, which is the coach at the sideline. */
const canCallSubs = m => !!m && (canEditTeam(m.teamId) || (restricted() === 'tracker' && m.teamId === ui.teamId));

/* The locked-in plan at the sideline: when the next change is due, a louder card
   when it is, and one button for the moment the referee lets the subs on. The
   tap is the record — the subs go in at the minute it was pressed, not the
   minute the plan said. A tracker (often a parent) sees the time and how many
   changes, never the names: the coach's lineups are the coach's. The coach
   sees who, since it is the coach's own plan. */
function subsCard(t, m, now) {
  // a parent, or a coach reading another team's game, has nothing to call
  if (!canCallSubs(m)) return '';
  const reveal = !restricted();
  const s = subsDue(m, now);
  if (!s) {
    if (m.ended) return '';
    if (!reveal) return `<div class="card subscard" id="subsdue" data-k="none"><h2>Planned subs</h2>
      <p class="muted" style="margin:6px 0 0">No sub plan is locked in for this game. Once the coach locks one in, this card says when each change is due and makes it with one tap.</p></div>`;
    // only worth saying on Track: that is the tab a coach hands to somebody else
    return ui.gameView === 'track' && planBlocks(m).length
      ? `<div class="card subscard" id="subsdue" data-k="none"><div class="spread"><h2>Planned subs</h2>
          <button class="btn quiet sm" data-act="opengview" data-v="plan">Open the plan</button></div>
          <p class="muted" style="margin:6px 0 0">Lock in your plan and this card counts down to each change — for whoever is tracking, too, without showing them who.</p></div>`
      : '';
  }
  // the coach gets the calls to make at the bench; a tracker gets none of it
  const names = b => reveal ? `<div class="subsbench">${benchHtml(t, m, benchCalls(m, benchFrom(m, b), b), squad(t, m).map(p => p.id))}
      <button class="btn quiet sm" data-act="bench" data-start="${b.start}" style="margin-top:8px">Tell the bench</button></div>` : '';
  const howMany = (b, d) => {
    if (!b.start) return `${(b.ids || []).length} players`;
    const n = Math.max(d.on.length, d.off.length), mv = d.moved.length;
    return [n ? `${n} sub${n === 1 ? '' : 's'}` : '', mv ? `${mv} position change${mv === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ') || 'no changes';
  };
  let undo = '';
  const r = s.lastDone;
  if (r && nowMs() - (r.at || 0) < SUB_UNDO_MS) {
    undo = `<div class="subsdone spread"><span>✓ ${r.skipped ? `Skipped the change ${esc(subsWhen(m, s.last))}` : s.last.start ? `Subs made at ${mmss(r.t || 0)}` : 'Starting lineup on'}</span>
      <button class="btn quiet sm" data-act="subsundo" data-key="${doneKey(s.last)}">Undo</button></div>`;
  }

  if (s.kind === 'due' || s.kind === 'soon') {
    const b = s.b, ko = !b.start;
    const title = ko ? 'Starting lineup' : s.kind === 'due' ? 'Subs due now' : 'Subs coming up';
    return `<div class="card subscard" id="subsdue" data-state="${s.kind}" data-k="${s.kind}:${b.start}">
      <div class="spread"><h2>${title}</h2><span class="subsclock" data-subsclock="1">${subsClock(m, b, s.until)}</span></div>
      <p class="subsline">${ko ? 'From the plan' : 'Planned ' + esc(subsWhen(m, b))} · ${howMany(b, s.diff)}</p>
      ${names(b)}
      <button class="btn wide subsgo" data-act="subsgo" data-start="${b.start}">${ko ? 'Starters are on' : 'Subs are on'}</button>
      <div class="spread" style="margin-top:8px"><span class="muted">${ko ? 'Tap once the starters are on the pitch.' : `Tap when the referee lets them on — ${reveal ? 'every change in the snapshot is made' : "the coach's planned subs are made for you"} at that minute.`}</span>
        <button class="btn quiet sm" data-act="subsskip" data-start="${b.start}" style="flex:none">Not now</button></div></div>`;
  }
  if (s.kind === 'wait') {
    const b = s.b;
    return `<div class="card subscard" id="subsdue" data-state="wait" data-k="wait:${b.start}">
      ${undo}
      <div class="spread"><h2>Next subs</h2><span class="subsclock" data-subsclock="1">${subsClock(m, b, s.until)}</span></div>
      <p class="subsline">${esc(subsWhen(m, b))} · ${howMany(b, subsDiff(m, b))}</p>
      ${names(b)}
      <p class="muted" style="margin:6px 0 0">A button to make them appears ${Math.round(SUB_LEAD / 60)} minutes before.</p></div>`;
  }
  return `<div class="card subscard" id="subsdue" data-state="over" data-k="over">
    ${undo}<h2>Planned subs</h2><p class="muted" style="margin:6px 0 0">That was the last change in the plan.</p></div>`;
}

/* What the plan wants next, with the button that does it. The live screen's
   "see the plan" link opens the full thing; the Plan tab shows it inline. */
function nextChange(m, el, name) {
  const nb = nextPlanBlock(m, el), cb = planBlockAt(m, el);
  if (!m.plan) {
    return `<p class="muted" style="margin:0 0 10px">Build a block-by-block plan from planned minutes, ratings and pairings.</p>
      <button class="btn wide" data-act="makeplan">Plan the game</button>`;
  } else if (nb) {
    const onIds = (nb.ids || []).filter(id => !cb || !(cb.ids || []).includes(id));
    const offIds = cb ? (cb.ids || []).filter(id => !(nb.ids || []).includes(id)) : [];
    return `<div class="spread" style="align-items:flex-start">
      <div><div class="muted">Next change at ${mmss(nb.start)}</div>
      <div style="margin-top:4px">${onIds.length ? `<span class="on">on: ${onIds.map(name).join(', ')}</span><br>` : ''}${offIds.length ? `<span class="off">off: ${offIds.map(name).join(', ')}</span>` : ''}${!onIds.length && !offIds.length ? 'no changes' : ''}</div></div>
      <button class="btn sm" data-act="applyblock" data-start="${nb.start}">Make these subs</button></div>
      <div class="row" style="margin-top:12px"><button class="btn quiet sm" data-act="bench" data-start="${nb.start}">Tell the bench</button><button class="btn quiet sm" data-act="viewplan">See the plan</button><button class="btn quiet sm" data-act="makeplan">Rebuild</button></div>`;
  } else {
    return `<p class="muted" style="margin:0 0 10px">Plan finished — no changes left.</p>
      <div class="row"><button class="btn quiet sm" data-act="viewplan">See the plan</button><button class="btn quiet sm" data-act="makeplan">Rebuild</button></div>`;
  }
}

/* The game plan used to be reachable only from a card at the foot of the Pitch
   tab, under the pitch, the XI and the bench — on a phone, far enough down that
   coaches stopped finding it. Planning is done before kick-off, at a kitchen
   table, so it earns a tab of its own rather than a scroll.

   The tab is built around snapshots, because that is how a coach thinks about
   a plan: "at kick-off it looks like this, at 20 minutes like this". Each one is
   the pitch in this game's shape — tap a spot, tap a player — and the minutes
   each player ends up with fall out of the snapshots rather than going in. The
   auto planner is still here, as a way to get a first draft to edit. */
function viewPlan() {
  const t = team(); if (!t) return needTeam();
  let m = match();
  if (!m || m.teamId !== t.id) { const l = teamMatches(t.id); m = l[0] || null; ui.matchId = m ? m.id : null; }
  if (!m) return `<div class="empty"><strong>No game yet</strong>Create a game to plan it.
    ${readOnlyHere() ? '' : `<div style="margin-top:14px">${addGameBtn('btn')}</div>`}</div>`;

  const roster = squad(t, m);
  const el = elapsedSec(m, nowMs());
  const name = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : 'Unknown'; };
  const blocks = planBlocks(m);
  const shape = (m.formation && m.formation.slots) || [];
  const locked = planLocked(m);

  // once locked in, the sideline card is the one answer to "what is due" on every tab
  const next = !blocks.length || el <= 0 ? ''
    : locked ? subsCard(t, m, nowMs())
      : `<div class="card"><h2 style="margin-bottom:10px">Next change</h2>${nextChange(m, el, name)}</div>`;

  let lockCard = '';
  if (blocks.length && !readOnlyHere()) {
    if (locked) {
      const l = m.plan.locked, sv = lockSaved(m);
      const at = new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const msg = {
        saved: 'Saved to the club — every phone on this team has it.',
        sending: online ? 'Saving to the club…' : 'Saved on this phone. It goes to the club as soon as there is signal — keep the app open until this says so.',
        refused: 'Saved on this phone, but the club refused it. Check you are signed in as a coach of this team.',
        device: 'Saved on this phone.'
      }[sv];
      lockCard = `<div class="lockbar" data-state="${sv}">
        <div class="spread"><b>${sv === 'refused' ? '!' : '✓'} Plan locked in</b><span class="lockwhen">${esc(at)}${l.byName ? ' · ' + esc(l.byName) : ''}</span></div>
        <p class="lockmsg">${msg}</p>
        <p class="lockmsg">Whoever tracks this game gets a countdown to each change and one button to make it — told when, never who.</p>
        <div class="row"><button class="btn sm" data-act="benchall">Bench sheet</button>
          <button class="btn quiet sm" data-act="planunlock">Unlock to change</button></div></div>`;
    } else {
      lockCard = `<div class="card"><div class="spread" style="align-items:flex-start"><div><h2>Happy with it?</h2>
        <p class="muted" style="margin:4px 0 0">Lock it in. Nothing changes by accident, and whoever tracks the game is told when each change is due.</p></div>
        <button class="btn" data-act="planlock" style="flex:none">Lock in</button></div></div>`;
    }
  }

  let snaps;
  if (!shape.length) {
    snaps = `<div class="card"><h2 style="margin-bottom:6px">Snapshots</h2>
      <p class="muted" style="margin-top:0">This game has no shape, so there are no positions to plan around. Pick one — 4-3-3, 2-3-1, or a shape you saved — and each snapshot becomes a pitch you fill in.</p>
      <button class="btn wide" data-act="editmatch" data-id="${m.id}">Pick a shape</button>
      ${blocks.length ? `<div style="margin-top:14px">${planDetail(t, m)}</div>` : ''}</div>`;
  } else if (!blocks.length) {
    snaps = `<div class="card"><h2 style="margin-bottom:6px">Snapshots</h2>
      <p class="muted" style="margin-top:0">A plan is a few pictures of the pitch: who plays where at kick-off, then who is where after each change. Start with kick-off, then add one for every time you mean to make subs — half-time, every ten minutes, whatever suits.</p>
      <button class="btn wide" data-act="snapstart">Plan kick-off</button>
      <p class="muted" style="margin:12px 0 0">Or let the app draft one from your target minutes, or paste back an answer from <b>Ask an AI</b>, and change what you like.</p></div>`;
  } else {
    const cur = blocks.find(b => b.start === ui.snapAt) || blocks[0];
    const i = blocks.indexOf(cur), prev = i ? blocks[i - 1] : null;
    const assign = cur.assign || {};
    const sel = ui.snapSid && shape.some(s => s.id === ui.snapSid) ? ui.snapSid : null;
    const P = id => (t.players || {})[id];
    const emptyN = shape.filter(s => !assign[s.id]).length;
    const slotOfIn = (b, pid) => Object.keys((b && b.assign) || {}).find(k => b.assign[k] === pid) || null;

    const strip = `<div class="snapstrip">${blocks.map(b => {
      const empty = shape.filter(s => !(b.assign || {})[s.id]).length;
      return `<button type="button" class="chip" data-act="snappick" data-start="${b.start}" aria-pressed="${b === cur}">${b.start ? mmss(b.start) : 'Kick-off'}${empty ? ` <span class="snapgap">${empty}</span>` : ''}</button>`;
    }).join('')}${locked ? '' : '<button type="button" class="chip" data-act="snapadd">+ Add</button>'}</div>`;

    const when = i === 0
      ? `<div class="snapwhen"><b>Kick-off</b><span class="muted">the starting lineup</span></div>`
      : locked ? `<div class="snapwhen"><b>${mmss(cur.start)}<small>${esc(halfName(m, Math.floor(cur.start / ((m.periodMinutes || 40) * 60)) + 1))}</small></b></div>`
      : `<div class="snapwhen"><button class="btn quiet sm" data-act="snaptime" data-d="-300" aria-label="5 minutes earlier">−5</button>
          <button class="btn quiet sm" data-act="snaptime" data-d="-60" aria-label="1 minute earlier">−1</button>
          <b>${mmss(cur.start)}<small>${esc(halfName(m, Math.floor(cur.start / ((m.periodMinutes || 40) * 60)) + 1))}</small></b>
          <button class="btn quiet sm" data-act="snaptime" data-d="60" aria-label="1 minute later">+1</button>
          <button class="btn quiet sm" data-act="snaptime" data-d="300" aria-label="5 minutes later">+5</button>
          <button class="btn danger sm snapx" data-act="snapdel" aria-label="Delete the change at ${mmss(cur.start)}">✕</button></div>`;

    const spots = shape.map(s => {
      const pid = assign[s.id], p = pid && P(pid);
      const picked = sel === s.id ? 1 : 0;
      return p
        ? `<button type="button" class="token snaptok" data-act="snapslot" data-sid="${s.id}" data-picked="${picked}" style="left:${s.x}%;top:${s.y}%">
            <span class="role">${esc(s.label)}</span><span class="num">${esc(p.number ?? '')}</span>
            <span class="nm">${esc(p.name.split(' ')[0])}</span></button>`
        : `<button type="button" class="ghost" data-act="snapslot" data-sid="${s.id}" data-picked="${picked}" style="left:${s.x}%;top:${s.y}%">${esc(s.label)}</button>`;
    }).join('');
    const pitch = `<div class="pitch snappitch">
      <svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".5">
          <rect x="2" y="2" width="64" height="96"/><line x1="2" y1="50" x2="66" y2="50"/><circle cx="34" cy="50" r="9"/>
          <rect x="16" y="2" width="36" height="15"/><rect x="16" y="83" width="36" height="15"/>
          <rect x="26" y="2" width="16" height="6"/><rect x="26" y="92" width="16" height="6"/>
        </g></svg>${spots}</div>`;

    const selSlot = sel && slotById(m, sel), selP = sel && assign[sel] && P(assign[sel]);
    const hint = locked
      ? `<div class="snaphint"><span class="muted">Locked in. Tap a time above to look through it; unlock to change anything.</span></div>`
      : selSlot
      ? `<div class="snaphint"><span>${selP ? `Who replaces <b>${esc(selP.name)}</b> at ${esc(selSlot.label)}? Or tap another spot to swap them.` : `Who plays <b>${esc(selSlot.label)}</b>?`}</span>
          ${selP ? `<button class="btn quiet sm" data-act="snapclear">Leave empty</button>` : ''}</div>`
      : `<div class="snaphint"><span class="muted">Tap a spot, then a player. Tap two spots to swap them.</span></div>`;

    // what this snapshot changes from the one before — the subs you would make
    let diff = '';
    if (prev) {
      const pa = prev.assign || {};
      const bi = Object.values(assign), pi = Object.values(pa);
      const on = bi.filter(id => !pi.includes(id)), off = pi.filter(id => !bi.includes(id));
      const moved = bi.filter(id => pi.includes(id) && slotOfIn(prev, id) !== slotOfIn(cur, id));
      const lbl = (b, id) => { const sl = slotById(m, slotOfIn(b, id)); return sl ? ` (${esc(sl.label)})` : ''; };
      diff = `<div class="snapdiff">${on.length ? `<div><span class="on">on:</span> ${on.map(id => name(id) + lbl(cur, id)).join(', ')}</div>` : ''}
        ${off.length ? `<div><span class="off">${emptyN ? 'not placed yet:' : 'off:'}</span> ${off.map(name).join(', ')}</div>` : ''}
        ${moved.length ? `<div><span class="muted">moves:</span> ${moved.map(id => `${name(id)} ${esc((slotById(m, slotOfIn(prev, id)) || {}).label || '')} → ${esc((slotById(m, slotOfIn(cur, id)) || {}).label || '')}`).join(', ')}</div>` : ''}
        ${!on.length && !off.length && !moved.length ? '<span class="muted">Same as the snapshot before — change a spot, or delete this one.</span>' : ''}</div>`;
    }

    const secs = planSeconds(m), before = planSeconds(m, cur.start);
    const prow = p => {
      const sid = slotOfIn(cur, p.id), sl = sid && slotById(m, sid);
      const got = Math.round((secs[p.id] || 0) / 60), want = m.planned && m.planned[p.id] != null ? Number(m.planned[p.id]) : null;
      const sofar = Math.round((before[p.id] || 0) / 60);
      const mins_ = cur.start
        ? `<span class="pmins snapmins"><span>${sofar}<small> by ${mmss(cur.start)}</small></span><span class="pmtot">${got}${want != null ? ' of ' + want : ''} in game</span></span>`
        : `<span class="pmins">${got}<small>${want != null ? ' of ' + want : ''} min</small></span>`;
      return `<button class="prow" type="button" data-act="snapplayer" data-pid="${p.id}" data-picked="${sid && sid === sel ? 1 : 0}">
        <span class="pnum">${esc(p.number ?? '')}</span>
        <span><span class="pname">${esc(p.name)}</span><span class="psub">${sl ? esc(sl.label) : prev && slotOfIn(prev, p.id) ? 'was ' + esc((slotById(m, slotOfIn(prev, p.id)) || {}).label || 'on') + ' before' : 'not on'}${p.gk ? (sl && sl.role === 'GK' ? '' : ' · keeper') : p.preferred ? ' · likes ' + esc(p.preferred) : ''}</span></span>
        ${mins_}</button>`;
    };
    const wasOn = p => !!(prev && slotOfIn(prev, p.id));
    const off = roster.filter(p => !slotOfIn(cur, p.id)).sort((x, y) => wasOn(y) - wasOn(x)), on = roster.filter(p => slotOfIn(cur, p.id));
    const list = `<h3 style="margin:14px 0 6px">Not on</h3>
      <div class="plist">${off.map(prow).join('') || '<p class="muted" style="margin:2px 0">Everyone is on in this snapshot.</p>'}</div>
      <h3 style="margin:14px 0 6px">On the pitch</h3>
      <div class="plist">${on.map(prow).join('') || '<p class="muted" style="margin:2px 0">Nobody yet.</p>'}</div>`;

    snaps = `<div class="card"><div class="spread" style="margin-bottom:10px"><h2>Snapshots</h2>
        <span class="muted">${esc(m.formation.name || '')}${locked ? '' : ' <button class="btn quiet sm" data-act="snapwipe">Clear plan</button>'}</span></div>
      ${strip}${when}${pitch}${hint}${diff}
      <div class="row" style="margin-top:10px">${locked ? '' : `<button class="btn quiet sm" data-act="snapadd">Add the next change</button>
        ${prev && emptyN && Object.values(prev.assign || {}).some(id => !Object.values(assign).includes(id)) ? '<button class="btn quiet sm" data-act="snapfill">Fill the gaps from the one before</button>' : ''}`}
        <button class="btn quiet sm" data-act="bench" data-start="${cur.start}">Tell the bench</button>
        <button class="btn quiet sm" data-act="applyblock" data-start="${cur.start}">${elapsedSec(m) <= 0 && !m.ended ? 'Use as the starting lineup' : 'Put this on the pitch now'}</button></div>
      ${list}</div>`;
  }

  const secs = planSeconds(m);
  const minutesRows = roster.map(p => {
    const pd = m.planned && m.planned[p.id] != null ? Number(m.planned[p.id]) : null;
    const got = Math.round((secs[p.id] || 0) / 60), d = pd != null ? got - pd : 0;
    const r = rsvpOf(t.id, 'g_' + m.id, p.id);
    const unsure = gameStatus(m) !== 'upcoming' ? '' : r && r.v === 'maybe' ? ' <span class="tag event">maybe</span>' : !r && (m.out || {})[p.id] !== false ? ' <span class="muted">· no answer</span>' : '';
    return `<div class="spread" style="padding:4px 0"><span>${p.number != null && p.number !== '' ? `<span class="muted">${esc(p.number)}</span> ` : ''}${esc(p.name)}${p.gk ? ' <span class="muted">GK</span>' : ''}${unsure}</span>
      <span>${blocks.length ? `<b>${got}</b> ` : ''}<span class="muted">${pd != null ? (blocks.length ? `of ${pd}` : `${pd} target`) : blocks.length ? 'min' : 'no target'}</span>${blocks.length && pd != null && d ? `<span class="diff ${d < 0 ? 'owed' : 'over'}">${d < 0 ? -d + ' short' : d + ' over'}</span>` : ''}</span></div>`;
  }).join('') || '<p class="muted" style="margin:0">No players in the squad for this game yet.</p>';

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    <div class="split">
      <div class="stack">
        ${gameDetailsCard(m)}
        ${next}
        ${lockCard}
        ${snaps}
      </div>
      <div class="stack">
        <div class="card"><div class="spread" style="margin-bottom:10px">
          <h2>Minutes</h2><button class="btn quiet sm" data-act="planall">Set targets</button></div>
          <p class="muted" style="margin-top:0">${m.periodCount || 2} × ${m.periodMinutes || 40} min · ${m.onFieldCount || 11}v${m.onFieldCount || 11}. ${blocks.length ? 'What each player gets if you follow the snapshots, against her target.' : 'Targets are optional — they are what <b>Build one for me</b> aims for.'}</p>
          ${minutesRows}</div>
        <div class="card"><h2 style="margin-bottom:6px">Build one for me</h2>
          <p class="muted" style="margin-top:0">${blocks.length ? 'Only for an empty plan, so it can never write over yours. <b>Clear plan</b> first if you really want a fresh draft.' : `Drafts a snapshot every ${Number(m.blockMinutes) || 10} minutes or so from the targets, ratings and pairings. Every one of them can be changed afterwards.`}</p>
          ${blocks.length ? '' : '<button class="btn quiet wide" data-act="makeplan">Draft a plan</button>'}</div>
        ${comingCard(t, m)}
        ${aiButton('game')}
      </div>
    </div></div>`;
}

/* Who to plan for, on the tab where the plan is made. The families' answers
   are already applied — the plan, the targets and the even split work from the
   players who are coming — so this says who is out and why, and who has not
   said, which is who might still turn up or not. */
function comingCard(t, m) {
  const key = 'g_' + m.id, ps = players(t).filter(p => p.active !== false);
  const outs = ps.filter(p => isOut(m, p.id));
  const inn = ps.filter(p => !isOut(m, p.id));
  const maybe = inn.filter(p => (rsvpOf(t.id, key, p.id) || {}).v === 'maybe');
  const quiet_ = gameStatus(m) === 'upcoming' ? inn.filter(p => !rsvpOf(t.id, key, p.id) && (m.out || {})[p.id] !== false) : [];
  const names = list => list.map(p => esc(p.name)).join(', ');
  const why = p => (m.out || {})[p.id] ? 'you' : 'family';
  return `<div class="card"><div class="spread" style="align-items:flex-start">
      <div><h2>Who is coming</h2><div class="muted">${inn.length} to plan for${outs.length ? ` · ${outs.length} out` : ''}</div></div>
      <button class="btn quiet sm" data-act="availability" style="flex:none">Change</button></div>
    ${outs.length ? `<p style="margin:10px 0 0"><b>Out:</b> ${outs.map(p => `${esc(p.name)} <span class="muted">(${why(p) === 'you' ? 'you' : 'family said'})</span>`).join(', ')}</p>` : ''}
    ${maybe.length ? `<p style="margin:6px 0 0"><b>Maybe:</b> ${names(maybe)}</p>` : ''}
    ${quiet_.length ? `<p style="margin:6px 0 0"><b>Not answered:</b> ${names(quiet_)}</p>` : ''}
    <p class="muted" style="margin:8px 0 0">Families answer from the calendar. Not going leaves a player out of the plan, the targets and the even split until you change it here.</p></div>`;
}

/* Opponent, when, where and the format. It lived at the foot of the Pitch
   tab, under the bench and the sub log, where nobody looked for it; Plan is
   where a game is set up before kick-off, so it heads that tab instead. */
function gameDetailsCard(m) {
  const cap = m.onFieldCount || 11;
  const when = [m.date ? shortDate(m.date) : '', m.kickoff || ''].filter(Boolean).join(' · ');
  return `<div class="card"><div class="spread" style="align-items:flex-start">
    <div><h2>${esc(m.opponent || 'Game')}</h2>
      <div class="muted">${esc(when || 'No date yet')}${m.venue ? ' · ' + esc(m.venue) : ''}</div>
      <div class="muted">${m.periodCount || 2} × ${m.periodMinutes || 40} min · ${cap}v${cap} · ${esc(m.formation ? m.formation.name : 'no shape')}</div>
      ${[HOME_AWAY[m.home], m.arrive ? 'arrive by ' + niceTime(m.arrive) : '', m.kit ? 'kit: ' + m.kit : ''].filter(Boolean).length
      ? `<div class="muted">${esc([HOME_AWAY[m.home], m.arrive ? 'arrive by ' + niceTime(m.arrive) : '', m.kit ? 'kit: ' + m.kit : ''].filter(Boolean).join(' · '))}</div>` : ''}</div>
    ${readOnlyHere() ? '' : `<button class="btn quiet sm" data-act="editmatch" data-id="${m.id}" style="flex:none">Edit game</button>`}</div>
    ${CALLED[m.called] ? `<div class="warn alert" style="margin-top:10px"><b>${CALLED[m.called]}.</b> It shows that way on the calendar and the share pages.</div>` : ''}
    ${m.notes ? `<p class="muted" style="margin:10px 0 0">${esc(m.notes)}</p>` : ''}
    ${m.veoUrl ? `<p style="margin:10px 0 0"><a href="${esc(m.veoUrl)}" target="_blank" rel="noopener">Open the Veo recording</a></p>` : ''}
  </div>`;
}

function playerRow(m, p, now, isOn) {
  const sl = isOn ? slotOf(m, p.id) : null;
  const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
  const pct = pd > 0 ? clamp(pl / pd * 100, 0, 100) : 0;
  const owed = pd > 0 && pl < pd - 60 ? 1 : 0;
  const over = pd > 0 && pl > pd + 60 ? 1 : 0;
  const bar = pd > 0 ? `<div class="bar"><i style="width:${pct}%" data-bar="${p.id}" data-owed="${owed}" data-over="${over}"></i><u style="left:100%"></u></div>` : '';
  return `<button class="prow" type="button" data-act="tap" data-pid="${p.id}" data-on="${isOn ? 1 : 0}" data-picked="${ui.picked === p.id ? 1 : 0}">
    <span class="pnum">${esc(p.number ?? '')}</span>
    <span><span class="pname">${esc(p.name)}</span>${bar}<span class="psub">${sl ? esc(sl.label) + ' · ' : ''}${pd > 0 ? mins(pd) + ' min planned' : 'no plan set'}</span></span>
    <span class="pmins" data-mins="${p.id}">${mins(pl)}<small> min</small></span>
  </button>`;
}

/* --- calendar --- */
/* The season in date order: games, practices and anything else the team has
   on, for everyone who can see the team — coaches, trackers and parents alike.

   Games are the matches that already exist; the calendar reads them and never
   keeps a copy, so a kick-off moved on the game is moved here too. Everything
   else lives under the team:

     teams/{tid}/events/{eid}  { id, kind: 'practice' | 'event', title, date,
                                 start, end, venue, notes, public, called,
                                 series, createdAt, by }

   Under the team on purpose. The rule on teams/$tid already says exactly who
   may change it — an admin, or a coach of that team — and every role that can
   read the team can read this, so the calendar needs no new rule and nothing
   about it can be pasted out of order. Each entry has its own id, so two
   coaches adding practices at once cannot collide. A weekly practice is one
   entry per week sharing a `series` id rather than a rule the app expands:
   calling off one week is one write to one entry, and offline needs no special
   case.

   `public` is the one decision a coach makes per entry. Games are on the share
   link already. Practices and the rest default to the team only, because a
   share link gets forwarded, and a practice is a predictable time and place
   where children are without the crowd a match brings. */
const CAL_KIND = { game: 'Game', practice: 'Practice', event: 'Event', session: 'Training' };
const CALLED = { cancelled: 'Cancelled', postponed: 'Postponed' };
const HOME_AWAY = { home: 'Home', away: 'Away', neutral: 'Neutral ground' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SERIES_MAX = 60;       // a season of twice-weekly practices, with room to spare
const ICS = () => (typeof window !== 'undefined' && window.MinutesIcs) || null;

const pad2 = n => String(n).padStart(2, '0');
/* Local dates throughout, never toISOString(): that is UTC, and at seven in
   the evening in California it is already tomorrow. */
const dayStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => dayStr(new Date(nowMs()));
const dateOf = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = dateOf(s); d.setDate(d.getDate() + n); return dayStr(d); };
const weekdayOf = s => (dateOf(s).getDay() + 6) % 7;     // Monday is 0, as a fixture list reads
const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
/* A time as the calendar sorts it. An imported "9:30" and a typed "09:30" are
   the same kick-off, and only one of them sorts before "10:00" as text. */
const hm = t => { const x = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return x ? pad2(x[1]) + ':' + x[2] : ''; };
const minOf = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function niceTime(t) {
  t = hm(t); if (!t) return '';
  const [h, mi] = t.split(':').map(Number);
  return ((h % 12) || 12) + (mi ? ':' + pad2(mi) : '') + (h >= 12 ? 'pm' : 'am');
}
function dayLabel(s) {
  if (!okDay(s)) return 'Date to be confirmed';
  const d = dateOf(s);
  return `${WEEKDAYS[weekdayOf(s)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function relDay(s) {
  if (!okDay(s)) return '';
  const t = todayStr();
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  const n = Math.round((dateOf(s) - dateOf(t)) / 86400000);   // rounded: a clock change makes a 23 or 25 hour day
  return n > 1 && n < 7 ? `In ${n} days` : '';
}

/* Every dated thing on the given teams, in the order it happens. Undated games
   come last rather than first: "date to be confirmed" is the end of the list,
   not the top of it. */
function calItems(tids) {
  const out = [];
  for (const tid of tids) {
    const t = state.teams[tid]; if (!t) continue;
    for (const m of teamMatches(tid)) out.push({
      key: 'g:' + m.id, kind: 'game', tid, id: m.id, date: okDay(m.date) ? m.date : '',
      start: hm(m.kickoff), end: '', mins: matchMinutes(m) + 15,
      title: 'v ' + (m.opponent || 'TBC'), venue: m.venue || '',
      called: CALLED[m.called] ? m.called : '', home: HOME_AWAY[m.home] ? m.home : '',
      status: gameStatus(m), public: true
    });
    for (const [id, e] of Object.entries(t.events || {})) {
      if (!e || typeof e !== 'object') continue;
      const kind = e.kind === 'practice' ? 'practice' : 'event';
      out.push({
        key: 'e:' + id, kind, tid, id, date: okDay(e.date) ? e.date : '',
        start: hm(e.start), end: hm(e.end), mins: 0,
        title: e.title || CAL_KIND[kind], venue: e.venue || '',
        called: CALLED[e.called] ? e.called : '', public: !!e.public, series: e.series || null
      });
    }
  }
  return out.sort(calOrder);
}
const calOrder = (a, b) => (a.date || '9999').localeCompare(b.date || '9999')
  || (a.start || '').localeCompare(b.start || '')
  || (a.kind === b.kind ? 0 : a.kind === 'game' ? -1 : b.kind === 'game' ? 1 : 0);

/* Over, or still to come. A game knows for itself once its clock has run; for
   everything else it is the date, and on the day the end time — practice at
   six is still "coming up" at five, and "next" at a quarter past. */
function calPast(it) {
  if (it.kind === 'game' && it.status === 'done') return true;
  if (it.kind === 'game' && it.status === 'live') return false;
  if (!it.date) return false;
  const today = todayStr();
  if (it.date !== today) return it.date < today;
  if (!it.start) return false;
  let end = minOf(it.start) + (it.mins || 60);
  if (it.end) { end = minOf(it.end); if (end <= minOf(it.start)) end += 24 * 60; }
  const n = new Date(nowMs());
  return n.getHours() * 60 + n.getMinutes() >= end;
}
/* What a parent opens the app to find out. A game being played beats anything,
   and something called off is never "next" — it is the thing not to drive to. */
const calNext = items => items.find(x => x.kind === 'game' && x.status === 'live')
  || items.find(x => x.date && !x.called && !calPast(x)) || null;

/* The teams the calendar is showing. Anyone who can see more than one team
   (a parent with two children, a coach, an admin) can see them all at once. */
function calTeams() {
  const mine = myTeams();
  if (ui.calAll && mine.length > 1) return mine.map(t => t.id);
  return ui.teamId ? [ui.teamId] : [];
}

const seriesOf = (t, sid) => Object.values((t && t.events) || {}).filter(e => e && sid && e.series === sid)
  .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

/* Dates for a weekly series: every chosen weekday from the first date to the
   last, inclusive, capped so a mistyped year cannot write a decade of
   practices. */
function seriesDates(from, until, days) {
  if (!okDay(from)) return [];
  if (!okDay(until) || until < from || !(days || []).length) return [from];
  const out = [];
  for (let d = from, i = 0; d <= until && out.length < SERIES_MAX && i < 400; d = addDays(d, 1), i++)
    if (days.includes(weekdayOf(d))) out.push(d);
  return out;
}

/* One calendar item as a calendar file wants it. The team name goes in the
   title because this lands in a family calendar next to everything else: "v
   Riverside" alone does not say which child. */
function icsItem(it) {
  const t = state.teams[it.tid] || {};
  const m = it.kind === 'game' ? state.matches[it.id] : null;
  const e = m ? null : (t.events || {})[it.id] || {};
  const desc = [];
  if (m) {
    if (HOME_AWAY[m.home]) desc.push(HOME_AWAY[m.home]);
    if (m.arrive) desc.push('Arrive by ' + niceTime(m.arrive));
    if (m.kit) desc.push('Kit: ' + m.kit);
    if (m.notes) desc.push(m.notes);
  } else if (e.notes) desc.push(e.notes);
  const base = location.origin + location.pathname;
  return {
    uid: it.id, date: it.date, start: it.start, end: it.end, mins: it.mins,
    title: m ? `${t.name || 'Game'} v ${m.opponent || 'TBC'}` : `${t.name ? t.name + ': ' : ''}${it.title}`,
    venue: it.venue, desc: desc.join('\n'), called: it.called,
    url: base + (m ? `#/team/${it.tid}/game/${m.id}/live` : `#/team/${it.tid}/calendar`)
  };
}
function downloadIcs(name, items) {
  const I = ICS();
  if (!I) { toast('Calendar files are not available on this build'); return; }
  if (!items.length) { toast('Nothing coming up to add'); return; }
  const blob = new Blob([I.calendar(name, items, nowMs())], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = I.fileName(name);
  // in the page while it is clicked: some browsers ignore a click on a detached link
  if (document.body && document.body.appendChild) document.body.appendChild(link);
  link.click();
  if (link.parentNode) link.parentNode.removeChild(link);
  // Safari reads the blob after the click returns, so it cannot be revoked on the spot
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* --- who is coming --- */
/* A parent answers for her own child, a coach for anyone on the team. The
   answer is a fact about a named child, so it never goes near public/: the
   share link and the calendar feed carry no answers and no counts. Inside the
   app the coach sees names; a parent sees her own child's answer and how many
   are going; a tracker or a coach of another team, the count. */
const RSVP = { yes: 'Going', no: 'Not going', maybe: 'Maybe' };
const RSVP_SHORT = { yes: 'going', no: 'not going', maybe: 'maybe' };
const RSVP_NOTE_MAX = 140;
const rsvpKey = it => (it.kind === 'game' ? 'g_' : 'e_') + it.id;
const rsvpOf = (tid, key, pid) => ((((state.rsvp || {})[tid] || {})[key] || {})[pid]) || null;
const rsvpSquad = tid => players(state.teams[tid]).filter(p => p.active !== false);
// her own children on this team, by the guardian list rather than by role, as the rule asks
const myKids = tid => !me ? [] : rsvpSquad(tid).filter(p => (p.guardians || {})[me.uid]);
const canRsvp = (tid, pid) => canEditTeam(tid) || myKids(tid).some(p => p.id === pid);
// a past or called-off entry is read, not answered
const rsvpOpen = it => !!it.date && !it.called && !calPast(it) && !(it.kind === 'game' && it.status !== 'upcoming');
function rsvpCounts(tid, key) {
  const c = { yes: 0, no: 0, maybe: 0, none: 0 };
  for (const p of rsvpSquad(tid)) { const r = rsvpOf(tid, key, p.id); c[r && RSVP[r.v] ? r.v : 'none']++; }
  return c;
}
const countLine = c => [c.yes + ' going', c.no ? c.no + ' not' : '', c.maybe ? c.maybe + ' maybe' : '', c.none ? c.none + ' to answer' : ''].filter(Boolean).join(' · ');
const firstName = p => String(p.name || '').trim().split(/\s+/)[0] || ('#' + shirtOf(p));

/* One answer, written where the rule sits. Shown at once and taken back if the
   database refuses it: a parent who taps Going and sees it stick when it did
   not is worse off than one with no button at all. */
function setRsvp(tid, key, pid, v, note) {
  const path = `rsvp/${tid}/${key}/${pid}`;
  const prev = rsvpOf(tid, key, pid);
  const val = RSVP[v] ? { v, by: (me && me.uid) || 'device', at: nowMs(), ...(note ? { note: String(note).slice(0, RSVP_NOTE_MAX) } : {}) } : null;
  if (val) setDeep(state, path, val); else delDeep(state, path);
  saveLocal();
  const w = remoteSet(path, val);
  if (w && w.catch) w.catch(e => {
    forgetPending(path);
    if (prev) setDeep(state, path, prev); else delDeep(state, path);
    saveLocal(); render();
    toast(/permission|denied/i.test((e && e.code) || (e && e.message) || '')
      ? 'Not saved — the club\u2019s database rules need the rsvp block from README'
      : 'Not saved — try again when there is signal');
  });
}

/* The chips for one child, in the sheet and on Next up. Tapping the answer
   already given takes it back. */
function rsvpChips(it, p, from) {
  const r = rsvpOf(it.tid, rsvpKey(it), p.id);
  return `<div class="chips rsvpchips">${Object.entries(RSVP).map(([v, label]) =>
    `<button class="chip" type="button" data-act="rsvp" data-tid="${esc(it.tid)}" data-k="${esc(rsvpKey(it))}" data-pid="${esc(p.id)}" data-v="${v}" data-from="${from}" data-kind="${it.kind}" data-id="${esc(it.id)}" aria-pressed="${!!(r && r.v === v)}">${label}</button>`).join('')}</div>`;
}

/* What the calendar row says about answers: her own children for a parent,
   the count for the coach, nothing for anyone else or for something over. */
function rsvpLine(it) {
  if (!rsvpOpen(it)) return '';
  const key = rsvpKey(it);
  if (canEditTeam(it.tid)) { const c = rsvpCounts(it.tid, key); return c.yes + c.no + c.maybe ? countLine(c) : ''; }
  return myKids(it.tid).map(p => { const r = rsvpOf(it.tid, key, p.id); return `${firstName(p)}: ${r ? RSVP_SHORT[r.v] : 'not answered'}`; }).join(' · ');
}

/* The "who is coming" part of an entry's sheet. */
function rsvpBlock(it) {
  const key = rsvpKey(it), open = rsvpOpen(it);
  const c = rsvpCounts(it.tid, key);
  if (canEditTeam(it.tid)) {
    // who has not answered first: that is who the coach has to chase
    const order = { none: 0, no: 1, maybe: 2, yes: 3 };
    const rows = rsvpSquad(it.tid).map(p => ({ p, r: rsvpOf(it.tid, key, p.id) }))
      .sort((a, b) => order[a.r ? a.r.v : 'none'] - order[b.r ? b.r.v : 'none'] || (Number(a.p.number) || 999) - (Number(b.p.number) || 999));
    if (!rows.length) return '';
    const who = r => r && r.by && r.by !== (me && me.uid) ? ((acc().members || {})[r.by] || {}).name || '' : '';
    return `<div class="rsvpbox"><p class="lbl">Who is coming — ${esc(countLine(c))}</p>
      ${rows.map(({ p, r }) => `<div class="rsvprow">
        <span><b>${esc(shirtOf(p))}</b> ${esc(p.name)}${r ? `<span class="rowsub">${esc(RSVP[r.v])}${who(r) ? ' · said by ' + esc(who(r)) : ''}${r.note ? ' · ' + esc(r.note) : ''}</span>` : '<span class="rowsub">Not answered</span>'}</span>
        ${open ? rsvpChips(it, p, 'sheet') : ''}</div>`).join('')}
      <p class="muted" style="margin-bottom:0">${open ? 'Parents answer for their own child from this calendar. Tap an answer to give one for a family who told you another way.' : 'Answers are closed once it is over or called off.'}</p></div>`;
  }
  const kids = myKids(it.tid);
  if (kids.length) return `<div class="rsvpbox">${kids.map(p => {
    const r = rsvpOf(it.tid, key, p.id);
    return `<p class="lbl">${open ? `Is ${esc(firstName(p))} going?` : esc(firstName(p))}</p>
      ${open ? rsvpChips(it, p, 'sheet') : `<p style="margin:0 0 8px">${r ? esc(RSVP[r.v]) : 'Not answered'}</p>`}
      ${open && r ? `<div class="row" style="margin:8px 0 4px"><input type="text" id="rsvpNote_${esc(p.id)}" maxlength="${RSVP_NOTE_MAX}" value="${esc(r.note || '')}" placeholder="Anything the coach should know?" style="flex:1">
        <button class="btn quiet sm" data-act="rsvpnote" data-tid="${esc(it.tid)}" data-k="${esc(key)}" data-pid="${esc(p.id)}" data-kind="${it.kind}" data-id="${esc(it.id)}">Save</button></div>` : ''}`;
  }).join('')}<p class="muted" style="margin-bottom:0">${c.yes} going so far. The coach sees your answer and any note.</p></div>`;
  return c.yes + c.no + c.maybe ? `<p class="muted">${esc(countLine(c))}</p>` : '';
}

/* --- who came --- */
/* The register for practices and other entries, taken by the coach on the
   day: teams/{tid}/attend/{eid}/{pid} = true (came) or false (missed). Under
   the team, so the team rule already says only its coaches write it; beside
   the entries rather than inside them, so editing a practice can never write
   over the register taken for it. Keyed by the calendar entry's id, which is
   what lets anything hung off that entry later (the drills in its practice
   plan) be counted per player.

   A game needs no register. Minutes played and the availability above already
   say who was there: she played, or she was available and on the bench. */
const attendOf = (tid, eid) => (((state.teams[tid] || {}).attend || {})[eid]) || null;
const cameToGame = (m, pid) => !!m && (playedSec(m, pid) > 0 || !isOut(m, pid));
// before anyone has ticked: a family's "not going" is a likely miss, anyone else probably came
const attendGuess = (tid, eid, pid) => (rsvpOf(tid, 'e_' + eid, pid) || {}).v !== 'no';
// on the day or after, and only for something that happened
const attendDue = it => it.kind !== 'game' && !!it.date && !it.called && it.date <= todayStr();

/* One player's season, by kind. `silent` is a miss nobody warned the coach
   about — no "not going" beforehand — which is the number a coach actually
   asks about. Entries with no register yet are left out rather than counted
   either way. */
function attendance(t, pid) {
  const r = { practice: { came: 0, of: 0, silent: 0 }, event: { came: 0, of: 0, silent: 0 }, game: { came: 0, of: 0 }, session: sessAttendance(pid) };
  for (const it of calItems([t.id])) {
    if (it.called || !it.date) continue;
    if (it.kind === 'game') {
      if (it.status !== 'done') continue;
      r.game.of++;
      if (cameToGame(state.matches[it.id], pid)) r.game.came++;
      continue;
    }
    if (!calPast(it)) continue;
    const a = attendOf(t.id, it.id);
    if (!a || a[pid] === undefined) continue;
    const b = r[it.kind]; b.of++;
    if (a[pid]) b.came++;
    else if ((rsvpOf(t.id, 'e_' + it.id, pid) || {}).v !== 'no') b.silent++;
  }
  return r;
}
function attendLine(r) {
  const miss = b => b.of - b.came;
  return [
    r.practice.of ? `Practices ${r.practice.came} of ${r.practice.of}${miss(r.practice) ? ` · missed ${miss(r.practice)}${r.practice.silent ? ` (${r.practice.silent} without saying)` : ''}` : ''}` : '',
    r.game.of ? `Games ${r.game.came} of ${r.game.of}` : '',
    r.event.of ? `Other ${r.event.came} of ${r.event.of}` : '',
    r.session && r.session.of ? `Extra sessions ${r.session.came} of ${r.session.of}` : ''
  ].filter(Boolean).join(' · ');
}
// past entries nobody has taken the register for
const attendUntaken = t => calItems([t.id]).filter(it => it.kind !== 'game' && !it.called && it.date && calPast(it) && !attendOf(t.id, it.id));

/* On an entry's sheet, for the coach: the register once it is taken, and the
   button to take it from the day itself onwards. */
function attendBlock(it) {
  if (!canEditTeam(it.tid) || !attendDue(it)) return '';
  const a = attendOf(it.tid, it.id), squad_ = rsvpSquad(it.tid);
  if (!a) return `<div class="rsvpbox"><p class="lbl">Who came</p>
    <button class="btn quiet wide" data-act="attend" data-tid="${esc(it.tid)}" data-id="${esc(it.id)}">Take attendance</button></div>`;
  const came = squad_.filter(p => a[p.id] === true), missed = squad_.filter(p => a[p.id] === false);
  return `<div class="rsvpbox"><div class="spread"><p class="lbl" style="margin:0">Who came — ${came.length} of ${came.length + missed.length}</p>
      <button class="btn quiet sm" data-act="attend" data-tid="${esc(it.tid)}" data-id="${esc(it.id)}">Change</button></div>
    ${missed.length ? `<p style="margin:6px 0 0"><b>Missed:</b> ${missed.map(p => esc(p.name)).join(', ')}</p>` : '<p class="muted" style="margin:6px 0 0">Everyone came.</p>'}</div>`;
}

let attForm = null;      // { tid, eid, marks: { pid: bool } } while the register is open
function sheetAttend() {
  const f = attForm; if (!f) return;
  const it = calItems([f.tid]).find(x => x.kind !== 'game' && x.id === f.eid);
  if (!it) { closeSheet(); return; }
  const n = Object.values(f.marks).filter(Boolean).length, all = rsvpSquad(f.tid).length;
  openSheet(`<h3>Who came — ${esc(it.title)}</h3>
    <p class="muted" style="margin-top:0">${esc(dayLabel(it.date))}. ${attendOf(f.tid, f.eid) ? 'Tap anyone to change.' : 'Filled in from what families said — anyone whose family said not going starts as missed. Tap anyone to change, then save.'}</p>
    <button class="btn quiet wide" data-act="attall" style="margin-bottom:10px">Everyone came</button>
    ${rsvpSquad(f.tid).map(p => {
    const r = rsvpOf(f.tid, 'e_' + f.eid, p.id);
    return `<button class="opt spread" type="button" data-act="attmark" data-pid="${esc(p.id)}">
      <span>${esc(shirtOf(p))} ${esc(p.name)}${r ? `<span class="rowsub">Family said ${esc(RSVP_SHORT[r.v])}${r.note ? ' · ' + esc(r.note) : ''}</span>` : ''}</span>
      <span class="${f.marks[p.id] ? 'on' : 'off'}">${f.marks[p.id] ? 'came' : 'missed'}</span></button>`;
  }).join('')}
    <button class="btn wide" data-act="attsave" data-tid="${esc(f.tid)}">Save — ${n} of ${all} came</button>`);
}

/* The Season tab's register, for the coach: who misses most, practices first
   because that is where the question usually is. */
function attendanceCard(t) {
  if (!canEditTeam(t.id)) return '';
  const rows = players(t).filter(p => p.active !== false).map(p => ({ p, r: attendance(t, p.id) }));
  const untaken = attendUntaken(t).length;
  if (!rows.some(x => x.r.practice.of + x.r.event.of + x.r.game.of + x.r.session.of) && !untaken) return '';
  const missed = x => (x.r.practice.of - x.r.practice.came) + (x.r.event.of - x.r.event.came);
  rows.sort((a, b) => missed(b) - missed(a) || (b.r.game.of - b.r.game.came) - (a.r.game.of - a.r.game.came) || (a.p.name || '').localeCompare(b.p.name || ''));
  return `<div class="card"><div class="spread" style="margin-bottom:10px"><h2>Attendance</h2><span class="muted">most missed first</span></div>
    ${untaken ? `<p class="muted" style="margin-top:0">${untaken} past practice${untaken === 1 ? '' : 's'} or event${untaken === 1 ? '' : 's'} with no register yet — open ${untaken === 1 ? 'it' : 'them'} on the Calendar to take it.</p>` : ''}
    <div class="plist">${rows.map(x => `<div class="prow">
      <span class="pnum">${esc(x.p.number ?? '')}</span>
      <span><span class="pname">${esc(x.p.name)}</span><span class="psub">${esc(attendLine(x.r) || 'Nothing recorded yet')}</span></span>
      <span class="pmins">${x.r.practice.of ? `${x.r.practice.came}<small>/${x.r.practice.of}</small>` : '<small>–</small>'}</span></div>`).join('')}</div>
    <p class="muted" style="margin-bottom:0">Practices and events count once the register is taken; a game counts from the minutes and who was available; extra sessions are 1-1s and groups from Training sessions.</p></div>`;
}

/* Calendar sync. A calendar app subscribes to an address and comes back to it
   on its own schedule, from its own servers, never running a line of ours — so
   a static site cannot answer it. worker/calendar.mjs does: it reads the
   public/ node an id names and returns it as a calendar. Where it lives goes in
   firebase-config.js as SOCCER_CALENDAR_FEED; until it is set, the calendar
   offers a copy to add instead, as it did before. */
const feedBase = () => {
  const b = String((typeof window !== 'undefined' && window.SOCCER_CALENDAR_FEED) || '').trim();
  return /^https:\/\/[^\s]+$/.test(b) ? b.replace(/\/*$/, '/') : '';
};
const feedUrl = id => feedBase() && id ? feedBase() + encodeURIComponent(id) + '.ics' : '';
const webcal = u => u.replace(/^https:/, 'webcal:');
// Google's own "add this calendar by address" page, which wants the webcal form
const googleSub = u => 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcal(u));

/* The "in your own calendar" card. With a feed, each team's subscribe buttons
   (or the coach's switch to turn it on); a one-off copy stays as the fallback
   for a phone that will not subscribe. Without one, the copy is all there is,
   and an admin is told what would change that. */
function calSyncCard(t, all) {
  const base = feedBase();
  const list = all ? myTeams() : [t];
  const copyNote = `Everything still to come${all ? ' for these teams' : ''}, as a file your phone\u2019s calendar opens. It is a copy: if a time changes later, add it again — each entry replaces its earlier self in calendars that allow it.`;
  if (!base) return `<div class="card"><h2 style="margin-bottom:8px">In your own calendar</h2>
    <p class="muted" style="margin-top:0">${copyNote}</p>
    <button class="btn quiet wide" data-act="calicsall">Add what is coming up</button>
    ${canAdmin() ? '<p class="muted" style="margin-bottom:0">A calendar that follows every change by itself needs the calendar feed set up once for the club — README, <b>Calendar sync</b>.</p>' : ''}
    ${!all && t.share ? `<p class="muted" style="margin-bottom:0">Grandparents and friends without an account: the season link shows the games, and anything marked for the share link, with no names.</p>` : ''}</div>`;
  const rows = list.map(x => {
    const u = feedUrl(x.calFeed);
    if (u) return `<div class="syncrow">${all ? `<p class="lbl">${teamLabel(x)}</p>` : ''}
      <div class="row wrap">
        <a class="btn sm" href="${esc(webcal(u))}">Apple Calendar</a>
        <a class="btn quiet sm" href="${esc(googleSub(u))}" target="_blank" rel="noopener">Google Calendar</a>
        <button class="btn quiet sm" data-act="copytext" data-v="${esc(u)}">Copy the address</button></div>
      ${canEditTeam(x.id) ? `<button class="textbtn" data-act="calsyncnew" data-tid="${esc(x.id)}" style="margin-top:6px">Replace this address</button>` : ''}</div>`;
    return canEditTeam(x.id)
      ? `<button class="btn wide" data-act="calsyncon" data-tid="${esc(x.id)}" style="margin-bottom:8px">Turn on calendar sync${all ? ' for ' + teamLabel(x) : ''}</button>`
      : `<p class="muted">${all ? teamLabel(x) + ': the' : 'The'} coach has not turned calendar sync on yet.</p>`;
  }).join('');
  return `<div class="card"><h2 style="margin-bottom:8px">In your own calendar</h2>
    <p class="muted" style="margin-top:0">Subscribe once and your calendar follows every change — a moved kick-off, a called-off practice, a new tournament. Apple and Outlook check about every hour; Google keeps its own pace, often several hours.</p>
    ${rows}
    ${isSandbox() ? '<p class="muted">Test club: nothing is published, so a subscription here stays empty.</p>' : ''}
    <p class="muted">The address shows practices as well as games — never names — so keep it to the team. Outlook: <i>Add calendar \u2192 From internet</i> and paste the address.</p>
    <button class="btn quiet wide" data-act="calicsall">Or add a one-off copy</button></div>`;
}

/* What the coach texts the other team's coach, already written. The game link
   is the same page families get — when, where and the live score — which is
   everything an opponent needs and nothing a share page does not already
   publish. Arrive-by is left out: that is our families' time, not theirs. */
function opponentMessage(t, m) {
  const us = t.name || 'Us', them = m.opponent || 'TBC';
  const fixture = m.home === 'away' ? `${them} v ${us}` : `${us} v ${them}`;
  const when = m.date ? dayLabel(m.date) : 'date to be confirmed';
  const lines = [CALLED[m.called]
    ? `${fixture} on ${when} is ${CALLED[m.called].toLowerCase()}.`
    : `${fixture}: ${when}${m.kickoff ? ', kick-off ' + niceTime(m.kickoff) : ''}.`];
  const I = ICS();
  if (m.venue) lines.push(`Where: ${m.venue}${I ? ' — ' + I.mapLink(m.venue) : ''}`);
  if (m.kit) lines.push(`We will be in ${m.kit}.`);
  if (gameLink(t, m)) lines.push(`Details and the live score: ${gameLink(t, m)}`);
  return lines.join('\n');
}

function calRow(it, all) {
  if (it.kind === 'session') return sessCalRow(it, all);
  const t = state.teams[it.tid] || {};
  const edit = canEditTeam(it.tid);
  // most entries are the team's own, so it is the exception that gets marked
  const sub = [it.venue, it.home && HOME_AWAY[it.home], all ? t.name : '',
    edit && it.kind !== 'game' && it.public ? 'on the share link' : '', rsvpLine(it),
    edit && attendDue(it) && calPast(it) ? (a => a ? `${Object.values(a).filter(Boolean).length} came` : 'no register yet')(attendOf(it.tid, it.id)) : ''].filter(Boolean);
  const m = it.kind === 'game' ? state.matches[it.id] : null;
  const right = it.called ? `<span class="tag off">${CALLED[it.called]}</span>`
    : m && it.status !== 'upcoming' ? `<span class="pmins">${score(m).us}<small>–${score(m).them}</small></span>`
      : `<span class="tag ${it.kind}">${CAL_KIND[it.kind]}</span>`;
  return `<button class="prow calrow" type="button" data-act="calitem" data-k="${it.kind}" data-tid="${esc(it.tid)}" data-id="${esc(it.id)}" data-called="${it.called ? 1 : 0}">
    <span class="caltime">${it.start ? niceTime(it.start) : it.date ? 'All day' : 'TBC'}</span>
    <span style="min-width:0"><span class="pname">${esc(it.title)}</span>${sub.length ? `<span class="psub">${esc(sub.join(' · '))}</span>` : ''}</span>
    ${right}</button>`;
}
/* A training session on a team's calendar. Its coach and the team's coaches
   see who is going; a family sees how her own child stands. */
function sessCalRow(it, all) {
  const s = sessById(it.id); if (!s) return '';
  const t = state.teams[it.tid] || {};
  const sub = [it.venue, all ? t.name : '', it.who.map(x => `${canEditTeam(it.tid) ? whoName(x) : firstName(x.who ? x.who.p : {})}${x.st === 'in' ? '' : ' (' + BOOK[x.st].toLowerCase() + ')'}`).join(', ')].filter(Boolean);
  return `<button class="prow calrow" type="button" data-act="sessopen" data-id="${esc(s.id)}" data-called="${it.called ? 1 : 0}">
    <span class="caltime">${it.start ? niceTime(it.start) : 'TBC'}</span>
    <span style="min-width:0"><span class="pname">${esc(it.title)}</span>${sub.length ? `<span class="psub">${esc(sub.join(' · '))}</span>` : ''}</span>
    ${it.called ? `<span class="tag off">${CALLED[it.called]}</span>` : '<span class="tag session">Training</span>'}</button>`;
}
function calList(items, all) {
  let out = '', last = null;
  for (const it of items) {
    if (it.date !== last) {
      const rel = relDay(it.date);
      out += `<p class="calhead">${esc(dayLabel(it.date))}${rel ? ` <span>· ${rel}</span>` : ''}</p>`;
      last = it.date;
    }
    out += calRow(it, all);
  }
  return out;
}

/* A month at a glance: a dot per thing on each day, coloured by kind. It is
   for finding a day; the list below it is for reading one. */
function calMonth(items) {
  const today = todayStr();
  const ym = /^\d{4}-\d{2}$/.test(ui.calMonth || '') ? ui.calMonth : today.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const lead = weekdayOf(ym + '-01');
  const days = new Date(y, mo, 0).getDate();
  const on = {};
  for (const it of items) if (it.date.startsWith(ym)) (on[it.date] = on[it.date] || []).push(it);
  let cells = WEEKDAYS.map(w => `<span class="wd">${w.slice(0, 2)}</span>`).join('');
  for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let n = 1; n <= days; n++) {
    const d = `${ym}-${pad2(n)}`, list = on[d] || [];
    const attrs = `class="calday" data-today="${d === today ? 1 : 0}" data-past="${d < today ? 1 : 0}"`;
    const dots = list.slice(0, 3).map(x => `<i class="dot ${x.kind}${x.called ? ' off' : ''}"></i>`).join('');
    cells += list.length
      ? `<button type="button" ${attrs} data-act="calday" data-v="${d}" aria-label="${esc(dayLabel(d))}: ${list.length} on">${n}<span class="dots">${dots}</span></button>`
      : `<span ${attrs}>${n}<span class="dots"></span></span>`;
  }
  return `<div class="card">
    <div class="spread" style="margin-bottom:8px">
      <button class="stepbtn" data-act="calmonth" data-v="-1" aria-label="Previous month">‹</button>
      <b>${MONTHS_LONG[mo - 1]} ${y}</b>
      <button class="stepbtn" data-act="calmonth" data-v="1" aria-label="Next month">›</button></div>
    <div class="calgrid">${cells}</div>
    <div class="spread" style="margin-top:8px">
      <span class="calkey"><i class="dot game"></i>Game <i class="dot practice"></i>Practice <i class="dot event"></i>Other${items.some(x => x.kind === 'session') ? ' <i class="dot session"></i>Training' : ''}</span>
      ${ym !== today.slice(0, 7) ? '<button class="textbtn" data-act="calmonth" data-v="0">This month</button>' : ''}</div>
  </div>`;
}

/* The thing a parent opened the app for, with the two buttons that follow
   from it: how to get there, and put it in my calendar. */
function calNextCard(it, all) {
  const t = state.teams[it.tid] || {};
  if (it.kind === 'session') {
    return `<div class="card calnext"><span class="muted">Next up${all ? ' · ' + teamLabel(t) : ''}</span>
      <button class="plainbtn" data-act="sessopen" data-id="${esc(it.id)}" style="display:block;width:100%;text-align:left">
        <div class="spread" style="margin-top:4px"><b style="font-size:19px">${esc(it.title)}</b><span class="tag session">Training</span></div>
        <p style="margin:4px 0 0"><b>${esc([relDay(it.date) || dayLabel(it.date), it.start ? niceTime(it.start) : 'time to be confirmed'].join(' · '))}</b></p>
        ${it.venue ? `<p class="muted" style="margin:2px 0 0">${esc(it.venue)}</p>` : ''}</button></div>`;
  }
  const m = it.kind === 'game' ? state.matches[it.id] : null;
  const I = ICS();
  const live = m && it.status === 'live';
  const when = live ? 'Playing now'
    : [relDay(it.date) || dayLabel(it.date), it.start ? niceTime(it.start) : 'all day'].join(' · ');
  const bits = [it.venue, m && m.arrive ? 'arrive by ' + niceTime(m.arrive) : '', m && m.kit ? 'kit: ' + m.kit : ''].filter(Boolean);
  return `<div class="card calnext">
    <span class="muted">${live ? '' : 'Next up'}${all ? (live ? '' : ' · ') + teamLabel(t) : ''}</span>
    <button class="plainbtn" data-act="calitem" data-k="${it.kind}" data-tid="${esc(it.tid)}" data-id="${esc(it.id)}" style="display:block;width:100%;text-align:left">
      <div class="spread" style="margin-top:4px"><b style="font-size:19px">${esc(it.title)}</b>
        ${live ? `<span class="pmins">${score(m).us}<small>–${score(m).them}</small></span>` : `<span class="tag ${it.kind}">${CAL_KIND[it.kind]}</span>`}</div>
      <p style="margin:4px 0 0"><b>${esc(when)}</b>${it.home ? ' · ' + esc(HOME_AWAY[it.home]) : ''}</p>
      ${bits.length ? `<p class="muted" style="margin:2px 0 0">${esc(bits.join(' · '))}</p>` : ''}
    </button>
    ${live ? '' : `<div class="row wrap" style="margin-top:10px">
      ${it.venue && I ? `<a class="btn quiet sm" href="${esc(I.mapLink(it.venue))}" target="_blank" rel="noopener">Directions</a>` : ''}
      <button class="btn quiet sm" data-act="calitem" data-k="${it.kind}" data-tid="${esc(it.tid)}" data-id="${esc(it.id)}">Add to my calendar</button></div>`}
    ${rsvpOpen(it) && !canEditTeam(it.tid) ? myKids(it.tid).map(p => `<p class="lbl" style="margin-top:12px">Is ${esc(firstName(p))} going?</p>${rsvpChips(it, p, 'next')}`).join('')
      : rsvpOpen(it) && rsvpLine(it) ? `<p class="muted" style="margin:8px 0 0">${esc(rsvpLine(it))}</p>` : ''}
  </div>`;
}

function viewCalendar() {
  const t = team(); if (!t) return needTeam();
  const mine = myTeams();
  const all = !!ui.calAll && mine.length > 1;
  // sessions are drawn here, never in calItems(): that list feeds the share link and the calendar feed
  const items = [...calItems(calTeams()), ...sessCalItems(calTeams())].sort(calOrder);
  const dated = items.filter(x => x.date);
  const ahead = dated.filter(x => !calPast(x));
  const past = dated.filter(calPast).reverse();
  const undated = items.filter(x => !x.date && !(x.kind === 'game' && x.status === 'done'));
  // a session she has only asked for is not somewhere to drive to yet
  const next = calNext(items.filter(x => x.kind !== 'session' || x.firm));
  const edit = canEditTeam(t.id);
  return `<div class="stack">
    <div class="spread"><h2>Calendar</h2>${edit ? `<button class="btn sm" data-act="calnew" data-tid="${esc(t.id)}">Add</button>` : ''}</div>
    ${mine.length > 1 ? `<div class="chips">
      <button class="chip" data-act="calscope" data-v="team" aria-pressed="${!all}">${teamLabel(t)}</button>
      <button class="chip" data-act="calscope" data-v="all" aria-pressed="${all}">All my teams</button></div>` : ''}
    ${next ? calNextCard(next, all) : ''}
    ${calMonth(dated)}
    <div class="card"><h2 style="margin-bottom:0">Coming up</h2>
      ${ahead.length ? `<div class="plist">${calList(ahead, all)}</div>`
      : `<p class="muted" style="margin-bottom:0">Nothing on the calendar yet.${edit ? ' Add the season’s practices with <b>Add</b>, and games from the Games tab.' : ' The coach adds games and practices here.'}</p>`}</div>
    ${undated.length ? `<div class="card"><h2 style="margin-bottom:8px">Date to be confirmed</h2>
      <div class="plist">${undated.map(x => calRow(x, all)).join('')}</div></div>` : ''}
    ${past.length ? `<button class="btn quiet wide" data-act="calpast">${ui.calPast ? 'Hide' : 'Show'} what has already happened (${past.length})</button>
      ${ui.calPast ? `<div class="card"><div class="plist">${calList(past, all)}</div></div>` : ''}` : ''}
    ${calSyncCard(t, all)}
  </div>`;
}

/* One entry, read in full: when, where, what to bring, and the doors out of
   it. The same sheet for every role; only the edit buttons depend on who. */
function sheetCalItem(kind, tid, id) {
  const t = state.teams[tid]; if (!t) return;
  const it = calItems([tid]).find(x => x.kind === kind && x.id === id);
  if (!it) { closeSheet(); return; }
  const m = kind === 'game' ? state.matches[id] : null;
  const e = m ? null : (t.events || {})[id];
  const edit = canEditTeam(tid);
  const I = ICS();
  const span = it.start ? niceTime(it.start) + (it.end ? '–' + niceTime(it.end) : '') : 'All day';
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const left = e && e.series ? seriesOf(t, e.series).filter(x => (x.date || '') > (e.date || '')).length : 0;
  openSheet(`<h3>${esc(it.title)}</h3>
    ${it.called ? `<div class="warn alert" style="margin-bottom:10px"><b>${CALLED[it.called]}.</b>${m && it.called === 'postponed' ? ' A new date will be set.' : ''}</div>` : ''}
    <p class="muted" style="margin-top:0">${teamLabel(t)} · ${CAL_KIND[kind]}${e && edit ? (e.public ? ' · on the share link' : ' · team only') : ''}</p>
    <dl class="facts">
      ${row('When', esc(dayLabel(it.date)) + (it.date ? ' · ' + esc(span) : ''))}
      ${row('Where', esc(it.venue))}
      ${m ? row('Ground', esc(HOME_AWAY[m.home] || '')) + row('Arrive by', esc(niceTime(m.arrive))) + row('Kit', esc(m.kit || ''))
      + row('Format', `${m.onFieldCount || 11}v${m.onFieldCount || 11} · ${m.periodCount || 2} × ${m.periodMinutes || 40} min`) : ''}
      ${row('Notes', esc((m ? m.notes : e && e.notes) || '').replace(/\n/g, '<br>'))}
      ${left ? row('Repeats', `Weekly · ${left} more after this`) : ''}
    </dl>
    ${rsvpBlock(it)}
    ${attendBlock(it)}
    ${it.date ? `<div class="row wrap" style="margin-bottom:10px">
      ${it.venue && I ? `<a class="btn quiet sm" href="${esc(I.mapLink(it.venue))}" target="_blank" rel="noopener">Directions</a>` : ''}
      ${I ? `<a class="btn quiet sm" href="${esc(I.googleLink(icsItem(it)))}" target="_blank" rel="noopener">Google Calendar</a>` : ''}
      <button class="btn quiet sm" data-act="calics" data-k="${kind}" data-tid="${esc(tid)}" data-id="${esc(id)}">Apple or Outlook</button></div>` : ''}
    ${m ? `<button class="btn wide" data-act="calgame" data-tid="${esc(tid)}" data-id="${esc(id)}" style="margin-bottom:8px">Open the game</button>` : ''}
    ${m && edit ? `<button class="btn quiet wide" data-act="caleditgame" data-tid="${esc(tid)}" data-id="${esc(id)}" style="margin-bottom:8px">Edit this game’s details</button>
      <button class="btn quiet wide" data-act="copytext" data-v="${esc(opponentMessage(t, m))}">Copy a message for the other team</button>` : ''}
    ${e && e.kind === 'practice' && canPlan(tid) ? `<button class="btn wide" data-act="pracfromcal" data-tid="${esc(tid)}" data-id="${esc(id)}" style="margin-bottom:8px">${practiceById(tid, id) ? 'Open the plan' : 'Plan this practice'}</button>` : ''}
    ${e && edit ? `<button class="btn quiet wide" data-act="caledit" data-tid="${esc(tid)}" data-id="${esc(id)}">Edit</button>` : ''}`);
}

function sheetCalDay(date) {
  const items = [...calItems(calTeams()), ...sessCalItems(calTeams())].sort(calOrder).filter(x => x.date === date);
  const all = !!ui.calAll && myTeams().length > 1;
  const edit = canEditTeam(ui.teamId);
  openSheet(`<h3>${esc(dayLabel(date))}</h3>
    <div class="plist">${items.map(x => calRow(x, all)).join('') || '<p class="muted">Nothing on.</p>'}</div>
    ${edit ? `<button class="btn quiet wide" data-act="calnew" data-tid="${esc(ui.teamId)}" data-v="${date}" style="margin-top:10px">Add something on this day</button>` : ''}`);
}

/* The add/edit sheet keeps its fields in calForm and reads them back before
   every redraw, so tapping Practice or a weekday chip does not throw away
   what was already typed. */
let calForm = null;
function calFormRead() {
  if (!calForm) return;
  for (const [k, sel] of [['title', '#evTitle'], ['date', '#evDate'], ['start', '#evStart'], ['end', '#evEnd'],
  ['venue', '#evVenue'], ['notes', '#evNotes'], ['until', '#evUntil']]) {
    const el = $(sel);
    if (el && typeof el.value === 'string') calForm[k] = el.value;
  }
}
function calFormNew(tid, date) {
  const t = state.teams[tid] || {};
  const d = okDay(date) ? date : todayStr();
  /* Practice is usually the same time and place every week, so a new one
     starts from the last one rather than from blank. */
  const last = Object.values(t.events || {}).filter(e => e && e.kind === 'practice')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || {};
  return {
    tid, id: null, kind: 'practice', title: '', date: d, start: last.start || '', end: last.end || '',
    venue: last.venue || '', notes: '', public: false, repeat: false, days: [weekdayOf(d)],
    until: addDays(d, 7 * 10), scope: 'one'
  };
}
function calFormEdit(tid, e) {
  return {
    tid, id: e.id, kind: e.kind === 'practice' ? 'practice' : 'event', title: e.title || '', date: e.date || '',
    start: e.start || '', end: e.end || '', venue: e.venue || '', notes: e.notes || '', public: !!e.public,
    repeat: false, days: [], until: '', scope: 'one'
  };
}
function sheetCalEvent() {
  const f = calForm; if (!f) return;
  const t = state.teams[f.tid]; if (!t) return;
  const isNew = !f.id;
  const e = isNew ? null : (t.events || {})[f.id];
  if (!isNew && !e) { closeSheet(); return; }
  const inSeries = e && e.series && seriesOf(t, e.series).length > 1;
  const word = f.kind === 'practice' ? 'practice' : 'event';
  const n = isNew && f.repeat ? seriesDates(f.date, f.until, f.days).length : 1;
  const chip = (act, v, on, label) => `<button class="chip" type="button" data-act="${act}" data-v="${v}" aria-pressed="${!!on}">${label}</button>`;
  /* Names never reach the share link: anything typed here that matches the
     roster is swapped out of the published copy. Saying so is better than a
     coach finding "a player" on the season page and not knowing why. */
  openSheet(`<h3>${isNew ? 'Add to the calendar' : 'Edit ' + word}</h3>
    ${isNew ? `<div class="chips" style="margin-bottom:12px">
      ${chip('calkind', 'practice', f.kind === 'practice', 'Practice')}
      ${chip('calkind', 'event', f.kind === 'event', 'Something else')}
      <button class="chip" type="button" data-act="newmatch" data-from="cal">A game →</button></div>` : ''}
    <label class="field"><span>What</span><input type="text" id="evTitle" value="${esc(f.title)}" placeholder="${f.kind === 'practice' ? 'Practice' : 'Team photo, tournament, end-of-season party'}"></label>
    <label class="field"><span>${isNew && f.repeat ? 'First one' : 'Date'}</span><input type="date" id="evDate" value="${esc(f.date)}"></label>
    <div class="grid2">
      <label class="field"><span>Starts</span><input type="time" id="evStart" value="${esc(f.start)}"></label>
      <label class="field"><span>Ends</span><input type="time" id="evEnd" value="${esc(f.end)}"></label>
    </div>
    <label class="field"><span>Where</span><input type="text" id="evVenue" value="${esc(f.venue)}" placeholder="Lakeside Park, field 3"></label>
    <label class="field"><span>Notes</span><textarea id="evNotes" rows="2" placeholder="Bring a ball and water">${esc(f.notes)}</textarea></label>
    ${isNew ? `<p class="lbl">Repeats</p>
      <div class="chips" style="margin-bottom:10px">${chip('calrepeat', '0', !f.repeat, 'Just once')}${chip('calrepeat', '1', f.repeat, 'Every week')}</div>
      ${f.repeat ? `<div class="chips" style="margin-bottom:10px">${WEEKDAYS.map((w, i) => chip('calwd', i, f.days.includes(i), w)).join('')}</div>
        <label class="field"><span>Last one</span><input type="date" id="evUntil" value="${esc(f.until)}"></label>
        <p class="muted" style="margin-top:-4px">${n} ${word}${n === 1 ? '' : 's'}${n >= SERIES_MAX ? ' (the most at once)' : ''}. Each is its own entry, so one week can be moved or called off without touching the rest.</p>` : ''}` : ''}
    <p class="lbl">Who sees it</p>
    <div class="chips" style="margin-bottom:6px">${chip('calpub', '0', !f.public, 'The team')}${chip('calpub', '1', f.public, 'The team and the share link')}</div>
    <p class="muted" style="margin-top:0">The team is everyone signed in with a role on it: coaches, trackers and parents. The share link is the season page you text to families, and anyone it is forwarded to can read it — names typed here are taken out of that copy.</p>
    ${inSeries ? `<p class="lbl">Change</p>
      <div class="chips" style="margin-bottom:10px">${chip('calscopeed', 'one', f.scope !== 'later', 'Just this one')}${chip('calscopeed', 'later', f.scope === 'later', 'This and every later one')}</div>` : ''}
    <button class="btn wide" data-act="calsave" data-tid="${esc(f.tid)}" style="margin-bottom:8px">${isNew ? (n > 1 ? `Add ${n} ${word}s` : 'Add it') : 'Save'}</button>
    ${isNew ? '' : `<button class="btn quiet wide" data-act="calcall" data-tid="${esc(f.tid)}" style="margin-bottom:8px">${e.called ? 'It is back on' : 'Call it off'}</button>
      <button class="btn danger wide" data-act="caldel" data-tid="${esc(f.tid)}">Delete</button>`}`);
}

/* Each entry goes out at its own path, teams/{tid}/events/{eid} — below the
   rule on $tid, which is what grants it — and the redraw and the republish
   happen once at the end rather than once per week of a series. */
function calTargets() {
  const f = calForm, t = state.teams[f.tid] || {};
  const e = (t.events || {})[f.id];
  if (!e) return [];
  return f.scope === 'later' && e.series ? seriesOf(t, e.series).filter(x => (x.date || '') >= (e.date || '')) : [e];
}
function calDone(msg) {
  saveLocal(); schedulePublish(); closeSheet(); render();
  if (msg) toast(msg);
}
function saveCalEvent() {
  calFormRead();
  const f = calForm; if (!f) return;
  const t = state.teams[f.tid]; if (!t) return;
  if (!okDay(f.date)) { toast('Pick a date'); return; }
  const kind = f.kind === 'practice' ? 'practice' : 'event';
  const fields = { kind, title: (f.title || '').trim() || CAL_KIND[kind], start: hm(f.start), end: hm(f.end), venue: (f.venue || '').trim(), notes: (f.notes || '').trim(), public: !!f.public };
  const scrubbed = fields.public && ['title', 'venue', 'notes'].some(k => pubText(t, fields[k]) !== fields[k]);
  const why = scrubbed ? ' · a name in it is left off the share link' : '';
  if (f.id) {
    const list = calTargets();
    for (const x of list) quiet(`teams/${f.tid}/events/${x.id}`, { ...x, ...fields, ...(x.id === f.id ? { date: f.date } : {}) });
    calForm = null;
    calDone((list.length > 1 ? `Saved ${list.length}` : 'Saved') + why);
    return;
  }
  const dates = f.repeat ? seriesDates(f.date, f.until, f.days.length ? f.days : [weekdayOf(f.date)]) : [f.date];
  if (!dates.length) { toast('No days between those dates'); return; }
  const series = dates.length > 1 ? uid() : null;
  let first = null;
  for (const date of dates) {
    const id = uid();
    const e = { id, ...fields, date, ...(series ? { series } : {}), createdAt: nowMs(), ...(me ? { by: me.uid } : {}) };
    quiet(`teams/${f.tid}/events/${id}`, e);
    first = first || e;
  }
  /* Added from the Practice tab: the coach came to plan it, so its plan is
     made and opened. The other weeks of a series wait on the Plans list. */
  if (f.plan && kind === 'practice' && canPlan(f.tid)) {
    planFromEntry(f.tid, first);
    const p = practiceUi();
    ui.view = 'practice'; p.tab = 'plans'; p.open = first.id; p.pick = null; p.run = null;
  }
  calForm = null;
  calDone((dates.length > 1 ? `Added ${dates.length} ${kind === 'practice' ? 'practices' : 'events'}` : 'Added') + why);
}

/* --- games --- */
function viewMatches() {
  const t = team(); if (!t) return needTeam();
  const list = teamMatches(t.id);
  const rows = list.map(m => {
    const el = elapsedSec(m);
    /* Before kick-off the useful line is when and where; after it, how long
       and how it went. "0 min played" on next week's game said nothing. */
    const st = gameStatus(m);
    const when = [m.date ? dayLabel(m.date) : 'No date yet', niceTime(m.kickoff), HOME_AWAY[m.home]].filter(Boolean).join(' · ');
    return `<button class="prow" type="button" data-act="openmatch" data-id="${m.id}" style="grid-template-columns:1fr auto">
      <span><span class="pname">${esc(m.opponent || 'Game')}</span><span class="psub">${st === 'upcoming'
        ? esc(when)
        : `${esc(m.date ? dayLabel(m.date) : '')} · <span data-live="gmins" data-mid="${m.id}">${mins(el)}</span> min played${running(m) ? ' · clock running' : ''}`}</span></span>
      ${CALLED[m.called] && st === 'upcoming' ? `<span class="tag off">${CALLED[m.called]}</span>`
        : st === 'upcoming' ? '<span class="tag game">Upcoming</span>'
          : `<span class="pmins">${score(m).us}<small>–${score(m).them}</small></span>`}</button>`;
  }).join('') || `<div class="empty"><strong>No games yet</strong>${readOnlyHere() ? "The team's coach adds them." : 'Add one and it becomes the live game.'}</div>`;
  return `<div class="stack">${nextPracticeCard(t)}<div class="spread"><h2>Games</h2>${addGameBtn('btn sm')}</div><div class="plist">${rows}</div></div>`;
}

/* --- roster --- */
function viewRoster() {
  const t = team(); if (!t) return needTeam();
  const list = players(t);
  const ro = !canEditTeam(t.id);
  const rows = list.map(p => {
    const bits = [];
    if (p.gk) bits.push('keeper');
    if (p.preferred) bits.push('best at ' + p.preferred);
    if ((p.canPlay || []).length) bits.push('also ' + p.canPlay.join('/'));
    if (p.anywhere === false) bits.push('fixed position');
    const np = Object.keys(p.pairs || {}).length, na = Object.keys(p.avoid || {}).length;
    if (np) bits.push(np + ' pairing' + (np > 1 ? 's' : ''));
    if (na) bits.push(na + ' to keep apart');
    if (p.maxStint) bits.push('max ' + p.maxStint + ' min');
    if (p.active === false) bits.unshift('off the roster');
    // read-only, the row is not a button: editplayer opens the edit sheet
    return `<${ro ? 'div' : 'button type="button" data-act="editplayer"'} class="prow" data-pid="${p.id}">
      ${p.photo ? `<img class="crest sm" src="${esc(p.photo)}" alt="">` : `<span class="pnum">${esc(p.number ?? '')}</span>`}
      <span><span class="pname">${esc(p.name)}</span><span class="psub">${esc(bits.join(' · ') || 'no profile yet')}</span></span>
      <span class="stars" aria-label="rated ${rating(p)} of 5">${'●'.repeat(rating(p))}<span class="dim">${'●'.repeat(5 - rating(p))}</span></span></${ro ? 'div' : 'button'}>`;
  }).join('') ||
    `<div class="empty"><strong>No players yet</strong>${ro ? "The team's coach adds the squad." : 'Add the squad once; every game reuses it.'}</div>`;
  return `<div class="stack">
    <div class="spread"><h2>${esc(t.name)}</h2><span class="muted">${list.length} players</span></div>
    ${ro ? '' : joinCard(t)}
    ${ro ? '' : `<div class="card"><div class="row" style="align-items:flex-end">
      <div style="width:76px"><label class="field"><span>Number</span><input type="number" inputmode="numeric" id="newNum" placeholder="7"></label></div>
      <div style="flex:1"><label class="field"><span>Name</span><input type="text" id="newName" placeholder="Ella Moreno"></label></div>
      <button class="btn" data-act="addplayer" style="margin-bottom:10px">Add</button>
    </div></div>`}
    <div class="plist">${rows}</div></div>`;
}

/* --- season: the team first, then the players --- */
function viewSeason() {
  const t = team(); if (!t) return needTeam();
  const ms = teamMatches(t.id);
  const done = ms.filter(m => gameStatus(m) === 'done');
  const now = nowMs();

  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  let sOn = 0, sOff = 0, sOnA = 0, sOffA = 0, pu = 0, pt = 0, pc = 0;
  // Early games predate shot and possession tracking. Averaging over every game
  // would quietly understate both, so each family counts only the games that
  // actually carry it.
  let shotGames = 0, possGames = 0, evGames = 0;
  const evTot = {};
  for (const m of ms) {
    const sc = score(m), sh = shotTally(m);
    sOn += sh.usOn; sOff += sh.usOff; sOnA += sh.themOn; sOffA += sh.themOff;
    if (shotList(m).length) shotGames++;
    const po = possession(m, now);
    if (po.changes > 2) { pu += po.us; pt += po.them; pc += po.contested; possGames++; }
    let anyEv = false;
    for (const e of EVENTS) {
      const u = evCount(m, e.k, 'us'), th = evCount(m, e.k, 'them');
      if (u + th) { anyEv = true; evTot[e.k] = evTot[e.k] || { us: 0, them: 0 }; evTot[e.k].us += u; evTot[e.k].them += th; }
    }
    if (anyEv) evGames++;
    if (gameStatus(m) === 'done') {
      gf += sc.us; ga += sc.them;
      if (sc.us > sc.them) w++; else if (sc.us === sc.them) d++; else l++;
    }
  }
  const settled = pu + pt, ptot = settled + pc;
  const shotsFor = sOn + sOff, shotsAg = sOnA + sOffA;

  const stat = (label, a, b) => `<span class="tallylbl">${label}</span><b>${a}</b><b>${b}</b>`;

  const record = `<div class="card">
    <div class="spread"><h2>${w}W ${d}D ${l}L</h2>
      <span class="muted">${done.length} played${ms.length > done.length ? ` · ${ms.length - done.length} to come` : ''}</span></div>
    <div class="statgrid" style="grid-template-columns:1fr 60px 60px;margin-top:10px">
      <span></span><span class="tallyhead">For</span><span class="tallyhead">Against</span>
      ${stat('Goals', gf, ga)}
      ${done.length ? stat('Per game', (gf / done.length).toFixed(1), (ga / done.length).toFixed(1)) : ''}
    </div></div>`;

  const shotsCard = (shotsFor + shotsAg) ? `<div class="card"><h2 style="margin-bottom:10px">Shooting</h2>
    <div class="statgrid" style="grid-template-columns:1fr 60px 60px">
      <span></span><span class="tallyhead">For</span><span class="tallyhead">Against</span>
      ${stat('Shots', shotsFor, shotsAg)}
      ${stat('On target', sOn, sOnA)}
      ${stat('Accuracy', shotsFor ? Math.round(sOn / shotsFor * 100) + '%' : '—', shotsAg ? Math.round(sOnA / shotsAg * 100) + '%' : '—')}
      ${stat('Scored from', shotsFor ? Math.round(gf / shotsFor * 100) + '%' : '—', shotsAg ? Math.round(ga / shotsAg * 100) + '%' : '—')}
      ${shotGames ? stat('Per game', (shotsFor / shotGames).toFixed(1), (shotsAg / shotGames).toFixed(1)) : ''}
    </div>
    ${shotGames < ms.length ? `<p class="muted" style="margin-bottom:0">From ${shotGames} of ${ms.length} games. The rest were played before shots were counted, so they are left out rather than dragging the average down.</p>` : ''}</div>` : '';

  const evKeys = Object.keys(evTot);
  const evCard = evKeys.length ? `<div class="card"><h2 style="margin-bottom:10px">Set pieces and fouls</h2>
    <div class="statgrid" style="grid-template-columns:1fr 60px 60px">
      <span></span><span class="tallyhead">Us</span><span class="tallyhead">Them</span>
      ${evKeys.map(k => stat(evLabel(k), evTot[k].us, evTot[k].them)).join('')}
    </div>
    <p class="muted" style="margin-bottom:0">From ${evGames} of ${ms.length} game${ms.length === 1 ? '' : 's'}${evGames < ms.length ? ', the rest predating these counters' : ''}.</p></div>` : '';

  const possCard = ptot ? `<div class="card"><h2 style="margin-bottom:10px">Possession</h2>
    <div class="possbar"><i style="width:${Math.round(pu / ptot * 100)}%"></i><u style="width:${Math.round(pc / ptot * 100)}%"></u></div>
    <div class="spread" style="margin-top:6px"><span>${settled ? Math.round(pu / settled * 100) : 50}% ours</span>
      <span class="muted">${Math.round(pc / ptot * 100)}% scrappy</span></div>
    <p class="muted" style="margin-bottom:0">Settled play across ${possGames} of ${ms.length} game${ms.length === 1 ? '' : 's'}${possGames < ms.length ? ', ignoring those with too little recorded to judge' : ''}.</p></div>` : '';

  const results = ms.length ? `<div class="card"><h2 style="margin-bottom:10px">Results</h2>
    <div class="plist">${ms.map(m => {
    const sc = score(m), st = gameStatus(m);
    const r = st !== 'done' ? '' : sc.us > sc.them ? 'W' : sc.us === sc.them ? 'D' : 'L';
    return `<button class="prow" type="button" data-act="openmatch" data-id="${m.id}" style="grid-template-columns:26px 1fr auto">
      <span class="resbadge" data-r="${r}">${r || '·'}</span>
      <span><span class="pname">${esc(m.opponent || 'TBC')}</span>
        <span class="psub">${[shortDate(m.date), m.venue].filter(Boolean).map(esc).join(' · ') || 'no date'}</span></span>
      <span class="pmins">${st === 'upcoming' ? '<small>upcoming</small>' : `${sc.us}<small>–${sc.them}</small>`}</span></button>`;
  }).join('')}</div></div>` : '';

  const rows = players(t).map(p => {
    let pl = 0, pd = 0, g = 0, a = 0, sh = 0;
    const roles = {};
    for (const m of ms) {
      pl += playedSec(m, p.id); pd += plannedSec(m, p.id);
      g += goalList(m).filter(x => x.pid === p.id).length;
      a += goalList(m).filter(x => x.assist === p.id).length;
      sh += shotList(m).filter(x => x.pid === p.id).length;
      for (const [k, v] of Object.entries(byRole(m, p.id))) roles[k] = (roles[k] || 0) + v;
    }
    const rs = Object.entries(roles).filter(([, v]) => v >= 60).sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${mins(v)} at ${k}`).join(' · ');
    return { p, pl, pd, diff: pl - pd, g, a, sh, rs };
  }).sort((x, y) => x.diff - y.diff);

  const playersCard = rows.length ? `<div class="card"><div class="spread" style="margin-bottom:10px">
      <h2>Players</h2><span class="muted">furthest behind first</span></div>
    <div class="plist">${rows.map(r => {
    const pct = r.pd > 0 ? clamp(r.pl / r.pd * 100, 0, 100) : 0;
    const owed = r.pd > 0 && r.diff < -60 ? 1 : 0, over = r.pd > 0 && r.diff > 60 ? 1 : 0;
    const bits = [r.g ? `${r.g} goal${r.g === 1 ? '' : 's'}` : '', r.a ? `${r.a} assist${r.a === 1 ? '' : 's'}` : '', r.sh ? `${r.sh} shot${r.sh === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    return `<div class="prow">
      <span class="pnum">${esc(r.p.number ?? '')}</span>
      <span><span class="pname">${esc(r.p.name)}</span>
        ${r.pd > 0 ? `<div class="bar"><i style="width:${pct}%" data-owed="${owed}" data-over="${over}"></i><u style="left:100%"></u></div>` : ''}
        <span class="psub">${r.pd > 0 ? `${mins(r.pd)} planned · ${r.diff < 0 ? mins(-r.diff) + ' owed' : mins(r.diff) + ' over'}` : 'no plan set'}${bits ? ' · ' + bits : ''}</span>
        ${r.rs ? `<span class="psub">${esc(r.rs)}</span>` : ''}</span>
      <span class="pmins">${mins(r.pl)}<small> min</small></span></div>`;
  }).join('')}</div></div>` : '<div class="empty"><strong>No players yet</strong>Add the squad first.</div>';

  return `<div class="stack">
    ${record}${shotsCard}${possCard}${evCard}${results}${playersCard}${attendanceCard(t)}
    ${restricted() ? '' : aiButton('team')}
  </div>`;
}

/* --- formation editor --- */
function viewFormation() {
  const t = team(); if (!t) return needTeam();
  const tg = shapeTarget();
  if (!tg) return `<div class="empty"><strong>Shape not found</strong><div style="margin-top:14px"><button class="btn" data-act="backsetup">Back</button></div></div>`;
  const f = tg.f;
  const isDefault = !tg.game && (t.defaults || {})[f.size] === f.id;
  /* A spot someone is standing in can still be moved or renamed; removing it
     only drops the label — the stint, and so her minutes, are untouched. */
  const inUse = tg.game ? (f.slots || []).filter(x => slotTaken(tg.m, x.id)).length : 0;
  const foot = tg.game
    ? `<div class="card"><p class="muted" style="margin:0 0 10px">This shape belongs to this game only. Changing it here never touches the team's saved shapes${inUse ? `, and nobody on the pitch is moved — the ${inUse} spot${inUse === 1 ? '' : 's'} in use just take the new name or place` : ''}.</p>
        <button class="btn quiet wide" data-act="saveshapeteam">Save a copy as a team shape</button></div>`
    : `<div class="card"><div class="spread"><span>Use for ${f.size}v${f.size} by default</span>
      <button class="chip" type="button" data-act="setdefault" data-id="${f.id}" aria-pressed="${isDefault}">${isDefault ? 'Default' : 'Make default'}</button></div>
      <p class="muted" style="margin:10px 0 0">Changing this shape only affects games you create from now on. Games already played keep the lineup they were played with.</p></div>
    <button class="btn danger wide" data-act="delformation" data-id="${f.id}">Delete this shape</button>`;
  const toks = (f.slots || []).map(s => `<div class="slotok" data-sid="${s.id}" style="left:${s.x}%;top:${s.y}%">
    <span class="lab">${esc(s.label)}</span><span class="rl">${esc(s.role)}</span></div>`).join('');
  return `<div class="stack">
    <div class="spread"><button class="btn quiet sm" data-act="backsetup">${tg.game ? 'Back to the game' : 'Back'}</button>
      <span class="muted">${(f.slots || []).length} of ${f.size} spots</span></div>
    ${tg.game ? `<p class="muted" style="margin:0">Shape for ${esc(tg.m.opponent ? 'vs ' + tg.m.opponent : 'this game')}</p>
    <div class="chips">${Object.keys(presetsFor(f.size)).map(k => `<button class="chip" type="button" data-act="gameshapepreset" data-k="${k}">Start from ${k}</button>`).join('')}</div>` : ''}
    <label class="field"><span>Name</span><input type="text" id="fName" value="${esc(f.name)}"></label>
    <div class="pitch" id="fpitch">
      <svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".5">
          <rect x="2" y="2" width="64" height="96"/><line x1="2" y1="50" x2="66" y2="50"/><circle cx="34" cy="50" r="9"/>
          <rect x="16" y="2" width="36" height="15"/><rect x="16" y="83" width="36" height="15"/>
          <rect x="26" y="2" width="16" height="6"/><rect x="26" y="92" width="16" height="6"/>
        </g></svg>${toks}
      <div class="pitchhint">Drag a spot to move it · tap to rename</div></div>
    <div class="row"><button class="btn quiet" data-act="addslot">Add a spot</button>
      <button class="btn" data-act="savefname">Save name</button></div>
    ${foot}
  </div>`;
}

function sheetSlot(sid) {
  const tg = shapeTarget(); if (!tg) return;
  const s = (tg.f.slots || []).find(x => x.id === sid); if (!s) return;
  openSheet(`<h3>${esc(s.label)}</h3>
    <label class="field"><span>Label on the pitch</span><input type="text" id="slLabel" value="${esc(s.label)}" placeholder="LB"></label>
    <p class="lbl">Kind of spot</p>
    <div class="chips" style="margin-bottom:14px">
      ${ROLES.map(r => `<button class="chip" type="button" data-act="pickone" data-grp="role" data-v="${r}" aria-pressed="${s.role === r}">${r}</button>`).join('')}
    </div>
    <button class="btn wide" data-act="saveslot" data-sid="${sid}">Save spot</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delslot" data-sid="${sid}">Remove this spot</button></div>`);
}

function sheetFormations() {
  const t = team();
  const list = Object.values(t.formations || {});
  openSheet(`<h3>Shapes for ${esc(t.name)}</h3>
    <p class="muted" style="margin-top:0">Each new game copies the default shape for its side size. Editing a shape here never changes a game that already exists.</p>
    ${list.map(f => `<button class="opt spread" type="button" data-act="editformation" data-id="${f.id}">
      <span>${esc(f.name)} <span class="muted">· ${f.size}v${f.size}</span></span>
      <span class="muted">${(t.defaults || {})[f.size] === f.id ? 'default' : 'edit'}</span></button>`).join('')}
    <p class="lbl" style="margin-top:14px">Start from a preset</p>
    ${[11, 9, 7, 5].map(size => `<div class="chips" style="margin-bottom:8px"><span class="muted" style="align-self:center;min-width:44px">${size}v${size}</span>
      ${Object.keys(presetsFor(size)).map(k => `<button class="chip" type="button" data-act="newformation" data-size="${size}" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}`);
}
/* --- my players: the same page whatever else you are here --- */
function viewMine() {
  const list = myPlayers();
  if (!list.length) return `<div class="empty"><strong>Nobody linked yet</strong>
    A coach links your account to your player, and she shows up here.</div>`;

  return `<div class="stack">
    <h2>My players</h2>
    ${list.map(({ t, p }) => {
    const ms = teamMatches(t.id);
    const played = ms.reduce((a, m) => a + playedSec(m, p.id), 0);
    const planned = ms.reduce((a, m) => a + plannedSec(m, p.id), 0);
    const last = ms.find(m => gameStatus(m) === 'done');
    const live = ms.find(m => gameStatus(m) === 'live');
    /* A parent's "next" is whatever she has to get her daughter to, and that
       is a practice four days out of five. */
    const next = calNext(calItems([t.id]).filter(x => !(x.kind === 'game' && x.status === 'live')));
    const roles = {};
    for (const m of ms) for (const [k, v] of Object.entries(byRole(m, p.id))) roles[k] = (roles[k] || 0) + v;
    const rs = Object.entries(roles).filter(([, v]) => v >= 60).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${mins(v)} at ${k}`).join(' · ');

    return `<div class="card">
      <div class="spread" style="align-items:flex-start">
        <div class="row">
          ${p.photo ? `<img class="crest" src="${esc(p.photo)}" alt="">` : `<span class="crest blank">${esc(p.number ?? '')}</span>`}
          <span><b style="font-size:18px">${esc(p.name)}</b>
            <span class="rowsub">${esc(p.number ? '#' + p.number + ' · ' : '')}${teamLabel(t)}</span></span>
        </div>
        <span class="pmins"><span data-live="smins" data-tid="${t.id}" data-pid="${p.id}">${mins(played)}</span><small> min</small>
          <span data-live="sdiff" data-tid="${t.id}" data-pid="${p.id}">${diffTag(played, planned)}</span></span>
      </div>
      ${rs ? `<p class="muted" style="margin:10px 0 0">${esc(rs)}</p>` : ''}
      ${(l => l ? `<p class="muted" style="margin:6px 0 0">${esc(l)}</p>` : '')(attendLine(attendance(t, p.id)))}
      <div class="plist" style="margin-top:10px">
        ${live ? `<button class="prow" data-act="gotoplayer" data-tid="${t.id}" data-id="${live.id}" style="grid-template-columns:1fr auto">
          <span><span class="pname">Playing now — ${esc(live.opponent || 'TBC')}</span>
            <span class="rowsub"><span data-live="pmins" data-mid="${live.id}" data-pid="${p.id}">${mins(playedSec(live, p.id))}</span> min so far</span></span>
          <span class="pmins">${score(live).us}<small>–${score(live).them}</small></span></button>` : ''}
        ${last && !live ? `<button class="prow" data-act="gotoplayer" data-tid="${t.id}" data-id="${last.id}" style="grid-template-columns:1fr auto">
          <span><span class="pname">Last game — ${esc(last.opponent || 'TBC')}</span>
            <span class="rowsub">${esc(shortDate(last.date))} · ${mins(playedSec(last, p.id))} min played</span></span>
          <span class="pmins">${score(last).us}<small>–${score(last).them}</small></span></button>` : ''}
        ${next ? `<button class="prow" data-act="calitem" data-k="${next.kind}" data-tid="${esc(t.id)}" data-id="${esc(next.id)}" style="grid-template-columns:1fr auto">
          <span><span class="pname">Next — ${esc(next.title)}</span>
            <span class="rowsub">${[relDay(next.date) || dayLabel(next.date), niceTime(next.start), next.venue,
      rsvpOpen(next) ? (r => r ? RSVP[r.v] : 'Not answered yet')(rsvpOf(t.id, rsvpKey(next), p.id)) : ''].filter(Boolean).map(esc).join(' · ')}</span></span>
          <span class="tag ${next.kind}">${CAL_KIND[next.kind]}</span></button>` : ''}
        ${(ns => ns ? `<button class="prow" data-act="sessopen" data-id="${esc(ns.id)}" style="grid-template-columns:1fr auto">
          <span><span class="pname">Next session — ${esc(sessTitle(ns))}</span>
            <span class="rowsub">${[relDay(ns.date) || dayLabel(ns.date), niceTime(ns.start), sessPlace(ns), 'with ' + ns.coachName, BOOK[bookOf(ns.id, p.id).st]].filter(Boolean).map(esc).join(' · ')}</span></span>
          <span class="tag session">Training</span></button>` : '')(sessAll().find(s => !sessPast(s) && !s.called && (b => b && b.st !== 'out' && b.st !== 'no')(bookOf(s.id, p.id))))}
      </div></div>`;
  }).join('')}
    <p class="muted">Minutes are across every game this season. Tap a game for the full picture.</p>
  </div>`;
}

/* --- team: planning and settings, for whoever can change this team --- */
function viewTeamSet() {
  const t = team(); if (!t) return needTeam();
  const ro = !canEditTeam(t.id);
  const fs = Object.values(t.formations || {});
  return `<div class="stack">
    <div class="card"><div class="row" style="margin-bottom:10px">
      ${teamCrest(t)}
      <span style="flex:1"><b style="font-size:18px">${teamLabel(t)}</b>
        <span class="rowsub">${teamStats(t)}</span>
        <span class="rowsub">${teamUAge(t) != null ? `${uLabel(teamUAge(t))} this season · born ${esc(String(t.birthYear))}` : 'No age group set'}</span>
        <span class="rowsub">${t.logo ? 'Own crest' : 'Using the club badge'}</span></span></div>
      ${ro ? '<p class="muted" style="margin-bottom:0">You can read this team but not change it.</p>'
      : `<button class="btn quiet wide" data-act="editteam" data-id="${t.id}">Team name and crest</button>`}</div>

    <div class="card"><h2 style="margin-bottom:8px">Shapes</h2>
      <p class="muted" style="margin-top:0">Default lineups per side size. A new game copies the default; games already played keep what they were played with.</p>
      <div class="plist">${fs.map(f => `<button class="prow" type="button" data-act="editformation" data-id="${f.id}" style="grid-template-columns:1fr auto">
        <span><span class="pname">${esc(f.name)}</span><span class="psub">${f.size}v${f.size}${(t.defaults || {})[f.size] === f.id ? ' · default' : ''}</span></span>
        <span class="muted">Edit</span></button>`).join('') || '<p class="muted" style="margin:0">None saved — presets are used instead.</p>'}</div>
      ${ro ? '' : `<div style="margin-top:10px"><button class="btn quiet wide" data-act="formations">Manage shapes</button></div>`}</div>

    <div class="card"><h2 style="margin-bottom:8px">What to count</h2>
      <p class="muted" style="margin-top:0">Which counters appear on the Track tab during a game.</p>
      <div class="chips">${tracked(t).map(e => `<span class="chip" aria-pressed="true">${e.label}</span>`).join('') || '<span class="muted">Nothing switched on.</span>'}</div>
      ${ro ? '' : `<div style="margin-top:10px"><button class="btn quiet wide" data-act="trackcfg">Choose what to count</button></div>`}</div>

    <div class="card"><h2 style="margin-bottom:8px">Parent links</h2>
      <p class="muted" style="margin-top:0">Read-only pages showing shirt numbers, never names.</p>
      <button class="btn quiet wide" data-act="sharesheet">${t.share ? (ro ? 'See the links' : 'Manage links') : ro ? 'Sharing' : 'Set up sharing'}</button></div>
  </div>`;
}

/* ---------------- practice ---------------- */
/* The drill library and the position guide: TRAINING.md's first build step.
   Both are content, shipped as their own scripts (drills.js and
   drill-diagram.js) and loaded before this module, so they are on window by
   the time it runs. No database read, nothing to sync, and all of it there at a
   field with no signal. Nothing in this section writes anything except the
   team's birth year, which is an ordinary team field.

   Coaches and admins only. The built-in drills aren't a secret, since they
   ship in the app's public files, but the Practice tab is where a club's own
   drills and plans will live, and TRAINING.md settles that parents and
   trackers never see those. Before a club has an admin nothing is gated, the
   same as every other screen. */
const drillLib = () => (typeof window !== 'undefined' && window.SOCCER_DRILLS && window.SOCCER_DRILLS.DRILLS) ? window.SOCCER_DRILLS : null;
const drillDiagram = () => (typeof window !== 'undefined' && window.DrillDiagram && window.DrillDiagram.svg) ? window.DrillDiagram : null;
const canTrain = () => !gated() || isOwner() || (!!me && teams().some(t => isCoach(t.id, me.uid)));
/* The plan's own actions also need the team: a coach browsing another age
   group can read its drills but never touch its plans. */
const PLAN_ACTS = new Set(['pracnew', 'pracfromcal', 'pracopen', 'pracback', 'pracpast', 'pracedit', 'pracsave', 'pracpick', 'pracpickdone', 'pracadd',
  'pracsuggest', 'pracmin', 'pracmove', 'pracdel', 'pracnote', 'pracnotesave', 'pracreview', 'pracrate', 'pracreviewsave', 'pracagain',
  'pracrm', 'pracrun', 'rungo', 'runpause', 'runreset', 'runnext', 'runprev', 'runstop', 'runpic']);
/* The club's drills and her own: reaching any of these needs Practice, and
   each one checks the shelf it touches as well. */
const LIB_ACTS = new Set(['shelf', 'drillmine', 'drilledit', 'drillnew', 'drillshare', 'drilldel', 'drillorig', 'dedchip', 'dedpic',
  'dedai', 'dedaiback', 'dedaicopy', 'dedaiopen', 'dedaiuse', 'dedaifix',
  'dedlinkadd', 'dedlinkdel', 'dedsave', 'clubdrills', 'mydrills']);
const PRACTICE_ACTS = new Set(['practab', 'drill', 'drillpic', 'roleguide', 'rolepic', 'drillfilters', 'dfchip', 'dfpick', 'dfclear', 'drillmore', ...PLAN_ACTS, ...LIB_ACTS]);

/* A team's age is stored as the year its players were born, because that
   rolls over by itself: the same team is U10 this season and U11 the next
   without anybody editing it. It's shown as a U-age, the way coaches say it. A
   season runs August to July and takes the year it ends in, which is how
   birth-year age groups work in US youth soccer: born 2016 is U11 in 2026–27. */
function seasonEndYear(now = nowMs()) {
  const d = new Date(now);
  return d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear();
}
function uAge(birthYear, now = nowMs()) {
  const y = Number(birthYear);
  if (!Number.isInteger(y)) return null;
  const u = seasonEndYear(now) - y;
  return u >= 4 && u <= 80 ? u : null;
}
const teamUAge = t => (t && t.birthYear ? uAge(t.birthYear) : null);
const uLabel = u => (u == null ? '' : u <= 19 ? 'U' + u : 'Adult');

/* What the coach has narrowed the library to, kept per device with the rest of
   the screen state. Rebuilt from the blank on every read, so a filter saved by
   an older build that this one no longer knows can't break the list. */
const PRACTICE_BLANK = () => ({
  q: '', age: 'team', sort: 'session', sig: '', len: '', setup: '', players: '', comp: '', by: '',
  skill: '', principle: '', moment: '', physical: '',
  types: [], pos: [], levels: [], intens: [], inv: [], groups: [], flags: [], noKit: []
});
function practiceUi() {
  if (!ui.practice || typeof ui.practice !== 'object') ui.practice = {};
  const p = ui.practice;
  if (!['plans', 'drills', 'positions'].includes(p.tab)) p.tab = 'plans';
  if (p.run && (typeof p.run !== 'object' || !p.run.pid)) p.run = null;
  if (!(p.show > 0)) p.show = 24;
  if (!ownKey(SHELVES, p.shelf) && p.shelf !== 'all') p.shelf = 'all';
  const blank = PRACTICE_BLANK(), f = p.f && typeof p.f === 'object' ? p.f : {};
  for (const [k, v] of Object.entries(blank)) {
    if (Array.isArray(v)) f[k] = Array.isArray(f[k]) ? f[k].map(String) : [];
    else f[k] = typeof f[k] === 'string' ? f[k] : v;
  }
  p.f = f;
  return p;
}
const PRACTICE_FLAGS = { noKeeper: 'No keeper needed', oneAdult: 'One adult can run it', indoor: 'Works indoors' };
const PRACTICE_NOKIT = { minigoals: 'No mini goals', goals: 'No big goals', bibs: 'No bibs', cones: 'No cones', poles: 'No poles' };
const PRACTICE_SORTS = {
  session: ['Session order', null],
  short: ['Shortest', (a, b) => a.minutes[0] - b.minutes[0] || a.minutes[1] - b.minutes[1]],
  setup: ['Quickest to set up', (a, b) => a.setupMins - b.setupMins],
  busy: ['Busiest', (a, b) => b.involvement - a.involvement || b.intensity - a.intensity],
  easy: ['Easiest', (a, b) => a.level - b.level || a.intensity - b.intensity],
  hard: ['Hardest', (a, b) => b.level - a.level || b.intensity - a.intensity],
  name: ['A to Z', (a, b) => a.name.localeCompare(b.name)]
};

/* The age the list is filtered to: the team's own unless the coach picked
   another, and no age at all if the team hasn't got one and she hasn't chosen. */
function practiceAge(f, t = team()) {
  if (f.age === 'any') return null;
  if (f.age === 'team' || !f.age) { const u = teamUAge(t); return u == null ? null : Math.min(u, 19); }
  const n = Number(f.age);
  return n >= 4 && n <= 19 ? n : null;
}
const drillWords = new Map();
// keyed by shelf and version too: a coach's own drill changes, and can share an id with nothing else
const drillCacheKey = d => (d.key || d.id) + '@' + (d.v || 0) + '@' + (d.at || 0);
function drillText(d, L) {
  const k = drillCacheKey(d);
  if (!drillWords.has(k)) drillWords.set(k, [d.name, d.summary, d.setup, d.why, ...d.how, ...d.points, ...d.skills.map(s => L.SKILLS[s] || s), ...d.tags].join(' ').toLowerCase());
  return drillWords.get(k);
}
function drillMatches(d, f, age, L) {
  const q = String(f.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return (age == null || (d.ages[0] <= age && age <= d.ages[1]))
    && (!f.sig || d.signals.includes(f.sig))
    && (!f.types.length || f.types.includes(d.type))
    && (!f.pos.length || f.pos.some(p => d.positions.includes(p)))
    && (!f.len || d.minutes[0] <= Number(f.len))
    && (!f.setup || d.setupMins <= Number(f.setup))
    && (!f.players || d.players.min <= Number(f.players))
    && (!f.comp || d.competitive === (f.comp === 'yes'))
    && (!f.levels.length || f.levels.includes(String(d.level)))
    && (!f.intens.length || f.intens.includes(String(d.intensity)))
    && (!f.inv.length || f.inv.includes(String(d.involvement)))
    && (!f.groups.length || f.groups.some(g => d.groups.includes(g)))
    && (!f.flags.includes('noKeeper') || d.gk === 0)
    && (!f.flags.includes('oneAdult') || d.adults === 1)
    && (!f.flags.includes('indoor') || d.indoor)
    && f.noKit.every(k => !d.kit[k])
    && (!f.skill || d.skills.includes(f.skill))
    && (!f.principle || d.principles.includes(f.principle))
    && (!f.moment || d.moments.includes(f.moment))
    && (!f.physical || d.physical.includes(f.physical))
    && madeBy(d, f.by)
    && (!q.length || q.every(w => drillText(d, L).includes(w)));
}
/* Who made a drill: the app itself for the built-in library (it ships as
   Minutes), you for your own and what you shared, or the coach a club drill
   names. A club drill keeps its author's name after she leaves, because it
   was copied onto the drill when she shared it, not looked up. */
const APP_NAME = 'Minutes';
function madeBy(d, by) {
  if (!by) return true;
  const shelf = d.shelf || 'builtin';
  if (by === 'app') return shelf === 'builtin';
  if (by === 'me') return shelf === 'mine' || (shelf === 'club' && !!me && d.by === me.uid);
  return by.startsWith('u:') && shelf === 'club' && d.by === by.slice(2);
}
/* A club drill's author is still credited after she goes; this only says so. */
const stillCoaching = u => !!u && (isAdmin(u) || !!coachTeamOf(u));
function drillMakers() {
  const seen = new Map();
  for (const d of shelfItems('club')) if (d.by && (!me || d.by !== me.uid) && !seen.has(d.by))
    seen.set(d.by, (d.byName || 'A coach') + (stillCoaching(d.by) ? '' : ' (left)'));
  return [['app', APP_NAME + ' (built-in)'], ...(me ? [['me', 'You']] : []), ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([u, n]) => ['u:' + u, n])];
}
function practiceDrills(f = practiceUi().f, t = team()) {
  const L = drillLib(); if (!L) return [];
  const age = practiceAge(f, t);
  const order = Object.keys(L.TYPES);
  const by = (PRACTICE_SORTS[f.sort] || PRACTICE_SORTS.session)[1] || ((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.level - b.level);
  return drillPool(L).filter(d => drillMatches(d, f, age, L)).sort(by);
}
/* The drills on the shelves the coach has picked: every filter then works the
   same across all three. */
function drillPool(L, shelf = practiceUi().shelf) {
  const out = [];
  if (shelf === 'all' || shelf === 'builtin') out.push(...L.DRILLS);
  for (const s of ['club', 'mine']) if (shelf === 'all' || shelf === s) out.push(...shelfItems(s));
  return out;
}
/* Everything but the search box, the age and the sort, which sit on the screen
   itself rather than behind the Filters button. */
function practiceActive(f) {
  let n = 0;
  for (const k of ['sig', 'len', 'setup', 'players', 'comp', 'by', 'skill', 'principle', 'moment', 'physical']) if (f[k]) n++;
  for (const k of ['types', 'pos', 'levels', 'intens', 'inv', 'groups', 'flags', 'noKit']) n += f[k].length;
  return n;
}

const drillAges = d => `U${d.ages[0]}–${d.ages[1] >= 19 ? 'adult' : 'U' + d.ages[1]}`;
const drillPlayers = d => (d.players.min === d.players.max ? d.players.min : d.players.min + '–' + d.players.max);
/* Thumbnails are the same every time, and render() runs on every sync. */
const drillThumbs = new Map();
function drillThumb(id, dg, title) {
  if (!drillThumbs.has(id)) drillThumbs.set(id, drillDiagram().svg(dg, { title }));
  return drillThumbs.get(id);
}
const reducedMotion = () => {
  try { return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
};

function viewPractice() {
  const L = drillLib(), D = drillDiagram();
  if (!L || !D) return `<div class="empty"><strong>The drill library didn't load</strong>It comes with the app as a file of its own, and this page opened without it. Reload when you have a signal.</div>`;
  const p = practiceUi();
  if (p.run) { const r = runView(L); if (r) return r; }
  const tabs = `<div class="chips">${[['plans', 'Plans'], ['drills', `Drills · ${drillPool(L, 'all').length}`], ['positions', 'Positions']].map(([k, l]) =>
    `<button class="chip" type="button" data-act="practab" data-k="${k}" aria-pressed="${p.tab === k}">${l}</button>`).join('')}</div>`;
  const body = p.tab === 'positions' ? practicePositions(L) : p.tab === 'drills' ? pickBanner(L) + practiceDrillsView(L) : practicePlansView(L);
  return `<div class="stack">${tabs}${body}</div>`;
}

function practiceDrillsView(L) {
  const p = practiceUi(), f = p.f, t = team();
  const u = teamUAge(t);
  const ages = [['team', u == null ? 'No team age' : `${uLabel(u)} (team)`], ['any', 'Any age'],
    ...Array.from({ length: 16 }, (_, i) => i + 4).map(n => [String(n), n === 19 ? 'U19 and adult' : 'U' + n])];
  const opt = (cur, [v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`;
  const n = practiceActive(f);
  const s = f.sig && L.SIGNALS[f.sig];
  watchShelf('club'); watchShelf('mine');
  const shelves = `<div class="chips">${[['all', 'All'], ...Object.entries(SHELVES)].map(([k, l]) =>
    `<button class="chip" type="button" data-act="shelf" data-k="${k}" aria-pressed="${p.shelf === k}">${l}</button>`).join('')}
    ${me ? '<button class="chip" type="button" data-act="drillnew">+ Write a drill</button>' : ''}</div>`;
  return `${shelves}${shelfNote(p.shelf)}<div class="card drillbar">
      <input type="search" id="drillQ" value="${esc(f.q)}" placeholder="Search drills, skills, coaching points" aria-label="Search drills">
      <div class="drilltools">
        <select data-pick="dfpick" data-k="age" aria-label="Age">${ages.map(x => opt(f.age, x)).join('')}</select>
        <select data-pick="dfpick" data-k="sort" aria-label="Sort">${Object.entries(PRACTICE_SORTS).map(([k, [l]]) => opt(f.sort, [k, l])).join('')}</select>
        <button class="btn ${n ? '' : 'quiet '}sm" data-act="drillfilters">${n ? 'Filters · ' + n : 'Filters'}</button>
      </div>
      ${u == null && f.age === 'team' && canEditTeam(ui.teamId) ? `<p class="muted" style="margin:8px 0 0">Give the team a birth year (Team → Team name and crest) and the list starts at the right age.</p>` : ''}
      ${s ? `<div class="drillsignal"><b>${esc(s.label)}</b><span>${esc(s.means)}</span></div>` : ''}
    </div>
    <div id="drillList">${drillListHtml()}</div>`;
}

function drillListHtml() {
  const L = drillLib(); if (!L) return '';
  const p = practiceUi(), list = practiceDrills(p.f), all = drillPool(L).length;
  const shown = list.slice(0, p.show);
  const busy = practiceActive(p.f) || p.f.q;
  const none = !all && p.shelf === 'club' ? `<div class="empty"><strong>The club has no drills of its own yet</strong>Any coach can share one: open it under Mine and tap Share with the club. Admins tidy what's here.</div>`
    : !all && p.shelf === 'mine' ? `<div class="empty"><strong>Your own drills</strong>${me ? 'Private to you, in whichever club you coach. Save a copy of any drill and make it yours, or write one from scratch.' : 'Sign in, and the drills you write go with your account.'}</div>`
    : `<div class="empty"><strong>No drill matches all of that</strong>Try taking a filter off.</div>`;
  return `<p class="muted drillcount">${list.length === all ? `All ${list.length} drill${list.length === 1 ? '' : 's'}` : `${list.length} of ${all} drills`}${busy ? ` · <button class="drilllink" data-act="dfclear">clear filters</button>` : ''}</p>
    ${shown.length ? `<div class="drilllist">${shown.map(drillRow).join('')}</div>` : none}
    ${list.length > shown.length ? `<button class="btn quiet wide" data-act="drillmore">Show ${Math.min(24, list.length - shown.length)} more</button>` : ''}`;
}

function drillRow(d) {
  const L = drillLib();
  const tag = d.shelf && d.shelf !== 'builtin' ? ` <span class="tag${d.shelf === 'mine' ? ' wait' : ''}">${SHELVES[d.shelf]}</span>` : '';
  return `<button class="drillrow" type="button" data-act="drill" data-id="${esc(d.key || d.id)}">
    <span class="drillmain"><span class="drillname">${esc(d.name)}${tag}</span>
      <span class="drilltype">${esc(L.TYPES[d.type] || d.type)}</span>
      <span class="drillsum">${esc(d.summary)}</span>
      <span class="drillfacts"><b>${drillAges(d)}</b> · ${d.minutes[0]}–${d.minutes[1]} min · ${drillPlayers(d)} players${d.gk ? ' · ' + d.gk + ' GK' : ''} · ${esc(L.LEVELS[d.level])}${d.shelf === 'club' && d.byName ? ' · shared by ' + esc(d.byName) : ''}</span></span>
    <span class="drillthumb${d.diagram ? '' : ' nopic'}" aria-hidden="true">${d.diagram ? drillThumb(d.pic || drillCacheKey(d), d.diagram, d.name) : (d.media && d.media.length ? '▶' : '')}</span></button>`;
}

const DIAGRAM_KEY = [['A', 'Team'], ['D', 'Opponents'], ['N', 'Neutral'], ['B', 'Fourth team'], ['K', 'Keeper'], ['C', 'Coach or server']];
/* The picture, its key, its Moving / Still switch and its steps, for a drill
   or a position alike. Moving unless the phone has asked for less motion. */
function diagramBlock(dg, title, act, id, moving) {
  const D = drillDiagram();
  const steps = D.parse(dg).steps;
  const anim = steps.length > 0 && moving;
  const used = new Set(Object.keys(dg.players || {}).map(x => x[0]));
  return `<div class="drillpic">${D.svg(dg, { animate: anim, title })}</div>
    <div class="spread drillpicbar"><span class="drillkey">${DIAGRAM_KEY.filter(([k]) => used.has(k)).map(([k, l]) => `<span><i style="background:${D.COLOURS[k]}"></i>${l}</span>`).join('')}</span>
      ${steps.length ? `<span class="chips">${[['move', 'Moving'], ['still', 'Still']].map(([k, l]) =>
        `<button class="chip" type="button" data-act="${act}" data-id="${esc(id)}" data-k="${k}" aria-pressed="${(k === 'move') === anim}">${l}</button>`).join('')}</span>` : '<span class="muted">Layout</span>'}</div>
    ${steps.some(s => s.caption) ? `<ol class="drillsteps">${steps.map(s => `<li>${esc(s.caption || '')}</li>`).join('')}</ol>` : ''}`;
}

function sheetDrill(id, moving = !reducedMotion(), top = false) {
  const L = drillLib(); if (!L || !drillDiagram()) return;
  const d = findDrill(id); if (!d) return;
  const key = String(id), shelf = d.shelf || 'builtin', inPlan = key.startsWith('plan:');
  const byId = x => L.DRILLS.find(y => y.id === x);
  const list = a => `<ul class="drillul">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const kit = kitWords(L, d.kit, 0) || 'nothing';
  const tgt = inPlan ? null : pickTarget();
  const trains = [...d.skills.map(s => L.SKILLS[s]), ...d.principles.map(x => L.PRINCIPLES[x]), ...d.physical.map(x => L.PHYSICAL[x]), ...d.moments.map(x => L.MOMENTS[x])];
  const orig = shelf !== 'builtin' && !inPlan ? drillOrigin(d) : null;
  /* What she can do with it depends on whose it is. Editing anything that
     isn't hers, or isn't the club's for her to tidy, is saving her own copy. */
  const acts = [];
  if (!inPlan && me) {
    if (shelf === 'mine') {
      acts.push(['drilledit', 'Edit']);
      if (wsCode() && shareTeam()) acts.push(['drillshare', 'Share with the club']);
      acts.push(['drilldel', 'Delete']);
    } else {
      acts.push(['drillmine', 'Save to mine']);
      acts.push(['drilledit', canCurate(d) ? 'Edit the club\'s copy' : 'Edit your own copy']);
      if (canCurate(d)) acts.push(['drilldel', 'Remove from the club']);
    }
  }
  const whose = shelf === 'club' ? `Shared with the club by ${esc(d.byName || 'a coach')}${d.by && !stillCoaching(d.by) ? ', who no longer coaches here' : ''}.${d.edName && d.edBy !== d.by ? ` Last tidied by ${esc(d.edName)}.` : ''}`
    : shelf === 'mine' ? 'Yours. Nobody else sees it unless you share it.' : inPlan ? '' : `From the ${APP_NAME} library.`;
  const media = (d.media || []).map(m => /\.(gif|png|jpe?g|webp)(\?|$)/i.test(m.url)
    ? `<figure class="drillmedia"><img src="${esc(m.url)}" alt="${esc(m.title || d.name)}" loading="lazy" referrerpolicy="no-referrer">${m.title ? `<figcaption>${esc(m.title)}</figcaption>` : ''}</figure>`
    : `<a class="card drilllinkcard" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(m.title || 'Watch it')}</b><span class="muted">${esc(m.url.replace(/^https:\/\//, '').slice(0, 60))}</span></a>`).join('');
  openSheet(`<h3>${esc(d.name)}</h3>
    <p class="muted" style="margin:-6px 0 10px">${esc(L.TYPES[d.type])} · ${drillAges(d)} · ${d.minutes[0]}–${d.minutes[1]} min · ${esc(L.LEVELS[d.level])} · ${esc(L.INTENSITY[d.intensity])}</p>
    ${whose ? `<p class="muted" style="margin:-4px 0 10px">${whose}${orig ? ` Your version of <button class="drilllink" data-act="drillorig" data-id="${esc(key)}">${esc(orig.d.name)}</button>.` : ''}</p>` : ''}
    ${inPlan ? '<p class="muted" style="margin:-4px 0 10px">The copy this plan keeps, so it reads the same whatever happens to the original.</p>' : ''}
    ${orig && orig.changed ? `<div class="rolebar">The original has changed since you copied it. <button class="drilllink" data-act="drillorig" data-id="${esc(key)}">See what it says now</button>; yours stays as it is.</div>` : ''}
    ${tgt ? `<button class="btn wide" data-act="pracadd" data-id="${esc(tgt.id)}" data-v="${esc(key)}" style="margin-bottom:10px">Add to ${esc(pracDay(tgt.date))}</button>` : ''}
    ${d.diagram ? diagramBlock(d.diagram, d.name, 'drillpic', key, moving) : ''}
    ${media}
    ${!d.diagram && media ? '<p class="muted">A link needs a signal to play, and can stop working if whoever posted it takes it down.</p>' : ''}
    ${!d.diagram && !media ? '<p class="muted">No picture. Drawing one in the app is still to come; a link to a clip works now.</p>' : ''}
    <p>${esc(d.summary)}</p>
    <div class="drillmeta">
      <span>Players <b>${drillPlayers(d)}${d.gk ? ' · ' + d.gk + ' GK' : ''}</b></span>
      <span>Setup <b>${d.setupMins ? d.setupMins + ' min' : 'none'}</b></span>
      <span><b>${d.adults === 1 ? 'One adult' : 'Two adults'}</b></span>
      <span><b>${d.indoor ? 'Indoors or out' : 'Outdoors'}</b></span>
      ${d.groups.length ? `<span><b>${esc(d.groups.map(g => L.GROUPS[g]).join(', '))}</b></span>` : ''}
      <span><b>${esc(L.INVOLVEMENT[d.involvement])}</b></span>
      ${d.competitive ? '<span><b>Competitive</b></span>' : ''}
      ${d.space || d.spaceNote ? `<span>Space <b>${d.space ? d.space[0] + ' × ' + d.space[1] + ' yd' : esc(d.spaceNote || '')}</b></span>` : ''}
      <span>Bring <b>${esc(kit)}</b></span>
      ${d.positions.length ? `<span>For <b>${esc(d.positions.join(', '))}</b></span>` : ''}
    </div>
    ${acts.length ? `<div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0">${acts.map(([a, l]) =>
      `<button class="btn quiet sm${a === 'drilldel' ? ' danger' : ''}" data-act="${a}" data-id="${esc(key)}">${l}</button>`).join('')}</div>` : ''}
    ${d.setup ? `<h4>Setup</h4><p>${esc(d.setup)}</p>` : ''}
    ${d.how.length ? `<h4>How it runs</h4><ol class="drillul">${d.how.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    ${d.points.length ? `<h4>Coaching points</h4>${list(d.points)}` : ''}
    ${d.questions.length ? `<h4>Ask them</h4>${list(d.questions)}` : ''}
    ${d.mistakes.length ? `<h4>Watch for</h4>${list(d.mistakes)}` : ''}
    ${d.why ? `<div class="drillwhy"><h4>Why it helps on Saturday</h4><p>${esc(d.why)}</p></div>` : ''}
    ${d.easier.length ? `<h4>Make it easier</h4>${list(d.easier)}` : ''}
    ${d.harder.length ? `<h4>Make it harder</h4>${list(d.harder)}` : ''}
    ${d.safety ? `<div class="drillsafety"><h4>Safety</h4><p>${esc(d.safety)}</p></div>` : ''}
    ${trains.length ? `<h4>Trains</h4><div class="chips">${trains.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : ''}
    ${d.signals.length ? `<h4>Answers</h4><div class="chips">${d.signals.map(s => `<span class="tag wait">${esc(L.SIGNALS[s].label)}</span>`).join('')}</div>` : ''}
    ${d.goesWith.length ? `<h4>Goes well with</h4><div class="chips">${d.goesWith.map(byId).filter(Boolean).map(x =>
      `<button class="chip" type="button" data-act="drill" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:14px">Done</button>`, top);
}

/* The position guide: what each job is, with the ball and without it. The
   spots on the team's own default shapes are named alongside, so "full-back"
   reads as "your LB and RB". */
function practicePositions(L) {
  const t = team();
  const own = new Set(Object.values((t && t.formations) || {}).flatMap(f => (f.slots || []).map(s => s.label)));
  return `<p class="muted" style="margin:0">What each position is for: when we have the ball, when they have it, and the second either way. Each links the drills that teach it.</p>
    <div class="drilllist">${L.ROLE_GUIDE.map(r => {
      const mine = r.slots.filter(s => own.has(s));
      return `<button class="drillrow" type="button" data-act="roleguide" data-id="${esc(r.id)}">
        <span class="drillmain"><span class="drillname">${esc(r.name)} <span class="tag">${esc(r.number)}</span></span>
          <span class="drillsum">${esc(r.oneLine)}</span>
          <span class="drillfacts">${mine.length ? `In your shapes: <b>${esc(mine.join(', '))}</b>` : `Plays <b>${esc(r.slots.join(', '))}</b>`}</span></span>
        <span class="drillthumb" aria-hidden="true">${drillThumb('role:' + r.id, r.diagram, r.name)}</span></button>`;
    }).join('')}</div>`;
}

function sheetRole(id, moving = !reducedMotion(), top = false) {
  const L = drillLib(); if (!L || !drillDiagram()) return;
  const r = (L.ROLE_GUIDE || []).find(x => x.id === id); if (!r) return;
  const list = a => `<ul class="drillul">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  openSheet(`<h3>${esc(r.name)} <span class="tag">${esc(r.number)}</span></h3>
    <p class="muted" style="margin:-6px 0 10px">${esc(r.aka.join(' · '))} · plays ${esc(r.slots.join(', '))}</p>
    <p>${esc(r.oneLine)}</p>
    ${diagramBlock(r.diagram, r.name, 'rolepic', r.id, moving)}
    <h4>When we have the ball</h4>${list(r.withBall)}
    <h4>When they have it</h4>${list(r.withoutBall)}
    <div class="drillwhy"><h4>The second we win it</h4><p>${esc(r.whenWeWin)}</p></div>
    <div class="drillwhy"><h4>The second we lose it</h4><p>${esc(r.whenWeLose)}</p></div>
    <h4>Key skills</h4><div class="chips">${r.keySkills.map(k => `<span class="tag">${esc(L.SKILLS[k] || k)}</span>`).join('')}</div>
    <h4>Drills that teach it</h4><div class="chips">${r.drills.map(x => L.DRILLS.find(d => d.id === x)).filter(Boolean).map(d =>
      `<button class="chip" type="button" data-act="drill" data-id="${esc(d.id)}">${esc(d.name)}</button>`).join('')}</div>
    <div class="drillsafety"><h4>Under-tens</h4><p>${esc(r.young)}</p></div>
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:14px">Done</button>`, top);
}

/* Every filter on the card, behind one button so the list keeps the screen.
   Each tap redraws the list underneath and this sheet in place, with the count
   on the button that closes it, so a coach can see a filter bite as she sets it. */
function sheetDrillFilters() {
  const L = drillLib(); if (!L) return;
  const f = practiceUi().f;
  const chips = (key, vocab) => `<div class="chips">${Object.entries(vocab).map(([k, l]) =>
    `<button class="chip" type="button" data-act="dfchip" data-k="${key}" data-v="${esc(k)}" data-in="sheet" aria-pressed="${f[key].includes(String(k))}">${esc(l)}</button>`).join('')}</div>`;
  const sel = (key, first, entries) => `<select data-pick="dfpick" data-k="${key}" data-in="sheet"><option value=""${f[key] ? '' : ' selected'}>${esc(first)}</option>${entries.map(([v, l]) =>
    `<option value="${esc(v)}"${f[key] === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const lab = (l, body) => `<label class="field"><span>${l}</span>${body}</label>`;
  const n = practiceDrills(f).length;
  openSheet(`<h3>Filters</h3>
    ${lab('What needs work', sel('sig', 'Anything', Object.entries(L.SIGNALS).map(([k, s]) => [k, s.label])))}
    <p class="lbl">Type</p>${chips('types', L.TYPES)}
    <p class="lbl">Position</p>${chips('pos', Object.fromEntries(L.POSITIONS.map(x => [x, x])))}
    <div class="grid2">
      ${lab('Fits in', sel('len', 'Any length', [5, 10, 15, 20].map(m => [m, m + ' minutes'])))}
      ${lab('Setup', sel('setup', 'Any setup', [[1, 'A minute or less'], [3, 'Under 3 minutes'], [5, 'Under 5 minutes']]))}
      ${lab('Players coming', sel('players', 'Any number', Array.from({ length: 23 }, (_, i) => [i + 2, String(i + 2)])))}
      ${lab('Competitive', sel('comp', 'Either', [['yes', 'Has a score or winner'], ['no', 'No scoring']]))}
    </div>
    ${lab('Made by', sel('by', 'Anyone', drillMakers()))}
    <p class="lbl">Difficulty</p>${chips('levels', L.LEVELS)}
    <p class="lbl">Intensity</p>${chips('intens', L.INTENSITY)}
    <p class="lbl">How busy</p>${chips('inv', L.INVOLVEMENT)}
    <p class="lbl">Grouped as</p>${chips('groups', L.GROUPS)}
    <p class="lbl">Practical</p>${chips('flags', PRACTICE_FLAGS)}
    <p class="lbl">Kit you don't have</p>${chips('noKit', PRACTICE_NOKIT)}
    <div class="grid2">
      ${lab('Skill', sel('skill', 'Any skill', Object.entries(L.SKILLS)))}
      ${lab('Principle of play', sel('principle', 'Any principle', Object.entries(L.PRINCIPLES)))}
      ${lab('Moment of the game', sel('moment', 'Any moment', Object.entries(L.MOMENTS)))}
      ${lab('Physical', sel('physical', 'Any', Object.entries(L.PHYSICAL)))}
    </div>
    <div class="row" style="gap:8px;margin-top:6px">
      <button class="btn quiet" style="flex:1" data-act="dfclear" data-in="sheet">Clear</button>
      <button class="btn" style="flex:2" data-act="closesheet">Show ${n} drill${n === 1 ? '' : 's'}</button></div>`);
}

/* The search box redraws the list only: redrawing the whole screen would take
   the box, and the keyboard, away from her after every letter. */
function refreshDrillList() {
  const el = $('#drillList');
  if (el) el.innerHTML = drillListHtml();
}

/* ---------------- practice plans ---------------- */
/* A practice is a dated plan for one team: the drills in order, how long each
   runs, and afterwards whether it worked. TRAINING.md has the design.

   It lives at training/{code}/practices/{tid}/{pid}, outside the workspace,
   for reasons TRAINING.md gives at length. The one that shaped this code is
   that the workspace's connect-time read used to replace local state
   wholesale (since closed by the workspace outbox), and a plan made offline
   must not be wiped that way. So practices have their own local copy, one listener per team,
   and merge on every read from the start. A plan this phone changed and the
   club hasn't acknowledged is `dirty`, and a dirty plan is never overwritten
   by what the club says. It's sent again instead.

   When and where also goes to schedule/{tid}/{pid}, which the whole club
   reads. That's how a parent gets the time and place without the plan. */
const LS_TRAIN = 'sm.train.v1';
const trainKey = () => LS_TRAIN + ':' + clubKey();
const TRAIN_BLANK = () => ({ practices: {}, schedule: {}, dirty: {}, drills: {}, drillDirty: {} });
let train = TRAIN_BLANK();
const trainState = {};            // tid -> 'synced' | 'refused', as the database last answered
let trainWatch = new Map();       // 'practices/t1' -> unsubscribe
const trainTries = {};

function loadTrain() {
  train = TRAIN_BLANK();
  try {
    const t = JSON.parse(localStorage.getItem(trainKey()) || 'null');
    if (t && typeof t === 'object') for (const k of Object.keys(train)) if (t[k] && typeof t[k] === 'object') train[k] = t[k];
  } catch (e) { }
}
function saveTrain() { keepStored(trainKey(), JSON.stringify(train)); paintSync(); }

/* What the database hands back is not always what was written: an array comes
   back as an object when it has gaps, and an empty one doesn't come back at
   all. Every plan goes through this on the way in, so nothing below has to
   wonder. */
function normPractice(p, tid, pid) {
  if (!p || typeof p !== 'object') return null;
  const raw = Array.isArray(p.blocks) ? p.blocks : Object.values(p.blocks || {});
  const str = v => (v == null ? '' : String(v));
  /* Any of the team's coaches can write a plan, and the rules don't check its
     shape, so a rating of 9 or a start time of 1730 must not be able to break
     the screen of the next coach who opens it. */
  const r = p.review && typeof p.review === 'object' ? p.review : null;
  return {
    ...p, id: str(p.id || pid), teamId: str(p.teamId || tid),
    date: str(p.date), start: /^\d{2}:\d{2}$/.test(str(p.start)) ? str(p.start) : '', place: str(p.place),
    minutes: Number(p.minutes) > 0 ? Math.min(Number(p.minutes), 600) : 60,
    status: p.status === 'done' ? 'done' : 'plan',
    focus: { signals: [].concat((p.focus && p.focus.signals) || []).map(str).filter(Boolean) },
    review: r ? { ...r, rating: Number.isInteger(Number(r.rating)) ? clamp(Number(r.rating), 0, 5) : 0, note: str(r.note) } : undefined,
    blocks: raw.filter(b => b && b.drill && b.drill.id).map(b => ({ ...b, name: str(b.name), minutes: clamp(Number(b.minutes) || 10, 1, 240), note: str(b.note) }))
  };
}
/* A signal by its key, and only one of the library's own: a key read off a
   plan is somebody's typing. */
const signalOf = (L, k) => (L && k && Object.prototype.hasOwnProperty.call(L.SIGNALS, k) ? L.SIGNALS[k] : null);
const teamPractices = tid => Object.values(train.practices[tid] || {}).map(p => normPractice(p, tid, p && p.id)).filter(Boolean)
  .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const practiceById = (tid, pid) => { const p = (train.practices[tid] || {})[pid]; return p ? normPractice(p, tid, pid) : null; };
/* The plan is that team's coaches' and the club's admins', and nobody else's,
   whatever the rest of the screen lets them read. */
const canPlan = tid => !!tid && !!state.teams[tid] && canTrain() && canEditTeam(tid);

const isoDay = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const todayIso = () => isoDay(nowMs());
const addMins = (hhmm, n) => { const [h, m] = hhmm.split(':').map(Number); const t = ((h * 60 + m + n) % 1440 + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function pracDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  return DOW[new Date(y, m - 1, d).getDay()] + ' ' + shortDate(iso);
}
const pracTimes = p => (/^\d{2}:\d{2}$/.test(String(p.start || '')) ? p.start + '–' + (/^\d{2}:\d{2}$/.test(String(p.end || '')) ? p.end : addMins(p.start, Number(p.minutes) || 60)) : '');
const blockTotal = pr => pr.blocks.reduce((n, b) => n + b.minutes, 0);

/* The half the whole club may read: no drills, no notes, no review. */
function whenOf(p) {
  const w = { date: p.date, minutes: p.minutes };
  if (p.start) { w.start = p.start; w.end = addMins(p.start, p.minutes); }
  if (p.place) w.place = p.place;
  return w;
}

/* Every change to a plan goes through here: kept on the phone first, marked
   dirty with the version sent, then sent. One plan per write, at the depth the
   rule sits at, and never the team's whole collection. */
function putPractice(p) {
  const tid = p.teamId;
  p = JSON.parse(JSON.stringify({ ...p, at: nowMs() }));   // the database refuses undefined anywhere in a write
  (train.practices[tid] = train.practices[tid] || {})[p.id] = p;
  train.dirty[tid + '/' + p.id] = p.at;
  saveTrain();
  sendPractice(tid, p.id);
  return p;
}
function dropPractice(tid, pid) {
  if (train.practices[tid]) delete train.practices[tid][pid];
  train.dirty[tid + '/' + pid] = -1;            // a delete the club hasn't had yet
  saveTrain();
  sendPractice(tid, pid);
}
function sendPractice(tid, pid) {
  const code = wsCode(), k = tid + '/' + pid, mark = train.dirty[k];
  if (!fb || !code || mark === undefined) return;
  const p = mark === -1 ? null : (train.practices[tid] || {})[pid];
  if (mark !== -1 && !p) return;
  const ref = kind => fb.ref(fb.db, `training/${code}/${kind}/${tid}/${pid}`);
  Promise.all([fb.set(ref('practices'), p), fb.set(ref('schedule'), p ? whenOf(normPractice(p, tid, pid)) : null)])
    .then(() => {
      // only the version that was sent is clean; a change made since is still owed
      if (train.dirty[k] === mark) { delete train.dirty[k]; saveTrain(); }
      const was = trainState[tid]; trainState[tid] = 'synced';
      if (was !== 'synced') render();
    })
    .catch(e => {
      if (!/permission|denied/i.test((e && e.code) || '')) return;
      trainState[tid] = 'refused'; render();
    });
}

/* Merge, never replace. The club's copy wins for every plan this phone has
   nothing pending on; a plan with something pending keeps this phone's
   version, and a plan that was clean here and is gone from the club was
   deleted somewhere else. On the first answer after attaching, everything
   still pending is sent again, which is how a plan made offline and then
   reloaded still reaches the club. */
function mergePractices(tid, remote, resend) {
  const local = train.practices[tid] || {}, out = {};
  remote = remote && typeof remote === 'object' ? remote : {};
  for (const [pid, r] of Object.entries(remote)) {
    const k = tid + '/' + pid;
    if (train.dirty[k] === undefined) { const n = normPractice(r, tid, pid); if (n) out[pid] = n; }
    else if (local[pid]) out[pid] = local[pid];
  }
  for (const [pid, p] of Object.entries(local))
    if (!out[pid] && !remote[pid] && train.dirty[tid + '/' + pid] !== undefined) out[pid] = p;
  train.practices[tid] = out;
  saveTrain();
  if (resend) for (const k of Object.keys(train.dirty)) if (k.startsWith(tid + '/')) sendPractice(tid, k.slice(tid.length + 1));
  render();
}

/* Read one team at a time, when a screen needs it: practices when the Plans
   list opens, the schedule when the games list does. A parent's phone never
   asks for a plan, so it never holds one. Needs a signed-in account, because
   every training rule does. A refusal gets one retry, for the same reason
   wireBase() retries: in the first second after boot a refusal is as likely to
   be the sign-in not having reached the database yet as it is the rules. */
function watchTrain(kind, tid) {
  if (!rtdb || !fb || !me || !tid || !wsCode()) return;
  const key = kind + '/' + tid;
  if (trainWatch.has(key)) return;
  const { db, mod } = rtdb;
  let first = true;
  trainWatch.set(key, () => { });
  const off = mod.onValue(mod.ref(db, `training/${wsCode()}/${key}`), s => {
    if (kind === 'schedule') { train.schedule[tid] = s.val() || {}; saveTrain(); render(); return; }
    trainState[tid] = 'synced';
    mergePractices(tid, s.val(), first);
    first = false;
  }, err => {
    if (!/permission|denied/i.test((err && err.code) || '')) return;
    const n = trainTries[key] = (trainTries[key] || 0) + 1;
    if (n < 2) { trainWatch.delete(key); setTimeout(() => { watchTrain(kind, tid); }, 1500); return; }
    // the key stays, so redrawing doesn't ask again; a different account does (resetTrainWatch)
    if (kind === 'practices') { trainState[tid] = 'refused'; render(); }
  });
  if (typeof off === 'function') trainWatch.set(key, off);
}
/* Who's asking changed, so every answer so far was somebody else's. */
function resetTrainWatch() {
  resetShelfWatch();
  for (const off of trainWatch.values()) { try { off(); } catch (e) { } }
  trainWatch = new Map();
  for (const k of Object.keys(trainTries)) delete trainTries[k];
  for (const k of Object.keys(trainState)) delete trainState[k];
}

/* The next practice, from what the club published plus whatever this phone
   has planned and not sent yet. */
function nextPractice(tid) {
  const today = todayIso(), by = {};
  for (const [pid, s] of Object.entries(train.schedule[tid] || {})) if (s && s.date) by[pid] = { id: pid, ...s };
  for (const p of teamPractices(tid)) by[p.id] = { id: p.id, ...whenOf(p) };
  for (const [k, v] of Object.entries(train.dirty)) if (v === -1 && k.startsWith(tid + '/')) delete by[k.slice(tid.length + 1)];
  return Object.values(by).filter(x => x.date >= today).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))[0] || null;
}
function nextPracticeCard(t) {
  watchTrain('schedule', t.id);
  const nx = nextPractice(t.id); if (!nx) return '';
  const open = canPlan(t.id) && !!practiceById(t.id, nx.id);
  const body = `<span class="lbl" style="margin:0">Next practice</span>
    <b>${esc(pracDay(nx.date))}${nx.start ? ' · ' + esc(pracTimes(nx)) : ''}</b>${nx.place ? `<span class="muted">${esc(nx.place)}</span>` : ''}`;
  return open ? `<button type="button" class="card nextprac" data-act="pracopen" data-id="${esc(nx.id)}">${body}</button>` : `<div class="card nextprac">${body}</div>`;
}

/* Saved here only, and why, in as few words as will do. */
function trainNote(tid) {
  if (!fbConfig().apiKey) return '';
  if (trainState[tid] === 'refused') return `<div class="rolebar warn">Saved on this phone only. The database refused it: the club's rules may not include practices yet, or it doesn't list you as this team's coach yet.</div>`;
  if (!me) return `<div class="rolebar">Sign in and your plans are kept with the club, not just on this phone.</div>`;
  const pending = Object.keys(train.dirty).some(k => k.startsWith(tid + '/'));
  if (pending && !online) return `<div class="rolebar">Offline. Changes are on this phone and go to the club when the signal's back.</div>`;
  return '';
}

/* ---------------- the club's drills, and a coach's own ---------------- */
/* TRAINING.md's other two shelves. Built-in ships with the app; these two are
   people's work, and they're the club's and the coach's secret sauce.

   - Club: training/{code}/drills/{id}. Admins and coaches read it, never
     trackers or parents, and only a coach's or an admin's phone ever asks for
     it, so nobody else's holds a copy. It's cached per club inside `train`,
     beside the plans.
   - Mine: userLibrary/{uid}/drills/{id}. One person's, whichever club she's
     in. Cached per account (sm.mine.v1:{uid}) and cleared when she signs out
     or somebody else signs in, like sm.me: it's the person's, not the
     phone's. No club admin can read it; the app owner can, for support, and
     never keeps a copy (peekLibrary).

   Both sync the way practice plans do, and for the same reason: merge on
   read, never replace. A drill this phone changed and the database hasn't
   acknowledged is dirty and keeps this phone's version. One drill per write,
   at the depth the rules sit at.

   Moving between shelves copies, never links, and records where it came
   from: `from: { shelf, id, v }`. A copy whose original has moved on says so
   and never merges by itself. Deleting never cascades: a plan holds its own
   copy of every drill that isn't built in, so removing one from a shelf
   leaves last month's plan readable.

   Pictures: a drill copied from a built-in one keeps its drawing by naming
   it (`pic`), and the drawing comes from drills.js on every read. A drawing
   of her own (one an AI drew from her description, for now) is stored with
   the drill, and is drawn only after DrillDiagram.clean() has rebuilt it from
   typed values and parse() has passed it: the renderer writes numbers and
   ids straight into SVG, and anyone who can write a club drill could put
   markup there. Everything else is links, https only. */
const SHELVES = { builtin: 'Built-in', club: 'Club', mine: 'Mine' };
const LS_MINE = 'sm.mine.v1';
const MINE_BLANK = () => ({ drills: {}, dirty: {} });
let mine = MINE_BLANK(), mineUid = null;
const shelfState = {};            // 'club' | 'mine' -> 'synced' | 'refused'
let shelfWatch = new Map();       // database path -> unsubscribe
const shelfTries = {};

function loadMine(u) {
  mine = MINE_BLANK(); mineUid = u || null;
  if (!u) return;
  try {
    const m = JSON.parse(localStorage.getItem(LS_MINE + ':' + u) || 'null');
    if (m && typeof m === 'object') for (const k of Object.keys(mine)) if (m[k] && typeof m[k] === 'object') mine[k] = m[k];
  } catch (e) { }
}
function saveMine() { if (mineUid) keepStored(LS_MINE + ':' + mineUid, JSON.stringify(mine)); paintSync(); }
/* Signing out, or in as somebody else, takes the last person's library off
   the phone, the way cacheMe(null) takes her identity. */
function forgetMine() {
  if (mineUid) try { localStorage.removeItem(LS_MINE + ':' + mineUid); } catch (e) { }
  mine = MINE_BLANK(); mineUid = null;
}
const mineUnsent = () => (me && mineUid === me.uid ? Object.keys(mine.dirty).length : 0);

const SHELF = {
  club: {
    store() {
      if (!train.drills || typeof train.drills !== 'object') train.drills = {};
      if (!train.drillDirty || typeof train.drillDirty !== 'object') train.drillDirty = {};
      return { items: train.drills, dirty: train.drillDirty };
    },
    save: () => saveTrain(),
    owner: () => wsCode() || null,
    path: () => (wsCode() ? `training/${wsCode()}/drills` : null)
  },
  mine: {
    store() {
      if (!me) return { items: {}, dirty: {} };
      if (mineUid !== me.uid) loadMine(me.uid);
      return { items: mine.drills, dirty: mine.dirty };
    },
    save: () => saveMine(),
    owner: () => (me ? me.uid : null),
    path: () => (me ? `userLibrary/${me.uid}/drills` : null)
  }
};

const ownKey = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const arrOf = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const drillKey = (shelf, id) => (!shelf || shelf === 'builtin' ? id : shelf + ':' + id);
/* A drawing that didn't come from drills.js: rebuilt, then held to the same
   parser the built-in ones are, and to a size, or not drawn at all. */
function cleanDrawing(dg) {
  const D = drillDiagram();
  if (!D || !D.clean || !dg) return null;
  const c = D.clean(dg);
  return c && !D.parse(c).errors.length && JSON.stringify(c).length <= 12000 ? c : null;
}
const linkOk = u => typeof u === 'string' && u.length <= 500 && /^https:\/\/[^\s"'<>]+$/.test(u);

/* Whatever comes back from the database, or out of a plan, goes through this.
   Any coach can write a club drill and the rules check only its name and its
   links, so every list is held to the library's own vocabularies (a skill the
   filters don't know is a drill nobody finds), every number to a range, and
   every string to a length. Arrays come back from the database as objects
   when they have gaps. */
function normDrill(raw, shelf, id) {
  const L = drillLib(); if (!L || !raw || typeof raw !== 'object') return null;
  const str = (v, n) => (v == null || typeof v === 'object' ? '' : String(v)).trim().slice(0, n);
  const name = str(raw.name, 80); if (!name) return null;
  const int = (v, lo, hi, dflt) => { if (v == null || v === '') return dflt; const n = Math.round(Number(v)); return Number.isFinite(n) ? clamp(n, lo, hi) : dflt; };
  const lines = (v, n = 12) => arrOf(v).map(x => str(x, 400)).filter(Boolean).slice(0, n);
  const keys = (v, vocab) => [...new Set(arrOf(v).map(String))].filter(k => ownKey(vocab, k));
  const ages = arrOf(raw.ages), mins = arrOf(raw.minutes), pl = raw.players && typeof raw.players === 'object' ? raw.players : {};
  const a0 = int(ages[0], 4, 19, 4), a1 = int(ages[1], a0, 19, 19);
  const m0 = int(mins[0], 1, 120, 10), m1 = int(mins[1], m0, 120, Math.max(m0, 15));
  const pmin = int(pl.min, 1, 40, 2), pmax = int(pl.max, pmin, 40, Math.max(pmin, 20)), pbest = int(pl.best, pmin, pmax, pmin);
  const kit = {};
  if (raw.kit && typeof raw.kit === 'object')
    for (const [k, v] of Object.entries(raw.kit)) if (ownKey(L.KIT, k)) {
      if (v === 'each' && k === 'balls') kit[k] = 'each';
      else { const n = int(v, 0, 99, 0); if (n) kit[k] = n; }
    }
  const sp = arrOf(raw.space).map(x => int(x, 1, 150, 0));
  const media = arrOf(raw.media).filter(x => x && typeof x === 'object' && linkOk(x.url))
    .map(x => ({ kind: 'link', url: String(x.url), title: str(x.title, 80) })).slice(0, 6);
  const fr = raw.from && typeof raw.from === 'object' && ownKey(SHELVES, raw.from.shelf) ? { shelf: raw.from.shelf, id: str(raw.from.id, 60), v: int(raw.from.v, 0, 1e6, 0) } : null;
  const pic = str(raw.pic, 60), base = pic ? L.DRILLS.find(x => x.id === pic) : null;
  const did = str(raw.id, 60) || str(id, 60);
  return {
    id: did, v: int(raw.v, 1, 1e6, 1), name, type: ownKey(L.TYPES, raw.type) ? raw.type : 'technical',
    summary: str(raw.summary, 200), ages: [a0, a1], level: int(raw.level, 1, 3, 2), players: { min: pmin, best: pbest, max: pmax },
    gk: int(raw.gk, 0, 4, 0), minutes: [m0, m1], intensity: int(raw.intensity, 1, 3, 2),
    space: sp.length === 2 && sp[0] && sp[1] ? sp : null, spaceNote: '',
    kit, setupMins: int(raw.setupMins, 0, 30, 0), adults: int(raw.adults, 1, 2, 1), indoor: raw.indoor === true,
    groups: keys(raw.groups, L.GROUPS), involvement: int(raw.involvement, 1, 3, 2), competitive: raw.competitive === true,
    positions: keys(raw.positions, Object.fromEntries(L.POSITIONS.map(x => [x, 1]))),
    skills: keys(raw.skills, L.SKILLS), principles: keys(raw.principles, L.PRINCIPLES), moments: keys(raw.moments, L.MOMENTS), physical: keys(raw.physical, L.PHYSICAL),
    setup: str(raw.setup, 1000), how: lines(raw.how), points: lines(raw.points), questions: lines(raw.questions), mistakes: lines(raw.mistakes),
    why: str(raw.why, 600), easier: lines(raw.easier), harder: lines(raw.harder), safety: str(raw.safety, 400),
    signals: keys(raw.signals, L.SIGNALS), goesWith: [], tags: [],
    diagram: base ? base.diagram : cleanDrawing(raw.diagram), pic: base ? pic : '', media, from: fr,
    edBy: str(raw.edBy, 60), edName: str(raw.edName, 60),
    by: str(raw.by, 60), byName: str(raw.byName, 60), team: str(raw.team, 60), at: Number(raw.at) || 0,
    shelf, key: drillKey(shelf, did)
  };
}

/* The card itself, without whose it is or where it sits: what a copy takes,
   to another shelf or into a plan. A built-in drill's drawing goes by name. */
const CARD_DROP = new Set(['shelf', 'key', 'by', 'byName', 'edBy', 'edName', 'team', 'at', 'from', 'spaceNote', 'goesWith', 'tags']);
function cardOf(d) {
  const c = {};
  for (const [k, v] of Object.entries(d)) if (!CARD_DROP.has(k) && v != null && v !== '') c[k] = v;
  if (!d.shelf || d.shelf === 'builtin') c.pic = d.id;
  // a borrowed drawing goes by name; only her own travels with the card
  if (c.pic) delete c.diagram;
  return JSON.parse(JSON.stringify(c));
}

const shelfItems = shelf => Object.entries(SHELF[shelf].store().items).map(([id, r]) => normDrill(r, shelf, id)).filter(Boolean);
/* Any drill by the key a screen carries: a built-in id, 'club:id', 'mine:id',
   or 'plan:practiceId:index' for the copy a plan holds, which outlives the
   shelf it came from. */
function findDrill(key) {
  const L = drillLib(); key = String(key || '');
  if (!L) return null;
  const m = /^(club|mine):(.+)$/.exec(key);
  if (m) { const r = SHELF[m[1]].store().items[m[2]]; return r ? normDrill(r, m[1], m[2]) : null; }
  const p = /^plan:([^:]+):(\d+)$/.exec(key);
  if (p) { const t = team(), pr = t && canPlan(t.id) ? practiceById(t.id, p[1]) : null; return pr ? blockDrill(L, pr.blocks[Number(p[2])]) : null; }
  return L.DRILLS.find(d => d.id === key) || null;
}
/* The original a copy came from, and whether it has moved on since. */
function drillOrigin(d) {
  if (!d || !d.from || d.from.shelf === 'mine') return null;
  const o = findDrill(drillKey(d.from.shelf, d.from.id));
  return o ? { d: o, changed: (o.v || 1) > (d.from.v || 0) } : null;
}

/* Who may change a club drill in place. Mirrors the rule: an admin, or the
   coach who shared it while she still coaches the team it names. */
const canCurate = d => !!(me && d && d.shelf === 'club' && (isAdmin(me.uid) || (d.by === me.uid && !!(teamAccess(d.team).coaches || {})[me.uid])));
/* The team a shared drill is filed under, which the rule checks she coaches. */
function shareTeam() {
  if (!me) return null;
  const t = team();
  if (t && ((teamAccess(t.id).coaches || {})[me.uid] || isAdmin(me.uid))) return t.id;
  return coachTeamOf(me.uid) || (isAdmin(me.uid) ? (teams()[0] || {}).id || null : null);
}

function putDrill(shelf, d) {
  const S = SHELF[shelf], st = S.store();
  d = JSON.parse(JSON.stringify({ ...d, at: nowMs() }));
  st.items[d.id] = d; st.dirty[d.id] = d.at;
  S.save(); sendDrill(shelf, d.id);
  return d;
}
function dropDrill(shelf, id) {
  const S = SHELF[shelf], st = S.store();
  delete st.items[id]; st.dirty[id] = -1;       // a delete the database hasn't had yet
  S.save(); sendDrill(shelf, id);
}
function sendDrill(shelf, id) {
  const S = SHELF[shelf], st = S.store(), base = S.path(), owner = S.owner(), mark = st.dirty[id];
  if (!rtdb || !me || !base || mark === undefined) return;
  const v = mark === -1 ? null : st.items[id];
  if (mark !== -1 && !v) return;
  const { db, mod } = rtdb;
  Promise.resolve().then(() => mod.set(mod.ref(db, base + '/' + id), v)).then(() => {
    if (S.owner() !== owner) return;            // somebody else's now; theirs was cleared
    if (st.dirty[id] === mark) { delete st.dirty[id]; S.save(); }
    const was = shelfState[shelf]; shelfState[shelf] = 'synced';
    if (was !== 'synced') render();
  }).catch(e => {
    if (!/permission|denied/i.test((e && e.code) || '')) return;
    shelfState[shelf] = 'refused'; render();
  });
}
/* Merge, never replace: the same rule mergePractices() follows. */
function mergeShelf(shelf, remote, resend) {
  const S = SHELF[shelf], st = S.store(), out = {};
  remote = remote && typeof remote === 'object' ? remote : {};
  for (const [id, r] of Object.entries(remote)) {
    if (st.dirty[id] === undefined) { if (r && typeof r === 'object') out[id] = r; }
    else if (st.items[id]) out[id] = st.items[id];
  }
  for (const [id, d] of Object.entries(st.items)) if (!out[id] && !remote[id] && st.dirty[id] !== undefined) out[id] = d;
  for (const k of Object.keys(st.items)) delete st.items[k];
  Object.assign(st.items, out);
  S.save();
  if (resend) for (const id of Object.keys(st.dirty)) sendDrill(shelf, id);
  render();
}
/* Read when the Drills screen opens, by a coach's or an admin's phone only.
   One retry on a refusal, as watchTrain() does. */
function watchShelf(shelf) {
  const base = SHELF[shelf].path();
  if (!rtdb || !me || !base || !canTrain() || shelfWatch.has(base)) return;
  const { db, mod } = rtdb;
  let first = true;
  shelfWatch.set(base, () => { });
  const off = mod.onValue(mod.ref(db, base), s => {
    if (SHELF[shelf].path() !== base) return;
    shelfState[shelf] = 'synced';
    mergeShelf(shelf, s.val(), first);
    first = false;
  }, err => {
    if (!/permission|denied/i.test((err && err.code) || '')) return;
    const n = shelfTries[base] = (shelfTries[base] || 0) + 1;
    if (n < 2) { shelfWatch.delete(base); setTimeout(() => { watchShelf(shelf); }, 1500); return; }
    shelfState[shelf] = 'refused'; render();
  });
  if (typeof off === 'function') shelfWatch.set(base, off);
}
function resetShelfWatch() {
  for (const off of shelfWatch.values()) { try { off(); } catch (e) { } }
  shelfWatch = new Map();
  for (const k of Object.keys(shelfTries)) delete shelfTries[k];
  for (const k of Object.keys(shelfState)) delete shelfState[k];
}

/* For the app owner, helping someone: one look at one person's library, read
   once and drawn into a sheet. Nothing is kept: not in `mine`, not in
   localStorage, and the sheet forgets it when it closes. */
function peekLibrary(u) {
  if (!rtdb || !me || !isOwner() || !u) return;
  const { db, mod } = rtdb;
  mod.onValue(mod.ref(db, `userLibrary/${u}/drills`), s => {
    const ds = Object.entries(s.val() || {}).map(([id, r]) => normDrill(r, 'mine', id)).filter(Boolean);
    openSheet(`<h3>Their drills</h3><p class="muted" style="margin-top:0">Read once, for support, and not kept on this phone. You can't change them.</p>
      ${ds.length ? `<div class="plist">${ds.map(d => `<div class="prow" style="grid-template-columns:1fr"><span><span class="pname">${esc(d.name)}</span><span class="psub">${esc(d.summary)}</span></span></div>`).join('')}</div>` : '<p class="muted">None.</p>'}
      <button class="btn quiet wide" data-act="closesheet" style="margin-top:12px">Done</button>`, true);
  }, () => { toast('The database refused that'); }, { onlyOnce: true });
}

/* Saved here only, and why, for the shelf the coach is looking at. */
function shelfNote(shelf) {
  if (!fbConfig().apiKey) return '';
  if (!me) return `<div class="rolebar">Sign in to see the club's drills and keep your own.</div>`;
  const which = shelf === 'all' ? ['club', 'mine'] : shelf === 'builtin' ? [] : [shelf];
  if (which.some(s => shelfState[s] === 'refused')) return `<div class="rolebar warn">Saved on this phone only. The database refused it: the club's rules may not include drills yet.</div>`;
  if (which.some(s => Object.keys(SHELF[s].store().dirty).length) && !online) return `<div class="rolebar">Offline. Your changes are on this phone and go up when the signal's back.</div>`;
  return '';
}

/* ---- the drill editor ---- */
/* A sheet with the card's fields. Every list is chips from the library's own
   vocabularies, never free text, so a drill written here turns up under the
   same filters as a built-in one. Chips redraw the sheet, so what's typed is
   read into the draft first and drawn back from it. */
let drillDraft = null;            // { shelf, id, d: the card being written, keepPic }
const DRAFT_TEXT = { deName: 'name', deSummary: 'summary', deSetup: 'setup', deWhy: 'why', deSafety: 'safety' };
const DRAFT_LINES = { deHow: 'how', dePoints: 'points', deQuestions: 'questions', deMistakes: 'mistakes', deEasier: 'easier', deHarder: 'harder' };
const DRAFT_CHIPS = { positions: null, skills: 'SKILLS', principles: 'PRINCIPLES', moments: 'MOMENTS', physical: 'PHYSICAL', groups: 'GROUPS', signals: 'SIGNALS' };
const draftVocab = (L, k) => (k === 'positions' ? Object.fromEntries(L.POSITIONS.map(x => [x, x])) : k === 'signals' ? Object.fromEntries(Object.entries(L.SIGNALS).map(([s, v]) => [s, v.label])) : L[DRAFT_CHIPS[k]]);

function draftFrom(d) {
  const c = d ? cardOf(d) : { name: '', type: 'technical', ages: [8, 12], minutes: [10, 15], players: { min: 4, best: 12, max: 16 }, gk: 0, level: 2, intensity: 2, involvement: 2, adults: 1 };
  if (d && d.shelf && d.shelf !== 'builtin') { if (d.pic) c.pic = d.pic; else delete c.pic; }
  for (const k of [...Object.values(DRAFT_LINES), ...Object.keys(DRAFT_CHIPS)]) c[k] = arrOf(c[k]);
  c.kit = c.kit && typeof c.kit === 'object' ? c.kit : {};
  c.media = arrOf(c.media);
  return c;
}
function captureDraft() {
  const L = drillLib(), dd = drillDraft && drillDraft.d; if (!dd || !L || !$('#deName')) return;
  const v = id => { const n = $('#' + id); return n && n.value != null ? String(n.value) : ''; };
  for (const [id, k] of Object.entries(DRAFT_TEXT)) dd[k] = v(id);
  for (const [id, k] of Object.entries(DRAFT_LINES)) dd[k] = v(id).split('\n').map(x => x.trim()).filter(Boolean);
  dd.type = v('deType'); dd.level = v('deLevel'); dd.intensity = v('deInt'); dd.involvement = v('deInv');
  dd.ages = [v('deAge0'), v('deAge1')]; dd.minutes = [v('deMin0'), v('deMin1')];
  dd.players = { min: v('dePmin'), best: v('dePbest'), max: v('dePmax') };
  dd.gk = v('deGk'); dd.adults = v('deAdults'); dd.setupMins = v('deSetupMins');
  dd.indoor = v('deIndoor') === 'yes'; dd.competitive = v('deComp') === 'yes';
  dd.space = [v('deSpaceW'), v('deSpaceL')];
  dd.kit = {};
  for (const k of Object.keys(L.KIT)) { const x = v('deKit_' + k); if (x) dd.kit[k] = x === 'each' ? 'each' : Number(x); }
}
/* Opened at its top; redrawn after a chip or a link, it stays where she was. */
function sheetDrillEditor(top = false) {
  const L = drillLib(), dr = drillDraft; if (!L || !dr) return;
  const c = dr.d, n = normDrill({ ...c, name: c.name || 'x' }, dr.shelf, 'x') || {};
  const opt = (cur, v, l) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  const sel = (id, cur, entries) => `<select id="${id}">${entries.map(([v, l]) => opt(cur, v, l)).join('')}</select>`;
  const lab = (l, body) => `<label class="field"><span>${l}</span>${body}</label>`;
  const ages = Array.from({ length: 16 }, (_, i) => [i + 4, i + 4 === 19 ? 'U19 / adult' : 'U' + (i + 4)]);
  const area = (id, k, rows, ph) => lab(esc(ph), `<textarea id="${id}" rows="${rows}">${esc(arrOf(c[k]).join('\n'))}</textarea>`);
  const chips = k => `<p class="lbl">${{ positions: 'For', skills: 'Skills', principles: 'Principles of play', moments: 'Moments', physical: 'Physical', groups: 'Grouped as', signals: 'Answers' }[k]}</p>
    <div class="chips">${Object.entries(draftVocab(L, k)).map(([v, l]) => `<button class="chip" type="button" data-act="dedchip" data-k="${k}" data-v="${esc(v)}" aria-pressed="${arrOf(c[k]).includes(v)}">${esc(l)}</button>`).join('')}</div>`;
  const nums = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => [lo + i, String(lo + i)]);
  const kitOpts = k => [['', 'None'], ...(k === 'balls' ? [['each', 'One each']] : []), ...[1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24].map(x => [x, String(x)])];
  const pic = c.pic && L.DRILLS.find(x => x.id === c.pic);
  const own = !pic && c.diagram ? cleanDrawing(c.diagram) : null;
  openSheet(`<h3>${dr.id ? 'Edit the drill' : 'Write a drill'}</h3>
    <p class="muted" style="margin-top:0">${dr.shelf === 'club' ? 'The club\'s copy: every coach and admin in the club reads it.' : 'Yours. Nobody else sees it unless you share it with the club or add it to a practice.'}</p>
    ${lab('Name', `<input type="text" id="deName" value="${esc(c.name)}" maxlength="80" placeholder="Box rondo">`)}
    ${lab('In one line', `<input type="text" id="deSummary" value="${esc(c.summary || '')}" maxlength="200" placeholder="Four keep the ball from one in a small square">`)}
    <div class="grid2">
      ${lab('Type', sel('deType', c.type, Object.entries(L.TYPES)))}
      ${lab('Difficulty', sel('deLevel', n.level, Object.entries(L.LEVELS)))}
      ${lab('Youngest', sel('deAge0', n.ages ? n.ages[0] : 8, ages))}
      ${lab('Oldest', sel('deAge1', n.ages ? n.ages[1] : 12, ages))}
      ${lab('Minutes, shortest', `<input type="number" inputmode="numeric" id="deMin0" value="${esc(n.minutes ? n.minutes[0] : '')}">`)}
      ${lab('Minutes, longest', `<input type="number" inputmode="numeric" id="deMin1" value="${esc(n.minutes ? n.minutes[1] : '')}">`)}
      ${lab('Players, fewest', `<input type="number" inputmode="numeric" id="dePmin" value="${esc(n.players ? n.players.min : '')}">`)}
      ${lab('Players, best', `<input type="number" inputmode="numeric" id="dePbest" value="${esc(n.players ? n.players.best : '')}">`)}
      ${lab('Players, most', `<input type="number" inputmode="numeric" id="dePmax" value="${esc(n.players ? n.players.max : '')}">`)}
      ${lab('Keepers', sel('deGk', n.gk, nums(0, 4)))}
      ${lab('Intensity', sel('deInt', n.intensity, Object.entries(L.INTENSITY)))}
      ${lab('How busy', sel('deInv', n.involvement, Object.entries(L.INVOLVEMENT)))}
      ${lab('Adults to run it', sel('deAdults', n.adults, [[1, 'One'], [2, 'Two']]))}
      ${lab('Setup, minutes', `<input type="number" inputmode="numeric" id="deSetupMins" value="${esc(n.setupMins || 0)}">`)}
      ${lab('Indoors', sel('deIndoor', n.indoor ? 'yes' : 'no', [['no', 'Outdoors only'], ['yes', 'Works indoors']]))}
      ${lab('Competitive', sel('deComp', n.competitive ? 'yes' : 'no', [['no', 'No score'], ['yes', 'Has a score or winner']]))}
      ${lab('Space, yards wide', `<input type="number" inputmode="numeric" id="deSpaceW" value="${esc(n.space ? n.space[0] : '')}">`)}
      ${lab('Space, yards long', `<input type="number" inputmode="numeric" id="deSpaceL" value="${esc(n.space ? n.space[1] : '')}">`)}
    </div>
    ${lab('Setup', `<textarea id="deSetup" rows="3">${esc(c.setup || '')}</textarea>`)}
    ${area('deHow', 'how', 4, 'How it runs, a step a line')}
    ${area('dePoints', 'points', 3, 'Coaching points, one a line')}
    ${area('deQuestions', 'questions', 2, 'Questions to ask them, one a line')}
    ${area('deMistakes', 'mistakes', 2, 'What goes wrong, and the fix, one a line')}
    ${lab('Why it helps on Saturday', `<textarea id="deWhy" rows="2">${esc(c.why || '')}</textarea>`)}
    ${area('deEasier', 'easier', 2, 'Make it easier, one a line')}
    ${area('deHarder', 'harder', 2, 'Make it harder, one a line')}
    ${lab('Safety', `<input type="text" id="deSafety" value="${esc(c.safety || '')}" maxlength="400" placeholder="Only if there is something to say">`)}
    ${Object.keys(DRAFT_CHIPS).map(chips).join('')}
    <p class="lbl">Bring</p><div class="grid2">${Object.entries(L.KIT).map(([k, l]) => lab(esc(l), sel('deKit_' + k, (c.kit || {})[k] || '', kitOpts(k)))).join('')}</div>
    <p class="lbl">Picture</p>
    ${pic ? `<div class="chips"><button class="chip" type="button" data-act="dedpic" data-k="keep" aria-pressed="${dr.keepPic}">Keep the drawing from ${esc(pic.name)}</button><button class="chip" type="button" data-act="dedpic" data-k="drop" aria-pressed="${!dr.keepPic}">No drawing</button></div>`
      : own ? `<div class="drillpic">${drillDiagram().svg(own, { animate: !reducedMotion(), title: c.name })}</div>
        <button class="btn quiet sm" data-act="dedpic" data-k="clear">Remove this drawing</button>` : ''}
    <button class="btn quiet wide" data-act="dedai" style="margin-top:8px">${pic || own ? 'Describe it, and have an AI redraw it' : 'Describe it, and have an AI draw it'}</button>
    <p class="muted" style="margin-top:6px">Or link to a clip:</p>
    ${c.media.map((m, i) => `<div class="spread"><a class="drilllink" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.title || m.url)}</a><button class="btn quiet sm" data-act="dedlinkdel" data-i="${i}">Remove</button></div>`).join('')}
    ${c.media.length < 6 ? `<div class="grid2">${lab('Link to a video or GIF', `<input type="url" id="dlUrl" placeholder="https://youtu.be/…">`)}${lab('What it shows', `<input type="text" id="dlTitle" maxlength="80" placeholder="The set-up">`)}</div>
      <button class="btn quiet wide" data-act="dedlinkadd">Add the link</button>` : ''}
    <p class="muted">Unlisted isn't private: anyone who has the link can watch it. A clip of the set-up, or of professionals, is safer than one of your team. Nothing is uploaded, and a link needs a signal to play.</p>
    <button class="btn wide" data-act="dedsave">Save</button>
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Cancel</button>`, top);
}
/* ---- having an AI draw it ---- */
/* The coach says what happens in her own words, and an AI writes the drawing
   in drill-diagram.js's format. The app never calls a model itself (CLAUDE.md):
   it builds a prompt she copies into her own ChatGPT, Claude or Gemini, and
   she pastes the answer back. What comes back is somebody else's text, so it
   goes through DrillDiagram.clean() and parse() like any stored drawing, and
   whatever parse() objects to is handed back to her as a list she can paste
   to the AI to fix. Names typed into the idea are swapped out before copying,
   club-wide, because a drill is no place for a child's name. */
const DRAW_EXAMPLES = ['rondo-4v1', 'turn-and-shoot'];
function drawPrompt(c, idea) {
  const L = drillLib();
  const ex = DRAW_EXAMPLES.map(id => L.DRILLS.find(d => d.id === id)).filter(Boolean)
    .map(d => `"${d.name}":\n${JSON.stringify(d.diagram)}`).join('\n\n');
  const how = arrOf(c.how).map((x, i) => `${i + 1}. ${x}`).join('\n');
  return `I coach youth soccer and use an app that draws and animates drills from a small JSON format. Please draw this drill in that format.

The drill: ${c.name || '(no name yet)'}
${c.setup ? 'Setup: ' + c.setup + '\n' : ''}${how ? 'How it runs:\n' + how + '\n' : ''}
What the picture should show:
${idea || '(see above)'}

THE FORMAT. Distances are in yards. x runs across, y runs down, and 0,0 is the top-left corner of the area.
- "area": [width, length], each 4 to 150.
- "mark": "grid" (a coned square), "box" (a penalty area on the top edge, area at least 44 wide), "half" (that plus halfway at the bottom), "pitch" (both ends, both sides at least 44) or "none".
- "cones", "balls", "poles": lists of [x, y].
- "goals": [x, y, "big" or "mini", facing], where x, y is the middle of the goal line and facing is the way the mouth opens: "n", "s", "e" or "w". A goal on the top edge facing down the area is "s".
- "zones": [x, y, width, height, "label"] for shaded areas. "lines": [x1, y1, x2, y2], dashed. "labels": [x, y, "text"].
- "players": {"A1": [x, y], ...}. A is our team (blue), D opponents (red), N neutral (yellow), B a fourth team, K a keeper, C a coach or server. A letter and up to two digits.
- "ball": who starts with a ball: "A1", or ["A1", "A2"], or a spot [[x, y]].
- "frames": the steps, in order. Each step is a list of moves that happen at the same time, plus one caption written "# Caption" (under 48 characters).

MOVES:
- "A1>A2" pass to a player (to wherever she is at the end of the step). "A1>12,4" pass into space. "A1>G" shoot at the nearest goal ("G2" the second goal). Add "(" or ")" at the end to bend it left or right.
- "A1~12,4" dribble there with the ball. "A1-12,4" run there without it. "D1-A1" run at a player. "D1*" win the nearest ball.

RULES:
- Everyone stays inside the area. Only the player who has the ball passes, shoots or dribbles; a pass makes the receiver the one with the ball.
- Nobody moves twice in one step. 2 to 6 steps is plenty. No player names: letters and numbers only.
- Reply with the JSON object only, and nothing else.

TWO EXAMPLES from the app's own library:

${ex}`;
}
/* An AI's answer is a JSON object, give or take a code fence and a sentence
   either side, and sometimes written the way a JavaScript file would be. */
function drawingFrom(text) {
  let s = String(text || '').replace(/```(?:json|js|javascript)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) { }
  try {
    return JSON.parse(s.replace(/'([^'\\]*)'/g, '"$1"').replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, '$1'));
  } catch (e) { return null; }
}
/* What's wrong with a pasted answer, in words she can paste back to the AI. */
function drawingProblems(raw) {
  const D = drillDiagram();
  if (!raw) return ["That isn't a drawing: paste the AI's answer, the part from { to }."];
  const c = D.clean(raw);
  if (!c) return ['It needs an "area": [width, length], each 4 to 150 yards.'];
  const out = D.parse(c).errors.slice(0, 8);
  const moves = fr => (Array.isArray(fr) ? fr : []).flat().filter(m => typeof m === 'string' && !m.trim().startsWith('#')).length;
  const lost = moves(raw.frames) - moves(c.frames);
  if (lost > 0) out.push(`${lost} move${lost === 1 ? " isn't" : "s aren't"} written in the format (like "A1>A2" or "A1~12,4") and ${lost === 1 ? 'was' : 'were'} left out.`);
  const pl = raw.players && typeof raw.players === 'object' ? Object.keys(raw.players).length : 0;
  if (pl > Object.keys(c.players).length) out.push('Some players have ids that are not a letter (A, D, N, B, K or C) and up to two digits, or no [x, y].');
  if (!out.length && JSON.stringify(c).length > 12000) out.push('It is too big: keep it under about 30 players and 16 steps.');
  return out;
}
function sheetDrawAi() {
  const dr = drillDraft; if (!dr) return;
  const ai = dr.ai = dr.ai || { idea: '', reply: '', problems: [] };
  const prompt = aiScrub(drawPrompt(dr.d, ai.idea), 'club').text;
  openSheet(`<h3>Have an AI draw it</h3>
    <p class="muted" style="margin-top:0">Say what happens, in your own words. You copy a prompt into your own ChatGPT, Claude or Gemini, and paste its answer back here; the app doesn't send anything anywhere itself.</p>
    <label class="field"><span>What happens, step by step</span><textarea id="daIdea" rows="4" placeholder="Four on the outside of a 10 yard square, one defender in the middle. They pass round him; when he wins it, the passer goes in.">${esc(ai.idea)}</textarea></label>
    <p class="muted" style="margin-top:-6px">The drill's setup and steps go in too. Any player's name is swapped out before it's copied.</p>
    <textarea id="daPrompt" rows="3" readonly style="font-size:12px" aria-label="The prompt">${esc(prompt)}</textarea>
    <button class="btn wide" data-act="dedaicopy">Copy the prompt</button>
    <div class="row" style="gap:6px;margin-top:8px">${Object.entries(AI_SITES).map(([k, [label]]) =>
      `<button class="btn quiet sm" style="flex:1" data-act="dedaiopen" data-k="${k}">${label}</button>`).join('')}</div>
    <label class="field" style="margin-top:12px"><span>Paste the AI's answer</span><textarea id="daReply" rows="5" style="font-size:12px" placeholder='{"area": [20, 20], ...}'>${esc(ai.reply)}</textarea></label>
    ${ai.problems.length ? `<div class="card planwarn"><p><b>Not quite. The drawing has ${ai.problems.length === 1 ? 'a problem' : 'some problems'}:</b></p>${ai.problems.map(x => `<p>${esc(x)}</p>`).join('')}
      <button class="btn quiet sm" data-act="dedaifix" style="margin-top:6px">Copy these to send back to the AI</button></div>` : ''}
    <button class="btn wide" data-act="dedaiuse">Use this drawing</button>
    <button class="btn quiet wide" data-act="dedaiback" style="margin-top:8px">Back to the drill</button>`, true);
}
function copyQuiet(text, done) {
  try { navigator.clipboard.writeText(text).then(() => toast(done), () => toast('Could not copy — select it by hand')); }
  catch (e) { toast('Could not copy — select it by hand'); }
}

/* What's wrong with the draft, said in one line, or nothing. */
function draftProblem(n) {
  if (!n) return 'Give it a name';
  if (!n.summary) return 'Say what it is in one line';
  if (!n.setup) return 'Say how to set it up';
  if (!n.how.length) return 'Say how it runs, a step a line';
  if (!n.points.length) return 'Give it at least one coaching point';
  if (n.skills.includes('heading') && n.ages[0] < 11) return 'Heading drills start at U11: US Soccer rules out heading for under-elevens';
  return '';
}

/* ---- the drills in a plan ---- */
/* A built-in drill is stored by reference, because nobody can change one
   except by shipping a new drills.js, with its name alongside so the plan
   still reads if the drill is ever taken out. A club or personal drill is
   copied in whole (`card`), because those can be edited and deleted, and
   last month's plan must still read the way it was run. */
function blockDrill(L, b) {
  if (!L || !b || !b.drill) return null;
  if (b.drill.shelf === 'builtin') return L.DRILLS.find(d => d.id === b.drill.id) || null;
  return b.drill.card && ownKey(SHELVES, b.drill.shelf) ? normDrill({ ...b.drill.card, id: b.drill.id }, b.drill.shelf, b.drill.id) : null;
}
/* Where a block's drill opens from: the library for a built-in one, the
   plan's own copy for anything else. */
const blockKey = (pr, i, d) => (!d.shelf || d.shelf === 'builtin' ? d.id : 'plan:' + pr.id + ':' + i);
const midMinutes = d => Math.round((d.minutes[0] + d.minutes[1]) / 2);
const drillBlock = (L, d, minutes) => (!d.shelf || d.shelf === 'builtin'
  ? { drill: { shelf: 'builtin', id: d.id, v: L.version }, name: d.name, minutes: minutes || midMinutes(d), note: '' }
  : { drill: { shelf: d.shelf, id: d.id, v: d.v, card: cardOf(d) }, name: d.name, minutes: minutes || midMinutes(d), note: '' });
const squadOf = t => players(t).filter(p => p.active !== false);

/* Kit is worked out when it's needed, never stored: the most of each thing
   any one drill needs, because cones are reused rather than used up, and a
   ball each is the squad's size. */
function kitWords(L, kit, n) {
  return Object.entries(kit).map(([k, v]) => {
    const name = (L.KIT[k] || k).toLowerCase();
    if (v === 'each') return n ? `${n} ${name}` : `a ${name.replace(/s$/, '')} each`;
    return `${v} ${v === 1 ? name.replace(/s$/, '') : name}`;
  }).join(', ');
}
function planKit(L, t, pr) {
  const n = squadOf(t).length, most = {};
  for (const b of pr.blocks) {
    const d = blockDrill(L, b); if (!d) continue;
    for (const [k, v] of Object.entries(d.kit)) {
      const q = v === 'each' ? (n || 'each') : Number(v) || 0;
      most[k] = q === 'each' || most[k] === 'each' ? 'each' : Math.max(most[k] || 0, q);
    }
  }
  return kitWords(L, most, n);
}

/* What would go wrong at the field, said before getting there. */
function planWarnings(L, t, pr) {
  const out = [], u = teamUAge(t), sq = squadOf(t), n = sq.length, gk = sq.filter(p => p.gk).length;
  const total = blockTotal(pr);
  if (total > pr.minutes) out.push(`Runs ${total - pr.minutes} min over the ${pr.minutes} you have.`);
  for (const b of pr.blocks) {
    const d = blockDrill(L, b);
    if (!d) { out.push(`${b.name || 'A drill'} is no longer in the library.`); continue; }
    if (n && d.players.min > n) out.push(`${d.name} needs at least ${d.players.min} players; the squad has ${n}.`);
    if (n && d.gk > gk) out.push(gk ? `${d.name} wants ${d.gk} keepers; the squad has ${gk}.` : `${d.name} wants ${d.gk === 1 ? 'a keeper' : d.gk + ' keepers'}, and nobody on the squad is marked as one.`);
    if (u != null && (Math.min(u, 19) < d.ages[0] || Math.min(u, 19) > d.ages[1])) out.push(`${d.name} is for ${drillAges(d)}; this team is ${uLabel(u)}.`);
  }
  for (let i = 2; i < pr.blocks.length; i++) {
    const ds = [i - 2, i - 1, i].map(j => blockDrill(L, pr.blocks[j]));
    if (ds.every(d => d && d.intensity === 3)) { out.push(`Three hard drills in a row: ${ds.map(d => d.name).join(', ')}. A drink break, or move one.`); break; }
  }
  return [...new Set(out)];
}

/* A session shaped the way coaches are taught to shape one: warm up, one or
   two practices, a game, and a cool-down when there's time for it. Each slot
   takes the drill that best fits the team's age, the squad, and what the
   practice is for; asking again moves along the shortlist. The minutes start
   at the middle of each drill's range and are fitted to the practice's length,
   with the game taking up whatever is left over. */
function suggestPlan(L, t, pr, turn = 0, strict = false) {
  const u = teamUAge(t), age = u == null ? null : Math.min(u, 19);
  const sq = squadOf(t), n = sq.length, gk = sq.filter(p => p.gk).length;
  const sig = signalOf(L, pr.focus.signals[0]) ? pr.focus.signals[0] : '';
  const level = age == null ? 2 : age <= 8 ? 1 : age <= 12 ? 2 : 3;
  const fits = d => (age == null || (d.ages[0] <= age && age <= d.ages[1])) && (!n || d.players.min <= n);
  // with a squad entered, a drill wanting more keepers than it has is a last resort
  const keepers = d => !n || d.gk <= gk;
  const score = d => (sig && d.signals.includes(sig) ? 10 : 0) + (3 - Math.abs(d.level - level));
  const used = new Set(), seq = [];
  /* Never a third hard drill straight after two, so the plan doesn't trip the
     warning it would then show; some warm-ups are games and run hot. Softer,
     not a hard one straight after a hard one, nor a warm-up that starts flat
     out. If that still ends in three, the second try forbids even two. */
  const hard = d => d.intensity === 3;
  const calm = d => !(hard(d) && (strict ? seq.length >= 1 && hard(seq[seq.length - 1]) : seq.length >= 2 && seq.slice(-2).every(hard)));
  const ease = d => (hard(d) && (d.type === 'warmup' || (seq.length && hard(seq[seq.length - 1]))) ? 3 : 0);
  const pick = (ok, k) => {
    const sc = d => score(d) - ease(d);
    const all = L.DRILLS.filter(d => fits(d) && ok(d) && !used.has(d.id)).sort((a, b) => sc(b) - sc(a) || a.id.localeCompare(b.id));
    const c = [d => keepers(d) && calm(d), calm, () => true].map(f => all.filter(f)).find(x => x.length) || [];
    if (!c.length) return null;
    const best = c.filter(d => sc(d) >= sc(c[0]) - 1).slice(0, 4);
    const d = best[(turn + k) % best.length];
    used.add(d.id); seq.push(d);
    return d;
  };
  const MAIN = ['technical', 'opposed', 'position'];
  const main = d => MAIN.includes(d.type) || (!!sig && d.signals.includes(sig) && !['warmup', 'game', 'cooldown'].includes(d.type));
  const slots = [pick(d => d.type === 'warmup', 0), pick(main, 1)];
  if (pr.minutes >= 60) slots.push(pick(d => main(d) && d.type !== (slots[1] || {}).type, 2) || pick(main, 2));
  slots.push(pick(d => d.type === 'game', 3));
  if (pr.minutes >= 75) slots.push(pick(d => d.type === 'cooldown', 4));
  const ds = slots.filter(Boolean);
  if (!ds.length) return [];
  if (!strict && ds.some((d, i) => i >= 2 && hard(d) && hard(ds[i - 1]) && hard(ds[i - 2]))) return suggestPlan(L, t, pr, turn, true);
  const mids = ds.map(midMinutes), sum = mids.reduce((a, b) => a + b, 0), scale = pr.minutes / sum;
  const mins = ds.map((d, i) => Math.max(d.minutes[0], Math.min(d.minutes[1] + 5, Math.round(mids[i] * scale))));
  const gi = ds.findIndex(d => d.type === 'game'), fix = gi >= 0 ? gi : ds.length - 1;
  mins[fix] = Math.max(5, mins[fix] + pr.minutes - mins.reduce((a, b) => a + b, 0));
  // a short practice can't give every drill its shortest time: trim the longest until it fits
  for (let over = mins.reduce((a, b) => a + b, 0) - pr.minutes; over > 0; over--) {
    const j = mins.indexOf(Math.max(...mins));
    if (mins[j] <= 5) break;
    mins[j]--;
  }
  return ds.map((d, i) => drillBlock(L, d, mins[i]));
}

/* ---- the screens ---- */
function practicePlansView(L) {
  const t = team(); if (!t) return needTeam();
  if (!canPlan(t.id)) return `<div class="empty"><strong>Plans are for this team's coaches</strong>The drills and the positions guide are here for every coach; your own team's plans are under your team.</div>`;
  watchTrain('practices', t.id);
  const p = practiceUi();
  if (p.open) { const pr = practiceById(t.id, p.open); if (pr) return planView(L, t, pr); p.open = null; }
  const all = teamPractices(t.id), today = todayIso();
  const past = all.filter(x => x.date < today).reverse();
  /* A practice is added once, on the calendar, whichever tab the coach is on,
     so the ones put there with nothing planned yet are listed here too, ready
     to plan, rather than a second list of practices the calendar never sees. */
  const unplanned = calItems([t.id]).filter(x => x.kind === 'practice' && x.date >= today && !x.called && !practiceById(t.id, x.id))
    .map(x => ({ cal: x, date: x.date, start: x.start }));
  const next = [...all.filter(x => x.date >= today), ...unplanned].sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  return `${trainNote(t.id)}
    <div class="spread"><h2>Practices</h2><button class="btn sm" data-act="pracnew" data-tid="${esc(t.id)}">Add</button></div>
    ${next.length ? `<div class="plist">${next.map(x => x.cal ? calPracRow(x.cal) : pracRow(L, x, today)).join('')}</div>`
      : `<div class="empty"><strong>Nothing planned yet</strong>Add one, and the drills, the timings and the kit list are on your phone at the field, signal or not.</div>`}
    ${past.length ? `<p class="lbl" style="margin:6px 0 0">Earlier</p><div class="plist">${past.slice(0, p.past ? 60 : 5).map(x => pracRow(L, x, today)).join('')}</div>
      ${past.length > 5 && !p.past ? `<button class="btn quiet wide" data-act="pracpast">Show all ${past.length}</button>` : ''}` : ''}`;
}

function calPracRow(it) {
  const sub = [it.venue, 'no plan yet'].filter(Boolean).join(' · ');
  return `<button class="prow" type="button" data-act="pracfromcal" data-id="${esc(it.id)}" style="grid-template-columns:1fr auto">
    <span><span class="pname">${esc(pracDay(it.date))}${it.start ? ' · ' + esc(it.start) + (it.end ? '–' + esc(it.end) : '') : ''}</span><span class="psub">${esc(sub)}</span></span><span class="tag wait">Plan it</span></button>`;
}
/* A plan for a calendar practice is keyed by the entry's id and starts from
   its day, time and place, so the practice and its plan are one thing. */
function planFromEntry(tid, e) {
  const prev = teamPractices(tid).slice(-1)[0] || {};
  const s = hm(e.start), en = hm(e.end);
  const len = s && en && minOf(en) > minOf(s) ? minOf(en) - minOf(s) : prev.minutes || 60;
  return putPractice({
    id: e.id, eid: e.id, teamId: tid, date: e.date, start: s, minutes: clamp(len, 10, 240), place: e.venue || '',
    focus: { signals: [] }, blocks: [], status: 'plan', made: nowMs(), by: me ? me.uid : null, byName: whoAmI() || null
  });
}

function pracRow(L, pr, today) {
  const n = pr.blocks.length, s = signalOf(L, pr.focus.signals[0]);
  const tag = pr.status === 'done' ? `<span class="tag">${pr.review && pr.review.rating ? '★ ' + pr.review.rating : 'Done'}</span>`
    : pr.date < today ? '<span class="tag wait">How did it go?</span>' : '<span class="tag">Planned</span>';
  const sub = [pr.place, n ? `${n} drill${n === 1 ? '' : 's'} · ${blockTotal(pr)} min` : 'no drills yet', s ? s.label : ''].filter(Boolean).join(' · ');
  return `<button class="prow" type="button" data-act="pracopen" data-id="${esc(pr.id)}" style="grid-template-columns:1fr auto">
    <span><span class="pname">${esc(pracDay(pr.date))}${pr.start ? ' · ' + esc(pracTimes(pr)) : ''}</span><span class="psub">${esc(sub)}</span></span>${tag}</button>`;
}

function planView(L, t, pr) {
  const id = esc(pr.id), total = blockTotal(pr), today = todayIso();
  const warn = planWarnings(L, t, pr), kit = planKit(L, t, pr);
  const s = signalOf(L, pr.focus.signals[0]);
  const last = pr.blocks.length - 1;
  const rows = pr.blocks.map((b, i) => {
    const d = blockDrill(L, b);
    return `<div class="card planblock">
      <div class="spread"><button class="drilllink planname" data-act="${d ? 'drill' : 'pracnote'}" data-id="${esc(d ? blockKey(pr, i, d) : pr.id)}" data-i="${i}">${i + 1}. ${esc(d ? d.name : b.name || 'A drill')}</button>
        <span class="planmins"><button class="chip" type="button" data-act="pracmin" data-id="${id}" data-i="${i}" data-d="-1" aria-label="A minute less">−</button><b>${b.minutes}′</b><button class="chip" type="button" data-act="pracmin" data-id="${id}" data-i="${i}" data-d="1" aria-label="A minute more">+</button></span></div>
      ${d ? `<span class="drillfacts">${esc(L.TYPES[d.type] || d.type)} · ${esc(L.INTENSITY[d.intensity])}</span>` : ''}
      ${b.note ? `<p class="plannote">${esc(b.note)}</p>` : ''}
      <div class="planctl">
        <button type="button" data-act="pracmove" data-id="${id}" data-i="${i}" data-d="-1"${i === 0 ? ' disabled' : ''} aria-label="Earlier">↑</button>
        <button type="button" data-act="pracmove" data-id="${id}" data-i="${i}" data-d="1"${i === last ? ' disabled' : ''} aria-label="Later">↓</button>
        <button type="button" data-act="pracnote" data-id="${id}" data-i="${i}">${b.note ? 'Edit note' : 'Note'}</button>
        <button type="button" data-act="pracdel" data-id="${id}" data-i="${i}">Remove</button></div></div>`;
  }).join('');
  const r = pr.review || { rating: 0, note: '' };
  const review = pr.status === 'done'
    ? `<div class="card"><div class="spread"><h4 style="margin:0">How it went</h4><button class="btn quiet sm" data-act="pracreview" data-id="${id}">Change</button></div>
        <p style="margin:6px 0 0"><span class="stars">${'★'.repeat(r.rating)}<span class="dim">${'★'.repeat(5 - r.rating)}</span></span>${r.note ? ' · ' + esc(r.note) : ''}</p></div>`
    : pr.date <= today ? `<button class="btn wide" data-act="pracreview" data-id="${id}">How did it go?</button>` : '';
  return `${trainNote(t.id)}
    <button class="drilllink planback" data-act="pracback">‹ All practices</button>
    <div class="card">
      <div class="spread"><span><b class="planday">${esc(pracDay(pr.date))}</b><span class="rowsub">${esc([pracTimes(pr), pr.place].filter(Boolean).join(' · ') || 'No time or place yet')}</span></span>
        <button class="btn quiet sm" data-act="pracedit" data-id="${id}">Edit</button></div>
      ${s ? `<div class="drillsignal"><b>${esc(s.label)}</b><span>${esc(s.means)}</span></div>` : ''}
      <p class="muted" style="margin:8px 0 0">${total} of ${pr.minutes} min planned${pr.blocks.length ? ` · ${pr.blocks.length} drill${pr.blocks.length === 1 ? '' : 's'}` : ''}</p>
      ${pr.blocks.length ? `<button class="btn wide" data-act="pracrun" data-id="${id}" style="margin-top:10px">Run it</button>` : ''}
    </div>
    ${warn.length ? `<div class="card planwarn">${warn.map(w => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
    ${rows ? `<div class="stack">${rows}</div>` : `<div class="empty"><strong>No drills yet</strong>Add them from the library, or let the app suggest a session for this team's age${s ? ' and what it needs' : ''}.</div>`}
    <div class="row" style="gap:8px"><button class="btn" style="flex:1" data-act="pracpick" data-id="${id}">Add a drill</button>
      <button class="btn quiet" style="flex:1" data-act="pracsuggest" data-id="${id}">${pr.blocks.length ? 'Suggest another' : 'Suggest a session'}</button></div>
    ${kit ? `<div class="card"><h4 style="margin:0 0 4px">Bring</h4><p style="margin:0">${esc(kit)}</p></div>` : ''}
    ${review}
    <div class="row" style="gap:8px"><button class="btn quiet" style="flex:2" data-act="pracagain" data-id="${id}">Again next week</button>
      <button class="btn quiet danger" style="flex:1" data-act="pracrm" data-id="${id}">Delete</button></div>`;
}

/* Adding drills from the library, with where they're going said on top. */
function pickBanner(L) {
  const p = practiceUi(), t = team();
  const pr = p.pick && t && canPlan(t.id) ? practiceById(t.id, p.pick) : null;
  if (!pr) { p.pick = null; return ''; }
  return `<div class="card pickbar"><span>Adding to <b>${esc(pracDay(pr.date))}</b><span class="rowsub">${pr.blocks.length} drill${pr.blocks.length === 1 ? '' : 's'} · ${blockTotal(pr)} of ${pr.minutes} min</span></span>
    <button class="btn sm" data-act="pracpickdone" data-id="${esc(pr.id)}">Back to the plan</button></div>`;
}
function pickTarget() {
  const p = practiceUi(), t = team();
  return p.pick && t && canPlan(t.id) ? practiceById(t.id, p.pick) : null;
}

function sheetPractice(pr) {
  const L = drillLib(), t = team(); if (!t) return;
  const prev = teamPractices(t.id).slice(-1)[0] || {};
  const v = pr || { date: addDays(todayIso(), 1), start: prev.start || '', minutes: prev.minutes || 60, place: prev.place || '', focus: { signals: [] } };
  const sig = (v.focus && v.focus.signals || [])[0] || '';
  const lens = [30, 45, 60, 75, 90, 105, 120];
  if (!lens.includes(v.minutes)) lens.push(v.minutes);
  openSheet(`<h3>${pr ? 'Edit the practice' : 'Plan a practice'}</h3>
    <div class="grid2">
      <label class="field"><span>Date</span><input type="date" id="prDate" value="${esc(v.date)}"></label>
      <label class="field"><span>Start</span><input type="time" id="prStart" value="${esc(v.start)}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Length</span><select id="prLen">${lens.sort((a, b) => a - b).map(m => `<option value="${m}"${m === v.minutes ? ' selected' : ''}>${m} minutes</option>`).join('')}</select></label>
      <label class="field"><span>Place</span><input type="text" id="prPlace" value="${esc(v.place)}" placeholder="Lakeside Park, field 2" maxlength="80"></label>
    </div>
    <label class="field"><span>What it's for</span><select id="prFocus"><option value="">Nothing in particular</option>${L ? Object.entries(L.SIGNALS).map(([k, s]) =>
      `<option value="${esc(k)}"${k === sig ? ' selected' : ''}>${esc(s.label)}</option>`).join('') : ''}</select></label>
    <p class="muted" style="margin-top:0">The whole club sees the date, time and place, so parents know when and where. Only this team's coaches and the club's admins see the plan.</p>
    <button class="btn wide" data-act="pracsave" data-id="${pr ? esc(pr.id) : ''}">${pr ? 'Save' : 'Plan it'}</button>
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Cancel</button>`, true);
}

function sheetBlockNote(pr, i) {
  const b = pr.blocks[i]; if (!b) return;
  openSheet(`<h3>Note for ${esc(b.name || 'this drill')}</h3>
    <label class="field"><span>A reminder for yourself or the other coaches</span><textarea id="prNote" rows="3" maxlength="300">${esc(b.note || '')}</textarea></label>
    <p class="muted" style="margin-top:0">About the drill, not about a child: every coach this team ever has can read the plan.</p>
    <button class="btn wide" data-act="pracnotesave" data-id="${esc(pr.id)}" data-i="${i}">Save</button>
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Cancel</button>`, true);
}

function sheetReview(pr, draft) {
  const r = pr.review || {};
  openSheet(`<h3>How did it go?</h3>
    <p class="muted" style="margin-top:0">${esc(pracDay(pr.date))}${pr.place ? ' · ' + esc(pr.place) : ''}</p>
    <div class="chips">${[1, 2, 3, 4, 5].map(n => `<button class="chip" type="button" data-act="pracrate" data-id="${esc(pr.id)}" data-v="${n}" aria-pressed="${r.rating === n}">${'★'.repeat(n)}</button>`).join('')}</div>
    <label class="field" style="margin-top:10px"><span>One line on what worked, or didn't</span><input type="text" id="prReview" value="${esc(draft != null ? draft : r.note || '')}" maxlength="200" placeholder="The rondo clicked; the game ran long"></label>
    <p class="muted" style="margin-top:0">About the session, not about a child. A plan follows the team to every coach it ever has, and this is what a coach or the AI helper learns from later.</p>
    <button class="btn wide" data-act="pracreviewsave" data-id="${esc(pr.id)}">Save</button>
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Not now</button>`, true);
}

/* Run mode: the sideline view, one drill at a time in big type, with a
   countdown that runs off the wall clock (so a phone that sleeps comes back
   with the right time) and works with no signal, because everything it shows
   is already on the phone. */
const runLeft = (r, b) => (r.endsAt ? Math.max(0, Math.round((r.endsAt - nowMs()) / 1000)) : r.left != null ? r.left : b.minutes * 60);
function runView(L) {
  const p = practiceUi(), r = p.run, t = team();
  const pr = t && canPlan(t.id) ? practiceById(t.id, r.pid) : null;
  if (!pr || !pr.blocks.length) { p.run = null; return null; }
  r.i = clamp(Number(r.i) || 0, 0, pr.blocks.length - 1);
  const i = r.i, b = pr.blocks[i], d = blockDrill(L, b), last = i === pr.blocks.length - 1;
  const left = runLeft(r, b), going = !!r.endsAt, up = going && left === 0;
  const list = a => `<ul class="drillul">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const nextB = pr.blocks[i + 1];
  return `<div class="stack runmode">
    <div class="spread"><button class="drilllink planback" data-act="runstop">‹ Back to the plan</button><span class="muted">${i + 1} of ${pr.blocks.length} · ${esc(pracDay(pr.date))}</span></div>
    <div class="card runcard">
      <h2>${esc(d ? d.name : b.name || 'A drill')}</h2>
      <div class="runclock${up ? ' up' : ''}" id="runClock">${up ? "Time's up" : mmss(left)}</div>
      <div class="row" style="gap:8px">
        <button class="btn" style="flex:2" data-act="${going && !up ? 'runpause' : 'rungo'}">${going && !up ? 'Pause' : up ? 'Two more minutes' : left < b.minutes * 60 ? 'Carry on' : 'Start ' + b.minutes + ' min'}</button>
        <button class="btn quiet" style="flex:1" data-act="runreset">Reset</button></div>
    </div>
    ${b.note ? `<div class="drillwhy"><h4>Your note</h4><p>${esc(b.note)}</p></div>` : ''}
    ${d ? `${d.diagram ? diagramBlock(d.diagram, d.name, 'runpic', d.id, !p.runStill && !reducedMotion()) : ''}
      <h4>Coaching points</h4>${list(d.points)}
      <h4>Setup</h4><p>${esc(d.setup)}</p>
      <h4>Make it harder</h4>${list(d.harder)}
      <h4>Make it easier</h4>${list(d.easier)}` : '<p class="muted">This drill is no longer in the library; its name and your note are all the plan kept.</p>'}
    <div class="row" style="gap:8px">
      <button class="btn quiet" style="flex:1" data-act="runprev"${i === 0 ? ' disabled' : ''}>‹ Back</button>
      <button class="btn" style="flex:2" data-act="runnext">${last ? 'Finish' : 'Next: ' + esc((blockDrill(L, nextB) || nextB).name || 'drill')}</button></div>
  </div>`;
}
/* A new screen starts at its top: a drill's name is the first thing she
   needs, and the last one left the page scrolled to its bottom. */
const toTop = () => { try { if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); } catch (e) { } };

/* Called every second by the clock loop. Only the numbers change, so only the
   numbers are redrawn, except the moment it reaches zero. */
function tickRun() {
  const r = ui.view === 'practice' && ui.practice && ui.practice.run;
  if (!r || !r.endsAt) return;
  const left = Math.max(0, Math.round((r.endsAt - nowMs()) / 1000));
  if (left === 0) {
    if (!r.buzzed) { r.buzzed = true; try { if (navigator.vibrate) navigator.vibrate([300, 120, 300]); } catch (e) { } render(); }
    return;
  }
  const el = $('#runClock'); if (el) el.textContent = mmss(left);
}

/* --- settings: things about you and this device --- */
/* ================= training sessions ================= */
/* 1-1s and small groups that belong to no team. SESSIONS.md is the design;
   the shape of it, in the order the code below follows:

     training/{code}/sessions/{sid}      when, where, who runs it, spots, price
     training/{code}/booked/{sid}/{pid}  one player's place, and how it stands
     training/{code}/came/{sid}          the register
     training/{code}/fees/{sid}/{pid}    what was paid for one place
     training/{code}/pay/{uid}           what a coach is paid
     training/{code}/splans/{sid}        the drills
     workspaces/{code}/access/org/venues the club's fields and their permits

   Outside the workspace for the reasons practice plans are (every phone reads
   the whole workspace, and the connect-time read still replaces it), plus one
   of its own: a session belongs to no team, and every per-team rule keys on
   one. Fields are club settings, so they sit under access/org, where the rule
   already says admins write and the club reads. */
const LS_SESS = 'sm.sess.v1';
const LS_SESS_SEEN = 'sm.sessSeen';
const sessKey = () => LS_SESS + ':' + clubKey();
const SESS_BLANK = () => ({ sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, dirty: {}, refused: {} });
/* How many path segments down each kind's records sit: a session is one node,
   a booking is one per player per session, a register one per session. A merge
   walks to exactly this depth and no further, so a record is always taken or
   kept whole and never half of one with half of the other. */
const SESS_DEPTH = { sessions: 2, booked: 3, came: 2, fees: 3, pay: 2, splans: 2 };
const SESS_KIND = { one: '1-1', group: 'Group' };
const BOOK = { asked: 'Asked', in: 'Booked', wait: 'Waiting list', no: 'Not this time', out: 'Withdrew' };
const BOOK_ORDER = { asked: 0, in: 1, wait: 2, no: 3, out: 4 };
const PAY_HOW = { cash: 'Cash', card: 'Card', transfer: 'Bank transfer', waived: 'Waived', other: 'Other' };
const WANT_MAX = 280;
let sess = SESS_BLANK();
let sessSeq = 0;
let sessFor = null;               // clubKey|uid the listeners below belong to
let sessSubs = {};                // listened path -> unsubscribe
let sessTries = {};
const sessState = {};             // kind -> 'synced' | 'refused', as the database last answered
const sessLoaded = new Set();     // listened paths that have answered at least once

function loadSess() {
  sess = SESS_BLANK();
  try {
    const v = JSON.parse(localStorage.getItem(sessKey()) || 'null');
    if (v && typeof v === 'object') for (const k of Object.keys(sess)) if (v[k] && typeof v[k] === 'object') sess[k] = v[k];
  } catch (e) { }
}
function saveSess() { keepStored(sessKey(), JSON.stringify(sess)); paintSync(); }
const getDeep = (o, p) => p.split('/').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);

/* ---- who ---- */
const personName = u => (((acc().members || {})[u] || {}).name) || '';
function coachUids() {
  const out = new Set();
  for (const ta of Object.values(acc().teams || {})) for (const u of Object.keys((ta || {}).coaches || {})) out.add(u);
  return out;
}
const isCoachAny = uid => !!uid && coachUids().has(uid);
/* Families, coaches of any team and admins. A tracker is there to log a game,
   and has no child here to book. */
const canSessions = () => !gated() || isOwner() || (!!me && (isAdmin(me.uid) || isCoachAny(me.uid) || guardsAnyone()));
// who may offer a session at all, and gets the Fields, Fees and Hours tabs
const canOffer = () => !gated() || canAdmin() || (!!me && isCoachAny(me.uid));
/* The coach a session names runs it, while she is still a coach; an admin runs
   any. The same two clauses as the rule on booked/$sid. */
const canRun = s => !!s && (!gated() || canAdmin() || (!!me && s.coach === me.uid && isCoachAny(me.uid)));

/* ---- the sessions ---- */
/* Any coach may write a session, and the rules check its owner and its kind
   but not much else, so one with a cap of "lots" or a start of 1730 must not
   break the next phone that draws it. */
function normSess(s, id) {
  if (!s || typeof s !== 'object') return null;
  const str = v => (v == null ? '' : String(v));
  const kind = s.kind === 'one' ? 'one' : 'group';
  const ages = s.ages && typeof s.ages === 'object' ? Object.values(s.ages).map(Number) : null;
  const agesOk = ages && ages.length === 2 && ages.every(n => Number.isInteger(n) && n >= 4 && n <= 19) && ages[0] <= ages[1];
  return {
    ...s, id: str(s.id || id), kind, title: str(s.title).slice(0, 80), focus: str(s.focus).slice(0, 200), notes: str(s.notes).slice(0, 2000),
    coach: str(s.coach), coachName: personName(s.coach) || str(s.coachName) || 'Coach',
    date: okDay(s.date) ? s.date : '', start: hm(s.start), end: hm(s.end),
    field: str(s.field), place: str(s.place).slice(0, 120),
    cap: kind === 'one' ? 1 : clamp(Math.round(Number(s.cap)) || 6, 1, 60),
    ages: agesOk ? ages : null, price: Math.max(0, Math.round((Number(s.price) || 0) * 100) / 100), open: s.open === true,
    called: CALLED[s.called] ? s.called : '', series: s.series || null
  };
}
const sessAll = () => Object.entries(sess.sessions || {}).map(([id, s]) => normSess(s, id)).filter(s => s && s.date)
  .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start) || a.id.localeCompare(b.id));
const sessById = id => { const s = id ? (sess.sessions || {})[id] : null; return s ? normSess(s, id) : null; };
const sessTitle = s => s.title || (s.kind === 'one' ? '1-1 session' : 'Group session');
const sessMinutes = s => (s.start && s.end ? ((minOf(s.end) - minOf(s.start) + 1440) % 1440) || 60 : 60);
const sessPast = s => calPast({ kind: 'session', date: s.date, start: s.start, end: s.end, mins: sessMinutes(s) });
const sessSeries = s => (s.series ? sessAll().filter(x => x.series === s.series) : [s]);
const agesLabel = a => (a ? (a[0] === a[1] ? uLabel(a[0]) : `${uLabel(a[0])}–${uLabel(a[1])}`) : '');
/* An age range on a session is a guide for which families see it as open to
   them, not a wall: a team with no birth year fits everything. */
const fitsAges = (s, t) => { const u = teamUAge(t); return !s.ages || u == null || (Math.min(u, 19) >= s.ages[0] && Math.min(u, 19) <= s.ages[1]); };

function playerById(pid) {
  for (const t of teams()) { const p = (t.players || {})[pid]; if (p) return { t, p }; }
  return null;
}
const bookOf = (sid, pid) => { const b = ((sess.booked || {})[sid] || {})[pid]; return b && BOOK[b.st] ? b : null; };
const bookingsOf = sid => Object.entries((sess.booked || {})[sid] || {}).filter(([, b]) => b && BOOK[b.st])
  .map(([pid, b]) => ({ pid, b, st: b.st, want: String(b.want || ''), who: playerById(pid) }));
const nIn = sid => bookingsOf(sid).filter(x => x.st === 'in').length;
const spotsLeft = s => Math.max(0, s.cap - nIn(s.id));
const whoName = x => (x.who ? x.who.p.name : 'A player who has left');
const feeOf = (sid, pid) => { const f = ((sess.fees || {})[sid] || {})[pid]; return f && typeof f === 'object' ? f : null; };
const splanBlocks = sid => { const pl = (sess.splans || {})[sid]; const raw = pl ? (Array.isArray(pl.blocks) ? pl.blocks : Object.values(pl.blocks || {})) : []; return raw.filter(b => b && b.drill && b.drill.id); };
/* A booking as it is written: only the fields the rule lets a family write, so
   the family's own later write of the same booking can never be refused for
   carrying something the coach's copy had. */
const bookingVal = (b, st, extra = {}) => {
  const v = { tid: b.tid, st, by: (me && me.uid) || 'device', at: nowMs(), ...extra };
  const want = extra.want !== undefined ? extra.want : b.want;
  if (want) v.want = String(want).slice(0, WANT_MAX); else delete v.want;
  return v;
};

/* ---- fields ---- */
const fieldList = () => Object.values((acc().org || {}).venues || {}).filter(f => f && f.id && f.name)
  .sort((a, b) => String(a.name).localeCompare(String(b.name)));
const fieldById = id => (id && (((acc().org || {}).venues || {})[id])) || null;
const normPlace = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* A team's venue is free text, so "Lakeside Park, field 2" is at "Lakeside
   Park" if it contains the name, ignoring case and punctuation; the longest
   name that fits wins, so "Lakeside Park North" is not "Lakeside Park". */
function fieldOfText(text) {
  const n = ' ' + normPlace(text) + ' ';
  if (!n.trim()) return null;
  let best = null;
  for (const f of fieldList()) {
    const fn = normPlace(f.name);
    if (fn && n.includes(' ' + fn + ' ') && (!best || fn.length > normPlace(best.name).length)) best = f;
  }
  return best;
}
const sessField = s => fieldById(s.field) || fieldOfText(s.place);
const sessPlace = s => { const f = fieldById(s.field); return f ? f.name + (s.place ? ', ' + s.place : '') : s.place; };
const sessAddress = s => { const f = sessField(s); return (f && f.address) || sessPlace(s); };
function permitsOf(f) {
  return Object.entries((f && f.permits) || {}).map(([id, p]) => p && typeof p === 'object' ? {
    id: p.id || id, days: [].concat(p.days == null ? [] : Object.values(typeof p.days === 'object' ? p.days : [p.days])).map(Number).filter(n => n >= 0 && n <= 6),
    start: hm(p.start), end: hm(p.end), from: okDay(p.from) ? p.from : '', until: okDay(p.until) ? p.until : '',
    ref: String(p.ref || ''), note: String(p.note || '')
  } : null).filter(Boolean);
}
/* A permit with no hours covers the whole day it names. */
function permitCovers(p, date, a, b) {
  if (p.from && date < p.from) return false;
  if (p.until && date > p.until) return false;
  if (!p.days.includes(weekdayOf(date))) return false;
  if (!p.start || !p.end) return true;
  return minOf(p.start) <= a && b <= minOf(p.end);
}
function permitText(p) {
  const days = p.days.length === 7 ? 'Every day' : [...p.days].sort().map(i => WEEKDAYS[i]).join(', ') || 'No days';
  const hours = p.start && p.end ? ` ${niceTime(p.start)}–${niceTime(p.end)}` : ' all day';
  const span = p.from || p.until ? ` · ${p.from ? dayLabel(p.from) : 'now'} to ${p.until ? dayLabel(p.until) : 'open-ended'}` : '';
  return days + hours + span + (p.ref ? ` · ${p.ref}` : '');
}

/* ---- money ---- */
const moneySign = () => String((acc().org || {}).money || '$').slice(0, 3);
const fmtMoney = n => { n = Math.round((Number(n) || 0) * 100) / 100; return moneySign() + (Number.isInteger(n) ? String(n) : n.toFixed(2)); };

/* ---- the store: kept here first, sent one record at a time, merged on read ---- */
/* Every change goes through here, as a practice plan's does: kept on the phone,
   marked dirty with the version sent, then sent at the depth its rule sits at.
   A family's write is taken back off the screen if the database refuses it
   (`undo`), because a parent who taps Ask and sees it stick when it did not is
   worse off than one with no button. A coach's refused write stays on her
   phone, marked, and says so, the way a refused practice plan does. */
function sessPut(path, value, undo) {
  const prev = getDeep(sess, path);
  const v = value == null ? null : JSON.parse(JSON.stringify(value));   // the database refuses undefined anywhere in a write
  if (v == null) delDeep(sess, path); else setDeep(sess, path, v);
  sess.dirty[path] = nowMs() + '.' + (++sessSeq);
  saveSess();
  sessSend(path, undo ? { prev: prev === undefined ? null : clone(prev), msg: undo } : null);
}
function sessSend(path, undo) {
  const code = wsCode(), mark = sess.dirty[path];
  if (!fb || !code || mark === undefined) return;
  const [kind, id] = path.split('/');
  /* A session's bookings, register, fees and plan go before the session does:
     the rule that lets its coach clear them reads the session to find her, so
     once the session is gone they are nobody's to delete. One connection
     applies writes in the order they were made. */
  if (kind === 'sessions' && getDeep(sess, path) === undefined)
    for (const k of ['booked', 'came', 'fees', 'splans']) if (sess.dirty[k + '/' + id] !== undefined) sessSend(k + '/' + id);
  const v = getDeep(sess, path);
  rootSet(`training/${code}/${path}`, v === undefined ? null : v).then(() => {
    // only the version that was sent is clean; a change made since is still owed
    if (sess.dirty[path] === mark) { delete sess.dirty[path]; delete sess.refused[path]; saveSess(); }
    if (sessState[kind] !== 'synced') { sessState[kind] = 'synced'; render(); }
  }, e => {
    if (!/permission|denied/i.test((e && (e.code || e.message)) || '')) return;
    if (undo) {
      if (sess.dirty[path] === mark) delete sess.dirty[path];
      if (undo.prev == null) delDeep(sess, path); else setDeep(sess, path, undo.prev);
      saveSess(); render(); toast(undo.msg); return;
    }
    // marked per record, so the list of what is owed can say which ones the club said no to
    sessState[kind] = 'refused'; sess.refused[path] = 1; saveSess(); render();
  });
}

function sessLeaves(v, prefix, left, out) {
  if (left <= 0) { if (v != null) out[prefix] = v; return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) sessLeaves(x, prefix + '/' + k, left - 1, out);
  return out;
}
// a record is held while it, or anything above it (a whole session's bookings, cleared), is still owed to the club
const sessHeld = p => { const s = p.split('/'); for (let i = s.length; i > 0; i--) if (sess.dirty[s.slice(0, i).join('/')] !== undefined) return true; return false; };
/* Merge, never replace. The club's copy wins for every record this phone owes
   nothing on; a record with something owed keeps this phone's version, and one
   that was clean here and is gone from the club was deleted somewhere else. On
   the first answer after attaching, whatever is still owed under this path is
   sent again, which is how a session made offline and then reloaded still
   reaches the club. */
function sessMerge(path, remote, resend) {
  const segs = path.split('/'), left = (SESS_DEPTH[segs[0]] || 2) - segs.length;
  const loc = sessLeaves(getDeep(sess, path), path, left, {}), rem = sessLeaves(remote, path, left, {});
  for (const p of new Set([...Object.keys(loc), ...Object.keys(rem)])) {
    if (sessHeld(p)) continue;
    if (rem[p] !== undefined) setDeep(sess, p, rem[p]); else delDeep(sess, p);
  }
  saveSess();
  if (resend) for (const k of Object.keys(sess.dirty)) if (k === path || k.startsWith(path + '/')) sessSend(k);
}

/* What this account listens to. Sessions, bookings and the register are the
   club's, like rsvp and the team registers; fees are money, so an admin hears
   all of them, a coach her own sessions', and a family only her own child's
   places. A session's drills are read when its sheet is open. */
/* Not before the club has been read: until then a phone cannot tell a tracker
   from a coach, and a club with no admin yet looks open to everyone. */
const sessOn = () => !!(rtdb && fb && me && wsCode() && wsRead && !needsSignIn());
function sessWanted() {
  if (!canSessions()) return [];
  const want = ['sessions', 'booked', 'came'];
  const all = sessAll();
  if (isAdmin(me.uid)) want.push('fees', 'pay');
  else {
    for (const s of all) if (s.coach === me.uid) want.push('fees/' + s.id);
    if (isCoachAny(me.uid)) want.push('pay/' + me.uid);
    for (const { p } of myPlayers()) for (const s of all) if (bookOf(s.id, p.id)) want.push('fees/' + s.id + '/' + p.id);
  }
  const open = sessById(sessUi().open);
  if (open && canRun(open)) want.push('splans/' + open.id);
  return [...new Set(want)];
}
/* Run from render(), as watchMessages() is, so a role granted or a session
   added while the page is open changes what is listened to. A different
   account or club starts over. */
function watchSess() {
  const key = sessOn() ? clubKey() + '|' + me.uid : null;
  if (key !== sessFor) {
    for (const off of Object.values(sessSubs)) { try { off(); } catch (e) { } }
    sessSubs = {}; sessTries = {}; sessLoaded.clear();
    for (const k of Object.keys(sessState)) delete sessState[k];
    sessFor = key;
  }
  if (!key) return;
  const want = new Set(sessWanted());
  for (const p of Object.keys(sessSubs)) if (!want.has(p)) { try { sessSubs[p](); } catch (e) { } delete sessSubs[p]; }
  const { db, mod } = rtdb, code = wsCode();
  for (const p of want) {
    if (sessSubs[p]) continue;
    // claimed before asking: a listener that answers at once from its cache renders, and render() comes back here
    let off = null, first = true;
    sessSubs[p] = () => { if (off) off(); };
    off = mod.onValue(mod.ref(db, `training/${code}/${p}`), s => {
      if (sessFor !== key) return;
      sessState[p.split('/')[0]] = 'synced';
      sessMerge(p, s.val(), first); first = false;
      sessLoaded.add(p);
      sessNews();
      render();
    }, err => {
      if (!/permission|denied/i.test((err && err.code) || '')) return;
      /* One retry, for the reason watchTrain() has one: in the first second
         after boot a refusal is as likely to be the sign-in not having reached
         the database yet as it is the rules. */
      const n = sessTries[p] = (sessTries[p] || 0) + 1;
      if (n < 2) { setTimeout(() => { if (sessFor === key) { delete sessSubs[p]; watchSess(); } }, 1500); return; }
      sessState[p.split('/')[0]] = 'refused'; render();
    });
    if (typeof off !== 'function') off = null;
  }
}

/* What changed since this phone last looked, said once. A family hears about
   her own child's place (confirmed, waitlisted, turned down, taken off) and a
   session she is in being moved or called off; the coach who runs a session
   hears about families asking and withdrawing. Nobody hears about their own
   taps, and the first read on a phone tells nobody anything: what is already
   there is not news. */
function sessNews() {
  if (!me || !sessFor || !sessLoaded.has('sessions') || !sessLoaded.has('booked')) return;
  const lsk = LS_SESS_SEEN + ':' + clubKey() + ':' + me.uid;
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(lsk) || 'null'); } catch (e) { }
  const first = !seen || typeof seen !== 'object';
  const now = {}, news = [];
  const kids = myPlayers();
  for (const s of sessAll()) {
    const when = `${dayLabel(s.date)}${s.start ? ' ' + niceTime(s.start) : ''}`;
    for (const { p } of kids) {
      const b = bookOf(s.id, p.id); if (!b) continue;
      const k = 'f/' + s.id + '/' + p.id, sig = [b.st, s.date, s.start, s.called].join('|');
      now[k] = sig;
      if (first || seen[k] === sig || sessPast(s)) continue;
      const [ost, odate, ostart, ocalled] = String(seen[k] || '').split('|');
      const going = b.st === 'in' || b.st === 'wait' || b.st === 'asked';
      if (s.called && s.called !== ocalled && seen[k] && going) news.push([`${CALLED[s.called]}: ${sessTitle(s)}`, `${firstName(p)} · ${when}`]);
      else if (seen[k] && (odate !== s.date || ostart !== s.start) && going) news.push([`Moved: ${sessTitle(s)}`, `${firstName(p)} · now ${when}`]);
      else if (ost !== b.st && b.by !== me.uid && b.st !== 'asked') news.push([`${firstName(p)}: ${BOOK[b.st] === 'Withdrew' ? 'taken off' : BOOK[b.st].toLowerCase()}`, `${sessTitle(s)} with ${s.coachName} · ${when}`]);
    }
    if (s.coach !== me.uid) continue;
    for (const x of bookingsOf(s.id)) {
      const k = 'r/' + s.id + '/' + x.pid;
      now[k] = x.st;
      if (first || seen[k] === x.st || x.b.by === me.uid || sessPast(s)) continue;
      if (x.st === 'asked') news.push(['Asked for a spot', `${whoName(x)} · ${sessTitle(s)} · ${when}`]);
      else if (x.st === 'out') news.push(['Withdrew', `${whoName(x)} · ${sessTitle(s)} · ${when}`]);
    }
  }
  try { localStorage.setItem(lsk, JSON.stringify(now)); } catch (e) { }
  for (const [title, body] of news.slice(0, 3)) ping(title, body, 'minutes-sess-' + title + body);
  if (news.length > 3) ping('Training sessions', `${news.length - 3} more changes`, 'minutes-sess-more');
}

/* ---- clashes ---- */
/* Everything with a time on one day, across the club: every team's practices,
   games and events, and every session. A team entry ties up its coaches and
   its whole squad; a session its coach and the players booked or asking. */
function busyItems(date) {
  const out = [];
  const span = (start, end, mins) => { const a = minOf(start); let b = end ? minOf(end) : a + (mins || 60); if (b <= a) b += 1440; return [a, b]; };
  for (const it of calItems(teams().map(t => t.id))) {
    if (it.date !== date || it.called || !it.start) continue;
    const [a, b] = span(it.start, it.end, it.mins);
    const f = fieldOfText(it.venue), t = state.teams[it.tid] || {};
    out.push({ key: it.key, kind: it.kind, label: `${t.name || 'A team'}: ${it.title}`, a, b, field: f ? f.id : null, coaches: Object.keys(teamAccess(it.tid).coaches || {}), tid: it.tid, pids: null });
  }
  for (const s of sessAll()) {
    if (s.date !== date || s.called || !s.start) continue;
    const [a, b] = span(s.start, s.end, 60);
    const f = sessField(s);
    out.push({ key: 's:' + s.id, kind: 'session', label: `${sessTitle(s)} (${s.coachName})`, a, b, field: f ? f.id : null, coaches: [s.coach], tid: null,
      pids: bookingsOf(s.id).filter(x => x.st === 'in' || x.st === 'asked').map(x => x.pid) });
  }
  return out;
}
const timeOf = x => `${niceTime(pad2(Math.floor(x.a / 60) % 24) + ':' + pad2(x.a % 60))}`;
/* What a session collides with, in words for its coach and the admins. Read
   only, worked out from what this phone already holds; nothing is stored. */
function sessClashes(s) {
  if (!s || !okDay(s.date) || !s.start || s.called) return [];
  const out = [];
  const a = minOf(s.start); let b = s.end ? minOf(s.end) : a + 60; if (b <= a) b += 1440;
  const others = busyItems(s.date).filter(x => x.key !== 's:' + s.id && x.a < b && a < x.b);
  const list = xs => xs.map(x => `${x.label} at ${timeOf(x)}`).join('; ');
  const f = sessField(s);
  if (f) {
    const pm = permitsOf(f);
    if (pm.length && !pm.some(p => permitCovers(p, s.date, a, b))) out.push(`Outside the club's permit for ${f.name}: ${pm.map(permitText).join('; ')}`);
    const pitches = Math.max(1, Math.round(Number(f.pitches)) || 1);
    const here = others.filter(x => x.field === f.id);
    if (here.length + 1 > pitches) out.push(`${f.name} has ${pitches} pitch${pitches === 1 ? '' : 'es'}, and this is on top of ${list(here)}`);
  }
  const coachBusy = others.filter(x => x.coaches.includes(s.coach));
  if (coachBusy.length) out.push(`${s.coachName} is also due at ${list(coachBusy)}`);
  for (const x of bookingsOf(s.id)) {
    if (x.st !== 'in' && x.st !== 'asked') continue;
    const tid = x.b.tid || (x.who && x.who.t.id);
    const busy = others.filter(o => (o.pids ? o.pids.includes(x.pid) : o.tid === tid));
    if (busy.length) out.push(`${whoName(x)} has ${list(busy)}`);
  }
  return out;
}
/* Everything at one field over the coming days, each with what is wrong with
   it: outside the permit, or more at once than the field has pitches. Team
   entries count too, because a field double-booked by a team practice and a
   1-1 is double-booked whoever made which. */
function fieldDays(f, from, days = 14) {
  const pm = permitsOf(f), pitches = Math.max(1, Math.round(Number(f.pitches)) || 1);
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const here = busyItems(date).filter(x => x.field === f.id).sort((x, y) => x.a - y.a);
    for (const x of here) {
      const flags = [];
      if (pm.length && !pm.some(p => permitCovers(p, date, x.a, x.b))) flags.push('outside the permit');
      const n = here.filter(o => o.a < x.b && x.a < o.b).length;
      if (n > pitches) flags.push(`${n} at once on ${pitches} pitch${pitches === 1 ? '' : 'es'}`);
      out.push({ date, x, flags });
    }
  }
  return out;
}
/* Venues typed on the calendar that match no field yet, most used first: the
   admin's quickest way to a list of fields is the one the coaches already
   typed. */
function looseVenues() {
  const n = {};
  const add = v => { const k = normPlace(v); if (!k || fieldOfText(v)) return; (n[k] = n[k] || { text: String(v).trim(), c: 0 }).c++; };
  for (const it of calItems(teams().map(t => t.id))) add(it.venue);
  for (const s of sessAll()) if (!s.field) add(s.place);
  return Object.values(n).sort((a, b) => b.c - a.c).slice(0, 6).map(x => x.text);
}

/* ---- fees and hours ---- */
/* A place owes the session's price once it is booked and the session is not
   called off. A withdrawal owes nothing; a club that charges late withdrawals
   marks that fee by hand, and one letting a family off marks it waived. */
function feeRows() {
  const out = [];
  for (const s of sessAll()) {
    if (!s.price || s.called || !canRun(s)) continue;
    for (const x of bookingsOf(s.id)) if (x.st === 'in') out.push({ s, x, fee: feeOf(s.id, x.pid) });
  }
  return out;
}
const feesKnown = (sid, pid) => !fb || sessLoaded.has('fees') || sessLoaded.has('fees/' + sid) || (!!pid && sessLoaded.has('fees/' + sid + '/' + pid));
/* What a family owes, for her own children only, and only where this phone
   has heard from the club: a fee it has not been allowed to read yet is not
   the same as one nobody paid. */
function familyOwed() {
  const rows = [];
  for (const { p } of myPlayers()) for (const s of sessAll()) {
    if (!s.price || s.called) continue;
    const b = bookOf(s.id, p.id);
    if (b && b.st === 'in' && !feeOf(s.id, p.id) && feesKnown(s.id, p.id)) rows.push({ s, p });
  }
  return { rows, total: rows.reduce((n, r) => n + r.s.price, 0) };
}
const payOf = uid => { const p = (sess.pay || {})[uid]; return p && Number(p.rate) >= 0 && (p.per === 'hour' || p.per === 'session') ? { rate: Number(p.rate), per: p.per } : null; };
/* A coach's month: the sessions she ran (over, not called off), start to end.
   Team practices are not counted: the app knows a team's coaches, not which
   of them ran Tuesday. */
function hoursFor(month) {
  const by = {};
  for (const s of sessAll()) {
    if (!s.date.startsWith(month) || s.called || !sessPast(s)) continue;
    const h = by[s.coach] = by[s.coach] || { uid: s.coach, name: s.coachName, n: 0, mins: 0, one: 0, group: 0, players: new Set(), list: [] };
    h.n++; h.mins += sessMinutes(s); h[s.kind]++; h.list.push(s);
    for (const x of bookingsOf(s.id)) if (x.st === 'in') h.players.add(x.pid);
  }
  return Object.values(by).sort((a, b) => b.mins - a.mins || a.name.localeCompare(b.name));
}
const payFor = h => { const r = payOf(h.uid); return r ? (r.per === 'hour' ? r.rate * h.mins / 60 : r.rate * h.n) : null; };
const hoursWords = m => `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`;
const monthLabel = ym => { const [y, mo] = ym.split('-').map(Number); return `${MONTHS_LONG[mo - 1]} ${y}`; };
const addMonths = (ym, n) => { const [y, mo] = ym.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };

/* ---- on the player's record, and on the calendar ---- */
/* Extra sessions count as a practice's register does: only once taken, only
   for something that happened, and only for a player who was booked. */
function sessAttendance(pid) {
  const r = { came: 0, of: 0 };
  for (const s of sessAll()) {
    if (s.called || !sessPast(s)) continue;
    const b = bookOf(s.id, pid); if (!b || b.st !== 'in') continue;
    const c = ((sess.came || {})[s.id] || {})[pid];
    if (typeof c !== 'boolean') continue;
    r.of++; if (c) r.came++;
  }
  return r;
}
/* A team's players' sessions, for that team's calendar: its coaches see every
   one of their players', a family only her own child's. Never on the share
   link or the feed — a 1-1 is a child, a time and a place. */
function sessCalItems(tids) {
  const out = [], kids = new Set(myPlayers().map(x => x.p.id));
  for (const s of sessAll()) {
    for (const tid of tids) {
      const xs = bookingsOf(s.id).filter(x => (x.st === 'in' || x.st === 'asked' || x.st === 'wait') && (x.b.tid || (x.who && x.who.t.id)) === tid);
      const mine = canEditTeam(tid) ? xs : xs.filter(x => kids.has(x.pid));
      if (!mine.length) continue;
      out.push({
        key: 's:' + s.id, kind: 'session', tid, id: s.id, date: s.date, start: s.start, end: s.end, mins: 0,
        title: `${sessTitle(s)} with ${s.coachName}`, venue: sessPlace(s), called: s.called, public: false, who: mine,
        firm: mine.some(x => x.st === 'in')
      });
      break;
    }
  }
  return out;
}
function sessIcs(s) {
  const base = location.origin + location.pathname;
  return {
    uid: 'sess-' + s.id, date: s.date, start: s.start, end: s.end, mins: sessMinutes(s),
    title: `${sessTitle(s)} with ${s.coachName}`, venue: sessAddress(s),
    desc: [s.focus ? 'Working on: ' + s.focus : '', s.notes].filter(Boolean).join('\n'), called: s.called,
    url: base + '#/training/' + s.id
  };
}

/* ---- screens ---- */
const SESS_TABS = { list: 'Sessions', fields: 'Fields', fees: 'Fees', hours: 'Hours' };
function sessUi() {
  if (!ui.sess || typeof ui.sess !== 'object') ui.sess = {};
  const u = ui.sess;
  if (!SESS_TABS[u.tab]) u.tab = 'list';
  if (!['mine', 'all'].includes(u.scope)) u.scope = canAdmin() ? 'all' : 'mine';
  if (!/^\d{4}-\d{2}$/.test(u.month || '')) u.month = todayStr().slice(0, 7);
  return u;
}

/* Saved here only, and why, in as few words as will do. */
function sessNote() {
  if (!fbConfig().apiKey) return '';
  if (Object.values(sessState).includes('refused')) return `<div class="rolebar warn">Some of this is on this phone only. The database refused it: the club's rules may not include training sessions yet (README, <b>The database rules</b>).</div>`;
  if (!me) return `<div class="rolebar">Sign in and sessions are kept with the club, not just on this phone.</div>`;
  if (Object.keys(sess.dirty).length && !online) return `<div class="rolebar">Offline. Changes are on this phone and go to the club when the signal's back.</div>`;
  return '';
}

/* One line for the club page's card: what needs doing first. */
function sessClubLine() {
  const ahead = sessAll().filter(s => !sessPast(s) && !s.called);
  if (canOffer()) {
    const run = ahead.filter(canRun);
    const asks = run.reduce((n, s) => n + bookingsOf(s.id).filter(x => x.st === 'asked').length, 0);
    return [`${run.length} coming up`, asks ? `${asks} asking for a spot` : ''].filter(Boolean).join(' · ') + ' · 1-1s and small groups, any team';
  }
  const kids = myPlayers();
  const booked = ahead.filter(s => kids.some(({ p }) => (bookOf(s.id, p.id) || {}).st === 'in')).length;
  const open = ahead.filter(s => s.open && kids.some(({ t, p }) => fitsAges(s, t) && !bookOf(s.id, p.id))).length;
  return [booked ? `${booked} booked` : '', open ? `${open} open to ask for` : ''].filter(Boolean).join(' · ') || '1-1s and small groups with the club’s coaches';
}

function viewSessions() {
  if (!canSessions()) return `<div class="empty"><strong>Training sessions are for coaches, admins and families</strong>Your account has none of those in this club yet.</div>`;
  const u = sessUi(), staff = canOffer();
  if (!staff) u.tab = 'list';
  if (u.go) { const id = u.go; u.go = null; setTimeout(() => { if (sessById(id)) sheetSess(id); }, 0); }
  const tabs = staff ? `<div class="chips">${Object.entries(SESS_TABS).map(([k, l]) =>
    `<button class="chip" type="button" data-act="sesstab" data-k="${k}" aria-pressed="${u.tab === k}">${l}</button>`).join('')}</div>` : '';
  const body = u.tab === 'fields' ? sessFieldsView() : u.tab === 'fees' ? sessFeesView() : u.tab === 'hours' ? sessHoursView() : sessListView();
  return `<div class="stack"><h2>Training sessions</h2>${sessNote()}${tabs}${body}</div>`;
}

/* One session in a list. A family's row says how her own children stand; the
   coach's says how full it is and who is asking. */
function sessRow(s, fam) {
  const xs = bookingsOf(s.id), n = xs.filter(x => x.st === 'in').length, asks = xs.filter(x => x.st === 'asked').length;
  const sub = [sessPlace(s), 'with ' + s.coachName];
  if (fam) {
    for (const { p } of myPlayers()) { const b = bookOf(s.id, p.id); if (b) sub.push(`${firstName(p)}: ${BOOK[b.st].toLowerCase()}`); }
    if (s.open && !s.called && !sessPast(s) && s.kind === 'group') sub.push(spotsLeft(s) ? `${spotsLeft(s)} spot${spotsLeft(s) === 1 ? '' : 's'} left` : 'full');
  } else {
    sub.push(s.kind === 'one' ? (n ? xs.filter(x => x.st === 'in').map(whoName).join(', ') : 'free') : `${n} of ${s.cap} booked`);
    if (asks) sub.push(`${asks} asking`);
  }
  if (s.price) sub.push(fmtMoney(s.price));
  const right = s.called ? `<span class="tag off">${CALLED[s.called]}</span>` : `<span class="tag session">${SESS_KIND[s.kind]}</span>`;
  return `<button class="prow calrow" type="button" data-act="sessopen" data-id="${esc(s.id)}" data-called="${s.called ? 1 : 0}">
    <span class="caltime">${s.start ? niceTime(s.start) : 'TBC'}</span>
    <span style="min-width:0"><span class="pname">${esc(sessTitle(s))}</span><span class="psub">${esc(sub.filter(Boolean).join(' · '))}</span></span>
    ${right}</button>`;
}
function sessDays(list, fam) {
  let out = '', last = null;
  for (const s of list) {
    if (s.date !== last) { const rel = relDay(s.date); out += `<p class="calhead">${esc(dayLabel(s.date))}${rel ? ` <span>· ${rel}</span>` : ''}</p>`; last = s.date; }
    out += sessRow(s, fam);
  }
  return `<div class="plist">${out}</div>`;
}

function sessListView() {
  const u = sessUi(), staff = canOffer(), all = sessAll();
  let out = '';
  if (staff) {
    const pool = u.scope === 'all' || !me ? all : all.filter(s => s.coach === me.uid);
    const ahead = pool.filter(s => !sessPast(s)), past = pool.filter(sessPast).reverse();
    const asks = all.filter(s => !sessPast(s) && !s.called && canRun(s))
      .flatMap(s => bookingsOf(s.id).filter(x => x.st === 'asked').map(x => ({ s, x })));
    out += `<div class="spread"><div class="chips">
        <button class="chip" type="button" data-act="sessscope" data-v="mine" aria-pressed="${u.scope === 'mine'}">Mine</button>
        <button class="chip" type="button" data-act="sessscope" data-v="all" aria-pressed="${u.scope === 'all'}">Everyone's</button></div>
      <button class="btn sm" data-act="sessnew">New session</button></div>
    ${asks.length ? `<div class="card"><h2 style="margin-bottom:0">Asking for a spot</h2><div class="plist">${asks.map(({ s, x }) =>
      `<button class="prow" type="button" data-act="sessopen" data-id="${esc(s.id)}" style="grid-template-columns:1fr auto">
        <span><span class="pname">${esc(whoName(x))}${x.who ? ` <span class="muted">${teamLabel(x.who.t)}</span>` : ''}</span>
          <span class="psub">${esc([sessTitle(s), dayLabel(s.date) + (s.start ? ' ' + niceTime(s.start) : ''), x.want ? 'wants: ' + x.want : ''].filter(Boolean).join(' · '))}</span></span>
        <span class="tag wait">Answer</span></button>`).join('')}</div></div>` : ''}
    <div class="card"><h2 style="margin-bottom:0">Coming up</h2>
      ${ahead.length ? sessDays(ahead, false) : `<p class="muted" style="margin-bottom:0">${u.scope === 'mine' ? 'Nothing of yours yet.' : 'Nothing yet.'} <b>New session</b> offers a 1-1 or a small group to players from any team; book them yourself, or leave it open for families to ask.</p>`}</div>
    ${past.length ? `<button class="btn quiet wide" data-act="sesspast">${u.past ? 'Hide' : 'Show'} earlier sessions (${past.length})</button>
      ${u.past ? `<div class="card">${sessDays(past.slice(0, 60), false)}</div>` : ''}` : ''}`;
  }
  if (guardsAnyone()) out += familySessions(staff);
  return out;
}

/* A family's one list: what she owes, her children's sessions, then the open
   ones that suit their ages. Never another child's name. */
function familySessions(staff) {
  const kids = myPlayers(); if (!kids.length) return '';
  const all = sessAll();
  const hers = s => kids.some(({ p }) => { const b = bookOf(s.id, p.id); return b && b.st !== 'out'; });
  const ahead = all.filter(s => !sessPast(s) && hers(s));
  const done = all.filter(s => sessPast(s) && kids.some(({ p }) => (bookOf(s.id, p.id) || {}).st === 'in')).reverse();
  const open = all.filter(s => s.open && !s.called && !sessPast(s) && kids.some(({ t, p }) => fitsAges(s, t) && (!bookOf(s.id, p.id) || bookOf(s.id, p.id).st === 'out')));
  const owed = familyOwed();
  return `${staff ? '<h2>Your children</h2>' : ''}
    ${owed.rows.length ? `<div class="card"><div class="spread"><h2 style="margin:0">To pay</h2><b>${esc(fmtMoney(owed.total))}</b></div>
      <div class="plist">${owed.rows.map(r => `<button class="prow" type="button" data-act="sessopen" data-id="${esc(r.s.id)}" style="grid-template-columns:1fr auto">
        <span><span class="pname">${esc(firstName(r.p))} · ${esc(sessTitle(r.s))}</span><span class="psub">${esc(dayLabel(r.s.date))} · with ${esc(r.s.coachName)}</span></span>
        <span class="pmins">${esc(fmtMoney(r.s.price))}</span></button>`).join('')}</div>
      <p class="muted" style="margin-bottom:0">Pay the coach or the club the way you usually do; they mark it paid here.</p></div>` : ''}
    <div class="card"><h2 style="margin-bottom:0">Booked and asked for</h2>
      ${ahead.length ? sessDays(ahead, true) : '<p class="muted" style="margin-bottom:0">Nothing yet. Ask for a spot in an open session below, or a coach books one for you.</p>'}</div>
    <div class="card"><h2 style="margin-bottom:0">Open to ask for</h2>
      ${open.length ? sessDays(open, true) : `<p class="muted" style="margin-bottom:0">No open sessions for ${kids.length > 1 ? 'your children’s ages' : esc(firstName(kids[0].p)) + '’s age'} right now.</p>`}</div>
    ${done.length ? `<div class="card"><h2 style="margin-bottom:0">Earlier</h2>${sessDays(done.slice(0, 30), true)}</div>` : ''}`;
}

/* ---- one session ---- */
function sheetSess(id) {
  const s = sessById(id);
  if (!s) { closeSheet(); toast('That session is not on this phone any more'); return; }
  sessUi().open = id;
  const run = canRun(s), I = ICS();
  const span = s.start ? niceTime(s.start) + (s.end ? '–' + niceTime(s.end) : '') : 'time to be confirmed';
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const f = sessField(s);
  const xs = bookingsOf(s.id);
  const n = xs.filter(x => x.st === 'in').length, asks = xs.filter(x => x.st === 'asked').length, waits = xs.filter(x => x.st === 'wait').length;
  const later = s.series ? sessSeries(s).filter(x => x.date > s.date).length : 0;
  const clashes = run ? sessClashes(s) : [];
  const anyFee = xs.some(x => feeOf(s.id, x.pid));
  openSheet(`<h3>${esc(sessTitle(s))}</h3>
    ${s.called ? `<div class="warn alert" style="margin-bottom:10px"><b>${CALLED[s.called]}.</b></div>` : ''}
    <p class="muted" style="margin-top:0">${SESS_KIND[s.kind]} · with ${esc(s.coachName)}${s.ages ? ' · ' + agesLabel(s.ages) : ''}${run ? (s.open ? ' · families can ask' : ' · the coach books it') : ''}</p>
    <dl class="facts">
      ${row('When', esc(dayLabel(s.date)) + ' · ' + esc(span))}
      ${row('Where', esc(sessPlace(s) || 'To be confirmed') + (f ? ` · <button class="textbtn" data-act="fieldopen" data-id="${esc(f.id)}">about this field</button>` : ''))}
      ${row('Working on', esc(s.focus))}
      ${row('Price', s.price ? esc(fmtMoney(s.price)) : '')}
      ${row('Spots', s.kind === 'group' ? `${n} of ${s.cap} booked${asks ? ` · ${asks} asking` : ''}${waits ? ` · ${waits} waiting` : ''}` : '')}
      ${row('Notes', esc(s.notes).replace(/\n/g, '<br>'))}
      ${later ? row('Repeats', `Weekly · ${later} more after this`) : ''}
    </dl>
    ${clashes.length ? `<div class="card planwarn">${clashes.map(c => `<p>${esc(c)}</p>`).join('')}</div>` : ''}
    ${sessFamilyBlock(s)}
    ${run ? sessPlayersBlock(s) + sessRegisterBlock(s) + sessFeesBlock(s) + sessDrillsBlock(s) : ''}
    ${s.date ? `<div class="row wrap" style="margin-bottom:10px">
      ${sessAddress(s) && I ? `<a class="btn quiet sm" href="${esc(I.mapLink(sessAddress(s)))}" target="_blank" rel="noopener">Directions</a>` : ''}
      ${I ? `<a class="btn quiet sm" href="${esc(I.googleLink(sessIcs(s)))}" target="_blank" rel="noopener">Google Calendar</a>` : ''}
      <button class="btn quiet sm" data-act="sessics" data-id="${esc(s.id)}">Apple or Outlook</button></div>` : ''}
    ${run ? `<button class="btn quiet wide" data-act="sesstell" data-id="${esc(s.id)}" style="margin-bottom:8px">Tell the families</button>
      <button class="btn quiet wide" data-act="sessedit" data-id="${esc(s.id)}" style="margin-bottom:8px">Edit</button>
      <button class="btn quiet wide" data-act="sesscall" data-id="${esc(s.id)}" style="margin-bottom:8px">${s.called ? 'It is back on' : 'Call it off'}</button>
      ${anyFee ? '' : `<button class="btn danger wide" data-act="sessdel" data-id="${esc(s.id)}">Delete</button>`}` : ''}`);
}

/* The family's part of a session's sheet: each of her children, and what she
   can do about each — ask, with what she wants to work on, or withdraw. */
function sessFamilyBlock(s) {
  const kids = myPlayers(); if (!kids.length) return '';
  const over = sessPast(s) || !!s.called;
  const rows = kids.map(({ t, p }) => {
    const b = bookOf(s.id, p.id), name = esc(firstName(p));
    if (b && b.st !== 'out') {
      const fee = s.price && b.st === 'in' ? (feeOf(s.id, p.id) ? ' · paid' : feesKnown(s.id, p.id) ? ` · ${esc(fmtMoney(s.price))} to pay` : '') : '';
      return `<div class="rsvprow"><span><b>${name}</b><span class="rowsub">${esc(BOOK[b.st])}${fee}${b.want ? ' · wants: ' + esc(b.want) : ''}</span></span>
        ${!over && b.st !== 'no' ? `<button class="btn quiet sm" data-act="sesswithdraw" data-id="${esc(s.id)}" data-pid="${esc(p.id)}">${b.st === 'in' ? 'Can’t make it' : 'Withdraw'}</button>` : ''}</div>`;
    }
    if (over || !s.open || !fitsAges(s, t)) return b ? `<div class="rsvprow"><span><b>${name}</b><span class="rowsub">Withdrew</span></span></div>` : '';
    const full = spotsLeft(s) === 0;
    return `<div style="margin:8px 0 12px"><p class="lbl">${full ? `Full — ask for ${name} to go on the waiting list` : `Ask for a spot for ${name}`}</p>
      <textarea id="sessWant_${esc(p.id)}" rows="2" maxlength="${WANT_MAX}" placeholder="What she wants to work on: weak foot, crossing, a drill she liked"></textarea>
      <button class="btn wide" data-act="sessask" data-id="${esc(s.id)}" data-pid="${esc(p.id)}" style="margin-top:6px">${full ? 'Ask for the waiting list' : 'Ask'}</button></div>`;
  }).filter(Boolean);
  if (!rows.length) return '';
  return `<div class="rsvpbox"><p class="lbl">${kids.length > 1 ? 'Your children' : 'Your child'}</p>${rows.join('')}
    ${s.open && !over ? '<p class="muted" style="margin-bottom:0">The coach confirms each place, and you hear here when she does.</p>' : ''}</div>`;
}

/* The coach's part: everyone booked, asking, waiting or turned down, asks
   first because that is what she has to answer. */
function sessPlayersBlock(s) {
  const xs = bookingsOf(s.id).sort((a, b) => BOOK_ORDER[a.st] - BOOK_ORDER[b.st] || whoName(a).localeCompare(whoName(b)));
  const over = sessPast(s) || !!s.called;
  const chip = (x, v, label) => `<button class="chip" type="button" data-act="sessbook" data-id="${esc(s.id)}" data-pid="${esc(x.pid)}" data-v="${v}">${label}</button>`;
  const status = x => x.st === 'out' ? (x.b.by === s.coach || isAdmin(x.b.by) ? 'Taken off' : 'Withdrew') : BOOK[x.st];
  const rows = xs.map(x => {
    const acts = x.st === 'asked' ? chip(x, 'in', 'Book') + chip(x, 'wait', 'Waitlist') + chip(x, 'no', 'Not this time')
      : x.st === 'wait' ? chip(x, 'in', 'Book') + chip(x, 'out', 'Take off')
        : x.st === 'in' ? chip(x, 'out', 'Take off') : chip(x, 'in', 'Book');
    return `<div class="rsvprow"><span>${x.who ? `<b>${esc(shirtOf(x.who.p))}</b> ` : ''}${esc(whoName(x))}
      <span class="rowsub">${esc([x.who ? x.who.t.name : '', status(x), x.want ? 'wants: ' + x.want : ''].filter(Boolean).join(' · '))}</span></span>
      ${over ? '' : `<div class="chips rsvpchips">${acts}</div>`}</div>`;
  }).join('');
  const n = nIn(s.id);
  return `<div class="rsvpbox"><div class="spread"><p class="lbl" style="margin:0">Players — ${s.kind === 'one' ? (n ? 'booked' : 'free') : `${n} of ${s.cap}`}</p>
      ${over ? '' : `<button class="btn quiet sm" data-act="sesspick" data-id="${esc(s.id)}">Add players</button>`}</div>
    ${rows || `<p class="muted" style="margin:6px 0 0">Nobody yet.${s.open ? ' Families can ask from their own phones.' : ''}</p>`}</div>`;
}

function sessRegisterBlock(s) {
  if (s.called || !s.date || s.date > todayStr()) return '';
  const ins = bookingsOf(s.id).filter(x => x.st === 'in'); if (!ins.length) return '';
  const reg = (sess.came || {})[s.id];
  if (!reg) return `<div class="rsvpbox"><p class="lbl">Who came</p>
    <button class="btn quiet wide" data-act="sessregister" data-id="${esc(s.id)}">Take the register</button></div>`;
  const n = ins.filter(x => reg[x.pid] === true).length;
  return `<div class="rsvpbox"><p class="lbl">Who came — ${n} of ${ins.length}</p>
    ${ins.map(x => { const on = reg[x.pid] === true; return `<button class="opt spread" type="button" data-act="sesscame" data-id="${esc(s.id)}" data-pid="${esc(x.pid)}">
      <span>${esc(whoName(x))}</span><span class="${on ? 'on' : 'off'}">${on ? 'came' : 'missed'}</span></button>`; }).join('')}
    <p class="muted" style="margin-bottom:0">Tap anyone to change. It counts on her record as an extra session.</p></div>`;
}

function sessFeesBlock(s) {
  if (!s.price || s.called) return '';
  const ins = bookingsOf(s.id).filter(x => x.st === 'in'); if (!ins.length) return '';
  const unpaid = ins.filter(x => !feeOf(s.id, x.pid));
  const k = xs => xs.map(x => s.id + '/' + x.pid).join(',');
  return `<div class="rsvpbox"><div class="spread"><p class="lbl" style="margin:0">Fees — ${esc(fmtMoney(s.price))} each</p>
      ${unpaid.length > 1 ? `<button class="btn quiet sm" data-act="sessfee" data-k="${esc(k(unpaid))}">All paid</button>` : ''}</div>
    ${feesKnown(s.id) ? '' : '<p class="muted" style="margin:6px 0 0">Not checked with the club yet; this is what this phone knows.</p>'}
    ${ins.map(x => { const f = feeOf(s.id, x.pid); return `<button class="opt spread" type="button" data-act="sessfee" data-k="${esc(k([x]))}">
      <span>${esc(whoName(x))}${f ? `<span class="rowsub">${esc(fmtMoney(f.paid))} · ${esc(PAY_HOW[f.how] || f.how)}${f.at ? ' · ' + esc(dayLabel(isoDay(f.at))) : ''}</span>` : ''}</span>
      <span class="${f ? 'on' : 'off'}">${f ? (f.how === 'waived' ? 'waived' : 'paid') : 'not paid'}</span></button>`; }).join('')}</div>`;
}

function sessDrillsBlock(s) {
  const L = drillLib();
  const blocks = splanBlocks(s.id);
  const wants = bookingsOf(s.id).filter(x => x.want && (x.st === 'in' || x.st === 'asked' || x.st === 'wait'));
  const total = blocks.reduce((n, b) => n + (Number(b.minutes) || 0), 0);
  return `<div class="rsvpbox"><div class="spread"><p class="lbl" style="margin:0">Drills${blocks.length ? ` — ${total} of ${sessMinutes(s)} min` : ''}</p>
      ${L ? `<button class="btn quiet sm" data-act="sessdrills" data-id="${esc(s.id)}">${blocks.length ? 'Change' : 'Plan it'}</button>` : ''}</div>
    ${wants.length ? `<p class="muted" style="margin:6px 0 0"><b>Asked for:</b> ${wants.map(x => esc((x.who ? firstName(x.who.p) + ': ' : '') + x.want)).join(' · ')}</p>` : ''}
    ${blocks.length ? `<div class="plist">${blocks.map((b, i) => `<button class="prow" type="button" data-act="drill" data-id="${esc(b.drill.id)}" style="grid-template-columns:1fr auto">
      <span class="pname">${i + 1}. ${esc(b.name || 'A drill')}</span><span class="muted">${Number(b.minutes) || 0}′</span></button>`).join('')}</div>`
      : `<p class="muted" style="margin:6px 0 0">No drills yet.${wants.length ? ' Plan it around what they asked for.' : ''}</p>`}</div>`;
}

/* ---- adding drills to a session ---- */
/* The built-in library, narrowed to what this many players can do (the coach
   counts as one, as a server) at these ages, with what the families asked for
   on top. Drills are stored by reference, as a practice plan's built-in
   drills are. */
function sheetSessDrills(id) {
  const s = sessById(id), L = drillLib(); if (!s || !L) return;
  const blocks = splanBlocks(s.id);
  const n = Math.max(1, s.kind === 'one' ? 1 : nIn(s.id) || s.cap);
  const ageOf = x => (x.who ? teamUAge(x.who.t) : null);
  const ages = s.ages || (a => a.length ? [Math.min(...a), Math.max(...a)] : null)(bookingsOf(s.id).map(ageOf).filter(v => v != null).map(v => Math.min(v, 19)));
  const q = String(ui.sessDrillQ || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const order = Object.keys(L.TYPES);
  const fit = L.DRILLS.filter(d => d.players.min <= n + 1 && (!ages || (d.ages[0] <= ages[1] && d.ages[1] >= ages[0]))
    && q.every(w => drillText(d, L).includes(w)))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.level - b.level);
  const have = new Set(blocks.map(b => b.drill.id));
  const wants = bookingsOf(s.id).filter(x => x.want && x.st !== 'out' && x.st !== 'no');
  const total = blocks.reduce((t, b) => t + (Number(b.minutes) || 0), 0);
  openSheet(`<h3>Drills — ${esc(sessTitle(s))}</h3>
    <p class="muted" style="margin-top:0">${total} of ${sessMinutes(s)} min · for ${n} player${n === 1 ? '' : 's'}${ages ? ' · ' + agesLabel(ages) : ''}</p>
    ${wants.length ? `<div class="drillsignal"><b>Asked for</b><span>${wants.map(x => esc((x.who ? firstName(x.who.p) + ': ' : '') + x.want)).join(' · ')}</span></div>` : ''}
    ${blocks.length ? `<div class="plist" style="margin-bottom:10px">${blocks.map((b, i) => `<div class="rsvprow"><span>${i + 1}. ${esc(b.name || 'A drill')}</span>
      <span class="planmins"><button class="chip" type="button" data-act="sessdrillmin" data-id="${esc(s.id)}" data-i="${i}" data-d="-1" aria-label="A minute less">−</button><b>${Number(b.minutes) || 0}′</b><button class="chip" type="button" data-act="sessdrillmin" data-id="${esc(s.id)}" data-i="${i}" data-d="1" aria-label="A minute more">+</button>
      <button class="chip" type="button" data-act="sessdrillrm" data-id="${esc(s.id)}" data-i="${i}">Remove</button></span></div>`).join('')}</div>` : ''}
    <div class="row" style="gap:8px;margin-bottom:8px"><input type="search" id="sessDrillQ" value="${esc(ui.sessDrillQ || '')}" placeholder="Search: finishing, weak foot, turns" style="flex:1">
      <button class="btn quiet sm" data-act="sessdrillq" data-id="${esc(s.id)}">Search</button></div>
    <p class="muted" style="margin:0 0 6px">${fit.length} drill${fit.length === 1 ? '' : 's'} work for ${n === 1 ? 'one player and a coach' : n + ' players'}${ages ? ' at these ages' : ''}.</p>
    <div class="plist">${fit.slice(0, 40).map(d => `<div class="rsvprow"><button class="drilllink" data-act="drill" data-id="${esc(d.id)}" style="text-align:left">${esc(d.name)}<span class="rowsub">${esc(L.TYPES[d.type] || d.type)} · ${d.minutes[0]}–${d.minutes[1]} min</span></button>
      ${have.has(d.id) ? '<span class="muted">added</span>' : `<button class="btn quiet sm" data-act="sessdrilladd" data-id="${esc(s.id)}" data-v="${esc(d.id)}">Add</button>`}</div>`).join('')}</div>
    <button class="btn wide" data-act="sessopen" data-id="${esc(s.id)}" style="margin-top:10px">Done</button>`);
}

/* ---- the add / edit form ---- */
/* Its fields live in sessForm and are read back before every redraw, so
   tapping Group or a weekday does not throw away what was typed. */
let sessForm = null;
function sessFormRead() {
  if (!sessForm) return;
  for (const [k, sel] of [['title', '#ssTitle'], ['date', '#ssDate'], ['start', '#ssStart'], ['end', '#ssEnd'], ['field', '#ssField'],
  ['place', '#ssPlace'], ['cap', '#ssCap'], ['lo', '#ssLo'], ['hi', '#ssHi'], ['price', '#ssPrice'], ['focus', '#ssFocus'],
  ['notes', '#ssNotes'], ['until', '#ssUntil'], ['coach', '#ssCoach']]) {
    const el = $(sel);
    if (el && typeof el.value === 'string') sessForm[k] = el.value;
  }
}
function sessFormNew(date) {
  const mine = me ? sessAll().filter(s => s.coach === me.uid) : sessAll();
  const last = mine[mine.length - 1] || {};
  const d = okDay(date) ? date : addDays(todayStr(), 1);
  return {
    id: null, kind: last.kind || 'one', title: '', coach: me ? me.uid : '', date: d, start: last.start || '', end: last.end || '',
    field: last.field || '', place: last.field ? '' : (last.place || ''), cap: String(last.kind === 'group' ? last.cap : 6),
    lo: '', hi: '', price: last.price ? String(last.price) : '', open: last.open === undefined ? true : !!last.open, focus: '', notes: '',
    repeat: false, days: [weekdayOf(d)], until: addDays(d, 7 * 8), scope: 'one'
  };
}
function sessFormEdit(s) {
  return {
    id: s.id, kind: s.kind, title: s.title, coach: s.coach, date: s.date, start: s.start, end: s.end, field: s.field, place: s.place,
    cap: String(s.cap), lo: s.ages ? String(s.ages[0]) : '', hi: s.ages ? String(s.ages[1]) : '', price: s.price ? String(s.price) : '',
    open: s.open, focus: s.focus, notes: s.notes, repeat: false, days: [], until: '', scope: 'one'
  };
}
/* Who a session can be run by: the club's coaches and admins, by name. Only an
   admin is offered the choice; a coach runs what she makes. */
function sessCoaches() {
  const ids = new Set([...coachUids(), ...Object.keys(acc().admins || {})]);
  if (me) ids.add(me.uid);
  return [...ids].map(u => [u, personName(u) || (me && u === me.uid ? whoAmI() : '') || 'Someone']).sort((a, b) => a[1].localeCompare(b[1]));
}
/* The session the form would save, for its clash check before saving. */
function sessFromForm(f) {
  const lo = Number(f.lo), hi = Number(f.hi);
  return normSess({
    id: f.id || 'new', kind: f.kind, title: (f.title || '').trim(), coach: f.coach || (me ? me.uid : 'device'),
    coachName: personName(f.coach) || (me && f.coach === me.uid ? whoAmI() : '') || 'Coach',
    date: f.date, start: hm(f.start), end: hm(f.end), field: fieldById(f.field) ? f.field : '', place: (f.place || '').trim(),
    cap: f.kind === 'one' ? 1 : Number(f.cap) || 6,
    ages: lo && hi ? [Math.min(lo, hi), Math.max(lo, hi)] : lo ? [lo, 19] : hi ? [4, hi] : null,
    price: Number(String(f.price || '').replace(/[^0-9.]/g, '')) || 0, open: !!f.open, focus: (f.focus || '').trim(), notes: (f.notes || '').trim()
  }, f.id || 'new');
}
function sheetSessForm() {
  const f = sessForm; if (!f) return;
  const isNew = !f.id;
  const cur = isNew ? null : sessById(f.id);
  if (!isNew && !cur) { closeSheet(); return; }
  const inSeries = cur && cur.series && sessSeries(cur).length > 1;
  const n = isNew && f.repeat ? seriesDates(f.date, f.until, f.days).length : 1;
  const chip = (act, v, on, label) => `<button class="chip" type="button" data-act="${act}" data-v="${v}" aria-pressed="${!!on}">${label}</button>`;
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  const ageOpts = cur => opt('', 'Any', cur) + Array.from({ length: 16 }, (_, i) => i + 4).map(a => opt(a, uLabel(a), cur)).join('');
  const fields = fieldList();
  const preview = f.checked ? sessClashes(sessFromForm(f)) : [];
  openSheet(`<h3>${isNew ? 'New session' : 'Edit session'}</h3>
    <div class="chips" style="margin-bottom:12px">${chip('sesskind', 'one', f.kind === 'one', '1-1')}${chip('sesskind', 'group', f.kind === 'group', 'Small group')}</div>
    <label class="field"><span>What</span><input type="text" id="ssTitle" maxlength="80" value="${esc(f.title)}" placeholder="${f.kind === 'one' ? '1-1: finishing' : 'Finishing group'}"></label>
    ${canAdmin() ? `<label class="field"><span>Run by</span><select id="ssCoach">${sessCoaches().map(([u, l]) => opt(u, l, f.coach)).join('')}</select></label>` : ''}
    <label class="field"><span>${isNew && f.repeat ? 'First one' : 'Date'}</span><input type="date" id="ssDate" value="${esc(f.date)}"></label>
    <div class="grid2">
      <label class="field"><span>Starts</span><input type="time" id="ssStart" value="${esc(f.start)}"></label>
      <label class="field"><span>Ends</span><input type="time" id="ssEnd" value="${esc(f.end)}"></label>
    </div>
    <label class="field"><span>Field</span><select id="ssField">${opt('', fields.length ? 'Somewhere else' : 'No fields listed yet', f.field)}${fields.map(x => opt(x.id, x.name, f.field)).join('')}</select></label>
    <label class="field"><span>${fieldById(f.field) ? 'Which part' : 'Where'}</span><input type="text" id="ssPlace" maxlength="120" value="${esc(f.place)}" placeholder="${fieldById(f.field) ? 'Pitch 2, the goalmouth' : 'Lakeside Park, field 3'}"></label>
    ${f.kind === 'group' ? `<label class="field"><span>Spots</span><input type="number" id="ssCap" min="1" max="60" value="${esc(f.cap)}"></label>` : ''}
    <div class="grid2">
      <label class="field"><span>Ages from</span><select id="ssLo">${ageOpts(f.lo)}</select></label>
      <label class="field"><span>to</span><select id="ssHi">${ageOpts(f.hi)}</select></label>
    </div>
    <label class="field"><span>Price, ${esc(moneySign())}</span><input type="text" inputmode="decimal" id="ssPrice" value="${esc(f.price)}" placeholder="Free"></label>
    <p class="lbl">Families</p>
    <div class="chips" style="margin-bottom:6px">${chip('sessopenask', '1', f.open, 'Can ask for a spot')}${chip('sessopenask', '0', !f.open, 'I book it myself')}</div>
    <p class="muted" style="margin-top:0">${f.open ? 'It shows as open to the families whose children fit the ages, and you confirm each ask.' : 'Only you add players. Families see it once their child is booked.'}</p>
    <label class="field"><span>Working on</span><input type="text" id="ssFocus" maxlength="200" value="${esc(f.focus)}" placeholder="Finishing, first touch, keeper handling"></label>
    <label class="field"><span>Notes</span><textarea id="ssNotes" rows="2" placeholder="Bring a ball and water">${esc(f.notes)}</textarea></label>
    ${isNew ? `<p class="lbl">Repeats</p>
      <div class="chips" style="margin-bottom:10px">${chip('sessrepeat', '0', !f.repeat, 'Just once')}${chip('sessrepeat', '1', f.repeat, 'Every week')}</div>
      ${f.repeat ? `<div class="chips" style="margin-bottom:10px">${WEEKDAYS.map((w, i) => chip('sesswd', i, f.days.includes(i), w)).join('')}</div>
        <label class="field"><span>Last one</span><input type="date" id="ssUntil" value="${esc(f.until)}"></label>
        <p class="muted" style="margin-top:-4px">${n} session${n === 1 ? '' : 's'}${n >= SERIES_MAX ? ' (the most at once)' : ''}. Each is its own, so one week can be moved or called off without touching the rest.</p>` : ''}` : ''}
    ${inSeries ? `<p class="lbl">Change</p>
      <div class="chips" style="margin-bottom:10px">${chip('sessscopeed', 'one', f.scope !== 'later', 'Just this one')}${chip('sessscopeed', 'later', f.scope === 'later', 'This and every later one')}</div>` : ''}
    ${f.checked ? (preview.length ? `<div class="card planwarn">${preview.map(c => `<p>${esc(c)}</p>`).join('')}</div>` : '<p class="muted">No clashes on the field, for the coach, or for anyone booked.</p>') : ''}
    <button class="btn quiet wide" data-act="sesscheck" style="margin-bottom:8px">Check for clashes</button>
    <button class="btn wide" data-act="sesssave">${isNew ? (n > 1 ? `Add ${n} sessions` : 'Add it') : 'Save'}</button>`);
}

/* ---- adding players ---- */
let sessPick = null;      // { sid, tid, picked: [pid], scope }
function sheetSessPick() {
  const pk = sessPick; if (!pk) return;
  const s = sessById(pk.sid); if (!s) { closeSheet(); return; }
  const list = myTeams();
  if (!list.some(t => t.id === pk.tid)) pk.tid = (list.find(t => t.id === ui.teamId) || list[0] || {}).id;
  const t = state.teams[pk.tid];
  const inSeries = s.series && sessSeries(s).filter(x => x.date >= s.date && !x.called).length > 1;
  const left = spotsLeft(s);
  openSheet(`<h3>Add players — ${esc(sessTitle(s))}</h3>
    <p class="muted" style="margin-top:0">From any team. ${s.kind === 'group' ? `${left} spot${left === 1 ? '' : 's'} left; anyone past that goes on the waiting list.` : left ? 'One player, one coach.' : 'Already booked; anyone added goes on the waiting list.'}</p>
    ${pickOne('sesspickteam', 'tid', pk.tid || '', list.map(x => [x.id, teamLabel(x)]), 'No teams yet.')}
    ${t && s.ages && !fitsAges(s, t) ? `<p class="muted">This team is outside the session's ages (${agesLabel(s.ages)}).</p>` : ''}
    ${t ? players(t).filter(p => p.active !== false).map(p => {
    const b = bookOf(s.id, p.id), on = pk.picked.includes(p.id);
    const now = b && b.st !== 'out' && b.st !== 'no' ? BOOK[b.st].toLowerCase() : '';
    return `<button class="opt spread" type="button" data-act="sesspicktoggle" data-pid="${esc(p.id)}"${now === 'booked' ? ' disabled' : ''}>
        <span>${esc(shirtOf(p))} ${esc(p.name)}${now ? `<span class="rowsub">${esc(now)}</span>` : ''}</span><span class="${on ? 'on' : 'off'}">${on ? 'adding' : ''}</span></button>`;
  }).join('') : ''}
    ${inSeries ? `<div class="chips" style="margin:10px 0">
      <button class="chip" type="button" data-act="sesspickscope" data-v="one" aria-pressed="${pk.scope !== 'later'}">Just this one</button>
      <button class="chip" type="button" data-act="sesspickscope" data-v="later" aria-pressed="${pk.scope === 'later'}">Every week from this one</button></div>` : ''}
    <button class="btn wide" data-act="sesspicksave" style="margin-top:10px"${pk.picked.length ? '' : ' disabled'}>${pk.picked.length ? `Book ${pk.picked.length}` : 'Pick someone'}</button>
    <button class="btn quiet wide" data-act="sessopen" data-id="${esc(s.id)}">Back</button>`);
}

/* ---- fees ---- */
let feeForm = null;       // { items: [[sid, pid]], how, amount }
function sheetFee() {
  const f = feeForm; if (!f) return;
  const items = f.items.map(([sid, pid]) => ({ s: sessById(sid), pid, who: playerById(pid) })).filter(x => x.s);
  if (!items.length) { closeSheet(); return; }
  const one = items.length === 1 ? items[0] : null, had = one ? feeOf(one.s.id, one.pid) : null;
  const total = items.reduce((n, x) => n + x.s.price, 0);
  openSheet(`<h3>${one ? `${esc(one.who ? one.who.p.name : 'A player')} — ${esc(sessTitle(one.s))}` : `${items.length} places`}</h3>
    <p class="muted" style="margin-top:0">${one ? `${esc(dayLabel(one.s.date))} · ${esc(fmtMoney(one.s.price))}` : `${esc(fmtMoney(total))} in all, each at its session's price`}</p>
    ${one && f.how !== 'waived' ? `<label class="field"><span>Paid, ${esc(moneySign())}</span><input type="text" inputmode="decimal" id="feeAmount" value="${esc(f.amount)}"></label>` : ''}
    <p class="lbl">How</p>
    <div class="chips" style="margin-bottom:12px">${Object.entries(PAY_HOW).map(([k, l]) => `<button class="chip" type="button" data-act="sessfeehow" data-v="${k}" aria-pressed="${f.how === k}">${l}</button>`).join('')}</div>
    <button class="btn wide" data-act="sessfeesave" style="margin-bottom:8px">${f.how === 'waived' ? 'Waive it' : 'Mark paid'}</button>
    ${had ? '<button class="btn quiet wide" data-act="sessfeeclear">Not paid after all</button>' : ''}
    <p class="muted">There are no card payments here: this is the club's record of who has paid, however they paid.</p>`);
}

function sessFeesView() {
  const rows = feeRows();
  const owed = rows.filter(r => !r.fee), paid = rows.filter(r => r.fee).sort((a, b) => (b.fee.at || 0) - (a.fee.at || 0));
  const month = todayStr().slice(0, 7);
  const inMonth = paid.filter(r => r.fee.at && isoDay(r.fee.at).startsWith(month)).reduce((n, r) => n + (Number(r.fee.paid) || 0), 0);
  const by = {};
  for (const r of owed) (by[r.x.pid] = by[r.x.pid] || { x: r.x, rows: [] }).rows.push(r);
  const groups = Object.values(by).sort((a, b) => a.rows[0].s.date.localeCompare(b.rows[0].s.date));
  const today = todayStr();
  return `<div class="card"><div class="spread"><span><b>${esc(fmtMoney(owed.reduce((n, r) => n + r.s.price, 0)))}</b> not paid yet</span>
      <span class="muted">${esc(fmtMoney(inMonth))} paid in ${esc(MONTHS_LONG[Number(month.slice(5)) - 1])}</span></div>
    <p class="muted" style="margin-bottom:0">${canAdmin() ? 'Every session in the club.' : 'The sessions you run.'} A place owes its price once it is booked; a withdrawal owes nothing.</p></div>
    ${groups.length ? groups.map(g => `<div class="card">
      <div class="spread"><span><b>${esc(whoName(g.x))}</b>${g.x.who ? ` <span class="muted">${teamLabel(g.x.who.t)}</span>` : ''}</span><b>${esc(fmtMoney(g.rows.reduce((n, r) => n + r.s.price, 0)))}</b></div>
      <div class="plist">${g.rows.map(r => `<button class="prow" type="button" data-act="sessfee" data-k="${esc(r.s.id + '/' + r.x.pid)}" style="grid-template-columns:1fr auto">
        <span><span class="pname">${esc(sessTitle(r.s))}</span><span class="psub">${esc(dayLabel(r.s.date))}${r.s.date > today ? ' · still to come' : ''} · ${esc(r.s.coachName)}</span></span>
        <span class="pmins">${esc(fmtMoney(r.s.price))}</span></button>`).join('')}</div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn quiet sm" style="flex:1" data-act="sessfee" data-k="${esc(g.rows.map(r => r.s.id + '/' + r.x.pid).join(','))}">All paid</button>
        <button class="btn quiet sm" style="flex:1" data-act="sessremind" data-pid="${esc(g.x.pid)}">Remind the family</button></div></div>`).join('')
      : `<div class="empty"><strong>Nothing owed</strong>Every booked place with a price is marked paid or waived.</div>`}
    ${paid.length ? `<div class="card"><h2 style="margin-bottom:0">Paid</h2><div class="plist">${paid.slice(0, 20).map(r => `<button class="prow" type="button" data-act="sessfee" data-k="${esc(r.s.id + '/' + r.x.pid)}" style="grid-template-columns:1fr auto">
      <span><span class="pname">${esc(whoName(r.x))}</span><span class="psub">${esc(sessTitle(r.s))} · ${esc(dayLabel(r.s.date))} · ${esc(PAY_HOW[r.fee.how] || r.fee.how || '')}${r.fee.at ? ' · ' + esc(dayLabel(isoDay(r.fee.at))) : ''}</span></span>
      <span class="pmins">${esc(fmtMoney(r.fee.paid))}</span></button>`).join('')}</div></div>` : ''}
    ${canAdmin() ? `<div class="card"><h2 style="margin-bottom:8px">Currency</h2>
      <div class="row" style="gap:8px"><input type="text" id="sessMoney" maxlength="3" value="${esc(moneySign())}" style="width:5em"><button class="btn quiet sm" data-act="sessmoney">Save</button></div>
      <p class="muted" style="margin-bottom:0">The sign fees are shown with: $, £, €.</p></div>` : ''}`;
}

/* ---- hours ---- */
function sessHoursView() {
  const u = sessUi();
  const rows = hoursFor(u.month).filter(h => canAdmin() || !gated() || (me && h.uid === me.uid));
  const table = ['Coach\tSessions\tHours\t1-1s\tGroups\tRate\tPay', ...rows.map(h => {
    const r = payOf(h.uid), pay = payFor(h);
    return [h.name, h.n, (h.mins / 60).toFixed(2), h.one, h.group, r ? `${fmtMoney(r.rate)}/${r.per}` : '', pay == null ? '' : fmtMoney(pay)].join('\t');
  })].join('\n');
  const coaches = canAdmin() ? sessCoaches().filter(([uid]) => isCoachAny(uid) || payOf(uid)) : [];
  return `<div class="card"><div class="spread">
      <button class="stepbtn" data-act="sessmonth" data-v="-1" aria-label="Previous month">‹</button>
      <b>${esc(monthLabel(u.month))}</b>
      <button class="stepbtn" data-act="sessmonth" data-v="1" aria-label="Next month">›</button></div></div>
    ${rows.length ? `<div class="card"><div class="plist">${rows.map(h => {
    const pay = payFor(h), r = payOf(h.uid);
    return `<button class="prow" type="button" data-act="sesshourscoach" data-v="${esc(h.uid)}" style="grid-template-columns:1fr auto">
      <span><span class="pname">${esc(h.name)}</span>
        <span class="psub">${h.n} session${h.n === 1 ? '' : 's'} · ${hoursWords(h.mins)} · ${h.players.size} player${h.players.size === 1 ? '' : 's'} · ${h.one} 1-1${h.one === 1 ? '' : 's'}, ${h.group} group${h.group === 1 ? '' : 's'}${r ? ` · ${esc(fmtMoney(r.rate))} per ${r.per}` : ''}</span></span>
      <span class="pmins">${pay == null ? hoursWords(h.mins) : esc(fmtMoney(pay))}</span></button>`;
  }).join('')}</div>
      <button class="btn quiet wide" data-act="copytext" data-v="${esc(table)}" style="margin-top:10px">Copy as a table</button>
      <p class="muted" style="margin-bottom:0">Sessions that happened and were not called off, start to end. Team practices are not counted: the app knows a team's coaches, not which of them ran it.</p></div>`
      : `<div class="empty"><strong>No sessions run in ${esc(monthLabel(u.month))}</strong>Hours count once a session is over.</div>`}
    ${coaches.length ? `<div class="card"><h2 style="margin-bottom:0">Pay rates</h2><div class="plist">${coaches.map(([uid, name]) => {
    const r = payOf(uid);
    return `<button class="prow" type="button" data-act="sesspay" data-v="${esc(uid)}" style="grid-template-columns:1fr auto">
        <span class="pname">${esc(name)}</span><span class="muted">${r ? `${esc(fmtMoney(r.rate))} per ${r.per}` : 'Set'}</span></button>`;
  }).join('')}</div><p class="muted" style="margin-bottom:0">Only admins see these, and each coach her own.</p></div>` : ''}`;
}
function sheetHoursCoach(uid) {
  const u = sessUi();
  const h = hoursFor(u.month).find(x => x.uid === uid); if (!h) return;
  const r = payOf(uid), pay = payFor(h);
  openSheet(`<h3>${esc(h.name)} — ${esc(monthLabel(u.month))}</h3>
    <p class="muted" style="margin-top:0">${h.n} session${h.n === 1 ? '' : 's'} · ${hoursWords(h.mins)}${pay == null ? '' : ` · ${esc(fmtMoney(pay))} at ${esc(fmtMoney(r.rate))} per ${r.per}`}</p>
    <div class="plist">${h.list.map(s => `<button class="prow" type="button" data-act="sessopen" data-id="${esc(s.id)}" style="grid-template-columns:1fr auto">
      <span><span class="pname">${esc(dayLabel(s.date))} · ${esc(niceTime(s.start))}–${esc(niceTime(s.end))}</span><span class="psub">${esc(sessTitle(s))} · ${nIn(s.id)} booked</span></span>
      <span class="muted">${sessMinutes(s)}′</span></button>`).join('')}</div>
    ${canAdmin() ? `<button class="btn quiet wide" data-act="sesspay" data-v="${esc(uid)}" style="margin-top:10px">${r ? 'Change the rate' : 'Set a rate'}</button>` : ''}`);
}
let payForm = null;       // { uid, per }
function sheetPay() {
  const f = payForm; if (!f) return;
  const r = payOf(f.uid);
  openSheet(`<h3>Pay rate — ${esc(personName(f.uid) || 'Coach')}</h3>
    <label class="field"><span>Rate, ${esc(moneySign())}</span><input type="text" inputmode="decimal" id="payRate" value="${esc(r ? String(r.rate) : '')}"></label>
    <div class="chips" style="margin-bottom:12px">
      <button class="chip" type="button" data-act="sesspayper" data-v="hour" aria-pressed="${f.per === 'hour'}">Per hour</button>
      <button class="chip" type="button" data-act="sesspayper" data-v="session" aria-pressed="${f.per === 'session'}">Per session</button></div>
    <button class="btn wide" data-act="sesspaysave" style="margin-bottom:8px">Save</button>
    ${r ? '<button class="btn quiet wide" data-act="sesspayclear">No rate</button>' : ''}
    <p class="muted">Only admins see the rates, and each coach her own.</p>`);
}

/* ---- fields ---- */
function sessFieldsView() {
  const list = fieldList(), admin = canAdmin(), today = todayStr();
  const loose = admin ? looseVenues() : [];
  return `${admin ? '<button class="btn sm" data-act="fieldnew" style="align-self:flex-end">Add a field</button>' : ''}
    ${list.length ? list.map(f => {
    const pm = permitsOf(f), days = fieldDays(f, today, 7);
    const bad = days.filter(d => d.flags.length).length;
    return `<button class="card" type="button" data-act="fieldopen" data-id="${esc(f.id)}" style="text-align:left;width:100%">
      <div class="spread"><b>${esc(f.name)}</b>${bad ? `<span class="tag off">${bad} to look at</span>` : ''}</div>
      ${f.address ? `<span class="rowsub">${esc(f.address)}</span>` : ''}
      <span class="rowsub">${esc([`${Math.max(1, Number(f.pitches) || 1)} pitch${Number(f.pitches) > 1 ? 'es' : ''}`, f.surface, f.lights ? 'lights' : ''].filter(Boolean).join(' · '))}</span>
      ${pm.length ? pm.map(p => `<span class="rowsub">Permit: ${esc(permitText(p))}</span>`).join('') : '<span class="rowsub">No permits listed</span>'}
      <span class="rowsub">This week: ${days.length} booked${bad ? `, ${bad} outside the permit or double-booked` : ''}</span></button>`;
  }).join('') : `<div class="empty"><strong>No fields yet</strong>${admin ? 'Add the places the club trains, with the permits you hold for each, and every session and practice is checked against them.' : 'An admin adds the club’s fields and permits.'}</div>`}
    ${loose.length ? `<div class="card"><h2 style="margin-bottom:6px">Typed on the calendar, not a field yet</h2>
      <div class="chips">${loose.map(v => `<button class="chip" type="button" data-act="fieldfromtext" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
      <p class="muted" style="margin-bottom:0">Tap one to add it as a field. Practices and games whose venue names a field are counted at it.</p></div>` : ''}`;
}
function sheetField(id) {
  const f = fieldById(id); if (!f) { closeSheet(); return; }
  const I = ICS(), pm = permitsOf(f), today = todayStr();
  const days = fieldDays(f, today, 14);
  let last = null;
  const week = days.map(({ date, x, flags }) => {
    const head = date !== last ? `<p class="calhead">${esc(dayLabel(date))}</p>` : '';
    last = date;
    return head + `<div class="rsvprow"><span>${esc(timeOf(x))} · ${esc(x.label)}${flags.length ? `<span class="rowsub" style="color:var(--danger,#B3261E)">${esc(flags.join(' · '))}</span>` : ''}</span></div>`;
  }).join('');
  openSheet(`<h3>${esc(f.name)}</h3>
    <dl class="facts">
      ${f.address ? `<dt>Address</dt><dd>${esc(f.address)}</dd>` : ''}
      <dt>Pitches</dt><dd>${Math.max(1, Number(f.pitches) || 1)}${f.surface ? ' · ' + esc(f.surface) : ''}${f.lights ? ' · lights' : ''}</dd>
      ${f.notes ? `<dt>Notes</dt><dd>${esc(f.notes).replace(/\n/g, '<br>')}</dd>` : ''}
      <dt>Permits</dt><dd>${pm.length ? pm.map(p => esc(permitText(p)) + (p.note ? `<span class="rowsub">${esc(p.note)}</span>` : '')).join('<br>') : 'None listed, so nothing is checked against one'}</dd>
    </dl>
    ${(f.address || f.name) && I ? `<a class="btn quiet sm" href="${esc(I.mapLink(f.address || f.name))}" target="_blank" rel="noopener" style="margin-bottom:10px">Directions</a>` : ''}
    ${canOffer() ? `<p class="lbl">The next two weeks</p>
    ${week || '<p class="muted">Nothing with a time on it here.</p>'}` : ''}
    ${canAdmin() ? `<button class="btn quiet wide" data-act="fieldedit" data-id="${esc(f.id)}" style="margin-top:10px">Edit</button>` : ''}`);
}
let fieldForm = null;
function fieldFormRead() {
  const f = fieldForm; if (!f) return;
  for (const [k, sel] of [['name', '#fdName'], ['address', '#fdAddress'], ['pitches', '#fdPitches'], ['notes', '#fdNotes']]) {
    const el = $(sel); if (el && typeof el.value === 'string') f[k] = el.value;
  }
  f.permits.forEach((p, i) => {
    for (const [k, sel] of [['start', '#pmStart_' + i], ['end', '#pmEnd_' + i], ['from', '#pmFrom_' + i], ['until', '#pmUntil_' + i], ['ref', '#pmRef_' + i], ['note', '#pmNote_' + i]]) {
      const el = $(sel); if (el && typeof el.value === 'string') p[k] = el.value;
    }
  });
}
function fieldFormOf(f, name) {
  return f ? { id: f.id, name: f.name || '', address: f.address || '', pitches: String(f.pitches || 1), surface: f.surface || '', lights: !!f.lights, notes: f.notes || '', permits: permitsOf(f).map(p => ({ ...p })) }
    : { id: null, name: name || '', address: '', pitches: '1', surface: '', lights: false, notes: '', permits: [] };
}
function sheetFieldForm() {
  const f = fieldForm; if (!f) return;
  const chip = (act, v, on, label, i) => `<button class="chip" type="button" data-act="${act}" data-v="${v}"${i == null ? '' : ` data-i="${i}"`} aria-pressed="${!!on}">${label}</button>`;
  openSheet(`<h3>${f.id ? 'Edit field' : 'Add a field'}</h3>
    <label class="field"><span>Name</span><input type="text" id="fdName" maxlength="80" value="${esc(f.name)}" placeholder="Lakeside Park"></label>
    <label class="field"><span>Address</span><input type="text" id="fdAddress" maxlength="160" value="${esc(f.address)}" placeholder="1 Lake Rd, for directions"></label>
    <label class="field"><span>Pitches</span><input type="number" id="fdPitches" min="1" max="20" value="${esc(f.pitches)}"></label>
    <div class="chips" style="margin-bottom:10px">${['Grass', 'Turf', 'Indoor'].map(x => chip('fieldsurface', x, f.surface === x, x)).join('')}${chip('fieldlights', '1', f.lights, 'Lights')}</div>
    <label class="field"><span>Notes</span><textarea id="fdNotes" rows="2" placeholder="Gate code, parking, who to call">${esc(f.notes)}</textarea></label>
    <p class="lbl">Permits</p>
    ${f.permits.map((p, i) => `<div class="card" style="margin-bottom:8px">
      <div class="chips" style="margin-bottom:8px">${WEEKDAYS.map((w, d) => chip('fieldday', d, p.days.includes(d), w, i)).join('')}</div>
      <div class="grid2"><label class="field"><span>From</span><input type="time" id="pmStart_${i}" value="${esc(p.start)}"></label>
        <label class="field"><span>To</span><input type="time" id="pmEnd_${i}" value="${esc(p.end)}"></label></div>
      <div class="grid2"><label class="field"><span>Starting</span><input type="date" id="pmFrom_${i}" value="${esc(p.from)}"></label>
        <label class="field"><span>Ending</span><input type="date" id="pmUntil_${i}" value="${esc(p.until)}"></label></div>
      <label class="field"><span>Permit number</span><input type="text" id="pmRef_${i}" maxlength="60" value="${esc(p.ref)}" placeholder="City parks #4471"></label>
      <label class="field"><span>Note</span><input type="text" id="pmNote_${i}" maxlength="120" value="${esc(p.note)}" placeholder="Pitch 2 only; no cleats on the turf"></label>
      <button class="btn quiet sm" data-act="fieldpermitrm" data-i="${i}">Remove this permit</button></div>`).join('')}
    <button class="btn quiet wide" data-act="fieldpermit" style="margin-bottom:10px">Add a permit</button>
    <p class="muted" style="margin-top:0">A session or practice here at a time no permit covers is flagged. With no permits listed, nothing is checked.</p>
    <button class="btn wide" data-act="fieldsave" style="margin-bottom:8px">Save</button>
    ${f.id ? '<button class="btn danger wide" data-act="fielddel">Delete this field</button>' : ''}`);
}

/* ---- telling families ---- */
/* Everything a family needs in one message, and every way to get it to them
   without a server: email in Bcc, a copy to paste anywhere, and a post in the
   family's conversation on any team where the sender is staff. Messages are
   not push, so email is what reaches a closed phone. */
let reach = null;         // { title, text, dms: [{tid, fam}], emails: [] }
function reachFor(pids) {
  const dms = [], emails = new Set(), seen = new Set();
  let away = 0;
  for (const pid of pids) {
    const w = playerById(pid); if (!w) continue;
    for (const fam of Object.keys(w.p.guardians || {})) {
      const em = ((acc().members || {})[fam] || {}).email; if (em) emails.add(em);
      if (seen.has(w.t.id + '/' + fam)) continue;
      seen.add(w.t.id + '/' + fam);
      if (msgOn() && isStaff(w.t.id)) dms.push({ tid: w.t.id, fam }); else away++;
    }
  }
  return { dms, emails: [...emails], away };
}
function sessMessage(s) {
  const when = `${dayLabel(s.date)}${s.start ? ', ' + niceTime(s.start) + (s.end ? '–' + niceTime(s.end) : '') : ''}`;
  return [
    `${sessTitle(s)} with ${s.coachName}${s.called ? ` — ${CALLED[s.called].toUpperCase()}` : ''}`,
    `${when}${sessPlace(s) ? ' at ' + sessPlace(s) : ''}.`,
    s.focus ? `Working on: ${s.focus}.` : '',
    s.notes || '',
    s.price && !s.called ? `${fmtMoney(s.price)} a place.` : ''
  ].filter(Boolean).join('\n');
}
function sheetReach() {
  const r = reach; if (!r) return;
  const href = `mailto:?bcc=${encodeURIComponent(r.emails.join(','))}&subject=${encodeURIComponent(r.title)}&body=${encodeURIComponent(r.text.slice(0, 1500))}`;
  openSheet(`<h3>${esc(r.title)}</h3>
    <textarea id="reachText" rows="7" maxlength="${MSG_MAX}">${esc(r.text)}</textarea>
    ${r.dms.length ? `<button class="btn wide" data-act="reachdm" style="margin-top:10px">Send in the app (${r.dms.length} famil${r.dms.length === 1 ? 'y' : 'ies'})</button>
      <p class="muted">Into each family's conversation with their team's coaches.${r.away ? ` ${r.away} other famil${r.away === 1 ? 'y is' : 'ies are'} on a team you don't coach, so email reaches them.` : ''}</p>` : ''}
    ${r.emails.length ? `<a class="btn ${r.dms.length ? 'quiet ' : ''}wide" href="${esc(href)}" data-act="closesheet" style="margin-top:10px">Email them (${r.emails.length})</a>
      <p class="muted">Opens your email app with them in Bcc, so nobody sees anyone else's address.</p>`
      : `<p class="muted">Nobody here has an account with an email address yet.</p>`}
    <button class="btn quiet wide" data-act="reachcopy">Copy the text</button>`);
}

/* ---- what the buttons do ---- */
/* Each action checks who is asking itself, in here: a hidden button is not the
   only thing between an account and a write. The rules are the real line. */
const SESS_ACTS = new Set(['sesstab', 'sessscope', 'sesspast', 'sessopen', 'sessnew', 'sessedit', 'sesskind', 'sessopenask', 'sessrepeat',
  'sesswd', 'sessscopeed', 'sesscheck', 'sesssave', 'sesscall', 'sessdel', 'sessbook', 'sesspick', 'sesspickteam', 'sesspicktoggle',
  'sesspickscope', 'sesspicksave', 'sessask', 'sesswithdraw', 'sessregister', 'sesscame', 'sessfee', 'sessfeehow', 'sessfeesave',
  'sessfeeclear', 'sessremind', 'sessmoney', 'sessmonth', 'sesshourscoach', 'sesspay', 'sesspayper', 'sesspaysave', 'sesspayclear',
  'sessdrills', 'sessdrilladd', 'sessdrillrm', 'sessdrillmin', 'sessdrillq', 'sesstell', 'sessics', 'reachdm', 'reachcopy',
  'fieldopen', 'fieldnew', 'fieldedit', 'fieldsave', 'fielddel', 'fieldpermit', 'fieldpermitrm', 'fieldday', 'fieldsurface',
  'fieldlights', 'fieldfromtext']);
const FIELD_EDIT = new Set(['fieldnew', 'fieldedit', 'fieldsave', 'fielddel', 'fieldpermit', 'fieldpermitrm', 'fieldday', 'fieldsurface', 'fieldlights', 'fieldfromtext']);
const RUN_ACTS = new Set(['sessedit', 'sesscall', 'sessdel', 'sessbook', 'sesspick', 'sessregister', 'sesscame', 'sessdrills', 'sessdrilladd',
  'sessdrillrm', 'sessdrillmin', 'sessdrillq', 'sesstell']);

function onSessAct(a, d) {
  const u = sessUi();
  if (!canSessions()) { closeSheet(); toast('Training sessions are for coaches, admins and families'); render(); return; }
  if (FIELD_EDIT.has(a) && !canAdmin()) { closeSheet(); toast('Club admins look after the fields'); render(); return; }
  const s = d.id ? sessById(d.id) : null;
  if (RUN_ACTS.has(a) && !canRun(s)) { closeSheet(); toast(s ? 'Only the coach running it, or an admin, can change that' : 'That session is not on this phone any more'); render(); return; }
  const staffOnly = ['sessnew', 'sesskind', 'sessopenask', 'sessrepeat', 'sesswd', 'sessscopeed', 'sesscheck', 'sesssave', 'sesspickteam',
    'sesspicktoggle', 'sesspickscope', 'sesspicksave', 'sessfee', 'sessfeehow', 'sessfeesave', 'sessfeeclear', 'sessremind', 'sessmonth', 'sesshourscoach'];
  if (staffOnly.includes(a) && !canOffer()) { closeSheet(); toast('That is for coaches and admins'); render(); return; }
  const by = () => (me && me.uid) || 'device';

  if (a === 'sesstab') { ui.view = 'sessions'; u.tab = SESS_TABS[d.k] ? d.k : 'list'; closeSheet(); render(); toTop(); return; }
  if (a === 'sessscope') { u.scope = d.v === 'all' ? 'all' : 'mine'; render(); return; }
  if (a === 'sesspast') { u.past = !u.past; render(); return; }
  if (a === 'sessopen') { sheetSess(d.id); return; }
  if (a === 'sessics') { if (s) downloadIcs(sessIcs(s).title, [sessIcs(s)]); return; }

  /* -- the form -- */
  if (a === 'sessnew') { sessForm = sessFormNew(d.v); sheetSessForm(); return; }
  if (a === 'sessedit') { sessForm = sessFormEdit(s); sheetSessForm(); return; }
  if (['sesskind', 'sessopenask', 'sessrepeat', 'sesswd', 'sessscopeed', 'sesscheck'].includes(a)) {
    if (!sessForm) return;
    sessFormRead();
    const f = sessForm;
    if (a === 'sesskind') f.kind = d.v === 'group' ? 'group' : 'one';
    if (a === 'sessopenask') f.open = d.v === '1';
    // the weekday starts as the date's own, read now: the date may have changed since the form opened
    if (a === 'sessrepeat') { f.repeat = d.v === '1'; if (f.repeat && okDay(f.date)) f.days = [weekdayOf(f.date)]; }
    if (a === 'sesswd') { const i = Number(d.v); f.days = f.days.includes(i) ? f.days.filter(x => x !== i) : [...f.days, i]; }
    if (a === 'sessscopeed') f.scope = d.v === 'later' ? 'later' : 'one';
    if (a === 'sesscheck') f.checked = true;
    sheetSessForm(); return;
  }
  if (a === 'sesssave') { saveSessForm(); return; }
  if (a === 'sesscall') {
    const next = { ...sess.sessions[s.id], at: nowMs() };
    if (s.called) delete next.called; else next.called = 'cancelled';
    sessPut('sessions/' + s.id, next);
    toast(s.called ? 'Back on' : 'Called off');
    if (!s.called && bookingsOf(s.id).some(x => x.st === 'in' || x.st === 'wait' || x.st === 'asked')) { openReach(sessById(s.id)); render(); return; }
    sheetSess(s.id); render(); return;
  }
  if (a === 'sessdel') {
    if (bookingsOf(s.id).some(x => feeOf(s.id, x.pid))) { toast('Payments are recorded against it, so call it off instead'); return; }
    if (!confirm('Delete this session, with its bookings and register? Calling it off keeps the record instead.')) return;
    for (const k of ['booked', 'came', 'fees', 'splans']) if (getDeep(sess, k + '/' + s.id) !== undefined || fb) sessPut(k + '/' + s.id, null);
    sessPut('sessions/' + s.id, null);
    u.open = null; closeSheet(); render(); toast('Deleted'); return;
  }

  /* -- players: the coach decides -- */
  if (a === 'sessbook') {
    const b = bookOf(s.id, d.pid); if (!b) return;
    const st = BOOK[d.v] ? d.v : null; if (!st || st === 'asked') return;
    if (st === 'in' && b.st !== 'in' && spotsLeft(s) === 0) { toast('No spots left — take someone off, waitlist this one, or add spots'); return; }
    sessPut(`booked/${s.id}/${d.pid}`, bookingVal(b, st));
    sheetSess(s.id); render(); return;
  }
  if (a === 'sesspick') { sessPick = { sid: s.id, tid: ui.teamId, picked: [], scope: 'one' }; sheetSessPick(); return; }
  if (['sesspickteam', 'sesspicktoggle', 'sesspickscope'].includes(a)) {
    const pk = sessPick; if (!pk) return;
    if (a === 'sesspickteam') pk.tid = d.v;
    if (a === 'sesspicktoggle') pk.picked = pk.picked.includes(d.pid) ? pk.picked.filter(x => x !== d.pid) : [...pk.picked, d.pid];
    if (a === 'sesspickscope') pk.scope = d.v === 'later' ? 'later' : 'one';
    sheetSessPick(); return;
  }
  if (a === 'sesspicksave') {
    const pk = sessPick; const base = pk && sessById(pk.sid);
    if (!base || !canRun(base)) { closeSheet(); toast('Only the coach running it, or an admin, can change that'); return; }
    const targets = pk.scope === 'later' && base.series ? sessSeries(base).filter(x => x.date >= base.date && !x.called && canRun(x)) : [base];
    let waited = 0;
    for (const x of targets) for (const pid of pk.picked) {
      const w = playerById(pid); if (!w) continue;
      const b = bookOf(x.id, pid);
      if (b && b.st === 'in') continue;
      const st = spotsLeft(sessById(x.id)) > 0 ? 'in' : 'wait';
      if (st === 'wait') waited++;
      sessPut(`booked/${x.id}/${pid}`, bookingVal({ ...(b || {}), tid: w.t.id }, st));
    }
    sessPick = null; sheetSess(base.id); render();
    toast(waited ? `Booked, with ${waited} on the waiting list — it was full` : targets.length > 1 ? `Booked into ${targets.length} sessions` : 'Booked');
    return;
  }

  /* -- a family asks, or withdraws, for her own child -- */
  if (a === 'sessask' || a === 'sesswithdraw') {
    const kid = myPlayers().find(x => x.p.id === d.pid);
    if (!s || !kid) { closeSheet(); toast('You can only ask for your own child'); render(); return; }
    const b = bookOf(s.id, d.pid);
    const undo = 'Not saved — the club’s database rules need the training sessions block from README';
    if (a === 'sessask') {
      if (!s.open || s.called || sessPast(s)) { toast('That session is not taking asks'); return; }
      if (b && b.st !== 'out') { toast('Already ' + BOOK[b.st].toLowerCase()); return; }
      const el = $('#sessWant_' + d.pid);
      const want = String((el && el.value) || '').trim().slice(0, WANT_MAX);
      sessPut(`booked/${s.id}/${d.pid}`, bookingVal({ tid: kid.t.id }, 'asked', { want }), undo);
      sheetSess(s.id); render(); toast('Asked — the coach confirms it'); return;
    }
    if (!b || b.st === 'out' || b.st === 'no') return;
    if (!confirm(`Take ${firstName(kid.p)} out of ${sessTitle(s)} on ${dayLabel(s.date)}?`)) return;
    sessPut(`booked/${s.id}/${d.pid}`, bookingVal({ ...b, tid: kid.t.id }, 'out'), undo);
    sheetSess(s.id); render(); toast('Withdrawn — the coach is told'); return;
  }

  /* -- the register -- */
  if (a === 'sessregister' || a === 'sesscame') {
    const ins = bookingsOf(s.id).filter(x => x.st === 'in');
    const reg = { ...((sess.came || {})[s.id] || {}) };
    if (a === 'sessregister') for (const x of ins) { if (typeof reg[x.pid] !== 'boolean') reg[x.pid] = true; }
    else reg[d.pid] = reg[d.pid] !== true;
    sessPut('came/' + s.id, reg);
    sheetSess(s.id); render(); return;
  }

  /* -- fees -- */
  if (a === 'sessfee') {
    const items = String(d.k || '').split(',').map(x => x.split('/')).filter(([sid, pid]) => sid && pid && canRun(sessById(sid)));
    if (!items.length) { toast('Only the coach running it, or an admin, can mark that'); return; }
    const one = items.length === 1 ? feeOf(items[0][0], items[0][1]) : null;
    const s0 = sessById(items[0][0]);
    feeForm = { items, how: one ? one.how : 'cash', amount: String(one ? one.paid : s0.price) };
    sheetFee(); return;
  }
  if (a === 'sessfeehow') { if (!feeForm) return; const el = $('#feeAmount'); if (el && typeof el.value === 'string') feeForm.amount = el.value; feeForm.how = PAY_HOW[d.v] ? d.v : 'cash'; sheetFee(); return; }
  if (a === 'sessfeesave' || a === 'sessfeeclear') {
    const f = feeForm; if (!f) return;
    const el = $('#feeAmount');
    const typed = el && typeof el.value === 'string' && el.value !== '' ? Number(String(el.value).replace(/[^0-9.]/g, '')) : null;
    let n = 0;
    for (const [sid, pid] of f.items) {
      const x = sessById(sid); if (!canRun(x)) continue;
      if (a === 'sessfeeclear') { sessPut(`fees/${sid}/${pid}`, null); n++; continue; }
      const paid = f.how === 'waived' ? 0 : f.items.length === 1 && typed != null && typed >= 0 ? Math.round(typed * 100) / 100 : x.price;
      sessPut(`fees/${sid}/${pid}`, { paid, how: f.how, at: nowMs(), by: by(), byName: whoAmI() || 'Someone' });
      n++;
    }
    const back = f.items.length === 1 ? f.items[0][0] : null;
    feeForm = null;
    if (back && u.tab === 'list') sheetSess(back); else closeSheet();
    render(); toast(a === 'sessfeeclear' ? 'Marked not paid' : f.how === 'waived' ? 'Waived' : n > 1 ? `${n} marked paid` : 'Marked paid'); return;
  }
  if (a === 'sessremind') {
    const rows = feeRows().filter(r => !r.fee && r.x.pid === d.pid);
    const w = playerById(d.pid); if (!rows.length || !w) return;
    const total = rows.reduce((n, r) => n + r.s.price, 0);
    const text = [`A reminder from ${(acc().org || {}).name || 'the club'}: ${firstName(w.p)}'s training sessions still to pay —`,
      ...rows.map(r => `• ${dayLabel(r.s.date)}, ${sessTitle(r.s)} with ${r.s.coachName}: ${fmtMoney(r.s.price)}`),
      `${fmtMoney(total)} in all. Thank you!`].join('\n');
    reach = { title: `Training sessions to pay: ${firstName(w.p)}`, text, ...reachFor([d.pid]) };
    sheetReach(); return;
  }
  if (a === 'sessmoney') {
    if (!canAdmin()) { toast('Club admins set the currency'); return; }
    const v = String(($('#sessMoney') || {}).value || '').trim().slice(0, 3) || '$';
    quiet('access/org/money', v); saveLocal(); render(); toast('Saved'); return;
  }

  /* -- hours and pay -- */
  if (a === 'sessmonth') { u.month = Number(d.v) ? addMonths(u.month, Number(d.v)) : todayStr().slice(0, 7); render(); return; }
  if (a === 'sesshourscoach') {
    if (!canAdmin() && gated() && !(me && d.v === me.uid)) return;
    sheetHoursCoach(d.v); return;
  }
  if (['sesspay', 'sesspayper', 'sesspaysave', 'sesspayclear'].includes(a)) {
    if (!canAdmin()) { closeSheet(); toast('Club admins set pay rates'); return; }
    if (a === 'sesspay') { payForm = { uid: d.v, per: (payOf(d.v) || {}).per || 'hour' }; sheetPay(); return; }
    if (!payForm) return;
    if (a === 'sesspayper') { payForm.per = d.v === 'session' ? 'session' : 'hour'; sheetPay(); return; }
    if (a === 'sesspayclear') { sessPut('pay/' + payForm.uid, null); payForm = null; closeSheet(); render(); toast('Rate removed'); return; }
    const rate = Number(String(($('#payRate') || {}).value || '').replace(/[^0-9.]/g, ''));
    if (!(rate >= 0) || String(($('#payRate') || {}).value || '').trim() === '') { toast('Give a rate'); return; }
    sessPut('pay/' + payForm.uid, { rate: Math.round(rate * 100) / 100, per: payForm.per });
    payForm = null; closeSheet(); render(); toast('Saved'); return;
  }

  /* -- drills -- */
  if (a === 'sessdrills') { ui.sessDrillQ = ''; sheetSessDrills(s.id); return; }
  if (a === 'sessdrillq') { ui.sessDrillQ = String(($('#sessDrillQ') || {}).value || '').slice(0, 60); sheetSessDrills(s.id); return; }
  if (['sessdrilladd', 'sessdrillrm', 'sessdrillmin'].includes(a)) {
    const L = drillLib(); if (!L) return;
    const blocks = clone(splanBlocks(s.id)), i = Number(d.i);
    if (a === 'sessdrilladd') {
      const dr = L.DRILLS.find(x => x.id === d.v); if (!dr) return;
      blocks.push({ drill: { shelf: 'builtin', id: dr.id, v: L.version }, name: dr.name, minutes: midMinutes(dr), note: '' });
    }
    if (a === 'sessdrillrm' && blocks[i]) blocks.splice(i, 1);
    if (a === 'sessdrillmin' && blocks[i]) blocks[i].minutes = clamp((Number(blocks[i].minutes) || 10) + (Number(d.d) || 0), 1, 240);
    sessPut('splans/' + s.id, { blocks, by: by(), at: nowMs() });
    sheetSessDrills(s.id); return;
  }

  /* -- telling families -- */
  if (a === 'sesstell') { openReach(s); return; }
  if (a === 'reachcopy' || a === 'reachdm') {
    if (!reach) return;
    const el = $('#reachText');
    const text = String((el && typeof el.value === 'string' && el.value.trim()) ? el.value : reach.text).trim().slice(0, MSG_MAX);
    if (a === 'reachcopy') { navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Could not copy — select it by hand')); return; }
    if (!msgOn() || !msgFor) { toast('Messages are not connected on this phone'); return; }
    let n = 0;
    for (const { tid, fam } of reach.dms) if (isStaff(tid)) { queueMsg('dm', tid, fam, text); n++; }
    reach = null; closeSheet(); render(); toast(`Sent to ${n} famil${n === 1 ? 'y' : 'ies'}`); return;
  }

  /* -- fields -- */
  if (a === 'fieldopen') { sheetField(d.id); return; }
  if (a === 'fieldnew' || a === 'fieldfromtext') { ui.view = 'sessions'; u.tab = 'fields'; fieldForm = fieldFormOf(null, a === 'fieldfromtext' ? d.v : ''); sheetFieldForm(); return; }
  if (a === 'fieldedit') { const f = fieldById(d.id); if (!f) return; fieldForm = fieldFormOf(f); sheetFieldForm(); return; }
  if (['fieldpermit', 'fieldpermitrm', 'fieldday', 'fieldsurface', 'fieldlights'].includes(a)) {
    const f = fieldForm; if (!f) return;
    fieldFormRead();
    const i = Number(d.i);
    if (a === 'fieldpermit') f.permits.push({ id: uid(), days: [], start: '', end: '', from: '', until: '', ref: '', note: '' });
    if (a === 'fieldpermitrm') f.permits.splice(i, 1);
    if (a === 'fieldday' && f.permits[i]) { const n = Number(d.v); const ds = f.permits[i].days; f.permits[i].days = ds.includes(n) ? ds.filter(x => x !== n) : [...ds, n].sort(); }
    if (a === 'fieldsurface') f.surface = f.surface === d.v ? '' : String(d.v);
    if (a === 'fieldlights') f.lights = !f.lights;
    sheetFieldForm(); return;
  }
  if (a === 'fieldsave') {
    const f = fieldForm; if (!f) return;
    fieldFormRead();
    const name = String(f.name || '').trim().slice(0, 80);
    if (!name) { toast('Give the field a name'); return; }
    const id = f.id || uid();
    const permits = {};
    for (const p of f.permits) {
      if (!p.days.length) continue;
      const pid = p.id || uid();
      permits[pid] = { id: pid, days: [...p.days].sort(), start: hm(p.start), end: hm(p.end), from: okDay(p.from) ? p.from : '', until: okDay(p.until) ? p.until : '',
        ref: String(p.ref || '').trim().slice(0, 60), note: String(p.note || '').trim().slice(0, 120) };
    }
    const dropped = f.permits.filter(p => !p.days.length).length;
    quiet(`access/org/venues/${id}`, JSON.parse(JSON.stringify({
      id, name, address: String(f.address || '').trim().slice(0, 160), pitches: clamp(Math.round(Number(f.pitches)) || 1, 1, 20),
      surface: f.surface || '', lights: !!f.lights, notes: String(f.notes || '').trim().slice(0, 1000), permits
    })));
    saveLocal(); fieldForm = null; sheetField(id); render();
    toast(dropped ? `Saved · ${dropped} permit${dropped === 1 ? '' : 's'} with no days left off` : 'Saved'); return;
  }
  if (a === 'fielddel') {
    const f = fieldForm; if (!f || !f.id) return;
    if (!confirm(`Delete ${f.name || 'this field'}? Sessions at it keep their place name.`)) return;
    // a session that named it keeps the words, so its families still know where to go
    for (const x of sessAll()) if (x.field === f.id && canRun(x)) sessPut('sessions/' + x.id, { ...sess.sessions[x.id], field: '', place: [f.name, x.place].filter(Boolean).join(', ').slice(0, 120) });
    delDeep(state, `access/org/venues/${f.id}`); remoteDel(`access/org/venues/${f.id}`); saveLocal();
    fieldForm = null; closeSheet(); render(); toast('Deleted'); return;
  }
}

function openReach(s) {
  const pids = bookingsOf(s.id).filter(x => x.st === 'in' || x.st === 'wait' || x.st === 'asked').map(x => x.pid);
  reach = { title: `${s.called ? CALLED[s.called] + ': ' : ''}${sessTitle(s)}, ${dayLabel(s.date)}`, text: sessMessage(s), ...reachFor(pids) };
  sheetReach();
}

function saveSessForm() {
  sessFormRead();
  const f = sessForm; if (!f) return;
  if (!okDay(f.date)) { toast('Pick a date'); return; }
  if (!hm(f.start) || !hm(f.end)) { toast('Give it a start and an end — the hours and the clash check need both'); return; }
  if (!canAdmin() && gated() && !(me && isCoachAny(me.uid))) { closeSheet(); toast('That is for coaches and admins'); return; }
  // a coach runs what she makes; only an admin names somebody else
  const coach = canAdmin() && f.coach ? f.coach : (me ? me.uid : (f.coach || 'device'));
  const ns = sessFromForm({ ...f, coach });
  const fields = {
    kind: ns.kind, title: ns.title, coach, coachName: personName(coach) || (me && coach === me.uid ? whoAmI() : '') || 'Coach',
    start: ns.start, end: ns.end, field: ns.field, place: ns.place, cap: ns.cap, ages: ns.ages, price: ns.price, open: ns.open,
    focus: ns.focus, notes: ns.notes
  };
  const tidy = o => { for (const k of Object.keys(o)) if (o[k] === null || o[k] === '' || o[k] === undefined) { if (!['title', 'place', 'focus', 'notes', 'field'].includes(k)) delete o[k]; } return o; };
  if (f.id) {
    const cur = sessById(f.id); if (!cur || !canRun(cur)) { closeSheet(); toast('Only the coach running it, or an admin, can change that'); return; }
    const list = f.scope === 'later' && cur.series ? sessSeries(cur).filter(x => x.date >= cur.date && canRun(x)) : [cur];
    for (const x of list) {
      const raw = { ...sess.sessions[x.id] };
      delete raw.ages;
      sessPut('sessions/' + x.id, tidy({ ...raw, ...fields, ...(x.id === f.id ? { date: f.date } : {}), at: nowMs() }));
    }
    sessForm = null; sheetSess(f.id); render();
    toast(list.length > 1 ? `Saved ${list.length}` : 'Saved'); return;
  }
  const dates = f.repeat ? seriesDates(f.date, f.until, f.days.length ? f.days : [weekdayOf(f.date)]) : [f.date];
  if (!dates.length) { toast('No days between those dates'); return; }
  const series = dates.length > 1 ? uid() : null;
  let first = null;
  for (const date of dates) {
    const id = uid();
    sessPut('sessions/' + id, tidy({ id, ...fields, date, ...(series ? { series } : {}), by: me ? me.uid : null, made: nowMs(), at: nowMs() }));
    first = first || id;
  }
  sessForm = null;
  const u = sessUi(); ui.view = 'sessions'; u.tab = 'list';
  render(); sheetSess(first);
  toast(dates.length > 1 ? `Added ${dates.length} sessions` : 'Added — now add players, or leave it open for families');
}

function viewSetup() {
  const code = localStorage.getItem(LS_WS) || '';
  const cfgOk = !!fbConfig().apiKey;
  const r = myRole();
  return `<div class="stack">
    <div class="card"><h2 style="margin-bottom:8px">Account</h2>
      <div class="spread"><span>${me ? `<b>${esc(me.name)}</b><span class="rowsub">${esc(me.email || '')}</span>` : 'Not signed in'}</span>
      <button class="btn quiet sm" data-act="signinsheet">${me ? 'Manage' : 'Sign in'}</button></div>
      ${me ? `<p class="muted">You are <b>${esc(ROLE_LABEL[r] || 'not assigned a role')}</b>${r && r !== 'owner' && r !== 'admin' ? ` for ${teamLabel(team() || {})}` : ''}.</p>
      <p class="lbl">Your account id</p>
      <div class="codebox">${esc(me.uid)}</div>
      <button class="btn quiet sm" data-act="copylink" data-v="${esc(me.uid)}">Copy id</button>
      <p class="muted"${canTrain() || isOwner() ? '' : ' style="margin-bottom:0"'}>Needed once, to be made app owner in the Firebase console.</p>
      ${canTrain() ? `<button class="btn quiet wide" data-act="mydrills">My drills</button>` : ''}
      ${isOwner() ? `<button class="btn quiet wide" data-act="peeklib" style="margin-top:8px">Look at someone's drills, for support</button>` : ''}`
      : '<p class="muted" style="margin-bottom:0">Signed out, everything stays on this device. Sign in to share it with your club.</p>'}</div>

    <div class="card"><h2 style="margin-bottom:8px">Workspace</h2>
      <p class="muted" style="margin-top:0">Firebase config is ${cfgOk ? 'in place' : 'not filled in — see README.md'}.</p>
      <p class="muted"${isOwner() ? '' : ' style="margin-bottom:0"'}>${code ? 'Connected. Clubs are invite only — an admin sends you a link, there is no code to type.' : 'Not connected to a club yet. Open the invite link a club admin sent you to join one.'}</p>
      ${!code && Object.keys(myClubs || {}).length ? `<button class="btn wide" data-act="clubswitch" style="margin-bottom:10px">Your clubs</button>` : ''}
      ${isOwner() ? `<button class="btn quiet wide" data-act="setwscode">${code ? 'Change workspace code' : 'Connect to a workspace'}</button>
      <p class="muted">Owner-only stopgap until per-person invites exist — nobody else sees this.</p>
      <div class="row"><button class="btn quiet" data-act="envsheet">Database: ${esc(envName() || 'production')}</button>
      <button class="btn quiet" data-act="maketestclub">Make a test club</button></div>
      <p class="muted" style="margin-bottom:0">A test club is invented data with publishing switched off — safe to grant roles in, take apart and retire. Rules belong to a database rather than to a club, though, so a rules change has to be rehearsed in another database, not just another club.</p>` : ''}</div>

    ${(() => {
      const n = fb ? pendingCount() : 0, lo = localOnlyData();
      const pend = n ? `<div class="card"><h2 style="margin-bottom:8px">Waiting to reach the club</h2>
        <p class="muted" style="margin-top:0">${n} change${n === 1 ? '' : 's'} made on this phone ${n === 1 ? "hasn't" : "haven't"} reached the club yet. ${n === 1 ? 'It goes' : 'They go'} the moment there's a signal, even if the app is closed and opened again in between.</p>
        <button class="btn quiet wide" data-act="pendingsheet">See what's waiting</button></div>` : '';
      const old = lo ? `<div class="card"><h2 style="margin-bottom:8px">On this phone only</h2>
        <p class="muted" style="margin-top:0">This phone has ${esc(importSummary(lo.plan.counts).replace(/^adds /, ''))} from before it joined this club, kept on this phone and nowhere else.</p>
        ${canAdmin() ? `<button class="btn quiet wide" data-act="adoptlocal">Add them to the club</button>`
          : '<p class="muted" style="margin-bottom:0">A club admin can add them to the club, signed in on this phone.</p>'}</div>` : '';
      return pend + old;
    })()}

    <div class="card"><h2 style="margin-bottom:8px">Share with parents</h2>
      <p class="muted" style="margin-top:0">Read-only pages showing shirt numbers, never names.</p>
      <button class="btn quiet wide" data-act="sharesheet">${team() && team().share ? 'Manage links' : 'Set up sharing'}</button></div>

    <div class="card"><h2 style="margin-bottom:8px">Version</h2>
      <div class="spread"><span>Build <b>v${BUILD}</b> <span class="muted">· ${BUILT}</span></span>
        <button class="btn quiet sm" data-act="hardreload">Force refresh</button></div>
      ${stale() ? `<div class="warn alert" style="margin-top:10px">This page is cached at v${esc(pageBuild())} but the code is v${BUILD}. Force refresh to catch up.</div>`
      : '<p class="muted" style="margin-bottom:0">Page and code agree, so you are on the latest push.</p>'}</div>

    ${canAdmin() ? `<div class="card"><h2 style="margin-bottom:8px">Backup</h2>
      <div class="row"><button class="btn quiet" data-act="export">Download a copy</button>
      <button class="btn quiet" data-act="import">Load from a file</button></div>
      <p class="muted" style="margin-bottom:0">Every team, game and sub as a JSON file. Admins only — it contains every child's name, so it is not something to hand out. Loading one adds whatever this club is missing and keeps everything already here.</p></div>` : ''}
  </div>`;
}

/* --- admin: the club, its teams and who may touch them --- */
function viewAdmin() {
  if (!canAdmin()) return `<div class="empty"><strong>Club admins only</strong>
    ${me ? 'Your account does not have admin rights for this club.' : 'Sign in with an admin account.'}</div>`;
  const org = (acc().org || {});
  const nAdmins = Object.keys(acc().admins || {}).length;
  return `<div class="stack">
    <h2>Club admin</h2>
    <div class="card"><h2 style="margin-bottom:8px">Details</h2>
      <div class="row" style="margin-bottom:10px">
        ${clubCrest()}
        <span style="flex:1"><button class="btn quiet sm" data-act="pickorglogo">${org.logo ? 'Change badge' : 'Add a badge'}</button></span>
      </div>
      <label class="field"><span>Name</span><input type="text" id="orgName" value="${esc(org.name || '')}" placeholder="Lakeside Soccer Club"></label>
      <button class="btn quiet wide" data-act="saveorg">Save</button></div>

    ${isOwner() && Object.keys(retiredClubs).length ? `<div class="card"><h2 style="margin-bottom:8px">Retired clubs</h2>
      <p class="muted" style="margin-top:0">Closed but not deleted. Everyone else's devices have let go of these; yours has not, so you can still open one and export it. Removing the data is a Firebase console job, whenever you decide.</p>
      <div class="plist">${Object.entries(retiredClubs).map(([code, r]) => `<div class="prow" style="grid-template-columns:1fr auto">
        <span><span class="pname">${esc((r && r.name) || code)}</span>
          <span class="psub">Retired ${r && r.at ? new Date(r.at).toLocaleDateString() : 'unknown'}${r && r.byName ? ' by ' + esc(r.byName) : ''}</span></span>
        ${code === wsCode() ? '<span class="muted">open now</span>'
      : `<button class="btn quiet sm" data-act="switchclub" data-code="${esc(code)}">Open</button>`}</div>`).join('')}</div></div>` : ''}

    <div class="card"><h2 style="margin-bottom:8px">Retire this club</h2>
      <p class="muted" style="margin-top:0">Marks it closed. Every device holding a copy clears it on next connect — except the app owner's, so it can still be opened and exported. <b>Nothing is deleted.</b> The data stays until the app owner removes it in the Firebase console.</p>
      <button class="btn danger wide" data-act="retireclub">Retire ${esc((acc().org || {}).name || 'this club')}</button></div>

    <div class="card"><h2 style="margin-bottom:8px">Check readiness</h2>
      <p class="muted" style="margin-top:0">What the club needs for the rules to work as designed. A cross is a lookup table the app hasn't written yet, or a way to be locked out of your own club, and none of them show up until somebody tries to change something at a game.</p>
      <div class="plist">${readiness().map(r => `<div class="prow" style="grid-template-columns:auto 1fr auto">
        <span class="pnum">${r.ok ? '\u2713' : '\u2717'}</span>
        <span><span class="pname">${esc(r.label)}</span><span class="psub">${esc(r.detail)}</span></span>
        <span class="muted">${r.ok ? '' : 'fix'}</span></div>`).join('')}</div>
      <div style="margin-top:10px"><button class="btn quiet wide" data-act="preplockdown">Build the lookup tables</button></div>
      <p class="muted" style="margin-bottom:0">Writes <code>access/teamIndex</code> for every team that has a coach or tracker, and an owner list for every published share. The tighter rules read both, so this has to run — and sync — <b>before</b> you paste them.</p></div>

    <div class="card"><h2 style="margin-bottom:8px">People</h2>
      ${nAdmins ? `<p class="muted" style="margin-top:0">${members().length} signed in · ${nAdmins} admin${nAdmins === 1 ? '' : 's'}.</p>
        <button class="btn quiet wide" data-act="people">People and roles</button>`
      : isOwner() ? `<p class="muted" style="margin-top:0">Nobody administers this club yet. As app owner you can take it, or grant it to someone in People.</p>
        <button class="btn wide" data-act="claimadmin">Make me the club admin</button>`
      : `<p class="muted" style="margin-top:0">Nobody administers this club yet. Ask the app owner to set the first admin.</p>`}
      <p class="muted" style="margin-bottom:0">Parents are not assigned here — they become one by being linked to a player.</p></div>

    <div class="card"><h2 style="margin-bottom:8px">Teams</h2>
      <div class="plist">${teams().map(t => `<button class="prow" type="button" data-act="editteam" data-id="${t.id}" style="grid-template-columns:auto 1fr auto">
        ${t.logo ? `<img class="crest sm" src="${esc(t.logo)}" alt="">` : '<span class="pnum">—</span>'}
        <span><span class="pname">${teamLabel(t)}</span><span class="rowsub">${teamStats(t)}</span></span>
        <span class="muted">Edit</span></button>`).join('') || '<p class="muted" style="margin:0">No teams yet.</p>'}</div>
      <div style="margin-top:10px"><button class="btn quiet wide" data-act="newteam">Add a team</button></div></div>

    <div class="card"><h2 style="margin-bottom:8px">Fields and permits</h2>
      <p class="muted" style="margin-top:0">${fieldList().length ? `${fieldList().length} field${fieldList().length === 1 ? '' : 's'}.` : 'None yet.'} The places the club trains, the permits you hold for each and when, and what is booked on them.</p>
      <button class="btn quiet wide" data-act="sesstab" data-k="fields">Fields</button></div>
    <div class="card"><h2 style="margin-bottom:8px">Club drills</h2>
      <p class="muted" style="margin-top:0">${(() => { const n = shelfItems('club').length; return n ? `${n} drill${n === 1 ? '' : 's'} the club's coaches have shared.` : 'None yet. Coaches share their own drills into it, and you can tidy or remove any of them.'; })()} Coaches and admins see them; trackers and parents never do.</p>
      <button class="btn quiet wide" data-act="clubdrills">Look after the club's drills</button></div>

    <div class="card"><h2 style="margin-bottom:8px">Bulk import</h2>
      <p class="muted" style="margin-top:0">A whole season at once — teams, rosters, fixtures, past results, the club's fields and permits, and training sessions — from one JSON file. It adds and updates, and never removes anything.</p>
      <button class="btn quiet wide" data-act="bulkimport">Import teams, games, fields and sessions</button></div>

    ${aiButton('club')}
  </div>`;
}

/* ---------------- ticking ---------------- */
/* A number that depends on the wall clock is tagged where it is drawn —
   data-live names what it is, data-mid / data-pid / data-tid say whose — and
   the ticker below rewrites it in place. Every screen that shows time played
   uses it: Stats (which is all a parent gets), the games list, My players, the
   game picker. Before this only the Live and Track cards moved, and a parent
   watching Stats saw a clock stuck at whatever it read when the page drew. */
function liveReading(kind, d, now = nowMs()) {
  const m = d.mid ? state.matches[d.mid] : null;
  const ms = d.tid ? teamMatches(d.tid) : [];
  const season = f => ms.reduce((a, x) => a + f(x), 0);
  if (kind === 'clock') return m ? mmss(elapsedSec(m, now)) : null;
  if (kind === 'gmins') return m ? String(mins(elapsedSec(m, now))) : null;
  if (kind === 'pmins') return m ? String(mins(playedSec(m, d.pid, now))) : null;
  if (kind === 'smins') return d.tid ? String(mins(season(x => playedSec(x, d.pid, now)))) : null;
  if (kind === 'diff' || kind === 'sdiff') {
    const pl = kind === 'diff' ? (m ? playedSec(m, d.pid, now) : 0) : season(x => playedSec(x, d.pid, now));
    const pd = kind === 'diff' ? (m ? plannedSec(m, d.pid) : 0) : season(x => plannedSec(x, d.pid));
    return diffTag(pl, pd);
  }
  return null;
}
/* "3 owed" / "on plan" beside a minutes total; empty when nothing is planned. */
function diffTag(pl, pd) {
  if (!(pd > 0)) return '';
  const diff = Math.round((pl - pd) / 60);
  return `<span class="diff ${diff < 0 ? 'owed' : 'over'}">${diff < 0 ? -diff + ' owed' : diff > 0 ? diff + ' over' : 'on plan'}</span>`;
}
function tickLive(now = nowMs()) {
  for (const el of document.querySelectorAll('[data-live]')) {
    const v = liveReading(el.dataset.live, el.dataset, now);
    if (v != null && el.innerHTML !== v) el.innerHTML = v;
  }
}

/* The game screens have all been ui.view === 'game' since the tabs moved inside
   a game; this used to test for the old top-level names, so it never ran and a
   clock only moved when something else redrew the page. */
setInterval(() => {
  if (ui.dragging) return;
  tickLive();
  watchFeed();
  tickRun();
  if (ui.view !== 'game') return;
  const m = match(); if (!m || !running(m)) return;
  const t = team(); if (!t) return;
  const now = nowMs();
  const c = $('#clock'); if (c) c.textContent = mmss(elapsedSec(m, now));
  const h = $('#halfclock'); if (h) h.textContent = mmss(halfSec(m, now));
  /* The planned-subs card counts down in place, and redraws when it changes
     state — "coming up" grows a button, "due" turns loud — with a buzz, since
     the phone is as likely to be in a pocket as in a hand. */
  const card = $('#subsdue');
  if (card) {
    const s = subsDue(m, now);
    const k = s ? (s.kind === 'over' ? 'over' : `${s.kind}:${s.b.start}`) : 'none';
    if (card.dataset.k !== k) {
      render();
      if (s && (s.kind === 'due' || s.kind === 'soon')) { try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { } }
      return;
    }
    const sc = card.querySelector('[data-subsclock]');
    if (sc && s && s.b) sc.textContent = subsClock(m, s.b, s.until);
  }
  for (const p of players(t)) {
    const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
    const a = document.querySelector(`[data-mins="${p.id}"]`);
    if (a) a.innerHTML = `${mins(pl)}<small> min</small>`;
    const b = document.querySelector(`[data-tokmins="${p.id}"]`);
    if (b) b.textContent = mins(pl) + '′';
    const sp = document.querySelector(`[data-spell="${p.id}"]`);
    if (sp) {
      const on = spellSec(m, p.id, now), off = restSec(m, p.id, now);
      sp.textContent = on != null ? 'on ' + mmss(on) : off != null ? 'off ' + mmss(off) : 'not on yet';
    }
    const bar = document.querySelector(`[data-bar="${p.id}"]`);
    if (bar && pd > 0) {
      bar.style.width = clamp(pl / pd * 100, 0, 100) + '%';
      bar.dataset.owed = pl < pd - 60 ? 1 : 0;
      bar.dataset.over = pl > pd + 60 ? 1 : 0;
    }
  }
}, 1000);

/* ---------------- drag ---------------- */
function draggable(pitch, el, onDrop, onTap) {
  el.addEventListener('pointerdown', e => {
    let moved = false;
    const rect = pitch.getBoundingClientRect();
    const at = ev => ({
      x: clamp((ev.clientX - rect.left) / rect.width * 100, 4, 96),
      y: clamp((ev.clientY - rect.top) / rect.height * 100, 4, 96)
    });
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    ui.dragging = true;
    const move = ev => {
      if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 6) moved = true;
      if (!moved) return;
      const p = at(ev);
      el.style.left = p.x + '%'; el.style.top = p.y + '%';
    };
    const up = ev => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      ui.dragging = false;
      if (moved) onDrop(at(ev)); else onTap();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

function wireDrag() {
  const pitch = $('#pitch'); if (!pitch) return;
  const m = match(); if (!m) return;
  for (const tok of pitch.querySelectorAll('.token')) {
    const pid = tok.dataset.pid;
    draggable(pitch, tok,
      p => commit(`matches/${m.id}/positions/${pid}`, { ...((m.positions || {})[pid] || {}), x: p.x, y: p.y }),
      () => tapPlayer(pid));
  }

  /* click, not pointerdown: the grass scrolls the page now, and a thumb that
     lands on it to scroll must not drop the picked player where it landed. A
     click only arrives for a tap that did not turn into a scroll. */
  pitch.addEventListener('click', e => {
    if (e.target.closest('.token') || e.target.closest('.ghost')) return;
    if (!ui.picked || onField(m, ui.picked)) return;
    if (fieldIds(m).length >= (m.onFieldCount || 11)) { toast('Pitch is full — tap a player to swap'); return; }
    const rect = pitch.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width * 100, 4, 96);
    const y = clamp((e.clientY - rect.top) / rect.height * 100, 4, 96);
    const pid = ui.picked; ui.picked = null;
    putOnField(m, pid, x, y, null);
    const p = (team().players || {})[pid];
    if (p) toast(p.name + ' on at ' + mins(elapsedSec(m)) + '′');
  });
}

function wireFormationDrag() {
  const pitch = $('#fpitch'); if (!pitch) return;
  const tg = shapeTarget(); if (!tg) return;
  for (const el of pitch.querySelectorAll('.slotok')) {
    const sid = el.dataset.sid;
    draggable(pitch, el, p => {
      const slots = (tg.f.slots || []).map(s => s.id === sid ? { ...s, x: p.x, y: p.y } : s);
      commit(`${tg.path}/slots`, slots);
    }, () => sheetSlot(sid));
  }
}

function tapPlayer(pid) {
  const m = match(); if (!m) return;
  const t = team(); const p = (t.players || {})[pid]; if (!p) return;

  if (!ui.picked) { ui.picked = pid; render(); return; }
  if (ui.picked === pid) { ui.picked = null; render(); return; }

  const a = ui.picked, b = pid;
  const aOn = onField(m, a), bOn = onField(m, b);
  ui.picked = null;

  if (aOn && bOn) { // swap positions on the pitch
    const pa = posOf(m, a), pb = posOf(m, b);
    setDeep(state, `matches/${m.id}/positions/${a}`, pb); remoteSet(`matches/${m.id}/positions/${a}`, pb);
    setDeep(state, `matches/${m.id}/positions/${b}`, pa); remoteSet(`matches/${m.id}/positions/${b}`, pa);
    saveLocal(); render(); return;
  }
  if (!aOn && !bOn) { ui.picked = b; render(); return; }
  const outPid = aOn ? a : b, inPid = aOn ? b : a;
  swap(m, outPid, inPid);
  const pin = (t.players || {})[inPid], pout = (t.players || {})[outPid];
  toast(`${pin.name} on for ${pout.name} at ${mins(elapsedSec(m))}′`);
}

/* ---------------- public mirror ---------------- */
/* Published to its own node under a share id. Contains shirt numbers and never
   a name, so the public tier is private by construction rather than by the UI
   choosing to hide things. */
/* A club with no badge still gets a mark, so the header never looks unfinished. */
const BALL = `<span class="crest ball" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
  <circle cx="12" cy="12" r="9.2"/><path d="M12 6.6l3.6 2.6-1.4 4.2h-4.4L8.4 9.2z"/>
  <path d="M12 2.8v3.8M20.7 9.2l-5.1 0M18.5 19.2l-4.3-5.8M5.5 19.2l4.3-5.8M3.3 9.2l5.1 0"/></svg></span>`;
const clubCrest = (cls = '') => {
  const l = (acc().org || {}).logo;
  return l ? `<img class="crest ${cls}" src="${esc(l)}" alt="">` : BALL.replace('crest ball', `crest ball ${cls}`);
};
/* A team falls back to the club badge, which is usually what a coach wants. */
const teamCrest = (t, cls = '') => t && t.logo
  ? `<img class="crest ${cls}" src="${esc(t.logo)}" alt="">`
  : clubCrest(cls);

const chipName = p => `${p.number ? esc(p.number) + ' ' : ''}${esc(p.name)}`;
const shirtOf = p => String((p && p.number) ?? '').trim() || '–';
const gameStatus = m => m.ended ? 'done'
  : (m.currentHalf || 1) > (m.periodCount || 2) ? 'done'
  : (elapsedSec(m) > 0 || running(m)) ? 'live' : 'upcoming';

function publicGame(t, m) {
  const roster = squad(t, m);
  const numOf = pid => shirtOf((t.players || {})[pid]);
  return {
    id: m.id,
    opponent: m.opponent || '', date: m.date || '', kickoff: m.kickoff || '', venue: m.venue || '',
    home: HOME_AWAY[m.home] ? m.home : '', arrive: hm(m.arrive), called: CALLED[m.called] ? m.called : '',
    kit: pubText(t, m.kit), notes: pubText(t, m.notes),
    periodCount: m.periodCount || 2, periodMinutes: m.periodMinutes || 40,
    currentHalf: m.currentHalf || 1, periods: m.periods || {},
    status: gameStatus(m), score: score(m), shots: shotTally(m),
    events: Object.fromEntries(EVENTS.map(e => [e.k, { us: evCount(m, e.k, 'us'), them: evCount(m, e.k, 'them') }])
      .filter(([, v]) => v.us + v.them > 0)),
    poss: (() => { const p = possession(m); return { us: p.us, them: p.them, contested: p.contested, changes: p.changes }; })(),
    players: roster.map(p => ({
      n: shirtOf(p), sec: playedSec(m, p.id), on: onField(m, p.id),
      spot: currentSpot(m, p.id) || null, plan: (m.planned || {})[p.id] || 0
    })).sort((a, b) => (Number(a.n) || 999) - (Number(b.n) || 999)),
    goals: goalList(m).map(g => ({ t: g.t, side: g.side, n: g.pid ? numOf(g.pid) : null })),
    log: subEvents(m).map(r => ({
      t: r.t, on: r.on ? numOf(r.on) : null, off: r.off ? numOf(r.off) : null,
      move: !!r.move, spot: r.spot || null
    }))
  };
}

function publicDoc(t) {
  const games = {};
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of teamMatches(t.id)) {
    const g = publicGame(t, m);
    games[m.id] = g;
    if (g.status === 'done') {
      gf += g.score.us; ga += g.score.them;
      if (g.score.us > g.score.them) w++; else if (g.score.us === g.score.them) d++; else l++;
    }
  }
  return {
    team: { name: t.name || 'Team', logo: t.logo || null },
    // Deliberately NOT the workspace id. public/ is world-readable, and while the
    // rules are open that id is the password to the whole club. The page only
    // needs somewhere to send a signed-in visitor; the app decides what they see.
    link: { teamId: t.id, app: shareBase() + 'index.html' },
    games, events: publicEvents(t), record: { w, d, l, gf, ga }, updated: nowMs()
  };
}

/* Only what a coach marked for the share link, and only the fields a family
   needs to turn up: no series id, no author, no note of who added it. Free
   text goes through pubText() like the game's own notes. `all` is the members'
   calendar feed, which carries the team-only entries too — see calendarDoc(). */
function publicEvents(t, all) {
  const out = {};
  for (const [id, e] of Object.entries(t.events || {})) {
    if (!e || !(e.public || all) || !okDay(e.date)) continue;
    const kind = e.kind === 'practice' ? 'practice' : 'event';
    out[id] = {
      kind, title: pubText(t, e.title) || CAL_KIND[kind], date: e.date,
      start: hm(e.start), end: hm(e.end), venue: pubText(t, e.venue), notes: pubText(t, e.notes),
      called: CALLED[e.called] ? e.called : ''
    };
  }
  return out;
}

/* One game, alone. This is what a game link opens, so the other team (and
   whoever they forward it to) holds that game and nothing else: no season, no
   record, no other fixtures, no practices. `fixture` tells the page there is no
   season to go back to. */
function fixtureDoc(t, m) {
  return {
    team: { name: t.name || 'Team', logo: t.logo || null },
    link: { teamId: t.id, app: shareBase() + 'index.html' },
    fixture: m.id, games: { [m.id]: publicGame(t, m) }, updated: nowMs()
  };
}

/* The members' calendar feed: every game and every entry, team-only ones
   included, because a subscribed calendar without practices in it is not the
   calendar. It is still public/ — the calendar app that fetches it signs in as
   nobody — so it holds what a family needs to turn up and nothing else: no
   players, no minutes, no shirt numbers, and free text through pubText(). What
   keeps team-only entries off the open web is the id, which the app shows only
   to the team's signed-in members, and which a coach can replace at any time. */
function calendarDoc(t) {
  const games = {};
  for (const m of teamMatches(t.id)) games[m.id] = {
    id: m.id, opponent: m.opponent || '', date: m.date || '', kickoff: m.kickoff || '', venue: m.venue || '',
    home: HOME_AWAY[m.home] ? m.home : '', arrive: hm(m.arrive), called: CALLED[m.called] ? m.called : '',
    kit: pubText(t, m.kit), notes: pubText(t, m.notes), status: gameStatus(m), score: score(m),
    periodCount: m.periodCount || 2, periodMinutes: m.periodMinutes || 40
  };
  return {
    team: { name: t.name || 'Team', logo: t.logo || null },
    link: { teamId: t.id, app: shareBase() + 'index.html' },
    calendar: true, games, events: publicEvents(t, true), updated: nowMs()
  };
}

let pubTimer;
let pubSeen = {};                           // what each public id last carried, so unchanged ones are not rewritten
let pubState = { at: null, error: null };   // surfaced in the share sheet
let denied = false;                         // rules refused us; show the door
let purged = null;                          // 'access' | 'retired'
let retiredClubs = {};                      // app owner's view of what is closed
function schedulePublish() {
  const t = team();
  /* A rehearsal must never reach public/. That tier is world-readable and keyed
     by share id, so a seeded club carrying a copied share would quietly serve
     invented scores to families holding a real link. Checked here rather than at
     the call sites: every write path funnels through this one function. */
  if (isSandbox()) { pubState = { at: null, error: 'Test club — nothing is published' }; return; }
  if (!fb) { pubState = { at: null, error: 'Not connected to Firebase' }; return; }
  if (!t || !(t.share || t.calFeed)) return;
  /* The public write rule checks shareOwners/{share}. A share made before that
     node existed has none, and the rule lets an unclaimed share through only
     until someone claims it — so claim it here, on the way past. Publishing is
     the one thing only a coach or admin of this team ever does. */
  if (canEditTeam(t.id)) { if (t.share) claimShare(t.id); ensureFixtureShares(t); claimTeamIds(t.id); }
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => publishTeam(t), 1200);
}

/* The season link is written every time, as it always was: it is the one the
   share sheet reports on, and a republish on load is what heals a fixed
   config. A game's own page and the calendar feed are written only when what
   they carry has changed, or a sub tap would rewrite thirty fixtures. */
function publishTeam(t) {
  const docs = [];
  let mainWrite = null;
  if (t.share) {
    docs.push([t.share, publicDoc(t), true]);
    for (const m of teamMatches(t.id)) if (m.share) docs.push([m.share, fixtureDoc(t, m), false]);
  }
  if (t.calFeed) docs.push([t.calFeed, calendarDoc(t), false]);
  for (const [id, doc, main] of docs) {
    const sig = JSON.stringify({ ...doc, updated: 0 });
    if (!main && pubSeen[id] === sig) continue;
    pubSeen[id] = sig;
    // try/catch does not catch this — set() rejects asynchronously
    const w = fb.set(fb.ref(fb.db, 'public/' + id), doc)
      .then(() => { if (main) pubState = { at: nowMs(), error: null }; })
      .catch(e => {
        delete pubSeen[id];        // try again next time rather than believe it landed
        console.error('publish failed', e);
        if (!main) return;
        const code = (e && e.code) || (e && e.message) || 'unknown';
        pubState = {
          at: null,
          error: /permission|denied/i.test(code)
            ? 'Firebase rejected the write. Realtime Database needs a "public" rules block alongside "workspaces" — see README.'
            : String(code)
        };
        render();
      });
    if (main) mainWrite = w;
  }
  return mainWrite;     // settles once the season page has landed or been refused; the share sheet waits on it
}

const shareBase = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const teamLink = t => t.share ? `${shareBase()}live.html?t=${t.share}` : '';
/* A game link carries the game's own id, never the season's: whoever holds it
   — the other team, a group chat it was forwarded to — can open that game and
   nothing else. No id yet means no link yet, rather than a fallback that would
   quietly hand out the season. */
const gameLink = (t, m) => t.share && m.share ? `${shareBase()}game.html?t=${m.share}&g=${m.id}` : '';

/* Firebase error codes are not for humans. */
function authMessage(err) {
  const c = (err && err.code) || '';
  if (c.includes('unauthorized-domain')) return 'This site is not on the authorised domains list in Firebase';
  if (c.includes('operation-not-allowed')) return 'That sign-in method is not switched on in Firebase';
  if (c.includes('invalid-email')) return 'That email does not look right';
  if (c.includes('weak-password')) return 'Password needs to be at least six characters';
  if (c.includes('email-already-in-use')) return 'That email already has an account — sign in instead';
  if (c.includes('wrong-password') || c.includes('invalid-credential')) return 'Wrong email or password';
  if (c.includes('network')) return 'No connection';
  console.warn(err);
  return 'Sign-in failed — ' + (c || 'unknown error');
}

/* ---------------- sheets ---------------- */
function sheetSwitch(pid) {
  const t = team(), m = match();
  const p = (t.players || {})[pid];
  const shape = (m.formation && m.formation.slots) || [];
  const here = ((m.positions || {})[pid] || {}).slot || null;
  const holderOf = sid => {
    const h = fieldIds(m).find(x => x !== pid && slotIdOf(m, x) === sid);
    return h ? (t.players || {})[h] : null;
  };
  openSheet(`<h3>Move ${esc(p.name)}</h3>
    <p class="muted" style="margin-top:0">${ui.plan ? 'Added to the batch — nothing happens until you send it.' : `Recorded at ${mmss(elapsedSec(m))}.`} Her total minutes do not change — they just start counting against the new spot.</p>
    ${roleSummary(m, pid) ? `<p class="muted">So far: ${esc(roleSummary(m, pid))}</p>` : ''}
    ${shape.length ? `<p class="lbl">Spot in the ${esc(m.formation.name)}</p>
      ${shape.map(sl => { const h = holderOf(sl.id); return `<button class="opt spread" type="button" data-act="doswitch" data-pid="${pid}" data-sid="${sl.id}" aria-current="${here === sl.id}">
        <span>${esc(sl.label)} <span class="muted">· ${esc(sl.role)}</span></span>
        <span class="muted">${here === sl.id ? 'here now' : h ? 'swap with ' + esc(h.name) : 'free'}</span></button>`; }).join('')}`
      : `<p class="lbl">Role</p>
      ${ROLES.map(r => `<button class="opt" type="button" data-act="doswitch" data-pid="${pid}" data-role="${r}">${r}</button>`).join('')}`}
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Cancel</button>`);
}

function viewPeople() {
  const t = team();
  const admin = canAdmin();
  const myCoachTeams = teams().filter(x => isCoach(x.id, me && me.uid));
  if (!admin && !myCoachTeams.length) return `<div class="empty"><strong>Coaches and admins only</strong>
    Managing people is limited to whoever runs a team or the club.</div>`;

  const scope = admin ? teams() : myCoachTeams;
  const rolesOf = u => rolesHeld(u.uid, scope);
  const all = members().map(u => {
    const rs = rolesOf(u);
    return { u, rs, none: !rs.length && !isAdmin(u.uid) };
  }).filter(m2 => admin || m2.rs.length || m2.none);

  const F = ui.peopleFilter || 'all';
  const counts = {
    all: all.length,
    pending: all.filter(m2 => m2.none).length,
    coach: all.filter(m2 => m2.rs.some(v => v.r === 'coach')).length,
    tracker: all.filter(m2 => m2.rs.some(v => v.r === 'tracker')).length,
    parent: all.filter(m2 => m2.rs.some(v => v.r === 'parent')).length
  };
  const shown = F === 'all' ? all
    : F === 'pending' ? all.filter(m2 => m2.none)
      : all.filter(m2 => m2.rs.some(v => v.r === F));

  const sortKey = ui.peopleSort || 'name';
  shown.sort((a, b) => sortKey === 'joined'
    ? (b.u.at || 0) - (a.u.at || 0)
    : (a.u.name || '').localeCompare(b.u.name || ''));

  const when = ms => ms ? new Date(ms).toLocaleDateString() : 'unknown';

  return `<div class="stack">
    <div class="spread"><h2>People</h2>
      <button class="btn quiet sm" data-act="peoplesort">${sortKey === 'joined' ? 'By join date' : 'By name'}</button></div>
    <p class="muted" style="margin-top:-6px">${admin ? 'Every account in the club.' : `Accounts on ${esc(myCoachTeams.map(x => x.name).join(', '))}, and anyone new waiting for a role.`}</p>

    ${counts.pending && F !== 'pending' ? `<div class="warn alert"><div class="spread">
      <span><b>${counts.pending} waiting to be let in.</b> They signed in but have no role, so they see nothing yet.</span>
      <button class="btn sm" data-act="peoplefilter" data-v="pending" style="flex:none">Show them</button></div></div>` : ''}

    <div class="chips">
      ${[['all', 'All'], ['pending', 'Waiting'], ['coach', 'Coaches'], ['tracker', 'Trackers'], ['parent', 'Parents']]
      .map(([k, l]) => `<button class="chip" type="button" data-act="peoplefilter" data-v="${k}" aria-pressed="${F === k}">${l} ${counts[k] || 0}</button>`).join('')}
    </div>

    <div class="tablewrap"><table class="grid">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
      <tbody>${shown.map(({ u, rs, none }) => `<tr data-act="personrow" data-uid="${u.uid}">
        <td><b>${esc(u.name || 'Unnamed')}</b>${me && me.uid === u.uid ? ' <span class="muted">you</span>' : ''}</td>
        <td class="dim">${esc(u.email || '')}</td>
        <td>${isAdmin(u.uid) ? '<span class="tag admin">Admin</span>'
      : rs.length ? roleTags(u.uid, scope) : '<span class="tag wait">Waiting</span>'}</td>
        <td class="dim">${when(u.at)}</td>
        <td class="right">${none
        ? `<button class="btn sm" data-act="personedit" data-uid="${u.uid}">Let in</button>`
        : `<button class="btn quiet sm" data-act="personedit" data-uid="${u.uid}">Roles</button>`}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="dim">Nobody matches that filter.</td></tr>'}</tbody>
    </table></div>

    <p class="muted">Tap <b>Roles</b> on anyone to let them in — as a parent of a player, a tracker or a coach. Somebody who signs in on their own waits here with no role and sees nothing until you do.</p>

    ${invitesCard()}

    ${admin ? `<div class="card"><h2 style="margin-bottom:10px">Activity</h2>
      ${auditLog().length ? `<div class="log">${auditLog().slice(0, 30).map(e => `<div style="display:grid;grid-template-columns:1fr auto;gap:10px;padding:7px 0;border-top:1px solid var(--line)">
        <span>${esc(e.byName || 'Someone')} ${esc(e.act)} ${esc(e.targetName || 'someone')}${e.teamName ? ` on ${esc(e.teamName)}` : ''}${e.player ? ` (${esc(e.player)})` : ''}</span>
        <span class="muted">${when(e.at)}</span></div>`).join('')}</div>`
      : '<p class="muted" style="margin:0">Nothing recorded yet. Role changes from now on will show here.</p>'}</div>` : ''}
  </div>`;
}

/* Every role one account holds, one entry per team and role. roleIn() answers
   "what may she do here" and so keeps only the strongest; this is "what has
   she been given", where a coach who is also a parent on the same team is two
   things, and hiding either would make it impossible to take away. */
function rolesHeld(uid, scope) {
  const out = [];
  for (const x of scope) {
    if (!isAdmin(uid) && isCoach(x.id, uid)) out.push({ x, r: 'coach' });
    if (isTracker(x.id, uid)) out.push({ x, r: 'tracker' });
    for (const p of Object.values(x.players || {}))
      if ((p.guardians || {})[uid]) out.push({ x, r: 'parent', p });
  }
  return out;
}

/* The Role column, one tag per kind of role rather than per team: a coach of
   two teams reads "Coach U10, U12", and one of twelve reads "Coach 12 teams"
   instead of a row of tags wider than the phone. */
function roleTags(uid, scope) {
  const by = {};
  for (const v of rolesHeld(uid, scope)) (by[v.r] = by[v.r] || new Set()).add(v.x.name || 'Team');
  return ['coach', 'tracker', 'parent'].filter(r => by[r]).map(r => {
    const names = [...by[r]];
    const what = names.length > 2 ? `${names.length} teams` : names.join(', ');
    return `<span class="tag">${esc(ROLE_LABEL[r])}<i>${esc(what)}</i></span>`;
  }).join('');
}

/* Chips are quicker up to a handful; past that they are a wall that pushes
   the button off the bottom of the sheet, and a club has a dozen teams. The
   select reports through the same action as a chip would, so both are one
   code path (see the 'change' listener beside the click handler). */
const PICK_CHIPS = 6;
function pickOne(act, k, cur, items, empty) {
  if (!items.length) return `<p class="muted" style="margin:0 0 12px">${empty}</p>`;
  if (items.length <= PICK_CHIPS) return `<div class="chips" style="margin-bottom:12px">${items.map(([v, l]) =>
    `<button class="chip" type="button" data-act="${act}" data-k="${k}" data-v="${esc(v)}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  return `<label class="field"><select data-pick="${act}" data-k="${k}">
    <option value=""${cur ? '' : ' selected'}>Choose…</option>
    ${items.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
}

/* A coach may hand out roles on her own team; an admin on any. Checked in the
   handlers too, not only by what the sheet draws. */
const mayGrant = tid => canAdmin() || !!(me && tid && isCoach(tid, me.uid));

function sheetPersonRoles(uid) {
  const u = (acc().members || {})[uid] || {};
  const admin = canAdmin();
  const scope = admin ? teams() : teams().filter(x => isCoach(x.id, me && me.uid));
  if (!ui.pr || ui.pr.uid !== uid) ui.pr = { uid, role: 'parent', team: scope.length === 1 ? scope[0].id : null, player: null };
  const f = ui.pr;
  const held = rolesHeld(uid, scope);
  const t = scope.find(x => x.id === f.team) || null;
  const players = t ? Object.values(t.players || {}).filter(p => p.active !== false)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999)) : [];
  const pname = p => `${p.number ? '#' + esc(p.number) + ' ' : ''}${esc(p.name || '')}`;
  const already = f.role === 'parent' ? held.some(v => v.r === 'parent' && v.x.id === f.team && v.p.id === f.player)
    : held.some(v => v.r === f.role && v.x.id === f.team);

  openSheet(`<h3>${esc(u.name || 'Unnamed')}</h3>
    <p class="muted" style="margin-top:0">${esc(u.email || '')}${u.at ? ` · joined ${new Date(u.at).toLocaleDateString()}` : ''}</p>
    ${admin ? `<p class="lbl">Club</p>
    <div class="chips" style="margin-bottom:14px">
      <button class="chip" type="button" data-act="setrole" data-uid="${uid}" data-r="admin" aria-pressed="${isAdmin(uid)}">Club admin</button>
    </div>` : ''}
    <p class="lbl">${isAdmin(uid) ? 'Admin covers every team. Also' : 'Roles'}</p>
    ${held.length ? held.map(v => `<div class="opt spread">
      <span><b>${esc(ROLE_LABEL[v.r])}</b>${v.p ? ` of ${pname(v.p)}` : ''}<span class="rowsub">${esc(v.x.name || 'Team')}</span></span>
      ${v.r === 'parent'
      ? `<button class="btn quiet sm" data-act="prunguard" data-uid="${uid}" data-tid="${v.x.id}" data-pid="${v.p.id}">Remove</button>`
      : `<button class="btn quiet sm" data-act="setrolet" data-uid="${uid}" data-tid="${v.x.id}" data-r="${v.r}">Remove</button>`}</div>`).join('')
      : `<p class="muted" style="margin-top:0">${isAdmin(uid) ? 'Nothing else.' : 'None yet — waiting to be let in. Until they have a role they see nothing of the club.'}</p>`}

    ${scope.length ? `<p class="lbl" style="margin-top:14px">${held.length || isAdmin(uid) ? 'Give a role' : 'Let them in as'}</p>
    <div class="chips" style="margin-bottom:12px">${[['parent', 'Parent'], ['tracker', 'Tracker'], ['coach', 'Coach']].map(([k, l]) =>
        `<button class="chip" type="button" data-act="prpick" data-k="role" data-v="${k}" aria-pressed="${f.role === k}">${l}</button>`).join('')}</div>
    <p class="lbl">Team</p>
    ${pickOne('prpick', 'team', f.team, scope.map(x => [x.id, esc(x.name || 'Team')]), 'No teams yet.')}
    ${f.role === 'parent' && t ? `<p class="lbl">Parent of</p>
    ${pickOne('prpick', 'player', f.player, players.map(p => [p.id, pname(p)]), 'No players on this team.')}` : ''}
    <button class="btn wide" data-act="praddrole" data-uid="${uid}"${already ? ' disabled' : ''}>${already ? 'Already has that role'
        : `Make ${f.role === 'parent' ? 'parent' : f.role}${t ? ' on ' + esc(t.name || 'the team') : ''}`}</button>
    <p class="muted">${{ parent: 'Reads that team, and sees their child under My players. Other children show by shirt number.', tracker: 'Logs goals, shots and set pieces on that team’s games, and makes the coach’s locked-in subs.', coach: 'Runs that team: squad, games, subs and plan.' }[f.role]}</p>` : ''}
    <button class="btn quiet wide" data-act="closesheet" style="margin-top:6px">Done</button>`);
}

function sheetPeople() {
  const t = team();
  const list = members();
  openSheet(`<h3>People</h3>
    <p class="muted" style="margin-top:0">Anyone who signs in to this club lands here. Roles below apply to <b>${teamLabel(t || {})}</b>; admins are club-wide.</p>
    ${list.length ? list.map(u => {
    const r = roleIn(t && t.id, u.uid);
    const isMe = me && me.uid === u.uid;
    return `<div class="opt">
      <div class="spread"><span><b>${esc(u.name || 'Unnamed')}</b>${isMe ? ' <span class="muted">(you)</span>' : ''}
        <span class="rowsub">${esc(u.email || '')}</span></span>
        <span class="muted">${r ? esc(ROLE_LABEL[r]) : 'no role'}</span></div>
      <div class="chips" style="margin-top:8px">
        <button class="chip" type="button" data-act="setrole" data-uid="${u.uid}" data-r="admin" aria-pressed="${isAdmin(u.uid)}">Admin</button>
        <button class="chip" type="button" data-act="setrole" data-uid="${u.uid}" data-r="coach" aria-pressed="${!isAdmin(u.uid) && isCoach(t && t.id, u.uid)}">Coach</button>
        <button class="chip" type="button" data-act="setrole" data-uid="${u.uid}" data-r="tracker" aria-pressed="${isTracker(t && t.id, u.uid)}">Tracker</button>
        ${r === 'parent' ? '<span class="muted" style="align-self:center">parent via a player</span>' : ''}
      </div></div>`;
  }).join('') : '<p class="muted">Nobody has signed in yet.</p>'}
    <p class="muted">A parent is not set here — they become one by being linked to a player as a guardian.</p>
    <button class="btn wide" data-act="closesheet">Done</button>`);
}

function sheetShare() {
  const t = team();
  if (!t) return;
  const m = match() || teamMatches(t.id)[0];
  // the links are public anyway, so anyone who can see the team may copy them;
  // making, killing and republishing them is the coach's
  const ro = !canEditTeam(t.id);
  const st = pubState.error
    ? `<div class="warn alert" style="margin-bottom:14px"><b>Not published.</b><br>${esc(pubState.error)}<br>
       <span class="muted">Check Realtime Database → Rules for a <code>public</code> block, then tap Republish.</span></div>`
    : pubState.at
      ? `<p class="muted" style="margin-top:0">Published ${new Date(pubState.at).toLocaleTimeString()}. Links below are live.</p>`
      : `<p class="muted" style="margin-top:0">Not published yet this session — tap Republish to force it.</p>`;

  openSheet(`<h3>Share ${teamLabel(t)}</h3>
    ${t.share ? st + `
      <p class="lbl">Follow the season</p>
      <div class="codebox">${esc(teamLink(t))}</div>
      <div class="row" style="margin-bottom:16px"><button class="btn sm" data-act="copylink" data-v="${esc(teamLink(t))}">Copy season link</button></div>
      <p class="muted" style="margin-top:0">Text this once. It always shows whatever game is on, what is coming up — games, and any practice or event marked for the share link — and the season record. Families can add it all to their own calendars from there.</p>

      ${m ? `<p class="lbl">This game — ${esc(m.opponent || 'game')}${m.date ? ' · ' + esc(shortDate(m.date)) : ''}</p>
      ${gameLink(t, m) ? `<div class="codebox">${esc(gameLink(t, m))}</div>
      <div class="row" style="margin-bottom:16px"><button class="btn sm" data-act="copylink" data-v="${esc(gameLink(t, m))}">Copy link to this game</button></div>
      <p class="muted" style="margin-top:0">Kick-off time, where it is, who is on and the minutes — for this game only. Whoever it reaches cannot get from it to the season page or any other game. Switch games in the bar above to share a different one.</p>`
      : `<p class="muted" style="margin-top:0">${ro ? 'This game\u2019s own link appears once the coach\u2019s phone has published it.' : 'This game\u2019s own link is being made — it appears here in a moment.'}</p>`}` : ''}

      <p class="muted">Anyone with a link can read it. Nobody can change anything, and no child's name is published — only shirt numbers.</p>
      ${ro ? '' : `<button class="btn quiet wide" data-act="republish" style="margin-bottom:8px">Republish now</button>
      <button class="btn danger wide" data-act="rotateshare">Make a new link and kill the old one</button>`}`
      : ro ? `<p class="muted" style="margin-top:0">This team's coach has not set up parent links yet.</p>`
      : `<p class="muted" style="margin-top:0">Creates a long random address. Only people you send it to can find it.</p>
      <button class="btn wide" data-act="makeshare">Create the share links</button>`}
    ${m && !ro ? `<p class="lbl" style="margin-top:16px">For the other team</p>
      <div class="codebox" style="white-space:pre-wrap">${esc(opponentMessage(t, m))}</div>
      <div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="copytext" data-v="${esc(opponentMessage(t, m))}">Copy the message</button></div>
      <p class="muted" style="margin-top:0">Ready to text to their coach.${t.share ? ' The link opens this game and nothing else: when, where and the live score, shirt numbers only. Your season page, other fixtures and practices are not reachable from it.' : ' Set up sharing and it carries a link to the game page with the live score.'}</p>` : ''}`);
}

function sheetSignIn() {
  if (!authMod) { toast('Sign-in is not available on this build'); return; }
  openSheet(`<h3>${me ? 'Your account' : 'Sign in'}</h3>
    ${me ? `<p class="muted" style="margin-top:0">Signed in as <b>${esc(me.name)}</b>${me.email ? ` · ${esc(me.email)}` : ''}.
      Anything you log is now stamped with this account rather than a typed name.</p>
      <button class="btn danger wide" data-act="signout">Sign out</button>`
      : `<p class="muted" style="margin-top:0">Optional for now — everything works signed out. Signing in means the things you log carry a verified name instead of one anybody could type.</p>
      <button class="btn wide" data-act="signin-google" style="margin-bottom:10px">Continue with Google</button>

      <p class="lbl">Magic link — no password to forget</p>
      <label class="field"><input type="email" id="authEmail" placeholder="you@example.com" autocapitalize="off" autocorrect="off"></label>
      <button class="btn quiet wide" data-act="signin-link" style="margin-bottom:16px">Email me a sign-in link</button>

      <p class="lbl">Or a password</p>
      <label class="field"><input type="password" id="authPass" placeholder="Password" autocomplete="current-password"></label>
      <div class="row"><button class="btn quiet sm" data-act="signin-pass" style="flex:1">Sign in</button>
      <button class="btn quiet sm" data-act="signup-pass" style="flex:1">Create account</button></div>
      <p class="muted">Uses the email box above.</p>`}`);
}

function sheetWho() {
  openSheet(`<h3>Logging as</h3>
    ${me ? `<p class="muted" style="margin-top:0">Signed in as <b>${esc(me.name)}</b>. Everything you log carries that account, so it can be told apart from a typed name.</p>
      <button class="btn quiet wide" data-act="signinsheet">Account settings</button>`
      : `<p class="muted" style="margin-top:0">A typed name is stamped onto what you tap so two people can track one game. It is not a login — anyone could type it, and it shows as unverified.</p>
      <label class="field"><span>Your name</span><input type="text" id="whoName" value="${esc(typedName())}" placeholder="Grant"></label>
      <button class="btn wide" data-act="savewho" style="margin-bottom:12px">Save</button>
      <button class="btn quiet wide" data-act="signinsheet">Sign in instead</button>`}`);
}

function sheetTrackerClean() {
  const m = match(), counts = trackersIn(m);
  openSheet(`<h3>Who logged what</h3>
    ${Object.entries(counts).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `<div class="opt spread">
      <span>${esc(v.name)}<span class="rowsub">${v.n} item${v.n === 1 ? '' : 's'}${v.verified ? ' · signed in' : ' · unverified'}</span></span>
      <button class="btn danger sm" data-act="dropby" data-who="${esc(k)}">Remove all</button></div>`).join('')}
    <p class="muted">Goals, shots, set pieces and possession only. Subs and minutes are untouched.</p>
    <button class="btn wide" data-act="closesheet">Done</button>`);
}

function sheetPoss(id) {
  const t = team(), m = match();
  const x = (m.poss || {})[id]; if (!x) return;
  const us = teamLabel(t), them = esc(m.opponent || 'Them');
  openSheet(`<h3>Turnover at ${mmss(x.t)}</h3>
    <label class="field"><span>Time</span><input type="text" id="poT" value="${mmss(x.t)}" inputmode="numeric"></label>
    <p class="lbl">Who won it</p>
    <div class="chips" style="margin-bottom:14px">
      <button class="chip" type="button" data-act="pickone" data-grp="side" data-v="us" aria-pressed="${x.to === 'us'}">${us}</button>
      <button class="chip" type="button" data-act="pickone" data-grp="side" data-v="them" aria-pressed="${x.to === 'them'}">${them}</button>
    </div>
    ${x.to === 'us' ? `<p class="lbl">Who made it (optional)</p>
    <div class="chips" style="margin-bottom:14px">
      ${squad(t, m).map(p => `<button class="chip" type="button" data-act="pickscorer" data-grp="winner" data-v="${p.id}" aria-pressed="${x.pid === p.id}">${chipName(p)}</button>`).join('')}
    </div>` : ''}
    <button class="btn wide" data-act="saveposs" data-id="${id}">Save</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delposs" data-id="${id}">Delete</button></div>`);
}

function sheetEvent(id) {
  const t = team(), m = match();
  const x = (m.events || {})[id]; if (!x) return;
  const ours = x.side === 'us';
  openSheet(`<h3>${esc(evLabel(x.kind).replace(/s$/, ''))} at ${mmss(x.t)} — ${ours ? teamLabel(t) : esc(m.opponent || 'Them')}</h3>
    <label class="field"><span>Time</span><input type="text" id="evT" value="${mmss(x.t)}" inputmode="numeric"></label>
    <p class="muted" style="margin-top:-6px">Counted as ${esc(evOf(x.kind).who)} ${ours ? teamLabel(t) : esc(m.opponent || 'them')}.</p>
    ${ours ? `<p class="lbl">${esc(evOf(x.kind).attr)} (optional)</p>
    <div class="chips" style="margin-bottom:14px">
      ${squad(t, m).map(p => `<button class="chip" type="button" data-act="pickscorer" data-grp="who" data-v="${p.id}" aria-pressed="${x.pid === p.id}">${chipName(p)}</button>`).join('')}
    </div>` : '<p class="muted">Opponent event — nothing to attribute.</p>'}
    <button class="btn wide" data-act="saveev" data-id="${id}">Save</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delev" data-id="${id}">Delete</button></div>`);
}

function sheetTrackCfg() {
  const t = team();
  openSheet(`<h3>What to count</h3>
    <p class="muted" style="margin-top:0">Switch off anything that turns into more tapping than it is worth. Throw-ins run to forty a game in youth soccer; corners and fouls are far rarer and tell you more.</p>
    <div class="chips" style="margin-bottom:16px">
      ${EVENTS.map(e => `<button class="chip" type="button" data-act="togglechip" data-grp="track" data-v="${e.k}" aria-pressed="${(t.track || {})[e.k] !== false}">${e.label}</button>`).join('')}
    </div>
    <p class="lbl">Possession</p>
    <p class="muted" style="margin-top:0">Off by default. Catching every turnover while watching the game is hard enough that a half-tapped percentage misleads more than it informs — better taken from film. Anything already recorded stays visible and editable either way.</p>
    <div class="chips" style="margin-bottom:16px">
      <button class="chip" type="button" data-act="togglechip" data-grp="track" data-v="possession" aria-pressed="${possOn(t)}">Track it live</button>
    </div>
    <button class="btn wide" data-act="savetrackcfg">Save</button>`);
}

function sheetShot(id) {
  const t = team(), m = match();
  const x = (m.shots || {})[id]; if (!x) return;
  const ours = x.side === 'us';
  const roster = squad(t, m).filter(p => ours ? true : false);
  openSheet(`<h3>Shot at ${mmss(x.t)} — ${ours ? teamLabel(t) : esc(m.opponent || 'Them')}</h3>
    <label class="field"><span>Time</span><input type="text" id="shT" value="${mmss(x.t)}" inputmode="numeric"></label>
    ${absAt(m, x.t) ? `<p class="muted" style="margin-top:-6px">${new Date(absAt(m, x.t)).toLocaleTimeString()} real time${x.xy ? ` · placed at ${Math.round(x.xy.x)},${Math.round(x.xy.y)}` : ''}</p>` : ''}
    <p class="lbl">Where it went</p>
    <div class="chips" style="margin-bottom:14px">
      <button class="chip" type="button" data-act="pickone" data-grp="target" data-v="1" aria-pressed="${!!x.onTarget}">On target</button>
      <button class="chip" type="button" data-act="pickone" data-grp="target" data-v="0" aria-pressed="${!x.onTarget}">Off target</button>
    </div>
    ${ours ? `<p class="lbl">Who took it</p>
    <div class="chips" style="margin-bottom:14px">
      ${roster.map(p => `<button class="chip" type="button" data-act="pickscorer" data-grp="shooter" data-v="${p.id}" aria-pressed="${x.pid === p.id}">${chipName(p)}</button>`).join('')}
    </div>` : '<p class="muted">Opponent shot — nothing to attribute.</p>'}
    <button class="btn wide" data-act="saveshot" data-id="${id}">Save</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delshot" data-id="${id}">Delete this shot</button></div>`);
}

function sheetGoal(gid) {
  const t = team(), m = match();
  const g = (m.goals || {})[gid]; if (!g) return;
  const roster = squad(t, m);
  const ours = g.side === 'us';
  openSheet(`<h3>Goal at ${mmss(g.t)} — ${ours ? teamLabel(t) : esc(m.opponent || 'Them')}</h3>
    <label class="field"><span>Time</span><input type="text" id="glT" value="${mmss(g.t)}" inputmode="numeric"></label>
    ${ours ? `<p class="lbl">Scorer</p>
    <div class="chips" style="margin-bottom:14px">
      ${roster.map(p => `<button class="chip" type="button" data-act="pickscorer" data-grp="scorer" data-v="${p.id}" aria-pressed="${g.pid === p.id}">${chipName(p)}</button>`).join('')}
    </div>
    <p class="lbl">Assist</p>
    <div class="chips" style="margin-bottom:14px">
      ${roster.map(p => `<button class="chip" type="button" data-act="pickscorer" data-grp="assist" data-v="${p.id}" aria-pressed="${g.assist === p.id}">${chipName(p)}</button>`).join('')}
    </div>` : '<p class="muted">Opponent goal — nothing to attribute.</p>'}
    <button class="btn wide" data-act="savegoal" data-id="${gid}">Save</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delgoal" data-id="${gid}">Delete this goal</button></div>`);
}

function sheetEnv() {
  const cur = envName(), list = Object.keys(envList());
  const url = c => esc((c || {}).databaseURL || 'not set');
  openSheet(`<h3>Database</h3>
    <p class="muted" style="margin-top:0">Which Firebase database this device talks to. Rules live on a database, not on a club, so this is the only way to try a rules change without applying it to the real club in the same instant.</p>
    <button class="opt" data-act="setenv" data-v="" aria-current="${!cur}"><b>Production</b>
      <span class="rowsub">${url(window.SOCCER_FIREBASE_CONFIG)}</span></button>
    ${list.map(n => `<button class="opt" data-act="setenv" data-v="${esc(n)}" aria-current="${n === cur}"><b>${esc(n)}</b>
      <span class="rowsub">${url(envList()[n])}</span></button>`).join('')}
    ${list.length ? '' : '<p class="muted">None declared yet. Add <code>SOCCER_FIREBASE_ENVS</code> to firebase-config.js — see README.</p>'}
    <p class="muted" style="margin-bottom:0">Switching reloads and forgets the open code, since a club belongs to the database it lives in. Each database keeps its own local copies, so neither can overwrite what the other holds.</p>`);
}

function sheetWorkspace() {
  const code = wsCode();
  const cfgOk = !!fbConfig().apiKey;
  openSheet(`<h3>Workspace code</h3>
    <p class="muted" style="margin-top:0">${cfgOk ? 'Every device with this exact code sees the same teams and games. It is case sensitive and the order of the characters matters.' : 'No Firebase config in this build, so this device is on its own.'}</p>
    ${code ? `<div class="codebox" id="codeShow">${esc(code)}</div>
      <div class="row" style="margin-bottom:12px"><button class="btn quiet sm" data-act="copycode">Copy it</button>
      <span class="muted">${code.length} characters</span></div>` : ''}
    <label class="field"><span>Switch to a different code</span><input type="text" id="wsCode" value="${esc(code)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <div class="row"><button class="btn" data-act="savews">Save and reload</button>
    <button class="btn quiet" data-act="gencode">Make one up</button></div>
    <p class="muted" style="margin-bottom:0">Each code keeps its own copy on this device, so switching away and back does not lose anything.</p>`);
}

function sheetTeams() {
  openSheet(`<h3>Switch team</h3>
    ${myTeams().map(t => `<button class="opt" data-act="pickteam" data-id="${t.id}" aria-current="${t.id === ui.teamId}">
      ${teamLabel(t)}<span class="rowsub">${teamStats(t)}${canEditTeam(t.id) ? '' : ' · view only'}</span></button>`).join('')
      || '<p class="muted">No teams are shared with your account yet.</p>'}
    ${canAdmin() ? `<button class="btn wide" data-act="newteam">Add a team</button>` : ''}`);
}

function sheetMatch(m, pre) {
  const t = team();
  const isNew = !m;
  // today as the coach's phone reads it; toISOString() is tomorrow by the evening in America
  m = m || { periodCount: 2, periodMinutes: 40, onFieldCount: 11, date: todayStr(), ...(pre || {}) };
  openSheet(`<h3>${isNew ? 'New game' : 'Game details'}</h3>
    <label class="field"><span>Opponent</span><input type="text" id="mOpp" value="${esc(m.opponent || '')}" placeholder="Riverside United"></label>
    <div class="grid2">
      <label class="field"><span>Date</span><input type="date" id="mDate" value="${esc(m.date || '')}"></label>
      <label class="field"><span>Kick-off</span><input type="time" id="mKick" value="${esc(m.kickoff || '')}"></label>
    </div>
    <label class="field"><span>Where</span><input type="text" id="mVenue" value="${esc(m.venue || '')}" placeholder="Lakeside Park, field 3"></label>
    <div class="grid2">
      <label class="field"><span>Home or away</span><select id="mHome">
        <option value="">Not set</option>
        ${Object.entries(HOME_AWAY).map(([k, v]) => `<option value="${k}"${m.home === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Arrive by</span><input type="time" id="mArrive" value="${esc(m.arrive || '')}"></label>
    </div>
    <label class="field"><span>Kit</span><input type="text" id="mKit" value="${esc(m.kit || '')}" placeholder="Blue shirts, white socks"></label>
    <label class="field"><span>Notes for families and the other team</span><textarea id="mNotes" rows="2" placeholder="Park on Elm Street, not in the school lot">${esc(m.notes || '')}</textarea></label>
    <p class="muted" style="margin:-4px 0 12px">On the share pages and in the calendar. A player\u2019s name typed here is left off the share pages.</p>
    ${isNew ? '' : `<label class="field"><span>Is it on?</span><select id="mCalled">
      <option value="">On</option>
      ${Object.entries(CALLED).map(([k, v]) => `<option value="${k}"${m.called === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`}
    <div class="grid2">
      <label class="field"><span>Halves or quarters</span><select id="mCount">
        <option value="2"${(m.periodCount || 2) == 2 ? ' selected' : ''}>2 halves</option>
        <option value="4"${m.periodCount == 4 ? ' selected' : ''}>4 quarters</option></select></label>
      <label class="field"><span>Minutes each</span><input type="number" inputmode="numeric" id="mLen" value="${m.periodMinutes || 40}"></label>
    </div>
    <label class="field"><span>Players on the pitch</span><select id="mSide">
      ${[5, 7, 9, 11].map(n => `<option value="${n}"${(m.onFieldCount || 11) == n ? ' selected' : ''}>${n} v ${n}</option>`).join('')}</select></label>
    <label class="field"><span>Shape</span><select id="mShape">
      ${isNew ? '<option value="auto" selected>Team default for this side size</option>'
        : `<option value="keep" selected>Keep ${esc(m.formation ? m.formation.name : 'no shape')}</option>`}
      <option value="none">No shape — place them anywhere</option>
      <option value="custom">Build my own for this game…</option>
      ${Object.values(t.formations || {}).map(f => `<option value="team:${f.id}">${esc(f.name)} (${f.size}v${f.size}, saved)</option>`).join('')}
      ${[11, 9, 7, 5].map(sz => Object.keys(presetsFor(sz)).map(k => `<option value="preset:${sz}:${k}">${k} (${sz}v${sz})</option>`).join('')).join('')}
    </select></label>
    <p class="muted" style="margin:-4px 0 12px">Copied into this game when you save. Editing the team shape later will not touch it.</p>
    <label class="field"><span>Veo link (optional)</span><input type="url" id="mVeo" value="${esc(m.veoUrl || '')}" placeholder="https://app.veo.co/matches/..."></label>
    <button class="btn wide" data-act="savematch" data-id="${m.id || ''}">${isNew ? 'Create game' : 'Save changes'}</button>
    ${isNew ? '' : `<div style="margin-top:8px"><button class="btn danger wide" data-act="delmatch" data-id="${m.id}">Delete this game</button></div>`}`);
}

function sheetPlanned() {
  const t = team(), m = match(); if (!t || !m) return;
  const roster = squad(t, m);
  const gk = roster.find(p => p.gk);
  const outfield = roster.filter(p => !p.gk).length;
  openSheet(`<h3>Planned minutes</h3>
    <p class="muted" style="margin-top:0">${matchMinutes(m) * ((m.onFieldCount || 11) - (gk ? 1 : 0))} outfield minutes to share between ${outfield} players${gk ? `, plus ${matchMinutes(m)} in goal` : ''}.</p>
    <button class="btn quiet wide" data-act="evensplit" style="margin-bottom:12px">Split evenly (${evenSplit(m, roster)} min each outfield)</button>
    ${roster.map(p => `<div class="row" style="margin-bottom:8px">
      <span class="pnum" style="width:34px">${esc(p.number ?? '')}</span>
      <span style="flex:1" class="pname">${esc(p.name)}</span>
      <input type="number" inputmode="numeric" style="width:84px" data-plan="${p.id}" value="${m.planned && m.planned[p.id] != null ? m.planned[p.id] : ''}" placeholder="0">
    </div>`).join('')}
    <button class="btn wide" data-act="saveplan" style="margin-top:6px">Save planned minutes</button>`);
}

function sheetPlayer(p) {
  p = migrate(p);
  const t = team();
  const others = players(t).filter(o => o.id !== p.id);
  const pairs = p.pairs || {}, avoid = p.avoid || {};
  openSheet(`<h3>${esc(p.name)}</h3>
    <div class="row" style="margin-bottom:12px">
      ${p.photo ? `<img class="crest" src="${esc(p.photo)}" alt="">` : '<span class="crest blank">—</span>'}
      <span style="flex:1"><button class="btn quiet sm" data-act="pickphoto" data-pid="${p.id}">${p.photo ? 'Change photo' : 'Add a photo'}</button>
      ${p.photo ? `<button class="btn quiet sm" data-act="dropphoto" data-pid="${p.id}">Remove</button>` : ''}</span>
    </div>
    <p class="muted" style="margin-top:-4px">Visible only to people signed in to this club. Never published to the parent links.</p>
    ${(l => l ? `<p style="margin:0 0 12px"><b>This season:</b> ${esc(l)}</p>` : '')(attendLine(attendance(t, p.id)))}
    <div class="grid2">
      <label class="field"><span>Number</span><input type="number" inputmode="numeric" id="epNum" value="${esc(p.number ?? '')}"></label>
      <label class="field"><span>Name</span><input type="text" id="epName" value="${esc(p.name)}"></label>
    </div>

    <p class="lbl">Best position</p>
    <div class="chips" style="margin-bottom:14px">
      ${['', ...ROLES].map(x => `<button class="chip" type="button" data-act="pickone" data-grp="pref" data-v="${x}" aria-pressed="${(p.preferred || '') === x}">${x || 'No preference'}</button>`).join('')}
    </div>

    <p class="lbl">Also fine at</p>
    <div class="chips" style="margin-bottom:10px">
      ${ROLES.map(x => `<button class="chip" type="button" data-act="togglechip" data-grp="can" data-v="${x}" aria-pressed="${(p.canPlay || []).includes(x)}">${x}</button>`).join('')}
    </div>
    <div class="chips" style="margin-bottom:14px">
      <button class="chip" type="button" data-act="toggleanywhere" aria-pressed="${p.anywhere !== false}">Can go anywhere</button>
      <span class="muted" style="align-self:center">on by default — the planner will not fight you</span>
    </div>

    <p class="lbl">How strong she is right now</p>
    <div class="chips" style="margin-bottom:14px">
      ${[1, 2, 3, 4, 5].map(n => `<button class="chip" type="button" data-act="pickone" data-grp="rating" data-v="${n}" aria-pressed="${rating(p) === n}">${n}</button>`).join('')}
      <span class="muted" style="align-self:center">5 is a starter you build around</span>
    </div>

    <div class="grid2">
      <label class="field"><span>Longest stint (min)</span><input type="number" inputmode="numeric" id="epStint" value="${esc(p.maxStint ?? '')}" placeholder="no limit"></label>
      <label class="field"><span>Goalkeeper</span><select id="epGk"><option value="0"${p.gk ? '' : ' selected'}>No</option><option value="1"${p.gk ? ' selected' : ''}>Yes</option></select></label>
    </div>

    ${canAdmin() || isCoach(t.id, me && me.uid) ? `<p class="lbl">Guardians — accounts that follow her</p>
    <div class="chips" style="margin-bottom:14px">
      ${members().map(u => `<button class="chip" type="button" data-act="toggleguard" data-pid="${p.id}" data-uid="${u.uid}" aria-pressed="${!!((p.guardians || {})[u.uid])}">${esc(u.name || u.email || 'Unnamed')}</button>`).join('') || '<span class="muted">Nobody has signed in yet.</span>'}
    </div>
    <p class="muted" style="margin-top:-8px">A guardian can read this team and sees her under My players. Linking someone here is what makes them a parent.</p>` : ''}

    <p class="lbl">Plays better alongside</p>
    <div class="chips" style="margin-bottom:14px">
      ${others.map(o => `<button class="chip" type="button" data-act="togglechip" data-grp="pair" data-v="${o.id}" aria-pressed="${!!pairs[o.id]}">${chipName(o)}</button>`).join('') || '<span class="muted">Add more players first.</span>'}
    </div>

    <p class="lbl">Keep apart from</p>
    <div class="chips" style="margin-bottom:14px">
      ${others.map(o => `<button class="chip warn-chip" type="button" data-act="togglechip" data-grp="avoid" data-v="${o.id}" aria-pressed="${!!avoid[o.id]}">${chipName(o)}</button>`).join('') || '<span class="muted">Add more players first.</span>'}
    </div>

    <label class="field"><span>Notes</span><textarea id="epNote" rows="2" placeholder="Strong left foot, fades after 25 minutes">${esc(p.note || '')}</textarea></label>

    <div class="chips" style="margin-bottom:14px">
      <button class="chip" type="button" data-act="toggleavail" data-pid="${p.id}" aria-pressed="${p.active === false}">Off the roster for the season</button>
    </div>
    <button class="btn wide" data-act="saveplayer" data-pid="${p.id}">Save changes</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delplayer" data-pid="${p.id}">Remove from roster</button></div>`);
}

function sheetAvailability() {
  const t = team(), m = match();
  const said = pid => rsvpOf(t.id, 'g_' + m.id, pid);
  const why = p => {
    const o = (m.out || {})[p.id], r = said(p.id);
    const fam = r ? RSVP[r.v] + (r.note ? ' · ' + r.note : '') : (gameStatus(m) === 'upcoming' ? 'Not answered' : '');
    if (o === false && familySaidNo(m, p.id)) return 'Family said not going — you have her playing';
    if (o) return 'You marked her out' + (r ? ' · family said ' + RSVP_SHORT[r.v] : '');
    return fam;
  };
  const fromFamily = players(t).filter(p => p.active !== false && isOut(m, p.id) && (m.out || {})[p.id] === undefined).length;
  openSheet(`<h3>Available for ${esc(m.opponent || 'this game')}</h3>
    <p class="muted" style="margin-top:0">Anyone out is left out of the bench, the plan and the even split — but keeps her season totals. Families\u2019 answers come straight in: <b>not going</b> means out until you say otherwise.${fromFamily ? ` ${fromFamily} out because ${fromFamily === 1 ? 'her family said so' : 'their families said so'}.` : ''}</p>
    ${players(t).filter(p => p.active !== false).map(p => `<button class="opt spread" type="button" data-act="toggleout" data-pid="${p.id}">
      <span>${esc(p.number ?? '')} ${esc(p.name)}${why(p) ? `<span class="rowsub">${esc(why(p))}</span>` : ''}</span>
      <span class="${isOut(m, p.id) ? 'off' : 'on'}">${isOut(m, p.id) ? 'out' : 'available'}</span></button>`).join('')}
    <button class="btn wide" data-act="closesheet">Done</button>`);
}

function sheetFixClock() {
  const m = match();
  const onNow = fieldIds(m).length;
  openSheet(`<h3>Adjust or restart the clock</h3>
    <p class="muted" style="margin-top:0">Reads ${mmss(elapsedSec(m))} now. Nudging shifts the current ${esc(halfName(m, m.currentHalf || 1)).toLowerCase()} and the total together.</p>
    <div class="chips" style="margin-bottom:8px">
      ${[-300, -60, -15, -5].map(d => `<button class="chip" type="button" data-act="nudgeclock" data-d="${d}">−${Math.abs(d) >= 60 ? Math.abs(d) / 60 + 'm' : Math.abs(d) + 's'}</button>`).join('')}
    </div>
    <div class="chips" style="margin-bottom:16px">
      ${[5, 15, 60, 300].map(d => `<button class="chip" type="button" data-act="nudgeclock" data-d="${d}">+${d >= 60 ? d / 60 + 'm' : d + 's'}</button>`).join('')}
    </div>
    <button class="btn wide" data-act="closesheet">Done</button>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    <h3>Started too early?</h3>
    <p class="muted" style="margin-top:0">Puts the clock back to 0:00. The ${onNow} player${onNow === 1 ? '' : 's'} on the pitch stay${onNow === 1 ? 's' : ''} on and start${onNow === 1 ? 's' : ''} a fresh spell. Subs already logged and any goals are cleared, because their times belong to the old clock. Your roster, lineup, planned minutes and game plan are untouched.</p>
    <button class="btn danger wide" data-act="restartgame">Start this game over at 0:00</button>`);
}

function sheetFixSub(i) {
  const r = lastLog[i]; if (!r) return;
  const t = team();
  const nm = id => { const p = (t.players || {})[id]; return p ? esc(p.name) : 'Unknown'; };
  openSheet(`<h3>${r.on ? nm(r.on) + ' on' : ''}${r.on && r.off ? ' for ' : ''}${r.off ? nm(r.off) + ' off' : ''}</h3>
    <p class="muted" style="margin-top:0">Logged at ${mmss(r.t)}.</p>
    <div class="chips" style="margin-bottom:14px">
      ${[-60, -30, -15, -5, 5, 15, 30, 60].map(d => `<button class="chip" type="button" data-act="nudgesub" data-i="${i}" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}s</button>`).join('')}
    </div>
    <label class="field"><span>Or set the exact time</span><input type="text" id="subT" value="${mmss(r.t)}" placeholder="23:10" inputmode="numeric"></label>
    <button class="btn wide" data-act="setsubtime" data-i="${i}">Save time</button>
    <div style="margin-top:8px"><button class="btn danger wide" data-act="delsub" data-i="${i}">Delete — this sub did not happen</button></div>
    <div style="margin-top:8px"><button class="btn quiet wide" data-act="closesheet">Cancel</button></div>`);
}

function sheetAddSub() {
  const t = team(), m = match();
  const roster = squad(t, m);
  const on = roster.filter(p => onField(m, p.id));
  const off = roster.filter(p => !onField(m, p.id));
  if (!on.length || !off.length) { toast('Need someone on the pitch and someone on the bench'); return; }
  openSheet(`<h3>Add a sub you missed</h3>
    <label class="field"><span>Coming off</span><select id="asOut">${on.map(p => `<option value="${p.id}">${esc(p.number ?? '')} ${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Going on</span><select id="asIn">${off.map(p => `<option value="${p.id}">${esc(p.number ?? '')} ${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span>When it actually happened</span><input type="text" id="asT" value="${mmss(elapsedSec(m))}" placeholder="23:10" inputmode="numeric"></label>
    <button class="btn wide" data-act="doaddsub">Record it</button>`);
}

/* Where a spell was played, as the Fix minutes sheet offers it: the game's own
   spots, or a bare role when the spot is not in the shape any more. A spell
   saved before a spot was kept with it has neither, and this is the only way to
   give it one back — minutes by position read nothing else. 'none' rather than
   '' for no spot, so a select that is not on the page reads as "leave it". */
function spotOptions(m, s) {
  const slots = (m.formation && m.formation.slots) || [];
  const cur = s.slot && slotById(m, s.slot) ? 'slot:' + s.slot : s.role ? 'role:' + s.role : 'none';
  const opt = (v, label) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
  return opt('none', 'Position not recorded')
    + slots.map(x => opt('slot:' + x.id, x.label + (x.label !== x.role ? ' · ' + x.role : ''))).join('')
    + ROLES.filter(r => !slots.some(x => x.role === r) || cur === 'role:' + r).map(r => opt('role:' + r, r + ' (any spot)')).join('');
}
function spotFrom(m, v, was) {
  if (!v) return { slot: was.slot || null, role: was.role || null };
  if (v.startsWith('slot:')) { const sl = slotById(m, v.slice(5)); return { slot: sl ? sl.id : null, role: sl ? sl.role : null }; }
  if (v.startsWith('role:')) return { slot: null, role: v.slice(5) };
  return { slot: null, role: null };
}
function sheetFixMinutes(pid) {
  const t = team(), m = match();
  if (!pid) {
    openSheet(`<h3>Whose minutes need fixing?</h3>
      ${squad(t, m).map(p => `<button class="opt spread" type="button" data-act="fixminutes" data-pid="${p.id}">
        <span>${esc(p.number ?? '')} ${esc(p.name)}</span><span class="muted">${mins(playedSec(m, p.id))} min</span></button>`).join('')}`);
    return;
  }
  const p = t.players[pid];
  const list = stintsOf(m, pid).sort((a, b) => a[1].on - b[1].on);
  const e = elapsedSec(m);
  openSheet(`<h3>${esc(p.name)} — ${mins(playedSec(m, pid))} min</h3>
    <p class="muted" style="margin-top:0">Each row is one spell on the pitch. Blank means she is still on.</p>
    ${roleSummary(m, pid) ? `<p class="muted">${esc(roleSummary(m, pid))}</p>` : ''}
    ${list.map(([sid, s]) => `<div class="row" style="margin-bottom:8px">
      <input type="text" style="flex:1" data-son="${sid}" value="${mmss(s.on)}" inputmode="numeric">
      <span class="muted">to</span>
      <input type="text" style="flex:1" data-soff="${sid}" value="${s.off == null ? '' : mmss(s.off)}" placeholder="still on" inputmode="numeric">
      <button class="btn danger sm" data-act="delstint" data-sid="${sid}">Delete</button>
    </div>
    <div class="row" style="margin:-2px 0 12px"><select style="flex:1" data-sspot="${sid}">${spotOptions(m, s)}</select></div>`).join('') || '<p class="muted">She has not been on yet.</p>'}
    <button class="btn wide" data-act="savestints" data-pid="${pid}" style="margin-top:6px">Save spells</button>
    <div style="margin-top:8px"><button class="btn quiet wide" data-act="addstint" data-pid="${pid}">Add a spell she was on for</button></div>
    <p class="muted" style="margin:8px 0 0">Times are minutes into the game, like 23:10. Now is ${mmss(e)}.</p>`);
}

/* Snapshot editing on the Plan tab. The whole plan is rewritten on each change:
   planning happens before the game on one phone, not in a race at the
   sideline, and a whole write keeps the blocks dense and sorted. ids is always
   rebuilt from assign, so who is on and where she plays cannot disagree. */
function savePlan(m, blocks) {
  const shape = (m.formation && m.formation.slots) || [];
  const out = blocks.slice().sort((a, c) => a.start - c.start).map(b => {
    const assign = {};
    for (const s of shape) if (b.assign && b.assign[s.id]) assign[s.id] = b.assign[s.id];
    return { start: b.start, ids: [...new Set(Object.values(assign))], assign };
  });
  commit(`matches/${m.id}/plan`, out.length ? { manual: true, blocks: out } : null);
}
/* Locking in is two promises to the coach: nothing changes by accident now, and
   it has really been saved. Every tap on the Plan tab already saves, but a coach
   who has spent twenty minutes on a plan wants to be told so, and "saved" has to
   mean the club has it — this session watches the write's own acknowledgement
   rather than guessing from the sync badge. After a reload there is no
   acknowledgement to watch, but a lock read back from the database once the
   workspace has been read came from the club, so that counts too. */
const lockAck = {};   // matchId -> { at, s: 'sending' | 'saved' | 'refused' }
function lockPlan(m) {
  const rec = { at: nowMs(), ...stampedBy() };
  const path = `matches/${m.id}/plan/locked`;
  setDeep(state, path, rec); saveLocal();
  const w = remoteSet(path, rec);
  if (w && w.then) {
    lockAck[m.id] = { at: rec.at, s: 'sending' };
    const settle = s => { const a = lockAck[m.id]; if (a && a.at === rec.at) { a.s = s; render(); } };
    w.then(() => settle('saved'), () => settle('refused'));
  }
  render();
}
function lockSaved(m) {
  const l = m.plan && m.plan.locked;
  if (!l) return null;
  const a = lockAck[m.id];
  if (a && a.at === l.at) return a.s;
  if (!fb) return 'device';
  return online && wsRead ? 'saved' : 'sending';
}
/* What would go wrong at the sideline if this plan were followed to the letter.
   A tracker taps once and the app does exactly what the snapshot says, so an
   empty spot or a player who is out is worth a second look before locking. */
function planIssues(t, m) {
  const shape = (m.formation && m.formation.slots) || [];
  const nm = id => ((t.players || {})[id] || {}).name || 'someone';
  const out = [];
  for (const b of planBlocks(m)) {
    const lab = b.start ? mmss(b.start) : 'Kick-off';
    const empty = shape.filter(s => !(b.assign || {})[s.id]).length;
    if (empty) out.push(`${lab}: ${empty} empty spot${empty === 1 ? '' : 's'}`);
    const gone = (b.ids || []).filter(id => isOut(m, id) || !(t.players || {})[id]);
    if (gone.length) out.push(`${lab}: ${gone.map(nm).join(', ')} ${gone.length === 1 ? 'is' : 'are'} not available`);
  }
  return out;
}

function snapAction(t, m, a, d) {
  if (!m) return;
  // looking at another snapshot is not changing it
  if (planLocked(m) && a !== 'snappick') { toast('The plan is locked in — unlock it to change anything'); return; }
  const shape = (m.formation && m.formation.slots) || [];
  const end = matchMinutes(m) * 60, per = (m.periodMinutes || 40) * 60;
  const blocks = planBlocks(m).map(b => ({ start: b.start, assign: { ...(b.assign || {}) } }));
  const cur = blocks.find(b => b.start === ui.snapAt) || blocks[0];
  const taken = sec => blocks.some(b => b !== cur && b.start === sec);
  if (ui.snapSid && !shape.some(s => s.id === ui.snapSid)) ui.snapSid = null;

  if (a === 'snapstart') {
    // start from whoever is on the pitch right now, if anyone — usually nobody
    const assign = {};
    for (const pid of fieldIds(m)) { const sid = slotIdOf(m, pid); if (sid && shape.some(s => s.id === sid)) assign[sid] = pid; }
    ui.snapAt = 0; ui.snapSid = shape.find(s => !assign[s.id]) ? shape.find(s => !assign[s.id]).id : null;
    savePlan(m, [{ start: 0, assign }]); return;
  }
  if (a === 'snapwipe') {
    if (!blocks.length || !confirm('Clear the whole plan? Every snapshot goes, and you start again from an empty pitch.')) return;
    ui.snapAt = null; ui.snapSid = null;
    savePlan(m, []); toast('Plan cleared'); return;
  }
  if (!cur) return;
  if (a === 'snappick') { ui.snapAt = Number(d.start); ui.snapSid = null; render(); return; }
  if (a === 'snapadd') {
    // ten minutes on, or the next half's start if that comes sooner — half-time
    // is when most coaches make their changes
    const nx = blocks.find(b => b.start > cur.start);
    const half = (Math.floor(cur.start / per) + 1) * per;
    let at = Math.min(cur.start + 600, half < end ? half : end);
    if (nx && at >= nx.start) at = cur.start + Math.floor((nx.start - cur.start) / 120) * 60;
    if (at <= cur.start || at >= end || taken(at)) { toast(nx ? 'No room before the next snapshot — move that one first' : 'No time left after this one'); return; }
    /* Empty, not a copy of the one before. A copied lineup credits eleven
       players with the rest of the game the moment it appears, and the minutes
       column stops saying where any of it came from; built up one player at a
       time, each number moves when its player is placed. The players from the
       change before are listed first and land back in their old spots, so
       rebuilding the ones who stay is a tap each. */
    blocks.push({ start: at, assign: {} });
    ui.snapAt = at; ui.snapSid = null;
    savePlan(m, blocks); toast(`New change at ${mmss(at)} — put on who plays from here`); return;
  }
  if (a === 'snapfill') {
    const prev = blocks.filter(b => b.start < cur.start).pop();
    if (!prev) return;
    const placed = new Set(Object.values(cur.assign));
    let n = 0;
    for (const s of shape) {
      const pid = (prev.assign || {})[s.id];
      if (pid && !cur.assign[s.id] && !placed.has(pid)) { cur.assign[s.id] = pid; placed.add(pid); n++; }
    }
    ui.snapSid = null;
    savePlan(m, blocks); toast(n ? `${n} filled from the change before` : 'Nothing left to fill from the change before'); return;
  }
  if (a === 'snapdel') {
    if (cur.start === 0 && blocks.length > 1) { toast('Kick-off is where the plan starts — clear its spots instead'); return; }
    if (blocks.length === 1 && !confirm('Delete the whole plan?')) return;
    const i = blocks.indexOf(cur);
    blocks.splice(i, 1);
    ui.snapAt = blocks.length ? blocks[Math.max(0, i - 1)].start : null; ui.snapSid = null;
    savePlan(m, blocks); return;
  }
  if (a === 'snaptime') {
    if (cur.start === 0) return;
    const at = clamp(cur.start + Number(d.d), 60, end - 60);
    if (at === cur.start) return;
    if (taken(at)) { toast(`There is already a snapshot at ${mmss(at)}`); return; }
    cur.start = at; ui.snapAt = at;
    savePlan(m, blocks); return;
  }
  if (a === 'snapslot') {
    const sid = d.sid;
    if (!ui.snapSid || ui.snapSid === sid) { ui.snapSid = ui.snapSid === sid ? null : sid; render(); return; }
    // a spot was already picked: swap the two, empty or not
    const x = cur.assign[ui.snapSid], y = cur.assign[sid];
    if (!x && !y) { ui.snapSid = sid; render(); return; }
    if (y) cur.assign[ui.snapSid] = y; else delete cur.assign[ui.snapSid];
    if (x) cur.assign[sid] = x; else delete cur.assign[sid];
    ui.snapSid = null;
    savePlan(m, blocks); return;
  }
  if (a === 'snapclear') {
    if (ui.snapSid) delete cur.assign[ui.snapSid];
    savePlan(m, blocks); return;
  }
  if (a === 'snapplayer') {
    const p = (t.players || {})[d.pid]; if (!p) return;
    const had = Object.keys(cur.assign).find(k => cur.assign[k] === p.id) || null;
    let sid = ui.snapSid;
    if (!sid) {
      if (had) { ui.snapSid = had; render(); return; }
      // no spot picked: back where she was in the change before, else the open spot that suits her best
      const open = shape.filter(s => !cur.assign[s.id]);
      if (!open.length) { toast('Every spot is filled — tap the spot she should take'); return; }
      const before = blocks.filter(b => b.start < cur.start).pop();
      const was = before && Object.keys(before.assign || {}).find(k => before.assign[k] === p.id);
      sid = was && !cur.assign[was] ? was : open.slice().sort((x, y) => fit(p, y) - fit(p, x))[0].id;
    }
    if (had === sid) { ui.snapSid = null; render(); return; }
    const was = cur.assign[sid];
    cur.assign[sid] = p.id;
    if (had) { if (was) cur.assign[had] = was; else delete cur.assign[had]; }
    // carry on down the empty spots, so a lineup is one tap per player
    const nextOpen = shape.find(s => !cur.assign[s.id]);
    ui.snapSid = ui.snapSid && nextOpen ? nextOpen.id : null;
    savePlan(m, blocks); return;
  }
}

function sheetPlan() {
  const t = team(), m = match();
  if (!m.plan) return;
  openSheet(`<h3>Game plan${m.formation ? ' · ' + esc(m.formation.name) : ''}</h3>
    ${planDetail(t, m)}
    <button class="btn wide" data-act="closesheet" style="margin-top:12px">Done</button>`);
}

/* The whole plan, block by block, then what it gives each player. Shared by the
   sheet on the Pitch tab and the Plan tab, so the two never drift apart. */
function planDetail(t, m) {
  const roster = squad(t, m);
  const projected = planSeconds(m), blocks = planBlocks(m);
  const nm = id => { const p = (t.players || {})[id]; return p ? (p.number ? p.number + ' ' : '') + p.name.split(' ')[0] : '?'; };
  const spotFor = (b, id) => {
    const sid = Object.keys(b.assign || {}).find(k => b.assign[k] === id);
    const sl = sid && slotById(m, sid);
    return sl ? ` (${sl.label})` : '';
  };
  return `<p class="muted" style="margin-top:0">${m.plan.manual ? `${blocks.length} snapshot${blocks.length === 1 ? '' : 's'}.` : `${blocks.length} blocks of about ${Math.round(m.plan.blockMinutes)} minutes.`}</p>
    ${blocks.map((b, i) => {
    const prev = i ? blocks[i - 1] : null;
    const bi = b.ids || [], pi = prev ? prev.ids || [] : [];
    const onIds = prev ? bi.filter(id => !pi.includes(id)) : bi;
    const offIds = prev ? pi.filter(id => !bi.includes(id)) : [];
    return `<div class="planblock"><div class="spread"><b>${esc(snapLabel(m, b.start))}</b>
        <button class="btn quiet sm" data-act="applyblock" data-start="${b.start}">Use this XI</button></div>
        <div style="margin-top:4px">${prev ? `${onIds.length ? `<span class="on">on: ${onIds.map(id => nm(id) + spotFor(b, id)).join(', ')}</span> ` : ''}${offIds.length ? `<span class="off">off: ${offIds.map(nm).join(', ')}</span>` : ''}${!onIds.length && !offIds.length ? '<span class="muted">unchanged</span>' : ''}` : bi.map(id => nm(id) + spotFor(b, id)).join(', ')}</div></div>`;
  }).join('')}
    <h3 style="margin-top:16px">Projected minutes</h3>
    ${roster.map(p => {
    const pr = Math.round((projected[p.id] || 0) / 60), pd = Number((m.planned && m.planned[p.id]) || 0);
    const d = pr - pd;
    return `<div class="spread" style="padding:4px 0"><span>${esc(p.name)}</span>
      <span><b>${pr}</b> <span class="muted">of ${pd} planned${pd ? d < 0 ? ` · ${-d} short` : d > 0 ? ` · ${d} over` : '' : ''}</span></span></div>`;
  }).join('')}`;
}

/* ---------------- AI prompt helper ---------------- */

/* The app never calls an AI model (CLAUDE.md), and a coach's own ChatGPT or
   Claude account cannot be borrowed from inside another site — every one of
   them refuses to be framed. So the helper is a prompt generator: it writes out
   what the app knows as plain text, and the coach pastes it into whichever
   assistant she already uses. Nothing leaves the device unless she does that.

   Because it does leave with her, it is held to the public mirror's contract:
   a player is a shirt number and never a name. Notes, photos and parent links
   stay out altogether — a note is free text and is exactly where a name ends up.
   Where two players share a number, or one has none, they get a letter instead
   of a label that would merge them. */
function aiLabels(t) {
  const ps = players(t);
  const seen = {};
  for (const p of ps) { const n = String(p.number ?? '').trim(); if (n) seen[n] = (seen[n] || 0) + 1; }
  const out = {};
  let k = 0;
  for (const p of ps) {
    const n = String(p.number ?? '').trim();
    out[p.id] = n && seen[n] === 1 ? '#' + n : 'Player ' + (k < 26 ? String.fromCharCode(65 + k) : k + 1);
    if (!(n && seen[n] === 1)) k++;
  }
  return out;
}

function aiFormat(m) {
  return `${m.onFieldCount || 11}v${m.onFieldCount || 11}, ${m.periodCount || 2} × ${m.periodMinutes || 40} min`;
}

function aiGameLine(m) {
  const st = gameStatus(m), sc = score(m), sh = shotTally(m), po = possession(m);
  const bits = [
    st === 'upcoming' ? 'not played yet' : `${st === 'live' ? 'in progress, ' : ''}${sc.us}–${sc.them}`,
    (sh.usOn + sh.usOff + sh.themOn + sh.themOff) ? `shots ${sh.usOn + sh.usOff} (${sh.usOn} on target) vs ${sh.themOn + sh.themOff} (${sh.themOn})` : '',
    po.changes > 2 && po.us + po.them ? `possession ${Math.round(po.us / (po.us + po.them) * 100)}% ours` : '',
    ...EVENTS.map(e => { const u = evCount(m, e.k, 'us'), th = evCount(m, e.k, 'them'); return u + th ? `${e.label.toLowerCase()} ${u}–${th}` : ''; })
  ].filter(Boolean);
  return `${m.date || 'no date'} vs ${m.opponent || 'TBC'}${m.venue ? ' (' + m.venue + ')' : ''}: ${bits.join('; ')}`;
}

function aiSeasonFacts(t, lab) {
  const ms = teamMatches(t.id).slice().reverse();
  const rows = players(t).map(p => {
    let pl = 0, pd = 0, g = 0, a = 0, sh = 0, apps = 0;
    const roles = {};
    for (const m of ms) {
      const s = playedSec(m, p.id); pl += s; if (s > 0) apps++;
      pd += plannedSec(m, p.id);
      g += goalList(m).filter(x => x.pid === p.id).length;
      a += goalList(m).filter(x => x.assist === p.id).length;
      sh += shotList(m).filter(x => x.pid === p.id).length;
      for (const [k, v] of Object.entries(byRole(m, p.id))) roles[k] = (roles[k] || 0) + v;
    }
    const rs = Object.entries(roles).filter(([k, v]) => v >= 60 && k !== 'Unassigned').sort((x, y) => y[1] - x[1]).map(([k, v]) => `${mins(v)} at ${k}`).join(', ');
    return `- ${lab[p.id]}${p.gk ? ' (GK)' : ''}: ${mins(pl)} min in ${apps} game${apps === 1 ? '' : 's'}${pd ? `, ${mins(pd)} planned` : ''}`
      + `${g ? `, ${g} goal${g === 1 ? '' : 's'}` : ''}${a ? `, ${a} assist${a === 1 ? '' : 's'}` : ''}${sh ? `, ${sh} shot${sh === 1 ? '' : 's'}` : ''}${rs ? ` — ${rs}` : ''}`;
  });
  return `SQUAD (${rows.length} players, season totals)\n${rows.join('\n') || '- none yet'}\n\n`
    + `GAMES (oldest first)\n${ms.map(m => '- ' + aiGameLine(m)).join('\n') || '- none yet'}`;
}

function aiGameFacts(t, m, lab) {
  const now = nowMs();
  const L = id => lab[id] || 'unknown player';
  const roster = squad(t, m);
  const mins_ = roster.map(p => {
    const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id);
    const rs = Object.entries(byRole(m, p.id, now)).filter(([k, v]) => v >= 60 && k !== 'Unassigned').map(([k, v]) => `${mins(v)} at ${k}`).join(', ');
    return `- ${L(p.id)}${p.gk ? ' (GK)' : ''}: ${mins(pl)} min${pd ? ` of ${mins(pd)} planned` : ''}${onField(m, p.id) && gameStatus(m) === 'live' ? ', on now' : ''}${rs ? ' — ' + rs : ''}`;
  });
  const out = outIds(t, m).map(L);
  const goals = goalList(m).map(g => `- ${mins(g.t)}' ${g.side === 'us' ? 'us' : 'them'}${g.pid ? ' ' + L(g.pid) : ''}${g.assist ? ' (assist ' + L(g.assist) + ')' : ''}`);
  /* endGame() closes every open stint at the whistle. Those are not subs, and
     eleven of them read to a model like a mass substitution in the last minute. */
  const whistle = gameStatus(m) === 'done' ? elapsedSec(m, now) - 3 : Infinity;
  const subs = subEvents(m).slice().reverse().filter(r => r.on || r.t < whistle).map(r => `- ${mins(r.t)}' ${r.move ? `${L(r.on)} moved${r.spot ? ' to ' + r.spot : ''}` : [r.on ? L(r.on) + ' on' : '', r.off ? L(r.off) + ' off' : ''].filter(Boolean).join(', ')}`);
  return `GAME: ${aiGameLine(m)}\nFormat: ${aiFormat(m)}${m.formation ? ', formation ' + m.formation.name : ''}. ${gameStatus(m) === 'done' ? 'Full time.' : gameStatus(m) === 'live' ? `Clock at ${mins(elapsedSec(m, now))} min.` : ''}\n\n`
    + `MINUTES\n${mins_.join('\n') || '- no squad'}${out.length ? `\nUnavailable: ${out.join(', ')}` : ''}\n\n`
    + `GOALS\n${goals.join('\n') || '- none'}\n\nSUBSTITUTIONS\n${subs.join('\n') || '- none'}`;
}

/* Planning is a different question from reviewing, and wants different facts:
   nothing has happened yet, so "0 min of 39 planned" eleven times over is noise.
   What a model needs is what the app's own planner reads — the shape, the
   targets, where each player can play, how long a spell she can manage, who
   pairs and who is kept apart — plus the season so far, so it can even things
   out rather than plan the game as if it were the first. */
function aiPlanFacts(t, m, lab) {
  const L = id => lab[id] || 'unknown player';
  const roster = squad(t, m).map(migrate);
  const ids = new Set(roster.map(p => p.id));
  const earlier = teamMatches(t.id).filter(x => x.id !== m.id && gameStatus(x) !== 'upcoming');
  const slots = (m.formation && m.formation.slots) || [];
  const blocks = planBlocks(m), projected = planSeconds(m);
  const rows = roster.map(p => {
    const season = earlier.reduce((n, x) => n + playedSec(x, p.id), 0);
    const where = p.gk ? 'goalkeeper' : [p.preferred ? 'best at ' + p.preferred : '', (p.canPlay || []).length ? 'also ' + p.canPlay.join('/') : '', p.anywhere === false ? 'only those' : ''].filter(Boolean).join(', ');
    return `- ${L(p.id)}: my target ${m.planned && m.planned[p.id] != null ? m.planned[p.id] + ' min' : 'not set'}`
      + `${blocks.length ? `, my plan gives ${mins(projected[p.id] || 0)}` : ''}`
      + `${where ? '; ' + where : ''}; strength ${rating(p)}/5${p.maxStint ? `; longest spell ${p.maxStint} min` : ''}`
      + `; ${mins(season)} min over ${earlier.length} earlier game${earlier.length === 1 ? '' : 's'}`;
  });
  const link = key => {
    const seen = new Set(), out = [];
    for (const p of roster) for (const o of Object.keys(p[key] || {})) {
      const k = [p.id, o].sort().join('|');
      if (ids.has(o) && !seen.has(k)) { seen.add(k); out.push(`${L(p.id)} & ${L(o)}`); }
    }
    return out.join(', ');
  };
  const pairs = link('pairs'), apart = link('avoid');
  const out = outIds(t, m).map(L);
  /* The coach's own snapshots, whole lineup each time rather than just the
     changes: a model reasons about "who is on at 20 minutes" far more reliably
     from the list than by replaying a chain of swaps. */
  const snaps = blocks.map(b => {
    const on = Object.entries(b.assign || {}).map(([sid, pid]) => { const sl = slotById(m, sid); return `${sl ? sl.label : '?'} ${L(pid)}`; });
    const placed = new Set(Object.values(b.assign || {}));
    for (const id of b.ids || []) if (!placed.has(id)) on.push(L(id));
    const bench = roster.filter(p => !(b.ids || []).includes(p.id)).map(p => L(p.id));
    return `- ${snapLabel(m, b.start)}: ${on.join(', ') || 'nobody yet'}${bench.length ? ` | bench ${bench.join(', ')}` : ''}`;
  });
  return `GAME: ${m.date || 'no date'} vs ${m.opponent || 'TBC'}${m.kickoff ? ' at ' + m.kickoff : ''}`
    + `\nFormat: ${aiFormat(m)}${m.formation ? `, formation ${m.formation.name}` : ''}${slots.length ? ` (positions: ${Object.values(aiSlotNames(m)).join(', ')})` : ''}.`
    + ` Subs roughly every ${Number(m.blockMinutes) || 10} min.\n\n`
    + `AVAILABLE SQUAD (${roster.length})\n${rows.join('\n') || '- none'}`
    + `${out.length ? `\nUnavailable: ${out.join(', ')}` : ''}`
    + `${pairs ? `\nPlay well together: ${pairs}` : ''}${apart ? `\nKeep apart: ${apart}` : ''}`
    + (snaps.length ? `\n\nMY PLAN SO FAR (${m.plan && m.plan.manual ? 'my snapshots' : 'an app draft I may change'})\n${snaps.join('\n')}` : '')
    + (roster.some(p => m.planned && m.planned[p.id] != null) ? ''
      : '\n\nNo targets are set for this game: share the minutes evenly, giving a little extra to whoever is furthest behind on the season.');
}

function aiClubFacts() {
  return teams().map(t => {
    const ms = teamMatches(t.id), done = ms.filter(m => gameStatus(m) === 'done');
    let w = 0, d = 0, l = 0;
    for (const m of done) { const s = score(m); if (s.us > s.them) w++; else if (s.us === s.them) d++; else l++; }
    const tot = players(t).filter(p => !p.gk).map(p => ms.reduce((n, m) => n + playedSec(m, p.id), 0));
    const spread = tot.length && done.length ? `; outfield season minutes range ${mins(Math.min(...tot))}–${mins(Math.max(...tot))}` : '';
    return `- ${t.name || 'Untitled team'}: ${players(t).length} players, ${done.length} played (${w}W ${d}D ${l}L), ${ms.length - done.length} to come${spread}`;
  }).join('\n') || '- no teams yet';
}

const AI_TOPICS = {
  team: [
    ['season', 'Season review', 'Review our season so far. What are we doing well, where are we struggling, and what two or three things should I focus on next?'],
    ['fair', 'Playing time', 'Look at how playing time is shared. Who is behind or ahead of plan, is anyone stuck in one position, and how should I rebalance over the next few games?'],
    ['practice', 'Practice plan', 'Suggest a 75-minute practice plan for this week built around what the numbers say we need most. Keep drills age-appropriate and name what each one fixes.'],
    ['next', 'Next game', 'Help me plan minutes and positions for our next game so the season evens out. Say who should start and roughly when to rotate.']
  ],
  game: [
    ['plan', 'Plan this game', 'Help me finish my plan for this game. Start from my targets, my plan so far and my ideas above, and keep my choices unless there is a clear reason not to (say why when you change one). Check it: flag anyone who ends up short of or over their target, anyone past their longest spell, and any block where the shape looks unbalanced. Then fill in the gaps and give me the whole plan as a table, one row per block, showing who is on and where.'],
    ['review', 'Game review', 'Review this game. What went well, what did not, and what should we work on at the next practice?'],
    ['halftime', 'Half-time', 'We are at half-time or a break in this game. Give me three short, practical adjustments and suggest subs that keep minutes on plan.'],
    ['parents', 'Note to parents', 'Write a short, warm note to parents summarising this game. Refer to players only by shirt number so I can fill in names, and keep the focus on effort and the team rather than the result.']
  ],
  club: [
    ['club', 'Club overview', 'Give me an overview of the club across all teams. Which teams look healthy, which may need support, and what should I raise with coaches?'],
    ['clubfair', 'Fair minutes', 'Across the teams, where does playing time look uneven, and what club-wide guideline on minutes would you suggest?']
  ]
};

function aiPrompt(scope, topic, ideas) {
  const list = AI_TOPICS[scope];
  const [, , ask] = list.find(x => x[0] === topic) || list[0];
  const t = team(), m = match();
  const who = scope === 'club' ? 'I run a youth soccer club' : 'I coach a youth soccer team';
  const legend = 'Players are identified by shirt number only (or a letter). Minutes are rounded.';
  let facts;
  if (scope === 'club') facts = `TEAMS\n${aiClubFacts()}`;
  else if (scope === 'game') facts = topic === 'plan' ? aiPlanFacts(t, m, aiLabels(t)) : aiGameFacts(t, m, aiLabels(t));
  else {
    facts = aiSeasonFacts(t, aiLabels(t));
    const next = teamMatches(t.id).filter(x => gameStatus(x) === 'upcoming').pop();
    if (topic === 'next' && next) facts += `\n\nNEXT GAME: ${next.date || 'no date'} vs ${next.opponent || 'TBC'}, ${aiFormat(next)}`;
  }
  const mine = String(ideas || '').trim();
  const back = scope === 'game' && topic === 'plan' ? '\n\n' + aiPlanAsk(m) : '';
  return `${who}. ${legend}\n\n${facts}${mine ? `\n\nMY IDEAS\n${mine}` : ''}\n\n${ask}${back}`;
}

/* ---- bringing an AI's plan back ----
   The answer comes back as text the coach pastes, so the prompt asks for it in
   one fixed shape the app can read: a line per change, the game-clock time and
   then every spot with its player's label. Position labels have to be unique
   to be read back, and a coach's own shape can repeat one ("CB", "CB"), so a
   repeat is numbered. Players are the same labels the prompt used, so a name
   never has to travel in either direction. */
function aiSlotNames(m) {
  const slots = (m && m.formation && m.formation.slots) || [], seen = {}, out = {};
  for (const sl of slots) {
    const base = String(sl.label || sl.role || 'P').replace(/[^A-Za-z0-9]/g, '') || 'P';
    seen[base] = (seen[base] || 0) + 1;
    out[sl.id] = seen[base] > 1 ? base + seen[base] : base;
  }
  return out;
}
function aiPlanAsk(m) {
  const names = Object.values(aiSlotNames(m));
  if (!names.length) return '';
  const per = m.periodMinutes || 40;
  return `So I can load it straight into my app, end your answer with the plan again in exactly this form and nothing else on those lines: a line saying PLAN, then one line per change starting at kick-off, each with the game-clock time (minutes:seconds from kick-off, so the ${halfName(m, 2).toLowerCase()} starts at ${per}:00) and then every position with who plays it, the whole lineup each time:\n`
    + `PLAN\n0:00 ${names.map((n, i) => `${n}=${i === 0 ? '#1' : '…'}`).join(' ')}\n10:00 ${names.map(n => `${n}=…`).join(' ')}`;
}
/* Read the pasted answer. Strict about the lines it recognises — a time, then
   position=player pairs — and blind to everything else, so the AI's chat around
   the plan does not matter but a typo in the plan itself is reported rather
   than quietly dropped. Returns { blocks, problems }; blocks are only worth
   using when problems is empty. */
function aiPlanParse(t, m, text) {
  const names = aiSlotNames(m), bySlot = {};
  for (const [sid, n] of Object.entries(names)) bySlot[n.toLowerCase()] = sid;
  const lab = aiLabels(t), byLab = {};
  for (const [pid, l] of Object.entries(lab)) byLab[l.toLowerCase().replace(/\s+/g, ' ')] = pid;
  const end = matchMinutes(m) * 60, per = (m.periodMinutes || 40) * 60;
  const blocks = [], problems = [];
  const PAIR = /(^|[^A-Za-z0-9#])([A-Za-z][A-Za-z0-9]{0,5})\s*(?:[=:]\s*(#?\d+|Player\s+[A-Z]{1,2}\b)|\s+(#\d+|Player\s+[A-Z]{1,2}\b))/g;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/[*`_|]/g, ' ').replace(/[–—]/g, '-').trim();
    const tm = /^(?:[-•]\s*)?(?:(kick-?off|ko)|(half-?time|ht)|(\d{1,3})(?::(\d{2}))?\s*'?)(?=\s|$|[-:,])/i.exec(line);
    if (!tm) continue;
    const rest = line.slice(tm[0].length);
    const pairs = [...rest.matchAll(PAIR)];
    if (!pairs.length) continue;
    const start = tm[1] ? 0 : tm[2] ? per : Number(tm[3]) * 60 + Number(tm[4] || 0);
    const at = start ? mmss(start) : 'Kick-off';
    if (start >= end) { problems.push(`${at}: after full time`); continue; }
    if (blocks.some(b => b.start === start)) { problems.push(`${at}: there are two lines for this time`); continue; }
    const assign = {}, used = new Set();
    for (const p of pairs) {
      const sl = p[2].toLowerCase();
      if (['bench', 'subs', 'sub', 'off', 'out'].includes(sl)) break;
      const sid = bySlot[sl], who = (p[3] || p[4]).replace(/\s+/g, ' ');
      const pid = byLab[(/^\d+$/.test(who) ? '#' + who : who).toLowerCase()];
      if (!sid) { problems.push(`${at}: no position called ${p[2]} in this shape`); continue; }
      if (!pid) { problems.push(`${at}: nobody in the squad is ${who}`); continue; }
      if (used.has(pid)) { problems.push(`${at}: ${who} is in two positions`); continue; }
      if (assign[sid]) { problems.push(`${at}: ${names[sid]} is given twice`); continue; }
      assign[sid] = pid; used.add(pid);
    }
    blocks.push({ start, assign });
  }
  if (!blocks.length) problems.push('No plan lines found. They look like: 0:00 GK=#1 LB=#4 …');
  else if (!blocks.some(b => b.start === 0)) problems.push('No kick-off line (0:00)');
  return { blocks: blocks.sort((a, b) => a.start - b.start), problems };
}

/* A coach writing her ideas will write "Page starts at CB", not "#39 starts at
   CB". So whatever is about to leave — the ideas box and any edit to the prompt
   itself — has every roster name swapped for that player's label first: full
   names before single words, so "Ella Fitzgerald" becomes one "#7" rather than
   "#7 Fitzgerald". At club level a label would not say which team, so a name
   there becomes "a player". Over-matching is the safe way round here: a word
   that happens to be a name ("Page") is replaced rather than let through. */
function aiScrub(text, scope) {
  const pool = scope === 'club' ? teams().map(t => [t, null]) : [[team(), aiLabels(team())]];
  const subs = [];
  for (const [t, lab] of pool) for (const p of players(t)) {
    const to = lab ? lab[p.id] : 'a player';
    const full = String(p.name || '').trim();
    if (!full) continue;
    subs.push([full, to]);
    for (const w of full.split(/\s+/)) if (w.length >= 2) subs.push([w, to]);
  }
  return replaceNames(text, subs);
}
function replaceNames(text, subs) {
  subs = subs.slice().sort((a, b) => b[0].length - a[0].length);
  let n = 0;
  for (const [from, to] of subs) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu');
    text = text.replace(re, (all, pre) => { n++; return pre + to; });
  }
  return { text, n };
}
/* Free text on its way to public/. Venue and opponent have always been
   published as typed, but the calendar adds notes, titles and kit, and a note
   is exactly where a name gets typed — "Ella's family on snacks". The mirror's
   promise is that no child's name is in it by construction, so a roster name
   here becomes "a player" before it is written, not before it is drawn. Every
   word of every name, as the AI prompt does: "Rose Park" losing a word is the
   safe way round, and the coach is told when it happens. */
function pubText(t, s) {
  if (!s) return '';
  const subs = [];
  for (const p of players(t)) {
    const full = String(p.name || '').trim();
    if (!full) continue;
    subs.push([full, 'a player']);
    for (const w of full.split(/\s+/)) if (w.length >= 2) subs.push([w, 'a player']);
  }
  return replaceNames(String(s), subs).text;
}

/* Where the prompt goes once it is copied. Both ?q= links pre-fill the box; the
   copy happens first either way, so a site that ignores ?q= still just needs a
   paste. Long prompts skip ?q= — a URL has limits a clipboard does not. */
const AI_SITES = {
  chatgpt: ['ChatGPT', 'https://chatgpt.com/', q => 'https://chatgpt.com/?q=' + encodeURIComponent(q)],
  claude: ['Claude', 'https://claude.ai/new', q => 'https://claude.ai/new?q=' + encodeURIComponent(q)],
  gemini: ['Gemini', 'https://gemini.google.com/app', null]
};

const aiButton = scope => `<div class="card"><div class="spread">
    <div><h2>Ask an AI</h2><div class="muted">${scope === 'club' ? 'A ready-made prompt about every team' : scope === 'game' ? 'A ready-made prompt about this game' : 'A ready-made prompt about the season'}, to paste into ChatGPT or Claude</div></div>
    <button class="btn quiet sm" data-act="aihelp" data-scope="${scope}">Build prompt</button></div></div>`;

function sheetAi(scope, topic) {
  const list = AI_TOPICS[scope];
  const tp = list.some(x => x[0] === topic) ? topic : list[0][0];
  ui.ai = { scope, topic: tp };
  const key = scope === 'game' && match() ? match().id : null;
  const ideas = key ? ((ui.aiIdeas || {})[key] || '') : '';
  openSheet(`<h3>Ask an AI</h3>
    <p class="muted" style="margin-top:0">Pick a question, copy the prompt, and paste it into your own ChatGPT, Claude or Gemini. The app does not send it anywhere itself.</p>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px">${list.map(([k, label]) =>
    `<button class="opt" type="button" style="width:auto" data-act="aitopic" data-k="${k}" aria-current="${k === tp}">${esc(label)}</button>`).join('')}</div>
    ${tp === 'plan' ? `<label class="field"><span>Your ideas — minutes, positions, who plays when</span>
      <textarea id="aiIdeas" rows="4" placeholder="#7 and #9 split up top. #4 plays the whole first half at CB. Keep #10 fresh for the last 15.">${esc(ideas)}</textarea></label>
      <p class="muted" style="margin-top:-6px">Names are fine here: they are swapped for shirt numbers before anything is copied. Your snapshots and targets from the Plan tab are already in the prompt.</p>` : ''}
    <label class="field"><span>Prompt — edit or add to it before copying</span>
      <textarea id="aiPrompt" rows="12" style="font-size:13px">${esc(aiPrompt(scope, tp, ideas))}</textarea></label>
    <button class="btn wide" data-act="aicopy">Copy prompt</button>
    <div class="muted" style="margin:10px 0 4px">Or copy it and open</div>
    <div class="row" style="gap:6px">${Object.entries(AI_SITES).map(([k, [label]]) =>
      `<button class="btn quiet sm" style="flex:1" data-act="aiopen" data-k="${k}">${label}</button>`).join('')}</div>
    <p class="muted" style="margin-bottom:0">Players appear as shirt numbers. No names, notes or photos are included, and any name you type is swapped for a number when you copy.</p>
    ${tp === 'plan' && scope === 'game' && match() && ((match().formation || {}).slots || []).length ? `<h3 style="margin:18px 0 6px">Bring the answer back</h3>
      <p class="muted" style="margin-top:0">Paste the AI's whole reply. The app reads the lines under <b>PLAN</b> and turns them into snapshots you can change before locking in.</p>
      <label class="field"><span>The AI's answer</span><textarea id="aiAnswer" rows="6" style="font-size:13px" placeholder="PLAN&#10;0:00 GK=#1 LB=#4 …"></textarea></label>
      <div id="aiImportMsg"></div>
      <button class="btn wide" data-act="aiimport">Use this plan</button>` : ''}`);
}

/* Scrub what is about to be copied, and show the coach the scrubbed version in
   the box, so what she sees is what left. */
function aiFinal() {
  const ta = $('#aiPrompt');
  const r = aiScrub(ta.value, (ui.ai && ui.ai.scope) || 'team');
  if (r.n) ta.value = r.text;
  return r;
}

function aiCopy(text, swapped) {
  const done = () => toast(swapped ? `Prompt copied — ${swapped} name${swapped === 1 ? '' : 's'} swapped for shirt numbers` : 'Prompt copied — paste it into the chat');
  const fallback = () => {
    const ta = $('#aiPrompt');
    try { ta.select(); document.execCommand('copy'); done(); } catch (e) { toast('Could not copy — select it by hand'); }
  };
  try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
}

/* Resize to 192px and re-encode before storing, so a 4MB phone photo does not
   end up in the database and get republished on every save. */
function pickImage(path, done) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const S = 192, c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        const sc = Math.min(S / im.width, S / im.height);
        const w = im.width * sc, h = im.height * sc;
        ctx.drawImage(im, (S - w) / 2, (S - h) / 2, w, h);
        let url = c.toDataURL('image/webp', 0.85);
        if (url.length > 60000) url = c.toDataURL('image/jpeg', 0.8);
        if (url.length > 90000) { toast('That image is too large'); return; }
        commit(path, url);
        toast(done || 'Saved');
      };
      im.onerror = () => toast('Could not read that image');
      im.src = r.result;
    };
    r.readAsDataURL(f);
  };
  inp.click();
}

function sheetTeam(t) {
  openSheet(`<h3>${t ? 'Edit team' : 'New team'}</h3>
    ${t ? `<p class="muted" style="margin-top:0">${teamStats(t)}</p>
    <div class="row" style="margin-bottom:14px">
      ${teamCrest(t)}
      <span style="flex:1"><button class="btn quiet sm" data-act="picklogo" data-id="${t.id}">${t.logo ? 'Change crest' : 'Use its own crest'}</button>
      ${t.logo ? `<button class="btn quiet sm" data-act="droplogo" data-id="${t.id}">Use club badge</button>` : ''}</span>
    </div>` : ''}
    <label class="field"><span>Name</span><input type="text" id="tName" value="${esc(t && t.name ? t.name : '')}" placeholder="Lakeside Thunder G14"></label>
    <label class="field"><span>Birth year</span><input type="number" inputmode="numeric" id="tBirth" value="${esc(t && t.birthYear ? String(t.birthYear) : '')}" placeholder="${seasonEndYear() - 11}"></label>
    <p class="muted" style="margin-top:-6px">The year most of the squad were born. It sets the age group, ${t && teamUAge(t) != null ? `${uLabel(teamUAge(t))} this season, ` : ''}which moves up by itself every August, and starts the drill library at the right age.</p>
    <button class="btn wide" data-act="saveteam" data-id="${t ? t.id : ''}">${t ? 'Save changes' : 'Create team'}</button>
    ${t ? `<div style="margin-top:8px"><button class="btn danger wide" data-act="delteam" data-id="${t.id}">Delete this team and its games</button></div>` : ''}`);
}

/* ---------------- events ---------------- */
function onAct(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, d = el.dataset;
  const t = team(), m = match();
  if (!mayAct(a, m, d)) { closeSheet(); toast("Only this team's coaches can change that"); render(); return; }
  if (PRACTICE_ACTS.has(a) && !canTrain()) { closeSheet(); toast('Practice is for coaches and admins'); render(); return; }
  if (SESS_ACTS.has(a)) { onSessAct(a, d); return; }

  if (a === 'practab') {
    const p = practiceUi();
    p.tab = ['plans', 'drills', 'positions'].includes(d.k) ? d.k : 'plans';
    if (p.tab !== 'drills') p.pick = null;
    render(); return;
  }
  if (a === 'drill') { sheetDrill(d.id, undefined, true); return; }
  if (a === 'drillpic') { sheetDrill(d.id, d.k === 'move'); return; }
  if (a === 'roleguide') { sheetRole(d.id, undefined, true); return; }
  if (a === 'rolepic') { sheetRole(d.id, d.k === 'move'); return; }
  if (a === 'drillfilters') { sheetDrillFilters(); return; }
  if (a === 'drillmore') { practiceUi().show += 24; refreshDrillList(); saveUi(); return; }
  if (a === 'dfchip' || a === 'dfpick' || a === 'dfclear') {
    const p = practiceUi(), f = p.f;
    if (a === 'dfclear') p.f = { ...PRACTICE_BLANK(), age: f.age, sort: f.sort };
    else if (a === 'dfchip' && Array.isArray(f[d.k])) {
      const v = String(d.v), i = f[d.k].indexOf(v);
      if (i >= 0) f[d.k].splice(i, 1); else f[d.k].push(v);
    } else if (a === 'dfpick' && typeof f[d.k] === 'string') f[d.k] = String(d.v || '');
    p.show = 24;
    render();
    if (d.in === 'sheet') sheetDrillFilters();
    return;
  }

  /* ---- the club's drills and her own ---- */
  if (LIB_ACTS.has(a)) {
    const p = practiceUi(), L = drillLib();
    if (a === 'shelf') { p.shelf = ownKey(SHELVES, d.k) ? d.k : 'all'; p.show = 24; render(); return; }
    if (a === 'clubdrills' || a === 'mydrills') {
      ui.view = 'practice'; p.tab = 'drills'; p.pick = null; p.run = null; p.shelf = a === 'clubdrills' ? 'club' : 'mine';
      closeSheet(); render(); toTop(); return;
    }
    if (!me || !L) { closeSheet(); toast('Sign in to keep drills of your own'); return; }
    const dr = d.id ? findDrill(d.id) : null;
    const copyToMine = x => putDrill('mine', { ...cardOf(x), id: uid(), v: 1, from: { shelf: x.shelf || 'builtin', id: x.id, v: x.v || 1 } });
    const edit = (shelf, x) => { drillDraft = { shelf, id: x ? x.id : null, d: draftFrom(x), keepPic: !!(x && (x.pic || !x.shelf || x.shelf === 'builtin')) }; sheetDrillEditor(true); };
    if (a === 'drillnew') { edit('mine', null); return; }
    if (a === 'drillorig') {
      const o = dr && drillOrigin(dr);
      if (!o) { toast('The original isn\'t here any more'); return; }
      sheetDrill(o.d.key || o.d.id, undefined, true); return;
    }
    if (a === 'drillmine') {
      if (!dr || dr.shelf === 'mine') return;
      const n = copyToMine(dr);
      sheetDrill('mine:' + n.id, undefined, true); toast('Saved to your drills'); render(); return;
    }
    if (a === 'drilledit') {
      if (!dr) return;
      if (dr.shelf === 'mine' || canCurate(dr)) { edit(dr.shelf, dr); return; }
      /* Editing somebody else's drill is saving your own version of it. The
         original is untouched, and yours says where it came from. */
      const n = normDrill(copyToMine(dr), 'mine', null);
      edit('mine', n); toast('Your own copy. The original is untouched'); render(); return;
    }
    if (a === 'drillshare') {
      if (!dr || dr.shelf !== 'mine') return;
      const tid = shareTeam();
      if (!wsCode() || !tid) { toast('Only a coach or an admin of a club can share into it'); return; }
      if (!confirm('Share a copy with the club? Every coach and admin in it can read it. Yours stays yours.')) return;
      const n = putDrill('club', { ...cardOf(dr), id: uid(), v: 1, from: { shelf: 'mine', id: dr.id, v: dr.v || 1 }, by: me.uid, byName: whoAmI() || '', team: tid });
      sheetDrill('club:' + n.id, undefined, true); toast('Shared with the club'); render(); return;
    }
    if (a === 'drilldel') {
      if (!dr) return;
      if (dr.shelf === 'mine') {
        if (!confirm('Delete this drill? Practices that use it keep their own copy.')) return;
        dropDrill('mine', dr.id);
      } else if (dr.shelf === 'club' && canCurate(dr)) {
        if (!confirm('Remove this drill from the club? Copies coaches saved, and practices that use it, keep theirs.')) return;
        dropDrill('club', dr.id);
      } else { toast('Only an admin, or the coach who shared it, can remove it'); return; }
      closeSheet(); render(); toast('Deleted'); return;
    }
    const dr2 = drillDraft;
    if (!dr2) { closeSheet(); return; }
    /* A draft for a club drill she can no longer change, say because she
       stopped coaching its team while the sheet was open, goes no further. */
    if (dr2.shelf === 'club' && !canCurate(findDrill('club:' + dr2.id))) { closeSheet(); drillDraft = null; toast('Only an admin, or the coach who shared it, can change it'); return; }
    captureDraft();
    const c = dr2.d;
    if (a === 'dedchip') {
      const k = d.k, v = String(d.v || '');
      if (!ownKey(DRAFT_CHIPS, k) || !ownKey(draftVocab(L, k), v)) return;   // only the library's own words
      const i = c[k].indexOf(v); if (i >= 0) c[k].splice(i, 1); else c[k].push(v);
      sheetDrillEditor(); return;
    }
    if (a === 'dedpic') {
      if (d.k === 'clear') delete c.diagram; else dr2.keepPic = d.k === 'keep';
      sheetDrillEditor(); return;
    }
    if (a === 'dedai') { sheetDrawAi(); return; }
    if (a === 'dedaiback') { dr2.ai = null; sheetDrillEditor(true); return; }
    if (['dedaicopy', 'dedaiopen', 'dedaiuse', 'dedaifix'].includes(a)) {
      const ai = dr2.ai = dr2.ai || { idea: '', reply: '', problems: [] };
      const v = id => { const n = $('#' + id); return n && n.value != null ? String(n.value) : ''; };
      ai.idea = v('daIdea').slice(0, 2000); ai.reply = v('daReply').slice(0, 30000);
      if (a === 'dedaicopy' || a === 'dedaiopen') {
        const r = aiScrub(drawPrompt(c, ai.idea), 'club');
        const site = a === 'dedaiopen' ? AI_SITES[d.k] : null;
        copyQuiet(r.text, r.n ? `Prompt copied — ${r.n} name${r.n === 1 ? '' : 's'} taken out` : 'Prompt copied — paste it into the chat');
        // opened inside the tap itself, or a phone treats it as a pop-up and blocks it
        if (site && typeof window.open === 'function') window.open(site[2] && r.text.length < 6000 ? site[2](r.text) : site[1], '_blank', 'noopener');
        sheetDrawAi(); return;
      }
      if (a === 'dedaifix') {
        copyQuiet(`That drawing has ${ai.problems.length === 1 ? 'a problem' : 'some problems'}:\n${ai.problems.map(x => '- ' + x).join('\n')}\n\nPlease send the corrected JSON object only.`, 'Copied — paste it back into the chat');
        return;
      }
      const raw = drawingFrom(ai.reply);
      ai.problems = drawingProblems(raw);
      if (ai.problems.length) { sheetDrawAi(); return; }
      c.diagram = drillDiagram().clean(raw); delete c.pic; dr2.keepPic = false; dr2.ai = null;
      sheetDrillEditor(true); toast('Drawn. Check it moves the way you meant'); return;
    }
    if (a === 'dedlinkdel') { c.media.splice(Number(d.i), 1); sheetDrillEditor(); return; }
    if (a === 'dedlinkadd') {
      const url = String(($('#dlUrl') || {}).value || '').trim(), title = String(($('#dlTitle') || {}).value || '').trim().slice(0, 80);
      if (!linkOk(url)) { toast('A link has to start with https://'); return; }
      if (c.media.length >= 6) return;
      c.media.push({ kind: 'link', url, title });
      const u = $('#dlUrl'), t2 = $('#dlTitle'); if (u) u.value = ''; if (t2) t2.value = '';
      sheetDrillEditor(); return;
    }
    if (a === 'dedsave') {
      const raw = { ...c };
      if (!dr2.keepPic) delete raw.pic;
      const n = normDrill(raw, dr2.shelf, dr2.id || 'new');
      const why = draftProblem(n);
      if (why) { toast(why); return; }
      const was = dr2.id ? SHELF[dr2.shelf].store().items[dr2.id] : null;
      const old = was ? normDrill(was, dr2.shelf, dr2.id) : null;
      const out = { ...cardOf(n), id: dr2.id || uid(), v: old ? (old.v || 1) + 1 : 1 };
      if (!dr2.keepPic) delete out.pic;
      if (old && old.from) out.from = old.from;
      /* The author stays the author whoever tidies it, so the club can still
         see who wrote it after she has gone; a tidy by someone else is said. */
      if (dr2.shelf === 'club') Object.assign(out, { by: old.by, byName: old.byName, team: old.team },
        me.uid !== old.by ? { edBy: me.uid, edName: whoAmI() || '' } : {});
      const saved = putDrill(dr2.shelf, out);
      drillDraft = null;
      sheetDrill(drillKey(dr2.shelf, saved.id), undefined, true); render(); toast('Saved'); return;
    }
    return;
  }

  /* ---- practice plans ---- */
  if (PLAN_ACTS.has(a)) {
    // from the calendar, which can show several teams at once: the button names its team
    if (a === 'pracfromcal' && d.tid && canPlan(d.tid)) ui.teamId = d.tid;
    const tp = team();
    if (!tp || !canPlan(tp.id)) { closeSheet(); toast("Only this team's coaches plan its practices"); render(); return; }
    const p = practiceUi(), L = drillLib();
    const pr = d.id ? practiceById(tp.id, d.id) : null;
    const i = Number(d.i);
    const by = () => ({ by: me ? me.uid : null, byName: whoAmI() || null });
    const edit = fn => { if (!pr) return; const c = clone(pr); fn(c); putPractice(c); render(); };
    // the same Add, and the same sheet, as the calendar's: one way to put a practice on
    if (a === 'pracnew') { calForm = { ...calFormNew(tp.id), plan: true }; sheetCalEvent(); return; }
    if (a === 'pracfromcal') {
      const e = ((tp.events || {})[d.id]);
      if (!e || e.kind !== 'practice') { toast('That practice is not on the calendar any more'); render(); return; }
      if (!practiceById(tp.id, e.id)) planFromEntry(tp.id, e);
      ui.view = 'practice'; p.tab = 'plans'; p.open = e.id; p.pick = null; p.run = null; closeSheet(); render(); toTop(); return;
    }
    if (a === 'pracopen') {
      if (!pr) { toast('That practice is not on this phone yet'); return; }
      ui.view = 'practice'; p.tab = 'plans'; p.open = pr.id; p.pick = null; p.run = null; closeSheet(); render(); toTop(); return;
    }
    if (a === 'pracback') { p.open = null; render(); return; }
    if (a === 'pracpast') { p.past = true; render(); return; }
    if (a === 'pracedit') { if (pr) sheetPractice(pr); return; }
    if (a === 'pracsave') {
      const date = String($('#prDate').value || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Pick a date'); return; }
      const start = String($('#prStart').value || '').trim();
      if (start && !/^\d{2}:\d{2}$/.test(start)) { toast('That start time doesn\'t look right'); return; }
      const minutes = clamp(Number($('#prLen').value) || 60, 10, 240);
      const place = String($('#prPlace').value || '').trim().slice(0, 80);
      const sig = String($('#prFocus').value || '');
      const focus = { signals: sig && L && L.SIGNALS[sig] ? [sig] : [] };
      if (pr) putPractice({ ...clone(pr), date, start, minutes, place, focus });
      else {
        const id = uid();
        putPractice({ id, teamId: tp.id, date, start, minutes, place, focus, blocks: [], status: 'plan', made: nowMs(), ...by() });
        p.open = id;
      }
      p.tab = 'plans'; closeSheet(); render(); if (!pr) toTop(); return;
    }
    if (a === 'pracpick') { if (!pr) return; p.pick = pr.id; p.open = pr.id; p.tab = 'drills'; render(); toTop(); return; }
    if (a === 'pracpickdone') { p.pick = null; p.tab = 'plans'; if (pr) p.open = pr.id; render(); return; }
    if (a === 'pracadd') {
      const dr = String(d.v || '').startsWith('plan:') ? null : findDrill(d.v);
      if (!pr || !dr) return;
      /* The plan keeps a copy, and every coach of the team reads the plan:
         the one way a drill of hers is seen without her sharing it on purpose. */
      if (dr.shelf === 'mine' && !p.mineShared) {
        if (!confirm('Adding this to the practice shares it with this team\'s coaches. Add it?')) return;
        p.mineShared = true;
      }
      const c = clone(pr); c.blocks.push(drillBlock(L, dr)); putPractice(c);
      closeSheet(); render();
      toast(`Added. ${c.blocks.length} drill${c.blocks.length === 1 ? '' : 's'}, ${blockTotal(c)} of ${c.minutes} min`);
      return;
    }
    if (a === 'pracsuggest') {
      if (!pr || !L) return;
      if (pr.blocks.length && !confirm('Swap the drills in this plan for a suggested session?')) return;
      if (pr.blocks.length) p.turn = (Number(p.turn) || 0) + 1;
      const blocks = suggestPlan(L, tp, pr, Number(p.turn) || 0);
      if (!blocks.length) { toast('No drills fit this team\'s age and squad'); return; }
      edit(c => { c.blocks = blocks; }); return;
    }
    if (a === 'pracmin') { edit(c => { const b = c.blocks[i]; if (b) b.minutes = clamp(b.minutes + (Number(d.d) || 0), 1, 90); }); return; }
    if (a === 'pracmove') {
      edit(c => { const j = i + (Number(d.d) || 0); if (c.blocks[i] && c.blocks[j]) [c.blocks[i], c.blocks[j]] = [c.blocks[j], c.blocks[i]]; });
      return;
    }
    if (a === 'pracdel') { edit(c => { c.blocks.splice(i, 1); }); return; }
    if (a === 'pracnote') { if (pr) sheetBlockNote(pr, i); return; }
    if (a === 'pracnotesave') {
      const note = String($('#prNote').value || '').trim().slice(0, 300);
      edit(c => { if (c.blocks[i]) c.blocks[i].note = note; }); closeSheet(); return;
    }
    if (a === 'pracreview') { if (pr) sheetReview(pr); return; }
    if (a === 'pracrate') {
      const typed = String($('#prReview').value || '');
      edit(c => { c.review = { ...(c.review || {}), rating: clamp(Number(d.v) || 1, 1, 5), at: nowMs(), ...by() }; c.status = 'done'; });
      const n = practiceById(tp.id, d.id); if (n) sheetReview(n, typed);
      return;
    }
    if (a === 'pracreviewsave') {
      const note = String($('#prReview').value || '').trim().slice(0, 200);
      edit(c => { c.review = { ...(c.review || {}), note, at: nowMs(), ...by() }; c.status = 'done'; });
      closeSheet(); toast('Saved'); return;
    }
    if (a === 'pracagain') {
      if (!pr) return;
      let date = /^\d{4}-\d{2}-\d{2}$/.test(pr.date) ? addDays(pr.date, 7) : addDays(todayIso(), 7);
      while (date < todayIso()) date = addDays(date, 7);
      const c = { ...clone(pr), id: uid(), date, status: 'plan', made: nowMs(), ...by() };
      delete c.review;
      putPractice(c); p.open = c.id; render(); toast('Planned for ' + pracDay(date)); return;
    }
    if (a === 'pracrm') {
      if (!pr || !confirm('Delete this practice? The plan goes for every coach on the team.')) return;
      dropPractice(tp.id, pr.id);
      p.open = null; p.run = null; if (p.pick === pr.id) p.pick = null;
      render(); return;
    }
    if (a === 'pracrun') { if (!pr || !pr.blocks.length) return; p.run = { pid: pr.id, i: 0, left: null, endsAt: null }; p.open = pr.id; render(); toTop(); return; }
    const run = p.run, rp = run ? practiceById(tp.id, run.pid) : null, rb = rp && rp.blocks[run.i];
    if (a === 'runstop') { p.run = null; render(); return; }
    if (a === 'runpic') { p.runStill = d.k === 'still'; render(); return; }
    if (!rb) { p.run = null; render(); return; }
    if (a === 'rungo') { const left = runLeft(run, rb); run.endsAt = nowMs() + (left > 0 ? left : 120) * 1000; run.left = null; run.buzzed = false; render(); return; }
    if (a === 'runpause') { run.left = runLeft(run, rb); run.endsAt = null; render(); return; }
    if (a === 'runreset') { run.left = null; run.endsAt = null; run.buzzed = false; render(); return; }
    if (a === 'runnext' && run.i >= rp.blocks.length - 1) { p.run = null; p.open = rp.id; render(); sheetReview(rp); return; }
    if (a === 'runnext' || a === 'runprev') {
      run.i = clamp(run.i + (a === 'runnext' ? 1 : -1), 0, rp.blocks.length - 1);
      run.left = null; run.endsAt = null; run.buzzed = false; render(); toTop(); return;
    }
    return;
  }

  if (a === 'tap') { tapPlayer(d.pid); return; }
  if (a === 'taplive') { tapLive(d.pid); return; }
  if (a === 'clearpick') { ui.picked = null; render(); return; }
  if (a === 'puton') { ui.picked = null; putOn(m, d.pid); render(); return; }
  if (a === 'switchpos') { sheetSwitch(d.pid); return; }
  if (a === 'togglesort') { ui.sortBy = ui.sortBy === 'number' ? 'need' : 'number'; render(); return; }
  if (a === 'pickgame') { sheetPickGame(); return; }
  if (a === 'pickgame2') { ui.matchId = d.id; ui.picked = null; ui.view = 'game'; ui.gameView = 'subs'; closeSheet(); render(); return; }
  if (a === 'doswitch') {
    if (ui.plan) {
      const sl = d.sid ? slotById(m, d.sid) : null;
      stage({ k: 'move', pid: d.pid, sid: d.sid || null, role: d.role || null, label: sl ? sl.label : (d.role || null) });
      closeSheet(); render(); return;
    }
    switchTo(m, d.pid, d.sid || null, d.role || null); closeSheet(); return;
  }
  if (a === 'stageadd') { ui.picked = null; stage({ k: 'add', pid: d.pid }); render(); return; }
  if (a === 'startplan') { ui.plan = { matchId: ui.matchId, items: [] }; ui.picked = null; render(); return; }
  if (a === 'cancelplan') { ui.plan = null; ui.picked = null; render(); return; }
  if (a === 'unstage') { ui.plan.items.splice(Number(d.i), 1); saveUi(); render(); return; }
  if (a === 'applyplan') { applyStaged(m); return; }
  if (a === 'goal') {
    const id = uid(), g = { t: elapsedSec(m), side: d.side, ...stampedBy() };
    commit(`matches/${m.id}/goals/${id}`, g);
    const sc = score(m);
    toast(`${sc.us}–${sc.them} at ${mins(g.t)}′${d.side === 'us' ? ' · tap the goal to add a scorer' : ''}`);
    return;
  }
  if (a === 'fixgoal') { sheetGoal(d.id); return; }
  if (a === 'shot') {
    const id = uid();
    commit(`matches/${m.id}/shots/${id}`, { t: elapsedSec(m), side: d.side, onTarget: d.on === '1', ...stampedBy() });
    toast(`Shot ${d.on === '1' ? 'on' : 'off'} target at ${mins(elapsedSec(m))}′${d.side === 'us' ? ' · tap it to add who' : ''}`);
    return;
  }
  if (a === 'fixshot') { sheetShot(d.id); return; }
  if (a === 'saveshot') {
    const x = (m.shots || {})[d.id]; if (!x) return;
    const b = document.querySelector('[data-act="pickscorer"][data-grp="shooter"][aria-pressed="true"]');
    const tg = document.querySelector('[data-act="pickone"][data-grp="target"][aria-pressed="true"]');
    commit(`matches/${m.id}/shots/${d.id}`, {
      ...x, t: clamp(parseTime($('#shT').value, x.t), 0, elapsedSec(m)),
      pid: b ? b.dataset.v : null, onTarget: tg ? tg.dataset.v === '1' : !!x.onTarget
    });
    closeSheet(); return;
  }
  if (a === 'delshot') { drop(`matches/${m.id}/shots/${d.id}`); closeSheet(); return; }
  if (a === 'ev') {
    commit(`matches/${m.id}/events/${uid()}`, { t: elapsedSec(m), side: d.side, kind: d.kind, ...stampedBy() });
    toast(`${evLabel(d.kind).replace(/s$/, '')} at ${mins(elapsedSec(m))}′`);
    return;
  }
  if (a === 'fixev') { sheetEvent(d.id); return; }
  if (a === 'saveev') {
    const x = (m.events || {})[d.id]; if (!x) return;
    const b = document.querySelector('[data-act="pickscorer"][data-grp="who"][aria-pressed="true"]');
    commit(`matches/${m.id}/events/${d.id}`, { ...x, t: clamp(parseTime($('#evT').value, x.t), 0, elapsedSec(m)), pid: b ? b.dataset.v : null });
    closeSheet(); return;
  }
  if (a === 'delev') { drop(`matches/${m.id}/events/${d.id}`); closeSheet(); return; }
  if (a === 'logfilter') { ui.logFilter = d.v; render(); return; }
  if (a === 'feedall') { ui.feedAll = d.v === '1'; render(); return; }
  if (a === 'feedfollow') {
    if (d.v !== '1') { ui.follow = null; render(); return; }
    ui.follow = ui.matchId; feedSeen = null; watchFeed();
    // asked on the tap, because browsers refuse a permission prompt nobody asked for
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().then(() => render(), () => { });
    } catch (e) { }
    toast('Following this game');
    render(); return;
  }
  /* Messages. None of these are in COACH_ACTS — a parent sends too — so each
     checks for itself who may do it, rather than trusting what was drawn. */
  if (a === 'inbox') { ui.view = 'inbox'; ui.thread = null; closeSheet(); render(); return; }
  if (a === 'msgall') { ui.msgAll = true; render(); return; }
  if (a === 'msgalerts') {
    try { if (typeof Notification !== 'undefined') Notification.requestPermission().then(() => render(), () => { }); } catch (e) { }
    return;
  }
  if (a === 'thread') { ui.view = 'thread'; ui.thread = { tid: d.tid, fam: d.fam }; render(); return; }
  if (a === 'postnew') { if (!staffTeams().length) { toast('Only coaches and admins post notices'); return; } sheetPost(ui.postTid || ui.teamId); return; }
  if (a === 'postteam') { const el = $('#postText'); sheetPost(d.v, el ? el.value : '', !!ui.postUrgent); return; }
  if (a === 'posturgent') { const el = $('#postText'); sheetPost(ui.postTid, el ? el.value : '', !ui.postUrgent); return; }
  if (a === 'postsend') {
    const tid = ui.postTid, el = $('#postText'), text = String((el && el.value) || '').trim();
    if (!msgFor || !isStaff(tid)) { toast('Only this team’s coaches and the club admins can post to it'); return; }
    if (!text) { toast('Write something first'); return; }
    const id = queueMsg('board', tid, null, text.slice(0, MSG_MAX), ui.postUrgent ? { urgent: true } : null);
    ui.postUrgent = false; ui.view = 'inbox';
    sheetPostShare(tid, id); render(); return;
  }
  if (a === 'postshare') { if (isStaff(d.tid)) sheetPostShare(d.tid, d.id); return; }
  if (a === 'postsharetext') {
    const x = notices(d.tid).find(n => n.id === d.id); if (!x) return;
    const text = `${(state.teams[d.tid] || {}).name || 'Team'} — ${x.byName || 'coach'}:\n${x.text}`;
    if (navigator.share) { navigator.share({ text }).catch(() => { }); return; }
    navigator.clipboard.writeText(text).then(() => toast('Copied — paste it into the team chat'), () => toast('Could not copy'));
    return;
  }
  if (a === 'postseen') { if (isStaff(d.tid)) sheetPostSeen(d.tid, d.id); return; }
  if (a === 'postdel') {
    const x = notices(d.tid).find(n => n.id === d.id);
    if (!x || !msgFor || !isStaff(d.tid) || (x.by !== me.uid && !canAdmin())) { toast('Only whoever posted it, or an admin, can delete it'); return; }
    if (!confirm('Delete this notice for everyone?')) return;
    delete (msgs.board[d.tid] || {})[d.id]; saveMsgs();
    Promise.resolve(fb.remove(fb.ref(fb.db, `board/${msgFor.code}/${d.tid}/${d.id}`))).catch(() => toast('Not deleted — the database refused it'));
    render(); return;
  }
  if (a === 'msgsend') {
    const el = $('#msgText'), text = String((el && el.value) || '').trim();
    const mine = me && d.fam === me.uid && isGuardian(d.tid, me.uid);
    if (!msgFor || !(mine || isStaff(d.tid))) { toast('This conversation is not yours to write in'); return; }
    if (!text) return;
    queueMsg('dm', d.tid, d.fam, text.slice(0, MSG_MAX));
    if (ui.msgDraft) delete ui.msgDraft[d.tid + '/' + d.fam];
    if (el) el.value = '';
    render(); return;
  }
  if (a === 'msgretry') { if (msgs.outbox[d.id]) sendOut(d.id); render(); return; }
  if (a === 'msgdiscard') { delete msgs.outbox[d.id]; saveMsgs(); render(); return; }
  if (a === 'trackcfg') { sheetTrackCfg(); return; }
  if (a === 'hardreload') {
    location.replace(location.pathname + '?r=' + Date.now());
    return;
  }
  if (a === 'people') { ui.view = 'people'; closeSheet(); render(); return; }
  if (a === 'peoplefilter') { ui.peopleFilter = d.v; render(); return; }
  if (a === 'personedit') { sheetPersonRoles(d.uid); return; }
  if (a === 'peoplesort') { ui.peopleSort = ui.peopleSort === 'joined' ? 'name' : 'joined'; render(); return; }
  if (a === 'setrolet') {
    if (!mayGrant(d.tid)) { toast('Club admins and that team\u2019s coaches only'); return; }
    const key = d.r === 'coach' ? 'coaches' : 'trackers';
    const on = ((teamAccess(d.tid)[key] || {})[d.uid]);
    if (on) { forgetInvite(on); drop(`access/teams/${d.tid}/${key}/${d.uid}`); }
    else commit(`access/teams/${d.tid}/${key}/${d.uid}`, true);
    logAccess((on ? 'removed ' : 'made ') + d.r, d.uid, { team: d.tid, teamName: (state.teams[d.tid] || {}).name || null });
    syncIndex(d.uid); syncTeamIndex(d.tid); sheetPersonRoles(d.uid); return;
  }
  if (a === 'prpick') {
    const f = ui.pr; if (!f) return;
    f[d.k] = d.v || null;
    if (d.k !== 'player') f.player = null;
    sheetPersonRoles(f.uid); return;
  }
  if (a === 'praddrole') {
    const f = ui.pr || {}, uid = d.uid, tid = f.team, x = state.teams[tid];
    if (!x) { toast('Pick a team'); return; }
    if (!mayGrant(tid)) { toast('Club admins and that team\u2019s coaches only'); return; }
    if (f.role === 'parent') {
      const p = (x.players || {})[f.player];
      if (!p) { toast('Pick the player'); return; }
      if (!(p.guardians || {})[uid]) {
        commit(`teams/${tid}/players/${p.id}/guardians/${uid}`, true);
        logAccess('linked guardian', uid, { team: tid, teamName: x.name || null, player: p.name });
      }
      syncTeamParents(tid);
    } else if (f.role === 'coach' || f.role === 'tracker') {
      const key = f.role === 'coach' ? 'coaches' : 'trackers';
      if (!((teamAccess(tid)[key] || {})[uid])) {
        commit(`access/teams/${tid}/${key}/${uid}`, true);
        logAccess('made ' + f.role, uid, { team: tid, teamName: x.name || null });
      }
      syncTeamIndex(tid);
    } else return;
    syncIndex(uid);
    f.player = null;
    sheetPersonRoles(uid); return;
  }
  if (a === 'prunguard') {
    if (!mayGrant(d.tid)) { toast('Club admins and that team\u2019s coaches only'); return; }
    const x = state.teams[d.tid], p = x && (x.players || {})[d.pid];
    if (!p) return;
    const on = (p.guardians || {})[d.uid];
    if (on) {
      forgetInvite(on);
      drop(`teams/${d.tid}/players/${d.pid}/guardians/${d.uid}`);
      logAccess('unlinked guardian', d.uid, { team: d.tid, teamName: x.name || null, player: p.name });
      syncIndex(d.uid); syncTeamParents(d.tid);
    }
    sheetPersonRoles(d.uid); return;
  }
  if (a === 'teammenu') { sheetTeams(); return; }
  if (a === 'goview') { ui.view = d.v; closeSheet(); render(); return; }
  if (a === 'retireclub') {
    if (!canAdmin()) { toast('Club admins and the app owner only'); return; }
    if (!fb) { toast('Not connected'); return; }
    if (!confirm('Retire this club? Every device holding a copy will clear it. Export a backup first if you want one.')) return;
    fb.set(fb.ref(fb.db, 'retired/' + wsCode()), {
      at: nowMs(), by: (me && me.uid) || null, byName: (me && me.name) || null,
      name: (acc().org || {}).name || null
    })
      .then(() => toast('Retired — devices will clear on next connect'))
      .catch(e => toast('Could not retire: ' + ((e && e.code) || e)));
    return;
  }
  if (a === 'clubswitch') { sheetClubSwitch(); return; }
  if (a === 'forgetclub') {
    if (d.code === wsCode()) { toast('Switch away from it first'); return; }
    if (!confirm('Remove this device\u2019s copy of that club? The club itself is untouched, and anyone else keeps theirs.')) return;
    try { localStorage.removeItem(LS_DATA + ':' + envPrefix() + d.code); } catch (e) { }
    sheetClubSwitch(); toast('Forgotten on this device'); return;
  }
  if (a === 'switchclub') {
    if (d.code === wsCode()) { closeSheet(); ui.view = 'club'; render(); return; }
    localStorage.setItem(LS_WS, d.code); location.reload(); return;
  }
  if (a === 'goteam') { ui.teamId = d.id; ui.view = 'matches'; ui.gameView = 'subs'; closeSheet(); render(); return; }
  if (a === 'gotoplayer') {
    ui.teamId = d.tid; ui.matchId = d.id; ui.view = 'game'; ui.gameView = 'stats'; render(); return;   // deliberate: a parent wants the numbers
  }
  if (a === 'sharesheet') {
    // a game made before game links existed gets its own id now, so the sheet has one to show
    if (t && ensureFixtureShares(t)) { claimTeamIds(t.id); schedulePublish(); }
    sheetShare(); return;
  }
  if (a === 'setwscode') { sheetWorkspace(); return; }
  if (a === 'envsheet') { sheetEnv(); return; }
  if (a === 'setenv') {
    if (!isOwner()) { toast('App owner only'); return; }
    const n = d.v || '';
    if (n === envName()) { closeSheet(); return; }
    if (n && !envList()[n]) { toast('That database is not configured'); return; }
    try {
      if (n) localStorage.setItem(LS_ENV, n); else localStorage.removeItem(LS_ENV);
      localStorage.removeItem(LS_WS);   // a code belongs to the database it was opened in
    } catch (e) { }
    location.reload(); return;
  }
  if (a === 'maketestclub') {
    if (!isOwner()) { toast('App owner only'); return; }
    if (!confirm('Make a test club? It is invented data in the ' + (envName() || 'production') + ' database. Nothing in it is ever published to parents.')) return;
    seedSandbox(); return;
  }
  if (a === 'preplockdown') {
    if (!canAdmin()) { toast('Club admins and the app owner only'); return; }
    syncAllTeamIndex();
    syncAllCoachIndex();
    syncAllTeamParents();
    claimAllShares();
    render();
    toast('Lookup tables written — let it sync, then check the list again');
    return;
  }
  if (a === 'invitenew') {
    if (!canAdmin()) { toast('Club admins only'); return; }
    ui.inv = null; sheetInvite(); return;
  }
  if (a === 'invitepick') {
    const f = ui.inv || {};
    f[d.k] = d.v;
    if (d.k !== 'player' && (d.k === 'team' || f.role !== 'parent')) f.player = null;
    ui.inv = f; sheetInvite(); return;
  }
  if (a === 'invitemake') { makeInvite(); return; }
  if (a === 'inviteopen') { if (!canAdmin()) { toast('Club admins only'); return; } sheetInviteDetail(d.id); return; }
  if (a === 'invitepast') { ui.invPast = !ui.invPast; render(); return; }
  if (a === 'invitedrop') {
    if (!canAdmin()) { toast('Club admins only'); return; }
    if (!fb) { toast('Not connected'); return; }
    const v = clubInv[d.id];
    const live = v && !v.used && (v.expiresAt || 0) > nowMs();
    if (live && !confirm('Revoke this invite? The link stops working.')) return;
    Promise.resolve(fb.remove(fb.ref(fb.db, 'invites/' + d.id))).catch(() => { });
    Promise.resolve(fb.remove(fb.ref(fb.db, 'clubInvites/' + wsCode() + '/' + d.id))).catch(() => { });
    delete clubInv[d.id];
    if (live) logAccess('revoked an invite for', null, { targetName: (v.email || 'anyone') + ' as ' + v.role, team: v.team, teamName: v.teamName || null });
    closeSheet(); render(); if (live) toast('Revoked'); return;
  }
  if (a === 'inviteshare') {
    navigator.share({ title: 'Join ' + ((acc().org || {}).name || 'the club'), url: d.v }).catch(() => { });
    return;
  }
  if (a === 'invitemail') {
    if (!authMod || !fbAuth) { toast('Sign-in is not available on this build'); return; }
    authMod.sendSignInLinkToEmail(fbAuth, d.email, { url: d.v, handleCodeInApp: true })
      .then(() => toast('Sent to ' + d.email))
      .catch(err => toast(authMessage(err)));
    return;
  }
  if (a === 'inviteaccept') { redeemInvite(); return; }
  if (a === 'inviteretry') { if (invite) { invite.status = 'idle'; invite.err = null; maybeLoadInvite(); } return; }
  if (a === 'invitedismiss') { dropInvite(); render(); return; }
  /* team links. The parent's side acts only on her own request; the coach's
     side checks mayGrant() in each function, not just by what Squad drew. */
  if (a === 'joinsend') { sendClaim(); return; }
  if (a === 'joinhide') { if (join) { join.hidden = true; holdJoin(); } if (join && !join.sent) dropJoin(); render(); return; }
  if (a === 'joinshow') { if (join) { join.hidden = false; holdJoin(); } render(); return; }
  if (a === 'joindrop') { dropJoin(); render(); return; }
  if (a === 'joinretry' || a === 'joinagain') { if (join) { join.status = 'idle'; join.sent = false; join.err = null; maybeLoadJoin(); } return; }
  if (a === 'joincancel') {
    if (!join || !join.doc || !rtdb || !me) return;
    const v = join.doc;
    join.sent = false;
    Promise.resolve(rtdb.mod.remove(rtdb.mod.ref(rtdb.db, `claims/${v.ws}/${v.team}/${me.uid}`))).catch(() => { });
    dropJoin(); toast('Request cancelled'); render(); return;
  }
  if (a === 'joinnew') {
    const t2 = state.teams[d.tid];
    if (t2 && t2.join && !confirm('Make a new link? The current one stops working — anyone still to use it will need the new one.')) return;
    makeJoinCode(d.tid); return;
  }
  if (a === 'squadinvites') { if (!canAdmin()) { toast('Club admins only'); return; } sheetSquadInvites(d.tid); return; }
  if (a === 'squadinvitego') { inviteSquad(d.tid); return; }
  if (a === 'claimpick') {
    const t2 = team(); const c = t2 && (claimsSeen[t2.id] || {})[d.uid]; if (!c) return;
    const pk = ui.claimPick = ui.claimPick || {};
    const cur = pk[d.uid] || claimMatches(t2, c).map(p => p.id);
    pk[d.uid] = cur.includes(d.pid) ? cur.filter(x => x !== d.pid) : cur.concat(d.pid);
    render(); return;
  }
  if (a === 'claimall') { const pk = ui.claimPick = ui.claimPick || {}; pk['all:' + d.uid] = !pk['all:' + d.uid]; render(); return; }
  if (a === 'claimok') {
    const t2 = state.teams[d.tid]; const c = t2 && (claimsSeen[d.tid] || {})[d.uid]; if (!c) return;
    const pk = (ui.claimPick || {})[d.uid] || claimMatches(t2, c).map(p => p.id);
    approveClaim(d.tid, d.uid, pk); return;
  }
  if (a === 'claimno') { declineClaim(d.tid, d.uid); return; }
  if (a === 'claimadmin') {
    if (!me) { toast('Sign in first'); return; }
    if (anyAdmins()) { toast('Someone already claimed it'); return; }
    commit(`access/admins/${me.uid}`, true);
    syncIndex(me.uid);
    toast('You are the admin'); return;
  }
  if (a === 'setrole') {
    const uid = d.uid, r = d.r, tid = t && t.id;
    if (r === 'admin') {
      if (isAdmin(uid)) {
        if (Object.keys(acc().admins || {}).length === 1) { toast('Someone has to stay admin'); return; }
        drop(`access/admins/${uid}`);
      } else commit(`access/admins/${uid}`, true);
      logAccess(isAdmin(uid) ? 'removed admin' : 'made admin', uid);
    } else {
      if (!tid) { toast('Pick a team first'); return; }
      const key = r === 'coach' ? 'coaches' : 'trackers';
      const on = ((teamAccess(tid)[key] || {})[uid]);
      if (on) { forgetInvite(on); drop(`access/teams/${tid}/${key}/${uid}`); }
      else commit(`access/teams/${tid}/${key}/${uid}`, true);
      logAccess((on ? 'removed ' : 'made ') + r, uid, { team: tid, teamName: (state.teams[tid] || {}).name || null });
    }
    syncIndex(uid);
    sheetPeople(); return;
  }
  if (a === 'republish') {
    if (!fb) { toast('Not connected — check the workspace code'); return; }
    // every page goes out, the game pages and the calendar feed too, changed or not
    pubSeen = {};
    ensureFixtureShares(t); claimTeamIds(t.id);
    Promise.resolve(publishTeam(t)).then(() => { sheetShare(); toast(pubState.error ? 'Not published' : 'Published'); });
    return;
  }
  if (a === 'makeshare') {
    commit(`teams/${t.id}/share`, 's' + uid() + uid());
    claimShare(t.id);            // before publishing: the write rule checks this list
    schedulePublish(); sheetShare(); return;
  }
  if (a === 'rotateshare') {
    if (!confirm('Anyone holding the old season link, or a link to any one game, loses access. Continue?')) return;
    /* Every game link goes with the season link. A family holding last
       month's game link is one forward away from whoever it was sent to. */
    const old = [t.share, ...teamMatches(t.id).map(m => m.share)].filter(Boolean);
    for (const m of teamMatches(t.id)) if (m.share) quiet(`matches/${m.id}/share`, 'f' + uid() + uid());
    commit(`teams/${t.id}/share`, 's' + uid() + uid());
    claimShare(t.id);
    if (fb) for (const id of old) {
      fb.remove(fb.ref(fb.db, 'public/' + id));
      fb.remove(fb.ref(fb.db, 'shareOwners/' + id));   // nothing left to own
    }
    schedulePublish(); sheetShare(); toast('New links made'); return;
  }
  if (a === 'copylink') {
    navigator.clipboard.writeText(d.v).then(() => toast('Link copied'), () => toast('Could not copy — select it by hand'));
    return;
  }
  if (a === 'setwho') { sheetWho(); return; }
  if (a === 'signinsheet') { sheetSignIn(); return; }
  if (a === 'signout') {
    const n = mineUnsent();
    if (n && !confirm(`${n} change${n === 1 ? '' : 's'} to your own drills ha${n === 1 ? 's' : 've'}n't reached the database yet, and signing out takes your drills off this phone. Sign out anyway?`)) return;
    authMod.signOut(fbAuth).then(() => { closeSheet(); toast('Signed out'); }); return;
  }
  if (a === 'peeklib') {
    if (!isOwner()) return;
    openSheet(`<h3>Look at someone's drills</h3><p class="muted" style="margin-top:0">For support. Read once, never kept on this phone, and you can't change them. Their account id is on their Settings screen.</p>
      <label class="field"><span>Account id</span><input type="text" id="peekUid"></label>
      <button class="btn wide" data-act="peekgo">Look</button>
      <button class="btn quiet wide" data-act="closesheet" style="margin-top:8px">Cancel</button>`, true);
    return;
  }
  if (a === 'peekgo') { const u = String(($('#peekUid') || {}).value || '').trim(); if (isOwner() && /^[\w-]{6,128}$/.test(u)) peekLibrary(u); else toast('That doesn\'t look like an account id'); return; }
  if (a === 'signin-google') {
    const p = new authMod.GoogleAuthProvider();
    authMod.signInWithPopup(fbAuth, p)
      .then(() => { closeSheet(); toast('Signed in'); })
      .catch(err => {
        // popups get blocked on plenty of mobile browsers; redirect always works
        if (/popup/i.test(err.code || '')) authMod.signInWithRedirect(fbAuth, p);
        else toast(authMessage(err));
      });
    return;
  }
  if (a === 'signin-link') {
    const mail = $('#authEmail').value.trim();
    if (!mail) { toast('Enter your email first'); return; }
    // an invite rides along, so the link still works if it is opened on another device
    const back = invite ? inviteLink(invite.id) : location.origin + location.pathname;
    authMod.sendSignInLinkToEmail(fbAuth, mail, { url: back, handleCodeInApp: true })
      .then(() => { localStorage.setItem('sm.emailForLink', mail); closeSheet(); toast('Check your email'); })
      .catch(err => toast(authMessage(err)));
    return;
  }
  if (a === 'signin-pass' || a === 'signup-pass') {
    const mail = $('#authEmail').value.trim(), pass = $('#authPass').value;
    if (!mail || !pass) { toast('Email and password are both needed'); return; }
    const fn = a === 'signup-pass' ? authMod.createUserWithEmailAndPassword : authMod.signInWithEmailAndPassword;
    fn(fbAuth, mail, pass).then(() => { closeSheet(); toast('Signed in'); }).catch(err => toast(authMessage(err)));
    return;
  }
  if (a === 'savewho') {
    const v = $('#whoName').value.trim();
    if (v) localStorage.setItem(LS_WHO, v); else localStorage.removeItem(LS_WHO);
    closeSheet(); render(); return;
  }
  if (a === 'repair') {
    let n = 0;
    for (const an of anomalies(m)) {
      if (an.kind !== 'double') continue;
      // keep the spell that started first, drop the duplicates
      const keep = an.sids.sort((x, y) => m.stints[x].on - m.stints[y].on)[0];
      for (const sid of an.sids) if (sid !== keep) { delDeep(state, `matches/${m.id}/stints/${sid}`); remoteDel(`matches/${m.id}/stints/${sid}`); n++; }
    }
    saveLocal(); render(); toast(`${n} duplicate spell${n === 1 ? '' : 's'} removed`); return;
  }
  if (a === 'trackerclean') { sheetTrackerClean(); return; }
  if (a === 'dropby') {
    if (!confirm('Remove everything logged by them? Subs and minutes are not affected.')) return;
    let n = 0;
    for (const coll of ['goals', 'shots', 'events', 'poss'])
      for (const [k, x] of Object.entries(m[coll] || {}))
        if (stampKey(x) === d.who) { delDeep(state, `matches/${m.id}/${coll}/${k}`); remoteDel(`matches/${m.id}/${coll}/${k}`); n++; }
    saveLocal(); closeSheet(); render(); toast(`${n} removed`); return;
  }
  if (a === 'savetrackcfg') {
    const cfg = {};
    for (const b of document.querySelectorAll('[data-act="togglechip"][data-grp="track"]')) cfg[b.dataset.v] = b.getAttribute('aria-pressed') === 'true';
    commit(`teams/${t.id}/track`, cfg); closeSheet(); return;
  }
  if (a === 'poss') { commit(`matches/${m.id}/poss/${uid()}`, { t: elapsedSec(m), to: d.side, ...stampedBy() }); return; }
  if (a === 'setpossmin') { commit(`teams/${t.id}/possMin`, Number(d.v)); return; }
  if (a === 'fixposs') { sheetPoss(d.id); return; }
  if (a === 'saveposs') {
    const x = (m.poss || {})[d.id]; if (!x) return;
    const sideEl = document.querySelector('[data-act="pickone"][data-grp="side"][aria-pressed="true"]');
    const whoEl = document.querySelector('[data-act="pickscorer"][data-grp="winner"][aria-pressed="true"]');
    const to = sideEl ? sideEl.dataset.v : x.to;
    commit(`matches/${m.id}/poss/${d.id}`, {
      ...x, t: clamp(parseTime($('#poT').value, x.t), 0, elapsedSec(m)),
      to, pid: to === 'us' && whoEl ? whoEl.dataset.v : null
    });
    closeSheet(); return;
  }
  if (a === 'delposs') { drop(`matches/${m.id}/poss/${d.id}`); closeSheet(); return; }
  if (a === 'undoposs') {
    const l = possList(m); if (!l.length) return;
    drop(`matches/${m.id}/poss/${l[l.length - 1].id}`); toast('Removed'); return;
  }
  if (a === 'pickscorer') {
    for (const b of document.querySelectorAll(`[data-act="pickscorer"][data-grp="${d.grp}"]`)) {
      if (b === el) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      else b.setAttribute('aria-pressed', 'false');
    }
    return;
  }
  if (a === 'savegoal') {
    const g = (m.goals || {})[d.id]; if (!g) return;
    const pick = grp => { const b = document.querySelector(`[data-act="pickscorer"][data-grp="${grp}"][aria-pressed="true"]`); return b ? b.dataset.v : null; };
    commit(`matches/${m.id}/goals/${d.id}`, { ...g, t: clamp(parseTime($('#glT').value, g.t), 0, elapsedSec(m)), pid: pick('scorer'), assist: pick('assist') });
    closeSheet(); return;
  }
  if (a === 'delgoal') { drop(`matches/${m.id}/goals/${d.id}`); closeSheet(); return; }
  if (a === 'start') { startClock(m); return; }
  if (a === 'pause') { pauseClock(m); return; }
  if (a === 'endhalf') { endHalf(m); return; }
  if (a === 'endgame') {
    const msg = running(m) ? 'The clock is still running. End the game anyway?' : 'End this game? It will be marked ready for stats.';
    if (!confirm(msg)) return;
    endGame(m); return;
  }
  if (a === 'reopengame') { drop(`matches/${m.id}/ended`); toast('Game reopened'); return; }

  if (a === 'newteam') { closeSheet(); sheetTeam(null); return; }
  if (a === 'editteam') { sheetTeam(state.teams[d.id]); return; }
  if (a === 'pickteam') { ui.teamId = d.id; ui.matchId = null; closeSheet(); render(); return; }
  if (a === 'saveteam') {
    const name = $('#tName').value.trim(); if (!name) { toast('Give the team a name'); return; }
    const bEl = $('#tBirth'), braw = bEl && bEl.value != null ? String(bEl.value).trim() : '';
    const born = braw ? Number(braw) : null;
    if (braw && uAge(born) == null) { toast('That birth year doesn\'t look right'); return; }
    if (d.id) {
      commit(`teams/${d.id}/name`, name);
      const was = (state.teams[d.id] || {}).birthYear || null;
      if (born && born !== was) commit(`teams/${d.id}/birthYear`, born);
      else if (!born && was) drop(`teams/${d.id}/birthYear`);
    }
    else { const id = uid(); commit(`teams/${id}`, { id, name, players: {}, ...(born ? { birthYear: born } : {}) }); ui.teamId = id; }
    closeSheet(); render(); return;
  }
  if (a === 'picklogo') { pickImage(`teams/${d.id}/logo`, 'Crest saved'); return; }
  if (a === 'pickorglogo') { pickImage('access/org/logo', 'Badge saved'); return; }
  if (a === 'pickphoto') { pickImage(`teams/${t.id}/players/${d.pid}/photo`, 'Photo saved'); return; }
  if (a === 'dropphoto') { drop(`teams/${t.id}/players/${d.pid}/photo`); closeSheet(); return; }
  if (a === 'saveorg') { commit('access/org/name', $('#orgName').value.trim() || 'Club'); toast('Saved'); return; }
  if (a === 'droplogo') { drop(`teams/${d.id}/logo`); closeSheet(); return; }
  if (a === 'delteam') {
    const dt = state.teams[d.id];
    if (!confirm(`Delete "${dt && dt.name ? dt.name : 'Untitled team'}" (${teamStats(dt)}) and every game with it?`)) return;
    for (const mm of teamMatches(d.id)) drop(`matches/${mm.id}`);
    drop(`teams/${d.id}`); ui.teamId = null; ui.matchId = null; closeSheet(); render(); return;
  }

  if (a === 'addplayer') {
    const name = $('#newName').value.trim(); const num = $('#newNum').value.trim();
    if (!name) { toast('Add a name first'); return; }
    const id = uid();
    commit(`teams/${t.id}/players/${id}`, { id, name, number: num, active: true, anywhere: true, preferred: '', canPlay: [], rating: 3 });
    $('#newName').value = ''; $('#newNum').value = '';
    return;
  }
  if (a === 'editplayer') { sheetPlayer(t.players[d.pid]); return; }
  if (a === 'togglechip') {
    const on = el.getAttribute('aria-pressed') !== 'true';
    el.setAttribute('aria-pressed', String(on));
    if (on && (d.grp === 'pair' || d.grp === 'avoid')) {
      const other = d.grp === 'pair' ? 'avoid' : 'pair';
      const twin = document.querySelector(`[data-grp="${other}"][data-v="${d.v}"]`);
      if (twin) twin.setAttribute('aria-pressed', 'false');
    }
    return;
  }
  if (a === 'pickone') {
    for (const b of document.querySelectorAll(`[data-act="pickone"][data-grp="${d.grp}"]`)) b.setAttribute('aria-pressed', String(b === el));
    return;
  }
  if (a === 'toggleanywhere') { el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true')); return; }
  if (a === 'saveplayer') {
    const p = t.players[d.pid];
    const chip = grp => [...document.querySelectorAll(`[data-act="togglechip"][data-grp="${grp}"][aria-pressed="true"]`)].map(x => x.dataset.v);
    const pairs = {}, avoid = {};
    chip('pair').forEach(id => pairs[id] = true);
    chip('avoid').forEach(id => avoid[id] = true);
    const rEl = document.querySelector('[data-act="pickone"][data-grp="rating"][aria-pressed="true"]');
    const pEl = document.querySelector('[data-act="pickone"][data-grp="pref"][aria-pressed="true"]');
    const anyEl = document.querySelector('[data-act="toggleanywhere"]');
    const stint = $('#epStint').value.trim();
    quiet(`teams/${t.id}/players/${d.pid}`, {
      ...p,
      positions: null,
      name: $('#epName').value.trim() || p.name,
      number: $('#epNum').value.trim(),
      preferred: pEl ? pEl.dataset.v : (p.preferred || ''),
      canPlay: chip('can'),
      anywhere: anyEl ? anyEl.getAttribute('aria-pressed') === 'true' : true,
      rating: rEl ? Number(rEl.dataset.v) : rating(p),
      maxStint: stint ? Number(stint) : null,
      gk: $('#epGk').value === '1',
      note: $('#epNote').value.trim(),
      pairs, avoid
    });
    for (const o of players(t)) {
      if (o.id === d.pid) continue;
      const op = { ...(o.pairs || {}) }, oa = { ...(o.avoid || {}) };
      if (pairs[o.id]) op[d.pid] = true; else delete op[d.pid];
      if (avoid[o.id]) oa[d.pid] = true; else delete oa[d.pid];
      quiet(`teams/${t.id}/players/${o.id}/pairs`, op);
      quiet(`teams/${t.id}/players/${o.id}/avoid`, oa);
    }
    saveLocal(); closeSheet(); render(); return;
  }
  if (a === 'toggleavail') {
    const p = t.players[d.pid];
    commit(`teams/${t.id}/players/${d.pid}/active`, p.active === false);
    sheetPlayer(state.teams[t.id].players[d.pid]); return;
  }
  if (a === 'availability') { sheetAvailability(); return; }
  if (a === 'toggleout') {
    /* The coach's word is written only where it differs from the family's, so
       agreeing with them leaves nothing behind for a changed answer to fight. */
    const want = !isOut(m, d.pid);
    if (want && onField(m, d.pid)) takeOffField(m, d.pid);
    if (want === familySaidNo(m, d.pid)) drop(`matches/${m.id}/out/${d.pid}`);
    else commit(`matches/${m.id}/out/${d.pid}`, want);
    sheetAvailability(); return;
  }

  if (a === 'fixclock') { sheetFixClock(); return; }
  if (a === 'nudgeclock') { adjustClock(m, Number(d.d)); sheetFixClock(); return; }
  if (a === 'restartgame') {
    if (!confirm('Put the clock back to 0:00? Subs and goals logged so far will be cleared.')) return;
    restartMatch(m); closeSheet(); toast('Clock back to 0:00'); return;
  }
  if (a === 'fixsub') { sheetFixSub(Number(d.i)); return; }
  if (a === 'nudgesub') {
    const r = lastLog[Number(d.i)]; if (!r) return;
    moveSub(m, r, r.t + Number(d.d));
    const i = lastLog.findIndex(x => x.onSid === r.onSid && x.offSid === r.offSid);
    if (i > -1) sheetFixSub(i); else closeSheet();
    return;
  }
  if (a === 'setsubtime') {
    const r = lastLog[Number(d.i)]; if (!r) return;
    moveSub(m, r, parseTime($('#subT').value, r.t)); closeSheet(); return;
  }
  if (a === 'delsub') {
    const r = lastLog[Number(d.i)]; if (!r) return;
    const why = deleteSub(m, r);
    if (why) { toast(why); return; }
    closeSheet(); render(); schedulePublish(); toast('Sub deleted'); return;
  }
  if (a === 'addsub') { sheetAddSub(); return; }
  if (a === 'doaddsub') {
    const o = $('#asOut').value, i2 = $('#asIn').value;
    subAt(m, o, i2, parseTime($('#asT').value, elapsedSec(m)));
    closeSheet(); toast('Sub recorded'); return;
  }
  if (a === 'fixminutes') { sheetFixMinutes(d.pid || null); return; }
  if (a === 'addstint') {
    const e = elapsedSec(m), sid = uid();
    quiet(`matches/${m.id}/stints/${sid}`, { pid: d.pid, on: e, off: e });
    saveLocal(); render(); sheetFixMinutes(d.pid); return;
  }
  if (a === 'delstint') {
    const s = (m.stints || {})[d.sid]; if (!s) return;
    const pid = s.pid;
    drop(`matches/${m.id}/stints/${d.sid}`);
    if (s.off == null && onField(m, pid)) { delDeep(state, `matches/${m.id}/positions/${pid}`); remoteDel(`matches/${m.id}/positions/${pid}`); saveLocal(); }
    sheetFixMinutes(pid); return;
  }
  if (a === 'savestints') {
    const e = elapsedSec(m);
    for (const inp of document.querySelectorAll('[data-son]')) {
      const sid = inp.dataset.son;
      const offEl = document.querySelector(`[data-soff="${sid}"]`);
      const on = clamp(parseTime(inp.value, 0), 0, e);
      const raw = offEl.value.trim();
      const off = raw === '' ? null : clamp(parseTime(raw, e), on, e);
      // the spot rides along with the times unless it was changed here, or every
      // spell saved on this sheet stops counting towards minutes by position
      const was = (m.stints || {})[sid] || {};
      const spotEl = document.querySelector(`[data-sspot="${sid}"]`);
      quiet(`matches/${m.id}/stints/${sid}`, { pid: d.pid, on, off, ...spotFrom(m, spotEl && spotEl.value, was) });
    }
    saveLocal(); closeSheet(); render(); toast('Minutes updated'); return;
  }

  if (a === 'makeplan') {
    const roster = squad(t, m);
    if (!roster.length) { toast('Add players first'); return; }
    // a draft only ever fills an empty plan: never a way to lose snapshots by a tap
    if (planBlocks(m).length) { toast('There is a plan already — clear it first if you want a fresh draft'); return; }
    if (!m.planned || !Object.keys(m.planned).length) {
      const each = evenSplit(m, roster), pl = {};
      roster.forEach(p => pl[p.id] = p.gk ? matchMinutes(m) : each);
      quiet(`matches/${m.id}/planned`, pl);
    }
    commit(`matches/${m.id}/plan`, buildPlan(m, roster));
    // on the Plan tab the plan is already on screen; a sheet over it would say it twice
    if (ui.gameView === 'plan') render(); else sheetPlan();
    return;
  }
  if (a === 'viewplan') { sheetPlan(); return; }
  if (a.startsWith('snap')) { snapAction(t, m, a, d); return; }
  if (a === 'applyblock') {
    const b = planBlocks(m).find(x => String(x.start) === String(d.start)); if (!b) return;
    // if this is the change the sideline card is waiting on, it is now done
    const due = subsDue(m);
    const { rec, diff } = applyBlock(m, b);
    if (due && (due.kind === 'due' || due.kind === 'soon') && due.b.start === b.start)
      quiet(`matches/${m.id}/planDone/${doneKey(b)}`, { ...rec, at: nowMs(), ...stampedBy() });
    const n = Math.max(diff.on.length, diff.off.length);
    saveLocal(); render(); schedulePublish();
    closeSheet(); toast(n + (n === 1 ? ' sub made' : ' subs made')); return;
  }
  /* The sideline card. A tracker may do exactly this much to who is on the
     pitch: say that the coach's locked-in change has happened, or has not. The
     button being drawn only for the right people is not the check — this is. */
  if (a === 'subsgo' || a === 'subsskip' || a === 'subsundo') {
    if (!m || !planLocked(m) || !canCallSubs(m)) return;
    if (a === 'subsundo') {
      const r = (m.planDone || {})[d.key]; if (!r) return;
      if (nowMs() - (r.at || 0) > SUB_UNDO_MS || !undoBlock(m, d.key)) { toast('Too late to undo from here — fix it in the match log'); render(); return; }
      render(); schedulePublish();
      toast(r.skipped ? 'Back on — the change is due again' : 'Undone — the pitch is back as it was');
      return;
    }
    const s = subsDue(m);
    if (!s || (s.kind !== 'due' && s.kind !== 'soon') || String(s.b.start) !== String(d.start)) {
      render();
      toast(s && s.last && String(s.last.start) === String(d.start) ? 'Already done — nothing more to do' : 'The plan has moved on — have another look');
      return;
    }
    const key = doneKey(s.b), stamp = { at: nowMs(), ...stampedBy() };
    if (a === 'subsskip') {
      commit(`matches/${m.id}/planDone/${key}`, { t: elapsedSec(m), ...stamp, skipped: true });
      toast('Skipped — nobody was moved');
      return;
    }
    const { rec, diff } = applyBlock(m, s.b);
    commit(`matches/${m.id}/planDone/${key}`, { ...rec, ...stamp });
    const n = Math.max(diff.on.length, diff.off.length);
    toast(!s.b.start ? 'Starting lineup on' : `${n ? `${n} sub${n === 1 ? '' : 's'}` : 'Changes'} made at ${mmss(rec.t)}`);
    return;
  }
  if (a === 'planlock' || a === 'planunlock') {
    if (!m || restricted() || !canEditTeam(m.teamId) || !planBlocks(m).length) return;
    if (a === 'planunlock') { drop(`matches/${m.id}/plan/locked`); toast('Unlocked — lock it in again when you are done'); return; }
    const issues = planIssues(t, m);
    if (issues.length && !confirm(`Worth a look before locking in:\n\n${issues.join('\n')}\n\nLock it in anyway?`)) return;
    ui.snapSid = null;
    lockPlan(m);
    toast('Plan locked in');
    return;
  }
  if (a === 'opengview') { ui.gameView = d.v; ui.picked = null; render(); return; }
  /* What to tell the bench names every player in the plan, so it is the coach's
     like the Plan tab is — checked here, not only by the button's absence. */
  if (a === 'bench' || a === 'benchall') {
    if (!m || restricted()) return;
    if (a === 'bench') sheetBench(t, m, d.start); else sheetBenchAll(t, m);
    return;
  }
  if (a === 'benchcopy') {
    if (restricted() || !benchCopy) return;
    try { navigator.clipboard.writeText(benchCopy).then(() => toast('Copied — paste it into a message'), () => toast('Could not copy — select it by hand')); }
    catch (e) { toast('Could not copy — select it by hand'); }
    return;
  }
  if (a === 'fillslot') {
    const sl = slotById(m, d.sid); if (!sl) return;
    if (!ui.picked) { toast('Pick a player first'); return; }
    const pid = ui.picked; ui.picked = null;
    if (onField(m, pid)) { switchTo(m, pid, sl.id, null); return; }
    if (fieldIds(m).length >= (m.onFieldCount || 11)) { toast('Pitch is full — tap a player to swap'); return; }
    putOnField(m, pid, sl.x, sl.y, sl.id);
    const p = (t.players || {})[pid];
    if (p) toast(`${p.name} on at ${sl.label}, ${mins(elapsedSec(m))}′`);
    return;
  }
  if (a === 'formations') { sheetFormations(); return; }
  if (a === 'newformation') {
    const size = Number(d.size), k = d.k, id = uid();
    quiet(`teams/${t.id}/formations/${id}`, { id, name: k, size, slots: clone(presetsFor(size)[k]) });
    if (!((t.defaults || {})[size])) quiet(`teams/${t.id}/defaults/${size}`, id);
    saveLocal(); ui.editFid = id; ui.view = 'formation'; closeSheet(); render(); return;
  }
  if (a === 'editformation') { ui.editFid = d.id; ui.view = 'formation'; closeSheet(); render(); return; }
  if (a === 'backsetup') {
    if (ui.editFid === GAME_SHAPE) { ui.view = 'game'; ui.gameView = 'pitch'; }
    else ui.view = 'admin';
    ui.editFid = null; render(); return;
  }
  /* A game's own shape is part of running the game, so it takes the same
     standing as a sub: a coach of this team, not a tracker or a parent. */
  if (a === 'editgameshape') {
    if (!m || restricted() || readOnlyHere()) return;
    if (!m.formation) commit(`matches/${m.id}/formation`, resolveShape(t, 'auto', m.onFieldCount || 11) || blankShape(m.onFieldCount || 11));
    ui.editFid = GAME_SHAPE; ui.view = 'formation'; ui.picked = null; closeSheet(); render(); return;
  }
  if (a === 'gameshapepreset') {
    const tg = shapeTarget(); if (!tg || !tg.game) return;
    const sl = presetsFor(tg.f.size)[d.k]; if (!sl) return;
    if (!confirm(`Replace this game's shape with a fresh ${d.k}? Anyone on the pitch stays on.`)) return;
    commit(tg.path, { name: d.k, size: tg.f.size, slots: clone(sl) }); return;
  }
  if (a === 'saveshapeteam') {
    const tg = shapeTarget(); if (!tg || !tg.game) return;
    const id = uid();
    commit(`teams/${t.id}/formations/${id}`, { id, name: tg.f.name || 'Custom', size: tg.f.size, slots: clone(tg.f.slots || []) });
    toast(`Saved to ${t.name || 'the team'}'s shapes`); return;
  }
  if (a === 'savefname') {
    const tg = shapeTarget(); if (!tg) return;
    commit(`${tg.path}/name`, $('#fName').value.trim() || 'Shape');
    toast('Saved'); return;
  }
  if (a === 'setdefault') {
    const f = t.formations[d.id];
    commit(`teams/${t.id}/defaults/${f.size}`, f.id); return;
  }
  if (a === 'delformation') {
    if (!confirm('Delete this shape? Games already created keep their own copy.')) return;
    const f = t.formations[d.id];
    if ((t.defaults || {})[f.size] === f.id) drop(`teams/${t.id}/defaults/${f.size}`);
    drop(`teams/${t.id}/formations/${d.id}`);
    ui.view = 'setup'; ui.editFid = null; render(); return;
  }
  if (a === 'addslot') {
    const tg = shapeTarget(); if (!tg) return;
    commit(`${tg.path}/slots`, [...(tg.f.slots || []), { id: 's' + uid(), label: 'New', role: 'Mid', x: 50, y: 50 }]);
    return;
  }
  if (a === 'saveslot') {
    const tg = shapeTarget(); if (!tg) return;
    const rEl = document.querySelector('[data-act="pickone"][data-grp="role"][aria-pressed="true"]');
    const label = $('#slLabel').value.trim() || 'Spot';
    commit(`${tg.path}/slots`,
      (tg.f.slots || []).map(x => x.id === d.sid ? { ...x, label, role: rEl ? rEl.dataset.v : x.role } : x));
    closeSheet(); return;
  }
  if (a === 'delslot') {
    const tg = shapeTarget(); if (!tg) return;
    commit(`${tg.path}/slots`, (tg.f.slots || []).filter(x => x.id !== d.sid));
    closeSheet(); return;
  }
  if (a === 'closesheet') { closeSheet(); return; }
  if (a === 'toggleguard') {
    const p = t.players[d.pid];
    const on = ((p.guardians || {})[d.uid]);
    if (on) { forgetInvite(on); drop(`teams/${t.id}/players/${d.pid}/guardians/${d.uid}`); }
    else commit(`teams/${t.id}/players/${d.pid}/guardians/${d.uid}`, true);
    logAccess(on ? 'unlinked guardian' : 'linked guardian', d.uid, { team: t.id, teamName: t.name || null, player: p.name });
    syncIndex(d.uid); syncTeamParents(t.id);
    sheetPlayer(state.teams[t.id].players[d.pid]); return;
  }
  if (a === 'delplayer') {
    if (!confirm('Remove this player from the roster?')) return;
    drop(`teams/${t.id}/players/${d.pid}`); syncTeamParents(t.id); closeSheet(); return;
  }

  if (a === 'newmatch') {
    // from the calendar's Add sheet, the day and place already typed carry over
    let pre = null;
    if (d.from === 'cal' && calForm) { calFormRead(); pre = { date: calForm.date, kickoff: calForm.start, venue: calForm.venue }; calForm = null; }
    closeSheet(); sheetMatch(null, pre); return;
  }

  /* The calendar. Looking is anybody's; adding, changing and calling off are
     the coach's, checked by mayAct() against the team the button names. Acting
     on an entry makes its team the open one, so the republish that follows a
     change goes to that team's share link and not to whichever was open. */
  if (a === 'calscope') { ui.calAll = d.v === 'all'; render(); return; }
  if (a === 'calpast') { ui.calPast = !ui.calPast; render(); return; }
  if (a === 'calmonth') {
    const cur = /^\d{4}-\d{2}$/.test(ui.calMonth || '') ? ui.calMonth : todayStr().slice(0, 7);
    const [y, mo] = cur.split('-').map(Number);
    const x = new Date(y, mo - 1 + Number(d.v || 0), 1);
    ui.calMonth = Number(d.v) ? `${x.getFullYear()}-${pad2(x.getMonth() + 1)}` : null;
    render(); return;
  }
  if (a === 'calday') { sheetCalDay(d.v); return; }
  if (a === 'calitem') { sheetCalItem(d.k, d.tid, d.id); return; }
  if (a === 'calgame') {
    const g = state.matches[d.id]; if (!g) return;
    ui.teamId = d.tid; ui.matchId = d.id; ui.view = 'game'; ui.picked = null;
    // before kick-off a coach has a plan to make; everyone else follows the game
    ui.gameView = gameStatus(g) === 'upcoming' && canEditTeam(d.tid) ? 'plan' : 'live';
    closeSheet(); render(); return;
  }
  if (a === 'calics') {
    const it = calItems([d.tid]).find(x => x.kind === d.k && x.id === d.id);
    if (it) downloadIcs(icsItem(it).title, [icsItem(it)]);
    return;
  }
  if (a === 'calicsall') {
    const all = !!ui.calAll && myTeams().length > 1;
    const list = calItems(calTeams()).filter(x => x.date && !calPast(x)).map(icsItem)
      // confirmed sessions too: the same file is what a family puts in her own calendar
      .concat(sessCalItems(calTeams()).filter(x => x.firm && x.date && !calPast(x)).map(x => sessIcs(sessById(x.id))));
    downloadIcs(all ? ((acc().org || {}).name || 'Club') : ((t && t.name) || 'Team'), list);
    return;
  }
  if (a === 'calnew') {
    if (d.tid) ui.teamId = d.tid;
    calForm = calFormNew(ui.teamId, d.v); sheetCalEvent(); return;
  }
  if (a === 'caledit') {
    const e = ((state.teams[d.tid] || {}).events || {})[d.id]; if (!e) return;
    ui.teamId = d.tid;
    calForm = calFormEdit(d.tid, e); sheetCalEvent(); return;
  }
  if (a === 'calkind' || a === 'calrepeat' || a === 'calwd' || a === 'calpub' || a === 'calscopeed') {
    if (!calForm) return;
    calFormRead();
    const f = calForm;
    if (a === 'calkind') f.kind = d.v === 'practice' ? 'practice' : 'event';
    // turning it on is when the days get chosen, so start from the date as typed by then
    if (a === 'calrepeat') { f.repeat = d.v === '1'; if (f.repeat && okDay(f.date)) f.days = [weekdayOf(f.date)]; }
    if (a === 'calwd') { const i = Number(d.v); f.days = f.days.includes(i) ? f.days.filter(x => x !== i) : [...f.days, i].sort(); }
    if (a === 'calpub') f.public = d.v === '1';
    if (a === 'calscopeed') f.scope = d.v === 'later' ? 'later' : 'one';
    sheetCalEvent(); return;
  }
  if (a === 'calsave') { if (calForm) saveCalEvent(); return; }
  if (a === 'attend') {
    const it = calItems([d.tid]).find(x => x.kind !== 'game' && x.id === d.id);
    if (!it || !attendDue(it)) return;
    ui.teamId = d.tid;
    const had = attendOf(d.tid, d.id) || {};
    const marks = {};
    for (const p of rsvpSquad(d.tid)) marks[p.id] = had[p.id] !== undefined ? !!had[p.id] : attendGuess(d.tid, d.id, p.id);
    attForm = { tid: d.tid, eid: d.id, marks };
    sheetAttend(); return;
  }
  if (a === 'attmark') { if (attForm) { attForm.marks[d.pid] = !attForm.marks[d.pid]; sheetAttend(); } return; }
  if (a === 'attall') { if (attForm) { for (const k of Object.keys(attForm.marks)) attForm.marks[k] = true; sheetAttend(); } return; }
  if (a === 'attsave') {
    if (!attForm) return;
    const f = attForm, n = Object.values(f.marks).filter(Boolean).length;
    // one write for the register, at a depth the team rule grants
    quiet(`teams/${f.tid}/attend/${f.eid}`, { ...f.marks });
    attForm = null; saveLocal(); closeSheet(); render();
    toast(`Saved — ${n} of ${Object.keys(f.marks).length} came`); return;
  }
  /* Checked here, not only by which chips are drawn: a parent may answer for
     her own child and nobody else's, a coach for anyone on her team. */
  if (a === 'rsvp' || a === 'rsvpnote') {
    if (!canRsvp(d.tid, d.pid)) { toast('Only that player\u2019s family or coach can answer for her'); return; }
    const cur = rsvpOf(d.tid, d.k, d.pid);
    if (a === 'rsvpnote') {
      if (!cur) return;
      const el = $('#rsvpNote_' + d.pid);
      setRsvp(d.tid, d.k, d.pid, cur.v, el && typeof el.value === 'string' ? el.value.trim() : cur.note);
      toast('Note saved');
    } else {
      // the same answer again takes it back; a new answer keeps the note
      setRsvp(d.tid, d.k, d.pid, cur && cur.v === d.v ? null : d.v, cur && cur.v !== d.v ? cur.note : null);
    }
    if (d.from === 'sheet' || a === 'rsvpnote') sheetCalItem(d.kind, d.tid, d.id);
    render(); return;
  }

  if (a === 'calsyncon' || a === 'calsyncnew') {
    const x = state.teams[d.tid]; if (!x) return;
    if (!feedBase()) { toast('Calendar sync is not set up on this site yet'); return; }
    const old = x.calFeed;
    if (a === 'calsyncnew' && !confirm('Everyone subscribed stops getting changes until they subscribe again with the new address. Do this if the address has reached someone it should not have. Continue?')) return;
    ui.teamId = d.tid;          // the publish that follows goes to this team's pages
    commit(`teams/${d.tid}/calFeed`, 'c' + uid() + uid());
    if (fb && old) { fb.remove(fb.ref(fb.db, 'public/' + old)); fb.remove(fb.ref(fb.db, 'shareOwners/' + old)); }
    toast(old ? 'New address made — the old one has stopped working' : 'Calendar sync is on');
    return;
  }
  if (a === 'calcall') {
    if (!calForm || !calForm.id) return;
    calFormRead();
    const tid = calForm.tid, e = ((state.teams[tid] || {}).events || {})[calForm.id]; if (!e) return;
    const off = !e.called, list = calTargets();
    for (const x of list) quiet(`teams/${tid}/events/${x.id}/called`, off ? 'cancelled' : null);
    calForm = null;
    calDone(off ? `Called off${list.length > 1 ? ` — ${list.length} of them` : ''}. It stays on the calendar, struck through.` : 'Back on');
    return;
  }
  if (a === 'caldel') {
    if (!calForm || !calForm.id) return;
    const tid = calForm.tid, list = calTargets();
    if (!list.length) return;
    if (!confirm(list.length > 1 ? `Delete these ${list.length}? Calling them off keeps them on the calendar for people to see.` : 'Delete this? Calling it off instead keeps it on the calendar, struck through, so nobody turns up.')) return;
    for (const x of list) {
      delDeep(state, `teams/${tid}/events/${x.id}`); remoteDel(`teams/${tid}/events/${x.id}`);
      // a register for something that no longer exists is data about children with no purpose left
      if (attendOf(tid, x.id)) { delDeep(state, `teams/${tid}/attend/${x.id}`); remoteDel(`teams/${tid}/attend/${x.id}`); }
    }
    calForm = null;
    calDone(list.length > 1 ? `Deleted ${list.length}` : 'Deleted');
    return;
  }
  if (a === 'caleditgame') {
    if (!state.matches[d.id]) return;
    ui.teamId = d.tid; ui.matchId = d.id;
    sheetMatch(state.matches[d.id]); return;
  }
  if (a === 'copytext') {
    navigator.clipboard.writeText(d.v).then(() => toast('Copied'), () => toast('Could not copy — select it by hand'));
    return;
  }
  if (a === 'editmatch') { sheetMatch(state.matches[d.id]); return; }
  if (a === 'backgames') { ui.view = 'matches'; ui.picked = null; render(); return; }
  if (a === 'openmatch') { ui.matchId = d.id; ui.view = 'game'; ui.gameView = 'subs'; render(); return; }
  if (a === 'savematch') {
    const side = Number($('#mSide').value);
    const base = {
      opponent: $('#mOpp').value.trim(), date: $('#mDate').value,
      kickoff: $('#mKick').value || '', venue: $('#mVenue').value.trim(),
      periodCount: Number($('#mCount').value), periodMinutes: Number($('#mLen').value) || 40,
      onFieldCount: side, veoUrl: $('#mVeo').value.trim(),
      home: HOME_AWAY[$('#mHome').value] ? $('#mHome').value : '', arrive: hm($('#mArrive').value),
      kit: $('#mKit').value.trim(), notes: $('#mNotes').value.trim()
    };
    // a new game has no "is it on?" control, and an old one keeps what it had if the sheet lacks it
    const cl = d.id ? $('#mCalled') : null;
    if (cl) base.called = CALLED[cl.value] ? cl.value : '';
    const pick = $('#mShape').value;
    /* "Build my own" starts from the shape this game would otherwise get, so
       the coach is nudging spots rather than placing nine from nothing. */
    if (pick === 'custom') base.formation = resolveShape(t, 'auto', side) || blankShape(side);
    else if (pick !== 'keep') base.formation = resolveShape(t, pick, side);
    if (d.id) { commit(`matches/${d.id}`, { ...state.matches[d.id], ...base }); ui.matchId = d.id; }
    else {
      const id = uid();
      commit(`matches/${id}`, { id, teamId: t.id, currentHalf: 1, periods: {}, planned: {}, positions: {}, stints: {}, createdAt: Date.now(), ...base });
      ui.matchId = id; ui.view = 'game'; ui.gameView = 'subs';
    }
    if (pick === 'custom') { ui.editFid = GAME_SHAPE; ui.view = 'formation'; }
    closeSheet(); render(); return;
  }
  if (a === 'delmatch') {
    if (!confirm('Delete this game and its minutes?')) return;
    // its own page goes with it, or the link keeps serving a game that no longer exists
    const gone = (state.matches[d.id] || {}).share;
    if (fb && gone) { fb.remove(fb.ref(fb.db, 'public/' + gone)); fb.remove(fb.ref(fb.db, 'shareOwners/' + gone)); }
    drop(`matches/${d.id}`); ui.matchId = null; closeSheet(); render(); return;
  }

  if (a === 'planall') { sheetPlanned(); return; }
  /* Checked here as well as by hiding the button: the helper reads out the
     whole squad's minutes, which is more than a tracker or parent is shown. */
  if (a === 'aihelp') {
    const sc = d.scope;
    if (sc === 'club' ? !canAdmin() : (restricted() || !t || (sc === 'game' && !m))) return;
    // open on the question the game is ready for: before kick-off that is the plan
    sheetAi(sc, sc === 'game' && gameStatus(m) === 'upcoming' ? 'plan' : sc === 'game' ? 'review' : null); return;
  }
  if (a === 'aitopic') { if (ui.ai) sheetAi(ui.ai.scope, d.k); return; }
  if (a === 'aicopy') { const r = aiFinal(); aiCopy(r.text, r.n); return; }
  if (a === 'aiimport') {
    if (!m || restricted()) return;
    if (planLocked(m)) { toast('Your plan is locked in — unlock it first'); return; }
    const ta = $('#aiAnswer'), box = $('#aiImportMsg');
    const r = aiPlanParse(t, m, ta ? ta.value : '');
    if (r.problems.length) {
      if (box) box.innerHTML = `<div class="warn alert" style="margin-bottom:10px"><b>Nothing loaded yet.</b> Fix these in the box, or ask the AI again:<br>${r.problems.slice(0, 8).map(esc).join('<br>')}</div>`;
      return;
    }
    // the redraft button is gone so a tap can never write over a plan; this asks first instead
    if (planBlocks(m).length && !confirm(`Replace your ${planBlocks(m).length} snapshot${planBlocks(m).length === 1 ? '' : 's'} with the AI's ${r.blocks.length}?`)) return;
    ui.snapAt = 0; ui.snapSid = null; ui.gameView = 'plan';
    savePlan(m, r.blocks);
    closeSheet(); toast(`Plan loaded — ${r.blocks.length} snapshot${r.blocks.length === 1 ? '' : 's'}. Check it, then lock it in.`); return;
  }
  if (a === 'aiopen') {
    const site = AI_SITES[d.k]; if (!site) return;
    const r = aiFinal(), q = r.text;
    aiCopy(q, r.n);
    // opened inside the tap itself, or a phone treats it as a pop-up and blocks it
    window.open(site[2] && q.length < 6000 ? site[2](q) : site[1], '_blank', 'noopener');
    return;
  }
  if (a === 'evensplit') {
    const roster = squad(t, m);
    const each = evenSplit(m, roster);
    for (const inp of document.querySelectorAll('[data-plan]')) {
      const p = (t.players || {})[inp.dataset.plan];
      inp.value = p && p.gk ? matchMinutes(m) : each;
    }
    return;
  }
  if (a === 'saveplan') {
    const plan = {};
    for (const inp of document.querySelectorAll('[data-plan]')) { const v = Number(inp.value); if (v > 0) plan[inp.dataset.plan] = v; }
    commit(`matches/${m.id}/planned`, plan); closeSheet(); return;
  }

  if (a === 'savews') {
    const v = $('#wsCode').value.trim();
    if (v) localStorage.setItem(LS_WS, v); else localStorage.removeItem(LS_WS);
    location.reload(); return;
  }
  if (a === 'gencode') { $('#wsCode').value = 'sm-' + uid() + uid(); return; }
  if (a === 'copycode') {
    navigator.clipboard.writeText(wsCode()).then(() => toast('Code copied'), () => toast('Could not copy — select it by hand'));
    return;
  }
  if (a === 'export') {
    if (!canAdmin()) { toast('Only club admins can export the full data'); return; }
    if (fb) toast('Gathering the club\u2019s training records…');
    backupDoc().then(({ doc, missed }) => {
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'minutes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      link.click(); URL.revokeObjectURL(url);
      lastBackup = { doc, missed };
      toast(missed.size ? `Downloaded. ${missed.size} part${missed.size === 1 ? '' : 's'} of the training records could not be checked with the club just now, so this phone\u2019s copy of ${missed.size === 1 ? 'it is' : 'those is'} what\u2019s in it.`
        : 'Downloaded: teams, games, roles, fields, training sessions, bookings, registers, fees, pay rates, practice plans and club drills.');
    });
    return;
  }
  /* Every import door checks canAdmin() here, not just by hiding the buttons:
     it writes whole teams and games. A backup used to replace local state
     wholesale — access included — and now goes through the same merge as the
     bulk import, which only ever adds what is missing. */
  if (a === 'pendingsheet') { sheetPending(); return; }
  if (a === 'pendingretry') {
    for (const e of Object.values(pending.w)) delete e.refused;
    sess.refused = {}; saveSess();
    for (const k of Object.keys(trainState)) if (trainState[k] === 'refused') delete trainState[k];
    for (const k of Object.keys(shelfState)) if (shelfState[k] === 'refused') delete shelfState[k];
    for (const k of Object.keys(sessState)) if (sessState[k] === 'refused') delete sessState[k];
    savePending(); flushPending(); flushTraining(); closeSheet(); render();
    toast(online ? 'Sending' : 'Offline — it goes when the signal is back'); return;
  }
  if (a === 'pendingdrop') {
    // practice plans and drills have no drop of their own here: they stay, and are retried, until the club takes them
    const n = Object.values(pending.w).filter(e => e.refused).length + Object.keys(sess.refused || {}).length;
    if (!n || !confirm(`Drop ${n} change${n === 1 ? '' : 's'} the club refused? ${n === 1 ? 'It exists' : 'They exist'} only on this phone, so ${n === 1 ? 'it is' : 'they are'} gone for good.`)) return;
    for (const [p, e] of Object.entries(pending.w)) if (e.refused) delete pending.w[p];
    // a refused training record goes the same way: the club's copy is read again in its place
    for (const k of Object.keys(sess.refused || {})) { delete sess.dirty[k]; delete sess.refused[k]; }
    saveSess(); sessFor = null;
    savePending(); closeSheet();
    attachWorkspace();      // read the club again, so the screen shows what it really has
    render(); return;
  }
  if (a === 'adoptlocal') {
    if (!canAdmin()) { toast('Only club admins can import'); return; }
    const lo = localOnlyData(); if (!lo) return;
    sheetImport(JSON.stringify(lo.data)); return;
  }
  if (a === 'bulkimport') { if (!canAdmin()) { toast('Only club admins can import'); return; } sheetImport(null); return; }
  if (a === 'import' || a === 'importfile') {
    if (!canAdmin()) { toast('Only club admins can import'); return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json,.txt';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => sheetImport(String(r.result || ''));
      r.onerror = () => toast('That file could not be read');
      r.readAsText(f);
    };
    inp.click(); return;
  }
  if (a === 'importexample') { sheetImport(JSON.stringify(IMPORT_EXAMPLE, null, 2)); return; }
  if (a === 'importcheck') { sheetImport($('#impText').value); return; }
  if (a === 'importgo') {
    if (!canAdmin()) { toast('Only club admins can import'); return; }
    // planned again against the club as it is now, not as it was when checked
    let plan;
    const txt = $('#impText').value;
    try {
      const data = JSON.parse(txt);
      if (!pendingImport || pendingImport.text !== txt) pendingImport = { text: txt };
      const k = restoreKnown(data, txt);
      if (k === 'checking') { sheetImport(txt); return; }
      plan = importPlan(data, k ? { ...state, trainingKnown: k } : state);
    } catch (err) { sheetImport(txt); return; }
    if (plan.errors.length || !(plan.writes.length + plan.sessWrites.length + plan.trainWrites.length)) { sheetImport(txt); return; }
    if (!confirm(`Import into ${(acc().org || {}).name || 'this club'}? It ${importSummary(plan.counts)}.`)) return;
    applyImport(plan); pendingImport = null; closeSheet();
    toast('Imported: ' + importSummary(plan.counts)); return;
  }
}
document.addEventListener('click', onAct);
/* A <select> from pickOne() stands in for a row of chips, so it goes through
   the same action a chip would have, carrying what was chosen as data-v. */
document.addEventListener('change', e => {
  const s = e.target;
  if (!s || !s.dataset || !s.dataset.pick) return;
  const d = { act: s.dataset.pick, k: s.dataset.k, v: s.value, in: s.dataset.in };
  onAct({ target: { closest: () => ({ dataset: d }) } });
});



document.addEventListener('input', e => {
  if (!e.target || e.target.id !== 'drillQ') return;
  const p = practiceUi();
  p.f.q = e.target.value; p.show = 24;
  refreshDrillList(); saveUi();
});

/* The ideas box writes itself into the prompt as she types, and is kept per game
   so closing the sheet by accident does not lose a half-written plan. */
document.addEventListener('input', e => {
  // a half-written message survives a redraw, a tab change and a reload
  if (e.target && e.target.id === 'msgText' && e.target.dataset && e.target.dataset.draft) {
    ui.msgDraft = { ...(ui.msgDraft || {}), [e.target.dataset.draft]: e.target.value };
    saveUi(); return;
  }
  if (!e.target || e.target.id !== 'aiIdeas' || !ui.ai) return;
  const m = match(); if (!m) return;
  ui.aiIdeas = { ...(ui.aiIdeas || {}), [m.id]: e.target.value };
  const ta = $('#aiPrompt'); if (ta) ta.value = aiPrompt(ui.ai.scope, ui.ai.topic, e.target.value);
  saveUi();
});
$('#scrim').addEventListener('click', closeSheet);
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ui.view = b.dataset.view; ui.picked = null; render();
});
$('#subtabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ui.gameView = b.dataset.gview; ui.picked = null; render();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* ---------------- routing ---------------- */
/* Hash routing rather than real paths: GitHub Pages has no rewrites, so
   /admin/clubname would need a 404.html redirect hack. The hash gives the same
   readable hierarchy, real back and forward, and links that survive a reload. */
function uiToHash() {
  const t = ui.teamId, m = ui.matchId;
  if (ui.view === 'game' && t && m) return `#/team/${t}/game/${m}/${ui.gameView}`;
  if (ui.view === 'formation' && t && ui.editFid === GAME_SHAPE && m) return `#/team/${t}/game/${m}/shape`;
  if (ui.view === 'formation' && t) return `#/team/${t}/shape/${ui.editFid}`;
  if (['matches', 'calendar', 'practice', 'roster', 'season', 'teamset'].includes(ui.view) && t) {
    const seg = { matches: 'games', calendar: 'calendar', practice: 'practice', roster: 'squad', season: 'season', teamset: 'planning' }[ui.view];
    return `#/team/${t}/${seg}`;
  }
  if (ui.view === 'people') return '#/club/people';
  if (ui.view === 'club') return '#/club';
  if (ui.view === 'admin') return '#/club/settings';
  if (ui.view === 'mine') return '#/my-players';
  if (ui.view === 'inbox') return '#/messages';
  if (ui.view === 'thread' && ui.thread) return `#/messages/${ui.thread.tid}/${ui.thread.fam}`;
  if (ui.view === 'setup') return '#/settings';
  if (ui.view === 'sessions') { const tb = (ui.sess || {}).tab; return '#/training' + (tb && tb !== 'list' && SESS_TABS[tb] ? '/' + tb : ''); }
  return '#/';
}

function hashToUi() {
  const p = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  if (!p.length) return false;
  if (p[0] === 'club') { ui.view = p[1] === 'settings' ? 'admin' : p[1] === 'people' ? 'people' : 'club'; return true; }
  if (p[0] === 'my-players') { ui.view = 'mine'; return true; }
  if (p[0] === 'messages') {
    if (p[1] && p[2] && state.teams[p[1]]) { ui.view = 'thread'; ui.thread = { tid: p[1], fam: p[2] }; return true; }
    ui.view = 'inbox'; return true;
  }
  if (p[0] === 'settings') { ui.view = 'setup'; return true; }
  /* #/training/fields is a tab; #/training/{id} is one session, from a calendar
     file or a message, opened once the screen has drawn. */
  if (p[0] === 'training') {
    ui.view = 'sessions';
    const u = sessUi();
    if (p[1] && SESS_TABS[p[1]]) u.tab = p[1];
    else { u.tab = 'list'; if (p[1]) u.go = p[1]; }
    return true;
  }
  if (p[0] === 'team' && p[1]) {
    if (!state.teams[p[1]]) return false;
    ui.teamId = p[1];
    if (p[2] === 'game' && p[3]) {
      if (!state.matches[p[3]]) return false;
      ui.matchId = p[3]; ui.view = 'game';
      if (p[4] === 'shape') { ui.view = 'formation'; ui.editFid = GAME_SHAPE; return true; }
      if (['live', 'subs', 'track', 'stats', 'pitch', 'plan'].includes(p[4])) ui.gameView = p[4];
      return true;
    }
    if (p[2] === 'shape' && p[3]) { ui.editFid = p[3]; ui.view = 'formation'; return true; }
    const back = { games: 'matches', calendar: 'calendar', practice: 'practice', squad: 'roster', season: 'season', planning: 'teamset' }[p[2]];
    ui.view = back || 'matches';
    return true;
  }
  return false;
}

let routing = false, booted = false;
/* pushState, not replaceState: every move needs its own history entry or the
   phone's back gesture walks straight out of the app instead of up a level. */
function syncHash() {
  if (typeof history === 'undefined' || !history.pushState) return;
  const want = uiToHash();
  if (location.hash === want) return;
  routing = true;
  const url = location.pathname + location.search + want;
  if (booted) history.pushState(null, '', url); else history.replaceState(null, '', url);
  booted = true;
  setTimeout(() => { routing = false; }, 0);
}
const avEl = $('#avatar');
if (avEl) avEl.addEventListener('click', () => (me ? sheetAccount() : sheetSignIn()));
const csEl = $('#clubSwitch');
if (csEl) csEl.addEventListener('click', sheetClubSwitch);
const ibEl = $('#inboxBtn');
if (ibEl) ibEl.addEventListener('click', () => { ui.view = 'inbox'; ui.thread = null; closeSheet(); render(); });
// a tab brought back to the front has now read what arrived while it was behind
if (typeof document !== 'undefined' && document.addEventListener)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (ui.view === 'inbox' || ui.view === 'thread')) render(); });

if (typeof window !== 'undefined' && window.addEventListener) {
  const backOrForward = () => {
    if (routing) return;
    const want = uiToHash();
    if (location.hash === want) return;
    if (hashToUi()) { routing = true; render(); setTimeout(() => { routing = false; }, 0); }
  };
  window.addEventListener('popstate', backOrForward);
  window.addEventListener('hashchange', backOrForward);
}

/* ---------------- boot ---------------- */
captureInvite();
captureJoin();
loadLocal();
/* Provisional, so an offline device renders for the person who was using it
   rather than sitting on a lock screen. onAuthStateChanged overwrites it either
   way a moment later, and a sign-out has already cleared it. */
me = cachedMe();
hashToUi();     // a shared link wins over whatever was last open
render();
(async () => { await initAuth(); await initSync(); })();
