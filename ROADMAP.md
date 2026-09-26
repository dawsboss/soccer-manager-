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
