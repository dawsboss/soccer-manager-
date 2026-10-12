# TeamPlayHQ — UX review (build 139)

How this was done: the site was served locally with no Firebase config, a test club
seeded (`seedSandbox()`), and every screen rendered at iPhone size (390×844) as an
admin, a coach, a parent and a tracker, then tapped through as a person would.
Screenshots are in the session scratchpad (`shots/`, `fold/`, `crops/`). Because
the run had no database, a few buttons showed for the parent that a real club hides
(`canEditTeam()` is open when nothing is gated); those are left out below.

Scale, for context: `app.js` is 22,800 lines, ~20 top-level screens, 97 bottom
sheets, ~509 distinct tap actions. Almost all of that is the coach's and the
admin's. A parent needs perhaps a tenth of it, and today she is shown the same
frame as the coach.

---

## 1. The big problems (structure)

### 1.1 There is no primary navigation
**Shipped in build 141** (*A tab bar, and a title instead of crumbs*; pinned by
`test/nav.js`): the bar below, by role, with Club under More; crumbs → a title with a back
arrow; the club switcher is the club's name on the title; the top bar keeps the brand, the sync
badge and the avatar. What follows is the finding as written.

A phone app is learned through its tab bar. This one has none. The way around is:

- the crumbs (`Club › Team › Game`), which are a *model* of the data, not a map of
  what a person does;
- three overlapping menus: the avatar sheet (My calendar, Club home, Settings, Sign
  out), the club-switch sheet (Clubs, Club home), and the club crumb → Club home
  (a list of cards: Calendar, Training sessions, each team, Add a team, Club
  settings). The club *menu* sheet adds a fourth list (Calendar: all teams, Club
  admin, My calendar, Your settings, Sign out);
- four unlabeled icon buttons in the top bar (sync badge, calendar, switch club,
  avatar). "this device" / "local" as the sync label reads as an error to a newcomer.

Nobody new can predict where "Messages" is (a hidden button that appears only
once messaging is on), where their child's attendance answer goes, or why "Settings"
and "Club settings" and "Club admin" and "Team set-up" and "People" are five screens.

**Recommendation.** A bottom tab bar, four or five tabs, chosen by role:

| Role | Tabs |
|---|---|
| Parent / player / fan | **Home** (My players) · **Calendar** · **Messages** · **More** |
| Coach / helper / tracker | **Team** · **Calendar** · **Game** (live or next) · **Messages** · **More** |
| Admin | as coach, with **Club** in More (or as a fifth tab) |

Crumbs become a plain title with a back arrow. The club switcher moves into the
title (tap the club name) or into More. The topbar keeps the avatar only.

### 1.2 Parents land in the coach's app
**Shipped in build 142** (*A family's own Home and Season*; pinned by `test/home.js`): My
players is her Home, and the app opened with no address of its own lands her there; its next
thing carries Going / Not going / Maybe, and so does the next game when the next thing is a
practice; a family's Season is next up (answered there), the next game, the last result with her
child's minutes, her child's season ("Played in 2 games") and the games, with no charts, no squad
table, no "owed" and no other child; Club home lists her children's teams alone. Other teams of
the club are not offered at all: in a club with an admin she never could see them (`myTeams()`),
and a line in More would only lead to a team she may not open. What follows is the finding as
written.

A parent opens the app to do three things: see when the next game/practice is,
say whether her child is coming, and see the score / how much her child played.

Today she lands on **Club home**: "Sandbox FC · 2 teams you can reach", a Calendar
card, a Training sessions card ("0 coming up · 1‑1s and small groups, any team"),
every team in the club including ones her child is not on, then the team's
**Season** screen, which is the coach's: 5,400 px tall, 13 sections, with
"Game by game" charts, possession bars, "What needs work", shooting accuracy, and a
Players list reading "141 planned · 109 owed · 32 at Unassigned".

The one thing she must do (answer "going / not going") is not offered where she
lands. **My players** says "Next — Practice · Tomorrow · 6pm · *Not answered yet*"
as plain text. To answer she goes Calendar → finds the entry → taps it → sheet →
Going. The green banner on every screen tells her this in words ("say from the
Calendar whether your child is coming") instead of putting the button in front of
her.

**Recommendation.**
- Make **My players** the parent's home, and put the RSVP chips on the "Next" card
  there, and on the next-game card of Season.
- Give parents a *parent's* Season: next up, last result, her child's minutes and
  games, the games list. No charts, no "owed", no "What needs work".
- Show only teams she has a child on. Other teams of the club are a line in More
  ("Other teams at Sandbox FC"), not cards on her home.

### 1.3 The game is buried under four rows of chrome
On the Subs, Track and Pitch screens the clock starts ~230 px down: top bar, crumbs
(Club › Team › Game), six sub-tabs (Live, Subs, Track, Stats, Pitch, Plan), then a
game bar with six controls (‹‹, ‹, title, ›, Edit, Share). That's a quarter of the
phone before the thing the coach is holding the phone for. Previous/next game,
Edit and Share are not sideline actions.

**Recommendation.** A game is its own mode: one slim header
(`← Hill End 1–1 · 38:08 · ⋯`), the clock pinned, and the sub-screens as a
segmented control or swipe. Fold Pitch into Subs as a view toggle (list / pitch);
move Live (the parents' feed) under Stats for staff, or out to the share page.
Four screens, not six.

### 1.4 Settings are in five places
**Shipped in build 143** (*One Settings screen*; pinned by `test/settings.js`): More and the
avatar open one **Settings**, sectioned *You* · *This team* · *Club* · *Advanced*, each item one
line that taps in. Squad's Team set-up moved to *This team* (Squad keeps one line to it); People,
Registrations, Compliance, Planner, Fields, Club drills and Bulk import are rows under *Club*;
Club settings became **Club details** (name and badge, what parents see, who runs it, teams,
retire) with nothing a row already opens; backup, Check readiness, version, database and the
account id are under *Advanced*. The links for families are in one place, and the club's calendar
is on Club home and the Calendar only. What follows is the finding as written.

- **Your settings** (avatar → Settings): account, notifications, "Club" (with a
  Firebase paragraph), Share with parents, Version, Backup.
- **Club settings / Club admin**: details, What parents see, Retire, Check
  readiness, compliance, …
- **People**: roles, invites, activity.
- **Squad → Team set‑up**: shapes, what to count, *Parent links* (sharing again).
- **Training sessions → Fields / Fees / Hours** tabs.

"Set up sharing" appears on both Your settings and Squad. "Calendar: all teams" is
on Club home, in the club menu, and as a chip on the Calendar.

**Recommendation.** One **Settings** screen, sectioned: *You* (account, sign-in
methods, notifications) · *This team* (coaches: name, crest, shapes, counters,
share links) · *Club* (admins: details, people, programs, compliance, planner) ·
*Advanced* (backup, version, rules check, account id). Each item one line, tap in.

---

## 2. Copy and vocabulary

### 2.1 Infrastructure leaks onto user screens
Seen as an ordinary admin: "Your account id … Needed once, to be made app owner in
the Firebase console", "Firebase config is not filled in — see README.md",
"Check readiness … a lookup table the app hasn't written yet", "the club's
database rules need the rsvp block from README", "Force refresh", "Rules version",
"id sbA" in the team header, "Org admin". None of this means anything to a club
secretary. Put it under *Advanced*, and turn failures into a plain sentence
("That didn't save. It's kept on this phone and the club admin has been told.").

### 2.2 Paragraphs where labels belong
Nearly every card carries one to three sentences of rationale, the same voice as the
code comments. Examples a parent sees: *"Everything still to come, as a file your
phone's calendar opens. It is a copy: if a time changes later, add it again — each
entry replaces its earlier self in calendars that allow it."* *"Minutes are across
every game this season. Tap a game for the full picture."* *"For the screen only: a
parent's phone still holds the squad it reads, as it always has."*

Cut each to a label and, where the detail matters, an ⓘ that opens it. Buttons that
are sentences ("Show what has already happened (9)", "Add what is coming up",
"Plan this practice") should be verbs ("Past", "Subscribe", "Plan").

### 2.3 One word per concept
Today: Squad / Players / Roster / My players. Practice (a tab of drills and plans) /
practice (a calendar entry) / Training sessions (1‑1s) / Plan (a game plan) /
Planner (the club planner) / plans. Org admin / Club admin / Club settings / Your
settings. Tracker, helper, viewer, fan as on-screen labels ("Signed in as Tracker").
The stats words — *owed*, *planned*, *at Unassigned*, *scrappy*, *spell*, *stint*,
*By need*, *Batch*, *set / move* — are the coach's internal model, shown to
everyone.

Pick and hold: **Team · Players · Calendar · Messages · Settings**; **Drills** for the
library, **Plans** for plans, **Sessions** for 1‑1s. "Played 95 min in 2 games" not
"95 min · 46 owed · 95 at Unassigned".

### 2.4 Banners
A parent sees up to three stacked banners above every screen: the test-club banner
(fine, test only), *"Signed in as Parent — you can read, and say from the
Calendar…"* (permanent), plus the rules / offline / refused-write banners when they
apply. The role banner should be a one-time card and a line in the account sheet,
never a fixture.

---

## 3. Individual screens

**Club home.** The club name appears three times (crumb, h2, header row). The
"Sandbox FC · 2 teams you can reach" row is not tappable but looks like the cards
that are. Tappable cards need an affordance (chevron, or a button style).

**Season.** Thirteen stacked sections; it is a dashboard, a stats page, a games
list, a players table and an attendance table on one scroll. Split it: a short
Season (next up, last result, record, games) with **Stats**, **Players** and
**Attendance** as their own screens. Charts with two data points ("Game by game")
should wait until there are five games.

**Squad.** Good: the add row is right there. Bad: the five-dot strength rating is
unexplained, "no profile yet" on every row, and the whole Team set-up block lives
under the player list where a coach won't scroll.

**Calendar.** The header stacks a live card, a ≡ button (calendars picker — not a
recognised icon for that), a month title that is also a dropdown (mini month),
four view tabs, a "next practice" card, a text link, then the list. The **+** FAB
sits over the first row's score badge (visible in the screenshot: it covers "1–1").
Suggest: one row `[Calendars ▾] [October 2026 ▾]`, one segmented control, list.
Pad the list bottom so the FAB never covers content.

**Calendar item sheet.** Clear and good. "Call A coach off" has a capital A that
reads like a name fallback bug.

**Subs.** Every row shows an orange "9 owed" — orange reads as a warning, and it's
on all eleven players. "set / move" are two stacked words in a button; "By need"
and "Batch" are modes with no explanation. The clock card is repeated identically
on Subs, Track and Pitch.

**Track.** Solid: big tap targets, counters, match log with filters. The best
screen in the app for its job.

**Live / Recap.** Good for parents. Recap's hero ("A win for Test Squad A against
Riverside, over 60 minutes") is the right tone for the whole app.

**Plan (upcoming game).** "Snapshots" and "Pick a shape" first, with "This game has
no shape…" prose. Lead with the lineup and offer the shape when needed.

**Practice.** Three chips (Plans / Drills · 141 / Positions), then "Templates ·
Mine · Club", then a list of dates with "Plan it". Fine for a coach; a parent
should never see this tab (she doesn't in a real club).

**Training sessions.** Five tabs (Sessions, Bookable times, Fields, Fees, Hours)
plus Mine / Everyone's plus New session, then empty states. For a family, this
whole screen should be "Book a session" with the available slots, or nothing.

**Your settings.** Account id + "Copy id" + Firebase sentence at the top of the
most-visited settings screen. Notifications (the thing people come for) are second.

**People.** Good: the "3 waiting to be let in" alert, filters, table. The table
overflows on a phone (Joined column clipped). Make rows cards on narrow screens.

**Welcome / lock.** "Sign in to open your club" assumes she knows she has one.
After sign-in with no role: "Waiting for access — no role has been granted to this
account yet. Ask the club admin for an invite link." A dead end in jargon. Say:
"You're signed in, but nobody has added you to a team yet. Ask your coach for the
team link, or open the invite you were sent."

---

## 4. Visual system

- Type runs small for a sideline: ~100 declarations at 10–13 px, secondary text in
  muted grey on the grey page. Bump the floor to 14 px and check contrast of
  `.muted` on `--paper`.
- Everything is a white bordered card on light grey. Informational cards,
  tappable cards and forms look the same. Give tappable rows a chevron and a press
  state; drop borders from informational blocks.
- The green is strong and the condensed headline face is distinctive; keep both.
  Use green for *actions and now* only; the orange "owed" and red "Cancelled" are
  doing too much work as alarms.
- Bottom sheets are good and consistent. Keep them.

---

## 5. Suggested order of work

**Quick wins (a day or two each, no data-model change):**
1. Remove the permanent role banner; show it once, keep it in the account sheet.
2. RSVP chips on My players and on the Season next-up card. *Done, build 142.*
3. Move developer text (account id, Firebase, rules, readiness, version) under an
   *Advanced* section; reword the refusal toasts.
4. Fix the FAB overlapping the calendar list; pad the list.
5. Rename: Org admin → Club admin; "this device" → "Not synced"; Squad → Players.
6. Parents' club home shows only their teams. *Done, build 142.*

**Medium (a week each):**
7. Split Season into Season / Stats / Players / Attendance.
8. One Settings screen with sections; delete the duplicates. *Done, build 143.*
9. Copy pass: labels not paragraphs, one word per concept (a glossary file in the
   repo so tests can hold the UI to it).

**Large (the structural change everything else hangs off):**
10. Role-based bottom tab bar, and crumbs → title + back. *Done, build 141.*
11. Game mode: one header, pinned clock, four screens.
12. A parent's own Home and Season. *Done, build 142.*

Items 10–12 are where "new people and parents get lost" is actually fixed; 1–9
make it noticeably better while that is built.
