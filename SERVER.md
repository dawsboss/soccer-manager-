# What changes when there is a server

This app is a static site and a Firebase database (CLAUDE.md, *Conventions*).
**The owner approved server-side code on 2026-10-06**: Cloud Functions on the
same Firebase project, push first, then payments and email (`GOTSPORT.md`).
The first ones shipped in build 104: `functions/` pushes team notices and
family messages to closed phones. The jobs below move to it one at a time,
each with its test, never in one rewrite; everything else here still runs on
somebody's phone. So every job that belongs to
nobody in particular (keeping a list in step, telling one club what happened in
another, counting places, sending a message to a closed phone) is done today by
whichever phone happens to be open and allowed to do it. That works, but each of
those jobs is only as current as the last time the right person opened the app.

This file lists every place that is true, so that as the server takes jobs
over (Cloud Functions on the same database), nobody has to rediscover them. Each entry says what a phone does
now, where, what a server would do instead, and what goes away.

**Rule for new work:** anything a phone does on behalf of somebody else, or
that only stays true while some phone is open, gets an entry here and a
`SERVER.md:` comment at the code. `test/version.js` checks that every function
named in backticks below still exists in `app.js`, so the list can't quietly
drift away from the code.

**What does not change:** the outbox. A coach at a field with no signal still
needs every change kept on her phone and sent when the signal comes back
(`flushPending()`, `flushTraining()`, `mergeConnect()`). A server changes who
does the bookkeeping, not that the phone works offline first.

---

## People and their calendars

### Busy at another club
- **Now:** a coach's own phone works out when she is busy in every club she is
  in and, if she shares, writes the times to `people/{uid}/busy/{tag}`
  (`youPublish()`). Other clubs' coaches' and admins' phones listen to those
  (`watchBusy()`) and fold them into who is free (`elsewhereOn()`, read by
  `busyItems()`). A practice added in club B reaches club A only when one of
  her phones is next open. Shared times are readable by anyone signed in who
  knows her uid, because a rule cannot ask "are you in a club with her?".
- **With a server:** it sees every club. "Is Jaz free on Tuesday at 6?" is a
  question it answers on the spot from the clubs themselves, to people who
  share a club with her, and only "busy" or "free" leaves it. The `people/busy`
  node, `youPublish()` and `watchBusy()` go away; the private/shared switch
  stays, and the server obeys it.

### Every club on the phone
- **Now:** a phone listens to every club its account is in, read-only, and keeps
  a slimmed copy of each for My calendar and for no signal (`watchMirror()`,
  `mirrorSlim()`), running the club's own calendar code against each copy for a
  moment (`withClub()`). That is one listener per part per club, on every phone
  of hers, all the time.
- **With a server:** one request, "my calendar", answered across every club,
  and pushed when it changes. It would also serve My calendar's feed from the
  clubs themselves (below), names and all, behind a private link.

### My calendar's feed
- **Moved to the server (2026-10-08), and only there (2026-10-09, SECURITY.md,
  SEC-10):** `functions/mycal.js` builds each person's feed from the clubs
  themselves: her teams, her children's teams, the sessions she runs or her
  children are in, and her bookable times, worked out from her roles in each
  club (never from her list of clubs, which she can write). Triggers only mark
  what changed (`serverState/myCal`), and `myCalBuild` rebuilds the marked
  feeds every five minutes, each club read once per run. Every club's typed
  titles are there, scrubbed of that club's names. It writes only an address
  the server has down as hers (`serverState/pages`, shared with the team
  pages, so one id is never both), and takes an address she replaces or turns
  off down the moment her setting changes. Her phone writes her setting and
  nothing else; `myFeedDoc()` (each item through `feedItem()`) is what the
  server is held to, item for item and id for id (`test/mycalfeed.js`). A team
  she is taken off leaves her feed on the next run, phone or no phone.
- **What is left:** the default database only (a rehearsal database has no
  My calendar feed); a team renamed shows in feeds with the next change to
  that club; the full detail (her children's names, who is coming) would
  still need a private link, not `public/`. Then the calendar app adds its own
  delay: Apple and Outlook come back about hourly, Google every several hours.

### Which clubs an account is in
- **Partly moved (2026-10-08):** the server writes the bookmark when an
  account gets its first role in a club and removes it when she loses her
  last (`functions/access.js`, with the lookup tables below). A club-wide
  viewer counts as a role (build 118): `accessViewer` (orgs/ only) keeps her
  index entry and bookmark, and takes away the invite she came by.
- **Still:** any phone that reads a club it holds a role in writes the bookmark
  `userOrgs/{uid}/{code}` (`noteMyClub()`), and admins tidy it when a role is
  withdrawn.
- **With a server:** written when the role is granted and removed when it is
  taken away, in the same step.

---

## The lookup tables the rules read

- **Moved to the server (2026-10-08), alongside the phones:** four triggers
  (`accessAdmin`, `accessStaff`, `accessGuardians`, `accessSelf`, in
  `functions/access.js`) watch every place a role lives (a club's admins, a
  team's coaches and trackers, a player's guardians and own sign-in) and
  recompute the entries that change touched, from what the club holds at
  that moment: the uid's `access/index` entry and her bookmark at
  `userOrgs/{uid}/{code}`, the team's `teamIndex`, `teamParents` and
  `teamPlayers`, and `coachIndex`. Same sources and same values as the
  phones, so they never fight; `test/access.js` holds the two to the same
  answer. A parent unlinked by the coach is off the team the moment it
  happens, wherever the functions are deployed (gap 5). What it does not
  do yet: start a table a club doesn't have (`teamIndex`, `teamParents`,
  `index`), because the first entry would close the rules' bridge for every
  other team at once. So the bridges stay, and so do the phones' rebuilds
  below, for a club whose functions aren't deployed and for building a
  missing table whole.
- **Before the server, and still:** `access/index`, `access/teamIndex`, `access/teamParents`,
  `access/teamPlayers`, `access/teamFans` (build 121, `orgs/` only) and
  `access/coachIndex` are rebuilt from where a uid
  appears, by admins' and coaches' phones on every connect (`syncIndex()`,
  `syncTeamIndex()`, `syncTeamParents()`, `syncTeamPlayers()`,
  `syncTeamFans()`, `syncCoachIndex()`). The server keeps
  `teamFans` too (`accessFansOrgs`, `test/access.js`). Until one of them connects after a
  change, the table is stale: a parent unlinked by an older phone keeps reading
  that team's notices (rules.js, gap 5). The rules carry *bridges* for clubs
  whose tables don't exist yet.
- **What is left:** once every club's tables exist, a one-off run that
  builds any missing one whole, after which the bridges, the phones'
  rebuilds and the "nothing else may write them" care can go. Or custom
  claims on the account instead of tables.
- **Moving a club to orgs/ builds them whole** (`functions/move.js`, the
  `moveClub` trigger): every table from where each uid appears, so a moved
  club carries no bridge. That was the one-off run above, one club at a time,
  and every club has moved (2026-10-09). What is left is deleting: the
  bridges, the phones' rebuilds and the old tree's triggers come out with the
  old tree (AUTH.md, build order step 5, from 2026-10-23).

### What families read on orgs/
- **On the server (2026-10-08):** on a club that has moved to `orgs/{code}`
  (AUTH.md, *The move to `orgs/{orgId}`*), families read the roster
  (`roster/{tid}`: shirt numbers, and names only while the club opens the
  roster) and staff names (`names/{uid}`: a name, never an email) in place
  of the squad and the members. `rosterPlayer`, `rosterOpen` and
  `namesMember` (functions/access.js), with the role triggers above, keep
  both from the squad, the members and the roles the moment they change.
- **On the phones too:** the phone that changes a squad writes its roster
  beside it (`rosterAfter()`), and an admin's or coach's own phone writes her
  own name once a session (`staffName()`), so a club without the functions
  deployed still has numbers and coaches' names on families' phones. A
  tracker's name, and a roster changed from a phone too old to write one,
  wait for the server.
- **What goes away:** both phone halves, once every club has the functions
  deployed.

---

## Bookable times and training sessions

- **Moved (build 119): booking a coach's time is one call.** A family's
  phone asks at `bookAsks/{code}/{uid}/{id}` and the server
  (`functions/book.js`, the `bookAsk` trigger) answers beneath it: it checks
  her child, the coach's calendar as it stands (her teams' practices and
  games, the sessions she runs, her time off, her busy times elsewhere), the
  child's, and counts the places inside one transaction before it writes the
  session and the booking. A full slot has a real waiting list, worked
  through by `bookFreed` the moment a place comes free. What went: the
  block's `slots` and `seats`, the coach's and admins' phones keeping them
  (`healBlocks`, `openSlotsOf`), the seat clean-up after ten minutes, and the
  three gaps the rules printed for them (a practice bookable until a phone
  redrew, a seat with no booking, one child holding two). AVAILABILITY.md,
  *Booking is one call to the server*.
- **Still on the phone:** an ordinary session's places. A family asks, and
  the coach's phone keeps the count when she says yes (rules.js, gap 8);
  that is the coach's decision, not bookkeeping, so it stays hers.

---

## What families and the other team see

### The share pages
- **Moved to the server, and only there (2026-10-09, SECURITY.md, SEC-10):**
  only the server writes `public/`; the rule is `.write: false`.
  `functions/mirror.js` builds every page of a team (the season link, each
  game's own page, the members' feed) from the club, as `publicDoc()`,
  `fixtureDoc()` and `calendarDoc()` describe them (`functions/game.js`, the
  game math ported, held to the app item for item by `test/mirror.js`). It
  wakes on what the phones already write: each part of a game on its own
  (a goal, a sub, the clock, never the game whole), a game's answers, a
  player's name, number or whether she plays, a team's name, badge and page
  ids, and its entries. Work for one team goes through a queue so two runs
  never write a page in the wrong order. A new game reaches every page, a
  deleted game's page comes down, an id replaced takes the old page with it,
  and the server keeps whose page is whose (`serverState/pages`), so no club
  can write over another's. A test club and a retired club are never
  published.
- **Still on the phone:** making the ids, in the club, under the team's rule:
  the season link and the feed when the coach asks, and each game's own id
  (`ensureFixtureShares()`), which an older game gets from whichever coach's
  phone opens it next. The share sheet shows when the server last wrote the
  page.
- **Better than before:** a page used to be written from the sideline phone
  outside the outbox, so a page closed with no signal lost its publish. The
  writes behind it are in the outbox, and the server publishes when they land.

### Calendar sync
- **Moved to the server (build 104), as it was:** the `calendar` function
  (`functions/calendar.js`) turns `public/{id}` into a calendar feed, and
  reads nothing else. It was a Cloudflare Worker until then. What it serves
  is what the server published (above, and *My calendar's feed*). Its links
  back into the app come from `SOCCER_SITE` in `functions/.env` (README,
  *Deploying the server*), or a page from before that carried one.
- **Next, now that it is a function:** the feed can be served from the club's own data, so the
  members' feed doesn't need its own public copy, and a person's own feed (My
  calendar's, *My calendar's feed* above) can carry names behind a private link
  instead of leaving them out.

---

## Joining and starting clubs

- **Now:** joining by invite is several writes from the invitee's own phone in
  the order the rules need (spend the invite, take the role, add herself to the
  index) (`redeemInvite()`); approving a team-link request is the coach writing
  the approval before the index entry (`approveClaim()`), and a fan's
  ask the same way (`approveFan()`, build 121); a squad of parent
  links is made one invite at a time (`inviteSquad()`), and so are the
  invites for the emails an imported roster carries (`inviteImported()`),
  whose sign-in emails Firebase sends one call at a time from the admin's phone
  (`mailImported()`), stopping at its daily limit; a new club is claimed by
  the first person to write its admin list (`createClub()`), which is
  trust-on-first-use (rules.js, gap 3). Anything half-done after a dropped
  signal is undone by hand on the phone.
- **With a server:** each is one call that does all of it or none of it, and a
  new club's code is issued by the server rather than claimed. Invitations go
  out as real invitation emails from the club, not Firebase sign-in links. The ordering
  care, the bootstrap clauses and gap 3 go away.

---

## Telling people things

### Notifications
- **Moved, for messages (build 104):** a new team notice or family message is
  pushed by the server to the phones of whoever may read it
  (`functions/push.js`, the `pushNotice` and `pushMessage` triggers), with the
  app closed. The open page still pops it up and counts it on the bell
  (`watchMessages()`), because a phone without notifications turned on, or a
  club without the server, has only that.
- **Moved, for a followed game (build 116):** the Live tab's *Notify me*
  is also stored (`follow/{code}/{mid}/{uid}`, `followRemote()`), and
  `onFollowed` in `functions/push.js` sends the goals, each half starting,
  half time and full time to those phones. The open page still watches
  (`watchFeed()`), for a phone without notifications turned on.
- **Moved, for training sessions and club activity (build 119):** a
  booking changing, a session added, moved or called off, and a coach's
  time off or call-out each wake a trigger of their own (`functions/news.js`:
  `newsBooked`, `newsSession`, `newsAway`), which tells whoever the open
  page would have told, in the same words: a family about her own child's
  place and sessions, a coach about families asking, booking, waiting,
  withdrawing and cancelling on hers, and the admins the club's activity
  (and, from `functions/push.js`, every team's calendar changes and a
  game, practice or event deleted, named from a note the server keeps of
  each dated game at `serverState/calGame/`, and who deleted an entry from
  the stamp the app writes just before). The open page still works it out for itself
  while it is open (`clubNews()`, `sessNews()`, `ping()`), for a phone
  without notifications turned on; that is all that is left on the phone.

### Alerts from every club
- **Now:** a phone in several clubs listens to every one of them for messages
  to her and for changes to her own calendar (a game called off, moved, back on
  or new), works out what is new on the phone, and shows it in a bar over the
  screen (`pushAlert()`, `calAlerts()`, `watchElseMessages()`). That is a
  listener per team per club on every phone she has, and it only works while
  the page is open.
- **With a server:** it sees the change once, works out who it concerns, and
  pushes to their phones whether the app is open or not. The phone keeps the
  bar and the Open button, and stops listening to every club for news.
  Messages are pushed (build 104, *Notifications* above), and so is a game
  or practice of hers called off, back on, moved or new in the next two
  weeks (build 105, `functions/push.js`), from every club she is in, since a
  token is per account, not per club. The bar here still comes from the
  phone, for a phone without notifications turned on.

### Email
- **Now:** *Email or share* opens the person's own mail app with everybody in
  bcc (`mailto:`), and the coach presses send.
- **With a server:** the app sends it, to the families on that team, and can
  say who has read it.

---

## Keeping the club's data safe and correct

### The rules themselves
- **Moved to the deploy:** a merge to main that changes `database.rules.json`
  publishes it (`.github/workflows/server.yml`), and reads the live version
  back; nobody pastes them any more.
- **Still on the phone:** an admin's phone writes and checks `rulesVersion`
  (`checkRules()`), which now only catches a deploy that failed or a phone
  running an older app. It can go once the deploy's own read-back is trusted
  alone.

### What the rules cannot say
- **Now:** a tracker can write more of a game than the screen offers her
  (rules.js, gap 1); the app owner has no standing in the rules, so buttons
  `isOwner()` opens are refused (gap 2); a field's permit and opening hours are
  checked only on the phone (`fieldShut()`, `sessClashes()`, `plannerClashes()`).
- **With a server:** writes that need judgement go through it, so it can check
  them field by field, and the owner is a real role there. Clashes can be
  refused, or warned about, at the moment of saving.

### Moving old data
- **Now:** an older practice plan is moved onto its calendar entry by the first
  phone that opens it (`movePlans()`), and every phone carries that code for
  ever. The same for the coach's notes still on a child's record from before
  they had their own place (SECURITY.md, SEC-D10): the first phone of that
  team's coach or an admin moves them (`moveCoachNotes()`), so a team whose
  coach never opens the app keeps them on the record, where the family reads
  them, until an admin does.
- **With a server:** a one-off migration, run once, and the code is deleted.

### Backups and imports
- **Now:** a backup is an admin tapping *Download a copy* (`backupDoc()`), and
  a bulk import is planned and written from her phone, one record at a time at
  the depth the rules sit at (`applyImport()`).
- **With a server:** nightly backups without anybody remembering, and an import
  that is checked and applied in one go, so a dropped signal half-way through
  can't leave half a season.
