/* The club's Cloud Functions (GOTSPORT.md, The server).

   Deployed with `firebase deploy --only functions` from the repository root
   (README, "Notifications to a closed phone"). Each export is one job; the
   judgement in each lives in a file of its own that imports nothing from
   Firebase, so test/push.js runs it against the fake database.

   Two rules for everything added here, from CLAUDE.md's Conventions:
   - a function writes with admin credentials and bypasses the rules, so one
     that acts for somebody checks them against the lookup tables the rules
     read, and is tested for every kind of account;
   - nothing at the sideline waits on it. The phone stays offline-first; the
     server does the jobs that belong to nobody in particular.

   The database triggers listen on every database instance in the project
   (the default), and read from the instance the event came from,
   `event.data.ref.root`, so a second database for rehearsing rules
   (firebase-config.js, SOCCER_FIREBASE_ENVS) is answered from its own data
   and its own phones' tokens, never the real club's. The calendar feed has no
   event to come from and reads the default database: the one the site's
   firebase-config.js points every phone at. */

const { onValueCreated } = require('firebase-functions/v2/database');
const { onRequest } = require('firebase-functions/v2/https');
const { getDatabase } = require('firebase-admin/database');
const { initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const push = require('./push');
const feed = require('./calendar');

initializeApp();

/* What push.js is allowed to touch: reads and deletes on this event's own
   database, and Cloud Messaging. */
function envOf(event) {
  const root = event.data.ref.root;
  return {
    get: p => root.child(p).get().then(s => s.val()),
    remove: p => root.child(p).remove(),
    send: messages => getMessaging().sendEach(messages)
  };
}

/* A new notice on a team's board. Only a create: a coach editing her notice,
   and every family's read marker under it, are updates and wake nothing. */
exports.pushNotice = onValueCreated('/board/{code}/{tid}/{id}', event =>
  push.onNotice(envOf(event), event.params, event.data.val()));

/* A new message in a family conversation. Messages are append-only, so every
   one is a create; the read markers live beside them under seen/, not here. */
exports.pushMessage = onValueCreated('/dm/{code}/{tid}/{fam}/m/{id}', event =>
  push.onMessage(envOf(event), event.params, event.data.val()));

/* A new message between two coaches or admins (build 105). Append-only too. */
exports.pushStaffMessage = onValueCreated('/staffdm/{code}/{cid}/m/{id}', event =>
  push.onStaff(envOf(event), event.params, event.data.val()));

/* The calendar feed (calendar.js): https://{region}-{project}.cloudfunctions.net/calendar/{id}.ics,
   which is what firebase-config.js names as SOCCER_CALENDAR_FEED. Anyone may
   ask, because a calendar app asks with no account; what it can be handed is
   one public/ document. A few instances at most: a club's calendars poll
   hourly, and a cap means a flood of requests is slow, not a bill. */
exports.calendar = onRequest({ invoker: 'public', maxInstances: 3 }, async (req, res) => {
  const root = getDatabase().ref();
  const r = await feed.serve({ method: req.method, path: req.path }, { get: p => root.child(p).get().then(s => s.val()) });
  res.status(r.status).set(r.headers).send(r.body);
});
