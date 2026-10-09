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
| Its booking | The child, `in` or `wait`, written by the server | `training/{code}/booked/{sid}/{pid}` |
| **An ask** | A family asking the server to book or cancel; the answer is written beneath it | `bookAsks/{code}/{uid}/{id}` |

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
                  day0,                                      // the coach's phone's midnight that day, epoch ms
                  note, series?, off?, by, at }
  sessions/k_{coach}_{date}_{HHMM}
                { ...a session, kind, cap, open: false,
                  slot: bid, t0, price, notice,              // copied from the block by the server
                  pid, tid, by }                             // the first family, and her child
  booked/{sid}/{pid}  { tid, st: 'in' | 'wait', by, at, want? }
bookAsks/{code}/{uid}/{id}
                { op: 'book', block, start, tid, pid, want?, wait?, at }
              | { op: 'cancel', sid, pid, at }
                answer: { ok, st?, sid?, why?, at }          // the server's alone
```

`off: true` is a block taken off for that week: still on the coach's
calendar, offering nothing.

A window written before build 117 also carries `slots` (each slot's start,
as a timestamp) and `seats` (a key per place), which the old rules read. The
server uses `slots` for a window with no `day0`; nothing writes either any
more, and a block saved again drops them.

## Booking is one call to the server (build 117)

Until build 117 a family's phone booked a slot itself, in three writes the
rules held one at a time: the session (first family only), a numbered seat,
and her child's booking naming it. A rule can look things up but cannot
count, search or do dates, so the block had to carry what they looked up (the
slots it still offered, worked out on the coach's or an admin's phone by
`healBlocks()`; a seat key per place), and three things stayed open: a
practice added from another phone was bookable until one of theirs next drew
the app, a seat taken with no booking behind it waited ten minutes for the
coach's phone to let it go, and one child could hold two seats by hand. A
full slot could only say no.

Now her phone asks (`askBooking()`), and the server (`functions/book.js`,
`bookAsk`) answers beneath the ask:

| What it checks | How |
| --- | --- |
| She is in the club, and a guardian of the child | The club's index, and the child's `guardians` on the squad |
| On the grid | The start is one the window's start, end and `len` give |
| Not in the past | The slot's start, from `day0` (or an older window's `slots`), is after now |
| Not a week taken off | The block isn't `off`, and the slot's session isn't called off |
| The coach is free | Her teams' practices and games, the other sessions she runs, her time off and her shared busy times at other clubs, as the club stands now; a call-out frees her from its entry. A slot already held needs no second check |
| The child is free | Her team's practices and games, and any other session she is in, asking for or waiting on |
| No more children than places | Counted inside one transaction on the slot's bookings, which are keyed by child, so a child is in once and two families never both get the last place |
| The coach's price, size and notice | Copied from the block onto the session the server makes |
| Cancel only before the notice | A place `in` is given back only `notice` hours or more before; a place on the waiting list any time before it starts; nothing paid for or marked |

**A full slot has a waiting list.** A family asks to wait, and is put on it
in the order she asked. When a place comes free (a family cancels, the coach
takes a child off or turns one down), the server moves the first on the list
in (`bookFreed`), in the same kind of transaction. Only on a booked slot: on
an ordinary session the waiting list is the coach's to work through.

**The rules now hold a family to asking.** She writes only her own ask
(`bookAsks/{code}/{uid}`, in a club she is in, never the answer), and never
a slot's session or booking: on an ordinary session she still asks and
withdraws herself, as before. `seats` is gone from the rules and the app.

## Who can do what

| | Blocks | Book a place | Cancel a place | The slot's session afterwards |
| --- | --- | --- | --- | --- |
| Admin | Any coach's: make, change, take off, delete | — | Any | As any session |
| Coach (any team) | Her own | — | Her own sessions' (as any session she runs) | Runs it |
| Parent | Reads every block in the club | Asks the server, for her own child | Asks the server, her own child's, before the notice | Reads it, as any session she's in |
| Tracker only | — | — | — | — |

## Rules sketch

- `avail/$bid` — read: the club. Write: the same clause as `sessions/$sid`
  (an admin; or a coach in `coachIndex` writing a block that names her).
  Validated: `id` = `$bid`, coach, date, start and end as `HH:MM`, `kind` one
  or group, `cap` 1–60 and 1 for a 1-1, `len` 15–240, `price` ≥ 0, `notice`
  0–168, `day0` a number.
- `sessions/$sid` and `booked/$sid` — an admin, or the session's coach. A
  family writes `asked` or `out` on an ordinary session only, never on a
  booked slot.
- `bookAsks/$code/$uid/$id` — read: that account. She makes an ask in her
  own name in a club she is in, stamped within ten minutes of now (a phone's clock can be out), of the shape
  above, and deletes it once answered; she never writes `answer`.

**The bridge fails closed**, as sessions' does: no `coachIndex` yet, only
admins make blocks; no functions deployed, nobody answers, and a family's
phone says there was no answer.

## What is still the app's

- **A coach going over.** The coach can add players past the places
  herself; that is her call, as it is on any session.
- **What a family's phone offers.** It shows a slot as free from what it can
  see; the coach's time off is not on a family's phone, so a slot she is off
  for is offered and the server says no.

## Synced with the teams' calendars

- **A coach's team calendar is her busy time.** A practice or game for any
  team she coaches takes out the slots it overlaps, and so do the sessions
  she runs: on every phone at once, and at the server the moment a family
  asks.
- **A booked slot is on the team calendar**, for that team's coaches and the
  child's family, as every session already is (`sessCalItems()`), and never on
  the share link or the feed.
- **A child's own team is checked too.** A slot that overlaps her team's
  practice or game is shown to her family as taken by it, and refused by the
  server.

## Booking needs a signal

Booking is first come, first served. Every other family write here can wait
in a queue; a booking that waited would be a promise the app can't keep. With
no signal her phone does not ask; an answer that does not come in thirty
seconds is said as that, not as a no (if the place was hers it appears
anyway). Her phone takes back an ask it stopped waiting for, and the server
leaves alone one that has been taken back, or is more than ten minutes old.

## A calendar of your own

There is one Calendar, the person's, on its own button up top beside
Messages and the account, and **My calendar** is what it opens on (also
*Calendar* on Club home for anyone but an admin, *My calendar* in the account
menu, and `#/calendar`; `#/my-calendar` still lands there). A team on its own,
which is what the share link mirrors, is that team ticked alone on All teams,
where its Season's link goes. My calendar is the person's:

- every team she coaches or tracks, and every team a child of hers is on,
  with their games, practices and events;
- the sessions she runs, and her children's sessions;
- for a coach, her bookable times.

A chip per child, and one for her coaching, narrows it. It reads from the
same lists All teams does, so there is nothing to keep in step: an entry
exists once, under its team or in `training/`, and whichever is ticked draws
it. A parent has it and nothing to choose; All teams is offered beside it
only to whoever can see more teams than her own. It stays out of the
top-left club switcher: that button is about which club you're in, and a
calendar is about you, whichever club is open.

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
calendar is too much.* So there is one Calendar, which was briefly the first
tab of every team (build 102), with My calendar a choice at its top beside
the open team and All teams.

Followed up again the next day: *the calendar is in a weird spot. The
calendar is versatile and not tied to one team, not even one club, it is per
person.* So the Calendar is the person's (build 103): its own button up top,
beside Messages and the account, its top row **You › Calendar** again, and
it opens on My calendar, with All teams beside it for whoever can see more
teams than her own. What My calendar holds is unchanged. A team's own tabs
are Season, Squad and Practice; Season leads with the game being played, the
next game and the next practice, and links to the Calendar with that team
alone on it.

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
  coming, needs a feed that isn't world-readable by address: a function
  reading the club's own data behind a private link, its own piece of work
  (`SERVER.md`).
- **A waiting list on a full group.** A family can ask for a place on any
  session the coach leaves open; a full slot just isn't offered.
- **Late-cancellation charges**: the club's policy, marked by hand as fees
  are today. Packages are built (`SESSIONS.md`), and a booked slot's place
  comes off one like any session's.
