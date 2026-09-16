# Minutes

A sideline tracker for soccer coaches: multiple teams, rosters, planned vs actual minutes, a match clock, and a pitch you can drag players around on. Static files only — no build step, no server, no AI calls.

## What it does

- **Teams and rosters.** Any number of teams, each with its own squad. Players can be marked unavailable for a game without deleting them.
- **Match clock.** Start, pause, and end each half or quarter. Every segment is stored with a wall-clock timestamp, so two devices watching the same game show the same minute without talking to each other.
- **Minutes.** Placing a player on the pitch opens a stint; taking her off closes it. Actual minutes are derived from those stints, so the numbers survive a reload, a dead battery, or a second device joining mid-game.
- **Planned vs actual.** Set planned minutes per player per game (or split the available minutes evenly), and each player's row shows a bar filling toward her target. Amber means she is owed minutes.
- **Positions.** Drag tokens anywhere on the pitch. Tap a bench player then tap a player on the pitch to sub her in — the incoming player inherits the position.
- **Season totals.** Every player's cumulative planned vs actual across the season, sorted by who is furthest behind.
- **Player profiles.** A best position, other positions she is fine at, a *can go anywhere* switch that is on by default, a 1–5 strength rating, a longest-stint cap, a keeper flag, free-text notes, and two lists: *plays better alongside* and *keep apart from*. Pairings are stored both ways automatically, so you only set them once.
- **Shapes.** Presets for 11v11, 9v9, 7v7 and 5v5, or drag your own and save it as the team default for that side size. Empty spots show on the pitch as dashed circles you can tap to fill, and players can still be dragged anywhere off-shape — or you can pick *no shape* and place them freely.
- **Game plan.** Builds a block-by-block schedule from planned minutes, ratings, stint caps and pairings. Each block is a fixed XI; substitutions happen at the boundaries. It shows projected minutes against planned for every player, so you can see where the constraints cost someone time before kickoff. During the game the plan card shows the next change and makes those subs in one tap.
- **Live pairing check.** A banner appears if two players you marked *keep apart* end up on the pitch together.
- **Fixing mistakes.** Tap any line in the sub log to nudge it by 5, 15, 30 or 60 seconds, or type the exact time. *Add a sub* records one that happened before you tapped. *Fix minutes* opens a player's spells on the pitch and lets you edit or delete each one. *Clock reading wrong?* shifts the current half and the total together.
- **Per-game availability.** Mark players out for one game without touching their season totals.
- **Veo.** Each game has a field for the Veo link, so the recording sits next to the sub log.

## Running it

Open `index.html` in a browser, or serve the folder. Everything works immediately with data stored on that one device.

## Sharing data between your phone and hers

1. Create a Firebase project (free Spark plan is plenty) and add a **Realtime Database**.
2. Add a **Web app** to the project, then copy the config object into `firebase-config.js`.
3. In Realtime Database → Rules, paste the **open** rules to begin with:

```json
{
  "rules": {
    "workspaces": { "$code": { ".read": true, ".write": true } },
    "public": {
      "$share": {
        ".read": true,
        ".write": "!newData.exists() || newData.hasChild('team')",
        "team":  { ".validate": "newData.hasChild('name')" },
        "games": { "$g": { ".validate": "newData.hasChild('status')" } }
      }
    }
  }
}
```

Lock them down once people have signed in — see **Locking it down** below.

4. Open the app → **Setup** → *Make one up* → *Save and reload*. Enter that same workspace code on every device.

The rules above cover the coaches' data. To publish read-only pages for parents, add a second block alongside it:

```json
"public": {
  "$share": {
    ".read": true,
    ".write": "!newData.exists() || newData.hasChild('team')",
    "team":   { ".validate": "newData.hasChild('name')" },
    "games":  { "$g": { ".validate": "newData.hasChildren(['status', 'score'])" } },
    "$other": { ".validate": false }
  }
}
```

Two things that will silently reject a write if you tighten this further: a team with **no games yet** publishes without a `games` child at all, because Realtime Database drops empty objects — so never require `games`. And never add a `"$other": { ".validate": false }` catch-all: the document also contains `record` and `updated`, and a wildcard matches those too, failing the whole write.

If links are not working, open **Setup → Share with parents**. It now reports whether the last publish succeeded and shows the rejection reason if not, with a **Republish now** button.

**Write is open, and that is a known gap.** There is no authentication yet, so the only thing stopping someone who holds a link from writing to that node is the shape check above. What that check buys: a vandal cannot inject arbitrary keys or free text, only something that already looks like a scoreboard. What it does not buy: they could still post a wrong score.

Why it is tolerable for now, and only for now:

- The node is **derived**. The coaches' app rewrites it on every change, so anything tampered with is gone at the next sub.
- It contains **no names and no player ids**, so there is nothing there worth stealing.
- The real record lives under `workspaces/` and is never read by the public page.
- Share ids are long and random, so the node is not discoverable without the link.

The proper fix is the first job for authentication: make `.write` require `auth.uid` to be a coach of the team that owns the share. Anonymous auth is *not* a shortcut here — anonymous uids are per-device, so two coaches on two devices would get different ids and only one could publish, and clearing browser storage would lock a coach out of their own share.

The API key in `firebase-config.js` is not a secret; the rules above are what gate access. The long random workspace code is the shared password. Anyone who has it can read and write that workspace, which is fine for minutes and rosters — if you want real accounts later, turn on Firebase Authentication and change the rules to `"auth != null"`.

The badge in the top bar shows `synced`, `offline`, or `this device`. Writes made while offline land when the connection returns. If both devices edit the same game while one is offline, last write wins.

## Locking it down

The open rules above mean anyone holding a workspace code can read and write everything, names included. Close that once you and at least one other coach have signed in.

### Do this in order. Out of order locks you out.

1. **Back up.** Setup → *Download a copy*.
2. **Sign in** on your own device. Setup → Account.
3. **Claim admin.** Setup → People → *Make me the admin*.
4. **Have every coach sign in** with the same workspace code. They appear in Setup → People.
5. **Give each of them a role** — Coach or Tracker.
6. **Check the database.** Realtime Database → Data → `workspaces/<code>/access/index`. Every person who needs access must have a uid listed there. **If someone is missing, stop** — publishing the rules now will lock them out.
7. **Only then** paste the rules below and publish.
8. **Test on both devices** before the next game.

### The rules

```json
{
  "rules": {
    "workspaces": {
      "$code": {
        ".read": "auth != null && (!data.child('access/index').exists() || data.child('access/index/' + auth.uid).exists())",

        "access": {
          "members": {
            "$uid": { ".write": "auth != null && ($uid === auth.uid || data.parent().parent().child('index/' + auth.uid).exists())" }
          },
          "admins": {
            ".write": "auth != null && (!data.exists() || data.child(auth.uid).exists())"
          },
          "index":  { ".write": "auth != null && (!data.exists() || root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || data.child(auth.uid).exists())" },
          "teams":  { ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()" }
        },

        "teams":   { ".write": "auth != null && data.parent().child('access/index/' + auth.uid).exists()" },
        "matches": { ".write": "auth != null && data.parent().child('access/index/' + auth.uid).exists()" }
      }
    },
    "public": {
      "$share": {
        ".read": true,
        ".write": "auth != null",
        "team":  { ".validate": "newData.hasChild('name')" },
        "games": { "$g": { ".validate": "newData.hasChild('status')" } }
      }
    }
  }
}
```

What each part is doing:

- **Reading anything** needs a signed-in account listed in `access/index`. The `!data.child('access/index').exists()` clause is the bootstrap: a brand-new workspace with no index yet stays readable, so it can be set up in the first place. It stops mattering the moment the first role is granted.
- **`access/members/$uid`** is self-writable. That is how a new coach knocks on the door: they sign in, register themselves, and an admin can then see them to assign a role. It grants no data access on its own.
- **`admins`** can only be changed by an existing admin — except when there are none, which is the bootstrap for claiming it.
- **`index`** is the flat lookup the read rule uses. Rules cannot iterate, so it cannot walk every team asking whether you are in it; the app mirrors every role grant into this one node.
- **`public/$share`** stays world-readable — that is the whole point of the parent links — but writing now needs an account. That closes the hole where anyone holding a share link could overwrite the scoreboard.

### If it goes wrong

Paste the open rules from step 3 back in and publish. Access returns immediately; nothing is lost. The app also detects the refusal and shows a sign-in screen with a way to change account or workspace code rather than a broken page.

### What is still not enforced

Per-team roles. Any indexed person can currently write any team's data — the index is workspace-wide, not per-team. A tracker's restrictions are enforced in the interface only. Tightening that needs a per-team index (`access/teamIndex/{teamId}/{uid}`) and is the next step, not this one.

## Sharing with parents

Setup → **Share with parents** creates a long random share id for the team and publishes a read-only mirror. Two links come out of it:

- **Season** — `live.html?t=<share>`. Text it once. It shows the season record, whatever game is happening now, and every game played.
- **One game** — `game.html?t=<share>&g=<gameId>`. Kick-off time, venue, score, live clock, who is on, minutes played and the substitutions.

Teams can carry a crest — Setup → Teams → tap the team → *Add a crest*. It is resized to 192px and re-encoded in the browser before saving, and it shows in the app header and at the top of the shared pages. It cannot appear in the text-message preview image, which is a fixed file; that needs the Cloudflare Worker.

Both are reached from the share button beside the game bar, and both show the game you are currently looking at — switch games in the bar to share a different one. Setup is only where sharing is turned on and where links are rotated.

They are two separate HTML files purely so the text-message preview differs: `live.html` previews as *Follow the season* with `share-season.png`, `game.html` as *Match day* with `share-game.png`. Both load the same `live.js`.

**No child's name is ever published.** The mirror carries shirt numbers only — not names, not player ids. That is enforced by what gets written, not by what the page chooses to display, so there is nothing to find in the payload. *Rotate* makes a new share id and deletes the old node, which kills every link previously sent.

Link previews in text messages are scraped without running JavaScript, so each card is fixed at whatever its file's meta tags say. iMessage also freezes previews at send time, so a live-updating card in a message thread is not possible on any platform. Tapping through opens a page that does update by itself. If the score must appear in the preview itself, that needs a Cloudflare Worker to inject it server-side — see ROADMAP.md.

## Hosting on GitHub Pages

Push the folder to a repo, then Settings → Pages → deploy from branch, root. It is all static, so nothing else is needed. Add the site to the home screen on her phone and tablet for a full-screen launch.

## Data model

```
teams/{teamId}        { id, name,
                        formations: { fid: { id, name, size, slots[] } },
                        defaults:   { 11: fid, 9: fid, 7: fid, 5: fid },
                        players: { playerId: {
                          id, name, number, active,
                          rating, gk, maxStint, note,
                          preferred, canPlay[], anywhere,
                          pairs: { playerId: true }, avoid: { playerId: true } } } }
matches/{matchId}     { id, teamId, opponent, date, periodCount, periodMinutes, onFieldCount,
                        currentHalf, veoUrl,
                        periods:   { n: { half, start, end } },   // epoch ms
                        planned:   { playerId: minutes },
                        kickoff, venue,
                        formation: { name, size, slots: [ { id, label, role, x, y } ] },  // a copy
                        positions: { playerId: { x, y, slot } },  // percent of pitch
                        stints:    { stintId: { pid, on, off } },  // seconds of elapsed match time
                        out:       { playerId: true },            // unavailable for this game
                        plan:      { blockMinutes, blocks: [ { start, ids[] } ], projected } }
```

Stints are append-only events rather than running totals, which is what makes the Veo step realistic later: a timestamped sub log lines up directly with a recording's timeline, and positions over time are already the skeleton of a birds-eye reconstruction.

## Shapes are copied, never linked

When you create a game it takes a **copy** of the team's default shape for that side size. Editing or deleting a team shape afterwards has no effect on any game that already exists — last October's lineup stays exactly as it was played. The copy lives at `match.formation`, and nothing in the app ever resolves a game's shape by looking back at the team.

"Can go anywhere" is on for every new player, which means the planner treats her as a neutral fit everywhere and will not fight you over where she lines up. Turning it off, without listing positions she can play, is the only way to say "this player belongs in one place."

## How the planner decides

For each block it scores every available player by remaining planned minutes divided by remaining blocks, so whoever is furthest behind rises to the top. Rating breaks ties. A player at her stint cap is pushed to the bench for that block. Anyone in a *keep apart* pair is skipped if their counterpart is already in. When a player is picked, her partners get a scoring boost so pairings tend to land in the same block. If a block comes out much weaker than the squad average, the lowest-rated pick is swapped for the strongest eligible player on the bench. Once the XI is settled it is matched to the shape's spots by best fit: the keeper goes in goal, a player's best position beats a position she is only fine at, a player who can go anywhere is neutral, and whoever held a spot last block keeps it rather than rotating for no reason.

It is deliberately simple and readable rather than optimal — the projected-minutes list tells you what it cost. If two players can never play together, both will come in under their planned minutes, and the plan says so rather than hiding it.

## Published mirror

```
public/{shareId}     { team: { name },
                       record: { w, d, l, gf, ga },
                       games: { gameId: { opponent, date, kickoff, venue, status,
                                          score, periods, currentHalf,
                                          players: [ { n, sec, on, spot, plan } ],   // n is a shirt number
                                          goals:   [ { t, side, n } ],
                                          log:     [ { t, on, off, move, spot } ],
                                          shots } } }
```

Written by the coaches' app on a 1.2 second debounce. Read by `live.html`, which recomputes the clock from `periods` against Firebase's server time, so it ticks between pushes instead of waiting for one.

## Backup

Setup → *Download a copy* writes the whole store to JSON. *Load from a file* replaces it and pushes to Firebase.
