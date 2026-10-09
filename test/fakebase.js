/* Firebase, in memory.

   The auth/sync races CLAUDE.md lists as "already found and fixed once" all
   live inside initAuth() and initSync(), and wireBase() is a closure inside
   initSync() with no way in from outside. None of it can be tested by calling
   a function. What it can be tested by is standing where Firebase stands:
   hand app.js these three modules in place of the gstatic ones and it wires
   itself up for real, against listeners a test can hold, delay and refuse.

   The point of every control below is timing. `signIn()` fires the auth
   callback when the test says so, not at load, so "the workspace read waited
   for auth" is a thing that can be observed rather than hoped for. */

function snap(value, key) {
  return { val: () => (value === undefined ? null : value), key, exists: () => value != null };
}

function makeFakebase() {
  const record = {
    initCalls: 0,        // initializeApp — must be 1 however many callers race
    configs: [],
    authSubscribers: 0,
    listeners: [],       // every read, in the order it was registered
    writes: [],          // { path, value }
    removes: [],         // path
    mails: [],           // { email, url } — sign-in links Firebase would have emailed
    tokens: [],          // getToken calls: { vapidKey, reg }
    tokenDrops: 0,       // deleteToken calls
    auth: []             // sign-in calls beyond the basics: { fn, ... }
  };
  let nextToken = 'fTok0000000000000000000001:APA91b-first';

  let authCb = null;
  let currentUser = null;
  const authObj = { _fake: true, currentUser: null };   // what getAuth hands the app, currentUser kept on it

  /* A one-shot read is spent once it has answered, exactly as onlyOnce:true
     behaves. Without this, wireBase's retry chain would leave several live
     listeners on the same path and one refusal would fire all of them. */
  const listenersFor = path => record.listeners.filter(l => l.path === path && !l.spent);
  const spend = l => { if (l.once) l.spent = true; };

  const modules = {
    app: {
      initializeApp(cfg) {
        record.initCalls++;
        record.configs.push(cfg);
        return { name: '[DEFAULT]', options: cfg };
      }
    },

    auth: {
      getAuth: app => { authObj.app = app; return authObj; },
      onAuthStateChanged(auth, cb) {
        record.authSubscribers++;
        authCb = cb;
        // deliberately NOT called here: a real one is async, and the whole
        // point of authReady is that the app must cope with the gap
        return () => { authCb = null; };
      },
      isSignInWithEmailLink: () => false,
      signInWithEmailLink: () => Promise.resolve({ user: currentUser }),
      sendSignInLinkToEmail: (auth, email, opts) => { record.mails.push({ email, url: opts && opts.url }); return Promise.resolve(); },
      signInWithEmailAndPassword: () => Promise.resolve({ user: currentUser }),
      createUserWithEmailAndPassword: () => Promise.resolve({ user: currentUser }),
      signOut: () => Promise.resolve(),
      updateProfile: () => Promise.resolve(),
      updateProfile: (u, p) => { record.auth.push({ fn: 'updateProfile', p }); if (currentUser && p.displayName) currentUser.displayName = p.displayName; return Promise.resolve(); },
      sendPasswordResetEmail: (auth, email) => { record.auth.push({ fn: 'reset', email }); return Promise.resolve(); },
      /* Other companies' accounts. `popupFail` makes the next popup fail the
         way Firebase would (blocked, or an email that already has an account),
         and the credential it carries is what linking is then handed. */
      GoogleAuthProvider: Object.assign(function () { this.providerId = 'google.com'; }, { credentialFromError: e => (e && e._cred) || null }),
      OAuthProvider: Object.assign(function (id) { this.providerId = id; this.scopes = []; this.params = {}; this.addScope = s => this.scopes.push(s); this.setCustomParameters = x => { this.params = x; }; }, { credentialFromError: e => (e && e._cred) || null }),
      signInWithPopup(auth, p) {
        record.auth.push({ fn: 'popup', provider: p.providerId, scopes: p.scopes, params: p.params });
        const f = record.popupFail; record.popupFail = null;
        return f ? Promise.reject(f) : Promise.resolve({ user: currentUser });
      },
      signInWithRedirect(auth, p) { record.auth.push({ fn: 'redirect', provider: p.providerId }); return Promise.resolve(); },
      getRedirectResult: () => (record.redirectFail ? Promise.reject(record.redirectFail) : Promise.resolve(null)),
      linkWithPopup(u, p) {
        record.auth.push({ fn: 'linkPopup', provider: p.providerId, uid: u.uid });
        const f = record.popupFail; record.popupFail = null;
        if (f) return Promise.reject(f);
        u.providerData.push({ providerId: p.providerId });
        return Promise.resolve({ user: u });
      },
      linkWithCredential(u, cred) {
        record.auth.push({ fn: 'link', cred, uid: u.uid });
        u.providerData.push({ providerId: cred.providerId });
        return Promise.resolve({ user: u });
      }
    },

    /* Cloud Messaging on the page: a token per browser until it is deleted,
       which is what makes the next one different. */
    messaging: {
      getMessaging: app => ({ app, _fake: true }),
      isSupported: () => Promise.resolve(true),
      getToken(m, opts) {
        record.tokens.push({ vapidKey: opts && opts.vapidKey, reg: opts && opts.serviceWorkerRegistration });
        if (record.tokenFail) return Promise.reject(record.tokenFail);
        return Promise.resolve(nextToken);
      },
      deleteToken() { record.tokenDrops++; nextToken = nextToken.replace(/\d+:/, n => String(Number(n.slice(0, -1)) + 1).padStart(n.length - 1, '0') + ':'); return Promise.resolve(true); }
    },

    database: {
      getDatabase: app => ({ app, _fake: true }),
      ref: (db, path) => ({ db, path, key: String(path).split('/').pop() }),
      set(ref, value) {
        /* No signal: the write is taken and never answered, which is all a
           phone that loses the page before reconnecting ever sees. */
        if (record.hold && record.hold(ref.path, value)) { (record.held = record.held || []).push({ path: ref.path, value }); return new Promise(() => { }); }
        if (record.refuse && record.refuse(ref.path, value))
          return Promise.reject({ code: 'PERMISSION_DENIED', message: 'permission_denied at ' + ref.path });
        record.writes.push({ path: ref.path, value });
        return Promise.resolve();
      },
      remove(ref) {
        if (record.hold && record.hold(ref.path, null)) { (record.held = record.held || []).push({ path: ref.path, value: null }); return new Promise(() => { }); }
        if (record.refuse && record.refuse(ref.path, null))
          return Promise.reject({ code: 'PERMISSION_DENIED', message: 'permission_denied at ' + ref.path });
        record.removes.push(ref.path); return Promise.resolve();
      },
      onValue(ref, cb, err, opts) {
        record.listeners.push({ kind: 'value', path: ref.path, cb, err, once: !!(opts && opts.onlyOnce) });
        return () => { };
      },
      onChildAdded(ref, cb) { record.listeners.push({ kind: 'added', path: ref.path, cb }); return () => { }; },
      onChildChanged(ref, cb) { record.listeners.push({ kind: 'changed', path: ref.path, cb }); return () => { }; },
      onChildRemoved(ref, cb) { record.listeners.push({ kind: 'removed', path: ref.path, cb }); return () => { }; }
    }
  };

  return {
    modules,
    record,

    /* ---- what the app has asked to read ---- */
    readPaths: () => record.listeners.map(l => l.path),
    watching: path => listenersFor(path).length > 0,
    /* live listeners on a path */
    countReads: path => listenersFor(path).length,
    /* every read ever registered on it, spent one-shots included — this is what
       says whether the app went back for a second look */
    totalReads: path => record.listeners.filter(l => l.path === path).length,
    writtenTo: path => record.writes.filter(w => w.path === path),

    /* ---- Cloud Messaging ---- */
    get token() { return nextToken; },
    /* the browser hands out a different token from now on, as a real one does now and then */
    rotateToken(t) { nextToken = t; return this; },

    /* ---- auth, on the test's schedule ---- */
    signIn(uid, extra = {}) {
      currentUser = {
        uid,
        displayName: extra.name === undefined ? uid : extra.name,   // '' is an account with no name (Apple's, after the first time)
        email: extra.email || uid + '@x.test',
        photoURL: extra.photo || '',
        emailVerified: extra.verified !== false,
        providerData: (extra.providers || ['password']).map(providerId => ({ providerId }))
      };
      authObj.currentUser = currentUser;
      if (authCb) authCb(currentUser);
      return this;
    },
    signOut() { currentUser = null; authObj.currentUser = null; if (authCb) authCb(null); return this; },
    authFired: () => !!authCb,

    /* ---- data, on the test's schedule ---- */
    deliver(path, value, kind = 'value') {
      const hit = listenersFor(path).filter(l => l.kind === kind);
      for (const l of hit) { spend(l); l.cb(snap(value, l.path.split('/').pop())); }
      return hit.length;
    },
    deliverChild(path, key, value, kind = 'added') {
      const hit = listenersFor(path).filter(l => l.kind === kind);
      for (const l of hit) l.cb(snap(value, key));
      return hit.length;
    },
    /* A club on orgs/ is read a part at a time (app.js, wireOrgs()), each
       part asked for only once the parts before it have answered. This
       answers every read under `prefix` from `tree` (the club, in the new
       layout), round after round as new reads appear, refusing any `deny`
       picks the way a rule would. `flush` lets the app take each answer in. */
    async serve(prefix, tree, flush, deny = () => false, rounds = 8) {
      const done = new Set();
      for (let i = 0; i < rounds; i++) {
        const todo = record.listeners.filter(l => !l.spent && l.kind === 'value' && (l.path === prefix || l.path.startsWith(prefix + '/')) && !done.has(l));
        if (!todo.length) break;
        for (const l of todo) {
          done.add(l);
          if (deny(l.path)) { if (l.err) { spend(l); l.err({ code: 'PERMISSION_DENIED', message: 'permission_denied at ' + l.path }); } continue; }
          let cur = tree;
          for (const k of l.path.slice(prefix.length).split('/').filter(Boolean)) cur = cur && typeof cur === 'object' ? cur[k] : undefined;
          spend(l); l.cb(snap(cur === undefined ? null : JSON.parse(JSON.stringify(cur)), l.path.split('/').pop()));
        }
        await flush();
      }
    },
    /* Refuse every write whose path the predicate picks, the way a rule would. */
    refuseWrites(pred) { record.refuse = pred; return this; },
    /* Take every write the predicate picks and never answer it: no signal. */
    holdWrites(pred) { record.hold = pred; return this; },
    /* A rules refusal. The code is what app.js pattern-matches on. */
    refuse(path, code = 'PERMISSION_DENIED') {
      const hit = listenersFor(path).filter(l => l.err);
      for (const l of hit) { spend(l); l.err({ code, message: 'permission_denied at ' + path }); }
      return hit.length;
    }
  };
}

/* ---------------- the server's side ---------------- */

/* The functions in functions/ run with admin credentials against a database
   tree and Cloud Messaging. This is both, in memory: a tree the test seeds and
   reads back, and a messenger that records every send and answers each token
   the way the test says (a dead phone, a passing failure).

   `loadFunctions()` requires functions/index.js with firebase-functions and
   firebase-admin swapped for fakes, so what is under test is the deployed
   file, its trigger paths included, not a copy of its wiring. `fire()` hands
   a trigger a write the way Cloud Functions would: the path's {params}, and a
   snapshot whose ref reaches back to this tree. */
/* The server suites run twice: as written, against clubs on workspaces/{code},
   and once more (SERVER_TREE=orgs, test/run.js's *-orgs entries) with every
   club in the seed moved to orgs/{code} the way moveClub lays it out (AUTH.md,
   *The move to `orgs/{orgId}`*). The suites keep saying what they always said
   in the old tree's paths: in orgs mode this server keeps its clubs in the new
   layout, and every path a test hands it (a write, a read back, a ref) is the
   old tree's view of that club, translated on the way in and out. The
   functions themselves see the real new layout and real paths, so each
   expectation the server was held to on the old tree holds on the new one.
   Trigger names come back without their Orgs ending, so "this woke
   accessGuardians" means the same thing in both passes. */
const ORGS_MODE = process.env.SERVER_TREE === 'orgs';
// a club as the old tree held it -> the new layout (no derived parts: the functions make those)
function clubToOrgs(w, keep = {}) {
  if (!w || typeof w !== 'object') return w;
  const { members, org, log, ...access } = w.access || {};
  const teams = {}, squad = {}, coachNotes = {};
  for (const [tid, t] of Object.entries(w.teams || {})) {
    if (!t || typeof t !== 'object') { teams[tid] = t; continue; }
    const { players, ...rest } = t;
    teams[tid] = rest;
    if (!players) continue;
    // the coach's notes beside each record, as moveClub lays them out (SECURITY.md, SEC-12)
    squad[tid] = {};
    for (const [pid, p] of Object.entries(players)) {
      if (!p || typeof p !== 'object') { squad[tid][pid] = p; continue; }
      const rec = {}, notes = {};
      for (const [k, v] of Object.entries(p)) (['note', 'rating', 'pairs', 'avoid'].includes(k) ? notes : rec)[k] = v;
      squad[tid][pid] = rec;
      if (Object.keys(notes).length) (coachNotes[tid] = coachNotes[tid] || {})[pid] = notes;
    }
  }
  const out = { ...w, access: Object.keys(access).length ? access : undefined, org, members, log, teams, squad, coachNotes, names: keep.names, roster: keep.roster };
  for (const k of Object.keys(out)) if (out[k] === undefined || (out[k] && typeof out[k] === 'object' && !Object.keys(out[k]).length)) delete out[k];
  return Object.keys(out).length ? out : undefined;
}
// and back: what the old tree would hold
function clubFromOrgs(o) {
  if (!o || typeof o !== 'object') return o;
  const { access, org, members, log, teams, squad, coachNotes, names, roster, ...rest } = o;
  const acc = { ...(access || {}) };
  if (org !== undefined) acc.org = org;
  if (members !== undefined) acc.members = members;
  if (log !== undefined) acc.log = log;
  const ts = {};
  const withNotes = (tid, ps) => Object.fromEntries(Object.entries(ps || {}).map(([pid, p]) => [pid, p && typeof p === 'object' ? { ...p, ...(((coachNotes || {})[tid] || {})[pid] || {}) } : p]));
  for (const [tid, t] of Object.entries(teams || {})) ts[tid] = squad && squad[tid] ? { ...(t || {}), players: withNotes(tid, squad[tid]) } : t;
  for (const [tid, ps] of Object.entries(squad || {})) if (!ts[tid]) ts[tid] = { players: withNotes(tid, ps) };
  const out = { ...rest };
  if (Object.keys(acc).length) out.access = acc;
  if (Object.keys(ts).length) out.teams = ts;
  return out;
}
// one path of the old tree -> where it lives on the new one
function toOrgsPath(p) {
  const m = /^\/?workspaces\/([^/]+)(?:\/(.*))?$/.exec(String(p || ''));
  if (!m) return p;
  const rest = (m[2] || '')
    .replace(/^teams\/([^/]+)\/players(?=\/|$)/, 'squad/$1')
    .replace(/^access\/(members|org|log)(?=\/|$)/, '$1');
  return 'orgs/' + m[1] + (rest ? '/' + rest : '');
}
function fromOrgsPath(p) {
  const m = /^orgs\/([^/]+)(?:\/(.*))?$/.exec(String(p || ''));
  if (!m) return p;
  const rest = (m[2] || '')
    .replace(/^squad\/([^/]+)(?=\/|$)/, 'teams/$1/players')
    .replace(/^(members|org|log)(?=\/|$)/, 'access/$1');
  return 'workspaces/' + m[1] + (rest ? '/' + rest : '');
}

function makeServer(seed = {}) {
  const tree = JSON.parse(JSON.stringify(seed));
  if (ORGS_MODE && tree.workspaces) {
    tree.orgs = tree.orgs || {};
    for (const [code, w] of Object.entries(tree.workspaces)) {
      if (!w || typeof w !== 'object' || w.moved) continue;
      const o = clubToOrgs(w);
      if (o) tree.orgs[code] = o;
      delete tree.workspaces[code];
    }
    if (!Object.keys(tree.workspaces).length) delete tree.workspaces;
  }
  const segs = p => String(p || '').split('/').filter(Boolean);
  const at = p => { let cur = tree; for (const k of segs(p)) { if (!cur || typeof cur !== 'object') return undefined; cur = cur[k]; } return cur; };
  /* The admin library refuses a write with `undefined` anywhere in it (the
     move once failed on a club with nothing logged that way); so does this. */
  const noUndefined = (v, at) => {
    if (v === undefined) throw new Error('first argument contains undefined in property \'' + at + '\'');
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) noUndefined(x, at + '.' + k);
  };
  const put = (p, v) => {
    if (v !== undefined && v !== null) noUndefined(v, p);
    const ks = segs(p); let cur = tree;
    for (const k of ks.slice(0, -1)) { if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; }
    if (v === null || v === undefined) delete cur[ks[ks.length - 1]];
    else cur[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const reads = [], removes = [], sends = [];
  let down = false;
  let answer = () => ({ success: true });
  const shown = p => (ORGS_MODE ? fromOrgsPath(p) : p);
  const ref = p => (ORGS_MODE && /^\/?workspaces\//.test(String(p || '')) ? realRef(toOrgsPath(p)) : realRef(p));
  const realRef = p => ({
    path: segs(p).join('/'),
    get root() { return ref(''); },
    child: c => ref(segs(p).concat(segs(c)).join('/')),
    get: () => { reads.push(shown(segs(p).join('/'))); if (down) return Promise.reject(new Error('unavailable')); return Promise.resolve({ val: () => clone(at(p)), exists: () => at(p) != null }); },
    // a query on one child's value, as the admin library runs orderByChild(k).equalTo(v)
    orderByChild: k => ({ equalTo: v => ({ get: () => {
      reads.push(shown(segs(p).join('/')) + '?' + k + '=' + v);
      if (down) return Promise.reject(new Error('unavailable'));
      const all = at(p), out = {};
      for (const [id, x] of Object.entries(all && typeof all === 'object' ? all : {})) if (x && typeof x === 'object' && x[k] === v) out[id] = x;
      return Promise.resolve({ val: () => (Object.keys(out).length ? clone(out) : null) });
    } }) }),
    remove: () => { removes.push(shown(segs(p).join('/'))); put(p, null); return Promise.resolve(); },
    set: v => limited([p], () => put(p, v)),
    // a multi-path update: each key a path under this one, null deleting it
    update: o => {
      const ps = Object.keys(o || {}).map(k => segs(p).concat(segs(k)).join('/'));
      return limited(ps, () => { for (const [k, v] of Object.entries(o || {})) put(segs(p).concat(segs(k)).join('/'), v); });
    },
    /* One at a time, as the database runs them: `fn` sees what is there and
       returns what to write, or undefined to leave it. */
    transaction: fn => {
      const cur = clone(at(p));
      const next = fn(cur);
      if (next === undefined) return Promise.resolve({ committed: false, snapshot: { val: () => cur } });
      put(p, next);
      return Promise.resolve({ committed: true, snapshot: { val: () => clone(next) } });
    }
  });
  const messaging = {
    sendEach(messages) {
      if (messages.length > 500) return Promise.reject(new Error('messaging/invalid-argument: more than 500 messages'));
      sends.push(messages.map(m => JSON.parse(JSON.stringify(m))));
      return Promise.resolve({ responses: messages.map(m => answer(m.token, m)) });
    }
  };
  const triggers = {};
  /* Every trigger a write wakes: for each written path, every concrete path
     of each trigger's shape it could have touched, kept where what is there
     changed (a create trigger only where nothing was). */
  function wakes(before, written) {
    const atIn = (t, q) => { let cur = t; for (const k of segs(q)) { if (!cur || typeof cur !== 'object') return undefined; cur = cur[k]; } return cur; };
    const out = [], seen = new Set();
    for (const ws of written) for (const [name, t] of Object.entries(triggers)) {
      if (t.kind !== 'created' && t.kind !== 'written') continue;   // https and schedule wake on nothing written
      const ps = segs(t.path);
      let cands = [{ prm: {}, path: [] }];
      for (let i = 0; i < ps.length; i++) {
        const m = /^\{(\w+)\}$/.exec(ps[i]);
        const next = [];
        for (const c of cands) {
          if (i < ws.length) {
            if (m) next.push({ prm: { ...c.prm, [m[1]]: ws[i] }, path: c.path.concat(ws[i]) });
            else if (ps[i] === ws[i]) next.push({ prm: c.prm, path: c.path.concat(ws[i]) });
          } else if (m) {
            const ks = new Set([...Object.keys(Object(atIn(before, c.path.join('/')) || {})), ...Object.keys(Object(atIn(tree, c.path.join('/')) || {}))]);
            for (const k of ks) next.push({ prm: { ...c.prm, [m[1]]: k }, path: c.path.concat(k) });
          } else next.push({ prm: c.prm, path: c.path.concat(ps[i]) });
        }
        cands = next;
      }
      for (const c of cands) {
        const q = c.path.join('/');
        if (seen.has(name + ' ' + q)) continue;
        const was = clone(atIn(before, q)), now = clone(atIn(tree, q));
        if (JSON.stringify(was) === JSON.stringify(now)) continue;
        if (t.kind === 'created' && (was !== null || now === null)) continue;
        seen.add(name + ' ' + q);
        out.push({ name, t, prm: c.prm, q, was, now });
      }
    }
    return out;
  }
  /* The database refuses a write that would wake more than a thousand runs
     (TOO_MANY_TRIGGERS), whole: nothing of it is kept. The functions' own
     writes are held to it here, as they are in production, once the
     functions are loaded. */
  const TRIGGER_LIMIT = 1000;
  function limited(paths, apply) {
    const before = JSON.parse(JSON.stringify(tree));
    apply();
    if (!Object.keys(triggers).length) return Promise.resolve();
    const n = wakes(before, paths.map(segs)).length;
    if (n <= TRIGGER_LIMIT) return Promise.resolve();
    for (const k of Object.keys(tree)) delete tree[k];
    Object.assign(tree, before);
    return Promise.reject(new Error('TOO_MANY_TRIGGERS: This request would cause too many functions to be triggered.'));
  }

  /* The modules functions/index.js requires, by name. */
  const modules = {
    'firebase-functions/v2/database': {
      onValueCreated(path, handler) {
        const t = { kind: 'created', path: String(path).replace(/^\//, ''), handler };
        return t;
      },
      onValueWritten(path, handler) {
        return { kind: 'written', path: String(path).replace(/^\//, ''), handler };
      }
    },
    'firebase-functions/v2/scheduler': {
      onSchedule(opts, handler) { return { kind: 'schedule', opts, handler }; }
    },
    'firebase-functions/v2/https': {
      onRequest(opts, handler) {
        if (typeof opts === 'function') { handler = opts; opts = {}; }
        return { kind: 'https', opts, handler };
      }
    },
    'firebase-admin/app': { initializeApp: () => ({ name: '[DEFAULT]' }) },
    'firebase-admin/messaging': { getMessaging: () => messaging },
    'firebase-admin/database': { getDatabase: () => ({ ref }) }
  };

  function loadFunctions(file = require('path').join(__dirname, '..', 'functions', 'index.js')) {
    const Module = require('module');
    const real = Module._load;
    Module._load = function (req, parent, isMain) {
      if (Object.prototype.hasOwnProperty.call(modules, req)) return modules[req];
      if (/^firebase-(admin|functions)/.test(req)) throw new Error('functions/ asked for ' + req + ', which the rig does not fake');
      return real.apply(this, arguments);
    };
    try {
      delete require.cache[require.resolve(file)];
      const exp = require(file);
      for (const [name, t] of Object.entries(exp)) triggers[name] = t;
      return exp;
    } finally { Module._load = real; }
  }

  /* Match a concrete path against a trigger's pattern, {name} for a segment. */
  function params(pattern, p) {
    const a = segs(pattern), b = segs(p);
    if (a.length !== b.length) return null;
    const out = {};
    for (let i = 0; i < a.length; i++) {
      const m = /^\{(\w+)\}$/.exec(a[i]);
      if (m) out[m[1]] = b[i]; else if (a[i] !== b[i]) return null;
    }
    return out;
  }

  /* What the tests see: in orgs mode, every club as the old tree would hold it. */
  const view = () => {
    if (!ORGS_MODE) return tree;
    const v = JSON.parse(JSON.stringify(tree));
    for (const [code, o] of Object.entries(v.orgs || {})) { (v.workspaces = v.workspaces || {})[code] = clubFromOrgs(o); }
    delete v.orgs;
    return v;
  };
  const viewAt = p => { let cur = view(); for (const k of segs(p)) { if (!cur || typeof cur !== 'object') return undefined; cur = cur[k]; } return cur; };
  /* A write in the old tree's terms. In orgs mode the club it lands in is read
     back the old way, written to, and laid out again, keeping what only the
     new tree has (names, roster) for the functions to bring into line; the
     path triggers are matched from is the club's whole new tree. */
  const write = (p, v) => {
    const m = ORGS_MODE && /^\/?workspaces\/([^/]+)(?:\/(.*))?$/.exec(String(p || ''));
    if (!m) { put(p, v); return p; }
    const code = m[1], old = (tree.orgs || {})[code];
    const club = clubFromOrgs(old) || {};
    const holder = { c: club };
    const ks = segs(m[2] || '');
    if (!ks.length) holder.c = v === null || v === undefined ? {} : JSON.parse(JSON.stringify(v));
    else {
      let cur = holder.c;
      for (const k of ks.slice(0, -1)) { if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; }
      if (v === null || v === undefined) delete cur[ks[ks.length - 1]]; else cur[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
    }
    const next = clubToOrgs(holder.c, old || {});
    tree.orgs = tree.orgs || {};
    if (next) tree.orgs[code] = next; else delete tree.orgs[code];
    return 'orgs/' + code;
  };
  const plain = n => (ORGS_MODE ? String(n).replace(/Orgs$/, '') : n);
  /* The triggers only the new tree has (the roster and staff names, keeping
     what families read in step) are left out of what fire() and woken()
     report: the suites written for the old tree ask which of *their*
     triggers woke. They still run; test/access.js checks them by name. */
  const ORGS_ONLY = new Set(['rosterPlayer', 'rosterOpen', 'namesMember', 'moveClub', 'accessViewer']);
  const reported = n => !(ORGS_MODE && ORGS_ONLY.has(n));

  return {
    get tree() { return view(); },
    reads, removes, sends, triggers, loadFunctions, ref, at: p => clone(ORGS_MODE ? viewAt(p) : at(p)),
    put: (p, v) => { write(p, v); },
    /* every message handed to Cloud Messaging, flattened */
    sent: () => sends.flat(),
    /* the database refusing every read, the way an outage looks from here */
    down(v = true) { down = v; return this; },
    /* how Cloud Messaging answers each token: return { success } or { success: false, error: { code } } */
    answer(fn) { answer = fn; return this; },
    /* A write at `p`, of any depth, as the database would take it: written to
       the tree, then every trigger whose own path changed runs, the way Cloud
       Functions would. A trigger on a deeper path than the write wakes if the
       write changed what is there (a whole game saved with a new date wakes
       the date's trigger, and nothing else's); one on a shallower path wakes
       for any change beneath it. A create trigger wakes only where nothing was.
       Resolves to what each returned, by name (an array if it ran twice). */
    async fire(p, value) {
      const before = JSON.parse(JSON.stringify(tree));
      const out = {};
      const ws = segs(write(p, value));
      for (const w of wakes(before, [ws])) {
        const { name, t, prm, q, was, now } = w;
        const data = t.kind === 'created'
          ? { val: () => now, ref: ref(q) }
          : { before: { val: () => was, ref: ref(q) }, after: { val: () => now, ref: ref(q) } };
        const r = await t.handler({ params: prm, data });
        const n = plain(name);
        if (reported(n)) out[n] = n in out ? [].concat(out[n], r) : r;
      }
      return out;
    },
    /* How many function runs one write would wake, as the database counts
       them for TOO_MANY_TRIGGERS. */
    wakeCount(before, paths) { return wakes(before, paths.map(segs)).length; },
    /* An HTTPS function asked for `path` (what Express calls req.path), the
       way a calendar app would ask. Resolves to { status, headers, body }. */
    async request(name, path, method = 'GET') {
      const t = triggers[name];
      if (!t || t.kind !== 'https') throw new Error(name + ' is not an HTTPS function');
      const res = { status: 0, headers: {}, body: undefined };
      const r = {
        status(n) { res.status = n; return r; },
        set(h) { Object.assign(res.headers, h); return r; },
        send(b) { res.body = b; return r; }
      };
      await t.handler({ method, path }, r);
      return res;
    },
    /* A scheduled function's run, as Cloud Scheduler would start it. */
    async tick(name) {
      const t = triggers[name];
      if (!t || t.kind !== 'schedule') throw new Error(name + ' is not a scheduled function');
      return t.handler({ scheduleTime: new Date().toISOString() });
    },
    /* which triggers would wake for a write at `p` */
    woken: p => Object.entries(triggers).filter(([, t]) => (t.kind === 'created' || t.kind === 'written') && params(t.path, ORGS_MODE ? toOrgsPath(p) : p)).map(([n]) => plain(n)).filter(reported),
    /* which triggers actually run for a write, without keeping it */
    async wouldWake(p, value) {
      const keep = JSON.stringify(tree), sent = sends.length, rm = removes.length;
      const ran = Object.keys(await this.fire(p, value));
      for (const k of Object.keys(tree)) delete tree[k];
      Object.assign(tree, JSON.parse(keep));
      sends.length = sent; removes.length = rm;
      return ran;
    }
  };
}

module.exports = { makeFakebase, makeServer, snap, ORGS_MODE, toOrgsPath, fromOrgsPath, clubToOrgs, clubFromOrgs };
