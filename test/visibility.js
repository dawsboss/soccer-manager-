/* Which teams each kind of account can see, and which it can change.

   The rule the app tries to hold, from the comment above myTeams(): "Admin:
   everything. Coach: edits her own team, reads the rest of the club — comparing
   against the other age groups is the point of being in a club. Tracker and
   parent: only the teams they are actually attached to."

   Reading and editing come apart for a coach, which is the case worth pinning:
   she sees three teams and may change one. Get that wrong in the generous
   direction and a coach quietly edits another age group's roster.

   Note that none of this is enforced by the database. `node test/rules.js`
   prints the five places the interface and the rules disagree, and the first of
   them is that any indexed account can write any team. What is checked here is
   what the interface offers, which is the only layer that currently exists. */

const H = require('./harness');
const { check, deepEq } = H;

const A = H.loadApp({});

const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G14 Flight', players: { a: { id: 'a', guardians: { mum: true } } } },
    t2: { id: 't2', name: 'G12 Storm', players: { b: { id: 'b' } } },
    t3: { id: 't3', name: 'G16 Rush', players: { c: { id: 'c' } } }
  },
  matches: {},
  access: {
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    index: {}
  }
});

function as(state, uid, tid = 't1') {
  A.state = state;
  A.me = uid ? { uid, name: uid } : null;
  A.ui.teamId = tid;
  A.appOwners = {};
}
const seen = () => A.myTeams().map(t => t.name).sort();

console.log('--- who sees which teams ---');
{
  as(club(), 'boss');
  check('an admin sees the whole club', A.myTeams().length, 3);
  check('and can edit any of it', A.canEditTeam('t3'), true);

  as(club(), 'jaz');
  check('a coach also reads the whole club', A.myTeams().length, 3);
  check('and edits her own team', A.canEditTeam('t1'), true);
  check('but NOT another age group', A.canEditTeam('t2'), false);

  as(club(), 'trk');
  deepEq('a tracker sees only her team', seen(), ['G14 Flight']);
  check('and cannot edit it', A.canEditTeam('t1'), false);

  as(club(), 'mum');
  deepEq('a parent sees only her child\'s team', seen(), ['G14 Flight']);
  check('and cannot edit it', A.canEditTeam('t1'), false);

  as(club(), 'stranger');
  deepEq('somebody with no connection sees nothing', seen(), []);
  check('and can edit nothing', A.canEditTeam('t1'), false);
}

console.log('\n--- a coach viewing another team is read-only, not blind ---');
{
  as(club(), 'jaz', 't2');
  check('she can still see three teams', A.myTeams().length, 3);
  check('but this one is read-only', A.readOnlyHere(), true);
  A.ui.teamId = 't1';
  check('and her own is not', A.readOnlyHere(), false);
}

console.log('\n--- a parent with children in two age groups ---');
{
  const st = club();
  st.teams.t2.players.b.guardians = { mum: true };
  as(st, 'mum', 't1');
  deepEq('she sees both teams', seen(), ['G12 Storm', 'G14 Flight']);
  check('and both children', A.myPlayers().length, 2);
  check('so the My players tab is offered', A.guardsAnyone(), true);
  deepEq('across the two teams', A.myPlayers().map(x => x.t.name).sort(), ['G12 Storm', 'G14 Flight']);

  as(club(), 'boss', 't1');
  check('an admin with no children is not offered it', A.guardsAnyone(), false);
  check('and has no players of her own', A.myPlayers().length, 0);
}

console.log('\n--- a coach who is also a parent on her own team ---');
{
  const st = club();
  st.teams.t1.players.a.guardians = { jaz: true };
  as(st, 'jaz', 't1');
  check('her role here is the stronger one', A.myRole(), 'coach');
  check('she is not restricted', A.restricted(), null);
  check('but the tab still appears for her child', A.guardsAnyone(), true);
  check('and she still edits her team', A.canEditTeam('t1'), true);
}

console.log('\n--- before lockdown nothing is hidden ---');
{
  /* Nobody gets locked out of a club that has not been locked down yet — the
     alternative is a coach opening the app one morning to an empty screen. */
  const open = club();
  open.access = {};
  as(open, null, 't1');
  check('signed out, every team is visible', A.myTeams().length, 3);
  check('and editable', A.canEditTeam('t1'), true);
  as(open, 'anyone', 't1');
  check('signed in with no roles, the same', A.myTeams().length, 3);
  check('and still editable', A.canEditTeam('t1'), true);

  // the moment one admin exists, the rules above start applying
  open.access = { admins: { boss: true } };
  as(open, 'anyone', 't1');
  check('one admin is enough to turn it on', A.myTeams().length, 0);
  check('and editing stops', A.canEditTeam('t1'), false);
}

H.summary('team visibility');
