# Next in training: plans on the calendar, then templates

A brief for a fresh chat, written 2026-10-03 at the end of the branch
`ccr-d5818ea9-kls3o6`. If that branch is merged and nothing below has shipped
since, this is current. If something has shipped differently, trust the code
and `CHANGELOG.md` over this note.

`TRAINING.md` is the design and has the reasons. This file is the brief: what
to build next, in what order, and what not to break.

## The ask

The owner, in their own words:

> Work in allowing coaches to have their own drill libraries, clubs to have
> their own, templates.

Coaches' own libraries and the club's are built (below). Templates are what's
left of that ask. On 2026-10-03 the owner also answered the question this
brief used to open with:

> **Do practice plans hang off the calendar?** — *Yes.*

So a plan is keyed by the calendar practice it belongs to and takes when and
where from that entry, and **a template is a plan with no calendar entry.**
Move the plans first, then build templates on top, because a template built
before the move would have to change shape after it.

Standing decisions from the design conversation (2026-10-01 to 2026-10-02),
all still binding:

- Parents never see drills, plans or templates: "this is the secret sauce for
  a club and coach." The club's are for admins and coaches, never trackers.
- A coach's own things are hers. "No admin should see personal drills. Coach
  only and me as the app owner."
- "No pictures directly and only links."

## Read first

1. `CLAUDE.md`: the invariants (including the new one on drill shelves), and
   the rules section. **There is one ruleset, `database.rules.json`, for
   every club.** Never add a second; `test/rules.js` fails if you do.
2. `TRAINING.md`: *Practices*, *Moving between shelves*, *Data model*,
   *Rules sketch*, *Offline*, *Build order*, and *Decisions* (the calendar
   one is settled there too).
3. `HANDOFF.md`: how the calendar and the attendance register work. The
   calendar comment in `app.js` (search `/* --- calendar --- */`) has the
   entry's shape.

## Where things stand

Built, and on this branch:

- **The built-in library** (`drills.js`, 105 drills, `LIB.version` 3), the
  diagram renderer (`drill-diagram.js`), the position guide, and the
  Practice tab (`canTrain()`: coaches, admins, the app owner, and any club
  with no admin yet).
- **Practice plans** at `training/{code}/practices/{tid}/{pid}`, with their
  own date, time and place, and a copy of when and where at
  `training/{code}/schedule/{tid}/{pid}` for parents. Sync:
  `putPractice()` / `sendPractice()` / `mergePractices()` / `watchTrain()`.
- **The club's drills and a coach's own** (this branch, TRAINING.md steps 4
  and 5 less templates):
  - Club: `training/{code}/drills/{id}`, cached inside `train`
    (`train.drills`, `train.drillDirty`). Mine: `userLibrary/{uid}/drills/{id}`,
    cached at `sm.mine.v1:{uid}` and dropped by `forgetMine()` whenever the
    signed-in uid changes.
  - One sync for both: `SHELF.club` / `SHELF.mine` describe where each lives;
    `putDrill()`, `dropDrill()`, `sendDrill()`, `mergeShelf()`,
    `watchShelf()`. Merge on read, a dirty map, one drill per write.
    **Templates should be a third and fourth entry in the same shape**, not a
    new copy of the sync.
  - `normDrill()` normalises everything read: the vocabularies, ranges,
    https links, and `pic` (a built-in drill whose drawing a copy borrows).
    **A stored drawing is drawn only through `cleanDrawing()`**
    (`DrillDiagram.clean()` then `parse()`). `cardOf()` is the card without
    whose it is, which is what a copy takes.
  - Credit: a club drill's `by`/`byName` are copied on when shared and never
    change; a tidy by someone else adds `edBy`/`edName`. Built-in drills are
    credited to the app (`APP_NAME`). Filters → *Made by* is `madeBy()`.
  - *Have an AI draw it*: `drawPrompt()`, `drawingFrom()` (reads JSON, or
    JavaScript-style objects, out of a reply), `drawingProblems()`,
    `sheetDrawAi()`. The app never calls a model; she copies and pastes.
  - Keys: a built-in id, `club:{id}`, `mine:{id}`, or `plan:{pid}:{i}` for the
    copy inside a plan. `findDrill(key)` resolves any of them.
  - In a plan, a non-built-in drill is copied whole:
    `{ drill: { shelf, id, v, card }, name, minutes, note }`. `blockDrill()`
    reads either kind.
  - The editor is `drillDraft` + `sheetDrillEditor()` + `captureDraft()`.
  - The app owner's support read is `peekLibrary()`, from Settings.
- **Rules** in `database.rules.json`: `training/$code/drills` and
  `training/$code/templates` (same rules, already written and tested), and
  `userLibrary/$uid` (with `$kind` limited to `drills` and `templates`).
  Templates need no new rule.
- **Tests**: `test/library.js` (new) for the shelves; `test/rules.js` for
  every rule, and its validator now walks into arrays.

**Not yet published.** The owner has to paste `database.rules.json` before
drills leave the phone (README → *The database rules*). Until then the
Drills screen says *Saved on this phone only*.

## What to build, in this order

### 1. Plans hang off the calendar

The calendar already has practices: `teams/{tid}/events/{eid}` with
`kind: 'practice'`, `date`, `start`, `end`, `venue`, `called`, `series`.
Everyone on the team reads them, through the workspace.

- **Key a plan by the entry's id**: `training/{code}/practices/{tid}/{eid}`.
  The plan stops carrying `date`, `start`, `place`, `minutes`; it reads them
  from the entry (length is `end − start`). Keep `focus`, `blocks`, `status`,
  `review`, `by`, `byName`, `at`.
- **Plans → the list is the calendar's practices** for this team, each with
  its plan or *Plan it*. *Plan a practice* becomes *Add a practice*, which
  makes a calendar entry through the calendar's own code (don't write a
  second way to make one) and opens its plan.
- **Called off**: the plan stays and the row says so, struck through like
  the calendar. **Deleted entry**: the plan is orphaned, never deleted with
  it (delete never cascades). Show orphans under *Earlier* with *Save as a
  template* and *Delete*.
- **Again next week** becomes *Use this plan for…*, picking the next
  practice that has no plan.
- **`schedule` goes.** Stop writing it, read the next practice from the
  calendar in `nextPracticeCard()`, and only then remove the `schedule` rule
  in a later change, once no app in the wild writes it. Never remove a rule
  an older app still depends on in the same change that stops using it.
- **Moving existing plans.** A club may already have plans keyed by their own
  id. On a coach's or admin's device, for each plan whose id is not an
  entry: make a practice entry from its date, time and place (`public:
  false`, the calendar's default), write the plan under the new id, and only
  once that write is acknowledged delete the old one. Each is its own write,
  at the depth the rule sits at. A plan with something pending stays where
  it is until it's sent. Pin this in `test/plans.js` against
  `test/fakebase.js`, including a reload halfway through.
- **The rule.** `practices/$tid/$pid` validates `date` today. Change it to
  `id` and `teamId` only, so a plan without a date is accepted. Old apps
  still send a date, so the new rule accepts both. Paste it before the app
  ships.
- **Drills a player has done** becomes possible: for each practice entry
  with a register (`teams/{tid}/attend/{eid}`), the drills in its plan
  count for each player marked present. Don't build the screen yet; check
  that the join is one lookup and leave a note in ROADMAP.

### 2. Templates

A template is a plan with no calendar entry.

- **Data.** Mine: `userLibrary/{uid}/templates/{sid}`. Club:
  `training/{code}/templates/{sid}`, with `by`, `byName` and `team`, exactly
  like a club drill. Shape: `{ id, name, minutes, focus, blocks, v, at }`.
  Built-in drills in its blocks stay by reference; Club and Mine drills are
  copied whole, as in a plan (`drillBlock()` already does both).
- **Sync.** Add `SHELF.mineTpl` and `SHELF.clubTpl` (names are yours) beside
  the drill entries, with their own stores in `mine` and `train`. Generalise
  `normDrill()`'s caller, not the function: write a `normTemplate()` that
  runs each block's card through `normDrill()`.
- **Save as a template** from any plan, to Mine, or straight to the club for
  a coach of the team or an admin. Name it (1–80 characters, the rule checks).
- **Plan from a template** on a practice with no plan, or *Swap in a
  template* on one with drills (confirm first, as *Suggest another* does).
  The plan copies the blocks; the template is untouched.
- **Where they're listed**: a *Templates* chip set on Plans (*Mine · Club*),
  and Admin → Club drills shows the club's templates beside its drills.
- **Copied, never linked; delete never cascades**, the same as drills.
  *Share with the club* and *Copy to mine* work the same way, with `from`.
- **Curation**: an admin edits or removes any club template; a coach, what
  she shared while she still coaches its team (`canCurate()` already says
  exactly this for drills).

### 3. Then, as TRAINING.md has it

- **Step 6, the rest of pictures**: drawing by hand, tap by tap, in the
  same format. The AI route and the guard are built: `DrillDiagram.clean()`
  rebuilds every stored drawing and `cleanDrawing()` holds it to `parse()`,
  so a hand editor only has to produce the format; anything it writes goes
  through the same door.
- **Step 7, what needs work**: the signals card on Season.

## The rules: little left to write

Templates need none: `training/$code/templates` and `userLibrary/$uid/templates`
are in `database.rules.json` with `test/rules.js` cases. Moving plans onto
the calendar needs one change, to `practices/$tid/$pid`'s `.validate`
(above). Add cases for a plan with no date being accepted, and keep every
existing refusal (a parent, a tracker, another team's coach, the wrong team,
an id that isn't its own).

## Invariants this work must keep

- **One plan, one template, one drill per write**, at the depth the rule
  sits at. Never a whole shelf or a team's whole collection.
- **Merge on read, never replace.** A plan or template saved offline must
  survive the next read, and a reload.
- **Holding a copy and drawing it are different decisions.** Mine (templates
  included) is cleared when the uid changes. Club is fetched only by coaches'
  and admins' phones.
- **Copied, never linked. Delete never cascades.** Deleting a calendar entry
  must not delete its plan.
- **Never copy a game, or a practice, into a second list.** The calendar is
  the list of practices; the plan hangs off it.
- **`esc()` every coach-written string**, and normalise everything read.
- **No uploads.** Links only, https only.
- **The app never calls an AI model.**

## Tests to add

- `test/plans.js`: plans keyed by entry; called off and deleted entries; the
  move of old plans (acknowledged before the old one goes, survives a
  reload); the next practice read from the calendar; a parent's phone still
  never reads a plan.
- `test/library.js`: templates on both shelves, the same way drills are
  tested there: who sees them, save as, plan from, share and copy as copies,
  curation, merge on read, cleared on sign-out.
- `test/rules.js`: the `.validate` change.
- `test/calendar.js` shouldn't need to change. If it does, find out why
  before changing it.

## Housekeeping when it ships

- Bump `BUILD` in `app.js`, the meta tag and every `?v=` in `index.html`
  together (70 on this branch). `test/version.js` checks them.
- A `CHANGELOG.md` entry, README's feature bullets and rules list, and mark
  the steps built in `TRAINING.md` → *Build order*.
- Look at every new screen at phone width (390px). This branch did it by
  copying the site to a scratch folder with a blank `firebase-config.js`,
  serving it with `python3 -m http.server` (Chromium won't run the module
  from `file://`), and driving it with Playwright and the preinstalled
  Chromium, with `sm.me` and a team seeded in localStorage. That caught the
  editor jumping to its top on every chip tap.
