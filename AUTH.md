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

**Built** (2026-10, build 96): the code is gone from every screen. The app owner's code box, its last appearance, is removed. A phone reaches a club by an invite, a team link, the switcher (`userOrgs`, which every phone backfills for the clubs it reads) or by starting one. The code lives on only as the club's id inside database paths, as this section intended.

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

**Built** (2026-10): My players lists her children across teams and, since build 95, across clubs. Children in another club come from the cut-down copy My calendar already keeps of every club in `userOrgs` (`mirrorSlim()`: her own children, every game's when and where, no stints), so they show with team, club and what's next, and *Open that club* for the minutes; the copy gained nothing for it. She does not land on My players at sign-in; she lands in a club, which is still what the switcher picks.

## A player with her own account

**Built** (2026-10, build 97, rules version 6), as the owner decided it:

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

**Built** (2026-10, build 95): the one preset, as `access/org/rosterOpen` (*Shirt numbers only*, the default, or *The whole roster by name*), on Club admin, admins only. It is a screen setting, not a rule: a parent indexed in the club reads the whole workspace today, so no rule can withhold the names from her. Making it a rule is the `orgs/{orgId}` move below, which gives the squad its own readable-by node.

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

**Built** (build 115): Apple and Microsoft as well, each drawn only once the club lists it in `firebase-config.js` (`SOCCER_SIGNIN`), because a method not switched on in the console fails with a code nobody at a sideline can read. The setting above is what this leans on: a person whose email already has an account is refused the new way, told to sign in the way she did before, and the new way is then linked to that account (same email only), so she stays one person to the club. Her account sheet lists the ways she signs in and adds the others, and takes a name, for Apple, which gives a name only the first time and can hide the email behind a relay address. That relay address never matches an invite sent to her own address, and some Microsoft accounts never confirm their email, which the invite rule requires; the invite screen says which and what to do. Forgotten passwords get a reset link.

Not built: a phone number (SMS). It costs per message on the Blaze plan, needs reCAPTCHA scripts the Content-Security-Policy does not allow, and an account with no email cannot take an email-bound invite or a magic link, so it would be a fourth way in that half the club's flows do not reach. Facebook is a one-line addition to `SIGNIN_PROVIDERS` if a club asks, but needs a Meta app and its review.

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

**This closes the public write hole.** `shareOwners/{shareId}/{uid}` is written when a coach creates the share, so only that team's coaches can publish. **Built**, and then **replaced (build 120, SECURITY.md, SEC-10):** an id nobody had claimed was still anyone's to publish under, so phones stopped publishing altogether; `public/` is `.write: false` and only the server writes it, and `shareOwners` is gone. Do not reach for anonymous auth as a shortcut: anonymous uids are per-device, so two coaches would get different ids and only one could publish, and clearing browser storage would lock a coach out of her own share.

## Migration

The existing `workspaces/{code}` node is already organisation-shaped — many teams, their matches. The move is mostly mechanical:

1. Create the org, make the current user its first admin.
2. Copy `workspaces/{code}/teams` to `orgs/{orgId}/teams`, adding that admin as coach of each.
3. Repoint matches at the new team ids.
4. Keep the old node readable for a fortnight, so nothing is lost if the copy goes wrong.
5. Retire workspace codes once every coach has signed in. *(Done for people in build 96: nobody types or sees one. The paths still say `workspaces/`.)*

Do the migration with a button in the app, on a copy, not by hand in the console.

**Status (2026-10): not started, and a decision for the owner rather than the next step.** Everything this document asked of the org model shipped without moving a byte: the workspace code *is* the org id (as "The code becomes the organisation" said it would be), roles are derived from where a uid appears under `workspaces/{code}/access`, and the four lookup tables do what `teamMembers` was for. Renaming `workspaces/` to `orgs/` on its own would change nothing anyone sees: the codes left the screen in build 96 without it. What the move would still buy:

- **Names a parent's phone never receives.** Today anyone indexed reads the whole workspace, so "other players by shirt number" is the screen's choice (above). A squad node readable only by that team's coaches and admins is the only way to make it the database's.
- **Teams one club can't read.** A coach reads every team by design; the move would let a club choose otherwise in the rules, not just on screen.
- **A fixture two clubs share** (ROADMAP, *Opponents*, step 2).

What it costs: every path in `app.js`, the rules, `test/rules.js`, the outbox, the mirrors and the backups, a fortnight with both trees live, and a copy of a real club's season, during which an old phone writing to the old tree is data lost. CLAUDE.md treats any schema change as high-stakes. Do it only for one of the three reasons above, between seasons, and on the sandbox club first.

**Decided 2026-10-06:** the owner wants registration data and the squad's names protected by the database, not the screen. `GOTSPORT.md` (*Protecting the data*, *Build order* step 3) schedules the first reason above (the full move, or only a squad node) before season registration opens to families, designed together with a club-level record of each child. That design is written here before any code.

**Decided 2026-10-08 (SECURITY.md, SEC-1): the full move**, not only a squad node. The design is the next section, and its four smaller decisions were settled the same day. **Built the same day (build 110), and every club has moved** (the owner, 2026-10-09); the old tree comes out a fortnight on (build order step 5).

## The move to `orgs/{orgId}`

Written 2026-10-08, before any code, for SECURITY.md's SEC-1: *keep the squad out of parents' reach*. Families are not on the app yet (owner, 2026-10-08), so this is the window to do it without moving anyone's phone mid-season.

### What it is for

Today `workspaces/{code}` has one `.read`, at the top, for everyone in `access/index`. Realtime Database rules cascade — a read granted at a node cannot be taken back below it — so a parent's phone receives, and keeps in localStorage:

- every child on every team: name, shirt number, the coach's `note`, `rating`, `pairs` and `avoid` (who to keep together or apart), `photo`, `preferred`/`canPlay`/`foot`, and who each child's guardians are;
- every member's name **and email** (`access/members`);
- the audit trail, which names people and players (`access/log`).

The screen hides most of it (`shownName()`); developer tools do not. The move gives each of those an audience in the rules instead. It is also the start the other two reasons in *Migration* need (teams a club can't read, a fixture two clubs share), though neither is built here.

### One id, not two

**`orgId` is the workspace code, unchanged.** The code has been the club's internal id since build 96 and nobody sees it. Keeping it means everything already keyed by it stays where it is and needs no migration: `training/{code}`, `board/`, `dm/`, `staffdm/`, `claims/`, `joinCodes/`, `clubInvites/`, `invites/{id}/ws`, `userOrgs/{uid}/{code}`, `retired/{code}`, `people/{uid}/busy/{clubTag(code)}`, the local copies' keys (`sm.*:{club}`) and every link in anyone's hands. Only the `workspaces/{code}` subtree moves, to `orgs/{code}`, and is split by who reads it.

### Where everything goes

| Today, under `workspaces/{code}/` | Moves to `orgs/{code}/` | Read by |
| --- | --- | --- |
| `access/org` (name, badge, venues, `rosterOpen`, `sandbox`) | `org` | everyone in the club |
| `access/admins`, `access/teams/{tid}` (coaches, trackers) | `access/admins`, `access/teams` | everyone in the club (who runs what is not private, and the role functions need it on every phone) |
| `access/index`, `teamIndex`, `coachIndex`, `teamParents`, `teamPlayers` | the same, under `access/` | everyone in the club (uids and ids only) |
| `access/members/{uid}` (name, email) | `members/{uid}` | staff only (below), and each person her own |
| — | `names/{uid}`: `{ name }` for staff only, **derived** | everyone in the club, so a family sees who her coach is |
| `access/log` | `log` | admins only |
| `teams/{tid}` without `players` (name, logo, settings, `events`, `attend`, `share`, `calFeed`, `join`) | `teams/{tid}` | everyone in the club |
| `teams/{tid}/players/{pid}` (the whole record) | `squad/{tid}/{pid}` | that team's staff, every coach, admins; **and that child's own family, and the player herself** |
| the coach's `note`, `rating`, `pairs`, `avoid` on that record | `coachNotes/{tid}/{pid}` (since build 116; SECURITY.md, SEC-D10) | every coach and the admins; **not** trackers, the family or the player |
| — | `roster/{tid}/{pid}`: `{ number, active }`, plus `name` only while `org/rosterOpen` is on, **derived** | everyone in the club |
| `matches/{mid}` | `matches/{mid}` | everyone in the club (keyed by player id; no names in it today, and `test/stats.js`'s name scan is extended to a game record to keep it so) |
| `rsvp/{tid}/…` | `rsvp/{tid}/…` | everyone in the club, as today: keyed by player id, and the screen narrows it |

**Staff** here means: an admin (`access/admins`), a coach of any team (`access/coachIndex`), or anyone with a role on that team (`access/teamIndex/{tid}/{uid}`, coach or tracker). That is exactly who `namesNarrowed()` shows names to today, with one narrowing: **a tracker reads her own team's squad, not every team's.** A rule cannot ask "a tracker of any team" without a sixth lookup table, and a tracker has no reason to see another team's children (decided, see *Decisions*).

A family's read of her own child is the rule at `squad/$tid/$pid`: `data.child('guardians/' + auth.uid).exists() || data.child('self/' + auth.uid).exists()`. One record, never the list: she cannot read `squad/{tid}`, so her phone asks for each of her children by path (it knows them from `access/teamParents/{tid}/{uid}`, whose value is the player id, and `teamPlayers` for a player herself).

`teams/$tid` refuses a `players` child (`.validate: false`), so no old code path can put names back where everyone reads them.

### The rules

`orgs/$o` has **no `.read` of its own**: each child above carries its own, so nothing cascades past where it should. Writes keep today's shape and today's lookup tables, moved: the team rule on `teams/$tid` and on `squad/$tid` (its coaches and admins), the invite and approval clauses on `squad/$tid/$pid/guardians|self`, the bootstrap on `access/admins` and `access/index`, members as SEC-2 left them. `names/`, `roster/` and `log` reads aside, every rule is a path rename of one that `test/rules.js` already walks.

Every root rule that looks into a club today (`training`, `board`, `dm`, `staffdm`, `claims`, `joinCodes`, `clubInvites`, `rsvp`, `public`'s owners…) says `root.child('workspaces/' + $code + '/access/…')`, 198 times. During the move each of those reads **the tree the club is on**: `orgs/` once `orgs/{code}/access/index` exists, otherwise `workspaces/`. Written once as a pattern and generated, not typed 198 times: `database.rules.json` stays the file that is published, built from a source with a `CLUB(path)` macro by a script `test/rules.js` checks it against (the same way `functions/make.js` keeps `functions/ics.js` in step). The macro goes once every club has moved and the `workspaces/` branch is gone.

A club that has moved keeps a `workspaces/{code}/moved` marker and nothing else. Its bootstrap clauses (`access/admins` and `access/index` while empty) check that marker, so an old phone finding an empty workspace cannot claim it and push its copy back into the old tree (`wireBase()`'s `pushAll()` on an empty read). Every other write there is refused already, because the lookup tables it needs are gone.

### How each phone reads

Today: one `onlyOnce` read of the whole workspace (`wireBase()`), merged into local state (`mergeConnect()`), then child listeners on `teams`, `matches`, `rsvp` and one on `access`. That single read is refused for a parent once nothing grants it at the top, so it becomes **one read per part, each one this account may make**:

- everyone: `org`, `access`, `names`, `teams`, `roster`, `matches`, `rsvp`;
- staff: `squad/{tid}` for each team she may read (all of them for an admin or a coach), `members`;
- admins: `log`;
- a family or a player: `squad/{tid}/{pid}` for each of her own children, from `teamParents`/`teamPlayers`.

The first answer of each is merged as today (`mergeConnect()` per part, the outbox laid over it), then the same child listeners. "Synced" still means every part this phone asked for has answered.

**`state.teams[tid].players` is assembled on the phone, not stored that way**: the squad where this account reads it, otherwise the roster's numbers with her own children's records laid on top. Everything that reads `t.players` today (`shownName()`, the planner, the recap, the share pages) keeps working unchanged, and on a parent's phone it simply has nothing more to show than numbers. That is what makes `test/parents.js`' *Done when* true: it runs against what the phone holds, not what it hides.

**A parent's phone forgets what it should never have held.** The first time it reads a moved club, it drops every player record that is not one of hers from `state`, the local copy, the backup and the other-clubs copy (`you.clubs`; `mirrorSlim()` already cut those down) and `access.members`, `access.log`. Merge-on-read would otherwise keep yesterday's whole squad forever. The same check runs whenever her roles change (a guardian unlinked: that child's record goes too).

### Writes and the outbox

Paths in the outbox and in `remoteSet()` are relative to the club (`fb.base`), so most of the app never sees the move. One translation, in `remoteSet()`/`remoteDel()` and nowhere else:

- `teams/{tid}/players/{pid}…` → `squad/{tid}/{pid}…`;
- `access/members/{uid}` → `members/{uid}`; `access/log/{id}` → `log/{id}`; `access/org…` → `org…`;
- a whole-team write (`teams/{tid}` with `players` inside, as saving a team and `pushAll()` do) is split into the team without players and `squad/{tid}`, each at its rule's depth, in that order.

A refused or offline write already in a phone's outbox from before the move is replayed through the same translation, so nothing tracked at a field with no signal is lost by the move. `calStamp()` and `noteMine()` see the path before translation, as now.

### The server

Every function that reads a club (`functions/access.js`, `push.js`, `mirror.js`, `mycal.js`) takes the club's root (`workspaces/` or `orgs/`) from one helper and reads guardians from `squad/`, and each trigger is registered on both trees until the old one is gone. Two new derived tables, kept the way `functions/access.js` keeps the lookup tables (same sources, nothing started that is missing, an event late or twice leaving them right):

- **`roster/{tid}/{pid}`** from `squad/{tid}/{pid}`: number and `active`, and the name only while `org/rosterOpen` is on (the club's one preset, `test/parents.js`). A coach's phone writes it too, beside each squad write, so a club without the functions deployed still shows numbers; the server's copy wins on the next change.
- **`names/{uid}`** from `members/{uid}` for every uid in `access/admins`, `access/teams/*/coaches|trackers`: the name, never the email. Left when the role goes.

Both are tested in `test/access.js` for every kind of account, like the rest of that suite.

### Moving a club

A callable function, `moveClub`, for an admin of that club (checked against `workspaces/{code}/access/admins`, as the rules would): one transaction-free run, because nothing writes while the club is moving.

1. Refuse unless the caller is an admin, the club is not retired, and `orgs/{code}` is empty.
2. Copy `workspaces/{code}` to `serverState/moved/{code}/{at}`, untouched: the fortnight's way back (no rule reaches `serverState/`, so it is the console's and the server's alone). Daily backups (SECURITY.md, SEC-7) should be on before the first real club moves.
3. Write `orgs/{code}` in the order the rules need: `access/admins`, `access/index`, the other lookup tables, `org`, `members`, `names`, `log`, `teams` (without players), `squad`, `roster`, `matches`, `rsvp`.
4. Read it back and compare, part by part, with the copy (player ids, games, stints, events, registers, answers). Any difference: delete `orgs/{code}`, leave the workspace as it was, and say what differed.
5. Replace `workspaces/{code}` with `{ moved: { to: 'orgs', at, by } }`.

Each phone notices on its next read (the moved marker, or a refusal it cannot explain), switches `fb.base` to `orgs/{code}`, replays its outbox through the translation above, and reads as *How each phone reads* says. The admin presses one button, *Move this club*, under Check readiness, which lists what it is about to move first.

Order: **the test club first** (Setup → Make a test club), then the owner's own club, then any other, each with the owner watching. A club made after the release is made in `orgs/` from the start (`createClub()` and the bootstrap write there), so the old tree only ever shrinks.

### What changes, file by file

- `database.rules.json` (generated, as above), rules version 12; `test/rules.js` walks both trees, a moved club, and every reader of `squad`, `members`, `names`, `roster` and `log`.
- `app.js`: `fb.base` chosen per club; `wireBase()` reading per part; the assembly of `t.players`; the forgetting on a parent's phone; the path translation in `remoteSet()`/`remoteDel()`; `pushAll()`, `createClub()`, `redeemInvite()`, `approveClaim()` and the join flow writing the new paths; `backupDoc()` holding only what the phone may read; *Move this club*.
- `functions/`: the root helper, `squad` in place of `teams/{tid}/players`, `roster`, `names`, `moveClub`, triggers on both trees.
- Tests: `sync.js` (reads per part, a moved club, the outbox replayed), `parents.js` and `players.js` against what the phone receives, `access.js` (roster, names), `invites.js`, `join.js`, `push.js`, `mirror.js`, `mycalfeed.js`, and a new `move.js` for `moveClub` (every kind of caller, a failed comparison leaving the club untouched, an old phone's push refused).

### Build order

1. **Rules** for `orgs/` beside `workspaces/`, generated, with `test/rules.js` walking both. Publishing them changes nothing for a club that has not moved. *Built (build 110, rules version 12).*
2. **The server**: the root helper, both trees, `roster`, `names`, `moveClub`, all tested on the fake server. *Built (build 110).*
3. **The app**: per-part reads, the assembly, the translation, the forgetting, the button. Every suite green against both a moved and an unmoved club. *Built (build 110).*
4. **The test club moves**, then a real one, with the owner. *Done (the owner, 2026-10-09): every club is on `orgs/`*, with the functions deployed and the rules published (version 13 by then).
5. **A fortnight on** (from 2026-10-23), nobody on the old tree: the `workspaces/` branch and the macro come out of the rules, the triggers on the old tree go, and `serverState/moved/` is cleared. *Built (build 128, rules version 26), early*: the owner cut the fortnight short on 2026-10-10, since the only two clubs are both the owner's. The rules are `database.rules.json` again, edited by hand, with no `workspaces` or `moveRequests` block; the server registers each trigger on `orgs/` only (under its `…Orgs` name, so a deploy removes the old ones and touches nothing live) and `moveClub` is gone; the app reads and writes `orgs/` only, has no Move card, and cuts down a copy made from the old tree once before reading. Clearing `serverState/moved/`, the `moved` markers and `moveRequests/` is a console job for the owner, deliberately not automated (README, *The move to orgs/, and the old tree gone*). The app's suites, which ran only on the old tree, now run on `orgs/` (`fbk.serveClub()`), which found one difference the old tree hid: a player with her own sign-in sees her parents as *A parent*, pinned as a known gap in `test/players.js`.

### As built, and where it differs from the above

- **The macro is a build step.** `tools/rules-source.json` is what is edited (the old tree, the new tree and every root rule written against `workspaces/` as before); `node tools/rules-build.js` writes `database.rules.json`, wrapping each lookup into a club as *the old tree while the club is there, the new one once it has moved* (`orgs/{code}/access` exists). `test/rules.js` fails if the two disagree, and runs every check twice (`node test/run.js rules-orgs` is the second pass, every club in its mock moved).
- **The move is asked for in the database, not by a callable function.** The admin writes `moveRequests/{code}` as herself (the rules let only an admin of that club), and the `moveClub` trigger checks her again, keeps the old tree aside at `serverState/moved/{code}/{at}`, copies the club in batches (the database refuses one write that would wake more than a thousand function runs, which a whole club does), reads it back, switches it in one small write (the new tree's access in, the old one's out, the `moved` marker), takes the old tree away in batches, and writes its answer beside the request. While it runs, `serverState/moving/{code}` tells every other function to leave the club alone. A failure before the switch takes the copy away again; one after it is finished by asking again. That keeps the phone on the database SDK it already has, and the fake server tests it as it tests every other trigger (`test/move.js`).
- **A club is on exactly one tree, and the rules keep it so.** Nobody can start `orgs/{code}` while the old tree holds the code (it would hand them every root rule for that club), nor write anything on the old tree of a club that has moved or is on the new one — not even her own member entry, which a phone that has not heard of the move would otherwise write on signing in.
- **A phone does not write until it knows the tree.** Every write waits in the outbox until the session's first read of the club (`sendPending()`, `fb.held`), so nothing made at a field before the phone heard of the move goes to the old tree; the first read sends it all, translated (`clubPath()`, `clubWrites()`).
- **A move under an open phone deletes nothing.** From the old tree it looks like everything being deleted; removals wait a tick for the `moved` marker that came in the same write, and if it came the phone reads the new tree instead.
- **A twin is found by asking.** The lookup tables name one child per family per team, so a family's phone asks once for each number on the roster it has not asked about before, and remembers the answer (`sm.kids.v1`).
- **Trackers get staff names, not emails.** A rule cannot ask "a tracker of any team" without a sixth table (decision 1), so `members/` (emails) is read by admins and coaches; a tracker, like a family, reads `names/`.
- **The app's suites run once, on the old tree, and `test/orgs.js` covers the app on the new one** (what a family's phone asks for and holds, what staff read, where every write goes, the outbox across the move, a role changing, the Move card, another club on orgs/). The rules and the server suites run on both trees; the app's rig answers reads one path at a time, and a second pass of every app suite would have meant a second rig.

### Decisions for the owner

All four decided by the owner on 2026-10-08, as recommended:

1. **Trackers read only their own team's squad.** No sixth lookup table.
2. **Coaches of other teams keep reading every squad.** Writing stays as
   today: a squad is changed only by that team's coaches and the club's
   admins (and a family's or player's own `guardians`/`self` entry through
   an invite or an approval).
3. **Member emails are readable by all staff.** As built, staff here is admins and coaches: see *As built*, trackers.
4. **The access log is admins' only.**

## More kinds of people

Written 2026-10-09, before any code. The owner expects four kinds of people who are not a coach, a tracker, a parent or the player herself: **team helpers**, **fans**, **club-wide viewers** and **outside people**. Every club is on `orgs/` now, so each part of a club already has its own readers, and that is what makes these possible: a new role is a new set of readers, not a new copy of the club.

### What does not change

- **Roles stay fixed and named** (*Should admins configure what each role sees?*, above). Each kind below is a role with a fixed list of what it reads and does. No matrix of switches. The club's one names setting (`org/rosterOpen`) still decides which children a non-staff role sees by name.
- **A role is where a uid appears**, never a string stored on a person. Each new role is a place in the club (a list under `access/` or on a child's record) and, only if a rule needs one, a derived lookup table kept by the phones and by `functions/access.js` like the five today.
- **Joining is by invite**, expiring, for as many people as its maker chose (one seat each, since build 121), with the role and its scope inside the invite. Withdrawing a role deletes it, and the server's role triggers take her out of every table at once.
- **Safeguarding holds**: no new role messages a child one to one, and no new role reads a family's conversation that the family does not know about.

### The four, one at a time

**1. Fans: a player's people.** Grandparents, an aunt, a family friend, who want the games and the calendar on their own phone. Unlike a guardian, a fan is *under the player*. Anyone who can see the player may ask for one (her family, the player herself, a coach, an admin), and **the team's coach approves it**, the way she approves a family through the team link today (`claims`); a coach or an admin asking is approving. A fan does less than a parent:

| | A parent (guardian) | A fan |
| --- | --- | --- |
| Calendar, Live, scores, recap, notices | Yes | Yes |
| Her player by name | Yes | Yes |
| Teammates' names | By the club's setting | By the club's setting |
| Says "going" | Yes | No |
| Messages the coaches | Yes | No |
| Books and pays for sessions | Yes | No |
| Push: notices, calendar changes, a followed game | Yes | Yes |

Stored on the child's record, beside `guardians` and `self`: `squad/{tid}/{pid}/fans/{uid}`, written only by the coach's approval, with a sixth lookup table, `access/teamFans/{tid}/{uid}: pid`, so the notice and calendar rules can find her in one step (the rule checks the record agrees, as `teamParents` does). Her phone reads her player's record by path, as a family's does, and that record no longer holds anything about the child that only coaches should see (*The coach's notes*, below).

**2. Team helpers: staff who don't coach.** A team manager, a volunteer, an assistant. On one team, named on it like coaches and trackers: `access/teams/{tid}/helpers/{uid}`, and `teamIndex/{tid}/{uid}: 'helper'`. She sees what staff see on that team (names, the calendar, the register; not the coach's notes) and **helps the coach prepare**: the drills shelves, practice plans for her team, a game's plan before kick-off, notices, the calendar and the register. She does not read families' conversations, does not change the squad, and running the game on the day (subs, the clock) stays the coach's and the tracker's. The training rules find a coach through `coachIndex` today, so a helper needs her own clause in each one she is let into (drills, templates, practices), never an entry in `coachIndex`, which would make her a coach everywhere that table is read.

The care here: three rules today ask only whether a uid is *in* `teamIndex` for a team, not which role, and they would let a helper in exactly as they let a tracker in. Each is decided again for her rather than inherited, and `test/rules.js` walks every one of them for a helper.

**Built** (build 117, rules version 16), as written above, with these details. She has her own entry in `teamIndex` (`'helper'`, below `'tracker'` and `'coach'`, so someone who also tracks or coaches the team keeps that), which is what lets her read the squad and the notices; what she may change is checked against `access/teams/{tid}/helpers/{uid}` itself, so a helper who also tracks keeps both. The three "any role" rules came out as: **the squad**, yes (staff names); **notices**, yes, and she posts them (the board's write rule gained her); **a game**, narrowed: the match rule now asks for `'coach'` or `'tracker'`, and a helper writes a game of her team only while it has no `periods` and no `ended`, which is "before kick-off" in the only words a rule has (a rule still cannot say "the plan and nothing else", as for trackers). Its when and where (date, kick-off, called off, place, opponent) are hers too, as the rest of the calendar is. The calendar entries and the register each gained a clause on `events/$eid` and `attend/$eid`, one entry at a time, never the team. **One lookup table was added after all**, against the table above: `access/helperIndex/{uid}`, coachIndex's twin, because the club's drill and template shelves are read as a whole with no team in hand, and "a helper of any team" is not a question `teamIndex` can answer in one hop. Kept by the phones and `functions/access.js` exactly as coachIndex is, and never coachIndex itself. Only admins name a helper (the rules on `access/teams` already said so). The push readers needed no change: notices and calendar changes go to every `teamIndex` entry, family messages to `'coach'` entries only. Written for `orgs/` only, as *Order* says: on the old tree her invite cannot be accepted. `test/helpers.js` holds the screens and the click handler to it.

**3. Club-wide viewers: every team's games, with names, and nothing else.** A director or a board member. Club-level, like admins: `access/viewers/{uid}`. No lookup table, because a rule can check that one path directly, the way it checks `admins`. Less than a parent: she reads every team's calendar, games, Live, stats and recaps, with the children's names (the roster's names, whatever the club's setting), and does nothing: no answers, no messages, no bookings, no writes anywhere in the club. Not the coach's notes, not members' emails, not the access log, not fees, not conversations.

**4. Outside people: one game or one event, for a while.** A referee, a scout, a guest coach. Today the game link already gives anyone a game's page without signing in, and it stays that way: **no sign-in, no names**. This role is for when they need more, signed in and approved: `access/guests/{uid}: { team, item, until }`, made or approved by that team's coach or an admin, which the rules read with `now`, so it **ends by itself** at `until` with no phone or server having to remember. She reads that one game or entry, **with names**. A guest coach who should run subs is a tracker for the day, which needs a tracker's role with the same `until`.

### What each one costs

| | New place | New lookup table | Rules | App | Server |
| --- | --- | --- | --- | --- | --- |
| Fan | `squad/…/fans` | `teamFans` | squad read, notices, calendar, an ask anyone may make and the coach approves | role, tabs, *Ask for a fan*, the coach's approval list, My calendar | `access.js` table, push readers, My calendar's feed |
| Team helper | `access/teams/…/helpers` | none (`teamIndex` value) | the three "any role" rules decided again; notices, calendar, register, a game's plan; her own clause in drills, templates and practices | role, tabs, People, Practice | `access.js`, push readers, staff names |
| Club viewer | `access/viewers` | none | the roster's names for her, every team's reads | role, every team read-only, People | `access.js` (index) |
| Guest | `access/guests` | none | one game or entry, with `until` | invite with an end time, the guest's one screen | index kept in step with `until` |

**Built** (build 121, rules version 20), as written above, on `orgs/` only, with these details. The ask is a single-use invite of role `fan` naming the player by shirt number; one a coach or admin makes carries `approved: true` (the rules let only them write it), and whoever opens it writes herself onto the record, then the index, then `teamFans`, as a player's own sign-in does. One a family or the player makes lets whoever opens it write an ask at `claims/{code}/{tid}/{uid}` naming the spent invite and the player, on the same list the team link's asks go to; the coach approves it (`approved`, then `fans/{uid}`, then the index entry naming the team, then `teamFans`). The index rule refuses a fan invite's own index entry until the record names her, so a family's link never lets anyone into the club on its own. Her calendar feed carries her player's team but not his sessions.

Renamed **fans** (the owner, 2026-10-09; build 121, rules version 20): `fans/{uid}`, `access/teamFans`, invite role `fan`. Also in build 121: her name is kept on the record (`fanNames/{uid}`, written by her or the coach approving, removable by the family) because the family cannot read members, so the family sees who follows their child; the family (guardian or the player herself) takes a fan off the record, and then anyone in the club may clear her stale `teamFans` entry (the rules check the record no longer names her), while her index entry stays the staff's phones' and the server's to take; and a fan leaves from her own phone. Fan links can be for several people (both grandparents), like every invite now.

### The coach's notes come off the child's record first

Decided 2026-10-09: the coach's notes on a child (`note`, `rating`, `pairs`, `avoid`) are **coaches' and admins' only**. Today they sit on the child's record, `squad/{tid}/{pid}`, which her family and the player herself read on `orgs/`, and which every new role above would read through it. So before any of them, those four fields move to a node of their own, `coachNotes/{tid}/{pid}` under the club, read and written by coaches (any team, as the squad is read today) and admins; not trackers, not helpers, not families, not the player. The move is the server's (as `moveClub` was), the phone writes there through `clubPath()`, and `squad/` refuses those fields afterwards so nothing puts them back. It is also SECURITY.md, SEC-12: it closes a read families have today, and families are not on the app yet.

**Built** (build 116, rules version 15), as written above, with two details. The phone sends the notes there a field at a time and only the fields a write carries (`clubWrites()`), so a whole team saved from a phone that has not read the notes yet, or may not, never wipes them; and notes still on a record from before are moved by the first phone of that team's coach or an admin to open the club (`moveCoachNotes()`: written to `coachNotes` first, then taken off the record, never overwriting a newer note), as `movePlans()` moved old plans. A family's or tracker's phone drops anything of the four it finds on a record. `moveClub` lays them out the same way for a club still on the old tree.

### Club viewers, as built

**Built** (build 118, rules version 17), on `orgs/` only, with these details:

- **A viewer is in `access/index`** like everyone else in the club (the owner, 2026-10-09), and `hasAnyRole()` and the server's `hasRole()` count `access/viewers/{uid}`, so admins' phones and `functions/access.js` keep her there. What keeps her to reading is that no write rule names her and the screen draws every team read-only (`restricted()` is `'viewer'` on every team). The index does open a few reads at the database that her screen never draws, as it does for a parent: training sessions and their bookings, and who is coming (`rsvp`). Members' emails, the access log, the coach's notes and every conversation stay closed, because none of those rules asks the index.
- **Her names come from the squads**, the one read she has beyond the index (`squad/{tid}`, every team), with the coach's notes already off them (`coachNotes/`). A followed game's push names the scorer for her too (`functions/push.js`, `namer()`).
- **Made by an admin**: People (the person's *Club viewer* chip) or an invite for the whole club, which names no team; accepting writes her viewer entry, then her index entry, as every invite does.

**Guests were dropped** (the owner, 2026-10-09): the game link already gives a referee or a scout the game without signing in, and a signed-in guest added a sixth way into a club for little more.

### Order

**Only one thing has to come first: the coach's notes, above.** Every new role reads some part of a child's record or a squad, and none of them may see the notes. After that the four don't depend on each other, so the order is what the club needs first. Recommended:

1. **The coach's notes.** *Built (build 116, rules version 15).*
2. **Supporters**, now called **fans**: the most asked for, and they reuse the coach's approval list families already go through. *Built (build 121, rules version 20).*
3. **Team helpers.** *Built (build 117, rules version 16).*
4. **Club viewers**: the smallest, any time. *Built (build 118, rules version 17).*
5. **Guests.** *Dropped by the owner (2026-10-09): the game link covers a referee or a scout.*

Each is its own build, rules version, CHANGELOG entry and test pass across every suite that walks every kind of account (`rules.js`, `push.js`, `access.js`, `visibility.js`, `roles.js`, `parents.js`, `orgs.js`). Steps 2 to 5 are written for `orgs/` only, after the old tree comes out (step 5 of the move, from 2026-10-23): writing their rules for `workspaces/` as well would be work for a tree nobody is on. Step 1 can go before that, on both trees.

### Decided by the owner (2026-10-09)

1. **Fans:** anyone who can see the player may ask; the team's coach approves. (A coach or admin asking is approving.)
2. **The coach's notes:** coaches and admins only. No one else, families and the player included.
3. **Team helpers:** no family conversations. They help with drills and with planning practices and games.
4. **Club viewers:** no emails, no log. Less than a parent, but they see the games with names.
5. **Guests:** signed in and approved, with names. Not signed in (the game link), no names, as today. *Later the same day: guests dropped; the game link is enough. Viewers go in the index.*
6. **Order:** as above.

## A child in the club, and registration

Written 2026-10-09, before any code, for `GOTSPORT.md`'s build order steps 3
and 4: *the club-level record of each child*, which the move to `orgs/` left
for registration, and then registration itself (programs, the link and the
form, waivers, accepting and placing, care details for coaches, the GotSport
export, deleting). Payments are step 5 and come after; nothing here takes
money, and a fee is shown and recorded the way session fees are today.

The owner's ask, 2026-10-09: *Families will need to register a child with
the club itself, not just as a player on one team, and nothing records that
today. A parent may want to put their kid in for 1-1 or group sessions.
Admins, coaches and parents can register a child. If a coach or an admin
does it, the family confirms it when they join: confirming the information,
and asked for whatever isn't already provided.*

### What is wrong today

A child exists only as `squad/{tid}/{pid}`, a row in one team. So:

- **A child on no team cannot be in the club.** A family who wants 1-1s or a
  group session for her daughter, and nothing else, has nowhere to be: a
  booking is `booked/{sid}/{pid}` carrying `tid`, and the rule finds her
  family through that team's squad.
- **Next season starts from nothing.** A child moving from U11 to U12 is a new
  row typed by a new coach, and everything the family told the club last year
  (her birth date, who to call, her asthma) is not anywhere to carry over.
- **Nothing says the family agreed to anything.** A coach types a name and a
  number; the family never confirms the child is theirs, spelt right, born
  when the team thinks.
- **Two teams are two strangers.** A child guesting up a year, or on a futsal
  team as well, is two unrelated records.

### The child's record

One record per child per club, under the club, beside the squad:

```
orgs/{code}/children/{cid}: {
  id, first, last,              // her name as the family gives it
  born,                         // 'YYYY-MM-DD'
  gender,                       // 'F' | 'M', as the state's registration asks
  guardians/{uid}: how,         // her family: an invite id, a program link id, or true
  self/{uid}: inviteId,         // her own sign-in, as on the squad record
  teams/{tid}: pid,             // where she plays: the squad records that are her
  club: true,                   // in the club: accepted by an admin, or made by staff
  by, at,                       // who made the record, and when
  confirmed: { by, at },        // her family checked it; only a guardian writes it
  via                           // the program link it came through, if one did
}
```

- **The squad record points back**: `squad/{tid}/{pid}/child: cid`. A squad
  record keeps its own id and everything it holds today (the team's name for
  her, her number, positions, games), so nothing that reads `t.players`
  changes. Player ids stay unique across the club; a child on two teams is two
  squad records with one `child`. Existing records get a child each (*Every
  child already here*, below) whose id is the player id, so the common case
  has one id, but nothing relies on that.
- **Her family is named on the child, and copied to each team.** The child's
  `guardians` is where a family is recorded; each squad record's `guardians`
  is kept in step with it, because every rule that finds a family on a team
  (`teamParents`, the squad read, `dm`, `rsvp`, bookings) already reads the
  squad and does so in one hop. The phone writes the child first and the
  squad copies after, and the server keeps the copies (`functions/access.js`,
  the same way it keeps the lookup tables: never starting one that is
  missing, an event late or twice leaving it right). A squad record with no
  `child` keeps its own `guardians` as the source, as today, until it has
  one. The same for `self`.
- **Nothing medical, and no contact details, on the child.** Those are care
  (below), read by fewer people. The child's record is what a coach needs to
  know who she is: name, birth date, gender, family, teams.
- **The coach's notes stay at `coachNotes/{tid}/{pid}`**, per team, as built.

**Who reads it** (`orgs/{code}/children/$cid` has its own `.read`; the list
has none for a family):

| | Her family | The player herself | Any coach | Admins | Anyone else in the club |
| --- | --- | --- | --- | --- | --- |
| `children/{cid}` | Yes, by path | Yes, by path | Yes, the list | Yes, the list | No |

Coaches of any team read every child, as they read every squad (decision 2 of
the move): a coach running a group session books children from any team and
from none. Trackers, helpers, viewers and fans get a child's name from the
squad or the roster as today, and never her birth date.

**Who writes it:**

- **An admin**: any child, any field but `confirmed`.
- **A coach**: makes a record (`by` her, `club: true`), and changes one
  that has a squad record on a team she coaches (`teams/{tid}` names it), but
  not `confirmed`, `guardians` (except through an approval, as the squad
  today) or `self`.
- **A family**: makes a record through a program link (below), with herself
  as its guardian and `club` absent; fills in or corrects her own child's
  fields at any time; and is the only one who writes `confirmed`.
- **Nobody** writes `club` but an admin (accepting) or staff making the
  record. That is what keeps a program link from being a way into the club.

### Finding her children

A family's phone cannot list `children/` and a rule cannot search it, so
each family keeps her own list, at the root:

```
families/{uid}/{code}/{cid}: true
```

Readable and writable by that account alone, and an entry only where
`orgs/{code}/children/{cid}/guardians/{uid}` names her. It is how her phone
finds a child in a club she is not in yet (a registration waiting for an
admin), how a second phone finds it, and how the account-delete function finds
every child of hers in every club. Inside the club, the existing tables still
answer the team questions (`teamParents`); the club question ("is this uid a
family in the club") is answered by the child record itself, below.

### Getting into the club

A family is let into the club (`access/index/{uid}`) only when one of her
children is in it: the index rule gains a clause for **a value that is a
child id** whose record names her in `guardians` and has `club: true`. So:

- **A family registering through a program link is not in the club** until an
  admin accepts a registration of hers. Until then her phone reads the
  program (from the link), her child's record, her registration and her
  care details, and nothing else of the club: not the teams, the calendar,
  the roster or the sessions. A program link may be on the club's website for
  anyone; a practice's time and place are not.
- **A family invited by staff** is in as soon as she accepts, as today.
- **A child on no team** still lets her family in, and that is what lets her
  book sessions (below).

`hasAnyRole()` and the server's `hasRole()` count a child's `guardians` too,
so an admin's phone and `functions/access.js` keep her in the index while
any child of hers is in the club, and take her out when none is.

### Three ways a child is registered

**1. A family, through a program link.** She opens the link, signs in, and
fills the form for each child (*Registration*, below). Her phone writes, in
the order the rules need: the child (herself as guardian, `via` the link,
`confirmed` already, since she typed it), her `families/` entry, the care
details, then the registration with its waiver agreements. If her account is
already the guardian of a child in this club, the form starts from that
child's record ("Mira, born 3 May 2016: still right?") and asks only what the
program asks that isn't known yet. Next season is one tap and the waivers.

**2. A coach or an admin, for a family.** From Squad (*Add a player*, as
today) or from Club → Registrations (*Register a child*, for a child on no
team). Staff type what they know (a name is enough; a number for a team);
the record is made with `club: true`, `by` the staff member, no guardians and
no `confirmed`, and a parent invite is offered for it, as the squad's parent
links are today. The invite names the child (`child: cid`, and `team`/`player`
when she is on one). The record shows *Waiting for her family* until it is
confirmed.

**3. Every child already here.** Each squad record with no `child` gets one,
made from it (the name split into first and last at the last space, the
team's birth year as nothing more than a hint, its guardians and `self`
copied), with the player id as the child id, no `confirmed`, and `club: true`.
Made once, by the server when a club's admin asks (a button beside *Move*,
as `moveClub` was, so a club of four hundred children is batches and not a
phone's evening), and by the admin's phone as the fallback where the functions
are not deployed.

### The family confirms

Whenever a family's phone holds a child of hers with no `confirmed`, the
first screen it shows (once, then a card on My players until it is done) is
**Check {name}'s details**:

- what the club already has, each field with *Change*: name, birth date,
  gender, her team and number (read-only: the coach's);
- **only what is missing, asked for**: birth date and gender if not known,
  care details (who to call, and anything a coach must know: "none" is an
  answer), and the club's waivers she has not agreed to;
- **Confirm**, which writes the missing fields, the care details, the
  agreements and then `confirmed: { by: her, at }`.

Confirming is the family's alone: the rule refuses `confirmed` from anyone
who is not in `guardians`. Staff see who has and who hasn't (a dot on Squad,
a count on Registrations) and can send the link again; nothing is blocked by
it. A child is never unconfirmed again once confirmed: a family changing a
field later is a change, not a new confirmation, and staff changing a field a
family gave is shown to the family as *changed by the club* on her card.

This is also how a staff-made registration for a program is finished (*Staff
registering for a family*, below), and it is the answer to "the coach typed
her name wrong": the family fixes it, and the team's name for her follows if
the team's is the same as it was.

### Care: what a coach needs at the pitch

```
orgs/{code}/care/{cid}           the family's, the source
  { contacts: [ { name, phone, rel } ],   // who to call, her guardians first
    medical, allergies, meds,             // free text, each up to 500 characters; '' is "none"
    doctor?, by, at }
orgs/{code}/teamCare/{tid}/{pid}  a copy, per team she is on, for its coaches
```

- **Read by:** her family and the player herself (the source); admins (both);
  **that team's coaches** (the copy). Not other teams' coaches, not
  trackers, helpers, viewers or fans. A rule on `care/{cid}` cannot ask "a
  coach of any team she is on" without searching, which is why the coaches'
  copy is per team, as `GOTSPORT.md` planned.
- **Written by:** her family (the source) and an admin. The copy is the
  server's, kept from the source and the child's `teams` (`functions/access.js`),
  and an admin's phone writes it on placing as the fallback. A coach never
  writes care: what she learns at the pitch she tells the family or an admin.
- **Never in a game, a squad, a roster, `public/`, a backup a coach makes, or
  a push.** `test/` stringifies each with a medical note and a phone number
  typed into every field.

### Registration

```
orgs/{code}/programs/{progId}: {
  id, name, kind,               // 'season' | 'camp' | 'tryout' | 'sessions' | 'other'
  born: [lo, hi] | null,        // birth years, inclusive
  gender: 'F' | 'M' | null,
  opens, closes,                // 'YYYY-MM-DD'; closes may be null
  cap, fee, feeNote,            // fee is shown, not taken (payments are step 5)
  asks: { {qid}: { q, kind: 'text' | 'choice' | 'yes', opts?, need, o } },
  waivers: { {wid}: true },     // the club's waivers this program needs
  link, by, at, closed?
}
orgs/{code}/waivers/{wid}: { id, title, v, text, need: 'club' | 'program', at, by }
orgs/{code}/waivers/{wid}/old/{v}: { text, at }       // every earlier version, kept
orgs/{code}/regs/{progId}/{cid}: {
  st, by, at,                   // st below; by is whoever made it
  answers: { {qid}: value },
  team?, note?,                 // where an admin placed her; the admin's note (admins only see it)
  agreed/{wid}_{v}: { by, at, name }   // append-only: who agreed, when, the name typed
}
regOpen/{linkId}: {             // the program link: readable by id, like invites/{id}
  ws, prog, name, kind, born, gender, opens, closes, fee, feeNote, asks,
  waivers: { {wid}: { title, v, text } }, club, badge, until
}
```

- **One registration per child per program**, keyed by the child, so a family
  reads her own by path (she knows her children and the program) and an
  admin reads the program's list. Registering twice is changing one.
- **How it stands (`st`):** `draft` (staff made it, waiting for the family),
  `sent` (the family's, waiting for an admin), `accepted`, `waitlist`,
  `declined`, `placed` (on a team: `team` says which), `withdrawn`. Only an
  admin moves it past `sent`; a family moves her own from `draft` to `sent`
  (confirming) and from anything to `withdrawn`.
- **Waivers are the club's text, versioned, and agreed by a family only.** An
  agreement is `agreed/{wid}_{v}`, written once by a guardian of that child in
  her own name and never changed; a new version of the text asks again. A
  waiver whose `need` is `club` is asked once per child (on confirming and on
  the first registration) and recorded on her care record's sibling,
  `orgs/{code}/agreed/{cid}/{wid}_{v}`, in the same shape; a program's are
  recorded on the registration. Staff cannot agree for a family, which is why
  a staff-made registration is a `draft`.
- **The program link** is `regOpen/{linkId}`, written by an admin's phone
  whenever the program is opened or changed and deleted when it closes. It
  carries the program as a family who is not in the club yet needs it and
  nothing else: no team, no child, no name but the club's. Its id is from
  `randId()`, and `test/ids.js` traces it there. A family's child record names
  the link in `via`, and the rule on making a child through a link checks that
  the link is this club's, open, and not past `until`.
- **Who reads a registration:** her family (by path) and the admins. Not
  coaches: what a coach needs comes to her as the squad and the care copy once
  the child is placed (`GOTSPORT.md`, *Who reads what*).

**Staff registering for a family.** A coach or an admin may put a child into a
program from the child's page (*Register for…*): the registration is a
`draft` with what staff know, and the family is asked to finish it: the
missing answers and the program's waivers. On her phone it is the same
*Check her details* screen, with the program's questions and waivers added,
and *Send* makes it `sent`. Staff can see a draft and send the family's link
again; they cannot make it `sent`.

### Accepting and placing

Club → **Registrations** (admins): each program's list, newest first, filtered
by how they stand, birth year and gender, each with the child's details, the
answers and the waivers agreed, and a dot where the family has not confirmed.

- **Accept**, **Waiting list**, **Decline** write `st` (and, the first time a
  child of that family is accepted, `club: true` on the child, and the
  family's `access/index` entry: the child id). A family is told on her
  registration, and by push until email is built (`functions/news.js`
  gains the kind).
- **Place on a team** (accepted children, a team picker narrowed by the
  program's birth years): the squad record (a new player id, her name as the
  child's first name, `child`, the guardians copied, a number left for the
  coach), the child's `teams/{tid}`, the roster, `teamParents`, the care copy,
  then `st: 'placed'` and `team`. One child, one team at a time; several
  ticked are several of those. The coach sees the new player on Squad with a
  dot until she gives a number.
- **A sessions program** (kind `sessions`) places on no team: accepting is all
  it needs, and the child books sessions from then on (below).

### Sessions for a child on no team

A booking for a child on no team is `booked/{sid}/{cid}` with `child: true`
in place of `tid`; the rule finds her family through
`children/{cid}/guardians` instead of a squad. Everything else about a
booking is unchanged (a family writes only `asked` or `out`; the server books
a coach's time, `functions/book.js`, checking her the same way). Fees,
packages and the register key by player id today; for a child on no team
they key by her child id, which for every child already here is the player id
anyway, and `packs/{tid}/…` and `packuse/{tid}/…` take `club` in place of a
team id. A child on a team books as her team's player, as today.

### The GotSport export

Club → Registrations → a program → **Export for GotSport**: one row per
placed (or accepted) child, as a CSV, with the columns the bulk import already
reads from a registration system's roster (`team`, `birth_year`,
`player_first_name`, `player_last_name`, `player_number`) and the ones a state
registration needs (`player_dob`, `player_gender`, `parent1_first_name`,
`parent1_last_name`, `parent1_email`, `parent1_phone`). Admins only, built on
the phone from what an admin reads, never through the server, and it says
before saving that it holds birth dates and contact details. The column names
are matched to GotSport's own import template when the owner has one
(`GOTSPORT.md`, still open); until then this is the shape it is checked
against.

### Deleting

- **A family deletes a registration** (*Delete* on it): the registration and
  its agreements go. If the child has no other registration, no team and was
  made through a link, the child's record and care go too, and her
  `families/` entry. A placed child stays on her team: the team's record of
  her games is the club's; the family asks the club to take her off.
- **A family deletes her account** (Your account → *Delete my account*, which
  says what it takes, every club by name, before she confirms): a function on
  Firebase Auth's delete (`functions/forget.js`) reads `families/{uid}` and
  `userOrgs/{uid}` and, in every club: takes her out of every child's and
  squad record's `guardians` (and `self`, and `fans`), every lookup table, the
  index, `members`, `names`; and deletes her own `people/{uid}`,
  `pushTokens/{uid}`, `userLibrary/{uid}`, `families/{uid}`, `userOrgs/{uid}`.
  A child left with no family is taken off her team (`active: false`, so
  past games keep her name and number), and her record, care and
  registrations are **kept for the admins to decide**: marked `left: { at }`
  and listed on Registrations under *Left the club*, with *Delete* beside
  each (owner, 2026-10-09: it saves a mistaken delete, and the club may need
  the information). Her own phone numbers in a care record's contacts go
  with her. What she wrote to others (messages, notices) stays, as it would in any group chat. The
  phone deletes the Firebase account itself (the only thing it can), after
  signing her out of push; the function does the rest from the delete event.
- **An admin deletes a child** (a child on no team, or one taken off every
  team): the record, its care, agreements, registrations and her `families/`
  entries, server-side, by the same function's per-child half.

### What does not change

- **Squads, rosters, `teamParents`, `coachNotes`, games and answers** keep
  their shape. `t.players` is assembled as today; a squad record gains
  `child` and nothing else.
- **The team link and the parent invites** still work; each writes the
  child's `guardians` beside the squad's.
- **Nothing here is under `workspaces/`.** Every club is on `orgs/`; the old
  tree comes out from 2026-10-23. Registration is written for `orgs/` only.
- **Nothing here reaches `public/`**, not even counts.

### Order

1. **The child's record**: rules (version 21), the squad's `child`,
   `families/`, the index clause, the server keeping guardians and the
   lookup tables, *every child already here*, staff making a child with a
   parent invite that names her, the family's *Check her details*. Usable on
   its own: every family confirms her child, and next season has something to
   start from. *Built (build 122): see *Step 1, as built*. The invite naming
   a child on no team is in the rules; making one from the screen comes with
   Registrations (step 3).*
2. **Care details** for coaches (the source, the per-team copy, the server
   keeping it). *Built (build 123, rules version 22): the family gives up to
   two people to call and allergies, conditions, medication and a doctor on
   the same *Check her details* screen (someone to call is insisted on before
   she confirms); `careCopy` and the child's `teams` keep each team's copy,
   and her family's phone writes them too; her team's coaches see it on her
   page in Squad, with a link to ring; an admin's backup leaves it out.*
3. **Programs, the link, the form and waivers**, and Registrations for
   admins: accepting, the waiting list, declining.
   *Built (build 124, rules version 23), with these details: every waiver
   is a program's for now (the club-wide waiver asked once per child, at
   `agreed/{cid}`, is not built); agreements live at
   `agreed/{progId}/{cid}/{wid}_{v}` beside the registrations rather than
   inside them, so a family rewriting her registration can never remove one;
   a registration keeps who started it (`by`) and who sent it (`sentBy`);
   `programs/{id}/closed` and deleting the link close it, and the rules
   check both; the form needs a signal and writes straight to the club, in
   the rules' order (`sendReg()`); dates are the app's to hold, the rules
   check only `closed`. A family in the club sees an open program her child
   fits, and a draft to finish, on My players.*
4. **Placing on a team**, and **sessions for a child on no team**.
   *Built (build 125, rules version 24): an accepted child's sheet offers
   the teams within a year of her birth year; placing writes the squad
   record (her first name, no number, `child`, her family as its parents),
   then her record's `teams`, her family's copies, `teamParents` and the
   registration (`placed`, `team`); her care details follow her to the team
   through the server (`careCopy` wakes on the child's teams). The player id
   is her child id unless that is taken. A child in the club on no team
   books as `club` (`tid: 'club'` on a booking, `packs/club/…`), the rules
   and `functions/book.js` finding her family on her club record; the
   sessions screens draw her as a team of her own, in memory only.*
5. **The GotSport export.** *Built (build 126): the columns above, a placed or accepted child a row,
   the family's phone from her care details (read one child at a time), a
   cell a spreadsheet would run as a formula made text, and a warning before
   it saves.*
6. **Deleting**: a family's registration, an admin's child, and the
   account-delete function.
   *Built (build 127, rules version 25), with these differences from the
   above. The account is forgotten on a request she writes herself,
   `forgetRequests/{uid}` (only she may), answered by `forgetMe`
   (`functions/forget.js`), and only then does her phone delete the
   sign-in: a trigger on Firebase Auth's own delete would need the v1
   functions API and a sign-in the server can no longer ask about. It is
   refused while she is a club's only admin. Care details stay with a child
   left with no family (the contacts are the family's words, and the admins
   decide about the record as a whole). A family deleting her registration
   deletes the child only when the club never let her in and she is on no
   team; one the club let in is the admins' to delete.*

Each is its own build, rules version, CHANGELOG entry and test pass across
every suite that walks every kind of account. New suites: `children.js` (the
record, confirming, every way in), `care.js`, `register.js` (programs, the
form, waivers, accepting, placing, the export), `forget.js` (deleting, on the
fake server).

### Step 1, as built (build 122, rules version 21)

The child's record, with these details where the build differs from the
above:

- **Her family on a team is a copy, never written by hand.** The child's
  `guardians` and `self` hold each squad record's, valued with the team id.
  The rule lets anyone signed in write one only while that team's squad
  record of this child names her, and take one away only once it doesn't, so
  a copy can never claim more than the squad says and nobody has to be
  trusted to keep it. A family named on the child herself is a separate list,
  `family/{uid}`, written by her with an invite naming the child (`child` on
  a parent invite, which may then have no team). Placing a child on no team
  copies `family` into the squad (step 4).
- **Who keeps the copies:** the server on every squad record change
  (`rosterPlayer`, now also `syncChild()` in `functions/access.js`), any
  admin's or coach's phone on connect (`syncChildren()`), and a family's own
  phone for herself, which is what first lets her read the record.
- **Every child already here is made by an admin's phone, or the server,
  without a button.** Each squad record with no `child` gets one: the
  pointer first (the rule on a child's `teams` checks it), then the record,
  under the player id, `by: 'club'`, unconfirmed. Both make the same record
  (`childFrom()`). Written straight to the database, not through the outbox,
  like the lookup tables: it is made again on every connect, and a club whose
  rules are older should not be told on every screen.
- **A coach adding a player registers her**: the squad record with `child`,
  then the child (`by` the coach), once the squad write has landed.
- **The index** counts a family named in `family` on a child with `club:
  true` (`hasAnyRole()`, the server's `hasRole()`, and the index rule's new
  clause, whose value is the child id). Her squads' copies are counted
  through the squads, as before.
- **Her own list** (`families/{uid}/{code}/{cid}`) is written when she
  confirms, and listened to, not waited on, so a phone finds a child of hers
  on no team.
- **Asked for in step 1:** name, birth date and gender. Care details and
  waivers join the same screen in steps 2 and 3.
- **The backup** (*Download a copy*, admins) carries the children's records;
  restoring one does not write them yet.

### Decisions for the owner

Recommended answers in bold; each changes the rules, so they are settled
before step 1. **All five decided by the owner, 2026-10-09**: 1, 2, 3 and 5
as recommended, and 4 differently (below the list).

1. **Who reads a child's birth date:** **coaches of any team and admins**, as
   they read every squad; or admins and her own team's coaches only, which
   needs the copy-per-team shape care uses.
2. **Who reads care details:** **that team's coaches and the admins**; or
   helpers on that team too (a team manager handling a call at the pitch).
3. **A sessions-only registration:** **an admin accepts it**, as every
   program; or accepted on arrival by the server, so a family can book the
   same day.
4. **A child left with no family when an account is deleted:** **stays on her
   team by name and number with her games, everything else about her goes**;
   or taken off the team as well.
5. **Children already on teams:** **every one gets a record, and every family
   is asked to confirm** the next time she opens the app; or only children
   added from now on.

On 4 the owner chose neither: *she is taken off the team, but past games
keep her name and shirt number, and her information card is put on the
admins' radar to delete, which saves them from a mistaken delete and keeps
it if they need it.* So nothing about the child is deleted by the account
going; *Deleting*, above, says how.

### Getting families to finish their children's details

Written 2026-10-10, before the code. The owner: *a parent with a child whose
details aren't filled in should be told, close to gatekeeping the app but not
quite: a pop-up asking for it. Admins should later be able to block, to
really get them to fill it all out.* Until now a family was asked once per
phone, then only by a card on My players, so one tap of *Later* was the end
of it.

**What "finished" means.** Her family has confirmed her record, and it has
every detail the club requires. The club chooses which, from a short list:
birth date, gender, someone to call, a doctor (the owner: admins choose).
Birth date, gender and someone to call are ticked until an admin says
otherwise, which is what confirming has always asked. One parent finishing
it finishes it for every parent of that child.

**Who is asked.** Only her family (`guardians` or `family` on her record),
because only her family may confirm. Never a fan, the player's own sign-in,
or staff about children who are not theirs.

**Two settings, the admins'**, at `org/details` (which admins already write
and the club reads: no new rule):

```
org/details: { need: { born, gender, contact, doctor }, by: 'YYYY-MM-DD' | null }
```

- **Remind**, the default (no `by`): a strip on every screen, *Ella's details
  aren't finished — Finish now*, and the pop-up again once a day the app is
  opened, until it is done. *Later* puts it away for the day. Nothing is
  closed.
- **A deadline** (`by`): the same, saying the date, until then. After it, a
  family with a child still to finish sees her calendar, her messages and
  the details screen (My players, Notifications, her settings), and the rest
  of the club only once it is done. The owner: calendar and messages stay
  open, so she still knows where practice is and can ask the coach.

**Never blocked:** anyone with a staff role in the club (an admin, or a
coach, tracker or helper of any team). A coach whose own child's form is
late still runs her game.

**The block is the app's, not the database's.** A rule that shut a family
out of the club would also shut out a phone with no signal, and what she had
typed, and it could not tell a child from a parent who left. Someone who
edits the app's own code in her browser could get past it; no family will.

**Admins** see, on Registrations, how many children have details still to
finish and which (her team, what is missing), and set what is required and
the deadline. A child on no team's *someone to call* is read from her care
details one child at a time, as the GotSport export reads it.

Not in this step: a *Remind* button that notifies a family (needs a server
trigger), and a program's waivers counting towards "finished" (a draft
registration already has its own card on My players).

**Built** (build 129), as written: the strip (`detailsNote()`), the pop-up
once a day (`childCheck()`, the day kept per child at `sm.kidask.v1`), the
screens kept open past the deadline (`detailsBlocked()`, `DETAILS_OPEN`), and
the admins' card at the top of Registrations (`detailsCard()`). Confirming
asks for exactly what the club requires; a child her family confirmed before
the club required a doctor is asked again for that alone. Care details a
phone has not heard yet are never counted as missing (`careKnown()`), so a
slow signal does not shut a family out. `test/details.js`.

## What parents actually see

Worth stating so it is deliberate and not an accident of implementation:

- Their own daughter's minutes, planned versus actual, and positions played.
- The team's scores, results and schedule.
- **Other players by shirt number only.** A parent is not an insider — they get names for their own child, not the roster.

That last line is a decision to revisit with the club, not a technical constraint. Some clubs publish rosters freely; assume they do not until told otherwise.

**Built** (2026-10, build 95): `shownName()` draws her own child by name and everyone else by shirt number (*A teammate* with none) on Stats, Season, Live, the match log and the recap, for anyone who is only a parent in the club. Admins, coaches of any team and trackers see names; so does everyone before the club has an admin. The club's preset above turns it off. `test/parents.js` pins it.

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
3. **Built (build 110), and every club has moved (2026-10-09).** See *The move to `orgs/{orgId}`*: the owner chose the full move (2026-10-08, SECURITY.md SEC-1) to take names out of a parent's reach before registration opens (`GOTSPORT.md`).
4. **Built.** One ruleset; `shareOwners` closed the public write hole, and since build 120 only the server writes `public/` at all (SECURITY.md, SEC-10).
5. **Built.** Team links and the coach's approval list (`joinCodes`, `claims`), per-person invites, and a squad of parent invites at once.
6. **Built.** Parents see their own child by name and the rest by number, the club's one preset, and My players across clubs.
