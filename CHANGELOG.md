# Changelog

Newest first. Each entry says why, not just what.

This file starts here: `CLAUDE.md` has always asked for an entry per shipped
change, but the changelog itself was never in the repository, so everything
before this point lives only in the git log.

---

## Every clock ticks, and the clock is on the Track tab — 2026-09-26

Only the Live and Track cards moved on their own. Everywhere else that shows
time played — Stats, which is the only game screen a parent gets, the games
list, the game picker, My players — drew it once and sat there until something
else redrew the page, so a parent watching a game saw a clock stuck at
whatever it read when they opened it. Those numbers are now tagged where they
are drawn (`data-live`) and the once-a-second ticker rewrites them on every
screen, not just inside a game. `liveReading()` is the one place that says
what each tag reads, and `test/clock.js` moves the wall clock under it and
requires that it follows while the clock runs and stops when it stops.

The public follow page ticked its big clock but not the minutes beside each
shirt number, which only changed when the coach's phone next published. A
player on the pitch has played every second the match clock has moved since
that publish, so the page now adds exactly that — nothing when the clock is
paused, nothing for the bench. The season page's *Happening now* card shows
the running clock too.

Start, pause, end the half and end the game are now on the Track tab as well
as Live, because Track is where a coach is when she is logging a corner. It
is still the coach's clock: a tracker sees it run and is told the coach runs
it, and the click handler refuses her whether or not the button is drawn.

## Bulk import for admins — 2026-09-26

Setting a club up for a season meant typing every team, every child and every
fixture in one sheet at a time, when all of it is already in a spreadsheet
somewhere. Admin → **Import teams and games** takes the lot as one JSON file,
chosen or pasted: teams, rosters (numbers, positions, ratings, notes), the
fixture list, and results from games played before the app was in use.
README's **Bulk import** has the format.

It merges and never replaces. A team is matched by name, a player by name
within the team, a game by team, date and opponent; anything found gets only
the fields the file names, and nothing is deleted. So the same file run twice
changes nothing, which is the first thing anyone does after an import that
half worked, and a game tracked offline on the admin's phone is never the
importer's to lose. It is planned before it is applied: **Check it** says
"adds 3 teams, 40 players, 28 games" and lists each problem by team and row,
and nothing is written while any error is left. Writes go at the depth the
rules sit at, a whole team or game only when it is new and one field at a time
when it is not.

A past result is only a score, so it is written as goals at 0:00 on a finished
game with no clock, crediting scorers by shirt number or name. Nobody's minutes
are invented, and a game with goals already recorded keeps them.

*Load from a file* under Setup → Backup goes through the same door now. It used
to replace local state with the file's teams and games, which also threw away
`access` (admins, index, members) on this device before pushing. A backup now
adds whatever the club is missing and keeps everything already here.
`test/import.js` covers the lot, including that only an admin gets in: the
click handler checks, not just the hidden button.

## The tap on the planned-subs card is in the match log — 2026-09-26

Tapping **Subs are on** already put the subs it made in the Track tab's match
log, by name ("Hana on for Bea"). But nothing there said it was the planned
10:00 change or who called it, and **Not now** left no trace at all, because
a skip makes no subs to list. The tap now gets its own line: **Planned subs
made** (10:00 · 1st half) · Tess, above the subs it made, or **Planned subs
skipped** for a skip. A skip now records the game minute it was tapped, so it
lands in the right place. The line goes away with Undo, like the subs do. It
is read-only in the log; Undo stays on the card.

## Tell the bench: the plan as calls to make — 2026-09-26

A snapshot is a picture of the pitch, but at the sideline a coach doesn't
hold up a picture. They tell the players on the bench who is going on, where,
and for whom, and who is switching spots. Working that out from two pitches
in your head, in the rain, is where subs go wrong.

The coach's sideline card now shows each change that way: **Going on** (the
spot, the player, "for Bea"), **Switching spots** (the new spot, "from CB"), and
**Coming off**. Kick-off shows the starting lineup spot by spot, with the
bench under it. **Tell the bench** opens the same thing in bigger type with
**Copy as a message**, to text to whoever is standing with the subs. It is also
on the Pitch and Plan tabs' next-change card and on every snapshot. **Bench
sheet** (on the locked-in plan, or **Whole game** from any bench view) lists
every change in the game, to read through at warm-up or send the night
before.

During a game the calls start from the pitch as it is, not from the snapshot
before, since the coach may have subbed by hand in between. Before kick-off,
and in the whole-game sheet, they go snapshot to snapshot, since the pitch at
30:00 is not known yet. When someone comes on into a spot a teammate is moving
out of, they are paired with whoever is coming off, so every call still has a
"for". The calls name players, so like the Plan tab they are for coaches only.
The tracker's card still names nobody, and the click handler refuses a
tracker the sheet and the copy.

## A coach reads other teams, and only coaches change the squad — 2026-09-26

A coach opening another age group in her club got her own coach's screens
there: the clock, subs, the plan, Add a game, Add a player, every edit sheet.
`canEditTeam()` already knew she could not change that team, and a banner said
so, but nothing that drew a screen or handled a tap asked it. The same gap let
a tracker (and, from a stale screen, a parent) add players to the squad and
games to the fixture list.

On a team she does not coach, a coach is now a **viewer**: `restricted()`
returns `'viewer'`, so she gets what a parent gets on a game (Stats only, no
tally buttons, no AI helper) and the "you can read it, not change it" banner.
The squad shows read-only, with no Add card and no edit sheet; the games list
and every "no games yet" screen drop **Add a game**; Track hides **Choose** for
anyone who cannot change the team's settings; the share sheet lets her copy the
parent links but not make, kill or republish them.

A hidden button is not the only thing in the way any more. The click handler
checks `mayAct()` first: the squad, the fixture list, the team's settings, the
clock, the lineup and the plan need a coach of that team (or an admin), and
logging goals, shots and set pieces needs that or the team's tracker. A game
answers to its own team, not whichever team happens to be open. Anyone else is
told only the team's coaches can change it, and nothing is written.

This is the interface. The rules already refuse a coach writing another team
through `access/teamIndex`; `node test/rules.js` lists what they still do not.
`test/visibility.js` now pins each case above, including that a tracker can
still log a goal in her own team's game and cannot start its clock.

---

## Lock in the plan; the tracker calls the subs — 2026-09-26

The Plan tab saved on every tap, but nothing said so, and a coach who has spent
twenty minutes on snapshots wants to know they are safe. And the plan never
reached the sideline for anyone but the coach: a tracker, usually a parent, had
no idea when subs were meant to happen, and could not make them anyway.

**Lock in** on the Plan tab stores `plan/locked` (when and who) and freezes the
snapshots: any edit, a redraft included, has to unlock it first, and a rewrite
of the plan drops the lock, because a changed plan is not the one that was
locked in. The card then says where it is saved, and "saved to the club" means
the database acknowledged that write, not that the badge happened to say
synced. Offline it says the phone has it and it will go when there is signal;
refused, it says that. Locking asks first if a snapshot has an empty spot or
names someone marked unavailable, because the sideline is about to follow it to
the letter.

With a plan locked in, Track and Live (and the Plan tab mid-game) show one
card. It counts down to the next change, grows a **Subs are on** button three
minutes before, and turns loud when it is due. The phone buzzes on each of
those, since it is as likely to be in a pocket. The tap makes every change in
the snapshot at the minute it is pressed: stints closed and opened, spots and
roles set, moves included. It is marked done in `planDone`, which sits beside
the plan so a whole-plan write can never clobber it. A mis-tap can be undone
for two minutes, as long as nothing has happened on top of it. **Not now**
skips a change that is not happening.

Timing is asked on the half clock, not the running total. A first half ended at
38:00 must not make "10:00 into the second half" come due two minutes early. A
change set for half-time comes due when the half is ended. A change counts as
done if the pitch already matches it (the coach subbed by hand), and kick-off
counts as done once anyone is on, so a coach's own starters are never swapped
back from another phone. If one change is missed, the next one replaces it:
each snapshot is a whole lineup, so the newest one also catches up the missed
one.

A tracker is told when and how many, never who. Those are the coach's lineups,
and the Plan tab stays hidden from trackers as before. This is the one change
to who is on the pitch a tracker may make, and the click handler checks it
(locked plan, tracker of this team) rather than trusting the button being
drawn. AUTH.md's role table says so now. No rules change: a tracker could
already write the team's matches, and `test/rules.js` now pins the two
paths this uses.

Two fixes came with it. "Make these subs" and the other plan buttons now go
through the same function, so a player coming on gets the spot the plan gives
them in their stint, not the spot of whoever went off, and a planned position
change is a real one. And the once-a-second ticker, which counts the clock and
now this card, had been checking for view names the app stopped using when the
game tabs moved, so it never ran: a game clock only moved when something else
redrew the screen. `test/subs.js` covers the lot.

## Plan this game starts from the coach's plan — 2026-09-26

The first cut of **Plan this game** asked the AI to build a plan from nothing.
That is not how a coach arrives at it: she already knows roughly who should get
what minutes, and has ideas about positions and who goes on when. She wants
those checked and the gaps filled, not replaced.

The prompt now carries her plan: her target for each player, her snapshots from
the Plan tab (the whole lineup, spot by spot, and the bench at every change),
and what each player's minutes come to if they are followed. A **Your ideas**
box sits above the prompt for everything not yet on the pitch ("#7 and #9
split up top, keep #10 fresh for the last 15"). It is written into the prompt
as she types and kept per game, so closing the sheet does not lose it. The
question now asks the AI to keep her choices unless there is a reason not to,
to say why when it changes one, and to flag anyone short of or over target,
anyone past their longest spell, and any unbalanced block.

A coach typing ideas writes names, not numbers. So on Copy (or Copy and open),
every roster name in the ideas and in the prompt is swapped for that player's
label first. Full names are matched before single words, and only whole words
match. The box shows the swapped text, and the toast says how many were
changed. At club level, where a number would not say which team, a name becomes
"a player".

## Ask an AI can plan a game, not just review one — 2026-09-26

Opened from a game, the helper only offered Game review, Half-time and a Note
to parents. All three look back at a game, and the Plan tab is where a coach
goes before kick-off, so there was nothing there to help plan one. "Next game"
existed, but only on the Season tab.

A game now has a **Plan this game** question, and the sheet opens on it when the
game has not started (on the review once it has). Its prompt carries what the
app's own planner reads, not a column of zero minutes: the formation and its
positions, how often subs come, each player's target, where she plays best and
also plays, strength, longest spell, and minutes over earlier games. It also
says who plays well together and who is kept apart, all by shirt number. With
no targets set, it asks for an even share weighted toward whoever is behind on
the season. `test/ai.js` covers it, and it is held to the same no-names check
as every other prompt.
## Joining a club by invite — 2026-09-26

The join-by-code screen went a while ago, ahead of the invite system in
`AUTH.md`, and nothing replaced it: a brand-new device had no way to find a
club, and in a locked-down club an account with no role could not read
anything, so an admin had to wait for the person to sign in on an
already-connected device before granting a role. Only the app owner's escape
hatch in Setup could connect anyone.

Invites close that. An admin opens People → *Invite someone*, picks coach,
tracker or parent (and the player, for a parent), and gets a link. Whoever
opens it signs in, sees which club and role, and taps Accept; the app spends
the invite, writes the role and the index entry, and opens the club. Single
use, 14 days, and optionally tied to one verified email address, in which case
Firebase can send the sign-in email itself. The admin sees each invite as
waiting, joined or expired, and can withdraw it.

The rules carry the weight, and the design follows from what they can do. The
invite lives at the database root because the person accepting it cannot read
the club yet. The admin's list lives at `clubInvites/{code}`, outside the
workspace, because every indexed account can read all of the workspace and a
parent with a list of unspent coach invites could make herself a coach. Each
write the invitee makes is checked against the spent invite, which means the
role entries it writes hold the invite id instead of `true` — nothing reads
them as anything but present. Withdrawing a role deletes the invite it came
from, and the rules stop honouring a spent invite once it expires, so a
withdrawn coach cannot re-grant herself from the old link. The invitee may
mirror herself into `teamIndex` only if the table already exists: writing the
first entry would close the migration bridge on the whole club.

`userOrgs/{uid}` (AUTH.md's reverse index) comes with it, so the second
device a coach signs in on opens her club without another invite. Members
who joined before it pick up their entry on their next connect.

The invite shows club, team and who sent it, and names a player by shirt
number only — links get forwarded. `test/invites.js` drives both sides against
the fake Firebase; `test/rules.js` gains the invite paths, including the
attempts to use one for more than it grants. The three new root blocks are in
both README rulesets and must be published before invites work.

## Ask an AI: a prompt generator, not a chatbot — 2026-09-26

Coaches and admins wanted an AI helper, ideally signed in with their own
ChatGPT account. Neither half of that can live inside this app. `CLAUDE.md`
says the app must never call an AI model, and ChatGPT, Claude and Gemini all
refuse to be embedded in another site (`X-Frame-Options`), so nobody's own
account can be borrowed from here.

What ships instead is a prompt builder. **Ask an AI** sits at the foot of the
Season tab, the game's Stats and Plan tabs, and Club admin. It writes out what
the app knows (season minutes against plan, time by position, goals, assists,
shots, results, set pieces, a game's subs, or every team for an admin) with
a question to go with it: season review, playing time, practice plan, next
game, half-time changes, a note to parents, club overview. The coach can edit
it, then **Copy**, or **Copy & open** ChatGPT, Claude or Gemini in a new tab.
ChatGPT and Claude get the prompt pre-filled when it is short enough for a URL.
Nothing leaves the device unless she pastes it.

Because it is designed to be pasted into a third-party service, it holds to
the public mirror's contract: players appear as shirt numbers and never as
names. Notes, photos and parent links are left out, since a note is free text
and is exactly where a name ends up. Two players sharing a number, or one with
no number, get a letter each rather than being merged. It is for coaches
and admins only: the prompt reads out the whole squad's minutes, which
trackers and parents are not shown, so the click handler checks that as well
as hiding the button. `test/ai.js` builds every prompt and fails if any roster
name or note is in it.
## Plan in snapshots of the pitch — 2026-09-26

The Plan tab only offered "Plan the game": the app drew up blocks from planned
minutes, ratings and pairings, and the coach could take it or leave it. There
was no way to make your own plan, and the result read as a list of names and
times rather than the pitch a coach actually has in her head.

The tab is now built around **snapshots**: each one is the pitch in this game's
shape, from a given minute. Plan kick-off by tapping a spot and then a player
(the next empty spot is picked for you, so a lineup is one tap per player), or
tap a player on her own to drop her in the open spot that suits her best. Tap
two spots to swap them. **Add** copies the current snapshot ten minutes on — or
to the next half if that comes first — and −5/−1/+1/+5 move it. Each snapshot
shows what it changes from the one before (on, off, and moves), and the Minutes
card shows what every player gets if the snapshots are followed, against her
target. "Put this on the pitch now" and the live "Make these subs" work from
the same snapshots.

Snapshots are the same `matches/{id}/plan` blocks the auto planner already
wrote (`start`, `ids`, `assign`), now with `manual: true`; the editor rebuilds
`ids` from `assign` on every save so the two cannot disagree. Projected minutes
are worked out from the blocks (`planSeconds()`) rather than read from the
stored `projected`, so a hand-edited plan cannot contradict its own totals, and
blocks are read through `planBlocks()` because the database hands a gapped
array back as an object. The auto planner stays as **Build one for me**, a
first draft to edit, and asks before replacing snapshots you made. A game with
no shape is asked to pick one, since there are no positions to plan around.
`test/plan.js` covers the editor.

## A game can have its own shape, and 2-5-1 is a preset — 2026-09-26

A team could already save its own shapes, but a game only ever got a frozen
copy of one, picked from a dropdown when the game was created. To play a shape
that wasn't saved, you had to leave the game, build it under team settings,
come back and re-pick it. And the shape we actually play, 2-5-1 with a keeper,
wasn't one of the 9v9 presets.

- **2-5-1 is a 9v9 preset**: GK, two backs, LM/LCM/CM/RCM/RM across the
  middle, one striker.
- **Edit a game's own shape.** The Pitch tab has an "Edit shape" button under
  the pitch that opens the same drag-and-rename editor, pointed at
  `matches/{id}/formation` instead of a team shape. From there you can move
  spots, rename them, add or remove them, start again from any preset for the
  side size, or save a copy back as a team shape. Links to it are
  `#/team/{t}/game/{m}/shape`.
- **"Build my own for this game…"** in the new-game and game-details shape
  picker saves the game and goes straight to that editor.

It edits the game's copy only. The team's saved shapes are never touched, and
because stints are what decide who is on the pitch, moving or even removing a
spot someone is standing in never takes her off or changes her minutes. The
spot just gets its new name or place, or loses its label. `test/stints.js`
checks exactly that. Like subs, the editor is for coaches of the team only.
Trackers, parents and read-only viewers don't get the button, and the route
shows nothing for them.

## The game plan gets its own tab — 2026-09-26

The block-by-block game plan ("Plan the game", the next change, the full plan,
projected minutes) was only reachable from a card at the very bottom of the
Pitch tab, under the pitch, the players on it and the bench. On a phone that
is far enough down that it read as gone.

A game now has a **Plan** tab next to Live, Track, Stats and Pitch. It shows
the plan inline rather than in a sheet — next change with its "Make these
subs" button, every block, projected against planned minutes — alongside the
planned minutes themselves and who is unavailable, which is what you set
before building one. The plan is the same data as before (`matches/{id}/plan`
and `planned`); nothing about how it is built or stored changed, and the card
on the Pitch tab stays. The block list and projection moved into
`planDetail()` so the sheet and the tab draw the same thing. Like Live and
Pitch, the tab is for coaches only; trackers and parents do not see it.
Links to it are `#/team/{t}/game/{m}/plan`.

## Club crumb goes to the team list, not straight to settings — 2026-09-20

For an admin, tapping the club button in the crumb bar (`crumb-club`) jumped
straight into Club admin/settings, skipping the team list entirely — there was
no way to reach it from there except editing the URL hash by hand. A coach
running more than one team had no button left to switch teams.

The crumb now always opens the team list (`viewClub()`), which every account
could already reach and which already listed every team the account can see.
The "Club settings" button that used to sit at the top of that screen for
admins now sits at the bottom, after the team cards and "Add a team" — so
switching teams is the first thing an admin sees, and settings is one tap
further down rather than the landing page.

## Tests that can actually fail — 2026-09-20

### Four of the seven checks could never go red

`roles.js`, `routing.js`, `visibility.js` and `version.js` had no assertions and
no exit code. They printed their expectations next to whatever they got —
`(expect false)`, `all round-trips: FAIL`, `all agree: NO — 47 / 19` — and
exited 0 either way. `version.js` also read `index.html` from the working
directory, so it only worked when run from the repository root and silently
found nothing anywhere else.

That is worse than having no test. `CLAUDE.md` names `version.js` as a required
check after every change to `app.js`, so the instruction was being followed and
the drift it exists to catch would still have shipped. They assert now, and the
prose they printed is unchanged — it was already a decent description of what
each case means.

### The invariants are enforced rather than remembered

`CLAUDE.md` lists six invariants and four auth/sync races that were found and
fixed once. Nothing checked any of them. Four new suites do:

`clock.js` moves the wall clock and requires that a closed period does not
budge, which is the whole of the `s.end || now` rule. `stints.js` deletes
`positions` in the middle of a game and requires that nothing about who is on,
or for how long, changes — a test that only read `onField()` would pass even if
the two were wired back together. `stats.js` stringifies the published document
and fails if any roster name appears in it, because `public/` is world-readable
and a name reaching it is not a display bug. `sync.js` covers the races.

Two pieces of rig made the rest reachable. `test/fakebase.js` stands where
Firebase stands, so `initAuth()`, `initSync()` and the `wireBase()` closure
inside it run for real against listeners the test can hold, delay and refuse —
none of that could be called directly. And the harness keeps the click handler
`app.js` installs on `document` instead of discarding it, which is the only door
to the hundred-odd actions that are inline branches in that one listener;
`repair` and `retire` are tested through it.

Each new check was confirmed by breaking the thing it guards and watching it go
red: removing `await authReady`, removing the uid-change reattach, caching the
resolved app instead of the in-flight promise, dropping `canAdmin()` from the
retire handler, and pointing `onField` back at `positions`.

### One invariant is currently violated, and is pinned

`CLAUDE.md` says the connect-time workspace read "must never replace [local
state] wholesale … a naive `state = snap.val()` at reconnect silently erases
it. See `wireBase()`." `app.js:446` is that assignment. `mergeNode()` is wired
into the per-child listeners below it and not into this first read, so a game
tracked with no signal — which exists only in local state until it syncs — is
dropped on reconnect, and `saveLocal()` then writes the loss to disk.

Not fixed here. Changing how the workspace read merges is a change to the sync
model, and `CLAUDE.md` is explicit that the schema and the rules around it are
high-stakes rather than routine. It is pinned instead, by a `knownGap()` that
asserts today's behaviour and fails if it changes in *either* direction — so
closing the gap turns the suite red once, deliberately, and the fix is to
promote the case to an ordinary check.

### One command, and it runs in CI

`node test/run.js` runs every suite in its own process — they each load `app.js`
into module scope and would otherwise tread on each other — and exits non-zero
if any fails. Asking for four separate commands is how one of them quietly stops
being run.

`.github/workflows/test.yml` runs it on every push and pull request, separate
from `deploy.yml`: that workflow holds the `pages` concurrency group and cancels
itself when a newer push lands, so a test job inside it would be cancelled
mid-run or hold a deploy open.

`test/harness.js` collects the stubbed DOM and storage that had been copy-pasted
into three files, so a fix to one of them no longer fixes one test. `smoke.js`
and `sandbox.js` now boot on it and their output is byte-for-byte what it was.

No dependencies were added. This stays a static site with no build step.

---

## Per-team writes, and a ruleset that cannot lock you out — 2026-09-20

The club is locked down, so the rules are now the thing standing between a
signed-in parent and every team's roster. They were not doing that job.

`access/index` answers "may this uid read the club", and both the team and match
write rules checked it — so every indexed account could write every team. A
tracker, a parent, a coach of a different age group: all of them could edit any
squad and any game. README called this out under "What is still not enforced"
and named the tracker half; the parent half was the same hole. Worse, anyone in
`access/index` could add anyone else to `access/index`, which is a grant of the
entire club to anybody already holding any role at all. And `public/{shareId}`
took a write from any signed-in account, not just the coaches of that team.

All three are closed. `access/teamIndex/{teamId}/{uid}` carries `'coach'` or
`'tracker'` — different permissions, so different values — and the rules read it
in the single direct hop a rule is capable of. `shareOwners/{shareId}/{uid}` is
AUTH.md's design for the public write hole, step 4 of its build order. The index
clause that allowed the escalation now allows only self-removal, which was its
real intent.

**The ruleset is safe to paste before the app has caught up.** Neither lookup
table exists on a club locked down before they were invented, and a rule that
needed one would refuse every write the moment it was published — the exact
lockout README keeps warning about. So each per-team and per-share rule falls
back to the old club-wide behaviour *while its table is missing*, and stops the
instant it appears. Nothing to sequence. The app closes the bridges itself: an
admin's device writes `teamIndex` on its next connect, and a share claims its
owner list on its next publish.

Two things were already broken under the rules as published, found by running
the app's actual write paths through the harness:

- `pushAll()` set the whole `workspaces/{code}` node in one call, and there is
  no `.write` at that level — only on its children. So creating a club was
  refused outright, which includes every test club. It now writes each child at
  the depth its rule sits at, in the order the rules can grant: admins while
  empty, then the index every other rule consults, then the data those authorise.
- `initSync()` subscribed to the whole `retired` node, where `.read` is granted
  only on `retired/{code}`. Refused, with an empty error handler, so the owner's
  "Retired clubs" card silently never appeared — the one escape hatch README
  promises for exporting a closed club. It now reads the codes this device
  already knows, which is what the rules grant.

**Club settings → Check readiness** now exists, which README has described for a
while without it being built. Six lines, each one a way to lock the club out,
and a button that writes both lookup tables on demand.

## One ruleset to paste, in one place — 2026-09-20

Locking down meant merging three separate JSON blocks out of README by hand —
the main one under "Locking it down", plus `retired` and `appOwners` from the
sections that explain them. Publishing a partial set is how a club ends up half
locked down, and "where do I find the rules" should not have three answers.

README now carries the complete ruleset as one block, and `node test/rules.js`
reads that block, so the thing tested and the thing pasted are the same text.
The fragments stay where they are, because they belong to the prose that
explains them, but they are labelled as explanation and the harness asserts
they still match the complete set — the prose and the published rules can no
longer drift apart unnoticed.

Corrects a recommendation the harness made yesterday. It suggested fixing the
owner's missing "Retired clubs" card by opening `.read` on the `retired` node
itself. That would hand every reader the code and name of every retired club,
and while the open rules are published a workspace code *is* the password to
that workspace — the obvious rules fix trades a missing card for a real leak.
It belongs in the app: read `retired/<code>` for the codes the device already
knows locally, which the rules already grant.

No rule changed behaviour in any of this.

## Signing out now means something — 2026-09-20

Signed out of a club that has an admin, the app went on showing that club's
teams from the local cache until the database got around to refusing the read
— about three seconds, because `wireBase()` retries twice with backoff before
it concedes. A refresh bought another three seconds. The names of children were
on screen for the whole window, and so was the club and team name in the
crumbs, which the lock screen never cleared because crumbs are drawn before
`render()` takes its early return.

Underneath it was worse than a timing window. `myTeams()` and `canEditTeam()`
both opened with `if (!me || !anyAdmins())` — written to keep a fresh club from
locking itself out before anyone has a role, but `!me` means *signed out*, so a
signed-out visitor fell into the same branch as a brand-new club and got every
team, **editable**. Not a flash of stale data: the full coach interface.

Rendering the cache is now gated on `needsSignIn()` at the top of `render()`,
which also blanks the crumbs and hides the tab rows, and `myTeams()` /
`canEditTeam()` share one `gated()` predicate with it so the team list and the
lock screen cannot disagree. The bootstrap is kept deliberately: a club with no
admin, or a device with no Firebase config and therefore nowhere to sign in,
stays open, because a lock screen there is a dead end rather than a protection.

The local copy is **not** cleared on sign-out. It is what makes the app work at
a field with no signal, and a game tracked offline lives only there. What
changed is that holding it and drawing it are now separate decisions.

That leaves one problem: Firebase Auth restores a session only once its module
has loaded from the CDN, which does not happen offline, so gating on it alone
would show the lock screen to the coach the club belongs to — exactly when she
needs it. So the signed-in identity is cached in `sm.me` and cleared on
sign-out. It grants nothing; the rules still decide what a uid may touch.

This is a client-side gate. It stops the app showing a cached club to a
signed-out device. Who can read the database directly is the rules' job, and
the cached copy is still in localStorage for anyone with devtools.

## Somewhere to work on auth that is not the live club — 2026-09-19

### A tracker could not open the Track tab

`render()` chose the view with `roleNote + roNote + v === 'game' ? …`, and `===`
binds looser than `+`. The condition was therefore `(roleNote + roNote + v) ===
'game'`, not `v === 'game'`. With both banners empty those are the same thing,
which is why nobody caught it: an admin, or a coach on her own team, never sees
a banner.

Anyone who does see one got two failures at once. The banner never reached the
page, because the comparison swallowed it. And the comparison could no longer
match `'game'`, so the chain fell through to its default and rendered the games
list — a tracker tapping into a game landed back on the list she came from, with
the Track screen, the only screen her role exists for, unreachable. Parents got
the same, and so did a coach reading another team in the club, which is the
banner `AUTH.md` explicitly asks for.

### Rules can be tested before they are published

`node test/rules.js` evaluates the rules JSON **as README publishes it** against
a mock club, for a signed-out visitor, an admin, a coach, a tracker, a parent, a
registered account with no role, an unknown account and the app owner.

Rules were the one change here with no safe rehearsal: the only live test was
publishing over the real club, and the failure README warns about is silent —
the bootstrap clause keeps reads working while every write is refused, so a club
goes read-only and nobody learns that until someone tries to make a sub.

It found one immediately. `.read` sits on `retired/$code`, which grants each
marker on its own and never the parent node, and `initSync()` subscribes to the
whole `retired` node with an empty error handler. Under the locked-down rules
that read is refused, so the owner's "Retired clubs" card — README's promised
escape hatch for exporting a closed club — silently never appears. Four further
disagreements between the interface and the rules are printed at the end of the
harness rather than fixed, since each is a decision rather than a bug.

### A test club, and a second database to put it in

**Setup → Workspace → Make a test club** (app owner only) seeds Sandbox FC: two
squads of invented names, four games with one in progress, and three people
waiting in `access/members` with no roles yet — the state a real club is in when
README's lockdown steps begin. Every screen carries a warm banner, and
publishing is refused inside it, so a seeded game can never overwrite a
`public/` node that real families are reading.

That isolates data but not rules, because rules belong to a database rather than
to a club. So **Setup → Workspace → Database** switches which Firebase database
the app talks to, declared in `firebase-config.js` as `SOCCER_FIREBASE_ENVS`. A
second Realtime Database in the same project has its own rules and keeps the
same Auth, so the real accounts can be used; a separate project works on the
free plan but brings its own uids. Local copies are namespaced per database, so
the same code opened in a test database cannot overwrite this device's copy of
the real season.

### Tests that can run, and that fail when they should

All five test scripts resolve `app.js` as `__dirname/../app.js`, but the last
upload put them at the repository root, so every one read `/home/user/app.js`
and died with `ENOENT` before executing a line — including the two `CLAUDE.md`
requires after every change. Moved back into `test/`.

`test/smoke.js` asserted only that rendering did not throw, which is why the
`render()` bug above survived it. It now reads `#app` back and checks that a
coach, a tracker and a parent each reach the game screen with the banner their
role should show. It also exits non-zero on that check and on a boot crash;
`CLAUDE.md` has always said it must exit 0, and until now it did so
unconditionally, including when it printed `BOOT CRASH`.

`AUTH.md` is now in the repository. `CLAUDE.md` had pointed at it throughout
without it ever being committed.
