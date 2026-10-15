/* The Scheduler (SCHEDULER.md; build 163, steps 1 and 2 of its build order):
   the club's week laid out by field, before anything is written.

   What's pinned here is what would be easy to get quietly wrong:

   - Who. An admin gets all of it: the board, the teams against what they
     need, the strip, and the Planner's Find a time, Coaches and Picture day
     as tabs. A coach gets the board alone, read-only, her teams in colour and
     the rest dimmed with the names kept. A parent and a tracker are sent
     back, and a tap that reaches the handler is refused with nothing written.
   - A team's needs are a club setting at org/sched/teams/{tid}, one write per
     team by an admin, held to sane ranges on read; a coach cannot write them.
   - The board is a view of the calendar and keeps nothing: the supply is read
     from the field's permits, hours and closures each time; as many lanes as
     there are things on at once (the owner: "let's not limit it"); a game is
     locked; a place typed that matches no field gets a column of its own.
   - A coach's drive: another field the same day with less than an hour
     between is said; back to back on one field, an hour apart, or on at once
     (the coach clash) is not.
   - The club's week card is off the Calendar (test/schedule.js has that half)
     and what it said is the strip here: short teams, still to settle, shared
     field time apart. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
// the harness clock: Saturday 12 September 2026
const MON = '2026-09-14', TUE = '2026-09-15', WED = '2026-09-16', FRI = '2026-09-18';

const kid = (id, name, guardians) => ({ id, name, number: id.slice(1), active: true, guardians });
const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G11 Flight', players: { p1: kid('p1', 'Ella', { fam1: true }) },
      events: { e1: { id: 'e1', kind: 'practice', title: 'Practice', date: TUE, start: '17:30', end: '18:30', venue: 'Lakeside Park, Field 2', createdAt: 2 },
        e0: { id: 'e0', kind: 'practice', title: 'Practice', date: '2026-09-08', start: '17:30', end: '18:45', venue: 'Lakeside Park', createdAt: 1 } } },
    t2: { id: 't2', name: 'G13 Storm', players: { p3: kid('p3', 'Sam', { fam1: true }) },
      events: { e2: { id: 'e2', kind: 'practice', title: 'Practice', date: TUE, start: '18:00', end: '19:00', venue: 'Lakeside Park' } } },
    t3: { id: 't3', name: 'B9 Comets', players: { p5: kid('p5', 'Leo', { fam5: true }) },
      events: { e3: { id: 'e3', kind: 'event', title: 'Team photo', date: '', start: '', venue: '' } } }
  },
  matches: { m1: { id: 'm1', teamId: 't3', opponent: 'Riverside', date: TUE, kickoff: '19:00', venue: 'School turf', periodCount: 2, periodMinutes: 25 } },
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, kim: true, mum: true, trk: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, kim: { name: 'Kim' } },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { kim: true } }, t3: { coaches: { jaz: true } } },
    coachIndex: { jaz: 't1', kim: 't2' },
    org: { venues: {
      v1: { id: 'v1', name: 'Lakeside Park', pitches: 2, parts: { a: { id: 'a', name: 'Field 2' } },
        permits: { pm: { id: 'pm', days: [0, 1, 2, 3], start: '17:00', end: '20:00' } }, hours: { d4: { closed: true } }, closed: { c1: { id: 'c1', from: '2026-09-20', until: '2026-09-21', note: 'reseeding' } } },
      v2: { id: 'v2', name: 'School turf', pitches: 1 }
    } }
  }
});
const sheet = A => String(A.dom.node('#sheet').innerHTML || '');
const A = H.loadApp({ config: CONFIG, firebase: makeFakebase() });
function as(uid, c = club()) {
  A.state = c; A.me = uid ? { uid, name: uid } : null; A.appOwners = {};
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, avail: {}, seats: {}, away: {}, dirty: {}, refused: {} };
  A.ui.teamId = 't1'; A.ui.view = 'scheduler'; A.ui.planner = { board: { week: MON } }; A.toasts.length = 0;
  A.dom.node('#sheet').innerHTML = '';
}
const blocks = html => [...html.matchAll(/<button type="button" class="tg-ev" ([^>]*)>/g)].map(m => Object.fromEntries([...m[1].matchAll(/data-(\w+)="([^"]*)"/g)].map(x => [x[1], x[2]])));

(async () => {

  console.log('--- who has it ---');
  {
    for (const who of ['mum', 'trk']) {
      as(who); A.render();
      check(who + ': sent back to Club home', A.ui.view, 'club');
      const before = JSON.stringify(A.state);
      A.click({ act: 'schneedsave', tid: 't1' });
      check(who + ': a tap that reaches the handler is refused', A.lastToast(), 'Planning is for club admins');
      A.click({ act: 'scheduler' });
      check(who + ': even opening it', A.ui.view !== 'scheduler' && JSON.stringify(A.state) === before, true);
      A.ui.view = 'setup'; A.render();
      check(who + ': and no row to it on Settings', /data-act="scheduler"/.test(A.rendered()), false);
    }

    as('jaz'); A.render();
    let h = A.rendered();
    check('a coach keeps the screen', A.ui.view, 'scheduler');
    check('— the board alone: no tabs, no teams, no strip', /data-act="pltab"/.test(h) || /data-act="schneed"/.test(h) || /What needs looking at/.test(h), false);
    check('— her teams in colour and the rest in grey', blocks(h).map(b => b.tid + ':' + b.dim).join(), 't1:0,t2:1');
    check('— with the other team\'s name kept, so she knows who shares the field', /<b>G13 Storm<\/b>/.test(h), true);
    check('— and told so', /Your teams in colour; the rest of the club in grey/.test(h), true);
    A.click({ act: 'schfield', v: 'f:v2' });
    check('— she can look at another field', A.ui.planner.board.field + ' ' + blocks(A.rendered()).map(b => b.tid + ':' + b.dim + ':' + b.lock).join(), 'f:v2 t3:0:1');
    A.click({ act: 'schweek', v: '1' });
    check('— and another week', A.ui.planner.board.week, '2026-09-21');
    const before = JSON.stringify(A.state);
    A.click({ act: 'schneed', tid: 't1' });
    check('— but not at a team\'s needs', A.lastToast() + ' ' + sheet(A), 'Planning is for club admins ');
    A.click({ act: 'schneedsave', tid: 't1' });
    check('— and writes none', JSON.stringify(A.state), before);
    A.ui.view = 'setup'; A.render();
    check('— Settings offers her the Scheduler, read-only', /data-act="scheduler"/.test(A.rendered()) && /beside everyone else/.test(A.rendered()), true);

    as('boss'); A.render(); h = A.rendered();
    check('an admin: the board, Find a time, Coaches and Picture day as tabs', [...h.matchAll(/data-act="pltab" data-k="(\w+)"/g)].map(m => m[1]).join(), 'board,find,coach,pic');
    check('— no Clashes tab: it is the strip', /data-k="clash"/.test(h), false);
    check('— the teams against what they need', /data-act="schneed" data-tid="t1"/.test(h) && /What needs looking at/.test(h), true);
    check('— nothing dimmed on her board', blocks(h).every(b => b.dim === '0'), true);
    check('— titled Scheduler, over the club', A.rendered('#titlebar').includes('<span>Scheduler</span>'), true);
    check('— at its own address', A.uiToHash(), '#/club/scheduler');
    A.ui.view = 'club'; global.location.hash = '#/club/planner';
    check('— the Planner\'s old address lands here', A.hashToUi() && A.ui.view, 'scheduler');
    A.render(); A.click({ act: 'navback' });
    check('— Back is Settings', A.ui.view, 'setup');
    check('— and the word Planner is off the screen', /Planner/.test(A.rendered()), false);
  }

  console.log('\n--- a team\'s needs: org/sched/teams/{tid} ---');
  {
    as('boss');
    let n = A.schedNeed('t1');
    check('with no record: one practice a week, as long as the last one', [n.per, n.len, n.field, n.not.join(), n.set].join('|'), '1|60|||false');
    check('a team with no practice yet wants an hour', A.schedNeed('t3').len, 60);
    A.state.access.org.sched = { teams: { t1: { per: 9, len: 1000, field: 'v1', not: [1, 1, 9, 'x', 3], note: 'x'.repeat(200) } } };
    n = A.schedNeed('t1');
    check('held to sane ranges on read', [n.per, n.len, n.field, n.not.join(), n.note.length, n.set].join('|'), '7|180|v1|1,3|120|true');
    A.state.access.org.sched.teams.t1.field = 'gone';
    check('a field that is no longer there is no field', A.schedNeed('t1').field, '');

    as('boss'); A.render();
    A.click({ act: 'schneed', tid: 't2' });
    check('the sheet opens from the team\'s row', /G13 Storm: practices/.test(sheet(A)) && /id="snPer"/.test(sheet(A)), true);
    A.dom.node('#snPer').value = '2'; A.dom.node('#snLen').value = '75'; A.dom.node('#snField').value = 'v1'; A.dom.node('#snNote').value = 'Kim works late Mondays';
    A.click({ act: 'schneedwd', v: '0' });
    check('a night it can\'t do is a chip, kept with what was typed', /data-v="0" aria-pressed="true"/.test(sheet(A)) && A.dom.node('#snPer').value === '2', true);
    A.click({ act: 'schneedsave', tid: 't2' });
    deepEq('saved as one record', A.state.access.org.sched.teams.t2, { per: 2, len: 75, field: 'v1', not: [0], note: 'Kim works late Mondays' });
    check('said', A.lastToast(), 'Saved');
    check('and the row counts the calendar against it', /2 × 75 min · Lakeside Park · Kim · not Mon/.test(A.rendered()) && /1 of 2 placed/.test(A.rendered()), true);
    check('a team with its practices is quiet', /data-tid="t1"[^]*?1 of 1 placed/.test(A.rendered()), true);
  }

  console.log('\n--- the supply, read from the field each time ---');
  {
    as('boss');
    const f = A.state.access.org.venues.v1;
    deepEq('inside the permit is open; before and after are hatched', A.boardShut(f, TUE, 16, 21), [[16 * 60, 17 * 60, 'out'], [20 * 60, 21 * 60, 'out']]);
    deepEq('a day no permit covers is all hatched', A.boardShut(f, '2026-09-19', 16, 21), [[16 * 60, 21 * 60, 'out']]);
    deepEq('a day its hours mark closed is closed, whatever the permit says', A.boardShut(f, FRI, 16, 21), [[16 * 60, 21 * 60, 'closed']]);
    deepEq('a closure is closed too', A.boardShut(f, '2026-09-21', 16, 21), [[16 * 60, 21 * 60, 'closed']]);
    deepEq('a field with no permits and no hours is open all day', A.boardShut(A.state.access.org.venues.v2, TUE, 16, 21), []);
    deepEq('hours alone open only inside them', A.boardShut({ id: 'x', name: 'X', hours: { d1: { from: '18:00', to: '20:00' } } }, TUE, 16, 21), [[16 * 60, 18 * 60, 'out'], [20 * 60, 21 * 60, 'out']]);
    deepEq('a place typed that is no field has no supply to paint', A.boardShut(null, TUE, 16, 21), []);
    A.render();
    check('painted on the grid', /class="tg-shut" data-k="out"/.test(A.rendered()) && /Lakeside Park is closed/.test((A.ui.planner.board.week = '2026-09-21', A.render(), A.rendered())), true);
  }

  console.log('\n--- the board: a view of the calendar, nothing kept ---');
  {
    as('boss');
    const items = A.boardItems(MON);
    check('everything with a time this week, with its date and column', items.map(x => x.date.slice(8) + ':' + x.key + ':' + x.col).sort().join(), '15:e:e1:f:v1,15:e:e2:f:v1,15:g:m1:f:v2');
    check('the columns are the club\'s fields', A.boardColumns(items).map(c => c.id).join(), 'f:v1,f:v2');
    A.state.teams.t2.events.e9 = { id: 'e9', kind: 'practice', title: 'Practice', date: WED, start: '18:00', end: '19:00', venue: 'Riverside rec' };
    check('a place typed that matches no field is a column of its own', A.boardColumns(A.boardItems(MON)).map(c => c.name).join(), 'Lakeside Park,School turf,Riverside rec');
    deepEq('the evenings, opened out for anything outside them', [A.boardHours(items), A.boardHours([...items, { a: 9 * 60, b: 10 * 60 }])], [[16, 21], [9, 21]]);

    A.render();
    let b = blocks(A.rendered());
    check('two practices on one field at once are two lanes', b.map(x => x.id).join() + ' ' + /left:calc\(1 \* 100% \/ 2\)/.test(A.rendered()), 'e1,e2 true');
    check('the pitch named is on the block', /aria-label="G11 Flight: Practice, 5:30pm to 6:30pm, Field 2"/.test(A.rendered()), true);
    A.state.teams.t3.events.e4 = { id: 'e4', kind: 'practice', title: 'Practice', date: TUE, start: '18:15', end: '19:15', venue: 'Lakeside Park' };
    A.state.teams.t1.events.e5 = { id: 'e5', kind: 'practice', title: 'Keepers', date: TUE, start: '17:45', end: '18:45', venue: 'Lakeside Park' };
    A.render();
    check('four at once are four lanes: nothing folded into a +n, nothing refused', /width:calc\(100% \/ 4 - 3px\)/.test(A.rendered()) && !/tg-more/.test(A.rendered()), true);
    check('a tap on a block opens the entry', blocks(A.rendered())[0].act, 'calitem');
    A.click({ act: 'schfield', v: 'f:v2' });
    b = blocks(A.rendered());
    check('a game is locked', b.map(x => x.kind + ':' + x.lock).join(), 'game:1');
    check('nothing written to draw it', JSON.stringify(A.state.access.org.sched || null), 'null');
    A.ui.planner = { board: { week: '2026-09-21' } };
    A.state.matches.m2 = { id: 'm2', teamId: 't1', opponent: 'Hilltop', date: '2026-09-22', kickoff: '18:00', venue: 'School turf', periodCount: 2, periodMinutes: 25 };
    A.render();
    check('with nothing picked, the field with most on it that week is drawn first, not the first by name', blocks(A.rendered()).map(x => x.id).join() + ' ' + /data-v="f:v2" aria-pressed="true"/.test(A.rendered()), 'm2 true');
  }

  console.log('\n--- a coach\'s drive between fields ---');
  {
    as('boss');
    let d = A.driveWarnings(TUE);
    check('Jaz at Lakeside until 6:30, then the School turf at 7: a drive', d.map(x => x.text).join('|'), 'Jaz: G11 Flight: Practice at Lakeside Park until 6:30pm, then B9 Comets: v Riverside at School turf at 7pm (30 minutes between)');
    A.state.matches.m1.kickoff = '19:30';
    check('an hour between is not', A.driveWarnings(TUE).length, 0);
    A.state.matches.m1.kickoff = '19:00'; A.state.matches.m1.venue = 'Lakeside Park';
    check('back to back on one field is nothing to say', A.driveWarnings(TUE).length, 0);
    A.state.matches.m1.venue = 'School turf'; A.state.matches.m1.kickoff = '18:00';
    check('on at once is the coach clash, not a drive', A.driveWarnings(TUE).length + ' ' + A.clubClashesOn(TUE).some(c => c.kind === 'coach' && /^Jaz is due at/.test(c.text)), '0 true');
    A.state.matches.m1.kickoff = '19:00';
    A.ui.planner = { board: { week: MON } }; A.render();
    check('said on the strip under the day', /Tue 15 Sep<\/h4>[^]*?<span class="tag off">Drive<\/span> Jaz: G11 Flight/.test(A.rendered()), true);
    check('the number is one constant', A.DRIVE_GAP_MIN, 60);
  }

  console.log('\n--- the strip: what the Calendar\'s week card said ---');
  {
    as('boss'); A.render();
    const s = A.schedStrip(MON, A.boardItems(MON)), h = A.rendered();
    check('a team short of its practices', s.short.map(x => x.text).join(), 'B9 Comets: 0 of 1 practice this week');
    check('— said', /<span class="tag wait">Short<\/span> B9 Comets: 0 of 1 practice this week/.test(h), true);
    check('still to settle: the photo with no date, time or place', s.todo.map(r => r.x.title + ':' + r.miss.join()).join(), 'Team photo:date,time,place');
    check('— listed, a tap opening it', /Still to settle/.test(h) && /data-act="calitem" data-k="event" data-tid="t3" data-id="e3"/.test(h), true);
    check('two practices on one field are shared field time, apart and quiet', s.shared.length === 1 && !s.list.some(c => c.kind === 'shared') && /Shared field time/.test(h), true);
    check('a family with children on both teams is said', s.list.some(c => c.kind === 'family'), true);
    const e = club(); e.teams.t3.events = {}; e.matches = {}; e.access.org.sched = { teams: { t3: { per: 0 } } };
    as('boss', e); A.render();
    check('a team that needs none is not short', A.schedStrip(MON, A.boardItems(MON)).short.length, 0);
    e.teams.t1.events = {}; e.teams.t2.events = {}; e.access.org.sched.teams = { t1: { per: 0 }, t2: { per: 0 }, t3: { per: 0 } };
    as('boss', e); A.render();
    check('nothing to look at says so', /Nothing this week/.test(A.rendered()), true);
    check('and a club with no fields is told where to add them', (e.access.org.venues = {}, A.render(), /Fields and permits/.test(A.rendered())), true);
  }

  // last, as every suite has it: a second app loaded takes the harness's document with it
  console.log('\n--- against the database: one write, at the depth the rule on org grants ---');
  {
    const fbk = makeFakebase();
    const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
    await D.flush(); fbk.signIn('boss', { name: 'Ada' }); await D.flush(); await fbk.serveClub('CLUB', club(), D.flush); await D.flush();
    D.ui.view = 'scheduler'; D.ui.planner = { board: { week: MON } }; D.render();
    D.click({ act: 'schneed', tid: 't1' });
    D.dom.node('#snPer').value = '2';
    D.click({ act: 'schneedsave', tid: 't1' });
    await D.flush();
    const ws = fbk.record.writes.filter(w => /sched/.test(w.path));
    check('one write', ws.length, 1);
    check('at orgs/{code}/org/sched/teams/{tid}', ws[0].path, 'orgs/CLUB/org/sched/teams/t1');
    check('the record whole, the length from the team\'s last practice', ws[0].value.per + ' ' + ws[0].value.len, '2 60');
  }

  H.summary('the Scheduler');
})();
