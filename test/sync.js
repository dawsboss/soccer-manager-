/* Auth, sync, and the races CLAUDE.md says were found and fixed once.

   "Don't reintroduce them" was, until now, enforced by remembering. Each of
   these fails the same way: not a crash, but a coach at a game looking at a
   sign-in screen, or at a club with no data in it, on a Saturday morning with
   no way to tell what went wrong.

   None of it is reachable by calling a function. initAuth() and initSync()
   talk to Firebase, and wireBase() — where the workspace read and its retry
   live — is a closure inside initSync(). So the app is booted against the fake
   modules in fakebase.js and driven from the outside: auth resolves when this
   file says so, the workspace answers when this file says so, and the rules
   refuse when this file says so.

   One case at the end is a knownGap: behaviour that contradicts an invariant
   and is pinned rather than fixed, because the fix is a deliberate change to
   the sync model and not a test's business. */

const H = require('./harness');
const { check, deepEq, knownGap } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'FLIGHT';
const WS = 'workspaces/' + CODE;

/* A fresh app each time: module state is global to one load, and these tests
   are about what happens during boot. */
async function boot(opts = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({
    firebase: fbk,
    config: opts.config === undefined ? CONFIG : opts.config,
    storage: { 'sm.workspace': CODE, ...(opts.storage || {}) },
    ...opts.app
  });
  await A.flush();
  return { A, fbk };
}

(async () => {

  console.log('--- the workspace is not read until auth has answered ---');
  {
    /* A read that goes out before the ID token is attached is denied by any
       uid-keyed rule, even for someone who is signed in a moment later. That
       denial used to stick, because this read only ever runs once. */
    const { A, fbk } = await boot();
    check('the connection was made', fbk.record.initCalls, 1);
    check('and auth was subscribed to', fbk.record.authSubscribers, 1);
    check('appOwners is read without a workspace', fbk.watching('appOwners'), true);
    check('the workspace has NOT been read yet', fbk.watching(WS), false);
    check('nor has anything under it', fbk.readPaths().some(p => p.startsWith(WS + '/')), false);

    fbk.signIn('coachU', { name: 'Jaz' });
    await A.flush();
    check('once auth answers, the workspace is read', fbk.watching(WS), true);
    check('exactly once', fbk.totalReads(WS), 1);
    check('and we know who we are', A.me.uid, 'coachU');
  }

  console.log('\n--- signed out still counts as an answer ---');
  {
    const { A, fbk } = await boot();
    check('nothing read before the callback', fbk.watching(WS), false);
    fbk.signOut();
    await A.flush();
    check('a signed-out answer still releases the read', fbk.watching(WS), true);
    check('with nobody signed in', A.me, null);
  }

  console.log('\n--- signing in later reattaches the read ---');
  {
    /* Someone lands on the lock screen after a refusal, signs in there, and the
       workspace has to be read again — an earlier denial is stale the moment
       the identity changes. */
    const { A, fbk } = await boot();
    fbk.signOut();
    await A.flush();
    check('read once while signed out', fbk.totalReads(WS), 1);
    fbk.refuse(WS);
    await A.flush();
    A.timers.run(); A.timers.run();          // let the backoff retries spend themselves
    fbk.refuse(WS); A.timers.run(); fbk.refuse(WS);
    check('after three refusals we are locked out', A.denied, true);

    const before = fbk.totalReads(WS);
    fbk.signIn('coachU', { name: 'Jaz' });
    await A.flush();
    check('signing in went back for another read', fbk.totalReads(WS) > before, true);
    check('and cleared the refusal', A.denied, false);

    const after = fbk.totalReads(WS);
    fbk.signIn('coachU', { name: 'Jaz Renamed' });
    await A.flush();
    check('the same uid again does not re-read', fbk.totalReads(WS), after);
  }

  console.log('\n--- a denial in the first second is a race, not a rule ---');
  {
    const { A, fbk } = await boot();
    fbk.signIn('coachU');
    await A.flush();
    fbk.refuse(WS);
    check('the first refusal does not show the lock screen', A.denied, false);
    check('it schedules a retry instead', A.timers.pending.size > 0, true);
    A.timers.run();
    check('which is a second read', fbk.totalReads(WS), 2);
    fbk.refuse(WS);
    check('the second refusal still waits', A.denied, false);
    A.timers.run();
    check('and a third read', fbk.totalReads(WS), 3);
    fbk.refuse(WS);
    check('the third refusal is taken at its word', A.denied, true);
    check('and the device remembers when it started', A.storage.getItem('sm.denied:' + CODE) !== null, true);
  }

  console.log('\n--- two callers, one Firebase app ---');
  {
    /* initAuth() and initSync() both call getApp() at boot. Caching the
       resolved app is not enough — the second caller has to find the in-flight
       promise, or initializeApp() throws and kills whichever lost. */
    const { A, fbk } = await boot({ config: null });
    check('with no config, nothing was initialised', fbk.record.initCalls, 0);
    global.window.SOCCER_FIREBASE_CONFIG = CONFIG;
    const [a, b] = await Promise.all([A.getApp(), A.getApp()]);
    check('two concurrent callers initialised it once', fbk.record.initCalls, 1);
    check('and both got an app', !!a && !!b, true);
    check('the same one', a === b, true);
    const c = await A.getApp();
    check('a later caller reuses it too', fbk.record.initCalls, 1);
    check('still the same app', c === a, true);
  }

  console.log('\n--- no config is a local device, not an error ---');
  {
    const { A, fbk } = await boot({ config: null });
    check('nothing was read', fbk.readPaths().length, 0);
    check('and nothing was written', fbk.record.writes.length, 0);
    check('the app still has its local state', !!A.state, true);
    check('remote writes are dropped rather than thrown', A.remoteSet('teams/t1/name', 'X'), undefined);
  }

  console.log('\n--- a workspace read that arrives ---');
  {
    const { A, fbk } = await boot();
    fbk.signIn('coachU');
    await A.flush();
    fbk.deliver(WS, {
      teams: { t1: { id: 't1', name: 'G14 Flight', players: {} } },
      matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside' } },
      access: { admins: { bossU: true } }
    });
    check('the club arrived', A.state.teams.t1.name, 'G14 Flight');
    check('with its games', A.state.matches.g1.opponent, 'Riverside');
    check('and its membership', A.state.access.admins.bossU, true);
    check('it was saved locally', A.storage.getItem('sm.data.v1:' + CODE) !== null, true);
    check('the refusal flag is clear', A.denied, false);
    check('and child listeners were wired', fbk.watching(WS + '/teams'), true);
    check('including membership', fbk.watching(WS + '/access'), true);
  }

  console.log('\n--- an empty workspace gets this device\'s copy pushed up ---');
  {
    const { A, fbk } = await boot({
      storage: {
        'sm.data.v1:FLIGHT': JSON.stringify({
          teams: { t1: { id: 't1', name: 'Local Team', players: {} } },
          matches: { gLocal: { id: 'gLocal', teamId: 't1', opponent: 'Tracked offline' } },
          access: {}
        })
      }
    });
    check('the local copy loaded at boot', A.state.matches.gLocal.opponent, 'Tracked offline');
    fbk.signIn('coachU');
    await A.flush();
    fbk.deliver(WS, null);                   // nothing there yet
    const pushed = fbk.writtenTo(WS);
    check('a brand new workspace is seeded from this device', pushed.length, 1);
    check('carrying the offline game', !!pushed[0].value.matches.gLocal, true);
    check('and the local copy survived', !!A.state.matches.gLocal, true);
  }

  console.log('\n--- a rejected write must not wipe an identity we already have ---');
  {
    const { A } = await boot({ config: null });
    const local = { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1' } } };
    const remote = { id: 't1', players: { p1: { id: 'p1' }, p2: { id: 'p2' } } };   // no name
    const merged = A.mergeNode(local, remote);
    check('the name survives a remote node that lost it', merged.name, 'G14 Flight');
    check('while the remote content wins', Object.keys(merged.players).length, 2);

    check('a remote name overrides the local one',
      A.mergeNode(local, { ...remote, name: 'Renamed' }).name, 'Renamed');
    check('nothing local means take the remote whole',
      A.mergeNode(null, remote).players.p2.id, 'p2');
    deepEq('every identity field is protected', A.IDENTITY,
      ['name', 'opponent', 'date', 'teamId', 'periodCount', 'periodMinutes', 'onFieldCount']);

    const m = A.mergeNode(
      { id: 'g1', opponent: 'Riverside', date: '2026-09-12', teamId: 't1', periodMinutes: 40 },
      { id: 'g1', goals: { x: { t: 1, side: 'us' } } });
    check('a match keeps its opponent', m.opponent, 'Riverside');
    check('its date', m.date, '2026-09-12');
    check('its team', m.teamId, 't1');
    check('its period length', m.periodMinutes, 40);
    check('and gains the new goal', !!m.goals.x, true);
  }

  console.log('\n--- a child update merges rather than replaces ---');
  {
    const { A, fbk } = await boot();
    fbk.signIn('coachU');
    await A.flush();
    fbk.deliver(WS, {
      teams: { t1: { id: 't1', name: 'G14 Flight', players: {} } },
      matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', periodMinutes: 40 } },
      access: {}
    });
    // a write that got half-rejected: the goal landed, the identity fields did not
    fbk.deliverChild(WS + '/matches', 'g1', { id: 'g1', goals: { x: { t: 60, side: 'us' } } }, 'changed');
    check('the opponent was not lost', A.state.matches.g1.opponent, 'Riverside');
    check('nor the period length', A.state.matches.g1.periodMinutes, 40);
    check('and the goal arrived', !!A.state.matches.g1.goals.x, true);

    fbk.deliverChild(WS + '/matches', 'g1', null, 'removed');
    check('a removal does remove it', A.state.matches.g1, undefined);
  }

  console.log('\n--- retiring a club is checked in the handler, not just the render ---');
  {
    /* The button is hidden from anyone who is not an admin. Hiding a button is
       not access control — anything that can reach the handler can retire the
       club. */
    const { A, fbk } = await boot();
    fbk.signIn('trackerU', { name: 'Trk' });
    await A.flush();
    fbk.deliver(WS, {
      teams: { t1: { id: 't1', name: 'G14 Flight', players: {} } }, matches: {},
      access: { admins: { bossU: true }, teams: { t1: { trackers: { trackerU: true } } } }
    });
    A.appOwners = {};
    check('a tracker is not an admin', A.canAdmin(), false);

    A.click({ act: 'retireclub' });
    check('the club was not retired', fbk.writtenTo('retired/' + CODE).length, 0);
    check('and she was told why', A.lastToast(), 'Club admins and the app owner only');

    A.state.access.admins.trackerU = true;
    check('now she is an admin', A.canAdmin(), true);
    A.click({ act: 'retireclub' });
    check('an admin can retire it', fbk.writtenTo('retired/' + CODE).length, 1);
    check('and it is stamped with who did it', fbk.writtenTo('retired/' + CODE)[0].value.by, 'trackerU');

    // the app owner, who holds no role in the club, can too
    const two = await boot();
    two.fbk.signIn('ownU');
    await two.A.flush();
    two.fbk.deliver('appOwners', { ownU: true });
    two.fbk.deliver(WS, { teams: {}, matches: {}, access: { admins: { bossU: true } } });
    check('the app owner is not a club admin', two.A.isAdmin('ownU'), false);
    check('but canAdmin lets him through', two.A.canAdmin(), true);
    two.A.click({ act: 'retireclub' });
    check('so he can retire it', two.fbk.writtenTo('retired/' + CODE).length, 1);
  }

  console.log('\n--- a retired club tells every device to let go ---');
  {
    const { A, fbk } = await boot();
    fbk.signIn('coachU');
    await A.flush();
    fbk.deliver(WS, { teams: { t1: { id: 't1', name: 'G14 Flight', players: {} } }, matches: {}, access: {} });
    check('the club is here', !!A.state.teams.t1, true);
    fbk.deliver('retired/' + CODE, { at: Date.now(), by: 'bossU' });
    check('the local copy was cleared', Object.keys(A.state.teams).length, 0);
    check('and the device says why', A.purged, 'retired');
    check('the stored copy went too', A.storage.getItem('sm.data.v1:' + CODE), null);
  }

  console.log('\n--- refusal is not instant deletion ---');
  {
    /* A botched rules change would otherwise wipe a coach's offline copy before
       anyone noticed it was botched. */
    const { A } = await boot({ config: null, storage: { 'sm.data.v1:FLIGHT': JSON.stringify({ teams: { t1: { id: 't1' } }, matches: {}, access: {} }) } });
    check('the copy is here', !!A.state.teams.t1, true);
    check('the first refusal only starts the clock', A.noteDenied(), false);
    check('and records when', A.storage.getItem('sm.denied:' + CODE) !== null, true);
    check('the copy is untouched', !!A.state.teams.t1, true);

    H.clock.advance(23 * 3600e3);
    check('twenty-three hours later it still holds', A.noteDenied(), false);
    check('and the copy is still here', !!A.state.teams.t1, true);

    H.clock.advance(2 * 3600e3);
    check('past a day it lets go', A.noteDenied(), true);
    check('and the copy is gone', Object.keys(A.state.teams).length, 0);
    check('with a reason', A.purged, 'access');
  }

  console.log('\n--- purging one club does not touch another ---');
  {
    const { A } = await boot({
      config: null,
      storage: {
        'sm.data.v1:FLIGHT': JSON.stringify({ teams: { t1: {} }, matches: {}, access: {} }),
        'sm.data.v1:OTHER': JSON.stringify({ teams: { t9: {} }, matches: {}, access: {} }),
        'sm.synced:OTHER': '123'
      }
    });
    A.purgeClub('OTHER', 'retired');
    check('the other club\'s copy is gone', A.storage.getItem('sm.data.v1:OTHER'), null);
    check('and its sync marker', A.storage.getItem('sm.synced:OTHER'), null);
    check('this one is untouched', A.storage.getItem('sm.data.v1:FLIGHT') !== null, true);
    check('and is still loaded', !!A.state.teams.t1, true);
    check('nothing was marked purged', A.purged, null);
  }

  console.log('\n--- what the connect-time read does to local-only work ---');
  {
    /* CLAUDE.md, invariants: "The connect-time workspace read merges into local
       state; it must never replace it wholesale. A game tracked fully offline
       exists only in local state until it syncs — a naive `state = snap.val()`
       at reconnect silently erases it. See wireBase() in initSync()."

       app.js:439 is that naive assignment. mergeNode() is wired into the
       per-child listeners underneath it and not into this first read. */
    const { A, fbk } = await boot({
      storage: {
        'sm.data.v1:FLIGHT': JSON.stringify({
          teams: { t1: { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1', name: 'Ella' } } } },
          matches: {
            gSynced: { id: 'gSynced', teamId: 't1', opponent: 'Riverside' },
            gOffline: { id: 'gOffline', teamId: 't1', opponent: 'Tracked with no signal' }
          },
          access: {}
        })
      }
    });
    check('both games loaded from this device', Object.keys(A.state.matches).length, 2);
    fbk.signIn('coachU');
    await A.flush();
    // the server has never heard of gOffline
    fbk.deliver(WS, {
      teams: { t1: { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1', name: 'Ella' } } } },
      matches: { gSynced: { id: 'gSynced', teamId: 't1', opponent: 'Riverside' } },
      access: {}
    });
    check('the synced game is still here', !!A.state.matches.gSynced, true);
    knownGap('the offline game survives the connect-time read',
      A.state.matches.gOffline, undefined,
      'app.js:439 assigns state = { teams: v.teams||{}, ... } on the first workspace\n' +
      'read, so a game that exists only on this device is dropped and saveLocal()\n' +
      'then writes the loss to disk. CLAUDE.md forbids exactly this ("must never\n' +
      'replace it wholesale"); mergeNode() is wired into the per-child listeners\n' +
      'below it, not into this read. Fixing it is a deliberate change to the sync\n' +
      'model, so it is pinned here rather than papered over.');
    check('and the loss was written to disk',
      JSON.parse(A.storage.getItem('sm.data.v1:' + CODE)).matches.gOffline, undefined);
  }

  H.summary('auth and sync');
})().catch(e => { console.error('CRASH:', e && e.stack || e); process.exit(1); });
