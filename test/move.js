/* Moving a club to orgs/{code} (functions/move.js; AUTH.md, *The move to
   `orgs/{orgId}`*), and the two parts only the new tree has (functions/
   access.js: staff names, the roster), against the fake server.

   What matters, in the order it would hurt:

   - Only an admin of that club moves it, whatever the request claims, and
     never while a game is being played (a goal landing mid-move is lost).
   - Nothing is half moved: one write, read back and compared, and the old
     tree put back if the copy differs. The old one is kept aside where no
     phone reads it.
   - What a parent can read on the new tree carries no other child's name and
     nobody's email: the roster is numbers, names/ is staff and only names.
   - The lookup tables are built whole on the way, so the move closes the
     old tree's bridges instead of carrying them over.
   - Afterwards the roster and the staff names follow the squad, the members
     and the club's one preset, whoever changes them. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer } = require('./fakebase');
const move = require('../functions/move');

const NOW = Date.UTC(2026, 9, 8, 12);
const CLUB = () => ({
  access: {
    admins: { adm: true },
    index: { adm: true, coach: 'inv_coach', trk: true, mum: 'inv_mum' },
    members: {
      adm: { name: 'Ada', email: 'ada@example.com', at: 1 },
      coach: { name: 'Jaz', email: 'jaz@example.com', at: 2 },
      trk: { name: 'Tam', email: 'tam@example.com', at: 3 },
      mum: { name: 'Mo', email: 'mo@example.com', at: 4 },
      ella: { name: 'Ella', email: 'ella@example.com', at: 5 }
    },
    org: { name: 'Lakeside SC', venues: { f1: { name: 'Rose Park' } } },
    log: { l1: { at: 1, act: 'linked guardian', by: 'adm', target: 'mum', player: 'Rosa Lind' } },
    teams: { t1: { coaches: { coach: true }, trackers: { trk: true } } }
    // no teamIndex, teamParents, teamPlayers or coachIndex: a club still on the old tree's bridges
  },
  teams: {
    t1: {
      id: 't1', name: 'Flight', events: { e1: { id: 'e1', kind: 'practice', date: '2026-10-14', start: '18:00' } }, attend: { e0: { p1: true } },
      players: {
        p1: { id: 'p1', name: 'Rosa Lind', number: '7', note: 'shy in goal', rating: 4, guardians: { mum: 'inv_mum' } },
        p2: { id: 'p2', name: 'Ella Fitz', number: 9, self: { ella: true }, avoid: { p1: true } },
        p3: { id: 'p3', name: 'Ida Moss', active: false }
      }
    }
  },
  matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-10-04', periods: { 0: { start: 1, end: 2 } }, ended: true, stints: { s1: { pid: 'p1', start: 1, end: 2 } } } },
  rsvp: { t1: { g_g1: { p1: { v: 'yes', by: 'mum', at: 1 } } } }
});
function server(edit) {
  const club = CLUB();
  if (edit) edit(club);
  const S = makeServer({ workspaces: { CLUB: club }, userOrgs: { ella: { CLUB: { name: 'Lakeside SC', at: 1 } } } });
  S.loadFunctions();
  return S;
}
const ask = (S, by) => S.fire('moveRequests/CLUB', { by, at: NOW });
const result = S => S.at('moveRequests/CLUB/result') || {};
const O = 'orgs/CLUB/';

(async () => {
  console.log('--- who may move a club ---');
  for (const [who, why] of [['coach', 'a coach'], ['trk', 'a tracker'], ['mum', 'a parent'], ['ella', 'a player'], ['rando', 'a stranger']]) {
    const S = server();
    await ask(S, who);
    check(why + ' asking moves nothing', !!S.at('orgs/CLUB') || !S.at('workspaces/CLUB/teams'), false);
    check('— and is told why', result(S).ok === false && /admin/.test(result(S).why), true);
  }
  {
    const S = server();
    await S.fire('moveRequests/CLUB', { at: NOW });
    check('a request naming nobody moves nothing', !!S.at('orgs/CLUB'), false);
  }
  {
    const S = server(c => { c.matches.g2 = { id: 'g2', teamId: 't1', periods: { 0: { start: 1 } } }; });
    await ask(S, 'adm');
    check('not while a game is being played', !!S.at('orgs/CLUB'), false);
    check('— and says so', /game is being played/.test(result(S).why), true);
  }
  {
    const S = server();
    S.put('retired/CLUB', { at: 1 });
    await ask(S, 'adm');
    check('not a retired club', !!S.at('orgs/CLUB'), false);
  }

  console.log('\n--- an admin moves it ---');
  {
    const S = server();
    const was = JSON.parse(JSON.stringify(S.at('workspaces/CLUB')));
    await ask(S, 'adm');
    const r = result(S);
    check('it moved', r.ok, true);
    check('and says what', `${r.teams} team, ${r.players} players, ${r.games} game, ${r.people} people`, '1 team, 3 players, 1 game, 5 people');
    deepEq('the old tree is a marker and nothing else', Object.keys(S.at('workspaces/CLUB')), ['moved']);
    check('— naming who moved it', S.at('workspaces/CLUB/moved/by'), 'adm');
    const kept = S.at('serverState/moved/CLUB') || {};
    deepEq('the old tree kept aside, exactly', Object.values(kept)[0], was);

    console.log('\n--- what each part holds ---');
    deepEq('the teams, without their players', S.at(O + 'teams/t1'), { id: 't1', name: 'Flight', events: was.teams.t1.events, attend: was.teams.t1.attend });
    deepEq('the squad, whole, where only staff and each child\'s own family read it', S.at(O + 'squad/t1'), was.teams.t1.players);
    deepEq('the roster: numbers and who plays, no names, no notes', S.at(O + 'roster/t1'), { p1: { number: '7', active: true }, p2: { number: 9, active: true }, p3: { number: '', active: false } });
    deepEq('staff names: the admin, the coach, the tracker, and no email', S.at(O + 'names'), { adm: { name: 'Ada' }, coach: { name: 'Jaz' }, trk: { name: 'Tam' } });
    check('— never a family\'s or a player\'s', !!(S.at(O + 'names/mum') || S.at(O + 'names/ella')), false);
    deepEq('members, with their emails, to staff only', S.at(O + 'members'), was.access.members);
    deepEq('the club\'s settings', S.at(O + 'org'), was.access.org);
    deepEq('the log, to admins only', S.at(O + 'log'), was.access.log);
    deepEq('the games, as they were', S.at(O + 'matches'), was.matches);
    deepEq('the answers, as they were', S.at(O + 'rsvp'), was.rsvp);
    const roster = JSON.stringify([S.at(O + 'roster'), S.at(O + 'names'), S.at(O + 'teams')]);
    check('no child\'s name anywhere the whole club reads', /Rosa|Ella Fitz|Ida/.test(roster), false);
    check('nor anyone\'s email', /@/.test(roster), false);

    console.log('\n--- the lookup tables, built whole ---');
    deepEq('the index keeps what was there, and adds the player who signs in', S.at(O + 'access/index'), { adm: true, coach: 'inv_coach', trk: true, mum: 'inv_mum', ella: true });
    deepEq('teamIndex', S.at(O + 'access/teamIndex'), { t1: { trk: 'tracker', coach: 'coach' } });
    deepEq('teamParents, naming her child', S.at(O + 'access/teamParents'), { t1: { mum: 'p1' } });
    deepEq('teamPlayers', S.at(O + 'access/teamPlayers'), { t1: { ella: 'p2' } });
    deepEq('coachIndex', S.at(O + 'access/coachIndex'), { coach: 't1' });

    console.log('\n--- once moved ---');
    await S.fire('moveRequests/CLUB', null);
    await ask(S, 'adm');
    check('asked again: already moved', /already moved/.test(result(S).why), true);
    check('— and nothing touched', S.at(O + 'teams/t1/name'), 'Flight');
  }

  console.log('\n--- a club that has nothing logged and no answers yet ---');
  {
    /* The real database library refuses a write with an undefined anywhere in
       it (the fake server now does too). The first move left a missing log
       and missing answers as undefined, so a new club's move threw, wrote no
       answer, and the admin's phone waited for ever. */
    const S = server(c => { delete c.access.log; delete c.rsvp; });
    await ask(S, 'adm');
    check('it moves', result(S).ok, true);
    check('with no empty parts made up', S.at(O + 'log') === null && S.at(O + 'rsvp') === null, true);
  }
  {
    // anything the server trips over is an answer, never silence
    const S = server();
    const env = { get: p => S.ref(p).get().then(s => s.val()), set: (p, v) => S.ref(p).set(v), update: () => Promise.reject(new Error('the database is busy')) };
    const r = await move.onRequest(env, { code: 'CLUB' }, { by: 'adm', at: NOW }, NOW);
    check('a server error is said, not swallowed', /could not move it \(the database is busy\)/.test(r.why) && r.ok === false, true);
    check('— written beside the request for her phone', /the database is busy/.test(result(S).why || ''), true);
    check('— and nothing was moved', !!S.at('orgs/CLUB'), false);
  }

  console.log('\n--- nothing half moved ---');
  {
    const S = server();
    const was = JSON.parse(JSON.stringify(S.at('workspaces/CLUB')));
    // a database that hands back something other than what was written
    const env = {
      get: p => S.ref(p).get().then(s => {
        const v = s.val();
        if (p === 'orgs/CLUB' && v) delete v.squad.t1.p2;
        return v;
      }),
      set: (p, v) => S.ref(p).set(v),
      update: patch => S.ref('').update(patch)
    };
    const r = await move.onRequest(env, { code: 'CLUB' }, { by: 'adm', at: NOW }, NOW);
    check('a copy that does not match is not a move', r.ok, false);
    check('— it says which part', /squad/.test(r.why), true);
    deepEq('the old tree is back as it was', S.at('workspaces/CLUB'), was);
    check('and the new one gone', S.at('orgs/CLUB'), null);
  }

  console.log('\n--- a club that opens its roster ---');
  {
    const S = server(c => { c.access.org.rosterOpen = true; });
    await ask(S, 'adm');
    deepEq('the roster carries names as well', S.at(O + 'roster/t1/p1'), { number: '7', active: true, name: 'Rosa Lind' });
    await S.fire(O + 'org/rosterOpen', null);
    deepEq('closed again: every name comes out', S.at(O + 'roster/t1'), { p1: { number: '7', active: true }, p2: { number: 9, active: true }, p3: { number: '', active: false } });
    await S.fire(O + 'org/rosterOpen', true);
    check('and back in when it opens', S.at(O + 'roster/t1/p2/name'), 'Ella Fitz');
  }

  console.log('\n--- afterwards, the roster follows the squad ---');
  {
    const S = server();
    await ask(S, 'adm');
    await S.fire(O + 'squad/t1/p1/number', '8');
    check('a number changed', S.at(O + 'roster/t1/p1/number'), '8');
    await S.fire(O + 'squad/t1/p4', { id: 'p4', name: 'Nia Cole', number: '11' });
    deepEq('a child added: her number, not her name', S.at(O + 'roster/t1/p4'), { number: '11', active: true });
    await S.fire(O + 'squad/t1/p4/note', 'quick on the left');
    deepEq('a note on her changes nothing anyone else reads', S.at(O + 'roster/t1/p4'), { number: '11', active: true });
    await S.fire(O + 'squad/t1/p4', null);
    check('a child taken off the squad is off the roster', S.at(O + 'roster/t1/p4'), null);
    const ran = await S.fire(O + 'squad/t1/p1/rating', 2);
    check('it says nothing it need not', (ran.rosterPlayer || []).length, 0);
  }

  console.log('\n--- afterwards, staff names follow the members and the roles ---');
  {
    const S = server();
    await ask(S, 'adm');
    await S.fire(O + 'members/coach/name', 'Jaz Bell');
    check('a coach renamed: families see the new name', S.at(O + 'names/coach/name'), 'Jaz Bell');
    await S.fire(O + 'members/mum/name', 'Maureen');
    check('a parent renamed: still nothing of hers there', S.at(O + 'names/mum'), null);
    await S.fire(O + 'access/teams/t1/trackers/trk', null);
    check('a tracker taken off: her name comes out', S.at(O + 'names/trk'), null);
    await S.fire(O + 'access/teams/t1/coaches/mum', true);
    check('a parent made a coach: her name goes in', S.at(O + 'names/mum/name'), 'Maureen');
    check('— with no email', S.at(O + 'names/mum/email'), null);
    await S.fire(O + 'access/admins/coach', true);
    check('an admin made: still one entry, still just her name', JSON.stringify(S.at(O + 'names/coach')), '{"name":"Jaz Bell"}');
  }

  H.summary('moving a club to orgs/, and what only orgs/ has');
})();
