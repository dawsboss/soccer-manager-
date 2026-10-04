# Minutes

A sideline tracker for soccer coaches: multiple teams, rosters, planned vs actual minutes, a match clock, and a pitch you can drag players around on. Static files only — no build step, no server, no AI calls.

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
- **Live, for everyone following.** The Live tab inside a game is the play-by-play: the score, the clock, and what has happened — kick-off, goals with the score after each, subs, half time, full time — with shots and set pieces one tap away under *Everything*. It is the one game screen every role gets, parents and trackers included. *Notify me* turns each goal, kick-off, half time and full time into a buzz and a pop-up on that device, but only while the page is open: this is a static site, so there is nothing to push from once it is closed. The coach's old Live screen — minutes, bench, subs — is now the **Subs** tab.
- **Live pairing check.** A banner appears if two players you marked *keep apart* end up on the pitch together.
- **Fixing mistakes.** Tap any line in the sub log to nudge it by 5, 15, 30 or 60 seconds, or type the exact time. *Add a sub* records one that happened before you tapped. *Fix minutes* opens a player's spells on the pitch and lets you edit or delete each one. *Clock reading wrong?* shifts the current half and the total together.
- **Per-game availability.** Mark players out for one game without touching their season totals.
- **Veo.** Each game has a field for the Veo link, so the recording sits next to the sub log.
- **Calendar.** Every team has a Calendar tab: games, practices and anything else on, in date order, with a month at a glance, *Next up* at the top with directions, and called-off entries left on the calendar struck through rather than deleted. Practices repeat weekly on whichever days you pick. Coaches add and change it; everyone with a role on the team — trackers and parents included — reads it, and anyone who can see more than one team (a parent with two children, say) can see them all on one calendar. Families can subscribe so their own calendar follows every change, and parents say whether their child is coming to each game, practice or event. See **The calendar** below.
- **Match-day details.** A game carries home or away, an arrive-by time, the kit, notes for families and the other team, and whether it is on, postponed or cancelled. They show on the calendar, the Plan tab and the share pages.
- **Practice.** A library of 141 drills, each with an animated diagram, setup, coaching points, questions to ask, what goes wrong, easier and harder versions and safety notes. Filter by age, type, position, the shape you play (2-5-1, 3-3-2, 2-3-1 and the rest: a team with a saved shape gets a one-tap *2-5-1 drills* chip, and *Suggest a session* leans towards them), length, setup time, players, kit, difficulty, intensity, skill, principle of play and what needs work. A **Positions** guide says what each of nine positions does with the ball, without it, and in the second either way, and links the drills that teach it. The list starts at the team's age group, set as a **birth year** under Team → *Team name and crest*, so it moves up a year by itself every August. Coaches and admins only: parents and trackers never get the tab.
- **Practice plans.** A plan hangs off a practice on the team's calendar: *Add a practice* on Plans is the calendar's own sheet, and the plan reads its day, time, place and length from that entry, so moving the practice on the calendar moves the plan, and calling it off strikes the plan through without losing it. *Suggest a session* fills it: a warm-up, one or two practices, a game and a cool-down that suit the team's age and squad, timed to fit. Add, move, retime and annotate drills; the plan works out the kit to bring and warns before the field about too few players, missing keepers, a drill outside the age group or three hard drills in a row. *Run it* is the sideline view, one drill at a time with a countdown and its coaching points, and it works with no signal. Afterwards, one to five stars and a line on how it went, and *Use this plan for…* copies it to a coming practice with no plan. Deleting a practice from the calendar keeps its plan, under *Earlier*. The plan is the team's coaches' and the club's admins'; parents see the next practice on Games from the calendar. Plans made before plans hung off the calendar are moved onto it by themselves. Plans need the `training` rules block below; without it they stay on the phone they were made on.
- **Templates.** *Save as a template* turns any plan into a reusable session (its drills, minutes, notes and what it's for), on your own shelf, which follows you to any club, or straight to the club's for its coaches and admins. *Plan from a template* or *Swap in a template* on a plan, or *Plan a practice from it* on the template. Copies both ways: changing a plan never changes the template, and deleting a template leaves every plan made from it. *Share with the club* and *Copy to mine* work as they do for drills; admins look after the club's under Admin → *Club drills*.
- **What needs work.** A card on Season, for coaches and admins, that reads the last five finished games and says what stands out, with the numbers (*12 against and 6 for in the last 5 games*) and the drills that answer it for the team's age. No AI: thresholds in `TRAINING.md`. A signal only fires on what was tracked, so a team that doesn't tap shots is told its shooting is unknown, not that it never shoots.
- **Coaches' time off.** On My calendar, a coach adds the nights she can't do every week (*never Mondays*, *not after 6 on Tuesdays*) and the dates she's away; on any practice, game or event of her team, or a session she runs, *I can't make this* calls her out of that one, and *I can make it after all* takes it back. Nothing is called off for her: the team's other coaches and the admins see who can't make it (and *no coach* when nobody is left), her bookable times leave her time off out, and the planner counts it. Families never see any of it. An admin can do all of this for any coach: add her time off, *Call Jaz off* a practice or session (the entry says who did), and *Put Jaz back on*.
- **Who can coach then.** Planner → *Coaches*: pick a day and a time and every coach is listed free, busy (and where) or off (and why), with her time off underneath and *Add* for each. A practice left with no coach says who is free to cover it. Someone taken off every team is gone for good and isn't listed; time off is the "for now".
- **Club activity.** Admins hear, while Minutes is open, about every new, moved, called-off or deleted practice, game and event on any team (a weekly series or a club-wide booking as one item), coaches calling out or being called off, time off, and sessions families booked or asked for. It pops up as it arrives and is kept under the bell, at the top of Messages. A coach hears the call-outs on her own teams and being called off herself. Nothing you did yourself is news to you, and families hear none of it.
- **Field hours and closures.** Each field can carry its opening hours per weekday (when the lights go off, when the school has it, a day it's shut) and dates it's closed (reseeding, the school's sports day). Anything booked there outside them is flagged on the field, on the session, and in the planner, and find-a-time won't offer it.
- **Planning for the club** (admins). Admin → *Plan*: **Clashes** over the next week to four weeks (two things at one place at once, a coach due in two places, a family with children due in two places, by name); **Find a time** for some teams or the whole club, scored by who would be affected, best first, each slot saying what it clashes with, and one tap puts it on every chosen team's calendar as one entry per team; **Picture day**, which lays the teams out in slots around what each already has on, siblings' teams next to each other, and books each team's slot. No new rule: an admin can already write every team's calendar.
- **The club's drills, and your own.** Practice → Drills has three shelves: **Built-in**, **Club** and **Mine**, and every filter works across all three. *Save to mine* copies any drill into your own library, and editing a drill that isn't yours saves your own version of it (*Your version of Rondo 4v1*), which says so if the original changes later and never changes by itself. *Write a drill* asks for five things (a name, a line on what it is, the setup, how it runs, and what to coach), then the picture; the rest (numbers, kit, tags for the filters) is folded under *Show the detail* with defaults, and every list there is chips from the library's own words, so the filters find it. **Draw it on a pitch**: put players, a ball, cones and goals on with a tap, then add steps, tapping a player and then where they go (a player with the ball passes to whoever you tap, or dribbles to a spot; one without it runs). It plays as an animation on the drill's card. A drill has no uploads: it keeps the drawing of the built-in drill it came from, or carries https links to a clip. Your own drills are private to your account, whichever club you're in: no club admin can see them, and they leave the phone when you sign out. *Share with the club* puts a copy on the Club shelf, which the club's coaches and admins read and trackers and parents never do; admins tidy it from Admin → *Club drills*, and a coach can edit or remove what she shared while she still coaches its team. Adding one of your own drills to a practice puts a copy in the plan, which that team's coaches can read, and the app says so the first time. Deleting a drill from any shelf leaves every plan that used it as it was. Every drill says who made it: the app's own library is credited to Minutes, and a club drill to the coach who shared it, which stays on it after she has left (the card says so) and whoever tidies it. Filters → *Made by* narrows to the app, you, or any one coach. **Or have an AI draw it**: in the editor, describe what happens in your own words and copy the prompt into your own ChatGPT, Claude or Gemini (the app sends nothing itself, and swaps any player's name out first); paste the answer back and it becomes an animated drawing like the built-in ones. If the answer doesn't hold together, the app lists what's wrong in words you can paste back to the AI. **Send to a coach**, on a built-in or a club drill, gives a link to that one drill to send however you like. The link carries the drill's id and which club it's from (as a tag, never the club's code), so a coach in more than one club lands in the right one without choosing, and it opens only for whoever may read the drill on their own phone: a club drill for the club's coaches and admins, signed in, while a parent or a tracker it's forwarded to is told it's for the club's coaches and sees nothing of it. The drills that come with the app open for anyone, to read. Your own drills are private, so there's no link to one: share it with the club first.

## Running it

Open `index.html` in a browser, or serve the folder. Everything works immediately with data stored on that one device.

## Sharing data between your phone and hers

1. Create a Firebase project (free Spark plan is plenty) and add a **Realtime Database**.
2. Add a **Web app** to the project, then copy the config object into `firebase-config.js`.
3. In Realtime Database → Rules, paste the rules:

   **[`database.rules.json`](database.rules.json)** — the whole file. On a phone: open it on GitHub, tap **Raw**, select all, copy, and paste it over everything in the Rules editor, then **Publish**.

   There is one ruleset, for every club. A database runs one set of rules for every club in it, and this site is for any club that comes to it, so there is no "starter" set for new clubs and a stricter one for established ones: a new club is made under the same rules every other club runs on (see **The database rules** below).

4. Sign in (Setup → Account), then tap the club button at the top left → **+ Start a new club**, give it a name, and *Start it*. That creates the club, with you as its admin, and opens it. (A device with no club open has the same button under Setup → Workspace. The app owner's *Connect to a workspace* still works too.) Nobody else types the code: everyone else joins with an invite link — see **Joining a club** below. Signed out, the app still works, but only on that one device.

Two things that will silently reject a write if you tighten the `public` block: a team with **no games yet** publishes without a `games` child at all, because Realtime Database drops empty objects — so never require `games`. And never add a `"$other": { ".validate": false }` catch-all: the document also contains `record` and `updated`, and a wildcard matches those too, failing the whole write.

If links are not working, open **Setup → Share with parents**. It now reports whether the last publish succeeded and shows the rejection reason if not, with a **Republish now** button.

**Write is open, and that is a known gap.** There is no authentication yet, so the only thing stopping someone who holds a link from writing to that node is the shape check above. What that check buys: a vandal cannot inject arbitrary keys or free text, only something that already looks like a scoreboard. What it does not buy: they could still post a wrong score.

Why it is tolerable for now, and only for now:

- The node is **derived**. The coaches' app rewrites it on every change, so anything tampered with is gone at the next sub.
- It contains **no names and no player ids**, so there is nothing there worth stealing.
- The real record lives under `workspaces/` and is never read by the public page.
- Share ids are long and random, so the node is not discoverable without the link.

The proper fix is the first job for authentication: make `.write` require `auth.uid` to be a coach of the team that owns the share. Anonymous auth is *not* a shortcut here — anonymous uids are per-device, so two coaches on two devices would get different ids and only one could publish, and clearing browser storage would lock a coach out of their own share.

The API key in `firebase-config.js` is not a secret; the rules above are what gate access. The long random workspace code is the shared password. Anyone who has it can read and write that workspace, which is fine for minutes and rosters — if you want real accounts later, turn on Firebase Authentication and change the rules to `"auth != null"`.

The badge in the top bar shows `synced`, `offline`, or `this device`, and `3 to send` while changes made on this phone haven't reached the club yet. Nothing lives only on the phone: every change is kept in an outbox on the phone until the database confirms it has it, so a game tracked with no signal reaches the club even if the app is closed and reopened before the signal comes back. Plans, drills and messages do the same. A change the club's database refuses (usually because the rules haven't been pasted yet) is kept, tried again every time the phone connects, and said on every screen, with a list under Settings; it is only dropped if you choose to. A phone used before it joined a club is offered, under Settings, a way for an admin to add those teams to the club. If both devices edit the same game while one is offline, last write wins.

## Joining a club

Joining someone else's club is by invite, and there is no code to type. Starting your own is not: anyone signed in can tap the club button at the top left → **+ Start a new club** and be its admin. The club they were in is untouched and stays in their list; a new club needs a signal, because it is made at the database there and then rather than queued on the phone.

1. A club admin opens **People → Invite someone**, picks Coach, Tracker or Parent (and which player, for a parent), and optionally an email address.
2. The app makes a link — `…/?invite=<id>` — to copy, share, or, with an email, have Firebase send as a sign-in email.
3. The person opens it on their phone, signs in, and sees *Join Lakeside SC as coach of Flight*. **Accept** gives them the role and opens the club. That is the whole of it for them.

Each invite works **once**, for **one account**, and expires after **14 days**. With an email address on it, only that (verified) address can accept it; without one, whoever opens the link first gets the role, so send it somewhere private. The admin sees each invite under People — open ones first, used and expired ones folded away — and tapping one shows its link again to copy or share, who used it and whether they still hold the role, and a button to revoke it while it is unused. Withdrawing a role later also deletes the invite it came from, so it cannot be spent again.

The invite shows the club, the team and who sent it — never a child's name. A parent invite names the player by shirt number, because a link gets forwarded.

### A whole squad of parents

Two ways, both on the team's **Squad** tab, in a **Parents** card for that team's coaches and the admins.

- **One team link** (coaches and admins). Post it in the team chat. Each parent signs in, types their child's shirt number (`7, 12` for two) and optionally the child's first name, and waits. The request shows on Squad with the player that number matches already picked; **Let in as parent of …** makes them that player's parent and lets them into the club, **Turn down** removes it. The parent sees no names at all before they are let in, and their phone opens the club by itself once approved. **New link** replaces it — the old one stops working, which is how a link in last season's chat dies.
- **A personal link per family** (admins). *Or a personal link per family* makes an ordinary parent invite for every player with no parent yet, in one tap, and lists them to copy or share one by one. Running it again makes nothing new, so the same list is where you find a link to send again. Each works once with no approving, so send each to that family only.

The team link needs the `joinCodes` and `claims` rule blocks, and the clause on `access/index` that lets a coach index a parent she approved.

**A second device** needs no invite. Once someone has joined, signing in on a device with no club open finds the club from their account (`userOrgs`) and opens it; with more than one, they are listed under the club switcher. Anyone who joined before this existed gets that list filled in the next time they open the club.

Two limits worth knowing:

- **Firebase words the sign-in email itself.** It reads as "sign in to …", not "you are invited" — a text to say it is coming saves a confused parent.
- **An invite belongs to the database it was made in.** One made in a test database only works on a device pointed at that database.

## Messages

The bell in the top bar, for anyone with a role in a club that has an admin.

- **Team notices.** A team's coaches and the club admins post; every family on the team, its coaches and its trackers read. *Urgent* marks one in red. Under each notice a coach sees **Seen by 9 of 14 families** — tap it for who has not — and **Email or share**, which opens her email app with every parent's address in Bcc (from their sign-in), or the phone's share sheet for the team chat.
- **Family conversations.** A parent gets one conversation per team with that team's coaches: *Ella has a cold, she'll miss Thursday.* Every coach of the team and the admins see it and can reply — never one coach alone, which is the safeguarding-friendly shape — and nobody else. Messages cannot be edited or deleted.
- **No signal.** A message written at a pitch with no signal waits in an outbox on the phone and goes when the connection returns, even after a reload. One the database refuses says *Not sent* with *Try again*.

**What "notifications" means here.** With no server, nothing can wake a phone that has closed Minutes. A message pops up (or buzzes) while Minutes is open in any tab, with a system notification when the tab is in the background and the person allowed it, and otherwise waits with a count on the bell. To reach everyone *now*, use **Email or share** on the notice. Real push is in ROADMAP, with what it would cost.

**Needs the `board` and `dm` rule blocks published** — they are in both rule sets above. Without them posting says *Not sent — the database refused it*.

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
    ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()"
  }
}
```

Readable by anyone, because a device that has just lost access still has to be able to learn that it should let go. Writable only by an admin of that club.

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

## The database rules

**One file, for every club: [`database.rules.json`](database.rules.json).
Paste the whole file as it stands**, whenever it changes. It already includes
the `retired` and `appOwners` blocks shown earlier in this file; those appear
there to explain what they are for, not to be pasted on their own. Publishing
a partial ruleset is how a club ends up half protected.

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

**It is safe to paste before the app has caught up.** Two lookup tables make the
per-team and per-share rules possible — `access/teamIndex` and
`shareOwners/{shareId}` — and neither exists on a club that predates them. So
each of those rules carries a clause that falls back to the old club-wide
behaviour *while its table is missing*, and stops doing so the moment the table
appears. Nothing to sequence, and no way to lock the club out by pasting early.

The app fills both in by itself: an admin's device writes `teamIndex` on its
next connect, and a share claims its owner list on its next publish. **Club
settings → Check readiness** shows whether that has happened. Until every line
there has a tick, the club is protected but not yet *tightly* — a tracker or
a parent can still write another team's data, exactly as before.

**[`database.rules.json`](database.rules.json)** is the whole ruleset. On a phone: open it on GitHub, tap **Raw**, select all, copy, and paste it over everything in Realtime Database → Rules, then **Publish**. From a computer with the Firebase CLI signed in, `firebase deploy --only database` publishes the same file (`firebase.json` points at it) — the console is fine, and is what this README assumes.

What each part is doing:

- **Reading anything** needs a signed-in account listed in `access/index`. The `!data.child('access/index').exists()` clause is the bootstrap: a brand-new workspace with no index yet stays readable, so it can be set up in the first place. It stops mattering the moment the first role is granted.
- **`access/members/$uid`** is self-writable. That is how a new coach knocks on the door: they sign in, register themselves, and an admin can then see them to assign a role. It grants no data access on its own.
- **`admins`** can only be changed by an existing admin — except when there are none, which is the bootstrap for claiming it.
- **`index`** is the flat lookup the read rule uses. Rules cannot iterate, so it cannot walk every team asking whether you are in it; the app mirrors every role grant into this one node.
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
- **`training/$code/avail/$bid`** is one coach's bookable times on one date: 1-1s or a small group. The club reads them. A coach (in `coachIndex`) writes her own and only her own, as with sessions; an admin writes anyone's. A start and an end as `HH:MM`, a slot length of 15–240 minutes, one place for a 1-1 and up to 60 for a group, a price of nothing or more, and two lists the family rules read: `slots`, the slots it still offers, each with its start as a timestamp, and `seats`, one key per place.
- **A family books a slot** by making a session herself, which the `sessions/$sid` rule allows for exactly one shape: for a child whose `guardians` holds her uid, in her own name, under the id `k_{coach}_{date}_{HHMM}` its time gives it where nothing is yet, at a start the window's `slots` lists, with that slot's end and timestamp, still in the future, at the window's price, size, kind and notice, in a week that isn't taken off, and not open to asks. That id is what stops two families making one time.
- **`training/$code/seats/$sid/$n`** is one place in a booked slot. The club reads them. A family takes a seat nobody holds, that the window has, for her own child, while the slot is listed, not called off and not started; she lets it go once her booking is gone. The session's coach and the admins write any. A rule cannot count, so this is how a group refuses one child too many.
- A family's booking on a slot is `in`, written where nothing was, naming a seat she holds for that child, before the slot starts; she deletes it, or marks it `out`, only before the coach's notice. She deletes the slot itself only if she made it and nobody holds a seat or booking on it. `rules.js` prints what is left to the app: how fresh the window's list of slots is, and a second seat held for one child.
- **`training/$code/came/$sid`** is a session's register: the session's coach or an admin writes it, the club reads it.
- **`training/$code/fees/$sid/$pid`** is what was paid for one place. Money, so narrowed by the rules themselves: admins read them all, the session's coach reads and writes her own sessions', and a family reads her own child's. Nobody else reads one.
- **`training/$code/pay/$uid`** is a coach's pay rate. Admins read and set them; each coach reads her own.
- **`training/$code/splans/$sid`** is a session's drills: its coach and the admins only, like a practice plan.
- **`training/$code/drills/$id`** is the club's shelf of drills. Admins and anyone in `coachIndex` read it; trackers and parents never do, and with no `coachIndex` only admins do (it **fails closed**, like practices). A coach writes a drill stamped `by` herself for a `team` whose coach list (`access/teams/{team}/coaches`) names her, and edits or removes it only while that is still true; admins edit or remove any. The check reads the team's own coach list rather than `teamIndex`, so sharing works in a club that hasn't built its lookup tables yet, with no bridge. A drill needs a name of 1–80 characters, and every link in `media` must start with `https://`. **`training/$code/templates/$id`** follows the same rules, ready for templates.
- **`userLibrary/$uid`** is one person's own drills and templates, whichever club she is in. She reads and writes it, one drill at a time, under `drills` or `templates` only. The app owner (`appOwners`) may read it, for support, and never write it. No club admin has any clause here: a coach in two clubs would have two sets of admins, and the library is hers.
- **`clubInvites/$code`** is the admin's list, readable only by admins. It lives outside the workspace on purpose: everyone indexed can read the whole workspace, and a list of unspent coach invites in a parent's hands is a parent who can make herself a coach.
- **`userOrgs/$uid`** is which clubs an account belongs to, so a second device finds them without a code. Only its owner reads it. It is a list of bookmarks, not a grant: reading a club is still `access/index`'s decision.
- **`rsvp/$tid/$item/$pid`** is who is coming: one answer per child per game or calendar entry. A parent may write it for a child whose `guardians` list holds her uid, a coach for anyone on her team, an admin for anyone, and each answer must be stamped with the writer's own uid. It is a node of its own, not part of the game or the team, so the one thing this rule hands a parent is her own child's answer. An answer is `yes`, `no` or `maybe`, an optional note of at most 140 characters, and nothing else. Until this block is published, parents' answers are refused and the app says so.
- **`public/$share`** stays world-readable — that is the whole point of the parent links — but writing now needs an account. That closes the hole where anyone holding a share link could overwrite the scoreboard.
- **`joinCodes/$jc`** is a team link: club, team, and the names shown on it. Readable by id only, like an invite; made and retired by that team's coach or an admin, never edited. It grants nothing on its own.
- **`claims/$ws/$tid/$uid`** is a parent's request through that link — a shirt number and optionally the child's first name. Only its author writes it, only with a live link to that team, and never with an approval in it. **`approved`** is written by that team's coach or an admin, once, in their own name; they can also delete a request to turn it down. The author and the team's coaches and admins read it.
- **`access/index/$uid`** gains one clause for the team link: a team's coach may write it for someone whose request to *her* team she approved, with that team's id as the value. A coach still cannot let in anyone who did not ask.
- **`access/teamParents/$tid/$uid`** is the parent list for one team, and the third lookup table for the same reason as the other two: a rule cannot walk the squad to ask whether someone is a guardian. Its value is a player id, and a write is only accepted if that player really lists that account in `guardians` — so the list can never say more than the squad does. A parent adds herself when she accepts an invite; the team's coach or an admin keeps it in step. Only an admin may create the table, because its first entry closes the bridge below on every team at once, and the app does that by itself on an admin's next connect.
- **`board/$code/$tid`** is a team's notices. Readable by that team's families (`teamParents`), coaches and trackers (`teamIndex`), and the admins — not by the rest of the club. While `teamParents` does not exist yet, it falls back to anyone indexed in the club, so pasting this locks nobody out. That team's coaches and the admins post, each in their own name, and only the author or an admin deletes one. **`seen/$uid`** is each reader's own tick, which is how a coach sees who has not read it.
- **`dm/$code/$tid/$fam`** is one family's conversation with that team's coaches. Only a family on that team's parent list can start one (club-wide while the list is missing). Readable by that family, the team's coaches and the admins — no one coach alone, and no other family. Messages are append-only: nobody edits or deletes one, admins included. There is no bridge for a club without `teamIndex`: these are new nodes, so failing closed locks nobody out of anything, and until an admin's device has written the table only admins can read or post.

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
refusal and shows a sign-in screen with a way to change account or workspace
code rather than a broken page.

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

**Setup → Workspace → Make a test club** (app owner only). Seeds a club called
Sandbox FC: two squads, invented names, four games with one in progress, and
three people waiting in `access/members` with no roles yet. That is exactly the
state a club moving off the old open rules is in (the steps above), so you can rehearse
all of them — claim admin, grant and withdraw roles, check readiness, get
refused, retire it — on data nobody cares about.

A test club carries a warm banner on every screen, and **publishing is switched
off inside it**, so a seeded game can never overwrite a `public/` node that real
families are reading. It lives in whichever database you are pointed at, under a
code beginning `test-`; delete the node in the console when you are done.

What it does **not** cover is a rules change. Rules belong to a database, not to
a club: the locked-down block is written against `workspaces/$code`, so
publishing it to try it on a test club applies it to the real club at the same
instant. Nor can you carve a stricter sandbox out of an open wildcard — a rule
grants, and nothing below it can take that back.

### 3. A second database — everything, including rules

**Setup → Workspace → Database** switches which Firebase database the app talks
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

Games are read straight from the games themselves, so moving a kick-off on the game moves it on the calendar. Practices and everything else (a team photo, a tournament, the end-of-season party) are added from the Calendar tab, and each one decides who sees it:

- **The team** — everyone signed in with a role on it: coaches, trackers and parents. This is the default.
- **The team and the share link** — also on the season page you text to families. Anyone holding that link, and anyone it is forwarded to, can read it.

Practices default to the team only on purpose. A share link gets forwarded, and a practice is a predictable time and place where children are without the crowd a match brings. Games were already on the share link and still are.

**Repeating practices** are one entry per week, not a rule the app expands: *Every week* on Tuesday and Thursday until the end of term writes one entry for each session (up to 60 at once). Each can be moved or called off on its own; editing one asks whether to change *just this one* or *this and every later one*.

**Calling something off** keeps it on the calendar, struck through and marked Cancelled (or Postponed, for a game), on the share link too. Deleting is still there, but a deleted practice is one a parent may still turn up to.

**In your own calendar.** Once the club has set up **Calendar sync** (below), the Calendar tab has *Apple Calendar* and *Google Calendar* buttons, and *Copy the address* for Outlook. Subscribe once and the phone's calendar follows every change on its own: a moved kick-off, a called-off practice, a new tournament. A coach turns it on per team. Every entry also has *Directions* (a maps search for the venue as typed), and a one-off copy is still there for a phone that will not subscribe. Without sync set up, that copy is all there is: add it again if a time changes. Each entry has a fixed id, so calendars that go by id replace the earlier copy instead of doubling it.

**Who is coming.** On the calendar, a parent sees *Is Ella going?* with *Going*, *Not going* and *Maybe*, on *Next up* and on each entry's page, for each of their own children. Once they have answered there is room for a short note ("arriving late"). Tapping the answer again takes it back. The coach sees each entry's answers by name, with whoever has not answered at the top, can answer for a family that said so another way, and gets the count on every row.

**Answers go straight into the game.** A family's *not going* leaves that player out of the bench, the plan, the targets and the even split, with nothing for the coach to copy across. The Plan tab's *Who is coming* says who is out and why, who said maybe, and who has not answered; the Minutes list marks the maybes and the silent ones. The coach's word still wins either way: on the *Available* sheet she can have a "not going" play after all, or leave out someone whose family said nothing. Her choice is stored only where it differs from the family's, so a family that changes its mind still flows through unless she has decided otherwise. Once the game kicks off, answers close and the bench stays as it was.

**Attendance.** From the day of a practice or event onwards, its page has *Take attendance*: the squad, filled in from what families said ("not going" starts as missed, everyone else as came), a tap to change anyone, and *Everyone came*. Games need no register: a player came if she played, or was available on the bench. The Season tab's **Attendance** card (coaches only) lists every player with practices came to and missed, how many of those misses nobody warned about, and games, most missed first, and says how many past practices still have no register. A player's sheet carries the same line, and a parent sees her own child's under *My players*. Nothing is counted that did not happen: a called-off practice, a future one, or one with no register yet. Trackers and coaches of other teams see how many are coming, not who. Answers never reach the share link or the calendar feed, not even as a count. Answering needs the `rsvp` block in the locked-down rules (see **Locking it down**); the open rules already allow it.

**Names never reach the share link.** A note like "Ella's family on snacks", typed into a public entry or a game's notes, is published as "a player's family on snacks". The coach is told when that happens. Every word of every roster name is matched, so a venue that shares a word with a player's surname loses that word on the share page. That is the safe way round.

**For the other team.** The game's share sheet, and its calendar entry, have *Copy a message for the other team*, ready to text their coach: the fixture, kick-off, where with a directions link, what we wear, and the game link for the live score. Arrive-by is left out, because that time is for our families, not theirs. **A game link reaches that game and nothing else.** Each game is published under its own id, so whoever holds its link (the other team, or whoever they forward it to) cannot get from it to the season page, any other fixture or any practice. ROADMAP has the longer exploration of what opponents could see.

## Calendar sync

A calendar app subscribes to a web address and goes back to it on its own schedule, from its own servers, without running any of this app's JavaScript. A static site cannot answer that, so sync is one small extra piece: `worker/calendar.mjs`, a Cloudflare Worker. It reads one node of `public/` (the same node a share page reads) and returns it as a calendar. It holds no credentials and cannot write anything. It asks the database exactly what anyone on the internet could ask (`public/{id}.json`), so it cannot see more than the share pages can. It is the one part of this project that is not a static file, and it is optional: without it, everything else works and the calendar offers a copy instead.

Set it up once for the club:

1. A free Cloudflare account → **Workers & Pages** → **Create** → **Create Worker**. Name it something like `minutes-calendar` and deploy the hello-world it starts with.
2. **Edit code**, delete what is there, paste the whole of `worker/calendar.mjs`, and **Deploy**.
3. The Worker's **Settings → Variables and Secrets** → add `DATABASE_URL` with your database address (`databaseURL` in `firebase-config.js`, e.g. `https://your-project-default-rtdb.firebaseio.com`). Or put it in the `DATABASE_URL` line at the top of the file before pasting.
4. Copy the Worker's address (`https://minutes-calendar.<you>.workers.dev`) into `firebase-config.js` as `window.SOCCER_CALENDAR_FEED`, commit, and let the site deploy.
5. In the app, a coach opens Calendar → **Turn on calendar sync**. Everyone on the team then has the subscribe buttons.

Three addresses come out of it, all `https://<worker>/{id}.ics`:

- **The team's feed** (from the Calendar tab, for the team's signed-in members): every game and every entry, **team-only practices included**, because a subscribed calendar without practices is not the calendar. That means a team-only practice is published under this feed's id, world-readable by anyone who has the address, the same way the share link works. So the address is shown only inside the app, to the team's members. It holds no names, no players, no minutes and no answers. A coach can **Replace this address** at any time, which stops the old one and means everyone subscribes again.
- **The season link's feed** (on the share page, for grandparents and friends): the games, and only the entries marked for the share link.
- **A game's own** feed (that one game). Nothing offers it, but the same Worker answers it.

How quickly a change arrives is up to the calendar app, not us. Apple and Outlook come back roughly hourly (the feed asks for that). Google refreshes subscribed calendars on its own schedule, often every several hours, and nothing a feed says changes that.

After any change to `ics.js`, run `node worker/make.js` to copy it into the Worker, then paste the Worker again. `node test/worker.js` fails until the two match, so the feed and the app never describe a fixture differently.

Nothing about the calendar needed a rule change: entries live under `teams/{tid}/events/{eid}`, below the rule that already lets a team's coaches and the club's admins change the team, and nobody else. `node test/rules.js` pins that.

## Training sessions

1-1s and small groups that belong to no team: a coach offers a slot, books players from any team or leaves it open for families to ask, brings the drills (or plans around what the family said she wants to work on), takes the register, and marks who has paid. **Club → Training sessions.** The design, and why it is shaped the way it is, is [`SESSIONS.md`](SESSIONS.md).

- **Offering one.** *New session*: 1-1 or small group, when, which field, how many spots, an age range, a price, and whether families can ask. *Every week* makes one session per week, each its own, like weekly practices. Before saving, *Check for clashes* says if it is outside the field's permit, the field is full then, the coach is due somewhere else, or a booked player has a team practice or game at that time.
- **Getting players in.** The coach adds players from any team (*Add players*, a team at a time; past the number of spots they go on the waiting list), or a family asks from her own phone, with what her daughter wants to work on. Asks are listed first, with *Book*, *Waitlist* and *Not this time*. A family can withdraw at any time, and never gives herself a place.
- **What a family sees.** Her own children's sessions and how each stands, the open ones that suit their ages with how many spots are left, and what she owes. Never another child's name. Her children's confirmed sessions are on her Calendar and under *My players*, and in the file *Add what is coming up* makes.
- **Who came.** From the day of a session, its page has *Take the register*. It counts on the player's record as *Extra sessions 3 of 4*, beside her practices and games, on the Season tab and under *My players*. Only once taken, only for something that happened.
- **Fees.** A place owes the session's price once it is booked and the session is not called off; a withdrawal owes nothing. *Fees* lists what is not paid, by player, with *All paid* and *Remind the family* (email in Bcc, a copy, or their family conversation where you coach the team). Mark it paid by cash, card, bank transfer or other, or waive it. There are no card payments: this is the club's record of who has paid. A session with a payment on it can be called off but not deleted.
- **Hours.** *Hours* is each coach's month: sessions run, hours, players, and, with a rate set by an admin (per hour or per session), what that comes to. *Copy as a table* for whoever does payroll. A coach sees only her own. Team practices aren't counted, because the app knows a team's coaches but not which of them ran it.
- **Fields.** Admins list the club's fields (**Club settings → Fields and permits**, or the *Fields* tab): address, how many pitches, surface, lights, notes, and each permit's days, hours, dates and number. A field's page shows the next two weeks of everything on it, sessions and team practices and games, with whatever is outside the permit or double-booked flagged. A team entry is at a field when its venue contains the field's name ("Lakeside Park, field 2" is at "Lakeside Park"). Venues typed on the calendar that match no field yet are offered as one-tap fields. Fields live under the club settings (`access/org/venues`), so they need no new rule.
- **Telling families.** *Tell the families* writes the message (when, where, what changed) and offers it in the app (into the family conversation, on teams where you are staff), by email in Bcc, or as a copy. Calling a session off opens it straight away. On screen, a family is told when her child's place is confirmed, waitlisted, turned down or taken off, and when her session is moved or called off; a coach is told when a family asks or withdraws. Like messages, this needs the page open: email is what reaches a closed phone.
- **Never on the share link.** Sessions are not on the season page, the game pages or the calendar feed. A 1-1 is a child, a time and a place.

### Bookable times

A coach says when she is free, for 1-1s or a small group, and families book a place themselves, with no back and forth. **Training sessions → Bookable times → Add times**: 1-1s or a small group (with how many places), a window (Tuesdays 5–7pm, say), the slot length (30, 45, 60 or 90 minutes), where, the price, an age range, how late a family can cancel, and *Every week* until a date. Each week is its own, so *Not this week* takes one off without touching the rest. A coach offers and changes her own times; an admin anyone's. The design is [`AVAILABILITY.md`](AVAILABILITY.md).

- **Synced with the teams' calendars.** A practice or game for any team the coach coaches, and any session she runs, takes out the slots it overlaps by itself: add a practice on Tuesday at six and six o'clock stops being offered. A slot that overlaps the child's own team practice isn't offered to her family either.
- **Booking.** A family sees *Book a time with a coach* on her Training sessions list, picks a free slot for her child (a group says how many places are left), says what she wants to work on, and it's booked: no waiting for a reply. It needs a signal, because it is first come, first served; if two families go for the last place at once the database lets one in and tells the other to pick again.
- **A booked slot is a session.** It shows on the coach's list, and everything sessions do (the register, fees, hours, clashes, notices, the player's record, the team calendar) works on it. The coach is told when a family books or cancels.
- **Cancelling.** The family cancels from the session's page, up to the notice the coach set (24 hours by default), and the place goes back on offer. Later than that, she messages the coach, who can still take her off.
- **The database holds families to it, not just the app.** A slot has to be one the coach's window still offers, on its grid and at its length, not in the past, at her price, with no more children than places, and cancelling has to be before her notice; a hand-made write that tries otherwise is refused. The window's list of open slots leaves out whatever the coach is busy with, and her phone or an admin's keeps that list current whenever they open the app.
- **Never on the share link**, like sessions.

### My calendar

**Club home → My calendar** (or the link at the top of any team's Calendar tab) is the person's, not a team's: every team she coaches or tracks, every team a child of hers is on, the sessions she runs and her children's, and the times she has offered, in one month view and one list. A parent of two, or a coach who is also a parent, can narrow it to one child or to her coaching. The team Calendar tab stays as it is: it is what a coach plans on and what the share link mirrors.

Sessions need the `training` block's `sessions`, `booked`, `came`, `fees`, `pay`, `splans`, `avail` and `seats` rules published (**The database rules**). Until then they stay on the phone they were made on, the screen says *Some of this is on this phone only*, and a family's ask is refused and taken back off the screen with a message.

## How long share links last

**Forever, until you change them.** There is no expiry. A link keeps working as long as its share id exists.

Three things end one:

- **Rotate** — Share → *Make a new link and kill the old one*. Every link previously sent stops working immediately, the season link and every game's own link alike.
- **Retire the club** — the mirror stops being updated, so it freezes at the last published state rather than going away.
- **Delete `public/<share>` in the console** — the link goes dead.

For a season that is usually what you want: text it in September, it works in May. If a family leaves mid-season, rotate and re-send to everyone else. An expiry date per link is worth adding when someone actually needs it — see ROADMAP.

## Sharing with parents

Setup → **Share with parents** creates a long random share id for the team and publishes a read-only mirror. Two links come out of it:

- **Season** — `live.html?t=<share>`. Text it once. It shows the season record, whatever game is happening now, what is coming up (every game, plus any practice or event marked for the share link), and every result. Each entry adds to a phone's calendar, and so does the whole of what is coming up.
- **One game** — `game.html?t=<gameShare>&g=<gameId>`. Kick-off time, venue, home or away, arrive-by, kit, notes, score, live clock, who is on, minutes played and the substitutions. Each game is published under its own id, so this link holds that game and nothing else: nobody can reach the season page from it. Game links made before this change carried the season link's id; *Make a new link and kill the old one* retires those.

Teams can carry a crest — Setup → Teams → tap the team → *Add a crest*. It is resized to 192px and re-encoded in the browser before saving, and it shows in the app header and at the top of the shared pages. It cannot appear in the text-message preview image, which is a fixed file; that needs the Cloudflare Worker.

Both are reached from the share button beside the game bar, and both show the game you are currently looking at — switch games in the bar to share a different one. Setup is only where sharing is turned on and where links are rotated.

They are two separate HTML files purely so the text-message preview differs: `live.html` previews as *Follow the season* with `share-season.png`, `game.html` as *Match day* with `share-game.png`. Both load the same `live.js`.

**No child's name is ever published.** The mirror carries shirt numbers only — not names, not player ids. That is enforced by what gets written, not by what the page chooses to display, so there is nothing to find in the payload. *Rotate* makes a new share id and deletes the old node, which kills every link previously sent.

Link previews in text messages are scraped without running JavaScript, so each card is fixed at whatever its file's meta tags say. iMessage also freezes previews at send time, so a live-updating card in a message thread is not possible on any platform. Tapping through opens a page that does update by itself. If the score must appear in the preview itself, that needs a Cloudflare Worker to inject it server-side — see ROADMAP.md.

## Hosting on GitHub Pages

Push the folder to a repo, then Settings → Pages → deploy from branch, root. It is all static, so nothing else is needed. Add the site to the home screen on her phone and tablet for a full-screen launch.

## Data model

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
training/{code}/fees/{sid}/{pid}    { paid, how: 'cash' | 'card' | 'transfer' | 'waived' | 'other', at, by, byName }
training/{code}/pay/{uid}           { rate, per: 'hour' | 'session' }
training/{code}/splans/{sid}        { blocks: [ { drill: { shelf, id, v }, name, minutes, note } ], by, at }
training/{code}/avail/{bid}         { id, coach, coachName, date, start, end, kind: 'one' | 'group', cap, title, len,
                                      field, place, price, ages, notice, note, series, off, by, at,
                                      slots: { t1700: { end, at } }, seats: { s1: true } }   // one date each
training/{code}/sessions/k_{coach}_{date}_{HHMM}
                                    a slot a family booked: a session, plus { slot, t0, notice, pid, tid, by }
training/{code}/seats/{sid}/{s1}    { pid, tid, by, at }                  // one place in a booked slot
workspaces/{code}/access/org/venues/{fieldId}
                                    { id, name, address, pitches, surface, lights, notes,
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

Written by the coaches' app on a 1.2 second debounce. Read by `live.html`, which recomputes the clock from `periods` against Firebase's server time, so it ticks between pushes instead of waiting for one. The calendar feed Worker reads the same nodes.

## Backup

Setup → *Download a copy* (admins) writes the whole club to one JSON file: teams, games, roles and fields, and under `training` the training sessions with their bookings, registers and fees, coaches' pay rates, practice plans and the club's drills. With a signal it asks the club for its own copy of those first and lays this phone's over it, so the file holds what the club has, not just what this phone happened to open; if part of it can't be asked about, the download says so.

*Load from a file* adds whatever the club is missing and keeps everything already there: teams, games, fields, and every training record. It never replaces the club wholesale and never touches who has access. A training record goes back only where the club has nothing at that place, so last month's backup can't overwrite this week's fees; before saying what it would do, it asks the club what it already has, and a record it can't check (no signal, or not an admin) is left out and listed rather than written blind. Backups from before training records were included still load.

**What is still owed is counted in one place.** The badge in the corner, the warning on every screen and *Not saved to the club yet* count everything on this phone that the club hasn't accepted: games and squads, and also practice plans, drills and training sessions. *Try again now* resends all of it. *Drop the refused ones* drops refused games, squads and training-session changes (the club's copy comes back in their place); refused practice plans and drills stay, and are retried, until the club takes them.

**A phone with no room left says so.** If the browser refuses to store a change because the phone's storage is full, the app says so straight away and on every screen until a save gets through again, because a change it couldn't keep would be gone when the app closes. Anything already sent to the club is safe.

## Bulk import

Admin → *Import teams, games, fields and sessions* takes a season at once — teams, rosters, fixtures, past results, the club's fields with their permits, and training sessions — as one JSON file, chosen or pasted. *Check it* shows what it will do and every problem, line by line, before anything is written; nothing is written while an error is left.

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

**Fields and training sessions** go in the same file, beside `teams` or on their own:

```json
{
  "fields": [{
    "name": "Lakeside Park", "address": "1 Lake Rd", "pitches": 2, "surface": "Grass", "lights": true,
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

- **A field** needs a `name`; everything else is optional: `address`, `pitches`, `surface`, `lights`, `notes`, and `permits`. A permit needs its `days` (`["Mon", "Wed"]`, `"Mon, Wed"`, `"weekdays"`, `"weekends"`, `"every day"`); `start` and `end` are its hours (`16:00` or `4pm`; leave both out for the whole day), `from` and `until` its dates, `number` the permit number, and `note` anything else. A field is matched by name and updated in place, and **a permit is only ever added**: one already listed is not added twice, and nothing is removed.
- **A session** needs a `date` and a `start` and `end`. `coach` is the name or email of a coach or admin here (someone who has signed in at least once); left out, the session is whoever imports it. `type` is `"1-1"` or `"group"`, `spots` how many places a group has, `ages` like `"U10-U12"`, `price` a number (`"$25"` and `"free"` work too), `field` the name of a field here or in the same file (anything else is kept as the place, and the check says so), `where` the part of it, `focus` and `notes`. `weekly` with `days` and `until` makes one session a week, each its own, like *Every week* in the app.
- **`players` books them in.** Each is a name, a shirt number (with the session's `team`), or `{ "name" | "number", "team" }`. A name found on two teams needs its team; a player the same file adds can be booked. Past the number of spots, the rest go on the waiting list, and the check says who. A session with players named starts closed to families' asks unless it says `"open": true`; one with nobody named starts open.
- **Sessions merge too.** One is matched by date, start and coach, so running the file again changes nothing, and a changed price or title updates the session it matches. A booking already here is left as it is, whatever the coach has made of it since, and the check says so. A session at a time outside its field's permit is imported, with a warning.
- Fields go into the club settings with the rest of the import. Sessions go to the club's training sessions, and reach the club once its rules include them (**Training sessions**); until then they stay on the admin's phone, like one made by hand.
