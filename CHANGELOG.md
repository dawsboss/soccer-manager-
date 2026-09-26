# Changelog

Newest first. Each entry says why, not just what.

This file starts here: `CLAUDE.md` has always asked for an entry per shipped
change, but the changelog itself was never in the repository, so everything
before this point lives only in the git log.

---

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
