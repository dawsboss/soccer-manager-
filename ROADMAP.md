# Roadmap

`CLAUDE.md` points here for the detail behind its ordering. The ordering itself
lives there — concurrent edits, then tracker stamps and the Track rework, then
roles and organisations with "stamps become identities" as one project, then
shareable read-only pages and server-rendered previews — and later items assume the
earlier ones hold. This file was missing from the repository until now; it
starts with the ideas that do not have a place in that order yet.

## Replacing GotSport

`GOTSPORT.md` is the plan (2026-10-06): registration, payments, push, email,
tryouts and coach compliance, so a club uses GotSport only for what its state
association requires. It is also where the server comes in.

## Training

`TRAINING.md` is the design and records what is built; `TRAINING-NEXT.md` is
the brief for what is next (plans reading when and where from the calendar,
then templates, then the *what needs work* card).

## Ideas, not scheduled

### Live stream with the play-by-play beside it

Stream the game and show the Live tab's feed next to the video, so someone
watching from home sees goals, subs and half time as they happen alongside the
picture. The data half already exists: every event is stored against match
seconds and the periods carry wall-clock timestamps (`absAt()` /
`secFromAbs()`), which is what lines a feed up against video.

Open questions before building it:

- **Where the video comes from.** The server (Cloud Functions) is for
  bookkeeping, not video, so the stream has to live somewhere else — YouTube Live, Veo, or similar — and
  the app would embed it. Each game already has a Veo link field.
- **Who may watch.** Video of children is more sensitive than the names the
  public mirror already refuses to publish. The in-app feed shows names to
  signed-in club members; a public page with video must go through the same
  thinking as `public/` (shirt numbers, never names) and probably an
  unlisted-or-private stream.
- **Delay.** Streams run tens of seconds behind; the feed is near-instant.
  Either the feed is held back to match, or it spoils the goal before the
  picture shows it.
- **The public follow page** (`live.html`) has no feed yet. It would need events
  in the public mirror, as shirt numbers only.

### Notifications with the page closed

*Notify me* on the Live tab, and Messages (team notices and family
conversations, shipped 2026-10), only reach a phone while Minutes is open on
it. A closed phone hears nothing until the coach taps *Email or share*. Real
push needs three things, and only the last is server-side:

1. **A service worker** and a web app manifest, so the site can be added to the
   home screen. iPhones only deliver web push to a site added to the home
   screen (iOS 16.4+); Android Chrome delivers to any site.
2. **Firebase Cloud Messaging** on the client: ask permission from a tap, get a
   token, store it at `pushTokens/{uid}/{token}` (owner-only rule). Static.
3. **A sender.** A Cloud Function on `board/{code}/{tid}/{id}` and
   `dm/.../m/{id}` creates that reads who should hear (the same lists the
   rules check) and sends to their tokens. That is the first server-side code
   in the project, and Cloud Functions need the Blaze (pay-as-you-go) plan —
   pennies at one club's volume, but a card on file. A Cloudflare Worker could
   do the same job without Blaze but would need a service account key.

The data model is already shaped for it: every notice and message is one
append-only node with its sender, so a function has exactly one thing to
trigger on and nothing to diff. **Decided 2026-10-06:** the owner approved
server-side code, and this is the server's first job (`GOTSPORT.md`, *Build
order*, step 2).

> **Built 2026-10-07 (build 104)** for notices and family messages: all three
> pieces as above (`sw.js` and `manifest.webmanifest`, tokens at
> `pushTokens/{uid}/{token}`, and `functions/`). Calendar changes followed
> (build 105), *Notify me* on a game (build 116), and training sessions and
> club activity (build 117); `GOTSPORT.md`, *Push notifications*.

### Messages, next steps

- **Game and practice notices.** A *Tell the families* button on a game's
  details, or a calendar entry, that drafts the notice (opponent, kick-off,
  venue). Practices exist now, as calendar entries; *Call it off* is the
  obvious moment to offer one.
- **When the orgs migration happens**, `access/teamParents` folds into
  AUTH.md's `teamMembers` index along with `teamIndex`.

### Calendar sync, beyond the first version

Built: the `calendar` function (`functions/calendar.js`, a Cloudflare Worker until build 104) serves any `public/{id}` as a feed, the team's
members get a feed with practices in it, the share page offers the season's,
and (2026-10-05) **My calendar has one address per person**: every team, child,
session and club of hers, no names, revoked alone. That closed *one address
per person* and *a parent's own children only*. What is left:

- **Answers in the feed.** "Ella: going" in the calendar entry would be handy,
  but answers are about named children and the feed is world-readable by
  address. Not without a feed that is not world-readable: a second function,
  reading the club's own data behind a private link. Possible now the feed is
  a function (build 104), and its own piece of work.

### Who is coming, next

Built: parents answer for their own children, at `rsvp/{tid}/{item}/{pid}`,
and the coach sees names and chases the unanswered; a "not going" takes the
player out of the game's plan by itself, and the coach can override it. Next, with parent communication rather than before it:

- **A reminder** to the families who have not answered by two days out. That
  needs a way to reach them, which is the communication work.
- **A deadline** the coach sets, after which answers close.

### Opponents

Explored while building the calendar. What is built today:

- **A message for their coach.** The game's share sheet and its calendar entry
  copy one: fixture, kick-off, where (with directions), what we wear, and the
  game link. Arrive-by is left out; it is our families' time.
- **The game page.** The link in that message is the page families get. When
  and where, then the live score once it starts, shirt numbers only. Their
  families can follow the score of their own child's game, which is a nice side
  effect.

What they can see: that game, by shirt number, and nothing else — each game is
published alone at `public/{m.share}`. (Game links sent before that carried the
season's id; *Make a new link and kill the old one* retires them.)

Two steps further, in increasing cost:

1. **Free dates for a reschedule.** The season page already shows our game days.
   A "we are free on" list (game days and practice days, as busy/free with no
   detail) would let a coach agree a new date without a back-and-forth. Needs
   nothing new in the data. It is a view over what is there.
2. **One fixture, two clubs.** When both clubs use Minutes, the fixture could be
   one shared record both see, so a reschedule or a cancellation lands on both
   calendars, and the score is confirmed by both coaches. That is cross-club
   data with rules that answer to two sets of admins. It depends on the
   `orgs/{orgId}` model in AUTH.md, so it waits until that has happened, and
   should not be started before it.

## Next: planning for the club

> **Built, 2026-10-04**, all four steps, as Admin → *Plan* (`viewPlanner()`,
> `test/planner.js`): clashes, find a time, booking one entry per team with a
> shared `club` id, and picture day. Not built from *What is missing* below:
> nothing: per-field opening hours and closures, and coaches' own time off
> (weekly, dates away, calling out of one entry), were built the same day,
> the time off at `training/{code}/away` rather than `access/members` (CHANGELOG
> says why). Games are said, never offered to move.

The next piece of work, and the reason the calendar, answers and attendance
were built the way they were. A club admin scheduling the season asks one
question in many shapes: **when is everyone involved free?** For a reschedule,
a new friendly, an extra practice, picture day, the end-of-season party, a
coaches' meeting. All the facts are already in the club; nothing joins them up.

### What the data can already answer

| Question | Where it comes from |
| --- | --- |
| When is each team busy? | `matches` (date, kick-off, length from `periodCount × periodMinutes`) and `teams/{tid}/events` (start and end) |
| Where? | `venue` on both, free text |
| Which coaches are tied up? | `access/teams/{tid}/coaches/{uid}`: a coach of two teams is in both |
| Which families? | `teams/{tid}/players/{pid}/guardians/{uid}`: the same parent uid on players in two teams is siblings in two age groups, the clash coaches hear about most and see least |
| Who actually turns up, and on which days | `rsvp` and `teams/{tid}/attend`, so "Tuesdays lose a third of the squad" is a query, not a hunch |
| What is fixed and what can move | a game against another club barely moves; a practice can |

### What it should do, in order of value

1. **Clashes, today.** Club settings → *Planner*: every team's week on one
   screen, and a list of what collides. Two teams on one pitch at once (same
   venue, overlapping times). A coach due in two places. A family with two
   children due in two places (a count to everyone but admins, names for
   admins). Read-only, no new data, nothing to write: the cheapest thing to
   ship and the one that proves the joins.
2. **Find a time.** Pick the teams (or "the whole club"), how long, a date
   range, the hours that are acceptable, and optionally a venue. It returns the
   slots where none of those teams, their coaches or their families is
   already busy, best first: fewest people affected, then the team's usual
   practice slot. Each candidate says what it would clash with, if anything.
3. **Book it.** Choosing a slot writes the entry to each team's calendar.
   **A club-wide event is one entry per team sharing a `club` id**, the same
   trick a weekly practice uses with `series`. An admin can already write every
   team's `events`, so no new node and no new rule, and each team can call off
   or move its own copy without touching the others'.
4. **Picture day, and anything else done team by team.** One venue, one window,
   a slot length. It lays the teams out back to back around their existing
   commitments, siblings next to each other so one family makes one trip, and
   books each team's slot as above.

### What is missing, and needs deciding

- **Venues — built** as the club's fields, with permits, at
  `access/org/venues` (`SESSIONS.md`). `fieldOfText()` matches what is
  already typed and `busyItems()` / `sessClashes()` already join teams,
  coaches, players and fields for one day: the planner builds on those, not
  a second set.
- **When pitches can be had at all.** Council bookings, lights, the school's
  hours. A weekly availability per venue makes "find a time" stop suggesting
  9pm on a Wednesday.
- **Coaches' own unavailability** ("never Mondays"). That is data a coach
  writes about herself; `access/members/{uid}` is already self-writable, so it
  could live there.
- **Games involving another club** are fixed by a league or by both coaches.
  The planner should treat them as immovable and say so rather than offering to
  move them. (ROADMAP's *Opponents*, step 2, is the other club's half of this.)

### Constraints to keep

- **The rules.** Steps 1, 2 and 4's suggestions are reads. Booking is writes at
  `teams/{tid}/events/{eid}`, which the admin rule already grants, one entry
  per write, never a collection.
- **Not the orgs migration.** All of this works on `workspaces/{code}` as it
  is. CLAUDE.md's ordering puts roles and organisations after the correctness
  work, and nothing here needs them.
- **Children's names stay where they are.** The planner can say "3 families
  have children on both teams"; who they are is for admins and those teams'
  coaches, as everywhere else.

### Drills a player has done

*The join is now one lookup*: plans are keyed by the calendar entry's id, so
for each entry with a register (`teams/{tid}/attend/{eid}`), the drills in
`practices/{tid}/{eid}` count for each player marked present. The screen is
not built.

Wanted alongside attendance: each player's list of drills done. The register is
keyed by the calendar entry's id (`teams/{tid}/attend/{eid}`), so if a practice
plan is keyed by the same id, "drills she has done" is the drills on the plans
of the practices she came to. A plain join, with no data about the child stored
twice. Decided (2026-10-03): plans are keyed by the calendar entry's id, and new ones
already are. Moving the old ones and reading when and where from the entry is
step 1 of `TRAINING-NEXT.md`; build the screen after that.
