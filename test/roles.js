/* Roles, and the flat index the security rules read.

   CLAUDE.md: "Roles are derived from where a uid appears (access/admins/{uid},
   access/index/{uid}, …) — never stored as a string on a user. A string role is
   a second source of truth that goes stale the moment someone changes team."

   So the interesting cases are all about withdrawal: what happens to someone
   who loses one role but holds another, and to a parent unlinked from the
   player who gave her access in the first place. If the index does not keep up,
   the rules keep letting her in — access/index is the single lookup every rule
   makes, because a rule cannot walk every team asking.

   This used to print its expectations next to whatever it got and exit 0
   regardless. The expectations are the same; now they are assertions. */

const H = require('./harness');
const { check, deepEq } = H;

const A = H.loadApp({});

const base = () => ({
  teams: {
    t1: {
      id: 't1', name: 'Flight', players: {
        p1: { id: 'p1', name: 'Ella', guardians: { mum: true } },
        p2: { id: 'p2', name: 'Mia' }
      }
    }
  },
  matches: {},
  access: {
    admins: { boss: true },
    teams: { t1: { coaches: { coach: true }, trackers: { trk: true } } },
    members: {}, index: {}
  }
});

function as(state, uid, tid = 't1') {
  A.state = state;
  A.me = uid ? { uid, name: uid } : null;
  A.ui.teamId = tid;
  A.appOwners = {};
}

console.log('--- a role is where you appear, not what you are called ---');
{
  as(base(), null);
  check('the admin', A.roleIn('t1', 'boss'), 'admin');
  check('the coach of this team', A.roleIn('t1', 'coach'), 'coach');
  check('the tracker', A.roleIn('t1', 'trk'), 'tracker');
  check('a guardian of one of the players', A.roleIn('t1', 'mum'), 'parent');
  check('somebody nobody has heard of', A.roleIn('t1', 'rando'), null);
  check('and nobody at all', A.roleIn('t1', null), null);
  check('an admin counts as a coach everywhere', A.isCoach('t1', 'boss'), true);
  check('a coach does not count as an admin', A.isAdmin('coach'), false);

  as(base(), 'boss');
  A.appOwners = { boss: true };
  check('the app owner outranks the admin label', A.roleIn('t1', 'boss'), 'owner');
  check('but only for the account looking', A.roleIn('t1', 'coach'), 'coach');
}

console.log('\n--- my role here follows the team I am looking at ---');
{
  const st = base();
  st.teams.t2 = { id: 't2', name: 'Storm', players: {} };
  as(st, 'coach', 't1');
  check('a coach on her own team', A.myRole(), 'coach');
  check('and is not restricted', A.restricted(), null);
  A.ui.teamId = 't2';
  check('the same coach on another team', A.myRole(), null);

  as(st, 'trk', 't1');
  check('a tracker', A.myRole(), 'tracker');
  check('is restricted', A.restricted(), 'tracker');
  as(st, 'mum', 't1');
  check('a parent', A.myRole(), 'parent');
  check('is restricted too', A.restricted(), 'parent');
  as(st, 'boss', 't1');
  check('an admin is not', A.restricted(), null);
  as(st, 'boss', 't1'); A.appOwners = { boss: true };
  check('and neither is the app owner', A.restricted(), null);
  as(st, null, 't1');
  check('signed out has no role', A.myRole(), null);
}

console.log('\n--- the index is built from every kind of role ---');
{
  const st = base();
  as(st, 'boss');
  for (const uid of ['boss', 'coach', 'trk', 'mum', 'rando']) A.syncIndex(uid);
  const indexed = Object.keys(A.state.access.index).sort();
  deepEq('everyone with a role is indexed', indexed, ['boss', 'coach', 'mum', 'trk']);
  check('and nobody without one', indexed.includes('rando'), false);
  check('approved() matches the index', A.approved('coach'), true);
  check('for someone with no role too', A.approved('rando'), false);
}

console.log('\n--- losing one role does not cost you another ---');
{
  const st = base();
  as(st, 'boss');
  st.access.teams.t1.trackers.coach = true;    // she coaches and tracks
  A.syncIndex('coach');
  check('indexed while holding both', !!A.state.access.index.coach, true);

  delete st.access.teams.t1.coaches.coach;      // no longer a coach
  A.syncIndex('coach');
  check('still indexed on the tracker role alone', !!A.state.access.index.coach, true);
  check('and her role here is tracker now', A.roleIn('t1', 'coach'), 'tracker');

  delete st.access.teams.t1.trackers.coach;     // nothing left
  A.syncIndex('coach');
  check('after losing both she is out of the index', !!A.state.access.index.coach, false);
  check('and has no role', A.roleIn('t1', 'coach'), null);
}

console.log('\n--- a guardian holds access through the player, not a list ---');
{
  const st = base();
  as(st, 'boss');
  A.syncIndex('mum');
  check('linked to a player, she is indexed', !!A.state.access.index.mum, true);
  delete st.teams.t1.players.p1.guardians.mum;
  A.syncIndex('mum');
  check('unlinked from the player, she is not', !!A.state.access.index.mum, false);
  check('and hasAnyRole agrees', A.hasAnyRole('mum'), false);

  // a guardian on a team in another age group still counts
  st.teams.t2 = { id: 't2', name: 'Storm', players: { p9: { id: 'p9', guardians: { mum: true } } } };
  check('a child on any team is enough', A.hasAnyRole('mum'), true);
  A.syncIndex('mum');
  check('so she is back in the index', !!A.state.access.index.mum, true);
}

console.log('\n--- an empty workspace locks nobody out ---');
{
  as({ teams: {}, matches: {}, access: {} }, 'anyone');
  check('nobody has a role yet', A.hasAnyRole('anyone'), false);
  check('and nobody is approved', A.approved('anyone'), false);
  check('but there are no admins either', A.anyAdmins(), false);
  check('so everyone can still edit', A.canEditTeam('t1'), true);
  console.log('  ^ this is the state a brand new club is in, before the lockdown steps');
}

console.log('\n--- canAdmin is two doors, not one ---');
{
  const st = base();
  as(st, 'boss');
  check('a club admin', A.canAdmin(), true);
  as(st, 'coach');
  check('a coach is not', A.canAdmin(), false);
  as(st, 'outsider'); A.appOwners = { outsider: true };
  check('the app owner holds no club role', A.isAdmin('outsider'), false);
  check('but canAdmin lets him in anyway', A.canAdmin(), true);
  check('isOwner says so', A.isOwner(), true);
  as(st, null); A.appOwners = { outsider: true };
  check('signed out, nobody is the owner', A.isOwner(), false);
  check('and nobody can admin', !!A.canAdmin(), false);
}

H.summary('role derivation');
