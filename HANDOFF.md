# Handoff — 2026-10-02

Current as of the branch `ccr-78c34dfb-3oa41c` (calendar, answers, attendance,
calendar sync, game-only links). If that branch has been merged and this file
has not been touched since, it is still current; if anything below has
shipped differently, trust the code and `CHANGELOG.md` over this note.

## What this branch built

All in `CHANGELOG.md` (three entries, 2026-10-01 and 2026-10-02) and README
(**The calendar**, **Calendar sync**). In one line each:

- **Calendar tab** — games plus `teams/{tid}/events/{eid}` (practices and the
  rest), weekly series, called-off entries kept, everyone on the team reads it.
- **Who is coming** — parents answer for their own child at
  `rsvp/{tid}/{g_mid | e_eid}/{pid}`; a "not going" takes the player out of the
  game's plan automatically (`isOut()` is derived), the coach can override.
- **Attendance** — the coach's register at `teams/{tid}/attend/{eid}/{pid}`;
  games count from minutes and availability; Season → Attendance.
- **Game-only links** — each game published alone at `public/{m.share}`.
- **Calendar sync** — `worker/calendar.mjs`, an optional read-only Cloudflare
  Worker; the team's members' feed is `public/{calFeed}`.

## Waiting on the owner (not code)

1. **Paste `database.rules.json`** (README → *The database rules*). Without
   the `rsvp` block, parents' answers are refused (the app says so), and
   without `training` and `access/coachIndex`, practice plans stay on the
   phone. Run `node test/rules.js` first; it passes. There is one ruleset now,
   for every club (see below).
2. **Calendar sync is parked** ("don't worry about subscribing yet"). The
   Worker is written and tested but not deployed; nothing shows the subscribe
   buttons until `SOCCER_CALENDAR_FEED` is set in `firebase-config.js`.
3. **Old game links** sent before this branch still carry the season's id until
   a coach uses *Make a new link and kill the old one*.

## Other branches touching the same ground

- `ccr-eccb3a51-07tefa` (training: drill library, practice plans,
  `TRAINING.md`) has main merged into it. Its practice plans at
  `training/{code}/practices/{teamId}/{practiceId}` still carry their own date,
  time and place. Recommended, and put to the owner but not yet answered: key
  practice plans by the calendar entry's id and take when and where from the
  entry, so there is one list of practices, and "drills a player has done"
  becomes a join with the attendance register. ROADMAP → *Drills a player has
  done*. The next training chat's brief is **`TRAINING-NEXT.md`**.
- **Messages (`ccr-898e57e7-rrryfw`) is merged** into `main` and into this
  branch (2026-10-02). Its joins with this work: a reminder notice to families
  who have not answered (ROADMAP → *Who is coming, next*), and a notice when an
  entry is called off. Its "availability replies" next step is done here, as
  `rsvp`.
- **The rules are one file now**: `database.rules.json`, for every club. The
  owner asked for this on 2026-10-03: the site is for any club that turns up,
  and a database runs one ruleset for all of them, so the open "starter" set
  (`database.rules.open.json`) is gone and a new club is made under the same
  rules as an established one, through the bootstrap clauses. `rules.js` walks
  a brand-new club through it, and fails if a second ruleset reappears.
- **The rules to paste are the merged ones.** The file carries messages' root
  blocks (`board`, `dm`, `joinCodes`, `claims`), its `access/teamParents` and
  its extra clause on `access/index`, `rsvp`, and training's `training` and
  `access/coachIndex`. `node test/rules.js` checks all of it together.
- Training still bumps `BUILD` and touches `app.js`, `index.html` (tabs),
  `README.md`, `CHANGELOG.md` and `CLAUDE.md`. Whoever merges it takes the
  higher build number (this branch is on 66) and runs `node test/run.js` and
  `node test/rules.js`.

## Training sessions (branch `claude/calendar-training-scheduling-khnwif`, 2026-10-03)

1-1s and small groups that belong to no team, with fields and permits, fees,
coach hours, clashes and notices. `SESSIONS.md` is the design; CHANGELOG has
the entry; README has **Training sessions** and the rule bullets. Waiting on
the owner: **paste `database.rules.json` again**, since it gains six blocks
under `training/$code`. `node test/rules.js` passes.

Its overlap with *planning for the club* (below): fields with permits are the
"club list of venues" ROADMAP asked for, at the place it proposed
(`access/org/venues`), and `busyItems()` / `fieldOfText()` / `sessClashes()`
already join teams, coaches, players and fields for one day. The club-wide
planner should build on those, not write a second set.

## Starting a club, bookable times, My calendar (branch `claude/club-creation-training-calendar-26idsd`, 2026-10-03)

The owner asked how a new club is made from inside one, and for coaches'
bookable times that families book themselves, synced with the teams'
calendars, with a calendar that is the person's rather than the team's.

- **+ Start a new club** in the club switcher (`createClub()`): no rule change,
  the bootstrap clauses already allowed it.
- **Bookable times** (`training/{code}/avail`) and **My calendar**
  (`#/my-calendar`). `AVAILABILITY.md` is the design; `test/avail.js` and the
  new cases in `test/rules.js` pin it.
- **Waiting on the owner: paste `database.rules.json` again.** It gains the
  `avail` and `seats` blocks and family clauses in `sessions/$sid` and
  `booked/$sid/$pid`.
  Until then a coach's times stay on her phone and a family's booking is
  refused and taken back. `node test/rules.js` passes.
- **Settled with the owner:** slots are 1-1s or a small group; the rules,
  not just the app, hold a family to the grid, the clock, the notice and the
  number of places (AVAILABILITY.md, *What the rules hold a family to*).
  Agreed as proposed: a family's booking is confirmed at once, not asked for;
  families cancel up to a notice the coach sets (24 hours by default); My
  calendar lives on Club home and is linked from each team's Calendar tab,
  not in the top-left switcher.

## The to-do list, built (branch `ccr-0c6516a4-bvhzzu`, 2026-10-04, build 82)

Four entries in `CHANGELOG.md`: practice plans hang off the calendar,
templates, *what needs work* on Season, and planning for the club (Admin →
*Plan*). Waiting on the owner:

- **Paste `database.rules.json`** before this build reaches coaches: the
  `practices` rule no longer needs a date, and a new plan (which has none)
  is refused by the old rule and stays on the phone. `node test/rules.js`
  passes.
- **Later, remove the `schedule` rule**, once nothing older than build 82 is
  in use. Not in the same change that stopped writing it, on purpose.

Found on the way: `test/version.js` now compiles app.js as a module, because
the other suites eval it as a script, where a second top-level function of
the same name silently replaces the first (the planner's first
`clashesOn(date)` did that to the game plan's `clashesOn(t, m)`; every suite
passed and the page was blank).

**Then, build 83:** coaches' time off (`training/{code}/away`, new rule
block, `test/away.js`) and field opening hours and closures (no rule change).
**Paste `database.rules.json` again** for time off to leave the phone.

## Was next: planning for the club (now built, above)

The owner's next ask: help club admins plan future events — who (teams,
coaches, families) is busy when, and when they are free — for games,
practices, picture day and the rest. The design is in ROADMAP → *Next:
planning for the club*: clashes first (read-only), then *find a time*, then
booking a club-wide event as one entry per team sharing a `club` id (no new
rule), then picture-day layout. Start there.
