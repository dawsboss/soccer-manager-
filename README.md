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
3. In Realtime Database → Rules, paste:

```json
{
  "rules": {
    "workspaces": {
      "$code": {
        ".read": "$code.length > 20",
        ".write": "$code.length > 20"
      }
    }
  }
}
```

4. Open the app → **Setup** → *Make one up* → *Save and reload*. Enter that same workspace code on every device.

The API key in `firebase-config.js` is not a secret; the rules above are what gate access. The long random workspace code is the shared password. Anyone who has it can read and write that workspace, which is fine for minutes and rosters — if you want real accounts later, turn on Firebase Authentication and change the rules to `"auth != null"`.

The badge in the top bar shows `synced`, `offline`, or `this device`. Writes made while offline land when the connection returns. If both devices edit the same game while one is offline, last write wins.

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

## Backup

Setup → *Download a copy* writes the whole store to JSON. *Load from a file* replaces it and pushes to Firebase.
