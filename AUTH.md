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

Keep the parent claim flow described below as the bulk path: one team code, parent picks a shirt number, coach approves. Per-person invites are for coaches and for the one parent who cannot make the bulk flow work.

## Who sees which team

Fixed, and deliberately not configurable — see the note at the end.

| | Sees | Can change |
| --- | --- | --- |
| App owner | Everything | Everything |
| Org admin | Every team in the club | Every team |
| Coach | Every team in the club | Only her own |
| Tracker | Only teams she tracks | Events on those teams |
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

## Should admins configure what each role sees?

**No — not yet, and probably not as a free matrix.** Three reasons, in order of how much they would hurt:

1. **The rules have to agree with the interface.** If permissions are configuration, every security rule becomes a two-step lookup: read the config, then decide. That is dramatically harder to write correctly and nearly impossible to reason about at a glance. Fixed roles give short rules you can read in one sitting and be confident about.
2. **Combinations cannot be tested.** Four roles and a dozen toggles is thousands of states. You will not test them, so some combination will quietly expose a child's data, and nobody will notice until it matters.
3. **Nobody has asked for a different arrangement yet.** Building configuration before a second club exists is building for an imagined disagreement.

The honest version of this feature, when it is time, is **two or three named presets** — "parents see their own child only" versus "parents see the whole roster" — because that is a genuine club-policy difference rather than an arbitrary switch. One setting, two values, rules that check one boolean.

That one is worth adding now if the club has an opinion. The free matrix is worth deferring until a club asks for something the presets cannot express.

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
| Tracker | `teams/{t}/trackers/{uid}` | Track tab only — no subs, no clock |
| Parent | `guardians/{uid}` on any player in the team | Read that team, including names |
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

**This closes the public write hole.** `shareOwners/{shareId}/{uid}` is written when a coach creates the share, so only that team's coaches can publish. Do not reach for anonymous auth as a shortcut: anonymous uids are per-device, so two coaches would get different ids and only one could publish, and clearing browser storage would lock a coach out of her own share.

## Migration

The existing `workspaces/{code}` node is already organisation-shaped — many teams, their matches. The move is mostly mechanical:

1. Create the org, make the current user its first admin.
2. Copy `workspaces/{code}/teams` to `orgs/{orgId}/teams`, adding that admin as coach of each.
3. Repoint matches at the new team ids.
4. Keep the old node readable for a fortnight, so nothing is lost if the copy goes wrong.
5. Retire workspace codes once every coach has signed in.

Do the migration with a button in the app, on a copy, not by hand in the console.

## What parents actually see

Worth stating so it is deliberate and not an accident of implementation:

- Their own daughter's minutes, planned versus actual, and positions played.
- The team's scores, results and schedule.
- **Other players by shirt number only.** A parent is not an insider — they get names for their own child, not the roster.

That last line is a decision to revisit with the club, not a technical constraint. Some clubs publish rosters freely; assume they do not until told otherwise.

## Build order

1. Enable the three sign-in methods; add sign-in UI and an auth gate.
2. Org and team model, plus the `teamMembers` index.
3. Migration button.
4. Rules, including closing the public write hole.
5. Join codes, the claim flow, and the coach's approval list.
6. Parent view.

Steps 1 to 4 are invisible to parents and safe to ship mid-season. Step 5 is the one that changes how people get in — ship it between seasons, or to one team first.
