/* The built-in drill library holds together.

   drills.js is content, not code, so nothing about the app breaks when it is
   wrong. A drill tagged 'finshing' still loads fine. It just never turns up
   when a coach filters for finishing, and nobody notices a drill that isn't
   there. So this suite is strict about the vocabularies and loose about the
   prose.

   It also checks coverage, because the failure that matters for a library is
   a U6 coach finding nothing, not one malformed drill. Every age needs enough
   drills and a game to end on, every position needs something, and every
   signal the stats can raise needs drills that answer it. A signal with no
   drills is a problem the app can name but not help with. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness');
const { check } = H;

const FILE = path.join(__dirname, '..', 'drills.js');
const DIAGRAM = path.join(__dirname, '..', 'drill-diagram.js');
const LIB = require(FILE);
const DD = require(DIAGRAM);
const { DRILLS, TYPES, MOMENTS, SKILLS, PRINCIPLES, PHYSICAL, KIT, LEVELS, INTENSITY, GROUPS, INVOLVEMENT, POSITIONS, SIGNALS, ROLE_GUIDE } = LIB;
const ids = new Set(DRILLS.map(d => d.id));

/* Collect every problem, then report each kind once with the drills it hit.
   With fifty drills, one line per drill per field would bury the one that
   matters. */
const problems = {};
const flag = (kind, id) => { (problems[kind] = problems[kind] || []).push(id); };
const report = (label, kind) => check(label, (problems[kind] || []).join(', '), '');

const isInt = n => Number.isInteger(n);
const subset = (list, vocab) => Array.isArray(list) && list.every(x => Object.prototype.hasOwnProperty.call(vocab, x)) && new Set(list).size === list.length;
const text = s => typeof s === 'string' && s.trim().length > 0;
const texts = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every(text);

console.log('--- it loads both ways the app will load it ---');
{
  /* index.html will load it with a plain script tag, like firebase-config.js,
     because fetch() fails from file:// and with no signal. No module, so it
     has to land on window. */
  const win = {};
  vm.runInNewContext(fs.readFileSync(FILE, 'utf8'), { window: win });
  check('a script tag puts it on window.SOCCER_DRILLS', !!(win.SOCCER_DRILLS && win.SOCCER_DRILLS.DRILLS), true);
  check('…with the same drills node sees', win.SOCCER_DRILLS && win.SOCCER_DRILLS.DRILLS.length, DRILLS.length);
  check('node gets it through module.exports', Array.isArray(DRILLS) && DRILLS.length > 0, true);
  const win2 = {};
  vm.runInNewContext(fs.readFileSync(DIAGRAM, 'utf8'), { window: win2 });
  check('the diagram renderer lands on window.DrillDiagram', typeof (win2.DrillDiagram && win2.DrillDiagram.svg), 'function');
  console.log(`  ${DRILLS.length} drills`);
}

console.log('\n--- every drill is well formed ---');
for (const d of DRILLS) {
  const id = d.id || '(no id)';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id || '')) flag('id', id);
  if (!isInt(d.v) || d.v < 1) flag('v', id);
  if (![d.name, d.summary, d.setup, d.why].every(text)) flag('text', id);
  if (!texts(d.how) || !texts(d.points)) flag('how', id);
  if (!texts(d.questions) || !texts(d.mistakes)) flag('ask', id);
  if (!texts(d.easier) || !texts(d.harder)) flag('adapt', id);
  if (!TYPES[d.type]) flag('type', id);
  if (!LEVELS[d.level]) flag('level', id);
  if (!INTENSITY[d.intensity]) flag('intensity', id);

  const [lo, hi] = d.ages || [];
  if (!(isInt(lo) && isInt(hi) && lo >= 4 && lo <= hi && hi <= 19)) flag('ages', id);

  const p = d.players || {};
  if (!(isInt(p.min) && isInt(p.best) && isInt(p.max) && p.min >= 1 && p.min <= p.best && p.best <= p.max)) flag('players', id);
  if (!(isInt(d.gk) && d.gk >= 0 && d.gk <= 2 && d.gk <= p.min)) flag('gk', id);

  const [m0, m1] = d.minutes || [];
  if (!(isInt(m0) && isInt(m1) && m0 >= 1 && m0 <= m1 && m1 <= 45)) flag('minutes', id);

  if (d.space === null) { if (!text(d.spaceNote)) flag('space', id); }
  else if (!(Array.isArray(d.space) && d.space.length === 2 && d.space.every(n => typeof n === 'number' && n > 0))) flag('space', id);

  const kit = d.kit || null;
  if (!kit || typeof kit !== 'object') flag('kit', id);
  else for (const [k, n] of Object.entries(kit)) {
    if (!KIT[k]) flag('kit', id);
    else if (!(isInt(n) && n > 0) && !(k === 'balls' && n === 'each')) flag('kit', id);
  }

  if (!subset(d.positions, Object.fromEntries(POSITIONS.map(x => [x, 1]))) || !d.positions.length) flag('positions', id);
  if (!subset(d.skills, SKILLS)) flag('skills', id);
  if (!subset(d.principles, PRINCIPLES)) flag('principles', id);
  if (!subset(d.moments, MOMENTS)) flag('moments', id);
  if (!subset(d.physical, PHYSICAL)) flag('physical', id);
  if (!(d.skills || []).length && !(d.physical || []).length) flag('trains', id);
  if (!subset(d.signals, SIGNALS)) flag('signals', id);
  if (!Array.isArray(d.goesWith) || d.goesWith.some(x => x === d.id || !ids.has(x))) flag('goesWith', id);
  if (!Array.isArray(d.tags) || d.tags.some(t => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t))) flag('tags', id);
  if (d.safety !== undefined && !text(d.safety)) flag('safety', id);

  if (!(isInt(d.setupMins) && d.setupMins >= 0 && d.setupMins <= 15)) flag('setupMins', id);
  if (d.adults !== 1 && d.adults !== 2) flag('adults', id);
  if (typeof d.indoor !== 'boolean' || typeof d.competitive !== 'boolean') flag('bools', id);
  if (!subset(d.groups, GROUPS) || !d.groups.length) flag('groups', id);
  if (!INVOLVEMENT[d.involvement]) flag('involvement', id);
}

report('ids are lowercase-with-hyphens', 'id');
check('ids are unique', ids.size, DRILLS.length);
report('every drill has a content version', 'v');
report('name, summary, setup and why are written', 'text');
report('how it runs, and what to coach', 'how');
report('questions to ask, and what goes wrong', 'ask');
report('a way to make it easier and a way harder', 'adapt');
report('type is one the session builder knows', 'type');
report('level is 1–3', 'level');
report('intensity is 1–3', 'intensity');
report('ages are U4–U19, youngest first', 'ages');
report('players: min ≤ best ≤ max', 'players');
report('keepers needed fit inside the minimum', 'gk');
report('minutes: a range, at most 45', 'minutes');
report('space is [width, length], or a note why not', 'space');
report('kit uses known items; only balls may be "each"', 'kit');
report('positions are the app\'s own five roles', 'positions');
report('skills come from SKILLS, no repeats', 'skills');
report('principles come from PRINCIPLES', 'principles');
report('moments come from MOMENTS', 'moments');
report('physical comes from PHYSICAL', 'physical');
report('every drill trains a skill or a physical quality', 'trains');
report('signals are ones the stats can raise', 'signals');
report('goesWith names real drills, never itself', 'goesWith');
report('tags are lowercase-with-hyphens', 'tags');
report('a safety note, where given, says something', 'safety');
report('setup takes 0–15 minutes', 'setupMins');
report('one adult or two', 'adults');
report('indoor and competitive are yes or no', 'bools');
report('groups come from GROUPS', 'groups');
report('involvement is 1–3', 'involvement');

console.log('\n--- the positions match the app\'s ---');
{
  /* Drill positions are the roles a player profile and a shape slot use, so
     "drills for my keepers" and "drills for her best position" are the same
     lookup as everything else. If app.js grows a sixth role, this says so. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const roles = JSON.parse((src.match(/const ROLES = (\[[^\]]*\]);/) || [, '[]'])[1].replace(/'/g, '"'));
  check('POSITIONS is app.js\'s ROLES', JSON.stringify(POSITIONS), JSON.stringify(roles));
}

console.log('\n--- every drill has a picture, and it agrees with the card ---');
{
  /* The diagram is drawn from data, so it can be wrong in ways a picture
     can't: a pass from someone who hasn't got the ball, a player off the
     pitch, a goal the kit list forgot. parse() names each one. Then the
     picture is held to the card it sits on. */
  for (const d of DRILLS) {
    if (!d.diagram) { flag('diagram', d.id); continue; }
    const r = DD.parse(d.diagram);
    if (r.errors.length) { flag('diagram', d.id + ' (' + r.errors[0] + ')'); continue; }
    const still = DD.svg(d.diagram), moving = DD.svg(d.diagram, { animate: true });
    if (!still.startsWith('<svg') || !moving.startsWith('<svg')) flag('renders', d.id);
    /* SMIL drops an animation whose keyTimes and values disagree in length,
       silently: the player just doesn't move. */
    for (const m of moving.matchAll(/keyTimes="([^"]*)" values="([^"]*)"/g)) {
      if (m[1].split(';').length !== m[2].split(';').length) { flag('smil', d.id); break; }
    }
    for (const st of r.steps) if (st.caption && st.caption.length > 48) flag('caption', d.id);
    const ps = Object.keys(d.diagram.players);
    if (ps.filter(p => p[0] === 'K').length < d.gk) flag('keepers', d.id);
    const goals = d.diagram.goals || [];
    if (goals.some(g => g[2] === 'big') && !d.kit.goals) flag('kit-goals', d.id);
    if (goals.some(g => g[2] === 'mini') && !d.kit.minigoals) flag('kit-goals', d.id);
    if ((d.diagram.cones || []).length && !d.kit.cones) flag('kit-cones', d.id);
    if ((d.diagram.poles || []).length && !d.kit.poles) flag('kit-other', d.id);
    if ((d.diagram.hurdles || []).length && !d.kit.hurdles) flag('kit-other', d.id);
  }
  report('every drill has a diagram that parses', 'diagram');
  report('…and draws, still and moving', 'renders');
  report('every animation has a value for each key time', 'smil');
  report('captions fit the strip at phone width (48)', 'caption');
  report('a keeper on the card is a keeper in the picture', 'keepers');
  report('a goal in the picture is on the kit list', 'kit-goals');
  report('cones in the picture are on the kit list', 'kit-cones');
  report('poles and hurdles in the picture are on it too', 'kit-other');
  const moving = DRILLS.filter(d => d.diagram && (d.diagram.frames || []).length).length;
  check('most diagrams move (layouts are the exception)', moving >= DRILLS.length - 3, true);
}

console.log('\n--- the renderer refuses what it can\'t draw ---');
{
  const base = { area: [20, 20], players: { A1: [5, 5], A2: [15, 5] }, ball: 'A1' };
  const errs = frames => DD.parse({ ...base, frames }).errors;
  check('a clean pass parses', errs([['A1>A2']]).length, 0);
  check('a pass from someone without the ball', errs([['A2>A1']]).length > 0, true);
  check('a dribble without a ball', errs([['A2~10,10']]).length > 0, true);
  check('a run off the diagram', errs([['A1-40,5']]).length > 0, true);
  check('a shot with no goal to aim at', errs([['A1>G']]).length > 0, true);
  check('a player who isn\'t there', errs([['A3>A1']]).length > 0, true);
  check('the same player moved twice in one step', errs([['A1~8,8', 'A1-9,9']]).length > 0, true);
  check('a step with nothing in it', errs([['# just words']]).length > 0, true);
  check('a broken diagram draws nothing rather than half', DD.svg({ ...base, frames: [['A2>A1']] }), '');
  const through = DD.parse({ ...base, frames: [['A2-15,12', 'A1>A2']] });
  check('a pass is played onto a run, not to where she was', JSON.stringify(through.steps[0].moves.find(m => m.kind === 'pass').to), '[15,12]');
  const loose = DD.parse({ ...base, frames: [['A1>15,6'], ['A2~18,10']] });
  check('a loose ball at someone\'s feet becomes hers', loose.errors.length, 0);
  const wall = DD.parse({ ...base, walls: [[0, 1, 20, 1]], frames: [['A1>W']] });
  check('a pass off the wall comes back to the passer', wall.errors.length === 0 && wall.states[1].balls[0].by, 'A1');
  check('a wall pass with no wall is refused', errs([['A1>W']]).length > 0, true);
  const bent = DD.parse({ ...base, frames: [['A1>A2(']] });
  check('a bent pass is still a pass to her', bent.errors.length === 0 && bent.states[1].balls[0].by, 'A2');
  check('…and it knows which way it bends', bent.steps[0] && bent.steps[0].moves[0].curve, -1);
}

console.log('\n--- the position guide ---');
{
  /* The guide is what a coach reads to find out what a position is for. It
     has to line up with the rest of the app: its roles are the app's roles,
     its slots are labels the app's shapes really use, and every drill it
     recommends for a position says on its own card that it's for that
     position. A guide that sends a centre back to a drill marked Forward
     only is a guide nobody trusts twice. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const appSlots = new Set([...src.matchAll(/S\('([A-Z]+)', '[A-Za-z]+'/g)].map(m => m[1]));
  const gids = new Set();
  for (const r of ROLE_GUIDE || []) {
    const id = r.id || '(no id)';
    if (!/^[a-z]+(-[a-z]+)*$/.test(r.id || '') || gids.has(r.id)) flag('guide-id', id);
    gids.add(r.id);
    if (![r.name, r.oneLine, r.whenWeWin, r.whenWeLose, r.young, r.number].every(text)) flag('guide-text', id);
    if (!texts(r.withBall, 2) || !texts(r.withoutBall, 2) || !texts(r.aka)) flag('guide-text', id);
    if (!Array.isArray(r.roles) || !r.roles.length || !r.roles.every(x => POSITIONS.includes(x))) flag('guide-roles', id);
    if (!Array.isArray(r.slots) || !r.slots.length || r.slots.some(x => !appSlots.has(x))) flag('guide-slots', id);
    if (!subset(r.keySkills, SKILLS) || !r.keySkills.length) flag('guide-skills', id);
    if (!Array.isArray(r.drills) || r.drills.length < 5 || r.drills.some(x => !ids.has(x))) flag('guide-drills', id);
    else {
      const ds = r.drills.map(x => DRILLS.find(d => d.id === x));
      if (ds.some(d => !d.positions.some(p => r.roles.includes(p)))) flag('guide-fit', id + ' (' + ds.filter(d => !d.positions.some(p => r.roles.includes(p))).map(d => d.id).join(' ') + ')');
      if (!ds.some(d => d.type === 'position' || d.type === 'keeper')) flag('guide-own', id);
    }
    const dr = r.diagram && DD.parse(r.diagram);
    if (!dr || dr.errors.length || !dr.steps.length) flag('guide-diagram', id);
    else if (dr.steps.some(st => !st.caption || st.caption.length > 48)) flag('guide-diagram', id);
  }
  check('there is a guide entry per job, nine of them', (ROLE_GUIDE || []).length, 9);
  report('guide ids are unique, lowercase-with-hyphens', 'guide-id');
  report('every entry says what the job is, both ways', 'guide-text');
  report('roles are the app\'s five', 'guide-roles');
  report('slots are labels the app\'s shapes use', 'guide-slots');
  report('key skills come from SKILLS', 'guide-skills');
  report('at least five real drills each', 'guide-drills');
  report('every drill it recommends is for that position', 'guide-fit');
  report('each links a positional (or keeper) drill', 'guide-own');
  report('each has a moving diagram with captions that fit', 'guide-diagram');
  const covered = new Set((ROLE_GUIDE || []).flatMap(r => r.slots));
  check('every slot in the app\'s shapes has a guide entry', [...appSlots].filter(x => !covered.has(x)).join(', '), '');
  const rolesCovered = new Set((ROLE_GUIDE || []).flatMap(r => r.roles));
  check('every app role has a guide entry', POSITIONS.filter(p => !rolesCovered.has(p)).join(', '), '');
}

console.log('\n--- safety ---');
{
  /* US Soccer bars heading at 10 and under and the FA keeps it out of training
     at primary-school age. A library that offered a heading drill to a U9
     coach would be the app recommending something the federation forbids. */
  const heading = DRILLS.filter(d => d.skills.includes('heading'));
  check('there is heading work for older players', heading.length > 0, true);
  check('no heading drill is offered below U11', heading.filter(d => d.ages[0] < 11).map(d => d.id).join(', '), '');
  check('every heading drill carries a safety note', heading.filter(d => !text(d.safety)).map(d => d.id).join(', '), '');
  const dives = DRILLS.filter(d => d.skills.includes('diving'));
  check('every diving drill carries a safety note', dives.filter(d => !text(d.safety)).map(d => d.id).join(', '), '');
  check('keeper drills are for keepers, and need one', DRILLS.filter(d => d.type === 'keeper' && (!d.positions.includes('GK') || d.gk < 1)).map(d => d.id).join(', '), '');
}

console.log('\n--- coverage ---');
{
  const by = (pred) => DRILLS.filter(pred);
  for (const k of Object.keys(TYPES)) check(`at least one ${TYPES[k].toLowerCase()} drill`, by(d => d.type === k).length > 0, true);

  /* A session needs a warm-up, something in the middle and a game to finish,
     whatever the age. Ten drills is the floor for a library a coach can
     actually choose from. */
  const thin = [], noGame = [], noWarm = [];
  for (let u = 5; u <= 18; u++) {
    const fits = by(d => d.ages[0] <= u && u <= d.ages[1]);
    if (fits.length < 10) thin.push(`U${u}:${fits.length}`);
    if (!fits.some(d => d.type === 'game')) noGame.push('U' + u);
    if (!fits.some(d => d.type === 'warmup')) noWarm.push('U' + u);
  }
  check('every age U5–U18 has at least ten drills', thin.join(' '), '');
  check('every age has a game to finish on', noGame.join(' '), '');
  check('every age has a warm-up', noWarm.join(' '), '');

  const fewPos = POSITIONS.filter(p => by(d => d.positions.includes(p)).length < 3);
  check('every position has at least three drills', fewPos.join(', '), '');

  /* The signals are the bridge to the AI helper and to "what needs work". One
     the stats can raise but no drill answers is a dead end on the screen. */
  const lonely = Object.keys(SIGNALS).filter(s => by(d => d.signals.includes(s)).length < 2);
  check('every signal is answered by at least two drills', lonely.join(', '), '');
  for (const [k, s] of Object.entries(SIGNALS)) {
    if (!(text(s.label) && text(s.means) && text(s.from))) flag('signal-text', k);
  }
  report('every signal says what it means and where it comes from', 'signal-text');

  /* Vocabulary nobody uses is a filter chip that always returns nothing. */
  const unused = (vocab, field) => Object.keys(vocab).filter(k => !DRILLS.some(d => (d[field] || []).includes(k)));
  check('every skill is trained somewhere', unused(SKILLS, 'skills').join(', '), '');
  check('every principle is trained somewhere', unused(PRINCIPLES, 'principles').join(', '), '');
  check('every moment is trained somewhere', unused(MOMENTS, 'moments').join(', '), '');
  check('every physical quality is trained somewhere', unused(PHYSICAL, 'physical').join(', '), '');
}

H.summary('drill library');
