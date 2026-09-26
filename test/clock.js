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
  check('what she is owed', r('diff', { mid: 'g1', pid: 'p1' }), '<span class="diff owed">20 owed</span>');
  check('nothing planned, nothing said', A.diffTag(600, 0), '');
  H.clock.advance(5 * MIN);
  check('five minutes on, the clock has moved', r('clock', { mid: 'g1' }), '15:00');
  check('so has the player still on', r('pmins', { mid: 'g1', pid: 'p1' }), '15');
  check('and the season total with her', r('smins', { tid: 't1', pid: 'p1' }), '15');
  check('the player on the bench has not', r('pmins', { mid: 'g1', pid: 'p2' }), '5');
  check('the owed count comes down', r('sdiff', { tid: 't1', pid: 'p1' }), '<span class="diff owed">15 owed</span>');
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

H.summary('clock and minutes');
