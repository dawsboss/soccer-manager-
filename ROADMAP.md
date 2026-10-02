# Roadmap

`CLAUDE.md` points here for the detail behind its ordering. The ordering itself
lives there — concurrent edits, then tracker stamps and the Track rework, then
roles and organisations with "stamps become identities" as one project, then
shareable read-only pages and the Cloudflare Worker — and later items assume the
earlier ones hold. This file was missing from the repository until now; it
starts with the ideas that do not have a place in that order yet.

## Ideas, not scheduled

### Live stream with the play-by-play beside it

Stream the game and show the Live tab's feed next to the video, so someone
watching from home sees goals, subs and half time as they happen alongside the
picture. The data half already exists: every event is stored against match
seconds and the periods carry wall-clock timestamps (`absAt()` /
`secFromAbs()`), which is what lines a feed up against video.

Open questions before building it:

- **Where the video comes from.** This stays a static site with no server, so
  the stream has to live somewhere else — YouTube Live, Veo, or similar — and
  the app would embed it. Each game already has a Veo link field.
- **Who may watch.** Video of children is more sensitive than the names the
  public mirror already refuses to publish. The in-app feed shows names to
  signed-in club members; a public page with video must go through the same
  thinking as `public/` (shirt numbers, never names) and probably an
  unlisted-or-private stream.
- **Delay.** Streams run tens of seconds behind; the feed is near-instant.
  Either the feed is held back to match, or it spoils the goal before the
  picture shows it.
- **The public follow page** (`live.html`) has no feed yet. It would need events
  in the public mirror, as shirt numbers only.

### Notifications with the page closed

*Notify me* on the Live tab only works while the page is open. Real push to a
closed phone needs a push service and something server-side to send it, which
this project does not have. Worth revisiting alongside the Cloudflare Worker.

### Calendar sync, beyond the first version

Built: `worker/calendar.mjs` serves any `public/{id}` as a feed, the team's
members get a feed with practices in it, and the share page offers the season's.
What is left:

- **One address per person, not per team.** Today replacing a leaked team
  address makes every family subscribe again. Per-person feed ids would let one
  be revoked alone, at the cost of a public node per member.
- **A parent's own children only.** A parent with two daughters on two teams
  subscribes twice. One feed across her teams needs a document keyed by her,
  and the same care as above.
- **Answers in the feed.** "Ella: going" in the calendar entry would be handy,
  but answers are about named children and the feed is world-readable by
  address. Not without a feed that is not world-readable, which means the
  Worker holding a credential, which is a different project.

### Who is coming, next

Built: parents answer for their own children, at `rsvp/{tid}/{item}/{pid}`,
and the coach sees names, chases the unanswered and marks the "no"s out of a
game. Next, with parent communication rather than before it:

- **A reminder** to the families who have not answered by two days out. That
  needs a way to reach them, which is the communication work.
- **A deadline** the coach sets, after which answers close.

### Practice plans

A practice on the calendar is `teams/{tid}/events/{eid}` with `kind:
'practice'`. Session plans (drills, the focus, who is coaching) belong
*on* that entry, or keyed by its id, not in a second list of practices that
can disagree with the calendar about when practice is.

### Opponents

Explored while building the calendar. What is built today:

- **A message for their coach.** The game's share sheet and its calendar entry
  copy one: fixture, kick-off, where (with directions), what we wear, and the
  game link. Arrive-by is left out; it is our families' time.
- **The game page.** The link in that message is the page families get. When
  and where, then the live score once it starts, shirt numbers only. Their
  families can follow the score of their own child's game, which is a nice side
  effect.

What they can see: that game, by shirt number, and nothing else. (The first
version's game link carried the season link's id, which reached the whole season;
game links made then are retired by making a new season link.)

Built since: **a link scoped to one fixture.** Each game is published to its own
`public/{m.share}`, and that is the id in every game link and in the message,
so the opponent holds one game and nothing else.

Two steps further, in increasing cost:

1. **Free dates for a reschedule.** The season page already shows our game days.
   A "we are free on" list (game days and practice days, as busy/free with no
   detail) would let a coach agree a new date without a back-and-forth. Needs
   nothing new in the data. It is a view over what is there.
2. **One fixture, two clubs.** When both clubs use Minutes, the fixture could be
   one shared record both see, so a reschedule or a cancellation lands on both
   calendars, and the score is confirmed by both coaches. That is cross-club
   data with rules that answer to two sets of admins. It depends on the
   `orgs/{orgId}` model in AUTH.md, so it waits until that has happened, and
   should not be started before it.

### One calendar for the club

"All my teams" already merges every team an account can see. For an admin that
is the whole club, which is most of a field-booking view. The missing piece is
flagging two teams at the same venue at overlapping times. The venue is free text,
so "same place" needs either a list of the club's fields or a forgiving match.
Decide which when a club with shared fields asks.
