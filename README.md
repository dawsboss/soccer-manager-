# Minutes

A sideline tracker for soccer coaches: multiple teams, rosters, planned vs actual minutes, a match clock, and a pitch you can drag players around on. Static files and a Firebase database, no build step, no AI calls. Server-side code (Cloud Functions on the same Firebase project, in [`functions/`](functions)) sends notifications to closed phones, and is planned for payments and email; see [`GOTSPORT.md`](GOTSPORT.md).

## What it does

- **Teams and rosters.** Any number of teams, each with its own squad. Players can be marked unavailable for a game without deleting them.
- **Match clock.** Start, pause, and end each half or quarter. Every segment is stored with a wall-clock timestamp, so two devices watching the same game show the same minute without talking to each other.
- **Minutes.** Placing a player on the pitch opens a stint; taking her off closes it. Actual minutes are derived from those stints, so the numbers survive a reload, a dead battery, or a second device joining mid-game.
- **Planned vs actual.** Set planned minutes per player per game (or split the available minutes evenly), and each player's row shows a bar filling toward her target. Amber means she is owed minutes.
- **Positions.** Drag tokens anywhere on the pitch. Tap a bench player then tap a player on the pitch to sub her in — the incoming player inherits the position.
- **Season totals.** Every player's cumulative planned vs actual across the season, sorted by who is furthest behind.
- **Player profiles.** A best position, other positions she is fine at, a *can go anywhere* switch that is on by default, a 1–5 strength rating, a longest-stint cap, a keeper flag, free-text notes, and two lists: *plays better alongside* and *keep apart from*. Pairings are stored both ways automatically, so you only set them once.
- **Shapes.** Presets for 11v11, 9v9, 7v7 and 5v5, or drag your own and save it as the team default for that side size. Empty spots show on the pitch as dashed circles you can tap to fill, and players can still be dragged anywhere off-shape — or you can pick *no shape* and place them freely.
- **Game plan.** Builds a block-by-block schedule from planned minutes, ratings, stint caps and pairings. Each block is a fixed XI; substitutions happen at the boundaries. It shows projected minutes against planned for every player, so you can see where the constraints cost someone time before kickoff. During the game the plan card shows the next change and makes those subs in one tap.
- **Lock in the plan, and let the tracker call the subs.** *Lock in* on the Plan tab freezes the snapshots and says whether the club has them or only this phone does. The Track and Subs tabs then count down to each planned change on the half clock, turn loud when it is due, and make every change with one tap (*Subs are on*) at the minute it is pressed — undoable for two minutes, or *Not now* if the change is not happening. A tracker gets the time and how many subs, never the names, and cannot make any other sub.
- **Tell the bench.** Each change written as the calls a coach makes at the bench: who goes on, at which spot and for whom, who switches spots, who comes off, and the starting lineup spot by spot at kick-off. It works from the pitch as it really is, so hand-made subs are accounted for. *Copy as a message* sends it to an assistant, and the *Bench sheet* lists every change in the game.
- **Live, for everyone following.** The Live tab inside a game is the play-by-play: the score, the clock, and what has happened — kick-off, goals with the score after each, subs, half time, full time — with shots and set pieces one tap away under *Everything*. It is the one game screen every role gets, parents and trackers included. *Notify me* turns each goal, kick-off, half time and full time into a buzz and a pop-up on that device, but only while the page is open: the server pushes messages to a closed phone (**Notifications to a closed phone**, below), not yet a followed game. The coach's old Live screen — minutes, bench, subs — is now the **Subs** tab.
- **Live pairing check.** A banner appears if two players you marked *keep apart* end up on the pitch together.
- **Fixing mistakes.** Tap any line in the sub log to nudge it by 5, 15, 30 or 60 seconds, or type the exact time. *Add a sub* records one that happened before you tapped. *Fix minutes* opens a player's spells on the pitch and lets you edit or delete each one. *Clock reading wrong?* shifts the current half and the total together.
- **Per-game availability.** Mark players out for one game without touching their season totals.
- **Veo.** Each game has a field for the Veo link, so the recording sits next to the sub log.
- **Three tabs a team, and the Calendar up top.** **Season**, where a team opens: the game being played, one tap from the game, then the next game (*Is Ella going?* for a family, *Open the game* for everyone), the next practice, the results and the charts, and every game with *Add a game*. **Squad**, with the team's set-up (name and crest, shapes, what to count, parent links) under the players. **Practice**, for coaches and admins. A tracker has Season and Squad; a parent Season alone, so no row of tabs at all. The **Calendar** isn't a team's: it is the person's, across every team and club she is in, on its own button up top beside Messages and the account, with today's date on it.
- **One calendar.** Games, practices and anything else on, drawn the way Google Calendar draws one: **Schedule** (every day with something on, the date down the left), **Day** and **Week** (the hours, with each entry where it falls and a line at now), and **Month** (the grid, with what's on in each day), with *Today*, back and forward, a small month under the title for jumping to a date, and a **+** in the corner to add. It shows **My calendar** (everything of yours: your teams, your children's, the sessions you run, the times you offer and your other clubs) or, for whoever can see more teams than her own, **All teams**. Today has a red line at the time now wherever it is listed: on the hours, on the Schedule, and under the month when it is the day tapped. A game being played sits on top, one tap from the game; *Next up* has directions and, for a game, *Open the game*. Called-off entries stay on, struck through. Practices repeat weekly on whichever days you pick. Coaches add and change it; everyone with a role on the team reads it. Families can subscribe so their own calendar follows every change, and parents say whether their child is coming to each game, practice or event. See **The calendar** below.
- **Match-day details.** A game carries home or away, an arrive-by time, the kit, notes for families and the other team, and whether it is on, postponed or cancelled. They show on the calendar, the Plan tab and the share pages.
- **Practice.** A library of 141 drills, each with an animated diagram, setup, coaching points, questions to ask, what goes wrong, easier and harder versions and safety notes. Filter by age, type, position, the shape you play (2-5-1, 3-3-2, 2-3-1 and the rest: a team with a saved shape gets a one-tap *2-5-1 drills* chip, and *Suggest a session* leans towards them), length, setup time, players, kit, difficulty, intensity, skill, principle of play and what needs work. A **Positions** guide says what each of nine positions does with the ball, without it, and in the second either way, and links the drills that teach it. The list starts at the team's age group, set as a **birth year** under Squad → *Name and crest*, so it moves up a year by itself every August. Coaches and admins only: parents and trackers never get the tab.
- **Practice plans.** A plan hangs off a practice on the team's calendar: *Add a practice* on Plans is the calendar's own sheet, and the plan reads its day, time, place and length from that entry, so moving the practice on the calendar moves the plan, and calling it off strikes the plan through without losing it. *Suggest a session* fills it: a warm-up, one or two practices, a game and a cool-down that suit the team's age and squad, timed to fit. *Ask an AI for a session* writes a prompt with the team's age and squad, what the numbers say needs work, how the last practices went, and the drills that fit by id (the club's and her own only if she says, by name and what each trains); paste the AI's reply back and its `[drill-id] minutes` lines become the plan. The app still never calls an AI itself, and no player is named in the prompt. Add, move, retime and annotate drills; the plan works out the kit to bring and warns before the field about too few players, missing keepers, a drill outside the age group or three hard drills in a row. *Run it* is the sideline view, one drill at a time with a countdown and its coaching points, and it works with no signal. Afterwards, one to five stars and a line on how it went, and *Use this plan for…* copies it to a coming practice with no plan. Deleting a practice from the calendar keeps its plan, under *Earlier*. The plan is the team's coaches' and the club's admins'; parents see the next practice on their Calendar and on the team's Season, and its coaches open the plan from either. Plans made before plans hung off the calendar are moved onto it by themselves. Plans need the `training` rules block below; without it they stay on the phone they were made on.
- **Templates.** *Save as a template* turns any plan into a reusable session (its drills, minutes, notes and what it's for), on your own shelf, which follows you to any club, or straight to the club's for its coaches and admins. *Plan from a template* or *Swap in a template* on a plan, or *Plan a practice from it* on the template. Copies both ways: changing a plan never changes the template, and deleting a template leaves every plan made from it. *Share with the club* and *Copy to mine* work as they do for drills; admins look after the club's under Admin → *Club drills*.
- **What needs work.** A card on Season, for coaches and admins, that reads the last five finished games and says what stands out, with the numbers (*12 against and 6 for in the last 5 games*) and the drills that answer it for the team's age. No AI: thresholds in `TRAINING.md`. A signal only fires on what was tracked, so a team that doesn't tap shots is told its shooting is unknown, not that it never shoots.
- **Coaches' time off.** On My calendar, a coach adds the nights she can't do every week (*never Mondays*, *not after 6 on Tuesdays*) and the dates she's away; on any practice, game or event of her team, or a session she runs, *I can't make this* calls her out of that one, and *I can make it after all* takes it back. Nothing is called off for her: the team's other coaches and the admins see who can't make it (and *no coach* when nobody is left), her bookable times leave her time off out, and the planner counts it. Families never see any of it. An admin can do all of this for any coach: add her time off, *Call Jaz off* a practice or session (the entry says who did), and *Put Jaz back on*.
- **Who can coach then.** Planner → *Coaches*: pick a day and a time and every coach is listed free, busy (and where) or off (and why), with her time off underneath and *Add* for each. A practice left with no coach says who is free to cover it. Someone taken off every team is gone for good and isn't listed; time off is the "for now".
- **Club activity.** Admins hear, while Minutes is open, about every new, moved, called-off or deleted practice, game and event on any team (a weekly series or a club-wide booking as one item), coaches calling out or being called off, time off, and sessions families booked or asked for. It pops up as it arrives and is kept under the bell, at the top of Messages. A coach hears the call-outs on her own teams and being called off herself. Nothing you did yourself is news to you, and families hear none of it.
- **Field hours and closures.** Each field can carry its opening hours per weekday (when the lights go off, when the school has it, a day it's shut) and dates it's closed (reseeding, the school's sports day). Anything booked there outside them is flagged on the field, on the session, and in the planner, and find-a-time won't offer it.
- **All teams** (what was Club schedule). *Calendar* on Club home opens it for an admin, as do Club settings and the club menu, and the Calendar offers it beside My calendar: every team's games, practices and events in each team's colour, ticked by age group, team or kind. An admin gets the club's week under it: what is on, who shares a field, what clashes, which teams have no practice, and what is coming up still missing a date, a time or a place. The **+** adds to any team she may change from one sheet: a game (in the shape that team's last game had), a practice, something else, or **a run of games**, a row per fixture, for the season in one go, and keeps her on the calendar; a coach of more than one team has the same sheet for hers, and a run of games is on any team's own + as well. An admin's My calendar is only hers: one who runs no team of her own isn't offered one.
- **Shared field time.** Two teams practising on one field at the same time is fine and is only noted, on both entries (*Shared field: G13 Storm 6pm*), in the club's week and in the planner's *Shared field time*. A game, or anything other than a practice, with no pitch left for it (more on the field at once than it has pitches, or the same named pitch) is still a *Field clash*. Find a time says which teams it would share a field with rather than calling the field full.
- **Planning for the club** (admins). Admin → *Plan*: **Clashes** over the next week to four weeks (a game short of a pitch, a coach due in two places, a family with children due in two places, by name); **Find a time** for some teams or the whole club, scored by who would be affected, best first, each slot saying what it clashes with, and one tap puts it on every chosen team's calendar as one entry per team; **Picture day**, which lays the teams out in slots around what each already has on, siblings' teams next to each other, and books each team's slot. No new rule: an admin can already write every team's calendar.
- **The club's drills, and your own.** Practice → Drills has three shelves: **Built-in**, **Club** and **Mine**, and every filter works across all three. *Save to mine* copies any drill into your own library, and editing a drill that isn't yours saves your own version of it (*Your version of Rondo 4v1*), which says so if the original changes later and never changes by itself. *Write a drill* asks for five things (a name, a line on what it is, the setup, how it runs, and what to coach), then the picture; the rest (numbers, kit, tags for the filters) is folded under *Show the detail* with defaults, and every list there is chips from the library's own words, so the filters find it. **Draw it on a pitch**: put players, a ball, cones and goals on with a tap, then add steps, tapping a player and then where they go (a player with the ball passes to whoever you tap, or dribbles to a spot; one without it runs). It plays as an animation on the drill's card. A drill has no uploads: it keeps the drawing of the built-in drill it came from, or carries https links to a clip. Your own drills are private to your account, whichever club you're in: no club admin can see them, and they leave the phone when you sign out. *Share with the club* puts a copy on the Club shelf, which the club's coaches and admins read and trackers and parents never do; admins tidy it from Admin → *Club drills*, and a coach can edit or remove what she shared while she still coaches its team. Adding one of your own drills to a practice puts a copy in the plan, which that team's coaches can read, and the app says so the first time. Deleting a drill from any shelf leaves every plan that used it as it was. Every drill says who made it: the app's own library is credited to Minutes, and a club drill to the coach who shared it, which stays on it after she has left (the card says so) and whoever tidies it. Filters → *Made by* narrows to the app, you, or any one coach. **Or have an AI draw it**: in the editor, describe what happens in your own words and copy the prompt into your own ChatGPT, Claude or Gemini (the app sends nothing itself, and swaps any player's name out first); paste the answer back and it becomes an animated drawing like the built-in ones. If the answer doesn't hold together, the app lists what's wrong in words you can paste back to the AI. **Send to a coach**, on a built-in or a club drill, gives a link to that one drill to send however you like. The link carries the drill's id and which club it's from (as a tag, never the club's code), so a coach in more than one club lands in the right one without choosing, and it opens only for whoever may read the drill on their own phone: a club drill for the club's coaches and admins, signed in, while a parent or a tracker it's forwarded to is told it's for the club's coaches and sees nothing of it. The drills that come with the app open for anyone, to read. Your own drills are private, so there's no link to one: share it with the club first.

## Running it

Open `index.html` in a browser, or serve the folder. Everything works immediately with data stored on that one device.

## Sharing data between your phone and hers

1. Create a Firebase project (free Spark plan is plenty) and add a **Realtime Database**.
2. Add a **Web app** to the project, then copy the config object into `firebase-config.js`.
3. In Realtime Database → Rules, paste the rules:

   **[`database.rules.json`](database.rules.json)** — the whole file. On a phone: open it on GitHub, tap **Raw**, select all, copy, and paste it over everything in the Rules editor, then **Publish**.

   There is one ruleset, for every club. A database runs one set of rules for every club in it, and this site is for any club that comes to it, so there is no "starter" set for new clubs and a stricter one for established ones: a new club is made under the same rules every other club runs on (see **The database rules** below).

4. Sign in (Setup → Account), then tap the club button at the top left → **+ Start a new club**, give it a name, and *Start it*. That creates the club, with you as its admin, and opens it. (A device with no club open has the same button under Setup → Club.) There is no code to type or share: everyone else joins with an invite link — see **Joining a club** below — and a phone finds the clubs its account is in by itself. Signed out, the app still works, but only on that one device.

**Only the club's server writes the share pages** (`public/`, SECURITY.md, SEC-10). The rule is `.write: false` for every account, admins included: phones make the ids (in the club, under the team's rule), and the server's functions build each page from the club as the phones write goals, subs and changes to it (`functions/mirror.js`). So nobody holding a link, and nobody signed in, can put anything at a share link, and a page a coach's phone could never finish publishing with no signal is published by the server once the phone's changes land. Without the functions deployed (**Deploying the server**) no share page is written at all.

If links are not working, open **Setup → Share with parents**: it says when the server last wrote the page, or that it has not built it yet.

Why the pages are safe to be world-readable:

- The node is **derived**. The server rewrites it from the club on every change.
- It contains **no names and no player ids**, so there is nothing there worth stealing.
- The real record lives in the club and is never read by the public page.
- Share ids are long and random, so the node is not discoverable without the link.

The API key in `firebase-config.js` is not a secret; the rules above are what gate access. A club's id (the `{code}` in `workspaces/{code}`) is plumbing, not a password: nobody types it or sees it, and knowing it gets you nothing without a role the rules can find.

The badge in the top bar shows `synced`, `offline`, or `this device`, and `3 to send` while changes made on this phone haven't reached the club yet. Nothing lives only on the phone: every change is kept in an outbox on the phone until the database confirms it has it, so a game tracked with no signal reaches the club even if the app is closed and reopened before the signal comes back. Plans, drills and messages do the same. A change the club's database refuses (usually because the rules haven't been pasted yet) is kept, tried again every time the phone connects, and said on every screen, with a list under Settings; it is only dropped if you choose to. A phone used before it joined a club is offered, under Settings, a way for an admin to add those teams to the club. If both devices edit the same game while one is offline, last write wins.

### Sign-in methods

Firebase console → **Authentication** → **Sign-in method**. Email/Password (with **Email link** ticked) and **Google** are what the app has always offered. Leave **User account linking** on *Link accounts that use the same email* (the default): it is what keeps a parent who joined by email link and later taps Apple the same person to the club. The app catches the refusal, asks her to sign in the way she did before, and adds the new way to that account.

To offer more, switch each on in the console, then list it in `firebase-config.js`:

```js
window.SOCCER_SIGNIN = ['google', 'apple', 'microsoft'];
```

Only what is listed gets a button (left out, it is Google alone), because a method not switched on fails with *operation-not-allowed*.

- **Apple** needs an Apple Developer account: a Services ID, a key for Sign in with Apple, and the Firebase handler (`https://<project>.firebaseapp.com/__/auth/handler`) as its return URL; the console's Apple panel walks through it. For email links to reach people who hide their address, register the project's sending domain in Apple's *Private email relay* settings. Apple hands over a name only the first time, so someone may need to type hers on the account sheet.
- **Microsoft** needs an app registration in Azure (*Accounts in any organizational directory and personal Microsoft accounts*) with the same handler as its redirect URI; paste its id and secret into the console's Microsoft panel.

Each person can see and add ways to sign in from **Your account**, and there is a *Forgot your password?* link beside the password box.

## Joining a club

Joining someone else's club is by invite, and there is no code to type. Starting your own is not: anyone signed in can tap the club button at the top left → **+ Start a new club** and be its admin. The club they were in is untouched and stays in their list; a new club needs a signal, because it is made at the database there and then rather than queued on the phone.

1. A club admin opens **People → Invite someone**, picks Coach, Tracker, Team helper or Parent (and which player, for a parent), and optionally an email address.
2. The app makes a link — `…/?invite=<id>` — to copy, share, or, with an email, have Firebase send as a sign-in email.
3. The person opens it on their phone, signs in, and sees *Join Lakeside SC as coach of Flight*. **Accept** gives them the role and opens the club. That is the whole of it for them.

Whoever makes an invite chooses **how many people** can use it (one, the default, up to fifty) and **for how long** (a day to ninety days; fourteen by default). A link for several people carries a seat for each, and each person who opens it takes one; once they're all taken, the next person is told it's used up. An emailed invite and a player's own link are always for one person. With an email address on it, only that (verified) address can accept it; without one, whoever opens the link first gets the role, so send it somewhere private. The admin sees each invite under People — open ones first, used and expired ones folded away — and tapping one shows its link again to copy or share, who used it and whether they still hold the role, and a button to revoke it while it is unused. Withdrawing a role later also deletes the invite it came from, so it cannot be spent again.

The invite shows the club, the team and who sent it — never a child's name. A parent invite names the player by shirt number, because a link gets forwarded.

### A club viewer

A director or a board member sees every team's calendar and games with the children's names, and nothing else: no emails, no access log, no coach's notes, no messages, no answering who's coming, no changes. An admin makes one from **People** (the person's *Club viewer* chip) or with **Invite someone → Club viewer**, which asks for no team. It needs rules version 17 published. The game link without signing in is unchanged and still carries no names.

### A whole squad of parents

Two ways, both on the team's **Squad** tab, in a **Parents** card for that team's coaches and the admins.

- **One team link** (coaches and admins). Post it in the team chat. Each parent signs in, types their child's shirt number (`7, 12` for two) and optionally the child's first name, and waits. The request shows on Squad with the player that number matches already picked; **Let in as parent of …** makes them that player's parent and lets them into the club, **Turn down** removes it. The parent sees no names at all before they are let in, and their phone opens the club by itself once approved. **New link** replaces it — the old one stops working, which is how a link in last season's chat dies.
- **A personal link per family** (admins). *Or a personal link per family* makes an ordinary parent invite for every player with no parent yet, in one tap, and lists them to copy or share one by one. Running it again makes nothing new, so the same list is where you find a link to send again. Each works once with no approving, so send each to that family only.

The team link needs the `joinCodes` and `claims` rule blocks, and the clause on `access/index` that lets a coach index a parent she approved.

**A second device** needs no invite. Once someone has joined, signing in on a device with no club open finds the club from their account (`userOrgs`) and opens it; with more than one, they are listed under the club switcher. Anyone who joined before this existed gets that list filled in the next time they open the club.

Two limits worth knowing:

- **Firebase words the sign-in email itself.** It reads as "sign in to …", not "you are invited" — a text to say it is coming saves a confused parent.
- **An invite belongs to the database it was made in.** One made in a test database only works on a device pointed at that database.

## What a parent sees

- **Her own children by name, the rest of the squad by shirt number.** On Stats, Season, Live, the match log and the recap, a parent's child is named and every other child is `#8` (or *A teammate*, with no number). Squad, with the team's set-up under it, stays closed to her, as before. Only someone who is nothing but a parent in the club is narrowed: an admin, a coach (of any team, with a child on another or not) and a tracker see names.
- **Or the whole roster, if the club says so.** Club admin → **What parents see** has the two choices AUTH.md allows: *Shirt numbers only* (the default) and *The whole roster by name*. Only an admin changes it (`access/org/rosterOpen`, under the rule the club's details already use).
- **On a club that has moved, it is the database too.** A club on the old tree (`workspaces/{code}`) is read whole by everyone in it, so a parent's phone holds the names and the app chooses not to draw them. Once the club has moved to `orgs/{code}` (below), her phone is sent her own children's records, the others' shirt numbers and the staff's names, and nothing else: no other child's name, note or rating, nobody's email, no access log.

### Moving a club so families' phones hold only their own

Club settings → **Keep the squad off families' phones** → *Move* (admins only). The phone asks the server (`moveRequests/{code}`), which checks she is an admin, refuses while a game is being played, copies the club to `orgs/{code}` in batches, reads it back and compares, switches it over in one small write, keeps a copy of the old tree on the server (`serverState/moved/`), and answers. Every phone notices on its next read and carries on, its outbox included; nothing about the screens changes. It needs the functions deployed and rules version 12 published (both happen on a merge to main, **Deploying the server**). Turn on daily backups first, and move a test club made before build 110 first (one made since already starts on the new tree). New clubs start on `orgs/`. **Every club has moved** (2026-10-09), so the button only matters for a club made before build 110 that turns up later. AUTH.md, *The move to `orgs/{orgId}`*, has the design; SECURITY.md, SEC-D9, what it closed.
- **My players spans clubs.** Her children in every other club she's in are listed under this club's own, named with their team and club, with the next thing to get them to and *Open that club for her minutes*. It comes from the cut-down copy My calendar already keeps (her own children, no stints), so there are no minutes for another club until it's opened.

## A team helper

A team manager, a volunteer or an assistant: someone who helps the coach get ready and doesn't run the game (AUTH.md, *More kinds of people*). An admin makes one, by **People → Invite someone → Team helper** or by giving the role to someone already in the club; a coach can't.

- **She sees what the team's staff see**: its squad by name, its calendar, its games, Live, Stats and the recap. Not the coach's notes on a child, not members' emails, and only her own team.
- **She helps prepare**: adds and changes the team's practices, events and games, calls one off, takes the register, posts notices, plans practices from the Practice tab, uses the drill shelves (her own, and the club's, which she can share to), and plans a game, picks who is out of it and edits it **until it kicks off**.
- **She doesn't run the day**: no clock, no subs, no logging, and once a game has kicked off its plan is read-only for her. She doesn't change the squad, and she reads no family's conversation.
- **She is told** of her team's notices and calendar changes, like the rest of the team.

Needs rules version 16 (`helpers` and `helperIndex` under `access`, and her clauses in the team's `events` and `attend`, `matches`, `board`, and the `training` blocks' `practices`, `drills` and `templates`). It is written for clubs on `orgs/`, which is every club now.

## A player's own sign-in

For an older player who asks. On her page in Squad, her coach (or an admin) taps **Make her a sign-in link**: a single-use link, good for 14 days, which names her by shirt number and nothing else. Off unless someone asks, and no age rule; that is the coach's and the club's call.

- **She sees what her parents see**: her own minutes under *My season*, the team's calendar, Live, Stats and the recap, teammates by shirt number unless the club shows the whole roster, and the team's notices.
- **She says whether she's coming** ("Are you going?"), for herself only. Her parents can still change it, and the coach's word wins as always.
- **She reads and writes in her family's conversation with the coaches**, one per parent account, where her parents see every word. She never has one of her own, so no coach talks to her where her parents can't see. The rules refuse that conversation too.
- **She doesn't book or pay for sessions**; that stays with her parents.
- **Taking it away** is *Remove* beside her account on the same page, or on People. Her parents keep theirs. *Withdraw* kills a link nobody has used yet.

Needs rules version 6 (`teamPlayers`, `self`, and the player clauses in `invites`, `clubInvites`, `rsvp`, `board` and `dm`). Until it's pasted, making the link is refused and says so.

## Fans

A grandparent, an aunt, a family friend who wants the games and the calendar on their own phone, without being a parent. On a club on `orgs/` (every club now).

- **Anyone who can see the player asks for one.** Her family, from *My players* → **Fans**; the player herself, the same way; her coach or an admin, from her page in Squad. Each makes a link for as many people as they choose (one by default, two for both grandparents), for as long as they choose. It names her by shirt number, never by name.
- **The team's coach approves it.** Someone who opens a family's link signs in and is put on Squad → **Parents** → *Fans asking*, beside the families' asks, saying which player and who asked for them; the coach taps *Let in as fan* or *Turn down*. A link the coach or an admin made is approved already, so whoever opens it is let in.
- **A fan does less than a parent.** The calendar, Live, the scores, the recap and the team's notices, her player by name (with *you're her fan* under My players) and teammates by shirt number unless the club shows the whole roster. She doesn't say who is going, has no conversation with the coaches, and books no sessions. Notifications: the team's notices, calendar changes and a game she follows, like a family. Her phone reads her player's record and nobody else's, and nothing a coach wrote about her.
- **Her family sees who.** *My players* → **Fans** lists each fan of their child by name (the name is kept on the child's record, which the family reads), with *Remove* beside each. Her coach and the admins can take one away too, from the player's page in Squad or from People. *Withdraw* kills a link nobody has used yet.
- **A fan can leave.** Her card under *My players* has *Stop following*, which takes her off the record and, if it was her only role, out of the club.

Needs rules version 20 (`fans` and `fanNames` on the child's record, `access/teamFans`, and the fan clauses in `invites`, `claims` and `board`), on `orgs/` only. Until it's pasted, making the link is refused and says so.

## Links with limits

Every link the app makes can be held to how many people and how long:

- **Invites** (People → *Invite someone*, a squad's parent links, a player's own link, a fan link): how many people, and for how long. See **Joining a club**.
- **The team link** (Squad → **Parents**): *No limit* and *Until you replace it* by default, as before, or up to a set number of families and for a set number of days. Each family takes one place before it can ask; an expired or used-up link says so before anyone types anything.
- **Share pages and calendar feeds** (the season link, a game's own link, the team's calendar feed, My calendar's address): an end date. After it nobody can open the page, and a calendar subscribed to the feed is told it has gone. Pick a new end, or *No end*, to bring it back. There's no limit on the number of people for these: nobody signs in to open them, so there's nobody to count.

Needs rules version 20. Share pages are written by the server (build 120), so an end date takes effect once the functions are deployed.

## Messages

The speech bubble in the top bar, for anyone with a role in a club that has an admin. The bell beside it is **Notifications**: what is new (changes to your games and practices in any club, and club activity), never somebody's message. Each has its own count.

- **New message.** One list of everyone you may write to: for a parent, the coaches of each of her teams; for a coach, the families on the teams she coaches (an admin, every team) and the club's other coaches and admins. Type a name, a child's name, a team or a role to find them. Tap one person to open your conversation, or several to send them the same message: each gets it in their own conversation and nobody sees who else did. Nothing is written until you send.
- **Team notices.** A team's coaches and the club admins post (**Post a notice**); every family on the team, its coaches and its trackers read. *Urgent* marks one in red. Under each notice a coach sees **Seen by 9 of 14 families** — tap it for who has not — and **Email or share**, which opens her email app with every parent's address in Bcc (from their sign-in), or the phone's share sheet for the team chat.
- **Family conversations.** One per family per team, with that team's coaches: *Ella has a cold, she'll miss Thursday.* The family or a coach can start it, and either way every coach of the team and the admins see it and can reply — never one coach alone, which is the safeguarding-friendly shape — and nobody else. A player with her own sign-in reads and writes in her family's.
- **Coaches and admins.** Two colleagues talk to each other in a conversation only the two of them can read, admins included, while both are still a coach or an admin.
- **Where a message has got to.** ◷ waiting for a signal, ✓ sent (the club's database has it), ✓✓ delivered (somebody else's phone has it), blue ✓✓ read. Tap one of yours for who has it and who read it, and when. Delivered means their phone has opened Minutes since, or had it pushed.
- **How private.** The lock on each conversation names who can read it. The database's rules refuse everybody else; messages travel encrypted (HTTPS) and are stored encrypted by Google. They are **not end-to-end encrypted**: whoever runs the club's Firebase project can read the database, as with email. A copy stays on each phone that opens a conversation, and is wiped when that person signs out. Messages cannot be edited or deleted.
- **No signal.** A message written at a pitch with no signal waits in an outbox on the phone and goes when the connection returns, even after a reload. One the database refuses says *Not sent* with *Try again*.

**What "notifications" means here.** With Minutes open, a message pops up (or buzzes) in any tab, and waits with a count on Messages. With it closed, a phone hears only if the club has the server set up and that person turned **Notifications on this phone** on (below); everyone else hears the next time they open Minutes. To reach everyone *now*, whatever their phone, use **Email or share** on the notice.

**Needs the `board`, `dm` and `staffdm` rule blocks published** (rules version 9 for `staffdm` and the delivered marker). Without them sending says *Not sent — the database refused it*.

## Notifications to a closed phone

A team notice, or a message in a conversation, reaches the phones of everyone who may read it, with Minutes closed and the screen off: the team's families, coaches and trackers for a notice; the family, the team's coaches and the admins for a family's conversation; the other of the two in a conversation between colleagues; never the person who wrote it. That is the club's server (`functions/`; the design is [`GOTSPORT.md`](GOTSPORT.md), *Push notifications* and *The server*), set up once as **Deploying the server** below says, plus two things:

1. **Rules version 7**, which adds `pushTokens` (each person's phones, readable and writable by that account alone).
2. **The web push key** in `firebase-config.js` as `window.SOCCER_PUSH_KEY`: Firebase console → Project settings → **Cloud Messaging** → *Web Push certificates* → **Generate key pair**. Public, not a secret. The app offers notifications as soon as it is set, so set it once the server is deployed.

Then **each person turns it on, on each phone:** Settings → **Notifications on this phone** → *Turn on* (Messages offers it too). Parents, players, trackers and coaches alike: it is their own phone, so it needs no role.
- **iPhone and iPad** (iOS 16.4 or later) deliver notifications only to a site added to the Home Screen: in Safari, **Share → Add to Home Screen**, open Minutes from the new icon, and turn it on there. The app says so when it is opened in a browser tab.
- **Android** and computers: any browser that supports web push, straight from the page.

Each person can also turn off a whole kind (messages, team notices, games and practices, club activity) under **What notifies you**, on the Notifications screen or in Settings: no pop-up, no buzz and no push for it on any of her phones, though it still waits on Messages or under the bell. It is kept at `people/{uid}/mute/{kind}`, readable and writable by her alone (rules version 10), and the server reads it before it pushes.

**Calendar changes too** (build 105): a game or practice in the next two weeks called off, back on, moved, or newly added reaches everyone on that team: *Cancelled: U11 Storm: Practice*, *Moved: U11 Storm v Northgate, now Sun 12 Oct 10am*. The same changes the app's own alerts say, and the same ones it doesn't: a new place or title, a deletion, anything further off (the subscribed calendar has those) or already past. A weekly practice added is one notification, not one a week. It says who made the change (*Thu 8 Oct 6pm · Jaz*), and she isn't told about her own. Every calendar change records who made it (rules version 8), and only the team's coaches and the club's admins can make one: the database refuses a tracker moving a game, as it already refused anyone else changing a practice.

**A game you follow too** (build 116): *Notify me* on a game's Live tab sends its goals, kick-off, the start of each later half, half time and full time to every phone you turned notifications on for, with Minutes closed: *Goal — U11 Storm*, *Ella · U11 Storm 2–1 Northgate*. The scorer is named the way the club's setting says (Club settings, names or shirt numbers): coaches, trackers, admins and her own family always see the name, other families only while the club shows names, and `#7` otherwise. A scorer added a moment after the goal updates the same notification rather than sending a second. Nothing is said about a game that ended or was played hours ago (a goal sent late from a phone with no signal, a game reopened). Following is kept at `follow/{code}/{game}/{uid}`, hers alone (rules version 14), only for a game of her club that hasn't ended, and the server clears it at full time.

**Training sessions and club activity too** (build 119): a family hears when her child's place is confirmed, put on the waiting list, moved off it, turned down or taken off, and when a session she is in is moved or called off; a coach hears families asking for, booking, waiting for, withdrawing from and cancelling her sessions and times; and the admins hear the club's activity as the bell lists it — a game or practice new, moved, called off, back on or deleted on any team (saying who deleted it), a session added or called off, a family booking a coach's time, and a coach calling out or taking time off. Families never hear club activity. *Games and practices* in **What notifies you** covers a family's and a coach's own sessions; *Club activity* covers the rest.

Signing out takes the phone's address down while still signed in, and deletes the browser's subscription, so a phone handed to someone else stops getting her messages. A push that still arrives for an account no longer signed in on the phone (signed out with no signal, say) is shown without its words. `node test/push.js` holds all of this, and who the server tells, for every kind of account.

If nothing arrives: check the functions' logs in the Firebase console (Functions → the function → Logs). A send refused for permission usually means the **Firebase Cloud Messaging API** is switched off for the project in Google Cloud's API library.

## Deploying the server

The club's server is Cloud Functions on the same Firebase project, in `functions/`: `pushNotice`, `pushMessage`, `pushEntry` and the `pushGame…` triggers (notifications), `calendar` (calendar sync), `mirrorEvents` and the `publish…` triggers, which write the share pages and the members' feed (the only thing that does: SECURITY.md, SEC-10), and the four `access…` triggers, which keep the lookup tables the rules read up to date the moment someone's role changes, and `myCalBuild` with the `myCal…` triggers, which build each person's My calendar feed (SERVER.md). Nothing to set up for any of these beyond deploying: they need no key and no setting. `myCalBuild` runs every five minutes on Cloud Scheduler, which the first deploy switches on for the project (the deploy key's **Service Usage Admin** role is what lets it); if that deploy says Cloud Scheduler is not enabled, enable **Cloud Scheduler API** in Google Cloud's API library and deploy again. `.github/workflows/server.yml` tests and deploys them whenever they change on main, as the site deploys itself. Set up once:

1. **Pay-as-you-go (Blaze).** Firebase console → the project → **Upgrade** at the bottom left → **Blaze**, with a card. Cloud Functions need it; at one club's volume the expected bill is nothing, inside the free allowance, but check Firebase's current pricing before telling anyone a number. Then Google Cloud console → **Billing → Budgets & alerts** → a budget of a few dollars, so anything unexpected emails you.
2. **A deploy key for GitHub.** Google Cloud console, this project → **IAM & Admin → Service Accounts → Create service account** (`github-deployer`), with four roles: **Editor**, **Service Account User** (it deploys functions that run as the project's own account), **Service Usage Admin** (a first deploy switches on the Google services functions need) and **Cloud Functions Admin** (the calendar feed is a public function, since a calendar app asks with no account, and making one public takes it). Open it → **Keys → Add key → JSON**. On GitHub: the repository → **Settings → Secrets and variables → Actions → New repository secret**, named `FIREBASE_SERVICE_ACCOUNT`, the whole file as its value. Delete the file.
3. **Once, as the project's Owner: let Google's own accounts deliver database events.** The first functions deploy needs three grants to Google's service agents, which a deploy key rightly cannot make. In the Google Cloud console, open Cloud Shell (**>_** at the top right) and run these, with your project id and number (Project settings shows both; the deploy's log prints the exact lines if they are missing):
   ```
   gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:service-PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator
   gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com --role=roles/run.invoker
   gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com --role=roles/eventarc.eventReceiver
   ```
   Or IAM → **Grant access** for each, with the same accounts and roles (Service Account Token Creator, Cloud Run Invoker, Eventarc Event Receiver). Never give the deploy key the power to grant roles itself: a leaked key could then grant itself anything.
4. **Merge to main**, or **Actions → Deploy the server → Run workflow**. The first deploy takes several minutes while Google switches on what functions need; if it fails at that stage, run it once more.

If a deploy fails on permissions, the message names what is missing; add the role to `github-deployer` (IAM & Admin → IAM → its pencil → Add another role) and run it again:
- *Permission denied to get service [cloudfunctions.googleapis.com]*: **Service Usage Admin**.
- *You must have permission iam.serviceAccounts.ActAs*: **Service Account User**.
- *Failed to list functions*: **Editor** is missing, or (seconds after "Enabling now…") the services Google just switched on are not answering yet, so run it again in a minute or two.
- *We failed to modify the IAM policy for the project*: step 3 above has not been done.
- *The permission cloudfunctions.functions.setIamPolicy is required to deploy … calendar*: **Cloud Functions Admin**.
- *Permission denied while using the Eventarc Service Agent … Retry the deployment in a few minutes*: nothing missing; the very first deploy of database-triggered functions waits on Google. Run it again after five minutes.

**The site's address, for calendar links.** An entry in a subscribed calendar links back into the app (a game to its page, a practice to the team's calendar, My calendar's entries to My calendar), and the server cannot know where the site is, so `functions/.env` says: `SOCCER_SITE=https://dawsboss.github.io/soccer-manager-/index.html`. It is committed (it is not a secret) and loaded on every deploy. If the site moves (a custom domain), change it there; `test/mirror.js` holds it to an `https` address ending `index.html`.

**Share pages need the functions.** Since build 120 phones never write `public/` and the rules refuse it (version 19): a club whose functions are not deployed has share links that never fill in.

Without the secret the workflow says so and deploys nothing. From a computer instead: `npm install -g firebase-tools`, `firebase login`, `(cd functions && npm ci)`, `firebase deploy --only functions`.

**The rules go the same way.** A merge that changes `database.rules.json` publishes it, after every suite (`test/rules.js` among them) has passed, and then reads the live version back (`tools/live-rules.js`), so a green run means the club is on it. *Run workflow* with **rules** ticked publishes them by hand. The rules apply to every club in the database at once, so a change to them gets the same care in review as any other; pasting them in the console still works too.

If a notification never arrives: the functions' logs are in the Firebase console (Functions → the function → Logs). A send refused for permission usually means the **Firebase Cloud Messaging API** is switched off for the project in Google Cloud's API library.

## Deleting a club

Every device that ever opened a club keeps a full local copy so the app works offline at a field with no signal. That copy is a **cache, not an archive**, and three things end it:

- **Retired** — an admin marks the club closed. Every device clears its local copy, the app owner's included. The data stays in the database and the app owner reopens it from the archive whenever. Retiring deletes nothing.
- **Access withdrawn** — the rules refuse a device for more than 24 hours. The delay is deliberate: a botched rules change would otherwise wipe a coach's offline copy before anyone noticed.
What this does not cover, and nothing can: a copy someone deliberately exported. That is true of every app that works offline. What it does mean is that the default is self-cleaning rather than a roster of children sitting on a stranger's phone forever.

Someone who wants a record of a season should take one with **Download a copy**, deliberately. A stale cache is not a keepsake and should not be treated as one.

There is no in-app delete for a whole club, deliberately — it would be one mistap from wiping a season. It is four places, in this order:

0. **Retire it.** Club settings → *Retire this club*. Do this **first**: it writes the marker that tells other devices to let go. Nothing is deleted — the app owner sees retired clubs listed under Club settings and can still open and export any of them, indefinitely. Steps 2 and 3 only happen when the app owner decides.
1. **Export first.** Open the club, Settings → *Download a copy*. Do this even for a club you are sure is empty.
2. **Delete the data.** Firebase console → Realtime Database → Data → expand `workspaces` → hover the code → the **×** deletes that node and every team, game and minute under it.
3. **Delete its published mirror.** Under `public`, find the share id that club was using and delete that node too. **This is the one people forget.** Removing `workspaces/<code>` does not touch `public/<share>`, and the mirror is the world-readable half — an orphaned one keeps serving an old scoreboard to anyone holding the link. If you no longer know which share id belonged to which club, the mirror carries the team name, so open the nodes and read it.
4. **Forget it on each device.** Club crumb → *Forget*. That clears this browser's local copy so it stops appearing in the switcher. It is per-device, so do it on each phone.

Steps 2 and 3 are permanent and there is no undo, which is why step 1 comes first.

Retirement needs its own block. It is already part of the ruleset (**The database rules** below) — this is here to explain it, not to paste separately:

```json
"retired": {
  "$code": {
    ".read": true,
    ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() && (!root.child('workspaces/' + $code + '/access/owners').exists() || root.child('workspaces/' + $code + '/access/owners/' + auth.uid).exists())"
  }
}
```

Readable by anyone, because a device that has just lost access still has to be able to learn that it should let go. Writable only by an admin of that club, and once the club has an owner (**The club owner**, below), only by an owner.

## Becoming the app owner

The app owner is the one account that can appoint the first club admin. It is stored in the database, **not** in this repository — a personal email committed to a public repo gets scraped, stays in the history forever, and needs a deploy to change.

1. Sign in to the app. Settings → Account shows **Your account id** with a copy button.
2. Firebase console → Realtime Database → Data. At the **root** (not inside `workspaces`), add:

```json
"appOwners": { "<paste your account id>": true }
```

3. The rules keep it readable but never writable from the app. This is already part of the ruleset (**The database rules** below); shown here so you can see what guards it:

```json
"appOwners": { ".read": "auth != null", ".write": false }
```

Console-only by design. There is no bootstrap race and no button anyone could press to grant themselves ownership — changing it means having Firebase console access, which is the correct bar.

## The club owner

Any admin could once take every other admin away and have the club to herself. A club owner is the one the rules can tell apart (SECURITY.md, SEC-D8):

- **Only an owner takes an admin away**, or retires the club. Admins still appoint admins and can step down themselves.
- **Owners are admins too**, and there can be several. An owner makes another admin an owner from People (tap the person → *Club owner*), and steps down the same way once someone else owns it; nobody can take an owner's place from her.
- **Whoever starts a club owns it.** A club from before this has no owner, and works exactly as before until one of its admins taps **Become the club owner** under Club settings → People. Do it the day rules version 13 is published, before anyone else does; every admin is told who claimed it.
- **Everyone who runs the club hears about every change.** Each admin or owner given or taken away is pushed to every admin and owner (the person it happened to included, and never whoever did it), naming who did it from the club's log, and kept at `clubAudit/{code}`. It cannot be muted. It needs the functions deployed, like every other notification.

What an owner does not stop: an admin can still delete teams and games. The way back from that is the database's daily backups (SECURITY.md, SEC-7).

## The database rules

**One file, for every club: [`database.rules.json`](database.rules.json).
Paste the whole file as it stands**, whenever it changes. It already includes
the `retired` and `appOwners` blocks shown earlier in this file; those appear
there to explain what they are for, not to be pasted on their own. Publishing
a partial ruleset is how a club ends up half protected.

**It is built, not typed.** While clubs move from `workspaces/{code}` to
`orgs/{code}` (AUTH.md, *The move to `orgs/{orgId}`*), every rule that looks
into a club has to ask whichever tree that club is on, about two hundred
lookups. So the rules you edit are **`tools/rules-source.json`**, written
against `workspaces/` as they always were, with the new `orgs/$code` tree
beside it; `node tools/rules-build.js` writes `database.rules.json` from it,
turning each lookup into "the old tree while the club is there, the new one
once it has moved". `node test/rules.js` fails if the two disagree, and
walks every check twice, once with the club on each tree. Once every club has
moved, the old tree comes out and the source is the published file again.

- **`orgs/$code`** has no read of its own: each part says who reads it. The
  teams, games, answers, the roster (shirt numbers, and names only while the
  club opens the roster), staff names (`names`), the club's settings (`org`)
  and the lookup tables are the whole club's. The squad (`squad/$tid`, every
  child's record) is that team's coaches and trackers, every coach in the
  club and the admins; a family reads her own child's record and a player
  her own, one at a time. Members' emails are the admins' and coaches', each
  person's own entry hers; the access log is the admins'. A player record
  under a team is refused, so names cannot creep back into the part
  everyone reads. **The coach's notes** on a child (her note, rating, and
  who to pair her with or keep her apart from) are not on her record but
  beside it, at `coachNotes/$tid/$pid`: read by coaches and admins only (not
  trackers, not her family, not the player), written by that team's coaches
  and admins, and refused on the record itself (rules version 15; SECURITY.md,
  SEC-D10).
- **One tree per club.** Nobody can start `orgs/{code}` while the old tree
  holds that code, nor start the old tree again under a code that has moved
  (`workspaces/{code}/moved`, written by the server alone): every root rule
  decides which tree to read by whether `orgs/{code}/access` exists, so
  making it exist would be taking the club over.

**There is no second, open set.** Rules belong to the database, not to a club,
so whatever is published applies to every club in it at once, and this site
is for any club that turns up. A brand-new club is made under the same rules
an established one runs on: while a club's code has no admin and no index, a
signed-in account may claim admin of it and put itself in its index, and from
that moment the club is closed to everyone it hasn't let in. `node test/rules.js`
walks a new club through exactly that, alongside the established ones.

A file rather than a block here because a ruleset copied out of prose is one
stray brace from being refused, and because a file shows exactly what changed
in a commit. `node test/rules.js` reads *these files* and checks them; it also
fails if a whole ruleset reappears in this README, since a second copy is the
one that drifts. Run it first.

**It is safe to paste before the app has caught up.** A lookup table makes the
per-team rules possible — `access/teamIndex` — and it does not exist on a club
that predates it. So each of those rules carries a clause that falls back to
the old club-wide behaviour *while its table is missing*, and stops doing so
the moment the table appears. Nothing to sequence, and no way to lock the club
out by pasting early. (`shareOwners/{shareId}` was the other, for the share
pages; since rules version 19 only the server writes those, and it is gone.)

The app fills it in by itself: an admin's device writes `teamIndex` on its
next connect. **Club
settings → Check readiness** shows whether that has happened. Until every line
there has a tick, the club is protected but not yet *tightly* — a tracker or
a parent can still write another team's data, exactly as before.

**[`database.rules.json`](database.rules.json)** is the whole ruleset. On a phone: open it on GitHub, tap **Raw**, select all, copy, and paste it over everything in Realtime Database → Rules, then **Publish**. From a computer with the Firebase CLI signed in, `firebase deploy --only database` publishes the same file (`firebase.json` points at it) — the console is fine, and is what this README assumes.

**Which version is published?** The rules carry a version number, and the
app carries the one it was built for. An admin's phone asks the database
each session; if the published rules are older, every screen says so (and
*Club settings → Check readiness* has a cross), instead of each feature
quietly saying *saved on this phone only*. From a computer,
`node tools/live-rules.js` asks the live database the same question and
prints the published version beside this checkout's.

What each part is doing:

- **`rulesVersion`** is the number above. Anyone may write it, signed in or
  not, but only the one number these rules are, so the write is a question
  only the published rules can answer, and the only write that can succeed
  changes nothing. Whoever changes the rules raises it (in
  `tools/rules-source.json`, and `RULES_VERSION` in `app.js`), builds, and
  stamps; `node test/rules.js` fails until they do.
- **Reading anything** needs a signed-in account listed in `access/index`. The `!data.child('access/index').exists()` clause is the bootstrap: a brand-new workspace with no index yet stays readable, so it can be set up in the first place. It stops mattering the moment the first role is granted.
- **`access/members/$uid`** is self-writable. That is how a new coach knocks on the door: they sign in, register themselves, and an admin can then see them to assign a role. It grants no data access on its own. Somebody else's entry is an admin's to change (rules version 11): names on sessions, People and bookable times come from it, so a parent could otherwise rename a coach. A coach of any team (`access/coachIndex`) may only fill in an entry that is not there yet, which is all approving a family through the team link does; while a club has no `coachIndex`, anyone in it may fill in a missing one, and nobody but her or an admin changes one already there.
- **`admins`** can only be changed by an existing admin — except when there are none, which is the bootstrap for claiming it. Once the club has an owner (rules version 13, **The club owner** below), the rule sits on each entry instead: an admin may appoint another (`true`) and step down herself, and only an owner takes anyone else's admin away, never another owner's.
- **`owners`** is who owns the club: always admins. The first owner is claimed by an admin while the club has none; after that only an owner makes another one, and each owner steps down only herself.
- **`index`** is the flat lookup the read rule uses. Rules cannot iterate, so it cannot walk every team asking whether you are in it; the app mirrors every role grant into this one node. Once the club has an owner, an admin cannot take another admin's entry out (which would shut her out of the club while leaving her an admin on paper); an owner can, except another owner's.
- **`clubAudit/$code`** is the server's record of every admin and owner given or taken away. Admins of the club read it; no phone writes it.
- **`access/org`** is the club name and badge, so it follows the admin rule.
- **`access/log`** is the audit trail. Writes are allowed only where nothing exists yet and the entry stamps the author's own uid, which makes it append-only: nobody can edit or delete a record of what they did, including an admin.
- **`invites/$id`** is the invite itself. Readable by any signed-in account that knows the id — the id is the secret, and nobody can list the node. Only an admin of the club it names can create one; it cannot be edited, only spent or deleted. **`used`** can be written once, by whoever spends it, before it expires, and only by the address it was sent to if it names one (verified addresses only).
- **The role an invite grants** is written by the person accepting it, each write checked against the spent invite: `access/teams/$tid/coaches|trackers/$uid`, or `teams/$tid/players/$pid/guardians/$uid` for a parent, then `access/index/$uid`. The value written is the invite id, because that is what the rule looks up. Exactly the role the invite names, on the team it names, for the account that spent it, and only until it expires.
- **`access/teamIndex/$tid/$uid`** can also be written by that account itself, as `coach` or `tracker`, only if it really is on that team in `access/teams` — and never as the first entry of a missing table, because that would close the bridge on everyone else in one write.
- **`access/coachIndex/$uid`** names one team the account coaches. It is the third flat lookup table, after `index` and `teamIndex`, and answers "is this a coach of *any* team?" for the training bridge below. Like the others it is derived: an admin's device writes everyone's, and a coach's own device may write her own entry, but only naming a team she really coaches. Unlike `teamIndex`, she may write it into a missing table, because there is no fallback for her write to close on anyone else.
- **`training/$code/practices/$tid`** is a team's practice plans: readable and writable by that team's coaches (`teamIndex` says `coach`) and the club's admins, one plan per write. A plan names its own id and team and nothing more is required: it is keyed by its calendar practice's id and takes its day from there (an older app's plan with its own date is still accepted). Parents and trackers never read them. There is no `.read` on `training/$code` itself, because a read granted there could not be taken back lower down. While `teamIndex` is missing, the fallback is any coach in `coachIndex`, never the whole club, so this bridge **fails closed**: practices have no older behaviour to preserve, and failing open would show parents the plans.
- **`training/$code/schedule/$tid`** was when and where each practice is, without the plan. The app no longer writes or reads it (parents get the time and place from the calendar); the rule stays until no older app in the wild still writes it, and can then be removed.
- **`training/$code/away/$uid/$id`** is a coach's time off: a weekly block, dates away, or calling out of one entry or session. Coaches (in `coachIndex`) and admins read it, never trackers or parents; anyone reads her own. A coach writes only her own, in her own name (`by`), and an admin anyone's; `kind` is `weekly`, `dates` or `callout`, and a note is at most 80 characters.
- **`training/$code/templates/$id`** and **`userLibrary/$uid/templates/$id`** are practice templates, under exactly the rules of the club's drills and a coach's own.
- **`training/$code/sessions/$sid`** is a training session (a 1-1 or a small group, belonging to no team). The whole club reads them. A coach (in `coachIndex`) makes one in her own name and changes or deletes only those that name her; she can't hand one to someone else. An admin makes, moves and deletes any. With no `coachIndex` yet, only admins can: the bridge fails closed, as practices' does.
- **`training/$code/booked/$sid/$pid`** is one player's place in a session. The club reads them, as it does `rsvp`. The session's coach and the admins write anything. A family writes only for a child whose `guardians` holds her uid, in her own name, without changing the team the booking names, and only `asked` (while the session is open, and not after the coach has answered) or `out` (withdrawing, any time). **A family can never give herself a place**: a rule cannot count spots, so the coach keeps the count and only she or an admin says `in`.
- **`training/$code/avail/$bid`** is one coach's bookable times on one date: 1-1s or a small group. The club reads them. A coach (in `coachIndex`) writes her own and only her own, as with sessions; an admin writes anyone's. A start and an end as `HH:MM`, a slot length of 15–240 minutes, one place for a 1-1 and up to 60 for a group, a price of nothing or more, and `day0`, the coach's phone's midnight that day, so the server can tell when each slot starts.
- **A family books a slot by asking the server** (rules version 18): `bookAsks/$code/$uid/$id`, readable and writable by that account alone, an ask in her own name in a club she is in, stamped within ten minutes of now (a phone's clock can be out), which she deletes once answered and never answers herself. The server (`functions/book.js`) checks her child, the coach's calendar and the places inside a transaction, and writes the session and the booking; a full slot has a waiting list. A family never writes a slot's session or booking; on an ordinary session she still asks and withdraws. There are no seats any more.
- **`training/$code/came/$sid`** is a session's register: the session's coach or an admin writes it, the club reads it.
- **`training/$code/fees/$sid/$pid`** is what was paid for one place. Money, so narrowed by the rules themselves: admins read them all, the session's coach reads and writes her own sessions', and a family reads her own child's. Nobody else reads one.
- **`training/$code/packs/$tid/$pid/$id`** is a package of sessions sold to one player. Only admins write one: at most 100 places, a kind of `any`, `one` or `group`, an optional use-by date. Admins and coaches (in `coachIndex`) read them all, because the coach marking a place needs to know what is left; a family reads her own child's. **`packuse/$tid/$pid/$id/$sid`** is one place used: written by the session's coach or an admin, only for a package that exists, read like the packages. A rule cannot count, so it cannot refuse an eleventh place on a ten-place package; the app counts, as it counts spots. A fee marked `package` must name a package that exists for that child.
- **`training/$code/pay/$uid`** is a coach's pay rate. Admins read and set them; each coach reads her own.
- **`training/$code/splans/$sid`** is a session's drills: its coach and the admins only, like a practice plan.
- **`training/$code/drills/$id`** is the club's shelf of drills. Admins and anyone in `coachIndex` read it; trackers and parents never do, and with no `coachIndex` only admins do (it **fails closed**, like practices). A coach writes a drill stamped `by` herself for a `team` whose coach list (`access/teams/{team}/coaches`) names her, and edits or removes it only while that is still true; admins edit or remove any. The check reads the team's own coach list rather than `teamIndex`, so sharing works in a club that hasn't built its lookup tables yet, with no bridge. A drill needs a name of 1–80 characters, and every link in `media` must start with `https://`. **`training/$code/templates/$id`** follows the same rules, ready for templates.
- **`userLibrary/$uid`** is one person's own drills and templates, whichever club she is in. She reads and writes it, one drill at a time, under `drills` or `templates` only. The app owner (`appOwners`) may read it, for support, and never write it. No club admin has any clause here: a coach in two clubs would have two sets of admins, and the library is hers.
- **`follow/$code/$game/$uid`** is one person following one game (the Live tab's *Notify me*), so the server can send its goals to a closed phone. She writes and reads only her own, only while she is in that club (its index or its admins) and only for a game that exists and hasn't ended; she can always take it away. Nobody lists who follows a game; the server reads it with admin credentials and clears it at full time.
- **`people/$uid`** is one person's calendar across every club she is in (`AVAILABILITY.md`, *My calendar is yours, not a club's*). Her phone reads her other clubs itself, so nothing about a club is stored here. **`set`** is whether she shares her busy times, and the id of her calendar feed if she has turned one on, readable and writable by her alone. **`busy/$tag`** is those busy times, one entry per club under a one-way tag of its code: a date, a start and an end, and the rule refuses any other field (no title, no place, no club). Anyone signed in reads them, and they can only be written while her own `set/share` is `true`, so a calendar is private until she says otherwise, and turning it off deletes them.
- **`clubInvites/$code`** is the admin's list, readable only by admins. It lives outside the workspace on purpose: everyone indexed can read the whole workspace, and a list of unspent coach invites in a parent's hands is a parent who can make herself a coach.
- **`userOrgs/$uid`** is which clubs an account belongs to, so a second device finds them without a code. Only its owner reads it. It is a list of bookmarks, not a grant: reading a club is still `access/index`'s decision.
- **`rsvp/$tid/$item/$pid`** is who is coming: one answer per child per game or calendar entry. A parent may write it for a child whose `guardians` list holds her uid, a coach for anyone on her team, an admin for anyone, and each answer must be stamped with the writer's own uid. It is a node of its own, not part of the game or the team, so the one thing this rule hands a parent is her own child's answer. An answer is `yes`, `no` or `maybe`, an optional note of at most 140 characters, and nothing else. Until this block is published, parents' answers are refused and the app says so.
- **`public/$share`** stays world-readable — that is the whole point of the parent links — and nobody writes it: the server builds every page with admin credentials (rules version 19, SECURITY.md, SEC-10). That closes the hole where any signed-in account could make a page under an id no club had claimed, and `shareOwners` went with it.
- **`joinCodes/$jc`** is a team link: club, team, and the names shown on it. Readable by id only, like an invite; made and retired by that team's coach or an admin, never edited. It grants nothing on its own.
- **`claims/$ws/$tid/$uid`** is a parent's request through that link — a shirt number and optionally the child's first name. Only its author writes it, only with a live link to that team, and never with an approval in it. **`approved`** is written by that team's coach or an admin, once, in their own name; they can also delete a request to turn it down. The author and the team's coaches and admins read it.
- **`access/index/$uid`** gains one clause for the team link: a team's coach may write it for someone whose request to *her* team she approved, with that team's id as the value. A coach still cannot let in anyone who did not ask.
- **`access/teamParents/$tid/$uid`** is the parent list for one team, and the third lookup table for the same reason as the other two: a rule cannot walk the squad to ask whether someone is a guardian. Its value is a player id, and a write is only accepted if that player really lists that account in `guardians` — so the list can never say more than the squad does. A parent adds herself when she accepts an invite; the team's coach or an admin keeps it in step. Only an admin may create the table, because its first entry closes the bridge below on every team at once, and the app does that by itself on an admin's next connect.
- **`access/teamPlayers/$tid/$uid`** is the same for a player with her own sign-in: its value is her player id, accepted only if that player's `self` lists her. It lets her read the team's notices, and it is how the `dm` rule finds her family: she may read and write in the conversation of any account in her player record's `guardians`, and never starts one of her own. **`teams/$tid/players/$pid/self/$uid`** is written by spending a `player` invite, exactly as `guardians` is by a parent invite; a `player` invite may be made by that team's coach (in `teamIndex`) as well as an admin, and she may list it on `clubInvites` for the admins. `rsvp` accepts her answer for her own player.
- **`board/$code/$tid`** is a team's notices. Readable by that team's families (`teamParents`), coaches and trackers (`teamIndex`), and the admins — not by the rest of the club. While `teamParents` does not exist yet, it falls back to anyone indexed in the club, so pasting this locks nobody out. That team's coaches and the admins post, each in their own name, and only the author or an admin deletes one. **`seen/$uid`** is each reader's own tick, which is how a coach sees who has not read it.
- **`dm/$code/$tid/$fam`** is one family's conversation with that team's coaches. That family (if it is on the team's parent list, club-wide while the list is missing), the team's coaches and the admins can write in it, so either side can start it. Readable by that family, the team's coaches and the admins — no one coach alone, and no other family. Messages are append-only: nobody edits or deletes one, admins included. There is no bridge for a club without `teamIndex`: these are new nodes, so failing closed locks nobody out of anything, and until an admin's device has written the table only admins can read or post.
- **`dm/$code/$tid/$fam/got/$uid`** sits beside `seen/$uid`, under the same rule: each reader's phone saying it has the conversation up to then, which is the *delivered* tick.
- **`staffdm/$code/$a~$b`** is two colleagues' conversation, the two uids sorted. Readable and writable by those two only (the id must begin or end with your own uid beside the `~`), and only while you are an admin or on `coachIndex`. Admins don't read other people's. Append-only, with its own `seen` and `got`. Nobody can read `staffdm/$code` as a list; each phone asks for each pair.

### A database still on the old open rules

Clubs used to start on a second, open ruleset and be "locked down" later. If
your database still runs those, any club in it whose data went in before anyone
held a role needs its roles set up **before** you publish `database.rules.json`,
or it opens fine and refuses every change. Once, in this order:

1. **Back up.** Setup → *Download a copy*.
2. **Sign in** on your own device. Setup → Account.
3. **Claim admin.** Setup → People → *Make me the admin*.
4. **Invite every coach** — People → *Invite someone*, one link each. Accepting one signs them in, connects their device and gives them the role, so they appear in People already assigned.
5. **Give a role to anyone who arrived another way** — Coach or Tracker, in People.
6. **Check readiness.** Club settings → *Check readiness* tells you whether you are in the index, how many accounts are, and whether an app owner exists. An empty `access/index` is the dangerous case: reads still work through the bootstrap clause, but nobody can write anything, so the app goes read-only for the whole club.
7. **Then** paste `database.rules.json` and publish, and **test on two devices** before the next game.

After that there is nothing to move again: every new club starts under the
same rules.

### If it goes wrong

Paste the previous version of `database.rules.json` back in and publish — on
GitHub, open the file's **History**, pick the commit before the change, tap
**Raw**. Access returns immediately; nothing is lost. The app also detects the
refusal and shows a sign-in screen with a way to change account or club rather
than a broken page.

### What is still not enforced

Per-team roles. Any indexed person can currently write any team's data — the index is workspace-wide, not per-team. A tracker's restrictions are enforced in the interface only. Tightening that needs a per-team index (`access/teamIndex/{teamId}/{uid}`) and is the next step, not this one.

## Trying auth changes without risking the season

Three things, in increasing order of isolation. Use the cheapest one that covers
what you are changing.

### 1. `node test/rules.js` — the rules, offline

Reads `database.rules.json` and evaluates it against a mock club for a
signed-out visitor, an admin, a coach, a tracker, a parent, a registered account
with no role, an unknown account and the app owner. No Firebase, no cost, and
nothing to publish. **Run it before pasting anything into the console.** It is
the only way to find out that a rules change locks everybody out *before* it
does, because the failure **A database still on the old open rules** warns about is silent: reads keep
working through the bootstrap clause while every write is refused.

It also prints, at the end, the places where the interface and the rules
currently disagree. Those are known and deliberate; read them before deciding a
refused write is a bug.

### 2. A test club — the flows, on invented data

**Setup → Club → Make a test club** (app owner only). Seeds a club called
Sandbox FC: two squads, invented names, four games with one in progress, and
three people waiting in `access/members` with no roles yet. That is exactly the
state a club moving off the old open rules is in (the steps above), so you can rehearse
all of them — claim admin, grant and withdraw roles, check readiness, get
refused, retire it — on data nobody cares about.

A test club carries a warm banner on every screen, and **the server never
publishes it** (nor makes its game links), so a seeded game can never overwrite
a `public/` node that real families are reading. It lives in whichever database you are pointed at, under a
code beginning `test-`; delete the node in the console when you are done.

What it does **not** cover is a rules change. Rules belong to a database, not to
a club: the locked-down block is written against `workspaces/$code`, so
publishing it to try it on a test club applies it to the real club at the same
instant. Nor can you carve a stricter sandbox out of an open wildcard — a rule
grants, and nothing below it can take that back.

### 3. A second database — everything, including rules

**Setup → Club → Database** switches which Firebase database the app talks
to. Declare them in `firebase-config.js`:

```js
window.SOCCER_FIREBASE_ENVS = {
  sandbox: { databaseURL: "https://your-project-sandbox.firebaseio.com" }
};
```

An entry overrides only the keys it names.

- **A second Realtime Database in the same project** needs a `databaseURL` and
  nothing else. It has **its own rules**, which is the point, and keeps the same
  Auth, so accounts and uids carry over and you can rehearse with the real
  people. Requires the Blaze plan — the free Spark plan allows one database.
- **A separate Firebase project** works on Spark, but needs the whole config
  object and has its own Auth. Different uids, so `appOwners` has to be set
  again in that project's console and everyone signs in afresh.

Each database keeps its own local copies on the device, so the same code opened
in two of them can never overwrite the other's. Switching reloads and forgets
the open code, because a club belongs to the database it lives in.

## The calendar

One calendar, and it is the person's, not a team's or a club's: the button up top with today's date on it opens it from anywhere, and its top row says **You › Calendar**. It is drawn as a calendar app draws one: **Schedule**, **Day**, **Week** and **Month**, *Today*, back and forward, the title opening a small month to jump to a date, and the **+** in the corner. On Day and Week each hour is a place to tap and add something then, things on at once sit side by side (past three, a *+2* opens the day), and a red line marks now; so does the Schedule, between what has started today and what hasn't, and the day listed under the month when it is today. Each team has its own colour where more than one is showing; with one team, games, practices and the rest each have theirs. What it shows is a choice made at the top: **My calendar**, or **All teams** for whoever can see more teams than her own, so a parent never has to choose. A team's Season has *{team} on the calendar*, which is All teams with that team alone ticked (or, for a parent, My calendar narrowed to that child). The ☰ beside the title has the finer choices: the teams in a tree by age group, her children and clubs on My calendar, and games, practices, other and training on or off; a dot on it says something is left out. A game opened from the Calendar goes back to it; one opened from a team's Season goes back there.

Games are read straight from the games themselves, so moving a kick-off on the game moves it on the calendar: a game being played sits on top and opens with one tap, and *Next up* has *Open the game*. A team's own list of games, played and to come, is on its Season. Practices and everything else (a team photo, a tournament, the end-of-season party) are added with the **+**, and each one decides who sees it:

- **The team** — everyone signed in with a role on it: coaches, trackers and parents. This is the default.
- **The team and the share link** — also on the season page you text to families. Anyone holding that link, and anyone it is forwarded to, can read it.

Practices default to the team only on purpose. A share link gets forwarded, and a practice is a predictable time and place where children are without the crowd a match brings. Games were already on the share link and still are.

**Repeating practices** are one entry per week, not a rule the app expands: *Every week* on Tuesday and Thursday until the end of term writes one entry for each session (up to 60 at once). Each can be moved or called off on its own; editing one asks whether to change *just this one* or *this and every later one*.

**Calling something off** keeps it on the calendar, struck through and marked Cancelled (or Postponed, for a game), on the share link too. Deleting is still there, but a deleted practice is one a parent may still turn up to.

**In your own calendar.** Once the club has set up **Calendar sync** (below), each team's Season (and All teams, for the teams ticked) has *Apple Calendar* and *Google Calendar* buttons, and *Copy the address* for Outlook. Subscribe once and the phone's calendar follows every change on its own: a moved kick-off, a called-off practice, a new tournament. A coach turns it on per team. The one most people want is on **My calendar** instead: one address for everything of theirs, every team and every club (below). Every entry also has *Directions* (a maps search for the venue as typed), and a one-off copy is still there for a phone that will not subscribe. Without sync set up, that copy is all there is: add it again if a time changes. Each entry has a fixed id, so calendars that go by id replace the earlier copy instead of doubling it.

**Who is coming.** On the calendar, a parent sees *Is Ella going?* with *Going*, *Not going* and *Maybe*, on *Next up* and on each entry's page, for each of their own children. Once they have answered there is room for a short note ("arriving late"). Tapping the answer again takes it back. The coach sees each entry's answers by name, with whoever has not answered at the top, can answer for a family that said so another way, and gets the count on every row.

**Answers go straight into the game.** A family's *not going* leaves that player out of the bench, the plan, the targets and the even split, with nothing for the coach to copy across. The Plan tab's *Who is coming* says who is out and why, who said maybe, and who has not answered; the Minutes list marks the maybes and the silent ones. The coach's word still wins either way: on the *Available* sheet she can have a "not going" play after all, or leave out someone whose family said nothing. Her choice is stored only where it differs from the family's, so a family that changes its mind still flows through unless she has decided otherwise. Once the game kicks off, answers close and the bench stays as it was.

**Attendance.** From the day of a practice or event onwards, its page has *Take attendance*: the squad, filled in from what families said ("not going" starts as missed, everyone else as came), a tap to change anyone, and *Everyone came*. Games need no register: a player came if she played, or was available on the bench. The Season tab's **Attendance** card (coaches only) lists every player with practices came to and missed, how many of those misses nobody warned about, and games, most missed first, and says how many past practices still have no register. A player's sheet carries the same line, and a parent sees her own child's under *My players*. Nothing is counted that did not happen: a called-off practice, a future one, or one with no register yet. Trackers and coaches of other teams see how many are coming, not who. Answers never reach the share link or the calendar feed, not even as a count. Answering needs the `rsvp` block in the locked-down rules (see **Locking it down**); the open rules already allow it.

**Names never reach the share link.** A note like "Ella's family on snacks", typed into a public entry or a game's notes, is published as "a player's family on snacks". The coach is told when that happens. Every word of every roster name is matched, so a venue that shares a word with a player's surname loses that word on the share page. That is the safe way round.

**For the other team.** The game's share sheet, and its calendar entry, have *Copy a message for the other team*, ready to text their coach: the fixture, kick-off, where with a directions link, what we wear, and the game link for the live score. Arrive-by is left out, because that time is for our families, not theirs. **A game link reaches that game and nothing else.** Each game is published under its own id, so whoever holds its link (the other team, or whoever they forward it to) cannot get from it to the season page, any other fixture or any practice. ROADMAP has the longer exploration of what opponents could see.

## Calendar sync

A calendar app subscribes to a web address and goes back to it on its own schedule, from its own servers, without running any of this app's JavaScript. A static site cannot answer that, so the club's server does: the `calendar` function in `functions/` (`functions/calendar.js`), deployed with the notifications (**Deploying the server**, below). It reads one node of `public/` (the same node a share page reads) and returns it as a calendar, and writes nothing. It runs on the server, but what it may read is exactly what the share pages can: an address is a plain id or it is refused before anything is read.

`firebase-config.js` names it as `window.SOCCER_CALENDAR_FEED` (`https://us-central1-<project>.cloudfunctions.net/calendar`). Until the functions are deployed that address answers nothing, so deploy before families subscribe; with it blank, the calendar offers a one-off copy instead. In the app, anyone signed in opens **My calendar → Turn on calendar sync** for their own, and a coach can turn on a team's from its Season.

(Until build 104 this was a Cloudflare Worker, pasted in by hand. It is retired: one server, deployed one way.)

Four addresses come out of it, all `https://<worker>/{id}.ics`:

- **My calendar's feed** (on My calendar, one per person, off until she turns it on): every game, practice, event, training session and bookable time on her My calendar, from every club her account is in, with **no child's name in it** (a booked session reads *Training: Finishing*, never whose; every typed title and place goes through the names of every player in that club) and no club's code (entries are keyed by a one-way hash). The id is kept at `people/{uid}/set/feed`; *Replace this address* and *Turn it off* take the old one down. **The server builds it** (`myCalBuild`, every five minutes, for the feeds something has changed in), from her roles in each club, so a change reaches it whether or not any phone of hers is open, and a team she is taken off leaves it. Where the functions are not deployed, her phone builds it instead, and a club's change reaches it once one of her phones has been open since (`SERVER.md`). This is the address families use.
- **The team's feed** (from the team's Season, shown to the team's coaches, trackers and the club's admins): every game and every entry, **team-only practices included**, because a subscribed calendar without practices is not the calendar. That means a team-only practice is published under this feed's id, world-readable by anyone who has the address, the same way the share link works. It holds no names, no players, no minutes and no answers. One address serves everyone who has it, so it cannot be taken back from one person: families are pointed at My calendar's feed instead, which is theirs alone, and a coach should **Replace this address** whenever someone who had it leaves the team (everyone else then subscribes again).
- **The season link's feed** (on the share page, for grandparents and friends): the games, and only the entries marked for the share link.
- **A game's own** feed (that one game). Nothing offers it, but the same function answers it.

How quickly a change arrives is up to the calendar app, not us. Apple and Outlook come back roughly hourly (the feed asks for that). Google refreshes subscribed calendars on its own schedule, often every several hours, and nothing a feed says changes that: a subscribed calendar has no way to be told there is something new. What is urgent (a game called off) is for notifications, not the calendar.

After any change to `ics.js`, run `node functions/make.js` to copy it into `functions/` (only that folder is uploaded), and deploy. `node test/calfeed.js` fails until the two match, so the feed and the app never describe a fixture differently.

Nothing about the calendar needed a rule change: entries live under `teams/{tid}/events/{eid}`, below the rule that already lets a team's coaches and the club's admins change the team, and nobody else. `node test/rules.js` pins that.

## Training sessions

1-1s and small groups that belong to no team: a coach offers a slot, books players from any team or leaves it open for families to ask, brings the drills (or plans around what the family said she wants to work on), takes the register, and marks who has paid. **Club → Training sessions.** The design, and why it is shaped the way it is, is [`SESSIONS.md`](SESSIONS.md).

- **Offering one.** *New session*: 1-1 or small group, when, which field, how many spots, an age range, a price, and whether families can ask. *Every week* makes one session per week, each its own, like weekly practices. Before saving, *Check for clashes* says if it is outside the field's permit, the field is full then, the coach is due somewhere else, or a booked player has a team practice or game at that time.
- **Getting players in.** The coach adds players from any team (*Add players*, a team at a time; past the number of spots they go on the waiting list), or a family asks from her own phone, with what her daughter wants to work on. Asks are listed first, with *Book*, *Waitlist* and *Not this time*. A family can withdraw at any time, and never gives herself a place.
- **What a family sees.** Her own children's sessions and how each stands, the open ones that suit their ages with how many spots are left, and what she owes. Never another child's name. Her children's confirmed sessions are on her Calendar and under *My players*, and in the file *Add what is coming up* makes.
- **Who came.** From the day of a session, its page has *Take the register*. It counts on the player's record as *Extra sessions 3 of 4*, beside her practices and games, on the Season tab and under *My players*. Only once taken, only for something that happened.
- **Fees.** A place owes the session's price once it is booked and the session is not called off; a withdrawal owes nothing. *Fees* lists what is not paid, by player, with *All paid* and *Remind the family* (email in Bcc, a copy, or their family conversation where you coach the team). Mark it paid by cash, card, bank transfer or other, or waive it. There are no card payments yet (they come with the server, [`GOTSPORT.md`](GOTSPORT.md)): this is the club's record of who has paid. A session with a payment on it can be called off but not deleted.
- **Packages**, if an admin turns them on (*Fees → Packages → Sell packages*): a number of sessions for a set price, for one player, for any session, 1-1s only or groups only, with an optional use-by date. The coach then marks a booked place *Package* instead of collecting for it, and it comes off the package that runs out first; *Not paid after all* puts it back, and a place withdrawn or called off after being taken off a package is listed with *Give the place back*. The family sees what she bought and what is left. Selling and changing them is admins'; what happens to places left at the use-by date is the club's call, and the list says when one ended with places unused. They need the `packs` and `packuse` blocks below.
- **Hours.** *Hours* is each coach's month: sessions run, hours, players, and, with a rate set by an admin (per hour or per session), what that comes to. *Copy as a table* for whoever does payroll. A coach sees only her own. Team practices aren't counted, because the app knows a team's coaches but not which of them ran it.
- **Fields.** Admins list the club's fields (**Club settings → Fields and permits**, or the *Fields* tab): address, how many pitches, surface, lights, notes, each pitch described on its own (name, grass, turf or indoor, lights, its own address when it's round the back on another street, and a description), and each permit's days, hours, dates and number. A field's page shows the next two weeks of everything on it, sessions and team practices and games, with whatever is outside the permit or double-booked flagged. A team entry is at a field when its venue contains the field's name ("Lakeside Park, field 2" is at "Lakeside Park"). When a venue or a session's place names a described pitch ("Lakeside Park, the turf"), Directions go to that pitch's address, its description shows on the entry, and two things on that one pitch at once are flagged. A new session offers the chosen field's pitches as chips. Venues typed on the calendar that match no field yet are offered as one-tap fields. Fields live under the club settings (`access/org/venues`), so they need no new rule.
- **Telling families.** *Tell the families* writes the message (when, where, what changed) and offers it in the app (into the family conversation, on teams where you are staff), by email in Bcc, or as a copy. Calling a session off opens it straight away. On screen, a family is told when her child's place is confirmed, waitlisted, turned down or taken off, and when her session is moved or called off; a coach is told when a family asks or withdraws. Like messages, this needs the page open: email is what reaches a closed phone.
- **Never on the share link.** Sessions are not on the season page, the game pages or the calendar feed. A 1-1 is a child, a time and a place.

### Bookable times

A coach says when she is free, for 1-1s or a small group, and families book a place themselves, with no back and forth. **Training sessions → Bookable times → Add times**: 1-1s or a small group (with how many places), a window (Tuesdays 5–7pm, say), the slot length (30, 45, 60 or 90 minutes), where, the price, an age range, how late a family can cancel, and *Every week* until a date. Each week is its own, so *Not this week* takes one off without touching the rest. A coach offers and changes her own times; an admin anyone's. The design is [`AVAILABILITY.md`](AVAILABILITY.md).

- **Synced with the teams' calendars.** A practice or game for any team the coach coaches, and any session she runs, takes out the slots it overlaps by itself: add a practice on Tuesday at six and six o'clock stops being offered. A slot that overlaps the child's own team practice isn't offered to her family either.
- **Booking.** A family sees *Book a time with a coach* on her Training sessions list, picks a free slot for her child (a group says how many places are left), says what she wants to work on, and the club's server books it in a second or two: no waiting for the coach to reply. It needs a signal, because it is first come, first served; if two families go for the last place at once the server lets one in and tells the other. A taken slot offers its **waiting list**: whoever asked first is moved in the moment a place comes free, and told. Booking needs the functions deployed (**Deploying the server**); without them nobody answers and her phone says so.
- **A booked slot is a session.** It shows on the coach's list, and everything sessions do (the register, fees, hours, clashes, notices, the player's record, the team calendar) works on it. The coach is told when a family books or cancels.
- **Cancelling.** The family cancels from the session's page, up to the notice the coach set (24 hours by default), and the place goes to the first on the waiting list, or back on offer. Later than that, she messages the coach, who can still take her off. A place on the waiting list can be given up any time.
- **The server holds families to it, not just the app.** A slot has to be on the coach's grid, not in the past, at a time she is free (her teams' calendars, her sessions, her time off and her busy times elsewhere, as they stand when the family asks), with the child free too, and no more children than places, counted in one transaction; cancelling has to be before her notice. A family cannot write a booking herself at all.
- **Never on the share link**, like sessions.

### My calendar

**My calendar** is what the Calendar opens on (also **Your account → My calendar**, or *Calendar* on Club home): the person's, not a team's or even a club's. Every team she coaches or tracks, every team a child of hers is on, the sessions she runs and her children's (and, for a coach, her players' sessions with other coaches), and the times she has offered — **in every club she is in**, each in its own colour and named, with a chip per club under *Calendars*. A parent of two, or a coach who is also a parent, can narrow it to one child or to her coaching. A parent has it and nothing else to choose. A team on its own, which is what the share link mirrors, is that team ticked alone on All teams.

- **A phone is in every club its account is in.** The club on screen is synced in full; every other one is listened to as well, read-only, for its teams, games, sessions and bookable times, and kept on the phone (cut down to her own children and the when and where) so My calendar has every club live, and with no signal says how old each one is.
- **Alerts from every club.** A message to you, or a game or practice of yours called off, moved, back on or new, in any of your clubs, pops up and then waits in a bar over whatever you're looking at (a game included) until you open or dismiss it. **Open** goes straight there, switching club if it has to. The bell counts every club's, and the inbox lists them under *From all your clubs*. Like all notifications here, it needs the page open; a closed phone hears nothing until there is a push server (`SERVER.md`).
- **In your own calendar.** *Turn on calendar sync* gives one address for all of it (Apple, Google, Outlook), with no names in it, not even her children's; *Add a one-off copy* works with no feed set up. See **Calendar sync**.
- **Private by default.** *Who sees your calendar* → **Share when I'm busy** lets the coaches and admins of her clubs see the times she is busy at another club — the times only, never what, where or which club — wherever the app asks who is free: find a time, the planner's clashes, covering a call-out, a session's clashes and her bookable slots. **People → Calendar** shows anyone's next fortnight as the club sees it. Families never see it. **Private** takes it all down. Sharing needs the `people` rule block published; until then it is refused and the screen says so. The other clubs on My calendar need nothing new.

Sessions need the `training` block's `sessions`, `booked`, `came`, `fees`, `pay`, `splans` and `avail` rules published, and the root `bookAsks` block for families booking a time, (and `packs` and `packuse` for packages) (**The database rules**). Until then they stay on the phone they were made on, the screen says *Some of this is on this phone only*, and a family's ask is refused and taken back off the screen with a message.

## How long share links last

**Forever, until you change them.** There is no expiry. A link keeps working as long as its share id exists.

Three things end one:

- **Rotate** — Share → *Make a new link and kill the old one*. Every link previously sent stops working immediately, the season link and every game's own link alike.
- **Retire the club** — the server stops updating the mirror, so it freezes at the last published state rather than going away.
- **Delete `public/<share>` in the console** — the link goes dead.

For a season that is usually what you want: text it in September, it works in May. If a family leaves mid-season, rotate and re-send to everyone else. An expiry date per link is worth adding when someone actually needs it — see ROADMAP.

## Sharing with parents

Setup → **Share with parents** creates a long random share id for the team and publishes a read-only mirror. Two links come out of it:

- **Season** — `live.html?t=<share>`. Text it once. It shows the season record, whatever game is happening now, what is coming up (every game, plus any practice or event marked for the share link), and every result. Each entry adds to a phone's calendar, and so does the whole of what is coming up.
- **One game** — `game.html?t=<gameShare>&g=<gameId>`. Kick-off time, venue, home or away, arrive-by, kit, notes, score, live clock, who is on, minutes played and the substitutions. Each game is published under its own id, so this link holds that game and nothing else: nobody can reach the season page from it. Game links made before this change carried the season link's id; *Make a new link and kill the old one* retires those.

Teams can carry a crest — Setup → Teams → tap the team → *Add a crest*. It is resized to 192px and re-encoded in the browser before saving, and it shows in the app header and at the top of the shared pages. It cannot appear in the text-message preview image, which is a fixed file; that needs the page rendered on the server, which would now be a function.

Both are reached from the share button beside the game bar, and both show the game you are currently looking at — switch games in the bar to share a different one. Setup is only where sharing is turned on and where links are rotated.

They are two separate HTML files purely so the text-message preview differs: `live.html` previews as *Follow the season* with `share-season.png`, `game.html` as *Match day* with `share-game.png`. Both load the same `live.js`.

**No child's name is ever published.** The mirror carries shirt numbers only — not names, not player ids. That is enforced by what gets written, not by what the page chooses to display, so there is nothing to find in the payload. *Rotate* makes a new share id and deletes the old node, which kills every link previously sent.

Link previews in text messages are scraped without running JavaScript, so each card is fixed at whatever its file's meta tags say. iMessage also freezes previews at send time, so a live-updating card in a message thread is not possible on any platform. Tapping through opens a page that does update by itself. If the score must appear in the preview itself, that needs the server to inject it (a function) — see ROADMAP.md.

## Hosting on GitHub Pages

Push the folder to a repo, then Settings → Pages → deploy from branch, root. The site is all static, so nothing else is needed for it (`functions/` is the server's, deployed to Firebase and left off the site). Add the site to the home screen on her phone and tablet for a full-screen launch, with its own icon (`manifest.webmanifest`); on an iPhone that is also what lets it get notifications.

## Data model

A club on the old tree, below. On `orgs/{code}` (AUTH.md, *The move to `orgs/{orgId}`*) the same records are split by who reads them: `teams/{teamId}` without `players`, which are `squad/{teamId}/{playerId}`; `access/members` and `access/org` and `access/log` are `members`, `org` and `log`; and two parts are derived for families, `roster/{teamId}/{playerId}` (`{ number, active, name? }`, the name only while the roster is open) and `names/{uid}` (`{ name }`, staff only). The app keeps the old shape in memory and translates every path (`clubPath()`).

```
rsvp/{teamId}/{g_matchId | e_eventId}/{playerId}   { v: 'yes' | 'no' | 'maybe', by, at, note }
teams/{teamId}        { id, name, share, calFeed,
                        attend: { eventId: { playerId: true | false } },   // the register: came or missed
                        events: { eventId: { id, kind: 'practice' | 'event', title, date, start, end,
                                             venue, notes, public, called, series, createdAt, by } },
                        formations: { fid: { id, name, size, slots[] } },
                        defaults:   { 11: fid, 9: fid, 7: fid, 5: fid },
                        players: { playerId: {
                          id, name, number, active,
                          rating, gk, maxStint, note,
                          preferred, canPlay[], anywhere,
                          pairs: { playerId: true }, avoid: { playerId: true } } } }
matches/{matchId}     { id, teamId, opponent, date, periodCount, periodMinutes, onFieldCount,
                        currentHalf, veoUrl,
                        home, arrive, kit, notes, called,   // 'home'|'away'|'neutral', 'HH:MM', text, text, 'cancelled'|'postponed'
                        share,                              // the game's own public id, for its game link
                        periods:   { n: { half, start, end } },   // epoch ms
                        planned:   { playerId: minutes },
                        kickoff, venue,
                        formation: { name, size, slots: [ { id, label, role, x, y } ] },  // a copy
                        positions: { playerId: { x, y, slot } },  // percent of pitch
                        stints:    { stintId: { pid, on, off } },  // seconds of elapsed match time
                        out:       { playerId: true | false },    // the coach's word; false = playing despite a "not going"
                        plan:      { blockMinutes, blocks: [ { start, ids[], assign } ], projected,
                                     manual, locked: { at, by, byName } },  // any rewrite unlocks
                        planDone:  { s{start}: { t, at, by, byName, made[], prev, pos, skipped } } }
```

Training sessions live outside the workspace, beside practice plans (`SESSIONS.md` says why):

```
training/{code}/sessions/{sid}      { id, kind: 'one' | 'group', title, focus, coach, coachName, date, start, end,
                                      field, place, cap, ages: [lo, hi], price, open, notes, series, called, by, at }
training/{code}/booked/{sid}/{pid}  { tid, st: 'asked' | 'in' | 'wait' | 'no' | 'out', by, at, want }
training/{code}/came/{sid}          { playerId: true | false }
training/{code}/fees/{sid}/{pid}    { paid, how: 'cash' | 'card' | 'transfer' | 'waived' | 'other' | 'package', pack?, at, by, byName }
training/{code}/packs/{tid}/{pid}/{id}
                                    { id, n, price, kind: 'any' | 'one' | 'group', until?, paid, how, note?, at, by, byName }
training/{code}/packuse/{tid}/{pid}/{id}/{sid}
                                    { by, at }                            // one place used; counted, since a rule can't
training/{code}/pay/{uid}           { rate, per: 'hour' | 'session' }
training/{code}/splans/{sid}        { blocks: [ { drill: { shelf, id, v }, name, minutes, note } ], by, at }
training/{code}/avail/{bid}         { id, coach, coachName, date, start, end, kind: 'one' | 'group', cap, title, len,
                                      field, place, price, ages, notice, note, series, off, by, at, day0 }   // one date each
training/{code}/sessions/k_{coach}_{date}_{HHMM}
                                    a slot a family booked: a session, plus { slot, t0, notice, pid, tid, by }
bookAsks/{code}/{uid}/{id}          { op: 'book' | 'cancel', block, start, sid, tid, pid, want, wait, at,
                                      answer: { ok, st, sid, why, at } }   // the answer is the server's
workspaces/{code}/access/org/venues/{fieldId}
                                    { id, name, address, pitches, surface, lights, notes, parts,
                                      permits: { id: { id, days: [0..6], start, end, from, until, ref, note } } }
workspaces/{code}/access/org/money  the currency sign, '$' by default
```

Stints are append-only events rather than running totals, which is what makes the Veo step realistic later: a timestamped sub log lines up directly with a recording's timeline, and positions over time are already the skeleton of a birds-eye reconstruction.

## Shapes are copied, never linked

When you create a game it takes a **copy** of the team's default shape for that side size. Editing or deleting a team shape afterwards has no effect on any game that already exists — last October's lineup stays exactly as it was played. The copy lives at `match.formation`, and nothing in the app ever resolves a game's shape by looking back at the team.

"Can go anywhere" is on for every new player, which means the planner treats her as a neutral fit everywhere and will not fight you over where she lines up. Turning it off, without listing positions she can play, is the only way to say "this player belongs in one place."

## How the planner decides

For each block it scores every available player by remaining planned minutes divided by remaining blocks, so whoever is furthest behind rises to the top. Rating breaks ties. A player at her stint cap is pushed to the bench for that block. Anyone in a *keep apart* pair is skipped if their counterpart is already in. When a player is picked, her partners get a scoring boost so pairings tend to land in the same block. If a block comes out much weaker than the squad average, the lowest-rated pick is swapped for the strongest eligible player on the bench. Once the XI is settled it is matched to the shape's spots by best fit: the keeper goes in goal, a player's best position beats a position she is only fine at, a player who can go anywhere is neutral, and whoever held a spot last block keeps it rather than rotating for no reason.

It is deliberately simple and readable rather than optimal — the projected-minutes list tells you what it cost. If two players can never play together, both will come in under their planned minutes, and the plan says so rather than hiding it.

## Published mirror

```
public/{shareId}     { team: { name },
                       record: { w, d, l, gf, ga },
                       events: { eventId: { kind, title, date, start, end, venue, notes, called } },  // public ones only
                       games: { gameId: { opponent, date, kickoff, venue, status,
                                          home, arrive, kit, notes, called,
                                          score, periods, currentHalf,
                                          players: [ { n, sec, on, spot, plan } ],   // n is a shirt number
                                          goals:   [ { t, side, n } ],
                                          log:     [ { t, on, off, move, spot } ],
                                          shots } } }
```

Two more kinds of node sit beside it, written on the same debounce but only when what they carry has changed:

```
public/{gameShare}   { team, link, fixture: gameId, games: { gameId: { ...as above } } }    // one game, nothing else
public/{calFeed}     { team, link, calendar: true,
                       games:  { gameId: { opponent, date, kickoff, venue, home, arrive, kit, notes, called, status, score } },
                       events: { eventId: { ...every entry, team-only included } } }      // no players, no numbers
```

Written by the coaches' app on a 1.2 second debounce. Read by `live.html`, which recomputes the clock from `periods` against Firebase's server time, so it ticks between pushes instead of waiting for one. The calendar feed (`functions/calendar.js`) reads the same nodes.

## Backup

Setup → *Download a copy* (admins) writes the whole club to one JSON file: teams, games, roles and fields, and under `training` the training sessions with their bookings, registers and fees, coaches' pay rates, practice plans and the club's drills. With a signal it asks the club for its own copy of those first and lays this phone's over it, so the file holds what the club has, not just what this phone happened to open; if part of it can't be asked about, the download says so.

*Load from a file* adds whatever the club is missing and keeps everything already there: teams, games, fields, and every training record. It never replaces the club wholesale and never touches who has access. A training record goes back only where the club has nothing at that place, so last month's backup can't overwrite this week's fees; before saying what it would do, it asks the club what it already has, and a record it can't check (no signal, or not an admin) is left out and listed rather than written blind. Backups from before training records were included still load.

**What is still owed is counted in one place.** The badge in the corner, the warning on every screen and *Not saved to the club yet* count everything on this phone that the club hasn't accepted: games and squads, and also practice plans, drills and training sessions. *Try again now* resends all of it. *Drop the refused ones* drops refused games, squads and training-session changes (the club's copy comes back in their place); refused practice plans and drills stay, and are retried, until the club takes them.

**A phone with no room left says so.** If the browser refuses to store a change because the phone's storage is full, the app says so straight away and on every screen until a save gets through again, because a change it couldn't keep would be gone when the app closes. Anything already sent to the club is safe.

## Bulk import

Admin → *Import from a spreadsheet or file* takes a season at once — teams, rosters, fixtures, past results, practices and the rest of the calendar, the club's fields with their permits, and training sessions — as CSV (what any spreadsheet, or the app you're moving from, saves as) or one JSON file, chosen or pasted. *Check it* shows what it will do and every problem, line by line, before anything is written; nothing is written while an error is left.

```json
{
  "teams": [{
    "name": "Lakeside Thunder G12",
    "birthYear": 2015,
    "players": [
      { "name": "Ada Lovelace", "number": 1, "gk": true },
      { "name": "Bea Smith", "number": 7, "position": "Forward", "also": ["Wing"], "rating": 4 },
      { "name": "Cleo Jones", "number": 10, "position": "Mid", "maxStint": 20, "note": "Strong left foot" }
    ],
    "games": [
      { "opponent": "Riverside", "date": "2026-09-06", "kickoff": "10:00", "venue": "Lakeside Park",
        "periods": 2, "minutes": 30, "side": 9, "score": "3-1", "scorers": [7, 7, 10] },
      { "opponent": "Northgate", "date": "2026-10-04", "kickoff": "09:30", "side": 9, "shape": "3-3-2" }
    ]
  }],
  "games": [
    { "team": "Lakeside Thunder G12", "opponent": "Hill End", "date": "2026-10-11" }
  ]
}
```

- **Only `name` (team, player) and `opponent` (game) are required.** Everything else is optional and defaults to what the app would give it by hand.
- **Team fields:** `birthYear` (`born` also works), which sets the age group. A team already here keeps the birth year it has.
- **Player fields:** `number`, `gk`, `position` (GK, Back, Mid, Wing, Forward — "defender", "striker" and the like are understood), `also` (a list of positions), `rating` (1–5), `maxStint` (minutes), `note`, `active`.
- **Game fields:** `date` (`2026-10-04`), `kickoff` (`09:30`), `venue`, `periods` (2 or 4), `minutes` (per period), `side` (5, 7, 9 or 11), `shape` (a preset like `4-3-3`, or a shape the team has saved), `veo`, and for a game already played `score` (`"3-1"`) with optional `scorers` (shirt numbers or names, one per goal).
- **Games can sit under their team, or in a top-level `games` list with a `team` name** — whichever the spreadsheet exports more easily.
- **It merges, it never replaces.** A team is matched by name, a player by name within the team, a game by team, date and opponent. A match gets only the fields the file gives; nothing is deleted. Running the same file twice changes nothing.
- **A past result is a score, not minutes.** It becomes goals at 0:00 and a finished game, so the season record adds up; nobody's minutes are invented. A game that already has goals recorded keeps them.
- The file holds children's names, so treat it like the roster. Names never reach the parent pages.

**Practices and other calendar entries** go in the same file, beside `teams` (with a `team`) or inside one:

```json
{
  "practices": [{ "team": "Lakeside Thunder G12", "date": "2026-09-07", "start": "5:30pm", "end": "19:00",
                  "where": "Lakeside Park", "weekly": { "days": ["Mon", "Wed"], "until": "2026-11-25" } }],
  "events": [{ "team": "Lakeside Thunder G12", "title": "Picture day", "date": "2026-09-20", "start": "10:00", "minutes": 30 }]
}
```

- A practice or event needs a `date`; `start` and `end` (or `minutes`) are its times, `where` the place, `notes`, `title`, and `public: true` puts it on the share link (team-only otherwise, as in the app). `weekly` with `days` and `until` makes one entry a week sharing a series, exactly like *Every week* on the Calendar, so calling one week off later is one change.
- **Matched by team, date, start and kind**, so running it again adds nothing; a changed place or end time updates the entries it matches, one field at a time, and nothing the file doesn't mention is touched.
- **Games take the match-day details too:** `home` (`home`, `away`, `neutral`, or `H`/`A`), `arrive` (the time to be there), `kit` (or `uniform`) and `notes`. Times can be `09:30`, `9:30am` or `9am`.

**Spreadsheets.** Save a sheet as CSV or tab-separated (TSV) and choose it, or paste it, and the import reads it by its headings — one sheet at a time:

- **A roster**: `Name` (or `First name` and `Last name`), `Number` (`Jersey`, `#`), `Position`, `Goalkeeper`, `Notes`, and `Team`. With no `Team` column, the sheet asks which team it is for, or the name of a new one.
- **A schedule**: `Date`, `Start` (`Time`, `Kick-off`), `End` or `Duration`, `Type` (game, practice, or anything else for an event), `Opponent` — or `Home team` and `Away team`, and it works out which is you — `Home/Away`, `Location`, `Arrival`, `Uniform`, `Notes`, and `Team`. A row with an opponent and no type is a game. Dates can be `2026-10-04`, `10/4/2026` or `Oct 4, 2026`; a slashed date is read month first unless a day over twelve in the same column says it's day first.
- **Fields**: `Name`, `Address`, `Pitches`, `Surface`, `Lights`, `Notes`, and optionally `Pitch name` (or a sheet headed `Field`, `Pitch`). A row with a pitch on it describes that pitch (its surface, lights, its own address and notes); a row without one describes the field. Rows with the same field name become one field, so a complex is a row for the field and a row per pitch.
- **Registration-system exports** read as they come. A roster with `team`, `birth_year`, `player_first_name`, `player_last_name`, `player_number`, `player_position` and `player_Foot` (the player's stronger foot). Its `coach_email` and `parent1_email`/`parent2_email` columns are offered as invites once the roster is in (below); parents' names, phones and the home address are listed as not used and never stored. A schedule with `date`, `start_time`, `end_time`, `event`, `team_name`, `location`, `field_identifier` and `address`: the location and field identifier become one place (*Lakeside Park, Field 3*), each location with an address becomes a club field, and an `event` like *Game vs Northgate*, *@ Riverside* or *Riverside @ Lakeside Thunder* is a game against the side that isn't you (`vs` home, `@` away, a trailing *(Away)* wins). An event that says it's a game but names nobody goes on the calendar as an entry, and the sheet says so.
- **Inviting the people a roster names.** When a roster has parents' or coaches' emails (`parent1_email`, `guardian email`, `coach_email` and the like), importing it offers *Invite them too?*: one personal invite per parent per child and per coach per team, each bound to its email so a forwarded link is no use to anyone else. Anyone whose account already has that role, or who has an open invite for it, is skipped, so next season's roster invites only the new families. *Make the invites* and *Email them the link* are separate taps; the links are also under People → Invites. The emails are held on that screen only and written nowhere but the invites themselves. Firebase sends them worded as a sign-in link, and limits how many it sends a day; if it stops, the rest can be sent later from the same list.
- **The club's drills**: `Name`, `Summary`, `Setup`, `How it runs` and `Coaching points` (a step or a point each, split by `;` or a line break), and optionally `Type`, `Ages` (`U7-U10`), `Minutes` (`10-15`), `Players` (`6-16`), `Skills`, `Helps with`, `Why`, `Safety`, `Link`. Matched by name onto the club's shelf; one already there is updated field by field. Skills and the rest take the library's own words or labels, and a word it doesn't know is said and left out.
- A heading it doesn't know is listed as not used, never guessed at, and every problem is given by its row number. Templates for each are on the import sheet.

**Fields and training sessions** go in the same file, beside `teams` or on their own:

```json
{
  "fields": [{
    "name": "Lakeside Park", "address": "1 Lake Rd", "surface": "Grass", "lights": true,
    "pitches": [
      { "name": "Field 1", "surface": "Grass", "description": "Full size, 11v11" },
      { "name": "The turf", "surface": "Turf", "lights": true, "address": "40 Back Lane", "notes": "No metal studs" }
    ],
    "permits": [
      { "days": ["Mon", "Wed"], "start": "16:00", "end": "20:00", "from": "2026-09-01", "until": "2026-11-30", "number": "City parks #4471" },
      { "days": "weekends", "note": "All day" }
    ]
  }],
  "sessions": [
    { "type": "1-1", "title": "Finishing", "coach": "Jaz Patel", "date": "2026-10-05", "start": "5pm", "end": "6pm",
      "field": "Lakeside Park", "price": 25, "team": "Lakeside Thunder G12", "players": ["Bea Smith"] },
    { "type": "group", "title": "Keeper group", "coach": "jaz@example.com", "date": "2026-10-07", "start": "16:30", "end": "17:30",
      "field": "Lakeside Park", "where": "the goalmouth", "spots": 4, "ages": "U10-U13", "price": 15, "open": true,
      "weekly": { "days": ["Wed"], "until": "2026-11-25" }, "focus": "Handling and diving",
      "players": [{ "name": "Ada Lovelace", "team": "Lakeside Thunder G12" }, { "number": 10, "team": "Lakeside Thunder G12" }] }
  ]
}
```

- **A field** needs a `name`; everything else is optional: `address`, `pitches`, `surface`, `lights`, `notes`, and `permits`. `pitches` is either how many, or a list of the pitches themselves (`parts` works too), each with a `name` and optionally `surface` (grass, turf or indoor), `lights`, its own `address`, and `notes` or `description`; a bare name is fine. A pitch is matched by name within its field, only what the file says about it is changed, a pitch is never removed, and the field's count never drops below the pitches described. A permit needs its `days` (`["Mon", "Wed"]`, `"Mon, Wed"`, `"weekdays"`, `"weekends"`, `"every day"`); `start` and `end` are its hours (`16:00` or `4pm`; leave both out for the whole day), `from` and `until` its dates, `number` the permit number, and `note` anything else. A field is matched by name and updated in place, and **a permit is only ever added**: one already listed is not added twice, and nothing is removed.
- **A session** needs a `date` and a `start` and `end`. `coach` is the name or email of a coach or admin here (someone who has signed in at least once); left out, the session is whoever imports it. `type` is `"1-1"` or `"group"`, `spots` how many places a group has, `ages` like `"U10-U12"`, `price` a number (`"$25"` and `"free"` work too), `field` the name of a field here or in the same file (anything else is kept as the place, and the check says so), `where` the part of it, `focus` and `notes`. `weekly` with `days` and `until` makes one session a week, each its own, like *Every week* in the app.
- **`players` books them in.** Each is a name, a shirt number (with the session's `team`), or `{ "name" | "number", "team" }`. A name found on two teams needs its team; a player the same file adds can be booked. Past the number of spots, the rest go on the waiting list, and the check says who. A session with players named starts closed to families' asks unless it says `"open": true`; one with nobody named starts open.
- **Sessions merge too.** One is matched by date, start and coach, so running the file again changes nothing, and a changed price or title updates the session it matches. A booking already here is left as it is, whatever the coach has made of it since, and the check says so. A session at a time outside its field's permit is imported, with a warning.
- Fields go into the club settings with the rest of the import. Sessions go to the club's training sessions, and reach the club once its rules include them (**Training sessions**); until then they stay on the admin's phone, like one made by hand.
