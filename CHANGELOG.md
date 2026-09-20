# Changelog

Newest first. Each entry says why, not just what.

This file starts here: `CLAUDE.md` has always asked for an entry per shipped
change, but the changelog itself was never in the repository, so everything
before this point lives only in the git log.

---

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
