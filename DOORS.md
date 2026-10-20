# Two doors: Teams and Sessions

Written before the code, as `SESSIONS.md`, `AVAILABILITY.md` and
`SCHEDULER.md` were: this one changes what every phone draws first, and
amends a decision the owner made in build 153, so the shape has to be agreed
before a screen moves.

The owner's ask, 2026-10-20: *the session and 1-1 scheduling should be a
separate thing. Like in this app but a "separate" app. A person in there for
the game does not need the bloat of the games going on. The calendars line
up though. One for the season and games and one for the business/training.
All under one roof but separated for users' sake.*

And the owner's answers the same day:

1. The second door is called **Sessions**.
2. **A switch, not a second install.** One repo, one site, one sign-in: *a one
   stop shop for soccer planning and club work.* Each door has its own icon,
   shown on the switch. Calendars, messages, account details and the children
   stay the same between the two.
3. **Messages do not key by team.** Team group chats key off the team; a
   conversation between people is about the accounts in it, whichever team or
   session brought them together.
4. The session coach who runs no team (below, *A coach of no team*) was not
   understood as asked, and is written up here plainly as the one decision
   still open.

---

## What people are trying to do

- **A family whose daughter does 1-1s and nothing else** opens the app to see
  Thursday's session, book the next free slot and see what she owes. Today she
  lands on a Home drawn as a team called *No team yet*, a Game tab that says
  games show up once the coach adds them, and Messages that is team notices.
  Three of her five tabs are about a season she is not in.
- **A coach who runs the finishing group and two evenings of 1-1s** wants her
  sessions, who is asking for a spot, her bookable times and her hours this
  month in front of her, not one row under More behind her team's Season.
- **The admin** wants the business side (every session, fees, coach hours,
  fields and permits) as a place of its own, and the season (teams, games,
  the Scheduler) as another, with one tap between them.
- **Everyone** keeps one Calendar, one Messages, one account and one set of
  children, whichever door they are standing in.

## What already holds

The back end is already split; this is a second front door, not a second
system.

- Sessions, bookings, the register, fees, pay rates, packages, bookable times
  and time off live at `training/{code}`, outside the club tree, for the
  reason `SESSIONS.md` gives: a session belongs to no team. The server books
  a slot on its own (`functions/book.js`). None of it moves.
- A child on no team already exists (`children/{cid}` with `club: true`,
  `AUTH.md`, *Sessions for a child on no team*) and her family books for her
  as the club.
- Fields and permits are club settings (`org/venues`), read by both halves: a
  practice is on a field and so is a session. They stay where they are.
- My calendar already draws both halves (`AVAILABILITY.md`, *A calendar of
  your own*): her teams, her children's sessions, her bookable times. *The
  calendars line up* is free, because there is one calendar.

What is not shared yet is the frame: `navTabs()` draws Home · Calendar · Game
· Messages · More for every signed-in account, `homeView()` decides Home from
her teams, and Sessions is one row on More and one card on Club home
(`canSessions()`: admins, any coach, any family).

## The decision this amends

`UX-REVIEW-2.md`, 9 (build 153) settled *the same app for everyone*: one bar,
the same tab ids for every role, so "tap Game" is true on every phone.
`test/same.js` and `test/nav.js` pin it. Two doors keeps the spirit with one
word added: **the same bar for everyone inside a door.** A coach, a parent and
an admin standing in Teams see the same five tabs; the same three standing in
Sessions see the same five. What changes is that some people stand in Sessions
by default, and some never see it at all.

## The shape

### Two doors, one app

| | Teams | Sessions |
| --- | --- | --- |
| For | the season: teams, games, practices, the Scheduler | the business: 1-1s, groups, booking, fees, hours, fields |
| Bar | Home · Calendar · Game · Messages · More | Home · Calendar · Sessions · Messages · More |
| Home | as today (`homeView()`) | what is next for her in sessions, by role (below) |
| Third tab | Games (`viewGames()`) | the Sessions list (`viewSessions()`, `list` and `avail`) |
| More | as today, less the Sessions row, plus **Sessions** (the door) | Settings, Fields, Session fees, Coach hours, Clubs, Sign out, plus **Teams** (the door) |

The same `app.js`, `index.html`, manifest and service worker. Not a second
page, not a second install, not a second repo or Firebase project: a second
project would make the calendars the hard part instead of the free part. If
the owner later wants a second icon on the Home Screen, that is a second
`start_url` and manifest, and goes in `HOSTING.md` under *Waiting on the
move*; the switch is built first and stands on its own.

### What is shared, and drawn the same in both

- **Calendar**: the one Calendar, My calendar and All teams, unchanged. Its
  `+` adds whatever she may add from either door.
- **Messages**: one screen, both doors, counted on the tab the same way.
- **The account sheet, Settings → You, Notifications, Clubs, Sign out.**
- **My players and the children's records**: her children are hers in both
  doors; a child on a team and a child on no team are both on My players.
- **Alerts, the bell, the badge, the outbox and the banner**: one phone, one
  outbox; nothing is "saved" in one door and owed in the other.
- **The title row**: the club as the switcher, as today; the door switch
  beside the account button (below).

### The door is a mode the phone remembers

- `ui.door` is `'teams'` or `'sessions'`, kept in `sm.ui.v1` beside the rest
  of `ui`, per phone. It is not a role and is never written to the database.
- **The screen decides the door where it can.** A team's screens, a game,
  Games, the Scheduler and All teams are Teams. The Sessions list, Bookable
  times, Fields, Session fees and Coach hours are Sessions. Opening one by a
  tap, a link, an alert or a notification switches the door to match, so a
  family tapping a session alert from Teams lands in Sessions, and a coach
  tapping a game from Sessions lands in Teams. The remembered door decides
  only the shared screens (Home, Calendar, Messages, More): which Home draws
  and which bar sits under the Calendar.
- **Addresses.** `#/training…` is already the Sessions screens' address and
  stays. Nothing new is needed for the door itself, since the screen names
  it; `hashToUi()` sets the door from the screen and `uiToHash()` reads
  nothing from it.
- Back works as it does (`test/routing.js`): a switch is a screen change and
  gets an entry; the bar's tabs replace, as today.

### Who has which door, and where she starts

The default is decided the way `navKind()` decides Home, from where her uid
appears, never stored:

| Account | Doors | Opens in |
| --- | --- | --- |
| Admin | both | Teams |
| Coach of a team | both | Teams |
| Team helper, tracker | Teams only | Teams |
| Family with a child on a team (another on no team or not) | both | Teams |
| Family whose only children are on no team | both (Teams is her children's registrations and nothing else; see below) | **Sessions** |
| A coach of no team (once built; below) | Sessions only | Sessions |
| Club viewer, fan, a player's own sign-in | Teams only | Teams |
| Signed in, no club yet | as today | as today |

`canSessions()` is already who has the Sessions door. Whoever has one door
has no switch and no row for the other, and a tap that reaches the handler
anyway is refused (the retire-club rule in `CLAUDE.md`: check in the handler,
not only in the render).

A family whose only children are on no team is the person this is for. Her
Teams door is nearly empty: Home there says her children have no team yet and
offers Sessions, with any open registration or offer she has
(`regCards()`, `kidCards()`), since tryout offers and registration are the
season's business. That is why she keeps both doors rather than Sessions
alone: the day her daughter is placed on a team, the Teams door is already
there and Home switches to the team.

### The switch

One button in the title row, beside the account avatar, for whoever has both
doors: it draws the **other** door's icon with its name as the label, so it
reads *Sessions* in Teams and *Teams* in Sessions. The same row on More, at
the top, with the icon and one line (*1-1s, groups, booking and fees* /
*Your teams, games and practices*). Tapping it goes to that door's Home and
remembers the door. The two icons are the owner's ask; they are also what
tell a person which app she is in at a glance, so the Sessions door's icon
sits in its title row as the club's crest does.

### Sessions Home, by role

The same card shapes the Teams Home uses (`nextUpBlock()`, `goCard()`,
`prow go`), so the suites that hold the frame (`test/visual.js`,
`test/same.js`, `test/copy.js`) hold it too.

- **A family**: her children's next session as the next-up card (when, where,
  who with, Directions, Add to your calendar, *Cancel her place* where the
  notice allows), then *Book a time* (the coach's free slots and the open
  groups that suit her children's ages, which `familySessions()` draws
  today), then what she owes (`familyOwed()`), then what has been. Never
  another child's name.
- **A coach**: today's and the next sessions she runs, who is asking for a
  spot (*Answer*), her bookable times this week with what is booked, her
  hours this month (`sessHoursView()`'s own numbers for her alone), and *New
  session* / *Offer a time*.
- **An admin**: every session coming up, asks across the club, fees owed,
  this month's hours and what they come to, fields with a permit ending soon,
  and the same two buttons.

Nothing on this Home that a role may not do: the handler checks `canOffer()`,
`canRun()` and `guardsAnyone()` as the Sessions screen does now.

### Messages: people, not teams

The owner's rule: a team group chat keys off the team; a conversation
between people keys off the accounts in it.

What exists:

- `board/{code}/{tid}`: the team's notices. Keyed by team, one-way, as the
  owner wants. Unchanged.
- `dm/{code}/{tid}/{familyUid}`: the team's conversation with one family,
  readable by that family, every coach of that team and the admins; *never
  one coach alone* is the lock's promise on screen. This stays as the team's
  conversation with a family (*Message the coaches*), because that promise
  was a safeguarding decision and the team is who it is with.
- `staffdm/{code}/{a}~{b}`: two colleagues, keyed by their two uids, readable
  by those two alone. This is already keyed by accounts.

What is added: **`talk/{code}/{a}~{b}`**, a conversation between two accounts
in the club, uids sorted, the `staffdm` shape generalised:

```
talk/{code}/{a}~{b}/
  m/{id}        { by, at, text }          // append-only, in the writer's name
  seen/{uid}    number                    // each reader's own
  got/{uid}     number
```

- **Who may be in one**: both in `access/index` of the club, and at least
  one of them staff (an admin, a coach of any team by `coachIndex`, a helper
  by `helperIndex`, or a session coach once that role exists). A family and
  a session coach, a family and an admin, two coaches: all of these. Two
  families are not: parents never see another family's name in the app, and
  a parents' chat is a different product.
- **Who reads it**: the two, and the club's admins. The admins' read is what
  keeps the spirit of *never one coach alone* with a family while the team's
  other coaches drop out of a conversation that was never about the team.
  The lock on screen says exactly that: *Kept to the two of you and the
  club's admins.* Two colleagues' `staffdm` stays the two alone and is not
  moved; new colleague conversations may use `talk` or `staffdm` as the
  build finds simplest, but one of them, not both.
- **A child with her own sign-in is never in one.** She keeps reading and
  writing in her parents' conversations (`famThreads()`) as today, and no
  `talk` is keyed by her uid. A rule cannot find her guardians from a
  root-level id, and a child alone in a chat with an adult is not a thing
  this app makes.
- Rules version 34: `talk` with the clauses above, in `test/rules.js` first
  for every kind of account (a tracker, a fan, a stranger, two families, a
  player's own sign-in all refused). A push trigger beside the three message
  triggers in `functions/push.js`, telling the other person and never the
  author, honouring `mute/msg`. `test/messages.js` and `test/push.js` grow
  cases; `watchElseMessages()` listens to `talk` in her other clubs as it
  does `dm`.
- **On screen**, Messages is one list for both doors: team notices, the
  team's conversations, and conversations with people, each row saying who
  it is with and, for a `talk`, what it is about if it was opened from a
  session (*about Thursday's 1-1*, a line on the first message, not a key).
  *Message the coach* on a session's sheet opens the `talk` between the
  family and that session's coach; *Message the family* on a booking opens
  the same one from the coach's side. New message's one searchable list
  (`msgPeople()`) offers the people she may talk to, which for a family is
  the coaches of her children's teams and the coaches of her children's
  sessions.

Nothing is migrated: the team conversations stay where they are and keep
their history.

### A coach of no team (the question the owner did not follow)

Today a person may offer or run a session only if she is an admin or **a
coach of some team** in the club (`canOffer()`, `canRun()`, and the rules on
`sessions` and `booked` through `coachIndex`). A goalkeeper coach the club
pays only for 1-1s, who runs no team, has no way in except being named a
coach of a team she does not coach, which gives her that team's squad, its
games and its conversations. `SESSIONS.md` left her out (*Outside trainers …
`AUTH.md`'s territory*).

The Sessions door is where she naturally lands, so the question is: **does a
"session coach" role, belonging to no team, come with this?**

Recommended: yes, as the last step of the build order, since it is a role
and a rules change and nothing earlier depends on it. The shape:
`access/sessionCoaches/{uid}` (an admin names her, as viewers are made),
counted by `hasAnyRole()` and in `access/index` like everyone; the rules on
`training/{code}/sessions|booked|came|fees|pay|splans|avail|away` accept her
where they accept `coachIndex` today; `canOffer()` and `canRun()` the same;
`functions/access.js` keeps her in the index; she gets the Sessions door
alone, sees no team's squad, games or conversations, reads the names of the
children booked with her and nobody else's, and may be in a `talk` with a
family as any staff may. Also plain: if the owner would rather these people
be named a coach of a team for now, nothing here breaks, and the step is
left out.

**Decision: open.** The owner answers yes, no, or later.

## What does not change

- No data moves. `orgs/{code}`, `training/{code}` and every rule stay as
  they are until step 4 adds `talk` and step 5 (if taken) adds the role.
- One `app.js`, one install, one service worker, one manifest.
- The outbox, local copies, `needsSignIn()`, `gated()` and every invariant in
  `CLAUDE.md`. A locked device draws no door, no switch and no bar.
- The vocabulary: `GLOSSARY.md` gets **Teams** and **Sessions** as the two
  doors, and `test/copy.js` holds every screen in both doors to it. The
  Sessions door never says *Training* (the team's drills tab) and the Teams
  door keeps *Sessions* as the door's name only.

## Build order

1. **The door and the two bars.** `ui.door`, `navTabs()` by door, the screens
   that name a door setting it, the shared screens reading the remembered
   one. Teams is unchanged for everyone with Teams alone. The Sessions bar's
   third tab is today's Sessions screen. `test/nav.js` and `test/same.js`
   amended to *the same bar inside a door*; a new `test/doors.js` pins who
   has which door, where each account starts, the switch remembered through
   a reload, every shared screen the same in both doors, a tracker, a fan, a
   viewer and a player's own sign-in never given the door, and a locked
   device given nothing.
2. **Sessions Home, by role**, from the pieces `viewSessions()` already draws,
   handler checks and all; `test/sessions.js` and `test/doors.js` walk it as
   a family, a coach, an admin, and refuse the rest.
3. **The switch and the defaults**: the title-row button and the More rows
   with the two icons, a family of no-team children opening in Sessions, a
   link, alert or notification switching the door to its screen, Back
   honoured (`test/routing.js`). Capture both doors with `tools/screens/`.
4. **Messages keyed by people**: `test/rules.js` cases first, rules version
   34, `talk`, its push trigger, the Messages list, *Message the coach* on a
   session and *Message the family* on a booking.
5. **A coach of no team**, if the owner says yes: the role, its rules (version
   35), the server's tables, People's *Name a session coach*, and her door.

Each step ships on its own; nothing in a later one is needed for an earlier
one to hold.
