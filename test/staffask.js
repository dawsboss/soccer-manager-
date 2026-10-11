/* A coach's or an admin's letting-in as one server call (functions/staff.js;
   SERVER.md, *Joining and starting clubs*), on the fake server with
   functions/index.js required as deployed.

   The server writes roles and invites with admin credentials, so this holds
   it to what the rules held the phones to: a team-link request approved by
   an admin or that team's coach alone, for children on the squad, with the
   approval, the family on each record, her index entry naming the team, her
   member entry and the log in one write and the tables following; a fan's
   ask the same way, with her name for the family and the fans table; a
   squad's parent links only from an admin, one per child with no parent and
   no open invite, with the limits she chose and nothing a child's name on
   the invite; an imported roster's invites one email-bound each, nobody who
   has the role or an open invite already; a tracker, a family, a stranger,
   a stale ask and a retired club refused with nothing written; an ask
   answered once. The page half (asked of the server first, the phone's own
   writes where it cannot be asked) is in test/join.js and test/invites.js. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer } = require('./fakebase');
const staff = require('../functions/staff');

const LATER = Date.now() + 7 * 864e5;
const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, trk: true, mum: true, other: true },
    members: { adm: { name: 'Ada', email: 'ada@x.com' }, coach: { name: 'Jaz', email: 'jaz@x.com' }, mum: { name: 'Mo', email: 'mo@x.com' }, other: { name: 'Kim', email: 'kim@x.com' } },
    teams: { t1: { coaches: { coach: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach', trk: 'tracker' }, t2: { other: 'coach' } },
    teamParents: { t1: { mum: 'p1' } },
    coachIndex: { coach: 't1', other: 't2' }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', players: {
      p1: { id: 'p1', name: 'Ella', number: '7', active: true, guardians: { mum: true } },
      p2: { id: 'p2', name: 'Bea', number: '9', active: true },
      p3: { id: 'p3', name: 'Cleo', number: '4', active: true },
      p4: { id: 'p4', name: 'Dot', number: '5', active: false }
    } },
    t2: { id: 't2', name: 'Storm', players: { q1: { id: 'q1', name: 'Gia', number: '9', active: true } } }
  },
  matches: {}
});
function server(edit) {
  const db = {
    workspaces: { CLUB: CLUB() },
    claims: { CLUB: { t1: {
      sam: { code: 'jcode', shirt: '9', name: 'Sam', email: 'sam@x.com', at: 1 },
      aunt: { invite: 'iFan', player: 'p2', name: 'Aunt Vi', email: 'vi@x.com', at: 1 },
      done: { code: 'jcode', shirt: '4', name: 'Done', at: 1, approved: { by: 'coach', at: 1 } }
    } } },
    clubInvites: { CLUB: { iOpen: { role: 'parent', team: 't1', player: 'p3', playerName: 'Cleo', at: 1, expiresAt: LATER } } },
    invites: { iOpen: { ws: 'CLUB', role: 'parent', team: 't1', player: 'p3', by: 'adm', expiresAt: LATER } }
  };
  if (edit) edit(db);
  const S = makeServer(db);
  S.loadFunctions();
  return S;
}
let n = 0;
const ask = (S, uid, v) => S.fire(`staffAsks/CLUB/${uid}/s${++n}`, { at: Date.now(), ...v }).then(r => r.staffAsk);
const W = 'workspaces/CLUB/';
const NAMES = ['Ella', 'Bea', 'Cleo', 'Dot', 'Gia'];

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('an ask wakes the call', S.woken('staffAsks/CLUB/coach/x').join(), 'staffAsk');
    check('its answer wakes nothing', S.woken('staffAsks/CLUB/coach/x/answer').length, 0);
  }

  console.log('\n--- a team-link request approved ---');
  {
    const S = server();
    const a = await ask(S, 'coach', { op: 'approve', tid: 't1', uid: 'sam', pids: ['p2', 'p9'] });
    deepEq('the team\'s coach approves, for the children on the squad', [a.ok, a.pids], [true, ['p2']]);
    deepEq('the approval, naming them', [S.at('claims/CLUB/t1/sam/approved/by'), Object.keys(S.at('claims/CLUB/t1/sam/approved/players'))], ['coach', ['p2']]);
    check('she is that child\'s parent', S.at(W + 'teams/t1/players/p2/guardians/sam'), true);
    check('indexed with the team id the rule checks', S.at(W + 'access/index/sam'), 't1');
    deepEq('a member, from the request', [S.at(W + 'access/members/sam/name'), S.at(W + 'access/members/sam/email')], ['Sam', 'sam@x.com']);
    check('on the team\'s parent list', S.at(W + 'access/teamParents/t1/sam'), 'p2');
    check('and in her list of clubs', !!S.at('userOrgs/sam/CLUB'), true);
    const log = Object.values(S.at(W + 'access/log') || {});
    deepEq('logged, by her, naming the child to the admins', log.map(x => [x.act, x.by, x.target, x.player]), [['approved as parent', 'coach', 'sam', 'Bea']]);
    check('answered beside the ask', S.at(`staffAsks/CLUB/coach/s${n}/answer/ok`), true);
    check('an admin may too', (await ask(S, 'adm', { op: 'approve', tid: 't1', uid: 'sam', pids: ['p3'] })).why, 'approved');
  }
  {
    const no = async (label, uid, v, why) => {
      const S = server();
      const before = JSON.stringify([S.at('workspaces'), S.at('claims'), S.at('invites'), S.at('clubInvites')]);
      const a = await ask(S, uid, v);
      check(label, a.why, why);
      check('— and nothing was written', JSON.stringify([S.at('workspaces'), S.at('claims'), S.at('invites'), S.at('clubInvites')]), before);
    };
    const v = { op: 'approve', tid: 't1', uid: 'sam', pids: ['p2'] };
    await no('a coach of another team is refused', 'other', v, 'notyours');
    await no('a tracker', 'trk', v, 'notyours');
    await no('a family', 'mum', v, 'notyours');
    await no('a stranger', 'rando', v, 'notyours');
    await no('a request already approved', 'coach', { ...v, uid: 'done', pids: ['p3'] }, 'approved');
    await no('a request that is not there', 'coach', { ...v, uid: 'nobody' }, 'gone');
    await no('a fan\'s ask is not a family\'s', 'coach', { ...v, uid: 'aunt' }, 'gone');
    await no('no child on the squad picked', 'coach', { ...v, pids: ['p9'] }, 'bad');
    await no('a team that is not there', 'adm', { ...v, tid: 't9' }, 'gone');
    const S = server();
    const a = await S.fire('staffAsks/CLUB/coach/old', { at: Date.now() - 3600000, ...v });
    check('an ask an hour old is not acted on', [a.staffAsk.why, S.at('claims/CLUB/t1/sam/approved')].join(), 'stale,');
    const S2 = server(db => { db.retired = { CLUB: true }; });
    check('a retired club', (await ask(S2, 'adm', v)).why, 'retired');
  }

  console.log('\n--- a fan\'s ask approved ---');
  {
    const S = server();
    const a = await ask(S, 'coach', { op: 'fan', tid: 't1', uid: 'aunt' });
    deepEq('let in, to her player', [a.ok, a.pid], [true, 'p2']);
    check('the approval names the player', S.at('claims/CLUB/t1/aunt/approved/fan'), 'p2');
    check('on the child\'s record as a fan, never a guardian', [S.at(W + 'teams/t1/players/p2/fans/aunt'), S.at(W + 'teams/t1/players/p2/guardians/aunt')].join(), 'true,');
    check('her name where the family reads it', S.at(W + 'teams/t1/players/p2/fanNames/aunt'), 'Aunt Vi');
    check('indexed, a member, in the fans table', [S.at(W + 'access/index/aunt'), S.at(W + 'access/members/aunt/name'), S.at(W + 'access/teamFans/t1/aunt')].join(), 't1,Aunt Vi,p2');
    check('logged', Object.values(S.at(W + 'access/log') || {}).some(x => x.act === 'approved as fan' && x.target === 'aunt'), true);
    check('a family cannot', (await ask(S, 'mum', { op: 'fan', tid: 't1', uid: 'aunt' })).why, 'notyours');
    const S2 = server(db => { delete db.workspaces.CLUB.teams.t1.players.p2; });
    check('her player off the squad: refused, nothing written', [(await ask(S2, 'coach', { op: 'fan', tid: 't1', uid: 'aunt' })).why, S2.at(W + 'access/index/aunt')].join(), 'player,');
    check('a family\'s request is not a fan\'s', (await ask(S2, 'coach', { op: 'fan', tid: 't1', uid: 'sam' })).why, 'gone');
    check('a coach of another team', (await ask(server(), 'other', { op: 'fan', tid: 't1', uid: 'aunt' })).why, 'notyours');
  }

  console.log('\n--- a squad\'s parent links ---');
  {
    const S = server();
    const a = await ask(S, 'adm', { op: 'squad', tid: 't1', uses: 2, days: 30 });
    deepEq('one link per child with no parent and no open invite', [a.ok, Object.keys(a.made).sort()], [true, ['p2']]);
    const id = a.made.p2, v = S.at('invites/' + id);
    check('an id from the secure generator, for several', /^m[0-9a-f]{36}$/.test(id), true);
    deepEq('for that child, by shirt number, never her name', [v.ws, v.role, v.team, v.player, v.playerNo, NAMES.some(x => JSON.stringify(v).includes(x))], ['CLUB', 'parent', 't1', 'p2', '9', false]);
    check('with the limits she chose: two seats, thirty days', [Object.keys(v.seats).join(), Math.round((v.expiresAt - v.at) / 864e5)].join('|'), 's1,s2|30');
    check('sent by her, naming the club', [v.by, v.byName, v.clubName].join(), 'adm,Ada,Lakeside SC');
    const l = S.at('clubInvites/CLUB/' + id);
    check('the admin\'s listing may name the child', [l.playerName, l.max].join(), 'Bea,2');
    check('the open invite for Cleo is left as it is', Object.keys(S.at('clubInvites/CLUB')).length, 2);
    check('logged', Object.values(S.at(W + 'access/log') || {}).some(x => x.act === 'invited' && /1 parent/.test(x.targetName)), true);
    const b = await ask(S, 'adm', { op: 'squad', tid: 't1' });
    check('asking again makes nothing new', Object.keys(b.made).length + Object.keys(S.at('invites')).length, 2);
    const c = await ask(server(), 'adm', { op: 'squad', tid: 't1' });
    check('one person by default, as a single-use id', !!c.made.p2 && /^i[0-9a-f]{36}$/.test(c.made.p2), true);
    check('a coach cannot make personal invites', (await ask(server(), 'coach', { op: 'squad', tid: 't1' })).why, 'notyours');
    check('nor a tracker', (await ask(server(), 'trk', { op: 'squad', tid: 't1' })).why, 'notyours');
  }

  console.log('\n--- an imported roster\'s invites ---');
  {
    const S = server();
    const list = [
      { team: 't1', role: 'parent', player: 'p2', email: 'Bea.Mum@x.com' },
      { team: 't1', role: 'coach', email: 'new.coach@x.com' },
      { team: 't1', role: 'parent', player: 'p1', email: 'mo@x.com' },        // has it already
      { team: 't1', role: 'coach', email: 'jaz@x.com' },                     // the coach herself
      { team: 't1', role: 'parent', player: 'p9', email: 'x@x.com' },        // no such child
      { team: 't9', role: 'coach', email: 'y@x.com' },                       // no such team
      { team: 't1', role: 'tracker', email: 'z@x.com' },                     // not a role this makes
      { team: 't1', role: 'parent', player: 'p2', email: 'not an email' },
      { team: 't1', role: 'parent', player: 'p2', email: 'bea.mum@x.com' }   // twice
    ];
    const a = await ask(S, 'adm', { op: 'invites', list, days: 10 });
    deepEq('one each for the rows that can have one', [a.ok, Object.keys(a.made)], [true, ['0', '1']]);
    deepEq('and why each of the others was not', a.skipped, { 2: 'has', 3: 'has', 4: 'player', 5: 'team', 6: 'role', 7: 'email', 8: 'twice' });
    const v = S.at('invites/' + a.made[0]);
    deepEq('bound to its email, lower case, for one person, ten days', [v.email, v.seats, Math.round((v.expiresAt - v.at) / 864e5), v.role, v.player], ['bea.mum@x.com', undefined, 10, 'parent', 'p2']);
    check('a coach\'s', S.at('invites/' + a.made[1]).role, 'coach');
    check('names no child', NAMES.some(x => JSON.stringify(S.at('invites')).includes(x)), false);
    const b = await ask(S, 'adm', { op: 'invites', list: list.slice(0, 2) });
    deepEq('asking again: open invites already, nothing new', [Object.keys(b.made).length, b.skipped], [0, { 0: 'open', 1: 'open' }]);
    check('a coach is refused', (await ask(server(), 'coach', { op: 'invites', list: list.slice(0, 1) })).why, 'notyours');
    check('an empty list', (await ask(server(), 'adm', { op: 'invites', list: [] })).why, 'bad');
  }
  {
    const S = server();
    const env = { get: p => S.ref(p).get().then(s => s.val()), set: (p, v) => S.ref(p).set(v), update: () => Promise.reject(new Error('unavailable')) };
    const a = await staff.onAsk(env, { code: 'CLUB', uid: 'coach', id: 'f1' }, { op: 'approve', tid: 't1', uid: 'sam', pids: ['p2'], at: Date.now() });
    check('a write that fails is said, and nothing is half done', [a.why, S.at('claims/CLUB/t1/sam/approved'), S.at(W + 'teams/t1/players/p2/guardians/sam')].join(), 'failed,,');
    check('an ask delivered twice is answered once', (await staff.onAsk(env, { code: 'CLUB', uid: 'coach', id: 'f1' }, { op: 'approve', at: Date.now() })).why, 'answered');
  }

  H.summary('letting people in, as one call to the server');
})().catch(e => { console.error(e); process.exit(1); });
