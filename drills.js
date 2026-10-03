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
   this scale.

   The practical fields are the ones a volunteer filters on before she reads a
   word: how long it takes to lay out (setupMins), whether one adult can run
   it (adults), whether it works in a gym (indoor), how the players are split
   up (groups), how much of the time each player is actually busy rather than
   in a line (involvement), and whether there's a score to win (competitive).

   Every drill has a diagram, in the format drill-diagram.js describes and
   draws. Most of them move; the ones where nothing travels (juggling, the
   cool-down circle) are a layout. The diagram follows the drill's own setup
   text, so change both together. */

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
    position: 'Positions and units',
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

  /* How the squad is split up. A drill can take more than one. */
  const GROUPS = {
    solo: 'On their own',
    pairs: 'Pairs',
    small: 'Small groups',
    teams: 'Teams',
    squad: 'Whole squad'
  };

  /* How busy each player is. Lines and waiting are what volunteer coaches are
     most often told to cut, so it gets its own filter rather than a tag. */
  const INVOLVEMENT = { 1: 'Some waiting', 2: 'Busy', 3: 'Non-stop' };

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
      setupMins: 2, adults: 1, indoor: true, groups: ['solo'], involvement: 3, competitive: false,
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
      diagram: {
        area: [20, 20], mark: 'grid',
        cones: [[0, 0], [20, 0], [0, 20], [20, 20]],
        players: { A1: [4, 4], A2: [12, 3], A3: [17, 8], A4: [5, 11], A5: [14, 14], A6: [5, 17] },
        ball: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
        frames: [
          [
            'A1~8,7', 'A2~16,4', 'A3~15,12', 'A4~3,14', 'A5~10,17', 'A6~9,13',
            '# Dribble anywhere: small touches, eyes up'
          ],
          [
            'A1~3,10', 'A2~11,6', 'A3~17,15', 'A4~6,17', 'A5~16,18', 'A6~13,10',
            '# "Turn!" Change direction with a move'
          ]
        ]
      },
      signals: ['possession'], goesWith: ['through-the-gates', 'sharks-and-minnows'], tags: ['no-prep', 'every-session']
    },

    {
      id: 'through-the-gates', v: 1, name: 'Through the gates', type: 'warmup',
      summary: 'Dribble through as many little cone gates as you can in a minute, never the same gate twice in a row.',
      ages: [5, 12], level: 1, players: { min: 4, best: 12, max: 20 }, gk: 0, minutes: [8, 15], intensity: 2,
      space: [30, 30], kit: { balls: 'each', cones: 20 },
      setupMins: 4, adults: 1, indoor: true, groups: ['solo', 'pairs'], involvement: 3, competitive: true,
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
      diagram: {
        area: [30, 30], mark: 'grid',
        cones: [
          [0, 0], [30, 0], [0, 30], [30, 30], [5, 6], [7, 6], [10, 3], [10, 5], [24, 7], [24, 9], [8, 14],
          [8, 16], [18, 14], [20, 14], [25, 22], [27, 22], [5, 25], [7, 25], [15, 24], [15, 26]
        ],
        players: { A1: [6, 10], A2: [19, 8], A3: [19, 27] },
        ball: ['A1', 'A2', 'A3'],
        frames: [
          ['A1~6,2', 'A2~28,8', 'A3~19,10', '# Through a gate'],
          ['A1~15,7', 'A2~26,27', 'A3~3,17', '# Look up, find the next open gate']
        ]
      },
      signals: [], goesWith: ['ball-mastery-box', 'pass-and-follow'], tags: ['no-prep']
    },

    {
      id: 'sharks-and-minnows', v: 1, name: 'Sharks and minnows', type: 'warmup',
      summary: 'Minnows dribble across the pond; sharks try to knock their balls out. Caught minnows become sharks.',
      ages: [5, 10], level: 1, players: { min: 6, best: 14, max: 24 }, gk: 0, minutes: [8, 15], intensity: 3,
      space: [25, 30], kit: { balls: 'each', cones: 4 },
      setupMins: 2, adults: 1, indoor: true, groups: ['squad'], involvement: 3, competitive: true,
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
      diagram: {
        area: [30, 22], mark: 'grid',
        lines: [[0, 0, 0, 22], [30, 0, 30, 22]],
        cones: [[0, 0], [30, 0], [0, 22], [30, 22]],
        players: { A1: [1, 3], A2: [1, 8], A3: [1, 14], A4: [1, 19], D1: [14, 8], D2: [16, 15] },
        ball: ['A1', 'A2', 'A3', 'A4'],
        frames: [
          [
            'A1~12,3', 'A2~11,9', 'A3~12,15', 'A4~13,20', 'D1-A2', 'D2-A3',
            '# "Swim!" Minnows dribble across; sharks hunt'
          ],
          ['A1~29,3', 'A3~29,16', 'A4~29,20', 'D1*A2', 'D2-20,15', '# A shark wins a ball…'],
          ['D1>12,23.3', '# …and kicks it out: that minnow is a shark now']
        ]
      },
      signals: ['possession'], goesWith: ['ball-mastery-box', 'line-soccer'], tags: ['fun', 'young']
    },

    {
      id: 'coach-says', v: 1, name: 'Coach says', type: 'warmup',
      summary: 'Dribble around; stop the ball with whatever body part the coach calls, but only if "Coach says".',
      ages: [4, 8], level: 1, players: { min: 1, best: 10, max: 16 }, gk: 0, minutes: [5, 10], intensity: 2,
      space: [20, 20], kit: { balls: 'each', cones: 4 },
      setupMins: 1, adults: 1, indoor: true, groups: ['solo'], involvement: 3, competitive: false,
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
      diagram: {
        area: [20, 20], mark: 'grid',
        cones: [[0, 0], [20, 0], [0, 20], [20, 20]],
        players: { A1: [4, 5], A2: [13, 4], A3: [16, 13], A4: [6, 15], A5: [10, 10], C: [21, 10] },
        ball: ['A1', 'A2', 'A3', 'A4', 'A5'],
        frames: [
          ['A1~9,3', 'A2~16,8', 'A3~12,17', 'A4~3,10', 'A5~7,14', '# Dribble around the square'],
          [
            'A1~10,3.5', 'A2~16.5,9', 'A3~11,17', 'A4~3,9', 'A5~7.5,13',
            '# "Coach says knee!" Stop it, knee on the ball'
          ]
        ]
      },
      signals: [], goesWith: ['sharks-and-minnows', '3v3-small-sided'], tags: ['fun', 'young', 'no-prep']
    },

    {
      id: 'red-light-green-light', v: 1, name: 'Red light, green light', type: 'warmup',
      summary: 'Dribble on green, slow down on yellow, stop the ball dead on red. Change of pace for the youngest.',
      ages: [4, 8], level: 1, players: { min: 1, best: 10, max: 16 }, gk: 0, minutes: [5, 10], intensity: 2,
      space: [20, 25], kit: { balls: 'each', cones: 4 },
      setupMins: 1, adults: 1, indoor: true, groups: ['solo'], involvement: 2, competitive: false,
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
      diagram: {
        area: [26, 16], mark: 'none',
        lines: [[1, 0, 1, 16], [24, 0, 24, 16]],
        labels: [[3.5, 0.6, 'START'], [21.5, 0.6, 'FINISH']],
        players: { A1: [1, 3], A2: [1, 7], A3: [1, 11], A4: [1, 15], C: [26, 8] },
        ball: ['A1', 'A2', 'A3', 'A4'],
        frames: [
          ['A1~10,3', 'A2~11,7', 'A3~9,11', 'A4~10,15', '# Green: dribble'],
          [
            'A1~13,3', 'A2~13.5,7', 'A3~11.5,11', 'A4~12.5,15',
            '# Yellow: tiny touches. Red: sole on it, stop dead'
          ],
          ['A1~23,3', 'A2~23,7', 'A3~23,11', 'A4~23,15', '# Green again, all the way to the finish']
        ]
      },
      signals: [], goesWith: ['coach-says', 'hungry-hippos'], tags: ['fun', 'young', 'no-prep']
    },

    {
      id: 'injury-prevention-warmup', v: 1, name: 'Injury-prevention warm-up', type: 'warmup',
      summary: 'Fifteen minutes of running, strength, balance and landing work that has been shown to cut injuries when done twice a week.',
      ages: [8, 19], level: 1, players: { min: 1, best: 14, max: 30 }, gk: 0, minutes: [12, 20], intensity: 2,
      space: [20, 30], kit: { cones: 12, balls: 6 },
      setupMins: 3, adults: 1, indoor: true, groups: ['pairs', 'squad'], involvement: 2, competitive: false,
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
      diagram: {
        area: [32, 12], mark: 'none',
        cones: [
          [1, 3], [7, 3], [13, 3], [19, 3], [25, 3], [31, 3], [1, 9], [7, 9], [13, 9], [19, 9], [25, 9],
          [31, 9]
        ],
        players: { A1: [1, 4.5], A2: [1, 7.5], A3: [-1, 4.5], A4: [-1, 7.5] },
        frames: [
          ['A1-15.5,5.4', 'A2-15.5,6.6', '# Jog out with hip openers; meet in the middle'],
          [
            'A1-31,4.5', 'A2-31,7.5', 'A3-12,4.5', 'A4-12,7.5',
            '# Back with side shuffles; then strength work'
          ]
        ]
      },
      signals: ['late-goals'], goesWith: ['pass-and-follow', 'rondo-4v1'], tags: ['every-session', 'injury-prevention']
    },

    {
      id: 'pass-and-follow', v: 1, name: 'Pass and follow', type: 'warmup',
      summary: 'Two lines facing each other: pass across, follow your pass to the back of the other line.',
      ages: [7, 19], level: 1, players: { min: 4, best: 8, max: 12 }, gk: 0, minutes: [8, 12], intensity: 2,
      space: [5, 15], kit: { balls: 2, cones: 2 },
      setupMins: 1, adults: 1, indoor: true, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [20, 6], mark: 'none',
        cones: [[5, 4.6], [15, 4.6]],
        players: { A1: [5, 3], A3: [3.5, 3], A5: [2, 3], A2: [15, 3], A4: [16.5, 3], A6: [18, 3] },
        ball: 'A1',
        frames: [
          ['A1>A2', 'A1-19.5,1', 'A3-5,3', 'A5-3.5,3', '# Pass across, follow it to the back of the line'],
          ['A2>A3', 'A2-0.5,5', 'A4-15,3', 'A6-16.5,3', '# The pass comes back; she follows it too']
        ]
      },
      signals: ['possession', 'solo-goals'], goesWith: ['passing-diamond', 'rondo-4v1'], tags: ['no-prep']
    },

    {
      id: 'rondo-4v1', v: 1, name: 'Rondo 4v1', type: 'warmup',
      summary: 'Four players round a square keep the ball from one defender in the middle.',
      ages: [8, 19], level: 1, players: { min: 5, best: 10, max: 20 }, gk: 0, minutes: [8, 15], intensity: 2,
      space: [10, 10], kit: { balls: 2, cones: 4, bibs: 4 },
      setupMins: 2, adults: 1, indoor: true, groups: ['small'], involvement: 3, competitive: true,
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
      diagram: {
        area: [10, 10], mark: 'grid',
        cones: [[0, 0], [10, 0], [0, 10], [10, 10]],
        players: { A1: [5, 0], A2: [10, 5], A3: [5, 10], A4: [0, 5], D1: [5, 5] },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D1-A2', '# Two touches, round the defender'],
          ['A2>A3', 'D1-A3', 'A4-0,7.5', '# Move along your side to open an angle'],
          ['A3>A4', 'D1-A4', 'A1-3,0', '# Lose it, and you go in the middle']
        ]
      },
      signals: ['possession'], goesWith: ['rondo-5v2', 'keep-away-4v4-plus-2'], tags: ['classic']
    },

    {
      id: 'dribble-relays', v: 1, name: 'Dribbling relays', type: 'warmup',
      summary: 'Teams in lines race a ball round a slalom and back, with a new rule each round.',
      ages: [5, 11], level: 1, players: { min: 6, best: 12, max: 24 }, gk: 0, minutes: [8, 12], intensity: 3,
      space: [15, 20], kit: { balls: 4, cones: 24 },
      setupMins: 4, adults: 1, indoor: true, groups: ['teams'], involvement: 2, competitive: true,
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
      diagram: {
        area: [20, 14], mark: 'none',
        cones: [
          [5, 3], [7, 3], [9, 3], [11, 3], [13, 3], [17, 3], [5, 7], [7, 7], [9, 7], [11, 7], [13, 7],
          [17, 7], [5, 11], [7, 11], [9, 11], [11, 11], [13, 11], [17, 11]
        ],
        players: { A1: [2.5, 3], A2: [1, 3], D1: [2.5, 7], D2: [1, 7], B1: [2.5, 11], B2: [1, 11] },
        ball: ['A1', 'D1', 'B1'],
        frames: [
          ['A1~17,4.5', 'D1~16,8.5', 'B1~15,12.5', '# Weave through the cones, round the end one'],
          ['A1~4,4.4', 'D1~5,8.5', 'B1~6,12.5', '# Big touch and sprint back'],
          ['A2*A1', 'D2*D1', 'B2*B1', '# Stop it dead for the next player']
        ]
      },
      signals: [], goesWith: ['turns-station'], tags: ['fun', 'young']
    },

    {
      id: 'skill-move-tag', v: 1, name: 'Skill-move tag', type: 'warmup',
      summary: 'Everyone dribbles while taggers hunt. You\'re safe only while you\'re doing the move the coach called.',
      ages: [6, 12], level: 1, players: { min: 6, best: 14, max: 24 }, gk: 0, minutes: [8, 12], intensity: 3,
      space: [25, 25], kit: { balls: 'each', cones: 4, bibs: 3 },
      setupMins: 1, adults: 1, indoor: true, groups: ['squad'], involvement: 3, competitive: true,
      positions: ALL, skills: ['dribbling', 'ball-mastery', '1v1-attack'], principles: ['creativity'],
      moments: ['attack'], physical: ['agility', 'speed'],
      setup: 'A 25 × 25 yd square. Everyone with a ball except two or three taggers in bibs.',
      how: [
        'Players dribble around; taggers try to tag anyone with a hand.',
        'The coach calls the safe move: step-over, sole roll, toe taps. Doing it makes you safe for three seconds.',
        'Tagged? Swap: take the tagger\'s bib, and she takes your ball.',
        'Change the safe move every minute.'
      ],
      points: ['Do the move properly to be safe: half a step-over doesn\'t count.', 'Head up to see the taggers coming.'],
      questions: ['Which move kept you safest? Why?'],
      mistakes: ['Players freezing in the move for ever: three seconds, then off again.'],
      why: 'Moves practised with a chaser stick. It\'s the same move as at the cone, but now there\'s a reason to do it fast with the head up.',
      easier: ['One tagger, a bigger square.'],
      harder: ['Taggers dribble a ball too.', 'Safe only with the weaker foot.'],
      diagram: {
        area: [25, 25], mark: 'grid', cones: [[0, 0], [25, 0], [0, 25], [25, 25]],
        players: { A1: [5, 5], A2: [16, 6], A3: [20, 17], A4: [8, 19], A5: [13, 12], D1: [11, 3], D2: [4, 13] },
        ball: ['A1', 'A2', 'A3', 'A4', 'A5'],
        frames: [
          ['A1~9,8', 'A2~19,10', 'A3~17,21', 'A4~5,16', 'A5~15,15', 'D1-A2', 'D2-A4', '# Dribble; the taggers hunt'],
          ['A2~19.6,10.6', 'D1-A2', 'A4~4,17', 'D2-A4', '# Doing the called move? Safe'],
          ['D2*A4', '# Tagged: swap the bib for the ball']
        ]
      },
      signals: ['possession'], goesWith: ['ball-mastery-box', 'sharks-and-minnows'], tags: ['fun', 'young']
    },

    {
      id: 'dribble-knockout', v: 1, name: 'Knockout', type: 'warmup',
      summary: 'Everyone dribbles in a circle, protecting their own ball and knocking out everyone else\'s.',
      ages: [6, 14], level: 1, players: { min: 6, best: 12, max: 20 }, gk: 0, minutes: [6, 10], intensity: 3,
      space: [20, 20], kit: { balls: 'each', cones: 12 },
      setupMins: 2, adults: 1, indoor: true, groups: ['squad'], involvement: 3, competitive: true,
      positions: ALL, skills: ['dribbling', 'shielding', 'scanning'], principles: [],
      moments: ['attack', 'defend'], physical: ['agility', 'strength', 'balance'],
      setup: 'A circle of cones about 18 yd across. Everyone inside with a ball.',
      how: [
        'Keep your own ball inside the circle and knock everyone else\'s out.',
        'Ball knocked out? Fetch it, do ten toe taps, and come back in. Nobody sits out.',
        'Count how many you knock out in two minutes.'
      ],
      points: ['Ball on the far side of your body from the nearest player.', 'Attack the ball, not the player.', 'Look up between touches: who\'s coming?'],
      questions: ['Was it easier to attack or to protect? Why?'],
      mistakes: ['Kicking your own ball away to keep it safe: it has to stay close to count.'],
      why: 'Shielding, scanning and tackling all at once, with pressure from every side. It\'s what a crowded youth game feels like.',
      easier: ['A bigger circle, and walking pace for the first minute.'],
      harder: ['A smaller circle.', 'Weaker foot only.'],
      diagram: {
        area: [20, 20], mark: 'none',
        cones: [[10, 1], [14.5, 2.2], [17.8, 5.5], [19, 10], [17.8, 14.5], [14.5, 17.8], [10, 19], [5.5, 17.8], [2.2, 14.5], [1, 10], [2.2, 5.5], [5.5, 2.2]],
        players: { A1: [6, 6], A2: [14, 6], A3: [5, 12], A4: [11, 10], A5: [15, 14], A6: [9, 15] },
        ball: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
        frames: [
          ['A1~9,4.5', 'A2~16,8', 'A3~8,10.5', 'A4~12,8.5', 'A5~13,16', 'A6~6,14', '# Dribble; keep yours inside the circle'],
          ['A3~10.6,9.4', 'A4~14,7', 'A6~5,12', 'A5~10,16.5', '# Protect yours, attack theirs']
        ]
      },
      signals: ['possession', 'fouls'], goesWith: ['shielding-battles', 'skill-move-tag'], tags: ['fun', 'competitive']
    },

    {
      id: 'numbers-passing', v: 1, name: 'Passing by numbers', type: 'warmup',
      summary: 'Players numbered 1 to 6 keep moving round a grid and pass in order: always know where your next number is.',
      ages: [8, 19], level: 2, players: { min: 6, best: 8, max: 12 }, gk: 0, minutes: [8, 12], intensity: 2,
      space: [25, 25], kit: { balls: 3, cones: 4 },
      setupMins: 1, adults: 1, indoor: true, groups: ['small'], involvement: 3, competitive: false,
      positions: ALL, skills: ['passing', 'first-touch', 'scanning', 'movement'], principles: ['support'],
      moments: ['attack'], physical: ['endurance'],
      setup: 'A 25 × 25 yd grid. Groups of six to eight, each player with a number. One ball per group to start.',
      how: [
        'Everyone keeps moving. 1 passes to 2, 2 to 3, and so on; the last number passes back to 1.',
        'Once it flows: two touches max, then one.',
        'Add a second ball starting with 4. Then a third.',
        'Reverse the order on the coach\'s call.'
      ],
      points: ['Know where your passer is, and where your receiver is, before the ball comes.', 'Move into a space where your passer can find you.', 'Pass to the foot away from traffic.'],
      questions: ['How did you find your next number so quickly?'],
      mistakes: ['Players standing still waiting: everyone moves all the time, including straight after passing.'],
      why: 'It trains looking up twice: once for the ball coming, once for the pass going. Scanning before receiving is what lets a player play quickly in a game.',
      easier: ['Stand still and pass first; then add walking.'],
      harder: ['Two groups in the same grid.', 'A defender who tries to intercept.'],
      diagram: {
        area: [25, 25], mark: 'grid', cones: [[0, 0], [25, 0], [0, 25], [25, 25]],
        players: { A1: [4, 5], A2: [14, 4], A3: [21, 11], A4: [16, 20], A5: [7, 21], A6: [10, 13] },
        ball: 'A1',
        frames: [
          ['A1>A2', 'A3-19,8', 'A5-5,17', '# 1 to 2, and everyone keeps moving'],
          ['A2>A3', 'A1-8,9', 'A4-18,16', '# 2 to 3: find your next number early'],
          ['A3>A4', 'A6-12,10', 'A2-12,6', '# 3 to 4…'],
          ['A4>A5', '# …and on round, then back to 1']
        ]
      },
      signals: ['possession'], goesWith: ['partner-passing-on-the-move', 'rondo-4v1'], tags: ['no-prep']
    },

    {
      id: 'partner-passing-on-the-move', v: 1, name: 'Pairs on the move', type: 'warmup',
      summary: 'Pairs pass while moving round a busy grid: short, long and one-twos with other pairs, on the call.',
      ages: [8, 19], level: 1, players: { min: 4, best: 12, max: 24 }, gk: 0, minutes: [8, 10], intensity: 2,
      space: [25, 25], kit: { balls: 6, cones: 4 },
      setupMins: 1, adults: 1, indoor: true, groups: ['pairs'], involvement: 3, competitive: false,
      positions: ALL, skills: ['passing', 'first-touch', 'movement', 'scanning'], principles: ['support'],
      moments: ['attack'], physical: ['endurance'],
      setup: 'A 25 × 25 yd grid, pairs with one ball, everyone inside.',
      how: [
        'Pairs pass while jogging round the grid, never standing still.',
        'Calls: "Short" (under 5 yd), "Long" (across the grid), "Wall" (a one-two with another pair).',
        'Up to half pace, then three-quarter pace.'
      ],
      points: ['Pass in front of your partner, into her path.', 'Look up: the grid is busy.', 'Receive on the move. Don\'t stop to control it.'],
      questions: ['Where should the pass go when your partner is running?'],
      mistakes: ['Passing to her feet when she\'s moving: lead her.'],
      why: 'Passing on the move is the kind that happens in games. A warm-up built on it gets players ready and teaches weighting a pass into a run.',
      easier: ['Walking pace, short passes only.'],
      harder: ['One touch.', 'Weaker foot only.'],
      diagram: {
        area: [25, 25], mark: 'grid', cones: [[0, 0], [25, 0], [0, 25], [25, 25]],
        players: { A1: [4, 5], A2: [9, 9], D1: [18, 4], D2: [21, 10], B1: [7, 19], B2: [14, 20] },
        ball: ['A1', 'D1', 'B1'],
        frames: [
          ['A2-13,7', 'A1>A2', 'D2-20,15', 'D1>D2', 'B2-16,16', 'B1>B2', '# Pass into her path, not to her feet'],
          ['A1-11,12', 'A2>A1', 'D1-14,11', 'D2>D1', 'B1-10,15', 'B2>B1', '# Keep moving; she passes it back ahead of you']
        ]
      },
      signals: ['possession'], goesWith: ['numbers-passing', 'passing-diamond'], tags: ['no-prep']
    },

    {
      id: 'tails', v: 1, name: 'Tails', type: 'warmup',
      summary: 'Everyone dribbles with a bib tucked in as a tail, and tries to pull other players\' tails without leaving their own ball.',
      ages: [4, 9], level: 1, players: { min: 4, best: 10, max: 20 }, gk: 0, minutes: [5, 10], intensity: 3,
      space: [20, 20], kit: { balls: 'each', cones: 4, bibs: 12 },
      setupMins: 1, adults: 1, indoor: true, groups: ['solo'], involvement: 3, competitive: true,
      positions: ALL, skills: ['dribbling', 'scanning', 'shielding'], principles: [],
      moments: ['attack', 'defend'], physical: ['agility', 'speed'],
      setup: 'A 20 × 20 yd square. A ball each, and a bib tucked into the back of everyone\'s shorts as a tail, most of it hanging out.',
      how: [
        'Everyone dribbles inside the square, keeping her ball close.',
        'While dribbling, try to pull other players\' tails. A tail grabbed with your ball left behind doesn\'t count.',
        'Lost your tail? Five toe taps, tuck it back in and carry on. Nobody is ever out.',
        'Rounds of a minute. Count the tails you collected, then beat it next round.'
      ],
      points: [
        'Keep the ball close, so your eyes can be up looking for tails.',
        'Turn your back on a chaser: your body protects the ball and the tail.',
        'Change direction sharply. A chaser can\'t follow a quick turn.'
      ],
      questions: ['How did you keep your tail and your ball at the same time?', 'Where in the square was it safest?'],
      mistakes: [
        'Leaving the ball to chase a tail: it only counts with your ball at your feet.',
        'Grabbing shirts and pushing: hands touch tails and nothing else.'
      ],
      why: 'Dribbling with the head up, without anyone having to tell the youngest to look up. They have to, or they lose their tail.',
      easier: ['Only the coach and a helper chase tails, without a ball.'],
      harder: ['A smaller square.', 'Weaker foot only, or a tail only counts if you have just done a turn.'],
      diagram: {
        area: [20, 20], mark: 'grid',
        cones: [[0, 0], [20, 0], [0, 20], [20, 20]],
        players: { A1: [4, 5], A2: [10, 8], A3: [15, 14], A4: [6, 15], A5: [14, 4] },
        ball: ['A1', 'A2', 'A3', 'A4', 'A5'],
        frames: [
          ['A1~8,7', 'A2~13,10', 'A3~12,17', 'A4~3,11', 'A5~17,6', '# Dribble, and reach for other tails'],
          ['A1~11,9.5', 'A2~16,13', 'A3~9,16', 'A4~6,7', 'A5~16,2.5', '# Turn away: shield your ball and tail']
        ]
      },
      signals: ['possession'], goesWith: ['sharks-and-minnows', 'coach-says'], tags: ['fun', 'young', 'no-prep']
    },

    {
      id: 'copy-cat', v: 1, name: 'Copy cat', type: 'warmup',
      summary: 'In pairs with a ball each: the leader dribbles and does anything she likes, and her copy cat copies it.',
      ages: [4, 8], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [5, 10], intensity: 2,
      space: [20, 20], kit: { balls: 'each', cones: 4 },
      setupMins: 1, adults: 1, indoor: true, groups: ['pairs'], involvement: 3, competitive: false,
      positions: ALL, skills: ['ball-mastery', 'dribbling', 'scanning'], principles: ['creativity'],
      moments: ['attack'], physical: ['coordination', 'agility'],
      setup: 'A small square, a ball each, players in pairs: a leader and a copy cat.',
      how: [
        'The leader dribbles anywhere and does anything: stop, turn, a sole roll, a silly move.',
        'The copy cat follows a couple of steps behind with her own ball and copies everything.',
        'Swap every minute. For the last round, the coach is the leader for everyone.'
      ],
      points: [
        'Watch your leader, not your ball. Little touches let you look up.',
        'Leaders: invent something. The sillier the better.'
      ],
      questions: ['What was the best move your partner showed you?'],
      mistakes: ['The leader running away at full speed: the game is to be copied, not to escape.'],
      why: 'The youngest pick moves up fastest from each other, and following someone takes their eyes off the ball. Every player is touching the ball the whole time.',
      easier: ['Everyone copies the coach, at walking pace.'],
      harder: [
        'The leader says her move as she does it, and the copy cat does it with the other foot.',
        'Threes: copy the leader, and the third player copies the copy.'
      ],
      diagram: {
        area: [20, 20], mark: 'grid',
        cones: [[0, 0], [20, 0], [0, 20], [20, 20]],
        players: { A1: [5, 5], A2: [3, 3], A3: [14, 12], A4: [12, 10] },
        ball: ['A1', 'A2', 'A3', 'A4'],
        frames: [
          ['A1~10,8', 'A2~8,6.5', 'A3~15,17', 'A4~14,15', '# The leader dribbles; the copy cat follows'],
          ['A1~15,5', 'A2~12,6.5', 'A3~9,16', 'A4~11,14', '# She turns, so her copy cat turns too']
        ]
      },
      signals: [], goesWith: ['coach-says', 'ball-mastery-box'], tags: ['young', 'no-prep']
    },

    {
      id: 'pass-and-prepare', v: 1, name: 'Pass and prepare', type: 'warmup',
      summary: 'Pairs pass across a cone square; after every pass, the passer does the called warm-up movement in the square and is back for the return.',
      ages: [10, 19], level: 1, players: { min: 2, best: 12, max: 24 }, gk: 0, minutes: [10, 12], intensity: 2,
      space: [20, 15], kit: { balls: 12, cones: 24 },
      setupMins: 3, adults: 1, indoor: true, groups: ['pairs'], involvement: 3, competitive: false,
      positions: ALL, skills: ['passing', 'first-touch'], principles: [],
      moments: ['attack'], physical: ['agility', 'coordination', 'speed'],
      setup: 'Pairs, 15 to 18 yd apart, a ball between them. Halfway between them and a few yards to one side, a small square of four cones about 3 yd across. Several pairs side by side.',
      how: [
        'Pass to your partner, then run into the square, do the movement the coach called, and get back to your spot for her return pass.',
        'The movements build up a minute at a time: jog, skips, open the gate (knee up and out), close the gate, side shuffle, backwards, quick feet, then a short sprint.',
        'The receiver\'s first touch goes out of her feet before she passes, so the ball keeps moving.',
        'Last two minutes: one touch, at match pace.'
      ],
      points: [
        'First touch out of your feet, to the side you will pass with.',
        'Pass on the ground, firm, to her front foot.',
        'Movements big and controlled, not rushed.'
      ],
      questions: ['Which way did your first touch go, and why?'],
      mistakes: [
        'Rushing the movements to get back: the movements are the warm-up, the ball keeps it fun.',
        'Toe-poked passes as legs tire: slow the movements down, not the passing.'
      ],
      why: 'It covers the same ground as a running warm-up, the movements that get legs ready to sprint and turn, with a ball every few seconds so it never feels like laps.',
      easier: ['A shorter distance, as many touches as she likes.'],
      harder: ['One touch.', 'Threes, passing round a triangle with a square in the middle.'],
      diagram: {
        area: [20, 11], mark: 'none',
        cones: [[8.5, 6.5], [11.5, 6.5], [8.5, 9.5], [11.5, 9.5]],
        players: { A1: [2, 3], A2: [18, 3] },
        ball: 'A1',
        frames: [
          ['A1>A2', '# Pass to your partner…'],
          ['A1-10,8', 'A2~16.5,3.5', '# …into the square: "Skips!"'],
          ['A1-2,3', 'A2>A1', '# Back out in time for her pass']
        ]
      },
      signals: ['late-goals'], goesWith: ['injury-prevention-warmup', 'passing-diamond'], tags: ['every-session']
    },

    /* ---------------- technique ---------------- */

    {
      id: 'passing-diamond', v: 1, name: 'Passing diamond', type: 'technical',
      summary: 'Four cones in a diamond: pass, set back, and play round the corner. Give-and-goes and third-man runs, unopposed.',
      ages: [10, 19], level: 2, players: { min: 5, best: 8, max: 10 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [20, 20], kit: { balls: 2, cones: 4 },
      setupMins: 2, adults: 1, indoor: true, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [24, 24], mark: 'none',
        cones: [[12, 1], [23, 12], [12, 23], [1, 12]],
        players: { A1: [12, 22], A5: [13.8, 23.4], A2: [1, 11], A3: [12, 0.5], A4: [23, 11] },
        ball: 'A1',
        frames: [
          ['A1>A2', 'A1-7,17', '# Pass to the next cone and step up'],
          ['A2>A1', '# Set it back, firm, to the front foot'],
          ['A1>A3', 'A1-1.5,14', 'A2-8,3', '# Play it on, then everyone moves one cone on']
        ]
      },
      signals: ['possession', 'solo-goals'], goesWith: ['pass-and-follow', 'keep-away-4v4-plus-2'], tags: []
    },

    {
      id: 'open-up-and-turn', v: 1, name: 'Open up and turn', type: 'technical',
      summary: 'Receive half-turned from a server, check the shoulder, turn and play through a gate on the far side.',
      ages: [8, 19], level: 2, players: { min: 3, best: 6, max: 12 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [15, 25], kit: { balls: 6, cones: 8, bibs: 2 },
      setupMins: 3, adults: 1, indoor: true, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [25, 16], mark: 'none',
        cones: [[24, 3], [24, 5], [24, 11], [24, 13]],
        players: { C: [1, 8], A1: [12, 8] },
        ball: 'C',
        frames: [
          ['A1-15,9.5', '# Check away first'],
          ['A1-11,8', 'C>A1', '# Show for it, and glance over your shoulder'],
          ['A1~18,6', '# Open your hips and turn with the first touch'],
          ['A1>25,4', '# Play through a gate']
        ]
      },
      signals: ['possession'], goesWith: ['shoulder-check-colours', 'keep-away-4v4-plus-2'], tags: []
    },

    {
      id: 'shoulder-check-colours', v: 1, name: 'Shoulder-check colours', type: 'technical',
      summary: 'A coach behind the receiver holds up a colour. She has to see it and shout it before the ball arrives, then play to that colour.',
      ages: [9, 19], level: 2, players: { min: 3, best: 6, max: 10 }, gk: 0, minutes: [8, 12], intensity: 1,
      space: [20, 20], kit: { balls: 4, cones: 12 },
      setupMins: 3, adults: 1, indoor: true, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [24, 16], mark: 'none',
        labels: [[20, 1.6, 'RED'], [20, 6.6, 'BLUE'], [20, 11.6, 'YELLOW']],
        cones: [[23, 2], [23, 4], [23, 7], [23, 9], [23, 12], [23, 14]],
        players: { C1: [1, 8], A1: [10, 8], C2: [15, 13.5] },
        ball: 'C1',
        frames: [
          ['C1>A1', '# As the ball travels, she looks back: "Blue!"'],
          ['A1~13.5,8.4', '# Turn with the first touch'],
          ['A1>24,8', '# Play it through the colour she saw']
        ]
      },
      signals: ['possession'], goesWith: ['open-up-and-turn', 'rondo-5v2'], tags: []
    },

    {
      id: 'turns-station', v: 1, name: 'Turns station', type: 'technical',
      summary: 'Dribble at a line, turn on the coach\'s call (Cruyff, drag back, hook) and accelerate away.',
      ages: [6, 14], level: 1, players: { min: 1, best: 10, max: 20 }, gk: 0, minutes: [8, 12], intensity: 2,
      space: [20, 15], kit: { balls: 'each', cones: 10 },
      setupMins: 2, adults: 1, indoor: true, groups: ['solo'], involvement: 3, competitive: false,
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
      diagram: {
        area: [20, 14], mark: 'none',
        cones: [[2, 1], [2, 4], [2, 7], [2, 10], [2, 13], [16, 1], [16, 4], [16, 7], [16, 10], [16, 13]],
        players: { A1: [3, 2.5], A2: [3, 5.5], A3: [3, 8.5], A4: [3, 11.5], C: [19, 7] },
        ball: ['A1', 'A2', 'A3', 'A4'],
        frames: [
          ['A1~15,2.5', 'A2~15,5.5', 'A3~15,8.5', 'A4~15,11.5', '# Dribble at the far line'],
          ['A1~5,3.3', 'A2~5,6.3', 'A3~5,9.3', 'A4~5,12.3', '# Turn on the call: slow in, fast out']
        ]
      },
      signals: ['possession'], goesWith: ['1v1-moves', 'shielding-battles'], tags: []
    },

    {
      id: '1v1-moves', v: 1, name: '1v1 moves', type: 'technical',
      summary: 'Learn a move to beat a defender (scissors, step-over, body feint) on a cone, then on a passive defender, then live.',
      ages: [7, 19], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [20, 25], kit: { balls: 'each', cones: 10 },
      setupMins: 2, adults: 1, indoor: true, groups: ['solo', 'pairs'], involvement: 3, competitive: false,
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
      diagram: {
        area: [20, 16], mark: 'none',
        lines: [[1, 0, 1, 16]],
        cones: [[11, 3], [11, 8], [11, 13]],
        players: { A1: [1, 3], A2: [1, 8], A3: [1, 13] },
        ball: ['A1', 'A2', 'A3'],
        frames: [
          ['A1~8.5,3', 'A2~8.5,8', 'A3~8.5,13', '# Dribble at the "defender" at speed'],
          ['A1~17,1.2', 'A2~17,10', 'A3~17,14.8', '# The move two yards out, then burst past']
        ]
      },
      signals: ['one-scorer', 'few-shots'], goesWith: ['1v1-to-mini-goals', 'turns-station'], tags: []
    },

    {
      id: 'juggling-ladder', v: 1, name: 'Juggling ladder', type: 'technical',
      summary: 'A ladder of juggling levels, from bounce-and-catch to alternate feet, with personal bests.',
      ages: [7, 19], level: 1, players: { min: 1, best: 12, max: 30 }, gk: 0, minutes: [5, 10], intensity: 1,
      space: [20, 20], kit: { balls: 'each' },
      setupMins: 0, adults: 1, indoor: true, groups: ['solo'], involvement: 3, competitive: true,
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
      diagram: {
        area: [24, 10], mark: 'none',
        lines: [[0, 9.5, 24, 9.5]],
        labels: [[3, 2.2, 'KICK, CATCH'], [9, 2.2, 'BOUNCE'], [15, 2.2, 'NO BOUNCE'], [21, 2.2, 'BOTH FEET']],
        players: { A1: [3, 6], A2: [9, 6], A3: [15, 6], A4: [21, 6] },
        ball: ['A1', 'A2', 'A3', 'A4']
      },
      signals: [], goesWith: [], tags: ['homework', 'no-prep']
    },

    {
      id: 'driven-passes', v: 1, name: 'Driven and lofted passes', type: 'technical',
      summary: 'Pairs 25 to 40 yd apart strike driven passes along the ground, then lofted ones, and control them.',
      ages: [11, 19], level: 2, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [30, 40], kit: { balls: 6, cones: 10 },
      setupMins: 2, adults: 1, indoor: false, groups: ['pairs'], involvement: 2, competitive: false,
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
      diagram: {
        area: [30, 20], mark: 'none',
        labels: [[15, 1, '25 TO 40 YD']],
        players: { A1: [2, 4], A2: [28, 4], A3: [2, 10], A4: [28, 10], A5: [2, 16], A6: [28, 16] },
        ball: ['A1', 'A4', 'A5'],
        frames: [
          ['A1>A2', 'A4>A3', 'A5>A6', '# Driven, along the ground, to feet'],
          ['A2~28,6', 'A3~2,12', 'A6~28,18', '# One touch out to the side'],
          ['A2>A1', 'A3>A4', 'A6>A5', '# Strike it back. Then lofted']
        ]
      },
      signals: ['possession'], goesWith: ['four-goal-game', 'build-out-play'], tags: []
    },

    {
      id: 'heading-basics', v: 1, name: 'Heading basics', type: 'technical',
      summary: 'Heading technique from a hand-tossed light ball: forehead, eyes open, neck firm. Low numbers of headers, kept that way.',
      ages: [12, 19], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [5, 10], intensity: 1,
      space: [20, 20], kit: { balls: 6 },
      setupMins: 1, adults: 1, indoor: true, groups: ['pairs'], involvement: 2, competitive: false,
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
      diagram: {
        area: [16, 10], mark: 'none',
        players: { A1: [3, 2.5], A2: [9, 2.5], A3: [3, 7.5], A4: [9, 7.5] },
        ball: ['A1', 'A3'],
        frames: [
          ['A1>A2', 'A3>A4', '# A soft toss underhand'],
          ['A2>A1', 'A4>A3', '# Forehead, eyes open: head it back into her hands']
        ]
      },
      signals: ['corners-against'], goesWith: ['defending-corners'], tags: ['check-local-rules']
    },

    {
      id: 'crossing-and-finishing', v: 1, name: 'Crossing and finishing', type: 'technical',
      summary: 'A wide player gets to the byline and crosses; two attackers attack the near post and the far post.',
      ages: [10, 19], level: 2, players: { min: 5, best: 10, max: 14 }, gk: 1, minutes: [15, 20], intensity: 2,
      space: [44, 30], kit: { balls: 12, cones: 8, goals: 1 },
      setupMins: 6, adults: 1, indoor: false, groups: ['small'], involvement: 1, competitive: false,
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
      diagram: {
        area: [60, 30], mark: 'box',
        goals: [[30, 0, 'big', 's']],
        cones: [[8, 4], [8, 11], [8, 18], [8, 25], [52, 4], [52, 11], [52, 18], [52, 25]],
        players: { K: [30, 1.5], A1: [4, 28], A2: [24, 25], A3: [36, 25], A4: [30, 29], C: [14, 29.5] },
        ball: 'C',
        frames: [
          ['C>4,20', 'A1-4,21', '# The coach plays it into the channel'],
          ['A1~4,4', 'A2-24,14', 'A3-36,14', 'A4-30,22', '# Drive to the byline; runners set off'],
          ['A2-26.5,4', 'A3-37,5', 'A4-30,13', 'A1>A2', '# Cross early: near post, far post, cut-back'],
          ['A2>G', '# Finish first time']
        ]
      },
      signals: ['few-shots', 'solo-goals', 'one-scorer'], goesWith: ['overlap-2v1-wide', 'attacking-corners'], tags: []
    },

    {
      id: 'lay-off-and-shoot', v: 1, name: 'Lay-off and shoot', type: 'technical',
      summary: 'Pass into a server at the top of the box, take the lay-off first time, follow in for the rebound.',
      ages: [8, 19], level: 1, players: { min: 4, best: 8, max: 12 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 25], kit: { balls: 12, cones: 4, goals: 1 },
      setupMins: 4, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
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
      diagram: {
        area: [44, 34], mark: 'box',
        goals: [[22, 0, 'big', 's']],
        balls: [[28, 33.6], [29, 33.2], [28.6, 32.4]],
        players: { K: [22, 1.5], N1: [22, 20.5], A1: [24, 32], A2: [21, 33.5], A3: [18, 33.5] },
        ball: 'A1',
        frames: [
          ['A1>N1', '# Pass into the server'],
          ['A1-25,19.5', 'N1>A1', '# She lays it into your path'],
          ['A1>G', '# Strike first time, low and across the keeper'],
          ['A1-24,9', '# Follow it in for the rebound']
        ]
      },
      signals: ['few-shots', 'off-target', 'one-scorer'], goesWith: ['turn-and-shoot', 'world-cup'], tags: ['finishing']
    },

    {
      id: 'move-combinations', v: 1, name: 'Move combinations', type: 'technical',
      summary: 'Chain two moves (a feint into a cut, scissors into a drag back) so a defender who reads the first is beaten by the second.',
      ages: [9, 19], level: 3, players: { min: 1, best: 10, max: 20 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [26, 12], kit: { balls: 'each', cones: 12 },
      setupMins: 3, adults: 1, indoor: true, groups: ['solo', 'pairs'], involvement: 3, competitive: false,
      positions: ['Mid', 'Wing', 'Forward'], skills: ['1v1-attack', 'dribbling', 'ball-mastery'], principles: ['creativity', 'penetration'],
      moments: ['attack'], physical: ['agility', 'coordination'],
      setup: 'Lanes of three cones 6 yd apart, each cone a "defender". A start cone at the head of each lane and a ball each.',
      how: [
        'At the first cone: body feint one way, then cut the other way with the outside of the foot.',
        'At the second: scissors, then drag back and go the way you came.',
        'At the third: step-over, then a Cruyff turn and away.',
        'Then free choice: two moves at every cone, never the same pair twice.',
        'Finish with a partner as a live defender at the last cone.'
      ],
      points: [
        'The first move has to be believable. Sell it with the shoulders and the eyes.',
        'Change speed between the two. Two moves at one pace is one move.',
        'Close to the cone: the second move happens a yard away, not five.',
        'Both directions, both feet.'
      ],
      questions: ['What did the defender do after your first move?', 'Which pair worked best going to your weaker side?'],
      mistakes: ['Rushing the first move so nobody would fall for it: slow it down and exaggerate it.', 'Starting the moves far from the defender: walk them closer.'],
      why: 'Good defenders learn to read a single move. A player with combinations beats the defender who bit on nothing, which is how 1v1s are won as players get older.',
      easier: ['One move per cone. Walk it, then jog it.'],
      harder: ['A live defender at every cone, in a narrow channel.', 'Finish with a shot or a pass through a gate after the last combination.'],
      diagram: {
        area: [26, 12], mark: 'none',
        cones: [[1, 4.5], [1, 7.5], [7, 6], [13, 6], [19, 6]],
        players: { A1: [1, 6] },
        ball: 'A1',
        frames: [
          ['A1~5,6', '# Dribble at the first "defender"'],
          ['A1~9,4.2', '# Feint, then cut past'],
          ['A1~15,7.8', '# Scissors and drag back at the next'],
          ['A1~23,8.5', '# Step-over into a Cruyff, and away']
        ]
      },
      signals: ['one-scorer', 'few-shots'], goesWith: ['1v1-moves', '1v1-four-sides'], tags: ['ball-skills']
    },

    {
      id: 'fast-footwork', v: 1, name: 'Fast footwork', type: 'technical',
      summary: 'Thirty-second bursts of rapid touches in your own little box: inside-inside, sole rolls, V pulls, la croqueta. Count the reps.',
      ages: [5, 19], level: 2, players: { min: 1, best: 12, max: 30 }, gk: 0, minutes: [8, 12], intensity: 3,
      space: [20, 20], kit: { balls: 'each', cones: 24 },
      setupMins: 4, adults: 1, indoor: true, groups: ['solo'], involvement: 3, competitive: true,
      positions: ALL, skills: ['ball-mastery', 'first-touch', 'dribbling'], principles: [],
      moments: ['attack'], physical: ['agility', 'coordination', 'speed'],
      setup: 'A 2 × 2 yd box of four cones for each player, a ball each. Boxes in rows so the coach can see everyone.',
      how: [
        'Thirty seconds on, thirty off. Count touches in each burst.',
        'Round 1: inside-inside, the ball rolling between the feet.',
        'Round 2: sole rolls across the body, both ways.',
        'Round 3: V pull: pull back with the sole, push forward with the inside of the same foot. Swap feet.',
        'Round 4: la croqueta: inside of one foot to the inside of the other, sideways, quick.',
        'Round 5: the coach changes the move every five seconds.'
      ],
      points: ['On the balls of the feet, knees bent.', 'Light touches. The ball barely moves between them.', 'Let the arms help balance.'],
      questions: ['Which round did your weaker foot slow you down the most?'],
      mistakes: ['Eyes glued to the ball: once the move is smooth, look up at the coach and keep going.'],
      why: 'Quick feet in a tight space are what let a player change direction in traffic, and they come from repetition. A minute of this a day changes a player over a season.',
      easier: ['Fifteen-second bursts, slower, one move only.', 'For the youngest: toe taps and sole rolls only.'],
      harder: ['Eyes up: the coach holds up fingers and players shout the number.', 'A turn out of the box every tenth touch.'],
      diagram: {
        area: [14, 8], mark: 'none',
        labels: [[7, 7.6, '30 SECONDS ON, 30 OFF']],
        cones: [
          [1.8, 2.8], [4.2, 2.8], [1.8, 5.2], [4.2, 5.2], [5.8, 2.8], [8.2, 2.8], [5.8, 5.2], [8.2, 5.2],
          [9.8, 2.8], [12.2, 2.8], [9.8, 5.2], [12.2, 5.2]
        ],
        players: { A1: [3, 4], A2: [7, 4], A3: [11, 4] },
        ball: ['A1', 'A2', 'A3'],
        frames: [
          ['A1~2.4,4', 'A2~7.6,4', 'A3~10.4,4', '# Inside, inside: quick, light touches'],
          ['A1~3.6,4', 'A2~6.4,4', 'A3~11.6,4', '# Sole rolls across the body'],
          ['A1~3,3.6', 'A2~7,4.4', 'A3~11,3.6', '# V pulls, then la croqueta']
        ]
      },
      signals: ['possession'], goesWith: ['ball-mastery-box', 'move-combinations'], tags: ['ball-skills', 'homework']
    },

    {
      id: 'weak-foot-circuit', v: 1, name: 'Weaker-foot circuit', type: 'technical',
      summary: 'Stations where every touch is on the weaker foot: pass through a gate, dribble a slalom, shoot from a lay-off.',
      ages: [8, 19], level: 2, players: { min: 4, best: 12, max: 20 }, gk: 1, minutes: [12, 20], intensity: 2,
      space: [30, 30], kit: { balls: 12, cones: 16, goals: 1 },
      setupMins: 6, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: false,
      positions: OUTFIELD, skills: ['passing', 'first-touch', 'dribbling', 'shooting'], principles: [],
      moments: ['attack'], physical: ['coordination'],
      setup: 'Three stations round a square: a passing gate, a dribbling slalom, and a shooting spot in front of a goal with a keeper and a server. Groups of three or four at each.',
      how: [
        'Every touch is on the weaker foot. Strong-foot touches don\'t count.',
        'Passing: pairs 10 yd apart through a 2 yd gate, receive and pass with the same foot.',
        'Dribbling: a slalom of five cones, outside and inside of the weaker foot only.',
        'Shooting: the server lays it off, strike first time with the weaker foot.',
        'Four minutes per station, then rotate.'
      ],
      points: ['Same technique as the strong foot: locked ankle, standing foot pointing at the target.', 'Slow and right beats fast and wrong. Speed comes later.', 'Praise the attempts, not just the goals.'],
      questions: ['What feels different on your weaker side? What can you copy from your strong side?'],
      mistakes: ['Sneaking the strong foot in when it gets hard: that\'s the moment that matters. Keep count.'],
      why: 'A player with one foot can be shown onto the other and is easy to defend. Two usable feet double the angles she can pass, dribble and shoot from.',
      easier: ['A stationary ball at every station.'],
      harder: ['A passive defender at the dribbling and shooting stations.', 'One touch at the passing station.'],
      diagram: {
        area: [30, 30], mark: 'grid', goals: [[15, 0, 'big', 's']],
        cones: [[0, 0], [30, 0], [0, 30], [30, 30], [2, 17], [4, 17], [10, 27], [13, 27], [16, 27], [19, 27], [22, 27]],
        players: { K: [15, 1.5], A1: [3, 22], A2: [3, 12], A3: [7, 27], N1: [15, 10], A4: [21, 17] },
        ball: ['A1', 'A3', 'A4'],
        frames: [
          ['A1>A2', 'A3~11.5,25.8', 'A4>N1', '# Weaker foot only: pass through the gate'],
          ['A2>A1', 'A3~17.5,28.2', 'A4-18,13', 'N1>A4', '# Slalom; the server lays it off'],
          ['A3~24,27', 'A4>G', '# First time with the weaker foot']
        ]
      },
      signals: ['off-target', 'possession'], goesWith: ['wall-passing', 'lay-off-and-shoot'], tags: ['ball-skills', 'stations']
    },

    {
      id: 'aerial-control', v: 1, name: 'Controlling the high ball', type: 'technical',
      summary: 'Bring a dropping ball down dead with the instep, thigh and chest: self-serve, then a partner\'s throw, then a lofted pass with a defender closing.',
      ages: [9, 19], level: 2, players: { min: 1, best: 10, max: 20 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [20, 20], kit: { balls: 'each', cones: 8, bibs: 4 },
      setupMins: 1, adults: 1, indoor: false, groups: ['solo', 'pairs'], involvement: 3, competitive: false,
      positions: ALL, skills: ['first-touch', 'ball-mastery'], principles: [],
      moments: ['attack'], physical: ['coordination', 'balance'],
      setup: 'Pairs 8 to 10 yd apart, a ball per pair (one each for the self-serve round).',
      how: [
        'Self-serve: throw it up, cushion it dead with the instep, then the thigh, then the chest. Ten each.',
        'A partner throws underhand to each surface in turn. Control it and pass it back along the ground.',
        'A partner serves a lofted pass from 15 yd. Control it into the space you want to go to.',
        'Add a defender who starts 5 yd away as the ball is served.'
      ],
      points: [
        'Get under the ball early: move your feet, then your body.',
        'Cushion: the surface draws back as the ball arrives, like catching an egg.',
        'Chest: lean back for a ball that drops, lean over it to kill one that comes in flat.',
        'First touch away from the defender, not straight down.'
      ],
      questions: ['Which surface worked best for a ball coming in fast and flat?'],
      mistakes: ['Stabbing at it with a stiff leg so it bounces away: relax the ankle and pull back on contact.'],
      why: 'Youth games are full of high balls: clearances, goal kicks, long passes. The team that controls them keeps the ball while the other team is still chasing the bounce.',
      easier: ['A big, soft ball from close in, one surface at a time.'],
      harder: ['Control and play first time to a third player.', 'A live defender from the start.'],
      diagram: {
        area: [22, 11], mark: 'none',
        players: { A1: [3, 3], A2: [13, 3], A3: [3, 8], A4: [13, 8], D1: [20, 10] },
        ball: ['A1', 'A3'],
        frames: [
          ['A1>A2', 'A3>A4', '# A lofted serve, or a throw'],
          ['A2~16,2', 'A4~16,7', 'D1-A4', '# Cushion it into the space you want'],
          ['A2>A1', 'A4>A3', '# Back along the ground']
        ]
      },
      signals: ['possession'], goesWith: ['driven-passes', 'volleys'], tags: ['ball-skills']
    },

    {
      id: 'volleys', v: 1, name: 'Volleys and half-volleys', type: 'technical',
      summary: 'Striking the ball out of the air: side-on volleys from a toss, half-volleys off the bounce, then crosses finished first time.',
      ages: [11, 19], level: 3, players: { min: 4, best: 8, max: 12 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 25], kit: { balls: 12, goals: 1, cones: 4 },
      setupMins: 2, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['Forward', 'Mid', 'Wing'], skills: ['shooting', 'first-touch'], principles: ['penetration'],
      moments: ['attack'], physical: ['coordination', 'balance'],
      setup: 'A goal with a keeper. A server with a pile of balls beside the penalty spot, shooters in a line behind the spot.',
      how: [
        'The server tosses underhand to the shooter\'s side. Side-on volley at goal.',
        'Then a toss that bounces once in front: strike the half-volley as it comes up.',
        'Then a looping serve from wider: volley it back across the goal.',
        'Finish with crosses from a wide server, finished first time.'
      ],
      points: [
        'Watch the ball onto the foot. The head stays still.',
        'Side-on volley: lean away, swing the leg through flat, toe pointed.',
        'Half-volley: knee over the ball as it bounces, or it flies over.',
        'Hit it cleanly. Contact beats power.'
      ],
      questions: ['What did your head do on the one that flew over?'],
      mistakes: ['Leaning back and skying it: chest over the ball, especially on the half-volley.'],
      why: 'Many chances in the box arrive off a bounce or a cross. A player who can strike first time scores before the keeper has set.',
      easier: ['The shooter drops the ball from her own hands.'],
      harder: ['Crosses from both sides, with a defender attacking the ball too.'],
      diagram: {
        area: [44, 25], mark: 'box', goals: [[22, 0, 'big', 's']],
        balls: [[29.5, 13.4], [30.2, 12.6]],
        players: { K: [22, 1.5], C: [28, 12], A1: [22, 15], A2: [22, 18], A3: [22, 21] },
        ball: ['C', 'C'],
        frames: [
          ['C>22.6,12.6', 'A1-22.2,12.2', '# A toss to her side'],
          ['A1>G', 'A1-17,8', '# Side-on volley, first time'],
          ['C>22.6,13', 'A2-22.2,12.6', '# Next: a toss that bounces once'],
          ['A2>G', '# Half-volley: knee over the ball']
        ]
      },
      signals: ['few-shots', 'off-target', 'one-scorer'], goesWith: ['crossing-and-finishing', 'aerial-control'], tags: ['finishing']
    },

    {
      id: 'chip-and-lob', v: 1, name: 'Chips and lobs', type: 'technical',
      summary: 'Get the ball up quickly and drop it softly: chip over a line of cones to a partner, then lob a keeper who has come off her line.',
      ages: [11, 19], level: 3, players: { min: 2, best: 8, max: 16 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [44, 25], kit: { balls: 12, cones: 10, goals: 1 },
      setupMins: 3, adults: 1, indoor: false, groups: ['pairs', 'small'], involvement: 2, competitive: true,
      positions: ['Forward', 'Mid', 'Back'], skills: ['passing', 'shooting', 'long-passing'], principles: ['creativity', 'penetration'],
      moments: ['attack'], physical: ['coordination'],
      setup: 'Pairs 15 yd apart with a line of cones halfway between them. Then a goal with a keeper who starts on the edge of the six-yard box.',
      how: [
        'Chip over the cone line so it lands at your partner\'s feet, not beyond her.',
        'Move back to 20 yd. Then chip a moving ball.',
        'Lob: dribble at the keeper as she comes out, and lob her from 6 to 8 yd.'
      ],
      points: [
        'Short, sharp stab under the ball: lean back slightly, little follow-through.',
        'Contact low on the ball.',
        'Lob: look at the keeper\'s position, not the ball, on the touch before.'
      ],
      questions: ['When is a lob better than going round the keeper?'],
      mistakes: ['A big swing that sends it 40 yd: shorten the swing and stab under it.'],
      why: 'Chipping over a press, a wall or an advancing keeper is a skill most youth players never try. It turns impossible angles into chances.',
      easier: ['A stationary ball, a lower cone line, shorter distances.'],
      harder: ['Chip a ball rolling towards you, first time.', 'A defender recovers behind the shooter in the lob round.'],
      diagram: {
        area: [44, 25], mark: 'box', goals: [[22, 0, 'big', 's']],
        cones: [[2, 14], [4, 14], [6, 14]],
        players: { K: [22, 5.5], A1: [22, 24], A2: [4, 22], A3: [4, 6] },
        ball: ['A1', 'A2'],
        frames: [
          ['A2>A3', 'A1~22,15', 'K-22,8', '# Chip over the cones; the keeper comes out'],
          ['A1>G', '# Lob her from 6 to 8 yards']
        ]
      },
      signals: ['few-shots', 'off-target'], goesWith: ['volleys', 'bending-the-ball'], tags: ['finishing', 'ball-skills']
    },

    {
      id: 'bending-the-ball', v: 1, name: 'Bending the ball', type: 'technical',
      summary: 'Curl passes and shots round a pole: inside of the foot to bend it in, outside of the foot to bend it away.',
      ages: [11, 19], level: 3, players: { min: 2, best: 8, max: 14 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [44, 25], kit: { balls: 12, poles: 2, cones: 4, goals: 1 },
      setupMins: 3, adults: 1, indoor: false, groups: ['pairs', 'small'], involvement: 2, competitive: true,
      positions: ['Mid', 'Wing', 'Forward', 'Back'], skills: ['passing', 'shooting', 'long-passing'], principles: ['creativity'],
      moments: ['attack'], physical: ['coordination'],
      setup: 'Pairs 15 yd apart with a pole between them. Then a goal with a keeper and a pole on the edge of the box standing in for a defender.',
      how: [
        'Curl the ball round the pole to your partner with the inside of the foot. Ten each, then the other foot.',
        'Same again with the outside of the foot, bending it the other way.',
        'Shooting: from just outside the box, curl it round the pole towards the far corner.'
      ],
      points: [
        'Strike the side of the ball, not the middle.',
        'Wrap the foot round the ball and follow through across the body.',
        'Aim outside the target and let it come back.'
      ],
      questions: ['Where did you aim to make it finish at your partner?'],
      mistakes: ['Hitting it through the middle and expecting it to bend: show where on the ball to strike.'],
      why: 'A curled pass gets round a defender a straight one can\'t, and a curled shot into the far corner is the hardest one a keeper has to save.',
      easier: ['Closer, a bigger target, no pole.'],
      harder: ['One touch to set, then curl.', 'Free kicks: curl over and round a wall of poles.'],
      diagram: {
        area: [44, 25], mark: 'box', goals: [[22, 0, 'big', 's']],
        poles: [[16, 19], [37, 15]],
        players: { K: [22, 1.5], A1: [12, 24], A2: [32, 22], A3: [40, 8] },
        ball: ['A1', 'A2'],
        frames: [
          ['A2>A3(', 'A1~14,21', '# Curl it round the pole to your partner'],
          ['A1>G(', '# Then round the "defender", into the corner']
        ]
      },
      signals: ['off-target', 'possession'], goesWith: ['free-kicks', 'chip-and-lob'], tags: ['ball-skills', 'finishing']
    },

    {
      id: 'y-passing-pattern', v: 1, name: 'Y passing pattern', type: 'technical',
      summary: 'A Y-shaped pattern with a lay-off and a pass in behind: the third-man combination that unlocks a midfield, rehearsed at speed.',
      ages: [11, 19], level: 3, players: { min: 5, best: 8, max: 12 }, gk: 0, minutes: [12, 18], intensity: 2,
      space: [24, 30], kit: { balls: 6, cones: 4, poles: 3 },
      setupMins: 3, adults: 1, indoor: true, groups: ['small'], involvement: 2, competitive: false,
      positions: ['Mid', 'Forward', 'Back'], skills: ['passing', 'first-touch', 'combination', 'movement'], principles: ['support', 'penetration', 'mobility'],
      moments: ['attack'], physical: [],
      setup: 'Four cones in a Y: the base at the bottom, the middle 12 yd up, and two arms 10 yd further on, out wide. A pole beside the middle and each arm stands in for a marker.',
      how: [
        'The base passes into the middle player, who has checked away from her pole and come back.',
        'The middle lays it back; the base, who followed her pass, plays first time out to the left arm.',
        'The middle player spins past her pole; the left arm plays her in. She passes on to the right arm.',
        'Everyone moves one cone on. Next round, the pattern goes right.'
      ],
      points: [
        'Every pass to the front foot, firm, so the next one can be first time.',
        'The lay-off is the key pass: angled, soft, into the passer\'s stride.',
        'Check away before you show. Make the space, then use it.',
        'Talk: the receiver calls "set" or "turn".'
      ],
      questions: ['When was the third-man run on? What told you?'],
      mistakes: ['Everyone standing still waiting for the ball: it only works if every player moves before receiving.'],
      why: 'Pass, lay-off, play forward to the third player: that\'s how good teams get through a press. Rehearsing it unopposed makes it automatic when a game offers it.',
      easier: ['Two touches each, slower, half the distances.'],
      harder: ['One touch throughout.', 'A passive, then a live, defender at the middle cone.'],
      diagram: {
        area: [24, 30], mark: 'none',
        cones: [[12, 28.5], [12, 16.5], [5, 6.5], [19, 6.5]],
        poles: [[14, 15.5], [6.8, 8], [17.2, 8]],
        players: { A1: [12, 27], A5: [13.5, 29.3], A2: [12, 15], A3: [5, 5], A4: [19, 5] },
        ball: 'A1',
        frames: [
          ['A2-12,19', 'A1>A2', 'A1-12,23', '# In to the middle; she shows for it'],
          ['A2>A1', '# Lay it back, soft, into her stride'],
          ['A1>A3', 'A2-12.5,9', '# First time wide; she spins in behind'],
          ['A3>A2', '# Played in by the third player'],
          ['A2>A4', '# On to the far arm. Everyone moves on']
        ]
      },
      signals: ['possession', 'solo-goals'], goesWith: ['passing-diamond', 'rondo-pivot'], tags: ['patterns']
    },

    {
      id: 'first-touch-away', v: 1, name: 'First touch away from pressure', type: 'technical',
      summary: 'Receive with a defender closing from one side and take the first touch away from her, into space, out through a gate.',
      ages: [9, 19], level: 2, players: { min: 3, best: 9, max: 15 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [16, 16], kit: { balls: 6, cones: 8, bibs: 3 },
      setupMins: 2, adults: 1, indoor: true, groups: ['small'], involvement: 2, competitive: true,
      positions: OUTFIELD, skills: ['first-touch', 'scanning', 'decision-making'], principles: [],
      moments: ['attack'], physical: ['agility'],
      setup: 'Groups of three: a server, a receiver in the middle of a 16 × 16 yd square, and a defender who starts at one side. A gate in the middle of the left and right edges.',
      how: [
        'The server passes in. As the ball travels, the defender sets off from one side.',
        'The receiver takes her first touch away from the defender and out through the gate on the other side.',
        'Two points for the gate in two touches, one for three. The defender scores by touching the ball.',
        'Rotate every five.'
      ],
      points: [
        'See the defender before the ball arrives.',
        'The first touch is a pass to yourself: into space, at a speed you can run onto.',
        'Open the body towards the side you\'re going.'
      ],
      questions: ['Which surface did you use to take it away to the left? To the right?'],
      mistakes: ['Stopping the ball dead under your feet as the defender arrives: touch it into space, a yard or two away.'],
      why: 'Most youth turnovers start with the first touch: a ball stopped dead with a defender arriving. A first touch away from pressure keeps the ball without a single dribble.',
      easier: ['The defender starts further away, or walks.'],
      harder: ['The defender can come from either side, decided as the pass is played.', 'Two defenders, one each side: find the gap.'],
      diagram: {
        area: [16, 16], mark: 'grid',
        cones: [[0, 0], [16, 0], [0, 16], [16, 16], [0, 6], [0, 10], [16, 6], [16, 10]],
        players: { N1: [8, 16], A1: [8, 8], D1: [1.5, 3] },
        ball: 'N1',
        frames: [
          ['N1>A1', 'D1-4,6.5', '# As the ball travels, she comes from the left'],
          ['A1~11.5,8.6', 'D1-A1', '# First touch away, to the right'],
          ['A1~16,8', '# Out through the gate']
        ]
      },
      signals: ['possession'], goesWith: ['open-up-and-turn', 'middle-man-under-pressure'], tags: []
    },

    {
      id: 'wall-passing', v: 1, name: 'Wall passing', type: 'technical',
      summary: 'One player, one ball, one wall: pass and receive with both feet, one touch and two, from three distances. The best homework there is.',
      ages: [7, 19], level: 1, players: { min: 1, best: 1, max: 30 }, gk: 0, minutes: [10, 20], intensity: 2,
      space: [10, 12], kit: { balls: 'each', cones: 3 },
      setupMins: 0, adults: 1, indoor: true, groups: ['solo'], involvement: 3, competitive: true,
      positions: ALL, skills: ['passing', 'first-touch'], principles: [],
      moments: ['attack'], physical: ['coordination'],
      setup: 'A wall or a rebounder, and three cones 3, 6 and 10 yd back from it.',
      how: [
        'From 3 yd: one touch, alternating feet. Count how many in a minute.',
        'From 6 yd: receive with one foot, pass with the other.',
        'From 10 yd: receive across your body, a touch to the side, then pass.',
        'Finish: one touch from 3 yd, as many as you can in thirty seconds. Beat it next time.'
      ],
      points: ['Ankle locked, inside of the foot.', 'Feet set before the ball comes back.', 'Count, and write down your best. That\'s the motivation.'],
      questions: ['How many this time? What will you change to beat it?'],
      mistakes: ['Stabbing at it off balance: smaller, quicker steps to get the body behind the ball.'],
      why: 'A wall never gets bored. Ten minutes a day is hundreds of passes and touches, more than a whole practice gives one player.',
      easier: ['Catch the rebound, drop it, pass again.'],
      harder: ['Weaker foot only.', 'Lofted passes that hit the wall above a line and come back in the air.'],
      diagram: {
        area: [14, 12], mark: 'none',
        walls: [[0, 0.4, 14, 0.4]],
        cones: [[2, 3], [2, 6], [2, 10]],
        labels: [[4.6, 3.4, '3 YD'], [4.6, 6.4, '6 YD'], [4.8, 10.4, '10 YD']],
        players: { A1: [8, 3] },
        ball: 'A1',
        frames: [
          ['A1>W', '# One touch, alternating feet'],
          ['A1~8.5,6', '# Back to 6 yd'],
          ['A1>W', '# Receive with one foot, pass with the other'],
          ['A1~9,10', '# 10 yd: across the body, touch, pass'],
          ['A1>W', '# Count your best, and beat it next time']
        ]
      },
      signals: ['possession'], goesWith: ['juggling-ladder', 'weak-foot-circuit'], tags: ['homework', 'no-prep']
    },

    {
      id: 'agility-dribble-circuit', v: 1, name: 'Agility and dribble circuit', type: 'technical',
      summary: 'Ladder footwork, a hurdle hop, then straight onto a ball for a slalom and a shot. Quick feet first, then the ball.',
      ages: [8, 19], level: 2, players: { min: 4, best: 10, max: 16 }, gk: 1, minutes: [10, 15], intensity: 3,
      space: [36, 14], kit: { balls: 10, ladder: 1, hurdles: 4, cones: 6, goals: 1 },
      setupMins: 6, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: false,
      positions: OUTFIELD, skills: ['dribbling', 'shooting', 'ball-mastery'], principles: [],
      moments: ['attack'], physical: ['agility', 'speed', 'coordination'],
      setup: 'In a line: an agility ladder, four low hurdles, a pile of balls, a slalom of four cones, then a goal with a keeper.',
      how: [
        'Through the ladder: two feet in each rung, then in-in-out, then side-on.',
        'Hop the hurdles on two feet, landing soft.',
        'Pick up a ball and dribble the slalom at speed.',
        'Shoot from the end of the slalom. Jog back down the side.'
      ],
      points: ['Quick, light feet in the ladder; the arms drive.', 'Land quietly off the hurdles, knees over toes.', 'Keep the speed when the ball arrives: small touches through the cones, bigger ones into space.'],
      questions: ['Did your feet slow down when the ball arrived? Why?'],
      mistakes: ['Racing the ladder and missing rungs: quality first, speed after.'],
      why: 'Quick feet only help if they stay quick with a ball. Linking the two in one run teaches the body to keep its speed when the ball arrives.',
      easier: ['Skip the hurdles, a wider slalom, no shot.'],
      harder: ['A defender chases from the end of the ladder.', 'A turn back through the slalom before the shot.'],
      safety: 'Hurdles low enough to step over if a player lands badly. Teach the landing before the speed.',
      diagram: {
        area: [36, 14], mark: 'none', goals: [[36, 7, 'big', 'w']],
        zones: [[2, 5.5, 8, 2, 'LADDER']],
        hurdles: [[12.5, 6.5], [14, 6.5], [15.5, 6.5], [17, 6.5]],
        balls: [[20.3, 4.6], [20.9, 5.2], [21.5, 4.6]],
        cones: [[23, 5.8], [25, 7.2], [27, 5.8], [29, 7.2]],
        players: { K: [34.5, 7], A1: [1, 6.5], A2: [0, 9] },
        ball: [[20.4, 6.6]],
        frames: [
          ['A1-10.5,6.5', '# Ladder: quick, light feet'],
          ['A1-19.4,6.6', '# Hop the hurdles, land soft'],
          ['A1~30,6.5', '# Onto a ball, through the slalom'],
          ['A1>G', '# Shoot from the end']
        ]
      },
      signals: ['late-goals'], goesWith: ['injury-prevention-warmup', 'dribble-relays'], tags: ['stations', 'fitness']
    },

    {
      id: 'pass-bowling', v: 1, name: 'Bowling', type: 'technical',
      summary: 'Pairs pass to knock over a cone between them. A point for every pin down, and a step back every couple of minutes.',
      ages: [4, 10], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [8, 12], intensity: 1,
      space: [20, 15], kit: { balls: 10, cones: 10 },
      setupMins: 3, adults: 1, indoor: true, groups: ['pairs'], involvement: 2, competitive: true,
      positions: ALL, skills: ['passing', 'first-touch'], principles: [],
      moments: ['attack'], physical: ['coordination'],
      setup: 'Pairs face each other about 8 yd apart with one ball. Halfway between them, a tall cone (or two stacked) as the pin. Line the pairs up side by side.',
      how: [
        'Pass with the inside of the foot to knock the pin over. Your partner stops the ball and has a go back.',
        'A pin down is a point, and whoever knocked it over stands it back up.',
        'Every two minutes, everyone takes a big step back.',
        'Last round: weaker foot only.'
      ],
      points: [
        'Toe up, ankle locked, strike through the middle of the ball with the inside of the foot.',
        'Standing foot beside the ball, pointing at the pin.',
        'Stop the ball dead before you aim: one touch to stop, one to pass.'
      ],
      questions: ['Where did your standing foot point when you hit the pin?'],
      mistakes: [
        'Toe-pokes, which go anywhere: show the inside of the foot as a golf putter.',
        'Rushing: a still ball is much easier to aim.'
      ],
      why: 'A pass is aiming at a target. A pin that falls over is instant proof to a young player that her technique worked, and she\'ll want to do it again.',
      easier: ['Closer, with two pins side by side.'],
      harder: ['One touch, no stopping it first.', 'A single small cone as the pin.', 'Through a cone gate before the pin.'],
      diagram: {
        area: [16, 10], mark: 'none',
        cones: [[8, 2.5], [8, 7.5]],
        players: { A1: [1.5, 2.5], A2: [14.5, 2.5], A3: [1.5, 7.5], A4: [14.5, 7.5] },
        ball: ['A1', 'A3'],
        frames: [
          ['A1>A2', 'A3>A4', '# Inside of the foot: knock the pin over'],
          ['A2>A1', 'A4>A3', '# Stop it, aim, and send it back']
        ]
      },
      signals: ['possession'], goesWith: ['pass-and-follow', 'partner-passing-on-the-move'], tags: ['young', 'fun']
    },

    {
      id: 'goal-frenzy', v: 1, name: 'Goal frenzy', type: 'technical',
      summary: 'A ball each and a mini goal on every side: score in as many different goals as you can in a minute.',
      ages: [4, 10], level: 1, players: { min: 4, best: 10, max: 16 }, gk: 0, minutes: [8, 12], intensity: 3,
      space: [25, 20], kit: { balls: 'each', cones: 4, minigoals: 4 },
      setupMins: 3, adults: 1, indoor: true, groups: ['solo'], involvement: 3, competitive: true,
      positions: OUTFIELD, skills: ['shooting', 'dribbling', 'ball-mastery'], principles: ['penetration'],
      moments: ['attack'], physical: ['speed', 'agility'],
      setup: 'A 25 × 20 yd area with a mini goal in the middle of each side, facing in (cone goals work). A ball each.',
      how: [
        'On "Go!", dribble and score in any goal. Fetch your ball out of the net and score in a different one.',
        'Never the same goal twice in a row, and shoot from at least two big steps out, not from on the line.',
        'Count your goals in one minute. Rest, then try to beat it.',
        'Then the coach names which goals count, or calls "weaker foot!".'
      ],
      points: [
        'Look up to find the empty goal.',
        'Set the ball out of your feet, then strike it with your laces, toe pointed down.',
        'Follow your shot in.'
      ],
      questions: ['Which goal was the best one to go for, and why?', 'Laces or the side of your foot: which went in more?'],
      mistakes: [
        'Dribbling into the net: mark a line they have to shoot from.',
        'Everyone crowding one goal: give the goals colours and call one out.'
      ],
      why: 'Dozens of shots each in ten minutes, and a goal every time they get it right. Young players who score a lot in practice expect to score on Saturday.',
      easier: ['Shoot from anywhere.'],
      harder: [
        'A coach, or two players, roam between the goals as keepers.',
        'Two touches: one to set it, one to shoot.'
      ],
      diagram: {
        area: [25, 20], mark: 'grid',
        cones: [[0, 0], [25, 0], [0, 20], [25, 20]],
        goals: [[12.5, 0, 'mini', 's'], [12.5, 20, 'mini', 'n'], [0, 10, 'mini', 'e'], [25, 10, 'mini', 'w']],
        players: { A1: [8, 8], A2: [16, 12], A3: [10, 14] },
        ball: ['A1', 'A2', 'A3'],
        frames: [
          ['A1~5,9', 'A2~20,11', 'A3~12,5', '# Dribble at a goal…'],
          ['A1>G', 'A2>G', 'A3>G', '# …and score. Any goal but the last one'],
          ['A1-2.5,10', 'A2-22.5,11', 'A3-12,2.5', '# Fetch it, and find a different goal']
        ]
      },
      signals: ['few-shots', 'one-scorer'], goesWith: ['through-the-gates', '4v4-mini-goals'], tags: ['young', 'fun', 'finishing']
    },

    /* ---------------- opposed practice ---------------- */

    {
      id: 'rondo-5v2', v: 1, name: 'Rondo 5v2', type: 'opposed',
      summary: 'Five keep the ball from two. A pass that splits the two defenders counts double.',
      ages: [10, 19], level: 2, players: { min: 7, best: 7, max: 14 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [15, 15], kit: { balls: 4, cones: 4, bibs: 4 },
      setupMins: 2, adults: 1, indoor: true, groups: ['small'], involvement: 3, competitive: true,
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
      diagram: {
        area: [15, 15], mark: 'grid',
        cones: [[0, 0], [15, 0], [0, 15], [15, 15]],
        players: { A1: [4, 0], A2: [11, 0], A3: [15, 8], A4: [8, 15], A5: [0, 8], D1: [6, 6], D2: [10, 9] },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D1-A2', 'D2-8,8', '# The first defender presses, the second covers'],
          ['A2>A3', 'D1-11,5', 'D2-9,10', 'A4-6,15', '# Two touches. Play away from pressure'],
          ['A3>A5', '# Split them: a pass between the two counts double']
        ]
      },
      signals: ['possession', 'shots-against'], goesWith: ['rondo-4v1', 'five-second-press'], tags: ['classic']
    },

    {
      id: '1v1-to-mini-goals', v: 1, name: '1v1 to mini goals', type: 'opposed',
      summary: 'Two lines, a coach serves, a live 1v1 for 30 seconds. The attacker scores in a mini goal, the defender counters.',
      ages: [6, 19], level: 1, players: { min: 4, best: 10, max: 14 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [10, 15], kit: { balls: 10, cones: 4, minigoals: 2, bibs: 6 },
      setupMins: 4, adults: 1, indoor: true, groups: ['pairs', 'teams'], involvement: 2, competitive: true,
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
      diagram: {
        area: [16, 14], mark: 'none',
        goals: [[0, 5, 'mini', 'e'], [16, 5, 'mini', 'w']],
        lines: [[0, 0, 16, 0], [0, 10, 16, 10]],
        players: { C: [8, 12], A1: [6, 12], A2: [4.6, 12.8], D1: [10, 12], D2: [11.4, 12.8] },
        ball: 'C',
        frames: [
          ['C>8,6', 'A1-7.6,6.8', 'D1-10,4.5', '# The coach serves: one attacks, one defends'],
          ['A1~12,3', 'D1-A1', '# Beat her, or protect it and turn'],
          ['A1>G', '# Score in the far goal. Next pair']
        ]
      },
      signals: ['fouls', 'one-scorer', 'few-shots'], goesWith: ['1v1-moves', 'jockey-channel'], tags: ['competitive']
    },

    {
      id: 'jockey-channel', v: 1, name: 'Jockey in a channel', type: 'opposed',
      summary: 'A defender delays an attacker down a narrow channel, showing her the outside and staying on her feet.',
      ages: [8, 19], level: 1, players: { min: 2, best: 8, max: 12 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [8, 25], kit: { balls: 6, cones: 8 },
      setupMins: 3, adults: 1, indoor: true, groups: ['pairs'], involvement: 2, competitive: true,
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
      diagram: {
        area: [25, 8], mark: 'grid',
        cones: [[0, 0], [25, 0], [0, 8], [25, 8]],
        players: { A1: [1, 4], D1: [24, 4] },
        ball: 'D1',
        frames: [
          ['D1>A1', 'D1-13,5', '# The defender passes in and closes down fast'],
          ['A1~8,3', 'D1-10.4,4', '# Brakes on: side-on, an arm\'s length away'],
          ['A1~14,6.3', 'D1-16,5', '# Show her down the line, onto her weaker foot'],
          ['D1*A1', '# Heavy touch? Now win it']
        ]
      },
      signals: ['fouls', 'conceding', 'shots-against'], goesWith: ['2v2-pressure-cover', '1v1-to-mini-goals'], tags: ['defending']
    },

    {
      id: '2v1-to-goal', v: 1, name: '2v1 to goal', type: 'opposed',
      summary: 'Two attackers against one defender and a keeper: draw the defender, then pass or shoot.',
      ages: [8, 19], level: 1, players: { min: 4, best: 10, max: 14 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [30, 30], kit: { balls: 10, cones: 6, goals: 1, bibs: 4 },
      setupMins: 4, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
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
      diagram: {
        area: [44, 30], mark: 'box',
        goals: [[22, 0, 'big', 's']],
        players: { K: [22, 1.5], D1: [28, 1.2], A1: [15, 29], A2: [29, 29] },
        ball: 'D1',
        frames: [
          ['D1>A1', 'D1-22,16', '# The defender passes out and comes to defend'],
          ['A1~19,19', 'A2-29,20', 'D1-A1', '# Dribble at her until she commits'],
          ['A2-29,14', 'A1>A2', 'D1-24,15', '# Then release it'],
          ['A2>G', '# Finish']
        ]
      },
      signals: ['solo-goals', 'few-shots'], goesWith: ['3v2-waves', 'lay-off-and-shoot'], tags: []
    },

    {
      id: '2v2-pressure-cover', v: 1, name: '2v2: pressure and cover', type: 'opposed',
      summary: 'Defenders in pairs: one presses the ball, one covers, and they swap as the ball moves.',
      ages: [10, 19], level: 2, players: { min: 4, best: 8, max: 12 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [20, 25], kit: { balls: 8, cones: 6, minigoals: 2, bibs: 4 },
      setupMins: 4, adults: 1, indoor: true, groups: ['small'], involvement: 2, competitive: true,
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
      diagram: {
        area: [25, 20], mark: 'grid',
        goals: [[25, 5, 'mini', 'w'], [25, 15, 'mini', 'w']],
        cones: [[0, 0], [25, 0], [0, 20], [25, 20]],
        players: { A1: [2, 7], A2: [2, 13], D1: [22, 8], D2: [22, 12] },
        ball: 'D1',
        frames: [
          ['D1>A1', 'D1-12,7.5', 'D2-15,11', '# Pass in. First defender presses, second covers'],
          ['A1~8,7', 'A2-8,15', 'D1-A1', 'D2-13.5,11', '# Cover at an angle, 3 to 5 yd behind'],
          ['A2-10,15', 'A1>A2', 'D2-A2', 'D1-13.5,9.5', '# Ball moves: the cover becomes the pressure']
        ]
      },
      signals: ['conceding', 'shots-against'], goesWith: ['jockey-channel', 'numbers-down-defending'], tags: ['defending']
    },

    {
      id: '3v2-waves', v: 1, name: '3v2 waves', type: 'opposed',
      summary: 'Three attack two; when it ends, the two defenders break the other way against one recovering player.',
      ages: [10, 19], level: 2, players: { min: 8, best: 12, max: 16 }, gk: 2, minutes: [12, 18], intensity: 3,
      space: [40, 50], kit: { balls: 12, cones: 8, goals: 2, bibs: 6 },
      setupMins: 6, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [50, 36], mark: 'none',
        goals: [[0, 18, 'big', 'e'], [50, 18, 'big', 'w']],
        lines: [[0, 0, 50, 0], [0, 36, 50, 36]],
        players: { K1: [1.5, 18], K2: [48.5, 18], A1: [5, 9], A2: [5, 18], A3: [5, 27], D1: [36, 14], D2: [36, 22] },
        ball: ['A2', 'K2'],
        frames: [
          [
            'A2~18,18', 'A1-20,7', 'A3-20,29', 'D1-34,15', 'D2-34,21', '# Three break against two, at speed'
          ],
          ['A3-30,26', 'A2>A3', 'A1-32,10', 'D2-A3', '# Stretch them across the width'],
          ['A3>G', '# Finish early'],
          [
            'K2>D1', 'D1-30,13', 'D2-28,24', 'A1-24,17',
            '# Now the two break back, against one who recovers'
          ]
        ]
      },
      signals: ['few-shots', 'solo-goals', 'late-goals'], goesWith: ['2v1-to-goal', 'six-second-counter'], tags: ['transition']
    },

    {
      id: 'shielding-battles', v: 1, name: 'Shielding battles', type: 'opposed',
      summary: 'In pairs inside a circle, one keeps the ball for 30 seconds while the other tries to win it.',
      ages: [7, 19], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [6, 10], intensity: 3,
      space: [10, 10], kit: { balls: 6, cones: 12 },
      setupMins: 3, adults: 1, indoor: true, groups: ['pairs'], involvement: 3, competitive: true,
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
      diagram: {
        area: [16, 8], mark: 'none',
        cones: [
          [4, 1.5], [5.8, 2.2], [6.5, 4], [5.8, 5.8], [4, 6.5], [2.2, 5.8], [1.5, 4], [2.2, 2.2], [12, 1.5],
          [13.8, 2.2], [14.5, 4], [13.8, 5.8], [12, 6.5], [10.2, 5.8], [9.5, 4], [10.2, 2.2]
        ],
        players: { A1: [4, 4], D1: [5.6, 4.4], A2: [12, 4], D2: [10.4, 3.6] },
        ball: ['A1', 'A2'],
        frames: [
          [
            'A1~3.4,3.6', 'D1-5.2,3', 'A2~12.6,4.4', 'D2-10.8,5',
            '# Body between her and the ball, side-on and low'
          ],
          [
            'A1~4.5,4.8', 'D1-3,5', 'A2~11.5,3.5', 'D2-13,2.8',
            '# She comes round: roll it away with the sole'
          ]
        ]
      },
      signals: ['possession'], goesWith: ['turn-and-shoot', 'turns-station'], tags: ['no-prep']
    },

    {
      id: 'keep-away-4v4-plus-2', v: 1, name: 'Keep-away 4v4 + 2', type: 'opposed',
      summary: 'Two teams of four, plus two neutrals who always play with whoever has the ball. Five passes is a point.',
      ages: [10, 19], level: 2, players: { min: 10, best: 10, max: 14 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [25, 30], kit: { balls: 6, cones: 4, bibs: 10 },
      setupMins: 2, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [30, 25], mark: 'grid',
        cones: [[0, 0], [30, 0], [0, 25], [30, 25]],
        players: { 
          A1: [5, 5], A2: [25, 4], A3: [26, 20], A4: [6, 21], N1: [15, 2], N2: [15, 23], D1: [10, 8],
          D2: [20, 9], D3: [19, 17], D4: [11, 15]
         },
        ball: 'A1',
        frames: [
          ['A1>N1', 'D1-N1', 'A4-4,13', '# Six keep it from four: neutrals help the ball'],
          ['N1>A2', 'D2-A2', 'A1-10,3', '# Move after you pass'],
          ['A2>A3', 'D3-A3', 'N2-20,22', '# Five passes is a point'],
          ['D3*A3', 'D4-13,18', 'D1-8,9', '# Win it: now your four have the neutrals']
        ]
      },
      signals: ['possession', 'shots-against'], goesWith: ['rondo-5v2', 'end-zone-game'], tags: ['possession']
    },

    {
      id: 'five-second-press', v: 1, name: 'Five-second press', type: 'opposed',
      summary: 'A small-sided game where the team that loses the ball has five seconds to win it back for a bonus point.',
      ages: [11, 19], level: 3, players: { min: 8, best: 12, max: 16 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [30, 40], kit: { balls: 8, cones: 8, minigoals: 4, bibs: 8 },
      setupMins: 5, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [40, 30], mark: 'grid',
        goals: [[0, 6, 'mini', 'e'], [0, 24, 'mini', 'e'], [40, 6, 'mini', 'w'], [40, 24, 'mini', 'w']],
        cones: [[0, 0], [40, 0], [0, 30], [40, 30]],
        players: { 
          A1: [24, 14], A2: [20, 6], A3: [21, 22], A4: [12, 14], A5: [32, 7], D1: [27, 14], D2: [30, 22],
          D3: [17, 10], D4: [10, 20], D5: [33, 16]
         },
        ball: 'A1',
        frames: [
          ['D1*A1', '# Blue loses it. The coach counts: 1, 2…'],
          ['A1-D1', 'A5-31,13', 'A3-27,20', 'A2-24,10', '# Nearest presses; the next two shut the passes'],
          ['A1*D1', '# Won back inside five seconds: a point']
        ]
      },
      signals: ['possession', 'shots-against', 'conceding'], goesWith: ['rondo-5v2', 'six-second-counter'], tags: ['transition']
    },

    {
      id: 'six-second-counter', v: 1, name: 'Six-second counter', type: 'opposed',
      summary: 'A game where a goal scored within six seconds of winning the ball counts triple.',
      ages: [10, 19], level: 2, players: { min: 8, best: 12, max: 18 }, gk: 2, minutes: [12, 20], intensity: 3,
      space: [40, 50], kit: { balls: 10, cones: 8, goals: 2, bibs: 9 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [50, 36], mark: 'none',
        goals: [[0, 18, 'big', 'e'], [50, 18, 'big', 'w']],
        lines: [[0, 0, 50, 0], [0, 36, 50, 36]],
        players: { 
          K1: [1.5, 18], K2: [48.5, 18], A1: [16, 20], A2: [22, 8], A3: [24, 29], A4: [9, 12], D1: [18, 17],
          D2: [27, 21], D3: [31, 10], D4: [35, 27]
         },
        ball: 'D1',
        frames: [
          ['A1*D1', '# Win it: the coach starts counting'],
          ['A2-32,7', 'A1>A2', 'A3-36,28', 'D3-38,13', '# First look forward; runners go in behind'],
          ['A2~42,11', 'A3-43,23', 'D3-A2', '# Attack while they\'re still turning'],
          ['A2>A3', '# Square it…'],
          ['A3>G', '# …inside six seconds: it counts three']
        ]
      },
      signals: ['few-shots', 'solo-goals'], goesWith: ['3v2-waves', 'five-second-press'], tags: ['transition']
    },

    {
      id: 'build-out-play', v: 1, name: 'Playing out from the back', type: 'opposed',
      summary: 'Keeper and back line against three pressing attackers: pass through the press to gates at halfway.',
      ages: [9, 19], level: 2, players: { min: 8, best: 9, max: 12 }, gk: 1, minutes: [15, 20], intensity: 2,
      space: [44, 40], kit: { balls: 12, cones: 10, goals: 1, bibs: 4 },
      setupMins: 6, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
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
      diagram: {
        area: [60, 44], mark: 'half',
        goals: [[30, 0, 'big', 's']],
        lines: [[0, 30, 60, 30]],
        labels: [[50, 29, 'BUILD-OUT LINE']],
        cones: [[8, 44], [13, 44], [27.5, 44], [32.5, 44], [47, 44], [52, 44]],
        players: { 
          K: [30, 1.5], A1: [10, 10], A2: [24, 8], A3: [36, 8], A4: [50, 10], A5: [30, 17], D1: [22, 32],
          D2: [38, 32], D3: [30, 37]
         },
        ball: 'K',
        frames: [
          ['A2-14,5', 'A3-46,5', 'A1-5,17', 'A4-55,17', '# Centre backs split to the edges of the box'],
          ['K>A2', 'D1-A2', 'D2-38,20', 'D3-30,24', '# Play out. The press comes once the ball moves'],
          ['A1-5,24', 'A2>A1', 'D1-10,14', '# Find the free player'],
          ['A1~10.5,43', '# Drive through a gate at halfway']
        ]
      },
      signals: ['possession', 'shots-against'], goesWith: ['gk-distribution', 'driven-passes'], tags: ['uses-your-shape']
    },

    {
      id: 'overlap-2v1-wide', v: 1, name: 'Overlaps out wide', type: 'opposed',
      summary: 'A winger and a full-back against one defender down the flank: overlap, underlap or go alone, then cross.',
      ages: [11, 19], level: 2, players: { min: 6, best: 9, max: 12 }, gk: 1, minutes: [15, 20], intensity: 2,
      space: [20, 40], kit: { balls: 12, cones: 10, goals: 1, bibs: 4 },
      setupMins: 6, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [60, 34], mark: 'box',
        goals: [[30, 0, 'big', 's']],
        cones: [[16, 14], [16, 20], [16, 26], [16, 32]],
        players: { K: [30, 1.5], A1: [8, 25], A2: [5, 33], D1: [9, 17], A3: [25, 9], A4: [35, 11] },
        ball: 'A1',
        frames: [
          ['A1~11,20', 'D1-A1', 'A2-3,24', '# Carry it inside; the full-back starts her run'],
          ['A2-3,9', 'A1>3,8', '# Release the overlap'],
          ['A2~5,3', 'A3-27,4', 'A4-34,6', '# To the byline'],
          ['A2>A3', '# Cross'],
          ['A3>G', '# Finish']
        ]
      },
      signals: ['solo-goals', 'few-shots'], goesWith: ['crossing-and-finishing', 'four-goal-game'], tags: []
    },

    {
      id: 'turn-and-shoot', v: 1, name: 'Turn and shoot', type: 'opposed',
      summary: 'A striker with her back to goal receives with a defender behind her, turns and shoots, or lays it off.',
      ages: [9, 19], level: 2, players: { min: 4, best: 8, max: 12 }, gk: 1, minutes: [10, 15], intensity: 3,
      space: [44, 25], kit: { balls: 12, cones: 4, goals: 1, bibs: 4 },
      setupMins: 3, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
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
      diagram: {
        area: [44, 34], mark: 'box',
        goals: [[22, 0, 'big', 's']],
        players: { K: [22, 1.5], D1: [22, 17], A1: [22, 19], N1: [22, 33] },
        ball: 'N1',
        frames: [
          ['N1>A1', '# Into her feet, defender tight behind'],
          ['A1~25.5,15.5', 'D1-21.5,16', '# Feel her, spin off and turn'],
          ['A1>G', '# Shoot before she recovers']
        ]
      },
      signals: ['few-shots', 'off-target', 'one-scorer'], goesWith: ['lay-off-and-shoot', 'shielding-battles'], tags: ['finishing']
    },

    {
      id: 'numbers-down-defending', v: 1, name: 'Defending outnumbered', type: 'opposed',
      summary: 'Three defenders and a keeper hold off four attackers: stay compact, protect the middle, show them wide.',
      ages: [11, 19], level: 3, players: { min: 8, best: 8, max: 12 }, gk: 1, minutes: [12, 18], intensity: 2,
      space: [44, 30], kit: { balls: 12, cones: 6, goals: 1, minigoals: 2, bibs: 4 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
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
      diagram: {
        area: [44, 30], mark: 'box',
        goals: [[22, 0, 'big', 's'], [12, 30, 'mini', 'n'], [32, 30, 'mini', 'n']],
        players: { 
          K: [22, 1.5], D1: [15, 14], D2: [22, 15], D3: [29, 14], A1: [7, 22], A2: [18, 26], A3: [28, 26],
          A4: [37, 21]
         },
        ball: 'A2',
        frames: [
          ['A2>A1', 'D1-A1', 'D2-17,13', 'D3-24,13', '# Ball wide: shift together, stay narrow'],
          [
            'A2-19,20', 'A1>A2', 'D1-14,15', 'D2-A2', 'D3-25,13',
            '# Ball back inside: step up, protect the middle'
          ],
          ['D2*A2', '# Win it…'],
          ['D2~14,25', '# …and counter'],
          ['D2>G2', '# Into a mini goal']
        ]
      },
      signals: ['conceding', 'shots-against', 'late-goals'], goesWith: ['2v2-pressure-cover', 'attack-vs-defence'], tags: ['defending']
    },

    {
      id: 'rondo-pivot', v: 1, name: 'Rondo with a pivot', type: 'opposed',
      summary: 'Four round a square and one in the middle keep it from two. A pass through the middle player counts double.',
      ages: [11, 19], level: 3, players: { min: 7, best: 7, max: 14 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [15, 15], kit: { balls: 4, cones: 4, bibs: 3 },
      setupMins: 2, adults: 1, indoor: true, groups: ['small'], involvement: 3, competitive: true,
      positions: ['Mid', 'Back', 'Forward'], skills: ['passing', 'scanning', 'first-touch', 'turning', 'pressing'], principles: ['support', 'penetration', 'pressure', 'cover'],
      moments: ['attack', 'defend', 'toDefend'], physical: [],
      setup: 'A 15 × 15 yd square: four attackers on the sides, one attacker inside (the pivot), and two defenders.',
      how: [
        'The five keep the ball; outside players two touches max.',
        'A pass into the pivot that she plays out to a different side counts as two.',
        'The pivot keeps moving to stay out of the defenders\' shadow.',
        'A defender who wins it swaps with whoever lost it. The pivot changes every two minutes.'
      ],
      points: [
        'Pivot: check your shoulder before you receive, and know where it\'s going next.',
        'Pivot: stand between the two defenders, in the gap, never behind one of them.',
        'Outside: if the pivot is covered, go round; if she\'s free, go through.',
        'Defenders: one presses the ball, the other covers the pivot.'
      ],
      questions: ['Pivot: how did you know where the next pass was before you got it?', 'Defenders: who was watching the pivot?'],
      mistakes: ['The pivot hiding behind a defender: show her the gap between the two.'],
      why: 'This is a central midfielder\'s job in miniature: find the gap between two opponents, receive, and play forward. Teams that can play through their pivot don\'t have to go round or go long.',
      easier: ['A bigger square, three touches, or one defender.'],
      harder: ['Pivot one touch.', 'A third defender who only marks the pivot.'],
      diagram: {
        area: [15, 15], mark: 'grid', cones: [[0, 0], [15, 0], [0, 15], [15, 15]],
        players: { A1: [7.5, 0], A2: [15, 7.5], A3: [7.5, 15], A4: [0, 7.5], A5: [7.5, 8], D1: [5, 5], D2: [10, 10] },
        ball: 'A4',
        frames: [
          ['A4>A1', 'D1-A1', 'A5-9,6.5', '# Round the outside; the pivot finds the gap'],
          ['A1>A5', 'D2-A5', '# Into the pivot, between the two'],
          ['A5>A2', '# Out to a different side: two points']
        ]
      },
      signals: ['possession', 'solo-goals'], goesWith: ['rondo-5v2', 'holding-midfielder-screen'], tags: ['classic', 'positional']
    },

    {
      id: 'three-zone-rondo', v: 1, name: 'Three-zone rondo', type: 'opposed',
      summary: 'Keep it four against two in one end zone, then play it through the middle to the four waiting at the other end. Two new defenders follow it across.',
      ages: [12, 19], level: 3, players: { min: 10, best: 12, max: 12 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [40, 15], kit: { balls: 6, cones: 8, bibs: 4 },
      setupMins: 4, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
      positions: OUTFIELD, skills: ['passing', 'long-passing', 'scanning', 'pressing', 'communication'], principles: ['penetration', 'support', 'pressure', 'compactness'],
      moments: ['attack', 'defend', 'toDefend'], physical: ['endurance'],
      setup: 'Three zones in a row: two 15 × 15 yd end zones with a 10 yd middle zone between them. Four attackers in each end zone, four defenders who send two at a time into the zone with the ball.',
      how: [
        'Four keep it from two in the zone with the ball. Five passes, then play it through the middle to the other end.',
        'When the ball crosses, two new defenders press in the other zone; the first two go back to the middle.',
        'Defenders who win it try to play it out of the zone. Swap roles every four minutes.'
      ],
      points: ['Spread out so the long pass is on. Someone always stays wide.', 'Look for the switch early, before the lane closes.', 'Defenders: shut the forward pass first, then win the short one.'],
      questions: ['What did the defenders do to block the long pass?', 'When was the switch on?'],
      mistakes: ['Attackers bunching on the ball side: the long pass needs a wide player at the far end too.'],
      why: 'Keeping the ball in a tight space, then switching it, is how a team escapes pressure. Defenders learn to shift together and close the way out.',
      easier: ['Three passes before switching, a longer middle zone.'],
      harder: ['The switch must be first time.', 'One defender may stay in the middle to intercept.'],
      diagram: {
        area: [40, 15], mark: 'none',
        zones: [[0, 0, 15, 15], [15, 0, 10, 15], [25, 0, 15, 15]],
        players: {
          A1: [0.5, 4], A2: [7.5, 0.5], A3: [14.5, 8], A4: [6, 14.5], A5: [25.5, 4], A6: [32, 0.5], A7: [39.5, 9], A8: [33, 14.5],
          D1: [6, 6], D2: [9, 9], D3: [20, 4], D4: [20, 11]
        },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D1-A2', 'D2-10,6', '# Four keep it from two'],
          ['A2>A3', 'D2-A3', 'D1-9,4', '# Five passes…'],
          ['A3>A7', 'D3-33,6', 'D4-35,10', 'D1-17,6', 'D2-17,10', '# …then through the middle; two new defenders go']
        ]
      },
      signals: ['possession', 'shots-against'], goesWith: ['rondo-5v2', 'four-goal-game'], tags: ['positional', 'possession']
    },

    {
      id: 'middle-man-under-pressure', v: 1, name: 'Back to pressure', type: 'opposed',
      summary: 'A receiver in the middle with a live defender on her back and four servers round the outside: turn when it\'s on, set it when it isn\'t.',
      ages: [10, 19], level: 2, players: { min: 6, best: 6, max: 12 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [15, 15], kit: { balls: 6, cones: 4, bibs: 2 },
      setupMins: 2, adults: 1, indoor: true, groups: ['small'], involvement: 2, competitive: true,
      positions: ['Mid', 'Forward'], skills: ['first-touch', 'shielding', 'turning', 'scanning', 'decision-making'], principles: ['support'],
      moments: ['attack'], physical: ['strength', 'agility'],
      setup: 'A 15 × 15 yd square. A server on each side; one receiver and one defender inside.',
      how: [
        'A server plays into the receiver. The defender marks her tight.',
        'The receiver turns and passes to the opposite server, or lays it back and spins for a return from another.',
        'Turning to the opposite side scores two; a lay-off and spin scores one. The defender scores by winning it.',
        'Ninety seconds, then swap.'
      ],
      points: ['Feel the defender with your arm and back before the ball comes.', 'Tight? Set it. Space? Turn.', 'Move away, then come back: make a yard to receive in.'],
      questions: ['How did you know whether to turn?'],
      mistakes: ['Receiving flat-footed with the defender straight behind: half-turn and move before the pass.'],
      why: 'Midfielders and strikers receive with someone on their back all game. Knowing when to turn and when to set it is the decision that keeps or loses the ball.',
      easier: ['A passive defender.'],
      harder: ['Two touches max for the receiver.', 'Servers move along their sides, so the target keeps changing.'],
      diagram: {
        area: [15, 15], mark: 'grid', cones: [[0, 0], [15, 0], [0, 15], [15, 15]],
        players: { N1: [7.5, 15], N2: [15, 7.5], N3: [7.5, 0], N4: [0, 7.5], A1: [7.5, 8.5], D1: [7.5, 6.5] },
        ball: 'N1',
        frames: [
          ['A1-7.5,10', 'D1-A1', 'N1>A1', '# She comes to meet it, defender tight'],
          ['A1~10.2,7.4', 'D1-8.6,8.6', '# Room to turn? Spin away from her'],
          ['A1>N3', '# Opposite side: two points']
        ]
      },
      signals: ['possession'], goesWith: ['open-up-and-turn', 'hold-up-and-lay-off'], tags: []
    },

    {
      id: '1v1-four-sides', v: 1, name: '1v1 from four sides', type: 'opposed',
      summary: 'Four teams on four sides of a square. The coach calls two colours, and those two race for the ball and go 1v1 to any gate but their own.',
      ages: [8, 19], level: 2, players: { min: 8, best: 12, max: 16 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [20, 20], kit: { balls: 12, cones: 12, bibs: 12 },
      setupMins: 4, adults: 1, indoor: true, groups: ['teams'], involvement: 2, competitive: true,
      positions: OUTFIELD, skills: ['1v1-attack', '1v1-defend', 'dribbling', 'scanning'], principles: ['pressure', 'penetration'],
      moments: ['attack', 'defend', 'toAttack'], physical: ['speed', 'agility'],
      setup: 'A 20 × 20 yd square with a 3 yd gate in the middle of each side. Four teams, one behind each side.',
      how: [
        'The coach plays a ball into the middle and calls two colours.',
        'The first player of each races for it. Whoever gets it attacks any gate except her own team\'s.',
        'The other defends, and attacks if she wins it. Twenty seconds max.',
        'A point per gate. First team to ten.'
      ],
      points: ['Win the race, then look up: which gate is open?', 'Defender: get goal-side fast, then slow down and show her the long way round.'],
      questions: ['How did you choose which gate to go for?'],
      mistakes: ['Attacking the gate the defender is standing in: look for the open one.'],
      why: 'Every 1v1 starts from a different angle with a race, the way they do in a game. Players have to decide where to go, not just how to beat someone.',
      easier: ['The coach names who attacks and who defends.'],
      harder: ['Three colours: 2v1, or every player for herself.'],
      diagram: {
        area: [20, 20], mark: 'grid',
        cones: [[0, 0], [20, 0], [0, 20], [20, 20], [8.5, 0], [11.5, 0], [20, 8.5], [20, 11.5], [8.5, 20], [11.5, 20], [0, 8.5], [0, 11.5]],
        players: { A1: [10, 21.3], A2: [11.5, 21.3], D1: [21.3, 10], D2: [21.3, 11.5], N1: [10, -1.3], N2: [8.5, -1.3], B1: [-1.3, 10], B2: [-1.3, 8.5], C: [-1, 21] },
        ball: 'C',
        frames: [
          ['C>10,10', 'A1-10,11', 'D1-11.5,10', '# Two colours called: race for it'],
          ['A1~4,13.5', 'D1-A1', '# Win it, then pick an open gate'],
          ['A1~-0.6,10.2', '# Through the gate: a point']
        ]
      },
      signals: ['one-scorer', 'fouls'], goesWith: ['1v1-to-mini-goals', 'move-combinations'], tags: ['competitive']
    },

    {
      id: '2v2-bounce-players', v: 1, name: '2v2 with bounce players', type: 'opposed',
      summary: '2v2 in a box with a bounce player on each side for one-twos. Combination play with real pressure on it.',
      ages: [10, 19], level: 2, players: { min: 6, best: 8, max: 12 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [20, 20], kit: { balls: 8, cones: 4, minigoals: 2, bibs: 6 },
      setupMins: 3, adults: 1, indoor: true, groups: ['small', 'teams'], involvement: 3, competitive: true,
      positions: OUTFIELD, skills: ['combination', 'passing', 'movement', '1v1-defend'], principles: ['support', 'penetration', 'mobility'],
      moments: ['attack', 'defend'], physical: ['endurance'],
      setup: 'A 20 × 20 yd box with a mini goal at each end. 2v2 inside, and a neutral bounce player on each side who plays one touch for whoever has the ball.',
      how: [
        'Play 2v2 to the mini goals.',
        'The bounce players play one touch, for either team.',
        'A goal straight after a one-two with a bounce player counts double.',
        'Two minutes, then rotate pairs and bounce players.'
      ],
      points: ['Use the bounce player to get past a defender, then sprint into the space.', 'Pass and go: the one-two only works if you move.', 'Defenders: after a pass to the side, track the runner, not the ball.'],
      questions: ['When was the bounce player the best option?'],
      mistakes: ['Passing to the bounce player and standing still: that\'s a pass, not a one-two.'],
      why: 'Used well, it turns 2v2 into 4v2. Players learn that a one-two beats a defender faster than any dribble.',
      easier: ['Bounce players get two touches.'],
      harder: ['Only goals straight after a one-two count.'],
      diagram: {
        area: [20, 20], mark: 'grid', cones: [[0, 0], [20, 0], [0, 20], [20, 20]],
        goals: [[0, 10, 'mini', 'e'], [20, 10, 'mini', 'w']],
        players: { A1: [6, 8], A2: [7, 14], D1: [11, 8], D2: [13, 13], N1: [10, -1], N2: [10, 21] },
        ball: 'A1',
        frames: [
          ['A1>N1', 'A1-14,5', '# Pass to the bounce player and go'],
          ['N1>A1', 'D1-A1', '# One touch, into her run'],
          ['A1>G', '# Score straight after: double']
        ]
      },
      signals: ['solo-goals', 'possession'], goesWith: ['2v1-to-goal', 'overlap-2v1-wide'], tags: []
    },

    {
      id: 'finishing-circuit', v: 1, name: 'Finishing circuit', type: 'opposed',
      summary: 'Three finishes in a row against one keeper: turn and shoot, a 1v1 with the keeper, and a first-time finish from a cut-back.',
      ages: [10, 19], level: 2, players: { min: 6, best: 9, max: 12 }, gk: 1, minutes: [15, 20], intensity: 3,
      space: [44, 30], kit: { balls: 15, cones: 8, goals: 1 },
      setupMins: 5, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['Forward', 'Mid', 'Wing'], skills: ['shooting', 'turning', '1v1-attack', 'first-touch'], principles: ['penetration'],
      moments: ['attack'], physical: ['speed'],
      setup: 'A goal with a keeper and three starting points: the D (turn and shoot), 25 yd out wide (1v1 with the keeper), and a server on the byline (cut-backs).',
      how: [
        'Finish 1: the coach passes in at the D; turn and shoot.',
        'Finish 2: run to the far cone, receive a ball in behind, and take on the keeper.',
        'Finish 3: run onto a cut-back from the byline and finish first time.',
        'The next player starts as soon as the first is on finish 2.'
      ],
      points: ['Each finish is different: placement for the turn, patience in the 1v1, side-foot for the cut-back.', 'Keep moving between finishes. It\'s a game rhythm, not a queue.', 'Follow every shot in.'],
      questions: ['Which finish did you rush? What would have been better?'],
      mistakes: ['Blasting every shot: name the finish before the round and count on-target first.'],
      why: 'Strikers get different chances every game. Three kinds in one run, at game speed and tired, is closer to a match than fifty shots from one spot.',
      easier: ['No keeper for finish 2, or a bigger goal.'],
      harder: ['A recovering defender on each finish.', 'Weaker foot for finish 3.'],
      diagram: {
        area: [44, 30], mark: 'box', goals: [[22, 0, 'big', 's']],
        cones: [[22, 22], [32, 26], [38, 2.5]],
        players: { K: [22, 1.5], C: [24, 28.5], N1: [38, 3], A1: [22, 23] },
        ball: ['C', 'C', 'N1'],
        frames: [
          ['C>A1', 'A1-21.5,20', '# 1: at the D, turn and shoot'],
          ['A1>G', 'A1-31,25', '# Shoot, then off to the next cone'],
          ['A1-27,12', 'C>A1', 'K-23,4', '# 2: ball in behind, 1v1 with the keeper'],
          ['A1>G', 'A1-22,13', '# Finish low; then to the penalty spot'],
          ['N1>A1', '# 3: cut-back from the byline…'],
          ['A1>G', '# …first time']
        ]
      },
      signals: ['few-shots', 'off-target', 'one-scorer'], goesWith: ['turn-and-shoot', 'lay-off-and-shoot'], tags: ['finishing']
    },

    {
      id: 'recovery-runs', v: 1, name: 'Recovery runs', type: 'opposed',
      summary: 'A defender starts beside or behind the attacker and has to sprint back goal-side before she can defend. Transition defending, one at a time.',
      ages: [9, 19], level: 2, players: { min: 4, best: 10, max: 14 }, gk: 1, minutes: [10, 15], intensity: 3,
      space: [44, 32], kit: { balls: 12, cones: 6, goals: 1, bibs: 6 },
      setupMins: 3, adults: 1, indoor: false, groups: ['pairs'], involvement: 2, competitive: true,
      positions: ['Back', 'Mid', 'Wing'], skills: ['1v1-defend', 'communication'], principles: ['delay', 'pressure', 'cover'],
      moments: ['toDefend', 'defend'], physical: ['speed', 'endurance'],
      setup: 'A goal with a keeper. The attacker starts 30 yd out with a ball; the defender starts 3 yd to her side, or a yard behind.',
      how: [
        'On the whistle the attacker drives at goal. The defender sprints back.',
        'No tackling from behind: get goal-side first, then defend.',
        'The attacker scores, or the defender wins it and dribbles out wide. Next pair.'
      ],
      points: ['Run the shortest line back towards goal, not at the ball.', 'Get goal-side, then turn and face her: the race first, the tackle second.', 'Recover inside her, to protect the middle.'],
      questions: ['Which line did you run back? Where did you end up?'],
      mistakes: ['Chasing the ball and tackling from behind: a foul, or worse. Call it every time.'],
      why: 'Most goals against a youth team come straight after losing the ball. A player who recovers goal-side instead of chasing turns those into a 1v1 the keeper can help with.',
      easier: ['The defender starts level, and the attacker jogs the first rep.'],
      harder: ['The defender starts two yards behind.', '2v1 with one recovering defender.'],
      safety: 'No sliding tackles from behind. Stop the rep the moment one happens.',
      diagram: {
        area: [44, 32], mark: 'box', goals: [[22, 0, 'big', 's']],
        players: { K: [22, 1.5], A1: [26, 30], D1: [29.5, 31] },
        ball: 'A1',
        frames: [
          ['A1~25,19', 'D1-21,17', '# She drives; you sprint the shortest line back'],
          ['A1~26,13', 'D1-A1', '# Goal-side first, then face her'],
          ['D1*A1', '# Then win it']
        ]
      },
      signals: ['conceding', 'shots-against', 'late-goals', 'fouls'], goesWith: ['jockey-channel', 'five-second-press'], tags: ['transition', 'defending']
    },

    {
      id: 'marking-game', v: 1, name: 'Marking game', type: 'opposed',
      summary: 'A small-sided game where every defender has one player to mark: stay goal-side, see her and the ball, and stop her receiving.',
      ages: [10, 19], level: 2, players: { min: 8, best: 12, max: 14 }, gk: 2, minutes: [12, 18], intensity: 3,
      space: [40, 30], kit: { balls: 6, cones: 8, goals: 2, bibs: 7 },
      setupMins: 4, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
      positions: ALL, skills: ['1v1-defend', 'communication', 'movement', 'scanning'], principles: ['pressure', 'cover'],
      moments: ['defend', 'attack'], physical: ['endurance'],
      setup: 'A 40 × 30 yd pitch with goals and keepers. 4v4 to 6v6, everyone paired with an opponent of similar size and speed.',
      how: [
        'Each player marks only her partner, and only she may tackle her.',
        'Attackers work to lose their marker: check away, change pace, move off the ball.',
        'Play it normally for the last few minutes and see who keeps marking.'
      ],
      points: ['Goal-side and ball-side: between her and the goal, able to see her and the ball.', 'Tighter when she\'s near the ball or the goal; looser when she\'s far away.', 'Attackers: one sharp change of direction loses a marker who\'s watching the ball.'],
      questions: ['Could you see your player and the ball at the same time? How?'],
      mistakes: ['Ball-watching while her player walks away: freeze play and point to where she went.'],
      why: 'Marking is a basic job for every defender and midfielder, and the first defending skill young players can really learn. Attackers learn to lose a marker, which is half of getting the ball.',
      easier: ['Markers may stand off a yard or two more.'],
      harder: ['A goal only counts if the scorer lost her marker in the build-up (the coach\'s call).'],
      diagram: {
        area: [40, 30], mark: 'grid', cones: [[0, 0], [40, 0], [0, 30], [40, 30]],
        goals: [[0, 15, 'big', 'e'], [40, 15, 'big', 'w']],
        players: {
          K1: [1.5, 15], K2: [38.5, 15], A1: [14, 15], A2: [20, 6], A3: [22, 24], A4: [26, 13],
          D1: [17, 15], D2: [22.5, 7], D3: [24.5, 23], D4: [28.5, 13.5]
        },
        ball: 'A1',
        frames: [
          ['A4-24,10', 'D4-26.6,11', '# Attackers check away to lose a marker'],
          ['A4-31,17', 'D4-32.5,15', 'A1>A3', 'D3-A3', '# Goal-side and ball-side: see both'],
          ['A3>A4', 'D4*A4', '# Stay with her, and you win it']
        ]
      },
      signals: ['conceding', 'shots-against', 'one-scorer'], goesWith: ['recovery-runs', 'two-banks'], tags: ['defending']
    },

    {
      id: 'numbers-game', v: 1, name: 'Numbers', type: 'opposed',
      summary: 'Two teams on the sidelines, everyone with a number. The coach calls a number and plays a ball in; those players race on for a 1v1.',
      ages: [6, 14], level: 1, players: { min: 6, best: 12, max: 16 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [20, 25], kit: { balls: 10, cones: 4, minigoals: 2, bibs: 8 },
      setupMins: 3, adults: 1, indoor: true, groups: ['teams'], involvement: 2, competitive: true,
      positions: OUTFIELD, skills: ['1v1-attack', '1v1-defend', 'decision-making', 'combination'], principles: ['pressure', 'support', 'penetration'],
      moments: ['attack', 'defend', 'toAttack', 'toDefend'], physical: ['speed'],
      setup: 'A 20 × 25 yd pitch with a mini goal at each end. Two teams stand on opposite sidelines, numbered so each number is on both teams. The coach has the balls at halfway.',
      how: [
        'The coach calls a number and plays a ball in. Both players with that number race on and play 1v1, each team attacking one goal.',
        'A goal, or the ball out of play, and they go back. Next number.',
        'Call two or three numbers for 2v2 and 3v3. Call a number and then another a few seconds later, so one side is a player up for a moment.'
      ],
      points: [
        'Get to the ball first, or get goal-side of whoever does.',
        'Attack fast: help for the other side may be on its way.',
        'In 2v2 and 3v3, one goes to the ball and the others find space.'
      ],
      questions: ['When you were a player down, what did you do until help came?', 'When you got there second, where did you run?'],
      mistakes: [
        'Long waits: call numbers quickly, and give everyone two numbers so nobody sits for long.',
        'Calling the quick ones more: everybody gets called the same number of times.'
      ],
      why: 'A race, a duel and a quick decision about when to pass, all in one. And the players waiting watch closely, because their number could be next.',
      easier: ['The coach plays the ball nearer one player, so she is clearly first to it.'],
      harder: ['Call different numbers from each team, so the sides are uneven.', 'Big goals with keepers.'],
      diagram: {
        area: [24, 25], mark: 'none',
        cones: [[2, 0], [22, 0], [2, 25], [22, 25]],
        goals: [[12, 0, 'mini', 's'], [12, 25, 'mini', 'n']],
        players: {
          A1: [0.5, 5], A2: [0.5, 9], A3: [0.5, 17], A4: [0.5, 21], C: [0.5, 13],
          D1: [23.5, 5], D2: [23.5, 9], D3: [23.5, 17], D4: [23.5, 21]
        },
        ball: 'C',
        frames: [
          ['C>12,13', 'A2-11,12', 'D2-13.5,10.5', '# "Two!" Both race on for the ball'],
          ['A2~10,5', 'D2-A2', '# 1v1: attack the goal you face'],
          ['A2>G', 'D2-11,3', '# Score, then back. Next number']
        ]
      },
      signals: ['one-scorer', 'few-shots', 'conceding'], goesWith: ['1v1-to-mini-goals', '3v3-small-sided'], tags: ['fun', 'competitive']
    },

    {
      id: 'guard-the-castle', v: 1, name: 'Guard the castle', type: 'opposed',
      summary: 'An attacker circles a cone castle trying to knock it over; the defender keeps herself between the ball and the castle.',
      ages: [6, 11], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [8, 12], intensity: 3,
      space: [10, 10], kit: { balls: 10, cones: 30 },
      setupMins: 3, adults: 1, indoor: true, groups: ['pairs'], involvement: 3, competitive: true,
      positions: OUTFIELD, skills: ['1v1-defend', '1v1-attack', 'passing'], principles: ['pressure', 'delay'],
      moments: ['defend', 'attack'], physical: ['agility'],
      setup: 'For each pair, a circle of cones about 10 yd across with a tall cone, the castle, in the middle. Four small cones 2 yd round the castle make a ring nobody may enter. An attacker with a ball, a defender.',
      how: [
        'The attacker moves round outside the ring and tries to knock the castle over with a pass.',
        'The defender may not go inside the ring. She has to stay between the ball and the castle as the attacker moves.',
        'A knock-down is a point. 45 seconds, then swap. Most points after three rounds wins.'
      ],
      points: [
        'Defender: between the ball and the castle, side-on, on your toes.',
        'Watch the ball, not her feet or her face.',
        'Attacker: move the ball quickly side to side to open a gap, then hit it.'
      ],
      questions: ['Defender: where did you stand to block every shot?', 'Attacker: how did you make a gap?'],
      mistakes: [
        'The defender diving in to win the ball: she only has to block. Stay on your feet.',
        'The defender camping inside the ring: move her out.'
      ],
      why: 'Staying between the ball and what you\'re protecting is where all defending starts, and it\'s much easier to see with a castle than a goal.',
      easier: ['A bigger castle (two cones together), and the attacker walks.'],
      harder: ['Two castles to guard.', 'Two attackers passing round one defender.'],
      diagram: {
        area: [12, 12], mark: 'none',
        cones: [
          [11, 6], [9.5, 9.5], [6, 11], [2.5, 9.5], [1, 6], [2.5, 2.5], [6, 1], [9.5, 2.5],
          [8, 6], [6, 8], [4, 6], [6, 4], [6, 6]
        ],
        players: { A1: [2.6, 9.4], D1: [4.4, 7.8] },
        ball: 'A1',
        frames: [
          ['A1~6,10.6', 'D1-6,8.5', '# She moves round; you stay in between'],
          ['A1~9.6,8.8', 'D1-8,7.8', '# Watch the ball: shuffle, don\'t dive'],
          ['A1~10,4', 'D1-8.4,7', '# A quick touch, and she\'s slow across…'],
          ['A1>6,6', '# …so knock the castle over']
        ]
      },
      signals: ['shots-against', 'conceding'], goesWith: ['jockey-channel', '1v1-to-mini-goals'], tags: ['young', 'fun', 'defending']
    },

    {
      id: 'stay-on-your-feet', v: 1, name: 'Stay on your feet', type: 'opposed',
      summary: 'The block tackle and the poke, then live 1v1s up a channel where any slide or lunge gives the attacker the point.',
      ages: [9, 19], level: 2, players: { min: 2, best: 10, max: 16 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [12, 15], kit: { balls: 8, cones: 12, bibs: 6 },
      setupMins: 3, adults: 1, indoor: true, groups: ['pairs'], involvement: 2, competitive: true,
      positions: OUTFIELD, skills: ['1v1-defend', 'pressing'], principles: ['pressure', 'delay'],
      moments: ['defend', 'toAttack'], physical: ['agility', 'balance'],
      setup: 'Channels 5 yd wide and 15 yd long, an attacker and a defender in each. The attacker starts with the ball at one end and tries to stop it on the far line.',
      how: [
        'Walk it through first: the block tackle (inside of the foot through the middle of the ball, knee bent, weight over it) and the poke (front foot nicks it away when her touch is too big).',
        'Then live 1v1s up the channel. The defender scores by winning the ball and dribbling it back over the start line.',
        'Any slide, any lunge from behind, any contact before the ball: the attacker gets the point and goes again.',
        'Swap after every turn.'
      ],
      points: [
        'Close fast, then slow down: short steps, knees bent, side-on.',
        'Tackle when her touch is too big or her head goes down, not before.',
        'Stay on your feet. A defender on the ground is out of the game.'
      ],
      questions: ['When was the right moment to tackle?', 'What made you dive in?'],
      mistakes: [
        'Lunging from a long way off: the attacker just touches it round. Get closer before you commit.',
        'Tackling with the toe: block through the middle with the inside of the foot.'
      ],
      why: 'Most fouls in youth games come from late or lunging tackles. A defender who waits for the moment and tackles on her feet wins the ball cleanly, and stops giving away free kicks near her own box.',
      easier: ['The attacker walks, so the defender can practise the timing.'],
      harder: ['A narrower channel, and five seconds for the attacker.', 'Two attackers against one: delay until a teammate arrives.'],
      diagram: {
        area: [12, 16], mark: 'none',
        cones: [[0, 0], [5, 0], [0, 15], [5, 15], [7, 0], [12, 0], [7, 15], [12, 15]],
        players: { A1: [2.5, 15], D1: [2.5, 3], A2: [9.5, 15], D2: [9.5, 3] },
        ball: ['A1', 'A2'],
        frames: [
          ['A1~2.5,10', 'D1-2.5,7', 'A2~9.5,10', 'D2-9.5,7', '# Close her down fast, then slow down'],
          ['A1~3.5,8', 'D1*A1', 'A2~8.5,8.5', 'D2-9,6.5', '# A big touch? Block tackle, on your feet'],
          ['D1~1.2,15.5', 'D2*A2', '# Win it, and take it over her line']
        ]
      },
      signals: ['fouls', 'conceding'], goesWith: ['jockey-channel', '1v1-to-mini-goals'], tags: ['defending']
    },

    {
      id: 'clear-and-step-out', v: 1, name: 'Clear it, then step out', type: 'opposed',
      summary: 'Crosses into a defended box: clear it high, wide and far, then the whole line steps out together on the keeper\'s call.',
      ages: [12, 19], level: 2, players: { min: 6, best: 10, max: 14 }, gk: 1, minutes: [12, 15], intensity: 2,
      space: [44, 30], kit: { balls: 12, goals: 1, cones: 6, bibs: 6 },
      setupMins: 3, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['GK', 'Back', 'Mid'], skills: ['heading', '1v1-defend', 'communication', 'shape'], principles: ['cover', 'compactness'],
      moments: ['defend'], physical: ['strength'],
      setup: 'A goal and keeper, three defenders in the box, two attackers, and a server out wide with the balls (the coach, or a player). Cones mark the 18-yd line if there are no markings.',
      how: [
        'The server crosses, or throws at first. The defenders attack the ball and clear it high, wide and far, with a header or a volley.',
        'The moment it is cleared, the keeper calls "Out!" and the back line steps out together past the 18-yd line, leaving the attackers behind it.',
        'Attackers score from anything that drops short. Anyone still in the box when the line steps out is in the wrong place: the coach plays the next ball straight to the attacker she left.'
      ],
      points: [
        'Attack the ball at its highest point. Don\'t wait for it to drop.',
        'High, wide and far: never back through the middle.',
        'Step out together, on the keeper\'s call, as soon as the ball has gone.'
      ],
      questions: ['Where should the ball go when you can\'t control it?', 'Why does the line step out straight after?'],
      mistakes: [
        'Clearing into the middle, straight back to the edge of the box.',
        'One defender steps out and the rest stay: the attacker behind them is onside. Step on the call.'
      ],
      why: 'Crosses and corners turn into goals when the first clearance is short or central, or when the line stays deep and the second ball drops among attackers. Clear it properly and step up, and the danger has gone.',
      easier: ['Thrown balls, no attackers, and defenders clear with a volley or a catch-and-throw instead of a header.'],
      harder: ['Live attackers contest every cross.', 'A second ball is served in the moment the line steps out.'],
      safety: 'Heading is for U12 and older only here. US Soccer limits heading practice for ages 11 to 13 to about 30 minutes a week and 15 to 20 headers per player, and the FA keeps heading out of training at primary-school age. Follow your own federation\'s current rules, start with soft thrown balls and a light ball, cap the headers each player takes, and stop anyone who looks dazed or has a headache.',
      diagram: {
        area: [44, 30], mark: 'box',
        cones: [[0, 18], [44, 18]],
        goals: [[22, 0, 'big', 's']],
        players: { K: [22, 1.5], D1: [17, 7], D2: [22, 8], D3: [27, 7], A1: [20, 12], A2: [26, 12], C: [42, 10] },
        ball: 'C',
        frames: [
          ['C>D2', 'A1-21,10', '# The cross comes in: attack it'],
          ['D2>38,28', '# Clear it high, wide and far'],
          ['D1-17,19', 'D2-22,19.5', 'D3-27,19', 'K-22,5', '# "Out!" The line steps up together']
        ]
      },
      signals: ['corners-against', 'shots-against'], goesWith: ['defending-corners', 'heading-basics'], tags: ['defending']
    },

    {
      id: 'switch-the-play', v: 1, name: 'Switch the play', type: 'opposed',
      summary: 'Two mini goals on each end line. A goal is one point, or three if it comes straight after a pass that moves the ball across the pitch.',
      ages: [11, 19], level: 3, players: { min: 10, best: 12, max: 16 }, gk: 0, minutes: [12, 18], intensity: 2,
      space: [40, 30], kit: { balls: 8, cones: 12, bibs: 8, minigoals: 4 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
      positions: OUTFIELD, skills: ['long-passing', 'scanning', 'passing', 'decision-making'], principles: ['width', 'penetration', 'balance'],
      moments: ['attack', 'defend'], physical: ['endurance'],
      setup: 'A 40 × 30 yd pitch with two mini goals on each end line, one near each corner. A line of cones lengthways splits it into a left and right side. 5v5 or 6v6.',
      how: [
        'Each team attacks the two goals on the far end line and defends the two on its own.',
        'A goal is a point. A goal straight after a pass that crosses the cone line, a switch, is three.',
        'Defending: shift across together to protect the side the ball is on, and the far player tucks in.'
      ],
      points: [
        'Draw them to one side first, then switch.',
        'Look before the ball arrives, so you know whether the far side is free.',
        'Drive the switch in front of the receiver so she can run onto it.',
        'Defending: shift as a group, and don\'t leave the far goal open.'
      ],
      questions: ['What told you it was time to switch?', 'Defending: who left the far goal open, and why?'],
      mistakes: [
        'Switching before the other team has shifted across: there\'s no space to switch into.',
        'A slow, floated switch: the defence has time to shift back.'
      ],
      why: 'Teams that keep the ball on one side get crowded out. Moving it from a busy side to an empty one is how good teams find space, and defending it teaches a team to shift together.',
      easier: ['A free player on each side who always plays for the team with the ball.'],
      harder: ['Two-touch.', 'A switch only counts if it reaches the far side first time.'],
      diagram: {
        area: [40, 30], mark: 'none',
        cones: [[0, 0], [40, 0], [0, 30], [40, 30], [20, 0], [20, 30]],
        lines: [[20, 0, 20, 30]],
        goals: [[8, 0, 'mini', 's'], [32, 0, 'mini', 's'], [8, 30, 'mini', 'n'], [32, 30, 'mini', 'n']],
        players: {
          A1: [8, 18], A2: [14, 15], A3: [30, 16], A4: [20, 24],
          D1: [9, 12], D2: [16, 10], D3: [24, 10], D4: [31, 9]
        },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D1-11,13', 'D2-15,12', 'D3-19,10', '# Draw them to one side'],
          ['A3-33,10', 'A2>A3', 'D4-29,7', '# Switch, in front of her, into space'],
          ['A3>G', '# A goal straight after a switch is three']
        ]
      },
      signals: ['possession', 'few-shots'], goesWith: ['wide-channel-game', 'driven-passes'], tags: ['uses-your-shape']
    },

    /* ---------------- positions and units ---------------- */

    /* Drills about a position's job rather than a skill: where to be with the
       ball and without it, and how a unit (the back line, the midfield, the
       front three) moves together. ROLE_GUIDE below links each position to
       these and says what the job is. */

    {
      id: 'know-your-position', v: 1, name: 'Know your position', type: 'position',
      summary: 'The team stands in its shape; the coach walks the ball to different spots, every player moves to where she should be, then says what her job is there.',
      ages: [8, 19], level: 1, players: { min: 7, best: 11, max: 16 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [60, 44], kit: { balls: 2, cones: 12, goals: 1 },
      setupMins: 2, adults: 1, indoor: false, groups: ['squad'], involvement: 2, competitive: false,
      positions: ALL, skills: ['shape', 'movement', 'communication', 'decision-making'], principles: ['width', 'support', 'compactness', 'balance'],
      moments: ['attack', 'defend'], physical: [],
      setup: 'Half a pitch or more, the team set out in the shape you play on Saturday. The coach has the ball.',
      how: [
        'The coach walks the ball to a spot: our left, our right, near our goal, their box.',
        'At each spot, players move to where they would be, then freeze.',
        'The coach picks two players: "What\'s your job right now?" They answer in a sentence.',
        'Then the same with the ball as theirs: "They have it on our right. Where are you?"'
      ],
      points: [
        'Every player has a job with and without the ball, wherever the ball is.',
        'Close enough to help, far enough apart to make the pitch big.',
        'Ask, don\'t tell. The answer they give is the one they remember.'
      ],
      questions: ['Ball\'s with our left back: what is the right winger doing?', 'They have it in our half: who goes, who covers, who stays?'],
      mistakes: ['Players moving only when the ball is near them: everyone moves for every spot.'],
      why: 'Players can\'t do a job they can\'t describe. Walking it through gives every player a picture of her position before she has to do it at speed.',
      easier: ['Three spots, and the coach answers the first round.'],
      harder: ['A passive opponent moves the ball instead of the coach.', 'Players ask each other the questions.'],
      diagram: {
        area: [60, 44], mark: 'half', goals: [[30, 0, 'big', 's']],
        players: { K: [30, 1.5], A1: [18, 12], A2: [42, 12], A3: [12, 24], A4: [30, 22], A5: [48, 24], A6: [30, 34], C: [30, 40] },
        ball: 'C',
        frames: [
          ['C~10,32', 'A3-8,27', 'A1-14,15', 'A4-24,24', 'A6-22,34', 'A2-36,15', 'A5-40,27', '# Ball on our left: everyone shifts'],
          ['C~50,32', 'A3-18,27', 'A1-22,15', 'A4-36,24', 'A6-38,34', 'A2-46,15', 'A5-52,27', '# Ball on our right: shift again'],
          ['C~30,9', 'A1-22,6', 'A2-38,6', 'A3-20,15', 'A4-30,14', 'A5-40,15', 'A6-30,23', '# Ball near our goal: everyone tucks in']
        ]
      },
      signals: ['conceding', 'possession'], goesWith: ['shadow-play', 'stay-in-your-zone'], tags: ['uses-your-shape', 'positional']
    },

    {
      id: 'spread-out-game', v: 1, name: 'Don\'t be a bee', type: 'position',
      summary: 'For the youngest: a game that turns swarming round the ball into spreading out. Some near the ball, some wide, one back.',
      ages: [5, 9], level: 1, players: { min: 6, best: 10, max: 14 }, gk: 0, minutes: [8, 12], intensity: 2,
      space: [25, 20], kit: { balls: 4, cones: 8, minigoals: 2, bibs: 6 },
      setupMins: 2, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: false,
      positions: OUTFIELD, skills: ['movement', 'shape', 'passing'], principles: ['width', 'support'],
      moments: ['attack'], physical: [],
      setup: 'A small pitch with mini goals. "Home" cones near each touchline and one in front of each goal.',
      how: [
        'Play a small game. When the coach shouts "Bees!", everyone freezes.',
        'Anyone squashed into the swarm round the ball runs to a home cone.',
        'Restart. Count the bees each time and try to get the number down.',
        'Then: a goal only counts if a player from a wide home cone touched it first.'
      ],
      points: ['One or two go to the ball. The rest find space where the ball can come.', 'Wide is good. The sideline is your friend.', 'One stays back to help.'],
      questions: ['If everyone is by the ball, where can it go next?', 'Where\'s a good place to stand when your friend has the ball?'],
      mistakes: ['Shouting "spread out!" without showing where: walk them to the home cones the first few times.'],
      why: 'Swarming is normal at this age, and coaching it away with words doesn\'t work. A game where spreading out is how you score gives young players their first idea of a position.',
      easier: ['3v3, with a home cone each.'],
      harder: ['Take the home cones away and see if they still spread.'],
      diagram: {
        area: [25, 20], mark: 'grid',
        goals: [[0, 10, 'mini', 'e'], [25, 10, 'mini', 'w']],
        cones: [[0, 0], [25, 0], [0, 20], [25, 20], [8, 1.2], [17, 1.2], [8, 18.8], [17, 18.8]],
        players: { A1: [12, 10], A2: [12.8, 11.4], A3: [11, 9], D1: [13.6, 10], D2: [12.6, 8.6], D3: [11.6, 11.6] },
        ball: 'A1',
        frames: [
          ['A1~12.4,10.4', 'A2-12.2,11.6', 'A3-11.6,9.2', 'D1-13.4,10.8', '# Everyone round the ball: a swarm'],
          ['A2-17,2', 'A3-8,18', '# "Bees!" Two fly out to the wide cones'],
          ['A1>A2', '# Now there\'s somewhere to pass'],
          ['A2~21,6', '# Wide, and forward…'],
          ['A2>G', '# …and it counts']
        ]
      },
      signals: ['one-scorer'], goesWith: ['3v3-small-sided', 'everyone-plays-everywhere'], tags: ['young', 'fun', 'positional']
    },

    {
      id: 'everyone-plays-everywhere', v: 1, name: 'Everyone plays everywhere', type: 'position',
      summary: 'A small-sided game where everyone moves one position along every three minutes, with a one-question quiz on the new job at each switch.',
      ages: [7, 14], level: 1, players: { min: 8, best: 10, max: 14 }, gk: 0, minutes: [15, 20], intensity: 2,
      space: [40, 28], kit: { balls: 6, cones: 8, goals: 2, bibs: 7 },
      setupMins: 3, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
      positions: ALL, skills: ['shape', 'decision-making', 'communication'], principles: ['width', 'support', 'balance'],
      moments: ['attack', 'defend', 'toAttack', 'toDefend'], physical: ['endurance'],
      setup: 'A small-sided game in your format with goals. Give everyone a starting position and an order: keeper, back, left mid, right mid, forward.',
      how: [
        'Play three minutes. On the whistle, everyone moves one position along: keeper to back, back to midfield, and so on, forward to keeper.',
        'At each switch, ask two players one question about the job they\'re about to do.',
        'Keep going until everyone has played every position at least once.'
      ],
      points: ['Every position has a job with the ball and without it.', 'Notice who loves which job, and who is surprisingly good where she\'s never played.', 'The app\'s minutes by position will show who has been stuck in one place.'],
      questions: ['You\'re the back now: where do you stand when we have the ball?', 'You\'re the forward: what do you do when we lose it?'],
      mistakes: ['Letting players swap back to their favourite: the order decides.'],
      why: 'Young players should try every position before they settle in one, and playing a role is the best way to understand the players around it. It\'s also how a coach finds the keeper nobody knew about.',
      easier: ['Four-minute rounds and fewer positions.'],
      harder: ['Each player has one job to do well in her round, for a point.'],
      diagram: {
        area: [40, 28], mark: 'grid', cones: [[0, 0], [40, 0], [0, 28], [40, 28]],
        goals: [[0, 14, 'big', 'e'], [40, 14, 'big', 'w']],
        players: { A5: [1.5, 14], A1: [9, 14], A2: [17, 8], A3: [17, 20], A4: [26, 14], D1: [32, 14], D2: [24, 8], D3: [24, 20], D4: [14, 14], D5: [38.5, 14] },
        labels: [[5.5, 10.8, 'KEEPER']],
        frames: [
          ['A5-9,14', 'A1-17,8', 'A2-17,20', 'A3-26,14', 'A4-1.5,14', '# Whistle: everyone moves one position on'],
          ['A4-9,14', 'A5-17,8', 'A1-17,20', 'A2-26,14', 'A3-1.5,14', '# Three minutes later, on again']
        ]
      },
      signals: ['one-scorer', 'conceding'], goesWith: ['know-your-position', 'spread-out-game'], tags: ['positional', 'fun']
    },

    {
      id: 'stay-in-your-zone', v: 1, name: 'Stay in your zone', type: 'position',
      summary: 'A game on a pitch split into thirds and wide channels, where every player owns a zone. Width and depth without saying a word.',
      ages: [9, 16], level: 2, players: { min: 10, best: 14, max: 18 }, gk: 2, minutes: [12, 18], intensity: 2,
      space: [60, 40], kit: { balls: 6, cones: 20, goals: 2, bibs: 9 },
      setupMins: 6, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
      positions: ALL, skills: ['shape', 'passing', 'movement', 'scanning'], principles: ['width', 'support', 'balance', 'compactness'],
      moments: ['attack', 'defend'], physical: [],
      setup: 'Mark the pitch into thirds with cones along the touchlines, and a wide channel down each side. Give each player a zone that matches her position.',
      how: [
        'Play a normal game, but players must stay in their own zone.',
        'A wide player in her channel can\'t be tackled for two seconds after receiving.',
        'After five minutes, players may leave their zone for one run per attack, but must get back.',
        'Last five minutes: no zones. See who holds her position.'
      ],
      points: ['Your zone is your job. Fill it, and trust a teammate to fill hers.', 'Wide players: stay wide so the pitch stays big.', 'Watch the spaces between zones: that\'s where passes go.'],
      questions: ['When the zones came off, who still held her position? Why does it matter?'],
      mistakes: ['Zones so small players can only stand in them: big enough to play in.'],
      why: 'Most of positional play is being in the right place without the ball. Zones make that concrete for players who think a position is just where you start.',
      easier: ['Two zones only: attacking half and defending half.'],
      harder: ['Two touches in your own zone.', 'A goal counts double if every third touched the ball in the build-up.'],
      diagram: {
        area: [60, 40], mark: 'none',
        goals: [[0, 20, 'big', 'e'], [60, 20, 'big', 'w']],
        zones: [[0, 0, 60, 7, 'WIDE'], [0, 33, 60, 7, 'WIDE']],
        lines: [[20, 0, 20, 40], [40, 0, 40, 40]],
        players: {
          K1: [1.5, 20], A1: [12, 13], A2: [12, 27], A3: [24, 4], A4: [28, 20], A5: [24, 36], A6: [48, 20],
          K2: [58.5, 20], D1: [48, 13], D2: [48, 27], D3: [36, 18], D4: [38, 5]
        },
        ball: 'A1',
        frames: [
          ['A1>A4', 'D3-A4', '# Every player owns a zone'],
          ['A4>A3', 'D4-A3', '# Wide in her channel: two seconds free'],
          ['A3~46,4', 'A6-52,16', 'A5-48,33', '# Stay wide, and the pitch stays big'],
          ['A3>A6', '# In from the wing'],
          ['A6>G', '# Score']
        ]
      },
      signals: ['possession', 'conceding'], goesWith: ['know-your-position', 'wide-channel-game'], tags: ['uses-your-shape', 'positional']
    },

    {
      id: 'back-line-shift', v: 1, name: 'Back line: shift, step, drop', type: 'position',
      summary: 'A back three or four moves as one as the ball goes round a line of servers: shift across, drop when they come forward, step up when it goes back.',
      ages: [11, 19], level: 3, players: { min: 7, best: 10, max: 12 }, gk: 1, minutes: [12, 18], intensity: 2,
      space: [60, 40], kit: { balls: 8, cones: 10, goals: 1, bibs: 5 },
      setupMins: 3, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: false,
      positions: ['Back', 'GK'], skills: ['shape', 'communication', '1v1-defend'], principles: ['cover', 'balance', 'compactness', 'pressure'],
      moments: ['defend'], physical: [],
      setup: 'A goal and keeper, the back line in position 18 to 20 yd out, and five servers in an arc 35 yd out passing a ball between them.',
      how: [
        'Servers pass slowly along the arc. The line shifts so the nearest defender faces the ball and the rest cover.',
        'A server dribbles forward: the line drops together. A pass backwards: the line steps up together.',
        'After a minute, servers may play a ball in behind if the line splits. The keeper sweeps it up.',
        'Add one attacker making runs in behind.'
      ],
      points: [
        'Pressure, cover, balance: one goes, the next covers at an angle, the far one tucks in.',
        'Move together. One defender out of line plays everyone onside, or opens a gap.',
        'The keeper talks: "Step!", "Hold!", "Drop!"'
      ],
      questions: ['Ball\'s on the left: where should the right back be?', 'Who calls the step-up?'],
      mistakes: ['Defenders watching the ball and drifting apart: freeze and look along the line.'],
      why: 'A back line that moves as one is very hard to play through. It\'s the most important unit in the team, and it only works if all of them understand it.',
      easier: ['A walk-through with the coach as the only server.'],
      harder: ['Two attackers making runs; servers play balls in behind whenever the line splits.'],
      diagram: {
        area: [60, 40], mark: 'box', goals: [[30, 0, 'big', 's']],
        players: {
          K: [30, 1.5], A1: [15, 19], A2: [25, 20], A3: [35, 20], A4: [45, 19],
          N1: [10, 32], N2: [20, 36], N3: [30, 37], N4: [40, 36], N5: [50, 32]
        },
        ball: 'N3',
        frames: [
          ['N3>N1', 'A1-12,21', 'A2-20,19', 'A3-28,18', 'A4-36,17', '# Ball to the left: the line shifts together'],
          ['N1>N3', 'A1-18,20', 'A2-26,21', 'A3-34,21', 'A4-42,20', '# A pass back: step up as one'],
          ['N3>N5', 'A1-24,18', 'A2-32,19', 'A3-40,20', 'A4-48,21', '# Ball to the right: across again']
        ]
      },
      signals: ['conceding', 'shots-against'], goesWith: ['two-banks', 'centre-back-partnership'], tags: ['positional', 'defending']
    },

    {
      id: 'centre-back-partnership', v: 1, name: 'Centre-back partnership', type: 'position',
      summary: 'Two centre backs against two strikers: one attacks the ball, one covers. Win it, then play forward through a gate.',
      ages: [12, 19], level: 3, players: { min: 6, best: 8, max: 10 }, gk: 1, minutes: [12, 18], intensity: 3,
      space: [44, 36], kit: { balls: 12, cones: 8, goals: 1, bibs: 4 },
      setupMins: 3, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['Back', 'GK'], skills: ['1v1-defend', 'communication', 'heading', 'passing'], principles: ['cover', 'pressure', 'balance'],
      moments: ['defend', 'toAttack'], physical: ['strength'],
      setup: 'A goal and keeper, two centre backs on the edge of the box, two strikers, and a server 35 yd out. Two gates on halfway for the centre backs to play through.',
      how: [
        'The server plays into a striker, along the ground or in the air.',
        'One centre back attacks the ball; the other drops in behind at an angle to cover.',
        'Strikers score in the goal. Centre backs score by winning it and passing through a gate.',
        'The keeper talks the whole time.'
      ],
      points: [
        'First centre back goes. Second covers, a few yards behind and inside.',
        'Swap roles the moment the ball moves.',
        'Win it, then the first pass goes forward. Don\'t admire the tackle.',
        'In the air, whoever has the run on the ball goes. Call it.'
      ],
      questions: ['How far behind your partner should you be?', 'Who calls, and what?'],
      mistakes: ['Both centre backs going to the ball: one simple pass beats both. Freeze and show the space.'],
      why: 'Centre backs work in pairs. One without a partner who covers is easy to beat; two who understand each other are the base of every good defence.',
      easier: ['One striker against two centre backs.'],
      harder: ['Three strikers.', 'The server can switch it to a wide crosser.'],
      safety: 'Heading follows your federation\'s age rules. Below them, clear it with the feet.',
      diagram: {
        area: [44, 36], mark: 'box', goals: [[22, 0, 'big', 's']],
        cones: [[8, 36], [13, 36], [31, 36], [36, 36]],
        players: { K: [22, 1.5], A1: [18, 18], A2: [26, 18], D1: [17, 24], D2: [27, 25], N1: [22, 34] },
        ball: 'N1',
        frames: [
          ['N1>D2', 'A2-D2', 'A1-21,15', '# Into a striker: one goes, one covers'],
          ['D2~24,20', 'A1*D2', '# She turns inside: the cover wins it'],
          ['A1>10.5,35.5', '# Then the first pass forward, through a gate']
        ]
      },
      signals: ['conceding', 'shots-against', 'corners-against'], goesWith: ['back-line-shift', 'numbers-down-defending'], tags: ['positional', 'defending']
    },

    {
      id: 'full-back-job', v: 1, name: 'The full-back\'s job', type: 'position',
      summary: 'Defend the wing 1v1, win it, then go and attack it: both halves of a full-back\'s game in one rep.',
      ages: [11, 19], level: 2, players: { min: 4, best: 8, max: 12 }, gk: 1, minutes: [12, 18], intensity: 3,
      space: [60, 40], kit: { balls: 12, cones: 10, goals: 1, bibs: 4 },
      setupMins: 4, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['Back', 'Wing'], skills: ['1v1-defend', 'crossing', 'combination', 'movement'], principles: ['delay', 'pressure', 'width', 'support'],
      moments: ['defend', 'toAttack', 'attack'], physical: ['speed', 'endurance'],
      setup: 'A wide channel about 16 yd across from the box to halfway, a goal and keeper, a full-back, a winger for her to defend against, and a teammate further up the line.',
      how: [
        'The winger receives at halfway and attacks the full-back 1v1.',
        'The full-back shows her down the line, delays, and wins it or forces her out of play.',
        'Wins it? She passes up the line to her teammate and overlaps her, all the way.',
        'Swap winger and full-back each rep.'
      ],
      points: ['Defend first: side-on, show her down the line, don\'t dive in.', 'The moment you win it, go. The winger is behind you now.', 'Overlap on the outside, arrive at speed.'],
      questions: ['When should a full-back go forward, and when should she stay?'],
      mistakes: ['Winning it and then standing still: the transition is half the job.'],
      why: 'Modern full-backs defend and attack the whole wing. Practising both halves together builds the switch that makes a full-back dangerous.',
      easier: ['The winger only dribbles, no passing.'],
      harder: ['The winger tracks back after losing it, so the overlap is contested.'],
      diagram: {
        area: [60, 40], mark: 'box', goals: [[30, 0, 'big', 's']],
        cones: [[16, 20], [16, 26], [16, 32], [16, 38]],
        players: { K: [30, 1.5], A1: [8, 14], A2: [13, 30], D1: [8, 38] },
        ball: 'D1',
        frames: [
          ['D1~9,25', 'A1-9,20', '# The winger attacks; show her down the line'],
          ['D1~4,21', 'A1-5.5,19', '# Side-on: shepherd her to the touchline'],
          ['A1*D1', '# Win it…'],
          ['A1>A2', 'A1-2,34', '# …pass up the line and overlap'],
          ['A2>A1', '# Into her run: now she attacks the wing']
        ]
      },
      signals: ['conceding', 'solo-goals', 'fouls'], goesWith: ['jockey-channel', 'overlap-2v1-wide'], tags: ['positional']
    },

    {
      id: 'holding-midfielder-screen', v: 1, name: 'The six: screen and switch', type: 'position',
      summary: 'A holding midfielder blocks the passes into two strikers, then, when the ball is won, shows for it and switches play.',
      ages: [12, 19], level: 3, players: { min: 9, best: 9, max: 12 }, gk: 0, minutes: [12, 18], intensity: 2,
      space: [40, 30], kit: { balls: 8, cones: 12, minigoals: 2, bibs: 6 },
      setupMins: 5, adults: 1, indoor: true, groups: ['teams'], involvement: 2, competitive: true,
      positions: ['Mid'], skills: ['scanning', 'pressing', 'passing', 'long-passing', 'communication'], principles: ['cover', 'compactness', 'balance', 'width'],
      moments: ['defend', 'toAttack', 'attack'], physical: [],
      setup: 'Three zones across a 40 × 30 yd area. Four attackers passing in one end zone; the six alone in the middle zone; two strikers and two of her centre backs in the far zone. A mini goal at each end of the middle zone.',
      how: [
        'The four try to pass into the two strikers through the middle zone. The six moves to block every lane.',
        'A pass she cuts out, or her centre backs win: she plays it to a centre back, shows again, and switches play into a mini goal.',
        'Points: a blocked pass or a switch for the six; a pass into a striker for the attackers.'
      ],
      points: ['Stand in the passing lane, not on a player.', 'Scan before every pass: where are both strikers?', 'When we win it, show for the ball side-on so you can see both ways.'],
      questions: ['Which pass were you stopping? Which were you leaving open, and why?'],
      mistakes: ['Following the ball side to side so both strikers are open behind her: hold the middle.'],
      why: 'The holding midfielder protects the back line and starts attacks. Most teams that concede through the middle are missing exactly this job.',
      easier: ['One striker, a narrower middle zone.'],
      harder: ['A second six from the attacking team, trying to block the switch.'],
      diagram: {
        area: [40, 30], mark: 'none',
        zones: [[0, 0, 14, 30], [14, 0, 12, 30], [26, 0, 14, 30]],
        goals: [[20, 0, 'mini', 's'], [20, 30, 'mini', 'n']],
        players: { D1: [2, 6], D2: [10, 4], D3: [10, 26], D4: [2, 24], A1: [19, 15], D5: [32, 10], D6: [32, 20], A2: [37, 9], A3: [37, 21] },
        ball: 'D2',
        frames: [
          ['D2>D3', 'A1-19,22', '# She slides to block the lane into the striker'],
          ['D3>19.3,22.8', '# A pass into the striker: cut out'],
          ['A1>A3', 'A1-21,17', '# To a centre back, and show again'],
          ['A3>A1', '# Side-on, to see both ways'],
          ['A1>G1', '# Switch it: a point']
        ]
      },
      signals: ['shots-against', 'conceding', 'possession'], goesWith: ['rondo-pivot', 'two-banks'], tags: ['positional']
    },

    {
      id: 'midfield-triangle-rotation', v: 1, name: 'Midfield triangle', type: 'position',
      summary: 'Three midfielders keep a triangle while the ball goes round four outside players, rotating so someone always shows, someone supports, someone goes beyond.',
      ages: [12, 19], level: 3, players: { min: 7, best: 9, max: 12 }, gk: 0, minutes: [12, 18], intensity: 2,
      space: [25, 25], kit: { balls: 6, cones: 4, bibs: 6 },
      setupMins: 3, adults: 1, indoor: true, groups: ['small'], involvement: 3, competitive: false,
      positions: ['Mid'], skills: ['movement', 'passing', 'scanning', 'combination', 'shape'], principles: ['support', 'mobility', 'balance'],
      moments: ['attack'], physical: ['endurance'],
      setup: 'A 25 × 25 yd square: three midfielders inside, an outside player on each side, and two passive defenders inside to start.',
      how: [
        'Outside players pass to a midfielder, who plays it on to a different side.',
        'The three keep a triangle: never in a line, never two close together.',
        'When one goes forward, another drops. The triangle turns rather than stretching.',
        'The defenders go from passive to live after three minutes.'
      ],
      points: ['One shows for the ball, one supports behind her, one goes beyond.', 'If you can see both teammates and the ball, the triangle is right.', 'Rotate: the player who passes moves on, and someone fills her spot.'],
      questions: ['Where do you stand when your two teammates are both close to the ball?'],
      mistakes: ['All three going to the ball: the triangle becomes a cluster. Freeze and fix the shape.'],
      why: 'A triangle gives the player on the ball two options at every moment. Midfielders who rotate keep that shape while the opponents chase shadows.',
      easier: ['No defenders, two touches.'],
      harder: ['One touch for the outside players.', 'A third live defender.'],
      diagram: {
        area: [25, 25], mark: 'grid', cones: [[0, 0], [25, 0], [0, 25], [25, 25]],
        players: { N1: [12.5, 0], N2: [25, 12.5], N3: [12.5, 25], N4: [0, 12.5], A1: [8, 10], A2: [16, 9], A3: [12.5, 16], D1: [6, 15], D2: [19, 16] },
        ball: 'N4',
        frames: [
          ['N4>A1', 'A2-17,7', 'A3-11,17', '# One shows, one supports, one goes beyond'],
          ['A1>A2', 'A1-8,13', 'A3-14,17', '# She passes and moves on'],
          ['A2>N2', 'A3-17,14', 'A2-18,6', '# Out to a different side; the triangle turns']
        ]
      },
      signals: ['possession', 'solo-goals'], goesWith: ['rondo-pivot', 'y-passing-pattern'], tags: ['positional']
    },

    {
      id: 'between-the-lines', v: 1, name: 'Find the pocket', type: 'position',
      summary: 'An attacking midfielder learns to receive between the other team\'s midfield and defence, turn, and play the final pass.',
      ages: [11, 19], level: 3, players: { min: 10, best: 12, max: 14 }, gk: 1, minutes: [12, 18], intensity: 3,
      space: [44, 40], kit: { balls: 8, cones: 12, goals: 1, bibs: 6 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
      positions: ['Mid', 'Forward'], skills: ['scanning', 'turning', 'first-touch', 'movement', 'passing'], principles: ['penetration', 'support', 'mobility'],
      moments: ['attack'], physical: [],
      setup: 'In front of a goal: a build-up zone, a 10 yd "pocket" zone, then the final zone with two defenders and a keeper. Two defending midfielders sit at the top of the pocket.',
      how: [
        'Three builders pass in the first zone. The number 10 moves in the pocket to get free of the two midfielders.',
        'When she gets it, she turns and plays a striker in behind the two defenders, or shoots.',
        'A pass straight from the build-up zone to the striker doesn\'t count: it has to go through the pocket.'
      ],
      points: ['Stand between their players, not behind one.', 'Check your shoulder before every pass comes: is the turn on?', 'Half-turned, so the first touch can go forward.'],
      questions: ['What did you see before you got the ball?', 'When was it better to lay it back?'],
      mistakes: ['Standing still in the pocket, so a defender steps in: keep moving to stay free.'],
      why: 'The space between the lines is where attacks become chances. A player who can find it and turn in it is the most dangerous one on the pitch.',
      easier: ['One defending midfielder.'],
      harder: ['The defending midfielders may drop into the pocket.', 'Two touches for the 10.'],
      diagram: {
        area: [44, 40], mark: 'box', goals: [[22, 0, 'big', 's']],
        zones: [[0, 28, 44, 12, 'BUILD-UP'], [0, 18, 44, 10, 'POCKET']],
        players: {
          K: [22, 1.5], A1: [10, 34], A2: [22, 36], A3: [34, 34], A4: [24, 22], A5: [26, 12],
          D1: [16, 27], D2: [28, 27], D3: [18, 10], D4: [28, 9]
        },
        ball: 'A1',
        frames: [
          ['A1>A2', 'A4-22,22', '# The builders move it; the 10 finds the gap'],
          ['A2>A4', '# Into the pocket, between the two'],
          ['A4~23,18', 'A5-31,5', '# Turn; the striker runs in behind'],
          ['A4>A5', '# The final pass'],
          ['A5>G', '# Finish']
        ]
      },
      signals: ['few-shots', 'solo-goals'], goesWith: ['open-up-and-turn', 'middle-man-under-pressure'], tags: ['positional']
    },

    {
      id: 'winger-job', v: 1, name: 'The winger\'s job', type: 'position',
      summary: 'Go 1v1 at the full-back, get the cross or the shot away, then sprint back and defend the counter: the whole wing in one rep.',
      ages: [10, 19], level: 2, players: { min: 5, best: 8, max: 12 }, gk: 1, minutes: [12, 18], intensity: 3,
      space: [60, 40], kit: { balls: 12, cones: 8, goals: 1, minigoals: 1, bibs: 4 },
      setupMins: 4, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['Wing'], skills: ['1v1-attack', 'crossing', 'dribbling', '1v1-defend'], principles: ['width', 'penetration', 'delay'],
      moments: ['attack', 'toDefend', 'defend'], physical: ['speed', 'endurance'],
      setup: 'A wide channel down one touchline into the box. A goal and keeper, a full-back to beat, a striker in the box, and a mini goal at halfway for the full-back to counter into.',
      how: [
        'The winger receives wide and attacks the full-back: inside for a shot, or outside for a cross to the striker.',
        'As soon as the attack ends, the full-back gets a new ball and counters at the mini goal.',
        'The winger sprints back and defends her. Points both ways.'
      ],
      points: ['Attack the full-back at speed and make her turn.', 'Know your options before you get it: inside, outside, or back.', 'Finished or lost, the next job is the sprint back. Wingers defend too.'],
      questions: ['Which way did you go, and what told you?', 'How quickly were you back?'],
      mistakes: ['A winger who stands and complains after losing it: the counter is the drill.'],
      why: 'A winger who beats her full-back creates chances; one who also tracks back stops two-on-ones going the other way. Doing both in one rep builds the habit.',
      easier: ['The full-back only shadows, no tackling.'],
      harder: ['An extra defender inside, so cutting in is contested.'],
      diagram: {
        area: [60, 40], mark: 'box',
        goals: [[30, 0, 'big', 's'], [8, 40, 'mini', 'n']],
        cones: [[16, 22], [16, 30], [16, 38]],
        players: { K: [30, 1.5], A1: [8, 30], D1: [10, 19], A2: [32, 14] },
        ball: ['A1', [12, 18.5]],
        frames: [
          ['A1~10,23', 'D1-A1', '# Attack the full-back at speed'],
          ['A1~4,10', 'D1-6,14', '# Outside her, to the byline'],
          ['A2-29,6', 'A1>A2', '# Cross for the striker'],
          ['A2>G', 'D1-12,18', '# Finish. The full-back gets a new ball'],
          ['D1~10,31', 'A1-11,29', '# She counters; the winger sprints back'],
          ['D1>G2', '# Back in time? Points both ways']
        ]
      },
      signals: ['few-shots', 'solo-goals', 'late-goals'], goesWith: ['1v1-moves', 'full-back-job'], tags: ['positional']
    },

    {
      id: 'striker-movement', v: 1, name: 'Striker movement', type: 'position',
      summary: 'A striker works against a centre back: check short, spin in behind, timed with the passer.',
      ages: [10, 19], level: 2, players: { min: 4, best: 6, max: 10 }, gk: 1, minutes: [12, 15], intensity: 3,
      space: [44, 34], kit: { balls: 12, cones: 4, goals: 1, bibs: 3 },
      setupMins: 2, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['Forward'], skills: ['movement', 'first-touch', 'shooting', 'communication'], principles: ['penetration', 'mobility'],
      moments: ['attack'], physical: ['speed', 'agility'],
      setup: 'A goal and keeper. A centre back on the edge of the box, a striker beside her, a midfielder 30 yd out with a ball.',
      how: [
        'The striker makes a movement and the midfielder plays to it: to feet if she checks short, in behind if she spins.',
        'The centre back defends for real. The striker finishes if she can.',
        'Three movements to practise: check short then spin; spin then check short; drift wide then attack the space inside.'
      ],
      points: [
        'Move off the defender\'s shoulder, where she can\'t see you and the ball at once.',
        'Time it: go as the passer\'s head goes down to the ball.',
        'A run that doesn\'t get the ball still drags a defender somewhere.',
        'Curve the run in behind so you stay onside.'
      ],
      questions: ['When did the passer know you were going?'],
      mistakes: ['Running early and waiting: by the time the pass comes, the defender is set.'],
      why: 'Most of a striker\'s game is played without the ball. Good movement makes the chance before the first touch.',
      easier: ['A passive centre back.'],
      harder: ['Two centre backs and two strikers timing runs together.', 'Offside applies.'],
      diagram: {
        area: [44, 34], mark: 'box', goals: [[22, 0, 'big', 's']],
        players: { K: [22, 1.5], D1: [22, 17], A1: [24.5, 18], A2: [22, 33] },
        ball: 'A2',
        frames: [
          ['A1-25,23', 'D1-A1', '# Check short: the defender follows'],
          ['A1-28,9', 'D1-25,15', 'A2>A1', '# Spin in behind as the passer looks down'],
          ['A1>G', '# Finish']
        ]
      },
      signals: ['few-shots', 'one-scorer'], goesWith: ['hold-up-and-lay-off', 'end-zone-game'], tags: ['positional', 'finishing']
    },

    {
      id: 'hold-up-and-lay-off', v: 1, name: 'Hold it up', type: 'position',
      summary: 'A striker receives with her back to goal, holds off a defender, and lays it off to a midfielder arriving to shoot.',
      ages: [11, 19], level: 2, players: { min: 4, best: 6, max: 10 }, gk: 1, minutes: [10, 15], intensity: 3,
      space: [44, 34], kit: { balls: 12, cones: 4, goals: 1, bibs: 3 },
      setupMins: 2, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['Forward', 'Mid'], skills: ['shielding', 'first-touch', 'combination', 'shooting'], principles: ['support', 'penetration'],
      moments: ['attack'], physical: ['strength', 'balance'],
      setup: 'A goal and keeper. A striker at the top of the box with a defender behind her, a passer 30 yd out, and a midfielder 10 yd behind the striker.',
      how: [
        'The passer plays into the striker\'s feet. The defender pushes up tight.',
        'The striker holds it, body between the defender and the ball, until the midfielder arrives.',
        'She lays it off into the midfielder\'s path; the midfielder shoots first time.',
        'Rotate: passer to midfielder, midfielder to striker, striker to defender.'
      ],
      points: ['Wide stance, low, arms out for balance and feel.', 'Lay it off to the side she\'s coming, firm, in front of her.', 'Midfielder: arrive late and at speed, not early and standing.'],
      questions: ['When did you know your midfielder was there? Did she tell you?'],
      mistakes: ['Turning into the defender and losing it: if she\'s tight, the lay-off is the play.'],
      why: 'A striker who can hold the ball up brings the team up the pitch with her. A long pass becomes an attack instead of a turnover.',
      easier: ['A passive defender who only leans.'],
      harder: ['A second defender who can close the midfielder.', 'The lay-off first time.'],
      diagram: {
        area: [44, 34], mark: 'box', goals: [[22, 0, 'big', 's']],
        players: { K: [22, 1.5], D1: [22, 18.6], A1: [22, 20.6], A3: [17, 29], A2: [25, 33] },
        ball: 'A2',
        frames: [
          ['A2>A1', 'D1-22,19.3', '# Into her feet, the defender tight'],
          ['A1~22.5,21.2', 'A3-19,23', '# Hold it; the midfielder arrives'],
          ['A3-19.5,19.8', 'A1>A3', '# Lay it into her path'],
          ['A3>G', '# First time']
        ]
      },
      signals: ['possession', 'few-shots', 'solo-goals'], goesWith: ['turn-and-shoot', 'striker-movement'], tags: ['positional']
    },

    {
      id: 'pressing-from-the-front', v: 1, name: 'Pressing from the front', type: 'position',
      summary: 'The front three press a back four on a trigger: a curved run that cuts off the pass back inside, and the next attacker jumps to the next defender.',
      ages: [12, 19], level: 3, players: { min: 8, best: 9, max: 14 }, gk: 1, minutes: [12, 18], intensity: 3,
      space: [60, 34], kit: { balls: 10, cones: 10, goals: 1, bibs: 4 },
      setupMins: 4, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
      positions: ['Forward', 'Wing', 'Mid'], skills: ['pressing', 'communication', 'decision-making'], principles: ['pressure', 'cover', 'compactness'],
      moments: ['defend', 'toAttack'], physical: ['speed', 'endurance'],
      setup: 'A goal and keeper with a back four in front of it, playing out. Three pressing attackers. A gate on each side of halfway for the back four to play through.',
      how: [
        'The keeper starts with the ball and plays out. The three wait in shape.',
        'On a trigger, they press together: a pass to a full-back, a backward pass, a bad touch, or a defender facing her own goal.',
        'The presser curves her run to cut off the pass back inside. The next attacker jumps to the next defender.',
        'Win it and score in the big goal. The back four score through a gate.'
      ],
      points: ['Press together or not at all. One presser alone is just running.', 'Curve the run so the ball can only go one way: towards the touchline.', 'The trigger is a shout: "Go!"'],
      questions: ['What was the trigger? Who called it?', 'Where did your curved run send the ball?'],
      mistakes: ['Running straight at the defender: she plays round you. Curve it.'],
      why: 'Pressing high wins the ball near the opponent\'s goal, where chances come quickly. It only works as a unit, which makes it a positional job.',
      easier: ['A back three instead of four, a slower start.'],
      harder: ['A holding midfielder joins the back four.', 'Six seconds to win it.'],
      diagram: {
        area: [60, 34], mark: 'box', goals: [[30, 0, 'big', 's']],
        cones: [[6, 34], [12, 34], [48, 34], [54, 34]],
        players: { K: [30, 1.5], D1: [8, 10], D2: [22, 7], D3: [38, 7], D4: [52, 10], A1: [20, 24], A2: [30, 26], A3: [40, 24] },
        ball: 'K',
        frames: [
          ['K>D2', 'A2-28,20', '# They play out; the three wait in shape'],
          ['D2>D1', 'A1-14,14', 'A2-22,12', 'A3-36,12', '# A pass to the full-back: the trigger. Go!'],
          ['A1*D1', '# Curve the run, cut the way back inside, win it'],
          ['A1>G', '# Score']
        ]
      },
      signals: ['possession', 'few-shots', 'shots-against'], goesWith: ['five-second-press', 'back-line-shift'], tags: ['positional', 'transition']
    },

    {
      id: 'two-banks', v: 1, name: 'Two banks', type: 'position',
      summary: 'Defending as a block: a back line and a midfield line slide across and squeeze up together as the ball moves round six attackers.',
      ages: [12, 19], level: 3, players: { min: 12, best: 15, max: 18 }, gk: 1, minutes: [15, 20], intensity: 2,
      space: [60, 44], kit: { balls: 10, cones: 12, goals: 1, minigoals: 2, bibs: 8 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
      positions: ['Back', 'Mid', 'Wing', 'GK'], skills: ['shape', 'communication', 'pressing'], principles: ['compactness', 'balance', 'cover', 'pressure'],
      moments: ['defend', 'toAttack'], physical: ['endurance'],
      setup: 'Half a pitch with a goal and keeper. Two lines of four defending it (for 9v9, two lines of three). Six attackers move the ball in front of them. Two mini goals at halfway for the block to counter into.',
      how: [
        'The attackers pass slowly, then faster. The block slides across together, the lines no more than 10 to 15 yd apart.',
        'When the ball goes back, both lines squeeze up. When it goes wide, the near side presses and the far side tucks in.',
        'The block wins it and counters into a mini goal.'
      ],
      points: ['Compact: short distances between players and between the lines.', 'Ball-side: the whole block leans towards the ball.', 'Protect the middle first. The wings are less dangerous.'],
      questions: ['Where is the space when we slide too far?', 'Who decides when we squeeze up?'],
      mistakes: ['Lines drifting apart, so an attacker receives between them and turns: freeze and measure the gap.'],
      why: 'Good teams defend as a block, not as eleven individuals. It\'s the defending version of passing: done together or not at all.',
      easier: ['A walk-through with the coach moving the ball.'],
      harder: ['The attackers score a point for any pass received between the lines.'],
      diagram: {
        area: [60, 44], mark: 'half',
        goals: [[30, 0, 'big', 's'], [20, 44, 'mini', 'n'], [40, 44, 'mini', 'n']],
        players: {
          K: [30, 1.5], A1: [15, 14], A2: [25, 14], A3: [35, 14], A4: [45, 14], A5: [15, 25], A6: [25, 25], A7: [35, 25], A8: [45, 25],
          D1: [8, 34], D2: [22, 38], D3: [38, 38], D4: [52, 34], D5: [20, 31], D6: [40, 31]
        },
        ball: 'D2',
        frames: [
          ['D2>D1', 'A1-10,15', 'A2-20,14', 'A3-29,13', 'A4-38,13', 'A5-10,25', 'A6-19,25', 'A7-28,24', 'A8-37,24', '# Ball wide: the block slides across'],
          ['D1>D2', 'A1-17,18', 'A2-26,17', 'A3-35,17', 'A4-43,18', 'A5-17,28', 'A6-26,27', 'A7-35,27', 'A8-43,28', '# Ball back: both lines squeeze up'],
          ['D2>D5', 'A6*D5', '# A pass between the lines: the block wins it'],
          ['A6~22,39', '# Counter…'],
          ['A6>G2', '# …into a mini goal']
        ]
      },
      signals: ['conceding', 'shots-against', 'late-goals'], goesWith: ['back-line-shift', 'holding-midfielder-screen'], tags: ['positional', 'defending', 'uses-your-shape']
    },

    {
      id: 'sideline-helpers', v: 1, name: 'Sideline helpers', type: 'position',
      summary: 'A small game where each team has a helper on each sideline. A goal straight after a pass from a helper counts double.',
      ages: [6, 10], level: 1, players: { min: 6, best: 10, max: 14 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [20, 30], kit: { balls: 6, cones: 4, minigoals: 2, bibs: 8 },
      setupMins: 3, adults: 1, indoor: true, groups: ['teams'], involvement: 2, competitive: true,
      positions: OUTFIELD, skills: ['passing', 'movement', 'dribbling'], principles: ['width', 'support'],
      moments: ['attack'], physical: [],
      setup: 'A 20 × 30 yd pitch with a mini goal at each end. 3v3 or 4v4 inside, and each team has one helper on each sideline, who moves up and down it but never comes on.',
      how: [
        'Play a normal game. Players inside can pass to their own team\'s helpers, who have two touches to pass it back in.',
        'A goal straight after a helper\'s pass counts double.',
        'Every two minutes, the helpers swap with two players from inside.'
      ],
      points: [
        'When it\'s crowded in the middle, look to the side.',
        'Helpers: move along the line to stay level with the ball, and call for it.',
        'Pass to a helper, then run forward for the ball back.'
      ],
      questions: ['Why was it easier to score after the ball went out to the side?', 'Where should you stand when your team has the ball?'],
      mistakes: [
        'Helpers standing still in a corner: they move with the ball.',
        'Nobody passes to the helpers: for a few minutes, every goal needs a helper touch first.'
      ],
      why: 'Young teams swarm the ball in the middle. A reason to be wide teaches width before the word means anything, and it\'s the first step from the swarm to a team with a shape.',
      easier: ['Helpers have as many touches as they like and can dribble along the line.'],
      harder: ['Helpers play one touch.', 'A helper can dribble on, and the player who passed to her takes her place on the line.'],
      diagram: {
        area: [24, 30], mark: 'none',
        cones: [[2, 0], [22, 0], [2, 30], [22, 30]],
        lines: [[2, 0, 2, 30], [22, 0, 22, 30]],
        goals: [[12, 0, 'mini', 's'], [12, 30, 'mini', 'n']],
        players: {
          A1: [9, 20], A2: [15, 18], A3: [12, 24], A4: [0.8, 16], A5: [23.2, 12],
          D1: [10, 16], D2: [14, 14], D3: [12, 8], D4: [0.8, 8], D5: [23.2, 20]
        },
        ball: 'A1',
        frames: [
          ['A1>A4', 'D1-7,17', '# Crowded? Pass to your helper on the side'],
          ['A4~0.8,9.5', 'A1-7,6', 'D4-0.8,4', '# She moves up the line; you run forward'],
          ['A4>A1', '# Back in to the runner…'],
          ['A1>G', '# …and a goal from it counts double']
        ]
      },
      signals: ['solo-goals', 'possession'], goesWith: ['spread-out-game', 'wide-channel-game'], tags: ['young', 'positional']
    },

    /* ---------------- small-sided games ---------------- */

    {
      id: '3v3-small-sided', v: 1, name: '3v3', type: 'game',
      summary: 'Three against three with small goals and no keepers. The format with the most touches and the most goals.',
      ages: [5, 10], level: 1, players: { min: 6, best: 12, max: 18 }, gk: 0, minutes: [10, 20], intensity: 3,
      space: [20, 25], kit: { balls: 6, cones: 8, minigoals: 2, bibs: 6 },
      setupMins: 4, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [25, 20], mark: 'grid',
        goals: [[0, 10, 'mini', 'e'], [25, 10, 'mini', 'w']],
        cones: [[0, 0], [25, 0], [0, 20], [25, 20]],
        players: { A1: [6, 5], A2: [6, 15], A3: [10, 10], D1: [19, 6], D2: [19, 14], D3: [15, 10] },
        ball: 'A3',
        frames: [
          ['A3>A2', 'D2-A2', 'A1-14,3', 'A3-10,8', '# Pass, then spread out into a triangle'],
          ['A2>A1', 'D1-A1', '# Find the free one'],
          ['A1~21,7', '# Space in front? Dribble into it'],
          ['A1>G', '# Score']
        ]
      },
      signals: ['one-scorer'], goesWith: ['coach-says', 'line-soccer'], tags: ['young', 'fun']
    },

    {
      id: 'hungry-hippos', v: 1, name: 'Hungry hippos', type: 'game',
      summary: 'Four teams in four corners race to dribble balls home from the middle, then steal from each other.',
      ages: [4, 9], level: 1, players: { min: 4, best: 12, max: 20 }, gk: 0, minutes: [8, 12], intensity: 3,
      space: [25, 25], kit: { balls: 16, cones: 16, bibs: 12 },
      setupMins: 4, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [24, 24], mark: 'grid',
        zones: [[0, 0, 5, 5], [19, 0, 5, 5], [0, 19, 5, 5], [19, 19, 5, 5]],
        cones: [[0, 0], [24, 0], [0, 24], [24, 24]],
        balls: [[12, 12], [12, 9.8], [9.8, 12], [14.2, 12], [12, 14.2]],
        players: { 
          A1: [3, 3], A2: [1.5, 1.5], D1: [21, 3], D2: [22.5, 1.5], N1: [21, 21], N2: [22.5, 22.5],
          B1: [3, 21], B2: [1.5, 22.5]
         },
        ball: [[10.6, 10.6], [13.4, 10.6], [13.4, 13.4], [10.6, 13.4]],
        frames: [
          ['A1-10,10', 'D1-14,10', 'N1-14,14', 'B1-10,14', '# Go! One from each team'],
          ['A1~3,3', 'D1~21,3', 'N1~21,21', 'B1~3,21', '# Dribble one home, never kick it'],
          ['A2-10.5,11.5', 'D2-13.5,11.5', 'N2-13,12.5', 'B2-11,12.5', '# Tag the next player']
        ]
      },
      signals: [], goesWith: ['red-light-green-light', '3v3-small-sided'], tags: ['fun', 'young']
    },

    {
      id: 'line-soccer', v: 1, name: 'Line soccer', type: 'game',
      summary: 'Score by stopping the ball on the other team\'s end line. No goals, no keepers.',
      ages: [5, 12], level: 1, players: { min: 4, best: 10, max: 16 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [25, 30], kit: { balls: 6, cones: 8, bibs: 8 },
      setupMins: 2, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [30, 24], mark: 'grid',
        lines: [[0, 0, 0, 24], [30, 0, 30, 24]],
        cones: [[0, 0], [30, 0], [0, 24], [30, 24]],
        players: { 
          A1: [8, 12], A2: [10, 4], A3: [10, 20], A4: [4, 12], D1: [16, 10], D2: [20, 4], D3: [20, 19],
          D4: [25, 13]
         },
        ball: 'A1',
        frames: [
          ['A1~13,14', 'D1-A1', '# Run at them, look for the gap'],
          ['A3-17,21', 'A1>A3', 'D3-A3', '# Pass and go'],
          ['A3~29.8,22.5', '# Dribble over their line and stop it dead']
        ]
      },
      signals: ['few-shots', 'one-scorer'], goesWith: ['sharks-and-minnows', '3v3-small-sided'], tags: ['young', 'fun']
    },

    {
      id: '4v4-mini-goals', v: 1, name: '4v4 to mini goals', type: 'game',
      summary: 'The classic four-a-side, the smallest game with real shape: width, depth and support.',
      ages: [6, 19], level: 1, players: { min: 8, best: 8, max: 16 }, gk: 0, minutes: [12, 20], intensity: 3,
      space: [25, 35], kit: { balls: 6, cones: 8, minigoals: 2, bibs: 8 },
      setupMins: 3, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [35, 25], mark: 'grid',
        goals: [[0, 12.5, 'mini', 'e'], [35, 12.5, 'mini', 'w']],
        cones: [[0, 0], [35, 0], [0, 25], [35, 25]],
        players: { 
          A1: [5, 12.5], A2: [12, 4], A3: [12, 21], A4: [20, 12.5], D1: [30, 12.5], D2: [24, 6],
          D3: [24, 19], D4: [17, 16]
         },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D2-A2', 'A4-22,9', '# A diamond: one behind, two wide, one ahead'],
          ['A2>A4', 'D1-A4', 'A1-10,12', '# Play forward when it\'s on'],
          ['A4>G', '# Score']
        ]
      },
      signals: ['solo-goals', 'possession'], goesWith: ['keep-away-4v4-plus-2', 'the-game'], tags: ['every-session']
    },

    {
      id: 'four-goal-game', v: 1, name: 'Four-goal game', type: 'game',
      summary: 'Two mini goals at each end, near the corners. Spot which goal is open, and switch the play to get there.',
      ages: [7, 19], level: 2, players: { min: 8, best: 10, max: 14 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [30, 40], kit: { balls: 6, cones: 8, minigoals: 4, bibs: 10 },
      setupMins: 4, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [40, 30], mark: 'grid',
        goals: [[0, 4, 'mini', 'e'], [0, 26, 'mini', 'e'], [40, 4, 'mini', 'w'], [40, 26, 'mini', 'w']],
        cones: [[0, 0], [40, 0], [0, 30], [40, 30]],
        players: { 
          A1: [22, 6], A2: [28, 9], A3: [16, 15], A4: [24, 24], A5: [8, 15], D1: [31, 5], D2: [34, 9],
          D3: [26, 12], D4: [36, 20], D5: [20, 20]
         },
        ball: 'A1',
        frames: [
          ['A1>A3', 'D3-21,14', '# Their side of the pitch is crowded at the top'],
          ['A4-30,25', 'A3>A4', 'D4-35,23', '# Look up and switch it'],
          ['A4~35,26', '# The far goal is open'],
          ['A4>G', '# Score']
        ]
      },
      signals: ['possession', 'solo-goals'], goesWith: ['driven-passes', 'overlap-2v1-wide'], tags: []
    },

    {
      id: 'end-zone-game', v: 1, name: 'End-zone game', type: 'game',
      summary: 'Score by receiving a pass inside the end zone, so runs in behind and passes to meet them are everything.',
      ages: [8, 19], level: 2, players: { min: 8, best: 12, max: 16 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [30, 45], kit: { balls: 6, cones: 16, bibs: 8 },
      setupMins: 4, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [45, 30], mark: 'grid',
        zones: [[0, 0, 5, 30, 'END'], [40, 0, 5, 30, 'END']],
        cones: [[0, 0], [45, 0], [0, 30], [45, 30]],
        players: { 
          A1: [16, 15], A2: [22, 6], A3: [24, 24], A4: [10, 8], A5: [30, 15], D1: [27, 9], D2: [32, 21],
          D3: [36, 15], D4: [20, 18], D5: [14, 22]
         },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D1-A2', 'A5-33,12', '# Find a teammate…'],
          ['A5-42,11', 'A2>A5', 'D3-38,13', '# …and pass into the zone as she arrives']
        ]
      },
      signals: ['few-shots', 'solo-goals'], goesWith: ['keep-away-4v4-plus-2', 'attack-vs-defence'], tags: []
    },

    {
      id: 'three-team-transition', v: 1, name: 'Winner stays on', type: 'game',
      summary: 'Three teams of four. The team that concedes goes off, and the waiting team is straight on.',
      ages: [8, 19], level: 2, players: { min: 9, best: 12, max: 15 }, gk: 0, minutes: [12, 20], intensity: 3,
      space: [25, 35], kit: { balls: 10, cones: 8, minigoals: 2, bibs: 8 },
      setupMins: 4, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [39, 25], mark: 'none',
        goals: [[0, 12.5, 'mini', 'e'], [35, 12.5, 'mini', 'w']],
        lines: [[0, 0, 35, 0], [0, 25, 35, 25], [0, 0, 0, 25], [35, 0, 35, 25]],
        players: { 
          A1: [26, 10], A2: [22, 18], A3: [18, 6], D1: [30, 13], D2: [28, 20], D3: [24, 4], N1: [38, 5],
          N2: [38, 17.5], N3: [38, 21]
         },
        ball: ['A1', 'N1'],
        frames: [
          ['A1>G2', '# Blue scores…'],
          [
            'D1-36.5,2', 'D2-36.5,23', 'D3-38,4', 'N1~30,9', 'N2-29,14', 'N3-30,19',
            '# …red off, yellow straight on with a ball'
          ],
          ['N1~22,9', 'N2-20,13', 'A1-N1', 'A2-20,16', 'A3-19,7', '# Blue has to switch on at once']
        ]
      },
      signals: ['late-goals', 'conceding'], goesWith: ['five-second-press', 'the-game'], tags: ['transition', 'competitive']
    },

    {
      id: 'conditioned-game', v: 1, name: 'Conditioned game', type: 'game',
      summary: 'A normal game with one rule that pushes the team towards the week\'s focus.',
      ages: [9, 19], level: 2, players: { min: 10, best: 14, max: 22 }, gk: 2, minutes: [15, 25], intensity: 3,
      space: [45, 60], kit: { balls: 8, cones: 12, goals: 2, bibs: 11 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [64, 46], mark: 'pitch',
        goals: [[0, 23, 'big', 'e'], [64, 23, 'big', 'w']],
        players: { 
          K1: [1.5, 23], K2: [62.5, 23], A1: [12, 23], A2: [20, 8], A3: [26, 28], A4: [36, 12], A5: [44, 33],
          A6: [50, 20], D1: [56, 25], D2: [46, 13], D3: [40, 24], D4: [32, 36], D5: [30, 17], D6: [52, 38]
         },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D5-A2', '# Pass 1'],
          ['A2>A3', 'D3-A3', '# 2'],
          ['A3>A4', 'D2-A4', '# 3'],
          ['A4>A5', 'D6-A5', '# 4'],
          ['A5>A6', 'D1-A6', '# 5'],
          ['A6>G2', '# Five passes, then score: it counts double']
        ]
      },
      signals: ['possession', 'solo-goals', 'few-shots', 'conceding'], goesWith: ['the-game'], tags: ['uses-your-shape', 'every-session']
    },

    {
      id: 'attack-vs-defence', v: 1, name: 'Attack against defence', type: 'game',
      summary: 'Six attackers against four defenders and a keeper on half a pitch. The defenders counter to targets at halfway.',
      ages: [11, 19], level: 3, players: { min: 11, best: 12, max: 16 }, gk: 1, minutes: [15, 25], intensity: 2,
      space: [60, 50], kit: { balls: 15, cones: 10, goals: 1, minigoals: 2, bibs: 6 },
      setupMins: 6, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
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
      diagram: {
        area: [60, 50], mark: 'half',
        goals: [[30, 0, 'big', 's'], [18, 50, 'mini', 'n'], [42, 50, 'mini', 'n']],
        players: { 
          K: [30, 1.5], D1: [14, 14], D2: [25, 12], D3: [35, 12], D4: [46, 14], A1: [30, 30], A2: [10, 26],
          A3: [50, 26], A4: [24, 22], A5: [36, 22], A6: [20, 36], C: [30, 47]
         },
        ball: 'C',
        frames: [
          ['C>A1', '# The coach plays in the attacking midfielder'],
          [
            'A1>A3', 'D4-A3', 'D3-39,13', 'D2-30,13', 'D1-20,13',
            '# Ball wide: the back four shift across together'
          ],
          ['A3~52,10', 'A5-38,7', 'A4-27,8', 'D4-50,11', '# Get round them; runners attack the box'],
          ['A3>A4', '# Cut it back'],
          ['A4>G', '# Finish']
        ]
      },
      signals: ['few-shots', 'conceding', 'shots-against'], goesWith: ['numbers-down-defending', 'shadow-play'], tags: ['uses-your-shape']
    },

    {
      id: 'shadow-play', v: 1, name: 'Shadow play', type: 'game',
      summary: 'The team walks, then jogs, the ball through its own shape with no opponent, and shifts as a unit when the coach says "theirs".',
      ages: [10, 19], level: 2, players: { min: 7, best: 11, max: 14 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [60, 90], kit: { balls: 4, cones: 10, goals: 1 },
      setupMins: 3, adults: 1, indoor: false, groups: ['squad'], involvement: 2, competitive: false,
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
      diagram: {
        area: [90, 56], mark: 'pitch',
        goals: [[0, 28, 'big', 'e'], [90, 28, 'big', 'w']],
        players: { 
          K: [2, 28], A1: [18, 8], A2: [14, 22], A3: [14, 34], A4: [18, 48], A5: [30, 28], A6: [40, 16],
          A7: [40, 40], A8: [58, 8], A9: [64, 28], A10: [58, 48]
         },
        ball: 'K',
        frames: [
          ['K>A2', 'A1-24,6', 'A4-24,50', '# From the keeper; the full-backs push on'],
          ['A2>A5', 'A6-46,14', 'A7-46,40', 'A9-68,26', '# Through midfield: the ball moves, all move'],
          ['A5>A6', 'A8-66,8', 'A2-24,24', 'A3-24,34', '# Up the left'],
          ['A6>A8', 'A9-72,24', 'A10-66,40', '# Out wide'],
          ['A8~78,12', 'A9-80,26', 'A10-74,36', '# Into the final third'],
          ['A8>A9', '# Cross'],
          ['A9>G2', '# Shot. Then "Theirs!" and the team shifts as one']
        ]
      },
      signals: ['conceding', 'possession'], goesWith: ['attack-vs-defence', 'conditioned-game'], tags: ['uses-your-shape']
    },

    {
      id: 'world-cup', v: 1, name: 'World Cup', type: 'game',
      summary: 'Pairs are countries; everyone plays at one goal, and every team that scores goes through to the next round.',
      ages: [6, 13], level: 1, players: { min: 6, best: 12, max: 16 }, gk: 1, minutes: [10, 15], intensity: 3,
      space: [30, 30], kit: { balls: 2, goals: 1, cones: 4, bibs: 12 },
      setupMins: 2, adults: 1, indoor: true, groups: ['pairs'], involvement: 3, competitive: true,
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
      diagram: {
        area: [30, 24], mark: 'grid',
        goals: [[15, 0, 'big', 's']],
        cones: [[0, 0], [30, 0], [0, 24], [30, 24]],
        players: { 
          K: [15, 1.5], C: [15, 24], A1: [6, 16], A2: [9, 20], D1: [23, 16], D2: [21, 20], N1: [11, 12],
          N2: [19, 11], B1: [4, 8], B2: [26, 8]
         },
        ball: 'C',
        frames: [
          [
            'C>14.5,13.5', 'N1-14,13', 'A1-12,15', 'D1-17,14.5', '# The coach throws it in: every pair goes'
          ],
          ['N1~12,8', 'A1-N1', 'D1-15,10', 'N2-19,6', '# Shield it, and find your partner'],
          ['N1>N2', 'B2-23,6', '# A one-two…'],
          ['N2>G', '# …and score: Yellow are through']
        ]
      },
      signals: ['few-shots', 'one-scorer'], goesWith: ['lay-off-and-shoot'], tags: ['fun', 'competitive']
    },

    {
      id: 'the-game', v: 1, name: 'The game', type: 'game',
      summary: 'Finish every session with a proper game in your match format, coach quiet, players deciding.',
      ages: [4, 19], level: 1, players: { min: 6, best: 14, max: 22 }, gk: 2, minutes: [15, 30], intensity: 3,
      space: null, spaceNote: 'Your match pitch for this age, or as close to it as you have.',
      kit: { balls: 6, cones: 12, goals: 2, bibs: 11 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [64, 46], mark: 'pitch',
        goals: [[0, 23, 'big', 'e'], [64, 23, 'big', 'w']],
        players: { 
          K1: [1.5, 23], A1: [12, 12], A2: [12, 34], A3: [24, 23], A4: [32, 10], A5: [32, 36], A6: [44, 23],
          K2: [62.5, 23], D1: [52, 12], D2: [52, 34], D3: [42, 28], D4: [35, 15], D5: [35, 31], D6: [22, 18]
         },
        ball: 'K1',
        frames: [
          ['K1>A1', '# Let them play: no stopping it'],
          ['A1>A4', 'D4-A4', 'A6-46,18', '# Watch for the week\'s focus'],
          ['A4>A6', 'D3-A6', '# Praise it when you see it'],
          ['A6>G2', '# Rehearse Saturday: subs on your plan\'s blocks']
        ]
      },
      signals: ['late-goals'], goesWith: ['cooldown-reflect'], tags: ['every-session', 'uses-your-shape']
    },

    {
      id: 'positional-possession-game', v: 1, name: 'Positional possession game', type: 'game',
      summary: 'A possession game where nobody shares a zone with a teammate. Keep it, play through the middle, and score by finding the target at the far end.',
      ages: [13, 19], level: 3, players: { min: 14, best: 15, max: 18 }, gk: 0, minutes: [15, 20], intensity: 3,
      space: [50, 40], kit: { balls: 8, cones: 20, bibs: 15 },
      setupMins: 8, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
      positions: OUTFIELD, skills: ['passing', 'scanning', 'movement', 'shape', 'decision-making'], principles: ['width', 'support', 'penetration', 'balance'],
      moments: ['attack', 'defend', 'toAttack', 'toDefend'], physical: ['endurance'],
      setup: 'A 50 × 40 yd area split into nine zones, three by three. 6v6, plus three neutrals: a target at each end and one in the middle zone.',
      how: [
        'The team with the ball plays with the neutrals. No more than one player from each team in any zone.',
        'A pass from one end target to the other, through the middle, is a point.',
        'Players may change zones, but a teammate must fill the one she left before the next pass.',
        'Lose it: the other team has the neutrals now.'
      ],
      points: ['Never two in one zone: that\'s a passing option thrown away.', 'Forward when it\'s on, sideways to move them, back to start again.', 'Leave a zone, and someone fills it.'],
      questions: ['Which zone was empty when we lost it?'],
      mistakes: ['Players crowding into the ball\'s zone: the rule exists for this. Enforce it early.'],
      why: 'Positional play is how the best teams keep the ball: everyone in a different space, so there\'s always a pass. Zones make the idea visible.',
      easier: ['Two players per team allowed in a zone.'],
      harder: ['Two touches.', 'A point only if the pass into the far target comes first time out of the middle zone.'],
      diagram: {
        area: [50, 40], mark: 'grid', cones: [[0, 0], [50, 0], [0, 40], [50, 40]],
        lines: [[16.7, 0, 16.7, 40], [33.3, 0, 33.3, 40], [0, 13.3, 50, 13.3], [0, 26.7, 50, 26.7]],
        players: {
          N1: [-1, 20], N2: [25, 20], N3: [51, 20],
          A1: [8, 6], A2: [8, 34], A3: [25, 6], A4: [25, 34], A5: [42, 7], A6: [42, 33],
          D1: [12, 17], D2: [21, 24], D3: [30, 11], D4: [37, 24], D5: [14, 30], D6: [38, 10]
        },
        ball: 'N1',
        frames: [
          ['N1>A1', '# One player per zone: always a pass on'],
          ['A1>A3', 'D3-A3', '# Forward when it\'s on'],
          ['A3>N2', 'D2-N2', '# Through the middle…'],
          ['N2>N3', '# …to the far target: a point']
        ]
      },
      signals: ['possession', 'solo-goals'], goesWith: ['three-zone-rondo', 'stay-in-your-zone'], tags: ['positional', 'possession']
    },

    {
      id: 'wide-channel-game', v: 1, name: 'Free wide channels', type: 'game',
      summary: 'A game with a protected channel down each wing where the attacking team\'s winger can\'t be tackled. Goals from a cross count double.',
      ages: [10, 19], level: 2, players: { min: 10, best: 14, max: 18 }, gk: 2, minutes: [15, 20], intensity: 3,
      space: [60, 40], kit: { balls: 8, cones: 16, goals: 2, bibs: 9 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
      positions: ALL, skills: ['crossing', 'passing', 'movement', 'long-passing'], principles: ['width', 'penetration', 'support'],
      moments: ['attack', 'defend'], physical: ['endurance'],
      setup: 'A pitch with goals and keepers and a 6 yd channel marked down each touchline. One winger from each team may be in each channel; only the team with the ball may touch it there.',
      how: [
        'Play a normal game. The wide channels belong to the attacking team\'s winger: no tackling there.',
        'Get it wide, cross it, and attack the box. A goal from a cross is two.',
        'After eight minutes, one defender at a time may go into the channel to defend.'
      ],
      points: ['Switch it to the free wing quickly, before the defence shifts.', 'Strikers: near post, far post, cut-back. Arrive, don\'t wait.', 'Wingers: cross early when it\'s on.'],
      questions: ['Which wing was free? How did we get the ball there?'],
      mistakes: ['Everyone staying central and ignoring the channels: give a point for every pass into a channel in the first round.'],
      why: 'Width stretches a defence, and crosses are a big source of goals. A free channel makes going wide the obvious choice until it becomes a habit.',
      easier: ['Goals from crosses count three.'],
      harder: ['Two touches for the winger in the channel.'],
      diagram: {
        area: [60, 40], mark: 'none',
        goals: [[0, 20, 'big', 'e'], [60, 20, 'big', 'w']],
        zones: [[0, 0, 60, 6, 'FREE'], [0, 34, 60, 6, 'FREE']],
        lines: [[30, 6, 30, 34]],
        players: {
          K1: [1.5, 20], A1: [14, 20], A2: [24, 14], A3: [22, 3.5], A4: [42, 18], A5: [42, 25],
          K2: [58.5, 20], D1: [30, 15], D2: [46, 14], D3: [48, 26], D4: [36, 22]
        },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D1-A2', '# Get it wide quickly'],
          ['A2>A3', '# Into the free channel: no tackling there'],
          ['A3~50,3.5', 'A4-53,15', 'A5-51,24', '# Down the wing; the box fills'],
          ['A3>A5', '# Cross'],
          ['A5>G', '# A goal from a cross: two']
        ]
      },
      signals: ['few-shots', 'solo-goals', 'possession'], goesWith: ['crossing-and-finishing', 'overlap-2v1-wide'], tags: ['uses-your-shape']
    },

    {
      id: 'target-player-game', v: 1, name: 'Target player game', type: 'game',
      summary: 'Score by getting the ball to your target player at the far end, who sets it back for a teammate arriving. Support play inside a game.',
      ages: [10, 19], level: 2, players: { min: 10, best: 12, max: 14 }, gk: 0, minutes: [12, 18], intensity: 3,
      space: [40, 30], kit: { balls: 6, cones: 8, bibs: 6 },
      setupMins: 2, adults: 1, indoor: true, groups: ['teams'], involvement: 3, competitive: true,
      positions: OUTFIELD, skills: ['passing', 'shielding', 'combination', 'movement'], principles: ['support', 'penetration', 'width'],
      moments: ['attack', 'defend'], physical: ['endurance'],
      setup: 'A 40 × 30 yd pitch with a 3 yd end zone at each end. 4v4 or 5v5, plus each team\'s target player standing in the end zone it attacks.',
      how: [
        'Play to your target. She can move along her end zone but can\'t be tackled.',
        'A point when she sets it back to a teammate who arrives and plays it first time. Then attack again.',
        'Rotate the target every three minutes.'
      ],
      points: ['Pass into the target and go: she needs someone to set it to.', 'Target: show for it, protect it, set it for whoever is arriving.', 'Defenders: block the pass into the target, then track the runner.'],
      questions: ['Where was the support when the target got the ball?'],
      mistakes: ['Passing into the target and watching: a lay-off with nobody there is a turnover.'],
      why: 'Playing into a forward and supporting her is how teams move up the pitch. The passer learns to follow her pass, and the forward to bring others in.',
      easier: ['The target may turn and dribble out of her zone.'],
      harder: ['The set must be first time.', 'One defender may follow the target into the end zone.'],
      diagram: {
        area: [40, 30], mark: 'grid', cones: [[0, 0], [40, 0], [0, 30], [40, 30]],
        zones: [[0, 0, 3, 30], [37, 0, 3, 30]],
        players: {
          A6: [38.5, 15], D6: [1.5, 15],
          A1: [10, 15], A2: [18, 8], A3: [20, 22], A4: [26, 14],
          D1: [16, 15], D2: [24, 9], D3: [27, 21], D4: [32, 14]
        },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D2-A2', '# Work it forward'],
          ['A2>A6', 'A3-31,18', '# Into the target, and go'],
          ['A6>A3', '# She sets it for the one arriving: a point']
        ]
      },
      signals: ['possession', 'solo-goals'], goesWith: ['hold-up-and-lay-off', 'end-zone-game'], tags: []
    },

    {
      id: 'soccer-tennis', v: 1, name: 'Soccer tennis', type: 'game',
      summary: 'Tennis with feet, thighs and chest over a low net or a line of cones. First touch and ball control as a game.',
      ages: [9, 19], level: 2, players: { min: 2, best: 8, max: 12 }, gk: 0, minutes: [10, 15], intensity: 2,
      space: [18, 10], kit: { balls: 3, cones: 12 },
      setupMins: 3, adults: 1, indoor: true, groups: ['pairs', 'small'], involvement: 2, competitive: true,
      positions: ALL, skills: ['first-touch', 'ball-mastery', 'passing'], principles: ['creativity'],
      moments: ['attack'], physical: ['coordination', 'balance'],
      setup: 'A court about 18 × 10 yd split by a low net, a bench, or a line of cones. One to four players a side.',
      how: [
        'Serve by volleying it from the hand over the net.',
        'Each side gets up to three touches and one bounce before it goes back over. No hands.',
        'Score like volleyball: a second bounce, or the ball out, loses the point.'
      ],
      points: ['Cushion the first touch up, so a teammate can play it.', 'Every surface: thigh, chest, foot.', 'Return it into space, away from players.'],
      questions: ['Which surface gave you the softest touch?'],
      mistakes: ['Hacking it straight back first time, every time: set it with a touch first.'],
      why: 'Hundreds of touches on a ball in the air, with a reason to control it. Players who play it get comfortable with high balls without noticing.',
      easier: ['Two bounces allowed, a bigger court.'],
      harder: ['No bounces at all.', 'Weaker foot only for returns.'],
      safety: 'Heading only for players old enough under your federation\'s rules. Below that: feet, thighs and chest.',
      diagram: {
        area: [18, 10], mark: 'grid',
        cones: [[0, 0], [18, 0], [0, 10], [18, 10], [9, 0], [9, 2.5], [9, 5], [9, 7.5], [9, 10]],
        lines: [[9, 0, 9, 10]],
        players: { A1: [3, 3], A2: [4, 7.5], D1: [14, 3], D2: [14, 7] },
        ball: 'A1',
        frames: [
          ['A1>D1', '# Serve over the net'],
          ['D1>D2', '# Control it up for a teammate'],
          ['A1-4,1.5', 'D2>4.3,1.2', '# Back over, into space'],
          ['A1>A2', '# Cushion it, set it, play it back']
        ]
      },
      signals: ['possession'], goesWith: ['aerial-control', 'juggling-ladder'], tags: ['fun', 'ball-skills']
    },

    {
      id: 'throw-head-catch', v: 1, name: 'Throw, head, catch', type: 'game',
      summary: 'A team game played with the hands in the order throw, head, catch. Goals only from a header.',
      ages: [12, 19], level: 2, players: { min: 6, best: 12, max: 16 }, gk: 2, minutes: [10, 15], intensity: 2,
      space: [30, 40], kit: { balls: 2, goals: 2, cones: 4, bibs: 8 },
      setupMins: 3, adults: 1, indoor: true, groups: ['teams'], involvement: 2, competitive: true,
      positions: ALL, skills: ['heading', 'communication', 'movement'], principles: ['support', 'mobility'],
      moments: ['attack', 'defend'], physical: ['coordination'],
      setup: 'A 30 × 40 yd pitch with a goal and a keeper at each end, two teams in bibs, and a light ball.',
      how: [
        'The ball moves by hand, always in the order throw, head, catch: one player throws, a teammate heads it, a third catches it and throws next.',
        'Goals only from a header. The keepers play as normal.',
        'The other team wins it by catching an interception, or when the order breaks or the ball touches the ground.',
        'No running with the ball: three steps at most.'
      ],
      points: [
        'Forehead, eyes open, mouth closed, neck firm.',
        'Attack the ball: move your head through it, don\'t let it hit you.',
        'Move into space for the catch before the header is played.'
      ],
      questions: ['Where on your head did the good ones come off?', 'Where did you stand so the header could find you?'],
      mistakes: [
        'Throws too hard or too high: underarm, at the forehead, from close.',
        'Eyes closed and flinching: go back to heading a ball tossed by yourself.'
      ],
      why: 'Heading practice hidden inside a game teenagers ask for. It also teaches support play without feet getting in the way: angles, space and calling for it.',
      easier: ['Throw and catch only; a header is needed just to score. Far fewer headers each.'],
      harder: ['Goals only from headers outside the goal area.', 'A header can go on to a teammate who heads it again.'],
      safety: 'Only for U12 and older, with a light or size 4 ball and gentle underarm throws, never thrown hard at a face. US Soccer limits heading practice for ages 11 to 13 to about 30 minutes a week and 15 to 20 headers per player. Follow your own federation\'s current rules, use the easier version to keep the count down, and stop anyone who looks dazed or has a headache.',
      diagram: {
        area: [30, 40], mark: 'none',
        cones: [[0, 0], [30, 0], [0, 40], [30, 40]],
        goals: [[15, 0, 'big', 's'], [15, 40, 'big', 'n']],
        players: { K1: [15, 1.5], K2: [15, 38.5], A1: [8, 28], A2: [14, 20], A3: [23, 15], D1: [11, 24], D2: [19, 20] },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D1-12,19', '# Throw it for a teammate to head'],
          ['A2>A3', 'A1-11,8', 'D2-21,12', '# Head it on; a third player catches'],
          ['A3>A1', 'D1-14,11', '# She throws, and it starts again'],
          ['A1>G', '# Goals only from a header']
        ]
      },
      signals: ['corners-against'], goesWith: ['heading-basics', 'clear-and-step-out'], tags: ['fun']
    },

    /* ---------------- set pieces ---------------- */

    {
      id: 'attacking-corners', v: 1, name: 'Attacking corners', type: 'setpiece',
      summary: 'Two or three simple routines (near post, far post, short) and a job for every player, including who stays back.',
      ages: [10, 19], level: 2, players: { min: 8, best: 14, max: 22 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [44, 18], spaceNote: 'The penalty area and around it.',
      kit: { balls: 12, goals: 1, cones: 6, bibs: 8 },
      setupMins: 3, adults: 1, indoor: false, groups: ['squad'], involvement: 1, competitive: false,
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
      diagram: {
        area: [60, 22], mark: 'box',
        goals: [[30, 0, 'big', 's']],
        players: { 
          K: [30, 1.5], A1: [0.5, 0.5], A2: [22, 16], A3: [36, 15], A4: [28, 20], A5: [33, 21],
          A6: [12, 21.5], A7: [48, 21.5], D1: [27, 3], D2: [30, 6], D3: [33, 8]
         },
        ball: 'A1',
        frames: [
          ['A2-26.5,4', 'A3-35,5', 'A4-30,12', 'A5-31,18', '# "Near": runs start late and fast'],
          ['A1>A2', '# Whip it to the near post'],
          ['A2>A3', '# Flick it on'],
          ['A3>G', '# Far post finishes. Two stayed back']
        ]
      },
      signals: ['few-shots'], goesWith: ['crossing-and-finishing', 'defending-corners'], tags: ['set-piece']
    },

    {
      id: 'defending-corners', v: 1, name: 'Defending corners', type: 'setpiece',
      summary: 'A clear set-up for every corner against: who guards the posts, who marks whom, who clears, and who breaks.',
      ages: [10, 19], level: 2, players: { min: 8, best: 14, max: 22 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [44, 18], spaceNote: 'The penalty area and around it.',
      kit: { balls: 12, goals: 1, cones: 6, bibs: 8 },
      setupMins: 3, adults: 1, indoor: false, groups: ['squad'], involvement: 1, competitive: false,
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
      diagram: {
        area: [60, 22], mark: 'box',
        goals: [[30, 0, 'big', 's']],
        players: { 
          K: [30, 1.5], D1: [26.6, 0.8], D2: [27, 6], D3: [31, 9], D4: [35, 8], D5: [30, 18], D6: [40, 21],
          A1: [0.5, 0.5], A2: [31, 11], A3: [35, 10.5], A4: [27, 15]
         },
        ball: 'A1',
        frames: [
          ['A1>28.4,6.2', 'A2-29.5,7.5', 'D3-A2', '# The cross comes in: attack it, don\'t wait'],
          [
            'D6-46,19.5', 'D2>D6', 'D1-27,8', 'D3-31,13', 'D4-35,13', 'K-30,3',
            '# Clear it high, wide, far; all step out'
          ],
          ['D6~57,21', '# One stayed up to break']
        ]
      },
      signals: ['corners-against', 'conceding'], goesWith: ['gk-crosses', 'attacking-corners'], tags: ['set-piece']
    },

    {
      id: 'throw-in-game', v: 1, name: 'Throw-ins that keep the ball', type: 'setpiece',
      summary: 'Legal technique first, then the movement that makes a throw-in a free pass instead of a 50/50.',
      ages: [6, 19], level: 1, players: { min: 4, best: 12, max: 20 }, gk: 0, minutes: [8, 12], intensity: 1,
      space: [20, 30], kit: { balls: 6, cones: 8, bibs: 6 },
      setupMins: 2, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [14, 13], mark: 'none',
        lines: [[0, 1.5, 14, 1.5]],
        labels: [[11, 0.9, 'TOUCHLINE']],
        players: { A1: [5, 0.6], A2: [6, 7], D1: [7, 9.5] },
        ball: 'A1',
        frames: [
          ['A2-8,10.5', 'D1-8.5,12', '# The receiver checks away…'],
          ['A2-6,4.5', 'D1-7,6.5', 'A1>A2', '# …comes short, and the throw goes to her feet'],
          ['A1-5,2.6', 'A2>A1', '# Straight back to the thrower: she\'s free']
        ]
      },
      signals: ['throw-ins', 'possession'], goesWith: ['keep-away-4v4-plus-2'], tags: ['set-piece', 'no-prep']
    },

    {
      id: 'quick-restarts', v: 1, name: 'Quick restarts', type: 'setpiece',
      summary: 'A small-sided game where a throw-in taken within five seconds scores a bonus point, so players learn to restart before the other team sets.',
      ages: [8, 19], level: 2, players: { min: 8, best: 10, max: 14 }, gk: 0, minutes: [10, 15], intensity: 3,
      space: [25, 35], kit: { balls: 12, cones: 12, minigoals: 2, bibs: 8 },
      setupMins: 5, adults: 1, indoor: false, groups: ['teams'], involvement: 3, competitive: true,
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
      diagram: {
        area: [35, 25], mark: 'none',
        goals: [[0, 12.5, 'mini', 'e'], [35, 12.5, 'mini', 'w']],
        lines: [[0, 0, 35, 0], [0, 25, 35, 25]],
        balls: [[6, -0.8], [24, -0.8], [30, -0.8], [6, 25.8], [14, 25.8], [22, 25.8], [30, 25.8]],
        players: { A1: [13, 4], A2: [18, 9], A3: [9, 11], D1: [16, 5], D2: [24, 12], D3: [20, 17] },
        ball: ['D1', [14, -0.8]],
        frames: [
          ['D1>17,-1.3', '# The ball goes out'],
          ['A1-14,-0.4', 'A2-21,5', 'A3-11,5', '# The nearest player grabs the nearest spare ball'],
          ['A1>A2', 'D1-17,7', '# Throw it in before they\'re set'],
          ['A2~27,8', 'A3-22,10', '# Keep it for three passes: a bonus point']
        ]
      },
      signals: ['throw-ins', 'possession'], goesWith: ['throw-in-game', 'six-second-counter'], tags: ['set-piece']
    },

    {
      id: 'penalties', v: 1, name: 'Penalties', type: 'setpiece',
      summary: 'A routine, a placement, and practice under pressure: everyone takes one while the team watches, the way it happens in a shoot-out.',
      ages: [9, 19], level: 1, players: { min: 4, best: 12, max: 22 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [44, 22], kit: { balls: 6, goals: 1, cones: 4 },
      setupMins: 1, adults: 1, indoor: false, groups: ['squad'], involvement: 1, competitive: true,
      positions: ALL, skills: ['shooting', 'set-pieces', 'diving'], principles: [],
      moments: ['attack'], physical: [],
      setup: 'A goal, a keeper, the penalty spot, and the rest of the team waiting at the edge of the box, like a shoot-out.',
      how: [
        'Each player picks a side and a height before she walks up, and doesn\'t change it.',
        'The same routine every time: place the ball, the same number of steps back, look at the keeper, breathe, go.',
        'Round two: sudden death, the team watching.',
        'Keepers practise reading the hips and staying big until the last moment.'
      ],
      points: ['Decide early; don\'t change your mind.', 'Placement over power: low and inside the post.', 'Keepers: stay on your feet until she strikes.'],
      questions: ['What is your routine? Say it out loud.'],
      mistakes: ['Changing your mind in the run-up: that\'s how penalties go wide.'],
      why: 'Penalties decide games and tournaments, and they\'re mostly nerve. Practising the routine with people watching is the closest thing to the real one.',
      easier: ['No keeper: aim at cones in the corners.'],
      harder: ['A team shoot-out with a scoreboard.'],
      safety: 'Keepers dive on soft ground only, landing on the side.',
      diagram: {
        area: [44, 22], mark: 'box', goals: [[22, 0, 'big', 's']],
        players: { K: [22, 1], A1: [22, 13], A2: [14, 20.5], A3: [18, 20.5], A4: [26, 20.5], A5: [30, 20.5] },
        ball: 'A1',
        frames: [
          ['A1>19.2,0.3', 'K-24,1.2', '# Low and inside the post. Decide early'],
          ['A2-22,14.5', '# Next: the same routine, the team watching']
        ]
      },
      signals: ['off-target'], goesWith: ['finishing-circuit', 'gk-reaction-saves'], tags: ['set-piece', 'competitive']
    },

    {
      id: 'free-kicks', v: 1, name: 'Free kicks around the box', type: 'setpiece',
      summary: 'Direct free kicks round and over a wall, two simple routines, and the keeper setting her wall.',
      ages: [11, 19], level: 3, players: { min: 6, best: 10, max: 14 }, gk: 1, minutes: [12, 18], intensity: 1,
      space: [44, 30], kit: { balls: 12, goals: 1, cones: 6, poles: 4 },
      setupMins: 3, adults: 1, indoor: false, groups: ['small'], involvement: 1, competitive: true,
      positions: ALL, skills: ['set-pieces', 'shooting', 'passing', 'communication'], principles: ['creativity'],
      moments: ['attack', 'defend'], physical: [],
      setup: 'A goal and keeper, a wall of poles or players 10 yd from the ball, and the ball 20 to 25 yd out.',
      how: [
        'Direct: curl it over or round the wall, to the keeper\'s side or the far corner.',
        'Routine one: a short pass sideways to change the angle, then a shot.',
        'Routine two: one player runs over the ball as a dummy, the second strikes it.',
        'Keepers call how many in the wall and where it stands, then take the other side.'
      ],
      points: ['Pick your spot before you place the ball.', 'Over the wall: a short, firm strike under the middle so it dips.', 'Routines: everyone knows their job and the signal.', 'Follow every shot in.'],
      questions: ['From here, over the wall or round it? Why?'],
      mistakes: ['Everyone trying the same blast: name the takers and the spots.'],
      why: 'Fouls round the box are free chances. A team with a taker and two routines scores a few a season; one without hits the wall.',
      easier: ['No wall, then a wall of two.'],
      harder: ['A live wall that jumps; defenders mark the routine\'s runners.'],
      diagram: {
        area: [44, 30], mark: 'box', goals: [[22, 0, 'big', 's']],
        poles: [[16.6, 14.6], [17.6, 14.8], [18.6, 15], [19.6, 15.2]],
        players: { K: [23.5, 1.2], A1: [16, 25], A2: [20, 26] },
        ball: 'A1',
        frames: [
          ['A1>A2', '# Routine one: short, to change the angle'],
          ['A2>G(', '# Then curl it past the wall']
        ]
      },
      signals: ['few-shots', 'off-target', 'fouls'], goesWith: ['bending-the-ball', 'penalties'], tags: ['set-piece']
    },

    {
      id: 'throw-in-target', v: 1, name: 'Throw-in target', type: 'setpiece',
      summary: 'The four rules of a legal throw, then pairs throwing to each other\'s feet and stepping further apart after every three good ones.',
      ages: [6, 11], level: 1, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [6, 10], intensity: 1,
      space: [20, 15], kit: { balls: 10, cones: 10 },
      setupMins: 2, adults: 1, indoor: true, groups: ['pairs'], involvement: 2, competitive: true,
      positions: OUTFIELD, skills: ['throw-ins', 'first-touch'], principles: [],
      moments: ['attack'], physical: ['coordination', 'balance'],
      setup: 'A line of cones as a touchline. Pairs with a ball, one either side of it, 4 yd apart.',
      how: [
        'Go through the four rules together: face the pitch; both feet on the ground, on or behind the line; both hands on the ball; from behind the head and released over it.',
        'Throw to your partner\'s feet. She traps it, picks it up, and throws it back the same way.',
        'Three legal throws in a row and the pair takes a step further apart. The pair furthest apart after five minutes wins.',
        'A foul throw (a foot up, one hand, not over the head) sends the pair back a step.'
      ],
      points: [
        'Feet stay down until the ball has gone.',
        'Ball behind your head, elbows bent, and snap it forwards.',
        'Aim at the feet: much easier to control than a ball at the head.'
      ],
      questions: ['What did you do with your feet to keep the throw legal?'],
      mistakes: [
        'The back foot lifting as they throw: drag the back toe along the ground, or throw with both feet together.',
        'Starting with the ball on top of the head instead of behind it.'
      ],
      why: 'Under-tens give away foul throws every game. A legal throw to a teammate\'s feet is the start of keeping the ball from the restart they take most often.',
      easier: ['Kneeling throws first: both knees down, ball from behind the head.'],
      harder: ['The receiver moves along the line, and the throw has to lead her.', 'Add a defender: that is Throw-ins that keep the ball.'],
      diagram: {
        area: [14, 10], mark: 'none',
        cones: [[1, 4], [4, 4], [7, 4], [10, 4], [13, 4]],
        lines: [[0, 4, 14, 4]],
        players: { A1: [3, 3], A2: [3, 7], A3: [10, 3], A4: [10, 7] },
        ball: ['A1', 'A3'],
        frames: [
          ['A1>A2', 'A3>A4', '# Feet down, both hands, over the head'],
          ['A2>A1', 'A4>A3', '# Trap it, pick it up, throw it back'],
          ['A2-3,9.5', 'A4-10,9.5', '# Three good throws: a step further apart']
        ]
      },
      signals: ['throw-ins'], goesWith: ['throw-in-game', 'pass-bowling'], tags: ['set-piece', 'young']
    },

    {
      id: 'defending-free-kicks', v: 1, name: 'Building a wall', type: 'setpiece',
      summary: 'Defending a free kick around the box: the keeper calls the number, the anchor lines up the near post, and everyone else marks a runner.',
      ages: [11, 19], level: 2, players: { min: 6, best: 12, max: 18 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [44, 30], kit: { balls: 10, goals: 1, cones: 6, bibs: 8 },
      setupMins: 3, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
      positions: ALL, skills: ['set-pieces', 'communication', 'shape'], principles: ['cover', 'compactness'],
      moments: ['defend'], physical: [],
      setup: 'A goal and keeper, and a ball placed 20 to 25 yd out. Four attackers take the free kicks; the rest defend.',
      how: [
        'The keeper calls how many in the wall ("Three!") from her near post as soon as the whistle goes: more the closer and more central the kick.',
        'One player, the same one every time, is the wall\'s anchor: she lines up the end of the wall with the near post, and the rest join on the inside. The keeper covers the far side.',
        'Everyone else marks: one on each attacker, one on the edge of the box for the rebound.',
        'The attackers take it live: shoot, or play it short. Move the ball somewhere new every go.'
      ],
      points: [
        'Set in five seconds: the quick free kick is the one that scores.',
        'The wall stands still, arms in, and nobody turns away.',
        'After the kick, the wall steps out together and everyone else follows their runner.'
      ],
      questions: ['Who made the wall, and who was left to mark?', 'What happened when they played it short?'],
      mistakes: [
        'Half the team joining the wall: the keeper says how many, nobody else.',
        'Wall players ducking or turning: the ball goes through the gap.'
      ],
      why: 'Free kicks around the box are among the clearest chances a youth team gives away. A wall that forms in seconds, and marking that doesn\'t forget the runners, takes most of them away.',
      easier: ['A walk-through: the coach puts the ball on different spots and the team sets up without a kick.'],
      harder: ['The attackers may take it quickly, before the wall is set.', 'A second runner to the far post.'],
      safety: 'Use a light ball while players learn to stand still in a wall, and keep the free kicks 20 yd out or more. Nobody should shoot hard at a wall from close range in practice.',
      diagram: {
        area: [44, 30], mark: 'box',
        goals: [[22, 0, 'big', 's']],
        players: {
          K: [22, 1.5], A1: [16, 24], A2: [26, 14], A3: [31, 19], A4: [20, 27],
          D1: [11, 9], D2: [23, 10], D3: [21, 20], D4: [29, 8], D5: [35, 15]
        },
        ball: 'A1',
        frames: [
          ['D1-16.8,14', 'D2-17.8,14.1', 'D3-18.8,14.2', 'K-23.5,2', '# "Three!" The anchor lines up the near post'],
          ['D4-A2', 'D5-A3', 'A2-25,11', 'A3-30,15', '# Everyone else marks a runner'],
          ['A1>A4', 'D1-16.5,17.5', 'D2-17.5,17.6', 'D3-18.5,17.7', '# Played short: the wall steps out together']
        ]
      },
      signals: ['conceding', 'fouls'], goesWith: ['free-kicks', 'defending-corners'], tags: ['set-piece', 'defending']
    },

    {
      id: 'goal-kicks', v: 1, name: 'Goal kicks', type: 'setpiece',
      summary: 'Two rehearsed goal kicks, short and long, against a press: the centre backs split, the keeper reads which one is on.',
      ages: [9, 19], level: 2, players: { min: 8, best: 12, max: 16 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 40], kit: { balls: 10, goals: 1, cones: 8, bibs: 8 },
      setupMins: 4, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
      positions: ALL, skills: ['set-pieces', 'distribution', 'movement', 'first-touch'], principles: ['width', 'support'],
      moments: ['attack'], physical: [],
      setup: 'Half a pitch: a goal and keeper, the back line and midfield, and three or four opponents who press. If your league has a build-out line, mark it with cones.',
      how: [
        'Every restart is a goal kick. Rehearse two. Short: the centre backs split to the edges of the box and a midfielder drops. Long: to a target on the side the press leaves open.',
        'The keeper looks short first. If they mark the short options, she goes long, and the team pushes up to win the second ball.',
        'A point for getting the ball over halfway under control. The pressers get a point for winning it in the defending third.'
      ],
      points: [
        'Get wide, and get wide early: the box is 44 yd across, use all of it.',
        'Receive side-on, facing up the pitch.',
        'Decide before the ball is placed, then don\'t hesitate.'
      ],
      questions: ['What told the keeper to go long?', 'Where was the free player when they pressed the centre backs?'],
      mistakes: [
        'Centre backs standing beside the keeper inside the box: one pass and they\'re pressed. Split to the corners of the box.',
        'Going long every time, with nobody there to win the knock-down.'
      ],
      why: 'A team takes a dozen goal kicks a game. A routine everyone knows turns them from a hopeful punt into a planned start, and it\'s the first piece of real team play most teams can rehearse.',
      easier: ['No pressers: walk through both shapes until everyone knows her spot.'],
      harder: ['The pressers can mark anyone, and the keeper has five seconds to decide.'],
      diagram: {
        area: [44, 40], mark: 'half',
        goals: [[22, 0, 'big', 's']],
        players: {
          K: [22, 5], A1: [16, 10], A2: [28, 10], A3: [22, 24], A4: [6, 32], A5: [38, 30],
          D1: [18, 22], D2: [26, 22], D3: [22, 30]
        },
        ball: 'K',
        frames: [
          ['A1-3,14', 'A2-41,14', 'A3-22,19', '# Centre backs split to the edges of the box'],
          ['K>A1', 'D1-A1', '# Short, to the free one, facing forward'],
          ['A4-5,26', 'A1>A4', '# Out past the press before it arrives']
        ]
      },
      signals: ['possession'], goesWith: ['build-out-play', 'gk-distribution'], tags: ['set-piece', 'uses-your-shape']
    },

    {
      id: 'kick-offs', v: 1, name: 'Kick-off routines', type: 'setpiece',
      summary: 'A kick-off the whole team knows: back to a midfielder, everyone runs, and a long ball into the space behind their full-back.',
      ages: [8, 19], level: 1, players: { min: 6, best: 10, max: 16 }, gk: 0, minutes: [8, 12], intensity: 1,
      space: [40, 34], kit: { balls: 4, cones: 8, bibs: 8 },
      setupMins: 2, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: false,
      positions: OUTFIELD, skills: ['set-pieces', 'passing', 'movement'], principles: ['penetration', 'width'],
      moments: ['attack'], physical: [],
      setup: 'Half a pitch or more, the team in its match shape, a ball on the centre spot. Opponents come in for the second half of the drill.',
      how: [
        'Walk one routine through: the ball goes back to a midfielder, the wingers and striker sprint forward on the whistle, and the midfielder plays long into the space behind the other team\'s full-back.',
        'Run it at speed five times with nobody against it, then add three or four defenders.',
        'A second routine for the second half: back to a centre back, who switches it to the far full-back.',
        'Give each one a name, so the team knows which one is on.'
      ],
      points: [
        'Everybody moves on the whistle. The routine is the runs, not the pass.',
        'The long ball goes into space ahead of the runner, not to her feet.',
        'A shot straight from the kick-off is allowed, if the keeper is off her line.'
      ],
      questions: ['Who has to move first for the long ball to work?', 'What do we do if they cut the routine off?'],
      mistakes: [
        'Everyone waiting for the ball before moving: walk the runs through without one first.',
        'Kicking it long to nobody: if nobody has run, keep it.'
      ],
      why: 'A team kicks off at the start of each half and after every goal it concedes. A routine everyone knows wins ground straight away, and it settles a team that has just gone a goal down.',
      easier: ['One routine only, walked, no defenders.'],
      harder: ['The defenders know the routine and can mark it. Read them, and switch to the other one.'],
      diagram: {
        area: [40, 34], mark: 'none',
        lines: [[0, 26, 40, 26]],
        players: {
          A1: [20, 26], A2: [23, 26.5], A3: [20, 31], A4: [4, 26], A5: [36, 26],
          D1: [8, 14], D2: [32, 14], D3: [16, 16], D4: [24, 16]
        },
        ball: 'A1',
        frames: [
          ['A1>A3', 'A2-24,18', 'A4-6,16', 'A5-34,18', '# The ball goes back; the runners go'],
          ['A4-5,6', 'A3>A4', 'D1-8,9', '# Long, into the space behind the full-back']
        ]
      },
      signals: ['few-shots'], goesWith: ['quick-restarts', 'pressing-from-the-front'], tags: ['set-piece', 'uses-your-shape']
    },

    /* ---------------- goalkeeping ---------------- */

    {
      id: 'gk-handling', v: 1, name: 'Keeper handling', type: 'keeper',
      summary: 'Ready position, the W catch for chest and head height, and the scoop for low balls, from easy serves up to shots.',
      ages: [7, 19], level: 1, players: { min: 1, best: 2, max: 4 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [10, 15], kit: { balls: 6, goals: 1, cones: 4 },
      setupMins: 1, adults: 2, indoor: true, groups: ['pairs'], involvement: 3, competitive: false,
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
      diagram: {
        area: [12, 13], mark: 'none',
        goals: [[6, 0, 'big', 's']],
        balls: [[8, 11.5], [8.9, 11.9], [8.4, 12.6]],
        players: { K: [6, 1.6], C: [6, 10] },
        ball: 'C',
        frames: [
          ['C>K', '# Serve it: hands, then volleys, then shots'],
          ['K>C', '# W catch, bring it in, roll it back']
        ]
      },
      signals: ['conceding'], goesWith: ['gk-diving', 'gk-distribution'], tags: ['keeper']
    },

    {
      id: 'gk-diving', v: 1, name: 'Keeper diving', type: 'keeper',
      summary: 'Diving built up safely: sitting, kneeling, crouching, standing, then stepping into the dive.',
      ages: [8, 19], level: 1, players: { min: 1, best: 2, max: 4 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [10, 15], kit: { balls: 6, goals: 1, mats: 1 },
      setupMins: 1, adults: 2, indoor: true, groups: ['pairs'], involvement: 2, competitive: false,
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
      diagram: {
        area: [12, 10], mark: 'none',
        goals: [[6, 0, 'big', 's']],
        zones: [[1.5, 0.5, 9, 3.5]],
        labels: [[6, 5, 'SOFT GROUND']],
        players: { K: [6, 1.8], C: [6, 8] },
        ball: 'C',
        frames: [
          ['C>3.4,2', 'K-3.9,2.1', '# Roll it wide: hands lead, land on her side'],
          ['K>C', 'K-6,1.8', '# Up, ball back, reset'],
          ['C>8.8,2', 'K-8.3,2.1', '# The other side, a little further each time']
        ]
      },
      signals: ['conceding', 'shots-against'], goesWith: ['gk-handling', 'gk-angles-1v1'], tags: ['keeper']
    },

    {
      id: 'gk-distribution', v: 1, name: 'Keeper distribution', type: 'keeper',
      summary: 'Rolling, throwing and kicking to targets, so a save becomes the start of an attack.',
      ages: [7, 19], level: 1, players: { min: 2, best: 4, max: 6 }, gk: 1, minutes: [10, 15], intensity: 1,
      space: [40, 50], kit: { balls: 10, cones: 12, goals: 1 },
      setupMins: 4, adults: 2, indoor: false, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [36, 34], mark: 'none',
        goals: [[0, 17, 'big', 'e']],
        labels: [[10, 15.5, '10 YD'], [20, 31, '20 YD'], [30, 3, '30 YD']],
        cones: [[10, 9], [10, 13], [20, 25], [20, 28], [30, 5], [30, 8]],
        players: { K: [1.5, 17], A1: [12, 10], A2: [22, 27.5], A3: [32, 6] },
        ball: ['K', 'K', 'K'],
        frames: [
          ['K>A1', '# Roll it to feet'],
          ['K>A2', '# Throw it wide'],
          ['K>A3', '# Kick it long, where your league allows']
        ]
      },
      signals: ['possession'], goesWith: ['build-out-play', 'gk-handling'], tags: ['keeper', 'check-local-rules']
    },

    {
      id: 'gk-angles-1v1', v: 1, name: 'Keeper angles and 1v1s', type: 'keeper',
      summary: 'Starting position on the arc, setting the feet as a shot comes, and closing down a one-on-one.',
      ages: [9, 19], level: 2, players: { min: 2, best: 4, max: 8 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 18], kit: { balls: 10, goals: 1, cones: 6 },
      setupMins: 3, adults: 2, indoor: false, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [44, 22], mark: 'box',
        goals: [[22, 0, 'big', 's']],
        cones: [[7.3, 8.5], [13.5, 14.7], [22, 17], [30.5, 14.7], [36.7, 8.5]],
        players: { K: [22, 1.5], A1: [32, 16], A2: [12, 16] },
        ball: ['A1', 'A2'],
        frames: [
          ['A1~27,10', 'K-23.3,2.6', '# Move along the arc, between ball and goal'],
          ['A1>G', '# Set the feet before the shot'],
          ['A2~17,7', 'K-20,4.2', '# 1v1: close down while it\'s off her foot'],
          ['K*A2', '# Stay big, then smother it']
        ]
      },
      signals: ['conceding', 'shots-against'], goesWith: ['gk-diving', 'turn-and-shoot'], tags: ['keeper']
    },

    {
      id: 'gk-crosses', v: 1, name: 'Keeper crosses and high balls', type: 'keeper',
      summary: 'Starting position for crosses, an early call, and taking the ball at its highest point, or punching it when crowded.',
      ages: [11, 19], level: 2, players: { min: 3, best: 6, max: 10 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 18], kit: { balls: 12, goals: 1, cones: 4 },
      setupMins: 3, adults: 2, indoor: false, groups: ['small'], involvement: 2, competitive: false,
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
      diagram: {
        area: [60, 22], mark: 'box',
        goals: [[30, 0, 'big', 's']],
        players: { K: [31.5, 2], N1: [5, 6], N2: [55, 6], A1: [26, 13], A2: [34, 14] },
        ball: 'N1',
        frames: [
          [
            'N1>30,5.5', 'K-30,5', 'A1-28,8', 'A2-33,9', '# Cross. "Keeper!" Early and loud, then attack it'
          ],
          ['K~30.5,2.6', '# Catch it at the highest point and bring it in']
        ]
      },
      signals: ['corners-against', 'conceding'], goesWith: ['defending-corners'], tags: ['keeper']
    },

    {
      id: 'gk-sweeper-keeper', v: 1, name: 'Sweeper keeper', type: 'keeper',
      summary: 'Starting high, reading the ball played in behind, and getting there first: clear it, or collect it outside the box and play with the feet.',
      ages: [11, 19], level: 3, players: { min: 3, best: 6, max: 8 }, gk: 1, minutes: [10, 15], intensity: 3,
      space: [44, 40], kit: { balls: 12, goals: 1, cones: 6, bibs: 3 },
      setupMins: 2, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['GK'], skills: ['angles', 'distribution', 'communication', 'diving'], principles: ['cover'],
      moments: ['defend', 'toAttack'], physical: ['speed'],
      setup: 'A goal and keeper starting near the edge of her box. Two defenders on halfway, an attacker between them, and a server 40 yd out playing balls in behind.',
      how: [
        'The server plays a ball in behind. The keeper decides: come or stay.',
        'If she comes, she clears it first time or collects it with her feet and passes to a defender.',
        'If she stays, she sets herself and faces the 1v1.',
        'Count good decisions, not only good saves.'
      ],
      points: ['Start high when your team has the ball: 10 to 15 yd off your line.', 'Decide early and call it: "Keeper!" or "Away!"', 'Outside the box you\'re a defender: feet only.'],
      questions: ['What told you to come? What told you to stay?'],
      mistakes: ['Coming halfway and stopping: either go or stay set. Halfway is where goals go in.'],
      why: 'A keeper who covers the space behind her defence lets the team defend further up the pitch. Most balls in behind in youth games are won by whoever decides first.',
      easier: ['No attacker chasing: just the decision and the touch.'],
      harder: ['The attacker starts closer, so it\'s a real race.'],
      safety: 'Into a 1v1 she goes side-on with her hands leading, never head first at a player\'s feet. Outside the box, no diving at feet.',
      diagram: {
        area: [44, 40], mark: 'box', goals: [[22, 0, 'big', 's']],
        players: { K: [22, 14], A1: [14, 26], A2: [30, 26], D1: [21, 29], N1: [22, 39.5] },
        ball: 'N1',
        frames: [
          ['N1>24,15', 'D1-23,19', 'K-24,14.5', '# Ball in behind: decide early. Come!'],
          ['K>A1', '# Feet, not hands: out to a defender']
        ]
      },
      signals: ['conceding', 'shots-against'], goesWith: ['gk-angles-1v1', 'gk-back-pass'], tags: ['keeper']
    },

    {
      id: 'gk-footwork', v: 1, name: 'Keeper footwork', type: 'keeper',
      summary: 'Shuffle across the goal, set your feet, save, then back across the other way. The footwork that gets a keeper there before she needs to dive.',
      ages: [8, 19], level: 1, players: { min: 2, best: 2, max: 4 }, gk: 1, minutes: [8, 12], intensity: 3,
      space: [12, 10], kit: { balls: 8, goals: 1, cones: 4 },
      setupMins: 1, adults: 2, indoor: true, groups: ['pairs'], involvement: 3, competitive: false,
      positions: ['GK'], skills: ['handling', 'angles'], principles: [],
      moments: ['defend'], physical: ['agility', 'speed'],
      setup: 'A goal (or two cones) with a cone just in front of each post, and a server 8 yd out with a pile of balls.',
      how: [
        'The keeper shuffles from one post cone to the other: side-on steps, feet never crossing.',
        'As she reaches the cone, the server shoots or throws to that side. Set, save, return the ball.',
        'Then back across to the other side. Six each way.'
      ],
      points: ['Small side steps, feet never cross, hands up and ready.', 'Set: both feet down, weight forward, before the shot comes.', 'Head still at the moment of the save.'],
      questions: ['Were your feet set when the ball came? How did that save feel different?'],
      mistakes: ['Saving on the move with feet in the air: slow the shuffle so she sets every time.'],
      why: 'Most saves are made by being in the right place and set. Footwork gets the keeper there; the dive is for what footwork can\'t reach.',
      easier: ['Throws at waist height, a slow shuffle.'],
      harder: ['Low shots to the corners.', 'The server picks the side at the last moment.'],
      diagram: {
        area: [12, 10], mark: 'none', goals: [[6, 0, 'big', 's']],
        cones: [[3, 1.4], [9, 1.4]],
        players: { K: [3, 2.2], C: [6, 8.5] },
        ball: ['C', 'C'],
        frames: [
          ['K-8.6,2.2', '# Shuffle across: feet never cross'],
          ['C>K', '# Set, then save'],
          ['K>C', 'K-3.4,2.2', '# Ball back, and across the other way'],
          ['C>K', '# Set, save']
        ]
      },
      signals: ['conceding', 'shots-against'], goesWith: ['gk-handling', 'gk-diving'], tags: ['keeper']
    },

    {
      id: 'gk-reaction-saves', v: 1, name: 'Reaction saves', type: 'keeper',
      summary: 'Close-range shots through a screen of poles, so the keeper sees the ball late and has to react, then parries it wide.',
      ages: [10, 19], level: 2, players: { min: 2, best: 4, max: 6 }, gk: 1, minutes: [8, 12], intensity: 3,
      space: [12, 14], kit: { balls: 12, goals: 1, poles: 3 },
      setupMins: 2, adults: 2, indoor: false, groups: ['small'], involvement: 3, competitive: false,
      positions: ['GK'], skills: ['handling', 'diving'], principles: [],
      moments: ['defend'], physical: ['agility'],
      setup: 'A goal and keeper, three poles in a line 6 yd out, and a shooter 10 yd out behind them.',
      how: [
        'The shooter strikes past or between the poles. The keeper sees it late.',
        'Rapid fire: a second ball straight after the first, to the other side.',
        'Short sets of six, then rest. Quality, not exhaustion.'
      ],
      points: ['Low and on your toes, hands ready.', 'React with the hands first; the feet follow.', 'Parry it wide, never back into the middle.'],
      questions: ['Where did you push the ones you couldn\'t hold?'],
      mistakes: ['Guessing and diving early: wait, then react.'],
      why: 'Shots in a crowded box come late, through legs and off deflections. A keeper who has practised seeing the ball late doesn\'t freeze when it happens.',
      easier: ['No poles, softer shots.'],
      harder: ['Some shots deliberately deflected off a pole.'],
      safety: 'Soft ground and short sets. Stop when the keeper tires and her landings get sloppy.',
      diagram: {
        area: [12, 14], mark: 'none', goals: [[6, 0, 'big', 's']],
        poles: [[4.5, 6], [6, 6], [7.5, 6]],
        players: { K: [6, 1.6], A1: [6, 11] },
        ball: ['A1', 'A1'],
        frames: [
          ['A1>4,1.1', 'K-4.4,1.4', '# Through the screen: she sees it late'],
          ['K>11,3', '# Parry it wide, never into the middle'],
          ['A1>8,1.1', 'K-7.6,1.5', '# Second ball, other side']
        ]
      },
      signals: ['conceding', 'corners-against'], goesWith: ['gk-footwork', 'gk-diving'], tags: ['keeper']
    },

    {
      id: 'gk-back-pass', v: 1, name: 'Keeper on the ball', type: 'keeper',
      summary: 'A back-pass with an attacker chasing it: first touch away from her, then find the free defender, or go long.',
      ages: [9, 19], level: 2, players: { min: 4, best: 6, max: 8 }, gk: 1, minutes: [10, 15], intensity: 2,
      space: [44, 30], kit: { balls: 10, goals: 1, cones: 6, bibs: 3 },
      setupMins: 2, adults: 1, indoor: false, groups: ['small'], involvement: 2, competitive: true,
      positions: ['GK', 'Back'], skills: ['distribution', 'first-touch', 'passing', 'scanning'], principles: ['width', 'support'],
      moments: ['attack'], physical: [],
      setup: 'A goal and keeper, two defenders split wide at the edges of the box, an attacker near the penalty spot, and a passer 25 yd out.',
      how: [
        'The passer plays it back to the keeper. The attacker presses as the ball travels.',
        'The keeper takes her first touch away from the attacker and passes to the defender on the other side.',
        'If both are covered, she goes long to the passer. The attacker scores if she wins it.'
      ],
      points: ['Look before it arrives: where is the attacker coming from?', 'First touch away from her, across your body.', 'Never across the face of your own goal under pressure. Wide, or long.'],
      questions: ['Which side was the attacker showing you?'],
      mistakes: ['Stopping the ball dead as the attacker arrives: touch it away first.'],
      why: 'Back-passes come every game, and keepers can\'t pick them up. A keeper who is calm on the ball keeps possession instead of hoofing it away.',
      easier: ['A passive attacker.'],
      harder: ['Two attackers.', 'One touch for the keeper.'],
      diagram: {
        area: [44, 30], mark: 'box', goals: [[22, 0, 'big', 's']],
        players: { K: [22, 2], A1: [6, 10], A2: [38, 10], D1: [18, 12], A3: [30, 28] },
        ball: 'A3',
        frames: [
          ['A3>K', 'D1-K', '# Back to the keeper; the attacker presses'],
          ['K~25.5,3', '# First touch away from her'],
          ['K>A2', '# Then out to the free side']
        ]
      },
      signals: ['possession'], goesWith: ['build-out-play', 'gk-distribution'], tags: ['keeper']
    },

    {
      id: 'little-keepers', v: 1, name: 'Little keepers', type: 'keeper',
      summary: 'Everyone has a turn in goal: the ready position, scooping a rolled ball and the W catch, in pairs from close in.',
      ages: [6, 10], level: 1, players: { min: 2, best: 10, max: 16 }, gk: 1, minutes: [8, 12], intensity: 1,
      space: [15, 12], kit: { balls: 8, cones: 16 },
      setupMins: 2, adults: 1, indoor: true, groups: ['pairs'], involvement: 2, competitive: false,
      positions: ALL, skills: ['handling', 'distribution'], principles: [],
      moments: ['defend'], physical: ['coordination', 'agility'],
      setup: 'Pairs with a ball, about 5 yd apart. One is the keeper, standing in a goal of two cones; the other serves with her hands.',
      how: [
        'Ready position first, all together on the coach\'s "Ready!": feet apart, knees bent, hands up and out like a goalie.',
        'The server rolls the ball. The keeper bends her knees, scoops it up, and hugs it to her chest.',
        'Then underarm throws at the tummy and the chest: catch it with the hands making a W behind the ball.',
        'The keeper rolls the ball back along the ground. Five of each, then swap.'
      ],
      points: [
        'Watch the ball all the way into your hands.',
        'Hug it like a teddy: hands first, then chest.',
        'Get your body behind the ball, so if your hands miss, your body stops it.'
      ],
      questions: ['What is behind your hands when you catch it?'],
      mistakes: [
        'Straight arms and a face turned away: serve softer and closer until she trusts it.',
        'Diving for fun: not yet. Stay on your feet and move to the ball.'
      ],
      why: 'Every under-ten ends up in goal sooner or later, often on a Saturday with no warning. Ten minutes of catching turns that into a turn she enjoys instead of one she dreads.',
      easier: ['A bigger, softer ball, from two steps away.'],
      harder: [
        'Serve a little to one side, so the keeper shuffles across before the catch.',
        'Finish with shots from 6 yd: the server shoots, the keeper saves.'
      ],
      diagram: {
        area: [14, 10], mark: 'none',
        cones: [[2, 1], [6, 1], [8, 1], [12, 1]],
        players: { K1: [4, 2], A1: [4, 8], K2: [10, 2], A2: [10, 8] },
        ball: ['A1', 'A2'],
        frames: [
          ['A1>K1', 'A2>K2', '# Rolled: scoop it up, hug it in'],
          ['K1>A1', 'K2>A2', '# Roll it back along the ground'],
          ['A1>K1', 'A2>K2', '# Thrown: a W catch, eyes on the ball']
        ]
      },
      signals: ['conceding'], goesWith: ['gk-handling', 'goal-frenzy'], tags: ['keeper', 'young']
    },

    {
      id: 'gk-organising', v: 1, name: 'The keeper\'s voice', type: 'keeper',
      summary: 'Attacks on a keeper and her back line, where the keeper has to talk the whole time, in three kinds of call: who, where and the ball.',
      ages: [11, 19], level: 2, players: { min: 6, best: 9, max: 12 }, gk: 1, minutes: [12, 15], intensity: 2,
      space: [44, 30], kit: { balls: 10, goals: 1, cones: 6, bibs: 6 },
      setupMins: 4, adults: 1, indoor: false, groups: ['teams'], involvement: 2, competitive: true,
      positions: ['GK', 'Back'], skills: ['communication', 'angles', 'handling'], principles: ['cover', 'balance', 'compactness'],
      moments: ['defend'], physical: [],
      setup: 'A keeper and three or four defenders against four attackers, in the box and the area in front of it, 44 × 30 yd. The attackers start each go with the ball at the top.',
      how: [
        'The attackers build and shoot. The keeper\'s side gets a point for a save, or for a clearance past the far line.',
        'The keeper talks all the time, and only in three kinds of call: who ("Sam, press!"), where ("Drop!", "Squeeze!", "Left shoulder!") and the ball ("Keeper\'s!", "Away!").',
        'Every few attacks, freeze play: the keeper says what she saw and what she asked for.'
      ],
      points: [
        'Early, loud and short. A call after the shot is a comment.',
        'Name the player, then the job.',
        'Set your own position every time the ball moves, then talk.'
      ],
      questions: ['Which call did your defenders act on fastest?', 'Defenders: what did you need to hear that you didn\'t?'],
      mistakes: [
        'A keeper shouting "Yeah!" and "Go on!": ask her for a who, a where or a ball.',
        'Defenders ignoring the keeper: if they can\'t hear her, they can\'t act. Ask her to be louder.'
      ],
      why: 'The keeper is the only player who sees the whole game in front of her. A quiet keeper wastes that, and a lot of youth goals come from two defenders picking up the same attacker and leaving another.',
      easier: ['Nobody attacks: the coach moves a ball round the box and the keeper positions her defenders.'],
      harder: ['Only the keeper may talk.', 'A fifth attacker.'],
      diagram: {
        area: [44, 30], mark: 'box',
        goals: [[22, 0, 'big', 's']],
        players: {
          K: [22, 2], D1: [15, 12], D2: [22, 11], D3: [29, 12],
          A1: [22, 26], A2: [10, 20], A3: [34, 20], A4: [25, 18]
        },
        ball: 'A1',
        frames: [
          ['A1>A2', 'D1-13,14', 'D2-19,12', 'D3-26,11', 'K-20.5,2.5', '# The ball moves; the keeper moves her line'],
          ['A2~14,16', 'D1-A2', 'A4-20,11', 'D2-A4', '# "Press her!" "Pick up the runner!"'],
          ['A2>K', '# The shot: "Keeper\'s!", and she takes it']
        ]
      },
      signals: ['conceding', 'shots-against'], goesWith: ['gk-angles-1v1', 'back-line-shift'], tags: ['keeper', 'defending']
    },

    /* ---------------- cool-down ---------------- */

    {
      id: 'cooldown-passing-stretch', v: 1, name: 'Easy passing and stretches', type: 'cooldown',
      summary: 'Pairs pass gently while the coach calls a stretch every minute: the heart rate comes down and the touches keep going.',
      ages: [8, 19], level: 1, players: { min: 2, best: 12, max: 30 }, gk: 0, minutes: [5, 10], intensity: 1,
      space: [16, 8], kit: { balls: 6 },
      setupMins: 0, adults: 1, indoor: true, groups: ['pairs'], involvement: 2, competitive: false,
      positions: ALL, skills: ['passing', 'first-touch'], principles: [],
      moments: ['attack'], physical: ['balance'],
      setup: 'Pairs 5 yd apart, one ball per pair.',
      how: [
        'Gentle passing, both feet, walking pace.',
        'Every minute the coach calls a stretch: both hold it for 20 seconds, then pass again.',
        'Hamstrings, quads, calves, hip flexors, groin.'
      ],
      points: ['Slow and smooth. Nobody is trying to win this.', 'Hold stretches still, no bouncing.'],
      questions: ['What was the best thing you did today?'],
      mistakes: ['Rushing the stretches to get back to the ball: hold for the count.'],
      why: 'A cool-down with a ball in it is one young players actually do. It brings the session down calmly and ends it on a good touch.',
      easier: ['Pass with hands for the youngest, then feet.'],
      harder: ['Weaker foot only, one touch.'],
      diagram: {
        area: [16, 8], mark: 'none',
        players: { A1: [3, 1.5], A2: [3, 6.5], A3: [8, 1.5], A4: [8, 6.5], A5: [13, 1.5], A6: [13, 6.5] },
        ball: ['A1', 'A3', 'A5'],
        frames: [
          ['A1>A2', 'A3>A4', 'A5>A6', '# Gentle passing, both feet'],
          ['A2>A1', 'A4>A3', 'A6>A5', '# Every minute, a stretch: hold it for 20']
        ]
      },
      signals: [], goesWith: ['cooldown-reflect'], tags: ['every-session', 'no-prep']
    },

    {
      id: 'show-me-a-move', v: 1, name: 'Show me a move', type: 'cooldown',
      summary: 'In a circle, each player shows a move she worked on today and says its name. Everyone copies it once, slowly.',
      ages: [5, 14], level: 1, players: { min: 4, best: 12, max: 20 }, gk: 0, minutes: [5, 8], intensity: 1,
      space: [15, 15], kit: { balls: 'each' },
      setupMins: 0, adults: 1, indoor: true, groups: ['squad'], involvement: 1, competitive: false,
      positions: ALL, skills: ['ball-mastery', 'communication'], principles: ['creativity'],
      moments: ['attack'], physical: ['coordination'],
      setup: 'A circle, a ball each.',
      how: [
        'One at a time, a player steps into the middle, shows a move, and names it.',
        'Everyone copies it once, slowly.',
        'The coach says one thing each player did well today as she steps back.'
      ],
      points: ['Slow is fine. Getting it right is the point.', 'Praise effort and bravery, not just the best move.'],
      questions: ['Where in a game could you use your move?'],
      mistakes: ['The same two confident players every time: go round the circle.'],
      why: 'Saying a move\'s name out loud and showing it fixes it in the memory. Ending the session with every player in the spotlight for a moment is good for the group.',
      easier: ['Pairs show a move together.'],
      harder: ['Show the move against a passive defender.'],
      diagram: {
        area: [16, 16], mark: 'none',
        players: { A1: [8, 2.5], A2: [12.6, 4.4], A3: [14.2, 8.8], A4: [12.4, 13], A5: [8, 14.6], A6: [3.6, 13], A7: [1.8, 8.8], A8: [3.4, 4.4] },
        ball: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
        frames: [
          ['A1~8,7.5', '# One steps in, shows her move and names it'],
          ['A1~9.5,8.5', 'A2~11.6,5', 'A3~13.4,9.6', 'A4~11.6,12.4', 'A5~8.8,13.8', 'A6~4.2,12.2', 'A7~2.6,8.2', 'A8~4.2,5', '# Everyone copies it, slowly'],
          ['A1~8,2.5', '# Back to the circle: one thing she did well']
        ]
      },
      signals: [], goesWith: ['cooldown-reflect', 'move-combinations'], tags: ['young', 'fun']
    },

    {
      id: 'cooldown-reflect', v: 1, name: 'Cool-down and three questions', type: 'cooldown',
      summary: 'A light jog, a few stretches, then a circle where players say what they learned. Short, and every session.',
      ages: [5, 19], level: 1, players: { min: 1, best: 14, max: 30 }, gk: 0, minutes: [5, 10], intensity: 1,
      space: [20, 20], kit: {},
      setupMins: 0, adults: 1, indoor: true, groups: ['squad'], involvement: 1, competitive: false,
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
      diagram: {
        area: [16, 12], mark: 'none',
        labels: [[8, 5.6, 'WHAT DID WE WORK ON?'], [8, 7.2, 'WHEN WILL YOU USE IT?'], [8, 8.8, 'WHO DID WELL?']],
        players: { 
          C: [8, 1.4], A1: [11.9, 2.2], A2: [14, 4.6], A3: [14.3, 7.6], A4: [12.4, 10.2], A5: [9.4, 11.2],
          A6: [6.6, 11.2], A7: [3.6, 10.2], A8: [1.7, 7.6], A9: [2, 4.6], A10: [4.1, 2.2]
         }
      },
      signals: [], goesWith: [], tags: ['every-session', 'no-prep']
    },

    {
      id: 'animal-cool-down', v: 1, name: 'Animal cool-down', type: 'cooldown',
      summary: 'Slow, wobbly animal shapes for the youngest: flamingo, giraffe, cat, frog and snake, then sit down and say what was fun.',
      ages: [4, 9], level: 1, players: { min: 1, best: 10, max: 24 }, gk: 0, minutes: [5, 8], intensity: 1,
      space: [15, 15], kit: {},
      setupMins: 0, adults: 1, indoor: true, groups: ['squad'], involvement: 3, competitive: false,
      positions: ALL, skills: [], principles: [],
      moments: [], physical: ['balance', 'coordination'],
      setup: 'Anywhere, everyone in a loose circle round the coach.',
      how: [
        'The coach calls an animal and everyone moves like it, slowly, for 20 seconds: a flamingo (stand on one leg), a giraffe (on tiptoes, reach up high), a cat (on all fours, arch your back), a frog (squat down low), a snake (on your tummy, push your chest up).',
        'Hold the last shape of each one and breathe out slowly while the coach counts to ten.',
        'Finish sitting down: "Which animal was your favourite?", then one thing they enjoyed today.'
      ],
      points: ['Slow is the rule. Wobbly is fine; nobody bounces.', 'Breathe out as you stretch.'],
      questions: ['Which animal was hardest to balance as?', 'What was the best thing you did today?'],
      mistakes: ['Racing round as a cheetah: keep the animals slow ones.'],
      why: 'It calms a group of five-year-olds before the parents arrive, and standing on one leg is a balance they use every time they kick a ball.',
      easier: ['Everyone copies the coach doing each one.'],
      harder: ['A player picks the next animal and shows it.', 'Flamingo with eyes closed.'],
      diagram: {
        area: [14, 12], mark: 'none',
        players: {
          C: [7, 6], A1: [11.5, 6], A2: [10.2, 9.2], A3: [7, 10.5], A4: [3.8, 9.2],
          A5: [2.5, 6], A6: [3.8, 2.8], A7: [7, 1.5], A8: [10.2, 2.8]
        },
        frames: [
          [
            'A1-11.2,7.7', 'A2-8.7,10.2', 'A3-5.3,10.2', 'A4-2.8,7.7',
            'A5-2.8,4.3', 'A6-5.3,1.8', 'A7-8.7,1.8', 'A8-11.2,4.3',
            '# Move slowly, like the animal called'
          ],
          [
            'A1-9.8,7.2', 'A2-8.2,8.8', 'A3-5.8,8.8', 'A4-4.2,7.2',
            'A5-4.2,4.8', 'A6-5.8,3.2', 'A7-8.2,3.2', 'A8-9.8,4.8',
            '# Sit down: which was your favourite?'
          ]
        ]
      },
      signals: [], goesWith: ['cooldown-reflect'], tags: ['young', 'every-session', 'no-prep']
    },

    {
      id: 'crossbar-challenge', v: 1, name: 'Crossbar challenge', type: 'cooldown',
      summary: 'One at a time from the edge of the box, try to hit the crossbar. A calm, competitive way to finish.',
      ages: [9, 19], level: 2, players: { min: 2, best: 10, max: 20 }, gk: 0, minutes: [5, 10], intensity: 1,
      space: [44, 20], kit: { balls: 10, goals: 1, cones: 1 },
      setupMins: 1, adults: 1, indoor: false, groups: ['solo'], involvement: 1, competitive: true,
      positions: ALL, skills: ['long-passing', 'shooting'], principles: [],
      moments: ['attack'], physical: [],
      setup: 'One big goal, a cone 18 yd out on the edge of the box, and the balls beside it. Everyone in a line behind the cone.',
      how: [
        'One at a time, from the cone, try to hit the crossbar. The bar is three points, a post one.',
        'Fetch your ball while the next player goes, and join the back of the line.',
        'Three rounds. The winner picks the warm-up next time.'
      ],
      points: [
        'Lean back a little and strike under the middle of the ball for height.',
        'Lock the ankle and follow through towards the bar.',
        'Two steps of run-up and take your time: it\'s the end of practice.'
      ],
      questions: ['What did you change after one went over the bar?'],
      mistakes: [
        'A long run-up at full pace: it\'s a cool-down. Two steps.',
        'Players waiting in the goal mouth: everyone stays behind the shooter until it\'s their turn to fetch.'
      ],
      why: 'A finish players talk about on the way home, and a few minutes of the lofted strike that crosses and long passes need, at no cost to anyone\'s legs.',
      easier: ['From 12 yd, and anywhere on the frame counts.'],
      harder: ['Weaker foot only.', 'Off a moving ball: roll it forward and strike.'],
      diagram: {
        area: [44, 22], mark: 'box',
        cones: [[22, 18]],
        goals: [[22, 0, 'big', 's']],
        players: { A1: [22, 19], A2: [20, 21], A3: [24, 21.5] },
        ball: ['A1', 'A2'],
        frames: [
          ['A1>G', '# From the cone: aim for the crossbar'],
          ['A1-22,3', 'A2~22,18.5', '# Fetch yours; the next one steps up'],
          ['A2>G', '# The bar is three points, a post one']
        ]
      },
      signals: [], goesWith: ['chip-and-lob', 'cooldown-reflect'], tags: ['fun', 'finishing']
    }
  ];

  /* What each position is for.

     The app's five roles (GK, Back, Mid, Wing, Forward) are what a player
     profile and a shape slot use, and they're too coarse to explain a job: a
     centre back and a full-back are both "Back" and do different things. So
     the guide goes one level finer. Each entry says which of the app's roles
     it falls under (`roles`: a wide midfielder is Mid in some shapes and Wing
     in others) and which shape slots usually play it (`slots`, the labels in
     app.js's formations), so a player's best position, a slot on the pitch and
     a guide entry all line up.

     Each entry answers what a coach is asked at the side of the pitch: what do
     I do when we have it, when they have it, the second we win it, the second
     we lose it. Then the skills it needs, the drills that teach it, a line for
     coaches of under-tens (who shouldn't be fixing anyone in one position
     yet), and a diagram of where she plays and how she moves.

     Numbers are the traditional shirt numbers, because coaches still say
     "the six" and "a nine". They're a name, not a rule. */
  const ROLE_GUIDE = [
    {
      id: 'goalkeeper', name: 'Goalkeeper', number: '1', roles: ['GK'], slots: ['GK'],
      aka: ['Keeper', 'Goalie'],
      oneLine: 'The last defender and the first attacker: stop shots, organise the defence, and start attacks.',
      withBall: [
        'Start the attack quickly: roll or throw to a free player before the other team is set.',
        'Be the extra player when the team builds from the back. Show for a back-pass on the side away from the attacker.',
        'Go long only when everything short is covered.'
      ],
      withoutBall: [
        'Stand on the line between the ball and the middle of the goal, set before every shot.',
        'Talk constantly: who marks whom, "Step!", "Hold!", "Keeper!"',
        'When the team is pushed up, start high and sweep up balls played in behind.'
      ],
      whenWeWin: 'Look for the quick throw or roll to a teammate in space. A counter starts with her.',
      whenWeLose: 'Get back to a good position and set; organise the nearest defenders out loud.',
      keySkills: ['handling', 'diving', 'angles', 'distribution', 'communication'],
      drills: ['gk-handling', 'gk-footwork', 'gk-diving', 'gk-angles-1v1', 'gk-crosses', 'gk-distribution', 'gk-back-pass', 'gk-sweeper-keeper', 'gk-reaction-saves'],
      young: 'Under 10, rotate the keeper. Everyone should try it, and everyone should also play out of goal; a child kept in goal all season learns less football.',
      diagram: {
        area: [60, 30], mark: 'box', goals: [[30, 0, 'big', 's']],
        players: { K: [30, 1.5], A1: [8, 14], A2: [52, 14], A3: [24, 12], A4: [36, 12], D1: [34, 21] },
        ball: 'D1',
        frames: [
          ['D1>29.4,1.2', 'K-29.6,1.7', '# Set, and hold the shot'],
          ['A2-54,16', 'K>A2', '# Then start the attack: roll it to a free player']
        ]
      }
    },
    {
      id: 'centre-back', name: 'Centre back', number: '4, 5', roles: ['Back'], slots: ['CB', 'LCB', 'RCB'],
      aka: ['Centre half', 'Central defender'],
      oneLine: 'Protect the middle of the pitch in front of goal, win the ball in the air and on the ground, and start attacks with a good first pass.',
      withBall: [
        'Split wide when the keeper has it, so the team has room to build.',
        'Pass forward into midfield when it\'s on; switch to the other centre back or full-back when it isn\'t.',
        'Step into midfield with the ball when nobody presses you.'
      ],
      withoutBall: [
        'Work in a pair: one attacks the ball, the other covers behind and inside.',
        'Keep the back line together: step up as one when the ball goes back, drop as one when it comes forward.',
        'Stay goal-side of the striker and see her and the ball at once.'
      ],
      whenWeWin: 'The first pass forward or wide, quickly, before the other team recovers its shape.',
      whenWeLose: 'Drop and protect the middle. Delay the attacker until help arrives; don\'t dive in.',
      keySkills: ['1v1-defend', 'communication', 'heading', 'passing', 'long-passing', 'shape'],
      drills: ['centre-back-partnership', 'back-line-shift', '2v2-pressure-cover', 'jockey-channel', 'numbers-down-defending', 'build-out-play', 'driven-passes'],
      young: 'For under-tens there\'s no back line to hold, just "stay between the ball and our goal". Rotate who does it.',
      diagram: {
        area: [60, 44], mark: 'half', goals: [[30, 0, 'big', 's']],
        zones: [[16, 6, 28, 14, 'HER ZONE']],
        players: { K: [30, 1.5], A1: [24, 14], A2: [36, 14], A3: [30, 30], D1: [26, 26], D2: [40, 37] },
        ball: 'D2',
        frames: [
          ['D2>D1', 'A1-D1', 'A2-31,12', '# One steps to the striker; her partner covers'],
          ['A1*D1', '# Win it'],
          ['A3-34,30', 'A1>A3', '# Then the first pass forward']
        ]
      }
    },
    {
      id: 'full-back', name: 'Full-back', number: '2, 3', roles: ['Back', 'Wing'], slots: ['LB', 'RB', 'LWB', 'RWB'],
      aka: ['Left back', 'Right back', 'Wing-back'],
      oneLine: 'Defend the wing against the other team\'s winger, then join the attack down the same wing.',
      withBall: [
        'Give width: stay near the touchline so the pitch is big.',
        'Overlap or underlap your winger to make two against one.',
        'Cross early when you get there; switch play back through the centre backs when the wing is blocked.'
      ],
      withoutBall: [
        'Show the winger down the line, onto her weaker foot, and stay on your feet.',
        'Tuck in towards the centre backs when the ball is on the far side.',
        'Track her runs in behind; don\'t ball-watch.'
      ],
      whenWeWin: 'Go. The winger you were marking is now behind you; the space down the wing is yours.',
      whenWeLose: 'Sprint back to your side of the back line first, then defend.',
      keySkills: ['1v1-defend', 'crossing', 'combination', 'movement', 'passing'],
      drills: ['full-back-job', 'jockey-channel', 'overlap-2v1-wide', 'recovery-runs', 'back-line-shift', 'crossing-and-finishing'],
      young: 'Under 10, teach it as "defend your side, then help attack your side". The overlap can wait.',
      diagram: {
        area: [60, 44], mark: 'half', goals: [[30, 0, 'big', 's']],
        zones: [[0, 6, 16, 38, 'HER WING']],
        players: { K: [30, 1.5], A1: [10, 14], A3: [18, 28], D1: [8, 36], A2: [24, 12] },
        ball: 'D1',
        frames: [
          ['D1~9,24', 'A1-9,19', '# Defend the wing 1v1'],
          ['A1*D1', '# Win it'],
          ['A1>A3', 'A1-3,36', '# Then up the line, and overlap'],
          ['A3>A1', '# Now she attacks the same wing']
        ]
      }
    },
    {
      id: 'holding-midfielder', name: 'Holding midfielder', number: '6', roles: ['Mid'], slots: ['CM'],
      aka: ['The six', 'Defensive midfielder', 'Pivot', 'Anchor'],
      oneLine: 'Sit in front of the back line: block the passes through the middle, and be the first pass when the team has the ball.',
      withBall: [
        'Show for the ball from the centre backs, side-on so you can see both ways.',
        'Keep it moving: one or two touches, then switch the play or find a forward pass.',
        'Stay behind the ball. Others go forward because you don\'t.'
      ],
      withoutBall: [
        'Stand in the passing lane into their attacking midfielder and strikers.',
        'Hold the middle. Don\'t get dragged out wide.',
        'Drop into the back line if a defender has been pulled out.'
      ],
      whenWeWin: 'Make yourself the first option, and play it simple and quick.',
      whenWeLose: 'Stop the counter: delay the player on the ball and cover the middle.',
      keySkills: ['scanning', 'passing', 'long-passing', 'pressing', 'communication', 'shape'],
      drills: ['holding-midfielder-screen', 'rondo-pivot', 'rondo-5v2', 'two-banks', 'shoulder-check-colours', 'five-second-press'],
      young: 'Before 11v11 it\'s simply "someone stays in the middle behind the ball". Give the job to a different player each half.',
      diagram: {
        area: [60, 44], mark: 'half', goals: [[30, 0, 'big', 's']],
        zones: [[18, 15, 24, 12, 'SCREEN']],
        players: { K: [30, 1.5], A2: [24, 10], A3: [36, 10], A1: [30, 21], A4: [54, 30], D1: [26, 31], D2: [42, 37] },
        ball: 'D2',
        frames: [
          ['D2>29.2,23.4', 'A1-29.4,22.6', '# Screen: cut out the pass through the middle'],
          ['A1>A3', 'A1-32,19', '# Win it; give it simple…'],
          ['A3>A1', '# …and show again, side-on'],
          ['A1>A4', '# Then switch the play']
        ]
      }
    },
    {
      id: 'central-midfielder', name: 'Central midfielder', number: '8', roles: ['Mid'], slots: ['CM', 'LCM', 'RCM'],
      aka: ['Box-to-box midfielder', 'The eight'],
      oneLine: 'The link between defence and attack: get on the ball, move it on, and arrive in both boxes.',
      withBall: [
        'Find space between their players to receive from the back.',
        'Play forward and follow the pass: a one-two, or a run beyond the striker.',
        'Arrive late in the box for cut-backs and rebounds.'
      ],
      withoutBall: [
        'Press the opposition midfielder on the ball; cover the one who isn\'t.',
        'Keep the midfield compact with the six: no big gap between you.',
        'Get back behind the ball when an attack breaks down.'
      ],
      whenWeWin: 'Be available straight away, then look forward.',
      whenWeLose: 'Press the ball for five seconds, or get back into shape. Never stand and watch.',
      keySkills: ['passing', 'movement', 'scanning', 'combination', 'pressing', 'decision-making'],
      drills: ['midfield-triangle-rotation', 'passing-diamond', 'y-passing-pattern', 'keep-away-4v4-plus-2', 'five-second-press', 'open-up-and-turn'],
      young: 'This is the position that teaches the most football. Rotate everyone through it.',
      diagram: {
        area: [90, 56], mark: 'pitch', goals: [[0, 28, 'big', 'e'], [90, 28, 'big', 'w']],
        zones: [[24, 12, 42, 32, 'BOX TO BOX']],
        players: { K1: [2, 28], A1: [14, 22], A2: [14, 34], A3: [36, 28], A4: [58, 16], A5: [64, 34], K2: [88, 28], D1: [72, 26], D2: [50, 30] },
        ball: 'A1',
        frames: [
          ['A1>A3', '# Get on the ball from the back'],
          ['A3>A4', 'A3-66,26', '# Play it forward, and follow it'],
          ['A4>A3', '# Arrive in the box…'],
          ['A3>G2', '# …and finish']
        ]
      }
    },
    {
      id: 'attacking-midfielder', name: 'Attacking midfielder', number: '10', roles: ['Mid'], slots: ['CM'],
      aka: ['The ten', 'Playmaker', 'Number ten'],
      oneLine: 'Play in the space between the other team\'s midfield and defence, turn, and make the final pass or the shot.',
      withBall: [
        'Find the pocket between their lines, half-turned, before the ball comes.',
        'Turn and play the striker in, or shoot from the edge of the box.',
        'Combine quickly with the striker and the wingers: one-twos, lay-offs.'
      ],
      withoutBall: [
        'Press their holding midfielder so she can\'t turn.',
        'Block the pass into their six from their centre backs.'
      ],
      whenWeWin: 'Get into the pocket fast, while their lines are still apart.',
      whenWeLose: 'Press straight away; you\'re usually the nearest player.',
      keySkills: ['scanning', 'turning', 'first-touch', 'passing', 'shooting', 'decision-making'],
      drills: ['between-the-lines', 'open-up-and-turn', 'middle-man-under-pressure', 'shoulder-check-colours', 'lay-off-and-shoot', 'end-zone-game'],
      young: 'Every young player should get turns at this job. It\'s where ball-confident players learn to look up.',
      diagram: {
        area: [90, 56], mark: 'pitch', goals: [[0, 28, 'big', 'e'], [90, 28, 'big', 'w']],
        zones: [[54, 16, 16, 24, 'THE POCKET']],
        players: { A3: [40, 30], A6: [56, 30], A9: [72, 22], K2: [88, 28], D1: [50, 22], D2: [50, 36], D3: [74, 28], D4: [74, 38] },
        ball: 'A3',
        frames: [
          ['A6-61,28', 'A3>A6', '# Find the pocket between their lines'],
          ['A6~64,27', 'A9-80,17', '# Turn; the striker runs in behind'],
          ['A6>A9', '# The final pass'],
          ['A9>G', '# Finish']
        ]
      }
    },
    {
      id: 'wide-midfielder', name: 'Wide midfielder', number: '7, 11', roles: ['Mid', 'Wing'], slots: ['LM', 'RM'],
      aka: ['Left mid', 'Right mid', 'Wide mid'],
      oneLine: 'Work the whole touchline: width in attack, and a second defender for the full-back in defence.',
      withBall: [
        'Stay wide to stretch them; come inside only when the full-back overlaps.',
        'Get crosses in, or link with the central players.',
        'Arrive at the far post when the ball is on the other wing.'
      ],
      withoutBall: [
        'Track the opposition full-back; help your own full-back 2v1 against their winger.',
        'Tuck in when the ball is on the far side to keep the midfield compact.'
      ],
      whenWeWin: 'Get wide and forward fast: you\'re the outlet.',
      whenWeLose: 'Sprint back down your wing. Your full-back is outnumbered until you arrive.',
      keySkills: ['crossing', 'dribbling', 'movement', 'pressing', 'shape'],
      drills: ['stay-in-your-zone', 'wide-channel-game', 'overlap-2v1-wide', 'recovery-runs', 'crossing-and-finishing', 'four-goal-game'],
      young: 'Under 10, teach "stay wide" as a gift to your team: it makes the pitch big. The defending half comes later.',
      diagram: {
        area: [90, 56], mark: 'pitch', goals: [[0, 28, 'big', 'e'], [90, 28, 'big', 'w']],
        zones: [[20, 44, 60, 12, 'HER TOUCHLINE']],
        players: { A1: [16, 34], A7: [44, 50], A9: [70, 26], K2: [88, 28], D1: [62, 46] },
        ball: 'A1',
        frames: [
          ['A1>A7', '# Wide, to stretch them'],
          ['A7~70,51', 'D1-A7', 'A9-80,30', '# Down the touchline'],
          ['A7>A9', '# Cross'],
          ['A7-40,48', '# Then back down the wing to help defend']
        ]
      }
    },
    {
      id: 'winger', name: 'Winger', number: '7, 11', roles: ['Wing'], slots: ['LW', 'RW', 'LM', 'RM'],
      aka: ['Wide forward', 'Left wing', 'Right wing'],
      oneLine: 'Beat the full-back 1v1, create chances from the wing, and get back when the ball is lost.',
      withBall: [
        'Receive high and wide, with space to run at the full-back.',
        'Go outside her to cross, or inside her to shoot or combine.',
        'Attack the back post when the ball is on the other wing.'
      ],
      withoutBall: [
        'Press their full-back when she receives; cut off the pass back inside.',
        'Track her forward runs. Your full-back can\'t defend two players.'
      ],
      whenWeWin: 'Get wide and high immediately: a counter usually goes down a wing.',
      whenWeLose: 'Press the ball if you\'re nearest; otherwise sprint back into the midfield line.',
      keySkills: ['1v1-attack', 'dribbling', 'crossing', 'shooting', 'pressing'],
      drills: ['winger-job', '1v1-moves', 'move-combinations', 'overlap-2v1-wide', 'crossing-and-finishing', 'wide-channel-game'],
      young: 'Encourage every young player to take people on. The best wingers were the kids who were never told to pass it.',
      diagram: {
        area: [60, 44], mark: 'half', goals: [[30, 0, 'big', 's']],
        zones: [[44, 6, 16, 32, 'HER WING']],
        players: { K: [30, 1.5], A1: [52, 32], A2: [36, 36], A3: [28, 20], D1: [50, 20], D2: [28, 12] },
        ball: 'A2',
        frames: [
          ['A2>A1', '# Wide and high: ball to her feet'],
          ['A1~56,10', 'D1-A1', '# Beat the full-back on the outside…'],
          ['A3-33,7', 'A1>A3', '# …and cross'],
          ['A3>G', '# Finish']
        ]
      }
    },
    {
      id: 'striker', name: 'Striker', number: '9', roles: ['Forward'], slots: ['ST', 'LS', 'RS'],
      aka: ['Centre forward', 'The nine'],
      oneLine: 'Score goals, stretch the defence with runs in behind, hold the ball up for the team, and be the first defender.',
      withBall: [
        'Move to lose your marker: check short, spin in behind, drift into the channel.',
        'Hold it up with your back to goal so teammates can arrive.',
        'In the box, attack the near post, far post or cut-back spot. Shoot when you can.'
      ],
      withoutBall: [
        'Press their centre backs on the trigger; curve your run to send the ball one way.',
        'Block the pass into their holding midfielder.'
      ],
      whenWeWin: 'Run in behind straight away: the defence is turned and disorganised.',
      whenWeLose: 'Press the ball for five seconds. You\'re the first defender.',
      keySkills: ['shooting', 'movement', 'shielding', 'first-touch', 'pressing'],
      drills: ['striker-movement', 'hold-up-and-lay-off', 'turn-and-shoot', 'pressing-from-the-front', 'finishing-circuit', 'lay-off-and-shoot', 'volleys'],
      young: 'Don\'t leave the fastest player up front all season. Rotate who scores, and the team learns that everyone can.',
      diagram: {
        area: [60, 34], mark: 'box', goals: [[30, 0, 'big', 's']],
        zones: [[16, 4, 28, 20, 'HER SPACE']],
        players: { K: [30, 1.5], D1: [24, 15], D2: [36, 15], A1: [32, 18], A2: [28, 32] },
        ball: 'A2',
        frames: [
          ['A1-33,24', 'D2-A1', '# Check short: drag a defender with you'],
          ['A1-27,8', 'D2-31,14', 'A2>A1', '# Spin in behind as the passer looks down'],
          ['A1>G', '# Finish']
        ]
      }
    }
  ];

  const LIB = { version: 4, TYPES, MOMENTS, SKILLS, PRINCIPLES, PHYSICAL, KIT, LEVELS, INTENSITY, GROUPS, INVOLVEMENT, POSITIONS: ALL, SIGNALS, DRILLS, ROLE_GUIDE };
  if (typeof module !== 'undefined' && module.exports) module.exports = LIB;
  else root.SOCCER_DRILLS = LIB;
})(typeof window !== 'undefined' ? window : globalThis);
