/* Which version of database.rules.json is published on the live database?

     node tools/live-rules.js [databaseURL]

   rulesVersion accepts one number, the version the published rules are, from
   anyone, signed in or not. So this tries writing numbers, from a few past
   this checkout's version down to 1, and the one accepted is what is
   published. Every refused write changes nothing, and the accepted one writes
   the number already there in any club running those rules, so it is safe to
   run against the real club. Nothing else is read or written.

   Without an argument it reads databaseURL from firebase-config.js. Exits 0
   when the published rules are this checkout's version, 1 when they differ,
   2 when the database could not be reached. */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
const m = /newData\.val\(\) === (\d+)$/.exec((rules.rulesVersion || {})['.write'] || '');
if (!m) { console.error('database.rules.json has no rulesVersion to check against'); process.exit(2); }
const HERE = Number(m[1]);

let url = process.argv[2];
if (!url) {
  const cfg = fs.readFileSync(path.join(ROOT, 'firebase-config.js'), 'utf8');
  const u = /databaseURL:\s*["']([^"']+)["']/.exec(cfg);
  url = u && u[1];
}
if (!url) { console.error('No databaseURL: pass one, or fill in firebase-config.js'); process.exit(2); }
url = url.replace(/\/+$/, '');

async function tryWrite(v) {
  const res = await fetch(url + '/rulesVersion.json', { method: 'PUT', body: JSON.stringify(v) });
  if (res.ok) return true;
  if (res.status === 401 || res.status === 403) return false;
  throw new Error('HTTP ' + res.status + ' ' + (await res.text()).trim());
}

(async () => {
  let live = 0;
  try {
    for (let v = HERE + 5; v >= 1; v--) if (await tryWrite(v)) { live = v; break; }
  } catch (e) {
    console.error('Could not reach ' + url + ': ' + (e.cause && e.cause.code || e.message));
    process.exit(2);
  }
  const what = live ? 'version ' + live : 'older than version 1 (from before rules carried a version)';
  console.log('Published on ' + url + ': ' + what);
  console.log('This checkout\'s database.rules.json: version ' + HERE);
  if (live === HERE) console.log('They match.');
  else if (live < HERE) console.log('The published rules are behind: paste database.rules.json (README, The database rules).');
  else console.log('The published rules are newer than this checkout: pull.');
  process.exit(live === HERE ? 0 : 1);
})();
