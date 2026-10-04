# Changelog

Newest first. Each entry says why, not just what.

This file starts here: `CLAUDE.md` has always asked for an entry per shipped
change, but the changelog itself was never in the repository, so everything
before this point lives only in the git log.

---

## Time boxes keep their colon — 2026-10-04

Editing a goal, shot, event or sub time opens a number pad, which has no colon
key, so deleting the colon left a time that no longer parsed and no way to type
it back. The time boxes now draw the colon themselves: they hold digits, the
last two are seconds (2 3 1 0 reads 23:10), and backspacing over the colon
deletes the digit before it.

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
