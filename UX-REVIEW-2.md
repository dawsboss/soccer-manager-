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
*Done in build 148, all four bullets: `gameTitle()` and `gameWhen()` in the header
(`G14 Flight v Northgate` over `Sat 19 Sep · 9:30am`; the score between the teams
once it has kicked off), Club home's team rows read the same way, `navGames()` and
`sheetNavGames()` make the tab a picker when more than one of the teams she works on
(`navTeams()`: coached, tracked or helped; every team for an admin or a viewer, since a
coach reads the whole club) has a game on or coming, and the dot is live on any of
them. Pinned in `test/nav.js`.*

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
*Done in build 148: `homeView()` is Club home when `navTeams().length > 1`, the Team
tab opens it, a team's Season, Players and Training carry a back arrow up to it, Club
home has none of its own and is not offered again under More. The list is Club home as
it was (its order kept: an admin's Calendar card first, `test/schedule.js`), so "2 teams
you can reach" (7.3) is still to do. Pinned in `test/nav.js`.*

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
- **Settings → You row runs two strings together:** "pat@x.test · Parent · Test
  Squad AYou are a parent here: you see your own child by name…". The role hint
  is appended with no separator, and it should not be in that row at all now that
  the "Got it" card exists. (`viewSetup()`, the account row.)
- **A game not played yet shows 0–0** in the game header and on the parent's
  "Not started · 17 Oct · Test Squad A 0–0 Eastfield" card. Blank until kick-off.
  (The header since build 148, with 6.1; the card still to do.)
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

1. ~~Game header: team name, no score before kick-off, us–them order (6.1, first
   two bullets). Half a day.~~ Build 148.
2. Settings "You" row bug; blank score before kick-off on cards (7.1). An hour.
3. Notification switches in one place; rename the page What's new (6.2). A day.
4. ~~Team tab → My teams when there is more than one (6.3). A day.~~ Build 148.
5. ~~Game tab picker when more than one team has a game (6.1, third bullet). A day.~~
   Build 148.
6. Coach's Who-is-coming as a list with override, not chips (7.2). Half a day.
7. Drop the Next-practice card from the calendar; Sessions page's config chips
   to Settings (7.2, 7.3). Half a day.
