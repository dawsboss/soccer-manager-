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

/* Booted with a Firebase config on purpose. `gated()` is `anyAdmins() &&
   fbConfig().apiKey`, so on a device with no config nothing is gated at all and
   every assertion below about who sees what would pass without testing
   anything. The no-config case is a scenario of its own at the end. */
const CFG = { apiKey: 'k', databaseURL: 'https://prod.example' };
const A = H.loadApp({ config: CFG });
const setCfg = c => { global.window.SOCCER_FIREBASE_CONFIG = c; };

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

console.log('\n--- another team is read, never coached ---');
{
  /* readOnlyHere() answered this correctly for a long time and nothing that
     drew a screen asked it: a coach opening another age group got her own
     coach's screens there — clock, subs, plan, Add a game, Add a player. */
  as(club(), 'jaz', 't2');
  check('a coach on another team is a viewer there', A.restricted(), 'viewer');
  A.ui.teamId = 't1';
  check('and a coach on her own', A.restricted(), null);
  as(club(), 'boss', 't2');
  check('an admin is restricted nowhere', A.restricted(), null);

  as(club(), 'jaz', 't2');
  A.ui.view = 'game'; A.ui.gameView = 'subs'; A.render();
  check('a viewer is moved off the coach\'s game screens, onto the feed', A.ui.gameView, 'live');
  A.ui.gameView = 'live'; A.render();
  check('and may stay on the feed', A.ui.gameView, 'live');
}

console.log('\n--- only a coach or admin adds players and games ---');
{
  const html = (view) => { A.ui.view = view; A.render(); return A.rendered(); };
  const offers = (who, tid) => {
    as(club(), who, tid);
    const roster = html('roster'), games = html('matches');
    return {
      addPlayer: roster.includes('data-act="addplayer"'),
      editPlayer: roster.includes('data-act="editplayer"'),
      addGame: games.includes('data-act="newmatch"')
    };
  };
  const all = { addPlayer: true, editPlayer: true, addGame: true };
  const none = { addPlayer: false, editPlayer: false, addGame: false };
  deepEq('an admin is offered all three', offers('boss', 't1'), all);
  deepEq('a coach on her own team, all three', offers('jaz', 't1'), all);
  deepEq('a coach on another team, none', offers('jaz', 't2'), none);
  deepEq('a tracker, none', offers('trk', 't1'), none);

  // a hidden button is not the only thing in the way
  const tries = (who, tid, act, extra) => {
    as(club(), who, tid);
    A.toasts.length = 0;
    const before = JSON.stringify(A.state);
    A.click({ act, ...(extra || {}) });
    return JSON.stringify(A.state) === before ? 'refused' : 'changed';
  };
  const grab = () => A.state;
  global.document.querySelector('#newName').value = 'Somebody New';
  global.document.querySelector('#newNum').value = '99';
  check('a tracker pressing Add player changes nothing', tries('trk', 't1', 'addplayer'), 'refused');
  check('and is told why', /coaches/.test(A.lastToast() || ''), true);
  check('a coach of another team, the same', tries('jaz', 't2', 'addplayer'), 'refused');
  check('a parent, the same', tries('mum', 't1', 'addplayer'), 'refused');
  check('her own coach adds the player', tries('jaz', 't1', 'addplayer'), 'changed');
  check('and it landed on her team', Object.values(grab().teams.t1.players).some(p => p.name === 'Somebody New'), true);
  global.document.querySelector('#newName').value = '';

  check('a tracker cannot open the new-game sheet', (tries('trk', 't1', 'newmatch'), /coaches/.test(A.lastToast() || '')), true);
  check('nor a coach of another team', (tries('jaz', 't2', 'newmatch'), /coaches/.test(A.lastToast() || '')), true);
}

console.log('\n--- a game belongs to its team ---');
{
  const withGame = () => {
    const st = club();
    st.matches = { g2: { id: 'g2', teamId: 't2', opponent: 'Rivals', periods: [], stints: {} },
      g1: { id: 'g1', teamId: 't1', opponent: 'Others', periods: [], stints: {} } };
    return st;
  };
  const goal = (who, tid, mid) => {
    as(withGame(), who, tid);
    A.ui.matchId = mid;
    A.click({ act: 'goal', side: 'us' });
    return Object.keys(A.state.matches[mid].goals || {}).length;
  };
  check('a coach cannot log a goal in another team\'s game', goal('jaz', 't2', 'g2'), 0);
  check('a parent cannot either', goal('mum', 't1', 'g1'), 0);
  check('the team\'s tracker still can — it is her job', goal('trk', 't1', 'g1'), 1);
  check('and so can the coach', goal('jaz', 't1', 'g1'), 1);

  const start = (who, tid, mid) => {
    as(withGame(), who, tid);
    A.ui.matchId = mid;
    A.click({ act: 'start' });
    return (A.state.matches[mid].periods || []).length;
  };
  check('a coach cannot start another team\'s clock', start('jaz', 't2', 'g2'), 0);
  check('nor can a tracker start her own', start('trk', 't1', 'g1'), 0);
  check('the coach can', start('jaz', 't1', 'g1') > 0, true);
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

console.log('\n--- signed out of a club that has an admin ---');
{
  /* The local copy is still held — an unsynced game lives only there — but
     holding it and drawing it are separate decisions. Gating on the database
     refusing the read instead would leave children's names on screen for the
     seconds wireBase() spends retrying. */
  as(club(), null, 't1');
  deepEq('she sees no teams at all', seen(), []);
  check('and can edit nothing', A.canEditTeam('t1'), false);
  check('the app asks her to sign in', A.needsSignIn(), true);
  check('the club is gated', A.gated(), true);
  check('but the local copy is still in state', Object.keys(A.state.teams).length, 3);
}

console.log('\n--- with no Firebase config there is nowhere to sign in ---');
{
  /* A lock screen on a device that cannot authenticate is a dead end, not a
     protection: the access lists are inert with nothing to check them against. */
  setCfg({});
  as(club(), null, 't1');
  check('every team is visible again', A.myTeams().length, 3);
  check('and editable', A.canEditTeam('t1'), true);
  check('nothing is gated', A.gated(), false);
  check('and no sign-in is asked for', A.needsSignIn(), false);
  setCfg(CFG);
}

console.log('\n--- before lockdown nothing is hidden ---');
{
  /* Nobody gets locked out of a club that has not been locked down yet — the
     alternative is a coach opening the app one morning to an empty screen, with
     no way to make herself the admin that would let her back in. */
  const open = club();
  open.access = {};
  as(open, null, 't1');
  check('signed out, every team is visible', A.myTeams().length, 3);
  check('and editable', A.canEditTeam('t1'), true);
  check('no sign-in is asked for', A.needsSignIn(), false);
  as(open, 'anyone', 't1');
  check('signed in with no roles, the same', A.myTeams().length, 3);
  check('and still editable', A.canEditTeam('t1'), true);

  // the moment one admin exists, the rules above start applying
  open.access = { admins: { boss: true } };
  as(open, 'anyone', 't1');
  check('one admin is enough to turn it on', A.myTeams().length, 0);
  check('and editing stops', A.canEditTeam('t1'), false);
  as(open, null, 't1');
  check('and signing out now bites', A.needsSignIn(), true);
}

H.summary('team visibility');
