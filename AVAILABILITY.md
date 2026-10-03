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

The team Calendar tab stays: it is what a team's coach plans on and what the
share link mirrors. Beside it, **My calendar** (Club home, first card; a link
on each team's Calendar; `#/my-calendar`) is the person's:

- every team she coaches or tracks, and every team a child of hers is on,
  with their games, practices and events;
- the sessions she runs, and her children's sessions;
- for a coach, her bookable times.

A chip per child, and one for her coaching, narrows it. It reads from the
same lists the team calendar does, so there is nothing to keep in step: an
entry exists once, under its team or in `training/`, and both calendars draw
it. It stays out of the top-left club switcher: that button is about which
club you're in, and a calendar is about you within it.

## Not built yet, and why

- **A personal calendar feed** to subscribe to. The feed Worker reads only
  `public/`, and a person's calendar has children's names and 1-1s in it. A
  `.ics` per item is offered, as it is for sessions.
- **A waiting list on a full group.** A family can ask for a place on any
  session the coach leaves open; a full slot just isn't offered.
- **Packages and late-cancellation charges**: the club's policy, marked by
  hand as fees are today.
