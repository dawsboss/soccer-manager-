# Replacing GotSport

Written before the code, like `AUTH.md`, `TRAINING.md` and `SESSIONS.md`, and
for the same reason: most of what follows is new data about children and
money, and the data model and the rules have to be right first. This document
says what a club would need from Minutes to stop using GotSport for everything
the state does not require, in what order to build it, and what stays open.

The owner's ask, 2026-10-06: *I kind of want to try and replace GotSport
honestly.* Asked three questions, the owner decided:

1. **Server-side code is allowed.** Payments, push and email cannot be done
   from a static site, and the owner is willing to run a server. CLAUDE.md,
   README, ROADMAP and SERVER.md were changed the same day to say so. The
   server is Cloud Functions on the club's existing Firebase project (*The
   server*, below).
2. **Registration data is protected by the database, not the screen.** Birth
   dates, medical notes and guardians' details are a different order of
   sensitivity from a shirt number. They go in nodes of their own with rules of
   their own, and the squad's names move out of a parent's reach as AUTH.md's
   *Migration* describes (*Protecting the data*, below).
3. **GotSport stays the state's system for now.** The club's state association
   registers players, issues player cards and checks background checks through
   GotSport, and a club cannot opt out of that on its own. Minutes runs
   alongside it, takes over everything the club does day to day, and makes
   moving the state's part easier later (*Living alongside GotSport*, below).
   Changing the association's mind is a later conversation, and this document
   says what it would need.

---

## Where we start

A comparison made the same day (summarised; the sources were GotSport's own
pages, state associations' onboarding pages and public reviews):

| | Minutes today | GotSport |
| --- | --- | --- |
| Match day: minutes, subs, plans, live feed, stats, recap | Deep, offline-first | Not offered |
| Practice: drills, plans, templates, what needs work | Deep | "Create practices" |
| Calendar, RSVPs, calendar feeds, messages | Yes | Yes |
| Club schedule, clashes, fields, coach time off, 1-1 sessions | Yes | Partly (league scheduling) |
| Parent privacy | Strong on screen, not yet at the database | Ordinary |
| Season registration, forms, waivers | **No** | Yes |
| Card payments, payment plans, refunds | **No** (a book of who paid) | Yes |
| Push notifications to a closed phone | **No** | Yes |
| Tryouts and evaluations | **No** | Yes |
| Coach compliance (SafeSport, background checks) | **No** | Yes, tied to the state |
| Player cards, eligibility across leagues | **No** | Yes, the state's |
| Leagues and tournaments | **No** | Yes |
| Native app | Web app | iOS and Android |

Ease of use is where Minutes can win: GotSport's main platform is reviewed as
confusing, parents most of all. That only holds if everything below stays as
plain as what is already here. Each new area gets its own screen for the
person it is for, and nobody sees a setting that is not theirs to change.

---

## What a club does in GotSport, and what replaces it

### 1. Season registration

**What people are trying to do.** An admin opens *Fall 2027* for players born
2014 to 2019, with a fee, a deadline and the club's waivers. A family follows
one link, signs in, fills the form for each child (or confirms last season's
details with one tap), agrees to the waivers and submits. The admin sees
everyone who registered, accepts or waitlists, and places each child on a
team. The coach gets a squad with names, shirt numbers, guardians and what
they need to know in an emergency, and never has to type a roster again.

**The pieces.**

| Piece | What it is | Lives in |
| --- | --- | --- |
| **Program** | One thing to register for: a season, a camp, tryouts. Name, birth years, gender, fee, payment options, opens and closes, its questions, its waivers | `reg/{code}/programs/{progId}` |
| **Program link** | What a family who is not in the club yet can read: the program's name, dates, fee and form, nothing else | `regOpen/{linkId}`, readable by id, like `invites/{id}` |
| **Registration** | One child registered for one program by one family: the child's details, guardians, answers, waivers agreed, and how it stands | `reg/{code}/forms/{progId}/{regId}` |
| **Care** | What a coach needs at the pitch: emergency contacts, allergies, conditions, medication. Copied from the registration when the child is placed | `reg/{code}/care/{tid}/{pid}` |
| **Waiver** | The text, versioned. A registration records which version was agreed, by whom, when and the name typed | `reg/{code}/waivers/{wid}/{version}` |

**How a registration stands:** `sent` (by the family), `accepted`, `waitlist`,
`declined`, `placed` (on a team), `withdrawn`. Only an admin moves it past
`sent`; a family can only withdraw her own.

**Placing a child on a team** writes the player into `teams/{tid}/players`
with what the squad already holds (name, number) and the family as a
guardian, then `syncTeamParents()` as for any guardian, and copies the care
details to `reg/{code}/care/{tid}/{pid}`. Nothing medical is ever written into
the workspace.

**The decision this forces: a child is a person, not a row in one team.**
Today a player exists only inside a team. Registration needs a club-level
record of the child that outlives a season (so next year is one tap) and that
a placement points to. That is a schema change, CLAUDE.md treats those as
high-stakes, and it belongs with the names move in *Protecting the data*: the
same work decides where a child's name lives and who may read it. Design it
there, once, before registration is built.

**Not collected at first:** birth certificates and photos. GotSport holds
them for the state, and a second copy of a birth certificate is risk for no
gain while GotSport is still the state's system. When it stops being, they go
in Firebase Storage under rules as narrow as the forms', admins only.

**Never collected:** social security numbers, insurance policy numbers, or
anything else the club does not need to run a season.

### 2. Payments

Needs the server. The club is paid, not the app.

- **Stripe, through Stripe Connect.** Each club connects its own Stripe
  account (Standard), so the money goes straight to the club, the club sees
  it in its own Stripe dashboard, and Minutes never holds money or card
  numbers. Cards are typed into Stripe's own page (Checkout), never into
  Minutes, which keeps the app out of PCI scope.
- **The amount never comes from a phone.** A family taps *Pay*; a callable
  function reads the program's fee (and any discount the admin set) from the
  database and makes the Checkout session. A phone that sends a price is
  ignored.
- **Paid means Stripe said so.** Stripe calls a webhook function, which checks
  Stripe's signature, records the event id so a repeat is a no-op, and writes
  the payment. Only the server writes `reg/{code}/paid/...`; the rules refuse
  everyone else. The registration shows *Paid* only then.
- **Payment plans** (deposit then instalments), **discounts** (siblings, early
  bird) and **financial aid** (an admin waives some or all), as the club sets
  them up.
- **Refunds are the club's.** The club takes the money, so its refund policy
  and the refund itself are the club's, done in its own Stripe dashboard.
  Minutes points families at the club and shows a refund once Stripe reports
  it (the same webhook); it has no refund screen and no refund rules of its
  own (owner, 2026-10-06).
- **What already exists moves onto it.** Training session fees and packages
  (`SESSIONS.md`, *Fees and hours*) are a book of who paid today. Once the
  till exists, a family can pay a session or a package by card the same way,
  and *cash*, *transfer* and *waived* stay for everything else.
- **The treasurer's view:** income by program, outstanding, refunds, a CSV
  for the accounts.

**Decided 2026-10-06:** each club connects its own Stripe account, and
Minutes takes no fee on payments.

### 3. Push notifications

Needs the server, and is the smallest piece that does, so it goes first and
proves the pipeline. ROADMAP, *Notifications with the page closed*, has the
whole shape: a service worker and manifest so Minutes installs to the home
screen, Firebase Cloud Messaging tokens at `pushTokens/{uid}/{token}`, and a
function that sends when a notice, a family message, a calendar change or a
followed game's goal is written, to whoever the rules already say may read
it. *Email or share* stays for whoever turned notifications off.

**Built 2026-10-07 (build 104), the first half:** team notices and family
messages. What it is, so the next jobs are built the same way:

- **The sender** is `functions/index.js` (two triggers, `pushNotice` on
  `board/{code}/{tid}/{id}` and `pushMessage` on `dm/{code}/{tid}/{fam}/m/{id}`,
  creates only) and `functions/push.js`, which holds the judgement and imports
  nothing from Firebase, so `test/push.js` runs it on the fake server
  (`makeServer()` in `test/fakebase.js`, which requires the deployed
  `index.js` with Firebase swapped out).
- **Who hears** is who the rules let read it, from the same lookup tables,
  *and* held to the squad, so a stale table entry never reaches a family the
  squad no longer names; never the author; never the rules' bridge clauses
  (a club with no `teamParents` table pushes to no family until an admin's
  phone builds it). Tested for every kind of account, the way `rules.js`
  tests the rules.
- **What it says** is the title the open app pops up, the text cut to 240
  characters, and where to open it. The tag is the message id, so a trigger
  delivered twice replaces its own notification: the push version of
  "record the event id before the effect".
- **Tokens** are `pushTokens/{uid}/{token}` (`{ at, ua }`, rules version 7),
  owner-only. A phone gives hers up on signing out (taken down while still
  signed in, then the browser's subscription deleted), and when it finds
  another account signed in; the server deletes any token Cloud Messaging
  says is gone. A push for an account no longer signed in on the phone is shown
  without its words.
- **The service worker** (`sw.js`) shows a push and opens the place it is
  about, switching club the way an alert's *Open* does. No fetch handler: it
  does not serve the app from a cache (its comment says why). With
  `manifest.webmanifest` and the icons, Minutes installs to the Home Screen,
  which is also what an iPhone needs before it delivers any push (8, below).

**Calendar changes, built 2026-10-07 (build 105):** a game or practice
called off, back on, moved or new, within the next two weeks, pushed to
everyone on that team (the admins as club activity, since build 119). The same
four things and the same silences as the open app's alerts (`calAlerts()`):
a new place or title is not news, nor a deletion, nor anything past, and a
weekly series added is one push. Five more triggers on the same sender:
`pushEntry` on `teams/{tid}/events/{eid}`, and `pushGameDate`,
`pushGameKickoff`, `pushGameCalled` on those fields of a game, never the
game itself, which a live game writes every few seconds. Two of them can
fire for one save (a new day and time), so the server keeps the last thing
it told per entry at `serverState/calSent/{code}/{key}`, a node no rule
grants anyone, and a transaction there lets one of them speak. Every
calendar write carries who made it (`edit: { by, at }`, rules version 8,
held to the writer's own uid), so the coach who called it off is left out
and named to everyone else; and a game's when and whether became the
coaches' and admins' at the database, as practices already were.

**A followed game, built 2026-10-09 (build 116):** the Live tab's *Notify
me* is stored as `follow/{code}/{mid}/{uid}` (rules version 14), and the
server sends its goals, each half starting, half time and full time to those
phones, woken by a goal created, a stretch of play created, `currentHalf` and
`ended` (and a goal's scorer added), never the game. The scorer is named as
the screen names her, by the club's setting; nothing said once the game is
over or hours old; cleared at full time.

**Club activity and training sessions, built 2026-10-09 (build 119):** a
booking changing, a session added, moved or called off, and a coach's time
off or call-out (`functions/news.js`), told to whoever the open page tells,
in its words: a family about her own child's place, a coach about families
on her sessions, the admins the club's activity, each under her own switch
('cal' for her own sessions, 'news' for club activity). The admins also hear
every team's calendar changes, and a game, practice or event deleted, from the
calendar's triggers. Step 2 is done.

### 4. Email

Needs the server. Registration received, payment receipts, *your child is on
U11 Storm*, a fee due, a waiver about to lapse, and invites sent by email
rather than by the admin's own mail app. Sent by a function through an email
provider (one with a Firebase extension, or a plain API), with the key in
Secret Manager.

### 5. Tryouts and evaluations

No server needed.

- A tryout is a program (above) with the kind `tryout`, and its sessions are
  club-wide calendar entries, as the planner already books.
- Evaluators score by bib number, never by name, on a phone at the pitch,
  offline like everything else: one record per evaluator per player at
  `reg/{code}/evals/{progId}/{regId}/{uid}`, append-only like a goal.
- Admins see the scores side by side, make offers, and a family accepts or
  declines in the app. An accepted offer is a placement (above).

### 6. Coach and volunteer compliance

No server needed for the records. The club plays under the Maryland State
Youth Soccer Association (MSYSA), which per its own pages (msysa.org, checked
2026-10-06) asks of every team and club official, through GotSport: the full
SafeSport course on first registration and the refresher every year after,
concussion training, and a background check every year, which MSYSA starts
only once SafeSport and concussion training are done. So the records Minutes
keeps are those, in that order. Each coach's SafeSport, background check,
concussion course and coaching licence, with the date done and the date it
lapses, at `staff/{code}/{uid}`, admins only (and the coach reads her own).
Admins see who lapses next and who has lapsed. The app does not run the
checks: MSYSA does, through GotSport, for now. **A lapsed or soon-to-lapse
record is flagged to the admins and to that coach, and nothing else** (owner,
2026-10-06): she is not taken off a team or a sideline, the way time off is
read and never obeyed.

### 7. Living alongside GotSport

No server needed, and it is what lets a club start without a cut-over day.

- **In:** a GotSport roster export and schedule export through the bulk
  import that already reads CSVs by their headings. Needs a real export of
  each from the owner to map the columns.
- **Out:** registrations in the shape GotSport's import accepts, so the
  registrar uploads the season to the state rather than typing it twice.
  Needs GotSport's import template.
- **On the player:** whether she is registered with the state, and her card
  number, typed or imported, so a coach can see who is not cleared to play.

### 8. Installing it like an app

The service worker and manifest from push (3) make Minutes installable from
the browser on both iPhone and Android, with its icon and no address bar. A
store listing (a thin wrapper such as Capacitor) is only worth it if clubs ask
for it; it does nothing the installed web app cannot.

### Later: leagues, tournaments, and the state's part

Not planned until someone needs them, because each is a product of its own:

- **Leagues:** fixtures across clubs, results entered by both sides,
  standings. Starts from ROADMAP, *Opponents*, and needs a fixture two clubs
  share, which is one of the reasons AUTH.md gives for the orgs move.
- **Tournaments:** team applications, brackets, a schedule over a weekend's
  fields, referee assignment.
- **What the association would need** before moving its part off GotSport:
  player cards and eligibility across clubs, background checks through a
  screening vendor it contracts with, SafeSport records it can audit, its
  own admins across every club, exports for US Youth Soccer or US Club
  Soccer, and someone to call when it breaks. That is a conversation to have
  once a few clubs run everything else on Minutes.

---

## The server

- **What it is:** Firebase Cloud Functions on the same project as the
  database, in `functions/`, deployed by `.github/workflows/server.yml`. It needs Firebase's pay-as-you-go plan; at one club's volume
  the cost is expected to be small. Check current pricing before telling a
  club a number.
- **What stays the same:** the phone is offline-first and nothing at the
  sideline waits on the server. The outbox, the local copies and the rules
  are unchanged. The server does the jobs that belong to nobody in
  particular, plus the few that need a secret.
- **It bypasses the rules,** because it writes with admin credentials. So
  every function that acts for a caller checks who the caller is against
  the same lookup tables the rules read, and is tested the way `rules.js`
  tests the rules: for every kind of account, against the fake Firebase.
- **Secrets** (Stripe, email) live in Secret Manager. Never in the repo, never
  in `firebase-config.js`.
- **Webhooks are idempotent:** the event id is recorded before the effect.
- **SERVER.md is the list of what moves next.** Each job there that a phone
  does on someone else's behalf can move to a function once the server
  exists. Move them one at a time, each with its test, rather than in one
  rewrite.
- **Still no AI.** Neither the app nor the server calls an AI model.
- **One server.** The calendar feed was a Cloudflare Worker; it moved into
  `functions/` in build 104 (the owner, 2026-10-07: no Cloudflare account,
  one deploy). It still reads only `public/` and writes nothing.
- **Deploying:** `.github/workflows/server.yml` tests and deploys
  `functions/` on every merge to main, as the site deploys itself, with a
  service account key held as a GitHub secret. The rules publish the same
  way when `database.rules.json` changes (the owner, 2026-10-07), after
  `rules.js` passes and checked live afterwards (README, *Deploying the
  server*).

---

## Protecting the data

- **Nothing in this document goes under `workspaces/{code}`.** Everyone
  indexed reads the whole workspace, so a medical note there would be on
  every parent's phone. `reg/`, `staff/` and `pushTokens/` are root nodes
  with rules of their own, the way `dm/` and `training/{code}/fees` already
  are.
- **Who reads what:**

  | | Family | Team's coaches | Admins | Anyone else |
  | --- | --- | --- | --- | --- |
  | Program link | Yes, by id | Yes | Yes | By id only |
  | Registration | Her own | No | Yes | No |
  | Care | Her own child's | Their team's players, once placed | Yes | No |
  | Payments | Her own | No | Yes | No |
  | Evaluations | No | No | Yes; an evaluator her own | No |
  | Compliance | No | Her own | Yes | No |

  There is no separate registrar role: registration is admins' (owner,
  2026-10-06).
- **The squad's names move out of a parent's reach** (decision 2, above).
  AUTH.md, *Migration*, says a squad node readable only by a team's coaches,
  trackers and admins is the only way to make *other players by shirt
  number* the database's choice rather than the screen's. Registration
  brings every family in the club onto the app, so this is done before
  registration opens to families. Either the full `orgs/{orgId}` move or
  only the squad node is fine; the design picks one, on the sandbox club
  first, between seasons, and writes it into AUTH.md.
- **Waivers are append-only.** An agreement is never edited; a new version of
  the text asks again.
- **Nothing here reaches `public/`,** not even as counts. `test/stats.js` and
  `test/calendar.js` already stringify the mirror; new suites do the same
  with a medical note and a guardian's phone number typed into every field.
- **Backups:** *Download a copy* includes registrations only on an admin's
  phone, and says that it contains medical details before it saves.
- **How long it is kept** (owner, 2026-10-06): **for good, until the family
  deletes it or the account is deleted.** Seasons pile up as history; nothing
  expires on a timer. A family's *Delete* on a registration removes it, its
  care copy and its evaluations; deleting the account removes every
  registration, care copy and payment record of that account in every club.
  Deleting an account is a function (an Auth delete trigger), because it
  reaches into clubs the phone is not open on. What a delete takes with it
  is the club's copy of that family's waiver agreement and payment history
  in Minutes; Stripe keeps its own record of the payment in the club's
  account. The screen says so before the family confirms.

---

## Build order

Each step is usable on its own, and each later step assumes the earlier ones
hold.

1. **This document**, and CLAUDE.md, README, ROADMAP and SERVER.md updated to
   say there is a server. *Done 2026-10-06.*
2. **The server, with push as its first job.** `functions/`, the deploy
   steps in README, a test rig for functions on the fake Firebase, the
   service worker and manifest, and the push sender. Small, and it fixes the
   biggest everyday gap families have. *Built 2026-10-07 for notices and
   family messages (build 104, Push notifications above), calendar changes
   (build 105), a followed game (build 116), and club activity and
   training sessions (build 119). Done.*
3. **Names behind the database, and the child as a club-level person.** One
   design, written into AUTH.md before the code (*Protecting the data* and
   *Season registration* above). *The names half built 2026-10-08 (build
   110): the move to `orgs/{orgId}` (AUTH.md), and every club has moved
   (2026-10-09). The club-level record of each child is left, for
   registration.*
4. **Registration, without payment.** Programs, the link, the form, waivers,
   accepting and placing, care details for coaches, the GotSport export,
   a family's *Delete*, and the account-delete function. Families can pay
   the old way meanwhile, recorded as now.
5. **Payments.** Stripe Connect, Checkout, the webhook (payments and the
   club's refunds), plans, discounts, the treasurer's view; session fees and packages onto the same
   till.
6. **Email.**
7. **Tryouts and evaluations.**
8. **Coach compliance records.**
9. **GotSport import of rosters and schedules,** whenever the owner has real
   export files to map; it can move earlier if a club needs it to start.

Later, and only on demand: leagues, tournaments, the state's part.

## The owner's answers (2026-10-06, second round)

- **Stripe:** each club connects its own account; Minutes takes no fee.
- **Registrar role:** none. Registration is admins'.
- **Keeping data:** for good, until the family deletes it or the account is
  deleted (*Protecting the data*).
- **GotSport files:** later. The import (step 9) waits for them.
- **State association:** Maryland (MSYSA), which runs registration,
  SafeSport, concussion training and background checks through GotSport.
- **Refunds:** the club's policy and the club's doing, in its own Stripe
  account (*Payments*).
- **Lapsed compliance:** flagged to the admins and that coach, nothing more.

Still open: a real GotSport roster export, schedule export and registration
import template, when the owner has them.
