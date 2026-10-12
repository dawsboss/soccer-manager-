# TeamPlayHQ — UX review, round 2 (build 147)

The first review (`UX-REVIEW.md`, build 139) was done in full by build 147 and was
removed; comments in the code and tests that cite it by section (`UX-REVIEW.md, 1.2`)
refer to its last version, at commit `e5979f4`. This is what is still confusing on
build 147; its sections carry on the numbering.

Same method as round 1 (local copy, seeded club, every screen at 390×844 as admin,
coach, parent and tracker, then tapped through: the tab bar, More, the title row,
the calendar views and sheets). All 73 suites green on the merged code.

**What landed well.** The tab bar and title-with-back make the app learnable;
Season is a third of its old height; the game header, pinned clock and List /
Pitch toggle are right; Stats / Minutes / Attendance as their own screens read
cleanly; the parent's Home has the Going / Not going / Maybe chips exactly where
she needs them; "Not synced", "Players", "short" instead of "owed", the ⓘ on the
rating dots and the "Got it" banner are all better. The rest of this is what is
still confusing, the owner's three first.

## 6. The tab bar, specifically

### 6.1 Game: which team, which date, which game?
`navGame()` picks the game for *the team on screen*: live, else the next on the
calendar, else the last played. Nothing on the tab or in the game header says which
team that is. The header reads `Hill End 1–1 · 38:11`: opponent, score, clock. An
admin or a coach of two teams tapping Game gets whichever team she last looked at,
silently, and the red dot on the tab does not say which team is live.

Fix, in order of cost:
- **Say the team and the date in the header.** `Test Squad A v Hill End` on the
  first line, `Sat 12 Oct · 10am` (or `38:11`, or `FT`) on the second. For a game
  not played yet, no score at all: `Eastfield 0–0 · 17 Oct · 10am` today reads as a
  result. Show `v Eastfield · Sat 17 Oct · 10am`.
- **Which side is ours.** `Hill End 1–1` reads as Hill End's score first. Put our
  team or "v" before the opponent, and keep the order *us–them* everywhere.
- **When more than one team has a game, Game is a picker.** If two or more of her
  teams have a live or upcoming game, the tab opens a short sheet ("Today ·
  Test Squad A v Hill End · live", "Sat · Test Squad B v Lakeside"), with the
  live one first. One team, one game: open it straight away, as now.
- The red dot on Game should only mean *live*, and the picker sheet (or the
  header) should name the team it belongs to.

### 6.2 Notifications are in three places, and the word means two things
*Done in build 148: the switches are in Settings → Notifications alone, the page is
What's new (at `#/whats-new`, the old address landing there) with a gear to them,
and Messages carries none of it.*

- "What notifies you" (the on/off switches) is drawn on **Settings**, on the
  **Notifications** page, and as the push card on **Messages** (`muteCard()` and
  `pushCard()` at three call sites). Keep the switches in Settings → Notifications
  only. The Notifications page gets a single gear link to it; Messages gets
  nothing.
- The page called **Notifications** is a feed of what changed (games moved, club
  activity). The settings called notifications are about pop-ups and push. Rename
  the page **What's new** (or **Activity**) and keep "Notifications" for the
  settings. Then "Messages" is people writing to you, "What's new" is the app
  telling you, "Notifications" is whether your phone buzzes.
- The More sheet's first row is Notifications with a count; the parent's More
  also has Club home, Sessions, Settings, Sign out. Fine, but with the rename it
  reads better: What's new · Sandbox FC · Sessions · Settings.

### 6.3 Team opens "the last team you looked at"
The Team tab shows whichever team `ui.teamId` was left on. For a coach of one team
that is right. For an admin, or a coach of two teams, it feels random: the only
clue is a small chevron after the team name in the title, and nothing says "you
have three teams".

Fix: when she can reach more than one team, the Team tab's first tap opens
**My teams** (one row per team: name, next game or live score, a chevron); a team
opens from there, and the back arrow goes back to the list. The title's chevron
stays as the shortcut. The same list is Club home today, so this is mostly
pointing the tab at it when `myTeams().length > 1`, and at Season when it is one.
Club home then stops needing its own back arrow (it currently goes "up" to a
team, which is the wrong direction).

## 7. Things I noticed this round

### 7.1 Bugs
*Done in build 149.* The You row is the email, role and team alone (the sentence
stays on the Got it card and in the account sheet); no score is drawn before
kick-off (game header, its ⋯ menu, Which game, the Live card), a 0–0 once it has;
and the call-off button was never a family's: the run that showed it was the app
owner, a family on the team in a club with no admin, whom `canAdmin()` lets in on
purpose. `test/away.js` now pins it for a family and a tracker, with an admin and
without.

- **Settings → You row runs two strings together:** "pat@x.test · Parent · Test
  Squad AYou are a parent here: you see your own child by name…". The role hint
  is appended with no separator, and it should not be in that row at all now that
  the "Got it" card exists. (`viewSetup()`, the account row.)
- **A game not played yet shows 0–0** in the game header and on the parent's
  "Not started · 17 Oct · Test Squad A 0–0 Eastfield" card. Blank until kick-off.
- **"Call the coach off"** on the practice sheet is the first button a parent sees
  on a practice. In a real club it is staff-only, but check: in my ungated run it
  was drawn for the parent.

### 7.2 Still too much on one screen
- **Calendar item sheet, for staff:** "Who is coming — 0 going · 14 to answer"
  draws three chips per child (42 buttons) for the coach to answer *for* each
  family, though the text says families answer from the calendar. For the coach,
  show the three counts, then a list of names with each one's answer, and tap a
  name to override. Keep the chips for the family's own child only.
- **Calendar top:** live card, My calendar / All teams, Calendars ▾ + month ▾,
  the segmented control + plus, the Next-practice card, "Earlier (8)", then the
  list. Six things before the first entry. The Next-practice card duplicates the
  first rows of the list below it; drop it from the calendar (it belongs on Home
  and Season, where it now is).
- **Subs:** "9 short" in orange on all eleven rows still reads as eleven warnings.
  Show the number plain, and colour only the players who are furthest behind
  (say, the bottom three), which is what the coach is scanning for.
- **Lineup tab during a live game** leads with "Pick a shape" and the ⓘ paragraph.
  Mid-game, the lineup is the pitch; the shape picker belongs behind a button.
- **Minutes:** the bar for a player over target is red (Dara, 158 of 141). Over
  is not bad; grey or green, and keep red for "short".

### 7.3 Small copy and layout
- Club home (staff): "2 teams you can reach" → "2 teams". Calendar card: "Every
  team · This week: 2 games, 2 practices" is good.
- The Session page's five chips (Sessions, Bookable times, Fields, Fees, Hours)
  plus Mine / Everyone's plus New session is still three rows of controls for a
  screen that is usually empty. Fields, Fees and Hours belong under Settings →
  Club; this screen is Sessions and Bookable times.
- The parent's Settings shows **My drills** if `canTrain()` is open; in a real
  club it is hidden, but worth a test that pins it for a family.
- The "Got it" role card is drawn on every screen until dismissed, including the
  game screens. Home only is enough; a parent who taps Calendar first has already
  found her way.
- Day, Week and Month views are good (checked after a false alarm in my harness).
  Three truncations: the Day title "Mon 12 Oct · To…" (drop "Today", the dot under
  the date already says it), Week blocks "Test …" (show the opponent, not the team,
  when one team is ticked), Month cells "v Lakesi" / "v Northga" (an abbreviation
  or the crest-colour dot alone on narrow cells).
- The live-game card stays above the calendar in every view. Right on Schedule;
  on Month it is a third of the screen. Collapse it to one line there.
- The test-club banner is right for a test club; nothing to change.
- Title row: "Calendar / All teams · Sandbox FC ▾" for an admin, "Calendar / Pat
  Parent" for a parent. The second line for the parent (her own name) says
  nothing; "Your calendar" or the club name would.
- Game header "…" menu: good place for Edit, Share and the games either side. Make
  sure "Which game" (tap on the title) and "…" do not both open pickers; one
  should.

## 8. Order of work for round 2

1. Game header: team name, no score before kick-off, us–them order (6.1, first
   two bullets). Half a day.
2. ~~Settings "You" row bug; blank score before kick-off on cards (7.1). An hour.~~ Done, build 149.
3. Notification switches in one place; rename the page What's new (6.2). A day.
4. Team tab → My teams when there is more than one (6.3). A day.
5. Game tab picker when more than one team has a game (6.1, third bullet). A day.
6. Coach's Who-is-coming as a list with override, not chips (7.2). Half a day.
7. Drop the Next-practice card from the calendar; Sessions page's config chips
   to Settings (7.2, 7.3). Half a day.

---

# Round 3 — the same app for everyone (build 149)

The test this round: a parent asks the coach "how do I…?" and the coach answers
from her own phone. Does the answer work on the parent's? Every screen was
captured on build 149 as a parent, a coach, an admin and a tracker, with the club
gated as a real one is (so the parent's phone is the real parent's phone), and the
titles, tabs, bar, headings and buttons compared screen by screen.

The rule to aim for: **one frame, three depths.** Everyone gets the same tabs, the
same screen names, the same cards in the same order with the same buttons; a role
*adds* rows and tabs to that frame, it never renames, reorders or replaces them.
Today the frame is the same for staff and admins (an admin is a coach plus rows,
which is right) and different for families.

## 9. Where the parent's app is a different app

### 9.1 The tab bar is two bars
| | Parent | Coach / admin / tracker |
|---|---|---|
| Bar | Home · Calendar · Messages · More | Team · Calendar · Game · Messages · More |
| First tab opens | My players | the team's Season |
| The game | a card on Home, or the Calendar | the Game tab |

So: "How do I see the score?" — "Tap Game." The parent has no Game. "Where's the
next game?" — "Team, then Season." The parent has Home, and under it My players,
and under *that* the team's Season.

**Fix: one bar for everyone, Home · Calendar · Game · Messages · More.**
- *Home* is the team screen for everyone: the coach's Season, and for a family
  the same Season of her child's team with her child's card at the top (what My
  players shows today). Several children on several teams: the same team
  chevron in the title the coach uses to switch teams.
- *Game* for everyone: the team's live game, else the next, else the last; a
  reader lands on Live, a coach on Subs, a tracker on Track (as now). Then "tap
  Game" is true on every phone.
- My players stops being a screen of its own: it is the top of a family's Home.
  Today a parent has *two* team screens (My players and Season) that both carry
  the live card, the next practice with RSVP chips and the next game, while the
  coach has one.

### 9.2 Season is a different screen, not a shorter one
Order of cards, top to bottom:

| Parent | Coach |
|---|---|
| Live game | Live game |
| **Next up: Practice** — Directions · Add to my calendar · *Is Cleo going?* chips | **Next game** — Open the game · Directions · Add to my calendar |
| **Next game** — Open the game · Directions · Add to my calendar | **Next practice** — no buttons at all |
| Cleo's season | Test Squad A on the calendar |
| Games | Last game |
| | Games |
| | Stats · Minutes · Attendance rows |
| | In your own calendar |

The parent's next practice comes before the next game; the coach's after. The
coach's next-practice card has no buttons on Season but three on the Calendar
(Plan · Directions · Add to my calendar): the same card, for the same person,
differs by screen. A parent told "tap Directions on the next practice" finds it;
the coach, on Season, does not.

**Fix: one "next up" block, one card component.** Next thing first (game or
practice), then the next of the other kind, the same card everywhere it appears
(Home, Season, Calendar): title, when, where, then the buttons in a fixed order
(Open the game / Plan · Directions · Add to my calendar), then the answer row
(a family's own child's chips; for staff a one-line "Who is coming: 0 of 14",
tap for the list). The parent's Season is then the coach's with Stats, Minutes,
Attendance and Last game taken out and her child's card put in, nothing moved.

### 9.3 The game has two vocabularies
| | Parent | Coach | Tracker |
|---|---|---|---|
| Live game | **Live** · Stats | Subs · Track · **Stats** · Lineup, with a *Stats / Live feed* toggle inside Stats | Track · Stats (same toggle) |
| Finished game | **Log** · Stats · Recap | Stats · Recap, with a *Match log* button on Recap | Stats · Recap |

The play-by-play is a tab called Live for the parent and a toggle called Live
feed for the coach; the log is a tab for the parent and a button for the coach.
"Tap Live" means nothing on the coach's phone and "Stats, then Live feed" means
nothing on the parent's.

**Fix: the shared pair stays in the same place with the same word for everyone.**
Live · Stats (and Recap once over) are everyone's; Subs · Track · Lineup are
added before them for staff: *Subs · Track · Lineup · Stats · Live*. Five short
words fit at 390px. If five is too many, keep the toggle but call it **Live**,
and give the coach the **Log** tab the parent has rather than a button.

### 9.4 Small splits in the shared frame
- **More → Clubs · "Start a new club"** is on a parent's More. Staff and owners
  start clubs; a family sees Clubs only when she is in more than one.
- **The account sheet** says *Settings — You, this team and the club* for
  everyone, including a parent and a tracker who have no team or club rows; the
  More sheet says *Settings — You* for them. Two entrances, two descriptions.
  Use the More sheet's line in both.
- **Club home** for a parent carries a *My players* card (her Home tab again)
  and says *Your team*; for a coach *2 teams you can reach*. Once Home is the
  team screen, Club home is the same list for everyone: the club's teams, hers
  first, the rest *view only*.
- **The role card** ("You are a parent here…") is still drawn on every screen
  until Got it (Club home, Season, Calendar, the game, Settings, Sessions). Home
  only.
- **The calendar item sheet** is already the same sheet for everyone, which is
  how the rest should feel: the parent's "Is Cleo going?" is the coach's "Who is
  coming" row with one child. The coach's 42 chips (round 2, 7.2) are the one
  thing left that makes hers a different sheet.

### 9.5 What already passes the test
Calendar (views, the Calendars and month pickers, the + for whoever may add),
the calendar item sheet, Messages, What's new with its Notifications gear,
Settings (You · Notifications · This team · Club · Advanced, each role a subset
from the top), More, the game header, the Recap screen, and the "Add to my
calendar" / Google / Apple buttons. Say it the coach's way on any of these and it
works on the parent's phone.

### 9.6 Make it a test
`test/copy.js` holds the words; nothing holds the *paths*. A short suite,
`test/same.js`, that lists the ten things a parent asks about, each as the
coach's tap sequence in the coach's words (`Game → Stats`, `Calendar → the
practice → Not going`, `More → Settings → Notifications`, `Home → next game →
Directions`), and walks it on every role that may do it, through the captured
click handler. A path that exists for the coach and not for the parent fails. It
is what keeps 9.1 to 9.3 from drifting back as screens are added.

## 10. Order of work, round 3
1. Rename the coach's *Live feed* toggle to *Live*, and the account sheet's
   Settings line (9.3, 9.4). An hour.
2. The one "next up" card component, same buttons everywhere, Season's next
   practice included (9.2). A day.
3. One tab bar: Home · Calendar · Game · Messages · More for everyone, Home as
   the team screen with a family's child on top, My players folded in (9.1).
   Two days; `test/nav.js` and `test/home.js` change with it.
4. The game's segmented control shared from the right: … · Stats · Live, Log as
   a tab for staff too (9.3). A day.
5. `test/same.js` (9.6). Half a day, then it guards the rest.
