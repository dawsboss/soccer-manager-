/* The recap: a finished game, told back.

   Stats answers "how many"; the recap answers "when" and "how often", and
   says what went well and what to work on. It is worked out from the same
   goals, shots and set pieces Stats reads, so what is pinned here is the
   arithmetic of time: which spell a goal falls in, the longest wait for a
   shot, a goal answered or let straight back in. And that it is offered only
   once a game is over — "your best spell" at half time is a guess.

   Two small things ride along because they live on the same bar: the game
   count runs the way a season does (the first game is 1, the latest n of n),
   and the Edit button there is the team's coaches' and admins' only. */

const H = require('./harness');
const { check, deepEq } = H;

const CFG = { apiKey: 'k', databaseURL: 'https://prod.example' };
const A = H.loadApp({ config: CFG });
const T0 = Date.UTC(2026, 8, 12, 12, 0, 0);
const MIN = 60000;

function setup(game = {}, uid = 'boss') {
  H.clock.set(T0);
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight',
        players: {
          p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7', guardians: { mum: true } },
          p2: { id: 'p2', name: 'Mia Kowalski', number: '8' },
          p3: { id: 'p3', name: 'Rosa Delgado', number: '4' },
          p4: { id: 'p4', name: 'Jo Nakamura', number: '9' }
        }
      }
    },
    matches: {
      g1: {
        id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12', createdAt: 3,
        periodCount: 2, periodMinutes: 40, onFieldCount: 3, currentHalf: 2, ended: true,
        // two 40-minute halves: 4800 seconds of football
        periods: { 0: { half: 1, start: T0 - 90 * MIN, end: T0 - 50 * MIN }, 1: { half: 2, start: T0 - 45 * MIN, end: T0 - 5 * MIN } },
        stints: {
          s1: { pid: 'p1', on: 0, off: 4800 }, s2: { pid: 'p2', on: 0, off: 4800 },
          s3: { pid: 'p3', on: 0, off: 2400 }, s4: { pid: 'p4', on: 2400, off: 4800 }
        },
        planned: { p1: 80, p2: 80, p3: 40, p4: 40 },
        goals: {
          a: { t: 300, side: 'us', pid: 'p1', assist: 'p2' },
          b: { t: 2500, side: 'them' },
          c: { t: 2600, side: 'us', pid: 'p3' },          // answered inside five minutes
          d: { t: 4500, side: 'us', pid: 'p1' }           // in the last ten
        },
        shots: {
          x1: { t: 200, side: 'us', onTarget: false }, x2: { t: 1000, side: 'us', onTarget: true },
          x3: { t: 1100, side: 'us', onTarget: false }, x4: { t: 3000, side: 'us', onTarget: true },
          x5: { t: 3100, side: 'us', onTarget: true }, x6: { t: 4400, side: 'us', onTarget: false },
          y1: { t: 2400, side: 'them', onTarget: true }, y2: { t: 2450, side: 'them', onTarget: false }
        },
        events: { e1: { t: 1200, side: 'us', kind: 'corner' }, e2: { t: 3200, side: 'us', kind: 'corner' } },
        ...game
      },
      g0: { id: 'g0', teamId: 't1', opponent: 'Northgate', date: '2026-09-05', createdAt: 2, ended: true, periods: {} },
      g2: { id: 'g2', teamId: 't1', opponent: 'Eastfield', date: '2026-09-19', createdAt: 4, periods: {} }
    },
    access: { org: { name: 'Flight FC' }, admins: { boss: true }, teams: { t1: { coaches: { jaz: true } } }, index: {} }
  };
  A.me = uid ? { uid, name: uid } : null;
  A.appOwners = {};
  A.ui.teamId = 't1'; A.ui.matchId = 'g1'; A.ui.view = 'game';
  return A.state.matches.g1;
}

console.log('--- the count runs the way a season does ---');
{
  setup();
  const t = A.state.teams.t1, ms = A.state.matches;
  // on the game's ⋯ menu, where the game bar's count went (build 144)
  check('the latest game is 3 of 3', /gb-hint">3\/3</.test(A.gameMenu(t, ms.g2)), true);
  check('the one before it is 2 of 3', /gb-hint">2\/3</.test(A.gameMenu(t, ms.g1)), true);
  check('the first game played is 1 of 3', /gb-hint">1\/3</.test(A.gameMenu(t, ms.g0)), true);
}

console.log('--- an Edit button, for whoever may edit ---');
{
  setup({}, 'boss');
  const t = A.state.teams.t1;
  check('an admin gets it on the game\'s menu', /data-act="editmatch" data-id="g1"/.test(A.gameMenu(t, A.state.matches.g1)), true);
  setup({}, 'jaz');
  check('so does the team\'s coach', /data-act="editmatch"/.test(A.gameMenu(t, A.state.matches.g1)), true);
  A.click({ act: 'editmatch', id: 'g1' });
  check('and it opens the game\'s details', /data-act="savematch"/.test(A.rendered('#sheet')), true);
  setup({}, 'mum');
  check('a parent does not', /data-act="editmatch"/.test(A.gameMenu(t, A.state.matches.g1)), false);
  const before = A.toasts.length;
  A.dom.sheetHtml = '';
  A.click({ act: 'editmatch', id: 'g1' });
  check('and a tap that reaches the handler is refused', A.toasts.length > before && /coach/.test(A.lastToast()), true);
}

console.log('--- when it happened ---');
{
  const m = setup();
  const r = A.recap(A.state.teams.t1, m);
  check('80 minutes of football', r.L, 4800);
  check('in ten-minute spells', r.bs, 600);
  check('eight of them', r.spells.length, 8);
  check('a goal lands in its spell', r.spells[0].us.goals, 1);
  check('and so does theirs', r.spells[4].them.goals, 1);
  check('a corner counts toward its spell', r.spells[2].us.corners, 1);
  check('the best spell is the opening ten', r.best.from, 0);
  check('the toughest is when they scored', r.worst.from, 2400);
  check('the longest wait for a shot', r.drought.us.len, 1500);
  deepEq('from the 19th minute to the 44th', [r.drought.us.from, r.drought.us.to], [1100, 2600]);
  check('their goal was answered', r.answered, 1);
  check('ours never let straight back in', r.letBack, 0);
  check('one goal in the last ten minutes', r.late.us, 1);
  deepEq('the scorers, most first', r.scorers.map(x => [x.pid, x.n]), [['p1', 2], ['p3', 1]]);
  deepEq('and who set one up', r.assists.map(x => x.pid), ['p2']);
  check('the halves split by the clock', r.byHalf.map(h => `${h.us.goals}-${h.them.goals}`).join(' '), '1-0 2-1');

  /* A 4800-second game that ran a few seconds over must not grow a ninth
     column nothing could happen in. */
  const over = setup({ periods: { 0: { half: 1, start: T0 - 90 * MIN, end: T0 - 50 * MIN }, 1: { half: 2, start: T0 - 45 * MIN, end: T0 - 5 * MIN + 40000 } } });
  check('stoppage time joins the last spell', A.recap(A.state.teams.t1, over).spells.length, 8);
}

console.log('--- what went well, and what to work on ---');
{
  const m = setup();
  const t = A.state.teams.t1;
  const n = A.recapNotes(t, m, A.recap(t, m));
  const good = n.good.join(' | '), work = n.work.join(' | ');
  check('the win', /Won it, 3–1/.test(good), true);
  check('outshooting them, a goal counting as a shot', /Outshot Riverside 9 to 3/.test(good), true);
  check('answering a goal', /Hit straight back/.test(good), true);
  check('a strong finish', /last ten minutes/.test(good), true);
  check('the minutes everyone was planned', /Everyone got the minutes/.test(good), true);
  check('a long wait for a shot is something to work on', /25 minutes without a shot/.test(work), true);
  const all = JSON.stringify(n);
  check('no child is named in either list', ['Ella', 'Mia', 'Rosa', 'Jo '].some(x => all.includes(x)), false);

  // the other way round: let one in straight after scoring, and lose
  const bad = setup({
    goals: { a: { t: 300, side: 'us', pid: 'p1' }, b: { t: 400, side: 'them' }, c: { t: 4500, side: 'them' }, d: { t: 4600, side: 'them' } },
    shots: {}, events: {}
  });
  const nb = A.recapNotes(t, bad, A.recap(t, bad));
  check('let one straight back in', nb.work.some(x => /within five minutes of scoring/.test(x)), true);
  check('conceded late', nb.work.some(x => /Conceded 2 in the last ten/.test(x)), true);
  check('no win claimed', nb.good.some(x => /Won/.test(x)), false);
}

console.log('--- more to say: the order of the goals, the restart, set pieces, the season ---');
{
  /* Two games with the same kind of score should not read the same. Each of
     these rules needs its own evidence (a goal within half a minute of a
     corner, a shot placed on the map, the last meeting with this opponent),
     and says nothing without it, so a recap is built from what this game
     recorded rather than the same three lines every week. */
  const t = A.state.teams.t1;
  const notes = (game, extra) => {
    const m = setup(game);
    Object.assign(A.state.matches, extra || {});
    return A.recapNotes(t, m, A.recap(t, m));
  };
  // the fixture: scored first, got caught, took the lead back
  const base = notes();
  // the first goal came inside ten minutes, so the fast start says it and scored-first stands aside
  check('an early first goal is the fast start, said once', base.good.filter(x => /Scored first|Fast start/.test(x)).length, 1);
  const later = notes({ goals: { a: { t: 900, side: 'us', pid: 'p1' }, b: { t: 2500, side: 'them' }, c: { t: 2600, side: 'us', pid: 'p3' }, d: { t: 4500, side: 'us', pid: 'p1' } } });
  check('a first goal after ten minutes is said as scored first', later.good.some(x => /^Scored first, 16 minutes in\.$/.test(x)), true);
  const held = notes({ goals: { a: { t: 900, side: 'us', pid: 'p1' }, b: { t: 2500, side: 'us', pid: 'p3' }, c: { t: 2600, side: 'them' } } });
  check('and never falling behind after it is said with it', held.good.some(x => /^Scored first, 16 minutes in, and never fell behind\.$/.test(x)), true);
  check('and all four players got on', base.good.some(x => /All 4 players got on the pitch/.test(x)), true);
  check('with nothing said about a draw, a lead let go or the restart', base.work.some(x => /let it slip|Lost the|Slow after/.test(x)), false);

  // led, then lost it: a corner and a free kick cost two of the goals, every shot from range
  const lost = notes({
    goals: { a: { t: 300, side: 'us', pid: 'p1' }, b: { t: 1500, side: 'them' }, c: { t: 3020, side: 'them' }, d: { t: 4000, side: 'them' } },
    shots: { x1: { t: 200, side: 'us', onTarget: false, xy: { x: 50, y: 40 } }, x2: { t: 4300, side: 'us', onTarget: true, xy: { x: 50, y: 45 } },
      x3: { t: 4400, side: 'us', onTarget: false, xy: { x: 30, y: 50 } }, x4: { t: 4600, side: 'us', onTarget: true, xy: { x: 30, y: 10 } },
      y1: { t: 2000, side: 'them', onTarget: true }, y2: { t: 2100, side: 'them', onTarget: false } },
    events: { e1: { t: 1480, side: 'them', kind: 'corner' }, e2: { t: 3000, side: 'us', kind: 'foul' },
      ...Object.fromEntries([100, 200, 300, 400, 500, 600].map((sec, i) => [`t${i}`, { t: sec, side: 'them', kind: 'throw' }])),
      t7: { t: 700, side: 'us', kind: 'throw' }, t8: { t: 800, side: 'us', kind: 'throw' } }
  }, { g5: { id: 'g5', teamId: 't1', opponent: 'riverside', date: '2026-08-29', createdAt: 1, ended: true, periods: {}, goals: { a: { t: 1, side: 'us' }, b: { t: 2, side: 'us' } } } });
  const lw = lost.work.join(' | ');
  check('a lead not held', /Led 1–0 and lost it/.test(lw), true);
  check('a goal straight from their corner', /Conceded one straight from a corner/.test(lw), true);
  check('and one from the free kick after our foul', /Conceded one from a free kick after a foul given away/.test(lw), true);
  check('shots from distance, from the shot map', /only 1 of 4 placed shots from inside the box/.test(lw), true);
  check('a slow restart, timed from the second half\'s kick-off', /Slow after the restart: 32 minutes before a shot in the 2nd half/.test(lw), true);
  check('late shots with no goal to show', /3 shots in the last ten minutes and no goal to show/.test(lw), true);
  check('the quiet spells counted', /Nothing on goal in 6 of the game's 8 ten-minute spells/.test(lw), true);
  check('their finishing', /Punished: Riverside scored from 3 of 5 shots/.test(lw), true);
  check('the touchline', /Riverside had 6 throw-ins to our 2/.test(lw), true);
  check('the most let in this season', /Let in 3 — the most in a game this season/.test(lw), true);
  check('the last meeting with them, matched whatever the case', /Beat Riverside 2–0 last time, lost this one/.test(lw), true);
  check('a fast start is said once, not as scored-first too', lost.good.filter(x => /Scored first|Fast start/.test(x)).length, 1);
  check('no win claimed', lost.good.some(x => /Won|win/.test(x)), false);

  // two down at half time, three in the second half: a comeback, a run of wins, the keeper's afternoon
  const back = notes({
    goals: { a: { t: 300, side: 'them' }, b: { t: 900, side: 'them' }, c: { t: 2700, side: 'us', pid: 'p1', assist: 'p2' }, d: { t: 3300, side: 'us', pid: 'p3', assist: 'p1' }, e: { t: 4000, side: 'us', pid: 'p2' } },
    shots: { x1: { t: 2500, side: 'us', onTarget: true }, x2: { t: 2550, side: 'us', onTarget: false }, x3: { t: 2590, side: 'us', onTarget: true },
      y1: { t: 4300, side: 'them', onTarget: true }, y2: { t: 4400, side: 'them', onTarget: true }, y3: { t: 4500, side: 'them', onTarget: false } },
    events: { k1: { t: 100, side: 'us', kind: 'keeper' }, k2: { t: 200, side: 'us', kind: 'keeper' }, k3: { t: 300, side: 'us', kind: 'keeper' } }
  }, {
    g0: { id: 'g0', teamId: 't1', opponent: 'Northgate', date: '2026-09-05', createdAt: 2, ended: true, periods: {}, goals: { a: { t: 1, side: 'us' } } },
    g5: { id: 'g5', teamId: 't1', opponent: 'A', date: '2026-08-29', createdAt: 1, ended: true, periods: {}, goals: { a: { t: 1, side: 'us' } } },
    g6: { id: 'g6', teamId: 't1', opponent: 'B', date: '2026-08-22', createdAt: 0, ended: true, periods: {}, goals: { a: { t: 1, side: 'us' }, b: { t: 2, side: 'them' } } }
  });
  const bg = back.good.join(' | ');
  check('the comeback, from the half-time score', /Came back from 2–0 down at half time to win/.test(bg), true);
  check('said once: not also as the second half won', /Won the 2nd half/.test(bg), false);
  check('goals set up by a pass', /Goals built together: 2 of 3 set up by a pass/.test(bg), true);
  check('out fast after half time', /Out fast after half time: 4 shots in the first ten minutes of the 2nd half/.test(bg), true);
  check('held on under their late shots', /Held on: Riverside had 3 shots in the last ten minutes and none went in/.test(bg), true);
  check('the keeper\'s claims', /Safe hands: 3 keeper claims/.test(bg), true);
  check('the run stops at the last game not won', /3rd win in a row/.test(bg), true);
  check('the most scored this season', /3 goals — the most in a game this season/.test(bg), true);
  check('but their shots kept out need three', /Kept out/.test(bg), false);
  check('and conceding first is the early goal, said once', back.work.filter(x => /Conceded first|Conceded one in the first ten/.test(x)).length, 1);

  // one scorer for every goal, the lead changing hands, a draw rescued; the plan's sums kept from a family
  const drawn = notes({
    goals: { a: { t: 300, side: 'them' }, b: { t: 1200, side: 'us', pid: 'p1' }, c: { t: 2000, side: 'us', pid: 'p1' }, d: { t: 3000, side: 'them' }, e: { t: 3500, side: 'them' }, f: { t: 4200, side: 'us', pid: 'p1' } },
    shots: {}, events: {}
  });
  check('a draw come back for', drawn.good.some(x => /Came from behind to draw it, 3–3/.test(x)), true);
  check('a lead let slip to a draw', drawn.work.some(x => /Led 2–1 and let it slip to a draw/.test(x)), true);
  check('one scorer for all three', drawn.work.some(x => /All 3 goals from one scorer/.test(x)), true);
  check('with no shots logged, nothing about their finishing', drawn.work.some(x => /Punished/.test(x)), false);
  check('no child named in any of it', ['Ella', 'Mia', 'Rosa', 'Jo '].some(n => JSON.stringify([base, lost, back, drawn]).includes(n)), false);
  const fam = (() => { const m = setup({}, 'mum'); return A.recapNotes(t, m, A.recap(t, m)); })();
  check('a family is not told who got on the pitch or the plan', fam.good.some(x => /got on the pitch|planned for/.test(x)), false);
}

console.log('--- only once the game is over ---');
{
  setup();
  A.ui.gameView = 'recap'; A.render();
  const html = A.rendered();
  check('a finished game draws its recap', /When it happened/.test(html) && /What went well/.test(html) && /What to work on/.test(html), true);
  check('with the spells as a table too', /As a table/.test(html), true);
  // Recap is the segment beside Stats; no button on Stats repeats it (UX-REVIEW-3.md, 16.9)
  check('and Stats carries no button repeating the Recap segment', (() => { A.ui.gameView = 'stats'; A.render(); return /data-act="opengview" data-v="recap"/.test(A.rendered()); })(), false);

  const live = setup({ ended: false, currentHalf: 2, periods: { 0: { half: 1, start: T0 - 50 * MIN, end: T0 - 10 * MIN }, 1: { half: 2, start: T0 - 5 * MIN } } });
  check('a game still going is live', A.gameStatus(live), 'live');
  A.ui.gameView = 'recap'; A.render();
  check('asking for its recap lands on Stats', A.ui.gameView, 'stats');
  check('and Stats does not offer it yet', /data-v="recap"/.test(A.rendered()), false);
  check('the recap itself says it comes at full time', /comes at full time/.test(A.viewRecap()), true);

  setup({}, 'mum');
  A.ui.gameView = 'recap'; A.render();
  check('a parent reads the recap too, as she reads Stats', A.ui.gameView, 'recap');
}

console.log('--- a game with only a score still says something ---');
{
  const m = setup({ shots: {}, events: {}, goals: { a: { t: 600, side: 'us', pid: 'p1' } } });
  A.ui.gameView = 'recap'; A.render();
  const html = A.rendered();
  check('it renders', /What went well/.test(html), true);
  check('and asks for shots to be counted next time', /Count shots and corners/.test(html), true);
  check('the goal still has its spell', /When it happened/.test(html), true);
  check('the clean sheet is noticed', A.recapNotes(A.state.teams.t1, m, A.recap(A.state.teams.t1, m)).good.some(x => /clean sheet/.test(x)), true);
}

console.log('--- an ended game: Recap, Stats and the Log, nothing for running it ---');
{
  for (const v of ['subs', 'track', 'plan', 'pitch']) {
    setup({}, 'jaz'); A.ui.gameView = v; A.render();
    check(`${v} sends a coach to the recap`, A.ui.gameView, 'recap');
  }
  setup({}, 'jaz'); A.ui.gameView = 'live'; A.render();
  check('Live stays, as the log', A.ui.gameView, 'live');
  check('which is the match log, not the follow card', /Match log/.test(A.rendered()) && !/Notify me/.test(A.rendered()), true);
  A.click({ act: 'openmatch', id: 'g1' });
  check('opening a finished game lands on its recap', A.ui.gameView, 'recap');
  check('the coach can reopen it from there', /data-act="reopengame"/.test(A.rendered()), true);
  setup({}, 'mum'); A.ui.gameView = 'recap'; A.render();
  check('a parent cannot', /data-act="reopengame"/.test(A.rendered()), false);

  // a last half that ran out without End game still has spells open: Subs stays
  const notYet = setup({ ended: false, currentHalf: 3 }, 'jaz');
  check('it counts as done', A.gameStatus(notYet), 'done');
  A.ui.gameView = 'subs'; A.render();
  check('but Subs stays until End game is pressed', A.ui.gameView, 'subs');
}

console.log('--- the log: in order, timed, filtered ---');
{
  const m = setup();
  const html = A.logCard(A.state.teams.t1, m);
  const feed = html.slice(html.indexOf('class="feed"'));
  const at = s => feed.indexOf(s);
  check('kick-off comes first', at('Kick-off') > -1 && at('Kick-off') < at('Goal'), true);
  check('full time comes last', at('Full time') > at('Goal'), true);
  check('each line has the match clock', /<span class="t">0?5:00</.test(html), true);
  // kick-off was at T0 - 90 min in UTC; the log shows that moment in local time
  const ko = new Date(T0 - 90 * MIN);
  check('and the time of day', html.includes(`<small>${String(ko.getHours()).padStart(2, '0')}:${String(ko.getMinutes()).padStart(2, '0')}</small>`), true);
  A.click({ act: 'logkind', v: 'goal' });
  const goals = A.logCard(A.state.teams.t1, m);
  check('filtered to goals, four lines', (goals.match(/class="feedrow tlogrow"/g) || []).length, 4);
  A.click({ act: 'logkind', v: 'nonsense' });
  check('a kind it does not know shows everything', A.ui.logKind, 'all');
}

console.log('--- how it built up ---');
{
  const m = setup();
  const t = A.state.teams.t1;
  const lines = A.recapLines(t, m, A.recap(t, m));
  deepEq('one chart per thing recorded, nothing for what was not', lines.map(x => x.k), ['goals', 'shots', 'corner']);
  check('shots end on the full count', `${lines[1].us}–${lines[1].them}`, '9–3');
  const fin = lines[1].rows[lines[1].rows.length - 1];
  check('the table finishes on the same totals', `${fin.us}–${fin.them}`, '9–3');
  check('and at 10 minutes it was 2–0', `${lines[1].rows[0].us}–${lines[1].rows[0].them}`, '2–0');
  check('half time is drawn', /class="lc-v"/.test(lines[1].svg), true);
  check('goals are marked on the shots chart', (lines[1].svg.match(/class="lc-goal/g) || []).length, 4);
}

console.log('--- the season, game by game ---');
{
  setup();
  const t = A.state.teams.t1;
  check('one finished game with something in it is not a trend', A.seasonTrends({ ...t, id: 'none' }), null);
  const s = A.seasonTrends(t);
  deepEq('oldest first', s.games.map(m => m.id), ['g0', 'g1']);
  const shots = s.charts.find(c => c.label === 'Shots');
  check('a game that never counted shots is a gap, not a zero', shots.vals[0], null);
  check('the one that did is there', shots.vals[1].us, 9);
  check('goals are there for both', s.charts.find(c => c.label === 'Goals').vals.map(v => v.us).join(','), '0,3');
  A.ui.view = 'season'; A.render();
  check('Season leads into Stats, and draws no chart itself (build 146)', /data-v="teamstats"/.test(A.rendered()) && !/Game by game/.test(A.rendered()), true);
  A.ui.view = 'teamstats'; A.render();
  check('Stats waits for five finished games before charting', /Charts of each game once 5 have been played. 2 so far/.test(A.rendered()) && !/class="lcbox"/.test(A.rendered()), true);
  for (let i = 3; i <= 5; i++) A.state.matches['g' + i] = { id: 'g' + i, teamId: 't1', opponent: 'Side ' + i, date: '2026-08-0' + i, createdAt: 1, ended: true, periods: {} };
  A.render();
  check('— and draws them at five', /Game by game/.test(A.rendered()) && /class="lcbox"/.test(A.rendered()), true);
  for (let i = 3; i <= 5; i++) delete A.state.matches['g' + i];
  const all = JSON.stringify(s.charts.map(c => c.svg));
  check('no child is named in the charts', ['Ella', 'Mia', 'Rosa', 'Nakamura'].some(x => all.includes(x)), false);
}

H.summary('the recap');
