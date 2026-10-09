/* A team helper (AUTH.md, *More kinds of people*, 2): a manager, a volunteer,
   an assistant on one team. She helps the coach prepare (the calendar, the
   register, notices, practice plans, the drill shelves and a game's plan
   before kick-off) and does nothing on the day. She does not change the
   squad, read the coach's notes or any family's conversation, and the clock
   and the subs stay the coach's and the tracker's.

   rules.js holds the database to that; this holds the screen and, as
   everywhere else here, the click handler, so a stale screen or a hidden
   button is never the only thing between her and a write. */

const H = require('./harness');
const { check } = H;

// a config, so gated() is true and "she cannot" tests something (visibility.js says why)
const A = H.loadApp({ config: { apiKey: 'k', databaseURL: 'https://prod.example' } });

const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G14 Flight', players: { a: { id: 'a', name: 'Ava', number: '7', guardians: { mum: true } }, b: { id: 'b', name: 'Bea', number: '9' } } },
    t2: { id: 't2', name: 'G12 Storm', players: { c: { id: 'c', name: 'Cat', number: '3' } } }
  },
  matches: {
    g1: { id: 'g1', teamId: 't1', opponent: 'Rovers', date: '2030-10-18' },
    g2: { id: 'g2', teamId: 't1', opponent: 'Athletic', date: '2026-10-01', periods: { 0: { start: 1, end: 2 } } }
  },
  access: {
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true }, helpers: { hal: 'inv1' } }, t2: { coaches: { other: true } } },
    index: { boss: true, jaz: true, trk: true, hal: 'inv1', mum: true, other: true }
  }
});
function as(uid, tid = 't1', state = club()) {
  A.state = state;
  A.me = uid ? { uid, name: uid } : null;
  A.ui.teamId = tid; A.ui.matchId = null; A.ui.view = 'season';
  A.appOwners = {};
  A.toasts.length = 0;
}
const toast = () => (A.lastToast() || {}).msg || String(A.lastToast() || '');

console.log('--- who she is ---');
{
  as('hal');
  check('her role on her team is helper', A.roleIn('t1', 'hal'), 'helper');
  check('— and nothing on another', A.roleIn('t2', 'hal'), null);
  check('she has a role, so she stays in the club', A.hasAnyRole('hal'), true);
  check('the People list names it', A.rolesHeld('hal', A.teams()).map(v => v.r).join(','), 'helper');
  check('she sees her own team only', A.myTeams().map(t => t.id).join(','), 't1');
  check('— by name: she is staff, not a family', A.namesNarrowed('t1'), false);
  check('the screen narrows to a helper', A.restricted(), 'helper');
  check('she is not the coach: the squad is not hers', A.canEditTeam('t1'), false);
  check('the calendar is', A.canCalTeam('t1'), true);
  check('— not another team\'s', A.canCalTeam('t2'), false);
}

console.log('\n--- what she may do, checked in the handler ---');
{
  as('hal');
  const g1 = A.state.matches.g1, g2 = A.state.matches.g2;
  for (const a of ['calnew', 'calsave', 'caldel', 'calcall', 'attend', 'attsave'])
    check(`${a} on her team`, A.mayAct(a, null, { tid: 't1' }), true);
  check('calsave on another team', A.mayAct('calsave', null, { tid: 't2' }), false);
  check('Add a game', A.mayAct('newmatch', null, {}), true);
  check('a game\'s plan before kick-off', A.mayAct('snapadd', g1, {}), true);
  check('— who is out of it', A.mayAct('toggleout', g1, {}), true);
  check('— locking it in', A.mayAct('planlock', g1, {}), true);
  check('— editing the game', A.mayAct('editmatch', g1, { id: 'g1' }), true);
  check('a game that has kicked off: not its plan', A.mayAct('snapadd', g2, {}), false);
  check('— not editing it', A.mayAct('editmatch', g1, { id: 'g2' }), false);
  check('— nor deleting it', A.mayAct('delmatch', g1, { id: 'g2' }), false);
  for (const a of ['start', 'pause', 'endgame', 'tap', 'puton', 'doswitch', 'fixclock'])
    check(`never the day itself: ${a}`, A.mayAct(a, g1, {}), false);
  for (const a of ['goal', 'shot', 'ev'])
    check(`nor logging: ${a}`, A.mayAct(a, g1, {}), false);
  for (const a of ['addplayer', 'editplayer', 'delplayer', 'toggleguard', 'editteam', 'makeshare', 'calsyncon'])
    check(`nor the squad or the team's settings: ${a}`, A.mayAct(a, null, {}), false);
  check('the game screen\'s Edit is hers before kick-off', A.canGameEdit(g1), true);
  check('— not after', A.canGameEdit(g2), false);
  A.click({ act: 'editmatch', id: 'g2' });
  check('a stale Edit on a game under way is refused in the handler', /coaches can change/.test(toast()), true);
  check('— with no sheet opened for it', /mSide/.test(String(A.dom.node('#sheet').innerHTML || '')), false);
}

console.log('\n--- the game screens ---');
{
  as('hal');
  A.ui.view = 'game'; A.ui.matchId = 'g1';
  for (const v of ['subs', 'track', 'pitch']) {
    A.ui.gameView = v; A.render();
    check(`no ${v} tab for her`, A.ui.gameView !== v, true);
  }
  A.ui.gameView = 'plan'; A.render();
  check('the plan is hers', A.ui.gameView, 'plan');
  check('— with Edit game on it', /data-act="editmatch"/.test(A.rendered()), true);
}

console.log('\n--- her calendar writes are stamped as hers ---');
{
  as('hal');
  const v = A.calStamp('teams/t1/events/e1', { id: 'e1', kind: 'practice', date: '2030-10-12' });
  check('a whole entry carries her stamp', v.edit && v.edit.by, 'hal');
  const w = A.calStamp('matches/g1', { ...A.state.matches.g1 });
  check('— a game too', w.edit && w.edit.by, 'hal');
  as('trk');
  const x = A.calStamp('matches/g1', { ...A.state.matches.g1 });
  check('a tracker saving a game stamps nothing', !!x.edit, false);
}

console.log('\n--- Practice, plans and the drills ---');
{
  as('hal');
  check('she has the Practice tab', A.canTrain(), true);
  check('plans for her team', A.canPlan('t1'), true);
  check('— not for another', A.canPlan('t2'), false);
  check('a drill she shares is filed under her team', A.shareTeam(), 't1');
  check('she tidies a club drill she shared', A.canCurate({ shelf: 'club', by: 'hal', team: 't1' }), true);
  check('— not one a coach shared', A.canCurate({ shelf: 'club', by: 'jaz', team: 't1' }), false);
  as('trk');
  check('a tracker still has no Practice', A.canTrain(), false);
}

console.log('\n--- notices yes, families\' conversations no ---');
{
  as('hal');
  check('she posts her team\'s notices', A.postsTo('t1'), true);
  check('— not another team\'s', A.postsTo('t2'), false);
  check('she is not staff for a family\'s conversation', A.isStaff('t1'), false);
  as('trk');
  check('a tracker still posts none', A.postsTo('t1'), false);
}

console.log('\n--- who makes her one ---');
{
  as('boss');
  check('an admin may name a helper', A.mayGrant('t1', 'helper'), true);
  A.ui.pr = { uid: 'neu', role: 'helper', team: 't1', player: null };
  A.state.access.members = { neu: { name: 'Neu' } };
  A.click({ act: 'praddrole', uid: 'neu' });
  check('she is a helper of that team', !!A.state.access.teams.t1.helpers.neu, true);
  check('— in its index as helper', ((A.state.access.teamIndex || {}).t1 || {}).neu, 'helper');
  check('— and in the club', !!A.state.access.index.neu, true);
  check('the coach keeps coach, the tracker tracker', [A.state.access.teamIndex.t1.jaz, A.state.access.teamIndex.t1.trk].join(','), 'coach,tracker');

  as('jaz');
  check('a coach may not name a helper', A.mayGrant('t1', 'helper'), false);
  check('— though she still gives a tracker', A.mayGrant('t1', 'tracker'), true);
  A.ui.pr = { uid: 'neu', role: 'helper', team: 't1', player: null };
  A.click({ act: 'praddrole', uid: 'neu' });
  check('her tap is refused in the handler', !!(A.state.access.teams.t1.helpers || {}).neu, false);
  check('— and says so', /admins only/i.test(toast()), true);

  as('boss');
  A.state.access.teams.t1.helpers.trk = true;
  A.syncTeamIndex('t1');
  check('a tracker who also helps stays tracker in the index', A.state.access.teamIndex.t1.trk, 'tracker');
  A.state.access.teams.t1.helpers.jaz = true;
  A.syncTeamIndex('t1');
  check('a coach who also helps stays coach', A.state.access.teamIndex.t1.jaz, 'coach');
}

console.log('\n--- every screen draws for her ---');
{
  for (const [view, gv] of [['season'], ['roster'], ['practice'], ['calendar'], ['club'], ['inbox'], ['game', 'live'], ['game', 'plan'], ['game', 'stats']]) {
    as('hal');
    A.ui.view = view; if (gv) { A.ui.matchId = 'g1'; A.ui.gameView = gv; }
    let err = null;
    try { A.render(); } catch (e) { err = e; }
    check(`${view}${gv ? ' › ' + gv : ''} renders`, err ? String(err.message) : 'ok', 'ok');
  }
  as('hal'); A.ui.view = 'season'; A.render();
  check('Season offers her Add a game', /data-act="newmatch"/.test(A.rendered()), true);
  as('hal'); A.ui.view = 'roster'; A.render();
  check('Squad offers her no Add a player', /data-act="addplayer"/.test(A.rendered()), false);
}

H.summary('a team helper: prepares, never runs the day');
