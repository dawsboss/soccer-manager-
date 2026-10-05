# Authentication design

Written before any code, because the data model and the rules have to be right first — they are painful to change once twelve teams have data in them.

---

## The question that shaped this

> Each player profile can have multiple emails assigned to it, so coaches add parents to the view list. Or is that a lot of adding?

The **model is right**. The **data entry is not**.

Parent-to-player is the correct relationship, not parent-to-team:

- A parent with daughters on two teams needs both, and a team-level link cannot express that.
- "Guardian of number 7" is what makes a per-player view possible later — her minutes, her history, the end-of-game email.
- It is the natural anchor for the parent-supplied position history in the roadmap.

But typing emails does not scale. Twelve teams, fifteen players, roughly two guardians each is about **360 email addresses typed by coaches**, every one a chance to transpose two letters. And a typo fails *silently*: the parent signs in, sees nothing, and texts the coach, who has no way to tell a typo from a parent who never signed up.

So keep the model and invert the work.

## The code becomes the organisation

Once sign-in is required, the workspace code stops being a secret and becomes an **identifier**. Nobody types it; the app works out which organisations you belong to from your account.

This needs one thing that does not exist yet: a **reverse index at the database root**, because Realtime Database cannot ask "which organisations contain this uid".

```
userOrgs/{uid}/{orgId}: { name, role }
```

Written whenever a role is granted, alongside the existing `access/index`. On sign-in the app reads `userOrgs/{uid}` and either drops you straight into your only club or asks which one. No code, no typing, no screenshot of a code to worry about.

The org id stays exactly what the workspace code is today, so **nothing migrates** — the same trick that let roles land without moving data. The club gets a display name (`access/org/name`) and the id becomes plumbing.

**Built** (2026-10, build 93): the code is gone from every screen. The app owner's code box, its last appearance, is removed. A phone reaches a club by an invite, a team link, the switcher (`userOrgs`, which every phone backfills for the clubs it reads) or by starting one. The code lives on only as the club's id inside database paths, as this section intended.

## The account flow

**Signed out** — a plain page. What the app is, and a sign-in button. No data, no roster, nothing.

**Signed in, belongs to nothing** — deliberately boring, with exactly two doors:

- **Create a club.** You become its admin, then add teams and invite people.
- **Redeem an invite.** Paste the code or follow the link a coach sent.

**Signed in, belongs to one club** — straight in, that club selected.

**Signed in, belongs to several** — pick one. Rare, but a coach with a daughter in another club hits it immediately.

### Invitations replace the shared code

```
invites/{code}: { orgId, teamId, role, playerId, createdBy, expiresAt, usedBy }
```

An invite carries what it grants, so redeeming it is one step instead of a request followed by an approval. A coach invite grants coach on one team; a parent invite grants guardian on one player. Single-use, and they expire — a code circulating in last season's group chat should stop working on its own.

**Built** (2026-09): per-person invites, as `invites/{id}` with the club it belongs to as `ws` (the org id is still the workspace code), an admin's list at `clubInvites/{code}`, and `userOrgs/{uid}`. Admins make them; README's **Joining a club** and the rules there are the reference. The role entries an invite writes hold its id rather than `true`, because a rule has to look the invite up from the value being written.

**Built** (2026-10): the bulk path below, as `joinCodes/{code}` (the team link) and `claims/{ws}/{team}/{uid}` (a parent's request), approved from the team's Squad tab. The team's current link sits at `teams/{tid}/join`. Approval writes the guardian and lets the parent into `access/index` with the team id as its value — the one place a coach writes the index, and only for a request to her own team she approved. Admins can also make a squad's worth of personal parent invites in one go.

Keep the parent claim flow described below as the bulk path: one team code, parent picks a shirt number, coach approves. Per-person invites are for coaches and for the one parent who cannot make the bulk flow work.

## Who sees which team

Fixed, and deliberately not configurable — see the note at the end.

| | Sees | Can change |
| --- | --- | --- |
| App owner | Everything | Everything |
| Org admin | Every team in the club | Every team |
| Coach | Every team in the club | Only her own |
| Tracker | Only teams she tracks | Events on those teams, and the coach's locked-in subs when they are due |
| Parent | Only teams her child is in | Nothing |

Coaches reading across the club is intentional: comparing against the other age groups is half the value of being in a club rather than a lone team. Editing is another matter, so a coach viewing another team gets a banner saying so.

Before the first admin exists, none of this applies and everyone sees everything — that is what keeps a fresh club, and the current season, from locking itself.

## How it looks: three people

The thing that makes this awkward is that **a role belongs to a pair, not a person**. You are not "a coach"; you are a coach *of one team* and possibly a parent *of a player on another*. Any design that asks someone to pick an identity gets this wrong.

So: one switcher, tabs that adapt to where you are, and one page that cuts across everything.

### A parent with three children in two clubs

Alba on Team A and Rosa on Team B at Lakeside; Iris on Team Z at Riverside.

Signing in, she lands on **My players** — all three, whichever club they are in, each with minutes this season against plan, the live or most recent game, and the next fixture. That page ignores org and team boundaries entirely, because she does not think in those terms; she thinks about her three daughters.

Tapping Rosa drops her into Rosa's team at Team B, on Stats. The switcher above shows her contexts grouped by club:

```
Lakeside SC
  Team A · parent
  Team B · parent
Riverside
  Team Z · parent
```

She never sees Roster, because a parent has no business reading the rest of the squad's names.

### A coach with a child elsewhere

Jaz coaches Team M. Her daughter Mia plays for Team Q.

She lands in Team M, because that is where she has work to do. Full tabs: Games, Roster, Season, Settings, and inside a game, Live, Track, Stats, Pitch.

**My players** also appears, showing Mia. Tapping her goes to Team Q on Stats — and because a coach can read the whole club, she gets the real view rather than a parent's cut-down one. She cannot change anything there; the banner says so.

If Mia were on Team M instead, nothing special happens and that is the point. The context stays coaching, the tabs stay full, and Mia is still listed under My players. There is no mode to toggle and no identity to pick.

### An admin

Same shape. Every team in the club, editable. If she has a child, **My players** appears exactly as it does for anybody else — and if that child is at a different club, it appears there too, with whatever role she holds over there.

### The rule this produces

- **One switcher.** Contexts grouped by club, each showing the role you hold there. Not a team picker and a separate role picker.
- **Tabs adapt to the role in the current context.** Coach in Team M, parent in Team Q — the app changes shape as you move between them.
- **My players cuts across everything.** Always present when you are a guardian of anyone, regardless of which context you are in.
- **No console, and no mode switch.** The game screens *are* the coach's console, and the Admin tab is the club's. A third wrapper would only add a layer over things already one tap away.

**Built** (2026-10): My players lists her children across teams and, since build 92, across clubs. Children in another club come from the cut-down copy My calendar already keeps of every club in `userOrgs` (`mirrorSlim()`: her own children, every game's when and where, no stints), so they show with team, club and what's next, and *Open that club* for the minutes; the copy gained nothing for it. She does not land on My players at sign-in; she lands in a club, which is still what the switcher picks.

## A player with her own account

**Built** (2026-10, build 94, rules version 5), as the owner decided it:

1. **Her coach gives it, on request**, and so may an admin. Never a parent. It is off unless she or her family asks.
2. **She reads and posts** in her family's conversation with the coaches.
3. **She sees the same as her parents**: herself by name, teammates as the club's *What parents see* preset says.
4. **No age rule.** That is the coach's and the club's call for now.

The model, unchanged from the design. A player is a record her parents point at through `guardians`, any number of them. Her own account is one more pointer, kept **separate from `guardians`**:

```
teams/{tid}/players/{pid}/self/{uid}: inviteId
access/teamPlayers/{tid}/{uid}: pid        the lookup table the rules read
```

Separate because she is not her own parent. `roleIn()` gives `'player'`, and every right a parent holds was decided again for her rather than inherited:

| | A parent | Her own sign-in |
| --- | --- | --- |
| Reads the team, Live, Stats, recap, calendar, notices | Yes | Yes |
| Teammates' names | By the club's preset | By the club's preset |
| Says "going" | For her children | For herself; a parent may change it |
| Family conversation with the coaches | Her own | Each of her parents', where they see every word; never one of her own |
| Books and pays for sessions | Yes | No |

**How she gets in.** The coach taps *Make her a sign-in link* on the player's page. It is a single-use `player` invite naming the child by shirt number. The rules let that team's coaches make one, as well as admins, and only a `player` one, so this is still not the "coaches make personal invites" item. Spending it writes `self`, then `access/index`, then `access/teamPlayers`, in the order the rules check them. The invite id is the secret, so it never goes into the club. The coach's phone keeps it to show again, the admins' list has it, and a new link withdraws the old one.

**Safeguarding.** Guidance (SafeSport in the US, the FA in England) is that adults don't message minors one-to-one. The `dm` rule lets her read and write a family thread only when its owner is in her player record's `guardians`, and her own uid never qualifies as a family. So a coach can only reach her where her parents read along. `test/rules.js` and `test/players.js` pin both sides.

Not built: a player in more than one club seeing her other clubs' messages (the cut-down copy of another club doesn't carry her parents' uids, and won't just for this).

## Should admins configure what each role sees?

**No — not yet, and probably not as a free matrix.** Three reasons, in order of how much they would hurt:

1. **The rules have to agree with the interface.** If permissions are configuration, every security rule becomes a two-step lookup: read the config, then decide. That is dramatically harder to write correctly and nearly impossible to reason about at a glance. Fixed roles give short rules you can read in one sitting and be confident about.
2. **Combinations cannot be tested.** Four roles and a dozen toggles is thousands of states. You will not test them, so some combination will quietly expose a child's data, and nobody will notice until it matters.
3. **Nobody has asked for a different arrangement yet.** Building configuration before a second club exists is building for an imagined disagreement.

The honest version of this feature, when it is time, is **two or three named presets** — "parents see their own child only" versus "parents see the whole roster" — because that is a genuine club-policy difference rather than an arbitrary switch. One setting, two values, rules that check one boolean.

That one is worth adding now if the club has an opinion. The free matrix is worth deferring until a club asks for something the presets cannot express.

**Built** (2026-10, build 92): the one preset, as `access/org/rosterOpen` (*Shirt numbers only*, the default, or *The whole roster by name*), on Club admin, admins only. It is a screen setting, not a rule: a parent indexed in the club reads the whole workspace today, so no rule can withhold the names from her. Making it a rule is the `orgs/{orgId}` move below, which gives the squad its own readable-by node.

## Joining: parents claim, coaches approve

1. Coach shares one **team join code** — `FLIGHT-7K2M`, or a link carrying it. One code covers the whole team, texted once with the season link.
2. Parent signs in with whichever method suits them.
3. Parent enters the code, then **types their daughter's shirt number**. They are not shown the roster — before approval they get no names at all.
4. Coach sees a pending list: *someone@example.com wants to be linked to number 7*, and taps approve or reject.

One tap per parent instead of a typed address, and a mistake becomes the parent's to correct rather than a silent failure the coach has to debug.

**Keep direct assignment too.** A coach adding a known email by hand is the right tool for the grandparent who will never manage a join code. Both paths write the same `guardians` entry — the claim flow is just a cheaper way to get there.

**Rotate the join code** per season, and on demand. It is a low-value secret — worst case someone requests access and gets rejected — but a stale code circulating in an old group chat is untidy.

## Sign-in

Google, email + password, and email magic link, all enabled.

Turn **on** the "one account per email address" setting in the Firebase console — it is the default. With three methods live, the same person will eventually sign in a different way than they signed up; that setting makes one email mean one account instead of quietly creating a second one with no access.

Magic link is the one to point parents at. No password to forget, and forgotten passwords are the support burden that will otherwise land on the coach.

**Built**: all three, in the app's sign-in sheet. The "one account per email" setting is a Firebase console switch and cannot be checked from the app.

## Data model

```
orgs/{orgId}/
  meta:     { name, logo }
  admins:   { uid: true }
  members/{uid}:  { displayName, email, joinedAt }

  teams/{teamId}/
    meta:     { name, logo, season, joinCode, share }
    coaches:  { uid: true }
    trackers: { uid: true }
    players/{playerId}/
      ... existing fields ...
      guardians: { uid: true }

  claims/{claimId}: { uid, email, displayName, teamId, shirt, at, status }

matches/{matchId}   ... unchanged, with orgId + teamId ...
public/{shareId}    ... unchanged, no names, no uids ...
```

Roles are **derived from where a uid appears**, not stored as a string on the user. A string role is a second source of truth that goes stale; membership lists cannot.

| Role | Established by | Can |
| --- | --- | --- |
| App owner | A list outside the org tree | Support and debugging |
| Org admin | `orgs/{o}/admins/{uid}` | Create teams, assign coaches, manage members |
| Coach | `teams/{t}/coaches/{uid}` | Everything for that team |
| Tracker | `teams/{t}/trackers/{uid}` | Track tab only — no clock, and no subs beyond the coach's locked-in plan (told when, never who) |
| Parent | `guardians/{uid}` on any player in the team | Read that team, including names |
| Player | `self/{uid}` on her own player record, given by her coach | What her parents see; answers for herself; her family's conversations |
| Public | Holds a share link | Read the published mirror — numbers only |

A parent of two players on different teams simply appears in two `guardians` lists. Nothing special is needed.

## Rules sketch

```
"orgs": {
  "$o": {
    "teams": {
      "$t": {
        ".read": "root.child('orgs/'+$o+'/admins/'+auth.uid).exists()
               || data.child('coaches/'+auth.uid).exists()
               || data.child('trackers/'+auth.uid).exists()
               || data.child('players').hasChild(auth.uid)",
        ".write": "root.child('orgs/'+$o+'/admins/'+auth.uid).exists()
                || data.child('coaches/'+auth.uid).exists()"
      }
    },
    "claims": {
      "$c": {
        ".read":  "root.child('orgs/'+$o+'/admins/'+auth.uid).exists()",
        ".write": "!data.exists() && newData.child('uid').val() === auth.uid"
      }
    }
  }
},
"public": {
  "$share": {
    ".read": true,
    ".write": "root.child('shareOwners/'+$share).child(auth.uid).exists()"
  }
}
```

The parent read clause needs work — `players.hasChild(auth.uid)` is wrong as written, since guardians sit one level deeper and RTDB cannot iterate children in a rule. The practical fix is a **flat index**: `teamMembers/{teamId}/{uid}: role`, written whenever a guardian or coach is added, and read directly in the rule. Denormalised, but rules can only do direct lookups, so the index is not optional.

**Built, on `workspaces/{code}` rather than `orgs/{orgId}`**: the flat index became four, `access/index`, `access/teamIndex/{tid}` (`coach` or `tracker`), `access/teamParents/{tid}` and `access/coachIndex`, all derived and rebuilt every connect (CLAUDE.md, the invariants). One ruleset, `database.rules.json`, with `node test/rules.js` walking it for every kind of account.

**This closes the public write hole.** `shareOwners/{shareId}/{uid}` is written when a coach creates the share, so only that team's coaches can publish. **Built.** Do not reach for anonymous auth as a shortcut: anonymous uids are per-device, so two coaches would get different ids and only one could publish, and clearing browser storage would lock a coach out of her own share.

## Migration

The existing `workspaces/{code}` node is already organisation-shaped — many teams, their matches. The move is mostly mechanical:

1. Create the org, make the current user its first admin.
2. Copy `workspaces/{code}/teams` to `orgs/{orgId}/teams`, adding that admin as coach of each.
3. Repoint matches at the new team ids.
4. Keep the old node readable for a fortnight, so nothing is lost if the copy goes wrong.
5. Retire workspace codes once every coach has signed in. *(Done for people in build 93: nobody types or sees one. The paths still say `workspaces/`.)*

Do the migration with a button in the app, on a copy, not by hand in the console.

**Status (2026-10): not started, and a decision for the owner rather than the next step.** Everything this document asked of the org model shipped without moving a byte: the workspace code *is* the org id (as "The code becomes the organisation" said it would be), roles are derived from where a uid appears under `workspaces/{code}/access`, and the four lookup tables do what `teamMembers` was for. Renaming `workspaces/` to `orgs/` on its own would change nothing anyone sees: the codes left the screen in build 93 without it. What the move would still buy:

- **Names a parent's phone never receives.** Today anyone indexed reads the whole workspace, so "other players by shirt number" is the screen's choice (above). A squad node readable only by that team's coaches and admins is the only way to make it the database's.
- **Teams one club can't read.** A coach reads every team by design; the move would let a club choose otherwise in the rules, not just on screen.
- **A fixture two clubs share** (ROADMAP, *Opponents*, step 2).

What it costs: every path in `app.js`, the rules, `test/rules.js`, the outbox, the mirrors and the backups, a fortnight with both trees live, and a copy of a real club's season, during which an old phone writing to the old tree is data lost. CLAUDE.md treats any schema change as high-stakes. Do it only for one of the three reasons above, between seasons, and on the sandbox club first.

## What parents actually see

Worth stating so it is deliberate and not an accident of implementation:

- Their own daughter's minutes, planned versus actual, and positions played.
- The team's scores, results and schedule.
- **Other players by shirt number only.** A parent is not an insider — they get names for their own child, not the roster.

That last line is a decision to revisit with the club, not a technical constraint. Some clubs publish rosters freely; assume they do not until told otherwise.

**Built** (2026-10, build 92): `shownName()` draws her own child by name and everyone else by shirt number (*A teammate* with none) on Stats, Season, Live, the match log and the recap, for anyone who is only a parent in the club. Admins, coaches of any team and trackers see names; so does everyone before the club has an admin. The club's preset above turns it off. `test/parents.js` pins it.

## Build order

1. Enable the three sign-in methods; add sign-in UI and an auth gate.
2. Org and team model, plus the `teamMembers` index.
3. Migration button.
4. Rules, including closing the public write hole.
5. Join codes, the claim flow, and the coach's approval list.
6. Parent view.

Steps 1 to 4 are invisible to parents and safe to ship mid-season. Step 5 is the one that changes how people get in — ship it between seasons, or to one team first.

Where each step stands (2026-10):

1. **Built.** Google, email and password, and magic link; `needsSignIn()` is the gate.
2. **Built on `workspaces/{code}`**, with the four lookup tables in place of `teamMembers`.
3. **Not built**, and no longer needed for anything above. See *Migration*: it is now about moving names out of a parent's reach, and it is the owner's call.
4. **Built.** One ruleset; `shareOwners` closed the public write hole.
5. **Built.** Team links and the coach's approval list (`joinCodes`, `claims`), per-person invites, and a squad of parent invites at once.
6. **Built.** Parents see their own child by name and the rest by number, the club's one preset, and My players across clubs.
