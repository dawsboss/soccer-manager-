# The core, and the tools around it

Written before the code, as `DOORS.md`, `SCHEDULER.md` and `SESSIONS.md`
were: this one changes what the Teams door holds, so the shape has to be
agreed before a screen moves.

The owner's ask, 2026-11-04: *I think we need to separate more. The true
point of this site is games/practices: when, where, how long, who is going,
and a schedule for the families. They come here to know when and where to
go. The coaches do the same and know who is coming and what to plan. Admins
add the games and practices. All other scheduling and planning things should
be pulled out like Sessions is. They are separate and can link as tools, but
be completely separate tools.*

`DOORS.md` built the mechanism (a door is a mode the phone remembers, each
door a bar of its own, the screen naming its door, a switch for whoever has
more than one) for two doors. This brief uses it for four, and trims the
first down to the point of the site.

---

## What people are trying to do

- **A family** opens the app to know where Saturday's game is, when to be
  there, whether practice is on tonight, and to say whether her daughter is
  coming. She wants the week on one calendar, and in her own calendar app.
  Everything else on her phone is already hidden from her by role, so her
  Teams door barely changes; this brief mostly makes sure nothing of the
  tools ever drifts back onto it.
- **A coach** opens it for the same things, plus who is coming to Thursday,
  who came last week, and the sub plan for Saturday. When she sits down to
  plan a practice she wants the drills and the plans in front of her, as a
  job of their own, not as a tab behind her team's results.
- **An admin** adds the games and practices and keeps the calendar right.
  When she lays out the club's week on the fields, or the term, that is a
  different sitting, with a different screen, and it should not be a tile
  on Settings next to Club details.
- **Everyone** keeps one Calendar, one Messages, one account and one set of
  children, whichever tool she is standing in (`DOORS.md`, unchanged).

## What already holds

- **The data is already apart.** The season is `orgs/{code}` (teams, games,
  entries, answers, the register). Practice plans, drills and templates are
  `training/{code}/practices|drills|templates` and `userLibrary/{uid}`
  (`TRAINING.md`); the Scheduler's needs, rules, tiers, closed dates and term
  are `org/sched/*`, and a coach's word on her slot `teams/{tid}/confirm`
  (`SCHEDULER.md`); sessions, bookings, fees, hours and times are
  `training/{code}/…` (`SESSIONS.md`, `AVAILABILITY.md`). Nothing moves.
- **The links between them are already one-way reads.** A plan hangs off its
  calendar practice and reads when and where from it (`withEntry()`); the
  Scheduler writes a term onto the calendars through the add sheet's own
  `addSeries()` and reads the fields; a session is on My calendar because
  the calendar reads it. Pulling the tools apart on screen changes none of
  that.
- **The door machinery** (`ui.door`, `DOORS`, `hasDoor()`, `doorOf()`,
  `defaultDoor()`, `curDoor()`, `navTabs()` by door, Settings' Club section
  by door, `test/doors.js`) was built for two doors and takes more.
- **Who may do what is already decided by predicates, not by screens**:
  `canTrain()`, `canPlan()`, `canSched()`, `canPlanClub()`, `canOffer()`,
  `canSessions()`. A door's membership is one of these, so a family's phone
  never draws Training or the Scheduler now, and never asks the database
  for a plan or a shelf. The doors make that structural rather than a
  property of each screen.

## The shape

### One core, three tools

| | Teams | Training | Scheduler | Sessions |
| --- | --- | --- | --- | --- |
| For | the season: when, where, how long, who is going, who came; the games | drills, practice plans, templates, what needs work | the club's week on its fields, the term, the rules, the fill | 1-1s, groups, booking, fees, hours (built) |
| Bar | Home · Calendar · Game · Messages · More | Home · Calendar · Drills · Messages · More | Home · Calendar · Scheduler · Messages · More | Home · Calendar · Sessions · Messages · More |
| Home | as today, less what moves out (below) | her teams' next practices with Plan / Open plan, *what needs work* per team, templates | the strip: short teams, still to settle, stranded slots, the coaches' word; the term; Find a time, Picture day, Coaches | as built |
| Third tab | Games | the library: built-in, the club's, Mine; Positions | the board, with The term and Rules as today's chips | the Sessions list |
| Who | everyone but a session coach of no team | `canTrain()` (a coach or helper of any team), and an admin for the club's shelves | `canSched()`: an admin; a coach read-only, with her word on her own slot | `canSessions()` |

Teams keeps its name: it is the teams, their games and practices. The tools
take the names their screens already have in `GLOSSARY.md`, **Training** and
**Scheduler**, so nothing a coach has learned is renamed. The one word that
changes meaning: *Training* was *the team's third tab* and the glossary
banned it as a door's name for that reason; it is now the tool, and the
team's tabs are **Season · Players**.

The same `app.js`, one install, one service worker, one manifest. Each tool
has its own icon, shown on the switch and on its title row, as the two doors
do now: Teams the ball, Sessions the cone, the Scheduler its calendar grid
(`SET_ICON.sched`), and Training one of its own that is not a cone (the
Sessions door's mark; `SET_ICON.drills` is a cone today and is replaced).

### What the core keeps, by role

**A family** sees nothing new taken away, because nothing of the tools ever
reached her: Home (her child's card and the next-up card: when, where, going
or not), the Calendar (hers, with Add to your calendar and the feed), Games
(by day, into Live and the score), Messages, More (My players, How to,
Settings, Clubs, Sign out). The Sessions door as built, for a family with
sessions.

**A coach's** Teams door is the season and nothing else:

- Home is her Season: the game being played, the next game and the next
  practice (each with who is coming and the count), *Who came to …?*, Coming
  up, the calendar link, the last game, the record, the results, and
  **Attendance**. Players is the squad.
- Her games as today (the open question below), with the Game tab, Subs,
  Track, Lineup, Stats, Live and the Recap.
- More: My players (a coach with a daughter elsewhere), All teams (an admin),
  the tools she has (one row each, with its icon and line), How to,
  Settings, Clubs, Sign out.
- Settings: You, Notifications, This team, Club · Teams (Club details,
  People, Fields and permits, Coach compliance, Bulk import), Advanced,
  About. The other tools' settings one wide card each at the foot, as the
  Sessions settings card is now.

**An admin** adds games and practices from the Calendar's `+` and a team's
Season as today, and keeps All teams. Coaches and helpers keep adding for
their own team (`canCalTeam()`); the owner's *admins add the games and
practices* describes who usually does, and narrows nobody.

### What leaves the core

Each of these is a thing that is not when, where, how long, who is going or
who came, and each goes to the tool it belongs to. Nothing is deleted; it is
reached through the tool's door, or a link into it.

| Today | Goes to |
| --- | --- |
| The team's **Training** tab (Plans · Drills · Positions) | the Training door: Home (plans) and Drills (the library, Positions a chip on it) |
| **Drills** on More; **My drills** under Settings → You | Training: the Drills tab; My drills a row on Training's Settings |
| **Club drills**, **Club templates** on Settings · Club · Teams | Training's Settings (an admin's shelves to tidy) |
| The ***what needs work*** card on Season | Training Home, one per team she plans for |
| **Plan** on Season's Coming up rows | stays, as the link into Training (below) |
| The **Scheduler** tile on Settings · Club · Teams | the Scheduler door |
| The **club week card** on Club home and on the Calendar's All teams | the Scheduler's Home (the strip); Club home keeps one line into it |
| The **Planner**: Find a time, Picture day, Coaches, clashes | the Scheduler, as its chips are today; the Planner's words off More's All teams line |
| **All teams** on More and Club home | stays: it is the calendar |
| **Fields and permits** | the club's, as `DOORS.md` has it: reachable from Teams, the Scheduler and Sessions, opening in whichever door she is in |

### How the tools link

The owner's rule: separate tools that can link. A link is a tap that
switches door to the thing it names, which `doorOf()` already does for a
screen that names its door, and is never a piece of the tool drawn inside
the core.

- **A practice → its plan.** On the core, a practice's sheet and the Coming
  up row carry *Plan* / *Open plan* for whoever may (`canPlan()`), which
  opens that practice's plan in Training and switches the door. Training's
  Home lists the same practices from the calendar, since a plan reads its
  entry. Nothing of the plan (its drills, its minutes) is drawn on the core.
- **The calendar → the Scheduler.** For an admin, Club home's one line (*2
  teams short this week · Scheduler*) and the All teams view's one line
  open the board on that week. The Scheduler writes the term onto the
  calendars as it does, and the core shows the result as entries, with no
  mark of where they came from.
- **A coach's slot → her word.** A coach opens the Scheduler (read-only)
  from More and gives *Works for me* / *This doesn't work* there, as built.
  Nothing of it on her Season.
- **A session → Sessions** as built: My calendar draws it, a tap opens it in
  Sessions.
- **Back** across a link goes to the screen the link was on, in its door
  (`test/routing.js`): a door switch is a screen change and gets an entry.

### The switch, with more than two doors

Today the title-row button is *the other door*, its icon and name, one tap.
With up to four:

- **Two doors**: unchanged. A family with sessions keeps the one-tap
  *Sessions* / *Teams* button that is built and captured.
- **Three or more**: the button draws the door she is in (its icon and
  name) and opens a sheet, `sheetDoors()`, listing every door she has with
  its icon and one line (the same lines More uses: *Your teams, games and
  practices* · *Drills and practice plans* · *The club's week on its fields*
  · *1-1s, groups, booking and fees*), the current one marked. More carries
  the same rows under a **Tools** heading, and Club home a tile per tool
  (today's Sessions tile generalised).
- Whoever has one door has no button, as now, and a tap at a door she does
  not have is refused in the handler (the retire-club rule).

### Who has which door, and where she starts

Decided from where her uid appears, never stored (`defaultDoor()` extended):

| Account | Doors | Opens in |
| --- | --- | --- |
| Admin | Teams, Training (the shelves), Scheduler, Sessions | Teams |
| Coach of a team | all four (the Scheduler read-only) | Teams |
| Team helper (Assistant coach) | Teams, Training (she plans today, `canTrain()`) | Teams |
| Tracker | Teams | Teams |
| Family with a child on a team | Teams, Sessions | Teams |
| Family whose only children are on no team | Teams, Sessions | Sessions |
| Session coach of no team | Sessions | Sessions |
| Club viewer, fan, a player's own sign-in | Teams | Teams |

A family's, a tracker's, a viewer's, a fan's and a player's own phone never
draws Training or the Scheduler, never offers either, and never asks the
database for a plan, a shelf or the club's needs: what `test/plans.js`,
`test/library.js` and `test/scheduler.js` pin today, pinned once more as
*no door*.

### Settings, by door

Settings is already the door's (`DOORS.md`, build 187). Two more Club
sections:

- **Club · Training**: Club drills, Club templates (admins), My drills (a
  coach's own, under You there and nowhere else).
- **Club · Scheduler**: Fields and permits, and the club's rules and tiers if
  the owner would rather they sit here than as the board's Rules chip
  (recommended: leave them on the board, where a change is seen at once).

The other tools' settings cards at the foot of each, for whoever has them.

### The title row

The club line carries the door's name for every door but Teams (*Training ·
Lakeside SC*, *Scheduler · Lakeside SC*), as it carries *Sessions ·* now,
so a glance says which tool she is in.

### Addresses

Nothing new for the doors themselves: the screen names its door. A team's
Training tab's address (`#/team/{id}/practice`) lands on Training's Home
for that team; the Scheduler's (`#/scheduler`) on its board, as now. The
old addresses land where what they showed went (`test/routing.js`).

### How to

Each tool gets its topics, picked by the same predicates (`howtoWho()`):
*Practices, plans and drills* is Training's; *Run the club* loses the term
step to a Scheduler topic (*Lay out the club's week*); each step's button
lands in the right door through `doorOf()`. `tools/screens/clips.js` walks
them as it does.

## What does not change

- **No data moves and no rule changes.** `orgs/{code}`, `training/{code}`,
  `userLibrary`, `org/sched/*`, `teams/{tid}/confirm` and every rule stay as
  they are. This is a frame change, so each step ships with no rules version
  and nothing for the owner to paste.
- One `app.js`, one install, one service worker, one manifest; the outbox,
  the local copies, `needsSignIn()`, `gated()` and every invariant in
  `CLAUDE.md`. A locked device draws no door, no switch and no bar.
- Calendar and Messages: one screen each, the same in every door.
- The game screens, the clock, subs, stats, Live and the Recap: unchanged by
  this brief (the open question below says whether they move later).
- Registration, tryouts and coach compliance are club admin work, not
  scheduling or planning, and stay where `DOORS.md` and build 187 put them
  (Registrations in Sessions' settings, Tryouts on Club home, Compliance in
  Teams' settings). If the owner wants the club's office as a tool of its
  own later, it is a fifth door by the same mechanism and a brief of its
  own.
- The vocabulary: `GLOSSARY.md`'s doors row grows to four, *Training* comes
  off its never-as-a-door list, and `test/copy.js` holds every screen in
  every door to it.

## Open questions for the owner

1. **The game itself.** Subs, Track, Lineup, Stats, Live, the Recap, Shapes,
   and Season's Stats and Minutes rows are match day, neither scheduling nor
   planning, and the Game tab is a family's door to the score. Recommended:
   they stay in the core this round. If the owner wants them out too, they
   are a fourth tool, **Match day**, by the same mechanism (a bar of its
   own, its Home the next game's lineup and the last game's recap), with
   Live and the score staying on the core's Games for families; say so and
   it goes into the build order as step 5.
2. **The switch with three or more doors**: a sheet from the title-row
   button (recommended, above), or a row of the doors' icons in the title
   row. A row is one tap but crowds a 360px phone beside the club switcher
   and the avatar.
3. **An assistant coach's Training door**: she plans today (`canTrain()`
   counts helpers). Recommended: she keeps it.
4. **The rules and tiers**: the board's Rules chip (recommended) or the
   Scheduler's Settings.

## Build order

Each step ships on its own, with `node test/run.js` green and no rules
change; nothing in a later one is needed for an earlier one to hold.

1. **Doors as a list, and the picker.** `DOORS` grows to four with an icon
   and a line each; `hasDoor()`, `defaultDoor()`, `doorOf()` and `navTabs()`
   read the list; `sheetDoors()` for three or more, the two-door button
   kept; More's Tools rows and Club home's tiles from the same list; the
   title row's door name. `test/doors.js` grows: who has which of the four,
   where each starts, the picker and the button, a tap at a door she does
   not have refused, a family's, tracker's, viewer's, fan's and player's
   phone never offered Training or the Scheduler. Nothing moves yet: the two
   new doors are empty of screens and not offered until steps 2 and 3, so
   this step changes nothing a person sees.
2. **The Training door.** Its Home by role from the pieces Season and the
   Training tab draw now (`comingUpCard()`'s practices, `needsWorkCard()`,
   the templates), Drills as its third tab (`viewPractice()`'s drills and
   positions), its Settings section (Club drills, Club templates, My
   drills), the team's tabs Season · Players, the Plan link on the core
   switching door, How to's topic, the glossary. `test/practice.js`,
   `test/plans.js`, `test/library.js`, `test/copy.js`, `test/nav.js`,
   `test/same.js` and `test/screens.js` amended where they name the tab;
   `test/doors.js` walks it as a coach, a helper and an admin and refuses
   the rest.
3. **The Scheduler door.** Its Home (the strip, the term, the three Planner
   chips as buttons), the board as its third tab, the Scheduler tile and
   the club week card off the core (one line into it kept on Club home and
   All teams), the Planner's words off More, its Settings section, How to's
   topic. `test/scheduler.js`, `test/planner.js`, `test/schedule.js` and
   `test/settings.js` amended where they reach it; `test/doors.js` walks it
   as an admin and a coach and refuses the rest.
4. **The core trimmed and captured.** Settings · Club · Teams down to Club
   details, People, Fields and permits, Coach compliance, Bulk import;
   `settingsLine()` and `sessClubLine()`'s siblings for each tool; every
   door captured with `tools/screens/` (a `tools` tour: each door's Home,
   third tab, More and Settings as each role that has it) and the How to
   clips made again.
5. **Match day as a tool**, only if the owner answers question 1 that way.
