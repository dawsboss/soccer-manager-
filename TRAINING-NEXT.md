# Next in training: coaches' own drills, the club's drills, and templates

A brief for a fresh chat, written 2026-10-03 at the end of the branch
`ccr-eccb3a51-07tefa`. If that branch is merged and nothing below has shipped
since, this is current. If something has shipped differently, trust the code
and `CHANGELOG.md` over this note.

`TRAINING.md` is the design and has the reasons. This file is the brief: what
to build next, in what order, and what not to break.

## The ask

The owner, in their own words:

> Work in allowing coaches to have their own drill libraries, clubs to have
> their own, templates.

And from the conversation that designed it (2026-10-01 to 2026-10-02):

- A library for each coach on her own, and one for the club, and copying
  between them and her own account.
- "Parents should not see the drills, this is the secret sauce for a club and
  coach. So club provided drills should remain for club admins and coaches.
  And a coach should have their own set, where they don't have to share if
  they don't want to."
- "No admin should see personal drills. Coach only and me as the app owner."
- "No pictures directly and only links." Links only, for storage and for
  children's faces. The owner likes the drawn, animated diagrams best.

## Read first

1. `CLAUDE.md`: the invariants, and the rules section. **There is one
   ruleset, `database.rules.json`, for every club.** The site is for any club
   that turns up, so never add a second one; `test/rules.js` fails if you do.
2. `TRAINING.md`: *Three shelves*, *Moving between shelves: copied, never
   linked*, *A drill card*, *Pictures* (draw it, or link it), *Who can do
   what*, *Data model*, *Rules sketch*, *Offline*, *Privacy*, and *Build
   order*. Steps 4 (Mine) and 5 (Club) are this work; templates sit in both.
3. `HANDOFF.md`: main's latest note. It's about a different next chat (club
   event planning), but it records how the calendar and attendance work.

## Where things stand

Built and merged into this branch:

- **`drills.js`**: 105 built-in drills (`window.SOCCER_DRILLS`), the position
  guide `ROLE_GUIDE`, and the fixed vocabularies (`TYPES`, `SKILLS`,
  `PRINCIPLES`, `MOMENTS`, `PHYSICAL`, `KIT`, `LEVELS`, `INTENSITY`, `GROUPS`,
  `INVOLVEMENT`, `POSITIONS`, `SIGNALS`). `LIB.version` is 3. A user's drill
  must use these same vocabularies, or no filter ever finds it.
- **`drill-diagram.js`**: `parse(diagram)` and `svg(diagram, { animate,
  title })`. A diagram is a few lines of data: area in yards, cones, goals,
  players by team, then moves step by step. `TRAINING.md` → *Pictures* has
  the format.
- **The Practice tab** (`app.js`), for coaches and admins only (`canTrain()`):
  - **Plans**: practice plans for one team, with a suggested session, run
    mode and a review.
  - **Drills**: the built-in library, with search, every filter, and the
    drill card (`sheetDrill()`).
  - **Positions**: the position guide.

  Useful functions: `drillLib()`, `practiceUi()`, `drillMatches()`,
  `practiceDrills()`, `drillRow()`, `diagramBlock()`, `kitWords()`.
- **Practice plans** live at `training/{code}/practices/{teamId}/{practiceId}`.
  Their local copy is `train` (`sm.train.v1:{club}`), and their sync is
  `putPractice()` / `sendPractice()` / `mergePractices()` / `watchTrain()`.
  It merges on read and never replaces (a dirty map, and a re-send on the
  first answer after attaching). **Copy this pattern for Mine and Club**; don't
  copy `wireBase()`, which still replaces wholesale (the pinned gap).
- **A plan's blocks hold built-in drills only**, by reference:
  `{ drill: { shelf: 'builtin', id, v }, name, minutes, note }`. `blockDrill()`
  returns null for any other shelf, and the plan then says the drill is gone.
  That's the seam this work opens.
- **Rules** in `database.rules.json`:
  - `training/$code/practices/$tid` and `training/$code/schedule/$tid`;
  - `access/coachIndex/$uid`, the "a coach of any team?" lookup, derived by
    `syncCoachIndex()`.

  There is no `drills`, `templates` or `userLibrary` yet.
- **Tests**: `test/drills.js` (the library), `test/practice.js` (the tab and
  who gets it), `test/plans.js` (plans and their sync, against
  `test/fakebase.js`), and `test/rules.js` (every rule, plus a brand-new club
  made under them).

## Decide this first

**Do practice plans hang off the calendar?** Main's calendar already has
practices (`teams/{tid}/events/{eid}`), with a date, time and place that
everyone on the team reads. Plans here still carry their own, and a
`schedule` node that duplicates it for parents.

The recommendation, from main's handoff and from this branch, is to key a plan
by the calendar entry's id and take when and where from the entry. Then:

- there is one list of practices;
- the `schedule` node and its rule go;
- "drills a player has done" becomes a join with the attendance register.

**It was put to the owner on 2026-10-03 and not yet answered. Ask before
building templates**, because the answer decides what a template is:

- If plans hang off the calendar, a template is a plan without a calendar
  entry, and "use a template" fills a calendar practice's plan.
- If they don't, a template is a plan without a date.

## What to build, in this order

### 1. Mine: a coach's own drills

- **Data**: `userLibrary/{uid}/drills/{drillId}`, holding the card's fields
  (`TRAINING.md` → *A drill card*) plus `diagram` (optional), `media` (links
  only), `from`, `v` and `at`.
  - Required: `name`, `type`, `ages`, `minutes`, `players`, `summary`,
    `setup`, `how`, `points`.
  - Everything else is optional and gets filled from defaults on read, so
    `drillMatches()` and the card never meet a missing array.
- **Save to mine** from a built-in or club card copies the drill:
  - `from: { shelf, id, v }`;
  - editing a built-in or club drill *is* saving to mine;
  - "Your version of Rondo 4v1".
- **Editing** her own drill bumps `v`. When the original's `v` has moved past
  `from.v`, her copy says *The original has changed*. It never merges by
  itself.
- **The drill editor** is a sheet with the card's fields:
  - every list field is a chip set from the fixed vocabularies, never free
    text;
  - links are `media: [{ kind: 'link', url, title }]`, https only;
  - the screen says *unlisted isn't private* in one line.

  The diagram editor is `TRAINING.md` build step 6 and is out of scope unless
  asked. Until then her drill has no picture, or a link, and the card says so.
- **Shelves** on the Drills tab: chips for *Built-in · Club · Mine*. Every
  filter works across all three.
- **Caching**:
  - Mine is the person's, not the device's, so it's cached per account
    (`sm.mine.v1:{uid}`) and **cleared on sign-out**, like `sm.me`.
  - The app owner may read anyone's Mine for support but **never caches it**.
    It's read on demand and dropped.
- **In a plan**: a Mine drill is copied whole into the block:
  `drill: { shelf: 'mine', id, v, card: {…} }`. A Mine drill can be edited or
  deleted, and last month's plan must still read.
  - The first time a coach adds one of hers, the builder says: *Adding this to
    the practice shares it with this team's coaches.*
  - Teach `blockDrill()` to read a copied card.

### 2. Club: the club's shared drills

- **Data**: `training/{code}/drills/{drillId}`, holding the card's fields plus
  `by`, `byName`, `team` (a team she coaches, which the rule checks), `from`
  and `at`.
- **Share with the club** copies from Mine. Her copy stays hers. **Copy to
  mine** goes the other way. **Delete never cascades**: removing a club drill
  touches no one's copy and no plan.
- **Curation under Admin**: admins edit or remove any club drill. A coach edits
  or removes what she shared, while she still coaches the team it names.
- **Who fetches it**: only a coach's or admin's device, when the Club shelf
  opens. It's cached per club like `train`. A parent's or tracker's phone
  never asks for it, so it never holds a copy.

### 3. Templates

- **Mine**: `userLibrary/{uid}/templates/{sid}`. **Club**:
  `training/{code}/templates/{sid}`. The rules follow the drills beside them.
- **Save as a template** from a plan, and **plan from a template**. A
  template's non-built-in drills are copied whole, the same as a plan's.
- What a template is depends on the calendar decision above.

## The rules to write, and test first

Start from `TRAINING.md` → *Rules sketch*. Write `test/rules.js` cases before
the app code, and refuse a parent and a tracker first.

- **`training/$code/drills`**:
  - Read: admin, or `coachIndex/{uid}` exists. This bridge **fails closed**:
    with no coach index, only admins read.
  - Write, at `$id` depth: admin; or a new drill stamped `by` her own uid,
    whose `team` her `teamIndex` entry says she coaches; or an existing drill
    whose `by` is her, while she still coaches its `team`.
  - `templates` follows the same rules.
- **`userLibrary/$uid`**:
  - Read: `auth.uid === $uid`, or `appOwners/{auth.uid}` exists.
  - Write: `auth.uid === $uid` only, at `$kind/$id`, with `$kind` validated as
    `drills` or `templates`.
  - No club admin gets any clause.
- **No `.read` on `training/$code`** itself, nor on `userLibrary`. A read
  granted there can't be taken back lower down.
- **Validate shape and size.** Any coach can write a drill, and the rules are
  the only thing between a malformed one and every other coach's screen. Check
  that `name` is a string of 1–80 characters and that each `media` url starts
  with `https://`. Normalise on read anyway, the way `normPractice()` does;
  `test/plans.js` has a hostile-plan case worth copying.

Cases `test/rules.js` needs:

- Refused:
  - a parent and a tracker, from the club shelf;
  - another coach, from Mine;
  - **an admin, from Mine**;
  - the app owner writing to Mine (reading it is allowed);
  - a coach editing another coach's club drill;
  - a coach editing her own club drill after she stopped coaching its team;
  - a stranger.
- Allowed:
  - a coach sharing a drill stamped as herself, for a team she coaches;
  - an admin editing anyone's club drill.
- "A brand-new club" must still walk from nothing to working.

Then add a bullet per block to README → *What each part is doing*, and tell the
owner to paste `database.rules.json`.

## Invariants this work must keep

- **One drill, one template, per write**, at the depth the rule sits at. Never
  a whole shelf.
- **Merge on read, never replace.** A drill saved offline must survive the
  next read.
- **Holding a copy and drawing it are different decisions.** Mine is cleared
  on sign-out. Club is held only by coaches' and admins' devices.
- **Copied, never linked. Delete never cascades.**
- **`esc()` every coach-written string**, and normalise everything read. The
  rules don't check most of a drill's shape.
- **No uploads.** Links only.
- **The app never calls an AI model.** When drills reach the Ask an AI prompt,
  later, Club and Mine drills go in only on opt-in, by name and focus, through
  `aiScrub()`.

## Tests to add

- **A new `test/library.js`**, against `test/fakebase.js`. It should check:
  - the shelves are drawn for coaches and admins and never for parents and
    trackers;
  - a parent's phone never reads `training/{code}/drills`;
  - another uid's `userLibrary` is never read, except by the app owner, on
    demand and without caching;
  - save to mine records `from`, and editing bumps `v`;
  - *the original has changed* appears when it should;
  - share to club is a copy;
  - deleting from any shelf leaves plans intact;
  - Mine and Club merge on read;
  - signing out clears Mine's cache.
- **User drills against the vocabularies**: the editor can't produce a skill,
  type or position the filters don't know.
- **Rules**, as above.
- Add the suite to `test/run.js` and to `CLAUDE.md`'s list.

## Housekeeping when it ships

- Bump `BUILD` in `app.js`, the meta tag and every `?v=` in `index.html`
  together. `test/version.js` checks them.
- Add a `CHANGELOG.md` entry, a README feature bullet, and mark the steps
  built in `TRAINING.md` → *Build order*.
- Look at every new screen at phone width (390px).
  - Last time: the site was copied into a scratch folder with a blank
    `firebase-config.js`, so nothing touched a real database.
  - It was driven with Playwright and the preinstalled Chromium.
  - That caught a sheet opening scrolled halfway down, which no test would
    have.
