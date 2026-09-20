/* What the numbers add up to, and what leaves the building.

   Two different things share this file because they share their inputs.

   The tallies first. Most of them are append-only collections under random ids
   — CLAUDE.md's second invariant — so nothing here has to think about races;
   what it has to think about is the arithmetic, which has rules that are not
   obvious from the call site. A goal counts as a shot on target. A foul flips
   possession to the other side. A goal restarts with the team that conceded.
   Possession held for less than the threshold belongs to neither side.

   Then the public mirror, which is the privacy contract: "Contains shirt
   numbers and never a name, so the public tier is private by construction
   rather than by the UI choosing to hide things." public/ is world-readable.
   A name reaching it is not a display bug, it is publishing a child's name to
   anyone with the link, so the check here is the blunt one — stringify the
   whole published document and look for any roster name in it. */

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
        id: 't1', name: 'G14 Flight', share: 'sh_abc',
        track: { possession: true },
        players: {
          p1: { id: 'p1', name: 'Ella Fitzgerald', number: '7' },
          p2: { id: 'p2', name: 'Mia Kowalski', number: '8' },
          p3: { id: 'p3', name: 'Rosa Delgado', number: '4' },
          p4: { id: 'p4', name: 'Jo Nakamura', number: '9' },
          p5: { id: 'p5', name: 'Sam Okonkwo', number: '1', gk: true }
        }
      }
    },
    matches: {
      g1: {
        id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12',
        periodCount: 2, periodMinutes: 40, onFieldCount: 4, currentHalf: 1,
        periods: { 0: { half: 1, start: T0 - 30 * MIN } },
        stints: {
          s1: { pid: 'p1', on: 0 }, s2: { pid: 'p2', on: 0 },
          s3: { pid: 'p3', on: 0 }, s5: { pid: 'p5', on: 0 }
        },
        planned: { p1: 40, p2: 40, p3: 40, p4: 40, p5: 80 },
        ...game
      }
    },
    access: { org: { name: 'Flight FC' } }
  };
  A.ui.teamId = 't1'; A.ui.matchId = 'g1';
  return A.state.matches.g1;
}

console.log('--- goals and the score ---');
{
  const m = setup({
    goals: {
      b: { t: 1500, side: 'them' },
      a: { t: 300, side: 'us', pid: 'p3', assist: 'p1' },
      c: { t: 900, side: 'us', pid: 'p1' }
    }
  });
  deepEq('sorted by minute, whatever the key order', A.goalList(m).map(g => g.t), [300, 900, 1500]);
  check('the id comes along', A.goalList(m)[0].id, 'a');
  deepEq('two one', A.score(m), { us: 2, them: 1 });
  deepEq('no goals is nil nil', A.score(setup()), { us: 0, them: 0 });
}

console.log('--- set pieces are counted per side ---');
{
  const m = setup({
    events: {
      e1: { t: 250, side: 'us', kind: 'corner' },
      e2: { t: 700, side: 'them', kind: 'foul' },
      e3: { t: 800, side: 'us', kind: 'corner' },
      e4: { t: 900, side: 'us', kind: 'keeper' }
    }
  });
  check('our corners', A.evCount(m, 'corner', 'us'), 2);
  check('theirs', A.evCount(m, 'corner', 'them'), 0);
  check('their fouls', A.evCount(m, 'foul', 'them'), 1);
  check('a kind nobody logged', A.evCount(m, 'throw', 'us'), 0);
  deepEq('the list is in time order', A.evList(m).map(x => x.t), [250, 700, 800, 900]);
  check('every kind has a label', A.EVENTS.every(e => !!A.evLabel(e.k)), true);
  check('an unknown kind labels as itself', A.evLabel('nope'), 'nope');
}

console.log('--- a goal is a shot on target ---');
{
  const m = setup({
    shots: {
      s1: { t: 200, side: 'us', onTarget: true },
      s2: { t: 400, side: 'them', onTarget: false },
      s3: { t: 1800, side: 'us', onTarget: false },
      s4: { t: 1900, side: 'them', onTarget: true }
    },
    goals: { g1: { t: 300, side: 'us', pid: 'p3' }, g2: { t: 1500, side: 'them' } }
  });
  const sh = A.shotTally(m);
  check('our on-target includes the goal', sh.usOn, 2);
  check('our off-target does not', sh.usOff, 1);
  check('their on-target includes theirs', sh.themOn, 2);
  check('their off-target', sh.themOff, 1);

  const noShots = setup({ goals: { g1: { t: 300, side: 'us' } } });
  check('a goal with no shot logged still counts as one', A.shotTally(noShots).usOn, 1);
  check('a game with neither is all zero',
    Object.values(A.shotTally(setup())).reduce((a, b) => a + b, 0), 0);
}

console.log('--- possession is the gaps between turnovers ---');
{
  // 30 minutes elapsed = 1800s
  const m = setup({
    poss: { t1: { t: 0, to: 'us' }, t2: { t: 600, to: 'them' } }
  });
  const p = A.possession(m, undefined, 5);
  check('ours runs to the next turnover', p.us, 600);
  check('theirs runs to the final whistle', p.them, 1200);
  check('nothing contested', p.contested, 0);
  check('settled is the sum', p.settled, 1800);
  check('which is the whole game', p.total, A.elapsedSec(m));
  check('two changes', p.changes, 2);
  check('both of them tapped', p.tapped, 2);
}

console.log('--- churn shorter than the threshold belongs to nobody ---');
{
  const m = setup({
    poss: {
      a: { t: 0, to: 'us' }, b: { t: 600, to: 'them' },
      c: { t: 602, to: 'us' }, d: { t: 604, to: 'them' }   // two seconds each
    }
  });
  const p = A.possession(m, undefined, 5);
  check('the two-second spells are contested', p.contested, 4);
  check('ours is only the long spell', p.us, 600);
  check('theirs is only the long spell', p.them, 1196);
  check('and it all still adds up', p.total, A.elapsedSec(m));
  const loose = A.possession(m, undefined, 0);
  check('with no threshold nothing is contested', loose.contested, 0);
  check('and everything is settled', loose.settled, A.elapsedSec(m));
}

console.log('--- set pieces and goals say who has the ball, for free ---');
{
  const m = setup({
    events: {
      e1: { t: 300, side: 'us', kind: 'throw' },     // our throw: we have it
      e2: { t: 900, side: 'us', kind: 'foul' }       // our foul: they have it
    },
    goals: { g1: { t: 1200, side: 'us' } }           // we score: they restart
  });
  const mk = A.possMarkers(m);
  deepEq('markers in time order', mk.map(x => x.t), [300, 900, 1200]);
  check('a throw-in goes to the side that took it', mk[0].to, 'us');
  check('a foul goes to the OTHER side', mk[1].to, 'them');
  check('a goal restarts with the team that conceded', mk[2].to, 'them');
  check('each marker knows where it came from', mk[2].src, 'goal');

  const p = A.possession(m, undefined, 5);
  check('possession falls out of them with nothing tapped', p.tapped, 0);
  check('but there are still changes', p.changes, 3);
  check('ours is the throw-in to the foul', p.us, 600);
}

console.log('--- who logged what ---');
{
  const m = setup({
    goals: { g1: { t: 300, side: 'us', by: 'uidA', byName: 'Grant' } },
    shots: {
      s1: { t: 200, side: 'us', onTarget: true, by: 'uidA', byName: 'Grant' },
      s2: { t: 400, side: 'them', onTarget: false, by: null, byName: 'videotool' }
    },
    events: { e1: { t: 250, side: 'us', kind: 'corner', by: 'Jaz' } }   // pre-auth stamp
  });
  const who = A.trackersIn(m);
  check('a signed-in tracker is keyed by uid', who.uidA.n, 2);
  check('and is verified', who.uidA.verified, true);
  check('a typed name is keyed by name', who['n:videotool'].n, 1);
  check('and is not verified', who['n:videotool'].verified, false);

  check('a modern stamp reads its uid', A.stampOf({ by: 'u', byName: 'N' }).uid, 'u');
  check('a legacy stamp has a name but no uid', A.stampOf({ by: 'Jaz' }).name, 'Jaz');
  check('and is never treated as verified', A.stampOf({ by: 'Jaz' }).verified, false);
  check('an unstamped event is anonymous', A.stampOf({}).name, null);
  check('a typed-name stamp keeps byName and drops by', A.stampOf({ by: null, byName: 'Mum' }).verified, false);
}

console.log('--- what gets published: numbers, never names ---');
{
  const m = setup({
    goals: { g1: { t: 300, side: 'us', pid: 'p3', assist: 'p1' }, g2: { t: 1500, side: 'them' } },
    shots: { s1: { t: 200, side: 'us', onTarget: true } },
    events: { e1: { t: 250, side: 'us', kind: 'corner' } },
    poss: { a: { t: 0, to: 'us' } }
  });
  A.subAt(m, 'p1', 'p4', 600);

  const doc = A.publicGame(A.state.teams.t1, m);
  const json = JSON.stringify(doc);
  const names = Object.values(A.state.teams.t1.players).map(p => p.name);
  const leaked = names.filter(n => json.includes(n) || json.includes(n.split(' ')[0]));
  deepEq('no player name appears anywhere in it', leaked, []);
  check('no player id appears either', /\bp[1-5]\b/.test(json), false);

  check('players are listed by shirt number', doc.players.every(p => typeof p.n === 'string'), true);
  check('in shirt order', doc.players.map(p => p.n).join(','), '1,4,7,8,9');
  check('with minutes', doc.players.find(p => p.n === '4').sec > 0, true);
  check('and who is on', doc.players.find(p => p.n === '4').on, true);
  check('the scorer is a number', doc.goals[0].n, '4');
  check('an opposition goal has no number', doc.goals[1].n, null);
  check('the sub log is numbers too', doc.log.some(r => r.on === '9' && r.off === '7'), true);
  deepEq('the score is carried', doc.score, { us: 1, them: 1 });
  check('so are the shots', doc.shots.usOn, 2);
  check('and the corners', doc.events.corner.us, 1);
  check('kinds nobody logged are left out', doc.events.throw, undefined);
  check('the opponent name is published — it is a club, not a child', doc.opponent, 'Riverside');

  const p6 = { id: 'p6', name: 'No Number', number: '' };
  A.state.teams.t1.players.p6 = p6;
  m.stints.s6 = { pid: 'p6', on: 0 };
  const doc2 = A.publicGame(A.state.teams.t1, m);
  check('a player with no shirt number still gets no name', doc2.players.some(p => p.n === '–'), true);
  check('and her name is still not in it', JSON.stringify(doc2).includes('No Number'), false);
  delete A.state.teams.t1.players.p6; delete m.stints.s6;
}

console.log('--- the season document the public page reads ---');
{
  const m = setup({ ended: T0, goals: { g1: { t: 300, side: 'us' }, g2: { t: 400, side: 'us' } } });
  m.periods[0].end = T0;
  const t = A.state.teams.t1;
  const doc = A.publicDoc(t);
  check('the team name is published', doc.team.name, 'G14 Flight');
  deepEq('a win is recorded', doc.record, { w: 1, d: 0, l: 0, gf: 2, ga: 0 });
  check('the game is in it', !!doc.games.g1, true);
  check('and it is done', doc.games.g1.status, 'done');
  check('no player name in the season document either',
    JSON.stringify(doc).includes('Ella'), false);
  /* public/ is world-readable and, while the rules are open, the workspace code
     is the password to the whole club. */
  check('the link carries the team id, not the workspace code', doc.link.teamId, 't1');
  check('the workspace code is not in the document', JSON.stringify(doc).includes('sm.workspace'), false);

  // a game still in progress must not be counted into the record
  A.state.matches.g2 = {
    id: 'g2', teamId: 't1', opponent: 'Northside', date: '2026-09-19',
    periodCount: 2, periodMinutes: 40, onFieldCount: 4, currentHalf: 1,
    periods: { 0: { half: 1, start: T0 - 10 * MIN } }, stints: { a: { pid: 'p1', on: 0 } }
  };
  const doc2 = A.publicDoc(t);
  check('a live game is not in the record', doc2.record.w + doc2.record.d + doc2.record.l, 1);
  check('but it is still published', !!doc2.games.g2, true);
}

console.log('--- the status a game reports ---');
{
  const fresh = setup({ periods: {} });
  check('nothing has happened yet', A.gameStatus(fresh), 'upcoming');
  const live = setup();
  check('the clock has run', A.gameStatus(live), 'live');
  const done = setup({ ended: T0 });
  check('an explicit end wins', A.gameStatus(done), 'done');
  const past = setup({ currentHalf: 3 });
  check('so does running out of halves', A.gameStatus(past), 'done');
}

console.log('--- share links ---');
{
  const t = A.state.teams.t1;
  check('a team link points at the live page', A.teamLink(t), 'https://x.test/live.html?t=sh_abc');
  check('a game link names the game', A.gameLink(t, A.state.matches.g1), 'https://x.test/game.html?t=sh_abc&g=g1');
  check('a team with no share has no link', A.teamLink({ id: 'x' }), '');
}

H.summary('stats and the public mirror');
