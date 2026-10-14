# TeamPlayHQ — UX review, round 4 (build 153): the parent's phone

Rounds 1 to 3 (`UX-REVIEW-2.md`; round 1 at commit `e5979f4`) were done by hand. This round
was captured by code, so it can be done again the same way: `tools/screens/` seeds an invented
club from the app's own sandbox builders, opens the real `index.html` in a headless Chromium at
390×844 as one person, with the club's database out of reach (a phone with no signal, drawing
from its own copy) and the clock fixed, and taps through every screen that person can reach,
leaving a screenshot, the whole page, the HTML and an inventory of every tappable thing (label,
class, action, size, colours). 227 screens: a parent of one child on a Wednesday evening and on
game day, the same parent asked to finish her child's details, a parent of two children on two
teams, a grandparent who is a fan, a player with her own sign-in, a phone that has never opened a
club, a phone signed in with no club yet, a phone holding the club with nobody signed in, the
states a parent meets before she is in (invite, team link, registration) and the share pages a
coach texts out, and the coach's and the admin's screens for comparison. Capture ids in
parentheses below (`mum-quiet 02-home`) name a screen in that set; the owner has the gallery.

The question this round: **is it easy for a parent?** The owner's own two, from using it:
*"when I click Game it took me somewhere random"* and *"the team button also confused me a
little"*. Both are real and both are in section 11, first. The owner's wider worry, *"I think
buttons may be confusing"*, is section 12, and it is right: the app has one chip style doing
three different jobs, and the one tap a parent makes every week is its smallest control.

Thirteen reviewers looked at the captures through one lens each (first open, buttons, words,
the way around, visual, game day, the calendar, messages, settings, the code's actions, what
other apps taught parents, two children and a fan, three parents thinking aloud); five
finished and eight were cut short by the account's session limit, and the lead's own pass
covered their ground. Every finding below was checked against the capture it cites and the
code it names. Nothing from UX-REVIEW-2.md that build 153 fixed is repeated.

**What landed well.** The five-tab bar with words under the icons is learnable at a glance, and
Messages carries a count (every capture). Home answers a parent's three questions in order: her
child, the next thing with *Going / Not going / Maybe* on it, the next game, then the calendar
and the games (`mum-quiet 02-home`). The game sheet from the calendar is the best screen in the
app for a parent: When, Where, Ground, Arrive by, Kit, Format, Notes, her answer, a note to the
coach, Directions and Open the game (`26-game-sheet`). The Recap tells the game back in words a
parent can read: *"1–1 · A draw for G12 Flight against Hill End, over 60 minutes"*
(`15-last-game-recap`). Month is clean at phone width, the cancelled practice struck through
and today ringed (`22-calendar-month`). The team-link waiting screen says exactly what happens
next and offers *Cancel the request* (`onboarding 08-join-waiting`). The live share page leads
with the score, the clock and who is on, and names nobody (`onboarding 14-share-game-live`). The
conversation screen is a chat: bubbles, who said it, when, *Sent* (`30-thread`). The role card,
the Got it, the one next-up card and the shared Stats · Live pair from round 3 all hold.

## 11. The owner's two

### 11.1 Game takes you somewhere random

**Built in build 154**: Game opens **Games** (`viewGames()`, `#/games`), the same list for
everyone, and the game itself only when exactly one of hers is being played; a postponed game
says *Postponed* on the list and in the game's own picker, with the next game to be played
after it. Sorted by day rather than a *Next* row per team as below (the owner, 2026-10-14: a row
per team is too many for an admin of twelve): the coming week one line a game, her own teams'
next game however far off, the rest one row into the calendar, and the last week's results the
same way. `test/nav.js` and `test/same.js` walk it.

What Game does today (`navGame()`, `navGames()`, `sheetNavGames()`): for *the team you last
looked at*, the game being played, else the next on the calendar, else the last played; and
when more than one of your teams has a game on or coming, a sheet, *Which game?*. Nothing on the
tab or on the screen it opens says which rule fired. So:

- A coach of one team on a Wednesday lands on **Subs** of a game three days away: a 0:00 clock,
  *Start clock*, *Clock reading wrong?*, an empty pitch and *Tap a player on the bench, then Put
  on* (`jaz-quiet 03-game`). The screen is right for Saturday and wrong for Wednesday.
- An admin lands on a sheet, *Which game? · G12 Flight v Eastfield · In 3 days · 10am / B10
  Storm v Riverside B · In 4 days · 12:30pm* (`boss-quiet 03-game`), over whatever screen she
  was on. Tap outside it and she is back where she started, as if nothing happened.
- A parent lands on **Live** of a game not started: *Not started · 17 Oct*, *Notify me · Turn
  on*, *What's happened · Nothing yet — this fills in from kick-off* (`mum-quiet 16-game-tab`).
  The next day the same tap can land on last Saturday's **Recap** instead, if the fixture list
  has run out.
- A game that is postponed is still "the next game" in the pickers, as *upcoming*
  (`mum-quiet 10-game-picker`: *Hill End · 2026-10-31 · 0 min played · upcoming*).

**Fix: make Game a screen, not a guess.** Game opens **Games**: the game being played at the
top (and when exactly one of her teams is playing, Game opens that game directly, which is what
the red dot on the tab already promises), then *Next* for each of her teams (*G12 Flight v
Eastfield · Sat 17 Oct · 10am · Eastfield Rec*, with *Postponed* where it is), then *Results*
(the rows the Season list already draws). One tap more than today in the quiet week, zero
surprises, and the same list for a parent, a coach and an admin. The game header keeps the team
and the date, so once inside she knows where she is. The coach's Subs, Track and Lineup are
unchanged. `test/nav.js` ("the Game tab: being played with its dot, else next, else last") and
`test/same.js` ("How do I see the score? Game → Stats") change to the list; keep the direct
open for the live case so "tap Game" at the pitch still lands on the game. **A day.**

If the list is not wanted: at least say why she is here. One line under the game header,
*Next game* / *Being played* / *Last game*, and a sheet that names the team on every row
(`gameTitle()` already does). **An hour.**

### 11.2 The team button

**Set aside (the owner, 2026-10-13).** The team button the owner meant was the **Team** tab in
the bottom bar (builds 141 to 152), odd in an app that is the club's, and build 153 already
replaced it with Home for everyone. The title-row changes below are not what was asked for and
are not to be built unless the owner asks again.

The title row has two things that look like buttons and are sometimes buttons:

- **The team name.** For a parent of one child it is plain text (`mum-quiet 02-home`: *G12
  Flight*). For a parent of two it carries a chevron and opens *Switch team · B10 Storm · 9
  players · 2 games · view only / G12 Flight · 14 players · 5 games · view only*
  (`dad-quiet 42-team-menu`): her children's teams described as a coach would describe teams
  that are not hers, with neither child named. For a coach of two it opens the same sheet with
  her team first. Nothing says which team is "hers" or whose child plays where.
- **The club name under it,** with a chevron on every screen (`tbsub`, 115×20px, the smallest
  control in the app) which for a parent in one club opens *Clubs · Lakeside SC · open now ·
  here*, then *Forget removes this device's copy only. Deleting a club for everyone is done
  outside the app, by its owner — see below*, then *Club home · Teams, stats and settings for
  Lakeside SC*, then *To join someone else's club, ask its admin for an invite link*
  (`mum-quiet 41-club-switch`). The owner's housekeeping, behind a chevron she is invited to
  tap from every screen.
- For an admin, Home is **Club home**, a list of team cards (`boss-quiet 02-home`), the team one
  tap down, and the title then says *Lakeside SC ▾ / Club home*: the chevron is the club
  switcher, not the team list, so "the team button" is a card on the page and "the club button"
  is a chevron that opens something else again.

**Fix.** One switcher in the title, and only where a tap does something. The team line is a
button only when there is more than one team to switch to, says what it is (*Switch team*
stays as the sheet's title, and each row says what the team is to her: *Rosa's team*, *Theo's
team*, *You coach this team*, *Another team in the club*), and never *view only* to a family.
The club line is plain text unless she is in more than one club (`knownClubs().length > 1`) or
may start one; the *Forget* and *Deleting a club* sentences go to Settings → Club. The chevron
glyph is kept for "opens a list" and used nowhere else. **Half a day**, with `test/nav.js`'s
title-row checks and `test/same.js`'s "a team's title the team over the club".

## 12. Buttons

The audit (`tools/screens`: every tappable thing on the parent's 181 screens, 4,433 of them,
by class, label, action and size) says this about the controls a parent meets:

| Looks like | Used for | Count on parent screens |
|---|---|---|
| a pill (`chip`, 34px tall, green when pressed) | her **answer** the coach reads (*Going / Not going / Maybe*), the Live screen's **filter** (*Key moments / Everything*), the calendar's **kind filter**, the notification **On / Off** pairs, the team-link form's **either/or** (*She's on the squad / She isn't on it yet*), the calendar-sharing **setting** (*Private / Share when I'm busy*) | 490 |
| an outlined button (`btn quiet sm`, 36px) | **opens a sheet** (*Add to my calendar*), **opens a map** (*Directions*), **downloads a file** (*Apple or Outlook*), **reloads the app** (*Reload*), **copies** (*Copy*), **goes back** (*‹ Messages*) | 288 |
| a filled green button (`btn`, `btn sm`, `btn wide`) | *Open the game*, *Turn on*, *Send*, *Check her details*, *Add a team*, *See the game recap…*, *Done* | 105 |
| a bordered row with a chevron (`prow go`) | opens a game, a conversation, the account | 242 |
| underlined text (`textbtn`, `linkbtn`, 20–28px) | *Got it*, *G12 Flight on the calendar*, *Earlier (9)*, *How private?*, *As a table*, the team link in a sheet | 124 |
| a red outlined button (`btn danger`) | **Sign out** and **Delete my account**, identical | 8 |

Three things follow, and they are the whole of the owner's worry:

1. **The one tap that tells the coach something looks exactly like the taps that don't.** A
   parent cannot tell from the look of a pill whether tapping it writes to the club or changes
   what she is looking at. The answer chips are the same `chip` as five filters and a form.
   (`mum-quiet 02-home`, `06-next-game-live`, `18-calendar-calendars`, `37-settings-full`,
   `onboarding 06-join-form`.)
2. **The weekly action is the smallest control on its card.** *Going · Not going · Maybe* are
   61×34, 85×34 and 65×34 with 6px between them, under two 36px buttons and a 46px *Fans (1)*,
   beside a 63px *Last game* row. A thumb on *Going* is three pixels from *Not going*, and a
   mis-tap tells the coach the wrong thing in the same solid green (`05-home-rsvp-no`: a
   pressed *Not going* is as green as a pressed *Going* under the heading *Is Rosa going?*).
   The other small things: *Got it* 33×26, *Lakeside SC ▾* 115×20, *How private?* 78×20,
   *As a table* 334×20, the month picker's ‹ › 34×27, the avatar 32×32, *Privacy Policy* 83×17.
3. **Labels promise one thing and do another.** *Add to my calendar* opens a sheet
   (`04-nextup-sheet`); *Fans (1)* opens a link-builder with two dropdowns (`03-fans-sheet`);
   the *You* row in Settings opens *Your account* with a name box and *Sign out*
   (`38-settings-you`) while the avatar opens a different account sheet with *Delete my
   account* (`39-account-sheet`); *Share* on a parent's game menu opens *This team's coach has
   not set up parent links yet* (`09-game-share`); the green pill *Turn on* under *Notify me*
   turns on something that works only while the page is open (`06-next-game-live`); the *1 to
   send* badge looks like a button and is a `span` (`40-sync-badge-tap`).

The fixes, in the order they pay:

- **12.1 Give the answer its own control.** A three-way segmented control with the child's
  name on it and an icon per answer (*Rosa · ✓ Going · ✕ Not going · ? Maybe*), styled like
  the Schedule/Day/Week/Month segment (which already means "pick one"), 44px tall, the pressed
  state green for *Going*, grey for *Not going* and orange for *Maybe* so a glance says what
  she said. One component (`rsvpChips()`), drawn in the three places answers are drawn (the
  next-up card, the item sheet, and the calendar row, see 15.1). Plain pills stay for filters.
  **Half a day**; `test/home.js` and `test/rsvp.js` match on `data-act="rsvp"`, which stays.
- **12.2 Say something when she answers, and when she takes it back.** A tap today changes the
  chip and nothing else; a second tap on the same chip silently removes the answer
  (`test/home.js`: "the same answer again takes it back"). Pressed: *Told the coach: not going*
  under the control for a moment; with no signal, *Saved on your phone, sent when there is
  signal* (14.4 has the rest); a second tap asks *Take back your answer?* or simply does
  nothing (the other two chips are the way to change it). **An hour.**
- **12.3 Minimum sizes.** `.chip{min-height:40px;padding:8px 14px}`, `.chips{gap:8px}` (the
  three answers still fit one line at 390px), `.btn.sm{min-height:40px}`, `.textbtn`,
  `.linkbtn`, `.tbsub` and the legal links get a 40px hit area by padding and negative margin so
  nothing moves, `.stepbtn{min-height:40px}`, the avatar 36px. `test/visual.js` pins type
  sizes only, so nothing there changes. **An hour.**
- **12.4 Labels that say what happens.** *Add to my calendar* → a two-choice action sheet
  (*Google Calendar* / *Apple, Outlook or another*) or the label *Calendar…*; *Fans (1)* comes
  off the card (19.1); the Settings *You* row opens the account sheet the avatar opens (18.3);
  *Share* is not drawn for a role that cannot set links up (16.6); *Turn on* becomes *Buzz me*
  with the caveat as one line (16.4); the sync badge becomes a button (14.4). **Half a day in
  all**, each in its own section below.
- **12.5 Two reds, one job each.** *Sign out* and *Delete my account* are stacked, identical,
  8px apart (`39-account-sheet`). Sign out as a quiet button; Delete my account as a text link
  at the foot of Settings → You with a confirmation sheet that names the club it leaves.
  Elsewhere red is the now line, LIVE, the Game tab's dot, a lost game and *Urgent*, in two
  different reds; keep red for what needs her now and cannot be undone (the visual system's own
  rule) and give the now line and the W/D/L crests the calendar's and the pitch's colours.
  **An hour.**
- **12.6 One hierarchy per card.** On the next-up card the filled button is *Open the game*
  and the answer is three outlined pills; on the item sheet three equal outlined buttons
  (*Directions · Google Calendar · Apple or Outlook*) sit under the answer. Decide per card what
  the one primary thing is (her answer, where it is asked; *Open the game* on game day) and let
  the rest be quiet. **With 12.1.**
- **12.7 The labels drawn in a button's box that are not buttons.** In the game header, *FT*
  and the running clock *38:00* sit in the same rounded box as *⋯* and *‹* (`12-last-game`,
  `mum-live 02-game-live`). Draw them as a plain pill with no border. **An hour.**

## 13. The first five minutes

- **13.1 Signed in with no club yet, a parent is told to add a team.** The welcome card says
  *If you were sent an invite link, open it again after signing in*; a parent who signs in
  first (the card tells her to) lands on *Calendar / All teams · Club ▾*, a bar Home · Calendar
  · Game · More, and one card: *No teams here — Add a team, then its players. Everything else
  hangs off that. [Add a team]* (`newbie 01-landing`). The same card sits under the green
  *Waiting for a coach of G12 Flight to let you in* bar after *Not now* on a pending team-link
  request. *Add a team* works: it opens the team sheet, Save writes a team into her phone's own
  state, and from then on `navKind()` treats her as staff of a phantom team. The right words
  exist already, in `lockScreen()`'s signed-in branch (*Nobody has added you to a team yet…
  Ask your coach for the team link, or open the invite you were sent*), but it is reached only
  through `denied`; `awaitingSignIn()` is `!me && …`, so it stops applying the moment she signs
  in. **Blocker.** Fix: when `me && fbConfig().apiKey && !wsCode()` and no invite, team link or
  registration is on screen, draw that lock card with no title row and no tab bar, with *+
  Start a new club* as one quiet link under it for an actual coach, and never *Add a team*
  without a club. Pin in `test/join.js` and `test/signout.js`. **Half a day.**
- **13.2 The sign-in sheet says signing in is optional, under a card that just said she must.**
  *Optional for now — everything works signed out. Signing in means what you log carries a
  verified name instead of one anybody could type* (`anon 02-signin-sheet`; `sheetSignIn()`
  ~18787, unconditional). For a parent in a gated club nothing works signed out, and "what you
  log" is the coach's job. Draw the sentence only when `!gated() && wsCode()` (a lone coach's
  own phone); elsewhere *If your invitation came by email, use that address; otherwise any
  Google account or email works.* The sheet also opens a second pitch-green hero over the
  first (`anon 02-signin-sheet`: *Welcome to the touchline* over *Sign in to see your team*):
  one hero is enough. **An hour.**
- **13.3 After "Send me a sign-in link" she gets a two-second toast and the same card.**
  `'signin-link'` stores the address, closes the sheet and toasts *Check your email* for 2.2
  seconds; she is then looking at *Sign in to see your team · [Sign in]*, pixel for pixel the
  screen she started on. Tapping again sends a second link. While `sm.emailForLink` is set and
  nobody is signed in, the welcome card's body is the sent state: *We sent a sign-in link to
  mo@… Open it on this phone and you're in*, with *Send it again* and *Use another email*.
  **Half a day.**
- **13.4 The emailed link opens in Safari when the app is on the Home Screen.** A Home Screen
  web app has its own storage, so the link opens in Safari, where `sm.emailForLink` is missing
  and the fallback is `prompt('Confirm your email to finish signing in')` (app.js 635): a bare
  browser dialog, then signed in in Safari while the icon on her Home Screen still says *Sign
  in*. Not captured (no iPhone in the rig); the code path is plain. When `standalone()`, lead
  with Google and *Use a password*, and under *Email me a link* say *The link opens in Safari;
  sign in there, then open the app from your Home Screen again*; replace `prompt()` with the
  sheet's own email field. **Half a day.**
- **13.5 The registration form is drawn inside the Calendar's title and the tab bar.**
  *Calendar / All teams · Club* above *Fall 2027 season · Her first name · Last name · Birth
  date…*, and Home · Calendar · Game · More below (`onboarding 10-reg-open`, `11-reg-form`).
  The invite and team-link screens are "shut" (no title, no bar); `render()`'s `shut` has no
  `regx`, and `if (regx) { app.innerHTML = regScreen() … }` runs after the title and bar are
  drawn. Add `(regx && !regx.hidden)` to `shut`. **An hour.**
- **13.6 The team-link form says "squad" and "she" to every parent.** *She's on the squad /
  She isn't on it yet*, *Your child's shirt number · 7 — or 7, 12 for two*, *Their first name —
  optional, helps the coach* (`onboarding 06-join-form`). *Squad* is on the glossary's never
  list (`test/copy.js` does not render this screen, so it slipped). *On the team / Not on it
  yet*, *Your child's shirt number*, and add the invite, join and registration screens to the
  set `test/copy.js` renders. **An hour.**
- **13.7 The invite says "a parent of #7".** *Ada Okafor has invited you as a parent of #7 on
  G12 Flight* (`onboarding 03-invite-ready`). The name stays off the invite by design; the
  number needs a word: *a parent of the player wearing shirt 7 on G12 Flight*, and one line for
  the case it is wrong: *Not your child's number? Ask whoever sent this for a new link.*
  **An hour.**
- **13.8 The role card sits above her child, and with details to finish there are three
  banners.** First open: *You are a parent here: you see your own child by name, say whether
  she is coming, and message the coaches. Got it* above Rosa's card (`mum-quiet 01-home-first`).
  With details to finish: an orange strip *Rosa's details aren't finished. Finish now*, the
  role card, then a card *Check Rosa's details … [Check her details]*, then Rosa
  (`mum-details 01-landing`). Three asks in three voices before the thing she opened the app
  for, and *she* for a boy (`dad-quiet 01-home-first`: Theo, *say whether she is coming*). Drop
  the role card for a family (it stays in the account sheet), fold the strip and the card into
  one card under her child's, and give `roleWords()` the child's pronoun or none (*say whether
  your child is coming*). **An hour.**
- **13.9 "Nobody linked yet" and "the account your coach or club knows".** The welcome card
  names an account she does not have yet; the lock screen's *Nobody has added you to a team
  yet* is the useful sentence. Use it on the welcome card too, with the two ways in named
  (*the invite link* / *the team link*). **An hour.**

## 14. Home and her child's card

- **14.1 "Fans (1)" is the biggest control on her child's card.** A full-width outlined button
  (334×46) under *Last game — Hill End*, above the next practice, for a feature used once a
  season, whose sheet is *Fans of Rosa · 1 fan follows Rosa · A fan · Follows Rosa · Remove ·
  How many people can use it [One person] · Works for [14 days] · [Make a fan link]* and a
  six-line paragraph explaining what a fan is, after the controls (`mum-quiet 02-home`,
  `03-fans-sheet`; a grandparent's card says *you're her fan* and *Stop following Rosa* as its
  biggest button, `nan-quiet 02-home`). Take it off the card: one row in the child's own sheet
  (tap her name), *Family and friends who follow Rosa · 1*, and the link as one button there,
  *Invite a grandparent or friend*, with the paragraph first and the two choices as defaults.
  **Half a day.**
- **14.2 The card leads with bookkeeping.** *Played in 3 games · 1 goal · 60 at Midfield* then
  *Games 3 of 3* (the attendance line, reading as a second count), and *180 min* top right
  (`02-home`). Say it once, in a parent's words: *3 games · 180 minutes · 1 goal · came to all
  3*, and drop *60 at Midfield* unless she asks (the ⓘ). **An hour.**
- **14.3 Home never says tonight's practice is cancelled.** `calNext()` skips anything called
  off (*"something called off is never next"*), so a Wednesday practice cancelled that morning
  vanishes from Home and the next-up card shows next week's; the only place it is said is the
  calendar row, struck through. A parent who looks at Home drives to the field. Draw a called-
  off entry that is today or tomorrow as its own line above the next-up card, *Tonight's
  practice is cancelled*, struck through, with the next thing under it. **An hour.**
- **14.4 Her answer is kept on the phone, and the only sign is a badge that does nothing.**
  With no signal, tapping *Not going* fills the chip and the top-right badge changes from
  *Offline* to *1 to send*; no toast; the badge is a `span` with no handler
  (`05-home-rsvp-no`, `40-sync-badge-tap`); the explanation is on Settings, as *Waiting to reach
  the club · 1 change made on this phone hasn't reached the club yet… [See what's waiting]*,
  and the same page says *Database · Connected* (`37-settings-full`). Make the badge a button
  that opens `sheetPending()`, say once under the control *Saved on your phone, sent when there
  is signal*, and make the Database row say what the badge says. **Half a day.**
- **14.5 On game day Home says the game twice.** *Playing now — Hill End · 38 min so far · 1–1
  ›* inside Rosa's card (opens Stats) and, 60px under it, *LIVE · v Hill End · 38 min played ·
  tap to open the game · 1–1 ›* (opens Live) (`mum-live 01-home-live`). One card: keep the LIVE
  card (it is everyone's) and give the child's card one line of her own, *Rosa: on the pitch ·
  38 min*, not a second door. **An hour.**
- **14.6 A score on a row is a big first digit and a small second.** `.pmins` is the style for
  a number and its unit (*180* min), and the score borrows it: our goals 21px bold, theirs 14px
  grey, so *1 –2* reads as a value with a footnote and the half she most wants (did they lose?)
  is the quietest thing on the row (`02-home-full`, the Games list; `mum-live 01-home-live`;
  `mum-live 06-calendar-live-month` clips it to *1›*). A `.score` span: both digits one size,
  tabular, ink, the dash soft, us–them in the header's order; used in `kidSeasonCard()`,
  `scoreCell()`, the Games list, the live card and the game picker. **An hour.**
- **14.7 "Practice  Practice".** The next-up card's title and its kind tag are the same word
  with a blue edge as well (`02-home`). For a practice, the tag is enough; the title line can be
  the team or the place. **An hour.**

## 15. The calendar and answering

**Built in build 155**, all eleven. The answer is on the row for each of her own children or
herself (`rowAnswer()`, under the entry since the entry is itself a button; staff keep their
count line, and a coach whose daughter is on her team gets both), and leads a family's sheet,
above the facts, with the note box always under it (a note typed first goes with the answer;
Save with no answer says so and writes nothing). The chips are still `rsvpChips()`, so 12.1's
control lands on the row with no further change. An entry carries `ask` (the coach's *Ask
families whether they are coming*: on by default for a practice, off for anything else; a game
always asks), and one that does not ask has no answer on its row or sheet. With several teams
showing, team colours share nothing with the kinds' (`TEAM_HUES`), a key sits under the views
(`calKey()`, a family's teams named with her children, nothing past eight), the *Whose* chips
carry the colours and the *Show* chips do not. *Add to my calendar* opens *Add to your
calendar* (`sheetCalAdd()`): Google Calendar, then *Apple, Outlook or another*, the same pair
under the same label in the entry's and the session's sheets, and *Keep my calendar up to date*
above them for whoever has no My calendar address (turning it on there shows the subscribe
buttons in place). *Calendars* is drawn only with more than one team, a *Whose* choice,
sessions or bookable times, or something left out. Day and Week come round to the first thing
still to come (`calScroll()`, once per day or week looked at), and an empty day says *Nothing
on today.* with *Next: Practice tomorrow 6pm* a tap away. The team's name in a sheet is plain for
a family. Past rows are ink on a wash of their colour (12:1 at worst; `test/visual.js` works it
out for every colour). *Who sees your calendar* is drawn for coaches and admins, here or in
another club, and for whoever is already sharing. Found on the way: the add/edit sheet's
*Practice* and *Something else* used the Calendars panel's own action, so tapping one hid that
kind from the calendar and left the form as it was; the form's is `calfkind` now.

- **15.1 The row says "Rosa: not answered" and does not let her answer.** Every practice block
  for ten weeks: *Practice · 6–7:15pm · Lakeside Park, field 2 · Rosa: not answered*
  (`17-calendar`); the chips are in the sheet, under When, Where, Notes and *Repeats · Weekly ·
  9 more after this* (`23-practice-sheet`). The line looks like a status, not a prompt, and
  every app she knows answers on the row. Draw 12.1's control on the row for items that take an
  answer (staff keep their *n of m* line), and in the sheet put the answer above the facts,
  with *Repeats* last. **A day.**
- **15.2 Colour means the kind on one phone and the team on another.** Mo's calendar: blue
  practice, green game, orange event, and the Calendars panel's *Show* chips carry those dots
  as a key (`mum-quiet 17`, `18`). Luis's: *B10 Storm Practice* green, *G12 Flight Practice*
  blue, *G12 Flight v Eastfield* blue, *B10 Storm v Riverside B* green (`dad-quiet 17`), the
  same *Show* key still drawn and now wrong, nothing naming which team is which colour, and
  Month cells with no team in them. `evHue()` switches palettes when more than one team shows,
  and `TEAM_HUES[0..1]` are exactly `KIND_HUE.game` and `KIND_HUE.practice`. When several teams
  show: dots on the team rows and the *Whose* chips (Rosa gets G12 Flight's), the kind dots off
  the *Show* chips, a one-line key under the views row (`.calkey` exists in `styles.css` and is
  never drawn), and team colours that never coincide with kind colours. **Half a day.**
- **15.3 "Add to my calendar" does not add anything.** It opens the item sheet, where *Google
  Calendar* and *Apple or Outlook* are two of three equal outlined buttons under the answer
  (`04-nextup-sheet`, `23-practice-sheet`); the thing that would keep her phone's calendar up to
  date, the subscription, is a card at the foot of the Calendar called *In your own calendar*
  (`22-calendar-month`). Four labels on three screens for one job. A two-choice action sheet
  from the card (*Google Calendar* / *Apple, Outlook or another*), the same pair grouped under a
  small *Add to your calendar* label in the sheet, and the subscription offered once at the top
  of that sheet as *Keep my calendar up to date* for whoever has not. **Half a day.**
- **15.4 Three dropdown-looking controls for a parent with one child.** *My calendar · Lakeside
  SC ▾* in the title, *Calendars ▾* (a tree with one team and the kinds), *October 2026 ▾* (the
  mini month), then Schedule/Day/Week/Month (`17-calendar`, `18`, `19`). Hide *Calendars* when
  she has one team and no sessions or times to filter; keep the month picker. **An hour.**
- **15.5 Day and Week open on an empty grid.** Day: *Nothing on.* above a 7am–9pm grid with
  nothing in it (`20-calendar-day`); Week the same, the week's two entries below the fold. For
  a family with a practice a week and a game on Saturday, Schedule and Month are the views;
  Day and Week earn their place for a coach planning a field. Keep them, but open Day on the
  first entry (scroll to it) and say *Nothing on today · Next: Practice tomorrow 6pm* in the
  empty case. **Half a day.**
- **15.6 Every event asks "Is Rosa going?".** The team photo asks it as a practice does
  (`17-calendar`: *Team photo · Rosa: not answered*). An entry's sheet for the coach gets *Ask
  families whether they are coming* (default on for practices and games, off for anything
  else), and a row with it off carries no answer line. **Half a day.**
- **15.7 The first tappable thing in an entry's sheet is a green link away from it.** *G12
  Flight · Practice* at the top of the sheet is a link that closes the sheet and goes to Home
  (`23-practice-sheet`). Plain text for a family; the link stays for staff who switch teams from
  it. **An hour.**
- **15.8 "Nothing else on today."** Today with nothing on says *else* (`17-calendar`). *Nothing
  on today.* **An hour.**
- **15.9 Past entries fade the words with the fill.** *Earlier* rows draw white text on a
  lightened block, 2.5–2.7:1, under AA (`28-calendar-earlier`). Fade the block, not the text,
  or draw past rows on white with grey text. **An hour.**
- **15.10 "The coach sees your answer and any note" before there is a box.** The note box
  (*Anything the coach should know? [Save]*) appears only once she has answered
  (`23-practice-sheet` vs `26-game-sheet`). Draw it always, under the answer. **An hour.**
- **15.11 "Who sees your calendar — Private / Share when I'm busy" on a parent's Calendar.**
  The coaches' cross-club busy-time setting (`youshare`) is drawn at the foot of every family's
  Calendar, 76 times across the parent captures, and does nothing for her. Draw it for coaches
  and admins only. **An hour.**

## 16. Game day

- **16.1 Her child's part in the game is on no game screen.** Live: *Live · 2nd half · 38:00 ·
  G12 Flight 1–1 Hill End*, *Notify me*, *What's happened* (`mum-live 02-game-live`). Nothing
  says whether Rosa is on the pitch. Home's *Playing now* row lands on Stats, where she is the
  fifth row of the Minutes card, the sixth card down, with no on/off mark (`04-game-live-stats`).
  The public game link a stranger opens has *On the pitch · 5 38m · 7 38m…*
  (`onboarding 14-share-game-live`): the signed-in parent sees less about her own child than
  the group chat does. One line under the Live score card for her own child, the way
  `nextAnswer()` adds a family's chips under the shared next-up card: *Rosa · on the pitch · 38
  min · 1 goal* (or *on the bench since 23′*), from `onField()`, `playedSec()` and `goalList()`,
  drawn only for her children so staff see nothing extra; the child card's row opens Live
  while the game is on; Stats' Minutes rows get the on-pitch mark Subs already has. **Half a
  day.**
- **16.2 Before kick-off, Game and "Open the game" land on two empty screens.** Live: *Not
  started · 17 Oct*, *Notify me · Turn on*, *Nothing yet — this fills in from kick-off*; Stats:
  *G12 Flight 0 — 0 Eastfield · Not started · 0:00 played* then fourteen rows of *#2 · no plan
  set · 0 min* (`mum-quiet 06`, `07`, `16`). Where to be, when to arrive, the kit and the
  parking note are on the calendar sheet (`26`) and the next-game card, and nowhere on the
  screen named for the game; round 2 took the 0–0 off the header and the cards, and
  `viewStats()`'s headline still calls `score()`. Before kick-off, Live opens with the match-day
  card for everyone (the calendar sheet's rows: When · Where · Home/Away · Arrive by · Kit ·
  Notes, with Directions and her answer), then *Notify me* and the feed; Stats says *Stats
  appear once the game kicks off* and the Minutes list waits for the first spell. **Half a
  day.**
- **16.3 A parent's Stats measures every teammate against the coach's plan.** *#2 · 47 min
  planned · 8 min · 39 short*, *#5 · 60 min · 13 over*, fourteen rows (`13-last-game-stats`);
  the Recap's *How it built up* the same. *Planned* and *short* are the coach's bookkeeping
  (UX-REVIEW-2.md 7.2 took the orange off Subs for the same reason); to a parent *39 short*
  reads as a verdict on someone's child. For readers (`readerRole()`), the Minutes card shows
  minutes alone, her own child first and named, the rest by number, no plan and no short/over.
  **An hour.**
- **16.4 "Notify me · Turn on" explains the mechanism, not the promise.** *Get goals,
  kick-off, half time and full time on this device while this page is open, even in another
  tab* (`06`, `mum-live 02`). *Buzz me for goals and the final whistle · Turn on*, and one line:
  *Works while TeamPlayHQ is open on this phone. For a closed phone, turn on notifications in
  Settings.* **An hour.**
- **16.5 Every goal on a parent's Stats carries "edit".** *25:20 Hill End · edit*, *12:40 G12
  Flight — Rosa Delgado (assist #2) · edit* (`13-last-game-stats`, `mum-live 04`). The tap opens
  a working-looking editor (*Goal at 12:40 · Time · Scorer · Assist · [Save] · [Delete this
  goal]* in red) and Save or Delete is refused with *Only this team's coaches can change that*:
  `fixgoal` is in neither `COACH_ACTS` nor `LOG_ACTS`, so `mayAct()` lets anyone open the
  sheet. Draw the rows plain for anyone `mayAct('savegoal', m)` refuses, and add `fixgoal` and
  `fixshot` to `LOG_ACTS` so the handler refuses them too (the retire-club rule in CLAUDE.md:
  check in the handler, not only in the render). **An hour.**
- **16.6 "Share" on a parent's game menu is a dead end.** ⋯ → *Share* → *Share G12 Flight ·
  This team's coach has not set up parent links yet* (`08-game-menu`, `09-game-share`). She
  cannot set them up. Draw the row only when there is a link to share, and never the sheet's
  coach-facing sentence to a family. **An hour.**
- **16.7 A postponed game is "upcoming".** *Hill End · 2026-10-31 · 0 min played · upcoming*
  in *Which game?* (`10-game-picker`), raw dates and minutes played for a game not played, and
  once opened nothing on the game says it is off. *Sat 31 Oct · Postponed*, *Sat 17 Oct · 10am ·
  Away*, the score with *FT* for games played (`shortDate()`), and a *Postponed* line in the
  game header. **An hour.**
- **16.8 "How long is left?" is answered everywhere but on a parent's Live.** The coach's Subs
  says *0:00 of 30:00*; the public page says *8:00 of 30:00*; Live says *38:00* alone
  (`mum-live 02`). Add *2nd half · 8:00 of 30:00* to the Live head. **An hour.**
- **16.9 A finished game opens on three screens.** From the child card's *Last game* row: Stats;
  from the Games list: Stats; from the Game tab once the fixtures run out: Recap; and Stats
  carries a full-width green *See the game recap — when, how often, what went well* beside a
  Recap tab (`12-last-game`). One landing (Recap, the story) and no in-page button repeating a
  segment. **An hour.**
- **16.10 Three words for full time.** *FT* in the header, *Final* on Stats, *Full time* on Live
  and the Log. The glossary picks one (*Full time*; *FT* only where the header has no room).
  **An hour.**

## 17. Messages and being told things

- **17.1 Two inboxes and a gear.** Messages has a badge *2* (two unread notices); More → *What's
  new · Changes to your games and practices* opens *Nothing new*, with a *⚙ Notifications*
  button that goes to Settings (`29-messages`, `32-more`, `33-whats-new`). People writing to her,
  the app telling her, and whether her phone buzzes are three places with three names, and she
  opens the second for the first. Put schedule changes into Messages as a pinned *Changes* card
  (one row per change, counted in the Messages badge), retire *What's new* from a family's More,
  keep the gear in Settings. **A day.**
- **17.2 No button to write to the coaches, no sign that a notice is one-way.** *Conversations ·
  Coaches of G12 Flight · No problem at all, hope she feels better soon! · Oct 8 6:10 PM ›*,
  then *Team notices* with two notices and no reply control (`29-messages`). The row is the only
  door, and staff have *New message*. A *Message the coaches* button at the top for a family,
  and under Team notices one quiet line, *Notices are one-way. To reply, message the coaches.*
  **An hour.**
- **17.3 Two back buttons on the conversation.** The title row's arrow and a white *‹ Messages*
  button 70px under it (`30-thread`). One. **An hour.**
- **17.4 Settings → Notifications tells her to fix the browser.** *Notifications on this phone ·
  Notifications are blocked for TeamPlayHQ in this browser's settings. Allow them there, then
  come back here* (`37-settings-full`). Say where, per platform (*iPhone: add TeamPlayHQ to your
  Home Screen, then Settings → Notifications → TeamPlayHQ*; *Android: tap the lock icon in the
  address bar → Permissions*), and what she gets. **An hour.**
- **17.5 The tab bar changes shape on every cold open.** Four tabs on the first paint, five once
  the SDK has loaded and `msgsOn()` is true (`navTabs()` needs `fb`). Draw Messages from the
  cached conversations (`msgsKey`) before the club answers. **An hour.**

## 18. Settings and the edges

- **18.1 A parent's Settings carries a developer's Advanced section.** *Version v153 ·
  2026-10-12 · page and code agree · [Reload]*, *Database · Connected · Lakeside SC* (the badge
  says Offline), *Account id · mum · for support, if you are ever asked for it · [Copy]*
  (`37-settings-full`). One quiet row for a family, *About this app · v153*, opening a sheet with
  the version, the account id and Reload; the Database row says what the badge says or goes.
  **Half a day.**
- **18.2 "You" opens one account sheet, the avatar another.** Settings → *You · Mo Delgado ·
  mo@… · Parent · G12 Flight ›* opens *Your account · Anything you log is stamped with this
  account rather than a typed name · Your name, as the club sees it [Save] · [Sign out]*
  (`38-settings-you`); the avatar opens *Mo Delgado · Parent · You are a parent here… · Settings
  · [Sign out] · [Delete my account] · Your team, the calendar, the game and the club are on the
  bar at the bottom* (`39-account-sheet`). One sheet, from both doors: name and email, the name
  box, the role line, Sign out; Settings and Delete my account live on the Settings page.
  **Half a day.**
- **18.3 Club home tells a parent her child's team is "view only".** More → *Lakeside SC · Club
  home: its teams, and everything else in it* → *1 team*, a *Calendar · Next: Practice ·
  Tomorrow 6pm* card, *Sessions*, *G12 Flight · Next: v Eastfield · 17 Oct · 14 players · 5
  games · view only* (`32-more`, `34-club-home`). *Rosa's team* instead of *view only* for a
  family, the Calendar card dropped (the tab is one tap away), and the More row's line *The
  club: its teams and sessions*. **An hour.**
- **18.4 "1 to send", "Waiting to reach the club" and "Database · Connected" on one screen.**
  Three sayings of one state (`37-settings-full`), one of them false. With 14.4: one word for
  the outbox everywhere (*Waiting to send · 1*), and the Database row reads `online`.
  **An hour.**
- **18.5 "TeamPlayHQ v153" in the brand on every screen.** A build number beside the name is
  for the developer. Keep it in Settings → About; in the brand draw only an *Update* pill when
  `stale()`. **An hour.**
- **18.6 The share page a coach texts out opens with a "Signed out" card above the score.**
  *Signed out · Numbers only. Sign in if a coach has given your account access. [Sign in]*
  (`onboarding 12-share-season`, `14-share-game-live`). Most who open the link never sign in.
  Under the score, reworded: *Players are shown by shirt number. A parent signed in to
  TeamPlayHQ sees her own child's name.* **An hour.**
- **18.7 No dark mode.** A white page and a bright green header at 10pm. Not for this round; a
  note for the visual system when it next moves. **More.**

## 19. Two children, a fan, a player

- **19.1 A parent of two sees one child on Home and the other behind a switcher whose rows name
  neither.** Home opens on B10 Storm (whichever team was last on screen), Theo's card on top;
  Rosa is behind *B10 Storm ▾* → *Switch team · B10 Storm · 9 players · 2 games · view only / G12
  Flight · 14 players · 5 games · view only* (`dad-quiet 01-home-first`, `42-team-menu`). With
  11.2: rows that say *Theo's team* and *Rosa's team*; and on Home, when she has children on
  two teams, both children's cards on one Home with the next-up block for each, so there is no
  switch to find. **Half a day** on top of 11.2.
- **19.2 A fan's card leads with "Stop following Rosa".** Pat's Home: Rosa's card with *you're
  her fan* and a full-width *Stop following Rosa* button, the next-up card with Directions and
  Add to my calendar and no answer, the next game (`nan-quiet 02-home`). *Stop following* as a
  text link at the foot of the card, and one line of what a fan gets (*You see Rosa's games and
  the team's notices*) where the role card was. **An hour.**
- **19.3 A player's own sign-in.** Ella's Home is a parent's with *Your fans* and *Is Ella
  going?* for herself (`kid-quiet 02-home`); the role card says *You are signed in as a player*.
  Nothing wrong; 14.1 and 12.1 apply to her too.

## 20. Words

The glossary holds the screens' words and `test/copy.js` the signed-in screens; what slipped
is on the screens it does not render and in the sentences that explain the system:

- *squad* on the team-link form (13.6).
- *Optional for now — everything works signed out* (13.2).
- *Get goals, kick-off, half time and full time on this device while this page is open, even in
  another tab* (16.4).
- *Messages pop up while TeamPlayHQ is open on a phone, and wait here with a count until then*
  (`29-messages`): *Messages wait here until you open the app.*
- *Forget removes this device's copy only. Deleting a club for everyone is done outside the
  app, by its owner — see below* on a parent's club sheet (11.2).
- *page and code agree*, *Account id · for support, if you are ever asked for it*, *Database ·
  Connected* (18.1).
- *no plan set*, *47 min planned*, *39 short* on a parent's Stats (16.3).
- *2026-10-31 · 0 min played · upcoming* (16.7).
- *Nothing else on today* (15.8); *Practice Practice* (14.7); *Games 3 of 3* (14.2).
- *FT / Final / Full time* (16.10).
- *she* for every child in `roleWords()` and the join form (13.6, 13.8).
- *view only* to a family (11.2, 18.3); *Fans* (14.1).
- Dates: *Oct 8 6:10 PM* (Messages), *Yesterday 9:10 PM* (a notice), *In 3 days · 10am* (a
  card), *Thu 15 Oct · 6pm–7:15pm* (a sheet), *2026-10-31* (the picker). One `whenShort()` for
  everything a parent reads: *Thu 15 Oct · 6pm*, *Yesterday · 9:10pm*, *8 Oct · 6:10pm*.

Each is an hour with its glossary row; together **a day**.

## 21. Order of work for round 4

Cheapest high-impact first; one line is about one day's work, with the suites that change.

1. The blocker and the frame: a signed-in phone with no club gets the lock card, never *Add a
   team* (13.1); the registration link is shut like an invite (13.5); the sign-in sheet's
   *Optional* line and double hero (13.2); the sent-link state (13.3). `test/join.js`,
   `test/signout.js`, `test/signin.js`, `test/register.js`. **A day.**
2. Buttons: the answer control and its feedback (12.1, 12.2), minimum sizes (12.3), the two
   reds (12.5), the header's label pills (12.7). `test/home.js`, `test/rsvp.js`,
   `test/visual.js` (new floors). **A day.**
3. Game: the Games screen behind the tab with the live game opening directly (11.1), the
   match-day card before kick-off on Live and the quiet Stats (16.2), a postponed game said so
   (16.7), her child's line on Live and the on-pitch mark (16.1), the goal rows plain for readers
   and `fixgoal` in `LOG_ACTS` (16.5), the coach's plan off a parent's Minutes (16.3), one
   landing for a finished game (16.9), time left on Live (16.8), *Share* only when there is one
   (16.6), *Notify me* reworded (16.4). `test/nav.js`, `test/same.js`, `test/feed.js`,
   `test/stats.js`, `test/parents.js`, `test/recap.js`. **Two days.**
4. The title row: one switcher, named rows, no chevron where a tap does nothing, the club's
   housekeeping out of the sheet (11.2); both children on one Home (19.1); Club home's *view
   only* and Calendar card (18.3). `test/nav.js`, `test/home.js`, `test/same.js`. **A day.**
5. Home's card: Fans off the card into the child's sheet (14.1), the bookkeeping line (14.2),
   tonight's cancellation said (14.3), the outbox said where she answered and the badge a
   button (14.4, 18.4), one live card (14.5), one score style (14.6), the tag (14.7), the role
   card and the details card folded (13.8), a fan's card (19.2). `test/home.js`,
   `test/fans.js`, `test/safekeep.js`, `test/sync.js`. **A day.**
6. **Built in build 155.** The calendar: the answer on the row and above the facts in the sheet (15.1), the colour
   key when several teams show (15.2), *Add to my calendar* as an action sheet and the
   subscription offered once (15.3), *Calendars* hidden for one team (15.4), Day opening on the
   first entry (15.5), events that do not ask (15.6), the sheet's link plain for a family
   (15.7), past rows legible (15.9), the note box always (15.10), the busy-time setting staff-
   only (15.11), *Nothing on today* (15.8). `test/calendar.js`, `test/rsvp.js`, `test/mycal.js`,
   `test/screens.js`. **Two days.**
7. Messages and settings: changes into Messages and *What's new* retired for families (17.1),
   *Message the coaches* and the one-way line (17.2), one back button (17.3), the browser
   advice per platform (17.4), Messages drawn from the cache on the first paint (17.5), About
   instead of Advanced (18.1), one account sheet (18.2), the version out of the brand (18.5),
   the share page's card under the score (18.6). `test/messages.js`, `test/settings.js`,
   `test/nav.js`, `test/version.js`, `test/mirror.js`. **Two days.**
8. Words (20), with the three unrendered screens added to `test/copy.js`. **A day.**

Eleven days; the first three buy most of it.

## 22. Make it a test

`test/same.js` holds the paths and `test/copy.js` the words; this round adds the frame's
*affordances*:

- **`test/buttons.js`.** Renders every parent screen through the harness (the captured
  handler, as `test/same.js` walks it) and holds: every `data-act="rsvp"` control is the answer
  component and nothing else uses its class; no `chip` writes to the club (its `data-act` is
  in a filter set); every `.btn.danger` on one screen is alone; every element with a chevron
  glyph or a `.go` class opens something for this role (a `MISS` in the rig is a failure here);
  every button's label is a verb or a thing it opens, from a list in the glossary; and the
  sizes: no control a parent taps under 40px, with the floors in `styles.css` named.
- **`test/same.js`**, three more questions: *"Is practice on tonight?"* (Home → the first card
  says cancelled when it is), *"Is she on right now?"* (Game → Live → her line), *"Where do I
  go Saturday?"* (Game → the match-day card before kick-off).
- **`test/copy.js`** renders the invite, team-link and registration screens too, so *squad*
  and *she* cannot come back.
- **`test/signout.js`** pins that a signed-in account with no club draws no *Add a team* and
  no tab bar.
- **`tools/screens`** is how the next round is captured; its `INDEX.md` is the evidence.
