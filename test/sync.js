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

   The last cases are the outbox: what a phone made with no signal reaches
   the club after a reload, and nothing is dropped without the coach saying
   so. They used to end in a knownGap, the connect-time read throwing away a
   game tracked offline; that gap is closed. */

const H = require('./harness');
const { check, deepEq, knownGap } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'FLIGHT';
const OB = 'orgs/' + CODE;
const READ = OB + '/access';   // the first read of a club: what this account may read of it

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
    check('the workspace has NOT been read yet', fbk.watching(READ), false);
    check('nor has anything under it', fbk.readPaths().some(p => p.startsWith(OB + '/')), false);

    fbk.signIn('coachU', { name: 'Jaz' });
    await A.flush();
    check('once auth answers, the workspace is read', fbk.watching(READ), true);
    check('exactly once', fbk.totalReads(READ), 1);
    check('and we know who we are', A.me.uid, 'coachU');
  }

  console.log('\n--- signed out still counts as an answer ---');
  {
    const { A, fbk } = await boot();
    check('nothing read before the callback', fbk.watching(READ), false);
    fbk.signOut();
    await A.flush();
    check('a signed-out answer still releases the read', fbk.watching(READ), true);
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
    check('read once while signed out', fbk.totalReads(READ), 1);
    fbk.refuse(READ);
    await A.flush();
    A.timers.run(); A.timers.run();          // let the backoff retries spend themselves
    fbk.refuse(READ); await A.flush(); A.timers.run(); fbk.refuse(READ); await A.flush();
    check('after three refusals we are locked out', A.denied, true);

    const before = fbk.totalReads(READ);
    fbk.signIn('coachU', { name: 'Jaz' });
    await A.flush();
    check('signing in went back for another read', fbk.totalReads(READ) > before, true);
    check('and cleared the refusal', A.denied, false);

    const after = fbk.totalReads(READ);
    fbk.signIn('coachU', { name: 'Jaz Renamed' });
    await A.flush();
    check('the same uid again does not re-read', fbk.totalReads(READ), after);
  }

  console.log('\n--- a denial in the first second is a race, not a rule ---');
  {
    const { A, fbk } = await boot();
    fbk.signIn('coachU');
    await A.flush();
    fbk.refuse(READ); await A.flush();
    check('the first refusal does not show the lock screen', A.denied, false);
    check('it schedules a retry instead', A.timers.pending.size > 0, true);
    A.timers.run();
    check('which is a second read', fbk.totalReads(READ), 2);
    fbk.refuse(READ); await A.flush();
    check('the second refusal still waits', A.denied, false);
    A.timers.run();
    check('and a third read', fbk.totalReads(READ), 3);
    fbk.refuse(READ); await A.flush();
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
    await fbk.serveClub(CODE, {
      teams: { t1: { id: 't1', name: 'G14 Flight', players: {} } },
      matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside' } },
      access: { admins: { bossU: true } }
    }, A.flush);
    check('the club arrived', A.state.teams.t1.name, 'G14 Flight');
    check('with its games', A.state.matches.g1.opponent, 'Riverside');
    check('and its membership', A.state.access.admins.bossU, true);
    check('it was saved locally', A.storage.getItem('sm.data.v1:' + CODE) !== null, true);
    check('the refusal flag is clear', A.denied, false);
    check('and child listeners were wired', fbk.watching(OB + '/teams'), true);
    check('including membership', fbk.watching(OB + '/access'), true);
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
    await fbk.serveClub(CODE, null, A.flush);                   // nothing there yet
    /* Not one set() of the whole node any more. The rules grant .write only on
       the children of the club, so seeding a club has to walk them in an order
       each rule can allow — admins while it is empty, then the index every
       other rule consults, then the data those two authorise. A single set()
       at the base is refused outright once a club is locked down, which is
       precisely the call that creates one. */
    check('nothing is written to the old tree at all', fbk.record.writes.filter(w => w.path.startsWith('workspaces/')).map(w => w.path).join(), '');
    const base = fbk.writtenTo(OB);
    check('nothing is written to the club\'s node itself', base.length, 0);
    const paths = fbk.record.writes.filter(w => w.path.startsWith(OB + '/')).map(w => w.path.slice(OB.length + 1));
    const at = p => paths.indexOf(p);
    check('the writer claims admin', at('access/admins/coachU') > -1, true);
    check('then indexes themselves', at('access/index/coachU') > at('access/admins/coachU'), true);
    /* Per child, not per collection: a rule on $tid does not grant the parent,
       so pushing the whole teams node is refused where pushing each team is
       fine. Invisible until a club is locked down, and then total. */
    check('and each team comes after the index', at('teams/t1') > at('access/index/coachU'), true);
    check('collections themselves are never written', at('teams') === -1 && at('matches') === -1, true);
    check('each game is pushed on its own', at('matches/gLocal') > at('access/index/coachU'), true);
    // access/log is never replayed: its rule demands each entry stamp its own writer
    check('the audit log is not pushed wholesale', at('log'), -1);
    check('a team on the new tree is two writes: the team, then its squad', at('teams/t1') > -1 && at('squad/t1') === -1 || at('squad/t1') > at('teams/t1'), true);
    check('carrying the offline game', !!fbk.record.writes.find(w => w.path === OB + '/matches/gLocal').value, true);
    check('and the local copy survived', !!A.state.matches.gLocal, true);
  }

  console.log('\n--- an admin connecting closes the migration bridge ---');
  {
    /* The per-team rules fall back to the club-wide index while
       access/teamIndex is missing, so a club locked down before that node
       existed keeps working. Somebody has to write it, and only an admin may,
       so an admin's device does it on the way in rather than waiting for a
       button nobody knows about. */
    const { A, fbk } = await boot();
    fbk.signIn('bossU');
    await A.flush();
    // laid out by hand, without the team index serveClub() would derive: that is the bridge
    await fbk.serve(OB, {
      teams: { t1: { id: 't1', name: 'Flight' } },
      access: { admins: { bossU: true }, index: { bossU: true, jazU: true, trkU: true },
                teams: { t1: { coaches: { jazU: true }, trackers: { trkU: true } } } }
    }, A.flush);
    const w = fbk.record.writes.find(x => x.path === OB + '/access/teamIndex/t1');
    check('the team index was written', !!w, true);
    check('the coach is a coach', w && w.value.jazU, 'coach');
    check('the tracker is a tracker', w && w.value.trkU, 'tracker');
    check('admins are not mirrored into it', w && w.value.bossU === undefined, true);

    const before = fbk.record.writes.length;
    fbk.deliver(OB + '/access', {
      admins: { bossU: true }, index: { bossU: true, jazU: true, trkU: true },
      teams: { t1: { coaches: { jazU: true }, trackers: { trkU: true } } },
      teamIndex: { t1: { jazU: 'coach', trkU: 'tracker' } }
    });
    check('and is not rewritten when it already agrees', fbk.record.writes.length, before);
  }

  console.log('\n--- a coach connecting writes nothing of the sort ---');
  {
    const { A, fbk } = await boot();
    fbk.signIn('jazU');
    await A.flush();
    await fbk.serve(OB, {
      teams: { t1: { id: 't1', name: 'Flight' } },
      access: { admins: { bossU: true }, index: { bossU: true, jazU: true },
                teams: { t1: { coaches: { jazU: true } } } }
    }, A.flush);
    check('only an admin may write the team index', fbk.record.writes.some(x => x.path.includes('teamIndex')), false);
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
    await fbk.serveClub(CODE, {
      teams: { t1: { id: 't1', name: 'G14 Flight', players: {} } },
      matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', periodMinutes: 40 } },
      access: { index: { coachU: true } }
    }, A.flush);
    // a write that got half-rejected: the goal landed, the identity fields did not
    fbk.deliverChild(OB + '/matches', 'g1', { id: 'g1', goals: { x: { t: 60, side: 'us' } } }, 'changed');
    check('the opponent was not lost', A.state.matches.g1.opponent, 'Riverside');
    check('nor the period length', A.state.matches.g1.periodMinutes, 40);
    check('and the goal arrived', !!A.state.matches.g1.goals.x, true);

    fbk.deliverChild(OB + '/matches', 'g1', null, 'removed');
    // a tick later: long enough to hear whether the whole club moved instead (wireBase())
    await A.flush();
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
    await fbk.serveClub(CODE, {
      teams: { t1: { id: 't1', name: 'G14 Flight', players: {} } }, matches: {},
      access: { admins: { bossU: true }, teams: { t1: { trackers: { trackerU: true } } } }
    }, A.flush);
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
    await two.fbk.serveClub(CODE, { teams: {}, matches: {}, access: { admins: { bossU: true } } }, two.A.flush);
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
    await fbk.serveClub(CODE, { teams: { t1: { id: 't1', name: 'G14 Flight', players: {} } }, matches: {}, access: { index: { coachU: true } } }, A.flush);
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

       It used to be a naive assignment here, pinned as a known gap. The read
       now takes the club's copy and lays back over it what this phone made
       and the club has never seen. */
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
    await fbk.serveClub(CODE, {
      teams: { t1: { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1', name: 'Ella' } } } },
      matches: { gSynced: { id: 'gSynced', teamId: 't1', opponent: 'Riverside' } },
      access: { index: { coachU: true } }
    }, A.flush);
    check('the synced game is still here', !!A.state.matches.gSynced, true);
    check('the offline game survives the connect-time read', !!A.state.matches.gOffline, true);
    check('and is kept on disk', !!JSON.parse(A.storage.getItem('sm.data.v1:' + CODE)).matches.gOffline, true);
    check('and sent to the club, the one place it was missing from', !!fbk.writtenTo(OB + '/matches/gOffline').length, true);
    check('the synced game is not sent back', fbk.writtenTo(OB + '/matches/gSynced').length, 0);
  }

  /* The outbox. Firebase holds a write it couldn't send in memory only, so a
     page reloaded with no signal had the change in localStorage and nowhere
     else; the connect-time read then threw it away. Every workspace write is
     now recorded until the database acknowledges it. */
  const CLUB = () => ({
    teams: { t1: { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1', name: 'Ella' } } } },
    matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside' }, g2: { id: 'g2', teamId: 't1', opponent: 'Athletic' } },
    access: { admins: { coachU: true }, index: { coachU: true }, teams: { t1: { coaches: { coachU: true } } } }
  });
  async function online(storage) {
    const { A, fbk } = await boot({ storage });
    fbk.signIn('coachU'); await A.flush();
    return { A, fbk };
  }

  console.log('\n--- what is made with no signal reaches the club, even after a reload ---');
  {
    const { A, fbk } = await online();
    await fbk.serveClub(CODE, CLUB(), A.flush); await A.flush();
    check('a game this phone has read is remembered as the club\'s', /g1/.test(A.storage.getItem('sm.seen.v1:' + CODE) || ''), true);
    fbk.holdWrites(p => p.startsWith(OB + '/'));                  // the signal goes
    A.commit('matches/g1/goals/x1', { t: 600, side: 'us' });
    A.commit('matches/gNew', { id: 'gNew', teamId: 't1', opponent: 'Made at the field' });
    A.drop('matches/g2');
    await A.flush();
    const owed = JSON.parse(A.storage.getItem('sm.pending.v1:' + CODE));
    check('each change is in the outbox on disk', Object.keys(owed.w).sort().join(), 'matches/g1/goals/x1,matches/g2,matches/gNew');
    check('the badge says so, rather than "synced"', /to send/.test(A.dom.node('#syncBadge').textContent), true);
    A.render();
    check('and so does Settings', (A.ui.view = 'setup', A.render(), /Waiting to reach the club/.test(A.rendered())), true);

    /* The page is closed and opened again, still offline, and then the signal
       comes back with the club exactly as it was. */
    const saved = { ...A.storage._d };
    const B = await online(saved);
    check('after a reload the changes are still on screen', !!B.A.state.matches.g1.goals && !!B.A.state.matches.gNew && !B.A.state.matches.g2, true);
    await B.fbk.serveClub(CODE, CLUB(), B.A.flush); await B.A.flush();
    check('the club\'s answer does not take the goal away', !!(B.A.state.matches.g1.goals || {}).x1, true);
    check('nor the new game', !!B.A.state.matches.gNew, true);
    check('nor put back the game deleted here', B.A.state.matches.g2, undefined);
    check('the goal is sent again', B.fbk.writtenTo(OB + '/matches/g1/goals/x1').length, 1);
    check('the game too', B.fbk.writtenTo(OB + '/matches/gNew').length, 1);
    check('and the delete', B.fbk.record.removes.includes(OB + '/matches/g2'), true);
    check('in the order they were made', B.fbk.record.writes.findIndex(w => w.path.endsWith('/goals/x1')) < B.fbk.record.writes.findIndex(w => w.path.endsWith('/gNew')), true);
    await B.A.flush();
    check('acknowledged, the outbox is empty', Object.keys(JSON.parse(B.A.storage.getItem('sm.pending.v1:' + CODE)).w).length, 0);
    check('and the badge stops counting', /to send|not saved/.test(B.A.dom.node('#syncBadge').textContent), false);
    B.fbk.deliverChild(OB + '/matches', 'g1', { id: 'g1', teamId: 't1', opponent: 'Riverside', goals: { x1: { t: 600, side: 'us' } } }, 'changed'); await B.A.flush();
    check('later answers from the club are taken as they are', B.A.state.matches.g1.goals.x1.t, 600);
  }

  console.log('\n--- deleted somewhere else is deleted here ---');
  {
    const { A, fbk } = await online();
    await fbk.serveClub(CODE, CLUB(), A.flush); await A.flush();
    const saved = { ...A.storage._d };
    const B = await online(saved);
    const c = CLUB(); delete c.matches.g2;
    await B.fbk.serveClub(CODE, c, B.A.flush); await B.A.flush();
    check('a game this phone had from the club, gone from the club, goes', B.A.state.matches.g2, undefined);
    check('and is not sent back', B.fbk.writtenTo(OB + '/matches/g2').length, 0);
  }

  console.log('\n--- a write the club refuses is kept, said, and tried again ---');
  {
    const { A, fbk } = await online();
    await fbk.serveClub(CODE, CLUB(), A.flush); await A.flush();
    fbk.refuseWrites(p => p.includes('/goals/'));
    A.commit('matches/g1/goals/x2', { t: 900, side: 'us' }); await A.flush();
    check('the refused goal stays on this phone', !!A.state.matches.g1.goals.x2, true);
    check('marked refused in the outbox', JSON.parse(A.storage.getItem('sm.pending.v1:' + CODE)).w['matches/g1/goals/x2'].refused, true);
    A.ui.view = 'matches'; A.render();
    check('every screen says a change was not accepted', /hasn't been accepted by the club/.test(A.rendered()), true);
    check('the badge too', /1 not saved/.test(A.dom.node('#syncBadge').textContent), true);
    A.click({ act: 'pendingsheet' });
    check('the list says what it is, in words', /a goal in the game against Riverside/.test(String(A.dom.node('#sheet').innerHTML)), true);

    const B = await online({ ...A.storage._d });
    await B.fbk.serveClub(CODE, CLUB(), B.A.flush); await B.A.flush();
    check('a reload keeps it, on top of the club\'s copy', !!B.A.state.matches.g1.goals && !!B.A.state.matches.g1.goals.x2, true);
    check('and tries it again (the rules may have been pasted since)', B.fbk.writtenTo(OB + '/matches/g1/goals/x2').length, 1);
    check('accepted this time, it leaves the outbox', Object.keys(JSON.parse(B.A.storage.getItem('sm.pending.v1:' + CODE)).w).length, 0);

    const C = await online({ ...A.storage._d });
    C.fbk.refuseWrites(() => true);
    await C.fbk.serveClub(CODE, CLUB(), C.A.flush); await C.A.flush();
    check('the lookup tables, rebuilt on every connect, never wait in the outbox', Object.keys(C.A.pending.w).some(k => /^access\/(index|teamIndex|coachIndex|teamParents)/.test(k)), false);
    let asked = null;
    global.confirm = m => { asked = m; return true; };
    C.A.click({ act: 'pendingdrop' });
    check('dropping it asks first, saying it is gone for good', /gone for good/.test(asked || ''), true);
    check('then it leaves the outbox', Object.keys(JSON.parse(C.A.storage.getItem('sm.pending.v1:' + CODE)).w).filter(k => k.includes('goals')).length, 0);
    check('and the club is read again', C.fbk.totalReads(READ) >= 2, true);
    global.confirm = () => true;
  }

  console.log('\n--- an answer taken back off the screen leaves the outbox too ---');
  {
    const { A, fbk } = await online();
    await fbk.serveClub(CODE, CLUB(), A.flush); await A.flush();
    fbk.refuseWrites(p => p.includes('/rsvp/'));
    A.remoteSet('rsvp/t1/g_g1/p1', { v: 'yes', by: 'coachU', at: 1 }).catch(() => { });
    await A.flush();
    check('a refused write is marked, not lost', JSON.parse(A.storage.getItem('sm.pending.v1:' + CODE)).w['rsvp/t1/g_g1/p1'].refused, true);
  }

  console.log('\n--- teams from before this phone joined a club ---');
  {
    const local = { teams: { tL: { id: 'tL', name: 'Before the club', players: { a: { id: 'a', name: 'Ada' } } } }, matches: {}, access: {} };
    const { A, fbk } = await online({ 'sm.data.v1:local': JSON.stringify(local) });
    await fbk.serveClub(CODE, CLUB(), A.flush); await A.flush();
    A.ui.view = 'setup'; A.render();
    check('Settings says this phone has teams no club has', /On this phone only/.test(A.rendered()), true);
    check('and offers an admin to add them', /data-act="adoptlocal"/.test(A.rendered()), true);
    A.click({ act: 'adoptlocal' });
    check('through the import, which merges and never replaces', /Bulk import/.test(String(A.dom.node('#sheet').innerHTML)) && /Before the club/.test(String(A.dom.node('#sheet').innerHTML)), true);
  }

  console.log('\n--- access taken away: turning the signal off does not bring the club back ---');
  {
    /* The loophole the owner asked about: a parent whose access was withdrawn,
       refused once, turns off Wi-Fi and mobile data and reloads. The refusal
       used to live only in memory, so the copy was drawn again in full. */
    const now = H.clock.t;
    const club = { teams: { t1: { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1', name: 'Ella Stone', guardians: { mumU: true } } } } }, matches: {}, access: { admins: { bossU: true }, index: { bossU: true, mumU: true } } };
    const seed = extra => ({
      'sm.data.v1:FLIGHT': JSON.stringify(club),
      'sm.me': JSON.stringify({ uid: 'mumU', name: 'Mo' }),
      'sm.msgs:FLIGHT:mumU': JSON.stringify({ board: {}, dm: { t1: { mumU: { m: { x: { text: 'Ella is off sick' } } } } } }),
      ...extra
    });
    // the squad, where every name is: the calendar it opens on names no team
    const drawn = A => { A.ui.view = 'roster'; A.ui.teamId = 't1'; A.render(); return String(A.dom.node('#app').innerHTML) + String(A.dom.node('#crumbs').innerHTML); };
    // no signIn(): auth never answers, which is a phone with no signal
    {
      const { A, fbk } = await boot({ storage: seed({ 'sm.denied:FLIGHT': String(now - 2 * 3600e3), 'sm.synced:FLIGHT': String(now - 3 * 3600e3) }) });
      check('refused two hours ago, offline now: the club stays shut', A.denied, true);
      check('no team name drawn', drawn(A).includes('G14 Flight'), false);
      check('no child\'s name drawn', drawn(A).includes('Ella'), false);
      check('the copy is still on the phone, in case the refusal was a mistake', A.storage.getItem('sm.data.v1:FLIGHT') !== null, true);
      fbk.signIn('mumU');
      await A.flush();
      await fbk.serveClub(CODE, club, A.flush);
      await A.flush();
      check('and a good read brings it all back', A.denied, false);
      check('drawn again', drawn(A).includes('G14 Flight'), true);
      check('the refusal forgotten', A.storage.getItem('sm.denied:FLIGHT'), null);
    }
    {
      const { A } = await boot({ storage: seed({ 'sm.denied:FLIGHT': String(now - 25 * 3600e3), 'sm.synced:FLIGHT': String(now - 26 * 3600e3) }) });
      check('refused more than a day ago: offline, the copy goes anyway', A.purged, 'access');
      check('the stored club is gone', A.storage.getItem('sm.data.v1:FLIGHT'), null);
      check('and the family conversations kept with it', A.storage.getItem('sm.msgs:FLIGHT:mumU'), null);
      check('nothing of it drawn', drawn(A).includes('G14 Flight') || drawn(A).includes('Ella'), false);
    }
  }

  console.log('\n--- a copy the club has not confirmed in thirty days is not drawn ---');
  {
    const now = H.clock.t;
    const club = { teams: { t1: { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1', name: 'Ella Stone' } } } }, matches: {}, access: { admins: { bossU: true }, index: { bossU: true, coachU: true }, teams: { t1: { coaches: { coachU: true } } } } };
    // the squad, where every name is: the calendar it opens on names no team
    const drawn = A => { A.ui.view = 'roster'; A.ui.teamId = 't1'; A.render(); return String(A.dom.node('#app').innerHTML) + String(A.dom.node('#crumbs').innerHTML); };
    const base = { 'sm.data.v1:FLIGHT': JSON.stringify(club), 'sm.me': JSON.stringify({ uid: 'coachU', name: 'Jaz' }) };
    {
      const { A, fbk } = await boot({ storage: { ...base, 'sm.synced:FLIGHT': String(now - 31 * 864e5) } });
      check('thirty-one days with no word from the club: not drawn', A.unconfirmed, true);
      check('no team name', drawn(A).includes('G14 Flight'), false);
      check('she is told to connect once', drawn(A).includes('Connect once'), true);
      check('and nothing is thrown away: an unsent game may be in it', A.storage.getItem('sm.data.v1:FLIGHT') !== null, true);
      fbk.signIn('coachU');
      await A.flush();
      await fbk.serveClub(CODE, club, A.flush);
      await A.flush();
      check('the club answers: drawn again', A.unconfirmed, false);
      check('her team is back', drawn(A).includes('G14 Flight'), true);
    }
    {
      const { A } = await boot({ storage: { ...base, 'sm.synced:FLIGHT': String(now - 29 * 864e5) } });
      check('twenty-nine days: a coach who never finds signal at the fields still has her squad', drawn(A).includes('G14 Flight'), true);
    }
    {
      const { A } = await boot({ storage: { ...base } });
      check('a copy from before this check is drawn', drawn(A).includes('G14 Flight'), true);
      check('and its clock starts now', A.storage.getItem('sm.synced:FLIGHT'), String(now));
    }
    {
      const { A } = await boot({ config: null, storage: { ...base, 'sm.synced:FLIGHT': String(now - 400 * 864e5) } });
      check('a phone with no database to ask is never shut out of its own copy', drawn(A).includes('G14 Flight'), true);
    }
    {
      const { A } = await boot({ storage: { ...base, 'sm.denied:FLIGHT': String(now - 3600e3) } });
      // the pre-lockdown case: no admin yet, nothing to confirm against
      const open = JSON.parse(base['sm.data.v1:FLIGHT']); open.access = {};
      const { A: B } = await boot({ storage: { ...base, 'sm.data.v1:FLIGHT': JSON.stringify(open), 'sm.denied:FLIGHT': String(now - 3600e3) } });
      check('a refusal shuts a club with an admin', A.denied, true);
      check('but a club still being set up, with no admin, stays open', drawn(B).includes('G14 Flight'), true);
    }
  }

  console.log('\n--- no signal is not signed out ---');
  /* A phone opened in airplane mode can hear "nobody is signed in" from
     Firebase Auth, which could not check the session with its server. The
     owner, with her phone offline: "it takes me to a page that says you need
     to sign in", the club still on the phone behind it. */
  {
    const club = { teams: { t1: { id: 't1', name: 'G14 Flight', players: { p1: { id: 'p1', name: 'Ella Stone' } } } }, matches: {}, access: { admins: { bossU: true }, index: { bossU: true, coachU: true }, teams: { t1: { coaches: { coachU: true } } } } };
    const drawn = A => { A.ui.view = 'roster'; A.ui.teamId = 't1'; A.render(); return String(A.dom.node('#app').innerHTML); };
    const storage = { 'sm.data.v1:FLIGHT': JSON.stringify(club), 'sm.me': JSON.stringify({ uid: 'coachU', name: 'Jaz' }) };
    const offline = () => {
      const on = [];
      return { on, opts: { storage, app: { navigator: { onLine: false }, window: { addEventListener(type, fn) { if (type === 'online') on.push(fn); } } } } };
    };
    {
      const { on, opts } = offline();
      const { A, fbk } = await boot(opts);
      fbk.signOut(); await A.flush();
      check('offline, Firebase says nobody: she is still who this phone knows', A.me && A.me.uid, 'coachU');
      check('not the lock screen', A.needsSignIn(), false);
      check('her squad is drawn', drawn(A).includes('G14 Flight'), true);
      check('and the phone still remembers her', A.cachedMe() && A.cachedMe().uid, 'coachU');
      // the signal comes back and Firebase still has nobody: that is the answer
      global.navigator.onLine = true;
      for (const fn of on) fn();
      await A.flush();
      check('back online with nobody signed in: signed out', A.me, null);
      check('the club is shut', A.needsSignIn(), true);
      check('and nothing of it drawn', drawn(A).includes('G14 Flight'), false);
    }
    {
      const { opts } = offline();
      const { A, fbk } = await boot(opts);
      fbk.signIn('coachU'); await A.flush();
      A.click({ act: 'signout' }); await A.flush();
      fbk.signOut(); await A.flush();
      check('Sign out with no signal still signs her out', A.me, null);
      check('and shuts the club', drawn(A).includes('G14 Flight'), false);
    }
    {
      const { opts } = offline();
      const { A, fbk } = await boot(opts);
      // another tab signed her out: it cleared sm.me before Firebase told this one
      A.storage.removeItem('sm.me');
      fbk.signOut(); await A.flush();
      check('signed out in another tab: not held here', A.me, null);
    }
    {
      const { A, fbk } = await boot({ storage });
      fbk.signOut(); await A.flush();
      check('online, nobody is nobody', A.me, null);
      check('and the club is shut', drawn(A).includes('G14 Flight'), false);
    }
  }

  console.log('\n--- another club\'s copy goes quiet the same way ---');
  {
    const { A } = await boot({ storage: { 'sm.me': JSON.stringify({ uid: 'coachU', name: 'Jaz' }) } });
    A.me = { uid: 'coachU', name: 'Jaz' };
    const now = H.clock.t;
    A.you.uid = 'coachU';
    A.you.clubs = {
      FRESH: { name: 'Fresh FC', at: now - 864e5, ws: { teams: {}, matches: {}, access: { org: { name: 'Fresh FC' } } }, tr: {} },
      STALE: { name: 'Stale FC', at: now - 40 * 864e5, ws: { teams: {}, matches: {}, access: { org: { name: 'Stale FC' } } }, tr: {} }
    };
    const names = A.youClubs().map(([code]) => code);
    check('a club heard from yesterday is drawn on My calendar', names.includes('FRESH'), true);
    check('one not heard from in forty days is not', names.includes('STALE'), false);
  }

  H.summary('auth and sync');
})().catch(e => { console.error('CRASH:', e && e.stack || e); process.exit(1); });
