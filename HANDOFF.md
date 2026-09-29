# Handoff: a game tracked offline is lost when the phone reconnects

Written 2026-09-29 to start a fresh conversation. It is current for this branch
(`claude/offline-merge-on-reconnect`, cut from `main` at `c42ce35`). Delete this
file in the commit that ships the fix.

**This is a design conversation first, code second.** The fix changes the sync
model, which `CLAUDE.md` treats as high-stakes. Agree the rules below with the
user before writing any code.

## Opening prompt for the new chat

> Read `HANDOFF.md`, `CLAUDE.md` and `ROADMAP.md`. We're fixing the pinned gap
> where the connect-time workspace read replaces local state wholesale and
> drops a game tracked offline. Don't write code yet: walk me through the
> questions under "Decisions to make" with your recommendation for each, and
> we'll agree them before you start.

## The bug

`initSync()` → `wireBase()` in `app.js` (line 479 on `main`) does one full read
of `workspaces/{code}` when the phone connects, then attaches per-child
listeners. On that first read, line 485 does:

```js
state = { teams: v.teams || {}, matches: v.matches || {}, access: v.access || {} };
```

then `saveLocal()`. Anything that exists only on this phone is gone from memory
*and* from disk.

When it bites: a coach tracks a whole game at a field with no signal, the page
is reloaded or the phone restarts before it reconnects (so the Firebase client's
in-memory write queue is gone too), and the local copy is the only record. On
reconnect the read replaces it. That is exactly the situation the app exists
for, and `CLAUDE.md` names it as an invariant: "The connect-time workspace read
merges into local state; it must never replace it wholesale."

If the page is *not* reloaded while offline, the Firebase client replays its
queued writes on reconnect and nothing is lost. The bug is the reload case.

## Where it is pinned

`test/sync.js`, near line 412: a `knownGap()` named **"the offline game survives
the connect-time read"**. It asserts today's behaviour (the game is dropped) and
will fail the moment that changes. The fix must promote it to a plain `check()`
expecting the game to survive, and delete the `knownGap()` — see "Known gaps are
pinned, not hidden" in `CLAUDE.md`. The check below it ("and the loss was written
to disk") flips too.

## What already exists to build on

- `mergeNode(local, remote)` (line 544): a *shallow* merge used by the per-child
  listeners. It only keeps local identity fields (`name`, `opponent`, `date`,
  `teamId`, …) that the remote copy lacks. It does not merge children.
- `markSynced()` (line 295) writes `sm.synced:{clubKey}` — the time of the last
  good sync for this club. This is the natural input for "is this local-only
  game new, or was it deleted elsewhere?".
- `wsRead` — whether the workspace has been read from the database this session.
- `pushAll()` — writes one team, one match, one member at a time, at the depth
  the rules grant. Anything the merge decides to upload must go the same way.
- `onChildRemoved` listeners already delete locally what another device deletes
  *while this phone is online*. The open question is only what happened while
  it was offline.

## Decisions to make

These are the user's calls; bring a recommendation for each.

1. **Local-only game or team: new, or deleted elsewhere?** The proposal: keep and
   upload it if it was created or changed since the last good sync
   (`sm.synced`); otherwise treat it as deleted on another device and drop it.
   That needs a per-record "changed at" on the local side (or a set of dirty
   ids kept since the last sync). Is "since last synced" the right line? What
   about a phone that has never synced this club?
2. **The same game on both sides.** Proposal:
   - Append-only children (`stints`, `goals`, `shots`, `events`, `poss`,
     `planDone`) are keyed by random id, so take the union — nothing is lost.
   - The clock (`periods`) is the one real conflict. Proposal: a period ended on
     either side stays ended; the earlier recorded `end` wins; an `ended` game
     stays ended.
   - Everything else (opponent, date, kick-off, format…) takes the database's
     value, as today.
3. **Deletions of children.** A goal deleted on another device while this phone
   was offline would come back under a plain union. Accept that (rare, visible,
   fixable), or keep tombstones? Tombstones are a schema change.
4. **Teams and the roster.** Same rules as games, or is a team simpler
   (database wins, except players only this phone has)?
5. **`access`.** Almost certainly database-wins, untouched by the merge — roles
   must never be resurrected from a stale local copy. Confirm.
6. **Rules.** Uploading the kept records must pass the rules as they stand
   (`node test/rules.js`). A tracker's device keeping a game it could log but not
   create is a case to check.

## Tests to write (in `test/sync.js`, on `test/harness.js` + `test/fakebase.js`)

- The pinned case: an offline-only game survives the read, stays on disk, and is
  uploaded at `matches/{id}` (one write per game, never the whole collection).
- A local-only game older than the last sync is treated as deleted elsewhere.
- The same game on both sides: goals and stints from each side are both kept;
  the clock follows the agreed rule; `ended` never un-ends.
- `access` from the database wins over a stale local copy.
- Nothing is uploaded for a club the phone has never read (no `wsRead`), and a
  denied read (lock screen) still merges nothing and uploads nothing.
- `node test/clock.js` and `node test/stints.js` stay green — the `s.end || now`
  invariant must hold after a merge.

## Housekeeping when it ships

- `node test/run.js` all green, with the gap gone from its "Known gaps" list.
- `CLAUDE.md`: delete "Pinned today: `wireBase()` replaces local state
  wholesale…" and update the `wireBase()` invariant if the wording changes.
- `CHANGELOG.md` entry; bump `BUILD` in all four places (`node test/version.js`).
- Delete this `HANDOFF.md`.

## Context from the session that wrote this

- Item 3 (team codes, coach invites, Create a club) is on
  `claude/todo-list-priorities-j3yiv2`, not yet merged. It doesn't touch
  `wireBase()`, but it bumps `BUILD` to 65 — expect a trivial conflict there.
- Item 2 (bulk editing) is on `claude/bulk-edit-squad-grid`.
