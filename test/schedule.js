/* The club's schedule, on the one Calendar. The owner, first: "the admin
   being thrown into My calendar isn't great. They need a way to schedule out
   games and stuff easier. Also practices: some teams share fields, which is
   ok. Just note that there is a shared field time." Then: "having a team
   calendar, club calendar and my calendar is too much" (build 102), so Club
   schedule became All teams on the Calendar, and its week the club's week
   under it for an admin.

   What's pinned here:

   - Every team's week on one screen, ticked by team and kind, with what is
     still missing a date, time or place, and teams with no practice: an
     admin's, under All teams. A parent is never offered All teams for teams
     that aren't hers, and nobody but an admin gets the club's week.
   - An admin lands on it from Club home; My calendar is only ever hers.
   - Two teams practising on one field at once is a note on both entries,
     never a clash; a game short of a pitch is.
   - Adding opens the sheet a team's coach uses, for a team she may change
     (checked again in the handler), and keeps her on the calendar. A run of
     games is one write per game at matches/{id}, in the shape the team's last
     game had, a row with no opponent refused and an empty row left out. */

const H = require('./harness');
const { check } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
// the harness clock: Saturday 12 September 2026; its week starts Monday the 7th
const TUE = '2026-09-15', MON = '2026-09-14';

const kid = (id, name, guardians) => ({ id, name, number: id.slice(1), active: true, guardians });
const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G11 Flight', players: { p1: kid('p1', 'Ella', { mum: true }) },
      events: { e1: { id: 'e1', kind: 'practice', date: TUE, start: '17:30', end: '18:30', venue: 'Lakeside Park' } } },
    t2: { id: 't2', name: 'G13 Storm', players: { p3: kid('p3', 'Sam', { fam3: true }) },
      events: { e2: { id: 'e2', kind: 'practice', date: TUE, start: '18:00', end: '19:00', venue: 'lakeside park' },
        e3: { id: 'e3', kind: 'event', date: '2026-09-17', start: '', end: '', venue: '', title: 'Team photo' } } },
    t3: { id: 't3', name: 'B9 Comets', players: { p5: kid('p5', 'Leo', { fam5: true }) }, events: {} }
  },
  matches: {
    m0: { id: 'm0', teamId: 't3', opponent: 'Old Town', date: '2026-09-05', kickoff: '10:00', venue: 'Away', periodCount: 4, periodMinutes: 12, onFieldCount: 7, createdAt: 1 }
  },
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, mum: true, trk: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' } },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { jaz: true } } }
  }
});
const sheet = A => String(A.dom.node('#sheet').innerHTML || '');
const A = H.loadApp({ config: CONFIG, firebase: makeFakebase() });
function as(uid, c = club()) {
  A.state = c; A.me = uid ? { uid, name: uid } : null; A.appOwners = {};
  A.ui.teamId = 't1'; A.ui.view = 'schedule'; A.ui.sched = {}; A.toasts.length = 0;
  A.ui.calSel = null; A.ui.calOff = {}; A.ui.calKOff = {}; A.ui.calDay = null; A.ui.calView = null; A.ui.calTree = false;
}
const fill = vals => { for (const [k, v] of Object.entries(vals)) A.dom.node('#' + k).value = v; };

(async () => {

  console.log('--- who has it ---');
  {
    // the coach of two teams sees every team, as a coach does; a parent and a tracker only theirs
    as('jaz'); A.render();
    check('jaz: the old address is the Calendar, on All teams', A.ui.view + ' ' + A.calSel(), 'calendar club');
    check('jaz: but no club\'s week, which is an admin\'s', /class="card clubweek"/.test(A.rendered()), false);
    for (const who of ['mum', 'trk']) {
      as(who); A.render();
      check(who + ': no All teams to show her what isn\'t hers', A.ui.view + ' ' + A.calSels().includes('club'), 'calendar false');
      check(who + ': no club\'s week', /clubweek/.test(A.rendered()), false);
      check(who + ': no Calendar card for the club on Club home', (A.ui.view = 'club', A.render(), /data-act="schedule"/.test(A.rendered())), false);
      const before = JSON.stringify(A.state);
      A.ui.sched = { add: 'games' };
      A.click({ act: 'schedfor', tid: 't1' });
      check(who + ': adding through the handler is refused', A.lastToast(), 'Only a team’s coaches and the club’s admins add to its calendar');
      A.click({ act: 'sgsave' });
      check(who + ': and nothing is written', JSON.stringify(A.state), before);
    }
    as('jaz');
    A.ui.sched = { add: 'games' };
    A.click({ act: 'schedfor', tid: 't3' });
    check('a coach adding to a team that isn\'t hers is refused', A.lastToast(), 'Only that team’s coaches and the club’s admins can add to it');

    as('boss'); A.ui.view = 'club'; A.render();
    check('an admin has the Calendar first on Club home', /data-act="schedule"[^>]*>\s*<b>Calendar<\/b>/.test(A.rendered()), true);
    check('saying what is on this week', /Every team · This week: /.test(A.rendered()), true);
    check('and is not offered an empty My calendar ahead of it', /data-v="mycal"/.test(A.rendered()), false);
    check('her own calendar holds only her own', A.myCalOwn(), false);
    A.click({ act: 'schedule' });
    check('it opens on every team', A.ui.view + ' ' + A.calSel() + ' ' + A.calTeams().length, 'calendar club 3');
    check('at the Calendar\'s address, All teams being the only calendar she has', A.uiToHash(), '#/calendar');
    A.ui.view = 'club';
    global.location.hash = '#/club/schedule';
    check('and the old address opens it', A.hashToUi() && A.ui.view + ' ' + A.ui.calSel, 'calendar club');
    A.ui.view = 'admin'; A.render();
    check('Club settings has it too', /data-act="schedule"/.test(A.rendered()), true);
    A.ui.view = 'calendar'; A.click({ act: 'caltog', tid: 't1' });
    A.ui.view = 'club'; A.click({ act: 'schedule' });
    check('"Every team" means every team, whatever was unticked before', A.calTeams().length, 3);

    // an admin who also coaches has her own calendar a tap away, and the club's on Club home
    const c = club(); c.access.teams.t3 = { coaches: { boss: true } };
    as('boss', c); A.ui.view = 'club'; A.render();
    check('an admin who coaches has the club\'s Calendar on Club home', /data-act="schedule"/.test(A.rendered()), true);
    A.click({ act: 'accountsheet' });
    check('and My calendar from her account', /data-v="mycal"/.test(sheet(A)), true);
    A.ui.view = 'calendar'; A.ui.calSel = null; A.render();
    check('the Calendar is hers first, with All teams beside it', A.calSel() + ' ' + /data-act="calscope" data-v="club"/.test(A.rendered()), 'mine true');
    A.ui.view = 'club'; A.click({ act: 'schedule' });
    check('Club home\'s card opens All teams', A.calSel(), 'club');
    check('— whose address says so', A.uiToHash(), '#/calendar/all');
  }

  console.log('\n--- a week of the club ---');
  {
    as('boss'); A.ui.view = 'calendar'; A.ui.calSel = 'club'; A.ui.calView = 'week'; A.ui.calDay = TUE; A.render();
    const html = A.rendered();
    check('the week runs Monday to Sunday', /14 Sep – 20 Sep/.test(html), true);
    check('every team\'s entries, under their day', /G11 Flight/.test(html) && /G13 Storm/.test(html) && /Team photo/.test(html), true);
    const w = A.schedWeek();
    check('counted', [w.games, w.practices, w.events].join(), '0,2,1');
    check('a team with no practice this week is said', w.idle.join(), 't3');
    check('on screen, in the club\'s week', /class="card clubweek"/.test(html) && /No practice this week: B9 Comets/.test(html), true);
    check('a day with nothing has a way to add to it', /class="tg-slot"[^>]*data-act="schedadd" data-v="2026-09-14" data-t="18:00"/.test(html), true);

    A.click({ act: 'caltog', tid: 't1' });
    check('a team unticked is left out of the week', A.schedWeek().tids.sort().join(), 't2,t3');
    A.click({ act: 'caltog', g: 'all' });
    check('and the club is all of them', A.schedWeek().tids.length, 3);
    A.click({ act: 'calkind', v: 'practice' });
    check('a kind can be left out', A.schedWeek().items.some(x => x.kind === 'practice'), false);
    A.click({ act: 'calkind', v: 'practice' });

    A.click({ act: 'calstep', v: '1' });
    check('next week', A.schedWeek().week, '2026-09-21');
    A.click({ act: 'calstep', v: '0' });
    check('back to this one', A.schedWeek().week, '2026-09-07');

    const todo = A.schedTodo(['t1', 't2', 't3']);
    check('still to settle: the photo with no time or place', todo.some(r => r.x.title === 'Team photo' && r.miss.join() === 'time,place'), true);
    check('and nothing already played', todo.some(r => r.x.id === 'm0'), false);
    A.ui.calDay = TUE; A.render();
    check('listed on the screen', /Still to settle/.test(A.rendered()) && /No time, no place yet/.test(A.rendered()), true);
  }

  console.log('\n--- shared field time ---');
  {
    as('boss');
    const it = id => A.calItems(['t1', 't2', 't3']).find(x => x.id === id);
    const fm = A.fieldMates(it('e1'));
    check('two practices on one field at once share it', fm && fm.clash, false);
    check('typed two ways, found as one place', fm && fm.mates.map(y => y.tid).join(), 't2');
    check('said under the entry', A.fieldMatesLine(it('e1')), 'Shared field: G13 Storm 6pm');
    check('and under the other', A.fieldMatesLine(it('e2')), 'Shared field: G11 Flight 5:30pm');
    A.ui.view = 'calendar'; A.ui.teamId = 't1'; A.render();
    check('on the team\'s own calendar too', /Shared field: G13 Storm 6pm/.test(A.rendered()), true);
    A.click({ act: 'calitem', k: 'practice', tid: 't1', id: 'e1' });
    check('and on the entry when opened', /Shared field/.test(sheet(A)) && /Another team is on the field then too/.test(sheet(A)), true);

    const c = club();
    c.matches.g1 = { id: 'g1', teamId: 't3', opponent: 'Riverside', date: TUE, kickoff: '18:00', venue: 'Lakeside Park', periodCount: 2, periodMinutes: 25 };
    as('boss', c);
    const g = A.calItems(['t3']).find(x => x.id === 'g1');
    check('a game on a one-pitch field with a practice on it is a clash', A.fieldMates(g).clash, true);
    check('said as one', /^Field clash: /.test(A.fieldMatesLine(g)), true);
    A.ui.view = 'calendar'; A.ui.calSel = 'club'; A.ui.calDay = TUE; A.render();
    check('and counted in the club\'s week', A.schedWeek().clash > 0 && /no pitch left/.test(A.rendered()), true);
    c.access.org = { venues: { v1: { id: 'v1', name: 'Lakeside Park', pitches: 3 } } };
    check('with a pitch for each, the game only shares', A.fieldMates(g).clash, false);
    c.teams.t2.events.e2.called = 'cancelled';
    check('something called off shares nothing', A.fieldMates(A.calItems(['t1']).find(x => x.id === 'e1')).mates.some(y => y.tid === 't2'), false);
    check('another place is not shared', A.fieldMates({ ...A.calItems(['t1']).find(x => x.id === 'e1'), venue: 'Elm Street' }) && true, true);
  }

  console.log('\n--- adding from the schedule ---');
  {
    as('boss'); A.ui.calDay = TUE; A.render();
    A.click({ act: 'schedadd', v: TUE });
    check('Add asks what and for which team', /data-act="schedaddk" data-v="games"/.test(sheet(A)) && /data-act="schedfor" data-tid="t3"/.test(sheet(A)), true);
    check('each team saying the shape of its games', /7v7 · 4 × 12 min/.test(sheet(A)), true);

    // one game, for B9: the game sheet, in the shape its last game had, and she stays here
    A.click({ act: 'schedfor', tid: 't3' });
    check('a game opens the game sheet', /id="mOpp"/.test(sheet(A)), true);
    check('on the day picked', /id="mDate" value="2026-09-15"/.test(sheet(A)), true);
    check('7v7 in quarters, like its last one', /<option value="4" selected>/.test(sheet(A)) && /<option value="7" selected>/.test(sheet(A)), true);
    fill({ mOpp: 'Riverside', mDate: TUE, mKick: '10:00', mVenue: 'Lakeside Park', mHome: 'home', mArrive: '', mKit: '', mNotes: '', mCount: '4', mLen: '12', mSide: '7', mShape: 'auto', mVeo: '' });
    A.click({ act: 'savematch', id: '' });
    const made = Object.values(A.state.matches).find(m => m.opponent === 'Riverside');
    check('the game is B9\'s', made && made.teamId, 't3');
    check('and she is still on the calendar', A.ui.view + ' ' + A.calSel(), 'calendar club');
    check('told it was added', A.lastToast(), 'Game added for B9 Comets');
    check('B9 is the open team, so its share link is what republishes', A.ui.teamId, 't3');
    // a game added the usual way still opens it
    A.ui.view = 'matches'; A.click({ act: 'newmatch' });
    fill({ mOpp: 'Westfield', mDate: TUE, mKick: '', mVenue: '' });
    A.click({ act: 'savematch', id: '' });
    check('from the Games tab a new game still opens', A.ui.view, 'game');

    // a practice for G11, from the same sheet
    as('boss'); A.render();
    A.click({ act: 'schedadd', v: '2026-09-16' });
    A.click({ act: 'schedaddk', v: 'practice' });
    A.click({ act: 'schedfor', tid: 't1' });
    check('a practice opens the calendar sheet for that team', A.calForm && A.calForm.tid + ' ' + A.calForm.kind + ' ' + A.calForm.date, 't1 practice 2026-09-16');
    fill({ evTitle: '', evDate: '2026-09-16', evStart: '17:30', evEnd: '18:30', evVenue: 'Lakeside Park', evNotes: '', evUntil: '' });
    A.click({ act: 'calsave', tid: 't1' });
    check('and lands on its calendar', Object.values(A.state.teams.t1.events).some(e => e.date === '2026-09-16' && e.kind === 'practice'), true);
    check('still on the calendar', A.ui.view + ' ' + A.calSel(), 'calendar club');
  }

  console.log('\n--- a run of games ---');
  {
    as('boss'); A.render();
    A.click({ act: 'schedaddk', v: 'games', open: '1' });
    A.click({ act: 'schedfor', tid: 't3' });
    check('three rows to start', (sheet(A).match(/id="sgOpp_\d"/g) || []).length, 3);
    check('in the shape of the team\'s last game', [A.gamesForm.count, A.gamesForm.len, A.gamesForm.side].join(), '4,12,7');
    fill({ sgCount: '4', sgLen: '12', sgSide: '7',
      sgOpp_0: 'Riverside', sgDate_0: '2026-09-19', sgKick_0: '09:00', sgHome_0: 'home', sgVenue_0: 'Lakeside Park',
      sgOpp_1: '', sgDate_1: '2026-09-26', sgKick_1: '', sgHome_1: '', sgVenue_1: '',
      sgOpp_2: '', sgDate_2: '2026-10-03', sgKick_2: '11:15', sgHome_2: '', sgVenue_2: '' });
    A.click({ act: 'sgrow' });
    check('another row, a week after the last at its time', [A.gamesForm.rows.length, A.gamesForm.rows[3].date, A.gamesForm.rows[3].kick].join(), '4,2026-10-10,11:15');
    check('keeping what was typed', A.gamesForm.rows[0].opp, 'Riverside');
    fill({ sgDate_2: '', sgKick_2: '', sgDate_3: '', sgKick_3: '', sgOpp_3: '', sgHome_3: '', sgVenue_3: '' });
    check('a row with no opponent is refused', (A.click({ act: 'sgsave' }), A.lastToast()), 'Game 2 needs an opponent');
    check('and nothing is written', Object.values(A.state.matches).filter(m => m.teamId === 't3').length, 1);
    A.dom.node('#sgOpp_1').value = 'Hilltop';
    A.click({ act: 'sgsave' });
    const run = Object.values(A.state.matches).filter(m => m.teamId === 't3' && m.id !== 'm0').sort((a, b) => a.date.localeCompare(b.date));
    check('one game per filled row, the empty ones left out', run.map(m => m.opponent).join(), 'Riverside,Hilltop');
    check('each as Create game makes it', run.every(m => m.currentHalf === 1 && m.periodCount === 4 && m.periodMinutes === 12 && m.onFieldCount === 7 && m.stints && m.periods), true);
    check('with what was typed', [run[0].date, run[0].kickoff, run[0].home, run[0].venue].join(' '), '2026-09-19 09:00 home Lakeside Park');
    check('told how many', A.lastToast(), '2 games added for B9 Comets');
    check('still on the calendar', A.ui.view + ' ' + A.calSel(), 'calendar club');
  }

  console.log('\n--- against the database: one write per game ---');
  {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
    await D.flush(); fbk.signIn('boss', { name: 'Ada' }); await D.flush(); await fbk.serveClub('CLUB', club(), D.flush); await D.flush();
    D.ui.view = 'schedule'; D.render();
    D.click({ act: 'schedaddk', v: 'games', open: '1' });
    D.click({ act: 'schedfor', tid: 't2' });
    for (const [k, v] of Object.entries({ sgOpp_0: 'Riverside', sgDate_0: '2026-09-19', sgOpp_1: 'Hilltop', sgDate_1: '2026-09-26', sgOpp_2: 'Oakwood', sgDate_2: '' })) D.dom.node('#' + k).value = v;
    D.click({ act: 'sgsave' });
    await D.flush();
    const ws = fbk.record.writes.filter(w => /\/matches\//.test(w.path) && w.value && w.value.teamId === 't2');
    check('three games, three writes', ws.length, 3);
    check('each at matches/{id}', ws.every(w => /^orgs\/CLUB\/matches\/[\w-]+$/.test(w.path)), true);
    check('never the whole fixture list', fbk.record.writes.some(w => /\/matches$/.test(w.path)), false);
  }

  H.summary('the club schedule');
})();
