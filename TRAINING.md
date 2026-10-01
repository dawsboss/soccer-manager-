# Training design

Written before code, for the reason `AUTH.md` gives: the data model and the
rules have to be right first. Training adds the first new root node since
invites. It's also the first data here that belongs to a *person* rather than to
a club, so a mistake would be expensive to undo.

What exists today is the built-in drill library (`drills.js`, 55 drills) and the
suite that keeps it honest (`test/drills.js`). Nothing in the app loads either
yet. Everything else below is a proposal, and the questions at the end are the
decisions it needs.

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

| Shelf | Whose | Lives in | Who changes it |
| --- | --- | --- | --- |
| **Built-in** | Everyone's | `drills.js`, shipped with the app | Nobody in the app. A new version of the file |
| **Club** | The club's | `training/{code}/drills` | Admins; coaches for what they added (see question 1) |
| **Mine** | One coach's, across every club | `userLibrary/{uid}/drills` | Only that coach |

**Built-in costs nothing to run.** It's a script tag, like `firebase-config.js`.
No database read, no rule, nothing to migrate, and it works from `file://` at a
field with no signal. That's why it could be written before anything else.

**Mine is keyed by account, not by club.** `AUTH.md`'s coach with a daughter at
another club is also a coach whose drills should follow her if she moves clubs.
A personal library inside `workspaces/{code}` would be the club's the day she
left. At the root, beside `userOrgs/{uid}`, it's hers.

**Club is the shared shelf.** It's where a club's way of playing gets written
down: the U14 coach's rondo that the U10s should start learning.

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
| `ages` | U-age range, e.g. `[8, 12]` | The default filter, once a team has an age (question 4) |
| `level` | 1–3 | A U12 team in its first season and a U12 academy side aren't the same |
| `players`, `gk` | Min / best / max, keepers needed | The session builder warns when a drill needs more players than are coming |
| `minutes`, `intensity` | Range, 1–3 | Building to a time, and not stacking three hard drills in a row |
| `space`, `kit` | Yards, and cones/balls/bibs/goals | The session adds up what to bring |
| `positions` | The app's own five roles | "Something for my keepers" is the same lookup as a player's best position |
| `skills`, `principles`, `moments`, `physical` | What it trains, from fixed vocabularies | Filtering, and the AI's vocabulary later |
| `setup`, `how`, `points` | Lay it out, run it, coach it | What a parent volunteer reads at quarter to six |
| `questions` | Guided-discovery questions | Players remember what they say better than what they are told |
| `mistakes` | What goes wrong, and the fix | The thing a new coach most needs and most coaching books leave out |
| `why` | How it shows up on Saturday | Lets a coach explain it to players and parents |
| `easier`, `harder` | Regressions and progressions | Every squad has a spread. Required on every drill |
| `safety` | Optional | Heading (federation age rules), diving surfaces, punting rules |
| `signals` | Which game numbers it answers | The bridge to "what needs work" and the AI, below |
| `goesWith`, `tags` | Drills that chain well; loose labels | Suggestions in the builder |

`test/drills.js` holds the library to this: fixed vocabularies, sane ranges,
`goesWith` pointing at real drills, positions matching `ROLES` in `app.js`, no
heading drill below U11, a safety note on every heading and diving drill.
It also checks coverage: every age U5–U18 has at least ten drills, including a
warm-up and a game to finish on; every position has at least three; and every
signal has at least two drills that answer it. That suite found two real holes
while the library was being written: the under-sixes had nine drills, and
throw-ins had one. It's there to keep the library from quietly becoming
something a U6 coach opens and finds empty.

**Diagrams are not in yet** (question 5). A small, coordinate-based format
(players, cones, goals, arrows on a 100 × 100 grid, like `positions`) would
render as SVG beside the pitch the app already draws. It's worth doing, but by
hand, one drill at a time, and checked by eye.

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

## Where it lives in the app

- A **Practice** tab beside Games: upcoming practices, the last few, and
  *Plan a practice*.
- **Drills** inside it, with the three shelves as filter chips (Built-in ·
  Club · Mine) and filters for age, type, skill, position and signal.
- **Club drills** also under Admin, for curation.
- **My drills** under the account menu, because it's the person's, not the
  team's.

## Who can do what

| | Built-in | Club drills | Mine | Team practices |
| --- | --- | --- | --- | --- |
| Admin | Read, copy | Add, edit, remove any | Own | Plan and edit any team's |
| Coach | Read, copy | Read, copy, share; edit/remove her own (question 1) | Own | Plan and edit her team's; read the club's |
| Tracker | Read | Read | Own | Read her team's: a volunteer running a station |
| Parent | — | — | — | When and where only (question 2) |
| Signed out | Browse | — | — | — |

The built-in library is safe to show anyone, signed in or not, because it
holds nothing about the club. That's the only part of training a signed-out
device should draw (`needsSignIn()` still gates the rest, at the top of
`render()`).

## Data model

```
drills.js                                   built-in, read-only, ships with the app

training/{code}/                            the club's; {code} is the workspace code
  drills/{drillId}       { ...card, from, by, byName, team, at }
  templates/{sid}        { name, blocks[], by, byName, team, at }
  practices/{teamId}/{practiceId}   (above)

userLibrary/{uid}/                          one person's, whichever clubs they are in
  drills/{drillId}       { ...card, from, at }
  templates/{sid}        { name, blocks[], at }
```

**Why `training/{code}` and not `workspaces/{code}/training`.** Three reasons,
any one of which would be enough:

1. **Every phone reads the whole workspace on connect.** `wireBase()` reads
   `workspaces/{code}` in one go, so a season of practice plans, and the club
   library with them, would be downloaded by every parent's phone at every
   connect, only to be thrown away because `state` keeps only teams, matches and
   access. At the root, a coach's phone reads one team's practices when she
   opens Practice.
2. **The connect-time read still replaces local state wholesale.** That's the
   gap `test/sync.js` pins (*the offline game survives the connect-time read*). A practice planned offline under the
   workspace would be wiped by it at the next connect. A separate node gets its
   own merge-on-read from the start, written to the invariant rather than to
   the code that breaks it.
3. **It's a new rules block, not an edit inside the workspace block.** The
   locked-down workspace rules stay exactly as tested. Training adds a sibling.

**The org migration costs nothing.** `AUTH.md` keeps the org id equal to
today's workspace code, so `training/{code}` is already `training/{orgId}`.

## Rules sketch

```json
"training": {
  "$code": {
    ".read": "auth != null && (root.child('workspaces/' + $code + '/access/index/' + auth.uid).exists() || !root.child('workspaces/' + $code + '/access/index').exists())",
    "drills": {
      "$id": {
        ".write": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || (!data.exists() && newData.child('by').val() === auth.uid && root.child('workspaces/' + $code + '/access/teamIndex/' + newData.child('team').val() + '/' + auth.uid).val() === 'coach') || (data.child('by').val() === auth.uid && root.child('workspaces/' + $code + '/access/teamIndex/' + data.child('team').val() + '/' + auth.uid).val() === 'coach'))"
      }
    },
    "practices": {
      "$tid": {
        "$pid": {
          ".write": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + $code + '/access/teamIndex/' + $tid + '/' + auth.uid).val() === 'coach' || (!root.child('workspaces/' + $code + '/access/teamIndex').exists() && root.child('workspaces/' + $code + '/access/index/' + auth.uid).exists()))"
        }
      }
    }
  }
},
"userLibrary": {
  "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    "$kind": { "$id": { ".write": "auth != null && auth.uid === $uid" } }
  }
}
```

`templates` follows `drills`. The things to check against the invariants:

- **"Is this person a coach of *any* team?" can't be asked.** Rules can't
  iterate, and `access/index/{uid}` says *member*, not *coach*. So a club drill
  records the team its author coaches (`team`) and the rule looks that one
  entry up, the same trick `matches/$mid` uses with `teamId`. If she stops
  coaching that team, she can no longer edit what she shared, and the club
  still has it. That's the intended behaviour, not a side effect.
- **The bridge.** `practices` carries the same *while `teamIndex` is missing*
  clause as `matches`, so the block can be pasted on a club that predates the
  per-team index.
- **Write at the depth the rule sits at.** One drill, one template, one
  practice per write. Never the collection.
- **The open rules need this block too.** The open set grants `workspaces`
  and nothing else, so a new root node is refused under it. This is the
  invites lesson again: publish the block in both sets, and when a write is
  refused, the app says *the club's rules don't include training yet* rather
  than failing quietly. Until then, practices stay on the phone, as everything
  did before sync.
- `node test/rules.js` gets cases for every role against both blocks before
  any of this is pasted anywhere.

## Offline

The cache rule that already exists: holding a copy and drawing it are separate
decisions.

- A team's upcoming practices and the drills they use are cached on the phone
  whenever Practice is opened with a signal, so the plan is there at the field.
- A practice planned offline lives only on that phone until it syncs, which is
  the same exposure as a game tracked offline, and it merges on read, never
  replaced wholesale.
- Mine is cached per account and, like the identity cache, cleared on sign-out.
  It's the person's, not the device's.

## Privacy

- **Drills never carry names.** A drill is coaching content, not data about a
  child. The built-in library is enforced by review; club and personal drills
  are free text, so the AI step runs them through `aiScrub()` like the ideas
  box.
- **Practices don't either, for now.** `training/{code}` is readable by anyone
  indexed, parents included, exactly as the workspace is today. That's fine for
  plans and drills and wrong for "Ava was off the pace again". The review note
  says so on the screen, and attendance (question 3) is the feature that would
  force a tighter read rule.
- **No video, no photos** of players in drills. If diagrams arrive they're
  drawn, not recorded.

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
   inventing them.

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

1. **Browse the built-in library.** Practice → Drills, filters, the drill card.
   No database, no rules, no schema. It can ship alone and be useful the same
   day.
2. **A team age.** One field on the team (U-age, or birth year so it rolls
   over), so the library filters to the team by default.
3. **Practices.** Plan, run mode, review; `training/{code}/practices`; the
   rules block in both sets with `test/rules.js` cases; merge-on-read and the
   offline cache.
4. **Mine.** `userLibrary/{uid}`; save to mine; edit; templates.
5. **Club.** Share to the club, copy from it, curation under Admin.
6. **What needs work.** The signals card on Season.
7. **The AI steps.** The library in the prompt, then paste-back.
8. **Import.** A `"drills"` list in Admin's bulk import file, for a club that
   already keeps its drills in a spreadsheet. Merges by name, never replaces,
   like everything else that file does.

Step 1 touches nothing in `CLAUDE.md`'s ordering. Step 3 is the first new root
node since invites, so it's a high-stakes schema change in `CLAUDE.md`'s sense:
it gets its rules tested offline and tried on the second database before it
goes anywhere near the real club.

## Decisions this needs

1. **Who adds to the club library?** Admins only (curated, slower), or any
   coach, with admins able to remove (grows faster). The rules sketch allows
   either. The recommendation is any coach, because a club library nobody adds
   to is empty.
2. **Do parents see practices?** Nothing, or date, time and place only. The
   recommendation is when and where only: it saves the coach a group text.
3. **Attendance?** Who came to practice is useful (and the AI would use it),
   but it is data about children, and it changes the read rule. The
   recommendation is not yet.
4. **Team age as a U-age or a birth year?** A birth year rolls over by itself
   each season; a U-age is what coaches say.
5. **Diagrams:** worth doing by hand for the built-in drills?
6. **The tab's name:** Practice or Training?
