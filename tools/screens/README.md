# Every screen, as a phone draws it

The rig behind the UX reviews (`UX-REVIEW-3.md`, round 4, was the first captured with it). It
seeds an invented club from the app's own sandbox builders, opens the real `index.html` in a
headless Chromium at 390×844 as one person, with the club's database out of reach (a phone with no
signal, drawing from its own copy) and the clock fixed, and taps through every screen that person
can reach. Each step leaves a screenshot, the whole scrolled page, the screen's HTML, and an
inventory of every tappable thing on it (label, class, action, size, colours), so a review can cite
a control by its measurements rather than by squinting.

Needs Playwright with its Chromium (`npm i -D playwright && npx playwright install chromium`, or
whatever path the `require` fallback in `shoot.js` names) and Python 3 for the index. Nothing here
is a test; `node test/run.js` does not run it.

```
cd tools/screens
node gen-club.js quiet quiet.json       # Wednesday evening: practice tomorrow, game Saturday
node gen-club.js live live.json         # Saturday, a game 38 minutes in
node gen-club.js details details.json   # the club still wants her child's details confirmed
python3 -m http.server 8765 --bind 127.0.0.1 --directory ../..   # the site, in another shell
node shoot.js quiet.json mum shots/mum-quiet family   # personas: mum dad nan kid jaz boss anon newbie signedout
node shoot.js live.json mum shots/mum-live live       # tours: family live staff landing anon scheduler subs
node shoot.js live.json jaz shots/jaz-subs subs       # the coach subbing: the list, the pitch, and the sheet either opens
node gen-club.js quiet quiet.json fields && node shoot.js quiet.json boss shots/boss-sched scheduler   # the Scheduler's board, with fields and permits on the club
node render-states.js && node shoot-states.js shots/onboarding   # invite, team link, registration, share pages
python3 index.py                        # INDEX.md: every capture by persona and step
```

`gen-club.js` shapes the club per phone the way `orgs/{code}` is read (a family's phone holds her
own child's record, the rest of the squad by number, staff names only, no log); change the people
or the fixtures there. `shoot.js` is the tours: add a step as a tap and a `capture()`; a tap that
finds nothing for that role is written to the manifest as a `MISS`, which is itself a fact worth
knowing. `render-states.js` draws the states a signed-out or not-yet-in phone meets through the
test harness and `shoot-states.js` drops them into the page shell, and serves the share pages
(`live.html`, `game.html`) the app's own `publicDoc()`/`fixtureDoc()` through a fake SDK.
