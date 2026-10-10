# Changelog

Newest first. Each entry says why, not just what.

This file starts here: `CLAUDE.md` has always asked for an entry per shipped
change, but the changelog itself was never in the repository, so everything
before this point lives only in the git log.

---

## A new address says "sign in" — 2026-10-10 (build 131)

Opening an old link on the new domain showed an empty club that looked as if it was still loading, with no way to sign in: a phone that has never held a club has no admins to be locked by, so nothing asked for a sign-in. Now a device with a database, nobody signed in and nothing held shows **Sign in to open your club** with the button.

- **The club's name no longer reads "Club" while it loads.** `clubName()` falls back to the name in her account's list of clubs, then to "Your club" until the club has been read, so the crumbs and Club home are right the moment she signs in rather than after a forced refresh.
- A device with teams of its own on it, and a device with no database, are left open as before.

---

## Back swipe closes a pop-up — 2026-10-10

On a phone, the back swipe with a sheet open went to the screen behind it and left the sheet up. A sheet now takes a history entry of its own when it opens, so back closes it and nothing else; closing it any other way gives the entry back, and moving to another screen from it uses the entry up rather than adding a second.

---

## The site moves to teamplayhq.com — 2026-10-10

The site is served at its own domain now (GitHub Pages, custom domain `teamplayhq.com`) instead of `dawsboss.github.io/soccer-manager-/`. The app builds every link it hands out (invites, team links, share pages, registration) from the address it is open on, so those follow by themselves; the one place that cannot is the server, which has no page to look at.

- **`SOCCER_SITE` in `functions/.env` names the new address**, so calendar feed entries and share pages link back to `teamplayhq.com` from the next functions deploy.
- A phone keeps its local copy, outbox, push token and home-screen install per address, so each coach's phone starts fresh on the new one: everything owed should be sent from the old address before switching.

---

## A player's parents, named to her — 2026-10-10 (build 130, rules version 27)

Running the app's suites on `orgs/` (build 128) showed a player with her own sign-in seeing her parents as *A parent* on her family's conversations and their lock. On `orgs/` she reads her own member entry and staff names, never the members, which carry everyone's email, so her parents' names had nowhere she could read them.

- **Each parent's name is kept on the child's own record**, `squad/{tid}/{pid}/familyNames/{uid}`, as a fan's already was (`fanNames`). Only that child's family, the player herself and her fans read that record.
- **Written** by the parent's own phone once a session (`ownFamilyName()`, straight to the club like `staffName()`), on accepting a parent invite, and by a coach or admin linking her; **taken off** on unlinking and by `forgetMe`.
- **Rules version 27**: a parent writes or clears her own entry only, and only on a child whose record names her; the team's coaches and admins write it as they write the record.
- The two known gaps pinned in `test/players.js` are ordinary checks now; `rules.js`, `players.js` and `forget.js` pin the rest.

---

## Families are asked until their children's details are finished — 2026-10-10 (build 129)

A family used to be asked about her child's details once per phone, then only
by a card on My players, so one *Later* was the end of it (the owner: close to
keeping her out, but not quite; admins able to insist). AUTH.md, *Getting
families to finish their children's details*.

- **Every screen says so**, while a child of hers is still to finish (not
  confirmed by her family, or missing something the club requires), with
  *Finish now*; and the pop-up comes back once a day the app is opened.
- **Admins choose what is required** (birth date, gender, someone to call, a
  doctor; the first three until they say otherwise) and **can set a deadline**
  on Registrations, which also lists who is still to finish and what each is
  missing.
- **After the deadline** a family with a child still to finish sees her
  calendar, her messages, the bell, My players and her settings, and the rest
  once it is done (the owner: calendar and messages stay open). Staff are
  never kept out. It is the app that keeps her out, not the database, which
  would also shut out a phone with no signal.

No rules change: the setting lives in the club's `org`, which admins already
write. New suite `test/details.js`.

---

## The old tree comes out — 2026-10-10 (build 128, rules version 26)

AUTH.md's build order step 5. Every club has been on `orgs/{code}` since 2026-10-09, and every rule and server job was still written twice to cover `workspaces/{code}`, which nobody is on. The design waited a fortnight (to 2026-10-23) in case an old phone was still on the old tree or the copy needed undoing; the owner cut it short, since the only two clubs are both the owner's and both moved. Merging publishes the rules and deploys the functions at once.

- **Rules (version 26).** `database.rules.json` is edited as it is published again: every lookup into a club asks `orgs/` directly (about 240 of them were "the old tree while the club is there, the new one once it has moved"), the `workspaces` and `moveRequests` blocks are gone, and so are `tools/rules-build.js` and `tools/rules-source.json`. With no rule, nothing left under `workspaces/` is anyone's to read or write, and no club can be started there. `test/rules.js` walks the one tree and checks the old one is closed; its second pass, `rules-orgs`, is gone.
- **Server.** Each club trigger is registered once, on `orgs/`, under the name it already had there (`…Orgs`), so the deploy deletes the old tree's triggers and leaves every live one in place, with no moment when a club has none. `moveClub` and `functions/move.js` are gone, and so is every check for a club being moved (`serverState/moving`). `functions/club.js` knows one layout.
- **App.** Reads and writes `orgs/` only (`clubPath()`, `clubWrites()`, `wireOrgs()`); no tree to probe for an invite, a team link, another club or a new one; no Move card or readiness row; fans no longer wait on a moved club. A phone holding a club's copy from the old tree (the whole squad, everyone's email) still cuts it down to what its account may hold, once, before it reads the club. A write made before the session's first read still waits for it (`fb.held`), and no longer leaves an unhandled refusal when its caller ignores the answer.
- **Tests.** The app's suites ran only on the old tree; they now serve their clubs from `orgs/` (`fbk.serveClub()`, laid out by `orgsLayout()` in `test/fakebase.js`, which replaces move.js's `layout()`), the server suites keep every club on `orgs/` (the `-orgs` passes and `test/move.js` are gone), and `test/orgs.js` loses the move's own checks. Running the app suites on `orgs/` found one thing the old tree hid: a player with her own sign-in sees her parents as *A parent*, because she may not read their member entries there. Pinned as a known gap in `test/players.js`; naming her family to her needs their names somewhere she may read them.
- **Left for the owner, by hand:** the `moved` markers under `workspaces/`, the server's copies at `serverState/moved/`, and any old `moveRequests/` (README, *The move to orgs/, and the old tree gone*).

---

## Deleting: a registration, a child's record, an account — 2026-10-09 (build 127, rules version 25)

Registration's last step (AUTH.md, *Deleting*), as the owner decided it.

- **A family deletes her registration** from the program's link: the
  registration, then what she agreed to for it (the rules let an agreement
  go only once its registration has), and, for a child she made through the
  link who was never let into the club and is on no team, the child, her
  care details and her place on the family's own list.
- **An admin deletes a child's record** (one on no team, including a child
  whose family has left): her registrations, agreements and care details,
  then the record. Children whose family deleted their account are listed
  under Registrations → *Left the club* until an admin decides.
- **Delete my account** (Your account): says what goes and what stays, then
  asks the club's server to forget her (`forgetMe`, `functions/forget.js`)
  in every club: every role and table entry, her member entry and staff
  name, her place on every child's and squad record, her asks, and her own
  settings, push tokens, drills and lists. Messages and notices she wrote
  stay. A child left with no family is taken off her team, her games keeping
  her name and number, and her record is kept, marked as having left, for
  the admins (the owner's decision). Refused while she is a club's only
  admin. Then her phone deletes the sign-in.

Rules version 25 (`forgetRequests`, and the deletes above). New suite
`test/forget.js`; `register.js` and `rules.js` pin the rest.

---

## The GotSport export — 2026-10-09 (build 126)

Registration's fifth step (AUTH.md, *The GotSport export*). A program's
registrations → **Export for GotSport**: a CSV of every child placed or
accepted, with her team and number, birth date and gender, and the parent
who registered her (name, email, and the first phone number in her care
details), in the columns the bulk import already reads from a registration
system plus those a state registration needs. Admins only, built on the
phone, a warning before it saves. A cell a spreadsheet would run as a
formula is written as text. The column names are matched to GotSport's own
template once the owner has one (GOTSPORT.md, still open).

---

## Placing on a team, and sessions for a child on no team — 2026-10-09 (build 125, rules version 24)

Registration's fourth step (AUTH.md, *Accepting and placing*, *Sessions for
a child on no team*).

- **Admins place an accepted child on a team** from her registration: the
  teams within a year of her age are offered. She joins the squad by her
  first name with her family as its parents (the coach gives her a number),
  her club record names the team, the team's families table is brought into
  line, and the registration says *On a team*. Her care details follow her
  to that team's coaches by the server.
- **A child in the club on no team books training sessions**, which is what
  a family registering only for 1-1s and groups wanted. Her family asks for
  a place, and books a coach's time, for her as the club; the coach books her
  from *Add players → No team yet*. The rules (`booked`, `fees`, `packs`,
  `packuse`) and the booking server find her family on her club record, and
  only once the club has let her in.

Rules version 24. `test/register.js`, `test/book.js` (on orgs/) and
`rules.js` pin it.

---

## Registration: programs, the link, the form and waivers — 2026-10-09 (build 124, rules version 23)

Registration's third step (AUTH.md, *Registration*).

- **Admins make programs** under Club settings → **Registrations**: a
  season, a camp, tryouts, training sessions; birth years, girls or boys,
  opening and closing dates, places, a fee (shown, never taken: families pay
  the way the club says until payments are built), questions (a star for one
  that must be answered) and the club's waivers. Each open program has a
  link, made by the secure generator, to post anywhere.
- **Waivers are the club's words, versioned.** Changing them makes a new
  version (the old words kept), and the next registration asks again. Only a
  family agrees, in her own name with her name typed, once per version; an
  agreement is never changed or taken back.
- **A family who is not in the club** opens the link, signs in, and fills one
  form per child: her name, birth date and gender (held to the program's
  years and who it is for), someone to call and what a coach must know, the
  program's questions and its waivers. Her phone writes her child, her own
  list, care, the registration and each agreement, in that order. She is not
  in the club, and reads none of it, until the club says yes.
- **Admins accept**, put on the waiting list or decline, with a note of their
  own. Accepting lets the child into the club, and her family with her.
- **A coach or an admin starts one for a family** from the child's record: a
  draft her family finishes (the coach agrees to nothing), shown to the
  family on My players beside any open program her child fits.

Rules version 23. New suite `test/register.js`; `rules.js` walks who reads
and writes each part.

---

## Care details for the coach at the pitch — 2026-10-09 (build 123, rules version 22)

Registration's second step (AUTH.md, *Care: what a coach needs at the
pitch*): who to call and what a coach must know about a child, given by her
family.

- **Her family gives it** on *Check her details*: up to two people to call
  (someone is insisted on before she confirms), allergies, conditions,
  medication and a doctor, each "none" by being left empty. Stored at
  `care/{cid}`, read and written by her family and the admins only.
- **Her team's coaches read a copy**, `teamCare/{tid}/{pid}`, on her page in
  Squad, with a link to ring each contact. Never another team's coach, a
  tracker, a helper, a viewer or a fan (the owner's decision). The server
  keeps each team's copy from her family's and the child's teams
  (`careCopy`, and `accessChild` when she joins or leaves a team); her
  family's phone writes them too.
- **Never anywhere else**: not on the child's record, a squad, a game,
  `public/`, a push, or an admin's *Download a copy*.

Rules version 22. `test/children.js`, `rules.js` and `access.js` (both
passes) pin who reads and writes it.

---

## A child in the club — 2026-10-09 (build 122, rules version 21)

Registration's first step (AUTH.md, *A child in the club, and
registration*, step 1): a child is a person in the club, not only a row in
one team's squad.

- **One record per child**, `orgs/{code}/children/{cid}`: her name as her
  family gives it, birth date, gender, the squad records that are her, her
  family, and whether her family has confirmed it. Each squad record points
  back (`child`). Coaches and admins read every child, as they read every
  squad; a family reads her own by path; nobody else reads one.
- **Every child already on a team gets one** (the owner's decision), made by
  an admin's phone or the server from the squad, under the player's own id,
  for her family to confirm.
- **A coach adding a player registers her** with the club for her family.
- **Her family confirms**, and only her family: the first time her phone
  holds an unconfirmed child it asks, once (*Check Ella's details*: what the
  club has, and only what is missing), then a card on My players until she
  does. Her family, an admin, or the coach who added her (until the family
  confirms) changes the record; checked in the click handler and the rules.
- **Her family on a team is copied onto the child** as the squad says it,
  by the server, staff phones and the family's own, and the rule lets a copy
  say no more than the squad does. A family named on the child herself
  (`family`, for a child on no team) comes from a parent invite that names
  the child, and lets her into the club once an admin or coach has let the
  child in (`club: true`).
- **`families/{uid}`** at the root: each person's own list of her children,
  so another phone finds a child on no team.

Rules version 21. New suite `test/children.js`; `rules.js` (both passes) and
`access.js` (both passes) walk the rest. Not yet: care details, programs,
the link and form, waivers, placing, sessions for a child on no team, the
GotSport export and deleting (steps 2 to 6).

---

## AUTH.md: a child in the club, and registration, designed before any code — 2026-10-09

A child exists today only as a row in one team's squad, so a family who
wants 1-1s for a child on no team has nowhere to be, next season starts from
nothing, and nothing says the family ever agreed to what a coach typed.
AUTH.md, *A child in the club, and registration*, designs the club-level
record of each child (`orgs/{code}/children/{cid}`, the squad pointing back
with `child`), how a family finds hers (`families/{uid}`), how she gets into
the club (only once a child of hers is in it, so a program link on the club's
website is not a way to the calendar), three ways a child is registered (a
family through a program link; a coach or an admin for a family, who
confirms it when she joins and is asked only for what is missing; every
child already on a team), care details for coaches (a per-team copy), then
registration itself as `GOTSPORT.md` step 4 laid it out: programs, the link
and the form, versioned waivers only a family agrees to, accepting, placing,
sessions for a child on no team, the GotSport export and deleting. Six build
steps and five decisions, which the owner made the same day: birth dates
read by coaches and admins, care by her team's coaches and admins, a
sessions-only registration accepted by an admin, every child already on a
team given a record for her family to confirm, and a child whose family
deletes its account taken off her team (her games keep her name and number)
with her information kept on the admins' list to delete. No code yet: it is a schema and
rules change, and this file is where those are settled first.

---

## Fans, and links with limits — 2026-10-09 (build 121)

The first of AUTH.md's new kinds of people still to build (AUTH.md, *More kinds of people*, 1), as the owner decided it and then renamed it, and links with limits.

**Fans: a player's people.** Grandparents, an aunt, a family friend who want the games and the calendar on their own phone. Anyone who can see the player asks with a link (her family, the player herself, her coach, an admin); the team's coach approves, and a coach or admin asking is approving. A fan reads less than a parent: the calendar, Live, scores, the recap and the team's notices, her player by name; never "going", a conversation or a session. Stored on the child's record (`squad/{tid}/{pid}/fans/{uid}`) with a lookup table, `access/teamFans`, kept by the phones and the server (`accessFansOrgs`); on `orgs/` only. New suite `test/fans.js`.

**The family decides about them:**

- **Her family sees who.** A fan's name is kept on the child's record
  (`fanNames/{uid}`), because a family cannot read the club's members; she
  writes it on accepting a coach's link, the coach writes it on approving.
- **Her family takes one away**, from *My players* → Fans. The record and
  the name go, then the team's table: the rules let anyone in the club clear
  a `teamFans` entry once the record no longer names her. Her index entry
  stays the staff's phones' and the server's to take.
- **A fan leaves on her own**: *Stop following* on her card, and out of the
  club if that was her only role.

**Every link can be held to how many people and until when:**

- **Invites** (admins', a squad's parent links, a player's own, a fan's):
  one to fifty people, a day to ninety. A rule cannot count, so a link for
  several carries a seat per person; whoever opens it takes a free seat and
  then says it is hers (`took/{uid}`), which every grant rule now accepts
  beside a single-use `used`. Its id starts `m` and nobody's leaving deletes
  it under the others. One person and fourteen days stay the default; an
  emailed invite and a player's own link are always for one.
- **The team link**: no limits by default, as before, or seats and an end
  date; an expired or full one says so before anyone types.
- **Share pages and feeds** (season, a game's page, the team's feed, My
  calendar's address): an end date, `until` on the page. The `public/` read
  rule refuses it after that and the calendar function answers 410. No use
  limit here: nobody signs in to open them.

Rules version 20, on top of main's 19 (helpers, viewers, server booking, server-published share pages). New suite `test/links.js`; `rules.js`, `fans.js`,
`calfeed.js`, `access.js` and `mycalfeed.js` walk the rest.

---

---

## Only the server publishes share pages — 2026-10-09 (build 120)

Any signed-in Google account could claim an id nobody had used under
`shareOwners`, publish a page at `public/{id}`, and send round a link to it
on this site: "Saturday's game is cancelled, meet at…" under the club's own
address. The rule had to let phones write `public/`, because phones
published, and it could not tell a coach from anyone else for an id no club
had claimed. The owner decided (2026-10-08) that phones stop publishing
(SECURITY.md, SEC-10, now SEC-D11).

- **The server writes every share page.** `functions/mirror.js` builds the
  season link, each game's own page and the members' feed from the club,
  with the app's game math (minutes, who is on and where, the score, shots,
  set pieces, possession, the sub log) ported to `functions/game.js` and
  held item for item to the app's `publicDoc()`, `fixtureDoc()`,
  `publicGame()` and `calendarDoc()` by `test/mirror.js`.
- **It hears the sideline as fast as the phone published, and more
  reliably.** It wakes on each part of a game the phone writes anyway (a
  goal, a sub, the clock, each under its own id, never the game whole), a
  game's answers, a player's number or name, a team's name, badge and ids,
  and its entries. Those writes are in the phone's outbox; a publish never
  was, so a page closed with no signal used to lose it.
- **One run at a time per team.** A sub is two writes; a queue
  (`serverState/publish`) keeps two runs from writing a page in the wrong
  order, and a run that finds the queue busy leaves word and goes.
- **New games reach every page, deleted games and replaced links come
  down**, which used to be the phone's. Whose page is whose is the server's
  record (`serverState/pages`), so another club naming a link writes
  nothing there and taking it away takes nothing down; a page from before
  is taken on only if this club's admin or coach owned it.
- **My calendar's feed is the server's alone.** The phone's fallback
  (`feedPublish()`) is gone, and a replaced or turned-off address is taken
  down by the server when her setting changes.
- **The phone makes ids and nothing else.** `schedulePublish()`,
  `publishTeam()`, `claimShare()`, `claimTeamIds()` and *Republish now* are
  gone. The share sheet says when the server last wrote the page.
- **Rules version 19:** `public/$share` is `.write: false` for every
  account, admins included, and `shareOwners` is gone. An old phone's
  publish is refused, which costs nothing: the server already wrote it.
- **Every calendar entry links back into the app.** The server cannot
  know where the site is, so `functions/.env` says (`SOCCER_SITE`, the
  GitHub Pages address, committed: it is not a secret). A game in a
  subscribed calendar opens its page, a practice the team's calendar, and
  My calendar's entries My calendar; each still carries home or away, when
  to arrive, kit, notes, the place and, once played, the final score.
- The move copies games twenty at a time now, since each part of a game
  wakes a run.

---

## Training sessions and club activity reach a closed phone — 2026-10-09 (build 119)

The last of the server's notification work (GOTSPORT.md, build order step
2). A family booking a coach's time, a place confirmed or turned down, a
session called off, a coach calling out: each was worked out on each phone
while Minutes was open on it, so a closed phone heard none of it, and an
admin heard the club's activity only when she next opened the app.

- **Three new triggers** (`functions/news.js`): a booking changing, a
  session written, a coach's time off. Each tells whoever the open page
  would tell, in its words, and nobody about what she did herself.
- **A family** hears about her own child's place (booked, on the waiting
  list, moved off it, not this time, taken off) and a session she is in
  being moved or called off in the next two weeks; by first name, never
  another child.
- **A coach** hears families asking for, booking, waiting for, withdrawing
  from and cancelling her sessions and times; her team's other coaches hear
  when she calls out.
- **The admins** hear the club's activity: every team's game or practice
  new, moved, called off, back on or deleted (from the calendar's own
  triggers, which told only the team before), a session added or called
  off, a family booking a coach's time, call-outs and time off. Under their
  own *Club activity* switch, so an admin of many teams can turn it off and
  keep her own team's.
- **A session saved carries who saved it** (`edit`), as calendar entries
  do, so the coach who called it off is left out and the admins are told
  who did.
- **A deletion says who made it.** The app stamps a whole entry or game
  with who is deleting it just before it goes (`remoteDel()`), so the
  admins' *Deleted* for a practice or event leaves her out and names her.
  A deleted game, gone field and all by the time the server hears, is named
  from a note the server keeps of each dated game (`serverState/calGame/`,
  which no phone reads); that note is not woken by the stamp, so an admin
  who deletes a game still hears about it herself.

---

## Booking a coach's time is one call to the server, with a waiting list — 2026-10-09 (build 119)

A family booked a coach's slot from her own phone, in three writes the rules
checked one at a time: the slot's session, a numbered seat, then her child's
booking naming it. A rule cannot count, search or do dates, so the coach's
window carried a list of the slots it still offered, kept by the coach's or
an admin's phone, and a key per place. That left three holes the rules
printed (SERVER.md, *Bookable times and training sessions*): a practice
added from another phone stayed bookable until one of theirs next opened
the app, a seat taken with no booking behind it waited ten minutes to be
let go, and one child could hold two seats by hand. And a full slot could
only say no. Worth closing before payments, when a place will be money.

- **Her phone asks; the server books** (`functions/book.js`, `bookAsk`). The
  ask is one write at `bookAsks/{code}/{uid}/{id}`, hers alone; the answer
  appears beneath it in a second or two. The server checks she is a
  guardian of the child, that the start is on the coach's grid and not
  past, that the coach is free as the club stands now (her teams'
  practices and games, her other sessions, her time off and her busy times
  at other clubs; a call-out frees her) and the child too, then counts the
  places inside one transaction and writes the session and the booking.
  Two families can never both have the last place, and a child is in a
  slot once.
- **A taken slot has a waiting list.** A family can join it instead; the
  moment a place comes free (a family cancels, the coach takes a child off
  or turns one down) the first on it is moved in (`bookFreed`).
- **Cancelling is the same call**, held to the coach's notice and to nothing
  being paid or marked; a slot nobody is left in goes, so the time is free.
  A place on the waiting list can be given up any time.
- **Seats and the slot list are gone**, with the coach's and admins'
  phones keeping them; a block now carries its midnight (`day0`) for the
  server to time slots by. Rules version 18: a family can no longer write a
  slot's session or booking at all, `seats` is removed, and `bookAsks` is
  added. Booking needs the functions deployed; without them her phone says
  there was no answer.

---

## Club-wide viewers — 2026-10-09 (build 118, rules version 17)

AUTH.md, *More kinds of people*, 3, as the owner decided it: a director or
a board member who should see every team's games with names and do nothing
else. Until now the only way in was a role that does much more (a coach
reads members' emails, a parent answers and messages).

- **A club viewer** (`access/viewers/{uid}`, orgs/ only) sees every team's
  calendar, games, Live, stats and recaps, with every child's name whatever
  the club's roster setting. No members' emails, no access log, no coach's
  notes, no messages, no answering who's coming, and she changes nothing:
  every team is read-only for her, checked in the click handler and by the
  rules, where no write names her.
- **She is in the club's index**, like everyone else in it (the owner's
  call), so admins' phones and the server keep her there, she can follow a
  game, and its push names the scorer for her. Beyond the index she reads
  every team's squad, for the names.
- **An admin makes one** from People (*Club viewer*) or with *Invite
  someone → Club viewer*, which asks for no team.
- **Guests are not built**: the owner dropped them, since the game link
  already gives a referee or a scout the game without signing in. That link
  is unchanged and still carries no names.

---

## Team helpers: staff who help the coach prepare — 2026-10-09 (build 117)

The first of AUTH.md's new kinds of people, as the owner decided them: a
team manager, a volunteer or an assistant who helps the coach get ready and
doesn't run the game, and reads no family's conversation.

- **A role on one team**, `access/teams/{tid}/helpers/{uid}`, named by an
  admin (People → *Invite someone* → Team helper, or giving the role to
  someone already in). A coach can't, as the rules on `access/teams` already
  had it.
- **What she does**: the team's calendar (practices, events and games, one
  entry at a time), the register, notices, practice plans, the drill shelves,
  and a game's plan, who is out of it and its details **until kick-off**.
  Never the clock, the subs or logging, never the squad, never the coach's
  notes or members' emails, and Subs, Track and Pitch are not her tabs.
- **The three rules that only asked "any role on this team?"** were decided
  again: the squad and the notices let her read (she is staff); a game no
  longer did. The match rule now asks for a coach or tracker, and a helper
  writes a game only while it has no `periods` and no `ended`.
- **One more lookup table than AUTH.md planned**, `access/helperIndex`,
  coachIndex's twin, because the club's drill shelves are read whole and a
  rule cannot ask "a helper of any team?" any other way. Kept by the phones
  and `functions/access.js` like the others. `teamIndex` gains a `'helper'`
  value, below tracker and coach.
- **Push needed no change**: notices and calendar changes reach her as they
  reach the rest of the team, a family's messages never do (`test/push.js`).
- Rules version 16, written for `orgs/` (every club). `test/helpers.js` is
  new; `rules.js`, `access.js` and `push.js` walk a helper through every rule
  and table.

---

## The coach's notes are coaches' and admins' only — 2026-10-09 (build 116)

A coach's note on a child ("shy in goal"), her rating, and who to pair her
with or keep her apart from sat on the child's own record. Since the move to
`orgs/` that record is read by the child's family and the player herself,
so a family could read what the coach wrote about her child with a
browser's developer tools, and every new kind of person in AUTH.md would
have read it too. The owner decided they are coaches' and admins' only
(SECURITY.md, SEC-12, now SEC-D10).

- **They have their own place**, `coachNotes/{tid}/{pid}` beside the
  child's record, which only coaches (any team, as the squad) and admins
  read; trackers, families and the player do not. The record refuses them
  (rules version 15).
- **Nothing changes on a coach's screen.** Her phone reads them and lays
  them back on the player, and every write sends them there
  (`clubWrites()`), a field at a time and only the fields it carries, so a
  whole team saved from a phone that has not read the notes yet never wipes
  them.
- **Notes already on a record move by themselves**: the first time a coach
  of that team or an admin opens the club, her phone writes each one to its
  new place and only then takes it off the record, never overwriting a newer
  one, and leaves it where it was if refused, to try again next time.
- **A family's or tracker's phone drops them** from anything it reads, its
  own child's record and its copy from before included.
- The server's `moveClub` lays a club out the same way.

---

## AUTH.md: more kinds of people, designed before any code — 2026-10-09

The owner expects to let in people who are not coaches, trackers, parents
or the player: supporters under a player (grandparents and friends), team
helpers (a manager, a volunteer), club-wide viewers (a director) and
outside people (a referee, a scout, a guest coach). AUTH.md, *More kinds of
people*, says where each would live, what it reads and does, what each
costs in the rules, the app and the server, the order to build them in,
and the owner's six decisions (the same day): supporters asked for by
anyone and approved by the coach; helpers who plan practices and games but
read no family's conversations; viewers who see games with names and
nothing more; signed-in guests with names, the game link still without.
And one that comes first: the coach's notes on a child are coaches' and
admins' only, so they come off the child's record before any new role
reads it (SECURITY.md, SEC-12). No code yet: a role is a schema and rules
change, and this file is where those are settled first.

---

## A game you follow reaches a closed phone — 2026-10-09 (build 116)

The Live tab's *Notify me* only ever worked while the page was open: a
grandparent following from home heard nothing once the phone locked, which
is when they wanted it. Messages and calendar changes already reached a
closed phone (builds 104 and 105); a followed game was the part of
`GOTSPORT.md`'s step 2 still left.

- **Following is stored, as well as kept on the page**: one record at
  `follow/{code}/{game}/{uid}`, hers alone, written on *Turn on* and taken
  away on *Stop* or when she follows another game (`followRemote()`). The
  rules (version 14) allow it only for someone in the club and a game that
  exists and hasn't ended; nobody lists who follows a game.
- **The server sends what the page did** (`onFollowed` in
  `functions/push.js`): goals, kick-off, each later half under way, half
  time and full time, with the score, to every phone she turned
  notifications on for. It wakes on a goal created, a stretch of play
  created, `currentHalf` and `ended`, never on the game, which a live game
  writes every few seconds; a game nobody follows costs one read per goal.
- **The scorer is named as the screen names her**, worked out for each
  person it goes to: by name to admins, coaches and trackers, her own family
  and herself, and to everyone once the club's admins open the roster
  (*names or shirt numbers*, Club settings); otherwise `#7`. That is also
  exactly what a family's phone may read on `orgs/`. A goal is usually
  tapped first and its scorer added a moment later, so adding the scorer
  sends the same notification again under the same tag: it replaces the
  first, without a second buzz.
- **Nothing late.** A goal sent hours on from a phone that had no signal, a
  backup loaded, or a game reopened next week says nothing; each moment is
  said once (a redelivered event included), and the follows are cleared at
  full time.
- The Live tab's card and the Notifications card say when they reach the
  phone with Minutes closed, and stop saying "while this page is open" when
  that isn't so. A refusal from older rules is said only on a phone with
  notifications on, where it costs something; the page keeps following.
- `test/push.js` holds who hears what, what wakes the server, and the phone's
  writes; `test/rules.js` the new rule on both trees.

**The docs catch up with the move.** Every club is on `orgs/` (the owner,
2026-10-09), so AUTH.md's build order step 4, SECURITY.md's SEC-1 (now
SEC-D9, done), GOTSPORT.md, README and CLAUDE.md stop saying the move waits
on the owner; what is left is taking the old tree out, a fortnight on
(AUTH.md, step 5, from 2026-10-23). SERVER.md also stops saying the rules
are pasted by hand: a merge to main publishes them.

## More ways to sign in — 2026-10-09 (build 115)

Google, an email link and a password were the only ways in, and a parent
who lives on an iPhone or a work Microsoft account had to make do with one
of those. Apple and Microsoft are now there too, for a club that switches
them on.

- **A button per company the club switched on.** Each method has to be
  turned on in the Firebase console first, and one that isn't fails with a
  code nobody at a sideline can read, so `firebase-config.js` lists them
  (`SOCCER_SIGNIN`) and only those are drawn. Left out, it is Google alone,
  as before. README, *Sign-in methods*, has the Apple and Azure setup.
- **One person stays one account.** With "one account per email" on, an
  email that already has an account is refused a new way in. The app now
  says so, asks her to sign in the way she did before, and adds the new way
  to that account (same email only), instead of leaving her stuck.
- **Your account lists the ways you sign in** and adds the others, and
  takes a name: Apple gives one only the first time, and its hidden email
  address was being turned into a name.
- **Forgot your password?** sends a reset link, without saying whether the
  address has an account.
- **An invite for one address explains itself** when Apple has hidden hers
  or Microsoft never confirmed it, instead of an Accept the database refuses.
- **The sign-in screens look the part.** A pitch-green header with the
  club's crest, each company's button in its own colours and mark (drawn
  inline, so nothing new is fetched and the CSP is unchanged), a switch
  between *Email me a link* and *Use a password* instead of both at once,
  a *Show* for the password, and email and password boxes styled like every
  other box (they had been left bare). Your account has an avatar, and lists
  the ways in with a tick each. The lock screen is the same card.
- `test/signin.js` pins all of it.

Not done: sign-in by phone number (cost per text, scripts the CSP blocks,
and no email for invites or links). AUTH.md, *Sign-in*, says why.

---

## Offline is not signed out — 2026-10-09 (build 114)

With the phone's internet and mobile data off, the app opened on *This club
needs a sign-in*, while swiping back showed the club for a moment: the copy
was on the phone the whole time. With no signal, Firebase's sign-in library
cannot check the session with its server, and it can come back saying nobody
is signed in. The app took that at its word, forgot who was using the phone
and locked the club in front of its own coach, at the one place this app is
for.

- **A "nobody" while the phone is offline leaves the person this phone last
  verified signed in**, unless she pressed Sign out (here or in another tab;
  Sign out now forgets her before Firebase hears it). It is asked again when
  the signal comes back, and if Firebase still has nobody, she is signed out
  then. The rules still decide what her account may read; this only decides
  what the phone draws from its own copy, as the cached identity always has.
- `test/sync.js` pins all four: offline, back online, Sign out offline, and
  signed out in another tab.

---

## A club owner: admins cannot remove one another — 2026-10-08 (build 113)

Any admin could take every other admin away and have the club to herself,
or take another admin's index entry and shut her out while leaving her an
admin on paper. The rules cannot tell a rightful removal from a hostile
one, so the club now has someone they can tell apart (SECURITY.md, SEC-D8,
the owner's four decisions).

- **A club owner** (`access/owners`, a list, each an admin too) is the only
  one who takes an admin away, takes an admin's index entry, makes or ends
  another owner, or retires the club. Admins still appoint admins and step
  down themselves. Rules version 13, on both trees, and the move carries
  owners across.
- **Whoever starts a club owns it.** A club from before this keeps the old
  rules until one of its admins taps *Become the club owner* under Club
  settings → People; *Check readiness* has a cross until somebody does.
- **Everyone who runs the club is told.** A new server trigger pushes every
  admin or owner change to every admin and owner, the person it happened to
  included, and keeps it at `clubAudit/{code}`, which admins read and no
  phone writes. It cannot be muted.
- **The log tells the truth.** Making someone an admin was logged as
  *removed admin* and the other way round, because the log was written
  after the change; it is now written before, which is also what lets the
  server name who did it.

---

## Moving a club that has nothing logged — 2026-10-08 (build 112)

The *Move* button waited for the server and nothing came back. The server
built the new tree with any part the club did not have yet (no access log,
no answers) left as `undefined`, and the database's own library refuses a
write with an undefined anywhere in it, so the move failed before writing
anything, its answer included. Nothing in the club was touched.

- **The move leaves out parts a club does not have**, and any error it
  meets is written back as its answer, so a phone is never left waiting.
- **A reload no longer forgets the request.** The card shows a request
  still waiting, then what the server said; one with no answer after two
  minutes (like the ones made before this fix) offers *Try again*.
- **The fake server refuses `undefined` as the real one does**, so the
  tests now fail the way production did (`test/move.js`).
- **The move goes in batches.** The next try said *TOO_MANY_TRIGGERS*:
  the database refuses one write that would wake more than a thousand
  function runs, and moving a whole club in one write wakes one for every
  player, practice and game, on both trees. It now copies the club a batch
  at a time, checks the copy, switches it in one small write, and takes the
  old tree away a batch at a time. While it runs, every other function
  leaves the club alone (`serverState/moving/{code}`), so nothing is half
  updated and the old tree emptying is not read as everybody leaving (which
  would have taken their bookmarks to the club). A failure before the
  switch takes the copy away; one after it is finished by asking again. The
  fake server now enforces the limit too, and `test/move.js` moves a club
  of 480 players, 1,200 entries and 250 games.

---

## The Move button asks — 2026-10-08 (build 111)

The *Move* button on Club settings said the database refused it and asked
whether rules version 12 was published, though it was. Before asking, the
app cleared any earlier request so it could write a fresh one, and it did
that even when there was none. The database counts deleting nothing as a
write, and the move request's rule allows deleting only a request that is
there, so the clearing was refused and the request never went. It now
clears an earlier request only when there is one. No rules change, so
nothing needs publishing. `test/rules.js` pins the refusal and
`test/orgs.js` stands it in for the button.

---

## Families' phones hold only their own children — 2026-10-08 (build 110, rules version 12)

SECURITY.md, SEC-1, and AUTH.md, *The move to `orgs/{orgId}`*. Everyone in a
club read all of `workspaces/{code}` at the database, so a parent's phone
held every child on every team, the coach's notes and ratings on each, who
to keep apart, and every member's email. The app drew the others by shirt
number, but that was the screen's choice; the data was on her phone.

- **A club can move to `orgs/{code}`**, where each part has its own readers.
  The squad (`squad/{tid}`) is its team's staff's, every coach's and the
  admins'; a child's record is also her own family's and her own. Everyone
  in the club reads the teams, games and answers, a roster of shirt numbers
  (`roster/`, names only while the club opens the roster) and the staff's
  names (`names/`, never an email). Emails (`members/`) are the admins' and
  coaches'; the access log is the admins'. The id stays the workspace
  code, so training, messages, invites, links and every phone's copies stay
  where they are.
- **The admin presses Move** (Club settings, *Keep the squad off families'
  phones*). The server checks she is an admin, refuses while a game is
  being played, moves the club in one write, reads it back and compares,
  puts it back if anything differs, and keeps the old tree aside. The
  lookup tables are built whole on the way, closing the old tree's bridges.
  New clubs start on the new tree.
- **Every phone carries on.** It reads a moved club a part at a time and
  puts the familiar shape back together, so no screen changed. A family's
  phone forgets every other child the moment it sees the move, before it
  reads anything. Writes wait in the outbox until the session's first read
  says which tree the club is on, so a goal tracked at a field before the
  phone heard of the move goes to the new tree; a move under an open phone
  reads as everything being deleted, so removals wait a tick for the
  moved marker and nothing is deleted or reported.
- **The rules are built now** (`tools/rules-source.json` →
  `node tools/rules-build.js` → `database.rules.json`): about two hundred
  lookups into a club each ask whichever tree it is on. Nobody can start
  `orgs/` under a code the old tree holds, which would hand them every rule
  for that club, nor write to the old tree of a moved club. `rules.js`,
  the four server suites and the new `orgs.js` and `move.js` check both
  trees.
- **Still to do, by the owner:** merge (the functions deploy and the rules
  publish), turn on daily backups, move an older test club, then the real
  one (SECURITY.md, SEC-1).

---

## A Content-Security-Policy on every page — 2026-10-08 (build 110)

SECURITY.md, SEC-3. Data in this app is typed by many people and drawn with
`innerHTML`. `esc()` covers text, but a missed `javascript:` link or a
script slipped into a page would run on this site, where a coach's sign-in
and the club's copy live; both bugs in SEC-D4 were that.

- **`index.html`, `live.html` and `game.html` carry one policy**, as a
  `<meta>` because GitHub Pages cannot send headers: scripts only from this
  site, Firebase's SDK (`www.gstatic.com`), Google sign-in
  (`apis.google.com`) and the database's long-polling fallback; never
  inline, never `eval`. Connections to the database, Google's APIs (Auth,
  push registration) and the functions; frames for sign-in and the
  database's fallback; `object-src 'none'`, `base-uri 'self'`. Styles keep
  `'unsafe-inline'` for the `style=` attributes the app draws.
- **Tried in Chromium against the live project**: the database read over
  both the WebSocket and long-polling, Google sign-in's popup and frame, the
  service worker, the push hosts, and both share pages, with nothing
  refused; a `javascript:` link, an `onerror=` and an injected `<script>`
  placed in the page did nothing.
- `test/version.js` holds every page to having it, first, the same on each,
  with no inline scripts allowed.

---

## Only you, an admin, or a coach filling a gap changes your name — 2026-10-08 (build 110, rules version 11)

SECURITY.md, SEC-2. `access/members/{uid}` (each person's name and email)
could be written by anyone with a role in the club, so a parent could rename
the admin or a coach, and every coach's name on sessions, People and
bookable times comes from there (`personName()`).

- **Her own entry, or an admin.** Nobody else changes or deletes one that
  is there.
- **A coach of any team may fill in an entry that is not there yet**
  (`access/coachIndex`), which is all approving a family through the team
  link does (`approveClaim()`). A parent or a tracker fills in nobody.
- **A bridge for a club with no `coachIndex`:** anyone in the club may fill
  in a missing entry, as approving always needed, and still nobody but her
  or an admin changes one already there. The table appearing closes it.
- Rules version 11. Every write the app makes still goes through: signing
  in, starting a club, an invite, the team link, a coach approving, and an
  admin pushing the club (`test/rules.js`).

---

## Share, game, feed and club ids from the secure generator — 2026-10-08 (build 110)

SECURITY.md, SEC-4. Invites and team links already came from the browser's
secure random generator; a team's share link, each game's link, a team's
calendar feed, My calendar's address and a new club's code still came from
`uid()`, which is `Math.random`. Each of those ids is the whole of what
stands between a stranger and what it opens, and `Math.random` is built for
speed, not secrets.

- **`randId(prefix)`**: 16 bytes from `crypto.getRandomValues`, as hex, so
  every id is 33 characters or so and passes the feed's id check (6–80
  letters, digits, `_`, `-`) and the rule on My calendar's address (6–40).
  `secretId()` is the same thing at 18 bytes, unchanged in length.
- **No `Math.random` fallback.** A phone with no secure generator cannot
  run Firebase either, and a weak id that looks strong is worse than none.
- Ids already handed out keep working; *New link* and *New address* make a
  strong one. `test/ids.js` traces each kind of id back to the generator.

---

## Two links that could run someone else's code — 2026-10-08 (build 109)

Found looking for what else needed locking down. `esc()` keeps a link inside
its quotes, but it cannot stop a `javascript:` address, which runs on this
site when tapped: the site where a coach's sign-in and the club's copy live.

- **The share page's *Open in Minutes*** took the app's address from the
  page it was showing. A page under an id nobody has claimed can be written
  by any signed-in account, so anyone could make a share link whose button
  ran their script for whichever coach tapped it. `live.js` now builds the
  address from its own location, and encodes the team and game it names.
- **A game's Veo link** was drawn as typed, and anyone who can write a game
  (a tracker included) could type anything. It is now `https` or nothing:
  checked when typed, when imported (with a warning) and again when drawn.

---

## My calendar's feed comes from the server, and leaves with the role — 2026-10-08 (build 109)

The third job off SERVER.md's list. A person's calendar feed (one address,
every club) was built by her own phone from what it held, so it was only as
fresh as the last time one of her phones was open with a signal; a parent
who never opened the app kept last month's practice times in her calendar.
And another club's typed titles were left out, because her phone held only
her own children there, not the names to scrub them with.

- **The server builds it** (`functions/mycal.js`): from her roles in each
  club she is in (her teams, her children's teams, the sessions she runs or
  her children are in, her bookable times), the same items under the same
  ids as the phone built, so a calendar already subscribed sees no
  difference but freshness. Every club's typed titles are there now, every
  word of every player's name in that club taken out.
- **A few minutes after a change, not on every write.** Triggers on
  entries, a game's when and where, a team's people, sessions, bookings and
  bookable times only mark the club (`serverState/myCal`); `myCalBuild`
  rebuilds the feeds those marks reach every five minutes, each club read
  once however many feeds it is in. A weekly practice added a week at a
  time is one rebuild, not thirty, and a game being played marks nothing.
- **A role taken away is out of her calendar on the next run**, whether or
  not a phone of hers is ever opened again. Her list of clubs only says
  where to look, so a club she adds to it herself gives her nothing.
- **It writes her page and nobody else's**: the address in her own setting,
  claimed by her alone, and a My calendar page or nothing yet. Naming
  someone else's feed, or a team's share link, as her own writes nothing.
- **Her phone hands it over.** The server marks its page `by: 'server'`;
  her phones wait to hear who keeps the address before their first write,
  and stop once the server does. The card on My calendar says which.
- **A team's calendar address is for its staff now.** One address shared by
  a whole team cannot be taken back from one family, so a family taken off
  the team went on receiving its practices for as long as the coach left the
  address alone. Families are pointed at My calendar's feed, which is
  theirs alone and leaves the team with them; coaches, trackers and admins
  still have the team's, for a website or a noticeboard, and are told to
  replace it when someone leaves. Families already subscribed to a team's
  address keep receiving it until a coach replaces it once.

---

## Access taken away stays taken away, signal or no signal — 2026-10-08 (build 109)

The owner asked whether someone whose access is withdrawn can turn off Wi-Fi
and mobile data and keep the club. Online, the answer was already no: the
database refuses her, the club is hidden at once and the phone's copy is
cleared a day later. Offline, there were two holes.

- **A refusal was forgotten on reload.** It lived only in memory, so after
  one refusal she could go offline, reload, and have the whole club drawn
  from the phone's copy again, for as long as she stayed offline. Now the
  refusal is kept on the phone: the club stays shut through any number of
  offline reloads, and a day after the refusal the copy is cleared even with
  no signal. The day's wait is still there so a mistaken refusal loses
  nothing; one good read brings everything back.
- **A copy was drawn for ever without the club confirming it.** The comment
  on `purgeClub()` said a long-unopened copy ends; nothing did it. Now a
  club the phone has not been able to check with for **30 days** is not
  drawn until it does (*Connect once to carry on*), and another club's copy
  on My calendar the same. The copy is kept, not cleared: an unsent game may
  be in it. Thirty days is so a coach whose phone never finds signal at the
  fields still has her squad.
- **Clearing a club takes its cached family conversations too**, which it
  used to leave behind.

What a phone already held can still be screenshotted, and a device clock
turned back gets past the thirty days; nothing on a phone can stop either.
What decides who reads the club is the rules, and those refuse her the
moment the lookup tables change, which the server now does at once.

---

## The share pages follow the calendar, whoever changed it — 2026-10-08 (functions only)

The second job off SERVER.md's list. A team's share link, its games' own
pages and its members' calendar feed were written only by the phone that
made a change, and only for the team open on it. So picture day booked
across every team, a run of games added from All teams, an import, or a
practice called off from a phone that then lost signal reached families'
share pages and subscribed calendars only when somebody next opened that
team.

- **`mirrorEvents`** rewrites a team's entries on its season link (only
  those marked for it, so making one team-only takes it off at once) and
  its members' feed (every one).
- **`mirrorGame…`**, one per field (date, kick-off, called off, place,
  opponent), rewrites a game's when and where wherever it already is, and
  adds a game new to the members' feed. Never on the whole game: the score,
  minutes and log while it is played stay the sideline phone's, and a goal
  wakes nothing.
- **The same promises as the phone's copy:** free text scrubbed of every
  player's name, a page that does not exist never made, a test club never
  published. `test/mirror.js` holds it to the app's own builders.

---

## Who may read what is kept true by the server — 2026-10-08 (functions only)

The first job off SERVER.md's list. The rules answer "may she read this?"
from five lookup tables (`access/index`, `teamIndex`, `teamParents`,
`teamPlayers`, `coachIndex`), and until now only an admin's or a coach's
phone rebuilt them, when it next connected. So a parent the coach unlinked
kept reading that team's notices, and stayed in the club, until somebody
with the right role happened to open the app (`rules.js`, gap 5).

- **Four triggers, one per place a role lives** (`accessAdmin`,
  `accessStaff`, `accessGuardians`, `accessSelf`, in `functions/access.js`):
  a club's admins, a team's coaches and trackers, a player's guardians, a
  player's own sign-in. Each recomputes only the entries its change could
  have moved, from what the club holds at that moment, so an event Cloud
  Functions delivers late or twice still leaves the tables right. Game-day
  writes, and a team saved whole with nobody's role changed, wake none of it.
- **The same answer the phones give**, which go on doing it for clubs
  without the server; `test/access.js` holds the two to each other. An index
  entry that is there is never rewritten, since its value may be the invite
  that granted it.
- **It never starts a missing table.** The rules fall back to the old
  club-wide behaviour while `teamIndex` or `teamParents` is missing, and one
  entry would end that for every other team at once, so building one whole
  is still an admin's phone's job.
- **The club bookmark follows the role**: written with a person's first role
  in a club, removed with her last, with the invite her entry named.

No app or rules change, so no new build: it starts working when the
functions deploy on merge.

---

## New message shows what there is to choose from — 2026-10-08 (build 108)

The owner searched a team and got *Nobody matches*, with no idea what was
there: the list holds only parents who have signed in and been linked to
their child, and that team's had not.

- **Teams as chips** across the top of New message (and *Coaches and
  admins*), each with how many people it holds, so the options are on screen
  before she guesses a name. One tap narrows the list to it, and *Choose all*
  takes everyone in it.
- **Who can't be written to yet, and why.** Under a team, or for a search
  that names a child or a team, the children whose parents have not signed in
  are listed by name with where to invite them (Squad → Parents, or the team
  link). Staff only: a family's phone never lists other children.
- **A search that names a team but finds nobody** says *Nobody on U11 Storm
  you can message yet*, not *Nobody matches*.

## Writing to anyone, or to several people at once — 2026-10-08 (build 107)

The owner: messages to teams are nice, but writing to specific people is
needed too, and choosing them was a tough screen with a lot of people (the
team picker turned into a long dropdown).

**New message is one searchable list** of everyone she may write to: the
families on the teams she coaches (an admin, every team), the club's other
coaches and admins, or for a family the coaches of each of her teams. Type
any part of a name, a child's name, a team or a role (*flight parent*,
*coach*, *ella*); every word has to match. The people she talks to most
recently come first. No team to choose before a person.

**Tap one person, or several.** One opens the conversation. Several get one
message, written once, sent into each person's own conversation: nobody sees
who else got it, replies come back where they always did, and a family's
copy is read by that team's coaches and the admins exactly as if it had been
sent alone. *Choose all N* takes everyone a search found. Each recipient is
checked in the handler as a single send would be, so someone no longer hers
to write to is left out rather than sent to.

No rule changes: every message is the same write a single one would be.

## Each kind of notification can be turned off — 2026-10-08 (build 106)

The owner: *notifications should be able to be turned off.* Until now the
only switch was per phone, and only for a closed phone; the pop-ups, the
banner over the screen and the buzz could not be stopped at all.

**What notifies you**, on the Notifications screen and in Settings: Messages,
Team notices, Games and practices (with training sessions), and Club
activity (only for those who get it), each On or Off. Off means no pop-up,
no buzz, no banner and no push to a locked phone, on every phone she uses;
the item still waits, counted, on Messages or under the bell. A game she
follows with *Notify me* is still its own choice, on the game.

Kept at `people/{uid}/mute/{kind}`, readable and writable by her alone, one
yes-or-no per kind (rules version 10). `functions/push.js` reads each
reader's switch before it reads her phones, so a muted kind costs no token
lookup either. A refusal (rules not published yet) is taken back off the
screen and said.

## Messages get a button of their own, and coaches can write first — 2026-10-08 (build 106)

The owner couldn't find how to start a conversation, and when asked, said
coaches and admins should be able to start one, that messages need a place
of their own rather than sharing the bell with notifications, and that a
message should say where it has got to.

- **Two buttons up top.** A speech bubble for **Messages** (conversations
  and team notices, `#/messages`), and the bell for **Notifications**
  (changes to her calendar in any club, and club activity,
  `#/notifications`). Each has its own count. A message from another club is
  on Messages too, under *From your other clubs*.
- **New message.** A coach picks a family on a team she coaches; an admin, a
  family on any team. It is the same conversation the family would have
  started, so it is still read by every coach of the team and the admins,
  never one coach alone. The rules already let staff write there; the
  handler now checks the family is on that team. A family's *Coaches of …*
  row is unchanged, and a player with her own sign-in still reads her
  family's conversation, which is where a coach asks about an injury.
- **Coaches and admins talk to each other.** `staffdm/{code}/{a}~{b}`, one
  conversation per pair, the two uids sorted, readable and writable by those
  two only while each is an admin or on `coachIndex`. No admin reads anyone
  else's. A rule cannot list somebody's conversations, but it can answer
  for one pair, so each phone listens once per colleague and nothing has to
  be created first: the first message works offline through the outbox like
  any other.
- **Where a message has got to.** Under each of hers: ◷ waiting for a signal
  (or sending), ✓ sent (the club's database has it), ✓✓ delivered (somebody
  else's phone has it), and a blue ✓✓ read. Tapping one says who has it and
  who read it, and when. Delivered is a new marker, `got/{uid}`, written by
  the receiving phone for itself beside `seen/{uid}`. Both are written as the
  later of now and the newest message they cover, so a phone whose clock is
  behind the sender's still counts it.
- **A lock, saying exactly how private.** Every conversation names who can
  read it, and *How private?* says: kept to those people by the database's
  rules, encrypted on the way (HTTPS) and where Google stores it, **not
  end-to-end encrypted** (whoever runs the club's Firebase project can read
  the database), a copy on each phone until sign-out, and nothing editable.
  The screen never claims more than that.
- **Push.** `pushStaffMessage` sends a colleague's message to the other of
  the pair, only while both are staff and the author is one of them
  (`test/push.js`).

Rules version 9 (`got` under `dm`, and the `staffdm` block). Until it is
published, a coach writing first to a family works (the old rules already
allowed it), but colleagues' messages are refused and kept with *Not sent*,
and the delivered tick never comes. Not built: group conversations among
staff, and hearing colleagues' messages from a club that isn't open (push
covers a closed phone).

---

## A practice called off reaches a closed phone — 2026-10-07 (build 105)

The urgent half of the calendar. A subscribed calendar cannot be told there
is something new (Google may take hours), and the app's own alerts needed it
open, so a practice called off at five o'clock reached families when they
next looked. Now a game or practice in the next two weeks that is **called
off, back on, moved or new** is pushed to everyone on that team: its
families, its players who sign in, its coaches and trackers. Not the admins,
whom club activity tells, unless they are on the team.

- **The same news as the app's alerts** (`calAlerts()`), in the same words
  (*Cancelled: U11 Storm: Practice*, *Moved: U11 Storm v Northgate*, *Now
  Sun 12 Oct 10am*), and the same silences: a new place or title, a
  deletion, anything past or further off than two weeks. A weekly practice
  added is one push. Cancelled and a new day are urgent; fifteen minutes
  later is not.
- **Five more triggers on the one sender**, not a second job: `pushEntry` on
  a practice or event, and one each on a game's `date`, `kickoff` and
  `called`. Never a whole game: a game being played is written every few
  seconds, and none of that wakes the server. `test/push.js` saves goals,
  subs, the clock, the register and a whole game with only its game changed,
  and requires that nothing runs.
- **Told once.** A game moved to another day and time is two triggers for
  one change, and Cloud Functions may hand over an event twice, so the
  server keeps the last thing it told per entry at `serverState/calSent`, a
  node no rule grants any phone (`test/rules.js` checks), and only the
  first to claim it speaks.
- **Who did it is on the record** (the owner: *practice, games and team
  things should be coaches only, so knowing who did it is important*). Every
  calendar write now carries `edit: { by, at }`: stamped in `remoteSet()`,
  where every calendar write passes, so no screen can forget it, and only for
  the team's coaches and admins (a tracker saving the game she is tracking
  has changed nothing in it). A whole entry or game carries it inside; a
  field written alone (calling one off is just `called`) sends it beside,
  first. The server leaves her out, on every phone of hers, and names her to
  the rest: *Thu 8 Oct 6pm · Jaz*. A stamp more than five minutes old is
  from an earlier change and says nothing about this one.
- **Rules version 8, and the calendar is the coaches'.** A stamp is refused
  in anyone's name but the writer's (sent back unchanged inside a bigger
  write it passes, or saving a team would be refused for every entry another
  coach last touched). A game's date, kick-off, called-off, place and
  opponent are now the team's coaches' and the admins' at the database too:
  a tracker could reschedule a game before, though the app never offered it.
  Practices and events already were. The usual bridge: a club with no team
  index yet is as before. `test/rules.js`'s evaluator now gives `.validate`
  the writer's auth, as the database does; no rule had leaned on it before.

The rig in `test/fakebase.js` now models a write of any depth waking only the
triggers whose own path it changed, as the database does.

## The server deploys itself — 2026-10-07 (build 104)

The owner asked for a way to ship server changes without anybody running
commands on a computer. `.github/workflows/server.yml` runs every suite and
deploys `functions/` whenever it changes on main, the way the site already
deploys itself, using a service account key the owner adds once as a GitHub
secret (README, **Deploying the server**, has the three steps). Without the
secret it says so and deploys nothing, rather than a red cross on every merge.

The rules go the same way (the owner asked for it): a merge that changes
`database.rules.json` publishes it, after every suite including `rules.js`
has passed and before the functions, then reads the live version back so a
green run means the club is on it. *Run workflow* with **rules** ticked does
it by hand. The rules apply to every club at once, so a rules change on main
is reviewed as one.

`functions/package-lock.json` pins what was tested, and `.firebaserc` names
the project so nothing has to be typed.

## The calendar feed moves onto the club's server — 2026-10-07 (build 104)

The owner had never set up the Cloudflare Worker that served calendar feeds,
so subscribing was off and the calendar only offered a one-off copy. With a
server arriving for notifications anyway, a second platform with its own
account and its own paste-it-in-by-hand deploy was cost for nothing.

- **The `calendar` function** (`functions/calendar.js`) is the Worker, moved:
  the same `ics.js`, the same address shape (`…/calendar/{id}.ics`), the
  same documents from `public/`, the same 404 for a replaced link and 502 for
  a database that is down. It runs with admin credentials now, so the id
  check is the whole wall between an address and the club's data; the only
  path it ever builds is `public/` and the id, and `test/calfeed.js` (what
  was `test/worker.js`, run against the function as deployed) pins that.
- **`firebase-config.js` points at it**, so families can subscribe as soon as
  the functions are deployed. At most three instances: a club's calendars
  poll hourly, and a flood of requests should be slow, not a bill.
- **`worker/` is gone**, and `node functions/make.js` copies `ics.js` where
  the function needs it (only `functions/` is uploaded).

What did not change: a calendar app still comes back when it chooses (Apple
and Outlook about hourly, Google every several hours). A subscribed
calendar cannot be told there is something new; a game called off is for
notifications.

## Notifications reach a closed phone: the server's first job — 2026-10-07 (build 104)

`GOTSPORT.md`'s build order, step 2: *the server, with push as its first job*.
Until now a notice or a family message reached a phone only while Minutes was
open on it, and the coach's fallback was *Email or share*. That was the
biggest everyday gap families had, and the smallest piece of the GotSport
plan that needs a server, so it goes first and proves the pipeline.

- **The server exists.** `functions/` holds the club's Cloud Functions, two of
  them: `pushNotice` on a new `board/{code}/{tid}/{id}` and `pushMessage` on a
  new `dm/{code}/{tid}/{fam}/m/{id}`. Creates only, so a read marker or a live
  game never wakes them. They read from whichever database the write was in,
  so a rehearsal database answers from its own phones. Deployed by hand with
  `firebase deploy --only functions` (README, **Notifications to a closed
  phone**, has the five steps, the Blaze plan among them).
- **Who hears it is who may read it.** The sender writes with admin
  credentials and the rules never see it, so it checks rather than trusts:
  the rules' readers, from the same lookup tables, held to the squad as well,
  never the author, and never through a bridge clause (pushing to every
  indexed account would be wider than any screen). A notice reaches the
  team's families, its player with her own sign-in, its trackers, coaches and
  the admins; a family's conversation reaches that family, the player whose
  record names it, the team's coaches and the admins, and never a tracker or
  another family. The title is the one the open app pops up, the text cut to
  240 characters; a tap opens that conversation, switching club if it has to.
- **Each person turns it on for her own phone**, in Settings or Messages:
  *Notifications on this phone*. No role needed, because the token is hers:
  `pushTokens/{uid}/{token}`, readable and writable by that account alone
  (**rules version 7**). On an iPhone in a browser tab it says to add Minutes
  to the Home Screen first, which iOS requires; signed out, offline, blocked
  or refused by the rules, it says which and claims nothing.
- **The token follows the account.** Signing out takes it down while she is
  still signed in, then deletes the browser's subscription; a phone that finds
  another account signed in gives the old one up; a token the browser changed
  is replaced, and one whose permission was taken back is removed. The
  service worker is told who is signed in and shows a push for anyone else
  without its words, for the phone signed out with no signal. The server
  deletes any token Cloud Messaging says is gone.
- **Minutes installs like an app.** `manifest.webmanifest`, an icon (the
  centre of a pitch) and `sw.js`. The worker only shows pushes and opens
  them: it has no fetch handler, so it never serves a cached copy of the app
  that could disagree with the build the page says it is.
- **`test/push.js`**, and a rig to run functions in CI with nothing installed:
  `makeServer()` in `test/fakebase.js` requires the deployed `index.js` with
  Firebase swapped out, so the triggers' paths are tested, not a copy. The
  judgement lives in `functions/push.js`, which imports nothing from Firebase.
  The harness also stopped losing its `navigator` to Node 22's own.

Not pushed yet, and next on the same sender: a calendar change to her own
teams, a followed game's goals, club activity. Nothing about the outbox, the
local copies or what works with no signal changed: the server does the job
that belonged to nobody, and the sideline waits on nothing.

## The Calendar is yours, and today says where now is — 2026-10-07 (build 103)

The owner, after trying build 102: *when clicking in a day like in the
monthly view, I want a red line showing the current time of day*, and *the
calendar is in a weird spot. The calendar is versatile and not tied to one
team, not even one club, it is per person.* Build 102 made the one Calendar
the first tab of every team, so it sat under whichever team was open with
Club › Team over it, though most of what it could show (My calendar, other
clubs, All teams) was no one team's.

- **A red line at now in today's list**, wherever today is listed, as the
  hours on Day and Week already had: the day under the Month grid when it is
  today, and today on the Schedule, between what has started and what
  hasn't (anything all day above it). Today is drawn on the Schedule even
  with nothing left on it, once the list runs past it, with the line and
  *Nothing else on today*, so the Schedule always says where now is.
- **The Calendar is the person's.** It has its own button up top, beside
  Messages and the account, with today's date on it, lit while it is open.
  Its top row is **You › Calendar** again, and its address (`#/calendar`, or
  `#/calendar/all` for All teams) names no team or club. It opens on **My
  calendar**, now offered to anyone with anything of her own (a team, a
  child, a session she runs, a time she offers, another club) rather than
  only when that was more than the open team, and a coach's has her
  players' sessions with other coaches on it, as her team's calendar did.
  **All teams** is beside it for whoever can see more teams than her own. The
  open team stopped being a calendar of its own: one team is that team
  ticked alone on All teams, and a phone that had chosen it gets My calendar.
- **Three tabs a team: Season, Squad, Practice.** Season is where a team
  opens now: the game being played on top, one tap from the game; the next
  game, with directions, *Open the game* and, for a family, *Is Ella going?*;
  the next practice, said the way the calendar says it; *{team} on the
  calendar*; the results and charts; and **Games**, every game played and to
  come, called-off ones marked, with *Add a game*. The team's calendar
  subscription (*Apple Calendar*, *Google Calendar*, a coach turning it on)
  moved to Season too, and its one-off copy is that team's, whatever the
  Calendar is showing. A parent has Season alone, so no row of tabs.
- **Back goes where she came from.** A game opened from the Calendar goes
  back to the Calendar, one opened from Season back to the team, and the
  arrow says which.
- **Getting around with no team in the crumbs**: the You crumb's sheet has
  Club home, an entry's sheet names its team as a link to the team, and Club
  home's *Calendar · Every team* ticks every team, whatever was unticked
  before. Old addresses still land: `#/team/{id}/calendar` is the Calendar
  with that team on it, `#/team/{id}/games` the team's Season,
  `#/club/calendar` and `#/club/schedule` All teams, `#/my-calendar` My
  calendar.

No rule changes, nothing stored differently, and the share link, the calendar
feeds and what reaches `public/` are as they were.

---

## Four tabs, and one calendar that reads like Google Calendar — 2026-10-06 (build 102)

The owner: *I really like all the information in the pages but I feel like
there are too many tabs under the teams pages*, *having a team calendar, club
calendar, and my calendar is too much*, and *the calendar seems to not be
intuitive; make it more Google Calendar.* A coach had six tabs on every team
(Games, Calendar, Practice, Squad, Season, Team), and the question "what's on"
had four answers: the Games list, the team's Calendar, Club schedule and My
calendar, each looking at a week its own way. Nothing they showed was wrong;
there were just too many places to look.

- **Four tabs a team: Calendar, Practice, Squad, Season.** The Games tab was a
  list of what the calendar already held, so the games are on the Calendar: a
  game being played sits on top and opens with one tap (on Subs for its
  coach, Track for its tracker, Live for everyone else), *Next up* has *Open
  the game* (on Plan before the day, Subs on it), and the game bar's back
  arrow goes back to the calendar. The Team tab is the foot of Squad: the
  name and crest at the top, and shapes, what to count and parent links under
  the players, *Team set-up*. A tracker keeps the squad without the set-up, a
  parent neither, as before. Every game is still a tap from Season's results
  and the game bar's picker.
- **One calendar.** Which calendars it shows is a choice at its top: the open
  team, **My calendar** (her teams, her children's, the sessions she runs, the
  times she offers, her other clubs) or **All teams** (every team she can see,
  ticked by age group and team in the tree behind the ☰ beside the title,
  which also keeps her children, her clubs and the kinds of thing, with a dot
  on it when something is left out). Each is offered only when it
  shows more than the others, so a parent with one child on one team has one
  calendar and nothing to choose, and a parent of two gets My calendar but no
  All teams. The choice is kept on the phone like the view; nothing is
  written. Club schedule is All teams, and its week (what's on, shared field
  time, clashes, teams with no practice, what is still missing a date, time
  or place) is the club's week under the calendar, for admins. My calendar's
  extras are there when it is ticked: booking a 1-1, time off, the feed and
  sharing busy times. Opening a team, from its crumb or Club home, shows that
  team's.
- **Drawn the way Google Calendar draws one.** **Schedule**: every day with
  something on, the date down the left with today circled, months headed, and
  each entry filled with its calendar's colour, struck through when it's off,
  faded once it's over; what has already happened opens above it, in order,
  with a red line at now. **Day** and **Week**: the hours down the side, each
  entry where it falls and as long as it runs, things on at once side by
  side (past three in a week, or four in a day, a *+n* that opens the day),
  what has no time along the top, and a red line at now; the grid opens out
  for an early start or a late finish. **Month**: the grid, whole weeks, what's
  on in each day by name and colour with *+n* past three, and the day tapped
  listed under it. Back, *Today* and forward step a day, a week or a month;
  the title opens a small month to jump to any day. With one team the colour
  says what it is (game, practice, other, training); with more, whose.
- **A + in the corner adds**, as in a calendar app, at the day being looked
  at, and on Day and Week every hour is a place to tap to add something then
  (it starts then, and runs as long as practice usually does). One team she
  can change opens that team's sheet, which now has *A run of games* beside
  *A game*; several (an admin on All teams, a coach of two) ask which first,
  as Club schedule's Add did, and that sheet is no longer admins' only: it
  offers the teams she may change and the handler checks the one picked. A
  game added for a later day leaves her on the calendar; one for today opens,
  because it is the game she is about to run.
- **Old addresses land where things went**: `#/team/{id}/games` is the team's
  calendar, `#/team/{id}/planning` is Squad, `#/club/schedule` is All teams,
  `#/my-calendar` is My calendar, and a phone that saved one of the old screens
  opens the new one. The Calendar's own address says which calendars it shows
  (`#/team/{id}/calendar`, `#/my-calendar`, `#/club/calendar`).
- My calendar's feed card no longer drew "[object Object]" where the button
  for My calendar used to be (it named the coach's own drill library).

No rule changes, nothing stored differently, and the share link, the calendar
feeds and what reaches `public/` are as they were.

---

## A plan for replacing GotSport, and a server allowed — 2026-10-06 (docs only)

The owner: *I kind of want to try and replace GotSport honestly*, and, asked,
*I am more than willing to have server side code*, registration data
protected, and GotSport kept for the state's part for now.

- **`GOTSPORT.md`**, written before any code like `SESSIONS.md` was: what a
  club does in GotSport and what replaces each part (season registration,
  card payments through Stripe Connect, push, email, tryouts, coach
  compliance, living alongside GotSport), where the new data lives and who
  may read it, the server's ground rules, a build order (push first, then
  names behind the database, then registration, then payments) and the
  questions still open for the owner.
- **A server is allowed.** CLAUDE.md, README, ROADMAP, SERVER.md and
  SESSIONS.md said "no server-side component"; they now say Cloud Functions
  on the same Firebase project are allowed, with the rules that keep the
  phone offline-first, secrets out of the repo and every function checking
  its caller. Still no AI calls, and the Worker stays read-only.
- **AUTH.md's migration** is no longer only "the owner's call": the owner
  decided names and registration data are protected at the database, before
  registration opens to families.

No code changed, so no build number.

**Then the owner's answers to its open questions**, recorded in it: each club
its own Stripe account and no fee taken; refunds are the club's, done in its
own Stripe account; no registrar role; registration data kept until the
family or the account deletes it; the club is in Maryland (MSYSA, which runs
SafeSport, concussion training and background checks through GotSport), so
compliance records follow MSYSA's list; a lapsed record flagged to the admins
and that coach and nothing more; GotSport sample files later.


---

## A club schedule for admins, and shared field time — 2026-10-06 (build 101)

The owner: *the admin being thrown into My calendar isn't great. They need a
way to schedule out games and stuff easier. Also practices: some teams share
fields, which is ok. Just note that there is a shared field time.*

An admin who ran no team of her own was given the whole club on My calendar,
which made a personal calendar the club's planning screen: one long list, no
week to look at, and no way to add to a team without opening that team first.
And two teams practising on one field at once was listed as a clash to fix,
when that is how most clubs run.

- **Club schedule** (`viewSchedule()`, `#/club/schedule`), admins only and
  checked in the handler. First on an admin's Club home, and on Club
  settings, the club menu and each team's Calendar tab. Every team's games,
  practices and events a week at a time, in each team's colour, narrowed by
  team or kind; a count for the week; teams with no practice that week; and
  *Still to settle*: what is coming up with no date, time or place.
- **Add for any team from one sheet**: a game, a practice, something else,
  or **a run of games**, a row per fixture with date, kick-off, opponent,
  home or away and place. A new game starts in the shape that team's last
  one had (7v7 in quarters stays 7v7 in quarters). Adding opens the same
  sheets a team's coach uses, makes the picked team the open one so its
  share link is what republishes, and keeps the admin on the schedule
  instead of opening each game. A run of games is one write per game at
  `matches/{id}`, as *Create game* makes it. Nothing new is stored, so no
  rule changes.
- **My calendar is only hers.** An admin who runs no team, has no child and
  no sessions isn't offered an empty My calendar ahead of the club's
  schedule, and hers no longer fills up with the club's teams; it points to
  Club schedule instead. A club before anyone signs in still shows the
  club's there, as before.
- **Shared field time is a note, not a clash.** Two practices on one field
  at once (same field from Fields, or the same words typed) are said on
  both entries, *Shared field: G13 Storm 6pm*, wherever the entry is drawn
  and when it is opened, and in the planner under *Shared field time*, apart
  from the clashes. A game, or anything other than a practice, with no pitch
  left for it (more at once than the field has pitches, or the same named
  pitch) is still a clash, now marked *Field clash* on the entry too. Find a
  time no longer calls a field full because practices are on it; it says
  which teams the slot would share it with. Training sessions' own clash
  check is unchanged.

---

## Each pitch of a field described on its own — 2026-10-06 (build 100)

The owner: *fields should have a description for each field the complex has;
some have turf and grass and then different addresses for the field.* A field
was one surface, one address and a count of pitches, so a complex with two
grass pitches out front and a turf one round the back on another street
could only be described in its notes, and every family was sent to the front
gate.

- **Each pitch can be described** in the field's editor (*Each pitch*): its
  name, grass, turf or indoor, lights, its own address when it has one, and a
  description. They live on the field as `parts`, under `access/org/venues`,
  so the admin rule that already covers fields covers them and no rule
  changes. `pitches` is saved as never fewer than the pitches described, so
  an older phone still counts the field right.
- **A venue that names a pitch finds it**, by the same rule a venue finds a
  field (its name in the words, ignoring case and punctuation, longest
  first, so *Field 12* is not *Field 1*). Directions on a practice, a game, a
  session and the message for the other team go to the pitch's address, then
  the field's, then the words; the entry and the session show what the pitch
  is like. Nothing new is stored on an entry or a session: which pitch is
  read from the words, so every venue typed before this keeps working.
- **A new session offers the field's pitches** as chips once a field is
  picked, which fill in *Which part*.
- **The bulk import takes them.** In JSON, a field's `pitches` is a count or
  a list of the pitches, each with its name, surface, lights, address and
  description. In a spreadsheet, a `Pitch name` column (or a sheet headed
  `Field, Pitch`) makes a row describe that pitch, and a field's rows become
  one field. A pitch is matched by name, changed only by what the file says,
  never removed, so running a file twice writes nothing; the fields template
  shows a complex with two pitches.
- **The same pitch twice at once is a clash**, on the session and on the
  field's two weeks, even when the field has pitches to spare. Two pitches
  with one name are refused on save, because the check could not tell them
  apart.

---

## The Calendar tab reads like a calendar app — 2026-10-06 (build 99)

With a whole season in for all twelve teams, *All my teams* drew every entry
the club has, one under another, and *what has already happened* was 374 rows
in a single card. Nothing on the tab was wrong; there was just no way to look
at less of it.

- **Day, Week, Month and List.** Day is a strip of the week to hop along and
  that day's entries; Week is seven days, Monday first; Month is the grid,
  with the chosen day's entries under it instead of a sheet over it. List is
  the old screen and still the default. Each has back, forward and *Back to
  today*, and *Add* starts on the day being looked at.
- **Calendars, as a tree.** Club › age group (from each team's birth year;
  teams without one under *Other teams*) › team, each a tick box. Ticking a
  group ticks its teams; a half-ticked group says so. *Only this team* and
  *All my teams* stay one tap away without opening it, and Games, Practices,
  Other and Training can be hidden too. The view and the ticks are kept on
  the phone like the rest of the screen state; they are a way of looking,
  not data, and nothing is written to the club.
- **A colour per team.** Picked by the team's place in the club's list, so
  every phone agrees. With more than one team showing, each row leads with
  its team's name in that colour down a coloured edge, the month's dots take
  it, and the kind tag (which only repeated the title) gives its width back.
- **No list is drawn whole.** *Coming up* and *what has already happened*
  page 25 at a time, never stopping half way through a day, with *Show 25
  more (n in all)*. My calendar pages the same way.
- The calendar file and the feed list follow the ticked teams.

---

## Starting a new club no longer drags the old one along — 2026-10-05 (build 98)

The owner: *when I made a new club it told me all my teams were deleted when
I was in one*, and then: *when I clicked import for the new club and added
team I went to the other club and it said stuff was deleted when it wasn't.*

Every club switch (a new club, the switcher, an invite, an alert's Open)
writes the next club's code to the phone and reloads. A reload is not
instant: the old page keeps running, and redrawing, until the new one
arrives. `wsCode()` read the code from storage every time it was asked, so in
that gap it already named the new club while memory still held the old one.
Everything kept per club was filed under the wrong club: the old club's whole
local copy was saved as the new club's, the new club opened holding the old
club's teams, and its first connect sent them into the new club's database —
which is how a brand-new club came to tell its admin about teams that were
never its own, and then about them going.

- **`wsCode()` and `envName()` are read once per page** and held. Storage
  says which club to open next; the page says which one is open. Nothing that
  switches club changes, because every one of them reloads.
- `test/invites.js` starts a club with a team, a practice and a game, draws
  and saves in the gap before the reload, then boots the new club from what
  the phone kept: nothing of the old club under the new one's name, an empty
  club, no team or game sent to it, no *Deleted* news. The old code fails it.
  `test/sandbox.js` switched code and database on one running page; it now
  says the page reloaded (`rereadClub()` in the harness).
- It ran both ways. Switching back to the old club after importing a team
  into the new one filed the new club's copy, and what club activity had seen
  there, under the old club: the old club opened to *Deleted:* for every
  practice and game it still had, and sent the imported team and its games
  into itself. `test/invites.js` walks that too, through the club switcher.
- Any club made with an earlier build from inside another may hold copies of
  the old club's teams and games, and the old club copies of what was imported
  into the new one. Remove them by deleting each copied team
  (its Edit sheet, *Delete this team and its games*), which takes its games with it and leaves the original club alone.
  Not game by game: a copied game carries the original's share id, and
  deleting a game takes its share page down, the original's included.

## A player's own sign-in, given by her coach — 2026-10-05 (build 97, rules version 6)

The owner's decisions on AUTH.md's four questions: *the coach gives the
player account, not parents, on request; she can post and read; she sees the
same as the parents; age is up to the coach and club for now.*

- **Squad → her page → Make her a sign-in link.** A single-use, 14-day
  `player` invite naming her by shirt number, which the team's coach (or an
  admin) makes. It's the first invite a coach may make, and the rules allow
  only this kind. Its id never goes into the club: the coach's phone keeps it
  to show again, the admins' list has it, and *Withdraw* or a new link kills
  it. *Remove* beside her account (or on People) takes the sign-in away, and
  her parents keep theirs.
- **Her own pointer, `players/{pid}/self/{uid}`, never `guardians`.** She is
  not her own parent, so every parent right was decided again: she sees what
  a parent sees (herself by name under *My season*, teammates by the club's
  preset, Live, Stats, the recap, the calendar, notices), answers *Are you
  going?* for herself only, and doesn't book or pay for sessions
  (`myChildren()` now feeds all of that code).
- **Her family's conversation, never her own.** She reads and writes in
  each of her parents' conversations with the coaches, where they see every
  word. The `dm` rule finds them through her player record's `guardians`,
  and no thread is ever keyed by a player, so a coach can't reach her where
  her parents can't see. That's the safeguarding line, held by the rules
  and not just the screen.
- **A fifth lookup table, `access/teamPlayers`**, checked against `self`, so
  she reads her team's notices and the rule can find her parents. It is
  rebuilt like the others (`syncTeamPlayers()`). `hasAnyRole()` counts `self`
  too: before this, an admin's phone would have taken her out of the club's
  index on its next connect.
- **Rules version 6**: `self`, `teamPlayers`, and player clauses in `invites`,
  `clubInvites`, `rsvp`, `board` and `dm`. `test/rules.js` walks every door
  (49 new cases), and `test/players.js` pins the app's side.

## No more workspace codes; a child's parents, plural; a player's own account, designed — 2026-10-05 (build 96)

The owner: *workspace codes are weird, get rid of them. A kid can belong to
multiple parents, and once older may have an account of her own.*

- **Workspace codes are gone from every screen.** Everyone else had stopped
  seeing them when invites arrived; the app owner's *Change workspace code*
  box, written as a stopgap "until per-person invites exist", was the last
  one, and it's removed with its four actions. A phone reaches a club by an
  invite, a team link, the switcher (`userOrgs`, which every phone backfills
  for the clubs it reads) or by starting one. Setup's *Workspace* card is
  *Club* and names the club. The lock screen says *This club needs a sign-in*
  and offers her other clubs. The code survives as the club's id inside
  database paths, which AUTH.md always meant it to become. Renaming those
  paths (`orgs/`) would change nothing anyone sees, so it isn't part of this.
- **A child with several parents** was already one `guardians` list, and
  every check asks whether *this* account is in it. `test/parents.js` now
  pins two parents of one child, and one parent of two children, on the
  same team. The squad-invite sheet says how a second parent gets in: it
  makes one link per child without a parent, so the second uses the team
  link or one more invite.
- **A player's own account** is designed in AUTH.md rather than built. It's
  a separate `self` entry beside `guardians`, given by her parent, and never
  a one-to-one conversation with a coach. Four questions for the owner come
  first, because each one is a safeguarding or club-policy call, not code.

## What a parent sees: her child by name, the rest by number; My players across clubs — 2026-10-05 (build 95)

The owner asked for the rest of `AUTH.md`. Most of its build order had
already shipped on `workspaces/{code}`, under other names. Two of its promises
had not:

- **"Other players by shirt number only."** The Squad tab was closed to a
  parent, but Stats, Season, Live, the match log and the recap still named
  every child, and the parent's role description already said they didn't.
  `shownName()` now draws her own child by name and everyone else as `#8`
  (*A teammate* with no number). Only someone who is nothing but a parent in
  the club is narrowed. An admin, a coach of any team (AUTH.md's "coach with
  a child elsewhere" gets the real view) and a tracker see names, and so does
  everybody before the club has an admin.
- **The one preset AUTH.md allows.** Club admin → *What parents see*: shirt
  numbers only (the default) or the whole roster by name. It's a single
  boolean at `access/org/rosterOpen`, admins only, checked in the handler,
  under the rule the club's details already use, so the rules are unchanged.
  It is a screen setting and says so. A parent's phone reads the whole
  workspace, so no rule can withhold names until the `orgs/{orgId}` move.
- **My players across clubs.** AUTH.md's parent with Iris at Riverside. Her
  children in her other clubs come from the copy My calendar already keeps,
  with team, club, what's next and *Open that club for her minutes*. Nothing
  was added to that copy, which still has no stints, so it shows no minutes.
  `guardsAnyone()` stays about the open club, because booking a session is.

`AUTH.md` now says where each build step stands. The `orgs/{orgId}` migration
is written up as not started and as the owner's decision, with what it would
buy and what it would cost, rather than as the next step. `test/parents.js`
pins all of this.
## A player's stronger foot; inviting the families an imported roster names — 2026-10-05 (build 94)

The owner: *when importing there should be an option to invite the parents'
emails and coaches that don't have accounts already* — and *should we have a
field for what foot they are? You play someone on a side because of dominant
feet sometimes.*

- **Stronger foot** on the player sheet: Left, Right, Both or not noted
  (`foot`: `L`, `R`, `B` on the player). Squad shows it, the AI prompt carries
  it, and the import reads it (`player_Foot`, `Foot`, or `"foot"` in JSON)
  as a field rather than the note build 92 made of it. **The planner leans a
  left-footer to the left**: a quarter-point in `fit()` for her own side, a
  quarter against the other, read from where the spot sits on the pitch. That
  is less than keeping her where she was last block and less than any step of
  position preference, so it only decides between otherwise-equal players and
  never fights what the coach set.
- **Invite them too?** after importing a roster that has parents' or coaches'
  emails. One personal invite per parent per child and per coach per team,
  made with the same `writeInvite()` as People → Invite someone and bound to
  the email, so a forwarded link is useless. Skipped: anyone whose account
  (by its email) already has that role, and anyone with an open invite for
  it, so next season's import only invites the new families. Making the
  invites and having Firebase email them are two taps, so an admin can stop
  between them and send the links her own way. The emails never go into the
  import's data or the club; they sit on that screen until it is closed, and
  are written only into the invites, where invites already keep them.
- Not done: a coach making these for her own team (still admins only, as
  everywhere else invites are made), and invites from a JSON file.

## Roster and events exports read as they come — 2026-10-05 (build 93)

The owner had a roster and an events file from their registration system,
both tab-separated, and asked for an import for them rather than retyping them
as JSON. The spreadsheet import already read tabs; it didn't know these
headings, so most of each file was quietly "not used".

- **Roster:** `player_number`, `player_position` and `player_Foot` are read
  (the foot as the player's note, since there is no field for it), alongside
  `team`, `birth_year` and the player's names it already knew. Parents' names,
  emails and phones, the home address, birth dates and gender stay out: they
  are listed as not used and nothing of them is written. Getting parents in
  is still an invite or a team link, not an email in a file.
- **Events:** `event` is the type, and when there is no opponent column the
  opponent is read out of it — *Game vs Northgate*, *@ Riverside*, *Riverside @
  Us* — with our own name on either side deciding home or away. "at" is not
  read as a game, so *Team party at the clubhouse* stays an entry. A row that
  says it's a game but names nobody used to block the whole file with an
  error; now it goes on the calendar as an entry titled by its event and the
  sheet says which row. `location` and `field_identifier` become one place,
  and a location with an `address` becomes a club field, which the calendar
  already finds by name in a venue. Other events take their title from the
  event text instead of a plain "Event".
- Times with seconds (`09:30:00`) already read; the test now pins it with the
  owner's exact headings, run twice to show the second run adds nothing.

## My calendar in your own calendar; the AI and import steps for training; packages — 2026-10-05 (build 92, rules version 5)

The owner: *fix up the Calendar sync to match the My calendar one since that
will have the most helpful information. In the My calendar would a parent see
their other clubs? They should. Finish off the TRAINING.md file. Packages is a
cool idea! Add it as an option for admin to turn it on.*

**A parent does see her other clubs on My calendar**, and did already: a child
on a team in another club puts that team's games and practices on it, named
for the club, with a chip per club. `test/mycal.js` now pins it for a parent,
not only a coach.

**Calendar sync is My calendar's now.** One address per person, from *My
calendar → Turn on calendar sync*: every game, practice, event, training
session and bookable time on it, from every club her account is in, in Apple,
Google or Outlook. A team's Calendar tab points there first and keeps its own
team feed under it, because families already subscribed to those. The feed is
`public/`, as the team feed is, so it is built to the same promise and more:
no child is named (a booked session is *Training: Finishing*, never whose),
everything typed in the open club goes through the names of every player the
phone knows, another club's entries carry the team, the kind, the time and the
place but not what was typed there (that phone holds her own children, not the
squad to check against), and entries are keyed by a one-way hash so no club's
code is in it. Off until she turns it on; the id is claimed in `shareOwners`
before the first write and kept at `people/{uid}/set/feed` so her other phones
write to the same address; *Replace this address* and *Turn it off* take the
old one down. Her phone writes it only once it has heard from every club it
holds this session, and only when it changed, so an old copy never overwrites
a newer one; `SERVER.md` says what that costs (a club's change reaches her
calendar once one of her phones has been open since). `ics.js` reads the new
document and the Worker links its entries back to My calendar.

**Training's build order is finished.** Step 8: a practice plan has *Ask an AI
for a session*, a prompt with the team's age and squad, what the numbers say
needs work, the last three practices she reviewed (with the plain warning that
a few youth games prove nothing), and the drills that fit by `[id]`, up to
sixty, those for the practice's focus first. The club's drills and her own go
in only when she says, by name and what each trains, never the card. She
pastes the reply back and its *SESSION* lines become the plan; nothing loads
while a token is unknown. Ask an AI's *Practice plan* topic carries the library
too, so it stops inventing drills. Still copy out, paste back: the app never
calls a model. Step 9: the bulk import takes the club's drills, as a `drills`
list or a spreadsheet with *Setup*, *How it runs* and *Coaching points*
columns (there is a template), matched by name and merged like everything else
there, lists held to the library's own words, and the same five things the
drill editor insists on.

**Packages**, off until an admin turns them on (*Training sessions → Fees →
Packages*). An admin sells a player a number of sessions for a price (any
session, 1-1s or groups, an optional use-by date); the coach marks a booked
place *Package* instead of collecting for it, and it comes off the one that
runs out first. *Not paid after all* puts the place back, and a place
withdrawn or called off after it was used is listed to give back. The family
sees what she bought and what is left. A package is a fee covering several
places, so using one is a fee (`how: 'package'`, naming it) plus a mark at
`packuse/{tid}/{pid}/{id}/{sid}`, which is what is counted, because a coach
reads only her own sessions' fees. SESSIONS.md had parked this on what happens
to unused places: the app keeps them, says when a package ended with some
left, and leaves the rest to the club.

**Rules version 5**: `people/$uid/set/feed`, and `training/$code/packs` and
`packuse`, with a fee allowed to say `package` only for a package that exists
for that child. A rule cannot count, so it cannot refuse an eleventh place on a
ten-place package; `rules.js` prints that beside the spots it cannot count
either. Paste `database.rules.json` once.

---

## A finished game is its recap; lines through the game and the season; the match log — 2026-10-05 (build 91)

The owner: *a line graph for each thing recorded, by time. Across the season
would be amazing. Once a game ends it should no longer have the plan, sub,
track and all — the recap seems the most important. And something to show
the time-stamped log.*

- **Once End game is pressed, a game is Recap · Stats · Log.** Subs, Track,
  Plan and Pitch are put away, and opening a finished game lands on its recap.
  Only `ended` does this, not a last half that ran out: until End game closes
  them, players' spells are still open and Subs and Track are where it's
  pressed. A coach or admin can **Reopen the game** from the recap to fix
  something, which brings the tabs back.
- **How it built up**, on the recap: one small chart per thing recorded
  (goals, shots, corners, fouls, throw-ins, goal kicks, keeper claims), each a
  running total for both teams, with half time and the goals marked, and a
  table of the totals every ten minutes. One chart each rather than a dozen
  lines on one, because on a phone that is a tangle and each count has its own
  scale. Ours solid green, theirs dashed grey.
- **Game by game**, on Season: the same idea across the season, one point per
  finished game, oldest first — goals, shots, shots on target, each set piece,
  and possession against 50%. A game that didn't record a thing is a gap in
  its line, never a zero. With a table.
- **The match log**: on a finished game, Live becomes Log, everything
  recorded in order with the match clock and the time of day (what lines a
  moment up with someone's video), filtered by goals, subs, shots or set
  pieces. Players coming off at the final whistle are no longer listed as
  subs, here or on Live.

## A recap for every finished game; the game count; an Edit button — 2026-10-05 (build 90)

The owner: *the count for games isn't backwards, the newest is 1/x and not x/x.
There should be a more obvious edit button for coaches/admins. I want another
stats page for closed out games that is more useful — knowing when and how
often, a report at the end like a Spotify Wrapped, and the things that went
well and not well.*

- **The game count runs the way a season does.** The first game played is 1,
  the latest is x of x, so a game keeps its number as more are added. It now
  sits under the opponent's name, with the date, so the bar has room.
- **Edit on the game bar**, on every game tab, for the team's coaches and the
  club's admins only. The handler checks too, so a stale screen is not a way in.
- **Recap**, a new game tab that appears once a game is over (everyone who can
  read Stats gets it): the score big; *when it happened*, chances per five- or
  ten-minute spell, ours above the line and theirs below, with the best and
  toughest spell and a table; *how often*, minutes between goals, shots and
  corners, the first goal and the longest wait for a shot; *what went well* and
  *what to work on*, each sentence carrying the number behind it (answered a
  goal or let one straight back in, late and early goals, shots on target,
  halves, corners, fouls, possession, minutes against the plan, against the
  season's average); half by half; standouts; and this game against the season
  so far. Worked out from what Stats already reads, so it writes nothing and
  never reaches `public/`. Stats links to it once a game is done.

## Alerts from every club — 2026-10-05 (build 89)

The owner: *people should still have a way to get notifications for all clubs,
and when clicked it moves them over to that club, so a coach can respond to a
parent quicker. Cancelled games can interrupt your current view of another
game.*

- **Messages from every club.** Each club you're in is listened to as its own
  inbox would be, so a family writing to you in another club pops up straight
  away, naming the club.
- **Your calendar, from every club.** A game, practice or event of yours called
  off, back on, moved or new, in any club (the open one included), is an alert;
  a weekly series is one. Parents get these for their children's teams, which
  they didn't before.
- **It interrupts.** Every alert pops up and then waits in a bar over whatever
  is on screen, a game included, until opened or dismissed; called off and
  big moves are drawn as urgent. **Open** goes to the conversation, the game or
  the team's calendar, switching club if it has to.
- **One bell for every club**, and *From all your clubs* in the inbox with each
  club's unread and the latest alerts.
- Never on a first look (opening the app fires nothing old), never what your
  own phone did, and an admin hears the open club's changes once, from club
  activity. Still only while the page is open: push needs a server, and
  `SERVER.md` now says so for this too.

## A phone in every club; the top row names the screen; SERVER.md — 2026-10-04 (build 88, rules version 4)

The owner: *a phone should be a part of as many clubs as they want. Are there
other screens that shouldn't show the team in the top row? I think the top
row should switch to the view you're looking at. And note down everywhere that
will change when we have a server — a phone having to update that a coach is
busy for another club is ridiculous in the future.*

- **A phone is in every club its account is in.** The club on screen is still
  synced in full; every other one is now listened to as well, read-only, for
  its teams, games, sessions and bookable times, and kept on the phone cut
  down to what My calendar needs. My calendar shows every club live, works
  with no signal, and says "as of" for a club it hasn't heard from. This
  replaces the per-club summary each phone used to write to
  `people/{uid}/cal`, which is gone, so nothing about a club is stored under a
  person any more.
- **The top row names the screen.** Club › People, Club › Training sessions,
  Club › Planner, Club › Messages, Club › Club settings, Club › Your settings,
  Club › My players, Club › Shapes; You › My calendar; a team's tabs Club ›
  Team (› Game) as before.
- **SERVER.md** lists every job a phone does today that a server would do:
  busy times across clubs, holding every club, the lookup tables, bookable
  slots and seats, the share pages, joining and new clubs, notifications and
  email, the rules, migrations, backups and imports. Each function it names
  carries a `// SERVER.md:` line, and `test/version.js` fails if one goes
  missing.

**Rules version 4**: `people/{uid}/cal` removed (version 3 was never
published). Paste `database.rules.json` to turn sharing on.

## My calendar is yours, across clubs; import from spreadsheets — 2026-10-04 (build 87, rules version 3)

The owner: *when I go to my settings, my calendar or something else, the team
should become deselected and just the club selected. My calendar should be
to my account, so no club included, since if I work for more than one my
calendar becomes more complex. Then people can know my availability without
going to another club's page — but private by default, public if I want.
And a way to import fields, games, practices, etc. in bulk, so clubs can
switch to this easily.*

- **The crumbs say whose a screen is.** A team's tabs carry Club › Team;
  settings, people, sessions, messages and club home carry the club alone;
  My calendar carries **You**. A team left in the crumbs on Settings read as
  "these are the team's settings".
- **My calendar covers every club you're in**, from the account button as
  well as the club page, with a chip per club. A phone still holds one club,
  so each of your phones writes a summary of the club it has open to
  `people/{uid}/cal/{code}`, which only you can read, and My calendar opened
  online also reads each other club's teams and games itself, so a moved
  practice shows moved. `AVAILABILITY.md` has the design.
- **Private by default; share if you want.** *Who sees your calendar* →
  *Share when I'm busy* publishes the times you are busy (a date and two
  times, nothing else; no title, place or club) to `people/{uid}/busy`. The
  coaches and admins of your clubs then see you as busy at another club
  wherever the app asks who is free — find a time, the planner, covering a
  call-out, session clashes, and your own bookable slots — and **People →
  Calendar** shows anyone's next fortnight as the club sees it. The rules
  refuse any busy time while sharing is off, and turning it off deletes them.
- **Import from a spreadsheet.** The bulk import reads CSV as well as JSON: a
  roster, a schedule (games, practices and other entries sorted by type or
  by whether there's an opponent; *Home team*/*Away team* worked out), or a
  list of fields, by their headings, with templates to download. A sheet
  with no team column asks which team it's for. Problems are given by row,
  and nothing is written while one is left, as before.
- **Practices and events import**, from either: one entry per week of a
  weekly practice, sharing a series as *Every week* does, matched by team,
  date, start and kind so a second run adds nothing. Games take their
  match-day details (home or away, arrive by, kit, notes), and times can be
  written `9:30am`.

**Rules version 3**: the new `people` root block. Paste `database.rules.json`;
until then other clubs stay on the phone that saw them and sharing is
refused, and the screen says so.

## Time boxes keep their colon — 2026-10-04

Editing a goal, shot, event or sub time opens a number pad, which has no colon
key, so deleting the colon left a time that no longer parsed and no way to type
it back. The time boxes now draw the colon themselves: they hold digits, the
last two are seconds (2 3 1 0 reads 23:10), and backspacing over the colon
deletes the digit before it.

## Merged with main: rules version 2 — 2026-10-04 (build 85)

Main started numbering the rules (`rulesVersion`, `RULES_VERSION`) while this
branch changed them twice: the `practices` rule no longer needs a date, and
the new `training/$code/away` block. So this is **rules version 2**, stamped
in `test/rules-stamp.json`. Paste `database.rules.json` once and an admin's
phone stops saying the rules are behind. `HANDOFF.md` went on main; what this
branch had added to it is in the entries below.

---

## Admins call coaches off, who's free, and club activity — 2026-10-04 (build 84)

The owner: *admins should be able to call coaches off. Also say what coaches
are available at a given time … notifications for admins for coaches calling
out, sessions being made by parents, practices, games, it all.*

- **Admins act for any coach.** On a practice, game or event, *Call Jaz off*
  for each of the team's coaches (and the session's coach on a session),
  asked first, with an optional note; *Put Jaz back on* undoes it. Planner →
  Coaches has *Add* time off for each coach and *Remove*. It is written in the
  coach's own record with the admin as `by`, so the entry says *Jaz can't
  make it (called off by Ada)*. A coach still can't do any of it for
  another, checked in the handler; the `away` rule already allowed admins.
- **Who's free.** Planner → *Coaches*: a day and a time, and every coach is
  listed free, busy (*G13 Storm: Practice at 6pm*) or off (*Every Mon, all
  day*), with the teams she coaches. `coachStatus()` reads `busyItems()`, so
  it agrees with everything else; a coach called out of the thing being
  covered is never offered as its cover. A practice with no coach left says
  *Free then: Kim* on its sheet and in Clashes. "Removed for good" is being
  taken off every team (under People): she is then no coach here, and isn't
  listed; time off is the "for now".
- **Club activity.** `clubNews()` works out, on the phone, what changed since
  it last looked, the way a family's session news already did: new, moved,
  called off, back on and deleted practices, games and events on any team (a
  weekly series, or a club-wide booking, as one item); a coach calling out,
  or being called off, and back on; time off; sessions families booked
  (*Booked by a family: 1-1 with Kim · Ella*) or asked for, and withdrawals;
  sessions coaches made. Each pops up as it arrives (top three, then *N
  more*) and is kept under the bell, at the top of Messages, unread marked,
  each tap opening the entry or session. A coach hears the call-outs on her
  teams and being called off; a parent hears none of it.
  - **Not news**: the first look at each source; a source that hasn't loaded
    yet (so a reload, or sessions arriving after the calendar, never reads
    as everything deleted); anything this phone wrote itself
    (`noteMine()`, called from every write path).
  - **Not push.** Like messages, heard while Minutes is open on a phone;
    ROADMAP's push section is still the way to a closed phone.
- Games made from now on carry `by`, so a new game says who added it.

`test/news.js` is new; `test/away.js` gains the admin and the who's-free
cases.

---

## Field hours and closures — 2026-10-04 (build 83)

The other half of the owner's ask (*the per-field thing would be amazing*),
and ROADMAP's "when pitches can be had at all": the lights go off at nine,
the school has it until four, it's shut for reseeding in November.

- **Opening hours per weekday**, on the field's form: an opening and a
  closing time, or *Closed*, for each day. Only what constrains is saved: a
  day left blank is open any time, so a field with no hours checks nothing,
  as before. A day with only one of the two times is refused, not guessed.
- **Closed on dates**: from, until (one day if blank) and why.
- Stored on the field with everything else about it
  (`access/org/venues/{id}/hours`, `closed`), under the admin rule that
  already covers fields, so no rule change.
- `fieldShut()` says why the field can't be used then (*Lakeside Park is open
  4pm–6:30pm on Tuesdays*, *is closed 2 Nov to 15 Nov (Reseeding)*), and it
  is asked everywhere permits already were: the session's clash card, the
  field's own next two weeks, the planner's Clashes (*Field*), and find-a-time
  with a field chosen, which ranks a shut slot with the clashes.
- The field card and sheet show the hours and the coming closures.

`test/planner.js` pins the hours, the closures winning over hours, the
planner, find-a-time, a session on a closed date, the form (half-typed
refused, only constraints saved) and a coach unable to change it. Also:
date inputs side by side no longer overflow the sheet at phone width.

---

## Coaches' time off: nights off, dates away, calling out — 2026-10-04

The owner: *get the coaches block out, call out, and all their kinds of
events coded up.* ROADMAP's "coaches' own unavailability", in the three
shapes a coach says it:

- **Every week**: *never Mondays*, *not after 6 on Tuesdays*, from or until
  a date if she likes.
- **Dates away**: *12–19 October*, or one afternoon for the dentist.
- **Calling out** of one practice, game, event or session she coaches: *I
  can't make this*, with an optional note, and *I can make it after all*.

Her list is on My calendar (*Time off*, with Add and Remove); calling out is
on the entry's own sheet and on her session's.

**Where it lives, and why not where ROADMAP first said.** ROADMAP suggested
`access/members/{uid}`. Every account in the club reads the workspace, and
the members rule lets any of them write any member's node, so a parent could
read a coach's week and forge it. It is `training/{code}/away/{uid}/{id}`
instead, with a rule of its own: a coach writes only her own, in her own
name, an admin anyone's, and only coaches and admins read it. It syncs with
the training sessions' machinery (merge on read, dirty marks, a refusal said
per record, *Download a copy*), and only coaches' and admins' phones ever ask
for it. **Paste `database.rules.json`** for it to leave the phone; until then
the card says *Saved on this phone only*.

**Read, not obeyed.** Nothing is called off or moved for her. Time off is a
busy item of hers in `busyItems()`, so it is what the planner, find-a-time
and her own bookable slots already read: her slots on a Monday are taken out,
find-a-time counts her busy. A call-out takes her off that entry, so she is
free for something else then, and the planner's Clashes says *No coach for
G11 Flight: Practice at 5:30pm: Jaz called out* when nobody is left, or *Jaz
called out …; Kim still on* when somebody is, plus *Jaz has time off but is
due at …*, and lists every coach's time off in the window. The team's
calendar row says *no coach: all called out* to its coaches and admins.
Families see none of it.

`test/away.js` is new; `test/rules.js` has the block, refusals first.

---

## Planning for the club — 2026-10-04 (build 82)

ROADMAP's *Next: planning for the club*, all four steps, as Admin → *Plan*.
An admin scheduling the season asks one question in many shapes: when is
everyone involved free? Every fact was already in the club; this joins them,
building on `busyItems()` (the join training sessions use) rather than a
second one.

- **Clashes**, this week, 14 or 28 days: two things at one place at once (a
  field from Fields, with its number of pitches, or the same words typed),
  a coach due in two places, and a family with children due in two places,
  by name, since the screen is the admins'. A read: nothing written.
- **Find a time** for some teams or the whole club: how long, from when, over
  how many days, between which hours, optionally at which field. Every half
  hour that fits is scored: a chosen team already busy is all but ruled
  out, then a full or unpermitted field, then coaches and families due
  somewhere else, with a team's usual practice slot as the tie-break. Each
  slot says what it clashes with.
- **Book it**: one entry per team at `teams/{tid}/events/{eid}`, sharing a
  `club` id the way a weekly practice shares `series`, each its own write,
  team-only. No new node and no new rule: an admin can already write every
  team's calendar, and each team can move or call off its own copy.
- **Picture day**: a day, a window, a slot length and the teams; siblings'
  teams are put next to each other, each team gets the first slot it and its
  coaches are free for, a team with no room left is said rather than
  squeezed in, and one tap books every slot.

Admins only, checked in the click handler as well as on the screen. Games
against other clubs are shown as what they are and never offered to move.
`test/planner.js` is new; `test/smoke.js` draws all three tabs.

Also in this build: **`test/version.js` compiles app.js as a module**, the
way `index.html` loads it. The suites eval it as a script, where a second
top-level function of the same name quietly replaces the first: the
planner's first draft declared a `clashesOn(date)` beside the game plan's
`clashesOn(t, m)`, every suite passed, and the page itself was blank. Found
by looking at the new screens in Chromium at phone width, which is now a
test.

---

## What needs work, on the Season tab — 2026-10-04

TRAINING.md's step 7, and the first step of its road to the AI helper, with
no AI in it. A card on Season, for the team's coaches and the club's admins,
that works out the signals in `drills.js` from the last five finished games
(at least three), shows the three that stand out with the numbers behind
each (*12 against and 6 for in the last 5 games: 2.4 a game against, 1.2
for*), and the drills that answer each one for the team's age, closest level
first, with *All 16 →* opening the library filtered to that signal.

`needsWork()` uses TRAINING.md's starting thresholds exactly: shots under
80% of theirs, under 40% on target from ten, a top scorer with 60% from five,
under a quarter assisted from five, possession under 45%, their shots over
125% of ours, conceding a goal a game more than we score, 40% of goals
against in the last quarter from five, corners against over 150% (or two
goals within 20 seconds of one), fouls over 150%, twelve throw-ins a game.

**A signal only fires on data that was tracked.** Each family counts only the
games that carry it and needs three; no shots tapped is *we don't know*, and
the card says which families it couldn't judge. Assists count only for a
team that has ever tapped one. Parents and trackers don't get the card: the
drills are the coaches', and the numbers are in the cards they already see.
Nothing about it reaches `public/` or the AI prompt yet (TRAINING.md's step
2). `test/plans.js` pins each threshold that fires, the honesty rule, the
age filter, and who sees it.

---

## Templates — 2026-10-04

The last of the owner's ask for coaches' own libraries, the club's, and
templates. **A template is a plan with no calendar entry**: a name, a
length, what it's for, and the drills in order, with their minutes and notes.

- **Two shelves, the drills' shape.** Mine at `userLibrary/{uid}/templates`,
  the club's at `training/{code}/templates` with `by`, `byName` and `team`,
  exactly like a club drill. They are `SHELF.mineTpl` and `SHELF.clubTpl`
  beside the drill entries, so `putDrill()`, `mergeShelf()`, `watchShelf()`
  and the rest sync them with no second copy of the code: merge on read, a
  dirty map, one template per write, Mine cleared on sign-out with the rest
  of `sm.mine.v1`. Everything read goes through `normTemplate()`, which holds
  each block to a shape and leaves the drill cards to `normDrill()` when
  they're drawn.
- **Save as a template**, from any plan, to Mine, or straight to the club
  for a coach of the team or an admin. **Plan from a template** on a plan
  with no drills, or **Swap in a template** on one with some (asked first,
  as *Suggest another* does); or open a template and **Plan a practice from
  it**, which lists the coming practices with no plan. The plan copies the
  blocks and records which template (`tpl`); the template is untouched.
- **Where they are**: *Templates · Mine · Club* chips on top of Plans, and
  Admin → Club drills has *The club's templates*.
- **Copied, never linked; delete never cascades.** *Share with the club* and
  *Copy to mine* make copies that record `from`. An admin removes any club
  template, a coach what she shared while she still coaches its team,
  checked in the click handler, as for drills.
- Counted in the badge and *Not saved to the club yet* until the database
  has them; the club's go in *Download a copy* and come back through *Load
  from a file* only where the club has none. A plan with no date of its own
  (one that hangs off the calendar) is now restored too.

No rule change: `templates` was already in both blocks of
`database.rules.json`, with its `rules.js` cases. `test/library.js` pins who
sees them, save as, plan from, swap in, share and copy as copies, curation,
merge on read, sign-out, and a hostile club template drawn as text.

---

## Practice plans hang off the calendar — 2026-10-04

The owner settled it on 2026-10-03 (*do practice plans hang off the
calendar? Yes*), and the Add buttons were already one. This finishes it: a
plan no longer has a date, time or place of its own. It is keyed by its
calendar practice's id and reads day, start, end, place, length and whether
it's called off from `teams/{tid}/events/{eid}` every time it's drawn
(`withEntry()`), so there is one list of practices and nothing that can
disagree with it about when practice is. Edits start from what is stored
(`rawPlan()`), so the calendar's day is never copied back into the plan.

- **Plans → the list is the calendar's practices**, each with its plan or
  *Plan it*. *Add a practice* is the calendar's own sheet. Editing a plan
  edits what it's for (and its length when the entry has no end time) and
  sends day, time and place to the calendar.
- **Called off**: the plan stays, struck through and saying so. **Deleted
  entry**: the plan is kept, never deleted with it, and listed under
  *Earlier* as *Not on the calendar*, offering *Save as a template* and
  *Delete the plan*.
- **Again next week** is now **Use this plan for…**: the coming practices
  with no plan yet; the drills and the focus are copied.
- **`schedule` is no longer written or read.** The next practice on Games
  comes from the calendar, which everyone on the team could always read, so a
  parent's phone now reads no training node at all. The `schedule` rule stays
  for now, because an older app in the wild still writes it; remove it in a
  later change.
- **Older plans move across by themselves** (`movePlans()`), on a coach's or
  an admin's phone, after the club's copy of the plans arrives: a practice
  entry is made from the plan's day, time and place, team only, *under the
  plan's own id*, and the plan is marked `eid`. The brief suggested a new id
  and deleting the old plan once the new one was acknowledged; the same id
  gets the same result with nothing to delete, so two phones moving the same
  plan write the same entry, and a reload halfway leaves nothing half-moved.
  `eid` stops a plan being moved twice, and stops an entry deleted on purpose
  from coming back. A plan with something pending waits until it is sent.
- **The rule**: `practices/$tid/$pid` now needs `id` and `teamId` only, so a
  plan with no date is accepted; an older app's dated plan still is. **Paste
  `database.rules.json` before this ships**, or a new plan is refused and
  stays on the phone (the screen says so).

`test/plans.js` makes practices through the calendar now, and pins the move
(including a reload before anything was acknowledged), called-off and
deleted entries, *Use this plan for…*, and the next practice read from the
calendar by a parent's phone that reads no training at all. `test/rules.js`
has the plan with no date.
## Which rules are published, asked of the database — 2026-10-04

Nobody could tell whether the latest `database.rules.json` had been pasted.
Rules that were never published look exactly like a coach with no signal:
each feature says *saved on this phone only* on its own screen, and the notes
in this repository went on saying "waiting on the owner" after the owner had
pasted them.

**The rules carry a version.** A new root node, `rulesVersion`, accepts one
number, the version the rules are, from anyone, so writing it is a question
only the published rules can answer, and the only write that can succeed
changes nothing. The app carries the version it was built for
(`RULES_VERSION`). An admin's phone asks once a session it has a signal: if
the rules are older, every screen says so and *Check readiness* has a cross;
if the app is older (another phone already wrote a higher number), it says to
reload. Nobody else's phone writes it.

**From a computer**, `node tools/live-rules.js` tries the numbers against the
live database and prints the published version beside this checkout's.

**It rolls on its own.** `test/rules.js` keeps a fingerprint of the rules in
`test/rules-stamp.json` and fails when they change without the version going
up, or when `app.js` asks for a different number. Raise both, then
`node test/rules.js --stamp`. `test/rulesver.js` pins the app's side.

This change is itself a rules change: paste `database.rules.json` once more
and the check starts answering.

---

## The to-do notes say only what is left — 2026-10-04

`HANDOFF.md` described branches that have all merged since, and everything in
it was already in this changelog, README, `ROADMAP.md` or CLAUDE.md's known
gaps, so it is gone. `ROADMAP.md` loses what has shipped (availability
replies, parents per team in the rules, game-only links, the club's list of
venues) and two ideas the later *planning for the club* section replaced;
its training section, which still said nothing in the app loaded the drills,
now points at `TRAINING.md` and `TRAINING-NEXT.md`. `TRAINING-NEXT.md` drops
the parts of step 1 that *One Add for a practice* built and the hand-drawn
pictures *Writing a drill* built; `TRAINING.md`'s build order says so too.

---

## Writing a drill: five things, then draw it on a pitch — 2026-10-03

The owner: *the write a drill is really confusing for a user. Also I have no
idea how a user would make the animation in that?* Both fair. The editor was
one page of about forty fields in the order the card stores them, and the
only way to a moving picture was to copy a prompt into an AI chat and paste
JSON back.

**The editor is three parts now.** *1 · What it is* is the five things Save
already insisted on (name, one line, setup, how it runs, what to coach),
marked *needed*, with the age range. *2 · The picture*. *3 · More detail*,
folded behind *Show the detail*: type, numbers, kit, every tag chip. The
folded fields are still in the page, only hidden, so nothing about how the
draft is read or saved changed, and the defaults stand if she never opens it.

**Draw it on a pitch.** A board in the editor: pick a size, put players, a
ball, cones and goals on by tapping, then add steps. In a step she taps a
player and then where they go; a player with the ball passes to whoever she
taps (or the end of their run) or dribbles to a spot, one without it runs,
and chips give a shot, winning the ball, and a pass into space. Each step
can have a few words, which play as the caption. It writes
`drill-diagram.js`'s own format, so each tap is tried on a copy and held to
`parse()` before it's kept: a pass from someone without the ball, a second
run in one step, a spot off the area are refused there and then, in plain
words, instead of at Save. *Use this drawing* still goes through
`cleanDrawing()`, as an AI's answer does. It opens on whatever drawing the
drill already has, built-in or her own, so changing one is the same screen.
`DrillDiagram` gained `frame()` (where a point lands and the way back from a
tap) and `svg(…, { empty: true })` for a pitch nobody is on yet. Having an
AI draw it is still there, second.

`test/library.js` taps a drill out end to end: placing, the goal on the
nearest edge, a ball, pass and run and pass-and-follow, the refusals and
what they say, a shot, undo, removing a player who moves later, and the
saved drawing holding to the same checks as any other.

---

## Drills for the shape you play, and wide players who get back — 2026-10-03

The owner: *we are running a 2-5-1 and the girls on the wings are having
trouble learning to fall back to help defend… people are just not moving as
much as they should, whether from not knowing or laziness.* So, drills by
shape, and most of them about the run back.

**Drills know their shape.** A drill can say which of the app's preset
formations it is written for (`shapes`, from `SHAPES` in `drills.js`, which
the suite holds to `PRESETS` in `app.js`). A team with a saved 2-5-1 gets a
one-tap *2-5-1 drills* chip on the Drills screen; Filters has *Written for
the shape* for any of them; the card says it; the editor has chips for it, so
a coach's own drill can be found the same way; and *Suggest a session* leans
towards the team's shape, less than towards the focus she picked. A shape
she drew and renamed herself matches no drill and gets no chip. Eleven
existing drills were tagged too (the winger's and full-back's jobs, the back
line, two banks and others), without a version bump: a filter label is not
new content.

**Sixteen new drills, 141 in all:**

- **The 2-5-1 problem itself.** *2-5-1: two shapes*: a 2-5-1 with the
  ball and a 4-3-1 without it, the wide players dropping beside the two backs
  on every turnover. *Back in time*: the wide player attacks, then races back
  the moment it ends to make it 2v1. *Follow her home*: tracking a runner
  without the ball all the way to the line. *Mirror on the wing*: the same
  run as a warm-up race. *Hold until help comes*: the two backs' half of
  it, delaying 3v2 until the wide player arrives. *Cross, then get back*: both
  ends of the wing in one rep. *Slide as five* and *One up top*: the
  midfield line and the lone striker.
- **Other shapes.** *3-3-2: ball side, far side* and *2-3-1: everyone has
  two jobs*.
- **Work rate**, which the players enforce on each other: *Up together, back
  together* (a goal counts only with everyone over halfway, and double
  against a team that didn't get back), *Last one back* (the last over the
  line sits out the next attack), *Freeze!* (anyone hiding or on the wrong
  side of the ball moves before play goes on) and *Everyone touches*.
- Also *Cross and attack the box* and *Futsal 3v3* for the winter.

Every preset shape has at least three drills (a 2-5-1 has 17). Every diagram
was looked at, and four were corrected: the crossing drill had its near and
far post the wrong way round, and two had passes running through defenders.
`LIB.version` is 5.

---

## Twenty more drills, most of them where the library was thinnest — 2026-10-03

The owner asked for more drills. Counting what was already there showed
where to put them: a U4 coach had four drills to choose from, a U5 coach
fourteen, and nothing taught an under-eight to play in goal. There were six set
pieces, none of them a goal kick, a kick-off or a wall, and three cool-downs.
Throw-ins and heading had two drills each.

- **The youngest** get ten: *Tails*, *Copy cat*, *Bowling* (passing to knock
  a pin over), *Goal frenzy* (a ball each, a goal on every side), *Numbers*,
  *Guard the castle* (staying between the ball and what you protect),
  *Sideline helpers* (a first reason to be wide instead of in the swarm),
  *Little keepers* (everyone's turn in goal, from close in), *Throw-in target*
  and an *Animal cool-down*. U4 now has 9 drills, U5 19, U6 31.
- **Set pieces**: *Goal kicks* (short and long, against a press), *Kick-off
  routines* and *Building a wall*.
- **Older players**: *Stay on your feet* (the block tackle and the poke, with
  a lunge giving the attacker the point, for the fouls signal), *Clear it,
  then step out*, *Switch the play*, *The keeper's voice* (who, where and the
  ball), *Throw, head, catch*, *Pass and prepare* (a warm-up that is the
  running warm-up with a ball) and a *Crossbar challenge* to finish on.

The three that head the ball are U12 and up and carry the same federation
safety note as the others; the suite already refuses a heading drill below
U11. Every diagram was checked by eye, and five were redrawn after that
because the arrows piled up. `LIB.version` is 4, and the build moves on so
phones fetch the new `drills.js`.

---

## Bookable groups, and the rules hold families to the times — 2026-10-03

The owner, on the first version: *slots should be for groups or 1-1*, and
*the rules should also block some of that stuff* — the slot grid, the coach
being free and the cancellation notice, which the first version left to the
app.

- **1-1s or a small group.** A coach's times are either; a group has a
  number of places and an optional name ("Finishing group"), and a family
  sees how many are left. The first family to book a group slot makes it;
  the rest join it.
- **A place is a seat.** A rule can't count, but it can refuse a key that's
  taken, so a slot has one seat key per place (`seats/{sid}/s1…`) and a
  family books by taking a free one, then writing her child's booking naming
  it. That is how a group of six refuses the seventh.
- **The window carries what the rules look up.** Each block lists the slots
  it offers, each with its start as a timestamp. The rule now refuses a slot
  off the grid or of the wrong length, one in the past, one at a price, size
  or notice of the family's own, a seat the window doesn't have, and a
  cancellation or withdrawal inside the coach's notice.
- **"The coach is busy" reaches the rules too.** The list of open slots
  leaves out anything the coach is busy with, and her phone or an admin's
  keeps it current whenever they open the app (`healBlocks()`), as the lookup
  tables are kept. The same phones let go of seats nobody is using.
- **`rules.js`** walks all of it, including the seventh child and a cancel an
  hour before, and prints what is still the app's: how fresh the list of open
  slots is, and a second seat held by hand for one child.

Paste `database.rules.json` again: it gains the `seats` block, and `avail`
blocks now need `kind` and `cap`.

---

## Coaches' bookable times, and My calendar — 2026-10-03

Asked by the owner: *training sessions should have a calendar, and coaches
have block-out times they can be booked in; admins and coaches edit them, a
parent books whatever is in there, synced with the teams' calendars — and a
calendar is not team-specific but person-specific.* `AVAILABILITY.md` is the
design, written first.

- **Bookable times.** Training sessions has a *Bookable times* tab. A coach
  offers a window (Tuesdays 5–7pm, hour slots, $30, until the end of term);
  each week is its own block, so one week can be taken off with one tap. A
  coach offers and changes her own; an admin anyone's, checked in the handler.
- **Families book a slot themselves**, for their own child, with what she
  wants to work on, and it's booked: no waiting on a reply. A booked slot is
  an ordinary 1-1 session, so the coach's list, the register, fees, hours,
  clashes, notices and the player's record all work on it unchanged.
- **One time, one family, enforced by the database.** The slot's id is built
  from the coach, the day and the start, and the rule checks it was, and
  that nothing is there yet. A rule can't search for overlaps; it can refuse
  a key that exists. So booking needs a signal, and a family who loses the
  race is told to pick again with nothing left on her screen.
- **Synced with the teams' calendars.** A practice or game for a team the
  coach coaches, or a session she runs, takes out the slots it overlaps with
  nobody editing anything; a slot that overlaps the child's own team practice
  isn't offered to her family.
- **Cancelling** goes back to the coach's list as a free time, up to the
  notice she sets (24 hours by default). The coach is told of bookings and
  cancellations.
- **My calendar** (Club home, and a link on every team's Calendar tab): every
  team she coaches or tracks, every team a child of hers is on, her sessions,
  her children's, and the times she's offered. It reads the lists the team
  calendar reads, so nothing is copied and nothing goes stale.
- **Rules.** `training/$code/avail`, and family clauses on `sessions/$sid`
  and `booked/$sid/$pid` for exactly a slot's shape. `rules.js` walks it,
  including two families racing for one time, and prints what is left to the
  app (the slot grid, the coach being free, the cancellation notice).
- **Sheet rows line up.** `.sheet .opt` was undoing `.opt.spread` in every
  sheet, so a label ran into the time beside it; now they sit at either end.

Paste `database.rules.json` again: without `avail`, a coach's times stay on
her phone and a family's booking is refused and taken back.

---

## Start a new club from the club switcher — 2026-10-03

Asked by the owner: "not sure how a new club can be made if you are in one."
It couldn't, except by the app owner typing a workspace code under Settings.
The rules already let any signed-in account found a club at a code nobody
has written (the bootstrap clauses `rules.js` walks), so this is a door, not
a rule change.

- **The club button at the top left** now ends with **+ Start a new club**.
  A name, *Start it*, and the phone opens the new club with you as its admin.
  The club you were in is untouched and stays in the list.
- **Admin, index, member, name, then the bookmark**, each awaited, in the
  order the rules need: every later clause asks whether she is the admin.
- **Online only, on purpose.** Everything else goes through the outbox; a
  club does not. A club queued on one phone is a code nobody else can reach
  with an admin claim another device could beat it to, and making one again
  with a signal costs nothing. Refused or offline, nothing is half-made and
  the phone stays where it was.
- **A device with no club open** gets the same button under Settings →
  Workspace. The owner's code box stays as the escape hatch.

---

## Send one drill to another coach — 2026-10-03

The owner asked to share specific drills with other coaches, still checking
permissions so that a parent who gets one can't view it and is told why,
except for the drills that come with the app.

- **Send to a coach** on a built-in or a club drill gives a link to share or
  copy: `#/drill/{club}/{key}` for a club drill, `#/drill/{key}` for a
  built-in one. It carries the drill's id and which club it's from, and
  nothing else, not the card, so whatever it opens is decided on the phone
  that opens it, by that person's own role: the link gets forwarded, and the
  only safe link is one that grants nothing.
- **The link picks the club, not the coach.** A coach in more than one club
  shouldn't have to know which the drill came from, so the link names it and
  her phone opens that club, then the drill. The club is named by a one-way
  tag made from its code, never the code, and is matched only against clubs
  this phone has kept or this account's own list (`userOrgs`) says she's in;
  a link from a club she isn't in is never switched to, and says so.
- **Opening it.** A built-in drill opens for anyone, read-only, because it
  ships in the app's public files; the drills it goes with open the same way.
  A club drill opens for the club's coaches and admins, after the club's
  drills have arrived. A parent or a tracker sees *This drill is for the
  club's coaches*, naming her role, and nothing of the drill; her phone never
  asks the database for the shelf, the same as before. A drill removed since
  says so. The link waits for the club to be read
  rather than judging on a cached role, but never for more than a few
  seconds.
- **Mine is never sent.** It's private to its author, so a link would open
  for nobody; the button offers *Share with the club* instead.
- The address goes back to the screen underneath as soon as the link is
  taken, so Back doesn't open the drill again.

Cases in `test/library.js`.

---

## Nothing floats away: one count, a full phone, a whole backup — 2026-10-03

The owner's worry, after training sessions and the drill shelves shipped:
"not saving sounds like data could float away." Nothing in them was ever
thrown away, but three things meant it could happen without anyone noticing.

- **One count.** The badge said "synced" while a practice plan, a drill or
  a training session was still only on the phone: it counted the workspace
  outbox and nothing else, and the only warning was a note on that one
  screen. Now the badge, the banner on every screen and *Not saved to the
  club yet* count all of it. A refused session is marked per record, keeps
  its mark through a reload, and *Try again* or *Drop the refused ones*
  covers it with the rest.
- **The backup was missing half the club.** *Download a copy* wrote the
  workspace: teams, games, roles, fields. Sessions, bookings, registers,
  fees, pay rates, practice plans and the club's drills live outside it and
  were left out, so a club keeping the file for safety had no fee records in
  it. Now they are under `training`, and with a signal the club's own copy is
  asked for first, so the file holds what the club has, not just what this
  phone opened. *Load from a file* puts back only what the club is missing:
  it asks the club what it has, writes a training record only where there is
  nothing, and leaves out (and lists) what it couldn't check, because
  writing blind could put last month's fees over this week's.
- **A full phone.** Every local save was `try { … } catch (e) { }`, so a phone
  out of storage refused the write in silence: the change looked saved, lived
  only in the open page, and was gone when it closed. Saves now go through
  `keepStored()`, which says so at once and on every screen until one gets
  through.

`test/safekeep.js` is new.

---

## Bulk import takes fields and training sessions — 2026-10-03

Asked for straight after training sessions shipped: a club's fields, their
permits and a term of sessions are a spreadsheet's worth of typing, the same
as a season's fixtures were.

- **`fields`**: name, address, pitches, surface, lights, notes, and permits
  with their days (`"Mon, Wed"`, `"weekdays"`), hours (`16:00` or `4pm`),
  dates and number.
- **`sessions`**: date, start and end, the coach by name or email, 1-1 or
  group, spots, ages (`"U10-U12"`), price (`"$25"` works), the field by name
  (one in the same file too), `weekly` with days and a last date, and
  `players` to book, by name, by shirt number with a team, or both.
- **The same promises as the rest of the importer.** *Check it* lists every
  problem before anything is written, and nothing is written while one is
  left. Running a file twice changes nothing: a field is matched by name, a
  session by date, start and coach. Nothing is removed. A field's permits are
  only added to, never replaced. A booking already here is left as the coach
  has it, and the check says so.
- **What it can't decide, it says.** Past a session's spots, the rest go on
  the waiting list. A field nobody has is kept as the session's place. A time
  outside the field's permit is imported with a warning. A name on two teams
  needs its team. A session with players named starts closed to families'
  asks; one with nobody named starts open.

Fields go out with the workspace writes, under the club-settings rule.
Sessions and bookings go through the session store, one record per write,
so an import made with no signal is owed and resent like a session made by
hand.

---

## Training sessions: 1-1s and small groups, fields, fees and hours — 2026-10-03

The owner's ask: schedule 1-1 and group training that isn't tied to a team,
with players from any team training all kinds of things, and take on the
planning, scheduling and admin of it. Usually the coach brings the drills, but
sometimes a player brings the ones she wants. `SESSIONS.md` is the design,
written before the code.

- **Club → Training sessions.** A coach offers a 1-1 or a small group: when,
  which field, how many spots, an age range, a price, and whether families may
  ask. *Every week* makes one session per week, each its own, so one week is
  moved or called off without the rest.
- **Two ways in.** The coach books players from any team herself, and past the
  spots they go on the waiting list. Or a family asks from her own phone, for
  her own child, saying what she wants to work on, and the coach books,
  waitlists or turns it down. A family can withdraw but never give herself a
  place: a rule can't count spots, so only the coach or an admin says *in*.
- **The family's "own drills" reach the coach** as her own words on the ask,
  shown on the session and at the top of its drill picker. The picker offers the
  library's drills that this many players (plus the coach) can do at these ages.
  Families never see the library, as `TRAINING.md` settled.
- **The register** counts on the player's record as *Extra sessions*, beside
  practices and games, on the Season tab and under *My players*.
- **Fees**: a booked place owes the session's price, a withdrawal nothing. Mark
  paid (cash, card, transfer, other) or waived, one place or all of a player's
  at once; *Remind the family*. A family sees what she owes. No card payments:
  it's the club's book, not a till.
- **Hours**: each coach's month, sessions and hours and players, and with an
  admin-set rate per hour or per session, what that comes to. *Copy as a table*
  for payroll. A coach sees only her own.
- **Fields with profiles**: address, pitches, surface, lights, notes, and the
  club's permits (days, hours, dates, permit number). Each field shows the
  next two weeks of everything on it, including team practices and games whose
  venue names it, flagging anything outside the permit or double-booked.
  Venues already typed on the calendar are offered as one-tap fields. Fields
  live in club settings (`access/org/venues`), so no new rule.
- **Clashes**: before saving and on each session, outside the permit, more at
  once than the field has pitches, the coach due somewhere else, or a booked
  player due at her team's practice or game.
- **Telling families**: one message with when, where and what changed, sent
  in the app where the sender coaches the team, by email in Bcc, or as a copy.
  Calling a session off opens it. On screen, a family hears when her child's
  place changes or her session moves; a coach hears when a family asks or
  withdraws. The first read tells nobody anything.
- **On the calendar** for that team's coaches and the child's own family, in
  *Add what is coming up*, and never on the share link or the calendar feed.

Why it's shaped this way: sessions sit at `training/{code}/…`, beside practice
plans, not in the workspace. Every phone reads the whole workspace, fees don't
belong on every parent's phone, and the connect-time read would erase a session
made offline. They have their own local copy, merged on read and never
replaced. Bookings, the register and fees are separate from the session, so a
coach saving it can't overwrite a family's ask. Bookings and registers are
club-readable at the database, as `rsvp` and team registers already are, and
the screen narrows them; fees are narrowed by the rules themselves. Every write
is one record at the depth its rule sits at, and deleting a session clears its
bookings before the session itself, while its coach can still be found.

The rules (`sessions`, `booked`, `came`, `fees`, `pay`, `splans` under
`training/$code`) need publishing; `node test/rules.js` covers them, and
`node test/sessions.js` covers the app. Not built: packages of sessions, two
coaches on one session, outside trainers, named pitches, and bulk import of
sessions or fields.

---

## Nothing lives only on the phone — 2026-10-03

The owner asked that no data be stored only locally, and that it all reach
the server. Most of it already did, but not all of it reliably, and one case
was a known way to lose a game.

Firebase keeps a write it couldn't send in memory only. A coach who tracked a
game with no signal and closed the page (or whose phone reloaded it) had the
game in localStorage and nowhere else, and the connect-time read then replaced
local state with the club's, which had never heard of it. `test/sync.js` had
pinned this as a known gap. It is closed:

- Every workspace write goes into an outbox on the phone
  (`sm.pending.v1:{club}`) and leaves it only when the database acknowledges
  it. On connect, the club's copy is taken, whatever is still owed is laid
  back over it in the order it was made, and all of it is sent again.
- A phone remembers which teams and games it has ever read from the club, so
  a game made here and never sent is sent, while one deleted somewhere else
  stays deleted. On the first connect after this build nothing has been seen
  yet, so a game deleted elsewhere while this phone was away can come back
  once: the safe way round.
- A write the database refuses is kept, marked, and tried again every time
  the phone connects (the rules may just not be pasted yet). Every screen
  says so, the badge counts it, and Settings lists what's waiting in words
  ("a goal in the game against Riverside") with *Try again* and a confirmed
  *Drop*. Nothing is dropped unless the coach says so.
- The badge no longer says *synced* while something is still on its way; it
  says how many changes are left to send.
- Practice plans, club drills and a coach's own drills already kept a
  pending list, but sent it again only when their own screen was opened.
  They now go on every connect.
- Teams kept on a phone from before it joined a club were under a key no
  club reads. Settings now says so, and an admin can add them to the club
  through the bulk import, which merges and never replaces.

The four lookup tables stay out of the outbox, because they are rebuilt from
the roles on every connect anyway. A parent's answer the rules refuse is
still taken back off the screen, and now out of the outbox too, so it doesn't
come back on the next connect.

## Who made a drill, and an AI to draw it — 2026-10-03

The owner asked for three things after the shelves landed: to know who added
a drill to the club even after they leave, to filter by who made it, and to
let a coach explain her idea to an AI and have it make the animation.

Credit was half there: a club drill already carried `by` and `byName`,
copied onto it when it was shared, so the name never depended on her still
being in the club. Now the card says so ("shared by Lou, who no longer
coaches here"), an admin tidying it leaves the author the author and adds
"last tidied by", and the built-in library is credited to Minutes, the
app's name. Filters → *Made by* narrows to the app, you, or one coach, with
those who have left marked.

*Have an AI draw it* follows Ask an AI's rule: the app never calls a model.
The editor builds a prompt with the drawing format, two of the library's own
drawings as examples, the drill's setup and steps, and her description, with
every player's name in the club swapped out. She pastes it into her own
chat and pastes the answer back. Until now a drawing stored with a drill was
never drawn, because the renderer writes numbers and ids straight into SVG
and any coach can write a club drill. `DrillDiagram.clean()` is what makes
it safe to draw one: it rebuilds a drawing from typed values (numbers in
range, ids and enums from their lists, moves that match the grammar, text
cut to length) and drops everything else, and `parse()` then has to pass
it. `test/drills.js` holds `clean()` to leaving all 114 built-in drawings
exactly as they draw today. When an answer doesn't hold together, the app
lists what's wrong in plain words with a button to copy them back to the AI.
It reads an answer whether it's JSON or written the way a JavaScript file
would be, with or without a code fence around it.

## The club's drills, and a coach's own — 2026-10-03

The owner asked for coaches to have their own drill libraries and clubs to
have theirs, and settled the shape on 2026-10-02: parents never see drills,
because they are a club's and a coach's own work; a coach's library is hers
and she shares only if she wants to; and no club admin sees it, only the app
owner, for support. TRAINING.md had the design and TRAINING-NEXT.md the
brief; this builds its first two steps.

Practice → Drills now has three shelves, Built-in, Club and Mine, and every
filter works across all three. *Save to mine* copies any drill, and editing
one that isn't yours saves your own version of it, which records where it
came from and says when the original has changed, without ever merging by
itself: a coach who reworded the setup for her age group doesn't want it
reworded back. *Write a drill* is an editor with the card's fields, where
every list is chips from `drills.js`'s own vocabularies, because a typo'd
skill is a drill no filter finds. There are no uploads. A copy of a built-in
drill keeps its drawing by naming it, and anything else carries https links,
with a line saying an unlisted video isn't private.

*Share with the club* copies a drill to the Club shelf, stamped with who
shared it and a team she coaches. Admins tidy it from Admin → Club drills,
and a coach can edit or remove what she shared while she still coaches that
team. Coaches' and admins' phones are the only ones that ever ask for it.

Mine lives at `userLibrary/{uid}`, outside every club, so a coach's drills
follow her if she moves. It is cached per account and taken off the phone
the moment she signs out or someone else signs in, with a warning if a
change hasn't reached the database yet. The app owner can read one person's
library once, from Settings, and the phone keeps nothing.

A practice plan can now hold Club and Mine drills. They are copied into the
plan whole, because those can be edited and deleted and last month's plan
must still read the way it was run, and the first time a coach adds one of
hers the app says that shares it with the team's coaches.

Both shelves sync the way plans do: merge on read, never replace, and one
drill per write. Everything read is normalised, because any coach can write
a club drill and the rules check only its name and its links. A diagram
stored in the database is never drawn, since the renderer trusts its input.

The rules: `training/{code}/drills` and `templates` (admins and anyone in
`coachIndex` read; a coach writes as herself for a team whose coach list
names her; admins curate; fails closed) and `userLibrary/{uid}` (hers; the
app owner reads; no club admin). They have to be pasted before drills leave
the phone. `test/rules.js` covers every role against them, and its validator
now walks into arrays, which it skipped before. `test/library.js` is new.

Templates, and practice plans moving onto the calendar (settled the same
day), are next; TRAINING-NEXT.md is the brief.

---

## Sub planning: start empty, clear it, and bring an AI's plan back — 2026-10-03

From a coach using the Plan tab for real.

- **A new change starts with an empty pitch**, not a copy of the one before.
  A copy credited eleven players with the rest of the game the moment it
  appeared, so the minutes column stopped saying where anything came from.
  Now each number moves when its player is placed. The players from the change
  before are listed first, marked with where they were, and a tap puts one back
  in her old spot; *Fill the gaps from the one before* does the rest in one go.
- **Clear plan** empties the whole plan, after asking. **Redraft is gone**: a
  draft only fills an empty plan, checked in the handler too, so no tap can
  write over snapshots a coach made. Clearing first is the deliberate way to a
  fresh draft.
- **Deleting a change sits beside its time** (the ✕ after −5 −1 +1 +5), not in
  a row of buttons about other things.
- **Ask an AI → Plan this game** now asks for the plan back in a fixed shape
  (`PLAN`, then `0:00 GK=#1 LB=#4 …` per change), and the sheet has a box to
  paste the reply into. The app reads those lines and nothing else, reports a
  wrong position or shirt number rather than dropping it, loads nothing until
  it is clean, asks before replacing a plan, and never touches a locked one.
  Players stay shirt numbers both ways. A position label a shape repeats is
  numbered (`CB`, `CB2`) so it can be read back.
- **Minutes so far, next to the total.** On any change after kick-off, each
  player shows what the plan has given her by that minute (*12 by 20:00*), with
  her whole-game total under it (*40 of 40 in game*). The total alone could not
  say who was due a rest at the moment the change comes round. Kick-off still
  shows only the total, since nobody has played yet.
- **Picking a time no longer loses your place.** The times sat in one strip
  that scrolled sideways, and every tap redraws the page, which sent the strip
  back to Kick-off. A coach planning the 60th minute scrolled back to it after
  every tap. The times now wrap onto as many rows as they need, so all of them
  are in view. And when a redraw is of the same screen, `render()` puts the page
  back at the same height, so it doesn't jump either.
- **A sub can be deleted from the match log** — *Delete — this sub did not
  happen* on its sheet. A swap gives the player who "went off" the other's
  spell; one swapped straight back later just played on; a move joins her two
  spells; the full-time whistle is refused, and so is anything that would put
  a player on the pitch twice (Fix minutes is the way through for those).
- **Putting a lineup on before kick-off no longer logs subs.** Changing the
  lineup at 0:00 closed the first one's spells at 0:00, and the match log reads
  every closed spell as someone going off. A spell that has not started is now
  removed instead (Undo still has it). Spells of no length already in a game
  can be deleted from the log. Before kick-off the button says *Use as the
  starting lineup*.

---

## One Add for a practice — 2026-10-03

The Practice tab had its own "Plan a practice" button and sheet (date, start,
length, place, focus), and the Calendar had "Add" with another (date, start,
end, where, notes, weekly, who sees it). They looked different and did
different things: a practice planned on the Practice tab never reached the
calendar, so families never saw it, and one added on the calendar never
reached Plans.

Now the Practice tab's button is the calendar's: the same **Add**, opening the
same sheet, set to Practice. Saving puts the practice on the calendar, and,
because the coach came from Practice to plan it, makes its plan and opens it.
The plan is keyed by the calendar entry's id (`eid`) and takes its day, time,
place and length from the entry. Practices added on the calendar with nothing
planned yet are on the Plans list as *Plan it*, so there is one list of
practices, and a practice's own sheet on the calendar has **Plan this
practice** (or **Open the plan**) for its coaches. So a season can be put on
the calendar at once with *Every week*, and each week planned later from
either tab. Editing a plan's own details, and the plans already made the old
way, are unchanged; the plan still carries its own copy of when and where, and
`schedule` still exists — retiring those is the rest of the "plans hang off the
calendar" decision in `TRAINING-NEXT.md`.

---

## One set of rules, for every club — 2026-10-03

There were two rulesets: an open "starter" set that new clubs began on, and
the locked-down set a club moved to once its people had signed in. That model
assumed one club. This is a site for any club that turns up, and a database
runs one ruleset for every club in it, so the two could never both be live:
whichever was published applied to every club at once. Publishing the open set
for a new club opened every established one. Publishing the locked set left
nothing for new clubs to start on, except that it already had what they need.

So there is one ruleset now, `database.rules.json`, and
`database.rules.open.json` is gone. A brand-new club starts under the same
rules as the rest. While its code has no admin and no index, a signed-in
account may claim admin of it and put itself in its index, and from that
moment the club is closed to everyone it hasn't let in. `test/rules.js` walks
a new club from nothing to a working one: admin, index, name, a team, a game
and a practice. It also checks that a stranger is shut out the moment that's
done, and that the founder can't reach anyone else's club. It fails if a
second ruleset ever reappears.

README's *Locking it down* is now *The database rules*. The ordered lockdown
steps stay, but only for a database still running the old open rules, where a
club whose data went in before anyone held a role needs one set up first. If
the rules go wrong, the way back is the previous version of the file, not the
open set. The app's copy stops saying the workspace "is locked down": signed
out, everything stays on the device, and signing in is how a club shares it.

---

## Practice plans — 2026-10-02

Step 3 of `TRAINING.md`. A coach plans a practice for her team, the app
suggests a session to fill it, she runs it at the sideline one drill at a
time, and afterwards says how it went.

**Planning.** *Plan a practice* asks for the date, time, length, place and,
optionally, what it's for: one of the same signals the drill library filters
on. *Suggest a session* builds the shape coaches are taught: a warm-up, one or
two practices, a game and, when there's time, a cool-down. Each drill is
picked for the team's age, the number of players and keepers on the squad,
and the focus, then timed to fit the length exactly. Asking again moves along
the shortlist. Drills can be added from the library (the drill card grows an
*Add to Tue 6 Oct* button while picking), moved, retimed a minute at a time,
given a note, or taken out. The plan works out what to bring: the most of
each item any one drill needs, with a ball each meaning the squad's size. It
warns about anything that would go wrong at the field: running over time,
too few players, a drill wanting keepers the squad hasn't got, one outside
the age group, three hard drills in a row, or a drill since taken out of the
library. A test sweeps the suggester across every age, length and focus
(3,024 plans) and fails if any suggestion trips those warnings. The first
version did, 134 times: hard warm-ups, and 30-minute practices whose drills'
shortest times added up to more than 30.

**Running it.** One drill at a time, in big type, with a countdown that runs
off the wall clock, so a phone that sleeps comes back showing the right
time, and it buzzes at zero. The diagram, the coaching points, the setup and
how to make it harder or easier are all there, and none of it needs a
signal. *Finish* asks how it went: one to five stars and a line. The review
box says plainly that the note is about the session, not a child.

**Who sees what.** The plan is that team's coaches' and the club's admins'.
A coach looking at another team can read its drills but not its plans, and a
parent's or a tracker's phone never asks the database for a plan at all. The
date, time and place go to a separate `schedule` node that the whole club
reads, so the Games list shows everyone the next practice. For a parent it's
just the time and the place.

**How it syncs.** Practices live at `training/{code}/practices/{team}/{id}`,
outside the workspace, with their own local copy and one listener per team.
They merge on every read: a plan this phone has changed and the club hasn't
acknowledged is never overwritten by the club's copy, and is sent again on
the first answer after a reload. A plan deleted on another phone goes. This is
the invariant the workspace's own connect-time read still breaks, written
correctly from the start rather than copied.

**New rules, which have to be published.** Both rules files,
`database.rules.json` and `database.rules.open.json`, gain an identical
`training` block, and the locked set's `access` gains `coachIndex`, a third flat lookup table: "is this account a coach of
any team?". Rules can't iterate, `index` only says member, and `teamIndex`
needs a team to look in. An admin's device writes everyone's entry and a
coach's own device writes hers; the rule checks that the team she names is
one she coaches. The practice rules fall back while `teamIndex` is missing,
but the fallback fails closed: it opens to coaches, never to the whole club,
because practices have no older behaviour to preserve and failing open would
show parents the plans. `test/rules.js` refuses a parent and a tracker before
it allows anything. Until the rules are published, plans stay on the phone
they were made on and the screen says so. Club settings → *Check readiness*
now lists the coach index.

A refused read is tried once more, as the workspace read is, because in the
first second after boot a refusal is as likely to be sign-in still reaching
the database. A second refusal is final until a different account signs in.
The first version kept asking again on every redraw; `test/plans.js` now pins
that it doesn't.

---

## A Practice tab, and a team's age — 2026-10-02

The drill library is in the app now. Practice sits beside Games, for coaches
and admins only. A parent, a tracker or an account with no role never gets the
tab. A link to it lands them on the games list, and a tap that gets to the
handler anyway is refused there too. The built-in drills are in the app's
public files and aren't secret on their own. The point is that the screen
where club drills and plans will live is shut to the right people before any
of that arrives. Before a club has an admin nothing is gated, the same as
every other screen.

**Drills** lists all 105, each with its animated diagram as a thumbnail.
Search covers the name, the steps, the coaching points and the skills. Age and
sort are on the screen. Everything else on the card is behind one *Filters*
button: what needs work, type, position, length, setup time, players coming,
competitive, difficulty, intensity, how busy, grouping, keeper, one adult,
indoors, missing kit, skill, principle, moment and physical. The button counts
how many filters are on, and the sheet shows how many drills are left as you
set each one. A drill card has the diagram (Moving or Still, and still by
default on a phone that asks for less motion) and the numbered steps, then
setup, how it runs, coaching points, questions, mistakes, why it helps on
Saturday, easier, harder, safety, what it trains and the drills that go with
it.

**Positions** is the guide to all nine positions, each with its diagram and
links to the drills that teach it. It names the spots from the team's own
saved shapes, so "full-back" reads as "your LB and RB".

**A team's age** is one new field on the team sheet: the birth year. It's
shown as a U-age, and it rolls over by itself each August, because a season
takes the year it ends in: born 2016 is U11 from August 2026 to July 2027.
The list starts at the team's age, and a coach can switch to any age or
none. Bulk import takes `birthYear` (or `born`) on a team. A team that
already has one keeps it, because the import fills gaps rather than
overruling a coach.

No new database node and no rule change. `birthYear` sits inside a team,
which the existing team rules already cover.

`drills.js` and `drill-diagram.js` load as plain scripts ahead of `app.js`, so
they are cache-busted with everything else. `test/version.js` now checks every
`?v=` in `index.html`, not just two, and that both scripts come before
`app.js`. If either file fails to arrive, the tab still opens and says so,
rather than taking `render()` down. `node test/practice.js` covers who gets
the tab, the age rule, every filter, the cards and that failure case.

**Every sheet now opens at its top.** Fixed while checking this on a phone. A
sheet kept the scroll position of whichever sheet was open before it, so a
long drill card opened halfway down its coaching points. The bug was in the
app before, but nothing was long enough to show it. A sheet redrawn while
it's open, such as a filter chip or Moving / Still, still keeps its place.

---

## A coach's own drills: her, and the app owner — 2026-10-02

Design only, in `TRAINING.md`. A coach's personal library is readable by
her and by the app owner, for support, and by no one in any club: not another
coach, and not an admin. The owner can read but never change or delete a
coach's drills. This is the first rule that gives the app owner any standing.
It's safe because `appOwners` can only be changed in the Firebase console, so
nothing in the app can make someone an owner.

---

## 105 drills, a guide to every position, and drills that stay private — 2026-10-02

Still nothing new on screen in the app.

**Fifty more drills**, most of them harder. Advanced ball skills: move
combinations, fast footwork, a weaker-foot circuit, controlling high balls,
volleys, chips, bending the ball, the Y passing pattern, first touch away from
pressure, and wall passing for homework. Opposed work: a rondo through a
pivot, a three-zone rondo, back-to-pressure, 1v1 from four sides, 2v2 with
bounce players, a finishing circuit, recovery runs and a marking game. Also
penalties, free kicks, four more keeper drills (sweeping, footwork, reaction
saves, and being calm on a back-pass) and two cool-downs. The youngest get new
games too: knockout, skill-move tag, and *Don't be a bee*, which turns
swarming the ball into a first idea of a position.

**Positions and units** is a new kind of drill, fifteen of them, about where to
be and what to do rather than a skill. They cover the back line shifting
together, the centre-back partnership, the full-back's and winger's jobs both
ways, the holding midfielder screening and switching, the midfield triangle,
finding the pocket as a number 10, striker movement, holding the ball up,
pressing from the front, defending in two banks, and a game where everyone
plays every position in turn.

**The position guide** says what each of nine positions is for. It covers
the ball, no ball, the second we win it and the second we lose it. Each entry
gives the skills it needs, the drills that teach it, a note for coaches of
under-tens, and an animated diagram. It lines up with the shape labels the app
already uses, and the tests check that every drill it recommends for a
position is marked for that position.

**The diagrams learned new tricks:** poles, hurdles, a wall to pass against,
and passes that bend. Every new diagram was checked by eye. That moved zone
labels to the top edge of their zone, because the middle is where the
players stand.

**`TRAINING.md`**: no uploads, only drawn diagrams and links. That settles
both the storage question and the children-in-photos question. Drills are a
club's and a coach's own work, so parents and trackers never see club drills
or practice plans. That's enforced by the rules, not by hiding a tab, and it
needs a third lookup table, `access/coachIndex`, because a rule can't ask "is
this person a coach of any team". Unlike the other bridges, this one fails
closed, because failing open would show parents the drills. Each coach keeps
her own library private and shares from it only if she wants to.

---

## Every drill gets a picture that moves, and a lot more to filter on — 2026-10-02

Still nothing on screen in the app. This makes the drill library something a
coach would actually pick from.

**Diagrams.** Every built-in drill now has one, and 53 of the 55 animate:
players run, the ball travels, and a caption under the pitch says what each
step is. The other two (juggling, the cool-down circle) are layouts. They are
not images. A diagram is a few lines of data in the drill (cones, goals,
players in yards, then moves like `A1>A2` for a pass and `A1~12,4` for a
dribble), and `drill-diagram.js` draws it as an SVG whose animation runs
inside the SVG, so it loops like a GIF with no script. That keeps each one a
few kilobytes and working offline, gives a still version with numbered
arrows for anyone whose phone asks for less motion, and means a coach's own
diagrams can later be drawn in the app rather than uploaded.

**More to filter on.** Each drill now says how long it takes to set up, whether
one adult can run it, whether it works indoors, how the players are grouped,
how busy each player is (lines versus non-stop), and whether there's a score
to win. Those sit beside what was already there (length, difficulty,
intensity, ages, players and keepers, kit, skills, principles, moments,
physical) as filters in the preview.

**Checks.** `test/drills.js` parses every diagram and refuses a pass from
someone without the ball, a player off the pitch, or a caption too long for
a phone. It holds each picture to its card: a keeper on the card is a keeper
in the picture, and goals and cones in the picture are on the kit list. That
check found World Cup's kit list missing the cones in its own picture.
Every diagram was also looked at by eye, still and mid-animation, because a
parser can say a diagram is valid but not that it reads well.

**`TRAINING.md`** has a *Pictures* section. Coaches add their own three ways,
cheapest first: draw one in the same format, link a video or GIF that lives
elsewhere, or upload a photo shrunk on the phone. Two new decisions for the
club: where uploaded photos are kept, and what to do about the children who
will be in them.

---

## A drill library, and a design for training — 2026-10-01

Nothing on screen changes yet. This is the groundwork for coaches planning
practices in the app.

**`drills.js`** is a built-in library of 55 drills: warm-ups, technique,
opposed practices, small-sided games, set pieces, goalkeeping and a cool-down,
from U4 to adult. Each card carries what a parent volunteer needs at quarter
to six (setup, how it runs, three or four coaching points, questions to ask,
what goes wrong) and what a filter needs: ages, level, players and keepers,
minutes, intensity, space, kit, positions in the app's own five roles, and the
skills, principles of play and moments of the game it trains. Every drill can
be made easier and harder. Each one also says which game numbers it answers
(*we create few chances*, *goals go in late*, *they win lots of corners*),
using only stats the app already records. That's the bridge to a *what needs
work* card, and later to an AI that picks from drills the coach can open
instead of inventing them. It's a plain script, not JSON, so it will load from
`file://` and with no signal, like `firebase-config.js`.

**`test/drills.js`** keeps the library honest. Fixed vocabularies, because a
misspelt skill is a drill no filter finds. No heading drill below U11, and a
safety note on every heading and diving drill. Coverage too: on its first run
it found that under-sixes had nine drills and throw-ins one, which is why
*Red light, green light*, *Hungry hippos* and *Quick restarts* exist.

**`TRAINING.md`** is the design, written before the code because the data
model is the hard part. Coaches keep their own drills under their account, not
the club's, so the drills go with them if they move clubs. Practices copy
their drills rather than linking to them. Training data lives at
`training/{code}`, outside the workspace, because every phone, parents'
included, downloads the whole workspace on connect. It ends with six decisions
for the club.

---
## The database rules are files — 2026-10-02

The rules lived as two code blocks in README, and `test/rules.js` parsed them
out of the prose. That made the thing you paste into the Firebase console a
selection from the middle of a long document: one stray brace from being
refused, awkward to copy on a phone, and invisible in a diff among paragraphs
of explanation. They are now `database.rules.json` (locked down: what a club
runs) and `database.rules.open.json` (the starter set). On a phone, open the
file on GitHub, tap **Raw**, select all, copy. `firebase.json` points the
Firebase CLI at the locked set, so `firebase deploy --only database` publishes
the same file from a computer.

README still explains every block and keeps its short excerpts. `rules.js`
reads the files, and fails in four ways it could not catch before: a whole
ruleset copied back into README (the copy that drifts), an excerpt there that
no longer matches the file, a block the open set shares with the locked one
that has drifted (so an invite made today would stop working on lockdown day),
and `firebase.json` pointing anywhere else.

## Families' answers plan the game, and the coach takes a register — 2026-10-02

**Answers go straight into the plan.** A "not going" was a hint on the
availability sheet with a button to act on it, which meant the coach copying
every answer across by hand before she could plan. Availability is now derived:
`isOut()` is the coach's word if she gave one, otherwise the family's answer.
So a "not going" leaves a player out of the bench, the plan, the targets and
the even split by itself, and a family that changes its mind flows straight
back in. The coach still has the last word either way: she can play a "not
going" or leave out someone whose family said nothing, and her choice is kept
only where it differs from theirs. The Plan tab's *Who is coming* replaces *Who
is unavailable*: who is out and why, who said maybe, who has not answered, and
the Minutes list marks the maybes and the silent ones. The AI prompts and the
Subs tab counted the coach's list directly and would have missed the families.
They now ask the same question everything else does.

**Attendance.** From the day of a practice onwards the coach can *Take
attendance*: filled in from what families said, a tap per change, *Everyone
came*. It is one write at `teams/{tid}/attend/{eid}`, beside the entries rather
than inside them, so editing a practice cannot write over its register, and keyed
by the calendar entry so a practice plan keyed the same way can say which drills
each player has done. Games need no register: a player came if she played or
was available. Season → **Attendance** lists practices came to and missed, how
many misses nobody warned about (the number a coach actually asks), and games,
most missed first. It also says how many past practices still have no register
rather than guessing. A player's sheet carries her line; a parent sees her own
child's.

**What comes next** is written down: ROADMAP's *Next: planning for the club*
(clashes across teams, coaches and families with children on two teams; finding
a free time; booking a club-wide event as one entry per team), and `HANDOFF.md`
for the conversation that picks it up.

## Calendars that follow changes, parents saying who is coming, and game links that stop at the game — 2026-10-02

**Sync.** Adding the calendar to a phone gave a copy, so a moved kick-off meant
everyone adding it again. A calendar app that *subscribes* fetches an address on
its own schedule, from its own servers, and never runs our JavaScript, so no
static file can answer it. `worker/calendar.mjs` does: a Cloudflare Worker that
reads one `public/{id}` node and returns it as a calendar. It is the first piece
here that is not a static file, so it is kept as small as it can be: optional,
read-only, no credentials, and it can only ask the database what anyone could
already ask. `test/worker.js` pins that it never fetches anything but
`public/{id}.json` for a plain id. It carries its own copy of `ics.js`, because
Cloudflare's editor takes one file, and the test fails if the copy drifts
(`node worker/make.js` refreshes it).

A coach turns sync on per team, and every member gets *Apple Calendar*,
*Google Calendar* and *Copy the address*. That feed includes team-only practices,
because a subscribed calendar without practices is not the calendar, so they are
published under its id. The id is shown only inside the app, to the team's
members, it holds no names, players or answers, and *Replace this address*
retires it. The share page offers the season's own feed: games, and only what
was marked for the share link. Without the Worker set up, the copy is still
there and nothing else changes.

**Who is coming.** Parents answer *Going*, *Not going* or *Maybe* for each of
their children, on *Next up* and on each entry, with an optional note. This is
the first thing a parent writes, so the answer gets a node of its own,
`rsvp/{tid}/{item}/{pid}`, and a rule that grants that node and nothing else. It
is not inside the game, because a coach saving a game writes the whole game and
would wipe an answer given at the same moment. The coach sees names with the
unanswered at the top, answers for a family who said so another way, and on a
game's *Available* sheet can mark everyone who said no as out in one tap. A
refused answer comes back off the screen with a reason, rather than appearing to
stick. Answers never reach `public/`, not even as counts. **Locked-down clubs need
the new `rsvp` block from README pasted** before parents can answer;
`test/rules.js` checks it for every kind of account.

**Game links stop at the game.** A game link carried the season link's id, so
whoever it reached, the other team included, could open the whole season. Each
game is now published alone under its own id, and the page has no way back to a
season it does not have. Only documents whose content changed are rewritten, so
thirty fixtures do not go out on every sub. Rotating the season link replaces
every game's too, and deleting a game takes its page down. Old game links keep
working until the season link is rotated.

Also: a parent's banner no longer says they can only read, and the
`.btn.ghost` style, never used until the calendar reached for it, is gone,
because the pitch's empty spots are `.ghost` too and won.

## A calendar for the season, for everyone following the team — 2026-10-01

Games were a list a coach opened to track one. Nothing said when practice
was, and a parent wanting "where do I take her on Saturday" had to ask. Every
team now has a **Calendar** tab: games and everything else in date order,
a month with a dot per thing, and *Next up* at the top with directions and
*Add to my calendar*. Coaches, trackers and parents all get it, and anyone who
can see more than one team (a parent with daughters in two age groups, a coach,
an admin) can see them all on one calendar. *My players* now says what is next
for each child, practice included, not only the next game.

Practices and other entries live under the team (`teams/{tid}/events/{eid}`),
so the rule that already says who may change a team decides who may change its
calendar, with no new rule and nothing to paste in order. `test/rules.js` pins
that. A weekly practice is one entry per week, not a rule the app expands:
calling off one Tuesday is one write to one entry, and editing asks *just this
one* or *this and every later one*. Something called off stays on the
calendar, struck through, because a deleted practice is one a parent still
drives to.

Each entry is kept to the team unless the coach puts it on the share link.
Practices default to the team on purpose: a share link gets forwarded, and a
practice is a predictable time and place where children are, without the crowd
a match brings. The season page now shows what is coming up (games plus the
entries marked for it) with a page for each event, and everything adds to a
phone's calendar (Google, or an `.ics` file for Apple and Outlook) from the app
and from the share link alike. The file is written by a new `ics.js`, kept free
of the DOM and Firebase so the Worker on the roadmap can serve it as a feed one
day. Until then it is a copy, and both the app and the page say so.

Games carry what match day needs: home or away, arrive-by, kit, notes, and
whether it is on, postponed or cancelled. Notes are the first free text on the
share link where a name is likely ("Ella's family on snacks"), so everything new
headed for `public/` goes through `pubText()`, which swaps any roster name for
"a player" before it is written, the same matching the AI prompt uses. The coach
is told when it happens. The Games list shows when and where for a game still to
come instead of "0 min played".

**For the other team** is the first answer to "can opponents see it?": the share
sheet and the game's calendar entry copy a message for their coach (fixture,
kick-off, where, what we wear, and the game page for the live score), with
arrive-by left out because that time is ours. The game link carries the season
link's code, so they can reach the season page too, and the sheet says so.
ROADMAP has the rest of that exploration: a link scoped to one fixture, free dates
for a reschedule, and a fixture shared by two clubs, which waits for the orgs work.

The test club now has a fixture still to come, twice-weekly practice either
side of today with one called off, and a team photo on the share link, so the
calendar can be rehearsed with nothing real in it.
## Parents join a whole squad at a time — 2026-10-02

A parent could only arrive by a personal invite, made by an admin one sheet
at a time — fifteen trips through *Invite someone* for one squad, and every
team's landing on the admin. The team's **Squad** tab now has a **Parents**
card with two ways to do it in bulk:

- **One team link.** Its coach posts it in the team chat. Each parent signs in,
  types their child's shirt number, and waits; the request appears on Squad
  with the player that number matches already picked, and **Let in** is one
  tap. That is AUTH.md's "parents claim, coaches approve" path. The parent sees
  no names before she is let in, because a link in a group chat travels, and
  her phone opens the club by itself the moment she is approved. **New link**
  kills the old one.
- **A personal link per family**, for admins: one tap makes a parent invite for
  every player with no parent yet, and lists them to copy or share. Running it
  twice makes nothing new.

Approving needed one new permission, and it is narrow on purpose: a team's
coach may now put someone in `access/index`, but only someone whose request
to *her* team she has approved, with that team's id as the value the rule
checks. Before, only admins could let anybody in. README has the `joinCodes`
and `claims` blocks and the new clause; `test/rules.js` and `test/join.js`
pin both sides.

## Messages: team notices, and families talking to their coaches — 2026-10-01

Everything a club says to its parents happened somewhere else — a group chat,
a text from the coach's own number, an email chain someone was left off. The
bell in the top bar now opens **Messages**:

- **Team notices.** A team's coaches and the admins post; every family on the
  team reads. *Urgent* marks one in red. Each shows the coach **Seen by 9 of 14
  families**, with who has not, and **Email or share** opens her email app with
  every parent's address in Bcc — the one way to reach a closed phone without a
  server.
- **Family conversations.** One per family per team, with *every* coach of that
  team and the admins on it. Never a private line to one coach: that is the
  shape safeguarding policies ask for, and it means a message is not lost when
  a coach is off sick. Append-only — nobody edits or deletes a message.
- **Offline.** A message written with no signal waits in an outbox and goes
  when the connection returns, even across a reload. A refused one says *Not
  sent* and keeps its text.
- **Pop-ups** while Minutes is open, through the same path as the Live tab's
  goals, and a count on the bell until it is read.

**Notices stay on their own team.** A team's notices are readable by that
team's families, coaches and trackers and the admins — not the rest of the
club — and only a family on a team can open a conversation with its coaches.
That needed a third lookup table, `access/teamParents/{team}/{uid}`, because a
rule cannot walk the squad to find a guardian. Its value is a player id the
rule checks against that player's guardians, so nobody can put themselves on
it; parents join it when they accept an invite, and an admin's device fills it
in for everyone else on its next connect. Until it exists, the rules fall back
to club-wide, so pasting them locks nobody out. Check readiness has a line for
it.

Both live at the root (`board/`, `dm/`) with rules of their own, not under the
workspace: every indexed account reads the whole workspace, and a parent's
message about her daughter is not every other parent's business. README has
the two rule blocks — in the open set and the locked-down set — and
`test/rules.js` pins them; `test/messages.js` pins that the app asks for no
more than they allow. ROADMAP has what real push to a closed phone would take,
which is the first piece of this project that would need a server.

## Waiting people are one tap from being let in — 2026-09-27

Someone who signs in on their own lands in People with no role, and the only
thing on their row was a quiet *Roles* button — nothing said "accept". Their
row now has a **Let in** button, People says how many are waiting with a
button to show just them, and the sheet it opens asks *Let them in as*,
with Parent picked first: choose the team and the player, tap once.

## People scales past a handful of teams; invites can be found again; game details move to Plan; the pitch scrolls — 2026-09-27

**Roles.** Someone's roles sheet drew a row of Coach/Tracker chips for every
team in the club, so with a dozen teams it was a wall with the Done button
somewhere below the fold, and the Role column put one tag per team side by
side. The sheet now lists the roles the person actually holds, each with a
Remove, and a single *Give a role* form underneath: Parent, Tracker or Coach,
then the team — chips up to six, a list past that — and for a parent, which
player. The Role column says "Coach · 4 teams" instead of four tags. The
same chips-or-list picker is used for the team and player on *Invite
someone*.

That form is also the answer to "do people join as a parent and get
upgraded?": no. Somebody who signs in on their own waits with no role and
reads nothing, because a parent can read the team's names and a default
would hand that to anyone with the link. Letting them in as a parent is now
one step from People, and upgrading is the same form later. Before, a parent
could only be made from the player's page on Squad.

The handlers for these (and the old per-team Coach/Tracker toggle) now check
that whoever taps is an admin or that team's coach, rather than trusting
that the button was only drawn for them.

**Invites.** Open invites come first, each with *Copy link*, and every row
opens the invite itself: the link again (with Share and, for an emailed one,
the sign-in email again), who made it and when it runs out, and *Revoke*.
A used one says who used it, when, and whether they still hold the role,
with a shortcut to their roles; its link is not offered, because redeeming
deletes it. Used and expired invites fold behind a count. Revoking is written
to the activity log.

**Game details** (opponent, date, kick-off, venue, format, Veo link) sat at
the bottom of the Pitch tab under the bench and the sub log. They now head
the Plan tab, and *Edit this game's details* is in the game picker, so the
name in the bar reaches them from any tab.

**The pitch scrolls.** The whole pitch had `touch-action:none`, so on a
phone a thumb that landed on the grass could not scroll the page — and at
full width the pitch is taller than most screens. The grass now scrolls;
only the player tokens take the finger for a drag. Placing a picked player
on the grass moved from `pointerdown` to `click`, so a scroll that starts on
the grass does not drop her where the thumb landed. The pitch is also capped
at 70% of the screen height.

## Give a spell its position back — 2026-09-26

The fix above stops spells losing their position, but games already played
keep the blanks, and there was no way to put a position on a spell by hand.
Fix minutes now shows each spell's position under its times — any spot in
the game's shape, or a bare role — and Save spells writes it. A spell whose
position was lost reads *Position not recorded*; pick GK and those minutes
count in goal again. Changing a position never touches the minutes.

## Goalkeeper minutes stop going missing — 2026-09-26

A keeper who was in goal for 30 minutes showed as 19 at GK. Minutes by
position are read from each spell's spot, and three things wrote a spell
without one, so that time quietly stopped counting as GK — while the pitch,
which falls back to `positions` for the label, still drew her in goal, so
nothing looked wrong until the stats did:

- **Fix minutes → Save spells** rewrote every spell of that player with only
  her on and off times, even when neither had changed.
- **Start this game over at 0:00** gave everyone on the pitch a fresh spell
  with no spot.
- **A one-for-one sub** took the spot from `positions` rather than from the
  spell of the player going off. A token dragged before it had a positions
  entry carries x/y and no slot, so the keeper coming on for her inherited a
  blank. It now reads the spell, which is the invariant anyway.

All three keep the spot now, and `test/stints.js` pins each one. Games
already saved keep whatever they recorded: a spell written without a spot has
nothing to recover it from, so its minutes still count as played, just not at
any position.

## Live is the play-by-play; the old Live is now Subs — 2026-09-26

The Live tab was the coach's sub screen — who is on, who is owed, make the
change — and nobody else could use it. A parent, a tracker, or anyone who just
wanted to know how the game was going had Stats, which is tallies, not a story.
So the sub screen is now called **Subs** (nothing on it changed), and **Live**
is a new tab that reads the game back in words: the score and running clock at
the top, then kick-off with the starting lineup, each goal with the score after
it, subs, half time and full time, newest first. Shots and set pieces are under
*Everything*, because in a feed they drown out the goals. It is the one game
screen every role gets.

It is built only from what is already stored, so it needs no new data, no rule
change, and cannot disagree with the other tabs. Two readings mattered: a
paused clock closes a period just as ending a half does, and only the second is
half time; and a switch of spots is a pair of stints like a sub is, but it is
not one to anybody following.

*Notify me* follows a game on that device: each new goal, kick-off, half time
and full time buzzes and toasts, or pops up as a system notification when the
page is in the background. Only while the page is open — with no server there
is nothing to push from, and the button says so. The first look at a game only
takes note of what is there, so following at half time does not replay the
first half. Android Chrome refuses a notification made by a page, and gets the
buzz and toast instead.

A phone left on the old Live comes back to Subs, not the feed that took its
name, and opening a game still takes a coach to Subs. `test/feed.js` covers it.

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
