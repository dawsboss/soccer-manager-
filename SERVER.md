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
- **Moved to the server too (build 130):** `myCalBuild` (`functions/mycal.js`,
  `publishBusy`) writes each sharing person's busy times from the clubs
  themselves, on the same marks and the same five-minute runs as her feed,
  in exactly the shape her phone writes (`people/{uid}/busy/{clubTag}`: a
  date and two times), so a practice added in club B reaches club A within
  minutes whether or not a phone of hers is open. Only while she shares;
  turning it off on any phone takes them all down on the next run, and a
  club she has left loses its entry. `test/mycalfeed.js` holds it to the
  phone's `youBusy`, time for time. **And each club gets its own copy** at
  `training/{code}/elsewhere/{uid}` (her other clubs' times only), which
  that club's coaches and admins read (`watchBusy()`, one listener per
  club) and nobody else may: `people/{uid}/busy` is hers alone to read
  since rules version 27 (rules.js's gap 10 closed). A club she leaves is
  pruned on that club's next run.
- **Still on the phone, and agreeing:** her own phones still write
  `people/{uid}/busy` (the same values; hers alone now). What is left for a
  server is the rest of *With a server*: answering "is she free" itself,
  and the phone keeping no copy at all.
- **Before the server:** a coach's own phone works out when she is busy in every club she is
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
- **Moved (build 130):** joining by invite, starting a club and being let
  in (`functions/join.js`, `functions/staff.js`) write the bookmark in the
  same write as the role, and the access triggers take it away with her
  last role, so it is written when the role is granted and removed when it
  is taken away, as *With a server* asked.
- **Still, and agreeing:** any phone that reads a club it holds a role in
  writes the same bookmark (`noteMyClub()`), for an account from before.

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
  and every club has moved (2026-10-09). The old tree's triggers and
  `moveClub` came out in build 128 (AUTH.md, build order step 5). What is
  left is deleting the bridges and the phones' rebuilds, now that every
  club's tables were built whole.

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

- **Moved (build 130): joining by invite and starting a club are one call.**
  The phone asks at `joinAsks/{uid}/{id}` (hers alone, rules version 27) and
  `functions/join.js` (`joinAsk`) answers beside it. An invite is checked as
  the rules checked it (spent, expired, full, another email, an unconfirmed
  address, a child or team gone, a retired club), spent inside one
  transaction, and the grant, her member entry, her bookmark, the admin's
  list and the log written in one multi-path write, then the lookup tables
  by access.js's `settle`. A new club is made at a code the server makes
  (crypto, checked free), with her as admin and owner, in one
  write; a club is never made twice for one ask. The phone does them itself
  (`redeemHere()`, `createHere()`) only where `SOCCER_SERVER` is not set or
  the rules refuse the ask. `test/joinask.js`, and the page in
  `test/invites.js`.
- **Closed with it (rules version 27):** the bootstrap clauses now let a
  code be claimed only when it starts `test-` (the app owner's test clubs,
  seeded on a phone, never published), so rules.js's gap 3 is closed: a real
  club is made by the server or not at all. `createHere()` is the fallback
  for rules too old to take the ask, and the test club's.
- **Moved (build 130): invitation emails from the club** (`functions/mail.js`,
  `mailAsk`; *Email* below): `mailImported()` asks the club to send each
  invite it made as a real invitation in the club's name, and sends
  Firebase's sign-in links only where the club has no mailer.
- **Moved (build 130) too: letting people in** (`functions/staff.js`,
  `staffAsk`, `staffAsks/{code}/{uid}/{id}`): a team-link request approved
  (`approveClaim()`: the approval, the family on each child's record, her
  index entry, her member entry and the log in one write, the tables by
  `settle`), a fan's ask (`approveFan()`, with her name for the family and
  the fans table), a squad's parent links (`inviteSquad()`: one per child
  with no parent and no open invite, with the limits she chose, ids from the
  server's generator) and an imported roster's invites (`inviteImported()`:
  one email-bound each, nobody who has the role or an open invite). Each is
  checked against the club as the rules checked the phone (an admin, or the
  team's coach for a request or a fan; admins alone for links), and the
  phone's own writes are the fallback for rules too old to take the ask.
  `test/staffask.js`, and the page in `test/join.js` and `test/invites.js`.
- **What is left here:** nothing a phone does for somebody else. A single
  invite from People is its maker's own two writes, as before.
- **Before the server, and still the fallback:** joining by invite is several writes from the invitee's own phone in
  the order the rules need (spend the invite, take the role, add herself to the
  index) (`redeemInvite()`); approving a team-link request is the coach writing
  the approval before the index entry (`approveClaim()`), and a fan's
  ask the same way (`approveFan()`, build 121); a squad of parent
  links is made one invite at a time (`inviteSquad()`), and so are the
  invites for the emails an imported roster carries (`inviteImported()`),
  whose sign-in emails Firebase sends one call at a time from the admin's phone
  (`mailImported()`), stopping at its daily limit; a new club is claimed by
  the first person to write its admin list (`createClub()`), which is
  trust-on-first-use (rules.js, gap 3). Registering a child through a
  program's link is the family's own phone writing her child, her list, care,
  the registration and each agreement in that order (`sendReg()`), and an
  admin accepting writes the child's `club` and the family's index entry
  (the server's `accessChild` does the latter too); a family deleting her
  registration is her phone deleting it, its agreements, then the child she
  made (`delReg()`). Forgetting an account is already the server's
  (`forgetMe`, on her own request). Anything half-done after a dropped
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
- **Moved (build 130):** the club sends its own email (`functions/mail.js`,
  `mailAsk`, from an SMTP secret the project holds: README, *Email from the
  club*): an invitation (who invited her, to what, the link), asked for by
  an admin or by whoever made the invite, to the address the invite names;
  and a team notice to the team's families (`mailNotice()`), asked for by an
  admin, a coach or a helper of the team, one message per family found by
  the server from the squad, never from the ask. Without a mailer set up
  every ask is answered `nomail` and the phone does what it did before.
  `test/mail.js`.
- **Still on the phone:** *Email the parents* in her own mail app with
  everybody in bcc (`mailto:`), beside the club's; the sign-in links where
  the club has no mailer (`mailImported()`); *Email or share* for a training
  session (`sheetReach()`).
- **With a server:** saying who has read it.

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
- **On the server (build 130):** `migrateOld` (`functions/migrate.js`), daily
  until a run gets every club through, then never again (it reads one
  marker and stops, `serverState/migrated/v1/done`). Each old plan gets its
  practice entry under its own id and its `eid`, exactly as `movePlans()`
  makes them; each coach's note still on a record on `orgs/` goes to
  `coachNotes` (never over a newer one) and comes off the record in the same
  write. A retired club is skipped, a club being moved waits a day.
  `test/migrate.js`.
- **What is left:** once `done` is set on the live database, delete
  `movePlans()`, `moveCoachNotes()`, their tests and `functions/migrate.js`.
- **Before the server, and still until then:** an older practice plan is moved onto its calendar entry by the first
  phone that opens it (`movePlans()`), and every phone carries that code for
  ever. The same for the coach's notes still on a child's record from before
  they had their own place (SECURITY.md, SEC-D10): the first phone of that
  team's coach or an admin moves them (`moveCoachNotes()`), so a team whose
  coach never opens the app keeps them on the record, where the family reads
  them, until an admin does.
- **With a server:** a one-off migration, run once, and the code is deleted.

### A child's club record
- **Now:** every child already on a team is given a club record by the first
  admin's phone to open the club, and the squad's families are copied onto
  each record by any admin's or coach's phone, and by a family's own phone for
  herself (`syncChildren()`; AUTH.md, *A child in the club*). The server does
  both the moment a squad record changes (`rosterPlayer`, `functions/access.js`)
  and keeps the index for a family named on a child the club let in
  (`accessChild`), so the phones are the fallback for a club without the
  functions deployed.
- **With a server:** already there; the phones' half goes once every club has
  the functions.

### Backups and imports
- **Moved (build 130): a bulk import is applied by the server.** The phone
  plans it as before and sends the planned writes in one ask
  (`importAsks/{code}/{uid}/{id}`, admins only, rules version 27; laid out
  for the club and stamped by `importWrites()`). `functions/imports.js`
  (`importAsk`) checks she is an admin now, that every write is inside the
  club and in a part an import writes (never a role, a lookup table, another
  club or the root, or nothing is written), and applies them in order in
  batches the database takes; the plan is taken off the ask with the answer.
  Once the ask lands a dropped signal loses nothing. Without an answer, or
  with one that did not finish, the phone writes it itself (`applyImport()`),
  which changes nothing twice. `test/importask.js`.
- **Moved (build 130): nightly backups** (`functions/backup.js`,
  `backupNightly`): every club, whole (the club, its training records, its
  messages, the admin's invites, care details included: this is the club's
  own copy, not a file on a phone), to the project's private bucket at
  `backups/{code}/{date}.json` once a night, the last thirty kept. A
  retired club and a test club are left out; a club that cannot be read
  whole gets no half file. `test/backup.js`.
- **Still:** *Download a copy* (`backupDoc()`) for a file in hand, and
  *Load from a file* to restore one; a server backup is restored from the
  bucket by hand (README, *Backup*).
