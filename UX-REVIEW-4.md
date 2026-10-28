# TeamPlayHQ — UX review, round 5 (build 192): a new parent and a new coach

The question this round, from the owner (2026-10-28): *"go through the website like a new user,
both parent and coach, and tell me how confusing this app is."*

Captured with `tools/screens/` on the invented club (`gen-club.js quiet`, `live`, `details`; the
`anon`, `landing`, `family`, `staff`, `look`, `live`, `subs`, `gamelook` and `howto` tours; the
onboarding states and the share pages), as a phone that has never opened a club, a phone signed in
with no club, a parent of one child on a quiet Wednesday and on game day, the coach, and the admin.
Three more walks were scripted for this round and are described in the appendix: the coach setting
her team up (`jaz-setup`, `jaz-link`), the admin setting the club up and stepping into the Sessions
door (`boss-setup`), and a club with no teams in it yet (`empty`), which is what anyone who taps
*+ Start a new club* sees first. Capture ids in parentheses name a screen in that set; every finding
was checked against the capture and the code it names. Nothing UX-REVIEW-3.md's build order fixed
is repeated.

*Built in build 193, the same day: every finding in sections 23, 25 and 26 but two, and 24.1's
explanation. Left: hiding the Sessions pill where the club has nothing behind it (24.1 (a)), which
is the owner's call, since DOORS.md gives every family both doors; Settings' *This team* following
the team she chose to look at (23.4), which `test/settings.js` pins on purpose (a coach reads another
team's set-up there) and which 23.2 covers on a new phone; and the optional 26.2. The re-capture
after the build is what the owner has; the checks in section 29 hold each fix. The three extra walks
are still outside `shoot.js`.*

## The short answer

**For a parent who arrives by invite or team link, the app is not confusing.** It is one of the
clearer ones: the invite says who invited her and which shirt, the team link asks for a number and
says what happens next, Home is her child, the next thing with *Going / Not going / Maybe* on it, and
the next game, and every sheet from the calendar is the same shape. Three rounds of review are
visible here. A parent could use this with no help.

**The confusion is concentrated in four places, and three of them hit a new coach, not a parent.**

1. **The first five minutes for anyone who is not a parent arriving by link** (section 23). A
   person who starts a club is greeted by a developer's debugging message about a "code" she never
   typed. A coach who accepts an invite opens on the Calendar, and her first Home is a team she does
   not coach, with a card telling her she cannot change it. A signed-in person with no club is told
   she can start one, and the button is white on white.
2. **The Sessions door** (section 24). A large green pill on every screen, for everyone, that swaps
   the whole bottom bar for a different one. A parent of one U12 player sees *Sessions* three times
   before she has seen her child's next practice twice.
3. **Words a coach meets with no introduction** (section 25): *9 short*, *141 planned*, *Spot*,
   three names for the lineup drafter, *Buzz me* on the screen and *Notify me* in the guide, the
   retired word *Planner*, and a *Check readiness* sheet that tells a club admin to *set appOwners
   in the console*.
4. **Too much, said more than once** (section 26): a 120-word paragraph about Outlook at the foot
   of the coach's Home, *Add to my calendar* twice on one screen, an admin's Settings 5,800px tall
   with the one thing marked *to fix* at the bottom, a sentence explaining a button that is not
   there.

None of it is structural. The frame (five tabs, one back arrow, the title row, the sheets) is
learned in a minute and holds on every screen. The fixes in section 28 are about three days, and
the first day removes everything a new coach would call broken.

## What landed well (keep it)

- The invite (`onboarding 03-invite-ready`): *Ada Okafor has invited you as a parent of the player
  wearing shirt 7 on G12 Flight. You are signed in as … Not your child's number? Ask Ada Okafor for
  a new link.* Nothing to add.
- The team link (`06-join-form`, `08-join-waiting`): *On the team / Not on it yet*, the shirt number,
  *A coach of the team checks this and lets you in. You see nothing of the team until then*, and the
  waiting screen with *Cancel the request*.
- The sign-in sheet (`anon 02-signin-sheet`): one hero, Google, *Email me a link / Use a password*,
  and the one line that matters: *If your invitation came by email, use that address.*
- A parent's Home (`mum-quiet 01-home-first`): her child in one line, the next practice with
  *Is Rosa going?* and the answer control, the next game with arrive-by and kit, the games.
- Every sheet from the calendar (`19-practice-sheet`, `22-game-sheet`): her answer first, a note box,
  *1 going so far. The coach sees your answer and any note*, then When, Where, Ground, Arrive by, Kit,
  Format, Notes, Directions, and the calendar buttons.
- The Recap (`09-last-game`): *1–1 · A draw for G12 Flight against Hill End, over 60 minutes*, then
  *When it happened* as a picture.
- Messages (`25-messages`, `26-thread`): *Message the coaches* where her thumb is, *Notices are
  one-way. To reply, message the coaches*, the lock line saying exactly who reads it.
- The sub sheet (`jaz-subs 02-subs-sheet-off`): *Dara coming off. Tap who takes her place.* with
  minutes and *39 short* on each candidate, orange for the furthest behind.
- Track's full screen (`jaz-gamelook 05-track-full`): every button on one screen, each naming its
  side, *Undo last*, *Logging as*.
- Players (`jaz-look 03-players`): the squad in one card, *Add a player* with two boxes and *Add*,
  the *Parents* card with one button, *Team settings* under it. A coach can set a team up from this
  one screen.
- The Add a game and Add to the calendar sheets (`jaz-setup 01-add-game`, `04-calendar-plus`): every
  field labelled in plain words, examples in the boxes.
- *Fields* for an admin (`boss-setup 06-fields`): *Typed on the calendar, not a field yet* with the
  places already typed as chips. The best empty state in the app.
- How to (`jaz-howto 01`, `02`): short topics, numbered steps, a button where a step names a
  screen, picked for the role.

## 23. The first five minutes

### 23.1 A brand-new club greets its founder with a debugging message

`empty 02-home`, `04-calendar`: a club with no teams yet, as an admin, on Home and on the Calendar:

> **No teams here** — Nothing is stored under `lakeside`. If you expected teams, check the code
> character by character — it is case sensitive and order matters. [Add a team]

That is the sentence from the workspace-code era, when a coach typed a code into a box. The box is
gone (README, *Joining a club*: "Workspace codes are gone from the screen") but the sentence is not:
`app.js` 8604 draws it whenever `wsCode()` is set, which is every club now, and the plain version
(*Add a team, then its players. Everything else hangs off that*) only when it is not, which is
never. So the first thing every person who taps *+ Start a new club* reads is a warning about a code
she never saw, in a monospace face, telling her to check its spelling. A coach invited into a club
whose admin has not added a team yet reads the same with no button under it. **Blocker.** Fix:
drop the `c ?` branch; say *No teams yet. Add a team, then its players; everything else hangs off
that.* with *Add a team* for an admin and *Ask the club admin to add your team* for anyone else.
Pin in `test/signout.js` or `test/join.js`: a club with `teams: {}` and a code draws no `<code>`.
**An hour.**

### 23.2 A new coach opens on the Calendar, and her first Home is a team she does not coach

`jaz-quiet 01-home-first` is `#/calendar` (*My calendar · All teams*, the month, *Earlier (9)*);
`02-home`, after tapping Home, is `#/team/sbB/season`: **B10 Storm**, the other age group, under a
card: *You can read B10 Storm, not change it: it is another team's. Show me how · Got it.* The same
for the admin (`boss-quiet 01-home-first`: the Calendar). The seed remembers no screen and no team,
which is exactly a phone that has just accepted an invite: `redeemInvite()` ends in
`location.reload()`, `ui` starts as `{ view: 'calendar', teamId: null }` (`app.js` 49), the landing
code lands a family on Home and says *Staff keep what was open last, as before* (27358), and with
nothing open last, 7817 picks `teams()[0]`, which `teams()` sorts by name, so *B10* beats *G12*. A
coach who accepted an invite to G12 Flight is therefore shown, first, everyone's calendar, and
second, somebody else's team with a note that it is not hers. The two things she most wants to know
(*is this my team?* and *where are my players?*) are both answered wrong. **Blocker.** Fix: on a
phone with no remembered screen, staff land on Home like a family does, and the team picked when
none is remembered is `myTeams()[0]` (a team she has a role on) before `teams()[0]`. Pin in
`test/nav.js`: a staff phone with no `sm.ui.v1` opens on the Season of a team she coaches.
**Half a day.**

### 23.3 "+ Start a new club" is invisible

`newbie 01-landing`, a signed-in phone with no club: the lock card says *Nobody has added you to a
team yet … Or start a club of your own:* and then nothing. The button is in the HTML
(`+ Start a new club`, 107×40, `app.js` 8086) and is drawn in `rgba(255,255,255,.8)` on the card's
white body, because `.linkbtn` (`styles.css` 309) is the style for the dark clock band. The one
sentence on that card that tells a coach how to begin has a colon and an invisible verb after it.
**Blocker** for the coach-starts-a-club path. Fix: give the lock card's link `.auth-link` or
`color: var(--field-deep)`; hold it in `test/visual.js` (no `.linkbtn` inside `.auth-card-body`).
**An hour.**

### 23.4 Settings contradicts itself about which team is "this team"

`jaz-quiet 08-settings-full`: the *You* card says *Head coach · G12 Flight*; two screens down,
*This team · B10 Storm · Read only: its coaches change it*. The section follows `ui.teamId`, the
team last looked at (here the one 23.2 picked for her), not the team she coaches. A new coach
reading her own Settings is told she is the head coach of one team and shown the settings of another
she may not touch. Fix: with 23.2 the default is right; and *This team* should prefer a team she
has a role on when the last-looked-at team is not one. **An hour**, mostly 23.2.

### 23.5 Games with no teams tells the admin to wait for the coach

`empty 03-game`: *No games yet. They show up here once the coach adds them.* — to the admin who is
about to be the coach. `app.js` 8731 draws the coach's line only when `canCalTeam(ui.teamId)`, and
with no teams there is no `ui.teamId`. Say *Add a team first, then its games* when there are no
teams. **Half an hour.**

### 23.6 The New team sheet says "squad"

`empty 07-add-team`: *The year most of the squad were born* (`app.js` 24697). *Squad* is on the
glossary's never list; `test/copy.js` does not render this sheet. *The year most of the players
were born.* Add the sheet to the suite. **Half an hour.**

### 23.7 "Not synced" on a phone that has nothing to sync

`anon 01-welcome`: the badge on a phone that has never opened a club says *Not synced*, beside an
empty avatar with a dot in it. To a new person *Not synced* is a problem she has caused before she
has done anything. With no club and nobody signed in, the badge should say nothing, or *Sign in*
(which the glossary already lists). **Half an hour.**

## 24. The Sessions door

### 24.1 A pill on every screen, for everyone, that swaps the whole app

Every capture of every role carries a large green pill at the top right, *Sessions*, with a cone
icon (`mum-quiet 01-home-first` and every screen after it). Tapping it (`boss-setup 08-sessions-home`,
`09-sessions-more`) changes the bottom bar to *Home · Calendar · Sessions · Messages · More*, the title
to *Home / Sessions · Lakeside SC*, the Home to *No sessions coming up in the club. New session offers
a 1-1 or a small group to players from any team*, More to *Fields · Session fees · Coach hours · Teams
· …*, and the pill itself to *Teams*. Nothing on the way in says that the bar is about to change, and
the way back is a pill with a different word on it. For the owner's two doors (DOORS.md) this is as
designed; for a new person it is the single most disorienting tap in the app, and it is the most
prominent control on the screen.

Three things make it worse than it needs to be:

- **It is offered to everyone, even where there is nothing behind it.** The parent of one child in
  a club with no sessions, no bookable times and no session coach sees *Sessions* in the pill on
  every screen, as a row on More (*1-1s and small groups with the club's coaches*), and as the only
  tile on Club home (`mum-quiet 29-club-home`: a lone *Sessions* tile beside nothing). The admin's
  More says it a fourth time. That is more screen than her child's next game gets.
- **The pill says where it goes, not what it is.** *Sessions* reads as a screen, like *Calendar*.
  It is a mode.
- **The guide covers it only for admins.** HOWTO *sessions*, step 3, *The Sessions door, from More
  or the switch at the top, is the club's business side*, is `who: ['admin', 'sesscoach']`. A
  coach or a parent who taps the pill gets no explanation anywhere.

This is the owner's call, not a bug. Three options, cheapest first: (a) draw the pill only for a
club that has sessions at all (a session, a bookable time, a session coach or a fee set up), and
for everyone else keep *Sessions* as the row on More it already is; (b) keep the pill but make the
switch say so once, a one-line card at the top of the Sessions Home the first time (*This is the
club's Sessions side: 1-1s and small groups. The Teams side is the pill at the top*), kept in
`sm.role.v1` like the role card; (c) both. Add the step to the HOWTO *around* topic for everyone.
**Half a day** for (a) and (b) together, once decided.

## 25. Words a new coach meets without an introduction

### 25.1 "9 short", "39 over", "141 planned"

`jaz-subs 01-subs`: every row on the pitch says *38 min · 9 short*. `jaz-link 05-minutes`: every
player *141 planned · 39 over*. Short of what, over what? The glossary chose *short / over* over
*owed* (right), but a coach who has set no targets meets them with no noun. One word fixes it:
*9 min short of target* the first time on a screen, or an ⓘ beside *On the pitch* and beside
*Minutes* that says *short and over are against each player's target minutes; set them on Lineup*.
**An hour.**

### 25.2 "Spot"

`jaz-subs 01-subs`: a grey pill labelled *Spot* at the end of every row that has no spot, *Midfield*
on the one that has. A pill that says *Spot* reads as a command (*spot her?*) or a column heading,
not as *no spot yet*. *No spot* or an empty dashed pill. **Half an hour.**

### 25.3 Three names for one drafter

`jaz-gamelook 03-lineup`: the big button is *Plan kick-off*; under it, *Or let the app draft one
from your target minutes, or paste back an answer from Ask an AI*; under that, *Targets are
optional — they are what **Build one for me** aims for* (`app.js` 10833), and *Build one for me* is
a card heading further down (10835). Pick one name and use it in all three places. **An hour.**

### 25.4 "Buzz me" on the screen, "Notify me" in the guide

`mum-quiet 04-next-game-live`, `mum-live 02-game-live`: *Goals and the final whistle · [Buzz me] ·
Works while TeamPlayHQ is open on this phone.* HOWTO *follow*, step 3 (`app.js` 1794): *Notify me on
Live tells this phone about each goal…* A parent following the guide looks for a button that is not
there. The screen's word is at 10093. Make them the same; `test/howto.js` could hold every button a
step names to a button on that screen. **Half an hour.**

### 25.5 "the Planner"

`boss-quiet 07-more`: *All teams — Every team's calendar: this week, what is still to settle, and
the Planner* (`app.js` 8393). The glossary retired *Planner* for *Scheduler* in build 163;
`test/copy.js` does not ban it. Change the word and add it to the never list. **Half an hour.**

### 25.6 Check readiness talks to the developer, and counts the developer's to-do against the admin

`boss-setup 03-readiness`, reached from Settings → Advanced → *Check readiness · 2 things to fix*:
*The read index is not empty · 11 accounts*, *Every team with a role has a team index*, *Every coach
is in the coach index*, *Shared teams have an owner list*, then the two crosses: *The published rules
match this app · not checked yet — needs a signal · fix* and *An app owner exists · set appOwners in
the console · fix*. The second is the app owner's job (README, *Becoming the app owner*), not the
club admin's, and it is counted in her *2 things to fix* on every admin's Settings. The index lines
are the rules' vocabulary; `test/copy.js` allows this one sheet, which is right for the rules
file, but *read index* and *coach index* could be *Who may open the club* and *Who may plan
practices* without losing anything. Fix: hide the app-owner row from club admins (or show it only
to `isOwner()`), count it out of *things to fix*, and reword the index rows. **Two hours.**

### 25.7 A lecture about planning, during the game

`jaz-subs 01-subs`, 38 minutes in: the first card on Subs is *Planned subs · [Open Lineup] · Plan the
game on Lineup and lock it in: this card then counts down to each change and says when subs are
due.* It takes the top third of the screen the coach is subbing from, and it is asking her to go
and plan a game that is being played. Once the game has kicked off with no plan locked, shrink it
to one line under the list (*No planned subs. Lock a plan on Lineup next time and this counts
down to each change*) or drop it. **An hour.**

### 25.8 "Practice" three times on one sheet

`jaz-setup 04-calendar-plus`, *Add to the calendar*: the first row of chips is *Practice · Something
else · A game → · A run of games →*; the second, *What kind*, is *Practice · Technical · Film ·
Goalkeepers · Fitness · Scrimmage*; and the *What* box's placeholder is *Practice*. A coach who has
picked *Practice* is asked what kind, and the first answer is *Practice*. Call the kind *Regular*
(or *Usual*), and leave *What* empty with the placeholder *A name, if it needs one*. **An hour.**

### 25.9 Make a team link with no signal does nothing

`jaz-link 01-teamlink`: *Make a team link* tapped with no signal: no sheet, no toast, the same
screen. `makeJoinCode()` writes straight to the database (right: a link needs a signal), and the
write neither fails nor returns while the SDK keeps retrying, so nothing is said. The one toast it
has for the offline case, *Needs a connection to the database*, fires only with no SDK at all, and
names the database. Check `navigator.onLine` (and the sync state) first and say *Needs a signal to
make the link*. **Half an hour.**

## 26. Too much, said more than once

### 26.1 The calendar-sync essay at the foot of the coach's Home

`jaz-look 01-home-full`: after the record, the games and the three rows, a card *In your own
calendar* with *Everything of yours, in one calendar: My calendar*, then ~120 words (*Or this team
alone: subscribe once and your calendar follows every change — a moved kick-off, a called-off
practice, a new tournament. Apple and Outlook check about every hour; Google keeps its own pace,
often several hours. … The address shows practices as well as games — never names. It is the team's,
not one person's: replace it when someone leaves the team, or it keeps reaching them. Outlook: Add
calendar → From internet and paste the address.*), two buttons and a third. The parent's Season has
the shorter version. The HOWTO *calendar* topic exists for exactly this. One card, two buttons, one
line (*Nobody is named in it*), and the rest in the sheet the button opens. **An hour.**

### 26.2 "Add to my calendar" twice on one screen, and "Directions" twice

`mum-quiet 01-home-first`: the practice card has *Directions · Add to my calendar*; the game card
under it *Open the game · Directions · Add to my calendar*. Two pills with the same words, one
screen apart, doing different things (one entry each). They are right per card, but on first look
they read as the app repeating itself. Keep them; make *Add to my calendar* say which (*Add Thursday
to my calendar*) or move it into the sheet the card opens. **An hour**, optional.

### 26.3 An admin's Settings is 5,800px tall, and the one thing marked "to fix" is at the bottom

`boss-quiet 08-settings-full`: You (3 cards) · Notifications (a 70-word paragraph, then four
switches) · This team (4 tiles) · Club · Teams (8 tiles) · Sessions settings · Advanced (Backup,
*Check readiness · 2 things to fix*) · About. A new admin looking for *what do I set up first* scrolls
past twenty things and finds the to-do under *Advanced*. Two moves: when readiness has crosses, say
so once in a card at the top of Settings (as *Waiting to send* already is for a parent,
`mum-quiet 31-settings-full`); and fold the Notifications paragraph into one line with a *Turn on*
button and an ⓘ. **Two hours.**

### 26.4 The Clubs sheet explains a button it does not have, and offers a parent a club of her own

`mum-quiet 35-club-switch`, a parent in one club: *Lakeside SC · open now · here*, then *Forget takes
this club off this device only.*, with no Forget anywhere on the sheet, then *Club home*, then
*+ Start a new club · You become its admin*. The More sheet's row for it is *Clubs — Start a new
club* (`28-more`). The *Forget* line belongs beside a Forget button, and only when there is one; and
a parent does not need *Start a new club* on More and again here (keep it on the lock card, fixed
per 23.3, and under More's *Clubs* for staff). **An hour.**

### 26.5 One state, three phrasings

The badge and Settings say *Waiting to send · 1*; the sheet the badge opens is titled *Not saved to
the club yet* and begins *1 change is on this phone and nowhere else. They stay here, and are sent
again…* (`mum-quiet 34-sync-badge-tap`). Same state, two names and a plural for one change. Title the
sheet with the badge's words and say *It stays here*. **Half an hour.**

### 26.6 Five ways to fill a plan, at once

`jaz-setup 02-plan-practice`, a practice with no drills: *No drills yet* then *Add a drill ·
Suggest a session · Plan from a template · Ask an AI for a session* and two more below the fold. For
a coach who has never planned here, lead with one (*Suggest a session for this team's age*) and
put the rest under *Other ways*. **An hour.**

## 27. Smaller things seen on the way

- The ⋯ menu on a game, for a parent, is only *Older game / Newer game* (`mum-quiet 06-game-menu`);
  ⋯ promises actions. Fine, but the picker behind the title does the same job better.
- Day view with nothing on draws a full empty hours grid under *Nothing on today. Next: Practice
  tomorrow 6pm* (`16-calendar-day`). The sentence is enough; the grid could start at the next thing.
- *Unnamed · kid@example.com · Player G12 Flight* on People (`boss-setup 01-people`): a player's own
  sign-in with no name shows as *Unnamed* above everyone. Seed data here, but a real one would too;
  *A player (no name yet)* and sort last.
- The Notifications paragraph gives desktop advice (*Click the lock icon beside the address*) in the
  rig because headless Chromium is not a phone; on a real phone the platform text is right. Not a
  finding.
- The registration link and the team link captures show *local* in the badge; that is the capture
  shell, not the app.

## 28. Order of work

1. **The first five minutes**: the debugging message (23.1), a new coach landing on her own team's
   Home (23.2, 23.4), the invisible *Start a new club* (23.3), *squad* on New team (23.6), the no-
   teams Games line (23.5), the badge on an empty phone (23.7). `test/signout.js`, `test/nav.js`,
   `test/copy.js`, `test/visual.js`. **A day.** This is the day that matters.
2. **The Sessions door** (24): the owner's decision, then (a) and (b). `test/doors.js`,
   `test/howto.js`. **Half a day.**
3. **Words** (25): short/over named, *Spot*, one name for the drafter, *Buzz me* = the guide,
   *Planner*, readiness without the developer's row, the Subs lecture, *Practice* ×3, the offline
   team link. `test/copy.js`, `test/howto.js`, `test/subs.js`. **A day.**
4. **Too much** (26): the calendar essay, Settings' to-do at the top, the Clubs sheet, one phrasing
   for the outbox, one way to start a plan. `test/settings.js`, `test/screens.js`. **A day.**

## 29. Make it a test

- `test/signout.js` (or `test/join.js`): a club with a code and `teams: {}` draws no `<code>` and no
  word *stored*; an admin gets *Add a team*, a coach gets a sentence naming the admin.
- `test/nav.js`: a staff phone with no `sm.ui.v1` lands on `#/team/{a team she coaches}/season`,
  never the Calendar and never a team she has no role on; Settings' *This team* names a team she has
  a role on when one exists.
- `test/visual.js`: no `.linkbtn` inside `.auth-card-body` (or a contrast check on every link
  against its card).
- `test/copy.js`: render the New team sheet; add *Planner* to the never list; hold the words on Live's
  follow button to the words HOWTO uses for it.
- `test/howto.js`: every button a step names in prose (*Notify me*, *Lock in your plan*, *Plan
  kick-off*) exists on the screen the step opens, by that label.
- `test/doors.js`: the Sessions pill is drawn only where the club has something behind it (once the
  owner decides), and the Sessions Home says what it is the first time.

## Appendix: the three extra walks

Made with a short script beside `shoot.js` (same browser set-up, same seeds), not yet folded into
its `TOURS`; add them there before the next round.

- `jaz-setup` / `jaz-link` (jaz, quiet): `#/team/sbA/season` → *Add a game*; → *Plan* on the next-up
  practice; → *Take attendance*; Calendar → `+`; `#/team/sbA/practice`; More → *What's new*;
  `#/club/scheduler`; `#/club/people`; More → *Drills*; `#/team/sbA/squad` → *Make a team link* →
  *Team settings* → a player; Season → *Who is coming* → *Minutes* → *Stats*.
- `boss-setup` (boss, quiet): `#/club/people` → *Invite someone*; Settings → *Check readiness* →
  *Club details* → *Bulk import* → *Fields and permits* → *Sessions settings*; then Home and More
  inside the Sessions door.
- `empty` (boss, quiet, with the seed's `teams` and `matches` emptied): the landing, Home, Game,
  Calendar, More, Club home → *Add a team*, Settings.
