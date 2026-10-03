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

## What people are trying to do

- **A coach** says "I'm free for 1-1s Tuesdays 5–7pm at Lakeside, an hour
  each, $30" for the next eight weeks, and is done. She doesn't want to make
  sixteen sessions and answer sixteen asks.
- **A family** opens the app, sees that Coach Jaz has 6pm next Tuesday free,
  taps it, says what Ella wants to work on, and it's booked. No waiting on a
  reply. If something comes up, she cancels, and the time is free again.
- **The admin** can set or change any coach's times, as she can any session.
- **Everyone** sees one calendar of their own: a parent her children's games,
  practices and sessions across every team they're on; a coach her teams,
  the sessions she runs and the times she's offered.

## The pieces

| Piece | What it is | Lives in |
| --- | --- | --- |
| **Bookable time** (a block) | One coach, one date, a window (`start`–`end`), cut into slots of `len` minutes | `training/{code}/avail/{bid}` |
| **A booked slot** | An ordinary 1-1 session, made by the family, whose id says which coach, day and start it is | `training/{code}/sessions/k_{coach}_{date}_{HHMM}` |
| Its booking | The family's child, `in` | `training/{code}/booked/{sid}/{pid}` |

**A booked slot is a session.** Everything `SESSIONS.md` built — the coach's
list, the register, fees, coach hours, clashes, notices, the player's record,
the team calendar — works on it unchanged, because it is one. The only new
data is the block.

**Weekly times are one block per week sharing a `series` id**, exactly as
weekly practices and weekly sessions are, so "not next Tuesday" is one write
to one block, and the rule can check a slot against a single date.

## The data

```
training/{code}/
  avail/{bid}   { id, coach, coachName, date, start, end,   // 'YYYY-MM-DD', 'HH:MM'
                  len,                                     // slot minutes: 30, 45, 60, 90
                  field, place, price, ages: [lo, hi] | null,
                  notice,                                  // hours before start a family can still cancel
                  note, series?, off?, by, at }
  sessions/k_{coach}_{date}_{HHMM}
                { ...a session, kind: 'one', open: false,
                  slot: bid, pid, tid, by }                // by = the family who booked it
  booked/{sid}/{pid}  { tid, st: 'in', by, at, want? }
```

`off: true` is a block called off for that week: still on the coach's
calendar, offering nothing.

## Why the slot's id is its time

A rule cannot count, and cannot search, so it cannot say "nothing else is
booked at 6pm". It can say "this key does not exist yet". The session's id
is built from the coach, the date and the start time, and the rule checks
that it was built that way, so two families tapping 6pm at once write the
same key and the database lets exactly one of them in. The second is refused
and her phone says the time has just gone.

That makes booking a slot need a signal, as starting a club does. Every other
family write here can wait in a queue; a first-come-first-served write that
waited would be a promise the app can't keep.

## Who can do what

| | Blocks | Book a slot | Cancel a slot | The slot's session afterwards |
| --- | --- | --- | --- | --- |
| Admin | Any coach's: make, change, call off, delete | — | Any | As any session |
| Coach (any team) | Her own | — | Her own (as any session she runs) | Runs it |
| Parent | Reads every block in the club | For her own child, inside a block, on a free slot | Her own booking, before the block's notice | Reads it, as any session she's in |
| Tracker only | — | — | — | — |

## Rules sketch

- `avail` — read: the club. `$bid` write: the same clause as `sessions/$sid`
  (an admin; or a coach in `coachIndex` writing a block that names her and
  still names her). Validated: `id` = `$bid`, a coach, a date, a start and an
  end; `len` 15–240, `price` ≥ 0.
- `sessions/$sid` gains a family clause, for **creating** a slot only:
  signed in as `by`; a guardian of `teams/{tid}/players/{pid}`; the block
  `slot` names exists, isn't `off`, names the same coach and the same date;
  `start` ≥ the block's start, `end` ≤ its end, `start` < `end` (all
  `'HH:MM'`, so string order is time order); the price is the block's; `kind`
  is `one` and it isn't `open`; and `$sid` is
  `'k_' + coach + '_' + date + '_' + start without the colon`. Nothing there
  before (`!data.exists()`).
  And for **deleting** one: she made it (`by`), it is a slot, and it has no
  bookings, register or fees left.
- `booked/$sid/$pid` gains two family clauses: writing `in` where nothing was,
  on a slot session she made for this child; and deleting her own booking on
  one.

**The bridge fails closed**, as sessions' does: no `coachIndex` yet, only
admins make blocks; no `avail` rule published, nothing is offered.

## What the rules leave to the app

Said in `rules.js`'s list at the end, beside the other deliberate ones:

- **The slot grid.** The rule checks that a slot sits inside the coach's
  window, not that it starts on the grid or is `len` long. A hand-made write
  could book 6:15–6:45 beside a 6:00–7:00. Its coach sees both on her list
  and the clash on each.
- **That the coach is free.** A slot is offered only where she has no
  session and no practice or game with a team she coaches; the rule can't
  see either. Something added to her team's calendar after a slot was booked
  shows as a clash on the slot, as it would on any session.
- **The cancellation notice.** Rules can't turn `'2026-10-07'` into a time,
  so "not within 24 hours" is the screen's to keep. A family who needs to
  cancel later messages the coach, who can still take her off.

## Synced with the teams' calendars

- **A coach's team calendar is her busy time.** A practice or game for any
  team she coaches takes out the slots it overlaps, and so do the sessions
  she runs. Add a practice on Tuesday at six and the six o'clock slot stops
  being offered; nobody has to edit the block.
- **A booked slot is on the team calendar**, for that team's coaches and the
  child's family, as every session already is (`sessCalItems()`), and never on
  the share link or the feed.
- **A child's own team is checked too.** A slot that overlaps her team's
  practice or game is shown to her family as taken by it.

## A calendar of your own

The team Calendar tab stays: it is what a team's coach plans on and what the
share link mirrors. Beside it, **My calendar** (Club home, first card; and
`#/my-calendar`) is the person's:

- every team she coaches or tracks, and every team a child of hers is on,
  with their games, practices and events;
- the sessions she runs, and her children's sessions;
- for a coach, her bookable times, each saying how many slots are taken.

A chip per child (or per team) narrows it. It reads from the same lists the
team calendar does, so there is nothing to keep in step: an entry exists
once, under its team or in `training/`, and both calendars draw it.

It stays out of the top-left club switcher: that button is about which club
you're in, and a calendar is about you within it.

## Not built yet, and why

- **Group slots** (a block that takes four at a time). One child per slot
  keeps the "key is the time" trick; a group would need a count, which is the
  coach's to keep (`SESSIONS.md`).
- **A personal calendar feed** to subscribe to. The feed Worker reads only
  `public/`, and a person's calendar has children's names and 1-1s in it. A
  `.ics` per item is offered, as it is for sessions.
- **Packages and late-cancellation charges**: the club's policy, marked by
  hand as fees are today.
