# TeamPlayHQ — UX review, round 5 (build 192): the admin's phone

Round 4 (`UX-REVIEW-3.md`) asked whether the app was easy for a parent. This round asks the
owner's question of 2026-10-28: *"Go through the website as an admin, look at settings pages,
how to change settings, adding games, changing stuff, notifications, it all. Is it confusing? I
found myself overwhelmed by the setting pages."*

Captured the same way as round 4, with `tools/screens/`: the quiet club (`gen-club.js quiet
quiet.json fields`, a Wednesday evening with two teams, two fields and permits) opened at
390×844 as its admin (`boss`, Ada Okafor, who coaches no team), with the database out of reach
and the clock fixed, on the new `admin` tour: every tile on Settings in both doors and every
screen behind them, Club details, People and the invite builder, the Scheduler, Fields, Coach
compliance, Club drills, Club templates, Bulk import, Backup, Check readiness, About,
Registrations, Session fees, Coach hours, the calendar's `+`, Add a game from Season, a game's
⋯ menu and Edit this game, the Game tab, Club home, Messages and the account sheet. Forty
captures; ids in parentheses (`boss-admin 04-settings`) name one. Every measurement below is
read off the capture's inventory, not estimated.

**The short answer: yes, and the owner's instinct about where is right.** The Settings screen is
the thick part, but not because it has too many tiles. The eight club tiles are the short,
good part. It is thick because the person who runs the club gets, before the club, a card of
herself, her drills, a tutorial, two paragraphs about her browser's notification permission
and eight On/Off buttons, then a team she does not coach. The club she came for begins on the
third screenful. And once past Settings the same thing is reachable from three or four places,
each with a different name, so the way around is learnt three times.

**What landed well.** Settings as tiles with a line under each saying what is behind it is the
right shape: *People · 11 signed in · roles and invites*, *Fields and permits · 2 fields, their
permits and hours*, *Coach compliance · 3 with something not recorded* answer the question
before the tap (`04-settings`). The calendar's `+` asks what, then which team, in one sheet
(`31-calendar-plus`). The New game sheet's placeholders are a real game (*Riverside United*,
*Lakeside Park, field 3*, *Park on Elm Street, not in the school lot*) (`33-add-game`). A game's
⋯ menu says what Edit covers, *Opponent, date, kick-off, where, kit*, and the edit sheet is the
same form with *Is it on? On · Cancelled · Postponed* added (`35-game-menu`, `36-game-edit`).
Club home is a banner and two tiles with live counts (`38-club-home`). The Scheduler's *What
needs looking at* names the problem and the week (`15-scheduler`).

## 23. Settings: three and a half screens, and the club is on the third

`04-settings`: 2,896px tall at 844px a screen, six sections, 21 cards, 37 tappable things.
In order: **You** (her card, *My drills*, *How to use TeamPlayHQ*: 159–470px), **Notifications**
(a card telling her to click the lock icon beside the address, a card of four rows each with an
*On* and an *Off* pill, about 110 words of prose between them: 540–1,180px), **This team ·
B10 Storm** (four tiles: 1,265–1,576px), **Club · Teams** (eight tiles and a wide *Sessions
settings* card: 1,683–2,446px), **Advanced** (two tiles), **About**.

The admin's own things come first and the club's third, which is the order a parent's Settings
should have and the reverse of an admin's. She opens Settings for People, a field, the
Scheduler, a team's shapes, a backup; none is on the first screen. The notifications block is
longer than the whole club section, and it is the one block that is not a door to anything:
it does its work on this page, so it costs its full height every visit.

**Fix: Settings is a list of doors, and nothing else.** Every section a row of tiles, no
switches and no prose on the page itself, the club first for an admin:

- **Club** (the eight tiles as they are, both doors' tiles in one section for whoever has both
  doors; see 29).
- **Teams**: one tile per team, *B10 Storm · U10 · 9 players · Wren Bailey*, each opening the
  one team editor (see 25). The *This team* section goes.
- **You**: her card as one slim row (name, role), and one tile, **Notifications · Messages,
  notices, games and club activity on** (or *2 of 4 on*), opening a screen of its own (see 24).
  *My drills* and *How to* stay as tiles.
- **Advanced** and **About** as they are.

That is about 1,400px for this admin, under two screens, with the club on the first.

## 24. Notifications: eight buttons for four switches, and a browser lesson

`04-settings`, 540–1,180px. *What notifies you* is four rows (Messages, Team notices, Games and
practices, Club activity), each with two 40px pills, **On** and **Off**, the pressed one filled
(`muteset`, eight buttons). A row reads *Messages … On Off*, and the eye lands on the last
word. The card above it, *Notifications on this phone*, is 60 words about the lock icon beside
the address and what will reach her once she allows it; on a phone that has not said yes it is
the first thing under the You card, every time.

**Fix.** A screen of its own behind one tile (23). On it: one switch per row (a toggle, pressed
green, with the word *On* or *Off* beside it once), the sentence *Off means no pop-up and
nothing on a locked phone; it still waits on Messages or What's new* once at the top, and the
phone's permission as a single line with a button, *Notifications on this phone · Off · Turn
on*, the browser instructions only in the sheet that button opens when the browser has said no.

## 25. "This team" is whichever team she looked at last

`04-settings`: *This team · B10 Storm · How the team looks, plays and is tracked*, four tiles
(*Name and crest*, *Shapes*, *What to count*, *Links for families*). Ada coaches neither team;
B10 Storm is there because it was the last team open. For the real club's admin that is one of
twelve, chosen by where she last tapped. *Shapes*, *What to count* and *Links for families* exist
only here (`teamSetUp()`), so to set G12 Flight's shapes she must open G12 Flight, then More,
then Settings. Meanwhile Club details → Teams → Edit (`11-club-details-editteam`) edits name,
birth year and crest and nothing else, and does not say where the rest is. Two editors, each
holding half a team.

**Fix: one team editor.** A team opened from Settings → Teams (23) or Club details → Teams is one
screen: name and crest, birth year, who coaches it (a line into People), shapes, what to count,
links for families, and at the foot *Delete this team*. Season's own Settings line and Players'
set-up line open the same screen. Settings' *This team* section goes for an admin; a coach's
Settings keeps her own team's tile at the top of Teams.

## 26. Settings that are not in Settings

Switches an admin sets live where their screen is: *What parents see* on Club details
(`10-club-details`); the currency, *Sell packages* and *Emails to families* on Session fees
(`26-fees`); the children's-details deadline and what is required on Registrations
(`25-regs`); each coach's caps on the Scheduler's Coaches tab and the rules' tiers on its Rules
tab (`15-scheduler`); pay rates on Coach hours (`27-hours`). Each is near its work, which is
defensible one at a time; together they mean an admin asking *where do I turn on receipts* has
to know the answer is Session fees. Nothing on Settings says so (the Session fees tile reads
*What each family owes for 1-1s and groups, and what is paid*).

**Fix.** Club details becomes the one place the club's own switches live: name and badge, what
parents see, currency, emails to families, packages on or off, the details deadline. The
screens keep their work (what is owed, who ran what, the board). Where a switch stays on its
screen, its Settings tile names it (*Session fees · $0 owed · receipts off*).

## 27. Retire the club sits above the teams

`10-club-details`: Details (name, badge, Save), What parents see, then **Retire this club** with
a red 46px *Retire Lakeside SC* button at about 750px of a 1,467px page, then *Who runs it*,
then *Teams* with *Edit* and *Add a team*, then Ask an AI. The one irreversible thing on the
screen is in the middle, above the two cards she opened the screen for. On the Edit team sheet
*Delete this team and its games* is a quiet button under *Save changes*, the same size.

**Fix.** Destructive things last and behind a sheet: *Retire this club* a text link at the foot
of Club details opening a sheet that says what happens; *Delete this team* a red text link at
the foot of the team editor, the same. *Who runs it* and *Teams* move up under Details.

## 28. People: the admin's one action is two screens down

`13-people`: the heading, *By name*, five filter chips, then eleven person cards, then *Tap Roles
on anyone…*, then **Invites** with *Invite someone* at about 1,600px of 1,988, then Activity.
The thing an admin comes to People to do is below the fold by two screens, and the list it is
under grows with the club. The first card is *Unnamed · kid@example.com · Player G12 Flight*
(the player with her own sign-in, sorted to the top by an empty name). Every card carries a
date, *8/15/2026*, with no word saying what it is. Every card has a *Roles* button; three on
screen at once.

**Fix.** *Invite someone* beside the heading, a primary button, with the open invites as the
first card under it (*No open invites* when none). The date labelled, *Joined 15 Aug*, or
dropped. A person with no name said as *No name yet* and sorted last. The chips stay; they are
the right way to find someone in a club of a hundred.

## 29. "Sessions" means two things, and the door button says where you are going

On every admin screen in the Teams door the title row's right button says **Sessions**
(`04-settings`, `10-club-details`, `13-people`); in the Sessions door it says **Teams**
(`24-settings-sessions`, `28-home-sessions`). It names the other door, so it reads as a label
for where she is until she taps it. On the same phone *Sessions* is also Club home's second
tile (the 1-1s screen), a row on More, and the wide *Sessions settings* card at the foot of
Settings; and Settings' club section is headed *Club · Teams*. Four *Sessions* on one admin's
screens meaning two things, and the one that is a door is the only one not labelled as one.

The split of the club's tiles by door (build 187, the owner: Settings was too thick) halves the
club for the person who runs both halves. An admin looking for Registrations in Settings finds
Club details, People, Scheduler, Fields, Compliance, Drills, Templates, Import, and only at the
foot *Sessions settings · Registrations, session fees, coach hours*. The thickness came from
the prose and the switches above the tiles (23, 24), not from the tiles: the whole Club section
is 760px, less than Notifications and You together.

**Fix.** The door button says where she is and that it switches: *Teams ▾*, a switcher like the
club's name is. The admin's Settings has one Club section with every tile, grouped under two
small headings, *The season* and *The business*, since she has both doors anyway; a coach who
has both keeps the split. The *Sessions settings* card goes.

## 30. The first open is the calendar, not Home

`01-first-open`: a phone with nothing saved opens on **Calendar · All teams**, the Calendar tab
lit, 2,951px of practices with *Earlier (16)* at the top; `ui.view` starts as `calendar`
(app.js line 49) and staff keep what was open last. A family is sent to Home on open by design
(`landNow()`); an admin's first ever screen is the longest list in the app, and Home is a tap
away that nothing suggests.

**Fix.** A fresh phone opens on `homeView()` for everyone; a phone that has a last screen keeps
it, as now.

## 31. Adding a game: the doors are right, the sheet is the team's set-up again

Three doors, all sound: Season → *Add a game* under the Games heading (`32-season`, at
1,602px), the calendar's `+` → *A game* → the team (`31-calendar-plus`), Club home → *Schedule a
run of games* (`38-club-home`). The sheet they open (`33-add-game`, 53 tappable things) is
fourteen fields: opponent, date, kick-off, where, home or away, arrive by, kit, notes, halves or
quarters, minutes each, players on the pitch, shape, a Veo link, Create game. The last five are
the team's format, which the team already carries and the sheet already defaults (*Team default
for this side size*, 40 minutes, 11 v 11), and the shape dropdown lists every preset for every
side, *4-4-2 (11v11)* down to *1-2-1 (5v5)*, whatever side is picked. The date defaults to
today, a Wednesday, and kick-off is blank.

**Fix.** Two parts: the game (opponent, date, kick-off, where, home or away) and *More* folded
under it (arrive by, kit, notes, Veo link), with the format as one line, *11v11 · 2 × 40 min ·
team shape · Change*, opening the format fields only when tapped. The shape list held to the
side picked. The date defaulting to the team's next free Saturday would save a tap on most
games; today never is one.

## 32. Opening a game to change it lands on the coach's screens

`34-game`: a game opened from Season by the admin lands on **Lineup** (`/plan`) with *Subs ·
Track · Lineup · Stats · Live* across the top, the sideline set, for someone who came to move
the kick-off. The ⋯ menu's *Edit this game* is the right way and it is there; it is the
landing that is odd for her. Small: the game's sheet from the calendar (*Edit this game's
details* on it) is the better door for an admin and already exists. Left as is unless the Game
tab's *where she works* rule gains an admin case (Live, as a reader, when she coaches no team).

## 33. Developer words on an admin's screens

`22-readiness`, reached from the Settings tile *Check readiness · 2 things to fix*: *The read
index is not empty · 11 accounts*, *Every team with a role has a team index*, *Every coach is in
the coach index*, *Every team with parents has a parent list*, *The published rules match this
app · not checked yet — needs a signal*, *An app owner exists · set appOwners in the console*,
and *Set up what is missing … before you paste them*. The glossary allows this one sheet its
words. But the tile outside it says **2 things to fix** to every admin of every club whose
developer has not set `appOwners`, forever, about a thing she cannot do; and *index*, *console*
and *paste* are on the tile's own screen.

**Fix.** Rows an admin cannot act on are not hers: the app-owner row is the developer's and does
not count on the tile; the rules row counts only once checked. The tile says *Everything is in
place* unless something she can do is missing, and the rows are said in her words (*Every coach
is known to the club · 2 of 2*).

## 34. Stale and borrowed words

- More → **All teams** says *…what is still to settle, and the Planner* (`03-more`); Planner was
  retired for Scheduler in build 163 and the glossary bans it.
- **Coach compliance** opens on *What MSYSA asks of every head coach, assistant coach and admin…
  The checks are done through GotSport* (`17-comply`): Michigan's association and GotSport named
  on every club's screen, in the app that exists to replace GotSport. The club's state
  association and where its checks are done belong in Club details, or the sentence goes.
- The tile says **Fields and permits**, the screen is titled **Fields** (`16-fields`); the tile
  says **Registrations**, the screen is titled **Registration** (`25-regs`), and it leads with
  2,000px of *21 children have details still to finish* before any program, though the tile
  promised *Programs families register for, with their links and waivers*.
- **Club drills** on Settings opens `#/team/sbB/practice`, a team's Training tab on its drills
  (`18-club-drills`): a club setting that lands inside a team, with the team's tabs across the
  top.

## 35. The same door drawn three times

The Scheduler from Settings, from Club home's *Open the Scheduler*, and from the calendar's club
week card. *All teams* on More, when an admin's Calendar tab already is All teams. Settings from
More, from the foot of Club home, and from the avatar sheet (`40-account-sheet`). *Add a team*
on Club home and on Club details. Sessions from the door, Club home's tile, and More. Each
extra door is one more row to read on the way to the one she wants, and More for this admin is
nine rows (`03-more`).

**Fix.** More for staff: What's new, the club, Drills, How to, Settings, Clubs, Sign out. *All
teams* goes (the tab is it). Club home keeps *Open the Scheduler* and drops the *Settings*
button at its foot (More has it, one tap away on every screen). *Add a team* stays on both; it
is the one duplicate that earns its place.

## Order

23, 24 and 29 together are the owner's complaint and one change: Settings as doors, club
first, notifications behind a tile, one Club section. Then 25 and 27 (the team editor, and
destructive things last), 28 (Invite someone up top), 30 (open on Home), 34 (the words), 31
(the game sheet folded), 26, 33, 35, 32.
