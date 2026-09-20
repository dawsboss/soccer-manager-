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
    removes: []          // path
  };

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
      sendSignInLinkToEmail: () => Promise.resolve(),
      signInWithEmailAndPassword: () => Promise.resolve({ user: currentUser }),
      createUserWithEmailAndPassword: () => Promise.resolve({ user: currentUser }),
      signOut: () => Promise.resolve(),
      updateProfile: () => Promise.resolve(),
      GoogleAuthProvider: function () { },
      signInWithPopup: () => Promise.resolve({ user: currentUser })
    },

    database: {
      getDatabase: app => ({ app, _fake: true }),
      ref: (db, path) => ({ db, path, key: String(path).split('/').pop() }),
      set(ref, value) { record.writes.push({ path: ref.path, value }); return Promise.resolve(); },
      remove(ref) { record.removes.push(ref.path); return Promise.resolve(); },
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
    /* A rules refusal. The code is what app.js pattern-matches on. */
    refuse(path, code = 'PERMISSION_DENIED') {
      const hit = listenersFor(path).filter(l => l.err);
      for (const l of hit) { spend(l); l.err({ code, message: 'permission_denied at ' + path }); }
      return hit.length;
    }
  };
}

module.exports = { makeFakebase, snap };
