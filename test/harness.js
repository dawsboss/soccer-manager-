/* The shared rig every test file boots the app on.

   Three copies of the same stubbed DOM had grown up across smoke.js, sandbox.js
   and the three slice tests, which meant a fix to one of them fixed one test.
   This is that rig, once.

   It also does two things the older copies could not, and both exist to reach
   code that is otherwise untestable rather than to be tidy:

   - `captureClick()` keeps the handler app.js registers on `document` instead
     of dropping it on the floor. Roughly a hundred and twenty actions — repair,
     retire, export, import — are inline branches inside that one listener and
     have no other door.
   - `loadApp({ firebase })` swaps the three gstatic `import()` calls for fake
     modules, so getApp(), initAuth(), initSync() and the wireBase() closure run
     for real. wireBase is defined inside initSync and cannot be reached any
     other way; the auth/sync races CLAUDE.md says were fixed once all live in
     there.

   Assertions are sandbox.js's `check` verbatim, because its output format is
   already what these tests print. */

const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, '..', 'app.js');

/* ---------------- a DOM that remembers ---------------- */

/* Every unknown property reads as undefined rather than throwing, so render()
   can touch whatever it likes on a node this stub never thought about. */
const mk = () => new Proxy({
  dataset: {}, style: {}, value: '', textContent: '', innerHTML: '', hidden: false,
  classList: { add() { }, remove() { } },
  addEventListener() { }, removeEventListener() { }, setAttribute() { }, getAttribute() { return null },
  setPointerCapture() { }, click() { }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 400 }),
  querySelector: () => mk(), querySelectorAll: () => [], closest: () => null, appendChild() { }
}, { get(t, k) { return k in t ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });

/* One node per selector, so what render() writes into #app can be read back. */
function makeDom() {
  const nodes = {};
  const listeners = {};
  const node = sel => (nodes[sel] = nodes[sel] || mk());
  const document = {
    querySelector: sel => node(sel),
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    createElement: () => mk(),
    body: mk()
  };
  return { document, nodes, listeners, node, rendered: (sel = '#app') => String(node(sel).innerHTML || '') };
}

/* ---------------- localStorage ---------------- */

/* length/key as well as get/set: knownClubs() walks the whole store to find
   which clubs this device holds, and silently finds none without them. */
function makeStorage(seed = {}) {
  return {
    _d: { ...seed },
    getItem(k) { return this._d[k] ?? null },
    setItem(k, v) { this._d[k] = String(v) },
    removeItem(k) { delete this._d[k] },
    clear() { this._d = {}; },
    get length() { return Object.keys(this._d).length },
    key(i) { return Object.keys(this._d)[i] ?? null }
  };
}

/* ---------------- a clock the test drives ---------------- */

/* elapsedSec() and playedSec() take `now`, but absAt(), secFromAbs() and
   halfOfSec() call nowMs() internally with no way to pass one in. Freezing
   Date.now is the only way to test those, and it is also what makes "the
   clock is frozen once the period closes" an assertion rather than a race. */
const clock = {
  t: Date.UTC(2026, 8, 12, 10, 0, 0),
  real: Date.now,
  install() { const c = this; Date.now = () => c.t; return this; },
  restore() { Date.now = this.real; return this; },
  set(ms) { this.t = ms; return this; },
  advance(ms) { this.t += ms; return this; }
};

/* Deterministic Math.random, so uid() produces the same ids on every run and a
   failure can actually be reproduced. */
function seedRandom(seed = 1) {
  let s = seed >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ---------------- timers the test can step ---------------- */

/* Not a black hole: schedulePublish debounces by 1200ms and wireBase retries a
   denied read with backoff. Recording them lets a test run those paths on
   purpose instead of never. */
function makeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    pending,
    setTimeout(fn, ms) { const id = next++; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    setInterval() { return 0; },
    /* Run everything queued, including anything queued while running. */
    run() {
      let n = 0;
      for (let pass = 0; pass < 10 && pending.size; pass++) {
        const due = [...pending.entries()];
        pending.clear();
        for (const [, t] of due) { t.fn(); n++; }
      }
      return n;
    }
  };
}

/* Let the app's async boot get as far as it is going to. */
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

/* ---------------- loading app.js ---------------- */

/* app.js is a browser module: no exports, no IIFE, every name module-scoped.
   sandbox.js established the way in — append a shim that hands the internals
   out. `state` and `ui` are `let` and get reassigned (loadLocal, wireBase,
   purgeClub), so they have to go through accessors or a test ends up holding a
   stale object. */
const EXPORTS = `{
  /* utils */
  uid, esc, clamp, mmss, mins, setDeep, delDeep, parseTime, migrate,
  /* storage + environment */
  dataKey, clubKey, envPrefix, envName, wsCode, fbConfig, isSandbox,
  loadLocal, saveLocal, purgeClub, markSynced, noteDenied, knownClubs,
  stampOf, stampKey, stampLabel, trackersIn, typedName, stampedBy,
  /* sync */
  getApp, initAuth, initSync, mergeNode, IDENTITY, pushAll, remoteSet, remoteDel,
  quiet, commit, drop, nowMs,
  /* roles */
  acc, members, anyAdmins, isAdmin, isCoach, isTracker, isGuardian, roleIn,
  isOwner, canAdmin, approved, hasAnyRole, syncIndex, myTeams, myPlayers,
  guardsAnyone, canEditTeam, readOnlyHere, myRole, restricted, auditLog,
  gated, needsSignIn, cacheMe, cachedMe,
  /* model helpers */
  teams, team, players, teamMatches, match, segments, elapsedSec, halfSec,
  openSeg, running, halfName, absAt, secFromAbs, halfOfSec, stintsOf, openStint,
  playedSec, spellSec, restSec, plannedSec, matchMinutes, onField, fieldIds,
  posOf, anomalies, squad, isOut, evenSplit, clashesOn, buildPlan, resolveShape,
  presetsFor, slotById, slotIdOf, slotTaken, currentSpot, byRole,
  planBlocks, planBlockAt, nextPlanBlock, planSeconds, snapLabel,
  /* stats */
  goalList, score, EVENTS, evOf, evLabel, evCount, evList, possOn, shotList,
  shotTally, possMarkers, possession, subEvents,
  /* actions */
  startClock, pauseClock, endHalf, endGame, putOnField, takeOffField, swap,
  moveSub, subQuiet, applyStaged, movePos, switchTo, subAt, restartMatch,
  adjustClock, tapLive, putOn, stage, staged, stagedIds, isStaged,
  /* public mirror */
  publicGame, publicDoc, schedulePublish, shareBase, teamLink, gameLink,
  gameStatus, shirtOf,
  /* AI prompt helper */
  aiPrompt, aiLabels, aiScrub, AI_TOPICS, sheetAi,
  /* test club */
  seedSandbox,
  /* rendering + routing */
  render, uiToHash, hashToUi,
  /* the mutable module-scoped bindings */
  get state() { return state }, set state(v) { state = v },
  get ui() { return ui },
  get me() { return me }, set me(v) { me = v },
  get fb() { return fb }, set fb(v) { fb = v },
  get appOwners() { return appOwners }, set appOwners(v) { appOwners = v },
  get denied() { return denied }, set denied(v) { denied = v },
  get purged() { return purged },
  get retiredClubs() { return retiredClubs },
  get pubState() { return pubState },
  /* invites */
  get invite() { return invite }, get clubInv() { return clubInv }, get myClubs() { return myClubs },
  secretId, inviteLink, redeemInvite, makeInvite, inviteScreen
}`;

const FB_URLS = {
  app: 'firebase-app.js',
  auth: 'firebase-auth.js',
  database: 'firebase-database.js'
};

function appSource(firebase) {
  let src = fs.readFileSync(APP_PATH, 'utf8');
  /* Keep a history of what the app told the coach. For a refused action the
     toast is often the only observable effect, so it is the assertion. */
  src = src.replace('function toast(msg) {',
    'function toast(msg) { if (globalThis.__toasts) globalThis.__toasts.push(msg);');
  if (!firebase) {
    // never reached without a config, but Node still has to parse it
    return src.replace(/await import\([^)]*\)/g, '({})')
      .replace(/import\((['"])https:[^)]*\1\)/g, 'Promise.resolve({})');
  }
  /* Point each import at its fake. getApp() calls import().then(...) without
     awaiting, initAuth/initSync await theirs, and Promise.resolve serves both. */
  for (const [key, file] of Object.entries(FB_URLS)) {
    const re = new RegExp(`import\\((['"])https:[^)]*${file.replace('.', '\\.')}\\1\\)`, 'g');
    src = src.replace(re, `Promise.resolve(globalThis.__FB.${key})`);
  }
  return src;
}

/* Boot app.js with the globals a browser would have given it, and hand back its
   internals. Boot itself runs on load — loadLocal(), hashToUi(), render(), then
   initAuth()/initSync() — exactly as it does in a page. */
function loadApp(opts = {}) {
  const dom = makeDom();
  const storage = makeStorage(opts.storage || {});
  const timers = makeTimers();
  const toasts = [];
  const confirms = opts.confirm === undefined ? true : opts.confirm;

  clock.install();
  seedRandom(opts.seed || 1);

  global.__toasts = toasts;
  global.document = dom.document;
  global.localStorage = storage;
  global.window = {
    addEventListener() { },
    SOCCER_FIREBASE_CONFIG: opts.config === undefined ? null : opts.config,
    SOCCER_FIREBASE_ENVS: opts.envs || undefined
  };
  global.location = {
    reload() { dom.reloads = (dom.reloads || 0) + 1; },
    hash: opts.hash || '', pathname: '/', search: opts.search || '', href: 'https://x.test/' + (opts.search || ''),
    origin: 'https://x.test'
  };
  // what the address bar was rewritten to, so a test can see a parameter taken off it
  global.history = { replaceState(s, t, url) { dom.replaced = url; } };
  global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
  global.setTimeout = timers.setTimeout;
  global.clearTimeout = timers.clearTimeout;
  global.setInterval = timers.setInterval;
  global.confirm = () => (typeof confirms === 'function' ? confirms() : confirms);
  global.alert = () => { };
  global.prompt = () => null;
  global.Blob = function () { };
  global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() { } };
  global.FileReader = function () { };

  if (opts.firebase) global.__FB = opts.firebase.modules;

  const src = appSource(opts.firebase);
  new Function(src + `;globalThis.__APP = ${EXPORTS};`)();

  const A = global.__APP;
  A.dom = dom;
  A.storage = storage;
  A.timers = timers;
  A.toasts = toasts;
  A.lastToast = () => toasts[toasts.length - 1] || null;
  A.rendered = dom.rendered;
  A.flush = flush;
  A.clock = clock;
  /* The click handler app.js installed on document. Every inline action branch
     is behind it. */
  A.click = dataset => {
    const handlers = dom.listeners.click || [];
    if (!handlers.length) throw new Error('app.js registered no click handler');
    const el = { dataset };
    for (const h of handlers) h({ target: { closest: sel => (sel === '[data-act]' ? el : null) } });
  };
  return A;
}

/* ---------------- assertions ---------------- */

/* sandbox.js's format, kept exactly: `ok` or `FAIL`, the label, the value, and
   on a failure what was expected. */
let failures = 0, passes = 0;
const gaps = [];

function check(label, got, want) {
  const ok = got === want;
  if (ok) passes++; else failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${JSON.stringify(got)}${ok ? '' : ' — expected ' + JSON.stringify(want)}`);
  return ok;
}

function deepEq(label, got, want) {
  return check(label, JSON.stringify(got), JSON.stringify(want));
}

function near(label, got, want, tol = 1) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) passes++; else failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${JSON.stringify(got)}${ok ? '' : ' — expected ~' + want + ' (±' + tol + ')'}`);
  return ok;
}

function throws(label, fn) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  return check(label, threw, true);
}

/* A gap pins behaviour the app has today that a design document says it should
   not, without painting CI red for a decision nobody has taken yet.

   rules.js already works this way: it asserts what the rules actually do and
   prints the five places the interface disagrees, because each of those is a
   choice rather than a bug. Same here. The assertion is on the CURRENT
   behaviour, so this fails loudly if the gap is ever closed — at which point
   the fix is to move the case up into the ordinary checks, not to widen this. */
function knownGap(label, got, want, note) {
  const stillBroken = got === want;
  if (stillBroken) { passes++; gaps.push({ label, note }); }
  else failures++;
  console.log(`  ${stillBroken ? 'gap ' : 'FAIL'} ${label.padEnd(50)} ${JSON.stringify(got)}`);
  if (!stillBroken) console.log(`       ^ this gap looks FIXED — promote it to a real check and delete the knownGap()`);
  return stillBroken;
}

function summary(title) {
  if (gaps.length) {
    console.log('\n--- known gaps, pinned but not fixed ---');
    for (const g of gaps) console.log('  • ' + g.label + (g.note ? '\n      ' + g.note.split('\n').join('\n      ') : ''));
  }
  console.log(`\n${failures ? failures + ' EXPECTATION(S) FAILED' : 'all expectations hold'}${title ? ' — ' + title : ''}`);
  clock.restore();
  process.exit(failures ? 1 : 0);
}

const counts = () => ({ failures, passes, gaps: gaps.length });

module.exports = {
  mk, makeDom, makeStorage, makeTimers, clock, seedRandom, flush,
  loadApp, appSource, APP_PATH,
  check, deepEq, near, throws, knownGap, summary, counts
};
