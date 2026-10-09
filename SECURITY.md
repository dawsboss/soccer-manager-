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

SEC-1 is done (SEC-D9 below).

### SEC-12 · The coach's notes are coaches' and admins' only
- **Status:** To do · **Kind:** Code (server, app), then rules · **Size:** Medium
- **Decided 2026-10-09 (the owner):** a coach's `note`, `rating`, `pairs`
  and `avoid` on a child are read by coaches and admins only. No one else:
  not trackers, not her family, not the player herself, and not the new
  roles in AUTH.md, *More kinds of people*.
- **Why:** on `orgs/` they sit on the child's own record,
  `squad/{tid}/{pid}`, which her family and the player read. A note like
  "keep away from #9" or a low rating reaching the family is the kind of
  thing that ends up in a parents' group chat.
- **Plan:** AUTH.md, *The coach's notes come off the child's record
  first*: a `coachNotes/{tid}/{pid}` node with its own readers, moved
  there by the server, written there by the phone through `clubPath()`,
  and refused on `squad/` afterwards.
- **Done when:** `test/rules.js` refuses a family, a player and a tracker
  the notes on both trees, `test/orgs.js` finds none on a family's phone,
  and the coach still sees and edits them.

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

### SEC-10 · Only the server publishes share pages
- **Status:** To do · **Kind:** Code (server, app), then rules · **Size:** Large
- **Why:** any signed-in Google account can claim an unused id under
  `shareOwners`, publish a page at `public/{id}`, and send round
  `live.html?t={id}`, which this site will draw. Since SEC-D4 it cannot run
  code, and since SEC-4 it cannot take over a real page's id, but it can show
  a made-up fixture ("Saturday's game is cancelled, meet at…") under the
  club's own address. The hole exists because phones publish: the rule has to
  let a coach's phone write `public/`, and it cannot tell a coach from anyone
  else for an id no club has claimed yet.
- **The decision (the owner, 2026-10-08):** phones stop publishing. Only the
  server writes `public/`, and the rule becomes `.write: false`. A fake page
  then cannot be made at all, so nothing needs labelling or sweeping, and
  `shareOwners` (and `claimShare()`, `claimTeamIds()`, the publish debounce)
  goes. Labelling pages instead was considered and dropped: it leaves the
  hole open and only warns about it.
- **Why the phone can give this up.** It was kept on the phone because the
  sideline phone is the only place a live score exists (SERVER.md, *The share
  pages*). But that phone already writes every goal, sub and clock change to
  the workspace, so a trigger hears it at the same moment the phone could
  have published, a second or two later at most. It is more reliable, not
  less: `publishTeam()` writes `public/` directly, outside the outbox, so a
  page closed with no signal loses that publish; the workspace write behind
  it survives in the outbox and the server publishes when it lands. Nothing
  at the sideline waits on the server either way.
- **What to do:**
  1. *Server:* `functions/mirror.js` already writes a team's entries and a
     game's when and where. Give it the rest of `publicDoc()` and
     `fixtureDoc()` (score, the squad by number, minutes, the log, stats,
     a new game added, a deleted game's page taken down), held to the app's
     own functions as the calendar half is. Wake on the parts of a game play
     writes (goals, stints, periods, shots and the like, each under its own
     id) rather than the whole game, so a tap reads only that game, once.
     A test club and a retired club are still never published.
  2. *Server:* My calendar's page is already built by `functions/mycal.js`;
     its phone fallback (`feedPublish()` until it sees `by: 'server'`) goes.
  3. *App:* stop writing `public/` (`schedulePublish()`, `publishTeam()`,
     `feedPublish()`, `claimShare()`, `ensureFixtureShares()`'s publishing);
     the share sheet reports what the server last wrote (`updated` on the
     page) instead of the phone's own write. Making the ids
     (`teams/{tid}/share`, a game's `share`, `calFeed`) stays on the phone,
     in the workspace, under the team's rule.
  4. *Rules,* once phones on the old build are gone (families are not on
     yet, so that is soon): `public/$share` `.write: false`, `shareOwners`
     removed, the rules version raised. An old phone's publish is then
     refused, which costs nothing: the server has already written the page.
- **Done when:** `test/mirror.js` publishes a live game's score, minutes and
  log from the workspace writes alone, item for item the same as the app's
  `publicDoc()`, `fixtureDoc()` and `publicGame()` with no child's name;
  `test/stats.js` finds no `public/` write from the phone; `test/rules.js`
  refuses a `public/` write from every kind of account, an admin included;
  SERVER.md's *The share pages* says it moved.

### SEC-11 · Firebase App Check
- **Status:** To do · **Kind:** Owner, then code · **Size:** Medium
- **Why:** it lets only this app, on this site, talk to the database. It cuts
  scraping and scripted abuse (the unclaimed-id pages, until SEC-10 closes them; a script
  hammering `claims` or `invites`); it does not stop a real person signed in
  through the real app, so it is a fence round the rules, never instead of
  them.
- **What to do:**
  1. *Owner:* create a reCAPTCHA Enterprise key for the site's domain, then
     Firebase console → *App Check* → register the web app with it. Leave
     enforcement **off**.
  2. *Code:* the key's public half goes in `firebase-config.js` beside
     `SOCCER_PUSH_KEY` (`SOCCER_APPCHECK_KEY`, not a secret); blank means
     App Check is not started, which is what keeps every test suite, a club
     running with no Firebase, and local development working. `getApp()`
     starts it (`firebase-app-check.js`, same SDK version, 10.12.2) before
     the database is opened, with `isTokenAutoRefreshEnabled: true`; and the
     same in `live.js` for the share pages, which read the database too.
  3. Do SEC-3 first, or in the same change: the Content-Security-Policy has to
     allow reCAPTCHA's script and frame (`www.google.com/recaptcha/`,
     `www.gstatic.com/recaptcha/`) or App Check fails silently.
  4. *Owner:* watch App Check's metrics for two weeks of real use, sideline
     phones and home-screen iPhones included, until unverified requests are
     only ones nobody can account for.
  5. *Owner:* enforce for **Realtime Database** only.
- **What must not be enforced:** the `calendar` function. Its callers are
  Google, Apple and Outlook fetching a subscribed feed, which can never carry
  an App Check token; enforcing it would empty every subscribed calendar. The
  other functions are database triggers and a schedule, which App Check does
  not touch; the server writes with admin credentials and is not affected
  either. A future callable function (`GOTSPORT.md`'s payments) takes it
  from the start.
- **Offline:** the phone gets a token when it has signal and keeps it for its
  lifetime (an hour by default; the console can lengthen it). With no signal
  nothing is sent anyway, and the outbox resends once a fresh token is had,
  so this adds no new way to lose a write. Check this on a phone before
  step 5: a page left open overnight, then a goal tapped in airplane mode,
  then signal back.
- **Done when:** enforced on the database, with the metrics showing nothing
  refused that the app sent; a test holds `getApp()` to starting App Check
  only when the key is set; and the calendar feed still answers a plain
  `curl`.

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
- **A path into a club goes through `clubPath()`** (the server's
  `functions/club.js`), never `'workspaces/' + code`: on a moved club the
  squad, members and log are elsewhere and read by fewer people, and a write
  aimed at the old tree is refused. Nothing a family may not read goes in
  `roster/`, `names/`, `teams/`, `matches/` or `rsvp/`.
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

### SEC-D8 · Admins cannot remove one another: a club owner
Any admin could rewrite the whole admin list, or take another admin's
`access/index` entry and shut her out of the club. Now a club owner
(`access/owners/{uid}`, always an admin too, a list) is the only one who
takes an admin away, takes an admin's index entry, makes or removes another
owner, or retires the club; admins still appoint admins and step down
themselves, and nobody but an owner herself ends her ownership. Whoever
starts a club owns it; a club from before this keeps the old rules until one
of its admins taps *Become the club owner* (Club settings → People), the
owner's decisions of 2026-10-08. On both trees, carried across by the move,
rules version 13. The server (`functions/adminwatch.js`) pushes every admin
or owner change to every admin and owner, the person it happened to
included and never whoever did it (named from a fresh `access/log` entry,
which the app now writes before the change, and with its real name: it used
to log *made admin* for a removal), unmutable, and keeps it at
`clubAudit/{code}`, which admins read and no phone writes (`test/rules.js`,
`test/owners.js`, `test/move.js`). Build 113.
*Owner* step, once rules version 13 is published: open Club settings →
People and tap **Become the club owner** before anyone else, then make a
second admin an owner. It does not stop an admin deleting teams or games;
that is SEC-7's backups.

### SEC-D9 · Keep the squad out of parents' reach
Everyone with a role in a club used to read all of `workspaces/{code}`, so a
parent's phone held every child on every team, the coach's notes and
ratings, and every member's email; the screen only chose not to draw them.
On `orgs/{code}` each part of a club has its own readers: a family reads her
own children's records, the others' shirt numbers (`roster/`) and the
staff's names (`names/`), never anyone's notes, ratings or email; the access
log is the admins'. Built in build 110 (`test/rules.js` both passes,
`test/orgs.js`, `test/move.js`; AUTH.md, *The move to `orgs/{orgId}`*), and
every club moved by 2026-10-09 (the owner). What is left is tidying, not
security: a fortnight on (from 2026-10-23), the old tree comes out of the
rules and the server (AUTH.md, build order step 5).
