# Security

What still needs locking down, as separate tasks, and what has been done.
CLAUDE.md asks for this file to be read before touching auth, access, sharing
or the data model; `AUTH.md` is the design those rules come from, and
`node test/rules.js` prints what the database rules knowingly leave open.

**How to use it.** Each task stands on its own: take one, do it on its own
branch with its tests, add a `CHANGELOG.md` entry, then move it to **Done**
below with the commit. A task marked *Decision* waits on the owner before any
code; one marked *Owner* is a setting in Google, Firebase or GitHub that only
the owner's account can change, and needs no code.

Families are not using the app yet (the owner, 2026-10-08), so the tasks
under **Before families come on** can be done without disturbing anyone.

---

## Before families come on

### SEC-1 · Keep the squad out of parents' reach
- **Status:** Decided, designed, not built · **Kind:** Code · **Size:** Large
- **Decided 2026-10-08:** the full `orgs/{orgId}` move, under the same id as
  the workspace code. The design, its build order and the four smaller
  decisions (all settled the same day) are in `AUTH.md`, *The move to `orgs/{orgId}`*.
- **Why:** everyone with a role in a club reads all of `workspaces/{code}` at
  the database. A parent's phone holds every child on every team, with the
  coach's note on each, their ratings and who to keep apart, and every
  member's name and email (`access/members`). The app shows her other children
  by shirt number (`shownName()`), but that is the screen's choice: the data
  is on her phone and readable with a browser's developer tools.
- **What to do:** `GOTSPORT.md` (*Protecting the data*, build order step 3)
  and `AUTH.md` (*Migration*) already say this happens before families come
  on. Write the design into `AUTH.md` first: either the full `orgs/{orgId}`
  move, or only a squad node readable by a team's coaches, trackers and the
  club's admins, with a parent reading her own child's record and the rest by
  number. Then the rules, the app's reads and a migration, tried on the test
  club first.
- **Done when:** `test/rules.js` refuses a parent's read of another child's
  record, notes and the member list; `test/parents.js` passes against data a
  parent's phone actually receives, not what it hides.

---

## Settings to change (no code)

### SEC-5 · Protect `main` on GitHub
- **Status:** To do · **Kind:** Owner · **Size:** Minutes
- **Why:** a merge to `main` publishes the database rules and the server for
  every club (`.github/workflows/server.yml`).
- **What to do:** GitHub → the repository → *Settings → Rules → Rulesets* (or
  *Branches → Branch protection*): on `main`, require a pull request and the
  *Tests* check (`.github/workflows/test.yml`) passing, and block
  force-pushes and deletion.
- **Done when:** a direct push to `main` is refused.

### SEC-6 · Deploy without a stored key
- **Status:** To do · **Kind:** Owner, with a small workflow change · **Size:** An hour
- **Why:** `FIREBASE_SERVICE_ACCOUNT` is a long-lived Google key with
  *Editor* on the whole project. If it leaked, so would every club's data.
- **What to do:** set up Google's *Workload Identity Federation* for this
  repository, so GitHub signs in for each run without a stored key; give the
  account only the roles a deploy needs (README, *Deploying the server*);
  change `server.yml` to sign in that way; then delete the old key and the
  secret.
- **Done when:** a deploy works with the secret removed, and the service
  account has no keys listed in Google Cloud.

### SEC-7 · Daily database backups
- **Status:** To do · **Kind:** Owner · **Size:** Minutes
- **Why:** the way back from a bad import, a bug, or someone with admin
  rights deleting things. *Download a copy* only helps if somebody remembered.
- **What to do:** Firebase console → Realtime Database → *Backups* → turn on
  daily backups (needs the Blaze plan, which the server already uses).
- **Done when:** the console lists a backup from the last day.

### SEC-8 · Sign-in settings
- **Status:** To do · **Kind:** Owner · **Size:** Minutes
- **Why:** an admin's account is the club.
- **What to do:** Firebase console → Authentication → *Settings*: turn on
  *email enumeration protection*, and check *Authorized domains* lists only
  this site and the Firebase ones. Ask every admin to turn on 2-Step
  Verification for their Google account.
- **Done when:** both settings are on and each admin has confirmed.

---

## Later

### SEC-9 · Every admin hears when the admin list changes
- **Status:** To do · **Kind:** Code (server) · **Size:** Medium
- **Why:** any admin can rewrite the whole admin list
  (`access/admins` has one rule at the top), so one admin account taken over
  removes the others and owns the club. The rules cannot tell a rightful
  removal from a hostile one.
- **What to do:** the `accessAdmin` trigger (`functions/access.js`) already
  wakes on every change. Have it push a notification to every admin, the
  removed one included, and keep a record of every role change somewhere no
  phone can write, readable by admins.
- **Done when:** `test/access.js` shows each admin told of an admin added or
  removed, and the record written; nobody else told.

### SEC-10 · Share pages nobody in a club owns
- **Status:** To do · **Kind:** Decision, then code (server) · **Size:** Medium
- **Why:** any signed-in Google account can publish a page under an id nobody
  has claimed, and `live.html?t=…` will show it on this site. Since SEC-D4 it
  cannot run code, but it can show made-up fixtures ("Saturday's game is
  cancelled") under the club's address.
- **What to do:** decide between a server trigger on `public/{id}` that
  removes a page whose owners are not a coach or admin of any club (and is
  not one person's own My calendar page), or the share page saying plainly
  which club and team published it.
- **Done when:** a test publishes a page from an account with no role and it
  is gone (or labelled) by the next check.

### SEC-11 · Firebase App Check
- **Status:** To do · **Kind:** Code and Owner · **Size:** Medium
- **Why:** it lets only this app, on this site, talk to the database and the
  functions. It cuts scraping and scripted abuse; it does not stop a real
  signed-in person.
- **What to do:** register the site for App Check (reCAPTCHA Enterprise) in
  the console, add it to the app and the share pages, watch the metrics for a
  couple of weeks, then turn on enforcement for the database and functions.
- **Done when:** enforced, with nothing refused that the app should be
  allowed.

---

## Known and accepted

`node test/rules.js` prints the things the rules deliberately do not enforce,
and why: a tracker can write more of a game than the screen offers; the app
owner has no standing in the rules; a brand-new club code is claimed by
whoever writes it first; an invite with no email on it works for whoever
opens it first, until it is spent or two weeks old; bookings and registers
are readable across the club; shared busy times can be read by anyone signed
in who knows the account id; and a rule cannot count seats or package
places. Read that list before treating a refused or allowed write as a bug.
Anything a phone already showed someone can be screenshotted, and a device
clock turned back gets past `OFFLINE_DAYS`; no app can stop either.

---

## Rules for new code

- **A link built from data is `https` or nothing.** `esc()` keeps a link
  inside its quotes; it cannot stop a `javascript:` address. Use `linkOk()`
  (as `normDrill()` and `veoIn()` do) wherever a stored address becomes an
  `href` or `src`, and never take an address from a `public/` page.
- **Text bound for `public/` goes through `pubText()`**, and nothing about a
  child (name, note, answer, booking) goes there at all.
- **A function that acts for someone checks them** against the same lookup
  tables the rules read, and is tested for every kind of account; a function
  that writes what the rules read never starts a table that is missing
  (CLAUDE.md, *Conventions* and the invariants).
- **A secret id comes from `randId()`** (`crypto.getRandomValues`), never
  `uid()`.
- **No inline script, ever**: no `on…=` handler, no `javascript:` address, no
  `<script>` in a template. The Content-Security-Policy refuses them, so one
  that works in a test does nothing on a phone. A new place a page loads from
  or talks to goes into the policy on all three pages, tried in Chromium.
- **Every rules change raises the version** and is reviewed as a change for
  every club.

---

## Done

### SEC-D1 · An unlinked parent loses access at once
The lookup tables the rules read are rebuilt by the server the moment a role
changes, not when an admin's phone next connects (`functions/access.js`,
`test/access.js`; `rules.js` gap 5). Commit `b8f0cb0`.

### SEC-D2 · Access taken away stays taken away offline
A refusal is kept on the phone, so turning off the signal and reloading no
longer brings the club back; the copy is cleared a day on, and a copy the
club has not confirmed in thirty days is not drawn (`copyCheck()`,
`test/sync.js`). Commit `8b22cad`.

### SEC-D3 · A family's calendar leaves the team with her
A team's calendar address is one for everybody and cannot be taken back from
one family, so it is shown only to the team's staff; families use My
calendar's feed, which the server builds from their roles and which drops a
team when they are taken off it (`functions/mycal.js`, `test/mycalfeed.js`,
`test/calendar.js`). Commit `cd4dd9d`.

### SEC-D4 · Two links that could run someone else's code
The share page's *Open in Minutes* took the app's address from the page,
which anyone signed in can write under an unclaimed id; it now builds it from
its own location. A game's Veo link is `https` or nothing, typed, imported
and drawn (`test/stats.js`, `test/import.js`). Commit `b0aabd5`.

### SEC-D5 · Only you, an admin, or a coach filling a gap changes your name
`access/members/{uid}` is her own or an admin's to change; a coach of any
team may only fill in an entry that is not there yet, which is all
approving a family does, with a narrower bridge for a club with no
`coachIndex` (`test/rules.js`, rules version 11). Commit `abab960`.

### SEC-D6 · A Content-Security-Policy on every page
One policy on `index.html`, `live.html` and `game.html`: scripts from this
site, Firebase's SDK, Google sign-in and the database's long-polling
fallback, never inline. Tried in Chromium against the live project (the
database both ways, Google sign-in, the service worker and push hosts, the
share pages), and an injected `javascript:` link, `onerror` and `<script>`
did nothing; `test/version.js` holds every page to it. Commit `fa45c9f`.

### SEC-D7 · Unguessable share, game, feed and club ids
Share links, game links, team and My calendar feeds and a new club's code
come from `randId()`, `crypto.getRandomValues`, with no `Math.random`
fallback; ids already handed out keep working until replaced
(`test/ids.js`). Commit `df08462`.
