/* Copies ics.js into functions/, where the calendar feed requires it.

   `firebase deploy --only functions` uploads functions/ and nothing above it,
   so the feed carries its own copy of the app's ics.js. Run this after any
   change to ics.js; `node test/calfeed.js` fails until you do, so the feed and
   the app can never describe the same fixture differently.

     node functions/make.js */

const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'ics.js');
const to = path.join(__dirname, 'ics.js');
const src = fs.readFileSync(from, 'utf8');
let had = null;
try { had = fs.readFileSync(to, 'utf8'); } catch (e) { }
if (had === src) { console.log('functions/ics.js already matches ics.js'); process.exit(0); }
fs.writeFileSync(to, src);
console.log('functions/ics.js updated from ics.js');
