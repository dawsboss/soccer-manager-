# Coaches' bookable times, and a calendar of your own

Written before the code, for the reason `AUTH.md`, `TRAINING.md` and
`SESSIONS.md` give: it adds a node under `training/{code}` and a second way
into `sessions` and `booked`, and a mistake in who may write a booking is
expensive to take back.

The owner's ask, 2026-10-03: *training sessions should have a calendar, and
coaches have block-out times — they can be booked from this time to this time,
and have a schedule. Admins and coaches should be able to edit that. But a
parent can book whatever is in there. Make sure this is synced with the
teams' calendars. Maybe the calendar gets pulled out somewhere else, because
a calendar is not team-specific but person-specific.*

---

Followed up the same day: *slots should be for groups or 1-1*, and *the rules
should also block some of that stuff* — the things the first version left to
the app. This document is the version after both.

---

## What people are trying to do

- **A coach** says "I'm free for 1-1s Tuesdays 5–7pm at Lakeside, an hour
  each, $30" for the next eight weeks, or "a finishing group of six on
  Saturday mornings", and is done. She doesn't want to make sixteen sessions
  and answer sixteen asks.
- **A family** opens the app, sees that Coach Jaz has 6pm next Tuesday free
  (or two places left in Saturday's group), taps it, says what Ella wants to
  work on, and it's booked. No waiting on a reply. If something comes up, she
  cancels, and the place is free again.
- **The admin** can set or change any coach's times, as she can any session.
- **Everyone** sees one calendar of their own: a parent her children's games,
  practices and sessions across every team they're on; a coach her teams,
  the sessions she runs and the times she's offered.

## The pieces

| Piece | What it is | Lives in |
| --- | --- | --- |
| **Bookable times** (a block) | One coach, one date, a window cut into slots of `len` minutes; 1-1s or a small group of `cap` | `training/{code}/avail/{bid}` |
| **A booked slot** | An ordinary session, made by the first family to book it, whose id says which coach, day and start it is | `training/{code}/sessions/k_{coach}_{date}_{HHMM}` |
| **A seat** | One place in that slot, held by one child | `training/{code}/seats/{sid}/{s1…}` |
| Its booking | The child, `in`, naming her seat | `training/{code}/booked/{sid}/{pid}` |

**A booked slot is a session.** Everything `SESSIONS.md` built — the coach's
list, the register, fees, coach hours, clashes, notices, the player's record,
the team calendar — works on it unchanged, because it is one.

**Weekly times are one block per week sharing a `series` id**, exactly as
weekly practices and weekly sessions are, so "not next Tuesday" is one write
to one block.

## The data

```
training/{code}/
  avail/{bid}   { id, coach, coachName, date, start, end,     // 'YYYY-MM-DD', 'HH:MM'
                  kind: 'one' | 'group', cap, title,         // a 1-1 has cap 1
                  len,                                       // slot minutes: 30, 45, 60, 90
                  field, place, price, ages: [lo, hi] | null,
                  notice,                                    // hours before start a family can still cancel
                  slots: { t1700: { end: '18:00', at }, … }, // what it offers; at = the start, epoch ms
                  seats: { s1: true, … },                    // one key per place
                  note, series?, off?, by, at }
  sessions/k_{coach}_{date}_{HHMM}
                { ...a session, kind, cap, open: false,
                  slot: bid, t0, price, notice,              // copied from the block, exactly
                  pid, tid, by }                             // the first family, and her child
  seats/{sid}/{s1}    { pid, tid, by, at }
  booked/{sid}/{pid}  { tid, st: 'in', by, at, seat, want? }
```

`off: true` is a block taken off for that week: still on the coach's
calendar, offering nothing (`slots` is empty).

Keys are `s1` and `t1700`, never `1` and `1700`: the database hands back an
object whose keys are mostly small integers as an array.

## What the rules hold a family to

A rule can look things up; it cannot count, search, or do date arithmetic.
So the block carries what the rule needs to look up, and the rest follows:

| The app's promise | How the rule keeps it |
| --- | --- |
| One family makes a slot | The slot's id is built from its coach, date and start, checked, and must not exist yet |
| On the grid, the slot's length | Its start must be a key of the block's `slots`, its end that slot's `end` |
| Not in the past | `t0` must equal the slot's `at`, and be after `now` |
| Not when the coach is busy | The slot must still be in `slots`, which leaves out what she's busy with (below) |
| No more children than places | A child takes a seat; a seat that exists can't be taken again; there are `cap` seat keys |
| The coach's price, size and notice | `price`, `cap`, `kind`, `notice` must equal the block's |
| Not a week taken off | The block isn't `off` |
| Cancel only before the notice | Deleting or withdrawing a booking needs `t0 - now ≥ notice` hours |
| Only her own child | Every family write checks the child's `guardians` |

**`slots` is derived, and kept so by the coach's phone and the admins'.**
Whenever one of them draws the app, `healBlocks()` works out each upcoming
block's slots from its window, leaving out any that overlap a practice or
game of a team she coaches or a session she runs, and writes the block only
if that differs. The same phones let go of seats nobody is using: a child
taken off or turned down, or a seat held ten minutes with no booking behind
it. This is the lookup tables' pattern: derived, rebuilt, never typed.

## Who can do what

| | Blocks | Book a place | Cancel a place | The slot's session afterwards |
| --- | --- | --- | --- | --- |
| Admin | Any coach's: make, change, take off, delete | — | Any | As any session |
| Coach (any team) | Her own | — | Her own sessions' (as any session she runs) | Runs it |
| Parent | Reads every block in the club | For her own child, in a slot the block lists, on a free seat | Her own child's, before the notice | Reads it, as any session she's in |
| Tracker only | — | — | — | — |

## Rules sketch

- `avail/$bid` — read: the club. Write: the same clause as `sessions/$sid`
  (an admin; or a coach in `coachIndex` writing a block that names her).
  Validated: `id` = `$bid`, coach, date, start and end as `HH:MM`, `kind` one
  or group, `cap` 1–60 and 1 for a 1-1, `len` 15–240, `price` ≥ 0, `notice`
  0–168, each slot `{ end, at }`, each seat `true`.
- `sessions/$sid` — a family **creates** a slot only as the table above
  says, and **deletes** one only if she made it and nobody holds a seat or a
  booking on it, and there's no register or fee.
- `seats/$sid/$n` — read: the club. The session's coach or an admin writes
  any. A family takes `$n` if nobody holds it, the block has that seat key,
  the slot is still listed, the session isn't called off and hasn't started,
  for her own child in her own name; she lets it go once her booking is gone.
- `booked/$sid/$pid` — a family writes `in` where nothing was, for her own
  child, on a slot that hasn't started, naming a seat she holds for that
  child; deletes her own child's booking, or marks it `out`, only before the
  notice.

**The bridge fails closed**, as sessions' does: no `coachIndex` yet, only
admins make blocks; no `avail` rule published, nothing is offered.

## What is still the app's

Said in `rules.js`'s list at the end, beside the other deliberate ones:

- **How fresh `slots` is.** It is as current as the last time the coach's
  phone or an admin's drew the app. A practice added by another of the
  team's coaches is bookable by a hand-made write until then; the app itself
  checks the clash on every phone and never offers it.
- **A second seat for one child.** A hand-made write can hold two seats for
  one child (her booking names one). The coach's phone frees a seat with no
  booking behind it after ten minutes.
- **A coach going over.** The coach can add players past the seats herself;
  that is her call, as it is on any session.

## Synced with the teams' calendars

- **A coach's team calendar is her busy time.** A practice or game for any
  team she coaches takes out the slots it overlaps, and so do the sessions
  she runs: on every phone at once, and from the rules' list when her phone
  or an admin's next opens the app.
- **A booked slot is on the team calendar**, for that team's coaches and the
  child's family, as every session already is (`sessCalItems()`), and never on
  the share link or the feed.
- **A child's own team is checked too.** A slot that overlaps her team's
  practice or game is shown to her family as taken by it.

## Booking needs a signal

Making a slot and taking a seat are first come, first served. Every other
family write here can wait in a queue; a booking that waited would be a
promise the app can't keep. A family who loses a race is told to pick again
and nothing is left on her screen.

## A calendar of your own

There is one Calendar, the first tab of every team, and **My calendar** is a
choice at its top (also *Calendar* on Club home for anyone but an admin,
*My calendar* in the account menu, and `#/my-calendar`). The open team on its
own is what a team's coach plans on and what the share link mirrors; My
calendar is the person's:

- every team she coaches or tracks, and every team a child of hers is on,
  with their games, practices and events;
- the sessions she runs, and her children's sessions;
- for a coach, her bookable times.

A chip per child, and one for her coaching, narrows it. It reads from the
same lists the team's does, so there is nothing to keep in step: an entry
exists once, under its team or in `training/`, and whichever is ticked draws
it. It is offered only when it holds more than the open team: a parent with
one child on one team has one calendar and nothing to choose. It stays out of the top-left club switcher: that button is about which
club you're in, and a calendar is about you within it.

## My calendar is yours, not a club's

Followed up 2026-10-04: *My calendar should be to my account, so no club
included, since if I work for more than one my calendar becomes more complex.
Then when people need to know my availability they can without going to
another club's page. But some people want privacy, so there should be a
default private, and they can make it public if they want.*

Followed up again the same day: *a phone should be a part of as many clubs as
it wants.*

So My calendar moves out of the club: it opens from the account button as
well as the club page, and it carries every club the account is in.

Followed up 2026-10-06: *having a team calendar, club calendar and my
calendar is too much.* So there is one Calendar, the first tab of every team,
and My calendar is a choice at its top beside the open team and All teams.
What it holds is unchanged; its top row is now the team's (Club › Team), as
the Calendar is a team's tab whatever is ticked on it, the way a calendar app
is the same app whichever calendars it shows.

**A phone is in every club its account is in.** The one on screen is synced
in full, exactly as before (its outbox, its lookup tables, everything). Every
other club in `userOrgs` is listened to as well, read-only, for what My
calendar and "who is free" need of it: its teams, games and access, and its
sessions, bookings and bookable times (`watchMirror()`). That copy is cut down
before it is kept (`mirrorSlim()`): her own children and not the squad, every
game's when and where but not its stints or goals, her own bookable times and
her own children's bookings. It is kept on the phone per account
(`sm.mirror.v1:{uid}`) so My calendar has every club with no signal, says "as
of" for a club it hasn't heard from this session, and is forgotten on sign-out.
My calendar runs each club's own calendar code against its copy for a moment
(`withClub()`), so an entry looks the same whichever club is open. Switching
which club is on screen still reloads the page; that is the one place a
phone still works on one club at a time.

Nothing about a club is written anywhere new for this: the phone reads what
it is already allowed to read.

```
people/{uid}/
  set           { share: true | false, at }                                  // her eyes only
  busy/{tag}    { at, b: { i1: { d, s, e }, … } }                             // anyone signed in
```

- `set.share` is **off unless she turns it on**, and only she can read it.
- `busy/{tag}` is her busy times, **and nothing else**: a date, a start and
  an end. No title, no place, no team, no club. The rule refuses any other
  field, so a later change to the app cannot put one there by accident, and
  refuses any busy time at all while `set.share` is not `true` — private is
  enforced by the database, not by her phone's goodwill. Turning sharing off
  deletes the lot. `{tag}` is `clubTag(code)`, the one-way tag drill links
  already use, so a club's code never leaves it this way, and a viewer in
  one of her clubs can leave out the times of the club she is looking from
  (she sees those in full already). Her phones write it (`youPublish()`),
  which means a change in one club reaches the others only while one of her
  phones is open: a server's job, done by a phone until there is one
  (`SERVER.md`, *Busy at another club*).

## Alerts from every club

Followed up 2026-10-05: *people should still have a way to get notifications
for all clubs, and when clicked it moves them over to that club, so a coach can
respond to a parent quicker. Cancelled games can interrupt your current view of
another game.*

A phone that is in several clubs already listens to each of them (above), so
it hears from all of them too:

- **Messages.** Each other club is listened to as its own inbox would be: a
  coach every family's conversation on the teams she coaches, a family her own
  conversation and her children's teams' notices (`watchElseMessages()`,
  running the club's own `msgTeams()` against its copy). The open club's inbox
  is unchanged; its new messages become alerts too.
- **Her calendar.** A game, practice or event of hers (a team she coaches or
  tracks, or a child of hers is on) called off, back on, moved or new, in any
  club, the open one included (`calAlerts()`). A weekly series is one alert.
  An admin hears the open club's changes from club activity instead, not twice.
- **Interrupting.** An alert pops up (system notification, buzz, toast) and
  then sits in a bar above whatever is on screen, a game included, until she
  opens or dismisses it; called off and moved by a day or half an hour are
  drawn as urgent. **Open** goes where it happened: in the open club straight
  to the conversation, the game or the team's calendar; in another club by
  switching to it with that place on the address, so the page comes back
  there after the reload.
- **The bell** counts every club's: unread conversations and notices in the
  other clubs, and calendar alerts not yet looked at. The inbox has a *From
  all your clubs* card with each club's unread and the latest alerts.
- **Not news:** the first look at a club or a conversation (opening the app
  never fires a week of alerts), anything this phone did itself, anything in
  the past. Kept per account (`sm.alerts.v1:{uid}`), forgotten on sign-out.
- **Only while the page is open.** A closed phone hears nothing; that is push,
  and push needs a server (`SERVER.md`, *Alerts from every club*).

**Who sees what.** With sharing off (the default) a coach is exactly as
before: each club sees what she does in that club and nothing of the other.
With it on, the coaches and admins of every club she is in see that she is
busy then, as *busy at another club*, wherever this app already asks who is
free: find a time, the planner's clashes, covering a call-out, a session's
clashes, and her own bookable slots. Her **Calendar** on People shows the
next fortnight of it. Families never see it.

**What the rules cannot hold.** Anyone signed in who knows her uid can read
her shared busy times; a uid is only ever shown to people in a club with
her, but it is not a secret. That is what *shared* means, and the switch
says so.

## Not built yet, and why

- **A personal calendar feed with names in it.** *Built without them
  (2026-10-05)*: My calendar's *Turn on calendar sync* publishes the whole of
  it, every club, to `public/{id}` with no child's name and no club code
  (`README.md`, **Calendar sync**). One with her children's names, or who is
  coming, needs a feed that isn't world-readable by address, which means the
  Worker holding a credential, a different project (`SERVER.md`).
- **A waiting list on a full group.** A family can ask for a place on any
  session the coach leaves open; a full slot just isn't offered.
- **Late-cancellation charges**: the club's policy, marked by hand as fees
  are today. Packages are built (`SESSIONS.md`), and a booked slot's place
  comes off one like any session's.
