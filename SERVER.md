# What changes when there is a server

This app is a static site and a Firebase database (CLAUDE.md, *Conventions*).
Nothing runs anywhere except on somebody's phone. So every job that belongs to
nobody in particular (keeping a list in step, telling one club what happened in
another, counting places, sending a message to a closed phone) is done today by
whichever phone happens to be open and allowed to do it. That works, but each of
those jobs is only as current as the last time the right person opened the app.

This file lists every place that is true, so that the day there is a server
(Cloud Functions on the same database, or any backend holding admin
credentials), nobody has to rediscover them. Each entry says what a phone does
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
- **Now:** once she turns it on, her own phone builds her calendar feed from
  every club it holds (`myFeedDoc()`, each item through `feedItem()`) and
  writes it to `public/{id}` whenever it changes (`feedPublish()`), but only
  from a phone that has heard from every one of her clubs this session, so an
  old copy never overwrites a newer one. Because
  it is `public/`, it carries no child's name and no club code, and another
  club's typed titles are left out (that phone holds her own children, not the
  squad to check them against).
- **It lags.** The feed is only as fresh as the last time one of her phones
  was open with a signal and had heard from all her clubs. A practice moved or
  called off in any club, by anyone, reaches her subscribed calendar only after
  that; a parent who never opens the app keeps the old time in her calendar
  indefinitely. Then the calendar app adds its own delay on top: Apple and
  Outlook come back about hourly, Google every several hours. So a change made
  this morning can show in her calendar this afternoon, or not until she next
  opens the app. The screen says so ("it catches up with a club once your phone
  has been open since the change"), and the app itself (My calendar, alerts)
  is always current; the feed is the copy that trails.
- **With a server:** it writes the feed on every change in any of her clubs,
  with no phone open, and could serve the full detail (her children's names,
  who is coming) behind a private link instead of a public node.

### Which clubs an account is in
- **Now:** any phone that reads a club it holds a role in writes the bookmark
  `userOrgs/{uid}/{code}` (`noteMyClub()`), and admins tidy it when a role is
  withdrawn.
- **With a server:** written when the role is granted and removed when it is
  taken away, in the same step.

---

## The lookup tables the rules read

- **Now:** `access/index`, `access/teamIndex`, `access/teamParents` and
  `access/coachIndex` are rebuilt from where a uid appears, by admins' and
  coaches' phones on every connect (`syncIndex()`, `syncTeamIndex()`,
  `syncTeamParents()`, `syncCoachIndex()`). Until one of them connects after a
  change, the table is stale: a parent unlinked by an older phone keeps reading
  that team's notices (rules.js, gap 5). The rules carry *bridges* for clubs
  whose tables don't exist yet.
- **With a server:** a trigger on `access/teams` and on each team's players
  rebuilds them the moment anything changes, or they become custom claims on
  the account. The bridges, and the "nothing else may write them" care, go
  away.

---

## Bookable times and training sessions

- **Now:** a coach's bookable window carries the list of slots it still offers
  (`slots`), worked out on her phone or an admin's from everything she is busy
  with and written back (`healBlocks()`, `openSlotsOf()`). The rules check a
  booking against that list because they cannot count, search or do dates. A
  practice added from another phone is bookable until one of theirs next
  opens the app (rules.js, gap 9). A seat taken with no booking behind it is let
  go by the coach's phone after ten minutes (`SEAT_STALE`), and one child can
  hold two seats by hand (gap 10). A family never writes `in` on an ordinary
  session, because a rule can't count the places; the coach's phone keeps the
  count (gap 8).
- **With a server:** booking is one call that, inside a transaction, checks the
  coach is really free now, counts the places and books. `slots`, `seats`,
  `healBlocks()`, the seat clean-up and gaps 8 to 10 go away; a full group can
  have a real waiting list.

---

## What families and the other team see

### The share pages
- **Now:** the public mirror (`public/{share}`) is written by the coach's or
  admin's phone a moment after a change (`schedulePublish()`, `publishTeam()`,
  `fixtureDoc()`, `calendarDoc()`), and a game made before game links gets its
  id from whichever phone opens it next (`ensureFixtureShares()`). A change made
  from a phone that then loses signal reaches the share page late.
- **With a server:** a trigger on the team and its games writes the mirror,
  scrubbed by the same `pubText()` rules, every time. `shareOwners` and the
  publish debounce go away.

### Calendar sync (the Worker)
- **Now:** `worker/calendar.mjs` turns `public/{id}.json` into a calendar feed,
  and may read nothing else, because it holds no credentials.
- **With a server:** the feed can be served from the club's own data, so the
  members' feed doesn't need its own public copy, and a person's own feed (My
  calendar's, *My calendar's feed* above) can carry names behind a private link
  instead of leaving them out.

---

## Joining and starting clubs

- **Now:** joining by invite is several writes from the invitee's own phone in
  the order the rules need (spend the invite, take the role, add herself to the
  index) (`redeemInvite()`); approving a team-link request is the coach writing
  the approval before the index entry (`approveClaim()`); a squad of parent
  links is made one invite at a time (`inviteSquad()`); a new club is claimed by
  the first person to write its admin list (`createClub()`), which is
  trust-on-first-use (rules.js, gap 3). Anything half-done after a dropped
  signal is undone by hand on the phone.
- **With a server:** each is one call that does all of it or none of it, and a
  new club's code is issued by the server rather than claimed. The ordering
  care, the bootstrap clauses and gap 3 go away.

---

## Telling people things

### Notifications
- **Now:** every phone works out for itself what is new since it last looked,
  per source, and shows it while the page is open (`clubNews()`, `sessNews()`,
  `watchMessages()`, `ping()`). A closed phone hears nothing.
- **With a server:** real push to a closed phone (ROADMAP, *Notifications with
  the page closed*: a service worker, FCM tokens, and a sender), worked out once
  for everybody instead of on each phone. The "first look is not news" care
  goes away.

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

### Email
- **Now:** *Email or share* opens the person's own mail app with everybody in
  bcc (`mailto:`), and the coach presses send.
- **With a server:** the app sends it, to the families on that team, and can
  say who has read it.

---

## Keeping the club's data safe and correct

### The rules themselves
- **Now:** an admin pastes `database.rules.json` into the Firebase console by
  hand, and her phone writes and checks `rulesVersion` to say whether that has
  happened (`checkRules()`).
- **With a server:** the rules are deployed with the code, and the version
  check goes away.

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
  ever.
- **With a server:** a one-off migration, run once, and the code is deleted.

### Backups and imports
- **Now:** a backup is an admin tapping *Download a copy* (`backupDoc()`), and
  a bulk import is planned and written from her phone, one record at a time at
  the depth the rules sit at (`applyImport()`).
- **With a server:** nightly backups without anybody remembering, and an import
  that is checked and applied in one go, so a dropped signal half-way through
  can't leave half a season.
