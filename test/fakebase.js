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
    tokenDrops: 0        // deleteToken calls
  };
  let nextToken = 'fTok0000000000000000000001:APA91b-first';

  let authCb = null;
  let currentUser = null;

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
      getAuth: app => ({ app, _fake: true }),
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
      GoogleAuthProvider: function () { },
      signInWithPopup: () => Promise.resolve({ user: currentUser })
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
        displayName: extra.name || uid,
        email: extra.email || uid + '@x.test',
        photoURL: extra.photo || ''
      };
      if (authCb) authCb(currentUser);
      return this;
    },
    signOut() { currentUser = null; if (authCb) authCb(null); return this; },
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
function makeServer(seed = {}) {
  const tree = JSON.parse(JSON.stringify(seed));
  const segs = p => String(p || '').split('/').filter(Boolean);
  const at = p => { let cur = tree; for (const k of segs(p)) { if (!cur || typeof cur !== 'object') return undefined; cur = cur[k]; } return cur; };
  const put = (p, v) => {
    const ks = segs(p); let cur = tree;
    for (const k of ks.slice(0, -1)) { if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; }
    if (v === null || v === undefined) delete cur[ks[ks.length - 1]];
    else cur[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const reads = [], removes = [], sends = [];
  let answer = () => ({ success: true });
  const ref = p => ({
    path: segs(p).join('/'),
    get root() { return ref(''); },
    child: c => ref(segs(p).concat(segs(c)).join('/')),
    get: () => { reads.push(segs(p).join('/')); return Promise.resolve({ val: () => clone(at(p)), exists: () => at(p) != null }); },
    remove: () => { removes.push(segs(p).join('/')); put(p, null); return Promise.resolve(); },
    set: v => { put(p, v); return Promise.resolve(); }
  });
  const messaging = {
    sendEach(messages) {
      if (messages.length > 500) return Promise.reject(new Error('messaging/invalid-argument: more than 500 messages'));
      sends.push(messages.map(m => JSON.parse(JSON.stringify(m))));
      return Promise.resolve({ responses: messages.map(m => answer(m.token, m)) });
    }
  };
  const triggers = {};

  /* The modules functions/index.js requires, by name. */
  const modules = {
    'firebase-functions/v2/database': {
      onValueCreated(path, handler) {
        const t = { kind: 'created', path: String(path).replace(/^\//, ''), handler };
        return t;
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

  return {
    tree, reads, removes, sends, triggers, loadFunctions, ref, at: p => clone(at(p)), put,
    /* every message handed to Cloud Messaging, flattened */
    sent: () => sends.flat(),
    /* how Cloud Messaging answers each token: return { success } or { success: false, error: { code } } */
    answer(fn) { answer = fn; return this; },
    /* A create at `p`: written to the tree, then every trigger whose pattern
       matches runs, as Cloud Functions would. Resolves to what each returned. */
    async fire(p, value) {
      put(p, value);
      const out = {};
      for (const [name, t] of Object.entries(triggers)) {
        const prm = t.kind === 'created' && params(t.path, p);
        if (!prm) continue;
        out[name] = await t.handler({ params: prm, data: { val: () => clone(at(p)), ref: ref(p) } });
      }
      return out;
    },
    /* which triggers would wake for a write at `p` */
    woken: p => Object.entries(triggers).filter(([, t]) => params(t.path, p)).map(([n]) => n)
  };
}

module.exports = { makeFakebase, makeServer, snap };
