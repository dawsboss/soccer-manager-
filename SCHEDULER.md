# The scheduler: laying out the club's week before anything is written

Written before the code, for the reason `AUTH.md`, `TRAINING.md`,
`SESSIONS.md` and `AVAILABILITY.md` give: it decides what an admin sees when
she places a season's practices, adds a club setting, and writes a term of
entries onto every team's calendar in one go. Getting the shape wrong means
twelve teams' calendars to put right by hand.

The owner's ask, 2026-10-15: *right now the Calendar does a lot. I want to
remove some from that page. Admins schedule practices, games and events, and
right now the Calendar mentions when there are overlaps. Maybe that's fine,
but I don't want that to be where admins figure it out. I want a dedicated
scheduler for them. A team has x practices a week; we have access to y fields
on week z; and then they place them, or an algorithm does for them. The big
thing being a coach does drive crazy from a field across the city to another.
So maybe we leave it to them to schedule, but something that lays it out
rather than an add button to find out later you messed up. Practices overlap
on purpose: shared fields and locations.*

The owner's three decisions, the same day, on the questions the first draft
left open: *Planner* goes (*it feels overloaded, given that coaches plan with
drills and plan their lineups for games*); fields are shared in many ways,
so **nothing limits how many practices share a pitch**; and coaches get the
board read-only, their own teams lit, and **can confirm their slots**. This is
the version after those.

---

## What is wrong today

Everything the scheduler needs is already in the club. What is missing is a
place to look at it before writing, instead of after.

- **The Calendar tells admins about the week after the fact.** On *All teams*
  an admin gets *The club, 12 Sep – 18 Sep* under the calendar
  (`clubWeekCard()`): how many games and practices, how many on a shared
  field, how many with no pitch left, which teams have no practice, and
  *Still to settle*. It is a report on a week already written, drawn on a
  screen every role opens to see what is on. The owner's point: that is the
  wrong place for the admin's bookkeeping, and the calendar should be a
  calendar.
- **Adding is a `+`.** A practice is added one team at a time, from the
  team's sheet (`sheetCalEvent()`), and the week's problems show up only once
  it is on the calendar. A coach's two teams on two fields the same evening
  is found by the coach, in the car.
- **The Planner is a list of questions, not a picture.** Settings → *Planner*
  (`viewPlanner()`, ROADMAP *Next: planning for the club*, built 2026-10-04)
  has *Clashes* (a list over 7, 14 or 28 days), *Find a time* (a slot search
  for one booking), *Coaches* (who is where) and *Picture day*. It answers
  one booking at a time. It never shows the week as a whole: the fields down
  one side, the evenings across, who is where. That picture is what the
  scheduler is.

What is right today, and stays: two practices on one field at once is a
**shared field**, said and never a clash (`placeClash()`, the owner,
2026-10-03); a game needs its pitch; fields, their pitches, permits, opening
hours and closures are the club's settings at `org/venues` (`SESSIONS.md`);
`busyItems()` is the one place that knows who is busy; a weekly practice is
one entry per week sharing a `series` (`teams/{tid}/events/{eid}`), so one
week can move alone.

## What people are trying to do

- **The admin, in August.** Twelve teams. The council has given the club
  Lakeside Park (three pitches, Monday to Thursday 5 to 9pm) and the school
  turf (one pitch, Tuesday and Thursday, lights until 8). The U8s want one
  practice a week, 60 minutes; the U13s two, 75 minutes. Jaz coaches two
  teams and cannot be in two places. Four families have a child on two
  teams. She wants to see the week as a grid, drop the practices in, be told
  at once when a pitch is full or Jaz is double-booked, and when it looks
  right, write the whole term to every team's calendar.
- **The same admin, in October.** The school pulls Thursdays. She wants to
  see which practices that strands and move them, not find out from a coach
  on the night.
- **The coach.** Her two teams back to back on the same field. If that is not
  possible, at least the same night at the same place. She never wants to
  learn her Tuesday from a calendar entry that appeared.
- **The family** with two children: both at Lakeside on Tuesday, overlapping,
  one drive. The scheduler can try for that; nothing promises it.

## The pieces

| Piece | What it is | Lives in |
| --- | --- | --- |
| **What a team needs** | How many practices a week, how long, and its preferences: a usual field, nights it cannot do | `orgs/{code}/org/sched/teams/{tid}` |
| **What the club has** | The fields, their pitches, permits, hours and closures: already built | `orgs/{code}/org/venues/{fid}` (`SESSIONS.md`) |
| **A coach's word on a slot** | Her team's weekly slot confirmed, or flagged with a note, by its coach | `orgs/{code}/teams/{tid}/confirm/{series}` |
| **The board** | One week, fields across, days and hours down, every placed practice a block; drawn from the calendar and the draft, never stored | the admin's screen |
| **The draft** | Placements not written yet, on the admin's phone | `sm.sched.v1:{club}` |
| **The term** | The weeks the layout is written for | the draft's `from` and `until` |
| **The practices written** | Ordinary weekly series on each team's calendar | `teams/{tid}/events/{eid}`, as today |

**The board is a view of the calendar, not a second calendar.** Nothing the
scheduler shows is stored except the draft: the week is read from each
team's entries and games through `busyItems()`, exactly as the Planner and
the entry rows read it. Write the term and the board is drawn from what was
written; a coach moving one week from her own calendar is on the board the
next time the admin looks. Two copies of the week would disagree the first
time a coach called one off.

**The draft stays on the phone until it is written.** Like `gamesForm` (a run
of games) it is one admin's work in progress, kept across a reload at
`sm.sched.v1:{club}`, and it writes nothing until she says. Two admins laying
out the same term would each hold a draft; the second to write sees the
first's practices already on the board and places around them. A draft in
the club would need a rule, an owner and a way to throw it away, for a thing
that lives an afternoon.

**A practice the scheduler writes is a practice.** Same shape, same path,
same series id per weekly slot, same `by` and `edit` stamp through
`remoteSet()`, team-only, asking families as a practice does. The coach can
move, call off or delete a week from her own calendar as she can one she
made; a plan hangs off it the same way. There is no mark saying the
scheduler made it, because nothing should behave differently for it.

## The data

```
orgs/{code}/org/
  sched/
    teams/{tid}  { per: 2, len: 75,                      // practices a week, minutes each
                   field: fid | '',                      // the field it should keep to, if any
                   not: [0..6],                          // weekdays it cannot practise
                   note }                                // "the coach works late Mondays"
    from, until                                          // the term last written, for the next draft to start from

orgs/{code}/teams/{tid}/
  confirm/{series}  { ok: true | false, by, at, note }   // the coach's word on one weekly slot, one write
```

`sched` is under `org`, which the whole club reads and only admins write; a
coach's confirmation is under her team, beside its entries, which the rule on
`teams/$tid` already lets that team's coaches and admins write. So **there is
no new rule**. `sched/teams` is a setting about the team kept apart from the
team's record because that same rule lets the coach write the team, and how
many practices the club gives her is the club's to say.

A confirmation is keyed by the slot's `series`, never by the entry: a term is
fifteen entries and the coach's *works for me* is one word about the slot,
one write. A slot moved on the board gets a new series id (below, *Writing
the term*), so a moved slot is unconfirmed again, which is right: she said
yes to Tuesday at six, not to Thursday at seven.

Not stored: the layout itself (the calendar is it), a field's supply (read
from its permits, hours, closures and pitches each time), how many practices a
pitch may hold (the owner: fields are shared in many ways, so there is no
number), and anything about a coach beyond what `access/teams/{tid}/coaches`
and her time off already say.

What a team's `per` is for: the board counts what each team has that week and
says *1 of 2 placed*, and *Lay it out* places what is missing. A team with no
record is drawn with `per` 1 and `len` from its last practice, as the add
sheet starts from the last one today (`calFormNew()`).

## The board

One screen, Settings → **Scheduler**, admins only (`canPlanClub()`, checked in
the handler as the Planner is). Four parts, top to bottom:

1. **The week.** Which week is drawn, with arrows, and the term under it
   (*Writing Sep 7 to Dec 18, 15 weeks*). A term is what gets written; the
   week drawn is the pattern.
2. **The grid.** Fields across (each pitch a column where a field describes
   its pitches, else one column `× n`), weekday evenings down with the hours
   as rows. The supply is painted first: hours inside a permit and the
   field's opening hours are open, outside them hatched, a closure struck.
   Practices on one pitch at once sit side by side in as many lanes as there
   are, however many: the grid shows the sharing and never counts it. Every
   practice already on the calendar that week is a block, in its team's
   colour (`teamHue()`), with the team's short name and time; a game is a
   block with a lock, in place and never movable here; a session is a block
   too, greyed. A draft placement is a block with a dotted edge, and a block
   on the calendar carries its coach's word: a tick once she has confirmed
   it, a flag with her note when she has said it does not work, nothing
   until she has said.
3. **The teams.** One row per team: *G11 Flight · 2 × 75 min · 1 of 2
   placed*, its coaches, how many families it shares with another team. Tap
   a team then tap an open cell to place a practice there; tap a draft block
   to move or take it off. A team with every practice placed is quiet.
4. **What is wrong**, read as the admin places: the Planner's *Clashes*,
   recomputed for the draft before anything is written, and the three things
   this board adds (below). Each names what it is about and is a tap away.

On a phone the grid is one field at a time, swiped, with the day down. On a
tablet or laptop the fields sit side by side. Nothing a person reads under
14px (`test/visual.js`); the blocks carry a short name and a time and the
rest is on the tap.

### What the board refuses, warns and says

A placement is **refused** in place (the cell cannot be tapped, and says why
when it is):

- outside every permit of a field that lists permits, or outside its hours,
  or on a closure (`permitCovers()`, `fieldShut()`);
- on a field whose pitches are all taken by games or sessions then (a game
  needs its pitch, `placeClash()`); practices never fill a pitch, so a
  practice is never refused for the practices already there;
- while the team is already busy then (a game, another practice).

A placement is **warned** on, in the strip and on the block, and can be made
anyway:

- **A coach in two places.** One of the team's coaches is due somewhere else
  then (`busyItems()`, her time off included).
- **A drive.** One of the team's coaches has something at another field on
  the same day with less than an hour between (the number is a constant to
  start, `DRIVE_GAP_MIN = 60`; the fields' addresses are only text, and no
  distance is worked out, see *Not built*). The owner's words: the big thing
  is the coach driving across the city. Back to back at one field is the
  thing to prefer and is said as such: *Jaz: B9 Comets straight after, same
  field*.
- **Families.** *3 families have a child somewhere else then*, a count, as
  the Planner says it; names for admins on the tap, as everywhere.
- **Off its field.** The team has a usual field (`sched/teams/{tid}/field`)
  and this is not it.
- **A night it cannot do** (`not`).

Nothing about a shared field is a warning, and nothing caps it. The owner,
twice: *practices overlap on purpose* and *fields can be shared multiple ways,
so let's not limit it*. Half a pitch each, a quarter each for the U7s, three
groups rotating through one goal: the club knows how its fields work and the
board shows who is on one together, as many as there are, and leaves the
decision where it is. The one thing a practice cannot do is take a pitch from
a game or a session that holds it.

### Lay it out for me

A button, for a week whose teams are not all placed. It fills what is missing
and writes nothing: every placement it makes is a draft block the admin can
move or take off. It is a greedy fill, in the spirit of `picLayout()` and
`findTimes()`, and it must **never trip the board's own refusals**, and
should trip as few of its warnings as it can:

1. Teams in order of how hard they are: the fewest open cells they could go
   in first (a team whose coach has another team, a team with a usual field
   and a night off, a team with 90-minute practices on a field that closes at
   8).
2. For each practice a team needs, every open cell in the week is scored:
   a refusal rules it out; then a coach's other team on the same field
   straight before or after is best, the same field the same night next; a
   drive, a coach elsewhere, a family elsewhere and a strange night cost in
   that order; the team's usual slot (`usualSlot()`) and usual field are
   preferred; a team's second practice goes on a different night from its
   first; and other practices already on the pitch cost nothing, though
   with every other thing equal the fill spreads teams across the open
   pitches rather than stacking one.
3. The cheapest cell wins; ties go to the earlier night and the earlier hour.

That is a heuristic, not a solver, and it says so on the screen: *A first
go. Move anything.* A club with more practices wanted than cells open is told
which teams it could not place and why, and the admin decides. A later build
can swap pairs to improve on it; nothing here depends on the fill being good,
only on it being safe (`test/scheduler.js` sweeps it across clubs and
requires no refusal in its output).

### Writing the term

**Put it on the calendars** writes the draft as weekly series: for each draft
block, one entry per week from `from` to `until` on the dates the series
would have (`seriesDates()`), `kind: 'practice'`, the kind's default title,
`venue` the field's name and the pitch's where one was chosen (so
`fieldOfText()` and `pitchOfText()` read it back as every other entry is
read), `public: false`, `ask` as a practice's default, one `series` per block,
one write per entry through `quiet()` → `remoteSet()`, at most `SERIES_MAX`
per series. Exactly what `saveCalEvent()` writes for a weekly practice,
through the same function, so a test can hold the two to each other.

A block that is already on the calendar (a series the admin moved on the
board) is **an edit of that series from this week on**, as *This and every
later one* is on the sheet (`calTargets()` with `scope: 'later'`): the same
entries, new day, time and place, and nothing new made, but under a new
`series` id from that week on, so the coach's confirmation of the old slot
does not carry to a slot she has not seen. A block taken off
the board deletes the series from this week on, through `remoteDel()`, so
the register, the plans and the answers go as they do when a coach deletes
a practice. The calendar's own copy of a plan follows its entry
(`withEntry()`), so a moved practice keeps its plan.

Nothing is written for a week a team already has a practice in that slot:
writing a term twice writes nothing (matched by team, date, start and kind,
as the bulk import matches, `test/import.js`). Writing is online-only like a
run of games is not: it goes through the outbox like every calendar write, so
an admin with no signal sees *Waiting to send · n* and it lands when she has
one.

Once written, `org/sched/from` and `until` record the term, so the next time
the screen opens it offers the week after `until` as the start of the next.

## What the Calendar loses, and keeps

The Calendar goes back to being a calendar.

- **Gone from All teams:** the club's week card (`clubWeekCard()`): the
  counts, the shared and clash paragraphs, *No practice this week*, *Still
  to settle*, and its two buttons. Everything it said moves to the Scheduler,
  where it is the strip under the grid (*Still to settle* becomes a part of
  that strip: entries with no date, time or place are the one thing the
  board cannot draw). Club home's one-line week (`schedLine()`) stays: it is
  a sentence, and it is the admin's door to the Scheduler.
- **Kept on an entry:** *Shared field: G13 Storm 6pm* under a practice
  (`fieldMatesLine()`, `test/schedule.js`). It is not bookkeeping; it is who
  the coach will find on the field, and the owner asked for the note. *Field
  clash* stays too, on a game with no pitch, because the coach taking the
  team there needs to know; the admin learns it on the Scheduler first.
- **Kept, the `+`.** A coach adding a practice from her own calendar is
  unchanged. The Scheduler is how the admin lays out the season; the sheet is
  how anybody fixes a week.
- **The add sheet's line** *Sharing a field with another team is fine; the
  calendar notes it* stays.

## What the Planner becomes

The Planner's four tabs are the Scheduler's parts: *Clashes* is the strip
under the grid; *Coaches* is the grid read by coach (a filter on the board,
*Jaz*, dimming everything that is not hers); *Find a time* and *Picture day*
stay as they are, as the Scheduler's second and third tabs, since a one-off
booking is a search and a picture day is its own layout. **One screen,
Settings → Scheduler, and the word *Planner* comes off the screen**
(`GLOSSARY.md`: *Scheduler*, not Planner, not plans; `test/copy.js` holds
it). The old address lands on the new screen (`test/routing.js`).

## Who can do what

| | The board | The strip, placing, laying out, writing a term | A team's needs | Confirm or flag a slot | Her own calendar's practices |
| --- | --- | --- | --- | --- | --- |
| Admin | Yes | Yes | Yes | For any team, in her own name | Yes |
| Coach | Yes, read-only, her teams lit | No | No | Her own teams' slots only | Yes, as today |
| Helper, tracker, parent, viewer | No | No | No | No | — |

Placing and writing are admins only, like the Planner was: a coach, a
tracker or a parent who reaches one of those actions is refused in the
handler with nothing written. A coach's confirmation is checked in the
handler against the team on the button (`canEditTeam()`), as the register
and the calendar are: a coach confirming another team's slot writes nothing.

### The coach's board

The owner, 2026-10-15: *definitely read-only, let them see theirs, and maybe
allow them to confirm things.* So a coach opens Settings → Scheduler too and
gets the same grid for the week, her teams' blocks in colour and everyone
else's dimmed to grey, with the names kept (she wants to know who she is
sharing Lakeside with on Tuesday). No teams' rows, no strip, no placing, no
*Lay it out*, no *Put it on the calendars*: the week as it stands, which is
her calendar drawn by field instead of by day.

What she can do is tap one of her own blocks and say **Works for me** or
**This doesn't work**, with a note (*I don't get off until 6:30*). One write,
`teams/{tid}/confirm/{series}`, in her own name, through the outbox like any
team write. The admin sees it on her board, block by block: a tick, a flag
with the note, or nothing yet; the strip counts *4 of 12 slots confirmed, 1
flagged*. A flag changes nothing on the calendar: the admin moves the block
or messages the coach, and a moved block is a new slot for the coach to look
at again. Nothing is held up waiting on confirmations; the term is written
when the admin writes it, and the coach's word is about what is written.

A coach with no team on the board that week (a coach of a team with no
practice yet) still sees the grid, and her teams' rows say so.

## Offline

The board draws from the phone's copy, as every screen does, and the draft is
on the phone. Placing works with no signal. Writing goes through the outbox:
every entry is a `remoteSet()` and lands in order when the phone connects, and
is said on every screen until then. What the phone cannot do with no signal is
know what another admin wrote a minute ago; the board says *as of* when the
club has not been heard this session, as My calendar does for another club.

## Not built, and why

- **Distance.** Fields have addresses as text and nothing turns them into
  minutes apart: the site is static, the app calls no map service, and the
  server is not asked for anything at the sideline (`HOSTING.md`,
  `SERVER.md`). A drive is *another field, the same day, less than an hour
  apart*, which is wrong for two fields a street apart and right for most
  clubs. An admin can say two fields are near each other later
  (`venues/{fid}/near: [fid]`) if that proves to matter; the rule is in one
  place, `driveBetween()`.
- **A solver.** The fill is greedy and says it is a first go. A club that
  needs better has an admin who moves blocks; the board makes each move
  safe.
- **Games.** The board shows them locked. A league fixes them, and a game
  short of a pitch is said, never moved (ROADMAP, *Games involving another
  club*). Scheduling a run of games stays where it is (*A run of games* on
  the Calendar's add sheet, `test/schedule.js`).
- **Sessions on the board.** A 1-1 or a group takes its pitch and is shown
  greyed and locked; moving one is the coach's, on Sessions. A coach's
  bookable times (`AVAILABILITY.md`) are not drawn: they are her offer, not
  a booking, and the server checks each booking against the calendar as it
  stands.
- **A coach's own preferences.** *Never Mondays* is `away/{uid}` already
  (weekly time off, `test/away.js`), and the board reads it through
  `busyItems()`. Nothing new.
- **A draft shared between admins.** Above, *The pieces*.

## Build order

Each step a build of its own, with `test/scheduler.js` growing with it, in
the harness, admins only and refused in the handler at every step, and every
suite green (`node test/run.js`). Every step is a read or a write at a path
the rules grant today; **no step changes `database.rules.json`.**

1. **The settings.** A team's needs (`org/sched/teams/{tid}`) on the team's
   row in Settings → Club, normalised on read (`per` 0 to 7, `len` 30 to
   180), written one record at a time, admins only.
2. **The board, read-only.** Settings → Scheduler: the week, the grid with
   the supply painted and every entry, game and session of the week as a
   block, the teams' rows counting what each has, the strip
   (`clubClashesOn()` for the week, *Still to settle*, the drives). The
   club's week card comes off the Calendar in this build and the Planner's
   *Clashes* and *Coaches* tabs fold in; *Planner* becomes *Scheduler* in the
   glossary (the owner's first decision), the old address lands here. A coach
   gets the grid in this build too, her teams lit, nothing to tap yet.
3. **Placing.** The draft at `sm.sched.v1:{club}`, tap a team then a cell,
   the refusals and warnings in place, moving and taking off, surviving a
   reload, written by nothing yet.
4. **Writing the term.** *Put it on the calendars*: new series through the
   same function as `saveCalEvent()`, moved series as this-and-later edits,
   removed ones deleted, twice writes nothing, `org/sched/from` and `until`
   recorded. Through the outbox, stamped, team-only.
5. **Lay it out for me.** The greedy fill, swept in the test across clubs
   with more and fewer cells than practices wanted, never tripping a refusal,
   saying what it could not place.
6. **Re-laying a term.** Opening the Scheduler on a term already written
   starts from the calendar as it stands, so October's lost Thursday is the
   same board: the stranded blocks are warned on the new supply, moved, and
   written as edits under a new series id.
7. **The coach's word.** *Works for me* and *This doesn't work* with a note
   on her own blocks, one write at `teams/{tid}/confirm/{series}`, another
   team's refused in the handler, through the outbox; the admin's board
   showing each block's state and the strip counting them; a moved slot
   unconfirmed again.

## Decided, the owner, 2026-10-15

1. **The word.** *Scheduler*, one screen holding what the Planner had.
   *Planner* was already two other things on a coach's phone: a practice plan
   of drills and a game's plan of minutes.
2. **How a pitch is shared.** It isn't counted. The first draft had a
   `share` per field, two practices a pitch by default; the owner: *fields
   can be shared multiple ways, so let's not limit it*. The board shows who
   is on a pitch together and refuses a practice only a pitch a game or a
   session holds.
3. **Coaches and the board.** Read-only, their teams lit, and a word on each
   of their own slots: confirm, or flag with a note. *The coach's board*
   above, step 7 in the build order.
