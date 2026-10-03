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

## Next conversation: planning for the club

The owner's next ask: help club admins plan future events — who (teams,
coaches, families) is busy when, and when they are free — for games,
practices, picture day and the rest. The design is in ROADMAP → *Next:
planning for the club*: clashes first (read-only), then *find a time*, then
booking a club-wide event as one entry per team sharing a `club` id (no new
rule), then picture-day layout. Start there.
