/* Minutes — soccer sub & minutes tracker.
   Static app. Data lives in localStorage, and mirrors to Firebase Realtime
   Database when a config + workspace code are present. */

const BUILD = '34';
const BUILT = '2026-09-13';
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

/* The workspace node was already organisation-shaped — many teams, their
   matches — so membership hangs off it directly and nothing has to migrate. */
let state = { teams: {}, matches: {}, access: {} };
let ui = { view: 'matches', gameView: 'live', teamId: null, matchId: null, picked: null, dragging: false, editFid: null, sortBy: 'need', plan: null };
let lastLog = [];

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
    S('LW', 'Wing', 20, 27), S('ST', 'Forward', 50, 20), S('RW', 'Wing', 80, 27)]
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
const dataKey = () => LS_DATA + ':' + (wsCode() || 'local');

function saveLocal() {
  try { localStorage.setItem(dataKey(), JSON.stringify(state)); } catch (e) { }
}
function saveUi() {
  try { localStorage.setItem(LS_UI, JSON.stringify({ view: ui.view, teamId: ui.teamId, matchId: ui.matchId, sortBy: ui.sortBy, plan: ui.plan, gameView: ui.gameView })); } catch (e) { }
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
    if (d) state = { teams: d.teams || {}, matches: d.matches || {}, access: d.access || {} };
    const u = JSON.parse(localStorage.getItem(LS_UI) || 'null');
    if (u) Object.assign(ui, u);
    // pre-v26 the game screens were top-level tabs
    const oldTabs = { live: 'live', track: 'track', match: 'pitch' };
    if (oldTabs[ui.view]) { ui.gameView = oldTabs[ui.view]; ui.view = 'game'; }
    // a staged batch belongs to one game; drop it if we are somewhere else
    if (ui.plan && ui.plan.matchId !== ui.matchId) ui.plan = null;
  } catch (e) { }
}

/* ---------------- firebase sync ---------------- */
let fbApp = null, fbAuth = null, authMod = null;
let me = null;              // { uid, name, email } when signed in
let fb = null; // { db, ref, set, remove, onValue, base }
let clockSkew = 0;           // serverTime - deviceTime, in ms
const nowMs = () => Date.now() + clockSkew;

function setSync(stateName, label) {
  const b = $('#syncBadge');
  b.dataset.state = stateName;
  b.textContent = label;
}

async function getApp() {
  if (fbApp) return fbApp;
  const cfg = window.SOCCER_FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey) return null;
  const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  fbApp = appMod.initializeApp(cfg);
  return fbApp;
}

/* Signing in is optional for now. Nothing gates on it yet — it exists so stamps
   carry a real identity, and so the org model has something to hang off next. */
async function initAuth() {
  const app = await getApp();
  if (!app) return;
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

    authMod.onAuthStateChanged(fbAuth, u => {
      me = u ? { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] || 'Signed in', email: u.email || '' } : null;
      if (me && fb) {
        // put myself on the roster of people so an admin has someone to assign
        const known = (acc().members || {})[me.uid];
        if (!known || known.name !== me.name || known.email !== me.email) {
          quiet(`access/members/${me.uid}`, { name: me.name, email: me.email, at: (known && known.at) || nowMs() });
          saveLocal();
        }
      }
      render();
    });
  } catch (e) { console.warn('auth unavailable', e); }
}

async function initSync() {
  const cfg = window.SOCCER_FIREBASE_CONFIG;
  const code = localStorage.getItem(LS_WS);
  if (!cfg || !cfg.apiKey || !cfg.databaseURL) { setSync('off', 'this device'); return; }
  if (!code) { setSync('off', 'no code'); return; }
  try {
    const app = await getApp();
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const db = dbMod.getDatabase(app);
    fb = { db, ref: dbMod.ref, set: dbMod.set, remove: dbMod.remove, base: 'workspaces/' + code };
    fb.childAdded = dbMod.onChildAdded;

    // every device measures the match against Firebase's clock, not its own
    dbMod.onValue(dbMod.ref(db, 'appOwners'), s => { appOwners = s.val() || {}; render(); }, () => { });

    dbMod.onValue(dbMod.ref(db, '.info/serverTimeOffset'), s => {
      clockSkew = s.val() || 0;
      if (Math.abs(clockSkew) > 30000) console.warn('device clock is off by', Math.round(clockSkew / 1000), 's');
    });

    dbMod.onValue(dbMod.ref(db, '.info/connected'), s => {
      setSync(s.val() ? 'live' : 'off', s.val() ? 'synced' : 'offline');
    });

    // One full read to get in sync, then child-level listeners so an update to
    // one match can never touch another, or the teams tree.
    const onDenied = err => {
      if (!/permission|denied/i.test((err && err.code) || '')) return;
      denied = true; setSync('off', 'sign in'); render();
    };

    dbMod.onValue(dbMod.ref(db, fb.base), snap => {
      denied = false;
      const v = snap.val();
      if (!v) pushAll();
      else { state = { teams: v.teams || {}, matches: v.matches || {}, access: v.access || {} }; saveLocal(); render(); }
      schedulePublish();   // republish on load, so a fixed config heals itself

      // membership is small and read whole; it does not need child-level listeners
      dbMod.onValue(dbMod.ref(db, fb.base + '/access'), cs => {
        state.access = cs.val() || {};
        saveLocal(); render();
      });

      for (const coll of ['teams', 'matches']) {
        const r = dbMod.ref(db, fb.base + '/' + coll);
        const upsert = cs => {
          if (ui.dragging) return;
          const inc = cs.val(); if (!inc) return;
          state[coll][cs.key] = mergeNode(state[coll][cs.key], inc);
          saveLocal(); render();
        };
        dbMod.onChildAdded(r, upsert);
        dbMod.onChildChanged(r, upsert);
        dbMod.onChildRemoved(r, cs => {
          if (ui.dragging) return;
          delete state[coll][cs.key]; saveLocal(); render();
        });
      }
    }, onDenied, { onlyOnce: true });
  } catch (e) {
    console.error(e);
    setSync('off', 'sync failed');
  }
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

function pushAll() { if (fb) fb.set(fb.ref(fb.db, fb.base), state); }
function remoteSet(path, value) { if (fb) fb.set(fb.ref(fb.db, fb.base + '/' + path), value === undefined ? null : value); }
function remoteDel(path) { if (fb) fb.remove(fb.ref(fb.db, fb.base + '/' + path)); }

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
const ROLE_LABEL = { owner: 'App owner', admin: 'Org admin', coach: 'Coach', tracker: 'Tracker', parent: 'Parent' };

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
function syncIndex(uid) {
  if (!uid) return;
  if (hasAnyRole(uid)) quiet(`access/index/${uid}`, true);
  else { delDeep(state, `access/index/${uid}`); remoteDel(`access/index/${uid}`); }
  saveLocal();
}

/* Who may see and change which team.
   Admin: everything. Coach: edits her own team, reads the rest of the club —
   comparing against the other age groups is the point of being in a club.
   Tracker and parent: only the teams they are actually attached to. */
function myTeams() {
  const all = teams();
  if (!me || !anyAdmins()) return all;        // before lockdown, nothing is hidden
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
  if (!me || !anyAdmins()) return true;
  return canAdmin() || isCoach(tid, me.uid);
}
const readOnlyHere = () => !canEditTeam(ui.teamId);

/* My role here. Nobody is locked out by an empty membership list: until someone
   is actually given a role, everyone keeps the access they have today. */
function myRole() {
  if (!me) return null;
  return roleIn(ui.teamId, me.uid);
}
const restricted = () => {
  if (isOwner()) return null;
  const r = myRole();
  return r === 'tracker' || r === 'parent' ? r : null;
};

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

const isOut = (m, pid) => !!(m.out && m.out[pid]);
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

function planBlockAt(m, sec) {
  if (!m.plan || !m.plan.blocks) return null;
  let cur = null;
  for (const b of m.plan.blocks) if (b.start <= sec) cur = b;
  return cur;
}
function nextPlanBlock(m, sec) {
  if (!m.plan || !m.plan.blocks) return null;
  return m.plan.blocks.find(b => b.start > sec) || null;
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
function swap(m, outPid, inPid) {
  const pos = posOf(m, outPid);
  takeOffField(m, outPid);
  putOnField(m, inPid, pos.x, pos.y, pos.slot);
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
  const pos = posOf(m, outPid);
  const open = openStint(m, outPid);
  if (open) quiet(`${path}/stints/${open[0]}/off`, t);
  delDeep(state, `${path}/positions/${outPid}`); remoteDel(`${path}/positions/${outPid}`);
  quiet(`${path}/positions/${inPid}`, { x: pos.x, y: pos.y, slot: pos.slot || null });
  const sl = pos.slot ? slotById(m, pos.slot) : null;
  quiet(`${path}/stints/${uid()}`, { pid: inPid, on: t, slot: pos.slot || null, role: sl ? sl.role : null });
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
  for (const pid of fieldIds(m)) stints[uid()] = { pid, on: 0 };
  commit(`matches/${m.id}`, { ...m, periods: {}, currentHalf: 1, stints, goals: null });
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
function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false;
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
  const t = team();
  if (!t && teams().length) { ui.teamId = teams()[0].id; }
  const vis = myTeams();
  if (vis.length && !vis.some(x => x.id === ui.teamId)) ui.teamId = vis[0].id;
  const tt = team();
  $('#teamSwitchName').textContent = tt ? (tt.name || 'Untitled team') : 'No team yet';
  const vr = $('#ver');
  if (vr) { vr.textContent = 'v' + BUILD; vr.dataset.stale = stale() ? '1' : '0'; }
  const cr = $('#teamCrest');
  if (cr) { cr.src = (tt && tt.logo) || ''; cr.hidden = !(tt && tt.logo); }
  const brand = $('#brand');
  if (brand && brand.firstChild) brand.firstChild.nodeValue = (acc().org || {}).name || 'Minutes';
  const lim = restricted();
  document.body.dataset.role = lim || '';
  let inGame = ui.view === 'game';
  // a game screen with no game is just four buttons that do nothing
  if (inGame && !match() && !teamMatches(ui.teamId).length) { ui.view = 'matches'; inGame = false; }
  const at = $('#adminTab'); if (at) at.hidden = !canAdmin();
  if (ui.view === 'admin' && !canAdmin()) ui.view = 'setup';
  const mt = $('#mineTab'); if (mt) mt.hidden = !guardsAnyone();
  if (ui.view === 'mine' && !guardsAnyone()) ui.view = 'matches';
  // a parent has no business reading the rest of the squad's names
  const rt = document.querySelector('#tabs [data-view="roster"]');
  if (rt) rt.hidden = lim === 'parent';
  if (ui.view === 'roster' && lim === 'parent') ui.view = guardsAnyone() ? 'mine' : 'matches';
  const tabView = ui.view === 'formation' ? 'admin' : inGame ? 'matches' : ui.view;
  for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-current', String(b.dataset.view === tabView));
  const allowed = lim === 'tracker' ? ['track', 'stats'] : lim === 'parent' ? ['stats'] : ['live', 'track', 'stats', 'pitch'];
  if (!allowed.includes(ui.gameView)) ui.gameView = allowed[0];
  for (const b of document.querySelectorAll('#subtabs button')) {
    b.hidden = !allowed.includes(b.dataset.gview);
    b.setAttribute('aria-current', String(b.dataset.gview === ui.gameView));
  }
  const openM = inGame ? match() : null;
  const st = $('#subtabs'); if (st) st.hidden = !(inGame && openM);
  // two stacked rows of tabs read as a mistake; show whichever one applies
  const tb = $('#tabs'); if (tb) tb.hidden = !!(inGame && openM);
  const sr = $('#switchrow'); if (sr) sr.hidden = inGame;
  const app = $('#app');
  const v = ui.view;
  if (denied) { app.innerHTML = lockScreen(); saveUi(); return; }
  const roNote = !lim && readOnlyHere() && team()
    ? `<div class="rolebar">Viewing <b>${teamLabel(team())}</b> from another team in the club. You can read it, not change it.</div>` : '';
  const roleNote = lim
    ? `<div class="rolebar">Signed in as <b>${esc(ROLE_LABEL[lim])}</b> — ${lim === 'tracker' ? 'you can log events but not make subs or run the clock' : 'you can read, not change'}.</div>`
    : '';
  const g = ui.gameView;
  app.innerHTML = roleNote + roNote +
    v === 'game' ? (g === 'track' ? viewTrack() : g === 'stats' ? viewStats() : g === 'pitch' ? viewMatch() : viewLive()) :
      v === 'roster' ? viewRoster() :
        v === 'season' ? viewSeason() :
          v === 'formation' ? viewFormation() : v === 'admin' ? viewAdmin() : v === 'mine' ? viewMine() : v === 'setup' ? viewSetup() : viewMatches();
  if (v === 'game' && g === 'pitch') wireDrag();
  if (v === 'formation') wireFormationDrag();
  saveUi();
}

/* Shown when the rules refuse us. Deliberately not a dead end: both the code and
   the account can be changed from here. */
function lockScreen() {
  return `<div class="stack">
    <div class="empty"><strong>This workspace needs a sign-in</strong>
      ${me ? `You are signed in as <b>${esc(me.name)}</b>, but no role has been granted to this account yet. Ask the admin to add you in Setup → People.`
      : 'The data here is protected. Sign in with the account a coach has given access to.'}
      <div class="row" style="margin-top:14px;justify-content:center">
        ${me ? `<button class="btn quiet" data-act="signout">Sign out</button>` : `<button class="btn" data-act="signinsheet">Sign in</button>`}
        <button class="btn quiet" data-act="setwscode">Change code</button>
      </div></div>
    <p class="muted" style="text-align:center">Read-only score pages need none of this — they keep working from their own link.</p>
  </div>`;
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
      <span>${esc(g.opponent || 'Unnamed')}<span class="rowsub">${esc(g.date || '')} · ${mins(elapsedSec(g))} min played${running(g) ? ' · running' : ''}</span></span>
      <span class="pmins">${sc.us}<small>–${sc.them}</small></span></button>
`;
  }).join('') || '<p class="muted">No games yet.</p>'}
    <button class="btn wide" data-act="newmatch">Add a game</button>`);
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
    <button class="linkbtn" data-act="fixclock">Clock reading wrong?</button>`
      : `<p class="clocknote">${running(m) ? 'Running' : el ? 'Paused' : 'Not started'} — the clock is controlled from the Live tab.</p>`}</div>`;
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
    <div style="margin-top:14px"><button class="btn" data-act="newmatch">Add a game</button></div></div>`;

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
    ${shown.length ? `<div class="log">${shown.slice(0, 40).map(r => `<button type="button" data-act="${r.act}" data-id="${r.id}" data-i="${r.id}">
      <span class="t">${mmss(r.t)}</span><span>${r.h}</span><span class="muted">edit</span></button>`).join('')}</div>
      ${shown.length > 40 ? `<p class="muted" style="margin-bottom:0">Showing the last 40 of ${shown.length}.</p>` : ''}`
      : '<p class="muted" style="margin:0">Nothing logged yet.</p>'}</div>`;

  const rows = tracked(t);
  const setCard = `<div class="card"><div class="spread" style="margin-bottom:10px">
      <h2>Set pieces and fouls</h2><button class="btn quiet sm" data-act="trackcfg">Choose</button></div>
    ${rows.length ? `<div class="tallygrid">
      <span></span><span class="tallyhead">${us}</span><span class="tallyhead">${them}</span>
      ${rows.map(e => `<span class="tallylbl">${e.label}<span class="conv">${e.who}</span></span>
        <button class="tallybtn" data-act="ev" data-kind="${e.k}" data-side="us"><b>${evCount(m, e.k, 'us')}</b><span>tap</span></button>
        <button class="tallybtn" data-act="ev" data-kind="${e.k}" data-side="them"><b>${evCount(m, e.k, 'them')}</b><span>tap</span></button>`).join('')}
    </div>` : '<p class="muted" style="margin:0">Nothing switched on. Tap Choose to pick what you want to count.</p>'}
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
    ${clockCard(m, now, false)}
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
    <div class="muted">${gameStatus(m) === 'done' ? 'Full time' : gameStatus(m) === 'live' ? 'In progress' : 'Not started'} · ${mmss(elapsedSec(m, now))} played${m.date ? ' · ' + esc(shortDate(m.date)) : ''}</div></div>`;

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
    const pl = playedSec(m, p.id, now), pd = plannedSec(m, p.id), diff = Math.round((pl - pd) / 60);
    const rs = roleSummary(m, p.id, now);
    return `<div class="prow">
      <span class="pnum">${esc(p.number ?? '')}</span>
      <span><span class="pname">${esc(p.name)}</span><span class="psub">${esc(rs) || (pd > 0 ? mins(pd) + ' min planned' : 'no plan set')}</span></span>
      <span class="pmins">${mins(pl)}<small> min</small>${pd > 0 ? `<span class="diff ${diff < 0 ? 'owed' : 'over'}">${diff < 0 ? -diff + ' owed' : diff > 0 ? diff + ' over' : 'on plan'}</span>` : ''}</span>
    </div>`;
  }).join('')}</div></div>`;

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    ${headline}${halfTable}${shotsCard}${mapCard}${possCard}${evCard}${goalsCard}${minutesCard}
  </div>`;
}

/* --- live: minutes and subs only, no pitch --- */
function viewLive() {
  const t = team(); if (!t) return needTeam();
  let m = match();
  if (!m || m.teamId !== t.id) { const l = teamMatches(t.id); m = l[0] || null; ui.matchId = m ? m.id : null; }
  if (!m) return `<div class="empty"><strong>No game yet</strong>Create a game to start tracking minutes.
    <div style="margin-top:14px"><button class="btn" data-act="newmatch">Add a game</button></div></div>`;

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
    ${m.plan ? ' Or fill the whole lineup from the plan.' : ''}</p>
    ${m.plan ? `<button class="btn quiet wide" data-act="applyblock" data-start="${(planBlockAt(m, el) || m.plan.blocks[0]).start}" style="margin-bottom:10px">Use the planned lineup</button>` : ''}` : '';

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    ${clock}
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
    <div style="margin-top:14px"><button class="btn" data-act="newmatch">Add a game</button></div></div>`;

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

  const nb = nextPlanBlock(m, el), cb = planBlockAt(m, el);
  let planHtml;
  if (!m.plan) {
    planHtml = `<p class="muted" style="margin:0 0 10px">Build a block-by-block plan from planned minutes, ratings and pairings.</p>
      <button class="btn wide" data-act="makeplan">Plan the game</button>`;
  } else if (nb) {
    const onIds = nb.ids.filter(id => !cb || !cb.ids.includes(id));
    const offIds = cb ? cb.ids.filter(id => !nb.ids.includes(id)) : [];
    planHtml = `<div class="spread" style="align-items:flex-start">
      <div><div class="muted">Next change at ${mmss(nb.start)}</div>
      <div style="margin-top:4px">${onIds.length ? `<span class="on">on: ${onIds.map(name).join(', ')}</span><br>` : ''}${offIds.length ? `<span class="off">off: ${offIds.map(name).join(', ')}</span>` : ''}${!onIds.length && !offIds.length ? 'no changes' : ''}</div></div>
      <button class="btn sm" data-act="applyblock" data-start="${nb.start}">Make these subs</button></div>
      <div class="row" style="margin-top:12px"><button class="btn quiet sm" data-act="viewplan">See the plan</button><button class="btn quiet sm" data-act="makeplan">Rebuild</button></div>`;
  } else {
    planHtml = `<p class="muted" style="margin:0 0 10px">Plan finished — no changes left.</p>
      <div class="row"><button class="btn quiet sm" data-act="viewplan">See the plan</button><button class="btn quiet sm" data-act="makeplan">Rebuild</button></div>`;
  }

  const outCount = Object.keys(m.out || {}).length;

  return `<div class="stack">
    <div class="barrow">${gameBar(t, m)}</div>
    ${clock}
    ${warn}
    <div class="split">
      <div class="stack">
        ${pitch}
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
        <div class="card"><div class="spread">
          <div><h2>${esc(m.opponent || 'Game')}</h2><div class="muted">${esc(m.date || '')} · ${m.periodCount || 2} × ${m.periodMinutes || 40} min · ${cap}v${cap}</div></div>
          <button class="btn quiet sm" data-act="editmatch" data-id="${m.id}">Edit</button></div>
          ${m.veoUrl ? `<p style="margin:10px 0 0"><a href="${esc(m.veoUrl)}" target="_blank" rel="noopener">Open the Veo recording</a></p>` : ''}
        </div>
      </div>
    </div></div>`;
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

/* --- games --- */
function viewMatches() {
  const t = team(); if (!t) return needTeam();
  const list = teamMatches(t.id);
  const rows = list.map(m => {
    const el = elapsedSec(m);
    return `<button class="prow" type="button" data-act="openmatch" data-id="${m.id}" style="grid-template-columns:1fr auto">
      <span><span class="pname">${esc(m.opponent || 'Game')}</span><span class="psub">${esc(m.date || '')} · ${mins(el)} min played${running(m) ? ' · clock running' : ''}</span></span>
      <span class="pmins">${score(m).us}<small>–${score(m).them}</small></span></button>`;
  }).join('') || `<div class="empty"><strong>No games yet</strong>Add one and it becomes the live game.</div>`;
  return `<div class="stack"><div class="spread"><h2>Games</h2><button class="btn sm" data-act="newmatch">Add a game</button></div><div class="plist">${rows}</div></div>`;
}

/* --- roster --- */
function viewRoster() {
  const t = team(); if (!t) return needTeam();
  const list = players(t);
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
    return `<button class="prow" type="button" data-act="editplayer" data-pid="${p.id}">
      ${p.photo ? `<img class="crest sm" src="${esc(p.photo)}" alt="">` : `<span class="pnum">${esc(p.number ?? '')}</span>`}
      <span><span class="pname">${esc(p.name)}</span><span class="psub">${esc(bits.join(' · ') || 'no profile yet')}</span></span>
      <span class="stars" aria-label="rated ${rating(p)} of 5">${'●'.repeat(rating(p))}<span class="dim">${'●'.repeat(5 - rating(p))}</span></span></button>`;
  }).join('') ||
    `<div class="empty"><strong>No players yet</strong>Add the squad once; every game reuses it.</div>`;
  return `<div class="stack">
    <div class="spread"><h2>${esc(t.name)}</h2><span class="muted">${list.length} players</span></div>
    <div class="card"><div class="row" style="align-items:flex-end">
      <div style="width:76px"><label class="field"><span>Number</span><input type="number" inputmode="numeric" id="newNum" placeholder="7"></label></div>
      <div style="flex:1"><label class="field"><span>Name</span><input type="text" id="newName" placeholder="Ella Moreno"></label></div>
      <button class="btn" data-act="addplayer" style="margin-bottom:10px">Add</button>
    </div></div>
    <div class="plist">${rows}</div></div>`;
}

/* --- season --- */
function viewSeason() {
  const t = team(); if (!t) return needTeam();
  const ms = teamMatches(t.id);
  const rows = players(t).map(p => {
    let pl = 0, pd = 0;
    const roles = {};
    for (const m of ms) {
      pl += playedSec(m, p.id); pd += plannedSec(m, p.id);
      for (const [k, v] of Object.entries(byRole(m, p.id))) roles[k] = (roles[k] || 0) + v;
    }
    const rs = Object.entries(roles).filter(([, v]) => v >= 60).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${mins(v)} at ${k}`).join(' · ');
    return { p, pl, pd, diff: pl - pd, roles: rs };
  }).sort((a, b) => a.diff - b.diff);
  if (!rows.length) return `<div class="empty"><strong>No players yet</strong>Add the squad on the Roster tab.</div>`;
  const html = rows.map(r => {
    const pct = r.pd > 0 ? clamp(r.pl / r.pd * 100, 0, 100) : 0;
    const owed = r.pd > 0 && r.diff < -60 ? 1 : 0, over = r.pd > 0 && r.diff > 60 ? 1 : 0;
    return `<div class="prow" data-on="0">
      <span class="pnum">${esc(r.p.number ?? '')}</span>
      <span><span class="pname">${esc(r.p.name)}</span>
      ${r.pd > 0 ? `<div class="bar"><i style="width:${pct}%" data-owed="${owed}" data-over="${over}"></i><u style="left:100%"></u></div>` : ''}
      <span class="psub">${r.pd > 0 ? `${mins(r.pd)} planned · ${r.diff < 0 ? mins(-r.diff) + ' min owed' : mins(r.diff) + ' min over'}` : 'no plan set'}</span>
      ${r.roles ? `<span class="psub">${esc(r.roles)}</span>` : ''}</span>
      <span class="pmins">${mins(r.pl)}<small> min</small></span></div>`;
  }).join('');
  return `<div class="stack"><div class="spread"><h2>Season totals</h2><span class="muted">${ms.length} games</span></div>
    <div class="plist">${html}</div>
    <p class="muted">Sorted by who is furthest behind their planned minutes.</p></div>`;
}

/* --- formation editor --- */
function viewFormation() {
  const t = team(); if (!t) return needTeam();
  const f = (t.formations || {})[ui.editFid];
  if (!f) return `<div class="empty"><strong>Shape not found</strong><div style="margin-top:14px"><button class="btn" data-act="backsetup">Back to setup</button></div></div>`;
  const isDefault = (t.defaults || {})[f.size] === f.id;
  const toks = (f.slots || []).map(s => `<div class="slotok" data-sid="${s.id}" style="left:${s.x}%;top:${s.y}%">
    <span class="lab">${esc(s.label)}</span><span class="rl">${esc(s.role)}</span></div>`).join('');
  return `<div class="stack">
    <div class="spread"><button class="btn quiet sm" data-act="backsetup">Back</button>
      <span class="muted">${(f.slots || []).length} of ${f.size} spots</span></div>
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
    <div class="card"><div class="spread"><span>Use for ${f.size}v${f.size} by default</span>
      <button class="chip" type="button" data-act="setdefault" data-id="${f.id}" aria-pressed="${isDefault}">${isDefault ? 'Default' : 'Make default'}</button></div>
      <p class="muted" style="margin:10px 0 0">Changing this shape only affects games you create from now on. Games already played keep the lineup they were played with.</p></div>
    <button class="btn danger wide" data-act="delformation" data-id="${f.id}">Delete this shape</button>
  </div>`;
}

function sheetSlot(sid) {
  const t = team(), f = (t.formations || {})[ui.editFid];
  const s = (f.slots || []).find(x => x.id === sid); if (!s) return;
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
    const diff = Math.round((played - planned) / 60);
    const last = ms.find(m => gameStatus(m) === 'done');
    const live = ms.find(m => gameStatus(m) === 'live');
    const next = ms.filter(m => gameStatus(m) === 'upcoming').slice(-1)[0];
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
        <span class="pmins">${mins(played)}<small> min</small>
          ${planned > 0 ? `<span class="diff ${diff < 0 ? 'owed' : 'over'}">${diff < 0 ? -diff + ' owed' : diff > 0 ? diff + ' over' : 'on plan'}</span>` : ''}</span>
      </div>
      ${rs ? `<p class="muted" style="margin:10px 0 0">${esc(rs)}</p>` : ''}
      <div class="plist" style="margin-top:10px">
        ${live ? `<button class="prow" data-act="gotoplayer" data-tid="${t.id}" data-id="${live.id}" style="grid-template-columns:1fr auto">
          <span><span class="pname">Playing now — ${esc(live.opponent || 'TBC')}</span>
            <span class="rowsub">${mins(playedSec(live, p.id))} min so far</span></span>
          <span class="pmins">${score(live).us}<small>–${score(live).them}</small></span></button>` : ''}
        ${last && !live ? `<button class="prow" data-act="gotoplayer" data-tid="${t.id}" data-id="${last.id}" style="grid-template-columns:1fr auto">
          <span><span class="pname">Last game — ${esc(last.opponent || 'TBC')}</span>
            <span class="rowsub">${esc(shortDate(last.date))} · ${mins(playedSec(last, p.id))} min played</span></span>
          <span class="pmins">${score(last).us}<small>–${score(last).them}</small></span></button>` : ''}
        ${next ? `<div class="prow" style="grid-template-columns:1fr auto">
          <span><span class="pname">Next — ${esc(next.opponent || 'TBC')}</span>
            <span class="rowsub">${[shortDate(next.date), next.kickoff, next.venue].filter(Boolean).map(esc).join(' · ')}</span></span>
          <span class="muted">upcoming</span></div>` : ''}
      </div></div>`;
  }).join('')}
    <p class="muted">Minutes are across every game this season. Tap a game for the full picture.</p>
  </div>`;
}

/* --- settings: things about you and this device --- */
function viewSetup() {
  const code = localStorage.getItem(LS_WS) || '';
  const cfgOk = !!(window.SOCCER_FIREBASE_CONFIG && window.SOCCER_FIREBASE_CONFIG.apiKey);
  const r = myRole();
  return `<div class="stack">
    <div class="card"><h2 style="margin-bottom:8px">Account</h2>
      <div class="spread"><span>${me ? `<b>${esc(me.name)}</b><span class="rowsub">${esc(me.email || '')}</span>` : 'Not signed in'}</span>
      <button class="btn quiet sm" data-act="signinsheet">${me ? 'Manage' : 'Sign in'}</button></div>
      ${me ? `<p class="muted">You are <b>${esc(ROLE_LABEL[r] || 'not assigned a role')}</b>${r && r !== 'owner' && r !== 'admin' ? ` for ${teamLabel(team() || {})}` : ''}.</p>
      <p class="lbl">Your account id</p>
      <div class="codebox">${esc(me.uid)}</div>
      <button class="btn quiet sm" data-act="copylink" data-v="${esc(me.uid)}">Copy id</button>
      <p class="muted" style="margin-bottom:0">Needed once, to be made app owner in the Firebase console.</p>`
      : '<p class="muted" style="margin-bottom:0">Everything works signed out until the workspace is locked down.</p>'}</div>

    <div class="card"><h2 style="margin-bottom:8px">Workspace</h2>
      <p class="muted" style="margin-top:0">Every device needs the same code. Firebase config is ${cfgOk ? 'in place' : 'not filled in — see README.md'}.</p>
      <div class="spread"><span class="codebox" style="margin:0;flex:1">${esc(code || 'none')}</span></div>
      <div style="margin-top:10px"><button class="btn quiet wide" data-act="setwscode">Change or copy the code</button></div></div>

    <div class="card"><h2 style="margin-bottom:8px">Share with parents</h2>
      <p class="muted" style="margin-top:0">Read-only pages showing shirt numbers, never names.</p>
      <button class="btn quiet wide" data-act="sharesheet">${team() && team().share ? 'Manage links' : 'Set up sharing'}</button></div>

    <div class="card"><h2 style="margin-bottom:8px">Version</h2>
      <div class="spread"><span>Build <b>v${BUILD}</b> <span class="muted">· ${BUILT}</span></span>
        <button class="btn quiet sm" data-act="hardreload">Force refresh</button></div>
      ${stale() ? `<div class="warn alert" style="margin-top:10px">This page is cached at v${esc(pageBuild())} but the code is v${BUILD}. Force refresh to catch up.</div>`
      : '<p class="muted" style="margin-bottom:0">Page and code agree, so you are on the latest push.</p>'}</div>

    <div class="card"><h2 style="margin-bottom:8px">Backup</h2>
      <div class="row"><button class="btn quiet" data-act="export">Download a copy</button>
      <button class="btn quiet" data-act="import">Load from a file</button></div>
      <p class="muted" style="margin-bottom:0">Every team, game and sub as a JSON file.</p></div>
  </div>`;
}

/* --- admin: the club, its teams and who may touch them --- */
function viewAdmin() {
  if (!canAdmin()) return `<div class="empty"><strong>Admins only</strong>
    ${me ? 'Your account does not have admin rights for this club.' : 'Sign in with an admin account.'}</div>`;
  const org = (acc().org || {});
  const nAdmins = Object.keys(acc().admins || {}).length;
  return `<div class="stack">
    <div class="card"><h2 style="margin-bottom:8px">Club</h2>
      <div class="row" style="margin-bottom:10px">
        ${org.logo ? `<img class="crest" src="${esc(org.logo)}" alt="">` : '<span class="crest blank">—</span>'}
        <span style="flex:1"><button class="btn quiet sm" data-act="pickorglogo">${org.logo ? 'Change badge' : 'Add a badge'}</button></span>
      </div>
      <label class="field"><span>Name</span><input type="text" id="orgName" value="${esc(org.name || '')}" placeholder="Lakeside Soccer Club"></label>
      <button class="btn quiet wide" data-act="saveorg">Save</button></div>

    <div class="card"><h2 style="margin-bottom:8px">People</h2>
      ${nAdmins ? `<p class="muted" style="margin-top:0">${members().length} signed in · ${nAdmins} admin${nAdmins === 1 ? '' : 's'}.</p>
        <button class="btn quiet wide" data-act="people">Manage people and roles</button>`
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

    <div class="card"><h2 style="margin-bottom:8px">Shapes</h2>
      <p class="muted" style="margin-top:0">Default lineups per side size. New games copy the default; existing games keep what they were played with.</p>
      <button class="btn quiet wide" data-act="formations">Manage shapes</button></div>
  </div>`;
}

/* ---------------- ticking ---------------- */
setInterval(() => {
  if (!['match', 'live', 'track'].includes(ui.view) || ui.dragging) return;
  const m = match(); if (!m || !running(m)) return;
  const t = team(); if (!t) return;
  const now = nowMs();
  const c = $('#clock'); if (c) c.textContent = mmss(elapsedSec(m, now));
  const h = $('#halfclock'); if (h) h.textContent = mmss(halfSec(m, now));
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

  pitch.addEventListener('pointerdown', e => {
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
  const t = team(), f = t && (t.formations || {})[ui.editFid];
  if (!f) return;
  for (const el of pitch.querySelectorAll('.slotok')) {
    const sid = el.dataset.sid;
    draggable(pitch, el, p => {
      const slots = (f.slots || []).map(s => s.id === sid ? { ...s, x: p.x, y: p.y } : s);
      commit(`teams/${t.id}/formations/${f.id}/slots`, slots);
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
const chipName = p => `${p.number ? esc(p.number) + ' ' : ''}${esc(p.name)}`;
const shirtOf = p => String((p && p.number) ?? '').trim() || '–';
const gameStatus = m => (m.currentHalf || 1) > (m.periodCount || 2) ? 'done'
  : (elapsedSec(m) > 0 || running(m)) ? 'live' : 'upcoming';

function publicGame(t, m) {
  const roster = squad(t, m);
  const numOf = pid => shirtOf((t.players || {})[pid]);
  return {
    id: m.id,
    opponent: m.opponent || '', date: m.date || '', kickoff: m.kickoff || '', venue: m.venue || '',
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
    games, record: { w, d, l, gf, ga }, updated: nowMs()
  };
}

let pubTimer;
let pubState = { at: null, error: null };   // surfaced in the share sheet
let denied = false;                         // rules refused us; show the door
function schedulePublish() {
  const t = team();
  if (!fb) { pubState = { at: null, error: 'Not connected to Firebase' }; return; }
  if (!t || !t.share) return;
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => {
    // try/catch does not catch this — set() rejects asynchronously
    fb.set(fb.ref(fb.db, 'public/' + t.share), publicDoc(t))
      .then(() => { pubState = { at: nowMs(), error: null }; })
      .catch(e => {
        const code = (e && e.code) || (e && e.message) || 'unknown';
        pubState = {
          at: null,
          error: /permission|denied/i.test(code)
            ? 'Firebase rejected it — the "public" rules block is missing or wrong'
            : String(code)
        };
        console.error('publish failed', e);
        render();
      });
  }, 1200);
}

const shareBase = () => location.href.replace(/[^/]*$/, '');
const teamLink = t => t.share ? `${shareBase()}live.html?t=${t.share}` : '';
const gameLink = (t, m) => t.share ? `${shareBase()}game.html?t=${t.share}&g=${m.id}` : '';

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

function sheetPeople() {
  const t = team();
  const list = members();
  openSheet(`<h3>People</h3>
    <p class="muted" style="margin-top:0">Anyone who signs in with the workspace code lands here. Roles below apply to <b>${teamLabel(t || {})}</b>; admins are club-wide.</p>
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
      <p class="muted" style="margin-top:0">Text this once. It always shows whatever game is on, plus the season record.</p>

      ${m ? `<p class="lbl">This game — ${esc(m.opponent || 'game')}${m.date ? ' · ' + esc(shortDate(m.date)) : ''}</p>
      <div class="codebox">${esc(gameLink(t, m))}</div>
      <div class="row" style="margin-bottom:16px"><button class="btn sm" data-act="copylink" data-v="${esc(gameLink(t, m))}">Copy link to this game</button></div>
      <p class="muted" style="margin-top:0">Kick-off time, where it is, who is on and the minutes. Switch games in the bar above to share a different one.</p>` : ''}

      <p class="muted">Anyone with a link can read it. Nobody can change anything, and no child's name is published — only shirt numbers.</p>
      <button class="btn quiet wide" data-act="republish" style="margin-bottom:8px">Republish now</button>
      <button class="btn danger wide" data-act="rotateshare">Make a new link and kill the old one</button>`
      : `<p class="muted" style="margin-top:0">Creates a long random address. Only people you send it to can find it.</p>
      <button class="btn wide" data-act="makeshare">Create the share links</button>`}`);
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

function sheetWorkspace() {
  const code = wsCode();
  const cfgOk = !!(window.SOCCER_FIREBASE_CONFIG && window.SOCCER_FIREBASE_CONFIG.apiKey);
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

function sheetMatch(m) {
  const t = team();
  const isNew = !m;
  m = m || { periodCount: 2, periodMinutes: 40, onFieldCount: 11, date: new Date().toISOString().slice(0, 10) };
  openSheet(`<h3>${isNew ? 'New game' : 'Game details'}</h3>
    <label class="field"><span>Opponent</span><input type="text" id="mOpp" value="${esc(m.opponent || '')}" placeholder="Riverside United"></label>
    <div class="grid2">
      <label class="field"><span>Date</span><input type="date" id="mDate" value="${esc(m.date || '')}"></label>
      <label class="field"><span>Kick-off</span><input type="time" id="mKick" value="${esc(m.kickoff || '')}"></label>
    </div>
    <label class="field"><span>Where</span><input type="text" id="mVenue" value="${esc(m.venue || '')}" placeholder="Lakeside Park, field 3"></label>
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
  openSheet(`<h3>Available for ${esc(m.opponent || 'this game')}</h3>
    <p class="muted" style="margin-top:0">Anyone switched off here is left out of the bench, the plan and the even split — but keeps her season totals.</p>
    ${players(t).filter(p => p.active !== false).map(p => `<button class="opt spread" type="button" data-act="toggleout" data-pid="${p.id}">
      <span>${esc(p.number ?? '')} ${esc(p.name)}</span>
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
    </div>`).join('') || '<p class="muted">She has not been on yet.</p>'}
    <button class="btn wide" data-act="savestints" data-pid="${pid}" style="margin-top:6px">Save spells</button>
    <div style="margin-top:8px"><button class="btn quiet wide" data-act="addstint" data-pid="${pid}">Add a spell she was on for</button></div>
    <p class="muted" style="margin:8px 0 0">Times are minutes into the game, like 23:10. Now is ${mmss(e)}.</p>`);
}

function sheetPlan() {
  const t = team(), m = match();
  if (!m.plan) return;
  const roster = squad(t, m);
  const nm = id => { const p = (t.players || {})[id]; return p ? (p.number ? p.number + ' ' : '') + p.name.split(' ')[0] : '?'; };
  const spotFor = (b, id) => {
    const sid = Object.keys(b.assign || {}).find(k => b.assign[k] === id);
    const sl = sid && slotById(m, sid);
    return sl ? ` (${sl.label})` : '';
  };
  openSheet(`<h3>Game plan${m.formation ? ' · ' + esc(m.formation.name) : ''}</h3>
    <p class="muted" style="margin-top:0">${m.plan.blocks.length} blocks of about ${Math.round(m.plan.blockMinutes)} minutes.</p>
    ${m.plan.blocks.map((b, i) => {
    const prev = i ? m.plan.blocks[i - 1] : null;
    const onIds = prev ? b.ids.filter(id => !prev.ids.includes(id)) : b.ids;
    const offIds = prev ? prev.ids.filter(id => !b.ids.includes(id)) : [];
    return `<div class="planblock"><div class="spread"><b>${mmss(b.start)}</b>
        <button class="btn quiet sm" data-act="applyblock" data-start="${b.start}">Use this XI</button></div>
        <div style="margin-top:4px">${prev ? `${onIds.length ? `<span class="on">on: ${onIds.map(id => nm(id) + spotFor(b, id)).join(', ')}</span> ` : ''}${offIds.length ? `<span class="off">off: ${offIds.map(nm).join(', ')}</span>` : ''}${!onIds.length && !offIds.length ? '<span class="muted">unchanged</span>' : ''}` : b.ids.map(id => nm(id) + spotFor(b, id)).join(', ')}</div></div>`;
  }).join('')}
    <h3 style="margin-top:16px">Projected minutes</h3>
    ${roster.map(p => {
    const pr = m.plan.projected[p.id] || 0, pd = (m.planned && m.planned[p.id]) || 0;
    const d = pr - pd;
    return `<div class="spread" style="padding:4px 0"><span>${esc(p.name)}</span>
      <span><b>${pr}</b> <span class="muted">of ${pd} planned${pd ? d < 0 ? ` · ${-d} short` : d > 0 ? ` · ${d} over` : '' : ''}</span></span></div>`;
  }).join('')}
    <button class="btn wide" data-act="closesheet" style="margin-top:12px">Done</button>`);
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
      ${t.logo ? `<img class="crest" src="${esc(t.logo)}" alt="">` : '<span class="crest blank">—</span>'}
      <span style="flex:1"><button class="btn quiet sm" data-act="picklogo" data-id="${t.id}">${t.logo ? 'Change crest' : 'Add a crest'}</button>
      ${t.logo ? `<button class="btn quiet sm" data-act="droplogo" data-id="${t.id}">Remove</button>` : ''}</span>
    </div>` : ''}
    <label class="field"><span>Name</span><input type="text" id="tName" value="${esc(t && t.name ? t.name : '')}" placeholder="Lakeside Thunder G14"></label>
    <button class="btn wide" data-act="saveteam" data-id="${t ? t.id : ''}">${t ? 'Save changes' : 'Create team'}</button>
    ${t ? `<div style="margin-top:8px"><button class="btn danger wide" data-act="delteam" data-id="${t.id}">Delete this team and its games</button></div>` : ''}`);
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, d = el.dataset;
  const t = team(), m = match();

  if (a === 'tap') { tapPlayer(d.pid); return; }
  if (a === 'taplive') { tapLive(d.pid); return; }
  if (a === 'clearpick') { ui.picked = null; render(); return; }
  if (a === 'puton') { ui.picked = null; putOn(m, d.pid); render(); return; }
  if (a === 'switchpos') { sheetSwitch(d.pid); return; }
  if (a === 'togglesort') { ui.sortBy = ui.sortBy === 'number' ? 'need' : 'number'; render(); return; }
  if (a === 'pickgame') { sheetPickGame(); return; }
  if (a === 'pickgame2') { ui.matchId = d.id; ui.picked = null; ui.view = 'game'; closeSheet(); render(); return; }
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
  if (a === 'trackcfg') { sheetTrackCfg(); return; }
  if (a === 'hardreload') {
    location.replace(location.pathname + '?r=' + Date.now());
    return;
  }
  if (a === 'people') { sheetPeople(); return; }
  if (a === 'gotoplayer') {
    ui.teamId = d.tid; ui.matchId = d.id; ui.view = 'game'; ui.gameView = 'stats'; render(); return;
  }
  if (a === 'sharesheet') { sheetShare(); return; }
  if (a === 'setwscode') { sheetWorkspace(); return; }
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
    } else {
      if (!tid) { toast('Pick a team first'); return; }
      const key = r === 'coach' ? 'coaches' : 'trackers';
      const on = ((teamAccess(tid)[key] || {})[uid]);
      if (on) drop(`access/teams/${tid}/${key}/${uid}`);
      else commit(`access/teams/${tid}/${key}/${uid}`, true);
    }
    syncIndex(uid);
    sheetPeople(); return;
  }
  if (a === 'republish') {
    if (!fb) { toast('Not connected — check the workspace code'); return; }
    fb.set(fb.ref(fb.db, 'public/' + t.share), publicDoc(t))
      .then(() => { pubState = { at: nowMs(), error: null }; sheetShare(); toast('Published'); })
      .catch(e => {
        pubState = { at: null, error: /permission|denied/i.test((e && e.code) || '') ? 'Firebase rejected it — the "public" rules block is missing or wrong' : String((e && e.code) || e) };
        sheetShare();
      });
    return;
  }
  if (a === 'makeshare') {
    commit(`teams/${t.id}/share`, 's' + uid() + uid());
    schedulePublish(); sheetShare(); return;
  }
  if (a === 'rotateshare') {
    if (!confirm('Anyone holding the old link loses access. Continue?')) return;
    const old = t.share;
    commit(`teams/${t.id}/share`, 's' + uid() + uid());
    if (fb && old) fb.remove(fb.ref(fb.db, 'public/' + old));
    schedulePublish(); sheetShare(); toast('New links made'); return;
  }
  if (a === 'copylink') {
    navigator.clipboard.writeText(d.v).then(() => toast('Link copied'), () => toast('Could not copy — select it by hand'));
    return;
  }
  if (a === 'setwho') { sheetWho(); return; }
  if (a === 'signinsheet') { sheetSignIn(); return; }
  if (a === 'signout') { authMod.signOut(fbAuth).then(() => { closeSheet(); toast('Signed out'); }); return; }
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
    authMod.sendSignInLinkToEmail(fbAuth, mail, { url: location.origin + location.pathname, handleCodeInApp: true })
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

  if (a === 'newteam') { closeSheet(); sheetTeam(null); return; }
  if (a === 'editteam') { sheetTeam(state.teams[d.id]); return; }
  if (a === 'pickteam') { ui.teamId = d.id; ui.matchId = null; closeSheet(); render(); return; }
  if (a === 'saveteam') {
    const name = $('#tName').value.trim(); if (!name) { toast('Give the team a name'); return; }
    if (d.id) { commit(`teams/${d.id}/name`, name); }
    else { const id = uid(); commit(`teams/${id}`, { id, name, players: {} }); ui.teamId = id; }
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
    if (isOut(m, d.pid)) { drop(`matches/${m.id}/out/${d.pid}`); }
    else { if (onField(m, d.pid)) takeOffField(m, d.pid); commit(`matches/${m.id}/out/${d.pid}`, true); }
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
      quiet(`matches/${m.id}/stints/${sid}`, { pid: d.pid, on, off });
    }
    saveLocal(); closeSheet(); render(); toast('Minutes updated'); return;
  }

  if (a === 'makeplan') {
    const roster = squad(t, m);
    if (!roster.length) { toast('Add players first'); return; }
    if (!m.planned || !Object.keys(m.planned).length) {
      const each = evenSplit(m, roster), pl = {};
      roster.forEach(p => pl[p.id] = p.gk ? matchMinutes(m) : each);
      quiet(`matches/${m.id}/planned`, pl);
    }
    commit(`matches/${m.id}/plan`, buildPlan(m, roster));
    sheetPlan(); return;
  }
  if (a === 'viewplan') { sheetPlan(); return; }
  if (a === 'applyblock') {
    const b = m.plan.blocks.find(x => String(x.start) === String(d.start)); if (!b) return;
    const cur = fieldIds(m);
    const goOff = cur.filter(id => !b.ids.includes(id));
    const goOn = b.ids.filter(id => !cur.includes(id));
    const n = Math.min(goOff.length, goOn.length);
    for (let i = 0; i < n; i++) swap(m, goOff[i], goOn[i]);
    for (let i = n; i < goOff.length; i++) takeOffField(m, goOff[i]);
    for (let i = n; i < goOn.length; i++) putOnField(m, goOn[i], 50, 25 + (i * 9) % 55);
    for (const [sid, pid] of Object.entries(b.assign || {})) {
      const sl = slotById(m, sid);
      if (sl && onField(m, pid)) quiet(`matches/${m.id}/positions/${pid}`, { x: sl.x, y: sl.y, slot: sid });
    }
    saveLocal(); render();
    closeSheet(); toast(n + (n === 1 ? ' sub made' : ' subs made')); return;
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
  if (a === 'backsetup') { ui.view = 'admin'; ui.editFid = null; render(); return; }
  if (a === 'savefname') {
    commit(`teams/${t.id}/formations/${ui.editFid}/name`, $('#fName').value.trim() || 'Shape');
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
    const f = t.formations[ui.editFid];
    commit(`teams/${t.id}/formations/${f.id}/slots`, [...(f.slots || []), { id: 's' + uid(), label: 'New', role: 'Mid', x: 50, y: 50 }]);
    return;
  }
  if (a === 'saveslot') {
    const f = t.formations[ui.editFid];
    const rEl = document.querySelector('[data-act="pickone"][data-grp="role"][aria-pressed="true"]');
    const label = $('#slLabel').value.trim() || 'Spot';
    commit(`teams/${t.id}/formations/${f.id}/slots`,
      (f.slots || []).map(x => x.id === d.sid ? { ...x, label, role: rEl ? rEl.dataset.v : x.role } : x));
    closeSheet(); return;
  }
  if (a === 'delslot') {
    const f = t.formations[ui.editFid];
    commit(`teams/${t.id}/formations/${f.id}/slots`, (f.slots || []).filter(x => x.id !== d.sid));
    closeSheet(); return;
  }
  if (a === 'closesheet') { closeSheet(); return; }
  if (a === 'toggleguard') {
    const p = t.players[d.pid];
    const on = ((p.guardians || {})[d.uid]);
    if (on) drop(`teams/${t.id}/players/${d.pid}/guardians/${d.uid}`);
    else commit(`teams/${t.id}/players/${d.pid}/guardians/${d.uid}`, true);
    syncIndex(d.uid);
    sheetPlayer(state.teams[t.id].players[d.pid]); return;
  }
  if (a === 'delplayer') {
    if (!confirm('Remove this player from the roster?')) return;
    drop(`teams/${t.id}/players/${d.pid}`); closeSheet(); return;
  }

  if (a === 'newmatch') { closeSheet(); sheetMatch(null); return; }
  if (a === 'editmatch') { sheetMatch(state.matches[d.id]); return; }
  if (a === 'backgames') { ui.view = 'matches'; ui.picked = null; render(); return; }
  if (a === 'openmatch') { ui.matchId = d.id; ui.view = 'game'; render(); return; }
  if (a === 'savematch') {
    const side = Number($('#mSide').value);
    const base = {
      opponent: $('#mOpp').value.trim(), date: $('#mDate').value,
      kickoff: $('#mKick').value || '', venue: $('#mVenue').value.trim(),
      periodCount: Number($('#mCount').value), periodMinutes: Number($('#mLen').value) || 40,
      onFieldCount: side, veoUrl: $('#mVeo').value.trim()
    };
    const pick = $('#mShape').value;
    if (pick !== 'keep') base.formation = resolveShape(t, pick, side);
    if (d.id) { commit(`matches/${d.id}`, { ...state.matches[d.id], ...base }); }
    else {
      const id = uid();
      commit(`matches/${id}`, { id, teamId: t.id, currentHalf: 1, periods: {}, planned: {}, positions: {}, stints: {}, createdAt: Date.now(), ...base });
      ui.matchId = id; ui.view = 'game'; ui.gameView = 'live';
    }
    closeSheet(); render(); return;
  }
  if (a === 'delmatch') {
    if (!confirm('Delete this game and its minutes?')) return;
    drop(`matches/${d.id}`); ui.matchId = null; closeSheet(); render(); return;
  }

  if (a === 'planall') { sheetPlanned(); return; }
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
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'minutes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click(); URL.revokeObjectURL(url); return;
  }
  if (a === 'import') {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d2 = JSON.parse(r.result);
          state = { teams: d2.teams || {}, matches: d2.matches || {} };
          saveLocal(); pushAll(); render(); toast('Backup loaded');
        } catch (err) { toast('That file could not be read'); }
      };
      r.readAsText(f);
    };
    inp.click(); return;
  }
});

$('#teamSwitch').addEventListener('click', sheetTeams);

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

/* ---------------- boot ---------------- */
loadLocal();
render();
initAuth();
initSync();
