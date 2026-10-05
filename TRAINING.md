# Training design

Written before code, for the reason `AUTH.md` gives: the data model and the
rules have to be right first. Training adds the first new root node since
invites. It's also the first data here that belongs to a *person* rather than to
a club, so a mistake would be expensive to undo.

Built so far (see *Build order*): the built-in drill library (`drills.js`, 141
drills, each with an animated diagram, and a guide to what each of nine
positions is for), the renderer that draws those diagrams
(`drill-diagram.js`), the Practice tab that shows them, a team's age,
practice plans with their rules, and the other two shelves: a coach's own
drills (Mine) and the club's (Club), with their rules, plans hanging off
the calendar's practices, templates on both shelves, *what needs work* on
Season, the AI steps (step 8: the library in the prompt, the answer pasted
back, the last practices as context) and drills in the bulk import (step 9).
Every step of the build order is built. What is left is the one open decision
at the end, and the *drills a player has done* screen (`ROADMAP.md`).

---

## What a coach is trying to do

Plan Tuesday's practice in five minutes on the sofa. Run it at a field with no
signal and a phone in one hand. Next week, do the good bits again without
retyping them. Eventually, find out whether the finishing work moved Saturday's
shots on target.

The app already knows a lot about the last of those: shots and whether they
were on target, goals with scorer, assist and minute, corners, fouls,
throw-ins, possession where it's tracked, and minutes by position. Training is
the half of the week where that knowledge is used.

## Three shelves

| Shelf | Whose | Lives in | Who reads it | Who changes it |
| --- | --- | --- | --- | --- |
| **Built-in** | Everyone's | `drills.js`, shipped with the app | Coaches and admins, in the app | Nobody in the app. A new version of the file |
| **Club** | The club's | `training/{code}/drills` | Admins and coaches. Never trackers, never parents | Admins; any coach for what she shared |
| **Mine** | One coach's, across every club | `userLibrary/{uid}/drills` | Only her, and the app owner. Never a club admin | Only her |

**Drills are a club's and a coach's own work, so parents never see them**
(settled 2026-10-02). That isn't only a matter of hiding a tab: a parent's
phone reads the whole workspace, so club drills can't live there, and the
rules have to refuse a parent outright (*Rules sketch*). The Practice tab is
drawn for coaches and admins only. A parent gets *Next practice: Tuesday
5:30, Lakeside* on the team's page and nothing more.

**Built-in costs nothing to run.** It's a script tag, like `firebase-config.js`.
No database read, no rule, nothing to migrate, and it works from `file://` at a
field with no signal. That's why it could be written before anything else. It
isn't a secret, since it ships in the app's public files, but it isn't the
club's work either. The app still only draws it for coaches and admins, because
the Practice tab is theirs.

**Mine is keyed by account, not by club, and it's private.** `AUTH.md`'s coach
with a daughter at another club is also a coach whose drills should follow her
if she moves clubs. A personal library inside `workspaces/{code}` would be the
club's the day she left. At the root, beside `userOrgs/{uid}`, it's hers. The
rules let one other account read it, the app owner, for support, and nobody
in any club: not another coach, not an admin (settled 2026-10-02). Sharing is a choice she makes one drill at a
time, and she never has to make it.

**Club is the shared shelf, and the club's secret sauce.** It's where a club's
way of playing gets written down: the U14 coach's rondo that the U10s should
start learning. Any coach can share into it and any admin can tidy it.

### Moving between shelves: copied, never linked

The same rule as shapes (README: *Shapes are copied, never linked*), for the
same reason.

- **Save to mine** from built-in or club makes a copy in Mine. Editing a
  built-in or club drill *is* saving to mine: "Your version of Rondo 4v1".
- **Share with the club** copies a drill from Mine to Club. The author's copy
  stays hers and the club's copy belongs to the club. If she leaves, the club
  keeps what she shared and she keeps everything she wrote.
- Every copy records where it came from:
  `from: { shelf: 'builtin' | 'club' | 'mine', id, v }`. When the original's `v`
  moves on, the copy shows *The original has changed* with a way to see what's
  new. It never merges by itself. A coach who reworded the setup for her age
  group doesn't want it silently reworded back.
- **Delete never cascades.** Removing a club drill doesn't touch anyone's copy,
  or any practice that used it.

A link would mean a club admin's edit rewrites last March's practice plan, and
a deletion leaves holes in it.

## A drill card

`drills.js` is the reference. The fields, and why each one is there:

| Field | What | Why |
| --- | --- | --- |
| `id`, `v` | Stable id, content version | Sessions, copies and AI answers refer to it. Ids are never reused |
| `name`, `summary` | Title and one line | The list view |
| `type` | Warm-up, technique, opposed, small-sided game, set pieces, goalkeeping, cool-down | The order a session runs in |
| `ages` | U-age range, e.g. `[8, 12]` | The default filter, once a team has an age (question 2) |
| `level` | 1–3 | A U12 team in its first season and a U12 academy side aren't the same |
| `players`, `gk` | Min / best / max, keepers needed | The session builder warns when a drill needs more players than are coming |
| `minutes`, `intensity` | Range, 1–3 | Building to a time, and not stacking three hard drills in a row |
| `space`, `kit` | Yards, and cones/balls/bibs/goals | The session adds up what to bring |
| `positions` | The app's own five roles | "Something for my keepers" is the same lookup as a player's best position |
| `shapes` | Optional: the app's preset formations it is written for (`2-5-1`, `3-3-2`…) | A team's saved shape keeps the preset's name, so "drills for our 2-5-1" is a chip on the Drills screen and a nudge in *Suggest a session*. A drill that works in any shape lists none |
| `skills`, `principles`, `moments`, `physical` | What it trains, from fixed vocabularies | Filtering, and the AI's vocabulary later |
| `setup`, `how`, `points` | Lay it out, run it, coach it | What a parent volunteer reads at quarter to six |
| `questions` | Guided-discovery questions | Players remember what they say better than what they are told |
| `mistakes` | What goes wrong, and the fix | The thing a new coach most needs and most coaching books leave out |
| `why` | How it shows up on Saturday | Lets a coach explain it to players and parents |
| `easier`, `harder` | Regressions and progressions | Every squad has a spread. Required on every drill |
| `safety` | Optional | Heading (federation age rules), diving surfaces, punting rules |
| `signals` | Which game numbers it answers | The bridge to "what needs work" and the AI, below |
| `goesWith`, `tags` | Drills that chain well; loose labels | Suggestions in the builder |
| `setupMins` | Minutes to lay it out | "Something I can put out while they arrive" |
| `adults` | 1 or 2 | A volunteer on her own needs to know before she picks it. The keeper drills say 2, because the keepers work apart from the team |
| `indoor` | Works in a gym or on a court | Winter, and rained-off fields |
| `groups` | On their own, pairs, small groups, teams, whole squad | Odd numbers, and what the session before it left set up |
| `involvement` | 1 some waiting, 2 busy, 3 non-stop | Lines are what youth coaches are most often told to cut |
| `competitive` | A score or a winner | Some groups need one to switch on; some need a break from one |
| `diagram` | The picture, as data (below) | Most coaches read the picture first and the words second |

`test/drills.js` holds the library to this: fixed vocabularies, sane ranges,
`goesWith` pointing at real drills, positions matching `ROLES` in `app.js`, no
heading drill below U11, a safety note on every heading and diving drill.
It also checks coverage: every age U5–U18 has at least ten drills, including a
warm-up and a game to finish on; every position has at least three; and every
signal has at least two drills that answer it. That suite found two real holes
while the library was being written: the under-sixes had nine drills, and
throw-ins had one. It's there to keep the library from quietly becoming
something a U6 coach opens and finds empty.

## Pictures

### Built-in drills: drawn, and they move

Every built-in drill has a diagram, and 139 of the 141 animate: players run, the
ball travels, and a caption says what each step is. The two that don't move
(juggling and the cool-down circle) are layouts.

A diagram is data, not an image. It's a few lines in `drills.js`: the area in
yards, cones and goals, players by team colour, then moves step by step (`A1>A2`
a pass, `A1~12,4` a dribble, `A1-12,4` a run, `A1>G` a shot). `drill-diagram.js`
turns that into an SVG. The animation is SMIL inside the SVG, so it loops like a
GIF with no script running and the same string works in the app, in an `<img>`,
or saved as a file. Next to a GIF it:

- **weighs a few kilobytes and works offline**, like the rest of the app;
- **has a still version for free.** Every move is drawn as an arrow, numbered
  by step, for anyone whose phone asks for less motion, and for paper;
- **can't drift from the card silently.** `test/drills.js` parses every
  diagram, so a pass from a player without the ball, or someone standing off the
  pitch, fails the suite. It also holds the picture to its card: a keeper on
  the card is a keeper in the picture, and a goal or cones in the picture are
  on the kit list. Captions are capped at 48 characters so the strip under the
  picture never cuts one off on a phone. The first run of those checks caught
  World Cup's kit list missing the cones in its own picture.

They were checked by eye as well, every one, still and mid-animation. A parser
can tell that a diagram is valid. It can't tell that it reads well. The eye
check caught zone labels sitting under the players, which is why labels now
sit along a zone's top edge.

### The position guide

`ROLE_GUIDE` in `drills.js` answers *what is this position for?* for nine
jobs: goalkeeper, centre back, full-back, holding midfielder, central
midfielder, attacking midfielder, wide midfielder, winger and striker. Each
entry covers four moments: what she does when we have the ball, when they have
it, the second we win it, and the second we lose it. It also lists the skills
the job needs, five or more drills that teach it, a line for coaches of
under-tens (who shouldn't be fixing anyone in one position yet), and an
animated diagram of where she plays and how she moves.

The app's five roles are too coarse to explain a job: a centre back and a
full-back are both *Back*. So each entry names the roles it falls under and the
shape slots that usually play it (`LB`, `RCB`, `ST`…, the labels `app.js`'s
formations really use). `test/drills.js` checks every slot in the app has an
entry. It also checks every drill the guide recommends for a position says on
its own card that it's for that position. Later, a player's profile can link
straight to the guide entry for her best position, and Ask an AI can quote the
job when it suggests where someone plays.

### A coach's own drills: draw it, or link it

*As built (step 4):* a drill copied from a built-in one keeps that drill's
drawing by naming it (`pic`), and the drawing is taken from `drills.js` on
every read.

*As built (step 6, first half):* **an AI draws it from her description.**
The owner's idea (2026-10-03): "allow the user to tell an AI how to make a
drill so they can explain their idea and it makes the animation for them."
The app still never calls a model. The editor builds a prompt (the format,
two built-in drawings as examples, the drill's setup and steps, and her
words with every player's name in the club swapped out), she pastes it into
her own chat, and pastes the answer back. A stored drawing is drawn only
after `DrillDiagram.clean()` has rebuilt it from typed values (numbers in
range, ids and enums from their lists, moves that match the grammar, text
cut to length) and `parse()` has passed it, because the renderer writes
numbers and ids straight into SVG and any coach can write a club drill.
`test/drills.js` holds `clean()` to leaving every built-in drawing exactly as
it was. When parse() objects, the app lists the problems in words she can
paste back to the AI.

*As built (step 6, second half):* **she taps it out on a pitch.** The owner
(2026-10-03): "the write a drill is really confusing… I have no idea how a
user would make the animation." *Draw it on a pitch* opens a board: the
set-up is pick a tool (blue, red, yellow, keeper, coach, ball, cone, goal,
move, remove) and tap the grass; then each step is "tap a player, then where
they go". A player with the ball passes to whoever is tapped next or
dribbles to a spot, one without it runs, and chips cover a shot, winning the
ball and a pass into space. A step's moves happen together, which is the
format's own meaning. It writes the same format the AI does, so every tap is
held to `parse()` before it's kept and a move that couldn't be drawn is
refused on the spot, in words; *Use this drawing* still goes through
`cleanDrawing()`. It opens on her own drawing, or the built-in one she
copied, to change it. Not on the board: walls, hurdles, zones, lines,
labels and bent passes (the AI and the built-ins still write those, and the
board keeps them). The editor itself was folded into three parts at the same
time: the five things every drill needs, the picture, and the rest behind
*Show the detail*.

No uploads (settled 2026-10-02). Two ways, and between them they cover what a
coach needs:

1. **Draw it.** A diagram editor in the same format: tap to place players and
   cones, drag from a player to make a pass or a run, *Next step* for the
   next move. It's the same few kilobytes, works offline, animates, and needs
   no storage at all. This is the default.
2. **Link it.** A video or GIF that lives somewhere else: YouTube, Vimeo,
   Instagram, Google Drive, a direct `.gif`. It's stored as
   `media: [{ kind: 'link', url, title }]`, so a drill list stays a few
   kilobytes however many drills have one. A direct image link shows inline,
   anything else as a link card that opens outside the app. It needs a signal
   to play, and a link can die. The card says so rather than pretending
   otherwise.

Leaving out uploads closes two questions at once. There's no storage plan to
pay for. And there's no photo of somebody's child sitting on a club drill for
years after she has left. A link is only as private as what it points to,
though. An *unlisted* video is visible to anyone who has the link. So the
add-a-link screen says so in one line, and suggests a clip of the set-up, or of
professionals, over a clip of the team.

## Practices

A practice is a dated plan for one team:

```
training/{code}/practices/{teamId}/{practiceId}
  { id, teamId, date, start, place, minutes,
    focus:   { signals: [], skills: [] },              // what this one is for
    blocks:  [ { drill, minutes, note, groups } ],     // in order
    status:  'plan' | 'done',
    review:  { rating, note, at, by, byName },         // after
    by, byName, at }
```

- **`blocks[].drill` follows the shapes rule.** A drill from Club or Mine is
  copied in whole, because those can be edited and deleted. A built-in drill is
  stored as `{ shelf: 'builtin', id, v }`, because nobody can change it except
  by shipping a new `drills.js`. If `v` has moved on since, the plan says so.
- **The builder suggests a shape:** warm-up, one or two practices, a game,
  cool-down (play–practice–play). Each drill's middle-of-range minutes, fitted
  to the practice's length. It warns when a drill needs more players or keepers
  than the squad has, and when three hard drills run back to back.
- **Kit is worked out when it's needed, never stored.** The most of each item
  any one block needs (cones are reused, not used up), with `balls: 'each'`
  multiplied by the squad.
- **Run mode** is the sideline view: one block at a time in big type, a
  countdown, the coaching points, and *Next*. It has to work with no signal,
  the same constraint as the match clock. A plan made on Wi-Fi at home has to
  be on the phone when the coach arrives (see *Offline*).
- **After:** a 1–5 *did it work* per practice, and one line. That's the
  feedback the AI step needs. It is not a place for notes about children
  (see *Privacy*).
- **Templates:** *Save as a template* in Mine or Club. *Run this again* copies
  a past practice to a new date.
- **The plan and the time are kept apart.** The plan (the drills, the notes,
  the review) lives under `practices/`, readable by that team's coaches and
  the club's admins. *When and where* lives under `schedule/`, readable by the
  whole club, so parents get the time and place without the plan.
- **Putting your own drill in a practice shares it with your team.** The
  practice holds a copy, so the team's other coaches and the club's admins can
  read it. The builder says so the first time a coach adds one of hers:
  *Adding this to the practice shares it with this team's coaches.* That's the
  only way a Mine drill is ever seen by anyone else without her sharing it on
  purpose.

## Where it lives in the app

- A **Practice** tab beside Games, for coaches and admins only: upcoming
  practices, the last few, and *Plan a practice*. Trackers and parents don't
  get the tab. Parents see the next practice's time and place on the team
  page.
- **Drills** inside it, with the three shelves as filter chips (Built-in ·
  Club · Mine) and a filter for everything on the card: age, what needs work,
  type, position, length, difficulty, intensity, how many players are coming
  and whether a keeper is, setup time, one adult or two, indoors, how they're
  grouped, how busy, competitive, skills, principles, moments, physical, and
  what kit there is (no mini goals, no bibs). Sorted by session order,
  shortest, quickest to set up or busiest. The preview artifact has all of
  these working.
- **Club drills** also under Admin, for curation.
- **My drills** under the account menu, because it's the person's, not the
  team's.

## Who can do what

| | Built-in | Club drills | Mine | Team practices (the plan) | Practice times |
| --- | --- | --- | --- | --- | --- |
| Admin | Read, copy | Add, edit, remove any | Her own | Plan and edit any team's | Read, change |
| Coach | Read, copy | Read, copy; share; edit or remove what she shared | Her own | Plan and edit her team's | Read; change her team's |
| Tracker | — | — | — | — | Read |
| Parent | — | — | — | — | Read |
| App owner | Read, copy | Only through a club role | Read anyone's, for support; never changes it | Only through a club role | Only through a club role |
| Signed out | — | — | — | — | — |

One exception to the dashes: a coach can **send one drill** as a link
(`#/drill/{club tag}/{key}`; the tag names the club without giving its code, and a phone switches to it only if it already belongs to it). A built-in drill's link opens for anyone, to read only,
because the built-in library ships in the app's public files. A club drill's
link opens only for whoever the table lets read the Club shelf; anyone else is
told it's for the club's coaches, and her phone never asks the database for
it. Mine has no link, because it's private: share it with the club first.

A coach can't read another team's practice plans, which is narrower than
`AUTH.md`'s *coaches read the whole club*. That's on purpose. A plan can hold
a copy of a coach's own drills, and those are hers to share. A coach who wants
the club to have a session saves it to the club as a template.

## Data model

```
drills.js                                   built-in, read-only, ships with the app

training/{code}/                            the club's; {code} is the workspace code
  drills/{drillId}       { ...card, diagram, media[], from, by, byName, team, at }
  templates/{sid}        { name, blocks[], by, byName, team, at }
  practices/{teamId}/{practiceId}   (above)               coaches of that team, admins
  schedule/{teamId}/{practiceId}    { date, start, end, place }   everyone in the club

workspaces/{code}/access/
  coachIndex/{uid}       a teamId she coaches   derived, like index and teamIndex

userLibrary/{uid}/                          one person's, whichever clubs they are in
  drills/{drillId}       { ...card, diagram, media[], from, at }
  templates/{sid}        { name, blocks[], at }

`media[]` on a drill holds links only (`{ kind: 'link', url, title }`).

**Why `training/{code}` and not `workspaces/{code}/training`.** Three reasons,
any one of which would be enough:

1. **Every phone reads the whole workspace on connect.** `wireBase()` reads
   `workspaces/{code}` in one go, so a season of practice plans, and the club
   library with them, would be downloaded by every parent's phone at every
   connect, only to be thrown away because `state` keeps only teams, matches and
   access. At the root, a coach's phone reads one team's practices when she
   opens Practice.
2. **The connect-time read replaced local state wholesale** when this was
   written (the gap `test/sync.js` pinned; the workspace outbox has since
   closed it). A practice planned offline under the workspace would have been
   wiped by it at the next connect. A separate node got its own merge-on-read
   from the start, written to the invariant rather than to the code that broke
   it.
3. **It's a new rules block, not an edit inside the workspace block.** The
   locked-down workspace rules stay exactly as tested. Training adds a sibling.

**The org migration costs nothing.** `AUTH.md` keeps the org id equal to
today's workspace code, so `training/{code}` is already `training/{orgId}`.

## Rules sketch

```json
"training": {
  "$code": {
    "drills": {
      ".read": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + $code + '/access/coachIndex/' + auth.uid).exists())",
      "$id": {
        ".write": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || (!data.exists() && newData.child('by').val() === auth.uid && root.child('workspaces/' + $code + '/access/teamIndex/' + newData.child('team').val() + '/' + auth.uid).val() === 'coach') || (data.child('by').val() === auth.uid && root.child('workspaces/' + $code + '/access/teamIndex/' + data.child('team').val() + '/' + auth.uid).val() === 'coach'))"
      }
    },
    "practices": {
      "$tid": {
        ".read": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + $code + '/access/teamIndex/' + $tid + '/' + auth.uid).val() === 'coach' || (!root.child('workspaces/' + $code + '/access/teamIndex').exists() && root.child('workspaces/' + $code + '/access/coachIndex/' + auth.uid).exists()))",
        "$pid": {
          ".write": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + $code + '/access/teamIndex/' + $tid + '/' + auth.uid).val() === 'coach' || (!root.child('workspaces/' + $code + '/access/teamIndex').exists() && root.child('workspaces/' + $code + '/access/coachIndex/' + auth.uid).exists()))"
        }
      }
    },
    "schedule": {
      "$tid": {
        ".read": "auth != null && (root.child('workspaces/' + $code + '/access/index/' + auth.uid).exists() || !root.child('workspaces/' + $code + '/access/index').exists())",
        "$pid": {
          ".write": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + $code + '/access/teamIndex/' + $tid + '/' + auth.uid).val() === 'coach' || (!root.child('workspaces/' + $code + '/access/teamIndex').exists() && root.child('workspaces/' + $code + '/access/index/' + auth.uid).exists()))"
        }
      }
    }
  }
},
"userLibrary": {
  "$uid": {
    ".read": "auth != null && (auth.uid === $uid || root.child('appOwners/' + auth.uid).exists())",
    "$kind": { "$id": { ".write": "auth != null && auth.uid === $uid" } }
  }
}
```

and, inside the existing `workspaces/$code/access` block:

```json
"coachIndex": {
  ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()",
  "$uid": {
    ".write": "auth != null && $uid === auth.uid && (!newData.exists() || root.child('workspaces/' + $code + '/access/teams/' + newData.val() + '/coaches/' + auth.uid).exists())"
  }
}
```

`templates` follows `drills`. The things to check against the invariants:

- **There is no `.read` on `training/$code` itself.** A rule higher up can't
  be taken back lower down, so a club-wide read there would hand parents the
  drills whatever `drills/.read` said. Every read sits on the node it's
  about.
- **"Is this person a coach of *any* team?" needs a third lookup table.**
  Rules can't iterate, `access/index/{uid}` says *member*, and
  `access/teamIndex/{tid}/{uid}` needs a team to look in. So
  `access/coachIndex/{uid}` joins the two flat tables `CLAUDE.md` describes,
  derived the same way: `syncIndex()` rebuilds it from `access/teams/*/coaches`,
  and nothing else may write it. Its value is a team she coaches, not `true`,
  because that's what lets her own device write her entry: the rule checks
  she really is a coach of the team the value names. That's the same pattern
  an invite id follows in the role entries. Everything that reads it asks only
  whether the entry is there. When this ships, `CLAUDE.md`'s invariant says
  three tables, not two.
- **This bridge fails closed, unlike the others.** The per-team and per-share
  rules fall back to the old club-wide behaviour while their table is missing,
  because that behaviour already existed and taking it away would lock people
  out. Training has no old behaviour. Failing open would show parents the
  drills. So while `coachIndex` is missing, only admins read the club library.
  Each coach's device writes its own entry on its next connect, and an admin's
  writes everyone's. A coach can write her own entry even into an empty table,
  because there's no fallback for her write to close on anyone else.
  Practices fall back the same way: while `teamIndex` is missing, it's
  admins and anyone in `coachIndex`, never the whole club. `schedule` is
  the one part that is club-wide, so its *read* keeps the usual bridge.
  Its *write* is the plan's write, because writing a time for a team is
  planning for it, and there is no older behaviour to keep there either.
  (As built. The sketch above gave `schedule` the club-wide bridge for both.)
- **Mine reads as its owner or the app owner, and writes as its owner only.**
  It's the first rule that gives the app owner any standing (`CLAUDE.md`
  lists *the app owner has no standing in the rules* as a known gap). That's
  safe because `appOwners` can only be changed in the Firebase console
  (`.write: false`, README's *Becoming the app owner*), so no button in the
  app can make someone an owner and open every coach's library. It's read
  only: the owner can see a drill to help with a problem, but never edit or
  delete one. A club admin gets no clause here at all. The library belongs to
  the person, and a coach in two clubs would have two sets of admins.
- **A club drill records the team its author coaches** (`team`), and the
  write rule looks that one entry up, the same trick `matches/$mid` uses with
  `teamId`. If she stops coaching that team, she can no longer edit what she
  shared, and the club still has it. That's intended.
- **Write at the depth the rule sits at.** One drill, one template, one
  practice, one schedule entry per write. Never the collection.
- **Publish before it syncs.** A new root node is refused until its block is
  in `database.rules.json`, the one ruleset every club runs on. When a write
  is refused, the app says so (*Saved on this phone only*) rather than failing
  quietly, and practices stay on the phone, as everything did before sync.
  (This used to read "the open rules need these blocks too": there was a
  second, open ruleset for new clubs. It's gone. A database runs one ruleset
  for every club in it, so new clubs start under the same rules as the rest.)
- `node test/rules.js` gets cases for every role against every block before
  any of this is pasted anywhere, starting with a parent being refused
  `drills/` and `practices/`, and a tracker being refused both.

## Offline

The cache rule that already exists: holding a copy and drawing it are separate
decisions.

- A team's upcoming practices and the drills they use are cached on the phone
  whenever Practice is opened with a signal, so the plan is there at the field.
- A practice planned offline lives only on that phone until it syncs, which is
  the same exposure as a game tracked offline, and it merges on read, never
  replaced wholesale.
- Mine is cached per account and, like the identity cache, cleared on sign-out.
  It's the person's, not the device's. The app owner's device never caches
  another coach's library: it reads one when asked, for support, and keeps
  nothing.
- Club drills and practice plans are only ever fetched by a coach's or an
  admin's device, so a parent's phone never holds a copy to leak through
  devtools. That's stricter than the workspace cache, and it can be: a coach
  at the field needs her plan, but nobody needs the club's library offline
  on a phone that isn't hers.

## Privacy

- **Drills never carry names.** A drill is coaching content, not data about a
  child. The built-in library is enforced by review; club and personal drills
  are free text, so the AI step runs them through `aiScrub()` like the ideas
  box.
- **Practice plans are coaches' and admins' only**, which also makes them a
  safer place for a review note than anything parents can read. They still
  aren't the place for "Ava was off the pace again", which would follow the
  child through every coach who takes the team. The review box says so.
- **No uploads, so no pictures of children** stored by the app at all. Links
  point elsewhere, and the add-a-link screen says that *unlisted* isn't
  *private*.

## Towards the AI helper

The app never calls a model (`CLAUDE.md`), and nothing here changes that. Ask
an AI already has a *Practice plan* topic. Today it sends season facts and asks
for a plan from scratch, so the model invents drills the coach has never heard
of, at whatever age it guesses.

Four steps, each useful without the next:

1. **What needs work, without any AI.** A card on Season that works out the
   signals in `drills.js` from the stats, shows the two or three that stand out
   with the numbers behind them, and lists the drills that answer each one,
   filtered to the team's age. It's deterministic and shows its working, like
   the game planner. Starting thresholds, all a coaching judgement and all
   meant to be tuned:

   | Signal | Shows when (last five finished games, at least three) |
   | --- | --- |
   | `few-shots` | Our shots under 80% of theirs |
   | `off-target` | Under 40% of our shots on target, from at least ten |
   | `one-scorer` | The top scorer has 60%+ of our goals, from at least five |
   | `solo-goals` | Under a quarter of our goals assisted, from at least five, and assists recorded at all |
   | `possession` | Under 45%, only when the team tracks possession |
   | `shots-against` | Their shots over 125% of ours |
   | `conceding` | Conceding a goal a game more than we score |
   | `late-goals` | 40%+ of goals against in the last quarter, from at least five |
   | `corners-against` | Their corners over 150% of ours, or two goals within 20 s of a corner against |
   | `fouls` | Our fouls over 150% of theirs |
   | `throw-ins` | Twelve or more of ours a game |

   **A signal only fires on data that was tracked.** No shots tapped means *we
   don't know*, not *we don't shoot*. That's the possession card's honesty rule
   (*only as honest as the tapping*), applied everywhere.

2. **The prompt knows the library.** The practice prompt gets the signals with
   their numbers, the team's age and squad size, and a compact list of the
   drills that fit (id, name, minutes, what it trains): about sixty short
   lines. It asks for a session made from those ids, written `[rondo-4v1]`.
   The model picks from drills the coach can open, read and run, instead of
   inventing them. Club and Mine drills are the secret sauce, and pasting them
   into a chatbot is sharing them. So they go in only when the coach ticks
   *Include our own drills*, and then only by name and what each one trains,
   never the full card.

3. **Paste the answer back.** A box on Plan a practice reads the `[drill-id]`
   tokens and minutes from the reply and turns them into a draft. It's still
   copy out, paste back, so the no-model-calls rule holds, and the round trip
   becomes one paste instead of retyping a plan.

4. **The loop.** The prompt carries the last few practices, what each was for,
   how the coach rated it, and how that signal moved since. The prompt has to
   frame this as context rather than evidence: four games of under-tens can't
   prove a drill worked, and it shouldn't claim to.

Later, if film arrives, possession and where the ball was lost become signals
too. The bridge doesn't change shape.

## Build order

1. **Browse the built-in library.** Practice → Drills, filters, the drill card
   with its animated diagram. No database, no rules, no schema. It can ship
   alone and be useful the same day. *Built, with the position guide as
   Practice → Positions.*
2. **A team age.** One field on the team (U-age, or birth year so it rolls
   over), so the library filters to the team by default. *Built as
   `teams/{tid}/birthYear`, which bulk import also takes.*
3. **Practices.** Plan, run mode, review; `training/{code}/practices` and
   `schedule`; `access/coachIndex` and its place in `syncIndex()`; the rules
   blocks in both sets with `test/rules.js` cases (a parent and a tracker
   refused first); merge-on-read and the offline cache. *Built. The rules
   are in README, in both sets, and have to be published before plans leave
   the phone; until then the Plans screen says they're saved on this phone
   only. Not built from this step: templates (they belong to Mine and Club),
   and the "shares your drill with your team" notice, which needs Mine.
   Blocks hold built-in drills only, by reference, for the same reason.*
   *Since 2026-10-04 a plan hangs off its calendar practice: keyed by the
   entry's id, reading day, time, place and length from it, `schedule` no
   longer written, older plans moved onto an entry under their own id.*
4. **Mine.** `userLibrary/{uid}`; save to mine; edit; templates. *Built,
   templates included (2026-10-04, as a plan with no calendar entry): the shelf, the editor, save to mine, "the original has
   changed", links, Mine drills copied whole into plans with the "shares it
   with this team's coaches" notice, the cache cleared on sign-out, and the
   app owner's read-once support view. Its rules are in
   `database.rules.json` with `test/rules.js` cases, and `test/library.js`
   covers the app side.*
5. **Club.** Share to the club, copy from it, curation under Admin. *Built,
   templates included. Curation is the same card, with Edit and Remove for
   admins and for the coach who shared it, reached from Admin → Club
   drills. As built, the write rule checks the team's own coach list
   (`access/teams/{team}/coaches`) rather than `teamIndex`, so sharing needs
   no bridge in a club whose lookup tables aren't built yet.*
6. **Pictures for a coach's own drills.** The diagram editor, then links.
   *Links built with step 4. Drawings built as "have an AI draw it", with
   `DrillDiagram.clean()` guarding every stored drawing, and drawing by hand,
   tap by tap, on a board in the drill editor.*
7. **What needs work.** The signals card on Season. *Built: `needsWork()`,
   with the thresholds in the table above, for coaches and admins.*
8. **The AI steps.** The library in the prompt, then paste-back. *Built
   (2026-10-05): a plan's* Ask an AI for a session *(`pracAiPrompt()`) carries
   the team's age and squad, its signals with their numbers, the last three
   reviewed practices as context (rated, what they were for, and whether that
   is still showing, with the warning that a few games prove nothing), and up
   to sixty fitting drills as `[id]` lines, those for the practice's focus
   first. The club's and her own drills go in only with* Include our own
   drills*, by name and what each trains. The reply's* SESSION *lines
   (`pracAiParse()`) become the plan's drills, nothing loaded while a token is
   unknown; her own drills are copied whole, as Add does, after the same "this
   shares it with the team's coaches" question. Ask an AI's* Practice plan
   *topic carries the library too. Step 4 of* Towards the AI helper *is the
   context block; there is no stored "how that signal moved" beyond whether it
   still fires.*
9. **Import.** A `"drills"` list in Admin's bulk import file, for a club that
   already keeps its drills in a spreadsheet. Merges by name, never replaces,
   like everything else that file does. *Built (2026-10-05), from JSON or a
   CSV with a* Setup*,* How it runs *or* Coaching points *column
   (`importDrills()`): matched by name on the club's shelf, updated field by
   field with its version bumped, lists held to the library's vocabularies
   (words or labels; a word it doesn't know is said and left out), and the
   same five things and the heading age the drill editor insists on.*

Step 1 touches nothing in `CLAUDE.md`'s ordering. Step 3 is the first new root
node since invites, so it's a high-stakes schema change in `CLAUDE.md`'s sense:
it gets its rules tested offline and tried on the second database before it
goes anywhere near the real club.

## Decisions this needs

1. **Attendance?** Who came to practice is useful (and the AI would use it),
   but it is data about children. Plans are now coaches' and admins' only, so
   it would sit in the right place. The recommendation is still not yet.

Settled on 2026-10-03:

- **Practice plans hang off the calendar.** A plan is keyed by the calendar
  practice's id (`teams/{tid}/events/{eid}`) and takes its date, time and
  place from that entry, so there is one list of practices, `schedule` goes,
  and "drills a player has done" is a join with the register. A template is
  a plan with no calendar entry. Not built yet; `TRAINING-NEXT.md` has it.

Settled on 2026-10-02:

- Team age is stored as a birth year and shown as a U-age. The season runs
  August to July and takes the year it ends in, the US youth rule: born 2016
  is U11 in 2026–27.
- The tab is called Practice.

- Built-in drills have pictures, and they're animated.
- Coaches' own pictures are drawn in the app or linked. Nothing is uploaded.
- Parents never see drills or practice plans. The club library is for admins
  and coaches, not trackers. A parent sees when and where.
- Each coach has her own private library and shares from it only if she wants
  to. Any coach can share into the club library; admins tidy it.
- A coach's own library is readable by her and by the app owner, read only,
  for support. No club admin can see it.
