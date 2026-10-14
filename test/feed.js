/* The Live tab: the game in words, for anyone following.

   It is built from what is already stored, so what matters here is that it
   reads the stored data the way the rest of the app does. A paused clock closes
   a period just as the end of a half does, and only one of them is half time.
   The score beside a goal is the score after it. A position switch is not a
   sub. And the notification watcher has one job it must not overdo: tell a
   follower about what is new, never about what was already there when they
   looked. */

const H = require('./harness');
const { check, deepEq } = H;

const A = H.loadApp({});
const T0 = Date.UTC(2026, 8, 12, 10, 0, 0);
const MIN = 60000;

function setup(game = {}) {
  H.clock.set(T0);
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight',
        players: {
          p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7' },
          p2: { id: 'p2', name: 'Mia Kowalski', number: '8' },
          p3: { id: 'p3', name: 'Rosa <b>Delgado</b>', number: '4' },
          p4: { id: 'p4', name: 'Jo Nakamura', number: '9' }
        }
      }
    },
    matches: {
      g1: {
        id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12',
        periodCount: 2, periodMinutes: 40, onFieldCount: 3, currentHalf: 1,
        periods: {}, stints: {},
        ...game
      }
    },
    access: {}
  };
  A.me = null;
  A.ui.teamId = 't1'; A.ui.matchId = 'g1'; A.ui.view = 'game'; A.ui.gameView = 'live';
  A.ui.follow = null; A.ui.feedAll = false;
  return A.state.matches.g1;
}
const items = () => A.feedItems(A.team(), A.match());
const titles = () => items().map(x => x.title);
const html = () => { A.render(); return A.rendered(); };

console.log('--- the periods ---');
{
  const m = setup();
  check('nothing before kick-off', items().length, 0);
  check('the empty feed says it fills from kick-off', /fills in from kick-off/.test(html()), true);
  check('and no 0–0 on the card before kick-off, which reads as a result (UX-REVIEW-2.md, 7.1)', /class="fs-num">v</.test(html()) && !/0–0/.test(A.rendered()), true);

  m.periods[0] = { half: 1, start: T0 - 10 * MIN };
  deepEq('kick-off once the clock has run', titles(), ['Kick-off']);
  check('— and from then the score, 0–0 included', /class="fs-num">0–0</.test(html()), true);
  check('at the first minute', A.feedMin(items()[0].t), '1′');

  m.periods[0].end = T0 - 5 * MIN;
  deepEq('a pause is not half time', titles(), ['Kick-off']);
  m.periods[1] = { half: 1, start: T0 - 3 * MIN, end: T0 - MIN };
  m.currentHalf = 2;
  const ht = items().find(x => x.key === 'brk:1');
  check('ending the half is half time', ht && ht.title, 'Half time');
  check('at the minutes actually played, pauses left out', ht && ht.t, 7 * 60);

  m.periods[2] = { half: 2, start: T0 };
  H.clock.set(T0 + 2 * MIN);
  check('the second half starts where the first stopped', items()[0].title + ' @' + items()[0].t, '2nd half under way @420');
  check('no full time while it runs', items().some(x => x.kind === 'end'), false);
  m.goals = { late: { t: 420, side: 'us' } };        // logged while the clock stood still
  deepEq('a goal logged in the break sits under half time', items().slice(0, 3).map(x => x.kind), ['start', 'break', 'goal']);
  delete m.goals;

  m.periods[2].end = T0 + 2 * MIN; m.currentHalf = 3;
  check('ending the last half is full time', items().filter(x => x.key === 'ft').length, 1);
  m.ended = T0 + 2 * MIN;
  check('and ending the game too says it once', items().filter(x => x.key === 'ft').length, 1);
  check('full time is at the top', items()[0].title, 'Full time');
}
{
  const m = setup({ periodCount: 4, periods: { 0: { half: 1, start: T0 - 20 * MIN, end: T0 - 10 * MIN } }, currentHalf: 2 });
  check('quarters are not called half time', items().find(x => x.key === 'brk:1').title, 'End of the 1st quarter');
  m.ended = T0;
  check('a game ended early still gets full time', items().filter(x => x.key === 'ft').length, 1);
}

console.log('\n--- goals and subs ---');
{
  const m = setup({
    periods: { 0: { half: 1, start: T0 - 30 * MIN } },
    stints: {
      s1: { pid: 'p1', on: 0, off: 600 }, s2: { pid: 'p2', on: 0 }, s3: { pid: 'p3', on: 0, off: 900 },
      s4: { pid: 'p4', on: 600 },                      // p4 on for p1 at 10'
      s5: { pid: 'p3', on: 900 }                       // p3 switched spots at 15': off and on together
    },
    goals: {
      a: { t: 120, side: 'us', pid: 'p2', assist: 'p1' },
      b: { t: 400, side: 'them' },
      c: { t: 1200, side: 'us', pid: 'p4' }
    },
    shots: { x: { t: 100, side: 'us', onTarget: false, pid: 'p1' } },
    events: { e: { t: 200, side: 'them', kind: 'corner' } }
  });
  const g = items().filter(x => x.kind === 'goal');
  deepEq('goals newest first, each with the score after it', g.map(x => x.score), ['2–1', '1–1', '1–0']);
  check('our scorer and assist', g[2].detail, 'Mia Kowalski, assist Ella Fitzgerald');
  check('their goal names nobody', g[1].detail, '');
  const subs = items().filter(x => x.kind === 'sub');
  deepEq('one sub, and the switch is not one', subs.map(x => x.detail), ['Jo Nakamura on for Ella Fitzgerald']);
  check('starters are not subs', subs.some(x => /Mia/.test(x.detail)), false);

  let h = html();
  check('key moments leave shots out', /Shot off target/.test(h), false);
  check('the starting lineup is under kick-off', /Starting: Rosa &lt;b&gt;Delgado&lt;\/b&gt;, Ella Fitzgerald, Mia Kowalski</.test(h), true);
  check('a name is escaped, not drawn as HTML', /Rosa &lt;b&gt;Delgado/.test(h) && !/Rosa <b>Delgado/.test(h), true);
  A.click({ act: 'feedall', v: '1' });
  h = A.rendered();
  check('everything puts them in', /Shot off target — G14 Flight/.test(h) && /Corner — Riverside/.test(h), true);
  check('the scoreboard reads 2–1', /class="fs-num">2–1</.test(h), true);
}

console.log('\n--- who gets the tab ---');
{
  setup({ periods: { 0: { half: 1, start: T0 - 5 * MIN } } });
  A.state.access = {
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } } },
    index: { boss: true, jaz: true, trk: true, mum: true }
  };
  A.state.teams.t1.players.p1.guardians = { mum: true };
  for (const [uid, who] of [['jaz', 'coach'], ['trk', 'tracker'], ['mum', 'parent']]) {
    A.me = { uid }; A.ui.gameView = 'live';
    const h = html();
    check(`a ${who} can open Live`, A.ui.gameView === 'live' && /What's happened/.test(h), true);
  }
  A.me = { uid: 'mum' }; A.ui.gameView = 'subs'; A.render();
  check('a parent sent to Subs lands on Live', A.ui.gameView, 'live');
  A.me = { uid: 'trk' }; A.ui.gameView = 'subs'; A.render();
  check('a tracker sent to Subs lands on Track', A.ui.gameView, 'track');
  A.me = { uid: 'jaz' }; A.ui.gameView = 'nonsense'; A.render();
  check('a coach with a bad tab lands on Subs', A.ui.gameView, 'subs');
  A.click({ act: 'openmatch', id: 'g1' });
  check('opening a game takes a coach to Subs, as it did to the old Live', A.ui.gameView, 'subs');
}
console.log('\n--- notifications ---');
{
  const m = setup({ periods: { 0: { half: 1, start: T0 - 10 * MIN } }, goals: { a: { t: 60, side: 'us' } } });
  check('not following, nothing is watched', A.watchFeed().length, 0);
  A.click({ act: 'feedfollow', v: '1' });
  check('following is this game', A.ui.follow, 'g1');
  check('turning it on says so', A.lastToast(), 'Following this game');
  check('what was already there is not news', A.watchFeed().length, 0);

  m.goals.b = { t: 300, side: 'them' };
  const n = A.watchFeed();
  deepEq('a new goal is', n.map(x => x.key), ['goal:b']);
  check('and says the score', A.lastToast(), 'Goal — Riverside · G14 Flight 1–1 Riverside');
  check('only once', A.watchFeed().length, 0);

  m.shots = { s: { t: 320, side: 'us', onTarget: true } };
  check('a shot is not worth a buzz', A.watchFeed().length, 0);

  m.periods[0].end = T0; m.currentHalf = 2;
  deepEq('half time is', A.watchFeed().map(x => x.title), ['Half time']);

  A.click({ act: 'feedfollow', v: '0' });
  m.goals.c = { t: 700, side: 'us' };
  check('stopped means stopped', A.watchFeed().length, 0);
}

console.log('\n--- game day, on a parent\'s phone (UX-REVIEW-3.md, 16) ---');
{
  const roles = () => {
    A.state.access = {
      admins: { boss: true },
      teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } } },
      index: { boss: true, jaz: true, trk: true, mum: true }
    };
    A.state.teams.t1.players.p1.guardians = { mum: true };
  };
  // before kick-off: where to be and when, on the screen named for the game (16.2)
  const m = setup({ kickoff: '10:00', venue: 'Eastfield Rec', home: 'away', arrive: '09:30', kit: 'Red shirts', notes: 'Park on the road', date: '2026-09-19', planned: { p1: 40, p2: 40, p3: 40, p4: 40 } });
  roles(); A.me = { uid: 'mum' }; A.ui.gameView = 'live';
  let h = html();
  check('before kick-off Live leads with the match day', /<h2[^>]*>Match day<\/h2>/.test(h) && h.indexOf('Match day') < h.indexOf("What's happened"), true);
  check('— its rows: when, where, the ground, arrive by, the kit and the notes',
    ['Sat 19 Sep · 10am', 'Eastfield Rec', '<dt>Ground</dt><dd>Away', '<dt>Arrive by</dt><dd>9:30am', 'Red shirts', 'Park on the road'].every(x => h.includes(x)), true);
  check('— with her answer for her own child, and nobody else\'s', /data-act="rsvp"[^>]*data-pid="p1"/.test(h) + ' ' + /data-act="rsvp"[^>]*data-pid="p[234]"/.test(h), 'true false');
  check('— and no line about her child before there is a game to be in', /class="feedmine"/.test(h), false);
  // Notify me says the promise, then where it reaches her (16.4)
  check('the follow card says what it buzzes for', /Buzz me for goals and the final whistle/.test(h) && /Works while TeamPlayHQ is open on this phone/.test(h), true);
  check('— not the mechanism', /even in another tab|while this page is open/.test(h), false);
  A.ui.gameView = 'stats'; h = html();
  check('Stats waits for kick-off, in one line', /Stats appear once the game kicks off/.test(h), true);
  check('— no 0 — 0, no plan and no row of 0 min', /0 — 0|no plan set|planned|data-live="pmins"/.test(h), false);
  m.called = 'postponed'; A.ui.gameView = 'live'; h = html();
  check('a postponed game says so on Live, and in its header (16.7)', /Postponed · 19 Sep/.test(h) && /class="ghwhen">Postponed · /.test(A.rendered('#titlebar')), true);
  delete m.called;

  // being played: her child's line, and how long is left of the half (16.1, 16.8)
  m.periods = { 0: { half: 1, start: T0 - 50 * MIN, end: T0 - 10 * MIN }, 1: { half: 2, start: T0 - 8 * MIN } };
  m.currentHalf = 2;
  m.stints = { a: { pid: 'p1', on: 0 }, b: { pid: 'p2', on: 0 }, c: { pid: 'p3', on: 0 } };
  m.goals = { g: { t: 600, side: 'us', pid: 'p1', assist: 'p2' }, h: { t: 900, side: 'them' } };
  A.ui.gameView = 'live'; h = html();
  check('the head says the half and how much of it has gone', /2nd half · <span data-live="half" data-mid="g1">8:00<\/span> of 40:00/.test(h), true);
  check('— and the ticker keeps it', A.liveReading('half', { mid: 'g1' }), '8:00');
  check('her child, under the score: on the pitch, her minutes, her goal', /class="feedmine"[^>]*><b>Ella<\/b> · on the pitch · 48 min · 1 goal</.test(h), true);
  check('— hers alone', (h.match(/class="feedmine"/g) || []).length, 1);
  check('— and no match-day card once it has kicked off', /Match day/.test(h), false);
  m.stints.a.off = 2400;
  check('taken off, she is on the bench since then', A.liveReading('mine', { mid: 'g1', pid: 'p1' }), '<b>Ella</b> · on the bench since 41′ · 40 min · 1 goal');
  m.stints.a.off = null;
  A.me = { uid: 'jaz' }; h = html();
  check('the coach sees nothing extra on Live', /class="feedmine"/.test(h), false);

  // Stats on a parent's phone: minutes alone, her own first, on the pitch marked, goals plain (16.3, 16.5)
  A.me = { uid: 'mum' }; A.ui.gameView = 'stats'; h = html();
  const mins = (h.match(/<h2[^>]*>Minutes<\/h2>[\s\S]*$/) || [''])[0];
  check('her own child first in Minutes', (mins.match(/class="pname">([^<]*)</) || [])[1], 'Ella Fitzgerald');
  check('— no plan and no short or over', /planned|no plan set|short|over|data-live="diff"/.test(mins), false);
  check('— who is on the pitch marked, as Subs marks it', (mins.match(/class="prow" data-on="1"/g) || []).length, 3);
  // the goals plain for her, and the handler's refusal, need a club that is locked down: test/parents.js
  A.me = { uid: 'jaz' }; h = html();
  check('the coach keeps the plan and the editor', /planned/.test(h) + ' ' + /data-act="fixgoal" data-id="g"/.test(h), 'true true');
  A.me = { uid: 'trk' }; h = html();
  check('— and so does the tracker, who logs them', /data-act="fixgoal" data-id="g"/.test(h), true);

  // a finished game: one word for it, and no button repeating the Recap segment (16.9, 16.10)
  m.periods[1].end = T0; m.ended = T0; A.me = { uid: 'mum' }; A.ui.gameView = 'stats'; h = html();
  check('Stats says Full time, never Final', /Full time/.test(h) + ' ' + /Final/.test(h), 'true false');
  check('— and no "See the game recap" button', /See the game recap/.test(h), false);
  A.ui.gameView = 'live'; h = html();
  check('her child\'s line once it is over', /<b>Ella<\/b> · played 48 min · 1 goal/.test(h), true);
}

console.log('\n--- the old Live, remembered ---');
/* Last, because loading a second copy of the app takes over the harness's
   globals, the toast list among them. */
{
  // a phone that last had the old Live (the subs screen) open comes back to it
  const B = H.loadApp({ storage: { 'sm.ui.v1': JSON.stringify({ view: 'game', gameView: 'live', teamId: 't1', matchId: 'g1' }) } });
  B.loadLocal();
  check('a saved old-Live screen comes back as Subs', B.ui.gameView, 'subs');
  const C = H.loadApp({ storage: { 'sm.ui.v1': JSON.stringify({ view: 'game', gameView: 'live', teamId: 't1', matchId: 'g1', tabs: 2 }) } });
  C.loadLocal();
  check('a saved new Live stays Live', C.ui.gameView, 'live');
}

H.summary('the live feed');
