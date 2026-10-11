# Hosting

The site is served by GitHub Pages at `teamplayhq.com`. This file is the to-do
list of everything the owner has asked for that GitHub Pages cannot do, and the
plan for the move that would make them possible. **On hold** (the owner,
2026-10-11): Pages does the job today; this list is so nothing asked for gets
lost while it waits.

When a request can't be done on GitHub Pages, add it under *Waiting on the
move* below: what was asked, why Pages can't do it, and what it needs once
the move is made. Don't build a workaround that a second host would duplicate
(CLAUDE.md: no Cloudflare Worker doing a function's job).

## What GitHub Pages cannot do

It serves the files in the repository exactly as they are. Nothing decides per
request what to send back.

- **No rewrites.** `/team/abc/season` cannot be sent to `index.html`, so it
  would 404 on a reload or a shared link. That is why addresses are
  `#/team/…`. (A `404.html` that redirects to the hash works, but every deep
  link passes through a "not found" first.)
- **No headers of our own.** The Content-Security-Policy is a `<meta>` tag,
  which cannot carry `frame-ancestors`, so nothing stops another site framing
  the app. No `X-Frame-Options`, `Permissions-Policy`, HSTS preload or
  `Cache-Control` (Pages caches everything for ten minutes; the `?v=` numbers
  in `index.html` are what make phones fetch a new build).
- **No server code.** Push, the calendar feed, share pages and bookings already
  run on the Cloud Functions instead.
- **One link preview for every address.** A text message previews the HTML the
  server returns, which is always the same `index.html`.
- **No redirect rules, no password protection.**
- **Terms:** GitHub says Pages is not meant as free hosting for an online
  business or SaaS. The one to take seriously once clubs pay.

## The plan: Firebase Hosting

Chosen over Cloudflare Pages, Netlify, Vercel, AWS and a VPS (2026-10-11):
it is the Firebase project the database, sign-in and functions already live
on, so no new vendor or bill, and its rewrites can hand a path to an existing
function, which is how link previews would work without a second server.

Steps, when it's time:

1. A `hosting` block in `firebase.json`: the site's files (not `functions/`,
   `test/`, `tools/` or the docs), headers (the CSP moved out of the `<meta>`
   with `frame-ancestors 'none'`, `Cache-Control` long for `?v=` files and
   short for `index.html` and `sw.js`), and a release limit so old deploys
   don't pile up.
2. A hosting deploy in `.github/workflows/server.yml`, on a merge to main,
   after every suite, beside the rules and functions.
3. Try it on the `*.web.app` address and a preview channel first.
4. Point `teamplayhq.com`'s DNS at Firebase. Same address, so phones keep
   their local copy, outbox, push token and home-screen install (unlike the
   move from `github.io`).
5. Turn GitHub Pages off once the domain answers from Firebase.
6. Then work through *Waiting on the move*.

Downsides, decided acceptable but to keep in mind:

- **No hard spending cap.** Blaze only alerts. Set a budget alert (the
  functions need one anyway).
- **One company for everything.** A Google outage or account problem takes the
  site down with the database; today the site still loads from GitHub.
- **Caching has to be set right**, or phones keep an old `index.html`.

## Limits

Measured 2026-10-11: the site is about 2.1 MB; a first visit downloads about
0.6 MB compressed (`app.js` 430 KB, `drills.js` 100 KB).

- **Hosting traffic is phones downloading the app**, not anything a club does
  in it. A phone downloads again only after a new build, which goes out only
  on a merge to main. So it scales with how often we merge: about 300 people
  × 30 builds a month × 0.6 MB ≈ 5–6 GB a month, against Firebase's free
  allowance of about 360 MB a day (check current pricing). If it gets close,
  merge less often (a weekly release) and give `drills.js` its own version
  number so it isn't re-downloaded with every build.
- **The database is the number to watch**, not hosting: every phone reads its
  club on opening and live games stream. That grows with use, not releases.
  Check its Usage tab in the Firebase console now and then.
- GitHub Pages: 1 GB site, 100 GB a month, 10 builds an hour. Nowhere near.

## Waiting on the move

- [ ] **Real addresses instead of `#/`** (asked 2026-10-10, with the domain).
  Back already works with `#/` (build 134). Needs a rewrite of every path to
  `index.html`, `uiToHash()`/`hashToUi()` reading the path, and the old `#/`
  addresses (in invites, calendar feeds, alerts and messages already sent)
  still landing where they did.
- [ ] **Security headers**: the CSP as a header with `frame-ancestors`,
  `X-Frame-Options`, `Permissions-Policy`, HSTS. Needs step 1.
- [ ] **A link preview per game** (ROADMAP item 4): a rewrite of the game
  link's path to a function that writes that game's title, score and image
  into the HTML.
- [ ] **Cache control**: long-lived caching for versioned files, so a phone
  checks for a new build without re-downloading an unchanged one.
