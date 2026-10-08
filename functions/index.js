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

const { onValueCreated, onValueWritten } = require('firebase-functions/v2/database');
const { onRequest } = require('firebase-functions/v2/https');
const { getDatabase } = require('firebase-admin/database');
const { initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const push = require('./push');
const feed = require('./calendar');

initializeApp();

/* What push.js is allowed to touch: reads, deletes and the one transaction it
   keeps its own notes with, on this event's own database, and Cloud Messaging. */
function envOf(event) {
  // a create hands over the snapshot, a write a before/after pair
  const root = (event.data.after || event.data).ref.root;
  return {
    get: p => root.child(p).get().then(s => s.val()),
    remove: p => root.child(p).remove(),
    send: messages => getMessaging().sendEach(messages),
    // a transaction: `fn` gets what is there and returns what to write, or undefined to leave it
    claim: (p, fn) => root.child(p).transaction(fn).then(r => !!r.committed)
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

/* A new message between two coaches or admins (build 106). Append-only too. */
exports.pushStaffMessage = onValueCreated('/staffdm/{code}/{cid}/m/{id}', event =>
  push.onStaff(envOf(event), event.params, event.data.val()));

/* A practice or event on a team's calendar changed: the entry, before and
   after. Entries are small and nothing writes them during a game (the
   register sits beside them, at teams/{tid}/attend), so the whole entry is
   the right thing to watch. */
exports.pushEntry = onValueWritten('/workspaces/{code}/teams/{tid}/events/{eid}', event =>
  push.onEntry(envOf(event), event.params, event.data.before.val(), event.data.after.val()));

/* A game's when and whether, one field each and never the game itself: a
   game being played is written every few seconds (goals, subs, the clock),
   and none of that may wake the server. Its date, kick-off and called-off
   fields change only when somebody reschedules it. */
for (const field of ['date', 'kickoff', 'called'])
  exports['pushGame' + field[0].toUpperCase() + field.slice(1)] = onValueWritten(`/workspaces/{code}/matches/{mid}/${field}`, event =>
    push.onGameField(envOf(event), event.params, field, event.data.before.val()));

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
