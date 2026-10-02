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

1. **Paste the updated locked-down rules** (README → *Locking it down*) if the
   club is locked down. Without the new `rsvp` block, parents' answers are
   refused (the app says so). Run `node test/rules.js` first; it passes.
2. **Calendar sync is parked** ("don't worry about subscribing yet"). The
   Worker is written and tested but not deployed; nothing shows the subscribe
   buttons until `SOCCER_CALENDAR_FEED` is set in `firebase-config.js`.
3. **Old game links** sent before this branch still carry the season's id until
   a coach uses *Make a new link and kill the old one*.

## Other branches touching the same ground

- `ccr-eccb3a51-07tefa` (training: drill library, `TRAINING.md`). Its proposed
  `training/{code}/practices/{teamId}/{practiceId}` has its own date, time and
  place. Recommended: key practice plans by the calendar entry's id and take
  when and where from the entry, so there is one list of practices, and "drills
  a player has done" becomes a join with the attendance register. ROADMAP →
  *Drills a player has done*. Its open question 3 (attendance) is answered:
  the owner wants it, and it is built here.
- `ccr-898e57e7-rrryfw` (messages: team notices, families and coaches). Natural
  join points: a reminder to families who have not answered (ROADMAP → *Who is
  coming, next*), and a notice when an entry is called off.
- All three branches bump `BUILD` and touch `app.js`, `index.html` (tabs),
  `README.md` rules, `CHANGELOG.md` and `CLAUDE.md`. Whoever merges second
  takes the higher build number and merges the rules blocks by hand, then runs
  `node test/run.js` and `node test/rules.js`.

## Next conversation: planning for the club

The owner's next ask: help club admins plan future events — who (teams,
coaches, families) is busy when, and when they are free — for games,
practices, picture day and the rest. The design is in ROADMAP → *Next:
planning for the club*: clashes first (read-only), then *find a time*, then
booking a club-wide event as one entry per team sharing a `club` id (no new
rule), then picture-day layout. Start there.
