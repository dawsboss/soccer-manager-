# Glossary — one word per concept

The words the screens use, picked once (UX-REVIEW.md, 2.3; build 145). `test/copy.js`
reads this file: it renders every screen as an admin, a coach, a tracker and a parent and
fails if any word under **Never on screen** appears in what a person sees, or if a label
under **On screen** is drawn as anything else. Change a word here and in `app.js` together;
the suite holds the two to each other.

The rule behind the list: a thing has one name, and the name is the plain one. The code's
own words (`stint`, `owed`, `roster`, `workspace`, `rules`, `index`) stay in the code and
the design documents, where they are precise; the screen gets the word a parent or a club
secretary already has.

## On screen

| Concept | Word | Not |
|---|---|---|
| The bar at the bottom | **Team** · **Calendar** · **Game** · **Messages** · **More** (staff); **Home** · **Calendar** · **Messages** · **More** (a family) | Club, Season, Live |
| A team's own tabs | **Season** · **Players** · **Training** | Squad, Roster, Practice (the tab) |
| Season's own screens (build 146) | **Stats** · **Minutes** · **Attendance** | Players (the minutes table; Players is the tab), Register |
| A game's lineup card | **Lineup** | Snapshots (a snapshot is one picture of it, in prose only) |
| A game's screens | **Live** · **Subs** · **Track** · **Stats** · **Lineup** (**Recap** once it is over; the pitch is a look at Subs) | Plan (the game's), Pitch (as a tab) |
| The people on a team | **players** | squad, roster |
| A family's own screen | **My players** | Home (in prose), My kids |
| Everything with a date | **Calendar** | Schedule, Club schedule, Club calendar |
| A team's training on the calendar | **practice** | session, training |
| A 1-1 or small group that belongs to no team | **session** (**Sessions**, the screen) | Training sessions, 1-1s (alone) |
| The coach's library of drills | **Drills** | Library |
| What a coach plans for a practice | **plan** (**Plans**) | Practice plan (in a label), session plan |
| The club's planning screen for admins | **Planner** | plans |
| Who runs the club | **Club admin** (**admin** in prose) | Org admin, Club administrator |
| The one who can take an admin away | **Club owner** | Owner (alone, the app owner is "the app owner") |
| The club's one place for settings | **Settings** | Your settings, Club settings, Club admin (the screen), Team set-up |
| The club's own details | **Club details** | Club settings |
| A spell on the pitch | **spell** | stint |
| Minutes against the plan | **short** / **over** / **on plan** | owed, planned vs actual (as a label) |
| Possession that was neither side's | **neither side** | scrappy |
| The sort on Subs | **By minutes** / **By number** | By need |
| Staging several changes on Subs | **Several at once** | Batch |
| The sync badge | **Synced** · **Offline** · **Not synced** · **Sign in** | local, this device, no code, sync failed |
| What changed: games and practices moved, club activity (More's first row) | **What's new** | Notifications (the page), Activity |
| Whether her phone pops up or buzzes (Settings → Notifications) | **Notifications** | alerts, the bell |
| A change the club turned down | *That didn't save* | refused by the database, permission denied |

## Never on screen

Each of these is a word from the code, the database or the design documents. The suite
strips the tags from every screen it renders and fails on any of them. A word that must
be said (the rules file an admin pastes, from Check readiness) is said in that one sheet,
which the suite reads separately and allows.

- `Org admin`
- `Firebase`
- `README`
- `lookup table`
- `rules version`
- `database rules`
- `rsvp block`
- `Signed in as`
- `Training sessions`
- `Squad`
- `Roster`
- `stint`
- `scrappy`
- `owed`
- `Unassigned`
- `By need`
- `Batch`
- `Force refresh`
- `workspace`
- `permission denied`

## Said once, not on every screen

- **What her role lets her do** is a card the first time she opens the club on a phone
  (one per account, club and role; *Got it* puts it away) and a line in the account sheet
  and under Settings → You. Never a fixture over every screen (UX-REVIEW.md, 2.4).
- **A refusal** is one sentence: *That didn't save.* Then, for an admin, where to look
  (Check readiness, under Settings → Advanced); for anyone else, *tell the club admin*;
  and whether it is kept on this phone.
- **The detail behind a label** is an ⓘ that opens a sheet (`INFO` in `app.js`), not a
  paragraph under the label.
