# CLAUDE.md

Soccer minutes/substitution tracker. Static site (`app.js`, `index.html`, `styles.css`), Firebase Realtime Database backend, deployed to GitHub Pages. Built for a coach tracking subs on a phone at the sideline, often with no signal.

Read `HANDOFF.md` first if it exists and is current. Read `AUTH.md`, `ROADMAP.md`, `SECURITY.md` before touching auth, access, sharing, or the data model — they're design docs, not history, and `AUTH.md` says outright it was "written before any code, because the data model and the rules have to be right first — they are painful to change once twelve teams have data in them." Treat any schema change (`workspaces/{code}` today, `orgs/{orgId}` eventually) as high-stakes, not routine.

## Required after every change to app.js or index.html

- `node test/smoke.js` — boots the app in a stubbed DOM with no live Firebase connection and renders every view. Must exit 0, no exceptions.
- `node test/version.js` — checks that `BUILD` in `app.js`, the `<meta name="build">` tag in `index.html`, and both `?v=` query params (`app.js?v=`, `styles.css?v=`) all agree. If you bump one, bump all four to the same number.
- `node test/signout.js` — checks that a signed-out device renders nothing from a club that has an admin (page, crumbs and tabs), that the pre-lockdown bootstrap and the no-Firebase-config case stay open, and that the identity cache keeps offline working. Exits non-zero on a failure.
- `node test/sandbox.js` — seeds the test club and checks it holds together: finished games with a closed clock and no open stints, one live game, `onField` agreeing with the stints, publishing refused, and each database's local copies kept apart. Exits non-zero on a failure.
- Don't skip these because a change looks small. They're cheap and they're what catch a regression before it costs someone a Saturday.

## Required after every change to the rules in README.md

- `node test/rules.js` — evaluates the rules JSON *as README publishes it* against a mock club, for every kind of account. Exits non-zero on a failed expectation. Rules are the one thing here with no way to try it safely: the only live test is publishing over the real club, and the failure mode README warns about is silent (reads work, every write is refused). Run it before you paste anything into the Firebase console.

## Invariants — do not violate these

- **Stints are the only truth for who's on the pitch.** `onField(m, pid) = !!openStint(m, pid)`. `positions` holds nothing but x/y coordinates — never make it authoritative again, and never gate a feature on it.
- **Append-only vs. stateful, and they get different care.** Goals, shots, corners, fouls, possession, and stint records are each written under their own random id — concurrent taps are safe by construction, no work needed. The clock (`periods/{i}/end`) is read-modify-write and is where real races live.
- **`elapsedSec()`/`playedSec()` use `s.end || now` for whichever period is still open.** Closing that period's `end` is what freezes the match's clock math — this is why `endGame()` must close the open period (and, as a polish beyond the strict minimum, every open stint) before setting `ended`. Don't "fix" a drifting-minutes bug anywhere except here.
- **Roles are derived from where a uid appears** (`access/admins/{uid}`, `access/index/{uid}`, and eventually `orgs/{o}/admins/{uid}` etc.) — never stored as a string on a user. A string role is a second source of truth that goes stale the moment someone changes team.
- **Holding the local copy and drawing it are two different decisions.** The cache exists so a coach with no signal still has her squad, so it is *not* cleared on sign-out — an unsynced game lives only there. But once a club has an admin, a signed-out device must render nothing: no roster, no team, and no crumbs, since those carry the club and team names. Gate on `needsSignIn()` at the top of `render()`, never on the database refusing the read — that answer arrives seconds later, and the names are on screen the whole time. `myTeams()` and `canEditTeam()` must agree with it, via the same `gated()` predicate.
- **A signed-in identity is cached locally (`sm.me`) and cleared on sign-out.** Firebase Auth only restores a session once its module has loaded from the CDN, which does not happen at a field with no signal, so without this a locked-down club shows its lock screen to the coach it belongs to. It is not a permission — the rules decide what a uid may touch. Clearing it on sign-out is what makes signing out bite immediately.
- **The connect-time workspace read merges into local state; it must never replace it wholesale.** A game tracked fully offline exists only in local state until it syncs — a naive `state = snap.val()` at reconnect silently erases it. See `wireBase()` in `initSync()`.
- **Never reach for anonymous auth as a shortcut for the public share write hole.** Anonymous uids are per-device: two coaches get two different ids, clearing browser storage locks a coach out of her own share. `AUTH.md` says this explicitly — don't relitigate it.

## Auth/sync races already found and fixed once — don't reintroduce them

- `initSync()` must wait for Firebase Auth's first `onAuthStateChanged` callback (`authReady`) before reading the workspace. A read that races ahead of auth gets denied by a uid-keyed rule even for someone who's signed in a moment later, and that denial used to stick because the read only ever ran once.
- Reattach the workspace read whenever the signed-in uid changes *after* boot too (e.g. someone signs in from the lock screen following an earlier denial) — not only at the very first auth callback.
- `getApp()` must not let two concurrent callers (`initAuth()` and `initSync()`) both call `initializeApp()` — cache the in-flight promise, not just the resolved app, or the second call throws and silently kills whichever init lost the race.
- The retire-club action must check `canAdmin()` inside the click handler itself, not just rely on the button being hidden from non-admins in the render.

## Roadmap ordering

See `ROADMAP.md` for full detail. Work in this order unless told otherwise — later items assume earlier ones hold:

1. **Concurrent edits** — mostly done. Derived `positions` and the anomaly banner (`anomalies()` / `repair` action) already ship. What's left, if anything, lives in the invariants above.
2. Tracker stamps, Track layout rework, bulk editing polish.
3. **Roles and organisations + "stamps become identities"** (`AUTH.md`) — these are one project. Do not build them separately; the doc says so explicitly.
4. Shareable read-only pages, then the Cloudflare Worker — only if live scores need to render *inside* a text message preview, not just on the page.

Don't jump ahead to identity/org work while a "Now — correctness" item is still open.

## Current known gaps

- **No in-app path to connect a brand-new device to a workspace.** The "join by code" UI was removed ahead of `AUTH.md`'s invite system, which isn't built yet. `Setup → Workspace` has an owner-only (`isOwner()`-gated) escape hatch in the meantime — don't remove it until real per-person invites exist.
- **Per-person email invites** (`invites/{code}` + Firebase's `sendSignInLinkToEmail`) are designed in `AUTH.md` but not implemented. No Cloudflare Worker or custom email server is needed for this specific feature — Firebase Auth sends the magic-link email itself.
- **This is a client-side gate, not a database one.** `needsSignIn()` stops the app showing a cached club to a signed-out device. It does nothing about who can read the database directly — that is entirely the rules' job, and while the *open* rules are published anyone holding the workspace code can still read everything. The cached copy also remains in localStorage, readable with devtools; signing out makes the app respect it, it does not encrypt it.
- **The interface and the rules disagree in five places** — `node test/rules.js` prints them at the end. Among them: any indexed account can write any team (parents included), anyone in `access/index` can add anyone else to it, the app owner has no standing in the rules at all, and `initSync()` reads the whole `retired` node when the rules only grant `retired/$code`, so the owner's archive list silently never appears. Read that list before treating a refused write as a bug.
- **The full `orgs/{orgId}` migration** (`AUTH.md` build order, steps 1–6) hasn't started. `workspaces/{code}` is still the live schema.

## Conventions

- Commit messages: short summary line, blank line, body explaining *why*, not just what — match `CHANGELOG.md`'s existing entries.
- Every shipped change gets a `CHANGELOG.md` entry.
- This stays a static site with a Firebase backend only — no server-side component, and the app itself must never call an AI model.
- Comments in this codebase explain reasoning, not just mechanics (see the invariants above for the tone) — keep that up rather than reverting to comments that just restate the line below them.
