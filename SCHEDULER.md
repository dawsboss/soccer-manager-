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
    teams/{tid}/need/{kind}   2                          // practices a week by kind (step 5); per/len stay regular's
    teams/{tid}/rules/{rule}  'must'|'high'|'medium'|'low'|'off'   // this team's tier where it differs (step 6)
    teams/{tid}/tags/{tag}    true                       // "needs lights", "turf only" (step 6)
    rules/{rule}   tier                                  // the club's tier for a built-in rule; missing is the default
    custom/{id}    { shape, a, b, tier, note }           // one of three shapes (step 6)
    kinds/{kind}   { len, space, role, who }             // a kind of practice the club has changed or added (step 5)
    coaches/{uid}  { perDay, perWeek, hoursDay, gap }    // load caps; coaches/default for everyone (step 7)
    terms/{id}     { name, from, until }                 // a phase of the season (step 4)
    closed/{id}    { from, until, note }                 // club blackout dates: holidays, exam weeks (step 4)
  venues/{fid}/hoursBy/{id}  { from, until, d0..d6 }     // dated hours: unlit pitches close at six in November (step 7)

orgs/{code}/teams/{tid}/
  events/{eid}      + ptype: 'regular'|'technical'|'film'|'goalkeeper'|'fitness'|'scrimmage',   // step 5; missing is regular
                    + who: 'keepers' | ''                // a cross-team session: one entry per team sharing `club`, keepers only asked
  confirm/{series}  { ok: true | false, by, at, note }   // the coach's word on one weekly slot, one write
```

Everything above the line that is not built yet (steps 4 to 7) is marked
with its step; what is built is `teams/{tid}` (per, len, field, not, note)
and `from`/`until`. All of it stays under `org` or under the team, so none of
it needs a rule.

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
go. Move anything.* The run is told back: how many were placed, what they
carry by rule, and for each team it could not place which rule shut most of
its cells and whether relaxing a tier or more field would open it, so the
admin decides; *Take them off again* removes that run's blocks alone. A later build
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

Once written, `org/sched/from` and `until` record the term: a week opened
inside it runs the term to that last day, so a slot re-laid in October is
moved to the end of the term and not fifteen weeks on, and a week past it
starts a new term of fifteen weeks (step 9).

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
under the grid; *Find a time* and *Picture day* stay as they are, as tabs,
since a one-off booking is a search and a picture day is its own layout; and
*Coaches* stays a tab too, because it is where an admin reads who is free at
a time and keeps each coach's time off, which the grid has no place for (the
first draft folded it into the board as a filter by coach; that filter is
what a coach's own board is, step 7). **One screen, Settings → Scheduler,
and the word *Planner* comes off the screen** (`GLOSSARY.md`: *Scheduler*,
not Planner, not plans; `test/copy.js` holds it). The old address lands on
the new screen (`test/scheduler.js`).

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

## Rules, kinds and load

The owner talked the scheduler through again in a second conversation on
2026-10-15 and handed its plan here. His ask there: *a practice scheduler
that looks at coaches, fields, and other inputs, including custom ones the
admin can turn on and all of which can be turned off; X teams, each needing
Y practices a week; extra practices like goalkeeper, and kinds like film,
regular and technical; then games, which need the other team's admins,
whether or not they are on the platform (if they are, we look for them too;
if not, oh well); coaches, teams and parents not stretched thin, a cap on how
much of a day is soccer for a family or a coach; and the admin saying what
to prioritise and what she doesn't care about, by team, because some teams
have single mothers and some want both parents there.* The plan that came
back is folded in below, reconciled with what is built and decided; what it
had that this brief does not take on is at the end of the section.

### Everything the board says is a rule with a tier

The plan's one principle, adopted whole: every refusal, warning and
preference on the board is a **rule**, and every rule has a **tier**, *Must*,
*High*, *Medium*, *Low* or *Off*, which the admin can move. Built-in rules
and the admin's own are the same kind of thing, so "turn anything off" and
"tell me what matters" are one list, not two features. A Must rule refuses
in place (today's refusals); the rest cost in the fill and order the strip,
and Off keeps the rule in the list and worthless. Stored as
`org/sched/rules/{rule}: tier`, a missing one being the default below.

| Rule | Default | Today |
| --- | --- | --- |
| A pitch a game or a session holds is taken | Must | refused |
| Outside the permit, the hours or a closure | Must | refused |
| The team is already on then | Must | refused |
| A coach in two places (lowerable: two teams in one session is a real thing, so lowering it warns) | Must | refused |
| A coach's drive between fields | High | warned |
| A coach's load: sessions a day and a week, hours a day, the gap between (step 7) | High | — |
| A night the team can't do | High | warned |
| A keepers' session never over the regular practice of a team sending one (step 5) | High | — |
| A family with children in two places | Medium | warned |
| A household's soccer hours a day and a week (step 7) | Medium | — |
| Siblings at one field at the same or the next hour | Medium | — |
| A coach's teams back to back on one field | Medium | preferred by the fill |
| The team on its usual field | Medium | warned |
| The same slot every week of the term | Medium | — |
| A team's second practice on another night, not the one after its first | Low | — |
| Spread across the open pitches; rotate the worst slots across an age group | Low | — |
| Fewest changes from what is written (stability, when re-laying a term; High then) | Low | — |
| Keep the pattern's headroom for games (the games brief) | Low | — |

The fill's *could not place* says which Must rules ruled every cell out for
that practice and the cheapest one to relax, which the plan is right to call
the most-used thing after the first run. Every placement the fill makes can
say why it chose the cell, and every unmet soft rule is listed with its cost
and who it hurts.

### Profiles: the club's, and a team's own

The tiers live in the club's profile with **presets to start from**:
*field-first*, *coach-friendly*, *family-friendly* and *balanced*, each just a
set of tiers written out as rules, nothing hidden behind the name. A team
overrides any rule for itself (`org/sched/teams/{tid}/rules/{rule}`), most
specific wins, and that is the whole of the owner's single-mothers case: for
that team the family rules are High. *Both parents can come* for games is a
weekend-window rule on the games brief. An age group's override (the plan
had three levels) is left out: twelve teams is few enough to set by team.

### Custom rules: three shapes, and tags

The plan has a rule builder and custom resources. This brief takes **three
shapes** and no builder, because each shape is one line in the same list and
a general builder is a project of its own:

1. *Teams tagged X only on fields tagged Y* (`tags` on a team at
   `org/sched/teams/{tid}/tags`, on a field at `venues/{fid}/tags`: "needs
   lights", "turf only", "U8").
2. *No [team or tag] after [time]* (the young teams finish early).
3. *[Coach] never on [day]*, which is time off and is built (`test/away.js`).

A custom rule is `org/sched/custom/{id}` with its shape, its two operands,
its tier and a note, and sits in the one list with the built-ins. Resources
(goal sets, a bus, a trainer, the ball bag) are not taken on: each is a
field-shaped thing with availability and capacity, and if a club asks, a
field of kind *resource* is the way, not a new node.

### Kinds of practice

A practice has a kind: **regular, technical, film, goalkeeper, fitness,
scrimmage**, built in, with the club able to change one or add its own
(`org/sched/kinds/{kind}`). A kind says its usual length, what space it
needs (a pitch, a share of one, a room, or none: film is a room or nothing),
which staff role runs it, and who comes. On the entry it is `ptype`, missing
meaning regular, so every practice there is today is a regular one and
nothing moves. A team's needs become per kind (`need/{kind}`; `per` and `len`
stay as regular's, so what is built keeps working): *two regular, one
technical, film every other week, keepers once*.

**Who comes is the hard part**, and the plan is right. A regular practice is
one team. A goalkeeper session pulls keepers from several teams; a technical
one may pool an age group; a scrimmage is two teams on a full pitch. A
cross-team session is **one entry per team sharing a `club` id**, which is
how club-wide bookings and picture day are written already (`test/planner.js`),
so each team's calendar, answers, register and plan work unchanged; `who:
'keepers'` on the entry means only the keepers are asked and counted. Its
rules are its own: never over the regular practice of a team sending a
keeper, and beside it at the same field when it can be (High and Medium
above). A scrimmage takes a whole pitch, so it counts as a game for the
space rule.

### Coaches: what she can't do, and how much she can

The plan collects weekly availability by form, with a deadline and the
admin's approval. This app already has the inverse, **time off** (weekly,
dates, a call-out; `training/{code}/away`), written by the coach and by an
admin for her, which the board reads through `busyItems()`. That stays the
way in: a coach says when she can't, which is shorter than when she can, and
nothing is approved because an admin can write it too. Load is new: **caps**
as rules (sessions a day and a week, hours a day, the gap between two),
defaults for everyone at `org/sched/coaches/default` and a coach's own at
`coaches/{uid}`. A coach who is also a parent is one account, so her
household's rules apply to her too. Travel is the drive rule, with `near` on
a field the day the club wants to say two fields are close.

### Families: hours, and siblings

Siblings are known from `guardians` and are why the family rules exist. New
is a **household's soccer hours** a day and a week, counted from every
child's practices, games and sessions (and the parent's own coaching, when
she coaches), a Medium rule by default and High on the team that asks. The
plan's opt-in household availability (when a family can't) is not taken on
yet: it is private data about families and the board has no place to draw
it; if it comes, it is coarse (a weekday evening off, never a reason) and
read by admins and the fill alone. As everywhere, a family is a count to the
club and a name to admins and that team's coaches.

### Phases, blackout dates and sunset

A **term is a phase** of the season (pre-season, in-season; `org/sched/
terms/{id}`), each written on its own pattern week with its own needs, which
the brief had as "a year is two or three terms" and the plan sharpens. **Club
blackout dates** (`org/sched/closed`: holidays, exam weeks, tournament
weeks) get no practice written on them, and the term view shows them.
**Sunset** is the plan's best catch: an unlit pitch closes at sunset, so
Lakeside's Field 1 is open until nine in September and six in November,
and the autumn term needs an early and a late pattern. The data for it is
**dated hours on a field** (`venues/{fid}/hoursBy/{id}`: from, until, and
the weekday hours that apply between), read by `fieldShut()` ahead of the
field's standing hours; a pitch marked `lights` is exempt. The admin types
the dates; nothing works out sunset from a map, as nothing works out
distance (*Not built*).

### The engine

The plan wants a real constraint solver (CP-SAT) with a greedy fallback for
instant drafts. Here the order is reversed and the second half is deferred:
the **greedy fill with a local search after it** is what the phone runs
(step 8), time-boxed, scored by category, explaining itself, with **lock**,
**pin** and **forbid** on any block or cell and *re-solve around what I kept*
(stability a rule), because the app is a static site that ships no solver
and a scheduler on a phone with no signal is the point of the place. A real
solver is a Cloud Function away (`functions/`, the owner's decision on
server-side code) and goes in only when a real club's fill is not good
enough; the rule model is the same for both, which is why the rules come
before the fill in the build order. The score the plan lists is the strip's
summary: practices placed, Must rules broken (none, or the fill failed and
says so), field use, the worst coach day, sibling clashes, changes from what
is written.

### Not taken on from the plan, and why

- A general rule builder and custom resources: three shapes and tags
  instead (above).
- Coach availability forms with deadlines and approval: time off is the
  inverse and is built.
- Team managers editing their team's overrides: the owner decided coaches
  read the board and confirm their slots; a team's tiers are the admin's.
- Household availability opt-in: later, if at all, and coarse.
- A solver in the app: on the server, later, if the fill falls short.
- Age-group profiles between the club's and a team's: by team is enough.
- Notifying only who is affected with a diff on publish: calendar changes
  already reach each team and the admins (`calAlerts()`, push); the term
  view's *what changed* is the diff.

## The season, and other clubs

The owner, 2026-10-15, after the first board: *this scheduler will be used to
schedule a whole season at once, or maybe a few seasons. Other teams may want
to view some information, or have an export: something where these different
teams can communicate when games should happen. Then after that, when
practices should happen (time and date) and where. The formula of location,
time, space and people is important. Making a page to help simplify it is
the goal.*

**Location, time, space and people are the board's four axes**, and the
reason it is a grid and not a list: a field (location), its pitches and how
many practices share one (space), the days and hours with the permit painted
(time), and the teams, their coaches and their families (people), with every
clash and drive being two of those crossing. Nothing here adds a fifth.

### The order of a season

A season is written in this order, because each step fixes what the next one
works around:

1. **Fields and permits** (built, `SESSIONS.md`): what the club has, and when.
   The council's letter is the supply.
2. **Games.** A league fixes them, or two clubs agree them (below). They go in
   first and the board locks them: *A run of games* on the Calendar, the
   league's fixture list through the bulk import, or, later, a game agreed
   with the other club in the app.
3. **Each team's needs** (built): how many practices, how long, a usual
   field, nights it cannot do.
4. **Lay the practices out** around the games (steps 3 to 5 of the build
   order): by hand, or the fill as a first go.
5. **Write the term** (step 4): one weekly series per slot onto each team's
   calendar.
6. **Coaches confirm** (step 7).
7. **Hand it on** (step 8, below): the field schedule to the council, the
   school, the other club, the referees.

**A season, or a few, at once.** A term is whatever dates the admin writes
between, so a season is one term and a year is two or three written in
turn, each laid out on its own pattern week (the autumn pattern is not the
spring one: the lights go off earlier and the school turf is back). Each
slot's series is at most `SERIES_MAX` entries (sixty), which holds a term of
up to a year of weekly practices; a term longer than that is written as two.
Nothing about the data changes: a term is entries on the calendar, as it is
now. What the board adds for a season is the step back: a **term view**
(step 8), the weeks across and the teams down, each cell the practices that
week, so the admin sees the term she is about to write, the weeks a field is
closed, and the holidays, before she writes it.

### Other clubs, and the export

Two different things are in the owner's note, and they are built apart.

**Letting others read it.** The council wants the field schedule; the school
wants Tuesdays; the other club wants to know when Lakeside is free for a
friendly; the referees' secretary wants the games. None of them is in the
club, and none of them should be let in for this. The answer is a file and
a page, both with no names in them: the **field schedule export** (step 8),
a CSV or a printable week per field (field, pitch, day, time, team, kind,
from, until) built from the board, and, where a page is wanted, the team
share links and calendar feeds that already exist (`public/`, the server's
to write; SECURITY.md, SEC-D11). A club-wide read-only page of the fields
would be one more `public/` page the server builds from the same
`calendarDoc()` machinery, team by team: an id made by `randId()`, carried
on `org/fieldsShare`, and taken down the same way as a team's. It carries
places and times and nothing about a child, which is what a council needs.

**Agreeing games with another club.** This is ROADMAP's *Opponents*: *one
shared record both see, so a reschedule or a cancellation lands on both*.
It crosses the one line the whole data model is built on, that a club lives
on `orgs/{code}` and nothing grants it to anyone outside, so it is a design
of its own and not a step of this brief. The shape that fits what is here:
a **fixture ask** at a root node with its own rule, like a team link or a
booking ask (`fixtureAsks/{id}`: the proposing club, team and admin, the
other club's code or an email, a date, a kick-off, a place, and the other
side's answer: yes, no, or another time), made by a coach or admin, sent as
a link the other club's admin opens (she is not in this club and never is),
answered there, and when both have said yes, written as a game on both
clubs' calendars by the server (`functions/`), each club's copy its own,
with the ask's id on both so a change on either side is offered to the
other as a new ask and never written straight across. The proposing club's
board shows its own field's free Saturdays as the slots to offer, which is
*Find a time* with the field fixed. The other club need not be on this app
at all: a link that shows the offer and takes yes, no or a counter-offer
is the same mechanism as the registration link. This is the piece that lets
*different teams communicate when games should happen*. It is written up
here so the Scheduler's shape does not close it off (a game on the board
is already locked and never moved; an agreed game is one more game), and
it waits on the owner's call and on AUTH.md's treatment of a second club,
not on this build order.

What games add to the rule list, from the second conversation's plan: the
referees' availability (a resource-shaped thing, the one case for it), home
and away balance over the season, a travel cap, rest between games, no game
within N hours of a practice, headroom for games kept in the weekly pattern
(a Low rule above), and *both parents can come* as a weekend-window rule a
team turns up. A game reads practices as commitments, so coach, team and
household load span both. An opponent on the platform means both clubs'
rules in one solve, which only the server can do, each admin confirming;
an opponent off it picks from offered windows through the link, and the ask
moves offered, countered, accepted, confirmed.

## Build order

Each step a build of its own, with `test/scheduler.js` growing with it, in
the harness, admins only and refused in the handler at every step, and every
suite green (`node test/run.js`). Every step is a read or a write at a path
the rules grant today; **no step changes `database.rules.json`.**

1. **The settings** — built, build 163. A team's needs
   (`org/sched/teams/{tid}`, `schedNeed()`) from the team's row on the board
   (not Settings → Club, which has no row per team: the board is where the
   count is read against them), normalised on read (`per` 0 to 7, `len` 30
   to 180 in steps of five, a field that has gone is no field), written one
   record at a time, admins only, refused in the handler for anyone else.
2. **The board, read-only** — built, build 163. Settings → Scheduler
   (`viewScheduler()`, `schedBoard()`): the week with arrows, a field at a
   time as chips (a place typed that matches no field is a column of its
   own; with nothing picked, the field with most on it that week), the grid
   (`boardGrid()`) with the supply painted (`boardShut()`:
   hatched outside the permit or the hours, a closed day struck) and every
   entry, game and session of the week as a block in as many lanes as there
   are (`boardLanes()`, no cap), a game locked; the teams' rows counting the
   calendar against each team's needs (`boardTeams()`); and the strip
   (`schedStrip()`: `clubClashesOn()` for the week, a coach's drive between
   fields (`driveWarnings()`, `DRIVE_GAP_MIN`), teams short of their
   practices, *Still to settle*, shared field time apart). The club's week
   card came off the Calendar in this build and the Planner's *Clashes* tab
   folded in; *Planner* became *Scheduler* in the glossary (the owner's first
   decision) and the old address lands here. A coach gets the grid in this
   build too, her teams in colour and the rest in grey with the names kept,
   and nothing else to tap. `test/scheduler.js` pins all of it.
3. **Placing** — built, build 164. The draft at `sm.sched.v1:{club}`
   (`schedDraft()`, `draftBlocks()`): a team picked as a chip, then a half
   hour on any day of the field shown; the sheet says the pitch where the
   field has them, what refuses it (`placeCheck()`: outside the permit, the
   hours or a closure; the team already on; a pitch a game or session holds
   or no pitch left; a cell marked off) with no Place button, or what warns
   (the coach due elsewhere, her drive, families split, off its usual field,
   a night it can't do) with one. A draft block is drawn dotted, counted
   against the team's needs as *to write*, and opens its own sheet: move,
   lock, take off. A cell can be marked off the board and unmarked. A weekly
   practice on the calendar opens the board's sheet on an admin's board:
   open it, move it on the board (its length from its first entry still to
   come), or take it off from this week on, drawn struck. Nothing is written
   by any of it; a coach is refused in the handler; the draft survives a
   reload.
4. **Writing the term** — built, build 164. *Put it on the calendars*
   (`schedWrite()`): a new block one weekly series through `addSeries()`,
   the add sheet's own writer (pulled out of `saveCalEvent()` so the two
   cannot drift; the suite holds an entry of each to the same keys); a moved
   series its entries from the term's start on, at the same ids under a new
   series id, so a plan keyed by the entry follows; a series taken off
   deleted from then on with its register, as the sheet deletes a practice;
   a blackout date (`org/sched/closed`, kept from the term sheet) skipped,
   as is a date the team already practises at that time, so writing twice
   writes nothing; at most `SERIES_MAX` a series; the term's dates on the
   draft (the term sheet) and recorded at `org/sched/from` and `until` once
   written. Through the outbox, stamped, team-only, families asked. A term as
   a record of its own (`org/sched/terms/{id}`, a phase) waits for step 7,
   where phases come in; until then the term is the two dates.
5. **Kinds of practice** — built, build 165. `PTYPES` (regular, technical,
   film, goalkeeper, fitness, scrimmage) with `kindOf()` laying the club's
   changes at `org/sched/kinds/{kind}` over them, held to the vocabularies
   (no screen writes them yet: the bulk import or a later sheet). `ptype` and
   `who` on an entry, missing meaning regular; the add sheet offers the kinds
   as chips (a kind picked fills an end the coach hasn't typed from its
   length) and writes them, and takes them off an entry made regular again. A
   keepers' session asks and counts the keepers alone (`rsvpSquad(tid, key)`,
   the answers and the register through it; a keeper is `gk` on the squad). A
   team's needs per kind (`need/{kind}`, `per` staying regular's) on the
   needs sheet and summed on the row. On the board a kind is picked under the
   team; a keepers' session or a scrimmage names its teams on the place sheet
   and is one draft block carrying them, drawn and counted for each; a
   cross-team session on the calendar is one entry per team sharing a `club`
   id per date (written through `addSeries()` with a per-date extra, as
   picture day is) and the board folds the entries of a date into one block.
   The keepers' rule warns and never refuses (over a sending team's own
   practice; or, for a regular practice, over its keepers' session); a
   scrimmage takes a whole pitch, so a one-pitch field with one on has no
   pitch left for a practice; film is a room or nothing, so neither the
   pitch, the permit nor a closed day refuses it. Not built: a staff role on
   a kind (the app has coaches only; a keepers' session holds no coach's
   evening), and moving a cross-team series on the board (a single team's
   moves; the other teams' entries stay).
6. **Rules and tiers** — built, build 166. `RULES` with their defaults and
   `ruleTier(id, tid)` (the team's own at `org/sched/teams/{tid}/rules`, the
   club's at `org/sched/rules`, the default); `placeCheck()` says every
   finding at its rule's tier (Must refuses, High, Medium and Low warn in
   that order and cost `TIER_COST`, Off says nothing) and returns its marks
   and a cost for the fill; a coach in two places is Must by default now
   (it warned in build 164) and her time off is checked too; the strip orders
   its findings by the club's tiers and drops an Off rule's. The Rules tab:
   the club or one team, every rule with its five chips (a physical rule
   lowered from Must asks first; a team's own chip *As the club* takes its
   override off), the four presets written out as every rule's tier with the
   name kept at `preset`, and the club's own rules in two shapes
   (`org/sched/custom`: teams tagged X only on fields tagged Y; nothing for
   a team or a tag after a time; the third shape being time off, built), in
   the one list at their own tiers. Tags on a team (its needs sheet) and on
   a field (the field sheet), normalised. Not built: the fill-only rules
   (siblings together, back to back, the same slot, the second night,
   spread, stability, headroom) do nothing until step 8, and the two load
   rules until step 7; the list says so beside each.
7. **Load** — built, build 167. A coach's caps (`coachCaps(uid)`: sessions
   a day and a week, minutes a day, the gap between; the club's defaults at
   `org/sched/coaches/default` from the Limits card on the Rules tab, a
   coach's own at `coaches/{uid}` from *Limits* on her row on the Coaches
   tab, *As the club* taking them off; held to sane ranges) and a
   household's soccer hours (`householdCaps()`, `org/sched/household`, the
   same card), counted from every child's practices, games and sessions
   with overlapping time once (`familyMinutes()`, `mergedMins()`), a family
   a count as everywhere. Both enter `placeCheck()` as the `coachLoad` and
   `household` rules at their tiers and the strip through `loadWarnings()`.
   Sunset as dated hours on a field (`hoursBy/{id}`: between two dates it
   closes at a time, from the field sheet's *Closes early between dates*),
   read by `fieldShut()` and `boardShut()` pitch by pitch, a pitch marked
   `lights` exempt, painted on the grid as *Unlit pitches close at 6:30pm*
   and refused on the board as *no lights*.
8. **Lay it out for me** — built, build 168. `layOut(week)`: the greedy
   fill with one pass of local search after it, over the rules as tiered
   (`placeCheck()` scores each open cell, a refusal ruling it out, and
   `fillExtra()` adds the fill-only pulls and pushes: a coach's other team
   straight before or after on one field, siblings at one field within the
   hour, the team's usual slot, the same night or the night after its other
   practice, a pitch already stacked), the hardest team first (the fewest
   open cells, then the most still wanted), the cheapest cell winning and
   ties going to the earlier night and hour; single-team kinds only
   (`fillWants()`: a keepers' session or a scrimmage names its teams, so the
   admin places it); half-hour cells, hourly past `FILL_MAX`. Never a Must
   rule tripped (`test/scheduler.js` sweeps it across drawn clubs with more
   and with fewer open cells than practices wanted), nothing on the board
   already moved (a hand-placed block, locked or not, and the calendar),
   every placement a draft block marked `fill`, nothing written. The report
   (`sheetFillReport()`): how many of how many, what they carry by rule, and
   for a team it could not place which rule shut most cells and whether a
   tier on the Rules tab or more field would open it; *Take them off again*
   removes that run's blocks alone. A coach is refused in the handler.
9. **Re-laying a term** — built, build 169. Opening the Scheduler on a week
   inside a term already written starts from the calendar as it stands and
   runs the term to its recorded last day (`draftTerm()`), so October's lost
   Thursday is the same board: a weekly slot a Must rule refuses where it
   stands (`strandedItems()`: outside the permit or the hours since they
   changed, on a closure, its coach now off, a game put on its pitch) is
   stranded, said on the strip at Must under its day (*Can't stay*), and the
   strip looks ahead to the first later week of the term with one
   (`strandedAhead()`) with a button opening it. *Lay it out for me* is
   offered though nobody is short and takes each stranded weekly slot as a
   want first, as the series it is, remembering where it stood (`was`);
   stability costs each change from there (the night, the hour, the field)
   at High whatever its tier short of Off, so a slot moves to the same hour
   on another night before another hour, and the move is a hand move's: the
   series taken off the board from this week on, written as an edit under a
   new series id, nothing new, earlier weeks untouched; *Take them off
   again* gives the slot back. A kept series is never moved; a single
   practice on the hatch is said and left to its coach, since the Scheduler
   writes weekly slots. Not built: re-laying every week of the term from one
   board (each week is re-laid on its own; the term view, step 11, is where
   the weeks sit side by side).
10. **The coach's word** — built, build 170. A coach taps her own team's
    weekly slot on her board (another team's opens the entry as before) and
    says *Works for me* or *This doesn't work*, with a note: one record at
    `teams/{tid}/confirm/{series}` (`{ ok, by, at, note }`, `wordOf()` on
    read) in her own name, through the outbox like any team write and with
    no calendar stamp, so the rule on her team decides who may
    (`test/rules.js`: her, never a parent, a tracker or another team's
    coach); another team's slot and an admin's own word are refused in the
    handler (`coachOfTeam()`: an admin's word is not the coach's), a parent
    everything. Her block carries a tick or a flag (`data-word`); the admin's
    board shows each block's state, the strip counts them (*1 of 2 weekly
    slots confirmed by their coaches, 1 flagged*) with each flag's note, and
    the note sits on the admin's sheet beside the admin's buttons. A slot
    the admin moves is written under a new series id, so it is unconfirmed
    again and the old word stays with the old series' earlier weeks. Not
    built: a push to the admins when a coach flags a slot (club activity
    says nothing of it yet), and a coach's word on a cross-team session.
11. **The term, reports and handing it on.** The term view (the weeks
    across, the teams down, closures, blackout dates and holidays marked,
    *what changed* since it was written) before writing; the reports the
    strip summarises (field use, the worst coach day, sibling clashes); and
    the field schedule export, a CSV and a printable week per field with no
    names in it (*The season, and other clubs*). A club-wide fields page
    under `public/` only if the owner wants a link rather than a file: it is
    the server's to build, like every share page.

After these, and as its own brief: **games agreed with another club**
(*Other clubs, and the export*, above; ROADMAP, *Opponents*), which needs a
root node with a rule of its own and the server to write on both sides.

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
