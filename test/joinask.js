/* Joining a club by invite, and starting one, as one call to the server
   (functions/join.js; SERVER.md, *Joining and starting clubs*).

   The server half, on the fake server with functions/index.js required as
   deployed: her phone asks at joinAsks/{uid}/{id}, and the answer is written
   beside the ask. It writes roles with admin credentials and the rules never
   see it, so this does for it what rules.js does for the invitee's own
   writes: every reason the rules said no is a no here too (spent, expired,
   full, another person's email, an address not confirmed, a child or team
   that has gone, a retired club), the spend is one transaction so one invite
   is never two people's, and the grant is all of it or none of it. And a new
   club is made at a code the server makes, never one the phone names.
   The page half is in test/invites.js. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer, ORGS_MODE } = require('./fakebase');
const join = require('../functions/join');

const LATER = Date.now() + 7 * 864e5;
const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, mum: true },
    members: { adm: { name: 'Ada', email: 'ada@x.com' } },
    teams: { t1: { coaches: { coach: true } } },
    teamIndex: { t1: { coach: 'coach' } },
    teamParents: { t1: { mum: 'p1' } },
    teamPlayers: {},
    coachIndex: { coach: 't1' }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', players: {
      p1: { id: 'p1', name: 'Ella', number: '7', guardians: { mum: true } },
      p2: { id: 'p2', name: 'Rosa', number: '9' }
    } }
  },
  matches: {}
});
const inv = (extra = {}) => ({ ws: 'CLUB', role: 'parent', team: 't1', player: 'p2', by: 'adm', byName: 'Ada', expiresAt: LATER, clubName: 'Lakeside SC', teamName: 'Flight', playerNo: '9', ...extra });
function server(edit) {
  const db = {
    workspaces: { CLUB: CLUB() },
    invites: { iP: inv(), iC: inv({ role: 'coach', player: null }) },
    clubInvites: { CLUB: { iP: { role: 'parent', team: 't1' }, iC: { role: 'coach', team: 't1' } } }
  };
  for (const v of Object.values(db.invites)) for (const k of Object.keys(v)) if (v[k] === null) delete v[k];
  if (edit) edit(db);
  const S = makeServer(db);
  S.loadFunctions();
  Object.assign(S.users, {
    nia: { uid: 'nia', email: 'Nia@X.com', emailVerified: true, displayName: 'Nia' },
    raj: { uid: 'raj', email: 'raj@x.com', emailVerified: true, displayName: 'Raj' },
    lee: { uid: 'lee', email: 'lee@x.com', emailVerified: false, displayName: 'Lee' }
  });
  return S;
}
let n = 0;
const ask = (S, uid, v) => S.fire(`joinAsks/${uid}/j${++n}`, { at: Date.now(), ...v }).then(r => r.joinAsk);
const W = 'workspaces/CLUB/';
const raw = (S, p) => S.ref(p).get().then(s => s.val());

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('an ask wakes the join call', S.woken('joinAsks/nia/x').join(), 'joinAsk');
    check('its answer, written beneath it, wakes nothing', S.woken('joinAsks/nia/x/answer').length, 0);
  }

  console.log('\n--- a parent joins by invite, in one step ---');
  {
    const S = server();
    const a = await ask(S, 'nia', { op: 'invite', invite: 'iP', name: 'Nia M' });
    deepEq('she is in', [a.ok, a.ws, a.role], [true, 'CLUB', 'parent']);
    check('the answer is written beside the ask', S.at(`joinAsks/nia/j${n}/answer/ok`), true);
    check('linked to the child the invite names, by the invite', S.at(W + 'teams/t1/players/p2/guardians/nia'), 'iP');
    check('in the index, by the invite', S.at(W + 'access/index/nia'), 'iP');
    deepEq('a member, with her name as she gave it and her account\'s email', S.at(W + 'access/members/nia'), { name: 'Nia M', email: 'nia@x.com', at: S.at(W + 'access/members/nia/at') });
    check('the team\'s families table, the same as the role trigger makes it', S.at(W + 'access/teamParents/t1/nia'), 'p2');
    check('the club in her list, for every phone of hers', S.at('userOrgs/nia/CLUB/name'), 'Lakeside SC');
    const log = Object.values(S.at(W + 'access/log') || {});
    deepEq('logged', log.map(x => [x.act, x.by, x.targetName, x.team]), [['joined by invite as', 'nia', 'Parent', 't1']]);
    check('the admin\'s list says who used it', S.at('clubInvites/CLUB/iP/used/by'), 'nia');
    check('and the invite is spent and gone', S.at('invites/iP'), null);
    check('nothing about anybody else changed', [S.at(W + 'access/index/mum'), S.at(W + 'access/teamParents/t1/mum'), S.at(W + 'teams/t1/players/p1/guardians/mum')].join(), 'true,p1,true');
    deepEq('the answer says no more than where she landed', Object.keys(a).sort(), ['ok', 'role', 'tree', 'ws']);
  }
  {
    const S = server();
    const a = await ask(S, 'raj', { op: 'invite', invite: 'iC' });
    check('a coach joins', a.ok, true);
    check('named on the team', S.at(W + 'access/teams/t1/coaches/raj'), 'iC');
    check('in the team\'s table as its coach', S.at(W + 'access/teamIndex/t1/raj'), 'coach');
    check('and the coaches\' index', S.at(W + 'access/coachIndex/raj'), 't1');
    check('with the name her account has, when her phone sent none', S.at(W + 'access/members/raj/name'), 'Raj');
  }

  console.log('\n--- what the rules said no to, the server says no to ---');
  {
    const no = async (label, edit, uid, why, invite = 'iP') => {
      const S = server(edit);
      const before = JSON.stringify(S.tree.workspaces || S.tree);
      const a = await ask(S, uid, { op: 'invite', invite });
      check(label, a.why, why);
      check('— and nothing of the club changed', JSON.stringify(S.tree.workspaces || S.tree), before);
    };
    await no('an invite that is not there', null, 'nia', 'gone', 'iNope');
    await no('an invite spent by somebody else', db => { db.invites.iP.used = { by: 'mum', at: 1 }; }, 'nia', 'taken');
    await no('an invite past its date', db => { db.invites.iP.expiresAt = Date.now() - 1; }, 'nia', 'expired');
    await no('an invite for another email', db => { db.invites.iP.email = 'someone@x.com'; }, 'nia', 'wrongemail');
    await no('her email, but not confirmed', db => { db.invites.iP.email = 'lee@x.com'; }, 'lee', 'unverified');
    await no('the child it names is gone from the squad', db => { delete db.workspaces.CLUB.teams.t1.players.p2; }, 'nia', 'gone');
    await no('a club that has been retired', db => { db.retired = { CLUB: true }; }, 'nia', 'gone');
    await no('a club being moved: later', db => { db.serverState = { moving: { CLUB: { by: 'adm', at: 1 } } }; }, 'nia', 'moving');
    await no('a role no invite gives', db => { db.invites.iP.role = 'admin'; }, 'nia', 'gone');
    if (!ORGS_MODE) await no('a club viewer on a club still on the old tree', db => { db.invites.iP = inv({ role: 'viewer', team: null, player: null }); delete db.invites.iP.team; delete db.invites.iP.player; }, 'nia', 'gone');
    const S = server();
    const a = await S.fire('joinAsks/nia/old', { op: 'invite', invite: 'iP', at: Date.now() - 3600000 });
    check('an ask an hour old is not acted on', [a.joinAsk.why, S.at('invites/iP/used')].join(), 'stale,');
  }
  {
    // one invite, two people at once: the transaction gives it to one
    const S = server();
    const [a, b] = await Promise.all([ask(S, 'nia', { op: 'invite', invite: 'iP' }), ask(S, 'raj', { op: 'invite', invite: 'iP' })]);
    // whichever lost finds it spent, or already gone
    check('one invite, two people: one is in, the other told', [a.ok, b.ok, ['taken', 'gone'].includes(b.why)].join(), 'true,false,true');
    check('and only one of them has the child', [S.at(W + 'teams/t1/players/p2/guardians/nia'), S.at(W + 'teams/t1/players/p2/guardians/raj')].join(), 'iP,');
  }
  {
    // a write that fails after the spend: hers, half finished, and asking again finishes it
    const S = server();
    const env = {
      get: p => S.ref(p).get().then(s => s.val()), set: (p, v) => S.ref(p).set(v), remove: p => S.ref(p).remove(),
      update: () => Promise.reject(new Error('unavailable')),
      claim: (p, fn) => S.ref(p).transaction(fn).then(r => !!r.committed), user: uid => Promise.resolve(S.users[uid] || null)
    };
    const a = await join.onAsk(env, { uid: 'nia', id: 'f1' }, { op: 'invite', invite: 'iP', at: Date.now() });
    check('the grant could not be written: she is told', a.why, 'failed');
    check('the invite stays spent by her, and nothing else is written', [S.at('invites/iP/used/by'), S.at(W + 'access/index/nia')].join(), 'nia,');
    const b = await ask(S, 'nia', { op: 'invite', invite: 'iP' });
    check('asking again finishes it', [b.ok, S.at(W + 'access/index/nia')].join(), 'true,iP');
    const c = await join.onAsk(env, { uid: 'nia', id: 'f1' }, { op: 'invite', invite: 'iP', at: Date.now() });
    check('an ask delivered twice is answered once', c.why, 'answered');
  }

  console.log('\n--- a link for several people: a seat each ---');
  {
    const S = server(db => { db.invites.mLink = inv({ max: 2, seats: { s1: true, s2: true } }); db.clubInvites.CLUB.mLink = { role: 'parent', team: 't1', max: 2 }; });
    const a = await ask(S, 'nia', { op: 'invite', invite: 'mLink' });
    const b = await ask(S, 'raj', { op: 'invite', invite: 'mLink' });
    S.users.zed = { email: 'z@x.com', emailVerified: true, displayName: 'Zed' };
    const c = await ask(S, 'zed', { op: 'invite', invite: 'mLink' });
    deepEq('two seats: two people in, the third told it is full', [a.ok, b.ok, c.why], [true, true, 'full']);
    deepEq('each holds her own seat', [S.at('invites/mLink/took/nia'), S.at('invites/mLink/took/raj')], ['s1', 's2']);
    check('the link stays for the others, until its date', !!S.at('invites/mLink'), true);
    check('the admin\'s list has each', Object.keys(S.at('clubInvites/CLUB/mLink/took') || {}).sort().join(), 'nia,raj');
    const d = await ask(S, 'nia', { op: 'invite', invite: 'mLink' });
    check('one who already holds a seat asking again keeps it', [d.ok, S.at('invites/mLink/took/nia'), Object.keys(S.at('invites/mLink/seat')).length].join(), 'true,s1,2');
  }

  if (ORGS_MODE) {
    console.log('\n--- a fan, and a club viewer (orgs/ only) ---');
    const S = server(db => {
      db.invites.iF = inv({ role: 'fan' });
      db.invites.iFa = inv({ role: 'fan', approved: true });
      db.invites.iV = inv({ role: 'viewer' }); delete db.invites.iV.team; delete db.invites.iV.player;
    });
    const a = await ask(S, 'nia', { op: 'invite', invite: 'iF' });
    check('a fan her family asked for only asks', [a.ok, a.asked].join(), 'true,true');
    check('on the coach\'s list, naming the invite', S.at('claims/CLUB/t1/nia/invite'), 'iF');
    check('and is not let in', [S.at(W + 'teams/t1/players/p2/fans/nia'), S.at(W + 'access/index/nia')].join(), ',');
    const b = await ask(S, 'raj', { op: 'invite', invite: 'iFa' });
    check('a fan the coach let in is in', [b.ok, S.at(W + 'teams/t1/players/p2/fans/raj'), S.at(W + 'access/index/raj')].join(), 'true,iFa,iFa');
    check('named where her player\'s family reads it', S.at(W + 'teams/t1/players/p2/fanNames/raj'), 'Raj');
    check('in the team\'s fans table', S.at(W + 'access/teamFans/t1/raj'), 'p2');
    S.users.vic = { email: 'v@x.com', emailVerified: true, displayName: 'Vic' };
    const c = await ask(S, 'vic', { op: 'invite', invite: 'iV' });
    check('a club viewer is in', [c.ok, S.at(W + 'access/viewers/vic'), S.at(W + 'access/index/vic')].join(), 'true,iV,iV');
  }

  console.log('\n--- a new club, at a code the server makes ---');
  {
    const S = server();
    const a = await ask(S, 'nia', { op: 'club', name: 'Hillside FC', you: 'Nia M' });
    check('made', a.ok, true);
    check('at a long random code', /^sm-[0-9a-f]{32}$/.test(a.ws), true);
    const O = 'orgs/' + a.ws;
    const [adm, own, idx, mem, name, names] = await Promise.all(['/access/admins/nia', '/access/owners/nia', '/access/index/nia', '/members/nia', '/org/name', '/names/nia'].map(p => raw(S, O + p)));
    deepEq('on orgs/, with her as its admin, its owner and in its index', [adm, own, idx], [true, true, true]);
    deepEq('a member, with her account\'s email', [mem.name, mem.email], ['Nia M', 'nia@x.com']);
    deepEq('named', [name, names && names.name], ['Hillside FC', 'Nia M']);
    check('in her list of clubs', S.at(`userOrgs/nia/${a.ws}/name`), 'Hillside FC');
    if (!ORGS_MODE) check('nothing on the old tree', await raw(S, 'workspaces/' + a.ws), null);
    const b = await ask(S, 'nia', { op: 'club', name: 'Hillside FC' });
    check('another club is another code', b.ws !== a.ws && b.ok, true);
    check('a club with no name is not made', (await ask(S, 'nia', { op: 'club', name: '  ' })).why, 'name');
    // a code that happens to be taken is never written over
    const env = {
      get: p => S.ref(p).get().then(s => s.val()), set: (p, v) => S.ref(p).set(v), remove: p => S.ref(p).remove(),
      update: patch => S.ref('').update(patch), claim: (p, fn) => S.ref(p).transaction(fn).then(r => !!r.committed),
      user: uid => Promise.resolve(S.users[uid] || null)
    };
    const codes = ['CLUB', a.ws, 'sm-fresh'];
    const c = await join.onAsk({ ...env, newCode: () => codes.shift() }, { uid: 'raj', id: 'c1' }, { op: 'club', name: 'Mine', at: Date.now() });
    check('a code already taken, on either tree, is passed over', c.ws, 'sm-fresh');
    check('and the club there untouched', [S.at(W + 'access/admins/raj'), await raw(S, `orgs/${a.ws}/access/admins/raj`)].join(), ',');
  }

  H.summary('joining and starting a club, as one call to the server');
})().catch(e => { console.error(e); process.exit(1); });
