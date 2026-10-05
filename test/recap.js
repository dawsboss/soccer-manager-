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
  check('the latest game is 3 of 3', /gb-hint">3\/3</.test(A.gameBar(t, ms.g2)), true);
  check('the one before it is 2 of 3', /gb-hint">2\/3</.test(A.gameBar(t, ms.g1)), true);
  check('the first game played is 1 of 3', /gb-hint">1\/3</.test(A.gameBar(t, ms.g0)), true);
}

console.log('--- an Edit button, for whoever may edit ---');
{
  setup({}, 'boss');
  const t = A.state.teams.t1;
  check('an admin gets it on the game bar', /data-act="editmatch" data-id="g1"/.test(A.gameBar(t, A.state.matches.g1)), true);
  setup({}, 'jaz');
  check('so does the team\'s coach', /data-act="editmatch"/.test(A.gameBar(t, A.state.matches.g1)), true);
  A.click({ act: 'editmatch', id: 'g1' });
  check('and it opens the game\'s details', /data-act="savematch"/.test(A.rendered('#sheet')), true);
  setup({}, 'mum');
  check('a parent does not', /data-act="editmatch"/.test(A.gameBar(t, A.state.matches.g1)), false);
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

console.log('--- only once the game is over ---');
{
  setup();
  A.ui.gameView = 'recap'; A.render();
  const html = A.rendered();
  check('a finished game draws its recap', /When it happened/.test(html) && /What went well/.test(html) && /What to work on/.test(html), true);
  check('with the spells as a table too', /As a table/.test(html), true);
  check('and Stats points at it', (() => { A.ui.gameView = 'stats'; A.render(); return /data-v="recap"/.test(A.rendered()); })(), true);

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

H.summary('the recap');
