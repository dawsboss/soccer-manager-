# Replacing GotSport

Written before the code, like `AUTH.md`, `TRAINING.md` and `SESSIONS.md`, and
for the same reason: most of what follows is new data about children and
money, and the data model and the rules have to be right first. This document
says what a club would need from TeamPlayHQ to stop using GotSport for everything
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
   GotSport, and a club cannot opt out of that on its own. TeamPlayHQ runs
   alongside it, takes over everything the club does day to day, and makes
   moving the state's part easier later (*Living alongside GotSport*, below).
   Changing the association's mind is a later conversation, and this document
   says what it would need.

---

## Where we start

A comparison made the same day (summarised; the sources were GotSport's own
pages, state associations' onboarding pages and public reviews):

| | TeamPlayHQ today | GotSport |
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

Ease of use is where TeamPlayHQ can win: GotSport's main platform is reviewed as
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
  it in its own Stripe dashboard, and TeamPlayHQ never holds money or card
  numbers. Cards are typed into Stripe's own page (Checkout), never into
  TeamPlayHQ, which keeps the app out of PCI scope.
- **The amount never comes from a phone.** A family taps *Pay*; a callable
  function reads the program's fee (and any discount the admin set) from the
  database and makes the Checkout session. A phone that sends a price is
  ignored.
- **Paid means Stripe said so.** Stripe calls a webhook function, which checks
  Stripe's signature, records the event id so a repeat is a no-op, and writes
  the payment. Only the server writes payments (`orgs/{code}/payments`,
  *Payments, designed before any code*, below); the rules refuse everyone
  else. The registration shows *Paid* only then.
- **Payment plans** (deposit then instalments), **discounts** (siblings, early
  bird) and **financial aid** (an admin waives some or all), as the club sets
  them up.
- **Refunds are the club's.** The club takes the money, so its refund policy
  and the refund itself are the club's, done in its own Stripe dashboard.
  TeamPlayHQ points families at the club and shows a refund once Stripe reports
  it (the same webhook); it has no refund screen and no refund rules of its
  own (owner, 2026-10-06).
- **What already exists moves onto it.** Training session fees and packages
  (`SESSIONS.md`, *Fees and hours*) are a book of who paid today. Once the
  till exists, a family can pay a session or a package by card the same way,
  and *cash*, *transfer* and *waived* stay for everything else.
- **The treasurer's view:** income by program, outstanding, refunds, a CSV
  for the accounts.

**Decided 2026-10-06:** each club connects its own Stripe account, and
TeamPlayHQ takes no fee on payments.

### 3. Push notifications

Needs the server, and is the smallest piece that does, so it goes first and
proves the pipeline. ROADMAP, *Notifications with the page closed*, has the
whole shape: a service worker and manifest so TeamPlayHQ installs to the home
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
  `manifest.webmanifest` and the icons, TeamPlayHQ installs to the Home Screen,
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
only once SafeSport and concussion training are done. So the records TeamPlayHQ
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

The service worker and manifest from push (3) make TeamPlayHQ installable from
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
  once a few clubs run everything else on TeamPlayHQ.

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
  in TeamPlayHQ; Stripe keeps its own record of the payment in the club's
  account. The screen says so before the family confirms.

---

## Payments, designed before any code

Written 2026-10-11, before any code, for build order step 5, the way
registration was designed in AUTH.md before step 4: this is new data about
money, the rules have to be right first, and a mistake here costs a family
twice or a club its income. Section 2 above says what was already decided;
this says how.

The owner's ask, 2026-10-11: *Payments, the next phase now that registration
is done. Stripe Connect, with each club connecting its own Stripe account,
and TeamPlayHQ takes no fee; checkout on the registration form; the webhook
that records payments and refunds; payment plans and discounts; a
treasurer's view; session fees and packages moved onto the same till.*

### What does not change

- **TeamPlayHQ never holds money or card numbers.** A card is typed into
  Stripe's own page (Checkout), on the club's own Stripe account, so the app
  stays out of PCI scope and the money never passes through anyone but the
  club.
- **The amount never comes from a phone.** A family's phone says *what* she
  is paying for (this registration, this session, this package, and which
  payment plan or discount code she chose); the server works out the price
  from the program, the session or the package and the club's discounts.
  An admin's phone sets prices, as it sets a program's fee today, and the
  server reads them from the database, never from the ask.
- **Paid means Stripe said so.** Only the webhook, after checking Stripe's
  signature, writes a card payment. The phone coming back from Checkout
  says *Waiting for the club's confirmation* until it has.
- **Nothing at the sideline waits on it.** Paying needs a signal and says
  so; nothing about a game, a practice or the register depends on whether
  anyone has paid. A child who owes is never taken off a team or a session
  by the app (as with lapsed compliance: read, never obeyed).
- **Refunds and disputes are the club's,** done in its own Stripe dashboard
  (owner, 2026-10-06). The app records them from the webhook and shows them;
  it has no refund button.
- **Cash, cheque, transfer and waived stay.** Cards are one more way to pay,
  never the only one, and a club that never connects Stripe keeps today's
  book of who paid, unchanged.
- **The server keeps its secrets in Secret Manager** and takes no fee: no
  `application_fee_amount` on any charge.

### Stripe, as the platform sees it

- **One platform account, TeamPlayHQ's,** with Connect turned on. Each club
  is a **Standard** connected account: the club signs in to Stripe itself,
  owns its dashboard, its payouts, its refunds and its disputes, and pays
  Stripe's processing fee out of each payment. A club that already uses
  Stripe signs in with its existing login.
- **Direct charges.** Every Checkout session and every instalment is made
  *on the club's account* (Stripe's `Stripe-Account` header), so the
  payment, the customer and the saved card are the club's, the receipt comes
  from the club, and a negative balance or a lost dispute is the club's,
  never the platform's.
- **Connecting** is Stripe's own onboarding (an Account Link): the club's
  owner taps *Connect Stripe* on Club → Money; the server makes the club's
  Standard account the first time and an onboarding link each time; Stripe
  sends her back to `teamplayhq.com/?till=…`, read the way `?invite=` is.
  Whether the club can take cards is Stripe's `account.updated` event
  (`charges_enabled`), never the return trip. A club that disconnects in its
  own Stripe dashboard (`account.application.deauthorized`) stops taking
  cards at once; what it was paid stays recorded.
- **Test mode for test clubs.** A club whose code starts `test-` uses the
  platform's test keys and test connected accounts, so the sandbox can be
  paid with Stripe's test cards end to end; every other club uses live keys.
  The webhook carries `livemode`, and an event whose mode is not its club's
  is refused.
- **No Stripe library.** `functions/stripe.js` is a small client over
  Stripe's HTTP API (form-encoded requests, the signature check done with
  Node's `crypto`), handed to the money code the way `mail.js` is handed its
  mailer, so `test/pay.js` runs on a fake Stripe and the suites still never
  need `npm install`. Every request that makes something carries an
  idempotency key made from the ask's id, so an ask answered twice makes
  one Checkout session, one customer, one charge.

### The data

Amounts are whole cents (an integer, never a float) in the club's Stripe
currency. A program's `fee` and a session's `price` stay as they are (the
admin types dollars); the server turns them into cents when it makes a bill.

```
orgs/{code}/till: { on, cur }            // server only; everyone in the club reads it:
                                         // whether to draw Pay, and in what currency
orgs/{code}/stripe: {                    // server only; admins read it
  acct, live, ready, due: [..],          // Stripe's account id; what Stripe still needs from the club
  name, at
}
orgs/{code}/bills/{cid}/{bid}: {         // server only; her family and the admins read it
  id, kind: 'reg' | 'session' | 'pack' | 'other',
  prog? | sid? | pack?, tid?,            // what it is for
  name,                                  // in words: 'Fall 2027', '1-1 with Sam, 14 Oct'
  price,                                 // what the program, session or package cost when billed
  less: { {did}: { why: 'sibling' | 'early' | 'code' | 'aid', amount, words } },
  total,                                 // price less every `less`
  plan?: { id, parts: { {n}: { amount, on, st: 'due' | 'paid' | 'failed' | 'off' } } },
  paid, refunded, owed,                  // kept by the server from payments, never added up on a phone
  st: 'open' | 'part' | 'paid' | 'over' | 'off',   // over: paid more than owed; off: no longer owed
  fam, at, by                            // the family it was made for
}
orgs/{code}/payments/{cid}/{payId}: {    // server only; her family and the admins read it
  bill, part?, amount, how: 'card' | 'cash' | 'cheque' | 'transfer' | 'other',
  at, by,                                // `by` is 'stripe' for a card
  stripe?: { pi, ch, cs?, fee? },        // ids in the club's own account; Stripe's fee once known
  refunds?: { {reid}: { amount, at } },
  disputed?: { at, st }
}
orgs/{code}/discounts/{progId}: {        // admins only: a code typed by a family is checked by the server
  codes: { {CODE}: { amount | pct, until?, uses?, used } }
}
payAsks/{code}/{uid}/{id}: { op, ..., at }   // hers to create and delete, as mailAsks; answered beside
serverState/stripe/acct/{acct}: code         // which club an event is about
serverState/stripe/events/{evt}: at          // recorded before the effect
serverState/stripe/cus/{code}/{uid}: cus     // her customer on the club's account (a saved card)
```

- **A bill is what one child's family owes for one thing**, keyed by the
  child, so a family reads her own by path (she knows her children) and an
  admin reads them all; coaches read none (*Who reads what*, above). It is
  the server's alone to write, which is what lets `paid`, `refunded` and
  `owed` be trusted: one writer, from the payments.
- **A payment is money that arrived**, by card from the webhook or recorded
  by an admin as cash, cheque or transfer. Never changed, except that
  refunds and a dispute are added to it.
- **Under the club, not at the root.** On `orgs/` each part has its own
  readers already, as registration found (`regs`, `care`), so bills and
  payments sit beside them with narrow reads. Nothing about money reaches
  `public/`, a squad, a game, a push's words or a coach's screen.
- **The program grows** (admins write it, as now): `pay: 'form' | 'accepted'`
  (when it is paid, decision 1 below), `other: true` (families may pay the
  club another way), `plans: { {id}: { name, parts: [ { pct, on } ] } }`,
  `sibling: { 2: amount, 3: amount }`, `early: { until, amount }`. The
  link (`regOpen/{id}`) carries the same in words, plus `till.on`, so a
  family not yet in the club sees the price, the plans and the discounts
  before she starts. Codes never go in the link or the program: anyone in
  the club reads a program.

### Asking the server: `payAsks`

The phone asks and the server answers beside the ask, as `mailAsks` and
`bookAsks` do. The rule lets a signed-in uid create her own ask and delete
it, nothing more; everything else is checked by the server, because a family
registering through a link is not in the club's index yet.

| `op` | Who may | What it does |
| --- | --- | --- |
| `connect` | The club owner | Makes the club's Stripe account if it has none; answers with an onboarding link |
| `dash` | Admins | Answers with a sign-in link to the club's Stripe dashboard |
| `checkout` | A family of each child named | For one or more bills (or a registration, session or package that has none yet: the server makes the bill first), with her plan and code; answers with a Checkout link |
| `card` | A family on a plan | A Checkout link to change the saved card (setup mode) |
| `record` | Admins | Records cash, cheque, transfer or other against a bill (the amount is the admin's, as a fee is) |
| `aid` | Admins | Takes an amount off a bill, with a note only admins see |
| `cancel` | Admins | Marks a bill no longer owed (`off`), stopping any plan |

Each answer is `{ url }`, `{ ok }` or `{ no: why }` in words the screen
shows. An ask older than ten minutes is not acted on, as every ask.

### Paying a registration

**Where.** On the form (`#/reg/{link}`), after the waivers, a family whose
club takes cards sees what she owes for each child: the fee, each discount
in words, the total, the plans if the program has them, a box for a code,
and **Pay now** (or **Pay the first part**). If the program allows paying
the club another way, **Pay the club another way** sends the registration
with the bill open. The same bill is on My players afterwards, with **Pay**,
until it is paid.

**When the bill is made.** When the registration becomes `sent` (or
`accepted`, decision 1), the server makes the bill from the program as it
stands then: price, sibling and early-bird discounts (early by the server's
clock at `sent`), and nothing a phone said about money. The family's code is
applied when she pays and checked against `discounts/{progId}` then. A
program whose fee changes later does not change a bill already made; an
admin cancels it and the server makes another, or takes something off.

**Checkout.** The server makes a Checkout session on the club's account:
one line per bill, the club's name and the child's first name in the
description and nothing else about her, `metadata: { code, cid, bill, part }`,
a receipt to the family's email from the club's account (Stripe sends it,
so this needs no email step), back to `teamplayhq.com/?paid={session}` or
`?unpaid=…`. An earlier open session for the same bill is expired first, so
two tabs never take the same fee twice; a family who pays twice anyway
leaves the bill `over`, which the admins are told to refund.

**What she sees after.** *Payment received* only once the webhook has
written the payment; until then *Waiting for the club's confirmation*, then
*Paid* on the registration and the bill. Admins see paid, part-paid and owed
on each row of Registrations.

**A registration withdrawn or declined** with money paid: the bill becomes
`off`, any plan's later parts `off` (never charged), and the admins see
*Paid $X, refund it in Stripe* until the refund comes back through the
webhook. The app never refunds by itself.

### Payment plans

A program offers plans as dates and shares, *50% now, 25% on 1 September,
25% on 1 October*. The first part is paid at Checkout, which also saves
the card on the club's account for the rest (with the plan's dates and
amounts on the page, as the family's agreement to them). On each date,
`payDue` (daily, a schedule like `myCalBuild`) charges the saved card
off-session on the club's account, one charge per part, with an
idempotency key per part, so a run that dies half-way never charges twice.

- **A part that fails** (a declined card, a card that needs her there) is
  `failed`; the family is told (push, and email once step 6 is built) with
  **Pay now** on the bill, which is Checkout for that part; the server tries
  the saved card once more three days later; the admins see it on Money.
- **Paying the rest early** is **Pay what's left** on the bill: the later
  parts become one Checkout and are marked paid.
- **Changing the card** is the `card` ask, Stripe's own page again.
- **Cancelled, withdrawn or declined** stops every later part.

### Discounts and financial aid

- **Sibling:** the second and third child of the same family in the same
  program, by amount, applied when the later child's bill is made.
- **Early bird:** an amount off a registration sent before a date.
- **Codes:** typed by the family on the form, checked by the server against
  `discounts/{progId}` (admins only), each with an amount or a percentage,
  an end date and a number of uses the server counts in a transaction.
- **Financial aid** is an admin's `aid` on a bill, any amount up to what is
  owed, with a note families never see. A program can ask *Would you like
  to talk to the club about financial aid?* with the questions it already
  has, and a yes lets her send the registration with the bill open.

Every discount is a line on the bill in words, so a family sees exactly why
she owes what she owes.

### Session fees and packages on the same till

- **A session place** owes its price once it is `in` (SESSIONS.md, *Fees
  and hours*), worked out on the phone as now. **Pay** beside each owed
  place on her child's sessions, or **Pay all** for every one, is a
  `checkout` naming the sessions; the server checks each place is `in`,
  not called off and not paid, makes a bill per place and one Checkout for
  all of them. The webhook writes the payment and the place's fee record
  (`training/{code}/fees/{sid}/{pid}`, `how: 'card'`, `pay` naming the
  payment), so the coach's screens and hours are unchanged.
- **A package** an admin makes for a player can be left unpaid with **Ask
  the family to pay**: the family sees it on My players with **Pay**, and the
  webhook writes the package's `paid` and `how: 'card'`. Families buying a
  package from a list themselves is decision 8.
- **The book stays.** A coach marking a place paid in cash, offline, writes
  the fee record as today; the treasurer's view reads that book beside the
  till.

### The webhook

`stripeHook`, an HTTPS function like `calendar`, is the one endpoint Stripe
calls, for the platform's Connect events from every club:

1. Check the `Stripe-Signature` header against the raw body with the
   webhook secret (test or live), within five minutes; anything else is a
   400 and nothing is read.
2. Find the club from the event's `account` (`serverState/stripe/acct`); an
   account no club has, or a mode that is not the club's, is a 200 and
   nothing done.
3. Record the event id at `serverState/stripe/events/{id}` in a transaction;
   if it was there, a 200 and nothing done. Only then the effect, and if
   the effect fails the record is taken off so Stripe's retry does it.
4. The effect, written in one update per club:

| Event | What is written |
| --- | --- |
| `checkout.session.completed` (paid) | A payment per bill, the bills' totals, a plan's first part, the saved card's customer |
| `payment_intent.succeeded` (an instalment) | The payment and the part `paid` |
| `payment_intent.payment_failed` | The part `failed`; the family and the admins told |
| `charge.refunded`, `refund.updated` | The refund on its payment, the bill's `refunded` and `owed` |
| `charge.dispute.created`, `.closed` | `disputed` on the payment; the admins told to answer in Stripe |
| `account.updated` | `stripe/ready`, `due`, and `till/on` |
| `account.application.deauthorized` | `till/on` off; the account forgotten; payments kept |

The metadata on a Checkout session or instalment is the server's own, and is
checked against the club the account belongs to before it is believed.
A payment for a bill that has gone (a registration deleted meanwhile) is
still recorded, against the child, for the admins to refund.

### The treasurer's view

Club → **Money**, admins only (decision 5):

- **Stripe:** connected or not, what Stripe still needs, test or live,
  *Open Stripe* (the `dash` ask) for payouts, refunds and disputes.
- **By program and by month:** billed, discounts and aid, paid by card,
  paid another way, refunded, still owed; session fees and packages beside
  registrations, from the till and the book.
- **Who owes:** each family's open bills, oldest first, the next part due,
  failed parts first; **Record a payment**, **Take something off**,
  **Cancel** on each.
- **To do:** paid on a withdrawn or declined registration (refund in
  Stripe), paid twice, disputes open.
- **Download for the accounts:** a CSV, one row per payment or refund:
  date, child, family, what for, how, amount, Stripe's fee where known,
  Stripe's id; a cell a spreadsheet would run as a formula made text, as
  the GotSport export does. Payouts and bank reconciliation stay in Stripe.

### Who reads what

| | Family | Team's coaches | Session's coach | Admins | Club owner |
| --- | --- | --- | --- | --- | --- |
| `till` (on, currency) | Yes | Yes | Yes | Yes | Yes |
| `stripe` (account) | No | No | No | Yes | Yes |
| Bills, payments | Her own children's | No | No | Yes | Yes |
| Session fee records | Her own (as now) | No | Her sessions' (as now) | Yes | Yes |
| Discount codes | No | No | No | Yes | Yes |
| Connect or disconnect | No | No | No | No | Yes |

### Deleting

A family deleting a registration takes its bill with it only while nothing
was paid; a bill with a payment stays, with the registration gone, for the
admins. Deleting an account (`forgetMe`) is decision 7.

### Before any of this is built: the platform's Stripe account

The owner does these once, in test mode first:

1. **Make TeamPlayHQ's Stripe account** (stripe.com), as the business that
   runs TeamPlayHQ, and verify it. It takes no money, but Stripe still has
   to know who runs the platform before live clubs can connect.
2. **Turn on Connect**, as a platform, with **Standard** accounts. Fill in
   the platform profile (what TeamPlayHQ does, that clubs are paid
   directly, no platform fee) and the branding clubs see when they
   connect: the name, the icon, the colour.
3. **The keys and the webhook,** test and live: the secret key (a
   restricted key with Connect, Checkout, Customers, Payment Intents and
   Account Links is better than the full one) and a Connect webhook
   endpoint at the `stripeHook` function's address, for the events above,
   whose signing secret is the other half. All four go into Secret Manager
   (`STRIPE_KEY`, `STRIPE_HOOK`, `STRIPE_TEST_KEY`, `STRIPE_TEST_HOOK`;
   README will say how), never into the repo.
4. **Privacy policy and terms** (`privacy.html`, `terms.html`) both say
   today that TeamPlayHQ takes no payments. They change with step 1 below:
   Stripe processes cards for the club, on the club's account.

### Order

Each its own build, rules version, CHANGELOG entry and test pass. New
suites: `test/pay.js` (the server on a fake Stripe: every ask for every kind
of account, the webhook's signature, a repeated event, each event's effect,
`payDue`), and `test/till.js` (the phone: Pay drawn only where the club takes
cards and only for her own, no amount in any ask, the return trip, Money for
admins only, the CSV).

1. **The till:** `functions/stripe.js`, connecting (`connect`, `dash`),
   `stripeHook` with `account.*` only, `till` and `stripe`, test mode for
   `test-` clubs, Club → Money showing the connection, `payAsks` and its
   rules, the privacy policy and terms.
2. **A registration paid in full:** bills made by the server, Checkout on
   the form and on My players, the webhook writing payments and refunds,
   `record` and `cancel`, *Paid* on Registrations.
3. **Discounts and aid.**
4. **Payment plans:** saved cards, `payDue`, failed parts.
5. **The treasurer's view** and its CSV.
6. **Session fees and packages** on the till.

### Decisions for the owner

Recommended answers in bold.

1. **When a registration is paid:** **on the form, as it is sent**, with a
   program able to say *once accepted* instead (tryouts, or a program that
   will have a waiting list, where taking money and refunding it costs the
   club Stripe's fee); or always once accepted.
2. **Paying the club another way:** **a program allows it unless the admin
   turns it off**; or cards only once a club connects.
3. **Stripe's processing fee:** **the club's, out of each payment**, as with
   any card terminal; or added to what the family pays, which some states
   restrict and families notice.
4. **Who connects and disconnects Stripe:** **the club owner**
   (`access/owners`), since it decides where the club's money goes; or any
   admin.
5. **A treasurer:** **admins only**, as registration has no registrar; or a
   treasurer role that sees Money and nothing else of the admins'.
6. **Instalments:** **the server charges the saved card on each date**; or
   the family is reminded and pays each part herself, which fails more
   often and needs no saved card.
7. **An account deleted with payments on record:** **the payments stay,
   with the amount, date and what they were for, but no family or child**,
   so the club's books still add up (Stripe keeps its own full record); or
   deleted with the account, as *Protecting the data* decided before there
   were payments to account for.
8. **Packages:** **an admin makes one and the family pays it**; or families
   also buy a package themselves from a list the admins keep.
9. **Sibling discounts:** **within one program**; or across every program in
   the same season, which needs a season to be a thing programs share.

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
   (2026-10-09). The club-level record of each child is designed in
   AUTH.md, *A child in the club, and registration* (2026-10-09), with
   registration itself, before any code.*
4. **Registration, without payment.** Programs, the link, the form, waivers,
   accepting and placing, care details for coaches, the GotSport export,
   a family's *Delete*, and the account-delete function. Families can pay
   the old way meanwhile, recorded as now.
   *Designed 2026-10-09 in AUTH.md, *A child in the club, and registration*,
   in six steps of its own. Two things moved from what this document says
   above: everything lives under `orgs/{code}/` (`children`, `care`,
   `teamCare`, `programs`, `waivers`, `regs`) rather than a `reg/{code}` root,
   because on `orgs/` each part already has its own readers; and only the
   program link is at the root (`regOpen/{linkId}`), with each family's list
   of her children (`families/{uid}`). A child can be in the club on no team,
   for training sessions, and a coach or an admin can register a child for a
   family, who confirms it when she joins. Built 2026-10-09, all six
   steps: the child's record (build 122), care details (123), programs,
   the link, the form and waivers (124), placing and sessions for a child on
   no team (125), the GotSport export (126) and deleting (127).*
5. **Payments.** Stripe Connect, Checkout, the webhook (payments and the
   club's refunds), plans, discounts, the treasurer's view; session fees and packages onto the same
   till.
   *Designed 2026-10-11 in *Payments, designed before any code*, above,
   in six steps of its own, with nine decisions for the owner. Needs the
   platform's Stripe account first.*
6. **Email.**
7. **Tryouts and evaluations.**
8. **Coach compliance records.**
9. **GotSport import of rosters and schedules,** whenever the owner has real
   export files to map; it can move earlier if a club needs it to start.

Later, and only on demand: leagues, tournaments, the state's part.

## The owner's answers (2026-10-06, second round)

- **Stripe:** each club connects its own account; TeamPlayHQ takes no fee.
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
