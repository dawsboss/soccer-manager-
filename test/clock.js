/* The clock, and the minutes that hang off it.

   CLAUDE.md: "elapsedSec()/playedSec() use `s.end || now` for whichever period
   is still open. Closing that period's `end` is what freezes the match's clock
   math." That sentence is the whole contract, and until now nothing checked it.
   The failure it guards against is not a crash — it is a game that keeps
   accruing minutes after everyone has gone home, found days later when the
   season totals are wrong and there is nothing left to reconstruct them from.

   So the shape of most of these is: read a number, move the wall clock, read it
   again, and say whether it was allowed to change.

   Times in the fixtures are epoch milliseconds because that is what periods
   store — it is what lines events up with video. */

const H = require('./harness');
const { check, near, deepEq } = H;

const A = H.loadApp({});
const T0 = Date.UTC(2026, 8, 12, 10, 0, 0);
const MIN = 60000;
H.clock.set(T0);

/* A game is periods plus stints; nothing else here reads any other field. */
const game = (periods, extra = {}) => ({
  id: 'g1', teamId: 't1', periodCount: 2, periodMinutes: 40,
  onFieldCount: 7, currentHalf: 1, periods, stints: {}, ...extra
});

console.log('--- a clock that has not started ---');
{
  const m = game({});
  check('no periods, no time', A.elapsedSec(m), 0);
  check('nothing is open', A.openSeg(m), null);
  check('and it is not running', A.running(m), false);
  const m2 = game({ 0: { half: 1 } });   // a period row with no start
  check('a period with no start is ignored', A.elapsedSec(m2), 0);
  check('still not running', A.running(m2), false);
}

console.log('\n--- an open period tracks the wall clock ---');
{
  H.clock.set(T0);
  const m = game({ 0: { half: 1, start: T0 - 10 * MIN } });
  check('ten minutes in', A.elapsedSec(m), 600);
  check('it is running', A.running(m), true);
  check('openSeg finds it', A.openSeg(m).i, 0);
  H.clock.advance(5 * MIN);
  check('five minutes later the clock moved', A.elapsedSec(m), 900);
  check('halfSec agrees while there is one half', A.halfSec(m), 900);
}

console.log('\n--- closing the period freezes it ---');
{
  H.clock.set(T0);
  const m = game({ 0: { half: 1, start: T0 - 10 * MIN, end: T0 } });
  check('a closed period is ten minutes', A.elapsedSec(m), 600);
  check('nothing is open', A.openSeg(m), null);
  H.clock.advance(60 * MIN);
  check('an hour later it is STILL ten minutes', A.elapsedSec(m), 600);
  check('and it is not running', A.running(m), false);
}

console.log('\n--- half time: one closed, one open ---');
{
  H.clock.set(T0);
  const m = game({
    0: { half: 1, start: T0 - 60 * MIN, end: T0 - 20 * MIN },   // 40 min, closed
    1: { half: 2, start: T0 - 10 * MIN }                        // 10 min, open
  }, { currentHalf: 2 });
  check('elapsed spans both periods', A.elapsedSec(m), 3000);
  check('halfSec counts only the current half', A.halfSec(m), 600);
  check('openSeg is the second period', A.openSeg(m).i, 1);
  H.clock.advance(5 * MIN);
  check('only the open half grew', A.halfSec(m), 900);
  check('and elapsed grew by the same', A.elapsedSec(m), 3300);
  m.currentHalf = 1;
  check('asking for the closed half is fixed', A.halfSec(m), 2400);
}

console.log('\n--- segments come back in period order, whatever the keys ---');
{
  const m = game({ 2: { half: 2, start: T0 }, 0: { half: 1, start: T0 - MIN }, 1: { half: 1, start: T0 } });
  deepEq('sorted numerically, not as strings', A.segments(m).map(s => s.i), [0, 1, 2]);
}

console.log('\n--- period names follow periodCount ---');
{
  const halves = game({}, { periodCount: 2 });
  check('2 periods: first', A.halfName(halves, 1), '1st half');
  check('2 periods: second', A.halfName(halves, 2), '2nd half');
  check('2 periods: beyond is extra', A.halfName(halves, 3), 'Extra 1');
  const quarters = game({}, { periodCount: 4 });
  check('4 periods: third', A.halfName(quarters, 3), '3rd quarter');
  check('4 periods: beyond is extra', A.halfName(quarters, 5), 'Extra 1');
  const thirds = game({}, { periodCount: 3 });
  check('anything else is numbered', A.halfName(thirds, 2), 'Period 2');
}

console.log('\n--- match seconds <-> wall clock ---');
{
  H.clock.set(T0);
  const m = game({
    0: { half: 1, start: T0 - 60 * MIN, end: T0 - 20 * MIN },
    1: { half: 2, start: T0 - 10 * MIN }
  }, { currentHalf: 2 });
  check('second 0 is the first kickoff', A.absAt(m, 0), T0 - 60 * MIN);
  check('second 600 is ten minutes in', A.absAt(m, 600), T0 - 50 * MIN);
  // 2400s is the end of the first period; the next second belongs to the second
  check('past the break, time skips the interval', A.absAt(m, 2460), T0 - 9 * MIN);
  check('and back again', A.secFromAbs(m, T0 - 50 * MIN), 600);
  check('a moment inside the break clamps to the break', A.secFromAbs(m, T0 - 15 * MIN), 2400);
  check('a moment before kickoff is second 0', A.secFromAbs(m, T0 - 90 * MIN), 0);
  check('round trip through the second half', A.secFromAbs(m, A.absAt(m, 2700)), 2700);

  check('a first-half second is in half 1', A.halfOfSec(m, 600), 1);
  check('a second-half second is in half 2', A.halfOfSec(m, 2700), 2);
  check('past the end falls to the current half', A.halfOfSec(m, 99999), 2);
}

console.log('\n--- minutes played come from stints, and stop when the clock does ---');
{
  H.clock.set(T0);
  const m = game({ 0: { half: 1, start: T0 - 20 * MIN } }, {
    stints: {
      a: { pid: 'p1', on: 0, off: 600 },      // first ten minutes
      b: { pid: 'p2', on: 600 },              // on at ten, still on
      c: { pid: 'p3', on: 0 }                 // on all game
    }
  });
  check('elapsed is twenty minutes', A.elapsedSec(m), 1200);
  check('a closed spell is its own length', A.playedSec(m, 'p1'), 600);
  check('an open spell runs to now', A.playedSec(m, 'p2'), 600);
  check('on since kickoff', A.playedSec(m, 'p3'), 1200);
  check('nobody outplays the clock', A.playedSec(m, 'p3') <= A.elapsedSec(m), true);
  check('an unknown player has no minutes', A.playedSec(m, 'nobody'), 0);

  H.clock.advance(10 * MIN);
  check('the closed spell did not move', A.playedSec(m, 'p1'), 600);
  check('the open spells did', A.playedSec(m, 'p2'), 1200);

  // now freeze the period, as endGame() does
  m.periods[0].end = H.clock.t;
  H.clock.advance(60 * MIN);
  check('with the period closed, elapsed is frozen', A.elapsedSec(m), 1800);
  check('and so are the open spells', A.playedSec(m, 'p2'), 1200);
  check('an open stint past a closed period does not go negative',
    A.playedSec(m, 'p2') >= 0, true);
}

console.log('\n--- two spells for one player add up ---');
{
  H.clock.set(T0);
  const m = game({ 0: { half: 1, start: T0 - 30 * MIN } }, {
    stints: { a: { pid: 'p1', on: 0, off: 600 }, b: { pid: 'p1', on: 1200, off: 1500 } }
  });
  check('ten minutes plus five', A.playedSec(m, 'p1'), 900);
  deepEq('both spells are found', A.stintsOf(m, 'p1').map(([, s]) => s.on), [0, 1200]);
  check('neither is open', A.openStint(m, 'p1'), undefined);
  check('so she is not on the pitch', A.onField(m, 'p1'), false);
}

console.log('\n--- a backwards stint cannot mint minutes ---');
{
  const m = game({ 0: { half: 1, start: T0 - 10 * MIN } }, {
    stints: { a: { pid: 'p1', on: 600, off: 300 } }   // off before on
  });
  H.clock.set(T0);
  check('negative spells clamp to zero', A.playedSec(m, 'p1'), 0);
}

console.log('\n--- spell and rest ---');
{
  H.clock.set(T0);
  const m = game({ 0: { half: 1, start: T0 - 20 * MIN } }, {
    stints: { a: { pid: 'p1', on: 300 }, b: { pid: 'p2', on: 0, off: 600 } }
  });
  check('current spell so far', A.spellSec(m, 'p1'), 900);
  check('someone off the pitch has no spell', A.spellSec(m, 'p2'), null);
  check('rest since coming off', A.restSec(m, 'p2'), 600);
  check('someone who never came off has no rest', A.restSec(m, 'p1'), null);
}

console.log('\n--- the planned/actual pair ---');
{
  const m = game({}, { planned: { p1: 40, p2: 0 } });
  check('planned minutes become seconds', A.plannedSec(m, 'p1'), 2400);
  check('an explicit zero is zero', A.plannedSec(m, 'p2'), 0);
  check('unplanned is zero', A.plannedSec(m, 'p3'), 0);
  check('match length is periods x minutes', A.matchMinutes(m), 80);
  check('quarters multiply out too', A.matchMinutes(game({}, { periodCount: 4, periodMinutes: 20 })), 80);
  check('the defaults are 2 x 40', A.matchMinutes({}), 80);
}

console.log('\n--- the readings the ticker rewrites on every screen ---');
{
  /* Stats, the games list and My players draw their time once and leave the
     rest to liveReading(). If it stopped following the wall clock, a parent's
     page would sit at whatever it said when it drew — which is the bug this
     replaced. And it must stop when the clock stops, same as elapsedSec(). */
  H.clock.set(T0);
  const m = game({ 0: { half: 1, start: T0 - 10 * MIN } }, {
    stints: { s1: { pid: 'p1', on: 0 }, s2: { pid: 'p2', on: 0, off: 300 } },
    planned: { p1: 30, p2: 20 }
  });
  A.state.matches = { g1: m };
  A.state.teams = { t1: { id: 't1', name: 'Blue', players: { p1: { name: 'A' }, p2: { name: 'B' } } } };
  const r = (kind, d) => A.liveReading(kind, d);
  check('the game clock reads the wall clock', r('clock', { mid: 'g1' }), '10:00');
  check('minutes played for the game', r('gmins', { mid: 'g1' }), '10');
  check('a player on the pitch', r('pmins', { mid: 'g1', pid: 'p1' }), '10');
  check('a player who came off', r('pmins', { mid: 'g1', pid: 'p2' }), '5');
  check('her season total', r('smins', { tid: 't1', pid: 'p1' }), '10');
  check('what she is owed', r('diff', { mid: 'g1', pid: 'p1' }), '<span class="diff owed">20 short</span>');
  check('nothing planned, nothing said', A.diffTag(600, 0), '');
  H.clock.advance(5 * MIN);
  check('five minutes on, the clock has moved', r('clock', { mid: 'g1' }), '15:00');
  check('so has the player still on', r('pmins', { mid: 'g1', pid: 'p1' }), '15');
  check('and the season total with her', r('smins', { tid: 't1', pid: 'p1' }), '15');
  check('the player on the bench has not', r('pmins', { mid: 'g1', pid: 'p2' }), '5');
  check('the owed count comes down', r('sdiff', { tid: 't1', pid: 'p1' }), '<span class="diff owed">15 short</span>');
  m.periods[0].end = H.clock.t;
  m.stints.s1.off = A.elapsedSec(m);
  H.clock.advance(30 * MIN);
  check('once the clock stops, so does the reading', r('clock', { mid: 'g1' }), '15:00');
  check('and her minutes', r('pmins', { mid: 'g1', pid: 'p1' }), '15');
  check('an unknown game reads nothing, not zero', r('clock', { mid: 'nope' }), null);
  check('an unknown kind reads nothing', r('what', { mid: 'g1' }), null);
  A.state.matches = {}; A.state.teams = {};
}

console.log('\n--- formatting ---');
{
  check('mmss pads the seconds', A.mmss(65), '1:05');
  check('mmss at zero', A.mmss(0), '0:00');
  check('mmss floors a fraction', A.mmss(59.9), '0:59');
  check('mmss refuses to go negative', A.mmss(-30), '0:00');
  check('mmss past an hour keeps counting minutes', A.mmss(3725), '62:05');
  check('mins rounds to nearest', A.mins(89), 1);
  check('mins rounds up at the half', A.mins(90), 2);
}

console.log('\n--- typing a time into the edit sheet ---');
{
  check('mm:ss', A.parseTime('12:30', -1), 750);
  check('m:s with one digit', A.parseTime('7:5', -1), 425);
  check('plain minutes', A.parseTime('12', -1), 720);
  check('decimal minutes', A.parseTime('12.5', -1), 750);
  check('nonsense falls back', A.parseTime('soon', 99), 99);
  check('empty falls back', A.parseTime('', 99), 99);
  check('a stray colon falls back', A.parseTime('12:', 99), 99);
}

console.log('\n--- nudging the clock moves the half, and what was logged in it (build 181) ---');
/* "Clock reading wrong?" shifts the half's start. Everything logged is a match
   second, so until build 181 a nudge left each sub, goal and shot where the
   clock had read when it was tapped: the owner put the clock back five minutes
   and nobody's minutes followed. A thing logged happened at a real moment, and
   the nudge says the half began at a different one, so each moves by the same
   seconds the start did; the half's own first second is pinned (a starter, a
   change made during the break) and nothing moves before it. */
function seed(periods, extra) {
  H.clock.set(T0);
  A.state = {
    teams: { t1: { id: 't1', name: 'G14 Flight', players: {
      p1: { id: 'p1', name: 'Ella', number: '7' }, p2: { id: 'p2', name: 'Mia', number: '8' },
      p3: { id: 'p3', name: 'Rosa', number: '4' }, p4: { id: 'p4', name: 'Jo', number: '9' }, p5: { id: 'p5', name: 'Sam', number: '1' } } } },
    matches: { g1: { ...game(periods, extra), opponent: 'Riverside', date: '2026-09-12' } },
    access: {}
  };
  A.ui.teamId = 't1'; A.ui.matchId = 'g1'; A.ui.view = 'game'; A.ui.gameView = 'track';
  return A.state.matches.g1;
}
{
  // first half, thirty minutes on the clock
  const m = seed({ 0: { half: 1, start: T0 - 30 * MIN } }, {
    stints: {
      s1: { pid: 'p1', on: 0 },               // a starter, still on
      s2: { pid: 'p2', on: 0, off: 1200 },    // off at 20:00
      s3: { pid: 'p3', on: 1200 },            // on at 20:00 for her
      s4: { pid: 'p4', on: 1680 },            // on at 28:00
      s5: { pid: 'p5', on: 0, off: 120 }      // off at 2:00
    },
    goals: { g1: { t: 1500, side: 'us', pid: 'p3' } },
    shots: { h1: { t: 60, side: 'us' } },
    events: { e1: { t: 1740, side: 'them', kind: 'corner' } },
    poss: { q1: { t: 900, to: 'us' } }
  });
  check('the clock reads 30:00', A.elapsedSec(m), 1800);
  check('Jo has two minutes', A.playedSec(m, 'p4'), 120);
  A.adjustClock(m, -300);
  const g = () => A.state.matches.g1;
  check('put back five minutes it reads 25:00', A.elapsedSec(g()), 1500);
  check('the half went with it', A.halfSec(g()), 1500);
  check('the start moved five minutes later', g().periods[0].start, T0 - 25 * MIN);
  check('a starter still on has 25 minutes', A.playedSec(g(), 'p1'), 1500);
  check('the one who went off at 20:00 went off at 15:00', g().stints.s2.off, 900);
  check('so she has 15 minutes, not 20', A.playedSec(g(), 'p2'), 900);
  check('the one who came on for her came on at 15:00', g().stints.s3.on, 900);
  check('and keeps the ten minutes she has played', A.playedSec(g(), 'p3'), 600);
  check('the one who came on at 28:00 came on at 23:00', g().stints.s4.on, 1380);
  check('and still has her two minutes, not none', A.playedSec(g(), 'p4'), 120);
  check('her spell reads two minutes, never a minus', A.spellSec(g(), 'p4'), 120);
  check('a spell that ended before the new kick-off is squeezed to the start', g().stints.s5.off, 0);
  check('a starter stays on from 0:00', g().stints.s1.on, 0);
  check('the goal moved with the half', g().goals.g1.t, 1200);
  check('a shot before the new kick-off sits at 0:00', g().shots.h1.t, 0);
  check('the corner moved', g().events.e1.t, 1440);
  check('the possession tap moved', g().poss.q1.t, 600);
  A.adjustClock(g(), 300);
  check('five minutes on again reads 30:00', A.elapsedSec(g()), 1800);
  check('the sub is back at 20:00', g().stints.s2.off, 1200);
  check('and the player who came on', g().stints.s3.on, 1200);
  check('the goal is back at 25:00', g().goals.g1.t, 1500);
  check('a starter stays on from 0:00 either way', g().stints.s1.on, 0);
  check('and plays the thirty', A.playedSec(g(), 'p1'), 1800);
}
{
  // second half, ten minutes in after a forty-minute first half
  const m = seed({ 0: { half: 1, start: T0 - 70 * MIN, end: T0 - 30 * MIN }, 1: { half: 2, start: T0 - 10 * MIN } }, {
    currentHalf: 2,
    stints: {
      s1: { pid: 'p1', on: 0 },               // played the whole game so far
      s2: { pid: 'p2', on: 0, off: 2400 },    // off at half time
      s3: { pid: 'p3', on: 2400 },            // on at half time
      s4: { pid: 'p4', on: 2700 },            // on at 45:00
      s5: { pid: 'p5', on: 600, off: 1800 }   // a first-half spell
    },
    goals: { g1: { t: 1000, side: 'them' }, g2: { t: 2820, side: 'us', pid: 'p3' } }
  });
  check('the clock reads 50:00', A.elapsedSec(m), 3000);
  A.adjustClock(m, -300);
  const g = () => A.state.matches.g1;
  check('put back five minutes it reads 45:00', A.elapsedSec(g()), 2700);
  check('the second half is five minutes', A.halfSec(g()), 300);
  check('the first half is untouched', g().periods[0].end - g().periods[0].start, 40 * MIN);
  check('a half-time sub stays at half time: off', g().stints.s2.off, 2400);
  check('a half-time sub stays at half time: on', g().stints.s3.on, 2400);
  check('one who came on at 45:00 came on at the restart', g().stints.s4.on, 2400);
  check('a first-half spell keeps its seconds', [g().stints.s5.on, g().stints.s5.off].join(','), '600,1800');
  check('a first-half goal keeps its time', g().goals.g1.t, 1000);
  check('a second-half goal moved with the half', g().goals.g2.t, 2520);
  check('the one who played it all has 45 minutes', A.playedSec(g(), 'p1'), 2700);
}
{
  // the clock started late: five minutes on, in the second half
  const m = seed({ 0: { half: 1, start: T0 - 70 * MIN, end: T0 - 30 * MIN }, 1: { half: 2, start: T0 - 10 * MIN } }, {
    currentHalf: 2,
    stints: { s1: { pid: 'p1', on: 0 }, s3: { pid: 'p3', on: 2400 }, s4: { pid: 'p4', on: 2700 }, s2: { pid: 'p2', on: 0, off: 2700 } },
    goals: { g2: { t: 2820, side: 'us' } }
  });
  A.adjustClock(m, 300);
  const g = () => A.state.matches.g1;
  check('five minutes on reads 55:00', A.elapsedSec(g()), 3300);
  check('the start moved five minutes earlier', g().periods[1].start, T0 - 15 * MIN);
  check('a half-time sub still belongs to the restart', g().stints.s3.on, 2400);
  check('one who came on at 45:00 came on at 50:00', g().stints.s4.on, 3000);
  check('and keeps her five minutes', A.playedSec(g(), 'p4'), 300);
  check('the one she replaced went off at 50:00', g().stints.s2.off, 3000);
  check('so she has 50 minutes', A.playedSec(g(), 'p2'), 3000);
  check('the goal moved on too', g().goals.g2.t, 3120);
  check('the player who played it all has 55 minutes', A.playedSec(g(), 'p1'), 3300);
}
{
  // a nudge the half cannot take whole moves what it did take
  const m = seed({ 0: { half: 1, start: T0 - 3 * MIN } }, { stints: { s1: { pid: 'p1', on: 0 }, s3: { pid: 'p3', on: 120 } }, goals: { g1: { t: 150, side: 'us' } } });
  A.adjustClock(m, -300);
  const g = () => A.state.matches.g1;
  check('the half keeps its last second', A.elapsedSec(g()), 1);
  check('a sub at 2:00 is squeezed to the start', g().stints.s3.on, 0);
  check('the goal at 2:30 too', g().goals.g1.t, 0);
  check('nothing is logged in the future', A.playedSec(g(), 'p3'), 1);
}
{
  // nothing to nudge before kick-off
  const m = seed({}, { stints: { s1: { pid: 'p1', on: 0 } } });
  A.adjustClock(m, -300);
  deepEq('a clock not started is left alone', A.state.matches.g1.periods, {});
  check('and so is the starter', A.state.matches.g1.stints.s1.on, 0);
}

console.log('\n--- a half that ran long is given its real length (build 182) ---');
/* "We need a way to fix times" (the owner, 2026-10-21). Nobody tapped End
   half, so the first half reads 52:10 and the second is under way. Giving
   the half its real length ends its last stretch there: what was logged in
   the dead time lands at the half's end, the second half moves up by the
   difference, the first half's own moments keep their seconds. */
{
  const m = seed({ 0: { half: 1, start: T0 - 82 * MIN - 10000, end: T0 - 30 * MIN }, 1: { half: 2, start: T0 - 10 * MIN } }, {
    currentHalf: 2,
    stints: {
      s1: { pid: 'p1', on: 0 },               // the whole game
      s2: { pid: 'p2', on: 0, off: 2700 },    // "45:00": the dead time after the real 40:00
      s3: { pid: 'p3', on: 2700 },
      s4: { pid: 'p4', on: 3130 },            // at half time, as the clock had it
      s5: { pid: 'p5', on: 3430 }             // five minutes into the second half
    },
    goals: { g1: { t: 1500, side: 'us' }, g2: { t: 3400, side: 'them' } },
    shots: { h1: { t: 3000, side: 'us' } }
  });
  check('the first half reads 52:10', A.halfLenSec(m, 1), 3130);
  check('the clock reads 62:10', A.elapsedSec(m), 3730);
  check('nothing to refuse', A.setHalfLength(m, 1, 2400), null);
  const g = () => A.state.matches.g1;
  check('the first half is 40:00', A.halfLenSec(g(), 1), 2400);
  check('its last stretch ends forty minutes after it began', g().periods[0].end - g().periods[0].start, 40 * MIN);
  check('the second half is untouched', g().periods[1].start, T0 - 10 * MIN);
  check('the clock reads 50:00', A.elapsedSec(g()), 3000);
  check('a first-half goal keeps its second', g().goals.g1.t, 1500);
  check('a sub in the dead time went off at the end of the half', g().stints.s2.off, 2400);
  check('and the one who came on for her came on then', g().stints.s3.on, 2400);
  check('a shot in the dead time sits at the end of the half', g().shots.h1.t, 2400);
  check('a half-time sub is at half time', g().stints.s4.on, 2400);
  check('five minutes into the second half is still that', g().stints.s5.on, 2700);
  check('a second-half goal moved up with the half', g().goals.g2.t, 2670);
  check('the player on all game has 50 minutes, not 62', A.playedSec(g(), 'p1'), 3000);
  check('the one subbed off has 40', A.playedSec(g(), 'p2'), 2400);
  check('the one who came on for her has the second half', A.playedSec(g(), 'p3'), 600);
  deepEq('the stretches are numbered in order, no index inside', Object.keys(g().periods), ['0', '1']);
  check('and a closed one keeps its end', 'end' in g().periods[0], true);
  check('an open one has none', 'end' in g().periods[1], false);
}
{
  // the clock left running since Saturday: the half is still open, days on
  const m = seed({ 0: { half: 1, start: T0 - 55 * MIN } }, { stints: { s1: { pid: 'p1', on: 0 }, s3: { pid: 'p3', on: 2700 } } });
  check('still running', A.running(m), true);
  A.setHalfLength(m, 1, 2400);
  const g = () => A.state.matches.g1;
  check('a length stops the clock there', A.running(g()), false);
  check('at 40:00', A.elapsedSec(g()), 2400);
  check('a spell still open stays open', g().stints.s1.off, undefined);
  check('and reads 40 minutes', A.playedSec(g(), 'p1'), 2400);
  check('one who came on in the dead time came on at the end', g().stints.s3.on, 2400);
  H.clock.advance(60 * MIN);
  check('an hour on it is still 40:00', A.elapsedSec(g()), 2400);
}
{
  // a game ended with its last half too long
  const m = seed({ 0: { half: 1, start: T0 - 110 * MIN, end: T0 - 70 * MIN }, 1: { half: 2, start: T0 - 60 * MIN, end: T0 - 5 * MIN } }, {
    currentHalf: 3, ended: T0 - 5 * MIN,
    stints: { s1: { pid: 'p1', on: 0, off: 5700 }, s2: { pid: 'p2', on: 2400, off: 5700 } },
    goals: { g1: { t: 5000, side: 'us' } }
  });
  check('full time at 95:00', A.elapsedSec(m), 5700);
  A.setHalfLength(m, 2, 2400);
  const g = () => A.state.matches.g1;
  check('full time at 80:00', A.elapsedSec(g()), 4800);
  check('the game is still over', g().ended, T0 - 5 * MIN);
  check('a spell closed at the old full time closes at the new', g().stints.s1.off, 4800);
  check('so she has 80 minutes', A.playedSec(g(), 'p1'), 4800);
  check('a half-time sub too', A.playedSec(g(), 'p2'), 2400);
  check('a goal in the dead time is at full time', g().goals.g1.t, 4800);
  check('a length past full time is held to full time', A.setHalfLength(g(), 2, 7200), null);
  check('— so the half is the fifty-five it ran', A.halfLenSec(g(), 2), 3300);
  check('a first half stretched into the second stops short of it', A.setHalfLength(g(), 1, 4000), null);
  check('— a second before the second half began', A.halfLenSec(g(), 1), 2999);
  check('a half not played is refused', A.setHalfLength(g(), 3, 600), 'That half has not been played');
  check('a half cannot be shorter than a second', A.setHalfLength(g(), 1, 0), null);
  check('— it keeps one', A.halfLenSec(g(), 1), 1);
}

console.log('\n--- a stoppage the clock ran through is taken out (build 182) ---');
{
  // first half running, thirty minutes on the clock, a four-minute injury at 20:00 nobody paused for
  const m = seed({ 0: { half: 1, start: T0 - 30 * MIN } }, {
    stints: { s1: { pid: 'p1', on: 0 }, s2: { pid: 'p2', on: 0, off: 1500 }, s3: { pid: 'p3', on: 1500 } },
    goals: { g1: { t: 1200, side: 'us' }, g2: { t: 1680, side: 'them' } },
    shots: { h1: { t: 1260, side: 'us' } }
  });
  check('nothing to refuse', A.takeOutStoppage(m, 1, 1200, 240), null);
  const g = () => A.state.matches.g1;
  deepEq('the stretch is split at the stoppage', Object.keys(g().periods), ['0', '1']);
  check('the first stretch ends at 20:00', g().periods[0].end, T0 - 10 * MIN);
  check('the second begins four minutes later', g().periods[1].start, T0 - 6 * MIN);
  check('in the same half', g().periods[1].half, 1);
  check('and is still open', 'end' in g().periods[1], false);
  check('the clock is still running', A.running(g()), true);
  check('and reads 26:00', A.elapsedSec(g()), 1560);
  check('the half too', A.halfSec(g()), 1560);
  check('a goal at the stoppage keeps its second', g().goals.g1.t, 1200);
  check('a shot inside the stoppage lands at it', g().shots.h1.t, 1200);
  check('a goal after it moves up four minutes', g().goals.g2.t, 1440);
  check('a sub after it too: off', g().stints.s2.off, 1260);
  check('— and on', g().stints.s3.on, 1260);
  check('the starter has 26 minutes', A.playedSec(g(), 'p1'), 1560);
  check('the one who went off at 25:00 has 21', A.playedSec(g(), 'p2'), 1260);
  check('a second stoppage, in the second stretch', A.takeOutStoppage(g(), 1, 1440, 60), null);
  deepEq('three stretches', Object.keys(g().periods), ['0', '1', '2']);
  check('25:00 on the clock', A.elapsedSec(g()), 1500);
  check('a stoppage that runs past now is refused', A.takeOutStoppage(g(), 1, 1470, 600), 'That stoppage would run past now');
  check('— with the clock as it was', A.elapsedSec(g()), 1500);
  check('a half not played', A.takeOutStoppage(g(), 2, 60, 60), 'That half has not been played');
  check('no length', A.takeOutStoppage(g(), 1, 60, 0), 'How long was the stoppage?');
  check('past the end of the half', A.takeOutStoppage(g(), 1, 9999, 60), 'The half had not got that far');
  check('and nothing changed for any of them', [A.elapsedSec(g()), Object.keys(g().periods).length].join(','), '1500,3');
}
{
  // a closed half: the stoppage reaches the end of it, and one that would take all of it
  const m = seed({ 0: { half: 1, start: T0 - 70 * MIN, end: T0 - 30 * MIN }, 1: { half: 2, start: T0 - 10 * MIN } }, {
    currentHalf: 2, stints: { s1: { pid: 'p1', on: 0 }, s3: { pid: 'p3', on: 2400 } }, goals: { g1: { t: 2200, side: 'us' } }
  });
  check('the whole half is refused', A.takeOutStoppage(m, 1, 0, 2400), 'That would take the whole half');
  check('a stoppage to the end of the half', A.takeOutStoppage(m, 1, 2100, 600), null);
  const g = () => A.state.matches.g1;
  check('the half is 35:00', A.halfLenSec(g(), 1), 2100);
  deepEq('one stretch for it, the second half after', Object.keys(g().periods), ['0', '1']);
  check('a goal in the stoppage is at the end of the half', g().goals.g1.t, 2100);
  check('a half-time sub is at the new half time', g().stints.s3.on, 2100);
  check('the clock reads 45:00', A.elapsedSec(g()), 2700);
}

console.log('\n--- the sheet, through the click handler ---');
{
  const m = seed({ 0: { half: 1, start: T0 - 82 * MIN - 10000, end: T0 - 30 * MIN }, 1: { half: 2, start: T0 - 10 * MIN } }, {
    currentHalf: 2, stints: { s1: { pid: 'p1', on: 0 } }
  });
  A.ui.gameView = 'track';
  A.click({ act: 'fixclock' });
  const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
  check('the sheet lists each half', /1st half/.test(sheet()) && /2nd half/.test(sheet()), true);
  check('with its length', /52:10 on the clock/.test(sheet()), true);
  check('a box for the real length of each', /id="hl1"/.test(sheet()) && /id="hl2"/.test(sheet()), true);
  check('and for a stoppage', /id="sa1"/.test(sheet()) && /id="sl1"/.test(sheet()), true);
  check('the nudges for the half being played', /data-act="nudgeclock"/.test(sheet()), true);
  check('and one sentence on what it does to the minutes', /minutes follow the clock/.test(sheet()), true);
  A.dom.node('#hl1').value = '40:00';
  A.click({ act: 'halflen', h: '1' });
  check('Save gives the half its length', A.halfLenSec(A.state.matches.g1, 1), 2400);
  check('and the sheet stays open, redrawn', /40:00 on the clock/.test(sheet()), true);
  A.dom.node('#hl2').value = 'soon';
  A.click({ act: 'halflen', h: '2' });
  check('a length that is not one is refused in words', /minutes and seconds/.test(String(A.dom.node('#toast').textContent || '')), true);
  check('— with the half as it was', A.halfLenSec(A.state.matches.g1, 2), 600);
  A.dom.node('#sa2').value = '2:00'; A.dom.node('#sl2').value = '1:00';
  A.click({ act: 'stopout', h: '2' });
  check('Take it out takes the stoppage out of that half', A.halfLenSec(A.state.matches.g1, 2), 540);
  check('on the half\'s own clock', A.state.matches.g1.periods[1].end, T0 - 8 * MIN);
  check('and the sheet is still open', /2nd half/.test(sheet()), true);
  A.dom.node('#sa2').value = '8:00'; A.dom.node('#sl2').value = '5:00';
  A.click({ act: 'stopout', h: '2' });
  check('one that runs past now is refused in words', /past now/.test(String(A.dom.node('#toast').textContent || '')), true);
  check('— and nothing changed', A.halfLenSec(A.state.matches.g1, 2), 540);
}
{
  // once the game is over the door is on the Log tab
  const m = seed({ 0: { half: 1, start: T0 - 110 * MIN, end: T0 - 70 * MIN }, 1: { half: 2, start: T0 - 60 * MIN, end: T0 - 5 * MIN } }, {
    currentHalf: 3, ended: T0 - 5 * MIN, stints: { s1: { pid: 'p1', on: 0, off: 5700 } }
  });
  const t = A.state.teams.t1;
  check('the match log offers Clock reading wrong?', /data-act="fixclock"/.test(A.logCard(t, m)), true);
  A.ui.gameView = 'log';
  A.click({ act: 'fixclock' });
  const sheet = () => String(A.dom.node('#sheet').innerHTML || '');
  check('the sheet says full time', /Full time at 95:00/.test(sheet()), true);
  check('no nudges once it is over', /data-act="nudgeclock"/.test(sheet()), false);
  check('no starting over either', /data-act="restartgame"/.test(sheet()), false);
  check('but each half', /id="hl1"/.test(sheet()) && /id="hl2"/.test(sheet()), true);
}

H.summary('clock and minutes');
