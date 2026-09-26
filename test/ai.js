/* The AI prompt helper, and what it lets out of the building.

   The app never calls a model; it writes a prompt the coach copies into her own
   ChatGPT or Claude. That makes the prompt the one thing here designed to be
   pasted into a third-party service, so it is held to the public mirror's
   contract and checked the same blunt way stats.js checks public/: build every
   prompt there is and look for any roster name, or any note, in the text. A
   name reaching one is a child's name handed to a company nobody at the club
   has an agreement with.

   Then the labels, because the easy mistake is a quiet one — two players on the
   same number collapsing into one "#7" whose minutes then read as a single
   over-played child. And who may open it: the prompt reads out the whole
   squad's minutes, which trackers and parents are not shown. */

const H = require('./harness');
const { check } = H;

const A = H.loadApp({});
const T0 = Date.UTC(2026, 8, 12, 10, 0, 0);
const MIN = 60000;

const NAMES = ['Ella Fitzgerald', 'Mia Kowalski', 'Rosa Delgado', 'Jo Nakamura', 'Sam Okonkwo', 'Wren Byrne', 'Viv Osei'];
const NOTE = 'Ask Rosa about her ankle';

function setup() {
  H.clock.set(T0);
  A.state = {
    teams: {
      t1: {
        id: 't1', name: 'G14 Flight',
        players: {
          p1: { id: 'p1', name: NAMES[0], number: '7', note: NOTE },
          p2: { id: 'p2', name: NAMES[1], number: '8', preferred: 'MID', canPlay: ['DEF'], rating: 4, maxStint: 15, pairs: { p3: true }, avoid: { p4: true } },
          p3: { id: 'p3', name: NAMES[2], number: '4', guardians: { mum: true } },
          p4: { id: 'p4', name: NAMES[3], number: '9' },
          p5: { id: 'p5', name: NAMES[4], number: '1', gk: true },
          p6: { id: 'p6', name: NAMES[5], number: '9' },
          p7: { id: 'p7', name: NAMES[6] }
        }
      }
    },
    matches: {
      g0: {
        id: 'g0', teamId: 't1', opponent: 'Hillcrest', date: '2026-09-05', ended: true,
        periodCount: 2, periodMinutes: 40, onFieldCount: 4, currentHalf: 3,
        periods: { 0: { half: 1, start: T0 - 9000 * MIN, end: T0 - 9000 * MIN + 40 * MIN } },
        stints: { a: { pid: 'p1', on: 0, off: 2400 }, b: { pid: 'p2', on: 0, off: 1200 }, c: { pid: 'p6', on: 1200, off: 2400 }, d: { pid: 'p5', on: 0, off: 2400 } },
        goals: { x: { t: 600, side: 'us', pid: 'p1', assist: 'p7' } }
      },
      g1: {
        id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-09-12',
        periodCount: 2, periodMinutes: 40, onFieldCount: 4, currentHalf: 1,
        periods: { 0: { half: 1, start: T0 - 30 * MIN } },
        stints: { s1: { pid: 'p1', on: 0 }, s2: { pid: 'p3', on: 0, off: 600 }, s4: { pid: 'p4', on: 600 }, s5: { pid: 'p5', on: 0 } },
        goals: { y: { t: 900, side: 'us', pid: 'p4' } },
        planned: { p1: 40, p3: 40, p4: 40, p5: 80 }, out: { p2: true }
      },
      g2: { id: 'g2', teamId: 't1', opponent: 'Oakfield', date: '2026-09-19', periodCount: 2, periodMinutes: 40, onFieldCount: 4, planned: { p2: 40 } }
    },
    access: { org: { name: 'Flight FC' }, admins: { boss: true }, teams: { t1: { coaches: { coach: true }, trackers: { trk: true } } }, members: {}, index: {} }
  };
  A.ui.teamId = 't1'; A.ui.matchId = 'g1';
  A.appOwners = {};
  A.me = { uid: 'coach', name: 'Coach' };
}

console.log('--- every prompt: numbers in, names out ---');
{
  setup();
  let leaks = [], n = 0;
  for (const scope of Object.keys(A.AI_TOPICS)) {
    for (const [k] of A.AI_TOPICS[scope]) {
      const txt = A.aiPrompt(scope, k); n++;
      for (const nm of NAMES) for (const part of nm.split(' ')) if (txt.includes(part)) leaks.push(`${scope}/${k}: ${part}`);
      if (txt.includes('ankle')) leaks.push(`${scope}/${k}: note`);
      if (txt.includes('mum')) leaks.push(`${scope}/${k}: guardian`);
    }
  }
  check(`all ${n} prompts are free of names and notes`, leaks.join('; '), '');
  const g = A.aiPrompt('game', 'review');
  check('the game prompt still names the scorer by number', /15' us #9|15' us Player/.test(g), true);
  check('the opponent is there', g.includes('Riverside'), true);
  check('unavailable players are listed', g.includes('Unavailable: #8'), true);
  check('the season prompt covers every game', ['Hillcrest', 'Riverside', 'Oakfield'].every(o => A.aiPrompt('team', 'season').includes(o)), true);
  check('"next game" names the upcoming one', A.aiPrompt('team', 'next').includes('NEXT GAME: 2026-09-19 vs Oakfield'), true);
  check('the club prompt lists the team', A.aiPrompt('club', 'club').includes('G14 Flight'), true);
}

console.log('--- planning a game that has not been played ---');
{
  setup();
  A.ui.matchId = 'g2';
  const txt = A.aiPrompt('game', 'plan');
  check('it is a plan question', txt.includes('Help me finish my plan'), true);
  check('it carries the target', txt.includes('#8: my target 40 min'), true);
  check('and where she plays', txt.includes('best at MID, also DEF'), true);
  check('and her longest spell', txt.includes('longest spell 15 min'), true);
  check('earlier games count toward the season', txt.includes('over 2 earlier games'), true);
  check('pairings by number', txt.includes('Play well together: #8 & #4'), true);
  check('and who to keep apart', /Keep apart: #8 & (Player [A-Z]|#9)/.test(txt), true);
  check('no minutes-so-far noise', txt.includes('MINUTES'), false);
  check('no plan yet, no plan section', txt.includes('MY PLAN SO FAR'), false);

  // the coach's own snapshots: kick-off, then a change at 20 minutes
  A.state.matches.g2.formation = { name: '1-2-1', slots: [
    { id: 'sGK', label: 'GK', role: 'GK' }, { id: 'sCB', label: 'CB', role: 'DEF' },
    { id: 'sCM', label: 'CM', role: 'MID' }, { id: 'sST', label: 'ST', role: 'FWD' }] };
  A.state.matches.g2.plan = { manual: true, blocks: [
    { start: 0, ids: ['p5', 'p3', 'p2', 'p1'], assign: { sGK: 'p5', sCB: 'p3', sCM: 'p2', sST: 'p1' } },
    { start: 1200, ids: ['p5', 'p3', 'p2', 'p4'], assign: { sGK: 'p5', sCB: 'p3', sCM: 'p2', sST: 'p4' } }] };
  const withPlan = A.aiPrompt('game', 'plan');
  check('her snapshots are in it', withPlan.includes('MY PLAN SO FAR (my snapshots)'), true);
  check('kick-off lineup, spot by spot', withPlan.includes('- Kick-off: GK #1, CB #4, CM #8, ST #7'), true);
  check('with the bench', /Kick-off: [^\n]*\| bench [^\n]*Player/.test(withPlan), true);
  check('and what her plan gives each player', withPlan.includes('#7: my target not set, my plan gives 20'), true);

  // her ideas, as typed — names and all
  const ideas = 'Rosa Delgado plays all of the first half at CB. mia and Ella share CM.';
  const withIdeas = A.aiPrompt('game', 'plan', ideas);
  check('her ideas are in the prompt', withIdeas.includes('MY IDEAS\n'), true);
  const r = A.aiScrub(withIdeas, 'game');
  check('names in them are swapped for numbers', r.text.includes('#4 plays all of the first half at CB. #8 and #7 share CM.'), true);
  check('a full name counts once, not per word', r.n, 3);
  check('and nothing of any name is left', NAMES.some(nm => nm.split(' ').some(w => r.text.includes(w))), false);
  check('a name inside a longer word is left alone', A.aiScrub('Samuel and Jonah', 'game').text, 'Samuel and Jonah');
  check('at club level a name becomes "a player"', A.aiScrub('talk to Mia', 'club').text, 'talk to a player');
  delete A.state.matches.g2.plan; delete A.state.matches.g2.formation;
  A.dom.node('#sheet').innerHTML = '';
  A.click({ act: 'aihelp', scope: 'game' });
  check('an upcoming game opens on the plan', A.ui.ai.topic, 'plan');
  A.ui.matchId = 'g1';
  A.click({ act: 'aihelp', scope: 'game' });
  check('a started game opens on the review', A.ui.ai.topic, 'review');
}

console.log('--- labels never merge two players ---');
{
  setup();
  const lab = A.aiLabels(A.state.teams.t1);
  const vals = Object.values(lab);
  check('one label per player', vals.length, 7);
  check('and all of them different', new Set(vals).size, 7);
  check('a unique number is the label', lab.p1, '#7');
  check('a shared number becomes a letter', lab.p4 !== '#9' && lab.p6 !== '#9', true);
  check('no number becomes a letter', /^Player [A-Z]$/.test(lab.p7), true);
}

console.log('--- who may open it ---');
{
  const opened = () => A.dom.rendered('#sheet').includes('aiPrompt');
  const tryAs = (uid, scope) => { setup(); A.me = uid ? { uid, name: uid } : null; A.dom.node('#sheet').innerHTML = ''; A.click({ act: 'aihelp', scope }); return opened(); };
  check('a coach can build a season prompt', tryAs('coach', 'team'), true);
  check('a coach can build a game prompt', tryAs('coach', 'game'), true);
  check('a tracker cannot, whatever the button says', tryAs('trk', 'team'), false);
  check('a parent cannot', tryAs('mum', 'game'), false);
  check('a coach cannot build the club prompt', tryAs('coach', 'club'), false);
  check('an admin can', tryAs('boss', 'club'), true);
  const sheet = A.dom.rendered('#sheet');
  check('the sheet shows no player name', NAMES.some(nm => sheet.includes(nm.split(' ')[0])), false);
}

H.summary('the AI prompt helper');
