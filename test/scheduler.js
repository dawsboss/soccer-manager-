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
     field time apart.

   Build 164, steps 3 and 4 (placing, and writing the term):
   - The draft is the phone's (sm.sched.v1:{club}): a team picked, then a
     cell; refused in place (outside the permit, the team already on, a
     pitch a game holds, a cell marked off) with no Place button, warned
     (the coach elsewhere, a drive, families split, off its field, a night
     it can't do) with one; a block moved, locked, taken off; a weekly
     practice on the calendar moved on the board or taken off from this week
     on; the draft counted against the team's needs; nothing written by any
     of it; a coach refused in the handler with the draft untouched; the
     draft surviving a reload.
   - Put it on the calendars: a new block one weekly series through
     addSeries(), the add sheet's own writer, so its entries have exactly the
     add sheet's shape; a blackout date and a date the team already practises
     at that time skipped, so twice writes nothing; a moved series its
     entries from the term's start on at the same ids under a new series id;
     a series taken off deleted from then on with its register; the term
     recorded at org/sched; the draft cleared. */

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
  // the draft is the phone's, per club: start each case with none
  const dr = A.schedDraft(); dr.blocks = {}; dr.off = {}; dr.forbid = {}; dr.from = ''; dr.until = ''; A.saveDraft();
}
const setv = (id, v) => { A.dom.node('#' + id).value = v; };
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
    check('an admin: the board, Rules, Find a time, Coaches and Picture day as tabs', [...h.matchAll(/data-act="pltab" data-k="(\w+)"/g)].map(m => m[1]).join(), 'board,rules,find,coach,pic');
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
    check('a family with children on both teams is said, at its rule\'s tier', s.list.some(c => c.kind === 'family' && c.tier === 'medium'), true);
    A.state.access.org.sched = { rules: { familySplit: 'off' } };
    check('— and not once the rule is Off', A.schedStrip(MON, A.boardItems(MON)).list.some(c => c.kind === 'family'), false);
    delete A.state.access.org.sched;
    const e = club(); e.teams.t3.events = {}; e.matches = {}; e.access.org.sched = { teams: { t3: { per: 0 } } };
    as('boss', e); A.render();
    check('a team that needs none is not short', A.schedStrip(MON, A.boardItems(MON)).short.length, 0);
    e.teams.t1.events = {}; e.teams.t2.events = {}; e.access.org.sched.teams = { t1: { per: 0 }, t2: { per: 0 }, t3: { per: 0 } };
    as('boss', e); A.render();
    check('nothing to look at says so', /Nothing this week/.test(A.rendered()), true);
    check('and a club with no fields is told where to add them', (e.access.org.venues = {}, A.render(), /Fields and permits/.test(A.rendered())), true);
  }


  console.log('\n--- placing: the draft on the phone ---');
  {
    as('boss'); A.render();
    check('nothing to tap until a team is picked', /data-act="schcell"/.test(A.rendered()), false);
    A.click({ act: 'schpick', v: 't3' });
    check('a team picked: every half hour is a place to tap', A.ui.planner.board.pick + ' ' + /data-act="schcell" data-wd="0" data-t="18:30"/.test(A.rendered()) + ' ' + /Tap where B9 Comets’s practice goes/.test(A.rendered()), 't3 true true');
    A.click({ act: 'schcell', wd: '0', t: '16:00' });
    check('outside the permit: refused, no Place button', /Can’t go here/.test(sheet(A)) && /Outside the club’s permit/.test(sheet(A)) && !/schplacego/.test(sheet(A)), true);
    A.closeSheet();
    A.click({ act: 'schpick', v: 't1' }); A.click({ act: 'schcell', wd: '1', t: '17:30' });
    check('the team already on then: refused', /G11 Flight already has Practice at 5:30pm/.test(sheet(A)) && !/schplacego/.test(sheet(A)), true);
    A.closeSheet();
    A.click({ act: 'schpick', v: 't3' }); A.click({ act: 'schcell', wd: '1', t: '17:30' });
    check('the coach due elsewhere: refused by default (a Must rule), the drive to her game warned', /Can’t go here\.<\/b> Jaz is due at G11 Flight: Practice then/.test(sheet(A)) && /Jaz: a drive to B9 Comets: v Riverside at School turf \(30 minutes between\)/.test(sheet(A)) && !/data-act="schplacego"/.test(sheet(A)), true);
    A.closeSheet();
    A.state.access.org.sched = { rules: { coachBusy: 'high' } };
    A.click({ act: 'schcell', wd: '1', t: '17:30' });
    check('the rule lowered to High: warned, with a Place button', /Jaz is due at G11 Flight: Practice then/.test(sheet(A)) && !/Can’t go here/.test(sheet(A)) && /data-act="schplacego"/.test(sheet(A)), true);
    A.closeSheet(); delete A.state.access.org.sched;
    A.click({ act: 'schcell', wd: '0', t: '18:00' });
    check('a free cell: the pitches to pick, nobody busy', /Which pitch/.test(sheet(A)) && /data-act="schpitch" data-v="a"/.test(sheet(A)) && /Nobody involved is busy/.test(sheet(A)), true);
    A.click({ act: 'schpitch', v: 'a' });
    check('the pitch picked is kept on the sheet', /data-v="a" aria-pressed="true"/.test(sheet(A)), true);
    const before = JSON.stringify(A.state);
    A.click({ act: 'schplacego' });
    const b1 = A.draftBlocks()[0];
    check('placed: a block in the draft, team, weekday, time, length, column and pitch', [b1.tid, b1.wd, b1.start, b1.len, b1.col, b1.pitch, b1.series, b1.locked].join('|'), 't3|0|18:00|60|f:v1|a||false');
    check('nothing written to the club', JSON.stringify(A.state), before);
    check('the pick is done', A.ui.planner.board.pick, '');
    check('drawn dotted, said as not written yet', /data-draft="1"[^>]*aria-label="B9 Comets: Practice, 6pm to 7pm, Field 2, not written yet"/.test(A.rendered()), true);
    check('counted against the team\'s needs, as to write', /1 of 1 placed · 1 to write/.test(A.rendered()), true);
    check('and no longer short on the strip', /B9 Comets: 0 of 1 practice/.test(A.rendered()), false);
    check('the To write card, with the term', /To write/.test(A.rendered()) && /1 new weekly slot/.test(A.rendered()) && /data-act="schwrite"/.test(A.rendered()) && /Mon 14 Sep/.test(A.rendered()) && /Sun 27 Dec/.test(A.rendered()), true);
    check('said', A.lastToast(), 'On the board. Nothing is written until you put it on the calendars.');
    A.click({ act: 'schpick', v: 't3' }); A.click({ act: 'schcell', wd: '0', t: '18:30' });
    check('the draft counts as busy for its own team', /B9 Comets already has Practice at 6pm/.test(sheet(A)), true);
    A.closeSheet(); A.click({ act: 'schpick', v: '' });

    A.click({ act: 'schblock', id: b1.id });
    check('a draft block opens its own sheet', /B9 Comets: new slot/.test(sheet(A)) && /data-act="schmove"/.test(sheet(A)) && /data-act="schdrop"/.test(sheet(A)), true);
    A.click({ act: 'schlock', id: b1.id });
    check('locked', A.draftBlocks()[0].locked + ' ' + /data-draft="1" data-off="0"/.test(A.rendered()) + ' ' + /data-lock="1" data-dim="0" data-draft="1"/.test(A.rendered()), 'true true true');
    A.click({ act: 'schlock', id: b1.id }); A.closeSheet();
    A.click({ act: 'schblock', id: b1.id }); A.click({ act: 'schmove', id: b1.id });
    check('Move it: the block is the pick', A.ui.planner.board.pick + ' ' + /Tap where B9 Comets’s slot moves to/.test(A.rendered()), 'b:' + b1.id + ' true');
    A.click({ act: 'schcell', wd: '3', t: '17:00' });
    check('the cell says Move', /<h3>Move B9 Comets<\/h3>/.test(sheet(A)) && /Move it here/.test(sheet(A)), true);
    A.click({ act: 'schplacego' });
    const b2 = A.draftBlocks()[0];
    check('moved within the field, the pitch kept', [A.draftBlocks().length, b2.id === b1.id, b2.wd, b2.start, b2.pitch].join('|'), '1|true|3|17:00|a');

    A.click({ act: 'schpick', v: 't2' }); A.click({ act: 'schcell', wd: '2', t: '18:00' });
    A.click({ act: 'schforbid' });
    check('a cell marked off: kept, drawn', JSON.stringify(A.schedDraft().forbid) + ' ' + /class="tg-forbid"/.test(A.rendered()), '{"2|18:00|f:v1":true} true');
    A.click({ act: 'schcell', wd: '2', t: '18:00' });
    check('and refused, with Unmark', /You marked that time off the board/.test(sheet(A)) && /data-act="schunforbid"/.test(sheet(A)) && !/schplacego/.test(sheet(A)), true);
    A.click({ act: 'schunforbid' });
    check('unmarked', JSON.stringify(A.schedDraft().forbid), '{}');
    A.click({ act: 'schpick', v: '' });

    A.click({ act: 'schblock', id: b2.id }); A.click({ act: 'schdrop', id: b2.id });
    check('taken off: the draft is empty and the card is gone', A.draftBlocks().length + ' ' + /To write/.test(A.rendered()), '0 false');
  }

  console.log('\n--- a weekly practice on the calendar, moved or taken off on the board ---');
  {
    const c = club();
    c.teams.t1.events.e1.series = 's1'; c.teams.t1.events.e0.series = 's1';
    c.teams.t1.events.e1b = { id: 'e1b', kind: 'practice', title: 'Practice', date: '2026-09-22', start: '17:30', end: '18:30', venue: 'Lakeside Park, Field 2', series: 's1' };
    as('boss', c); A.render();
    check('a weekly practice opens the board\'s sheet on an admin\'s board', /data-act="schblock" data-k="e:e1"/.test(A.rendered()), true);
    check('a one-off practice still opens the entry', /data-act="calitem" data-k="practice" data-tid="t2" data-id="e2"/.test(A.rendered()), true);
    A.click({ act: 'schblock', k: 'e:e1' });
    check('the sheet: open it, move it, take it off', /Open the practice/.test(sheet(A)) && /data-act="schmoveseries" data-s="s1" data-tid="t1"/.test(sheet(A)) && /data-act="schoffseries" data-s="s1"/.test(sheet(A)), true);
    A.click({ act: 'schoffseries', s: 's1' });
    check('taken off from this week on: drawn struck, not counted', /data-act="schblock" data-k="e:e1"[^>]*data-off="1"/.test(A.rendered()) + ' ' + /G11 Flight<\/span>[^]*?0 of 1 placed/.test(A.rendered()), 'true true');
    check('the To write card says so', /1 taken off/.test(A.rendered()), true);
    A.click({ act: 'schblock', k: 'e:e1' });
    check('and can be kept after all', /data-act="schunoff"/.test(sheet(A)), true);
    A.click({ act: 'schunoff', s: 's1' });
    check('kept', JSON.stringify(A.schedDraft().off) + ' ' + /data-off="1"/.test(A.rendered()), '{} false');
    A.click({ act: 'schblock', k: 'e:e1' }); A.click({ act: 'schmoveseries', s: 's1', tid: 't1' });
    check('Move it on the board: the series is the pick', A.ui.planner.board.pick, 's:s1:t1');
    A.click({ act: 'schcell', wd: '3', t: '18:00' });
    check('the cell says Move, from this week on', /<h3>Move G11 Flight<\/h3>/.test(sheet(A)) && /from this week on/.test(sheet(A)), true);
    A.click({ act: 'schplacego' });
    const b = A.draftBlocks()[0];
    check('a moved series: a block naming it, its length from the calendar, the old slot off', [b.series, b.wd, b.start, b.len, !!A.schedDraft().off.s1].join('|'), 's1|3|18:00|60|true');
    check('drawn: the old slot struck, the new one dotted', /data-k="e:e1"[^>]*data-off="1"/.test(A.rendered()) && /data-draft="1"[^>]*aria-label="G11 Flight: Practice, 6pm to 7pm, not written yet"/.test(A.rendered()), true);
    check('counted once', /G11 Flight<\/span>[^]*?1 of 1 placed · 1 to write/.test(A.rendered()), true);
    check('nothing written to the club', A.state.teams.t1.events.e1.date + ' ' + A.state.teams.t1.events.e1.series, '2026-09-15 s1');
  }

  console.log('\n--- kinds of practice ---');
  {
    as('boss');
    deepEq('the built-in kinds and their defaults', A.PTYPE_ORDER.map(k => [k, A.kindOf(k).len, A.kindOf(k).space, A.kindOf(k).who].join(':')), ['regular:75:share:team', 'technical:60:share:team', 'film:45:none:team', 'goalkeeper:60:share:keepers', 'fitness:45:share:team', 'scrimmage:60:pitch:two']);
    A.state.access.org.sched = { kinds: { film: { len: 30, space: 'room' }, goalkeeper: { len: 999, who: 'nobody' } } };
    check('the club changes a kind, held to the vocabularies', [A.kindOf('film').len, A.kindOf('film').space, A.kindOf('goalkeeper').len, A.kindOf('goalkeeper').who].join(), '30,room,60,keepers');
    check('an unknown kind is regular, and an entry with none is regular', A.kindOf('yoga').id + ' ' + A.ptypeOf({ kind: 'practice' }) + ' ' + A.ptypeOf({ ptype: 'film' }), 'regular regular film');
    A.state.access.org.sched = { teams: { t1: { per: 2, len: 75, need: { goalkeeper: 1, film: 9, yoga: 3 } } } };
    const n = A.schedNeed('t1');
    check('a team\'s needs by kind: regular is per, the rest held to 0 to 7, an unknown kind dropped', JSON.stringify(n.need) + ' ' + n.total, '{"regular":2,"technical":0,"film":7,"goalkeeper":1,"fitness":0,"scrimmage":0} 10');
    A.render(); A.click({ act: 'schneed', tid: 't2' });
    check('the needs sheet has a select per other kind', /id="snK_goalkeeper"/.test(sheet(A)) && /id="snK_scrimmage"/.test(sheet(A)), true);
    setv('snPer', '1'); setv('snLen', '60'); setv('snField', ''); setv('snNote', ''); setv('snK_goalkeeper', '1'); setv('snK_technical', '0'); A.click({ act: 'schneedsave', tid: 't2' });
    deepEq('saved, zeros left out', A.state.access.org.sched.teams.t2.need, { goalkeeper: 1 });
    check('the row says it, and counts the total', /1 goalkeepers/.test(A.rendered()) && /G13 Storm<\/span>[^]*?1 of 2 placed/.test(A.rendered()), true);

    A.click({ act: 'calnew', tid: 't2' });
    check('the add sheet offers the kinds, regular pressed', /data-act="calptype" data-v="regular" aria-pressed="true"/.test(sheet(A)) && /data-act="calptype" data-v="goalkeeper"/.test(sheet(A)), true);
    for (const [k, v] of Object.entries({ evDate: '2026-09-17', evStart: '17:00', evEnd: '', evTitle: '', evVenue: 'Lakeside Park', evNotes: '' })) setv(k, v);
    A.click({ act: 'calptype', v: 'goalkeeper' });
    check('a kind picked fills an end from its length, and says keepers alone are asked', /id="evEnd" value="18:00"/.test(sheet(A)) + ' ' + /Only the keepers are asked and counted/.test(sheet(A)), 'true true');
    setv('evEnd', '18:00');   // the fake DOM keeps an input's value across a redraw; a browser would show 18:00 now
    A.click({ act: 'calsave', tid: 't2' });
    const gk = Object.values(A.state.teams.t2.events).find(e => e.date === '2026-09-17');
    check('written with its kind, who comes, and the kind\'s title', [gk.ptype, gk.who, gk.title, gk.end].join('|'), 'goalkeeper|keepers|Goalkeepers|18:00');
    A.state.teams.t2.players.p3.gk = true; A.state.teams.t2.players.p4 = kid('p4', 'Zoe', { fam4: true });
    check('a keepers\' session asks and counts the keepers alone', A.rsvpCounts('t2', 'e_' + gk.id).none + ' ' + A.rsvpSquad('t2', 'e_' + gk.id).map(p => p.name).join(), '1 Sam');
    check('a regular one the squad', A.rsvpCounts('t2', 'e_e2').none, 2);
    A.click({ act: 'caledit', tid: 't2', id: gk.id }); A.click({ act: 'calptype', v: 'regular' }); A.click({ act: 'calsave', tid: 't2' });
    check('made regular again: the kind and who come off the entry', ('ptype' in A.state.teams.t2.events[gk.id]) || ('who' in A.state.teams.t2.events[gk.id]), false);
  }

  console.log('\n--- placing a kind: keepers from several teams, a scrimmage, film ---');
  {
    const c = club(); c.teams.t1.players.p1.gk = true;
    as('boss', c); A.render();
    A.click({ act: 'schpick', v: 't1' });
    check('a team picked: the kinds to choose, regular pressed', /data-act="schkind" data-v="goalkeeper"/.test(A.rendered()) && /data-act="schkind" data-v="regular" aria-pressed="true"/.test(A.rendered()), true);
    A.click({ act: 'schkind', v: 'goalkeeper' });
    check('said', /Tap where G11 Flight’s goalkeepers goes/.test(A.rendered()), true);
    A.click({ act: 'schcell', wd: '1', t: '17:30' });
    check('the sheet: which teams send keepers, the picked one in and fixed', /Which teams send keepers/.test(sheet(A)) && /data-act="schteams" data-v="t1" aria-pressed="true" disabled/.test(sheet(A)) && /keepers only asked/.test(sheet(A)), true);
    check('the keepers\' rule: over the team\'s own practice it warns, never refuses', /G11 Flight practises then \(5:30pm\): its keepers can’t be at both/.test(sheet(A)) && /data-act="schplacego"/.test(sheet(A)), true);
    A.click({ act: 'schteams', v: 't2' });
    check('a second team sends keepers, and is warned about too', /data-v="t2" aria-pressed="true"/.test(sheet(A)) && /G13 Storm practises then/.test(sheet(A)), true);
    A.closeSheet();
    A.click({ act: 'schcell', wd: '0', t: '18:00' }); A.click({ act: 'schteams', v: 't2' }); A.click({ act: 'schplacego' });
    const gkb = A.draftBlocks()[0];
    check('placed: one block, two teams, the kind, the kind\'s length', [gkb.ptype, gkb.tids.join('+'), gkb.len].join('|'), 'goalkeeper|t1+t2|60');
    check('drawn as one block naming the kind and both teams', /aria-label="Goalkeepers \(G11 Flight, G13 Storm\), 6pm to 7pm, not written yet"/.test(A.rendered()), true);
    check('counted for both teams', /G11 Flight<\/span>[^]*?2 of 1 placed · 1 to write/.test(A.rendered()) && /G13 Storm<\/span>[^]*?2 of 1 placed · 1 to write/.test(A.rendered()), true);
    A.click({ act: 'schpick', v: 't3' }); A.click({ act: 'schkind', v: 'scrimmage' }); A.click({ act: 'schcell', wd: '2', t: '18:00' });
    check('a scrimmage wants the other team', /A scrimmage is two teams: pick the other one/.test(sheet(A)) && !/schplacego/.test(sheet(A)), true);
    A.click({ act: 'schteams', v: 't2' });
    check('with it, it can be placed', /data-act="schplacego"/.test(sheet(A)), true);
    A.click({ act: 'schplacego' });
    A.click({ act: 'schpick', v: 't1' }); A.click({ act: 'schkind', v: 'regular' });
    A.state.access.org.venues.v1.pitches = 1; delete A.state.access.org.venues.v1.parts;
    A.click({ act: 'schcell', wd: '2', t: '18:30' });
    check('on a one-pitch field a scrimmage leaves no pitch for a practice', /No pitch left: Scrimmage \(B9 Comets, G13 Storm\)/.test(sheet(A)), true);
    A.closeSheet();
    A.click({ act: 'schkind', v: 'film' }); A.click({ act: 'schcell', wd: '2', t: '19:30' });
    check('film is a room or nothing: neither the pitch nor the permit refuses it (past eight, on a one-pitch field with a scrimmage)', !/No pitch left/.test(sheet(A)) && !/Outside the club’s permit/.test(sheet(A)) && /data-act="schplacego"/.test(sheet(A)), true);
    A.closeSheet(); A.click({ act: 'schcell', wd: '4', t: '18:30' });
    check('— not even a closed day', !/is closed then/.test(sheet(A)) && /data-act="schplacego"/.test(sheet(A)), true);
    A.closeSheet(); A.click({ act: 'schpick', v: '' });
    const dr = A.schedDraft(); dr.from = MON; dr.until = '2026-09-27';
    dr.blocks = { [gkb.id]: dr.blocks[gkb.id] }; A.saveDraft();
    const r = A.schedWrite(MON);
    deepEq('a keepers\' session for two teams, two weeks: four entries on two calendars', r, { made: 4, moved: 0, removed: 0, teams: 2 });
    const e1s = Object.values(A.state.teams.t1.events).filter(e => e.ptype === 'goalkeeper').sort((a, b) => a.date.localeCompare(b.date));
    const e2s = Object.values(A.state.teams.t2.events).filter(e => e.ptype === 'goalkeeper').sort((a, b) => a.date.localeCompare(b.date));
    check('each team its own weekly series, keepers only asked, titled Goalkeepers', e1s.map(e => e.date).join() + ' ' + e1s.every(e => e.who === 'keepers' && e.title === 'Goalkeepers' && e.series === e1s[0].series) + ' ' + (e1s[0].series !== e2s[0].series), '2026-09-14,2026-09-21 true true');
    check('the entries of a date share a club id across the teams, as picture day does', !!e1s[0].club && e1s[0].club === e2s[0].club && e1s[1].club === e2s[1].club && e1s[0].club !== e1s[1].club, true);
    A.render();
    check('and the board draws the two as one block', (A.rendered().match(/aria-label="Goalkeepers \(G11 Flight, G13 Storm\), 6pm to 7pm"/g) || []).length, 1);
  }

  console.log('\n--- rules and tiers ---');
  {
    as('boss');
    check('every rule has a default tier and a label', A.RULES.length >= 18 && A.RULES.every(r => A.TIERS.includes(r.tier) && r.label), true);
    check('a physical rule is Must by default', ['supply', 'pitchTaken', 'teamBusy', 'coachBusy', 'coachAway'].map(id => A.ruleTier(id)).join(), 'must,must,must,must,must');
    A.state.access.org.sched = { rules: { drive: 'low', familySplit: 'off', usualField: 'bogus' }, teams: { t3: { rules: { drive: 'must' } } } };
    check('the club\'s tier, the team\'s over it, an unknown word the default', [A.ruleTier('drive'), A.ruleTier('drive', 't3'), A.ruleTier('drive', 't1'), A.ruleTier('familySplit'), A.ruleTier('usualField'), A.ruleTier('nosuch')].join(), 'low,must,low,off,medium,off');
    A.render(); A.click({ act: 'schpick', v: 't3' }); A.click({ act: 'schcell', wd: '1', t: '17:30' });
    check('a rule made Must for one team refuses on its board: B9 Comets\' drive', /Can’t go here/.test(sheet(A)) && /Jaz: a drive to B9 Comets: v Riverside/.test(sheet(A)) && !/schplacego/.test(sheet(A)), true);
    A.closeSheet();
    A.state.access.org.sched.rules.coachBusy = 'high';
    A.click({ act: 'schcell', wd: '1', t: '17:30' });
    const refusedText = (sheet(A).match(/<b>Can’t go here\.<\/b>([^<]*)/) || [])[1] || '';
    check('a physical rule lowered warns instead, the drive still refusing', /Jaz is due at G11 Flight: Practice then/.test(sheet(A)) && !/Jaz is due/.test(refusedText) && /a drive/.test(refusedText), true);
    A.closeSheet();
    A.state.access.org.sched = { rules: { familySplit: 'off', coachBusy: 'low', drive: 'high' } };
    A.click({ act: 'schpick', v: 't2' }); A.click({ act: 'schcell', wd: '1', t: '17:30' });
    check('a rule turned Off says nothing (the family with children on both teams)', /famil/.test(sheet(A)), false);
    A.closeSheet(); A.click({ act: 'schpick', v: '' });
    const pc = A.placeCheck({ id: 'x', tid: 't3', tids: ['t3'], wd: 1, start: '17:30', len: 60, col: 'f:v1', pitch: '', series: '', ptype: 'regular' }, MON);
    check('placeCheck says each warning\'s rule and tier, highest first', pc.marks.length > 1 && pc.marks.every(m => m.rule && m.tier) && pc.marks.map(m => m.tier).join() === pc.marks.map(m => m.tier).sort((x, y) => ({ high: 0, medium: 1, low: 2 })[x] - ({ high: 0, medium: 1, low: 2 })[y]).join(), true);
    check('— and the cost sums the tiers', pc.cost, pc.marks.reduce((n, m) => n + ({ high: 100, medium: 10, low: 1 })[m.tier], 0));
    check('— a refusal costs everything', A.placeCheck({ id: 'x', tid: 't1', tids: ['t1'], wd: 1, start: '17:30', len: 60, col: 'f:v1', pitch: '', series: '', ptype: 'regular' }, MON).cost, Infinity);
    delete A.state.access.org.sched;
  }

  console.log('\n--- the Rules tab: presets, a team\'s own tiers, the club\'s own rules, tags ---');
  {
    as('boss'); A.ui.planner = { tab: 'rules', board: { week: MON } }; A.render();
    check('every rule with its five tier chips, for the club', (A.rendered().match(/data-act="schrtier"/g) || []).length, A.RULES.length * 5);
    check('the presets', /data-act="schpreset" data-v="family"/.test(A.rendered()), true);
    A.click({ act: 'schpreset', v: 'family' });
    const rules = A.state.access.org.sched.rules;
    check('a preset writes every rule\'s tier out, nothing hidden', [Object.keys(rules).length, rules.familySplit, rules.siblings, rules.supply, A.state.access.org.sched.preset].join(), A.RULES.length + ',high,high,must,family');
    A.click({ act: 'schrtier', r: 'drive', v: 'low' });
    check('a tier moved for the club', A.ruleTier('drive'), 'low');
    A.click({ act: 'schrtier', r: 'teamBusy', v: 'high' });
    check('a physical rule lowered, after asking (the harness says yes)', A.ruleTier('teamBusy'), 'high');
    A.click({ act: 'schrfor', v: 't3' }); A.click({ act: 'schpreset', v: 'coach' });
    check('a team\'s own preset: its tiers, the club\'s untouched', [A.ruleTier('drive', 't3'), A.ruleTier('drive'), A.state.access.org.sched.teams.t3.preset].join(), 'high,low,coach');
    A.click({ act: 'schrtier', r: 'drive', v: '' });
    check('As the club takes the team\'s own off', A.ruleTier('drive', 't3') + ' ' + ('drive' in A.state.access.org.sched.teams.t3.rules), 'low false');
    A.click({ act: 'schrfor', v: '' });
    setv('scA', 'Needs Lights!'); setv('scB', 'lights'); setv('scNote', 'Dark by six in November');
    A.click({ act: 'schctier', v: 'must' }); A.click({ act: 'schcadd' });
    let cs = A.customRules();
    check('a tag rule, tags normalised, at its tier', cs.map(c => [c.shape, c.a, c.b, c.tier, c.note].join('|')).join(), 'tagfield|needs lights|lights|must|Dark by six in November');
    check('said in words', /Teams tagged “needs lights” only on fields tagged “lights”/.test(A.rendered()), true);
    A.click({ act: 'schcshape', v: 'after' }); setv('scTeam', 't3'); setv('scTime', '19:00'); setv('scNote', ''); A.click({ act: 'schctier', v: 'high' }); A.click({ act: 'schcadd' });
    cs = A.customRules();
    check('an after rule for a team', cs.filter(c => c.shape === 'after').map(c => [c.a, c.b, c.tier].join('|')).join(), 't3|19:00|high');
    A.ui.planner = { tab: 'board', board: { week: MON } }; A.render();
    A.click({ act: 'schneed', tid: 't3' }); for (const [k, v] of Object.entries({ snPer: '1', snLen: '60', snField: '', snNote: '', snTags: 'Needs lights, U8' })) setv(k, v);
    for (const k of ['technical', 'film', 'goalkeeper', 'fitness', 'scrimmage']) setv('snK_' + k, '0');
    A.click({ act: 'schneedsave', tid: 't3' });
    deepEq('tags saved on the team, normalised', A.teamTags('t3'), ['needs lights', 'u8']);
    check('— the team\'s own tiers and preset kept when its needs are saved', A.state.access.org.sched.teams.t3.preset + ' ' + !!A.state.access.org.sched.teams.t3.rules, 'coach true');
    A.state.access.org.venues.v2.tags = { lights: true };
    A.click({ act: 'schpick', v: 't3' }); A.click({ act: 'schcell', wd: '0', t: '18:00' });
    check('the tag rule refuses on a field without the tag', /B9 Comets is “needs lights” and Lakeside Park is not “lights”/.test(sheet(A)) && !/schplacego/.test(sheet(A)), true);
    A.closeSheet(); A.click({ act: 'schfield', v: 'f:v2' }); A.click({ act: 'schcell', wd: '0', t: '18:30' });
    check('on a tagged field it is quiet, and the after rule warns past seven', !/needs lights/.test(sheet(A)) && /Past 7pm, which B9 Comets can’t do/.test(sheet(A)) && /schplacego/.test(sheet(A)), true);
    A.closeSheet(); A.click({ act: 'schpick', v: '' });
    A.ui.planner = { tab: 'rules', board: { week: MON } }; A.render();
    A.click({ act: 'schcrm', id: cs[0].id });
    check('a rule removed', A.customRules().length, 1);
    as('jaz'); A.ui.planner = { tab: 'rules', board: { week: MON } }; A.render();
    check('a coach has no Rules tab and is refused', !/data-act="schrtier"/.test(A.rendered()) && (A.click({ act: 'schrtier', r: 'drive', v: 'off' }), A.lastToast()) === 'Planning is for club admins' && A.ruleTier('drive') === 'high', true);
  }

  console.log('\n--- who may place: a coach reads, and writes nothing ---');
  {
    as('jaz'); A.render();
    const before = JSON.stringify(A.state);
    for (const [act, d] of [['schpick', { v: 't1' }], ['schcell', { wd: '0', t: '18:00' }], ['schplacego', {}], ['schforbid', {}], ['schoffseries', { s: 's1' }], ['schwrite', {}], ['schtermsave', {}], ['schclosedadd', {}]]) {
      A.toasts.length = 0; A.click({ act, ...d });
      check(`jaz: ${act} is refused`, A.lastToast(), 'Planning is for club admins');
    }
    check('— her teams\' weekly practices open the entry, not the board\'s sheet', /data-act="schblock"/.test(A.rendered()), false);
    check('— the draft untouched, nothing written', A.draftBlocks().length + ' ' + (JSON.stringify(A.state) === before), '0 true');
  }

  console.log('\n--- the term, and blackout dates ---');
  {
    as('boss'); A.render();
    deepEq('by default the week on the board and fifteen weeks', A.draftTerm(MON), { from: MON, until: '2026-12-27' });
    A.click({ act: 'schterm' });
    check('the sheet', /id="stFrom"/.test(sheet(A)) && /No holidays or weeks off yet/.test(sheet(A)), true);
    setv('stFrom', MON); setv('stUntil', '2026-10-11');
    A.click({ act: 'schtermsave' });
    deepEq('saved on the phone', A.draftTerm(MON), { from: MON, until: '2026-10-11' });
    A.click({ act: 'schterm' }); setv('stFrom', '2026-10-01'); setv('stUntil', '2026-09-01'); A.click({ act: 'schtermsave' });
    check('a last day before the first is refused', A.lastToast(), 'The last day is before the first');
    setv('scFrom', '2026-09-28'); setv('scUntil', '2026-10-02'); setv('scNote', 'Half term');
    A.click({ act: 'schclosedadd' });
    const closed = A.schedClosed();
    check('a blackout is the club\'s, one record', closed.length + ' ' + [closed[0].from, closed[0].until, closed[0].note].join('|'), '1 2026-09-28|2026-10-02|Half term');
    check('written at org/sched/closed', !!A.state.access.org.sched.closed[closed[0].id], true);
    check('and listed on the sheet with Remove', /Mon 28 Sep to Fri 2 Oct \(Half term\)/.test(sheet(A)) && /data-act="schclosedrm"/.test(sheet(A)), true);
    A.click({ act: 'schclosedrm', id: closed[0].id });
    check('removed', A.schedClosed().length, 0);
    A.closeSheet();
  }

  console.log('\n--- put it on the calendars ---');
  {
    const c = club();
    c.teams.t1.events.e1.series = 's1'; c.teams.t1.events.e0.series = 's1';
    c.teams.t1.events.e1b = { id: 'e1b', kind: 'practice', title: 'Practice', date: '2026-09-29', start: '17:30', end: '18:30', venue: 'Lakeside Park, Field 2', series: 's1' };
    c.teams.t1.events.e1c = { id: 'e1c', kind: 'practice', title: 'Practice', date: '2026-09-22', start: '17:30', end: '18:30', venue: 'Lakeside Park, Field 2', series: 's1' };
    c.teams.t2.events.e2.series = 's2';
    c.teams.t2.events.e2b = { id: 'e2b', kind: 'practice', title: 'Practice', date: '2026-09-22', start: '18:00', end: '19:00', venue: 'Lakeside Park', series: 's2' };
    c.teams.t2.attend = { e2b: { p3: true } };
    c.access.org.sched = { closed: { h: { id: 'h', from: '2026-09-28', until: '2026-10-02', note: 'Half term' } } };
    as('boss', c); A.render();
    // a practice from the add sheet, to hold the Scheduler's to
    A.click({ act: 'calnew', tid: 't3' });
    for (const [k, v] of Object.entries({ evTitle: '', evDate: '2026-09-16', evStart: '18:00', evEnd: '19:00', evVenue: 'School turf', evNotes: '' })) setv(k, v);
    A.click({ act: 'calsave', tid: 't3' });
    const fromSheet = Object.values(A.state.teams.t3.events).find(e => e.date === '2026-09-16');
    check('the add sheet made one', !!fromSheet, true);
    A.ui.view = 'scheduler';
    const dr = A.schedDraft();
    dr.from = MON; dr.until = '2026-10-11';
    dr.blocks = { n1: { id: 'n1', tid: 't3', wd: 0, start: '18:00', len: 60, col: 'f:v1', pitch: 'a', series: '', locked: false },
      m1: { id: 'm1', tid: 't1', wd: 3, start: '18:00', len: 60, col: 'f:v1', pitch: '', series: 's1', locked: false } };
    dr.off = { s1: true, s2: true };
    A.saveDraft(); A.render();
    check('the card counts it', /1 new weekly slot · 1 moved · 1 taken off/.test(A.rendered()) && /skipping Mon 28 Sep to Fri 2 Oct \(Half term\)/.test(A.rendered()), true);
    const r = A.schedWrite(MON);
    deepEq('what was written', r, { made: 3, moved: 2, removed: 3, teams: 3 });
    const news = Object.values(A.state.teams.t3.events).filter(e => e.venue === 'Lakeside Park, Field 2').sort((a, b) => a.date.localeCompare(b.date));
    check('a new slot: one entry per Monday of the term, the blackout week skipped', news.map(e => e.date).join(), '2026-09-14,2026-09-21,2026-10-05');
    check('one series, team-only, families asked, titled as a practice', news.every(e => e.series === news[0].series && e.series && e.public === false && e.ask === true && e.title === 'Practice' && e.kind === 'practice' && e.start === '18:00' && e.end === '19:00' && e.by === 'boss' && e.createdAt), true);
    check('exactly the add sheet\'s shape', Object.keys(news[0]).sort().join(), Object.keys({ ...fromSheet, series: 1 }).sort().join());
    const t1 = A.state.teams.t1.events;
    check('a moved series: the same entries, Thursdays from this week on, under a new series id', [t1.e1.date, t1.e1.start, t1.e1.end, t1.e1.series !== 's1', t1.e1.series === t1.e1c.series, t1.e1c.date, t1.e1.venue].join('|'), '2026-09-17|18:00|19:00|true|true|2026-09-24|Lakeside Park');
    check('— the week before the term untouched', t1.e0.date + ' ' + t1.e0.series, '2026-09-08 s1');
    check('— a plan keyed by the entry would follow it: the ids are kept', !!t1.e1 && !!t1.e1c, true);
    check('a series taken off: gone from this week on, with its register', [A.state.teams.t2.events.e2, A.state.teams.t2.events.e2b, (A.state.teams.t2.attend || {}).e2b].map(x => !!x).join(), 'false,false,false');
    check('— and the moved series\' entry falling in the blackout week went too', !t1.e1b && !Object.values(t1).some(e => e.date >= '2026-09-28' && e.date <= '2026-10-02'), true);
    check('the term recorded on the club', A.state.access.org.sched.from + ' ' + A.state.access.org.sched.until, MON + ' 2026-10-11');
    check('the draft cleared', A.draftBlocks().length + ' ' + JSON.stringify(A.schedDraft().off), '0 {}');
    dr.blocks = { n1: { id: 'n1', tid: 't3', wd: 0, start: '18:00', len: 60, col: 'f:v1', pitch: 'a', series: '', locked: false } }; A.saveDraft();
    deepEq('written twice, nothing new: the team already practises then', A.schedWrite(MON), { made: 0, moved: 0, removed: 0, teams: 0 });
    check('— the count unchanged', Object.values(A.state.teams.t3.events).filter(e => e.venue === 'Lakeside Park, Field 2').length, 3);
    A.render();
    check('the board draws what was written as the calendar\'s own', (A.rendered().match(/data-draft="0"/g) || []).length > 0 && !/data-draft="1"/.test(A.rendered()), true);
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
    const dr = D.schedDraft();
    dr.from = MON; dr.until = '2026-09-27';
    dr.blocks = { n1: { id: 'n1', tid: 't3', wd: 0, start: '18:00', len: 60, col: 'f:v1', pitch: '', series: '', locked: false } };
    D.saveDraft();
    D.schedWrite(MON); await D.flush();
    const ev = fbk.record.writes.filter(w => /^orgs\/CLUB\/teams\/t3\/events\/[\w-]+$/.test(w.path));
    check('the term written: one write per entry at teams/{tid}/events/{eid}', ev.length + ' ' + ev.every(w => w.value && w.value.kind === 'practice' && w.value.series), '2 true');
    check('each stamped with who wrote it', ev.every(w => w.value.edit && w.value.edit.by === 'boss'), true);
    check('the term at org/sched', fbk.record.writes.some(w => w.path === 'orgs/CLUB/org/sched/from' && w.value === MON), true);
    check('never a team\'s whole calendar', fbk.record.writes.some(w => /\/teams\/t3(\/events)?$/.test(w.path)), false);

    // the draft survives a reload: a phone opened again with the draft in its storage
    const fbk2 = makeFakebase();
    const E = H.loadApp({ firebase: fbk2, config: CONFIG, storage: { 'sm.workspace': 'CLUB', 'sm.sched.v1:CLUB': JSON.stringify({ blocks: { z: { id: 'z', tid: 't2', wd: 1, start: '19:00', len: 60, col: 'f:v1', pitch: '', series: '', locked: true } }, off: {}, forbid: { '0|17:00|f:v1': true }, from: MON, until: '2026-10-11' }) } });
    await E.flush(); fbk2.signIn('boss', { name: 'Ada' }); await E.flush(); await fbk2.serveClub('CLUB', club(), E.flush); await E.flush();
    E.ui.view = 'scheduler'; E.ui.planner = { board: { week: MON } }; E.render();
    check('after a reload the draft is still there', E.draftBlocks().map(b => b.id + ':' + b.locked).join() + ' ' + JSON.stringify(E.schedDraft().forbid) + ' ' + E.draftTerm(MON).until, 'z:true {"0|17:00|f:v1":true} 2026-10-11');
    check('and drawn', /data-draft="1"[^>]*aria-label="G13 Storm: Practice, 7pm to 8pm, not written yet"/.test(E.rendered()) && /class="tg-forbid"/.test(E.rendered()), true);
  }

  H.summary('the Scheduler');
})();
