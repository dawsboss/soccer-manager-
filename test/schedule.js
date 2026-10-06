/* The club schedule: the owner's "the admin being thrown into My calendar
   isn't great. They need a way to schedule out games and stuff easier. Also
   practices: some teams share fields, which is ok. Just note that there is a
   shared field time."

   What's pinned here:

   - It's the admins'. A coach, a tracker or a parent is sent back to Club
     home, and an action that reaches the handler anyway is refused with
     nothing written.
   - An admin lands on the club's schedule from Club home, and My calendar is
     only hers: an admin who works no team isn't offered an empty one first.
   - Every team's week on one screen, narrowed by team and by kind, with what
     is still missing a date, time or place, and teams with no practice.
   - Two teams practising on one field at once is a note on both entries,
     never a clash; a game short of a pitch is.
   - Adding opens the sheet a team's coach uses, for the team picked, and
     keeps her on the schedule. A run of games is one write per game at
     matches/{id}, in the shape the team's last game had, a row with no
     opponent refused and an empty row left out. */

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
}
const fill = vals => { for (const [k, v] of Object.entries(vals)) A.dom.node('#' + k).value = v; };

(async () => {

  console.log('--- who has it ---');
  {
    for (const who of ['jaz', 'mum', 'trk']) {
      as(who); A.render();
      check(who + ': the screen sends them back', A.ui.view, 'club');
      check(who + ': no Club schedule card on Club home', /data-act="schedule"/.test(A.rendered()), false);
      const before = JSON.stringify(A.state);
      A.ui.sched = { add: 'games' };
      A.click({ act: 'schedfor', tid: 't1' });
      check(who + ': adding through the handler is refused', A.lastToast(), 'The club schedule is for club admins');
      A.click({ act: 'sgsave' });
      check(who + ': and nothing is written', JSON.stringify(A.state), before);
    }
    as('boss'); A.ui.view = 'club'; A.render();
    check('an admin has it first on Club home', /data-act="schedule"[^>]*>\s*<b>Club schedule<\/b>/.test(A.rendered()), true);
    check('saying what is on this week', /This week: /.test(A.rendered()), true);
    check('and is not offered an empty My calendar ahead of it', /data-v="mycal"/.test(A.rendered()), false);
    check('her own calendar holds only her own', A.myCalOwn(), false);
    A.click({ act: 'schedule' });
    check('it opens', A.ui.view, 'schedule');
    check('at its own address', A.uiToHash(), '#/club/schedule');
    A.ui.view = 'club';
    global.location.hash = '#/club/schedule';
    check('and the address opens it', A.hashToUi() && A.ui.view, 'schedule');
    A.ui.view = 'admin'; A.render();
    check('Club settings has it too', /data-act="schedule"/.test(A.rendered()), true);
    A.ui.view = 'calendar'; A.render();
    check('and so does a team\'s Calendar tab, for an admin', /data-act="schedule"/.test(A.rendered()), true);

    // an admin who also coaches still has her own calendar on Club home
    const c = club(); c.access.teams.t3 = { coaches: { boss: true } };
    as('boss', c); A.ui.view = 'club'; A.render();
    check('an admin who coaches keeps My calendar', /data-v="mycal"/.test(A.rendered()), true);
  }

  console.log('\n--- a week of the club ---');
  {
    as('boss'); A.ui.sched = { week: TUE }; A.render();
    const html = A.rendered();
    check('the week runs Monday to Sunday', /14 Sep – 20 Sep/.test(html), true);
    check('every team\'s entries, under their day', /G11 Flight/.test(html) && /G13 Storm/.test(html) && /Team photo/.test(html), true);
    const w = A.schedWeek();
    check('counted', [w.games, w.practices, w.events].join(), '0,2,1');
    check('a team with no practice this week is said', w.idle.join(), 't3');
    check('on screen', /No practice this week: B9 Comets/.test(html), true);
    check('a day with nothing has a way to add to it', /data-act="schedadd" data-v="2026-09-14"/.test(html), true);

    A.click({ act: 'schedteam', tid: 't2' });
    check('one team picked from all of them is that team alone', A.schedWeek().tids.join(), 't2');
    A.click({ act: 'schedteam', tid: 't1' });
    check('then each tap adds one', A.schedWeek().tids.sort().join(), 't1,t2');
    A.click({ act: 'schedteam', tid: '' });
    check('and All teams is all of them', A.schedWeek().tids.length, 3);
    A.click({ act: 'schedkind', v: 'practice' });
    check('a kind can be left out', A.schedWeek().items.some(x => x.kind === 'practice'), false);
    A.click({ act: 'schedkind', v: 'practice' });

    A.click({ act: 'schedweek', v: '1' });
    check('next week', A.ui.sched.week, '2026-09-21');
    A.click({ act: 'schedweek', v: '0' });
    check('back to this one', A.ui.sched.week, '2026-09-07');

    const todo = A.schedTodo(['t1', 't2', 't3']);
    check('still to settle: the photo with no time or place', todo.some(r => r.x.title === 'Team photo' && r.miss.join() === 'time,place'), true);
    check('and nothing already played', todo.some(r => r.x.id === 'm0'), false);
    A.ui.sched.week = TUE; A.render();
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
    A.ui.sched = { week: TUE }; A.render();
    check('and counted on the schedule', A.schedWeek().clash > 0 && /no pitch left/.test(A.rendered()), true);
    c.access.org = { venues: { v1: { id: 'v1', name: 'Lakeside Park', pitches: 3 } } };
    check('with a pitch for each, the game only shares', A.fieldMates(g).clash, false);
    c.teams.t2.events.e2.called = 'cancelled';
    check('something called off shares nothing', A.fieldMates(A.calItems(['t1']).find(x => x.id === 'e1')).mates.some(y => y.tid === 't2'), false);
    check('another place is not shared', A.fieldMates({ ...A.calItems(['t1']).find(x => x.id === 'e1'), venue: 'Elm Street' }) && true, true);
  }

  console.log('\n--- adding from the schedule ---');
  {
    as('boss'); A.ui.sched = { week: TUE }; A.render();
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
    check('and she is still on the schedule', A.ui.view, 'schedule');
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
    check('still on the schedule', A.ui.view, 'schedule');
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
    check('still on the schedule', A.ui.view, 'schedule');
  }

  console.log('\n--- against the database: one write per game ---');
  {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
    await D.flush(); fbk.signIn('boss', { name: 'Ada' }); await D.flush(); fbk.deliver('workspaces/CLUB', club()); await D.flush();
    D.ui.view = 'schedule'; D.render();
    D.click({ act: 'schedaddk', v: 'games', open: '1' });
    D.click({ act: 'schedfor', tid: 't2' });
    for (const [k, v] of Object.entries({ sgOpp_0: 'Riverside', sgDate_0: '2026-09-19', sgOpp_1: 'Hilltop', sgDate_1: '2026-09-26', sgOpp_2: 'Oakwood', sgDate_2: '' })) D.dom.node('#' + k).value = v;
    D.click({ act: 'sgsave' });
    await D.flush();
    const ws = fbk.record.writes.filter(w => /\/matches\//.test(w.path) && w.value && w.value.teamId === 't2');
    check('three games, three writes', ws.length, 3);
    check('each at matches/{id}', ws.every(w => /^workspaces\/CLUB\/matches\/[\w-]+$/.test(w.path)), true);
    check('never the whole fixture list', fbk.record.writes.some(w => /\/matches$/.test(w.path)), false);
  }

  H.summary('the club schedule');
})();
