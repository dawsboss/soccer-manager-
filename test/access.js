/* The lookup tables the rules read, kept by the server (functions/access.js;
   SERVER.md, "The lookup tables the rules read").

   Until this, access/index, teamIndex, teamParents, teamPlayers and
   coachIndex were rebuilt only when an admin's or a coach's phone connected,
   so a parent the coach unlinked kept her way in until one did. These
   triggers write what the rules read with admin credentials, which is the
   most dangerous thing the server does: an entry too many is somebody let
   into a club, one too few is a coach locked out of her own team at a game.
   So this checks, on the deployed file and the fake server:

   - every kind of change to a role, for every kind of account, and that
     what the change was not about is left exactly as it was;
   - that it never closes a bridge (a table that does not exist yet stays
     missing) and never rewrites an index entry that is there;
   - that it works from what the club holds now, so an event delivered late
     or twice leaves the tables right;
   - that game-day writes, and a team saved whole with nobody's role changed,
     wake none of it;
   - and that it gives the same answer as the phones do (app.js), which go on
     doing it for clubs without the server. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer } = require('./fakebase');
const access = require('../functions/access');

const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, coach2: true, trk: true, mum: 'inv_mum', dad: true, twice: 't1', ella: true },
    members: {},
    teams: {
      t1: { coaches: { coach: true }, trackers: { trk: true } },
      t2: { coaches: { coach2: true, coach: true } }
    },
    teamIndex: { t1: { coach: 'coach', trk: 'tracker' }, t2: { coach2: 'coach', coach: 'coach' } },
    teamParents: { t1: { mum: 'p1', twice: 'p1' }, t2: { dad: 'q1', twice: 'q1' } },
    teamPlayers: { t1: { ella: 'p1' } },
    coachIndex: { coach: 't2', coach2: 't2' }
  },
  teams: {
    t1: {
      id: 't1', name: 'Flight',
      players: {
        p1: { id: 'p1', name: 'Ella', guardians: { mum: 'inv_mum', twice: true }, self: { ella: true } },
        p2: { id: 'p2', name: 'Rosa', guardians: { mum: true } }
      },
      events: { e1: { date: '2026-10-10', start: '18:00', kind: 'practice' } }
    },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Gia', guardians: { dad: true, twice: true } } } }
  },
  matches: { g1: { id: 'g1', teamId: 't1', date: '2026-10-11' } }
});
const BOOKMARKS = () => {
  const o = {};
  for (const u of ['adm', 'coach', 'coach2', 'trk', 'mum', 'dad', 'twice', 'ella']) o[u] = { CLUB: { name: 'Lakeside SC', at: 1 }, ELSE: { name: 'Elsewhere', at: 1 } };
  return o;
};
function server(edit) {
  const club = CLUB();
  if (edit) edit(club);
  const S = makeServer({
    workspaces: { CLUB: club, ELSE: { access: { admins: { x: true } } } },
    userOrgs: BOOKMARKS(),
    invites: { inv_mum: { ws: 'CLUB', role: 'parent' }, t1: { ws: 'ELSE', role: 'coach' } }
  });
  S.loadFunctions();
  return S;
}
const W = 'workspaces/CLUB/';
// the database keeps no empty node; the fake does, so an emptied one reads as gone here too
const A_ = (S, p) => { const v = S.at(W + 'access/' + p); return v && typeof v === 'object' && !Object.keys(v).length ? null : v; };
// the club and everything around it, without the server's own notes (serverState/, which no phone reads)
const club = S => { const t = JSON.parse(JSON.stringify(S.tree)); delete t.serverState; return t; };
// key order is not the database's business
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x));
// everything under the club except the tables a change to `who` may move
const rest = S => canon({ ...S.at('workspaces/CLUB'), access: { ...S.at(W + 'access'), index: null, teamIndex: null, teamParents: null, teamPlayers: null, coachIndex: null, helperIndex: null } });

(async () => {

  console.log('--- the triggers that are deployed ---');
  {
    const S = server();
    deepEq('one per place a role lives', Object.keys(S.triggers).filter(n => /^access/.test(n)).sort(), 
      // each once per tree while clubs move to orgs/ (functions/index.js, both())
      ['accessAdmin', 'accessAdminOrgs', 'accessGuardians', 'accessGuardiansOrgs', 'accessSelf', 'accessSelfOrgs', 'accessStaff', 'accessStaffOrgs']);
    // and who runs the club is told (adminwatch.js, test/owners.js)
    deepEq('an admin given', (await S.wouldWake(W + 'access/admins/new', true)).sort(), ['accessAdmin', 'watchAdmin']);
    // the share pages wake on play and on a player (mirror.js, test/mirror.js); what is asked here is the tables
    const mine = ns => ns.filter(n => !/^(publish|mirror)/.test(n));
    deepEq('a coach given', mine(await S.wouldWake(W + 'access/teams/t1/coaches/new', true)), ['accessStaff']);
    deepEq('a family linked', mine(await S.wouldWake(W + 'teams/t1/players/p2/guardians/new', true)), ['accessGuardians']);
    deepEq('a player\'s own sign-in', mine(await S.wouldWake(W + 'teams/t1/players/p2/self/new', true)), ['accessSelf']);
    const g = S.at(W + 'matches/g1');
    check('a goal wakes none of it', mine(await S.wouldWake(W + 'matches/g1/events/x1', { type: 'goal', t: 60 })).length, 0);
    check('nor a sub', mine(await S.wouldWake(W + 'matches/g1/stints/s1', { pid: 'p1', start: 0 })).length, 0);
    check('nor a whole game saved', mine(await S.wouldWake(W + 'matches/g1', { ...g, score: 2 })).length, 0);
    check('nor a player\'s number', mine(await S.wouldWake(W + 'teams/t1/players/p1/number', '8')).length, 0);
    check('nor the register', mine(await S.wouldWake(W + 'teams/t1/attend/e1/p1', true)).length, 0);
    const t = S.at(W + 'teams/t1');
    check('nor the whole team saved with nobody\'s role changed', mine(await S.wouldWake(W + 'teams/t1', { ...t, name: 'Flight FC' })).length, 0);
    const t2 = JSON.parse(JSON.stringify(t)); t2.players.p2.guardians.newmum = true;
    deepEq('the whole team saved with one family added wakes that player\'s alone', mine(await S.wouldWake(W + 'teams/t1', t2)), ['accessGuardians']);
    check('a member\'s name changed wakes nothing', (await S.wouldWake(W + 'access/members/mum', { name: 'Mo' })).length, 0);
    check('nor the tables themselves, so it never wakes itself', (await S.wouldWake(W + 'access/index/zz', true)).length + (await S.wouldWake(W + 'access/teamParents/t1/zz', 'p1')).length, 0);
  }

  console.log('--- a family unlinked: gap 5, closed ---');
  {
    const S = server();
    const plain = server(); plain.put(W + 'teams/t1/players/p1/guardians/twice', null);
    const before = rest(plain);   // the change itself, and nothing the server did
    await S.fire(W + 'teams/t1/players/p1/guardians/twice', null);
    check('she still has a child on another team, so she stays in the club', A_(S, 'index/twice'), 't1');
    check('her entry\'s value is kept, not rewritten', A_(S, 'index/twice'), 't1');
    check('but she is no longer a family on this team', A_(S, 'teamParents/t1/twice'), null);
    check('and still is on the other', A_(S, 'teamParents/t2/twice'), 'q1');
    check('her bookmark to the club stays', !!S.at('userOrgs/twice/CLUB'), true);
    check('her entry named a team, not one of this club\'s invites, so no invite is touched', !!S.at('invites/t1'), true);
    check('nobody else\'s entry moved', JSON.stringify(A_(S, 'teamParents/t1')), JSON.stringify({ mum: 'p1' }));
    check('and nothing else in the club changed', rest(S), before);
  }
  {
    const S = server();
    await S.fire(W + 'teams/t1/players/p1/guardians/mum', null);
    check('a family with a second child on the team keeps her place, pointed at that child', A_(S, 'teamParents/t1/mum'), 'p2');
    check('and stays in the club', A_(S, 'index/mum'), 'inv_mum');
    await S.fire(W + 'teams/t1/players/p2/guardians/mum', null);
    check('her last child unlinked: out of the team\'s families', A_(S, 'teamParents/t1/mum'), null);
    check('out of the club', A_(S, 'index/mum'), null);
    check('the invite her entry named goes with it, as the phone does', S.at('invites/inv_mum'), null);
    check('her bookmark to this club goes, so no other phone of hers opens it', S.at('userOrgs/mum/CLUB'), null);
    check('her bookmark to another club stays', !!S.at('userOrgs/mum/ELSE'), true);
    check('the rest of the club\'s index is untouched', JSON.stringify(Object.keys(A_(S, 'index')).sort()), JSON.stringify(['adm', 'coach', 'coach2', 'dad', 'ella', 'trk', 'twice']));
  }
  {
    const S = server();
    const t = S.at(W + 'teams/t1'); delete t.players.p2;
    await S.fire(W + 'teams/t1', t);
    check('a player deleted with the team saved whole: her family moves to the child still here', A_(S, 'teamParents/t1/mum'), 'p1');
    const S2 = server();
    await S2.fire(W + 'teams/t1', null);
    check('a team deleted: its families\' entries go', A_(S2, 'teamParents/t1'), null);
    check('its player\'s own sign-in too', A_(S2, 'teamPlayers/t1'), null);
    check('a family only on that team leaves the club', A_(S2, 'index/mum'), null);
    check('one with a child elsewhere stays', A_(S2, 'index/twice'), 't1');
  }

  console.log('--- a family linked ---');
  {
    const S = server();
    await S.fire(W + 'teams/t2/players/q1/guardians/newmum', 'inv_new');
    check('she is a family on the team, naming her child', A_(S, 'teamParents/t2/newmum'), 'q1');
    check('in the club', A_(S, 'index/newmum'), true);
    check('with a bookmark, so her second phone finds the club', JSON.stringify(S.at('userOrgs/newmum/CLUB')), JSON.stringify({ name: 'Lakeside SC', at: S.at('userOrgs/newmum/CLUB').at }));
    check('nothing on the team she is not on', A_(S, 'teamParents/t1/newmum'), null);
    // the invitee's own phone then writes her entry with the invite id, as redeemInvite() does
    S.put(W + 'access/index/newmum', 'inv_new');
    await S.fire(W + 'teams/t2/players/q1/guardians/newmum', true);
    check('a later run keeps the value her phone wrote', A_(S, 'index/newmum'), 'inv_new');
  }
  {
    const S = server(c => { delete c.access.teamParents; });
    await S.fire(W + 'teams/t2/players/q1/guardians/newmum', true);
    check('a club with no teamParents table yet: the server does not start one (the bridge)', A_(S, 'teamParents'), null);
    check('but she is still let into the club', A_(S, 'index/newmum'), true);
    await S.fire(W + 'teams/t1/players/p1/guardians/twice', null);
    check('nor is it started by an unlinking', A_(S, 'teamParents'), null);
  }
  {
    const S = server(c => { delete c.access.index; });
    await S.fire(W + 'access/admins/first', true);
    check('a club with no index at all is being made: its first admin writes it herself', A_(S, 'index'), null);
  }

  console.log('--- coaches and trackers ---');
  {
    const S = server();
    await S.fire(W + 'access/teams/t1/coaches/newc', 'inv_c');
    check('a coach given: the team\'s index says coach', A_(S, 'teamIndex/t1/newc'), 'coach');
    check('she is a coach of a team, for the training rules', A_(S, 'coachIndex/newc'), 't1');
    check('in the club', A_(S, 'index/newc'), true);
    check('the team\'s other entries as they were', JSON.stringify(A_(S, 'teamIndex/t1')), JSON.stringify({ trk: 'tracker', coach: 'coach', newc: 'coach' }));
    await S.fire(W + 'access/teams/t1/coaches/trk', true);
    check('a tracker made coach as well: coach wins', A_(S, 'teamIndex/t1/trk'), 'coach');
    await S.fire(W + 'access/teams/t1/coaches/trk', null);
    check('and back to tracker when that goes', A_(S, 'teamIndex/t1/trk'), 'tracker');
    check('a tracker is no coach of any team', A_(S, 'coachIndex/trk'), null);
    check('and stays in the club', A_(S, 'index/trk'), true);
  }
  {
    const S = server();
    await S.fire(W + 'access/teams/t1/coaches/coach', null);
    check('a coach of two teams loses one: off that team\'s index', A_(S, 'teamIndex/t1/coach'), null);
    check('her coachIndex already named the other, so it is left alone', A_(S, 'coachIndex/coach'), 't2');
    check('and she stays in the club', A_(S, 'index/coach'), true);
    await S.fire(W + 'access/teams/t2/coaches/coach', null);
    check('then the other: no longer a coach of anything', A_(S, 'coachIndex/coach'), null);
    check('nor in the club', A_(S, 'index/coach'), null);
    check('her bookmark goes', S.at('userOrgs/coach/CLUB'), null);
    check('the other coach of that team is untouched', A_(S, 'coachIndex/coach2'), 't2');
  }
  {
    const S = server();
    await S.fire(W + 'access/teams/t2/coaches/coach', null);
    check('the team her coachIndex named goes, while she still coaches another: it moves there', A_(S, 'coachIndex/coach'), 't1');
  }
  {
    const S = server();
    await S.fire(W + 'access/teams/t1', null);
    check('a team\'s staff withdrawn whole: its index goes', A_(S, 'teamIndex/t1'), null);
    check('the tracker with no other role leaves the club', A_(S, 'index/trk'), null);
    check('the coach of another team stays', A_(S, 'index/coach'), true);
  }
  {
    const S = server(c => { delete c.access.teamIndex; });
    await S.fire(W + 'access/teams/t1/coaches/newc', true);
    check('a club with no teamIndex yet: not started by one coach (the bridge)', A_(S, 'teamIndex'), null);
    check('coachIndex has no bridge, so it is written', A_(S, 'coachIndex/newc'), 't1');
  }

  console.log('--- team helpers (AUTH.md, *More kinds of people*, 2) ---');
  {
    const S = server();
    await S.fire(W + 'access/teams/t1/helpers/hlp', 'inv_h');
    check('a helper given: the team\'s index says helper', A_(S, 'teamIndex/t1/hlp'), 'helper');
    check('her helperIndex names the team, for the training rules', A_(S, 'helperIndex/hlp'), 't1');
    check('she is never in the coaches\' index', A_(S, 'coachIndex/hlp'), null);
    check('in the club', A_(S, 'index/hlp'), true);
    check('with a bookmark', !!S.at('userOrgs/hlp/CLUB'), true);
    check('the team\'s other entries as they were', canon(A_(S, 'teamIndex/t1')), canon({ coach: 'coach', trk: 'tracker', hlp: 'helper' }));
    await S.fire(W + 'access/teams/t1/helpers/trk', true);
    check('a tracker who helps as well stays tracker in the index', A_(S, 'teamIndex/t1/trk'), 'tracker');
    check('— and is in helperIndex all the same', A_(S, 'helperIndex/trk'), 't1');
    await S.fire(W + 'access/teams/t1/helpers/coach', true);
    check('a coach who helps too stays coach', A_(S, 'teamIndex/t1/coach'), 'coach');
    await S.fire(W + 'access/teams/t1/helpers/hlp', null);
    check('taken away: off the team\'s index', A_(S, 'teamIndex/t1/hlp'), null);
    check('— out of helperIndex', A_(S, 'helperIndex/hlp'), null);
    check('— out of the club, with no other role', A_(S, 'index/hlp'), null);
    check('— and her bookmark goes', S.at('userOrgs/hlp/CLUB'), null);
    await S.fire(W + 'access/teams/t1/helpers/trk', null);
    check('the tracker\'s help taken away: still tracker', A_(S, 'teamIndex/t1/trk'), 'tracker');
    check('— out of helperIndex', A_(S, 'helperIndex/trk'), null);
    check('— still in the club', A_(S, 'index/trk'), true);
  }
  {
    const S = server(c => { c.access.teams.t2.helpers = { h2: true }; c.access.teams.t1.helpers = { h2: true }; c.access.helperIndex = { h2: 't2' }; c.access.index.h2 = true; });
    await S.fire(W + 'access/teams/t2/helpers/h2', null);
    check('a helper of two teams loses the one helperIndex named: it moves to the other', A_(S, 'helperIndex/h2'), 't1');
    check('— and she stays in the club', A_(S, 'index/h2'), true);
  }
  {
    const S = server(c => { c.access.members.hlp = { name: 'Hal', email: 'hal@example.com' }; });
    await S.fire(W + 'access/teams/t1/helpers/hlp', true);
    check('on the old tree there is no names/ to write', S.at(W + 'names'), null);
  }

  console.log('--- admins, and a player\'s own sign-in ---');
  {
    const S = server();
    await S.fire(W + 'access/admins/new', true);
    check('an admin given is in the club', A_(S, 'index/new'), true);
    check('with a bookmark', !!S.at('userOrgs/new/CLUB'), true);
    await S.fire(W + 'access/admins/new', null);
    check('and taken away, is out of it', A_(S, 'index/new'), null);
    await S.fire(W + 'access/admins/coach', true);
    await S.fire(W + 'access/admins/coach', null);
    check('an admin who also coaches keeps her place when the admin role goes', A_(S, 'index/coach'), true);
  }
  {
    const S = server();
    await S.fire(W + 'teams/t1/players/p2/self/rosa', 'inv_r');
    check('a player given her own sign-in: teamPlayers names her record', A_(S, 'teamPlayers/t1/rosa'), 'p2');
    check('in the club', A_(S, 'index/rosa'), true);
    check('never a family', A_(S, 'teamParents/t1/rosa'), null);
    await S.fire(W + 'teams/t1/players/p1/self/ella', null);
    check('taken away: out of teamPlayers', A_(S, 'teamPlayers/t1/ella'), null);
    check('and the club', A_(S, 'index/ella'), null);
    check('her parents keep theirs', A_(S, 'teamParents/t1/mum'), 'p1');
  }
  {
    const S = server(c => { delete c.access.teamPlayers; });
    await S.fire(W + 'teams/t1/players/p2/self/rosa', true);
    check('teamPlayers has no bridge, so the first entry is written', A_(S, 'teamPlayers/t1/rosa'), 'p2');
  }

  console.log('--- late, twice, and what it will not do ---');
  {
    const S = server();
    const ev = { params: { code: 'CLUB', tid: 't1', pid: 'p1' }, data: { before: { val: () => ({ mum: true, twice: true }), ref: S.ref(W + 'teams/t1/players/p1/guardians') }, after: { val: () => ({ twice: true }), ref: S.ref(W + 'teams/t1/players/p1/guardians') } } };
    // the removal's event arrives after mum was linked again: the club, not the event, decides
    // the trigger on the tree this pass keeps its clubs on
    const guardians = S.triggers[require('./fakebase').ORGS_MODE ? 'accessGuardiansOrgs' : 'accessGuardians'];
    await guardians.handler(ev);
    check('a removal delivered after she was linked again keeps her', A_(S, 'teamParents/t1/mum'), 'p1');
    check('and her place in the club', A_(S, 'index/mum'), 'inv_mum');
    const before = JSON.stringify(club(S));
    await guardians.handler(ev);
    check('the same event twice changes nothing', JSON.stringify(club(S)), before);
  }
  {
    const S = server();
    S.put('retired/CLUB', true);
    const before = canon(club(S));
    await S.fire(W + 'teams/t1/players/p1/guardians/mum', null);
    S.put(W + 'teams/t1/players/p1/guardians/mum', 'inv_mum');
    check('a retired club is left exactly as it was', canon(club(S)), before);
  }
  {
    const S = server();
    const env = { get: p => S.ref(p).get().then(s => s.val()), set: (p, v) => S.ref(p).set(v), remove: p => S.ref(p).remove() };
    const before = JSON.stringify(S.tree);
    await access.settle(env, '../CLUB', { uids: ['mum'] });
    await access.settle(env, 'CLUB', { uids: ['a/b', '.x'], tids: ['t1/../t2'], parents: true });
    check('a code or id with a path in it is never followed', JSON.stringify(S.tree), before);
    await access.settle(env, 'NOWHERE', { uids: ['mum'] });
    check('a club that is not there writes nothing of its own', S.at('workspaces/NOWHERE'), null);
    check('and leaves her bookmarks to real clubs alone', !!S.at('userOrgs/mum/CLUB'), true);
  }
  {
    const S = server();
    S.put('invites/inv_mum/ws', 'ELSE');
    await S.fire(W + 'teams/t1/players/p1/guardians/mum', null);
    await S.fire(W + 'teams/t1/players/p2/guardians/mum', null);
    check('an invite another club owns is never deleted on this one\'s say', !!S.at('invites/inv_mum'), true);
  }

  console.log('--- the same answer the phones give ---');
  {
    const A = H.loadApp({});
    const club = CLUB();
    // a messier club: a player listing two families, a family on two players, a coach who also tracks
    club.teams.t1.players.p3 = { id: 'p3', name: 'Ivy', guardians: { dad: true, mum: true }, self: { ivy: true } };
    club.access.teams.t2.trackers = { coach: true, trk: true };
    // and helpers: one alone, one who also tracks, a coach who also helps
    club.access.teams.t1.helpers = { hlp: true, trk: true };
    club.access.teams.t2.helpers = { coach: true, hlp2: true };
    A.state = club; A.me = { uid: 'adm', name: 'adm' }; A.appOwners = {};
    const f = { access: club.access, teams: club.teams };
    for (const tid of ['t1', 't2']) {
      deepEq(`teamParents for ${tid}`, access.linkedWanted(f, tid, 'guardians'), A.parentsWanted(tid));
      deepEq(`teamPlayers for ${tid}`, access.linkedWanted(f, tid, 'self'), A.playersWanted(tid));
      const want = {};
      for (const u of Object.keys(club.access.teams[tid].helpers || {})) want[u] = 'helper';
      for (const u of Object.keys(club.access.teams[tid].trackers || {})) want[u] = 'tracker';
      for (const u of Object.keys(club.access.teams[tid].coaches || {})) want[u] = 'coach';
      deepEq(`teamIndex for ${tid}`, access.teamIndexWanted(f, tid), want);
    }
    for (const u of ['adm', 'coach', 'coach2', 'trk', 'mum', 'dad', 'twice', 'ella', 'ivy', 'hlp', 'hlp2', 'nobody']) {
      check(`whether ${u} has a role`, access.hasRole(f, u), A.hasAnyRole(u));
      check(`which team ${u}'s coachIndex names`, access.coachTeamOf(f, u), A.coachTeamOf(u));
      check(`which team ${u}'s helperIndex names`, access.helperTeamOf(f, u), A.helperTeamOf(u));
      // the staff name families read: the server's isStaff() and the phone's staffName() agree on who is staff
      check(`whether ${u} is staff`, access.isStaff(f, u), A.isStaffAnywhere(u));
    }
  }

  H.summary('the lookup tables the rules read, kept by the server');
})().catch(e => { console.error(e); process.exit(1); });
