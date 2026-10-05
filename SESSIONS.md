# Training sessions: 1-1s, small groups, the fields, and the admin

Written before the code, for the reason `AUTH.md` and `TRAINING.md` give: the
data model and the rules have to be right first. This adds six nodes under
`training/{code}` and a list under the club's settings, and a mistake in who
can read a fee or write a booking is expensive to take back.

The owner's ask, 2026-10-03: *schedule 1-1 and group sessions for training.
They are not team-specific; players come from any team, and they train all
kinds of things. Sometimes the girls bring their own desired drills, but
normally the coach brings the plan. Handle the planning, the scheduling and
the admin of it: fees and who has paid, coach hours, clashes over fields and
times, reminders to families, and a list of the fields we hold permits for,
and when, each with a profile of its own.* Sessions count on the player's
record, beside team attendance.

---

## What people are trying to do

- **A coach** offers Tuesday 5pm as a 1-1 slot and a Thursday finishing group
  for six U11–U13 players. She books two girls herself, leaves the other spots
  open, and families ask for them. She brings the drills, unless the family
  has said what she wants to work on, and then she plans around that.
- **A family** sees the open sessions that suit their daughter's age, asks for
  a spot, says what she wants to work on, and finds out whether she is in.
  They can see what they owe.
- **The club admin** sees every session, who has paid, how many hours each
  coach ran this month (and what that comes to, if the coach is paid by the
  hour or the session), and whether anything is booked on a field outside the
  permit or on top of something else.

## The pieces

| Piece | What it is | Lives in |
| --- | --- | --- |
| **Session** | One dated 1-1 or group: when, where, who runs it, how many spots, price, ages, open for requests or not | `training/{code}/sessions/{sid}` |
| **Booking** | One player's place in one session, and how it stands | `training/{code}/booked/{sid}/{pid}` |
| **Register** | Who came, taken by the coach | `training/{code}/came/{sid}` |
| **Fee** | What was paid for one player's place | `training/{code}/fees/{sid}/{pid}` |
| **Pay rate** | What a coach is paid, per hour or per session | `training/{code}/pay/{uid}` |
| **Session plan** | The drills, in order | `training/{code}/splans/{sid}` |
| **Field** | A place the club trains, with its permits | `workspaces/{code}/access/org/venues/{fid}` |

### Why outside the workspace

The same three reasons `TRAINING.md` gives for practice plans, and one more:

1. Every phone reads the whole workspace on connect. Fees, pay rates and a
   club's season of sessions do not belong on every parent's phone.
2. When this was written, the connect-time workspace read still replaced
   local state wholesale, and a session made offline under the workspace
   would have been wiped at the next connect. The workspace outbox has since
   closed that; sessions keep their own merge-on-read and their own pending
   marks, like practice plans and drills, and are sent again on every
   connect (`flushTraining()`).
3. A new rules block, not an edit inside the tested workspace block.
4. **A session belongs to no team.** Every per-team rule keys on `$tid`;
   there is no team to hang a 1-1 off.

Fields are the exception: they are club settings, the whole club may read them
(a field's name and address are on every session anyway), and only admins
change them, which is exactly what the rule on `access/org` already says. So
they need no new rule, as ROADMAP's *Next: planning for the club* proposed.

## The data

```
training/{code}/
  sessions/{sid}     { id, kind: 'one' | 'group', title, focus,
                       coach, coachName,                  // one coach's uid
                       date, start, end,                  // local, 'YYYY-MM-DD' and 'HH:MM'
                       field, place,                      // a field id, and/or free text
                       cap, ages: [lo, hi] | null,        // U-ages, inclusive
                       price, open,                       // open = families may ask
                       notes, series?, called?, by, at }
  booked/{sid}/{pid} { tid, st, by, at, want? }           // st below
  came/{sid}         { pid: true | false }
  fees/{sid}/{pid}   { paid, how, at, by, pack? }         // how: cash, card, transfer, waived, other, package
  packs/{tid}/{pid}/{id}   { id, n, price, kind, until?, paid, how, note?, at, by }   // kind: any, one, group
  packuse/{tid}/{pid}/{id}/{sid}   { by, at }             // one place of a package, used
  pay/{uid}          { rate, per: 'hour' | 'session' }
  splans/{sid}       { blocks: [ { drill: { shelf, id, v }, name, minutes, note } ], by, at }

workspaces/{code}/access/org/
  venues/{fid}       { id, name, address, pitches, surface, lights, notes,
                       permits: { {pmid}: { days: [0..6], start, end, from, until, ref, note } } }
  money              the currency sign fees are shown with, '$' by default
  packs              true while the club sells packages (admins switch it)
```

**A booking's `st`:**

| `st` | Means | Who sets it |
| --- | --- | --- |
| `asked` | The family asked for a spot | The family, while the session is open |
| `in` | Booked | The coach or an admin |
| `wait` | On the waiting list | The coach or an admin |
| `no` | Not this time | The coach or an admin |
| `out` | Withdrew, or was taken off | The family for her own child, or the coach |

A family can never set `in`. That is what makes the number of spots the
coach's to keep: a rule cannot count, so it cannot refuse the seventh place
in a group of six, but it can refuse anyone but the coach giving one.

**`want`** is the family's own words for what she wants to work on: *weak
foot, crossing, the rondo from last week*. That is how "the girls bring their
own desired drills" reaches the coach. Families never see the drill library
(`TRAINING.md`, settled 2026-10-02), so it is free text, up to 280 characters,
and the coach builds the plan from it.

**`pid` is unique across the club**, so a booking is keyed by player alone and
carries `tid` so the rule can find the player and her guardians. The rule also
refuses a family changing `tid` on a booking that exists.

**Bookings and the register are separate from the session** for the reason
`rsvp` is separate from the game: a coach saving a session writes the whole
session, and an ask stored inside it would be lost to any edit made while a
family was asking.

**Weekly sessions are one entry per week sharing a `series` id**, as weekly
practices are, so calling off one week is one write. Adding a player to "this
and every later one" writes one booking per session.

## Who can do what

| | Sessions | Bookings | Register | Fees | Pay rates | Plans | Fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admin | Make, change, call off any; run any | All | All | Read, mark paid | Read, set | All | Add, change |
| Coach (any team) | Make her own; change or call off what she runs | Hers | Hers | Hers: read, mark paid | Her own, read | Hers | Read |
| Parent | Reads every session in the club | Ask for, or withdraw, her own child | Reads | Her own child's, read | — | — | Read (names, addresses) |
| Tracker only | — | — | — | — | — | — | — |
| App owner | Only through a club role | | | | | | |

The coach who runs a session is the one named in it (`coach`), and she must
still be a coach (`access/coachIndex`) for her writes to count. An admin can
make a session for another coach, or move one to another coach; a coach can't
give her session away.

**What a family sees.** Her own children's bookings, how they stand, and what
she owes; the open sessions that suit her children's ages, with how many spots
are left; never another child's name or another family's fees. The database
allows the club to read `booked` and `came` in full, as it does `rsvp` and the
team registers today (the screen narrows it, the rule does not), because the
alternative is a listener per session per child on every parent's phone.
Fees are different: they are money, so the rules themselves narrow them to
the admins, the coach who ran the session, and the family of that child.

## Rules sketch

Everything sits at the depth the app writes it. A read granted on
`training/{code}` would hand every coach's fees to every parent, so there is
none.

- `sessions` — read: anyone in the club index (or a club with no index yet,
  as `schedule` does). `$sid` write: an admin; or a coach (in `coachIndex`)
  making one with `coach` = herself, changing one that names her and still
  names her, or deleting one that names her. Validated: `id` = `$sid`, a
  date, a coach, `kind` of `one` or `group`.
- `booked` — read: the club. `$sid` write: an admin, or that session's coach
  (a delete of the whole session's bookings goes here). `$pid` write, the
  family's clause: signed in as `by`, a guardian of `teams/{tid}/players/{pid}`
  in the workspace, not changing `tid`, the session exists, and either `out`,
  or `asked` while the session is `open` and the booking is absent, `asked`
  or `out` (not after the coach said `in`, `wait` or `no`).
- `came` — read: the club. `$sid` write: an admin or that session's coach.
  Each player is a boolean.
- `fees` — read on the whole: admins. `$sid` read and write: that session's
  coach. `$sid/$pid` read: a guardian of the child the booking names.
- `pay` — read on the whole and write: admins. `$uid` read: that coach.
- `splans/$sid` — read and write: an admin or that session's coach.

**The bridge fails closed**, as practices' does: with no `coachIndex` yet, only
admins make or run sessions. There is no older behaviour to fall back to.

## Clashes

Read-only, worked out on the phone from what it already holds:

- **Outside the permit.** A session at a field that lists permits, at a time
  no permit covers (wrong day, wrong hours, before `from` or after `until`).
  A field with no permits listed is not checked; there is nothing to check
  against.
- **The field is full.** More things at once at one field than it has pitches
  (`pitches`, 1 by default): other sessions, and team practices and games
  whose venue names that field.
- **The coach is busy.** She runs another session then, or coaches a team that
  has a practice or game then.
- **A player is busy.** A booked player's team has a practice or game then, or
  she is booked into another session.

Team entries' venues are free text, so a team entry is at a field when its
venue contains the field's name, ignoring case and punctuation ("Lakeside
Park, field 2" is at "Lakeside Park"). Entries with no time are left out:
"all day" can't be said to overlap.

## Fees and hours

- **A place owes the session's price once it's `in`** and the session isn't
  called off. A withdrawal (`out`) owes nothing. Whether a late withdrawal
  should still pay is the club's policy, not the app's; an admin who wants to
  charge it marks the fee by hand, and one who wants to let a family off marks
  it **waived**.
- **Marking paid writes one fee per place**: what was paid, how, when, and by
  whom. There are no card payments: this is a static site with no server, so
  it is the club's book of who has paid, not a till.
- **Packages** (built 2026-10-05, on the owner's ask, off until an admin
  turns them on): a number of sessions for a set price, sold to one player,
  for any session, 1-1s or groups, with an optional use-by date. Using a
  place is a way of paying it: the fee says `package` and names the package,
  and `packuse` marks the place, because that is what is counted and a coach
  can read only her own sessions' fees. A rule cannot count, so the app keeps
  the count, as it keeps a group's spots (`rules.js` prints it). Only admins
  sell or change one; the session's coach or an admin uses a place; the
  family reads her own child's and what is left; coaches read every package,
  to use one. A place is taken from the package that runs out first, never
  one past its use-by date, and given back when the fee is cleared or the
  place is no longer owed. **The places left at the use-by date** are the
  decision this section used to wait on: the app keeps them, says the
  package ended with places unused, and leaves what that means (a refund,
  an extension, nothing) to the club, which can change the date.
- **Coach hours** are the sessions each coach ran in a month: past, not called
  off, start to end. With a rate set (per hour or per session), the screen
  shows what that comes to, and copies as a table for whoever runs payroll.
  Team practices aren't counted: the app knows a team's coaches, not which of
  them ran Tuesday.

## Notices

- **On the screen, when it changes.** A family is told when her child's place
  is confirmed, waitlisted or turned down, and when a session she's in is
  moved or called off. A coach is told when a family asks for a spot or
  withdraws. The first read on a phone tells nobody anything; what is already
  there is not news.
- **To everyone now.** *Tell the families* writes the message (when, where,
  what changed) and offers email to the families' addresses in Bcc, a copy of
  the text, and, for families on a team where the sender is staff, a post in
  their family conversation. Messages are not push (CLAUDE.md, *Current known
  gaps*), so email is what reaches a closed phone.

## On the player's record

The register counts like a practice's: only once taken, only for something
that happened. The player's line reads *Extra sessions 3 of 4* beside her
practices and games, on the Season tab for her team's coach and on My players
for her family. Drills done in a session are the drills on its plan, the same
join ROADMAP describes for practices.

## Where it lives in the app

- **Club → Training sessions**, for admins, coaches and families. Four tabs
  for staff: *Sessions*, *Fields*, *Fees*, *Hours*. A family gets one list:
  hers, then the open ones, then what she owes.
- **The Calendar** shows a team's players' sessions to that team's coaches,
  and a family's own child's to her. They are not on the share link or the
  calendar feed: a 1-1 is a child, a time and a place.
- **Club settings** links to the fields.

## Offline

The session store is its own local copy (`sm.sess.v1:{club}`), merged on
read and never replaced wholesale, the same as practice plans. A change this
phone has made and the club hasn't acknowledged is marked dirty, is never
overwritten by the club's copy, and is sent again on the first answer after
attaching. A family's ask that the database refuses is taken back off the
screen with a message, as an RSVP is.

## Not built yet, and why

- **Two coaches on one session.** One `coach` keeps every rule a single hop.
- **Outside trainers** who aren't in the club. They'd need an account and a
  role that isn't "coach of a team", which is `AUTH.md`'s territory.
- **Field-level pitches** (field 2 of Lakeside). Clashes count against the
  field's number of pitches, not a named pitch.

## Bulk import

Built after the first version, on the owner's ask. The admin's bulk import
takes `fields` and `sessions` lists beside `teams` (README, **Bulk import**),
with the promises the rest of the importer keeps: checked first, nothing
written while an error is left, matched against what is here so a second run
changes nothing, and nothing removed. A field is matched by name and its
permits are only added to. A session is matched by date, start and coach,
which is what a coach would call "the same session"; a booking already here
is the coach's and is left as it is. Fields go out with the workspace writes;
sessions and bookings go through the session store, so an import made offline
is owed and resent like a session made by hand.

## Bookable times

Built after, on the owner's ask: a coach's windows that families book a slot
of themselves. A booked slot is one of these sessions, made by the family
under an id built from its time. `AVAILABILITY.md` is the design.

## Build order

1. The rules and `test/rules.js` cases, before any code writes the nodes.
2. The store, its merge-on-read and listeners.
3. Sessions, bookings and the family's ask.
4. The register and the player's record.
5. Fields and permits, then clashes.
6. Fees, then hours.
7. Plans and notices.
