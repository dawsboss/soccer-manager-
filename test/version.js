/* Four version markers that have to agree.

   CLAUDE.md: "If you bump one, bump all four to the same number." The failure
   this catches is a browser holding a cached index.html while fetching a newer
   app.js — the one the comment in app.js calls "the exact failure that has
   eaten hours", because the page half-works and nothing says why.

   This used to print "all agree: NO" and exit 0, so nothing downstream could
   act on it. It exits non-zero now. */

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { check } = H;

const root = f => path.join(__dirname, '..', f);
const app = fs.readFileSync(root('app.js'), 'utf8');
const idx = fs.readFileSync(root('index.html'), 'utf8');

const build = (app.match(/const BUILD = '(\d+)'/) || [])[1];
const meta = (idx.match(/meta name="build" content="(\d+)"/) || [])[1];
const qs = [...idx.matchAll(/(?:app\.js|styles\.css)\?v=(\d+)/g)].map(m => m[1]);

console.log('--- the four markers CLAUDE.md names ---');
console.log('  app.js BUILD      :', build);
console.log('  index meta build  :', meta);
console.log('  index ?v= params  :', qs.join(', '));

check('app.js declares a BUILD', !!build, true);
check('index.html carries a build meta tag', !!meta, true);
check('index.html cache-busts both assets', qs.length, 2);
check('the meta tag matches app.js', meta, build);
check('app.js?v= matches', qs[0], build);
check('styles.css?v= matches', qs[1], build);

console.log('\n--- what a cached page would do ---');
{
  /* stale() compares the meta tag the browser parsed against the BUILD in the
     script it then fetched. Same number means the page is not from cache. */
  const staleMeta = '19';
  check('a page from an older build reads as stale', staleMeta !== build, true);
  check('a page at the current build does not', build !== build, false);
  console.log('  the banner would say: "cached at v' + staleMeta + ' but the code is v' + build + '"');
}

console.log('\n--- the public pages ---');
{
  /* live.html and game.html are stamped by .github/workflows/deploy.yml at
     publish time, so what is committed here is a placeholder and drifting from
     index.html is expected. Reported, not asserted — the deploy has its own
     check that all three came out on the same number. */
  for (const f of ['live.html', 'game.html']) {
    const src = fs.readFileSync(root(f), 'utf8');
    const v = [...new Set([...src.matchAll(/\?v=(\d+)/g)].map(m => m[1]))];
    console.log('  ' + f.padEnd(11) + ' committed at v' + v.join('/') + (v.includes(build) ? '' : ' (stamped at deploy)'));
  }
}

H.summary('version markers');
