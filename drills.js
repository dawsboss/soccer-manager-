/* The built-in drill library.

   Training is designed in TRAINING.md before any of it is wired in. This file
   is the one part that can exist ahead of the rest, because it is content and
   not data about anyone: no database node, no rule, nothing to migrate, and
   nothing a parent's phone could leak.

   It is a plain script rather than JSON so index.html can load it with a script
   tag the way it loads firebase-config.js. The app opens from file:// and has to
   work at a field with no signal, and fetch() can't do either. Node reads it
   through module.exports, which is how test/drills.js checks it.

   Three rules for anything added here:

   - An id is forever. A practice session, a club's copy and an AI's answer all
     refer to a drill by its id, so renaming one quietly breaks every one of
     them. Bump `v` when the content changes, so a copy can tell its original
     moved on.
   - Every list field draws from the vocabularies below, and test/drills.js
     refuses anything else. A typo'd skill is a drill that never turns up in a
     filter, and nobody notices that it's missing.
   - Write for a parent volunteer at quarter to six with twelve kids arriving.
     Setup a coach can lay out from one read, three or four coaching points
     rather than ten, and why it matters on Saturday in one or two sentences.

   Ages are U-ages, inclusive: [8, 12] means U8 to U12. 19 stands for U19 and
   adult. Space is [width, length] in yards; a metre is near enough the same at
   this scale. */

(function (root) {
  const ALL = ['GK', 'Back', 'Mid', 'Wing', 'Forward'];
  const OUTFIELD = ['Back', 'Mid', 'Wing', 'Forward'];

  /* Where a drill sits in a practice. The order is the order a session runs in:
     the builder will suggest a warm-up, then one or two practices, then a game,
     which is the play-practice-play shape most federations teach. */
  const TYPES = {
    warmup: 'Warm-up',
    technical: 'Technique',
    opposed: 'Opposed practice',
    game: 'Small-sided game',
    setpiece: 'Set pieces',
    keeper: 'Goalkeeping',
    cooldown: 'Cool-down'
  };

  /* The four moments of a game. Transitions are separate on purpose. A team
     that keeps losing goals in the seconds after losing the ball needs a
     different drill from one that is beaten in a settled defence, and the stats
     will eventually be able to tell those two apart. */
  const MOMENTS = {
    attack: 'In possession',
    defend: 'Out of possession',
    toAttack: 'Winning it back',
    toDefend: 'Losing it'
  };

  const SKILLS = {
    'ball-mastery': 'Ball mastery',
    dribbling: 'Dribbling',
    turning: 'Turning',
    'first-touch': 'First touch',
    shielding: 'Shielding',
    passing: 'Passing',
    'long-passing': 'Long passing',
    combination: 'Combination play',
    shooting: 'Shooting',
    crossing: 'Crossing',
    heading: 'Heading',
    '1v1-attack': '1v1 attacking',
    '1v1-defend': '1v1 defending',
    pressing: 'Pressing',
    scanning: 'Scanning',
    movement: 'Movement off the ball',
    communication: 'Communication',
    'decision-making': 'Decision making',
    shape: 'Team shape',
    'set-pieces': 'Set pieces',
    'throw-ins': 'Throw-ins',
    handling: 'Handling',
    diving: 'Diving',
    distribution: 'Distribution',
    angles: 'Angles and positioning'
  };

  /* The principles of play, the vocabulary most coaching courses use. The point
     of tagging them is that "we can't get out of our own half" and "we're
     always outnumbered at the back" are principle problems before they are
     skill problems. */
  const PRINCIPLES = {
    penetration: 'Penetration',
    support: 'Support',
    width: 'Width',
    mobility: 'Mobility',
    creativity: 'Creativity',
    pressure: 'Pressure',
    cover: 'Cover',
    balance: 'Balance',
    compactness: 'Compactness',
    delay: 'Delay'
  };

  const PHYSICAL = {
    agility: 'Agility',
    speed: 'Speed',
    endurance: 'Endurance',
    coordination: 'Coordination',
    balance: 'Balance',
    strength: 'Strength'
  };

  /* So a session can add up what to bring. `balls: 'each'` means one per
     player, and the builder multiplies it by the squad. */
  const KIT = {
    balls: 'Balls',
    cones: 'Cones',
    bibs: 'Bibs',
    minigoals: 'Mini goals',
    goals: 'Goals',
    poles: 'Poles',
    hurdles: 'Hurdles',
    ladder: 'Agility ladder',
    mats: 'Mats'
  };

  const LEVELS = { 1: 'Starting out', 2: 'Developing', 3: 'Advanced' };
  const INTENSITY = { 1: 'Easy', 2: 'Moderate', 3: 'Hard' };

  /* What the game numbers can say needs work, worded the way a coach would put
     it. Every key here is something the app already records: shots and whether
     they were on target, goals with their scorer, assist and minute,
     possession when it's tracked, and the set-piece and foul tallies.

     This is the bridge to the AI helper, and it comes before any AI. A drill
     says which of these it answers, so "you're getting out-shot, here are four
     drills for that" is a lookup the app can do by itself, as plainly as the
     game planner does its sums. The prompt gets the same signals later, so a
     model starts from the numbers rather than guessing at them. Thresholds
     belong in TRAINING.md, not here: they're a coaching judgement and will move. */
  const SIGNALS = {
    'few-shots': {
      label: 'We create few chances',
      means: 'Fewer shots than the other team, game after game.',
      from: 'Shots per game, ours against theirs, over recent games.'
    },
    'off-target': {
      label: 'Our shots miss the target',
      means: 'Plenty of shots, too few making the keeper work.',
      from: 'Share of our shots on target (goals count as on target).'
    },
    'one-scorer': {
      label: 'Goals come from one or two players',
      means: 'If they are marked out of a game, nobody else scores.',
      from: 'Share of our goals scored by the top scorer.'
    },
    'solo-goals': {
      label: 'Goals rarely come from a pass',
      means: 'Most goals are solo runs or scrambles rather than built.',
      from: 'Share of our goals that have an assist recorded.'
    },
    possession: {
      label: 'We give the ball away quickly',
      means: 'Little time on the ball, a lot of chasing.',
      from: 'Possession share, only where the team tracks it.'
    },
    'shots-against': {
      label: 'They get lots of shots',
      means: 'The other team gets to our goal too easily.',
      from: 'Opponent shots per game.'
    },
    conceding: {
      label: 'We concede too many',
      means: 'More goals against than for, or a run of heavy defeats.',
      from: 'Goals against per game, and goal difference.'
    },
    'late-goals': {
      label: 'Goals go in late',
      means: 'We fade. Fitness, concentration, or rotation that leaves a tired side out.',
      from: 'Share of goals conceded in the last quarter of games.'
    },
    'corners-against': {
      label: 'They win lots of corners',
      means: 'We give up corners, or concede from them.',
      from: 'Opponent corners per game, and goals conceded soon after one.'
    },
    fouls: {
      label: 'We give away fouls',
      means: 'Diving into tackles rather than defending on our feet.',
      from: 'Fouls given away per game.'
    },
    'throw-ins': {
      label: 'Throw-ins come up a lot',
      means: 'A restart that happens this often is worth practising.',
      from: 'Throw-ins per game.'
    }
  };

  const DRILLS = [

    /* ---------------- warm-ups ---------------- */

    {
      id: 'ball-mastery-box', v: 1, name: 'Ball mastery box', type: 'warmup',
      summary: 'Everyone with a ball in a square, working through sole rolls, toe taps and turns on the coach\'s call.',
      ages: [5, 19], level: 1, players: { min: 1, best: 12, max: 24 }, gk: 0, minutes: [8, 15], intensity: 2,
      space: [20, 20], kit: { balls: 'each', cones: 4 },
      positions: ALL, skills: ['ball-mastery', 'dribbling', 'first-touch'], principles: ['creativity'],
      moments: ['attack'], physical: ['coordination', 'agility'],
      setup: 'A 20 × 20 yd square and a ball each. Size it so they have room but still have to look up to miss each other.',
      how: [
        'Players dribble freely inside the square.',
        'Every 20 to 30 seconds the coach calls a move: toe taps, sole rolls side to side, pull-push, inside-outside, step on and go.',
        'On "Turn!" everyone changes direction with a move of their choice. On "Freeze!" they stop the ball dead with the sole.',
        'Finish with a minute of "most touches", each player counting their own.'
      ],
      points: [
        'Small touches. The ball is never more than a step away.',
        'Both feet, every surface: sole, inside, outside, laces.',
        'Eyes up between touches. See the space, not the ball.',
        'Knees bent, weight on the balls of the feet.'
      ],
      questions: [
        'Which foot did you use least? Can you do the next move with that one?',
        'How do you find the space if you are looking at the ball?'
      ],
      mistakes: [
        'Big touches that leave the ball behind: shrink the square.',
        'Standing tall and flat-footed: call "low and quick".'
      ],
      why: 'Hundreds of touches in ten minutes. A player who is comfortable on the ball can look up in a game instead of at her feet, and every other drill builds on that.',
      easier: ['A bigger square and fewer moves. Walk each move through first.', 'For the youngest, make it a story: the ball is a puppy on a short lead.'],
      harder: ['Shrink the square, or add a defender who steals balls.', 'Hold up fingers; players shout the number, which forces their eyes up.', 'Weaker foot only for the last two minutes.'],
      signals: ['possession'], goesWith: ['through-the-gates', 'sharks-and-minnows'], tags: ['no-prep', 'every-session']
    },

    {
      id: 'through-the-gates', v: 1, name: 'Through the gates', type: 'warmup',
      summary: 'Dribble through as many little cone gates as you can in a minute, never the same gate twice in a row.',
      ages: [5, 12], level: 1, players: { min: 4, best: 12, max: 20 }, gk: 0, minutes: [8, 15], intensity: 2,
      space: [30, 30], kit: { balls: 'each', cones: 20 },
      positions: ALL, skills: ['dribbling', 'scanning', 'ball-mastery'], principles: [],
      moments: ['attack'], physical: ['agility'],
      setup: 'Scatter 8 to 10 gates, each two cones about 2 yd apart, around a 30 × 30 yd area. A ball each.',
      how: [
        'On "Go", players dribble through as many gates as they can in 60 seconds.',
        'You cannot go through the same gate twice in a row.',
        'Rest 30 seconds, then go again and try to beat your score.',
        'Add rules each round: enter with the left foot, stop the ball in the gate, turn out of the gate the way you came.'
      ],
      points: [
        'Look for the next gate before you go through this one.',
        'Speed up between gates, slow down to go through.',
        'Keep the ball close in traffic.'
      ],
      questions: ['How did you choose your next gate?', 'What did you do when someone else was heading for your gate?'],
      mistakes: ['Head down and crashing into each other: call "eyes up" and count collisions as minus one.'],
      why: 'Dribbling with a change of pace, under the light pressure of a crowd, while having to look up and decide. That is what a youth game asks of a player with the ball.',
      easier: ['Fewer gates, wider gates, no time limit.'],
      harder: ['In pairs, passing through the gates instead of dribbling.', 'Two or three defenders guard gates; through a guarded gate is two points.'],
      signals: [], goesWith: ['ball-mastery-box', 'pass-and-follow'], tags: ['no-prep']
    },

    {
      id: 'sharks-and-minnows', v: 1, name: 'Sharks and minnows', type: 'warmup',
      summary: 'Minnows dribble across the pond; sharks try to knock their balls out. Caught minnows become sharks.',
      ages: [5, 10], level: 1, players: { min: 6, best: 14, max: 24 }, gk: 0, minutes: [8, 15], intensity: 3,
      space: [25, 30], kit: { balls: 'each', cones: 4 },
      positions: ALL, skills: ['dribbling', 'shielding', 'scanning'], principles: [],
      moments: ['attack', 'defend'], physical: ['speed', 'agility'],
      setup: 'A rectangle about 25 × 30 yd. Every minnow has a ball and starts on one end line. One or two sharks, without a ball, in the middle.',
      how: [
        'On "Swim!", minnows dribble to the far end line without losing their ball.',
        'Sharks try to kick balls out of the area. A minnow whose ball goes out becomes a shark.',
        'Last minnow standing wins; she starts as a shark next round.'
      ],
      points: [
        'Keep your body between the shark and the ball.',
        'Change of pace and direction beats a shark, not straight-line speed.',
        'Look up before you set off, and pick the gap.'
      ],
      questions: ['What did you do when a shark came straight at you?', 'Was it better to go early, or wait?'],
      mistakes: ['Minnows kicking the ball long and chasing it: the sharks love that. Reward dribbles that stay close.'],
      why: 'Dribbling under real pressure, wrapped in a game young players ask to play again. It hides a lot of shielding and changing direction.',
      easier: ['Caught minnows become seaweed: they stand still and can only tag with a foot.'],
      harder: ['Sharks also dribble a ball, so they defend while keeping their own.', 'Score a point only by stopping the ball dead on the far line.'],
      signals: ['possession'], goesWith: ['ball-mastery-box', 'line-soccer'], tags: ['fun', 'young']
    },

    {
      id: 'coach-says', v: 1, name: 'Coach says', type: 'warmup',
      summary: 'Dribble around; stop the ball with whatever body part the coach calls, but only if "Coach says".',
      ages: [4, 8], level: 1, players: { min: 1, best: 10, max: 16 }, gk: 0, minutes: [5, 10], intensity: 2,
      space: [20, 20], kit: { balls: 'each', cones: 4 },
      positions: ALL, skills: ['ball-mastery', 'dribbling'], principles: [],
      moments: ['attack'], physical: ['coordination', 'balance'],
      setup: 'A small square and a ball each.',
      how: [
        'Everyone dribbles around the square.',
        'The coach calls "Coach says knee!", and players stop the ball and put a knee on it. Elbow, bottom, nose, hand: anything goes.',
        'If the coach leaves off "Coach says", anyone who stops does five toe taps before rejoining. Nobody is ever out.'
      ],
      points: ['Soft touches so the ball is close enough to stop quickly.', 'Listen while you dribble: head up.'],
      questions: ['How did you keep the ball close enough to stop it fast?'],
      mistakes: ['Long kicks then a chase: shrink the square.'],
      why: 'For the youngest, touches and listening while moving is the whole job. This gets both without a single line of waiting players.',
      easier: ['Walk, then jog.'],
      harder: ['Call moves as well as body parts: "Coach says pull back!"', 'Weaker foot only.'],
      signals: [], goesWith: ['sharks-and-minnows', '3v3-small-sided'], tags: ['fun', 'young', 'no-prep']
    },

    {
      id: 'red-light-green-light', v: 1, name: 'Red light, green light', type: 'warmup',
      summary: 'Dribble on green, slow down on yellow, stop the ball dead on red. Change of pace for the youngest.',
      ages: [4, 8], level: 1, players: { min: 1, best: 10, max: 16 }, gk: 0, minutes: [5, 10], intensity: 2,
      space: [20, 25], kit: { balls: 'each', cones: 4 },
      positions: ALL, skills: ['dribbling', 'ball-mastery'], principles: [],
      moments: ['attack'], physical: ['speed', 'balance'],
      setup: 'A start line and a finish line about 25 yd apart. A ball each, everyone on the start line.',
      how: [
        '"Green!": dribble towards the finish line. "Yellow!": slow, tiny touches. "Red!": stop the ball dead with the sole.',
        'Anyone whose ball is still rolling on red takes three steps back. Nobody goes back to the start.',
        'Add colours as they get it: "Purple!" means turn round, "Blue!" means switch feet.'
      ],
      points: ['Small touches so you can stop it quickly.', 'Sole of the foot on top of the ball to stop it.'],
      questions: ['Why is it easier to stop when the ball is close?'],
      mistakes: ['Kicking it ahead on green and chasing it: they find out on the next red.'],
      why: 'Speeding up and slowing down with the ball is the heart of dribbling, and the youngest learn it best as a game they already know.',
      easier: ['Walking pace only, no going back.'],
      harder: ['Weaker foot only.', 'The coach turns round to call red, and anyone still moving goes back.'],
      signals: [], goesWith: ['coach-says', 'hungry-hippos'], tags: ['fun', 'young', 'no-prep']
    },

    {
      id: 'injury-prevention-warmup', v: 1, name: 'Injury-prevention warm-up', type: 'warmup',
      summary: 'Fifteen minutes of running, strength, balance and landing work that has been shown to cut injuries when done twice a week.',
      ages: [8, 19], level: 1, players: { min: 1, best: 14, max: 30 }, gk: 0, minutes: [12, 20], intensity: 2,
      space: [20, 30], kit: { cones: 12, balls: 6 },
      positions: ALL, skills: [], principles: [],
      moments: [], physical: ['strength', 'balance', 'coordination', 'agility'],
      setup: 'Two lines of six cones about 30 yd long, 5 yd apart. Players work in pairs across from each other.',
      how: [
        'Running: jog out and back with hip openers, hip closers, side shuffles, and shoulder contact with a partner at mid-point.',
        'Strength: front plank and side plank, 20 to 30 seconds each; squats; walking lunges; Nordic hamstring lowers for older players, with a partner holding the ankles.',
        'Balance: single-leg stand, passing a ball to a partner, then on the other leg.',
        'Landing: jump and land softly on two feet, then on one, knees over toes.',
        'Running again: accelerate to 80% and plant to change direction.'
      ],
      points: [
        'Knees over toes on every landing and squat. Never let a knee cave inwards.',
        'Quality first. Fewer good reps beat lots of sloppy ones.',
        'Land quietly: soft knees, soft hips.'
      ],
      questions: ['Where should your knee point when you land?'],
      mistakes: ['Knees falling inwards on landings and squats: slow down and fix it before adding speed.'],
      why: 'Programmes built this way, FIFA 11+ the best known of them, have been shown to cut injuries in youth players when done at least twice a week, knee injuries in girls especially. It doubles as a full warm-up.',
      easier: ['For under-10s, turn the strength part into animal walks: bear crawl, crab walk, frog jumps.'],
      harder: ['Longer holds, more Nordic reps, single-leg hops in four directions.'],
      safety: 'Teach the landing before adding speed or height. Stop anyone whose knees cave in and walk them through it.',
      signals: ['late-goals'], goesWith: ['pass-and-follow', 'rondo-4v1'], tags: ['every-session', 'injury-prevention']
    },

    {
      id: 'pass-and-follow', v: 1, name: 'Pass and follow', type: 'warmup',
      summary: 'Two lines facing each other: pass across, follow your pass to the back of the other line.',
      ages: [7, 19], level: 1, players: { min: 4, best: 8, max: 12 }, gk: 0, minutes: [8, 12], intensity: 2,
      space: [5, 15], kit: { balls: 2, cones: 2 },
      positions: ALL, skills: ['passing', 'first-touch'], principles: ['support'],
      moments: ['attack'], physical: [],
      setup: 'Two cones 10 to 15 yd apart, a line of players behind each, a ball at the front of one line. Two groups if you have more than eight.',
      how: [
        'The first player passes to the front of the other line and jogs after her pass to join the back of that line.',
        'The receiver controls it, then passes back across and follows.',
        'Two-touch to start, then one-touch.',
        'Add a cone a yard in front of each line: the receiver touches the ball around it before passing.'
      ],
      points: [
        'Inside of the foot, ankle locked, standing foot pointing at the target.',
        'First touch out of your feet, towards where you go next.',
        'Pass to the receiver\'s stronger foot, or to the foot she asks for.'
      ],
      questions: ['Which foot should you receive with so the next pass is easy?'],
      mistakes: ['Toe-pokes: show the inside-foot surface and slow it down.', 'Standing still to receive: step into the ball.'],
      why: 'Clean passing and a first touch that sets up the next touch are what keep the ball for a team. Short lines mean lots of repetitions.',
      easier: ['Shorter distance, two touches, a stop then a pass.'],
      harder: ['Longer distance, one-touch, weaker foot only.', 'Third line in a triangle so the receiver has to open her body.'],
      signals: ['possession', 'solo-goals'], goesWith: ['passing-diamond', 'rondo-4v1'], tags: ['no-prep']
    },

    {
      id: 'rondo-4v1', v: 1, name: 'Rondo 4v1', type: 'warmup',
      summary: 'Four players round a square keep the ball from one defender in the middle.',
      ages: [8, 19], level: 1, players: { min: 5, best: 10, max: 20 }, gk: 0, minutes: [8, 15], intensity: 2,
      space: [10, 10], kit: { balls: 2, cones: 4, bibs: 4 },
      positions: ALL, skills: ['passing', 'first-touch', 'scanning', 'pressing'], principles: ['support', 'pressure'],
      moments: ['attack', 'toDefend'], physical: [],
      setup: 'A 10 × 10 yd square, four attackers on the sides and one defender inside. Two squares if you have ten.',
      how: [
        'The four keep the ball away from the defender, two touches max.',
        'When the defender touches the ball or it leaves the square, whoever lost it swaps into the middle.',
        'Count passes. Ten in a row is a point, and a pass between two defenders\' legs counts double later on.'
      ],
      points: [
        'Always give the passer two options: move along your side to open an angle.',
        'Open your body so you can see the next pass before the ball arrives.',
        'Defender: curve your run to cut off one pass, then win the next.'
      ],
      questions: ['Where do you stand so the passer can always find you?', 'Defender: which pass did you take away?'],
      mistakes: ['Receivers standing in a corner behind the defender: walk them to where the angle is open.'],
      why: 'The drill professional teams use more than any other, and for good reason: angles, body shape and quick passes, plus a defender learning to press. It is short, intense and endlessly adjustable.',
      easier: ['Bigger square, unlimited touches, or 5v1.'],
      harder: ['One touch.', 'Smaller square.', 'Move to the 5v2 rondo.'],
      signals: ['possession'], goesWith: ['rondo-5v2', 'keep-away-4v4-plus-2'], tags: ['classic']
    },

    {
      id: 'dribble-relays', v: 1, name: 'Dribbling relays', type: 'warmup',
      summary: 'Teams in lines race a ball round a slalom and back, with a new rule each round.',
      ages: [5, 11], level: 1, players: { min: 6, best: 12, max: 24 }, gk: 0, minutes: [8, 12], intensity: 3,
      space: [15, 20], kit: { balls: 4, cones: 24 },
      positions: ALL, skills: ['dribbling', 'ball-mastery', 'turning'], principles: [],
      moments: ['attack'], physical: ['speed', 'agility'],
      setup: 'Three or four lines side by side. In front of each, a slalom of five cones 2 yd apart and a turning cone at the end.',
      how: [
        'First player in each line dribbles through the slalom, round the end cone and straight back, and hands over by stopping the ball for the next player.',
        'First team finished sits down.',
        'New rule each round: right foot only, left foot only, sole rolls only, a turn at the end cone instead of going round it.'
      ],
      points: ['Small touches through the cones, then a big touch and sprint on the way back.', 'Look up to see the next cone.'],
      questions: ['Where can you go fast, and where do you need small touches?'],
      mistakes: ['Skipping cones to win: knocking one over or missing one means going back to the start.'],
      why: 'Competition makes players dribble at speed, which is where technique breaks down. Short lines keep it from becoming a queue.',
      easier: ['Wider cones, no racing for the first round.'],
      harder: ['Weaker foot only.', 'Add a pass to the next player from a line instead of a handover.'],
      signals: [], goesWith: ['turns-station'], tags: ['fun', 'young']
    },

    /* ---------------- technique ---------------- */

    {
      id: 'passing-diamond', v: 1, name: 'Passing diamond', type: 'technical',
      summary: 'Four cones in a diamond: pass, set back, and play round the corner. Give-and-goes and third-man runs, unopposed.',
      ages: [10, 19], level: 2, players: { min: 5, best: 8, max: 10 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [20, 20], kit: { balls: 2, cones: 4 },
      positions: OUTFIELD, skills: ['passing', 'first-touch', 'combination', 'movement'], principles: ['support', 'mobility'],
      moments: ['attack'], physical: [],
      setup: 'Four cones in a diamond, 15 yd from each to the next. Two players at the start cone, one at each of the others.',
      how: [
        'Basic: pass to the next cone, follow your pass.',
        'Give-and-go: A passes to B, B sets it back to A, A plays to C. Everyone moves one cone on.',
        'Third man: A to B, B sets it back, A plays long to C, and B spins to receive from C.',
        'Change direction every two minutes so both feet get the work.'
      ],
      points: [
        'The lay-off is firm and to the front foot, so the next pass can be one-touch.',
        'Check away before you check to the ball. Make a yard first.',
        'Receive on the back foot, half-turned, so you can see where it goes next.'
      ],
      questions: ['When is a lay-off better than turning?', 'What did you see before the ball came to you?'],
      mistakes: ['Everyone standing on their cone until the ball arrives: insist on a check away every time.'],
      why: 'These are the patterns that move a team through midfield. Rehearsing them unopposed means players recognise them when a game offers one.',
      easier: ['Two touches, shorter sides, the basic pattern only.'],
      harder: ['One touch throughout.', 'A passive defender in the middle who can intercept a slow pass.'],
      signals: ['possession', 'solo-goals'], goesWith: ['pass-and-follow', 'keep-away-4v4-plus-2'], tags: []
    },

    {
      id: 'open-up-and-turn', v: 1, name: 'Open up and turn', type: 'technical',
      summary: 'Receive half-turned from a server, check the shoulder, turn and play through a gate on the far side.',
      ages: [8, 19], level: 2, players: { min: 3, best: 6, max: 12 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [15, 25], kit: { balls: 6, cones: 8, bibs: 2 },
      positions: ['Back', 'Mid', 'Forward'], skills: ['first-touch', 'turning', 'scanning'], principles: ['penetration'],
      moments: ['attack'], physical: [],
      setup: 'A server at one end, a receiver in the middle, and two cone gates 2 yd wide at the far end, one left and one right.',
      how: [
        'The receiver checks away, then shows for the ball and glances over her shoulder before it arrives.',
        'She receives across her body on the back foot and turns to play through either gate.',
        'Then she becomes the server. Rotate every five turns.',
        'Add a passive defender behind; she calls which gate is open.'
      ],
      points: [
        'Look over your shoulder before the ball comes, not when it arrives.',
        'Open your hips. Side-on means you see both ends.',
        'Let the ball run across you and take it with the foot furthest from the server.'
      ],
      questions: ['What did you see behind you before the ball came?', 'When should you not turn?'],
      mistakes: ['Receiving square-on with the front foot, then having to turn all the way round: check the hips.'],
      why: 'A midfielder who can receive and face forward in one touch beats a press without dribbling at anyone. It is the single biggest jump between a player who keeps the ball and one who loses it.',
      easier: ['No gates, just turn and dribble out. Pass in by hand.'],
      harder: ['A live defender behind.', 'The server shouts "Turn!" or "Man on!", and the receiver turns or lays it off.'],
      signals: ['possession'], goesWith: ['shoulder-check-colours', 'keep-away-4v4-plus-2'], tags: []
    },

    {
      id: 'shoulder-check-colours', v: 1, name: 'Shoulder-check colours', type: 'technical',
      summary: 'A coach behind the receiver holds up a colour. She has to see it and shout it before the ball arrives, then play to that colour.',
      ages: [9, 19], level: 2, players: { min: 3, best: 6, max: 10 }, gk: 0, minutes: [8, 12], intensity: 1,
      space: [20, 20], kit: { balls: 4, cones: 12 },
      positions: ['Back', 'Mid'], skills: ['scanning', 'first-touch', 'decision-making'], principles: [],
      moments: ['attack'], physical: [],
      setup: 'A receiver in the middle, a server in front of her, and three gates behind her, each marked with a different colour of cone. The coach stands behind with spare cones.',
      how: [
        'As the server passes, the coach holds up one colour.',
        'The receiver checks her shoulder, shouts the colour before her first touch, then turns and passes through that gate.',
        'Five reps, then swap.'
      ],
      points: ['Look early. The look happens while the ball is travelling, not once it has arrived.', 'Two looks are better than one.'],
      questions: ['When was the best moment to look?'],
      mistakes: ['Looking only after receiving: delay holding up the colour so the early look is the only way to get it.'],
      why: 'Scanning is the skill top midfielders do most and coaches coach least, because it is invisible. This makes it visible and countable.',
      easier: ['Hold the colour up for longer.'],
      harder: ['The coach changes the colour mid-pass.', 'A passive defender stands in front of one gate, which then counts as closed.'],
      signals: ['possession'], goesWith: ['open-up-and-turn', 'rondo-5v2'], tags: []
    },

    {
      id: 'turns-station', v: 1, name: 'Turns station', type: 'technical',
      summary: 'Dribble at a line, turn on the coach\'s call (Cruyff, drag back, hook) and accelerate away.',
      ages: [6, 14], level: 1, players: { min: 1, best: 10, max: 20 }, gk: 0, minutes: [8, 12], intensity: 2,
      space: [20, 15], kit: { balls: 'each', cones: 10 },
      positions: OUTFIELD, skills: ['turning', 'dribbling', 'ball-mastery'], principles: [],
      moments: ['attack'], physical: ['agility'],
      setup: 'Two parallel lines of cones about 12 yd apart. Players start on one line with a ball each.',
      how: [
        'Dribble towards the far line. At the line, turn and come back.',
        'The coach names the turn: drag back, inside hook, outside hook, Cruyff, step-over turn.',
        'Then free choice. Can they use a different turn every time?'
      ],
      points: [
        'Slow down into the turn and explode out of it.',
        'Get your body between the "defender" (the line) and the ball.',
        'After the turn, the first touch goes forward and away.'
      ],
      questions: ['Which turn is best when a defender is right behind you?'],
      mistakes: ['Turning at full speed and losing the ball: slow in, fast out.'],
      why: 'A player who can change direction escapes pressure instead of losing the ball. Every turn practised here shows up as a ball kept on Saturday.',
      easier: ['Walk through each turn first. One turn per round.'],
      harder: ['A defender follows each player and tries to tag her after the turn.', 'Weaker foot only.'],
      signals: ['possession'], goesWith: ['1v1-moves', 'shielding-battles'], tags: []
    },

    {
      id: '1v1-moves', v: 1, name: '1v1 moves', type: 'technical',
      summary: 'Learn a move to beat a defender (scissors, step-over, body feint) on a cone, then on a passive defender, then live.',
      ages: [7, 19], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [20, 25], kit: { balls: 'each', cones: 10 },
      positions: ['Mid', 'Wing', 'Forward'], skills: ['1v1-attack', 'dribbling'], principles: ['creativity', 'penetration'],
      moments: ['attack'], physical: ['agility'],
      setup: 'A row of cones as "defenders", one per pair of players, 10 yd in front of a start line.',
      how: [
        'Dribble at the cone. Two yards out, do the move of the day, then explode past.',
        'One move per week to start: body feint, scissors, step-over, the Matthews, la croqueta.',
        'Swap the cone for a passive partner who sways with the move, then a live one in a channel.'
      ],
      points: [
        'Attack the defender at speed. A move from standing beats nobody.',
        'Sell it with your shoulders. The defender watches your body, not your feet.',
        'The burst after the move is the real move.'
      ],
      questions: ['Which way did the defender lean? Which way did you go?'],
      mistakes: ['Doing the move too far away, so the defender never reacts: two yards, not five.'],
      why: 'Players who have a move, and the nerve to use it, break lines no pass can. It makes a team dangerous from more than one player.',
      easier: ['Walk the move, then jog it. Cones only.'],
      harder: ['Live 1v1 in a narrow channel.', 'A move with each foot.'],
      signals: ['one-scorer', 'few-shots'], goesWith: ['1v1-to-mini-goals', 'turns-station'], tags: []
    },

    {
      id: 'juggling-ladder', v: 1, name: 'Juggling ladder', type: 'technical',
      summary: 'A ladder of juggling levels, from bounce-and-catch to alternate feet, with personal bests.',
      ages: [7, 19], level: 1, players: { min: 1, best: 12, max: 30 }, gk: 0, minutes: [5, 10], intensity: 1,
      space: [20, 20], kit: { balls: 'each' },
      positions: ALL, skills: ['first-touch', 'ball-mastery'], principles: [],
      moments: ['attack'], physical: ['coordination', 'balance'],
      setup: 'A ball each, spread out.',
      how: [
        'Level 1: drop, one kick, catch. Level 2: drop, one kick, bounce, kick, catch. Level 3: kicks with no bounce.',
        'Level 4: alternate feet. Level 5: add thighs. Level 6: foot, thigh, foot, never the same surface twice.',
        'Each player keeps her own best and tries to beat it every week.'
      ],
      points: ['Ankle locked, toes slightly up, soft touch.', 'Small kicks no higher than the waist.'],
      questions: ['What makes the ball spin back at you?'],
      mistakes: ['Toe-poking the ball high: lock the ankle and use the laces.'],
      why: 'Juggling builds the feel for a ball that a first touch relies on. It is also the best homework there is: one ball and a back garden.',
      easier: ['Catch after every kick.'],
      harder: ['Juggle while walking to a cone and back.', 'In pairs, passing by juggling.'],
      signals: [], goesWith: [], tags: ['homework', 'no-prep']
    },

    {
      id: 'driven-passes', v: 1, name: 'Driven and lofted passes', type: 'technical',
      summary: 'Pairs 25 to 40 yd apart strike driven passes along the ground, then lofted ones, and control them.',
      ages: [11, 19], level: 2, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [30, 40], kit: { balls: 6, cones: 10 },
      positions: ['GK', 'Back', 'Mid'], skills: ['long-passing', 'first-touch'], principles: ['width'],
      moments: ['attack'], physical: [],
      setup: 'Pairs facing each other across 25 yd to start, each with a ball. Space the pairs out sideways.',
      how: [
        'Driven pass: along the ground, firm, to your partner\'s feet. Ten each.',
        'Lofted pass: in the air to land at your partner\'s feet. Ten each.',
        'Move back to 35 or 40 yd as it gets cleaner.',
        'Control with one touch out to the side, then strike back.'
      ],
      points: [
        'Approach at a slight angle. Plant your standing foot beside and a little behind the ball.',
        'Laces, ankle locked. Driven: strike through the middle and land on your kicking foot. Lofted: strike lower and lean back slightly.',
        'Look up at the target before you strike, not during.'
      ],
      questions: ['What changed between the pass that flew and the one that skidded?'],
      mistakes: ['Leaning back on a driven pass and skying it: head over the ball.'],
      why: 'Switching play and finding a forward over the top are how a team escapes a crowded side. Most youth players can\'t pass 30 yd accurately until they have practised this.',
      easier: ['Closer, a stationary ball, and a big target such as a gate.'],
      harder: ['Weaker foot.', 'Hit a moving target as your partner runs across.'],
      signals: ['possession'], goesWith: ['four-goal-game', 'build-out-play'], tags: []
    },

    {
      id: 'heading-basics', v: 1, name: 'Heading basics', type: 'technical',
      summary: 'Heading technique from a hand-tossed light ball: forehead, eyes open, neck firm. Low numbers of headers, kept that way.',
      ages: [12, 19], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [5, 10], intensity: 1,
      space: [20, 20], kit: { balls: 6 },
      positions: ['Back', 'Mid', 'Forward'], skills: ['heading'], principles: [],
      moments: ['attack', 'defend'], physical: ['coordination'],
      setup: 'Pairs 3 to 5 yd apart, one ball per pair. Use a light or slightly deflated ball to start.',
      how: [
        'Kneeling: partner tosses underhand, header back into the partner\'s hands.',
        'Standing: same, then step into it.',
        'Jumping: a soft toss a little higher, take off from one foot.',
        'Stop well before players tire. A handful of headers each is plenty.'
      ],
      points: [
        'Forehead, at the hairline. Never the top of the head.',
        'Eyes open, mouth closed, neck firm.',
        'Attack the ball. Don\'t let it hit you.'
      ],
      questions: ['Where on your head did that one hit?'],
      mistakes: ['Shutting eyes and flinching: go back to kneeling and slower tosses.'],
      why: 'Older players will head the ball in games, and those who have never been taught do it worst, and least safely.',
      easier: ['Catch the toss on the forehead and let it drop, with no heading action at all.'],
      harder: ['Defensive headers: high and far. Attacking headers: down at a target.'],
      safety: 'US Soccer does not allow heading for players aged 10 and under, and limits heading practice for ages 11 to 13 to about 30 minutes a week and 15 to 20 headers per player. The FA keeps heading out of training for primary-school-age children. Follow your own federation\'s current rules, use a light ball, and stop anyone who looks dazed or has a headache.',
      signals: ['corners-against'], goesWith: ['defending-corners'], tags: ['check-local-rules']
    },

    {
      id: 'crossing-and-finishing', v: 1, name: 'Crossing and finishing', type: 'technical',
      summary: 'A wide player gets to the byline and crosses; two attackers attack the near post and the far post.',
      ages: [10, 19], level: 2, players: { min: 5, best: 10, max: 14 }, gk: 1, minutes: [15, 20], intensity: 2,
      space: [44, 30], kit: { balls: 12, cones: 8, goals: 1 },
      positions: ['Wing', 'Forward', 'Back'], skills: ['crossing', 'shooting', 'movement'], principles: ['width', 'penetration'],
      moments: ['attack'], physical: [],
      setup: 'A goal with a keeper, a wide channel on each side marked by cones, a line of wide players in each channel, and a line of attackers at the top of the box.',
      how: [
        'The coach passes into the channel. The wide player dribbles towards the byline and crosses.',
        'Two attackers time their runs: one to the near post, one to the far post. Add a third for the cut-back spot.',
        'Alternate sides. Add a defender once the timing is right.'
      ],
      points: [
        'Attackers arrive late and at pace. Don\'t stand in the box and wait.',
        'Cross early into the space between the keeper and the defenders.',
        'The cut-back to the penalty spot is the best chance there is at youth level.'
      ],
      questions: ['Where did the ball go when you crossed it too high?', 'Who goes near post and who goes far?'],
      mistakes: ['Attackers running in a line to the same spot: assign near, far and cut-back.'],
      why: 'Width is how a team gets round a crowded middle, and crossing is what makes width count. It also gives wingers and full-backs a way to create goals other than a solo run.',
      easier: ['Cross from a stationary ball, no defenders.'],
      harder: ['Two defenders, and the wide player has to beat one first.', 'An overlapping full-back delivers the cross.'],
      signals: ['few-shots', 'solo-goals', 'one-scorer'], goesWith: ['overlap-2v1-wide', 'attacking-corners'], tags: []
    },

    {
      id: 'lay-off-and-shoot', v: 1, name: 'Lay-off and shoot', type: 'technical',
      summary: 'Pass into a server at the top of the box, take the lay-off first time, follow in for the rebound.',
      ages: [8, 19], level: 1, players: { min: 4, best: 8, max: 12 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 25], kit: { balls: 12, cones: 4, goals: 1 },
      positions: ['Forward', 'Mid', 'Wing'], skills: ['shooting', 'first-touch', 'combination'], principles: ['penetration'],
      moments: ['attack'], physical: [],
      setup: 'A goal with a keeper. A server just outside the box with her back to goal. A line of shooters 15 yd further out, each with a ball.',
      how: [
        'The shooter passes to the server, who lays it back into her path.',
        'The shooter strikes first time from the edge of the box and follows in for any rebound.',
        'Alternate shooting with the right foot and the left foot. Rotate the server every five shots.'
      ],
      points: [
        'Hit the target first: low and to the corners.',
        'Head over the ball, strike through the middle with the laces, land on your shooting foot.',
        'Across the keeper to the far post: a save there often comes back out to a teammate.',
        'Follow every shot in.'
      ],
      questions: ['Where do keepers find it hardest to save?', 'What happened when you leant back?'],
      mistakes: ['Blasting for the top corner and missing: count on target first, goals second.'],
      why: 'Shots that hit the target are what turn chances into goals, and youth keepers spill a lot of low ones. Lots of strikes in a short time, from the spot most goals come from.',
      easier: ['Shoot a stationary ball. Make the goal bigger or take the keeper out.'],
      harder: ['A defender chases from behind the shooter.', 'The server can lay off left or right, and the shooter reads it.'],
      signals: ['few-shots', 'off-target', 'one-scorer'], goesWith: ['turn-and-shoot', 'world-cup'], tags: ['finishing']
    },

    /* ---------------- opposed practice ---------------- */

    {
      id: 'rondo-5v2', v: 1, name: 'Rondo 5v2', type: 'opposed',
      summary: 'Five keep the ball from two. A pass that splits the two defenders counts double.',
      ages: [10, 19], level: 2, players: { min: 7, best: 7, max: 14 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [15, 15], kit: { balls: 4, cones: 4, bibs: 4 },
      positions: OUTFIELD, skills: ['passing', 'first-touch', 'scanning', 'pressing', 'communication'], principles: ['support', 'pressure', 'cover'],
      moments: ['attack', 'defend', 'toDefend'], physical: [],
      setup: 'A 15 × 15 yd square, five attackers round the outside (one can roam inside), two defenders in the middle.',
      how: [
        'The five keep the ball, two touches max.',
        'A defender who wins it swaps with whoever lost it. If they win it twice in a row, both swap.',
        'Count passes. A pass between the two defenders is two.'
      ],
      points: [
        'Attackers: two options for every pass, one short and one longer.',
        'Play away from pressure. Look for the split.',
        'Defenders: the first presses the ball, the second covers the split pass. Talk.'
      ],
      questions: ['Defenders: who goes, and who covers?', 'How do you open the split pass?'],
      mistakes: ['Defenders chasing together side by side: the split pass punishes it every time.'],
      why: 'It trains keeping the ball and winning it back together in one drill, with lots of decisions at speed. Two defenders force the pressure-and-cover partnership defending needs.',
      easier: ['Bigger square, three touches, 6v2.'],
      harder: ['One touch, smaller square.', 'Two squares side by side: the defending pair win it and pass it into the other square to score.'],
      signals: ['possession', 'shots-against'], goesWith: ['rondo-4v1', 'five-second-press'], tags: ['classic']
    },

    {
      id: '1v1-to-mini-goals', v: 1, name: '1v1 to mini goals', type: 'opposed',
      summary: 'Two lines, a coach serves, a live 1v1 for 30 seconds. The attacker scores in a mini goal, the defender counters.',
      ages: [6, 19], level: 1, players: { min: 4, best: 10, max: 14 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [10, 15], kit: { balls: 10, cones: 4, minigoals: 2, bibs: 6 },
      positions: OUTFIELD, skills: ['1v1-attack', '1v1-defend', 'dribbling', 'shielding'], principles: ['pressure', 'penetration'],
      moments: ['attack', 'defend', 'toAttack'], physical: ['speed', 'agility'],
      setup: 'A 10 × 15 yd grid with a mini goal at each end. Two lines of players beside the coach at halfway.',
      how: [
        'The coach plays a ball in. The first player from one line attacks, the first from the other defends.',
        'The attacker scores in the far mini goal. If the defender wins it, she attacks the other goal.',
        '30 seconds or a goal, then the next pair. Keep score by line.'
      ],
      points: [
        'Attacker: run at the defender with a first touch forward.',
        'Defender: close down fast, slow down in the last few yards, stay on your feet.',
        'Whoever wins it: go forward straight away.'
      ],
      questions: ['When did you try to beat her, and when did you protect the ball?'],
      mistakes: ['Long queues: run two grids, and keep the rounds short.'],
      why: 'Every game is decided by 1v1s, and this gives every player a dozen of them, both ways, under real pressure. It also builds the nerve to try.',
      easier: ['The defender starts further away, or two touches before the defender can engage.'],
      harder: ['Smaller grid, a time limit to score.', 'Make it 2v1, then 2v2.'],
      signals: ['fouls', 'one-scorer', 'few-shots'], goesWith: ['1v1-moves', 'jockey-channel'], tags: ['competitive']
    },

    {
      id: 'jockey-channel', v: 1, name: 'Jockey in a channel', type: 'opposed',
      summary: 'A defender delays an attacker down a narrow channel, showing her the outside and staying on her feet.',
      ages: [8, 19], level: 1, players: { min: 2, best: 8, max: 12 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [8, 25], kit: { balls: 6, cones: 8 },
      positions: ['Back', 'Mid', 'Wing'], skills: ['1v1-defend'], principles: ['pressure', 'delay'],
      moments: ['defend'], physical: ['agility'],
      setup: 'A channel 8 yd wide and 25 yd long. Attackers at one end with a ball, defenders at the other.',
      how: [
        'The defender passes to the attacker and closes her down.',
        'The attacker tries to dribble over the defender\'s end line. The defender scores by winning it, or by holding her up for six seconds.',
        'Swap roles every rep.'
      ],
      points: [
        'Close down fast, then brakes on in the last few yards.',
        'Side-on, knees bent, about an arm\'s length away.',
        'Show her down the line, onto her weaker foot.',
        'Tackle only when her touch is heavy. Patience wins it.'
      ],
      questions: ['When was the right moment to tackle?', 'Which way did you show her, and why?'],
      mistakes: ['Diving in and being beaten, or giving away a foul: count a dive-in as a point to the attacker.'],
      why: 'Defenders who stay on their feet concede fewer goals and fewer fouls. Delay buys time for teammates to get back, which is half of team defending.',
      easier: ['A narrower channel, and a walking attacker for the first few reps.'],
      harder: ['A wider channel.', 'The attacker has two mini goals to choose from.'],
      signals: ['fouls', 'conceding', 'shots-against'], goesWith: ['2v2-pressure-cover', '1v1-to-mini-goals'], tags: ['defending']
    },

    {
      id: '2v1-to-goal', v: 1, name: '2v1 to goal', type: 'opposed',
      summary: 'Two attackers against one defender and a keeper: draw the defender, then pass or shoot.',
      ages: [8, 19], level: 1, players: { min: 4, best: 10, max: 14 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [30, 30], kit: { balls: 10, cones: 6, goals: 1, bibs: 4 },
      positions: ['Mid', 'Wing', 'Forward', 'Back'], skills: ['combination', 'decision-making', 'passing', 'shooting'], principles: ['support', 'penetration', 'delay'],
      moments: ['attack', 'defend'], physical: [],
      setup: 'A goal with a keeper. Two lines of attackers 30 yd out, a line of defenders by the post.',
      how: [
        'The defender passes out to an attacker and comes to defend.',
        'The two attackers try to score. The defender tries to win it and dribble out over the halfway line.',
        'Rotate: attacker to defender, defender to the back of the attacking line.'
      ],
      points: [
        'The player on the ball dribbles at the defender to make her commit, then passes.',
        'Support player: stay wide enough to be found, level or slightly behind.',
        'Defender: get between them, delay, and make them decide early.'
      ],
      questions: ['When did you pass, and when did you keep it?', 'Defender: where did you stand to cover both?'],
      mistakes: ['Passing too early, so the defender just switches across: dribble until she commits.'],
      why: 'The simplest overload there is, and the decision under it (dribble, pass or wall pass) is behind most goals that come from a pass.',
      easier: ['A passive defender.'],
      harder: ['A recovering defender chases from behind (2v1 becomes 2v2).', 'Five seconds to score.'],
      signals: ['solo-goals', 'few-shots'], goesWith: ['3v2-waves', 'lay-off-and-shoot'], tags: []
    },

    {
      id: '2v2-pressure-cover', v: 1, name: '2v2: pressure and cover', type: 'opposed',
      summary: 'Defenders in pairs: one presses the ball, one covers, and they swap as the ball moves.',
      ages: [10, 19], level: 2, players: { min: 4, best: 8, max: 12 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [20, 25], kit: { balls: 8, cones: 6, minigoals: 2, bibs: 4 },
      positions: ['Back', 'Mid'], skills: ['1v1-defend', 'communication'], principles: ['pressure', 'cover', 'balance'],
      moments: ['defend'], physical: ['agility'],
      setup: 'A 20 × 25 yd grid. Two attackers at one end, two defenders at the other with two mini goals behind them.',
      how: [
        'The defenders pass in and close down.',
        'Attackers score in either mini goal. Defenders score by winning it and dribbling over the far line.',
        'Rounds of 45 seconds. Next pairs in.'
      ],
      points: [
        'First defender: pressure. Get close and slow her down.',
        'Second defender: cover at an angle, 3 to 5 yd behind, ready to step in.',
        'When the ball is passed, switch: the cover becomes the pressure.',
        'Talk: "I\'ve got ball!", "Cover!"'
      ],
      questions: ['How far from your partner should the cover be?', 'What happens when you both go to the ball?'],
      mistakes: ['Both defenders level and flat: one through-ball beats both. Walk them into the angle.'],
      why: 'Pressure and cover is the partnership every back line is built on. Learning it in pairs makes a back three or back four click later on.',
      easier: ['Attackers can only pass after one dribble, so defenders have time to set up.'],
      harder: ['3v3 with a covering and a balancing defender.', 'A goalkeeper and full-size goal.'],
      signals: ['conceding', 'shots-against'], goesWith: ['jockey-channel', 'numbers-down-defending'], tags: ['defending']
    },

    {
      id: '3v2-waves', v: 1, name: '3v2 waves', type: 'opposed',
      summary: 'Three attack two; when it ends, the two defenders break the other way against one recovering player.',
      ages: [10, 19], level: 2, players: { min: 8, best: 12, max: 16 }, gk: 2, minutes: [12, 18], intensity: 3,
      space: [40, 50], kit: { balls: 12, cones: 8, goals: 2, bibs: 6 },
      positions: OUTFIELD, skills: ['combination', 'decision-making', 'shooting', 'movement'], principles: ['penetration', 'width', 'support'],
      moments: ['attack', 'toAttack', 'toDefend'], physical: ['endurance', 'speed'],
      setup: 'Two goals with keepers about 50 yd apart. Groups waiting at each end line.',
      how: [
        'Three attackers break from one end against two defenders.',
        'As soon as the attack ends (goal, save or ball out), the two defenders attack the other goal against one player from the attackers who has to get back.',
        'A new three steps in at the far end, and the waves keep coming.'
      ],
      points: [
        'Attack at speed, and stretch the two defenders across the width.',
        'Commit a defender before the pass; finish early.',
        'Whoever loses it: sprint back immediately.'
      ],
      questions: ['How do you make two defenders cover three of you?', 'Who has to get back when you lose it?'],
      mistakes: ['Three attackers bunching in the middle: put two wide channels in with cones.'],
      why: 'Fast attacks against a defence that isn\'t set are where most youth goals come from, and so is getting caught out after losing the ball. This trains both, at game speed.',
      easier: ['3v1, then 3v2 with no wave back.'],
      harder: ['Six seconds to score.', '4v3 waves.'],
      signals: ['few-shots', 'solo-goals', 'late-goals'], goesWith: ['2v1-to-goal', 'six-second-counter'], tags: ['transition']
    },

    {
      id: 'shielding-battles', v: 1, name: 'Shielding battles', type: 'opposed',
      summary: 'In pairs inside a circle, one keeps the ball for 30 seconds while the other tries to win it.',
      ages: [7, 19], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [6, 10], intensity: 3,
      space: [10, 10], kit: { balls: 6, cones: 12 },
      positions: ['Forward', 'Mid', 'Wing'], skills: ['shielding', 'first-touch'], principles: [],
      moments: ['attack'], physical: ['strength', 'balance'],
      setup: 'Small circles of cones, about 5 yd across, one per pair.',
      how: [
        'The player with the ball keeps it inside the circle for 30 seconds.',
        'Her partner tries to knock it out. If she does, she gets the ball and the clock restarts.',
        'Most seconds kept over three rounds wins.'
      ],
      points: [
        'Body between the defender and the ball, side-on and low.',
        'Use the arm for balance and distance, not to push.',
        'Keep the ball on the foot furthest from the defender, and roll it with the sole.'
      ],
      questions: ['Where did you keep the ball when she came round your left side?'],
      mistakes: ['Facing the defender: turn side-on.'],
      why: 'Forwards with their back to goal and midfielders in traffic need to keep the ball until help arrives. Shielding is how a small player beats a big one.',
      easier: ['A bigger circle and a passive defender.'],
      harder: ['Shield, then turn and pass to a target outside the circle.'],
      signals: ['possession'], goesWith: ['turn-and-shoot', 'turns-station'], tags: ['no-prep']
    },

    {
      id: 'keep-away-4v4-plus-2', v: 1, name: 'Keep-away 4v4 + 2', type: 'opposed',
      summary: 'Two teams of four, plus two neutrals who always play with whoever has the ball. Five passes is a point.',
      ages: [10, 19], level: 2, players: { min: 10, best: 10, max: 14 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [25, 30], kit: { balls: 6, cones: 4, bibs: 10 },
      positions: OUTFIELD, skills: ['passing', 'first-touch', 'movement', 'scanning', 'pressing'], principles: ['support', 'mobility', 'pressure', 'compactness'],
      moments: ['attack', 'defend', 'toAttack', 'toDefend'], physical: ['endurance'],
      setup: 'A 25 × 30 yd grid. Two teams of four in bibs, two neutrals in a third colour.',
      how: [
        'The team in possession plus the neutrals (6v4) try to make five passes in a row for a point.',
        'When the defending team wins it, they become the team with the neutrals.',
        '2 or 3 minutes per round, then swap the neutrals.'
      ],
      points: [
        'Make the pitch big when you have it, small when you don\'t.',
        'Move after you pass. A pass and stand is a pass to nobody next time.',
        'Defending: press together and cut off the easy pass first.'
      ],
      questions: ['What did you do the moment you lost it?', 'How do you get free when you\'re marked?'],
      mistakes: ['Everyone crowding the ball: freeze play and show the space they left behind.'],
      why: 'The game\'s core in one drill: keep it as a team, win it back as a team, and switch instantly between the two.',
      easier: ['Three neutrals, a bigger grid, three passes for a point.'],
      harder: ['Two touches. Neutrals one touch.', 'Score by passing into a target player at either end after five passes.'],
      signals: ['possession', 'shots-against'], goesWith: ['rondo-5v2', 'end-zone-game'], tags: ['possession']
    },

    {
      id: 'five-second-press', v: 1, name: 'Five-second press', type: 'opposed',
      summary: 'A small-sided game where the team that loses the ball has five seconds to win it back for a bonus point.',
      ages: [11, 19], level: 3, players: { min: 8, best: 12, max: 16 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [30, 40], kit: { balls: 8, cones: 8, minigoals: 4, bibs: 8 },
      positions: OUTFIELD, skills: ['pressing', 'communication', 'decision-making'], principles: ['pressure', 'compactness', 'cover'],
      moments: ['toDefend', 'toAttack', 'defend'], physical: ['endurance', 'speed'],
      setup: 'A 30 × 40 yd pitch with two mini goals on each end line. 5v5 or 6v6.',
      how: [
        'Normal game into the mini goals.',
        'The moment a team loses the ball, the coach counts out loud to five. Winning it back inside five seconds scores a point.',
        'The team that just won it gets a point for surviving the five seconds or for completing three passes.'
      ],
      points: [
        'The nearest player presses straight away. The next two close the nearest passes.',
        'Press as a group. One player alone just gets passed round.',
        'If it doesn\'t come back in five seconds, drop off and get compact.'
      ],
      questions: ['Who should press first?', 'What do you do when the five seconds are up?'],
      mistakes: ['One player pressing while everyone else watches: freeze play and show the three nearest who should have gone.'],
      why: 'The seconds after losing the ball are when an opponent is least organised and the ball is nearest your goal. A team that reacts fast concedes far fewer chances.',
      easier: ['Eight seconds, a bigger pitch.'],
      harder: ['A regain inside five seconds counts as a goal.'],
      signals: ['possession', 'shots-against', 'conceding'], goesWith: ['rondo-5v2', 'six-second-counter'], tags: ['transition']
    },

    {
      id: 'six-second-counter', v: 1, name: 'Six-second counter', type: 'opposed',
      summary: 'A game where a goal scored within six seconds of winning the ball counts triple.',
      ages: [10, 19], level: 2, players: { min: 8, best: 12, max: 18 }, gk: 2, minutes: [12, 20], intensity: 3,
      space: [40, 50], kit: { balls: 10, cones: 8, goals: 2, bibs: 9 },
      positions: ALL, skills: ['decision-making', 'passing', 'shooting', 'movement'], principles: ['penetration', 'width', 'mobility'],
      moments: ['toAttack', 'attack'], physical: ['speed', 'endurance'],
      setup: 'Two goals with keepers, about 40 × 50 yd. 6v6 or 7v7.',
      how: [
        'A normal game.',
        'When a team wins the ball, the coach counts aloud. A goal within six seconds counts three.',
        'Every other goal counts one.'
      ],
      points: [
        'The first look after winning it is forward.',
        'Players near the ball support; players far away run in behind.',
        'If the counter isn\'t on, keep it. Don\'t force it.'
      ],
      questions: ['When is a counter on, and when should you slow down?', 'Who runs, and who stays?'],
      mistakes: ['Winning it then turning backwards out of habit: freeze and show the space ahead.'],
      why: 'Youth games are full of turnovers, and the team that attacks them quickly scores most. This makes the first forward look a habit.',
      easier: ['Ten seconds.'],
      harder: ['Four seconds.', 'A goal from a counter only counts if three players touch the ball.'],
      signals: ['few-shots', 'solo-goals'], goesWith: ['3v2-waves', 'five-second-press'], tags: ['transition']
    },

    {
      id: 'build-out-play', v: 1, name: 'Playing out from the back', type: 'opposed',
      summary: 'Keeper and back line against three pressing attackers: pass through the press to gates at halfway.',
      ages: [9, 19], level: 2, players: { min: 8, best: 9, max: 12 }, gk: 1, minutes: [15, 20], intensity: 2,
      space: [44, 40], kit: { balls: 12, cones: 10, goals: 1, bibs: 4 },
      positions: ['GK', 'Back', 'Mid'], skills: ['passing', 'first-touch', 'distribution', 'scanning', 'communication'], principles: ['width', 'support', 'balance'],
      moments: ['attack', 'toDefend'], physical: [],
      setup: 'Half a pitch. A goal and keeper on the end line, three or four defenders and a holding midfielder, two or three attackers pressing. Two or three cone gates on the halfway line.',
      how: [
        'Every rep starts with the keeper: a goal kick or a ball in her hands.',
        'The defending team scores by passing or dribbling through a halfway gate.',
        'The attackers score in the big goal if they win it.',
        'Where your league plays with a build-out line, use it: attackers wait behind it until the ball is played.'
      ],
      points: [
        'Defenders split wide to make the pitch big. The keeper is an extra player.',
        'Receive on the back foot, facing forward.',
        'If the press closes everything off, go long. Playing out is a choice, not a rule.'
      ],
      questions: ['Where was the free player?', 'When should we go long instead?'],
      mistakes: ['Centre backs standing next to the keeper: one attacker marks both. Split them to the edges of the box.'],
      why: 'Every goal kick is a possession that can be kept or given away in the most dangerous place on the pitch. Teams that practise it give up far fewer cheap goals.',
      easier: ['Two attackers who only press after the first pass.'],
      harder: ['Four attackers, and a ball lost in the defending third counts double.'],
      signals: ['possession', 'shots-against'], goesWith: ['gk-distribution', 'driven-passes'], tags: ['uses-your-shape']
    },

    {
      id: 'overlap-2v1-wide', v: 1, name: 'Overlaps out wide', type: 'opposed',
      summary: 'A winger and a full-back against one defender down the flank: overlap, underlap or go alone, then cross.',
      ages: [11, 19], level: 2, players: { min: 6, best: 9, max: 12 }, gk: 1, minutes: [15, 20], intensity: 2,
      space: [20, 40], kit: { balls: 12, cones: 10, goals: 1, bibs: 4 },
      positions: ['Wing', 'Back', 'Forward'], skills: ['combination', 'crossing', 'movement'], principles: ['width', 'penetration', 'support'],
      moments: ['attack'], physical: ['speed'],
      setup: 'A wide channel about 20 yd across along one touchline, ending at the box. A goal with a keeper, and two attackers waiting in the box.',
      how: [
        'The winger receives in the channel facing one defender, with the full-back 10 yd behind.',
        'The full-back runs round the outside (overlap) or inside (underlap). The winger chooses: release her, or use the run as a decoy and go alone.',
        'Whoever gets to the byline crosses for the attackers in the box.'
      ],
      points: [
        'The winger carries the ball inside to drag the defender, and opens the space outside.',
        'The full-back calls her run, then times it to arrive as the defender commits.',
        'Cross early if the defender gets back.'
      ],
      questions: ['How did you know whether to release the overlap?'],
      mistakes: ['A full-back who arrives before the winger has drawn anyone: hold the run.'],
      why: 'Two against one on the flank is how teams break down a defence that defends the middle well. It gives full-backs an attacking job.',
      easier: ['A passive defender, and the overlap always on.'],
      harder: ['A second defender recovers from inside.'],
      signals: ['solo-goals', 'few-shots'], goesWith: ['crossing-and-finishing', 'four-goal-game'], tags: []
    },

    {
      id: 'turn-and-shoot', v: 1, name: 'Turn and shoot', type: 'opposed',
      summary: 'A striker with her back to goal receives with a defender behind her, turns and shoots, or lays it off.',
      ages: [9, 19], level: 2, players: { min: 4, best: 8, max: 12 }, gk: 1, minutes: [10, 15], intensity: 3,
      space: [44, 25], kit: { balls: 12, cones: 4, goals: 1, bibs: 4 },
      positions: ['Forward', 'Mid'], skills: ['turning', 'shooting', 'shielding'], principles: ['penetration'],
      moments: ['attack'], physical: ['strength', 'agility'],
      setup: 'A goal with a keeper. A striker at the top of the box with her back to goal, a defender right behind her, a server 15 yd out.',
      how: [
        'The server passes in. The striker has two touches to turn and shoot.',
        'If she can\'t turn, she lays it back to the server, who shoots.',
        'Passive defender first, then live.'
      ],
      points: [
        'Feel the defender with an arm before the ball arrives.',
        'If she is tight, spin off her. If she is off, receive and turn.',
        'The shot comes fast. A defender recovers in one touch.'
      ],
      questions: ['How did you know which way to turn?'],
      mistakes: ['Receiving square and getting tackled from behind: half-turn before the ball arrives.'],
      why: 'Forwards spend most of a game with their back to goal. One who can turn a defender in the box scores goals out of nothing.',
      easier: ['No defender: turn round a cone and shoot.'],
      harder: ['One touch to turn.', 'A second defender covering.'],
      signals: ['few-shots', 'off-target', 'one-scorer'], goesWith: ['lay-off-and-shoot', 'shielding-battles'], tags: ['finishing']
    },

    {
      id: 'numbers-down-defending', v: 1, name: 'Defending outnumbered', type: 'opposed',
      summary: 'Three defenders and a keeper hold off four attackers: stay compact, protect the middle, show them wide.',
      ages: [11, 19], level: 3, players: { min: 8, best: 8, max: 12 }, gk: 1, minutes: [12, 18], intensity: 2,
      space: [44, 30], kit: { balls: 12, cones: 6, goals: 1, minigoals: 2, bibs: 4 },
      positions: ['Back', 'Mid', 'GK'], skills: ['communication', '1v1-defend', 'shape'], principles: ['compactness', 'balance', 'delay', 'cover'],
      moments: ['defend'], physical: [],
      setup: 'Final third of a pitch. A goal with a keeper. Three defenders, four attackers. Two mini goals at the halfway line for the defenders to counter into.',
      how: [
        'The attackers start with the ball 30 yd out and try to score.',
        'The defenders try to hold them up and win it, then score in either mini goal.',
        'Swap one defender every round.'
      ],
      points: [
        'Narrow and compact. The middle is the danger, so let them have the wings.',
        'Shift together towards the ball. Nobody gets split off.',
        'Delay, don\'t dive. Every second is a teammate getting back.'
      ],
      questions: ['Which of the four did you leave free, and why?'],
      mistakes: ['Defenders marking one each and leaving the middle open: put a cone in the D as the space to protect.'],
      why: 'Every team is outnumbered at the back sometimes. The ones that stay compact concede shots from the wide areas instead of from the middle.',
      easier: ['Four against four.'],
      harder: ['Five against three.'],
      signals: ['conceding', 'shots-against', 'late-goals'], goesWith: ['2v2-pressure-cover', 'attack-vs-defence'], tags: ['defending']
    },

    /* ---------------- small-sided games ---------------- */

    {
      id: '3v3-small-sided', v: 1, name: '3v3', type: 'game',
      summary: 'Three against three with small goals and no keepers. The format with the most touches and the most goals.',
      ages: [5, 10], level: 1, players: { min: 6, best: 12, max: 18 }, gk: 0, minutes: [10, 20], intensity: 3,
      space: [20, 25], kit: { balls: 6, cones: 8, minigoals: 2, bibs: 6 },
      positions: ALL, skills: ['dribbling', 'passing', '1v1-attack', '1v1-defend', 'decision-making'], principles: ['support', 'width', 'pressure'],
      moments: ['attack', 'defend', 'toAttack', 'toDefend'], physical: ['agility', 'endurance'],
      setup: 'A 20 × 25 yd pitch, two mini goals, no keepers. Several pitches side by side if you have the numbers.',
      how: [
        'Play 3 or 4 minute games, then rotate opponents.',
        'Kick-ins or dribble-ins instead of throw-ins.',
        'The coach stays quiet and stands back. Praise effort and tries.'
      ],
      points: [
        'One goes to the ball, one goes wide, one goes long: a triangle.',
        'If there\'s space in front, dribble into it.'
      ],
      questions: ['Where did you go when your teammate had the ball?'],
      mistakes: ['Everyone in a cluster round the ball. Normal at this age. Praise the one who finds space.'],
      why: 'Every player is involved every few seconds. More touches, more 1v1s and more goals than any bigger game, which is why federations play it at the youngest ages.',
      easier: ['4v4, or a neutral who always plays for the attacking team.'],
      harder: ['Two touches.', 'Four goals, one in each corner.'],
      signals: ['one-scorer'], goesWith: ['coach-says', 'line-soccer'], tags: ['young', 'fun']
    },

    {
      id: 'hungry-hippos', v: 1, name: 'Hungry hippos', type: 'game',
      summary: 'Four teams in four corners race to dribble balls home from the middle, then steal from each other.',
      ages: [4, 9], level: 1, players: { min: 4, best: 12, max: 20 }, gk: 0, minutes: [8, 12], intensity: 3,
      space: [25, 25], kit: { balls: 16, cones: 16, bibs: 12 },
      positions: ALL, skills: ['dribbling', 'shielding', 'scanning'], principles: [],
      moments: ['attack', 'defend'], physical: ['speed', 'agility'],
      setup: 'A square with a small cone "home" in each corner and a pile of balls in the middle. Players split into four teams, one per corner.',
      how: [
        'On "Go!", one player at a time from each team runs out, dribbles a ball home, and tags the next player.',
        'Balls must be dribbled, never kicked or carried.',
        'Once the middle is empty, players may take balls from other teams\' homes. Nobody may guard their own.',
        'Stop after 90 seconds. The most balls home wins.'
      ],
      points: ['Close touches on the way home. A ball kicked long rolls into someone else\'s home.', 'Look up: which home has the most balls?'],
      questions: ['Which home was easiest to take from? Why?'],
      mistakes: ['Kicking balls home from the middle: dribbled balls only, or they go back.'],
      why: 'Every player is dribbling, turning and racing at once, with no queue. For the youngest it\'s the most touches you can get from a game they will ask for every week.',
      easier: ['Everyone runs at once instead of relay style.'],
      harder: ['Weaker foot only.', 'One defender in the middle who can steal balls on the way home.'],
      signals: [], goesWith: ['red-light-green-light', '3v3-small-sided'], tags: ['fun', 'young']
    },

    {
      id: 'line-soccer', v: 1, name: 'Line soccer', type: 'game',
      summary: 'Score by stopping the ball on the other team\'s end line. No goals, no keepers.',
      ages: [5, 12], level: 1, players: { min: 4, best: 10, max: 16 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [25, 30], kit: { balls: 6, cones: 8, bibs: 8 },
      positions: OUTFIELD, skills: ['dribbling', '1v1-attack', '1v1-defend'], principles: ['penetration', 'pressure'],
      moments: ['attack', 'defend', 'toAttack'], physical: ['speed', 'agility'],
      setup: 'A rectangle about 25 × 30 yd. Each team defends a whole end line.',
      how: [
        'Score by dribbling over the other team\'s end line and stopping the ball dead on or past it.',
        'No passing over the line. It has to be dribbled.',
        '4v4 or 5v5, 3 minute games.'
      ],
      points: ['Run at the defence and look for the gap.', 'Defenders: stop the dribbler first, then help.'],
      questions: ['Where were the gaps along their line?'],
      mistakes: ['Kicking it over the line and chasing: the stop-dead rule fixes it.'],
      why: 'A wide goal rewards dribbling forward and running at defenders, which is exactly what young players should be doing.',
      easier: ['Dribble over the line, no stop required.'],
      harder: ['A pass first, then dribble over.', 'End zones that one defender guards.'],
      signals: ['few-shots', 'one-scorer'], goesWith: ['sharks-and-minnows', '3v3-small-sided'], tags: ['young', 'fun']
    },

    {
      id: '4v4-mini-goals', v: 1, name: '4v4 to mini goals', type: 'game',
      summary: 'The classic four-a-side, the smallest game with real shape: width, depth and support.',
      ages: [6, 19], level: 1, players: { min: 8, best: 8, max: 16 }, gk: 0, minutes: [12, 20], intensity: 3,
      space: [25, 35], kit: { balls: 6, cones: 8, minigoals: 2, bibs: 8 },
      positions: OUTFIELD, skills: ['passing', 'dribbling', 'decision-making', '1v1-attack', '1v1-defend'], principles: ['support', 'width', 'pressure', 'cover'],
      moments: ['attack', 'defend', 'toAttack', 'toDefend'], physical: ['endurance', 'agility'],
      setup: 'A 25 × 35 yd pitch, one mini goal at each end, no keepers.',
      how: [
        'A free game, 4 minute halves, short breaks.',
        'Use one condition to steer it towards the week\'s focus: two touches, everyone in the attacking half for a goal to count, or a goal only from a pass.'
      ],
      points: [
        'A diamond: one behind the ball, two wide, one ahead.',
        'Defending: one presses, the others narrow and cover.'
      ],
      questions: ['How many of you could have received the ball just then?'],
      mistakes: ['Over-coaching. Let it run and pick one moment per round to stop and show.'],
      why: 'Four players is the smallest game with every principle of play in it. It\'s still small enough that every player keeps making decisions.',
      easier: ['A neutral player for the team with the ball.'],
      harder: ['Two touches.', 'Goals only from a first-time finish.'],
      signals: ['solo-goals', 'possession'], goesWith: ['keep-away-4v4-plus-2', 'the-game'], tags: ['every-session']
    },

    {
      id: 'four-goal-game', v: 1, name: 'Four-goal game', type: 'game',
      summary: 'Two mini goals at each end, near the corners. Spot which goal is open, and switch the play to get there.',
      ages: [7, 19], level: 2, players: { min: 8, best: 10, max: 14 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [30, 40], kit: { balls: 6, cones: 8, minigoals: 4, bibs: 10 },
      positions: OUTFIELD, skills: ['passing', 'scanning', 'decision-making', 'long-passing'], principles: ['width', 'balance', 'compactness'],
      moments: ['attack', 'defend'], physical: ['endurance'],
      setup: 'A 30 × 40 yd pitch, two mini goals on each end line placed near the corners. 4v4 to 6v6.',
      how: [
        'Each team attacks the two goals at one end and defends the two at the other.',
        'A goal in either counts.',
        'Progress to: a goal counts double if the ball was switched from one side to the other in the build-up.'
      ],
      points: [
        'If one goal is crowded, the other is open. Look up and switch.',
        'Defending: shift as a team to the ball side, but keep someone balancing the far goal.'
      ],
      questions: ['Which goal was open? How did you know?'],
      mistakes: ['Everyone attacking the same goal: freeze and point at the empty one.'],
      why: 'It teaches switching play and spreading out without a lecture, because the game rewards it on its own. Defenders learn to shift and balance across the pitch.',
      easier: ['Bigger mini goals, fewer players.'],
      harder: ['Two touches.', 'A goal only after a switch.'],
      signals: ['possession', 'solo-goals'], goesWith: ['driven-passes', 'overlap-2v1-wide'], tags: []
    },

    {
      id: 'end-zone-game', v: 1, name: 'End-zone game', type: 'game',
      summary: 'Score by receiving a pass inside the end zone, so runs in behind and passes to meet them are everything.',
      ages: [8, 19], level: 2, players: { min: 8, best: 12, max: 16 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [30, 45], kit: { balls: 6, cones: 16, bibs: 8 },
      positions: OUTFIELD, skills: ['passing', 'movement', 'first-touch', 'decision-making'], principles: ['penetration', 'mobility', 'support'],
      moments: ['attack', 'defend'], physical: ['speed', 'endurance'],
      setup: 'A 30 × 35 yd pitch with a 5 yd end zone at each end.',
      how: [
        'A team scores by passing to a teammate who controls it inside the end zone.',
        'Nobody can wait in the end zone. Runners arrive with the pass.',
        '5v5 or 6v6.'
      ],
      points: [
        'Time the run: leave as the passer looks up.',
        'Pass into space for the runner to move onto, not to where she is now.',
        'Defenders: watch runners, not just the ball.'
      ],
      questions: ['When did you start your run?', 'What made the pass easy or hard?'],
      mistakes: ['Runs too early, so the runner stands in the zone and waits: no waiting allowed.'],
      why: 'Through-balls and runs in behind are how a team breaks a defensive line. It trains the run and the pass as a pair, which is how they happen in a game.',
      easier: ['Dribbling into the zone also scores.'],
      harder: ['A one-touch finish in the zone (a first-time pass to a second player).'],
      signals: ['few-shots', 'solo-goals'], goesWith: ['keep-away-4v4-plus-2', 'attack-vs-defence'], tags: []
    },

    {
      id: 'three-team-transition', v: 1, name: 'Winner stays on', type: 'game',
      summary: 'Three teams of four. The team that concedes goes off, and the waiting team is straight on.',
      ages: [8, 19], level: 2, players: { min: 9, best: 12, max: 15 }, gk: 0, minutes: [12, 20], intensity: 3,
      space: [25, 35], kit: { balls: 10, cones: 8, minigoals: 2, bibs: 8 },
      positions: OUTFIELD, skills: ['decision-making', 'pressing', 'communication'], principles: ['pressure', 'penetration', 'compactness'],
      moments: ['toAttack', 'toDefend', 'attack', 'defend'], physical: ['endurance', 'speed'],
      setup: 'A 25 × 35 yd pitch with mini goals. Two teams play, one waits behind an end line with a ball.',
      how: [
        'A goal sends the conceding team off. The waiting team comes on at once, attacking with their own ball.',
        'The team that scored has to switch to defending immediately.',
        'Points per goal. Keep it to 12 to 15 minutes.'
      ],
      points: [
        'Score, then switch on. The next attack is already coming.',
        'Organise in the first two seconds: who presses, who drops.'
      ],
      questions: ['What did you do the second after you scored?'],
      mistakes: ['Celebrating while the new team runs through: that\'s the lesson. Let it happen once.'],
      why: 'Concentration after scoring and after a stoppage is where late goals come from. This makes switching on instantly a habit, and it is very good fitness work.',
      easier: ['A three-second head start before the new team can attack.'],
      harder: ['The waiting team comes on the moment the ball goes out, not only after a goal.'],
      signals: ['late-goals', 'conceding'], goesWith: ['five-second-press', 'the-game'], tags: ['transition', 'competitive']
    },

    {
      id: 'conditioned-game', v: 1, name: 'Conditioned game', type: 'game',
      summary: 'A normal game with one rule that pushes the team towards the week\'s focus.',
      ages: [9, 19], level: 2, players: { min: 10, best: 14, max: 22 }, gk: 2, minutes: [15, 25], intensity: 3,
      space: [45, 60], kit: { balls: 8, cones: 12, goals: 2, bibs: 11 },
      positions: ALL, skills: ['decision-making', 'passing', 'shape'], principles: ['support', 'penetration', 'compactness'],
      moments: ['attack', 'defend', 'toAttack', 'toDefend'], physical: ['endurance'],
      setup: 'Your match format, or as near as numbers allow, with keepers and full-size goals.',
      how: [
        'Pick one condition for the week\'s focus.',
        'Possession: a goal counts double after five passes.',
        'Finishing: shots from outside the box count double; every shot on target is a point.',
        'Defending: a goal only counts if your whole team is in the attacking half (squeezes the shape up).',
        'Combination: a goal only counts if the last pass was first-time.',
        'Play it for 6 to 8 minutes, then lift the condition and see if it sticks.'
      ],
      points: ['One condition at a time, and say why: "today we\'re working on keeping the ball".'],
      questions: ['Did it still happen once the rule was gone?'],
      mistakes: ['Stacking three conditions until nobody can play: one is enough.'],
      why: 'It\'s the bridge from practice to the game: the week\'s focus with a real opponent, real decisions and the real shape.',
      easier: ['A neutral player for the attacking team.'],
      harder: ['Two conditions at once, for older and experienced groups.'],
      signals: ['possession', 'solo-goals', 'few-shots', 'conceding'], goesWith: ['the-game'], tags: ['uses-your-shape', 'every-session']
    },

    {
      id: 'attack-vs-defence', v: 1, name: 'Attack against defence', type: 'game',
      summary: 'Six attackers against four defenders and a keeper on half a pitch. The defenders counter to targets at halfway.',
      ages: [11, 19], level: 3, players: { min: 11, best: 12, max: 16 }, gk: 1, minutes: [15, 25], intensity: 2,
      space: [60, 50], kit: { balls: 15, cones: 10, goals: 1, minigoals: 2, bibs: 6 },
      positions: ALL, skills: ['shape', 'combination', 'communication', 'decision-making'], principles: ['penetration', 'width', 'support', 'compactness', 'balance', 'cover'],
      moments: ['attack', 'defend'], physical: [],
      setup: 'Half a pitch, a full-size goal and keeper, the back line in their match positions, and attackers in theirs. Two mini goals on halfway for the defenders.',
      how: [
        'Play starts with the coach passing to the attacking midfielder.',
        'The attackers try to score. The defenders win it and score in a mini goal.',
        'Stop play to show a picture, never more than once every two or three minutes.'
      ],
      points: [
        'Attackers: width and depth first, then look for the gap between two defenders.',
        'Defenders: shift together, keep the line, and step up as one when the ball goes back.'
      ],
      questions: ['Where was the space? Who should have been in it?'],
      mistakes: ['Talking too much. Play for ten minutes, stop twice, play again.'],
      why: 'Shape in a real setting. Both units rehearse their match positions against each other, which is the closest practice gets to Saturday.',
      easier: ['Five attackers against three defenders.'],
      harder: ['Equal numbers.', 'Offside applies.'],
      signals: ['few-shots', 'conceding', 'shots-against'], goesWith: ['numbers-down-defending', 'shadow-play'], tags: ['uses-your-shape']
    },

    {
      id: 'shadow-play', v: 1, name: 'Shadow play', type: 'game',
      summary: 'The team walks, then jogs, the ball through its own shape with no opponent, and shifts as a unit when the coach says "theirs".',
      ages: [10, 19], level: 2, players: { min: 7, best: 11, max: 14 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [60, 90], kit: { balls: 4, cones: 10, goals: 1 },
      positions: ALL, skills: ['shape', 'movement', 'communication'], principles: ['width', 'support', 'compactness', 'balance'],
      moments: ['attack', 'defend'], physical: [],
      setup: 'Whatever pitch you have, with the team set out in your match shape.',
      how: [
        'From the keeper, pass the ball through the team to a shot on goal. Every player moves to where she would be.',
        'On "Theirs!", the ball becomes the opposition\'s: the coach walks it around and the team shifts as one block.',
        'Then a passive opponent, then a live one.'
      ],
      points: ['When the ball moves, everybody moves.', 'Distances: nobody further than 10 to 15 yd from a teammate.'],
      questions: ['When the ball went wide on the left, where should the right winger be?'],
      mistakes: ['Players standing still away from the ball: freeze and have them point to where they should be.'],
      why: 'It\'s the cheapest way to teach a shape before a new season or a new formation. It uses the shape you\'ve saved in the app, so the positions on the pitch match the positions on the screen.',
      easier: ['Walk only.'],
      harder: ['Live opponents, from three up to a full team.'],
      signals: ['conceding', 'possession'], goesWith: ['attack-vs-defence', 'conditioned-game'], tags: ['uses-your-shape']
    },

    {
      id: 'world-cup', v: 1, name: 'World Cup', type: 'game',
      summary: 'Pairs are countries; everyone plays at one goal, and every team that scores goes through to the next round.',
      ages: [6, 13], level: 1, players: { min: 6, best: 12, max: 16 }, gk: 1, minutes: [10, 15], intensity: 3,
      space: [30, 30], kit: { balls: 2, goals: 1, bibs: 12 },
      positions: ALL, skills: ['shooting', '1v1-attack', 'shielding', 'combination'], principles: ['creativity'],
      moments: ['attack', 'defend'], physical: ['agility'],
      setup: 'One goal and a keeper (a coach or a keeper who rotates in). Players in pairs, each pair picks a country.',
      how: [
        'The coach throws one ball in. Every pair tries to score.',
        'A team that scores is through, and leaves the pitch. The last team not to score is out of this round.',
        'Rounds continue until there\'s a winner.',
        'Eliminated pairs play keeper or do toe taps at the side, never stand idle for long.'
      ],
      points: ['Shield it, then shoot fast. There\'s always a defender coming.', 'Work with your partner: a one-two gets you a clean shot.'],
      questions: ['How did you and your partner get a shot away?'],
      mistakes: ['The same pairs losing early every time: mix the pairs, or give the youngest a two-goal start.'],
      why: 'Shooting in traffic, fast decisions and a competition young players beg for. It leaves them with the habit of shooting when they can.',
      easier: ['Two balls in at once.'],
      harder: ['Singles, not pairs.'],
      signals: ['few-shots', 'one-scorer'], goesWith: ['lay-off-and-shoot'], tags: ['fun', 'competitive']
    },

    {
      id: 'the-game', v: 1, name: 'The game', type: 'game',
      summary: 'Finish every session with a proper game in your match format, coach quiet, players deciding.',
      ages: [4, 19], level: 1, players: { min: 6, best: 14, max: 22 }, gk: 2, minutes: [15, 30], intensity: 3,
      space: null, spaceNote: 'Your match pitch for this age, or as close to it as you have.',
      kit: { balls: 6, cones: 12, goals: 2, bibs: 11 },
      positions: ALL, skills: ['decision-making', 'shape'], principles: ['support', 'pressure'],
      moments: ['attack', 'defend', 'toAttack', 'toDefend'], physical: ['endurance'],
      setup: 'Your match format and pitch size, keepers in.',
      how: [
        'Play. Don\'t stop it.',
        'Watch for the week\'s focus showing up, and praise it when it does.',
        'Use it to rehearse Saturday: run it in blocks as long as your plan\'s, and make the subs the plan says.'
      ],
      points: ['The coach watches and notes. One piece of praise per player is a good target.'],
      questions: ['Where did you see today\'s focus in the game?'],
      mistakes: ['Turning it into another drill with constant stops: they came to play.'],
      why: 'Players learn the game by playing it, and it\'s the part of training they come for. Ending every session with a game is the most common advice in youth coaching.',
      easier: ['Uneven numbers, or the coach plays for the team behind.'],
      harder: ['Add the week\'s condition for the first half only.'],
      signals: ['late-goals'], goesWith: ['cooldown-reflect'], tags: ['every-session', 'uses-your-shape']
    },

    /* ---------------- set pieces ---------------- */

    {
      id: 'attacking-corners', v: 1, name: 'Attacking corners', type: 'setpiece',
      summary: 'Two or three simple routines (near post, far post, short) and a job for every player, including who stays back.',
      ages: [10, 19], level: 2, players: { min: 8, best: 14, max: 22 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [44, 18], spaceNote: 'The penalty area and around it.',
      kit: { balls: 12, goals: 1, cones: 6, bibs: 8 },
      positions: ALL, skills: ['set-pieces', 'crossing', 'movement', 'shooting'], principles: ['penetration', 'mobility'],
      moments: ['attack'], physical: [],
      setup: 'A goal, a keeper and a few defenders, with corners from both sides.',
      how: [
        'Give each routine a name or a hand signal: "near" (a run to the near post to flick it on), "far" (swing it to the back post), "short" (two players work it).',
        'Every player has a job: near post, far post, penalty spot, edge of the box for knockdowns, and two who stay back for the counter.',
        'Ten corners each side. Add defenders once the runs are timed right.'
      ],
      points: [
        'Runs start late and fast. A runner standing still is a runner marked.',
        'The edge of the box is where cleared corners land. Someone has to be there.',
        'Keep two back. A cleared corner is a counter-attack at the other end.'
      ],
      questions: ['What\'s your job on "near"?'],
      mistakes: ['Too many routines: two that everyone knows beat five that nobody does.'],
      why: 'Corners are free chances, and a team that has a plan for them scores from a few each season. One the opposition counters from costs a goal.',
      easier: ['Taken from closer in, with no defenders.'],
      harder: ['Live defenders who know the routine.'],
      safety: 'For younger groups, attack corners with the feet. Heading follows your federation\'s age rules.',
      signals: ['few-shots'], goesWith: ['crossing-and-finishing', 'defending-corners'], tags: ['set-piece']
    },

    {
      id: 'defending-corners', v: 1, name: 'Defending corners', type: 'setpiece',
      summary: 'A clear set-up for every corner against: who guards the posts, who marks whom, who clears, and who breaks.',
      ages: [10, 19], level: 2, players: { min: 8, best: 14, max: 22 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [44, 18], spaceNote: 'The penalty area and around it.',
      kit: { balls: 12, goals: 1, cones: 6, bibs: 8 },
      positions: ALL, skills: ['set-pieces', 'communication', 'shape'], principles: ['compactness', 'cover'],
      moments: ['defend', 'toAttack'], physical: [],
      setup: 'A goal and keeper, defenders against attackers, corners from both sides.',
      how: [
        'Set a structure: one player at the near post, one zonal player at the front of the six-yard box, the tallest marking the most dangerous attackers, one at the edge of the box.',
        'The keeper organises out loud.',
        'Clear high, wide and far. Then everybody steps out together.',
        'One fast player stays up to break on the counter.'
      ],
      points: [
        'The keeper calls "Keeper!" for anything she can claim, early and loud.',
        'Attack the ball. Don\'t wait for it to land on an attacker.',
        'After the clearance, the whole line steps out of the box at once.'
      ],
      questions: ['Who do you mark when they move?', 'What happens after we clear it?'],
      mistakes: ['Everyone on the goal line: the attackers win every header. Push the line out to the six-yard box.'],
      why: 'Corners against cause a disproportionate share of goals conceded at every age. A rehearsed set-up turns panic into a job.',
      easier: ['Corners from the hand to set positions.'],
      harder: ['Opponents run a routine the defenders haven\'t seen.'],
      safety: 'Younger players clear with their feet. Heading follows your federation\'s age rules.',
      signals: ['corners-against', 'conceding'], goesWith: ['gk-crosses', 'attacking-corners'], tags: ['set-piece']
    },

    {
      id: 'throw-in-game', v: 1, name: 'Throw-ins that keep the ball', type: 'setpiece',
      summary: 'Legal technique first, then the movement that makes a throw-in a free pass instead of a 50/50.',
      ages: [6, 19], level: 1, players: { min: 4, best: 12, max: 20 }, gk: 0, minutes: [8, 12], intensity: 1,
      space: [20, 30], kit: { balls: 6, cones: 8, bibs: 6 },
      positions: OUTFIELD, skills: ['throw-ins', 'movement', 'first-touch'], principles: ['support', 'mobility'],
      moments: ['attack'], physical: [],
      setup: 'Groups of three along a touchline: a thrower, a receiver and a defender.',
      how: [
        'Technique: both feet on the ground, on or behind the line; both hands; the ball from behind the head and released over it.',
        'The receiver checks away, then comes short. The throw goes to her feet or thigh and she plays it straight back to the thrower.',
        'Add the defender. Then play a small-sided game where every restart is a throw-in.'
      ],
      points: [
        'Throw to feet, not to heads.',
        'Receiver: move to lose the defender. Standing still gets you marked.',
        'The thrower is often the free player after the throw. Give it back.'
      ],
      questions: ['Who was free after you threw it?'],
      mistakes: ['A foot coming off the ground: a foul throw hands the ball over. Practise standing feet first.'],
      why: 'Youth games have dozens of throw-ins, and most are thrown straight to an opponent. Keeping half of them is a lot of extra possession for five minutes of practice.',
      easier: ['Throw to a stationary partner, no defender.'],
      harder: ['Two defenders, and the receiver has three seconds.'],
      signals: ['throw-ins', 'possession'], goesWith: ['keep-away-4v4-plus-2'], tags: ['set-piece', 'no-prep']
    },

    {
      id: 'quick-restarts', v: 1, name: 'Quick restarts', type: 'setpiece',
      summary: 'A small-sided game where a throw-in taken within five seconds scores a bonus point, so players learn to restart before the other team sets.',
      ages: [8, 19], level: 2, players: { min: 8, best: 10, max: 14 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [25, 35], kit: { balls: 12, cones: 12, minigoals: 2, bibs: 8 },
      positions: OUTFIELD, skills: ['throw-ins', 'movement', 'decision-making'], principles: ['mobility', 'support'],
      moments: ['attack', 'toAttack'], physical: ['speed'],
      setup: 'A narrow pitch, about 25 yd wide, so the ball goes out of play often. Spare balls every few yards along both touchlines.',
      how: [
        'A normal 4v4 or 5v5 to mini goals.',
        'When the ball goes out down a side, the restart is a throw-in from the nearest spare ball.',
        'The coach counts aloud: a throw-in taken within five seconds that the team keeps for three passes is a bonus point.'
      ],
      points: [
        'Nearest player takes it. Don\'t wait for the "throw-in taker".',
        'Everyone else moves: one short, one long, before the defence is set.',
        'Quick, but legal. A foul throw gives it away.'
      ],
      questions: ['Who should take the throw?', 'Where were the defenders when you took it quickly?'],
      mistakes: ['Hunting for the ball that went out: use the nearest spare one.'],
      why: 'Most throw-ins are taken after the defence has set, which is why so many are lost. A team that restarts fast plays against a defence that isn\'t ready.',
      easier: ['Ten seconds, and dribble-ins allowed for the youngest.'],
      harder: ['Three seconds.', 'Corners and goal kicks count too.'],
      signals: ['throw-ins', 'possession'], goesWith: ['throw-in-game', 'six-second-counter'], tags: ['set-piece']
    },

    /* ---------------- goalkeeping ---------------- */

    {
      id: 'gk-handling', v: 1, name: 'Keeper handling', type: 'keeper',
      summary: 'Ready position, the W catch for chest and head height, and the scoop for low balls, from easy serves up to shots.',
      ages: [7, 19], level: 1, players: { min: 1, best: 2, max: 4 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [10, 15], kit: { balls: 6, goals: 1, cones: 4 },
      positions: ['GK'], skills: ['handling'], principles: [],
      moments: ['defend'], physical: ['coordination', 'agility'],
      setup: 'A keeper in goal (or between two cones), a server 6 to 10 yd out with a pile of balls.',
      how: [
        'Ready position: feet shoulder-width, knees bent, weight forward, hands up and out.',
        'Chest and head height: the W catch, thumbs and index fingers making a W behind the ball.',
        'Low balls: scoop, with a knee down behind the hands as a second barrier.',
        'Serves go hands, then volleys, then shots. Ten each.'
      ],
      points: [
        'Get your body behind the ball. Hands first, body second.',
        'Watch the ball all the way into your hands.',
        'Bring it in to your chest after every catch.'
      ],
      questions: ['If the ball slipped through your hands, what was behind it?'],
      mistakes: ['Hands too far apart on high balls: show the W shape again.'],
      why: 'A keeper who holds the first shot gives away no rebounds, and youth goals come from rebounds more than from anything else.',
      easier: ['A soft ball from hands, from close in.'],
      harder: ['Shots at pace, from varied angles.', 'A turn to face the server just before the ball comes.'],
      signals: ['conceding'], goesWith: ['gk-diving', 'gk-distribution'], tags: ['keeper']
    },

    {
      id: 'gk-diving', v: 1, name: 'Keeper diving', type: 'keeper',
      summary: 'Diving built up safely: sitting, kneeling, crouching, standing, then stepping into the dive.',
      ages: [8, 19], level: 1, players: { min: 1, best: 2, max: 4 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [10, 15], kit: { balls: 6, goals: 1, mats: 1 },
      positions: ['GK'], skills: ['diving', 'handling'], principles: [],
      moments: ['defend'], physical: ['agility', 'coordination'],
      setup: 'A soft area: grass, a mat, or the six-yard box after rain. A server close in.',
      how: [
        'Sitting, legs out: the ball rolled to the side, catch and land on the side.',
        'Kneeling, then crouching, then standing, each with the ball a little further away.',
        'Finally a step towards the ball before the dive (a power step).'
      ],
      points: [
        'Land on your side: hip and shoulder, never your stomach or elbows.',
        'Hands lead. The top hand behind the ball, the bottom hand underneath it.',
        'Step towards the ball, not back towards the line.'
      ],
      questions: ['What part of you hit the ground first?'],
      mistakes: ['Landing on the elbow or stomach: go back a stage.'],
      why: 'Keepers who are scared to dive let in the saveable ones. Building it up in stages makes it safe, and makes it a habit.',
      easier: ['Stay longer at each stage.'],
      harder: ['Dive and get up for a second save straight away.'],
      safety: 'Soft ground only. Stop if the ground is hard or the keeper is landing badly.',
      signals: ['conceding', 'shots-against'], goesWith: ['gk-handling', 'gk-angles-1v1'], tags: ['keeper']
    },

    {
      id: 'gk-distribution', v: 1, name: 'Keeper distribution', type: 'keeper',
      summary: 'Rolling, throwing and kicking to targets, so a save becomes the start of an attack.',
      ages: [7, 19], level: 1, players: { min: 2, best: 4, max: 6 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [40, 50], kit: { balls: 10, cones: 12, goals: 1 },
      positions: ['GK', 'Back'], skills: ['distribution', 'passing', 'long-passing'], principles: ['width'],
      moments: ['toAttack', 'attack'], physical: [],
      setup: 'A keeper in goal, cone gates as targets at 10, 20 and 30 yd, and receivers who move between them.',
      how: [
        'Roll it to a defender\'s feet at the edge of the box.',
        'Overarm and side-arm throws to a wide player.',
        'Goal kicks along the ground, then lofted.',
        'Kicks from the hand, where your league allows them.'
      ],
      points: [
        'Look first. The quickest outlet is usually the best one.',
        'A roll should arrive at the feet, not bounce up.',
        'Don\'t hurry. The other team has to retreat first in most formats.'
      ],
      questions: ['Who was free when you caught it?'],
      mistakes: ['Kicking long every time: count how many come straight back. Rolling short keeps it.'],
      why: 'Every save is a possession. A keeper who distributes well starts attacks, and one who doesn\'t gives the ball straight back.',
      easier: ['Rolls only, stationary targets.'],
      harder: ['A defender tries to intercept.', 'Receivers call for it, and the keeper picks the best one.'],
      safety: 'Some small-sided formats ban punts and drop kicks. Check your league.',
      signals: ['possession'], goesWith: ['build-out-play', 'gk-handling'], tags: ['keeper', 'check-local-rules']
    },

    {
      id: 'gk-angles-1v1', v: 1, name: 'Keeper angles and 1v1s', type: 'keeper',
      summary: 'Starting position on the arc, setting the feet as a shot comes, and closing down a one-on-one.',
      ages: [9, 19], level: 2, players: { min: 2, best: 4, max: 8 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 18], kit: { balls: 10, goals: 1, cones: 6 },
      positions: ['GK'], skills: ['angles', 'diving', 'communication'], principles: [],
      moments: ['defend'], physical: ['agility'],
      setup: 'A goal with cones fanned out in an arc 15 to 20 yd out, an attacker at each.',
      how: [
        'An attacker dribbles in from a cone. The keeper moves along her arc, staying on the line between the ball and the middle of the goal.',
        'She sets her feet just before the shot.',
        'Then one-on-ones: the attacker breaks in alone and the keeper closes down, makes herself big, and stays up as long as she can.'
      ],
      points: [
        'The line from the ball to the middle of the goal is where to stand.',
        'Set before the shot. A moving keeper can\'t dive.',
        '1v1: close the gap fast while the ball is away from the attacker\'s foot. Stop and set when she\'s about to shoot.'
      ],
      questions: ['Where was the bigger gap, near post or far?'],
      mistakes: ['Going to ground too early in a one-on-one: stay up and make her decide.'],
      why: 'Most goals a keeper could have saved are positioning, not reflexes. A keeper in the right spot makes ordinary saves look easy.',
      easier: ['Shots from the cones with no dribble.'],
      harder: ['Two attackers, so a square pass is possible.'],
      safety: 'In a one-on-one, the keeper goes down sideways with her hands leading, never head first at a player\'s feet.',
      signals: ['conceding', 'shots-against'], goesWith: ['gk-diving', 'turn-and-shoot'], tags: ['keeper']
    },

    {
      id: 'gk-crosses', v: 1, name: 'Keeper crosses and high balls', type: 'keeper',
      summary: 'Starting position for crosses, an early call, and taking the ball at its highest point, or punching it when crowded.',
      ages: [11, 19], level: 2, players: { min: 3, best: 6, max: 10 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 18], kit: { balls: 12, goals: 1, cones: 4 },
      positions: ['GK', 'Back'], skills: ['handling', 'communication', 'angles'], principles: [],
      moments: ['defend'], physical: ['coordination', 'strength'],
      setup: 'A goal, servers on both wings, and later a couple of attackers in the box.',
      how: [
        'Starting position: a yard or two off the line, slightly towards the back post, open to the field.',
        'Servers cross. The keeper calls "Keeper!" early and attacks the ball.',
        'Add attackers. When it\'s crowded, punch high, wide and far, with two fists or one.'
      ],
      points: [
        'Call early and loud. The call is a decision, so stick to it.',
        'Take off from one foot, with the other knee up for protection.',
        'Catch at the highest point, in front of your head.'
      ],
      questions: ['When should you punch instead of catch?'],
      mistakes: ['A late call, so the keeper collides with her own defender: call or stay.'],
      why: 'A keeper who commands her box takes away the chances that come from corners and crosses, and settles the whole defence.',
      easier: ['Crosses thrown from the hand, no attackers.'],
      harder: ['Crowded box, crosses whipped in.'],
      signals: ['corners-against', 'conceding'], goesWith: ['defending-corners'], tags: ['keeper']
    },

    /* ---------------- cool-down ---------------- */

    {
      id: 'cooldown-reflect', v: 1, name: 'Cool-down and three questions', type: 'cooldown',
      summary: 'A light jog, a few stretches, then a circle where players say what they learned. Short, and every session.',
      ages: [5, 19], level: 1, players: { min: 1, best: 14, max: 30 }, gk: 0, minutes: [5, 10], intensity: 1,
      space: [20, 20], kit: {},
      positions: ALL, skills: ['communication'], principles: [],
      moments: [], physical: ['balance'],
      setup: 'Anywhere quiet at the end.',
      how: [
        'Two minutes of jogging, slowing to a walk.',
        'Stretches held for 20 to 30 seconds: hamstrings, quads, calves, hips.',
        'Sit in a circle. Ask three questions: what did we work on today? When will you use it on Saturday? Who did something well today?'
      ],
      points: ['Let the players answer. Silence is fine. Somebody will fill it.'],
      questions: ['What did we work on today?', 'When will you use it in a game?', 'Who did something well today?'],
      mistakes: ['The coach answering their own questions: wait for them.'],
      why: 'Players remember what they\'ve said out loud far better than what they\'ve been told. It also ends the session calm, and gives parents arriving a minute.',
      easier: ['For the youngest: just "What was your favourite game today?"'],
      harder: ['One player leads the stretches and asks the questions.'],
      signals: [], goesWith: [], tags: ['every-session', 'no-prep']
    }
  ];

  const LIB = { version: 1, TYPES, MOMENTS, SKILLS, PRINCIPLES, PHYSICAL, KIT, LEVELS, INTENSITY, POSITIONS: ALL, SIGNALS, DRILLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = LIB;
  else root.SOCCER_DRILLS = LIB;
})(typeof window !== 'undefined' ? window : globalThis);
