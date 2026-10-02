/* Copies ics.js into calendar.mjs, between its two markers.

   The Worker is meant to be pasted whole into Cloudflare's editor, which has no
   way to load a second file, so it carries its own copy of ics.js. Run this
   after any change to ics.js — `node test/worker.js` fails until you do, so the
   feed and the app can never describe the same fixture differently.

     node worker/make.js */

const fs = require('fs');
const path = require('path');

const START = '/* ---- ics.js, copied in by worker/make.js: do not edit by hand ---- */\n';
const END = '/* ---- end of ics.js ---- */\n';
const W = path.join(__dirname, 'calendar.mjs');
const ics = fs.readFileSync(path.join(__dirname, '..', 'ics.js'), 'utf8');
const src = fs.readFileSync(W, 'utf8');
const a = src.indexOf(START), b = src.indexOf(END);
if (a < 0 || b < a) { console.error('calendar.mjs has lost its ics.js markers'); process.exit(1); }
const out = src.slice(0, a + START.length) + ics + src.slice(b);
if (out === src) { console.log('calendar.mjs already carries the current ics.js'); process.exit(0); }
fs.writeFileSync(W, out);
console.log('calendar.mjs updated from ics.js');

