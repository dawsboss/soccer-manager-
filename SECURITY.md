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
- **Status:** To do · **Kind:** Decision, then code · **Size:** Large
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

### SEC-2 · Only you, an admin, or a coach filling a gap can change your name
- **Status:** To do · **Kind:** Code (rules) · **Size:** Small
- **Why:** `access/members/{uid}` (each person's name and email) can be
  written by anyone with a role in the club, so a parent can rename the admin
  or a coach. Coach names on sessions, People and bookable times come from it
  (`personName()`).
- **What to do:** narrow the rule on `access/members/$uid` to: her own entry;
  an admin; or a coach of any team (`access/coachIndex`) writing an entry that
  does not exist yet, which is all `approveClaim()` does. Keep a bridge for a
  club without `coachIndex`. Raise the rules version (CLAUDE.md, *Required
  after every change to the rules*).
- **Done when:** `test/rules.js` refuses a parent, a tracker and a coach
  changing someone else's existing entry, and still lets every write the app
  makes through (`approveClaim()`, `redeemInvite()`, joining by team link,
  an admin's push).

### SEC-3 · A Content-Security-Policy on every page
- **Status:** To do · **Kind:** Code · **Size:** Medium
- **Why:** a safety net under every link and every piece of typed text. Data
  in this app is typed by many people and drawn with `innerHTML`; `esc()`
  covers text, but a missed `javascript:` link or an injected script would
  run on this site, where a coach's sign-in lives. A policy that allows
  scripts only from this site and Firebase's would have made both bugs in
  **Done** (SEC-D4) harmless.
- **What to do:** a `<meta http-equiv="Content-Security-Policy">` on
  `index.html`, `live.html` and `game.html` (GitHub Pages cannot send
  headers): scripts from `'self'` and `https://www.gstatic.com`; connections
  to the Firebase database, Auth and the functions; frames for Google sign-in;
  `object-src 'none'`, `base-uri 'self'`. No `'unsafe-inline'` for scripts;
  styles will need it for the `style=` attributes.
- **Done when:** checked in a real browser (Chromium is installed here):
  Google sign-in, the database, push and the share pages all work, and a
  `javascript:` link placed in a page does nothing. A test in
  `test/version.js` holds every page to having the policy.

### SEC-4 · Unguessable share, game, feed and club ids
- **Status:** To do · **Kind:** Code · **Size:** Small
- **Why:** invites and team links already use the browser's secure random
  generator (`secretId()`). Share links, game links, calendar feeds, My
  calendar's feed and a new club's code still come from `uid()`, which is
  `Math.random`, a generator not meant for secrets.
- **What to do:** make those ids from `crypto.getRandomValues` like
  `secretId()`: `teams/{tid}/share`, `teams/{tid}/calFeed`, a game's `share`
  (`ensureFixtureShares()`), My calendar's address (`setMyFeed()`) and
  `createClub()`'s code. Keep within what reads them: the feed's id check is
  6–80 letters, digits, `_` and `-` (`functions/calendar.js`), and the rule on
  `people/{uid}/set/feed` allows 6–40 characters.
- **Done when:** a test makes each kind of id and finds it comes from
  `crypto.getRandomValues`, is long enough, and passes the feed's and the
  rule's checks.

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

### SEC-9 · Admins cannot remove one another: a club owner
- **Status:** To do, decided (the owner, 2026-10-08; below) · **Kind:** Code (rules, app, server), then Owner · **Size:** Large
- **Why:** any admin can rewrite the whole admin list. `access/admins` has one
  rule at the top (`!data.exists() || data.child(auth.uid).exists()`), so a
  single admin account, taken over or fallen out with the club, can delete
  every other admin and own the club. She does not even need to touch
  `admins`: any admin may delete anyone's `access/index/{uid}`, which is the
  entry the club-wide read checks, so she can shut another admin out of
  reading the club while leaving her an admin on paper. The rules cannot tell
  a rightful removal from a hostile one, so the answer is someone the rules
  *can* tell apart: a club owner.
- **The design** (the four questions it raised are answered under
  *Decided* below):
  - **The role.** `workspaces/{code}/access/owners/{uid}: true`. An owner is
    always an admin as well, so not one existing rule has to learn a new role:
    owning adds powers, it never replaces `admins`. In code it is
    `isClubOwner()` and *Club owner* on screen, because "owner" already means
    the app owner here (`isOwner()`, `appOwners`) and the two must never be
    confused.
  - **What only an owner may do.** Take someone else's admin away; take an
    admin's `access/index` entry away; make or remove another owner; retire
    the club (`retired/{code}`). Everything else an admin does today, she
    still does, including making new admins.
  - **What an admin may still do to admins.** Appoint one (a new entry,
    `true`), and step down herself. She cannot remove another admin, and
    nobody but the owner herself can take an owner's admin entry away.
  - **Handing over.** An owner makes another admin an owner, then steps down.
    The app refuses the last owner stepping down ("Someone has to stay owner",
    as the last admin is refused today); a rule cannot count, so if it is
    done by hand the club falls back to today's rules (the bridge below),
    never to a club nobody can run.
  - **A lost owner account.** Recovered by the app owner by hand in the
    Firebase console, which is the only standing the app owner has (CLAUDE.md:
    she has none in the rules). Two owners is the better answer, which is
    why it is a list.
  - **The rules**, as a sketch (`W` is `'workspaces/' + $code + '/'`):
    ```
    "owners": { "$uid": { ".write": "auth != null
        && root.child(W + 'access/admins/' + $uid).exists()
        && ((!data.parent().exists() && $uid === auth.uid
             && !root.child(W + 'access/index').exists())               // a brand-new club only
            || (root.child(W + 'access/owners/' + auth.uid).exists()
                && (!data.exists() || $uid === auth.uid)))" } },     // add one; step down
    "admins": {
      ".write": "<today's rule> && !data.parent().child('owners').exists()",   // the bridge
      "$uid": { ".write": "auth != null && (
          !data.parent().exists()                                        // a new club's first admin
          || (root.child(W + 'access/owners/' + auth.uid).exists()
              && !root.child(W + 'access/owners/' + $uid).exists())     // an owner, about any non-owner
          || (root.child(W + 'access/admins/' + auth.uid).exists()
              && !data.exists() && newData.val() === true)               // an admin appoints
          || ($uid === auth.uid && !newData.exists()
              && !root.child(W + 'access/owners/' + $uid).exists()))" } }   // stepping down
    ```
    and on `access/index/$uid`, the admin clause gains *unless it removes the
    entry of another admin, which only an owner may*. `retired/$code` becomes
    owner-only once the club has an owner (the same bridge). Raise the rules
    version.
  - **The bridge.** A club with no `owners` keeps exactly today's rules: one
    clause on `admins` that switches off the moment `owners` exists. Clubs
    that predate this go on working when the rules are pasted before the app.
  - **Getting one.** A new club writes `owners/{me}` straight after
    `admins/{me}` (`createClub()` and the bootstrap in `claimadmin`, and
    `rules.js`'s brand-new-club walk), so whoever starts a club owns it. That
    write has to come before `index/{me}`: the first-claim clause holds only
    while the club has no `access/index`, which every club that already exists
    has, so no admin of an existing club can claim it, by the app or by hand.
    An existing club is given its owner in the console (decided below); until
    then the bridge keeps it on today's rules.
  - **Writes at the right depth.** `pushAll()` writes `access/admins` whole
    today; once a club has an owner that is refused, so it has to write one
    admin at a time (CLAUDE.md, *Write at the depth the rule sits at*), and
    `owners` likewise.
  - **Everyone hears.** The `accessAdmin` trigger (`functions/access.js`)
    already wakes on every admin change; add `accessOwner` beside it. Each
    pushes to every admin and owner of the club, *the removed one included*
    (her `pushTokens` are hers, not the club's), naming who did it from the
    event's auth context if the functions SDK gives one, else from the
    phone's matching `access/log` entry, trusted only while fresh, as the
    calendar's `edit` stamp is. This kind is not mutable: an account-security
    alert is not club activity. Each change is also written to
    `clubAudit/{code}/{id}` (a new root block: readable by the club's admins,
    `.write: false`, so only the server writes it). `access/log` stays as the
    phone's own diary; this is the copy an admin cannot leave out.
- **What it does not stop.** An admin can still delete teams, games and
  members, read every child's record, and invite whoever she likes. The
  owner stops a *takeover*, not vandalism; the way back from vandalism is
  SEC-7's daily backups plus the audit record saying who and when. Owners
  should have 2-Step Verification on before anyone else (SEC-8), since an
  owner's account is now the club.
- **Found while writing this:** `setrole` logs an admin change *after*
  `commit()`/`drop()` has already changed `state`, so `access/log` says
  *made admin* when someone was removed and *removed admin* when someone was
  added (`app.js`, the `setrole` handler, `logAccess(isAdmin(uid) ? …)`). The
  team-role branch reads `on` beforehand and is right. A one-line fix,
  worth doing on its own before this task.
- **Decided (the owner, 2026-10-08):**
  1. A list of owners, not exactly one.
  2. Admins still appoint admins.
  3. The existing club's owner is the app owner, set by hand. *Owner* step,
     after the rules are published: Firebase console → Realtime Database →
     `workspaces/{code}/access/owners/{her uid}` = `true` (her uid is the one
     under `appOwners`; she must already be in that club's `access/admins`,
     which the rule requires of every owner). Add a second owner from the app
     afterwards.
  4. Nothing else is owner-only for now: removing admins and their index
     entries, owners, and retiring the club.
- **Done when:** `test/rules.js` refuses an admin removing another admin, an
  owner, or another admin's index entry, or claiming the owner of a club
  that already exists; lets an owner do all three to a
  non-owner; lets an admin appoint and step down; walks a brand-new club to
  an owner; and keeps today's behaviour on a club with no `owners`.
  `test/access.js` shows every admin and owner, the removed one included,
  told of each admin or owner change, nobody else told, and the
  `clubAudit` record written. The People screen offers *Remove admin* to
  owners only, and the handler checks it (as `retireclub` checks
  `canAdmin()`).

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
- **A secret id comes from `crypto.getRandomValues`**, never `uid()`.
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
