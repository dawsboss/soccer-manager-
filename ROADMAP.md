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

*Notify me* on the Live tab, and Messages (team notices and family
conversations, shipped 2026-10), only reach a phone while Minutes is open on
it. A closed phone hears nothing until the coach taps *Email or share*. Real
push needs three things, and only the last is server-side:

1. **A service worker** and a web app manifest, so the site can be added to the
   home screen. iPhones only deliver web push to a site added to the home
   screen (iOS 16.4+); Android Chrome delivers to any site.
2. **Firebase Cloud Messaging** on the client: ask permission from a tap, get a
   token, store it at `pushTokens/{uid}/{token}` (owner-only rule). Static.
3. **A sender.** A Cloud Function on `board/{code}/{tid}/{id}` and
   `dm/.../m/{id}` creates that reads who should hear (the same lists the
   rules check) and sends to their tokens. That is the first server-side code
   in the project, and Cloud Functions need the Blaze (pay-as-you-go) plan —
   pennies at one club's volume, but a card on file. A Cloudflare Worker could
   do the same job without Blaze but would need a service account key.

The data model is already shaped for it: every notice and message is one
append-only node with its sender, so a function has exactly one thing to
trigger on and nothing to diff. This is the point where "static site with a
Firebase backend only" (CLAUDE.md) stops being true — a decision for the
owner, which is why it is written down here rather than built.

### Messages, next steps

- **Game and practice notices.** A *Tell the families* button on a game's
  details that drafts the notice (opponent, kick-off, venue) — and the same for
  practices once those exist.
- **Availability replies.** "Can Ella make Saturday?" with Yes / No from the
  parent, feeding the game's existing availability list (`m.out`).
- **Parents per team in the rules.** Notices are readable club-wide today (see
  `test/rules.js`, item 5). AUTH.md's `teamMembers` index would narrow that, and
  it belongs to the orgs migration.
