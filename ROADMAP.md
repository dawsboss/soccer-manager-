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

### A calendar that follows changes by itself

The calendar can be added to a phone (one entry, or everything coming up), but
only as a copy: change a kick-off and every family has to add it again. A
calendar app *subscribes* by fetching a feed URL on its own schedule, from its
own servers, and never runs our JavaScript, so a static site cannot serve one.
The Cloudflare Worker already on the roadmap could: fetch
`public/{share}.json` from the database's REST endpoint and return it as
`text/calendar`. `ics.js` was written to drop into that Worker unchanged (no DOM,
no Firebase, plain data in and text out), and every entry already carries a
stable id, so a subscribed calendar would update entries in place. Only what
the share link already publishes would be in it.

### Who is coming

The next thing a coach asks of a calendar is "who can make Saturday?". Games
already have `out/{pid}`, but only a coach writes it. Letting a parent answer
for her own child means a parent writing for the first time, which needs a
rule, keyed on the guardian list, at the depth of one child's answer:
`teams/{tid}/events/{eid}/rsvp/{pid}` (and the same for a game), writable when
`teams/{tid}/players/{pid}/guardians/{auth.uid}` exists. That is a direct
lookup, so the rule is short. Build it together with parent communication, not
before it: an answer nobody is asked for does not get given.

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

What they can see, honestly: the game link carries the season link's share id,
so whoever holds it can open the season page too, with every game and anything
a coach marked for the share link. Never names, and never anything kept to the
team, because neither is ever written to `public/`. That is why practices
default to the team only.

Three steps further, in increasing cost:

1. **A link scoped to one fixture.** Publish each game to its own
   `public/{fixtureShareId}` as well as the team's mirror, and put that id in the
   message. The opponent then holds one game and nothing else. Costs a second
   write per change and a `shareOwners` claim per fixture, and nothing in the
   rules changes. Worth doing once a club asks.
2. **Free dates for a reschedule.** The season page already shows our game days.
   A "we are free on" list (game days and practice days, as busy/free with no
   detail) would let a coach agree a new date without a back-and-forth. Needs
   nothing new in the data. It is a view over what is there.
3. **One fixture, two clubs.** When both clubs use Minutes, the fixture could be
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
