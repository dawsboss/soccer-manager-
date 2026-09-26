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
- **Lock in the plan, and let the tracker call the subs.** *Lock in* on the Plan tab freezes the snapshots and says whether the club has them or only this phone does. The Track and Live tabs then count down to each planned change on the half clock, turn loud when it is due, and make every change with one tap (*Subs are on*) at the minute it is pressed — undoable for two minutes, or *Not now* if the change is not happening. A tracker gets the time and how many subs, never the names, and cannot make any other sub.
- **Tell the bench.** Each change written as the calls a coach makes at the bench: who goes on, at which spot and for whom, who switches spots, who comes off, and the starting lineup spot by spot at kick-off. It works from the pitch as it really is, so hand-made subs are accounted for. *Copy as a message* sends it to an assistant, and the *Bench sheet* lists every change in the game.
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
    "workspaces": {
      "$code": {
        ".read": true,
        ".write": true
      }
    },
    "public": {
      "$share": {
        ".read": true,
        ".write": "!newData.exists() || newData.hasChild('team')",
        "team": {
          ".validate": "newData.hasChild('name')"
        },
        "games": {
          "$g": {
            ".validate": "newData.hasChild('status')"
          }
        }
      }
    },
    "invites": {
      "$id": {
        ".read": "auth != null",
        ".write": "auth != null && ((!data.exists() && newData.child('by').val() === auth.uid && root.child('workspaces/' + newData.child('ws').val() + '/access/admins/' + auth.uid).exists()) || (data.exists() && !newData.exists() && (data.child('used/by').val() === auth.uid || root.child('workspaces/' + data.child('ws').val() + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + data.child('ws').val() + '/access/teamIndex/' + data.child('team').val() + '/' + auth.uid).val() === 'coach')))",
        ".validate": "newData.hasChildren(['ws', 'team', 'role', 'by', 'expiresAt']) && (newData.child('role').val() === 'coach' || newData.child('role').val() === 'tracker' || (newData.child('role').val() === 'parent' && newData.hasChild('player')))",
        "used": {
          ".write": "auth != null && !data.exists() && newData.child('by').val() === auth.uid && data.parent().child('expiresAt').val() > now && (!data.parent().child('email').exists() || (auth.token.email_verified === true && auth.token.email.toLowerCase() === data.parent().child('email').val()))"
        }
      }
    },
    "clubInvites": {
      "$code": {
        ".read": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()",
        "$id": {
          ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()",
          "used": {
            ".write": "auth != null && !data.exists() && data.parent().exists() && newData.child('by').val() === auth.uid && root.child('invites/' + $id + '/used/by').val() === auth.uid && root.child('invites/' + $id + '/ws').val() === $code"
          }
        }
      }
    },
    "userOrgs": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        "$code": {
          ".write": "auth != null && ($uid === auth.uid || root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists())"
        }
      }
    }
  }
}
```

Lock them down once people have signed in — see **Locking it down** below.

4. On the app owner's device: Setup → Workspace → *Connect to a workspace* → *Make one up* → *Save and reload*. That creates the club. Nobody else types the code: everyone else joins with an invite link — see **Joining a club** below.

The three root blocks in these rules (`invites`, `clubInvites`, `userOrgs`) are what invites need. They are identical in the locked-down set, so an invite made today keeps working after lockdown.

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

## Joining a club

Clubs are invite only, and there is no code to type.

1. A club admin opens **People → Invite someone**, picks Coach, Tracker or Parent (and which player, for a parent), and optionally an email address.
2. The app makes a link — `…/?invite=<id>` — to copy, share, or, with an email, have Firebase send as a sign-in email.
3. The person opens it on their phone, signs in, and sees *Join Lakeside SC as coach of Flight*. **Accept** gives them the role and opens the club. That is the whole of it for them.

Each invite works **once**, for **one account**, and expires after **14 days**. With an email address on it, only that (verified) address can accept it; without one, whoever opens the link first gets the role, so send it somewhere private. The admin sees each invite under People — waiting, joined, or expired — and can withdraw one that has not been used. Withdrawing a role later also deletes the invite it came from, so it cannot be spent again.

The invite shows the club, the team and who sent it — never a child's name. A parent invite names the player by shirt number, because a link gets forwarded.

**A second device** needs no invite. Once someone has joined, signing in on a device with no club open finds the club from their account (`userOrgs`) and opens it; with more than one, they are listed under the club switcher. Anyone who joined before this existed gets that list filled in the next time they open the club.

Two limits worth knowing:

- **Firebase words the sign-in email itself.** It reads as "sign in to …", not "you are invited" — a text to say it is coming saves a confused parent.
- **An invite belongs to the database it was made in.** One made in a test database only works on a device pointed at that database.

## Deleting a club

Every device that ever opened a club keeps a full local copy so the app works offline at a field with no signal. That copy is a **cache, not an archive**, and three things end it:

- **Retired** — an admin marks the club closed. Every device clears its local copy, the app owner's included. The data stays in the database and the app owner reopens it from the archive whenever. Retiring deletes nothing.
- **Access withdrawn** — the rules refuse a device for more than 24 hours. The delay is deliberate: a botched rules change would otherwise wipe a coach's offline copy before anyone noticed.
What this does not cover, and nothing can: a copy someone deliberately exported. That is true of every app that works offline. What it does mean is that the default is self-cleaning rather than a roster of children sitting on a stranger's phone forever.

Someone who wants a record of a season should take one with **Download a copy**, deliberately. A stale cache is not a keepsake and should not be treated as one.

There is no in-app delete for a whole club, deliberately — it would be one mistap from wiping a season. It is four places, in this order:

0. **Retire it.** Club settings → *Retire this club*. Do this **first**: it writes the marker that tells other devices to let go. Nothing is deleted — the app owner sees retired clubs listed under Club settings and can still open and export any of them, indefinitely. Steps 2 and 3 only happen when the app owner decides.
1. **Export first.** Open the club, Settings → *Download a copy*. Do this even for a club you are sure is empty.
2. **Delete the data.** Firebase console → Realtime Database → Data → expand `workspaces` → hover the code → the **×** deletes that node and every team, game and minute under it.
3. **Delete its published mirror.** Under `public`, find the share id that club was using and delete that node too. **This is the one people forget.** Removing `workspaces/<code>` does not touch `public/<share>`, and the mirror is the world-readable half — an orphaned one keeps serving an old scoreboard to anyone holding the link. If you no longer know which share id belonged to which club, the mirror carries the team name, so open the nodes and read it.
4. **Forget it on each device.** Club crumb → *Forget*. That clears this browser's local copy so it stops appearing in the switcher. It is per-device, so do it on each phone.

Steps 2 and 3 are permanent and there is no undo, which is why step 1 comes first.

Retirement needs its own block. It is already part of the complete ruleset under **Locking it down** — this is here to explain it, not to paste separately:

```json
"retired": {
  "$code": {
    ".read": true,
    ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()"
  }
}
```

Readable by anyone, because a device that has just lost access still has to be able to learn that it should let go. Writable only by an admin of that club.

## Becoming the app owner

The app owner is the one account that can appoint the first club admin. It is stored in the database, **not** in this repository — a personal email committed to a public repo gets scraped, stays in the history forever, and needs a deploy to change.

1. Sign in to the app. Settings → Account shows **Your account id** with a copy button.
2. Firebase console → Realtime Database → Data. At the **root** (not inside `workspaces`), add:

```json
"appOwners": { "<paste your account id>": true }
```

3. The rules keep it readable but never writable from the app. This is already part of the complete ruleset under **Locking it down**; shown here so you can see what guards it:

```json
"appOwners": { ".read": "auth != null", ".write": false }
```

Console-only by design. There is no bootstrap race and no button anyone could press to grant themselves ownership — changing it means having Firebase console access, which is the correct bar.

## Locking it down

The open rules above mean anyone holding a workspace code can read and write everything, names included. Close that once you and at least one other coach have signed in.

### Do this in order. Out of order locks you out.

1. **Back up.** Setup → *Download a copy*.
2. **Sign in** on your own device. Setup → Account.
3. **Claim admin.** Setup → People → *Make me the admin*.
4. **Invite every coach** — People → *Invite someone*, one link each. Accepting one signs them in, connects their device and gives them the role, so they appear in People already assigned.
5. **Give a role to anyone who arrived another way** — Coach or Tracker, in People.
6. **Check readiness.** Club settings → *Check readiness* tells you whether you are in the index, how many accounts are, and whether an app owner exists. **Everything must pass.** An empty `access/index` is the dangerous case: reads still work through the bootstrap clause, but nobody can write anything, so the app goes read-only for the whole club.
7. **Only then** paste the rules below and publish.
8. **Test on both devices** before the next game.

### The rules

**This is the whole thing — paste it as it stands.** It already includes the
`retired` and `appOwners` blocks shown earlier in this file; those appear there
to explain what they are for, not to be pasted on their own. Publishing a
partial ruleset is how a club ends up half locked down.

`node test/rules.js` reads *this* block and checks it. Run it first.

**It is safe to paste before the app has caught up.** Two lookup tables make the
per-team and per-share rules possible — `access/teamIndex` and
`shareOwners/{shareId}` — and neither exists on a club that predates them. So
each of those rules carries a clause that falls back to the old club-wide
behaviour *while its table is missing*, and stops doing so the moment the table
appears. Nothing to sequence, and no way to lock the club out by pasting early.

The app fills both in by itself: an admin's device writes `teamIndex` on its
next connect, and a share claims its owner list on its next publish. **Club
settings → Check readiness** shows whether that has happened. Until every line
there has a tick, the club is locked down but not yet *tightly* — a tracker or
a parent can still write another team's data, exactly as before.

```json
{
  "rules": {
    "workspaces": {
      "$code": {
        ".read": "auth != null && (!data.child('access/index').exists() || data.child('access/index/' + auth.uid).exists())",
        "access": {
          "members": {
            "$uid": {
              ".write": "auth != null && ($uid === auth.uid || root.child('workspaces/' + $code + '/access/index/' + auth.uid).exists())"
            }
          },
          "admins": {
            ".write": "auth != null && (!data.exists() || data.child(auth.uid).exists())"
          },
          "index": {
            "$uid": {
              ".write": "auth != null && (!root.child('workspaces/' + $code + '/access/index').exists() || root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || ($uid === auth.uid && !newData.exists()) || ($uid === auth.uid && root.child('invites/' + newData.val() + '/used/by').val() === auth.uid && root.child('invites/' + newData.val() + '/expiresAt').val() > now && root.child('invites/' + newData.val() + '/ws').val() === $code))"
            }
          },
          "teamIndex": {
            ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()",
            "$tid": {
              "$uid": {
                ".write": "auth != null && $uid === auth.uid && root.child('workspaces/' + $code + '/access/teamIndex').exists() && ((newData.val() === 'coach' && root.child('workspaces/' + $code + '/access/teams/' + $tid + '/coaches/' + auth.uid).exists()) || (newData.val() === 'tracker' && root.child('workspaces/' + $code + '/access/teams/' + $tid + '/trackers/' + auth.uid).exists() && !root.child('workspaces/' + $code + '/access/teams/' + $tid + '/coaches/' + auth.uid).exists()))"
              }
            }
          },
          "teams": {
            ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()",
            "$tid": {
              "$key": {
                "$uid": {
                  ".write": "auth != null && $uid === auth.uid && root.child('invites/' + newData.val() + '/used/by').val() === auth.uid && root.child('invites/' + newData.val() + '/expiresAt').val() > now && root.child('invites/' + newData.val() + '/ws').val() === $code && root.child('invites/' + newData.val() + '/team').val() === $tid && (($key === 'coaches' && root.child('invites/' + newData.val() + '/role').val() === 'coach') || ($key === 'trackers' && root.child('invites/' + newData.val() + '/role').val() === 'tracker'))"
                }
              }
            }
          },
          "org": {
            ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()"
          },
          "log": {
            "$e": {
              ".write": "auth != null && !data.exists() && newData.child('by').val() === auth.uid"
            }
          }
        },
        "teams": {
          "$tid": {
            ".write": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + $code + '/access/teamIndex/' + $tid + '/' + auth.uid).val() === 'coach' || (!root.child('workspaces/' + $code + '/access/teamIndex').exists() && root.child('workspaces/' + $code + '/access/index/' + auth.uid).exists()))",
            "players": {
              "$pid": {
                "guardians": {
                  "$uid": {
                    ".write": "auth != null && $uid === auth.uid && root.child('workspaces/' + $code + '/teams/' + $tid + '/players/' + $pid).exists() && root.child('invites/' + newData.val() + '/used/by').val() === auth.uid && root.child('invites/' + newData.val() + '/expiresAt').val() > now && root.child('invites/' + newData.val() + '/ws').val() === $code && root.child('invites/' + newData.val() + '/team').val() === $tid && root.child('invites/' + newData.val() + '/role').val() === 'parent' && root.child('invites/' + newData.val() + '/player').val() === $pid"
                  }
                }
              }
            }
          }
        },
        "matches": {
          "$mid": {
            ".write": "auth != null && (root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + $code + '/access/teamIndex/' + newData.child('teamId').val() + '/' + auth.uid).exists() || root.child('workspaces/' + $code + '/access/teamIndex/' + data.child('teamId').val() + '/' + auth.uid).exists() || (!root.child('workspaces/' + $code + '/access/teamIndex').exists() && root.child('workspaces/' + $code + '/access/index/' + auth.uid).exists()))"
          }
        }
      }
    },
    "public": {
      "$share": {
        ".read": true,
        ".write": "auth != null && (root.child('shareOwners/' + $share + '/' + auth.uid).exists() || !root.child('shareOwners/' + $share).exists())",
        "team": {
          ".validate": "newData.hasChild('name')"
        },
        "games": {
          "$g": {
            ".validate": "newData.hasChild('status')"
          }
        }
      }
    },
    "shareOwners": {
      "$share": {
        ".read": "auth != null",
        ".write": "auth != null && (!data.exists() || data.child(auth.uid).exists())"
      }
    },
    "retired": {
      "$code": {
        ".read": true,
        ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()"
      }
    },
    "appOwners": {
      ".read": "auth != null",
      ".write": false
    },
    "invites": {
      "$id": {
        ".read": "auth != null",
        ".write": "auth != null && ((!data.exists() && newData.child('by').val() === auth.uid && root.child('workspaces/' + newData.child('ws').val() + '/access/admins/' + auth.uid).exists()) || (data.exists() && !newData.exists() && (data.child('used/by').val() === auth.uid || root.child('workspaces/' + data.child('ws').val() + '/access/admins/' + auth.uid).exists() || root.child('workspaces/' + data.child('ws').val() + '/access/teamIndex/' + data.child('team').val() + '/' + auth.uid).val() === 'coach')))",
        ".validate": "newData.hasChildren(['ws', 'team', 'role', 'by', 'expiresAt']) && (newData.child('role').val() === 'coach' || newData.child('role').val() === 'tracker' || (newData.child('role').val() === 'parent' && newData.hasChild('player')))",
        "used": {
          ".write": "auth != null && !data.exists() && newData.child('by').val() === auth.uid && data.parent().child('expiresAt').val() > now && (!data.parent().child('email').exists() || (auth.token.email_verified === true && auth.token.email.toLowerCase() === data.parent().child('email').val()))"
        }
      }
    },
    "clubInvites": {
      "$code": {
        ".read": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()",
        "$id": {
          ".write": "auth != null && root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists()",
          "used": {
            ".write": "auth != null && !data.exists() && data.parent().exists() && newData.child('by').val() === auth.uid && root.child('invites/' + $id + '/used/by').val() === auth.uid && root.child('invites/' + $id + '/ws').val() === $code"
          }
        }
      }
    },
    "userOrgs": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        "$code": {
          ".write": "auth != null && ($uid === auth.uid || root.child('workspaces/' + $code + '/access/admins/' + auth.uid).exists())"
        }
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
- **`access/org`** is the club name and badge, so it follows the admin rule.
- **`access/log`** is the audit trail. Writes are allowed only where nothing exists yet and the entry stamps the author's own uid, which makes it append-only: nobody can edit or delete a record of what they did, including an admin.
- **`invites/$id`** is the invite itself. Readable by any signed-in account that knows the id — the id is the secret, and nobody can list the node. Only an admin of the club it names can create one; it cannot be edited, only spent or deleted. **`used`** can be written once, by whoever spends it, before it expires, and only by the address it was sent to if it names one (verified addresses only).
- **The role an invite grants** is written by the person accepting it, each write checked against the spent invite: `access/teams/$tid/coaches|trackers/$uid`, or `teams/$tid/players/$pid/guardians/$uid` for a parent, then `access/index/$uid`. The value written is the invite id, because that is what the rule looks up. Exactly the role the invite names, on the team it names, for the account that spent it, and only until it expires.
- **`access/teamIndex/$tid/$uid`** can also be written by that account itself, as `coach` or `tracker`, only if it really is on that team in `access/teams` — and never as the first entry of a missing table, because that would close the bridge on everyone else in one write.
- **`clubInvites/$code`** is the admin's list, readable only by admins. It lives outside the workspace on purpose: everyone indexed can read the whole workspace, and a list of unspent coach invites in a parent's hands is a parent who can make herself a coach.
- **`userOrgs/$uid`** is which clubs an account belongs to, so a second device finds them without a code. Only its owner reads it. It is a list of bookmarks, not a grant: reading a club is still `access/index`'s decision.
- **`public/$share`** stays world-readable — that is the whole point of the parent links — but writing now needs an account. That closes the hole where anyone holding a share link could overwrite the scoreboard.

### If it goes wrong

Paste the open rules from step 3 back in and publish. Access returns immediately; nothing is lost. The app also detects the refusal and shows a sign-in screen with a way to change account or workspace code rather than a broken page.

### What is still not enforced

Per-team roles. Any indexed person can currently write any team's data — the index is workspace-wide, not per-team. A tracker's restrictions are enforced in the interface only. Tightening that needs a per-team index (`access/teamIndex/{teamId}/{uid}`) and is the next step, not this one.

## Trying auth changes without risking the season

Three things, in increasing order of isolation. Use the cheapest one that covers
what you are changing.

### 1. `node test/rules.js` — the rules, offline

Reads the rules JSON out of this file and evaluates it against a mock club for a
signed-out visitor, an admin, a coach, a tracker, a parent, a registered account
with no role, an unknown account and the app owner. No Firebase, no cost, and
nothing to publish. **Run it before pasting anything into the console.** It is
the only way to find out that a rules change locks everybody out *before* it
does, because the failure "Locking it down" warns about is silent: reads keep
working through the bootstrap clause while every write is refused.

It also prints, at the end, the places where the interface and the rules
currently disagree. Those are known and deliberate; read them before deciding a
refused write is a bug.

### 2. A test club — the flows, on invented data

**Setup → Workspace → Make a test club** (app owner only). Seeds a club called
Sandbox FC: two squads, invented names, four games with one in progress, and
three people waiting in `access/members` with no roles yet. That is exactly the
state a real club is in when the lockdown steps above begin, so you can rehearse
all of them — claim admin, grant and withdraw roles, check readiness, get
refused, retire it — on data nobody cares about.

A test club carries a warm banner on every screen, and **publishing is switched
off inside it**, so a seeded game can never overwrite a `public/` node that real
families are reading. It lives in whichever database you are pointed at, under a
code beginning `test-`; delete the node in the console when you are done.

What it does **not** cover is a rules change. Rules belong to a database, not to
a club: the locked-down block is written against `workspaces/$code`, so
publishing it to try it on a test club applies it to the real club at the same
instant. Nor can you carve a stricter sandbox out of an open wildcard — a rule
grants, and nothing below it can take that back.

### 3. A second database — everything, including rules

**Setup → Workspace → Database** switches which Firebase database the app talks
to. Declare them in `firebase-config.js`:

```js
window.SOCCER_FIREBASE_ENVS = {
  sandbox: { databaseURL: "https://your-project-sandbox.firebaseio.com" }
};
```

An entry overrides only the keys it names.

- **A second Realtime Database in the same project** needs a `databaseURL` and
  nothing else. It has **its own rules**, which is the point, and keeps the same
  Auth, so accounts and uids carry over and you can rehearse with the real
  people. Requires the Blaze plan — the free Spark plan allows one database.
- **A separate Firebase project** works on Spark, but needs the whole config
  object and has its own Auth. Different uids, so `appOwners` has to be set
  again in that project's console and everyone signs in afresh.

Each database keeps its own local copies on the device, so the same code opened
in two of them can never overwrite the other's. Switching reloads and forgets
the open code, because a club belongs to the database it lives in.

## How long share links last

**Forever, until you change them.** There is no expiry. A link keeps working as long as its share id exists.

Three things end one:

- **Rotate** — Share → *Make a new link and kill the old one*. Every link previously sent stops working immediately.
- **Retire the club** — the mirror stops being updated, so it freezes at the last published state rather than going away.
- **Delete `public/<share>` in the console** — the link goes dead.

For a season that is usually what you want: text it in September, it works in May. If a family leaves mid-season, rotate and re-send to everyone else. An expiry date per link is worth adding when someone actually needs it — see ROADMAP.

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
                        plan:      { blockMinutes, blocks: [ { start, ids[], assign } ], projected,
                                     manual, locked: { at, by, byName } },  // any rewrite unlocks
                        planDone:  { s{start}: { t, at, by, byName, made[], prev, pos, skipped } } }
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

Setup → *Download a copy* writes the whole store to JSON. *Load from a file* adds whatever teams and games the club is missing and keeps everything already there; it never replaces the club wholesale, and never touches who has access.

## Bulk import

Admin → *Import teams and games* takes a season at once — teams, rosters, fixtures and past results — as one JSON file, chosen or pasted. *Check it* shows what it will do and every problem, line by line, before anything is written; nothing is written while an error is left.

```json
{
  "teams": [{
    "name": "Lakeside Thunder G12",
    "players": [
      { "name": "Ada Lovelace", "number": 1, "gk": true },
      { "name": "Bea Smith", "number": 7, "position": "Forward", "also": ["Wing"], "rating": 4 },
      { "name": "Cleo Jones", "number": 10, "position": "Mid", "maxStint": 20, "note": "Strong left foot" }
    ],
    "games": [
      { "opponent": "Riverside", "date": "2026-09-06", "kickoff": "10:00", "venue": "Lakeside Park",
        "periods": 2, "minutes": 30, "side": 9, "score": "3-1", "scorers": [7, 7, 10] },
      { "opponent": "Northgate", "date": "2026-10-04", "kickoff": "09:30", "side": 9, "shape": "3-3-2" }
    ]
  }],
  "games": [
    { "team": "Lakeside Thunder G12", "opponent": "Hill End", "date": "2026-10-11" }
  ]
}
```

- **Only `name` (team, player) and `opponent` (game) are required.** Everything else is optional and defaults to what the app would give it by hand.
- **Player fields:** `number`, `gk`, `position` (GK, Back, Mid, Wing, Forward — "defender", "striker" and the like are understood), `also` (a list of positions), `rating` (1–5), `maxStint` (minutes), `note`, `active`.
- **Game fields:** `date` (`2026-10-04`), `kickoff` (`09:30`), `venue`, `periods` (2 or 4), `minutes` (per period), `side` (5, 7, 9 or 11), `shape` (a preset like `4-3-3`, or a shape the team has saved), `veo`, and for a game already played `score` (`"3-1"`) with optional `scorers` (shirt numbers or names, one per goal).
- **Games can sit under their team, or in a top-level `games` list with a `team` name** — whichever the spreadsheet exports more easily.
- **It merges, it never replaces.** A team is matched by name, a player by name within the team, a game by team, date and opponent. A match gets only the fields the file gives; nothing is deleted. Running the same file twice changes nothing.
- **A past result is a score, not minutes.** It becomes goals at 0:00 and a finished game, so the season record adds up; nobody's minutes are invented. A game that already has goals recorded keeps them.
- The file holds children's names, so treat it like the roster. Names never reach the parent pages.
