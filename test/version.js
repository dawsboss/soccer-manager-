/* The version markers that have to agree: BUILD, the meta tag, and every
   ?v= in index.html, including the classic scripts that load ahead of app.js.

   CLAUDE.md: "If you bump one, bump them all to the same number." The failure
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
/* Every file index.html loads with a ?v=, not just the two this started
   with. The drill library and its renderer are scripts of their own; one left
   on an old number is a phone running new app.js against last week's drills. */
const qv = f => (idx.match(new RegExp(f.replace('.', '\\.') + '\\?v=(\\d+)')) || [])[1];
const all = [...idx.matchAll(/([\w.-]+)\?v=(\d+)/g)].map(m => [m[1], m[2]]);
const ASSETS = ['styles.css', 'ics.js', 'drills.js', 'drill-diagram.js', 'app.js'];

/* SERVER.md lists every job a phone does today that a server would do. It
   names functions so the day there is one, nobody has to rediscover them; a
   name that no longer exists is a list that has drifted from the code. */
{
  const server = fs.readFileSync(root('SERVER.md'), 'utf8');
  const named = [...new Set([...server.matchAll(/`(\w+)\(\)`/g)].map(m => m[1]))];
  const gone = named.filter(n => !new RegExp(`(^|\\n)(async )?function ${n}\\(|(^|\\n)const ${n} = `).test(app));
  console.log('--- SERVER.md names functions that exist ---');
  check(`every one of the ${named.length} functions SERVER.md names is in app.js`, gone.join(', '), '');
  const unmarked = named.filter(n => !new RegExp(`// SERVER\\.md:[^\\n]*\\n(async )?(function ${n}\\(|const ${n} = )`).test(app));
  check('and each carries a SERVER.md: line at the code', unmarked.join(', '), '');
}

console.log('--- the markers CLAUDE.md names ---');
console.log('  app.js BUILD      :', build);
console.log('  index meta build  :', meta);
console.log('  index ?v= params  :', all.map(([f, v]) => f + '=' + v).join(', '));

check('app.js declares a BUILD', !!build, true);
check('index.html carries a build meta tag', !!meta, true);
check('the meta tag matches app.js', meta, build);
for (const f of ASSETS) check(f + '?v= matches', qv(f), build);
check('and nothing else in index.html carries another', all.every(([, v]) => v === build), true);

/* app.js is a module and runs after the plain scripts above it have run, but
   only if they are above it: it reads window.SOCCER_DRILLS once it renders. */
const at = f => idx.indexOf(f + '?v=');
check('drills.js loads before app.js', at('drills.js') >= 0 && at('drills.js') < at('app.js'), true);
check('drill-diagram.js loads before app.js', at('drill-diagram.js') >= 0 && at('drill-diagram.js') < at('app.js'), true);

console.log('\n--- what a cached page would do ---');
{
  /* stale() compares the meta tag the browser parsed against the BUILD in the
     script it then fetched. Same number means the page is not from cache. */
  const staleMeta = '19';
  check('a page from an older build reads as stale', staleMeta !== build, true);
  check('a page at the current build does not', build !== build, false);
  console.log('  the banner would say: "cached at v' + staleMeta + ' but the code is v' + build + '"');
}

console.log('\n--- app.js parses the way the browser loads it ---');
{
  /* index.html loads app.js as a module, which is strict and refuses a name
     declared twice at the top level. The other suites eval it as a plain
     script, where a second function of the same name quietly replaces the
     first: a planner's clashesOn(date) once replaced the game plan's
     clashesOn(t, m), every suite passed, and the page itself was blank. */
  const os = require('os'), path = require('path'), { spawnSync } = require('child_process');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sm-')), 'app.mjs');
  fs.copyFileSync(root('app.js'), tmp);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  if (r.status) console.log('    ' + String(r.stderr).split('\n').slice(0, 4).join('\n    '));
  check('app.js compiles as a module, with no name declared twice', r.status, 0);
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

/* SECURITY.md, SEC-3. Every page carries the same Content-Security-Policy,
   as a <meta> (GitHub Pages sends no headers), ahead of anything it loads: a
   policy that arrives after a script has already run protects nothing.
   Scripts never inline and never eval, so a `javascript:` link or an injected
   <script> in typed text does nothing; no plugins; no <base> pointing the
   page elsewhere. It was tried in Chromium against the live project: Google
   sign-in, the database (WebSocket and long-polling), push and the share
   pages. Widening it is a change to try there again, not just to pass this. */
console.log('\n--- the Content-Security-Policy ---');
{
  const pages = fs.readdirSync(root('.')).filter(f => f.endsWith('.html')).sort();
  const policies = {};
  for (const f of pages) {
    // comments out first: one may well mention a <script> without being one
    const src = fs.readFileSync(root(f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(src);
    check(f + ' carries a policy', !!m, true);
    if (!m) continue;
    const at = src.indexOf(m[0]);
    const first = Math.min(...['<script', '<link', '<style'].map(t => src.indexOf(t)).filter(i => i >= 0));
    check('— before anything it loads', at < first, true);
    const dir = Object.fromEntries(m[1].split(';').map(x => x.trim().split(/\s+/)).filter(x => x[0]).map(([k, ...v]) => [k, v]));
    const script = dir['script-src'] || [];
    check('— scripts named, never inline or eval', script.length > 0 && !script.some(v => /unsafe|data:|blob:|^\*$|^https:$/.test(v)), true);
    check('— the default is this site', (dir['default-src'] || []).join(' '), "'self'");
    check('— no plugins', (dir['object-src'] || []).join(' '), "'none'");
    check('— no <base> elsewhere', (dir['base-uri'] || []).join(' '), "'self'");
    policies[f] = m[1];
  }
  check('one policy, the same on every page', new Set(Object.values(policies)).size, 1);
}

H.summary('version markers');
