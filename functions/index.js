/* The club's Cloud Functions (GOTSPORT.md, The server).

   Deployed with `firebase deploy --only functions` from the repository root
   (README, "Notifications to a closed phone"). Each export is one job; the
   judgement in each lives in a file of its own that imports nothing from
   Firebase, so test/push.js and test/access.js run it against the fake
   database.

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
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getDatabase } = require('firebase-admin/database');
const { initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const push = require('./push');
const feed = require('./calendar');
const access = require('./access');
const mirror = require('./mirror');
const mycal = require('./mycal');
const move = require('./move');
const adminwatch = require('./adminwatch');
const booking = require('./book');

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

/* What access.js may touch: reads, and writes and deletes of the lookup
   tables, a person's club bookmark and a spent invite, on this event's own
   database. It is the one job here that writes what the rules read, so it
   gets `set` and push.js does not. */
function writerOf(event) {
  const root = event.data.after.ref.root;
  return {
    get: p => root.child(p).get().then(s => s.val()),
    set: (p, v) => root.child(p).set(v),
    remove: p => root.child(p).remove()
  };
}

/* What mycal.js may touch from a trigger: its own marks at serverState/myCal,
   on this event's own database, and nothing else. */
function markerOf(event) {
  const root = (event.data.after || event.data).ref.root;
  return { set: (p, v) => root.child(p).set(v) };
}
const markClub = event => mycal.touchClub(markerOf(event), event.params.code);
/* A role given or taken away: the club, and each person the change names, so
   someone taken out of the club (and so out of its index, which is how a run
   finds who is in it) still has her feed rebuilt without that team. */
const peopleIn = v => Object.keys(v && typeof v === 'object' ? v : {});
const markRoles = (event, uids) => Promise.all([markClub(event), ...[...new Set(uids)].map(u => mycal.touchPerson(markerOf(event), u))]);
const staffIn = v => [...peopleIn(v && v.coaches), ...peopleIn(v && v.trackers)];

/* What mirror.js may touch: reads, and one multi-path update of public/ pages
   that already exist, on this event's own database. */
function mirrorOf(event) {
  const root = event.data.after.ref.root;
  return {
    get: p => root.child(p).get().then(s => s.val()),
    update: patch => root.update(patch)
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
/* Every trigger on a club is registered twice, once per tree, while clubs
   move from workspaces/{code} to orgs/{code} (AUTH.md, *The move to
   `orgs/{orgId}`*): `both()` makes the pair, the second named with Orgs on
   the end, and tells each handler which tree it woke on (params.tree), so
   nothing has to ask. Where the new tree puts a part elsewhere (the squad out
   from under its team), the pattern says so with {squad}, written as the old
   tree's teams/{tid}/players or the new one's squad/{tid}. */
const TREE_PATHS = {
  workspaces: p => '/workspaces/' + p.replace('{squad}', 'teams/{tid}/players'),
  orgs: p => '/orgs/' + p.replace('{squad}', 'squad/{tid}')
};
function both(name, pattern, make, handler) {
  for (const tree of ['workspaces', 'orgs'])
    exports[name + (tree === 'orgs' ? 'Orgs' : '')] = make(TREE_PATHS[tree](pattern),
      quiet(event => handler({ ...event, params: { ...event.params, tree } })));
}
/* While a club is moving (move.js; serverState/moving/{code}) every function
   that keeps a club in step leaves it alone: the move writes the new tree a
   batch at a time and takes the old one away the same way, and a function
   acting on half of it would put in step what is about to be replaced, or
   read the old tree emptying as everybody leaving the club (and take their
   bookmarks with them). The move writes everything they would have. */
function quiet(handler) {
  return async event => {
    const root = (event.data.after || event.data).ref.root;
    const code = event.params && event.params.code;
    if (code && (await root.child('serverState/moving/' + code).get()).val()) return null;
    return handler(event);
  };
}

both('pushEntry', '{code}/teams/{tid}/events/{eid}', onValueWritten, event =>
  push.onEntry(envOf(event), event.params, event.data.before.val(), event.data.after.val()));

/* A game's when and whether, one field each and never the game itself: a
   game being played is written every few seconds (goals, subs, the clock),
   and none of that may wake the server. Its date, kick-off and called-off
   fields change only when somebody reschedules it. */
for (const field of ['date', 'kickoff', 'called'])
  both('pushGame' + field[0].toUpperCase() + field.slice(1), `{code}/matches/{mid}/${field}`, onValueWritten, event =>
    push.onGameField(envOf(event), event.params, field, event.data.before.val()));

/* A game somebody follows (push.js, onFollowed): its goals, each stretch of
   play starting, each half ending and full time. Small things a game being
   played writes once each, never the game: a goal is created once under its
   own id (and its scorer added once, a moment later), a stretch of play is a new periods/{i} (its end, written
   when the clock stops, is beneath it and wakes nothing), and currentHalf
   and ended change once a half. */
both('followGoal', '{code}/matches/{mid}/goals/{gid}', onValueCreated, event =>
  push.onFollowed(envOf(event), event.params, 'goal', event.params.gid));
both('followScorer', '{code}/matches/{mid}/goals/{gid}/pid', onValueWritten, event =>
  push.onFollowed(envOf(event), event.params, 'scorer', event.params.gid, event.data.before.val()));
both('followPeriod', '{code}/matches/{mid}/periods/{i}', onValueCreated, event =>
  push.onFollowed(envOf(event), event.params, 'period', event.params.i));
both('followHalf', '{code}/matches/{mid}/currentHalf', onValueWritten, event =>
  push.onFollowed(envOf(event), event.params, 'half', null, event.data.before.val()));
both('followEnded', '{code}/matches/{mid}/ended', onValueWritten, event =>
  push.onFollowed(envOf(event), event.params, 'ended', null, event.data.before.val()));

/* The lookup tables the rules read (access.js; SERVER.md, "The lookup tables
   the rules read"), rebuilt the moment a role changes rather than when an
   admin's or coach's phone next connects. One trigger per place a role lives,
   each as deep as the role itself: a coach saving the whole team writes
   teams/{tid} every time, and only a change to a player's guardians or self
   may wake these. */
both('accessAdmin', '{code}/access/admins/{uid}', onValueWritten, event =>
  access.onAdmin(writerOf(event), event.params));
/* Who runs the club (adminwatch.js; SECURITY.md, SEC-D8): an admin or owner
   given or taken away tells every admin and owner, the person it happened to
   included, and is written to clubAudit/{code}. Its own trigger beside the
   lookup tables', because it sends and keeps a record where access.js only
   writes the tables. */
function watchOf(event) {
  const root = event.data.after.ref.root;
  return {
    get: p => root.child(p).get().then(s => s.val()),
    // the record, and nothing else a rule reads
    set: (p, v) => (/^clubAudit\//.test(p) ? root.child(p).set(v) : Promise.reject(new Error('adminwatch writes clubAudit/ only'))),
    remove: p => root.child(p).remove(),
    send: messages => getMessaging().sendEach(messages),
    claim: (p, fn) => root.child(p).transaction(fn).then(r => !!r.committed)
  };
}
for (const [kind, part] of [['admin', 'admins'], ['owner', 'owners']])
  both('watch' + kind[0].toUpperCase() + kind.slice(1), `{code}/access/${part}/{uid}`, onValueWritten, event =>
    adminwatch.onChange(watchOf(event), { ...event.params, eid: event.id }, kind, event.data.before.val(), event.data.after.val()));
/* The three on a team's people also mark the club for My calendar's feeds
   (mycal.js, below): who is on a team is what decides whose calendar it is in. */
both('accessStaff', '{code}/access/teams/{tid}', onValueWritten, event => Promise.all([
  access.onTeamStaff(writerOf(event), event.params, event.data.before.val(), event.data.after.val()),
  markRoles(event, [...staffIn(event.data.before.val()), ...staffIn(event.data.after.val())])]).then(r => r[0]));
both('accessGuardians', '{code}/{squad}/{pid}/guardians', onValueWritten, event => Promise.all([
  access.onGuardians(writerOf(event), event.params, event.data.before.val(), event.data.after.val()),
  markRoles(event, [...peopleIn(event.data.before.val()), ...peopleIn(event.data.after.val())])]).then(r => r[0]));
both('accessSelf', '{code}/{squad}/{pid}/self', onValueWritten, event => Promise.all([
  access.onSelf(writerOf(event), event.params, event.data.before.val(), event.data.after.val()),
  markRoles(event, [...peopleIn(event.data.before.val()), ...peopleIn(event.data.after.val())])]).then(r => r[0]));

/* The two parts only orgs/ has (access.js): staff names, so a family can
   see who her coach is without reading anyone's email, and the roster, the
   numbers the whole club reads in place of the squad. A child's record is
   watched one child at a time, so saving the whole squad wakes only the
   children that changed. */
exports.namesMember = onValueWritten('/orgs/{code}/members/{uid}', quiet(event =>
  access.onMember(writerOf(event), event.params)));
exports.rosterPlayer = onValueWritten('/orgs/{code}/squad/{tid}/{pid}', quiet(event =>
  access.onSquadPlayer(writerOf(event), event.params)));
exports.rosterOpen = onValueWritten('/orgs/{code}/org/rosterOpen', quiet(event =>
  access.onRosterOpen(writerOf(event), event.params)));

/* Moving a club to orgs/ (move.js), when one of its admins asks by writing
   moveRequests/{code}. A create only: the answer is written beside the
   request, and the admin deletes it to ask again. One multi-path update, so
   it gets `update` on the event's own database as well as get and set. */
exports.moveClub = onValueCreated('/moveRequests/{code}', event => {
  const root = event.data.ref.root;
  return move.onRequest({
    get: p => root.child(p).get().then(s => s.val()),
    set: (p, v) => root.child(p).set(v),
    update: patch => root.update(patch),
    // the club's people and calendar changed under My calendar's feeds, which slept through the move
    touched: code => mycal.touchClub(markerOf(event), code)
  }, event.params, event.data.val());
});

/* The calendar half of the share pages (mirror.js; SERVER.md, "The share
   pages"): a team's entries, and a game's when and where, rewritten on its
   season link, game link and members' feed whoever changed them. Entries are
   watched whole, as pushEntry watches each one; a game only field by field,
   never whole, because a game being played is written every few seconds. */
/* Both also mark the club for My calendar's feeds, which carry the same
   entries and games. */
both('mirrorEvents', '{code}/teams/{tid}/events', onValueWritten, event => Promise.all([
  mirror.onEvents(mirrorOf(event), event.params), markClub(event)]).then(r => r[0]));
for (const field of mirror.GAME_FIELDS)
  both('mirrorGame' + field[0].toUpperCase() + field.slice(1), `{code}/matches/{mid}/${field}`, onValueWritten, event => Promise.all([
    mirror.onGame(mirrorOf(event), event.params), markClub(event)]).then(r => r[0]));

/* Booking a coach's time (book.js; SERVER.md, "Bookable times and training
   sessions"). A family's phone asks at bookAsks/{code}/{uid}/{id}, a create
   only, and the answer is written beside the ask; the place is counted and
   taken inside one transaction on the slot's bookings. A place coming free
   in a booked slot goes to the first on its waiting list. */
function bookerOf(event) {
  const root = (event.data.after || event.data).ref.root;
  return {
    get: p => root.child(p).get().then(s => s.val()),
    set: (p, v) => root.child(p).set(v),
    remove: p => root.child(p).remove(),
    claim: (p, fn) => root.child(p).transaction(fn).then(r => !!r.committed),
    // one day's records under a path (games, sessions), by their date
    dated: (p, date) => root.child(p).orderByChild('date').equalTo(date).get().then(s => s.val())
  };
}
exports.bookAsk = onValueCreated('/bookAsks/{code}/{uid}/{id}', quiet(event =>
  booking.onAsk(bookerOf(event), event.params, event.data.val())));
exports.bookFreed = onValueWritten('/training/{code}/booked/{sid}/{pid}', quiet(event =>
  booking.onBooked(bookerOf(event), event.params, event.data.before.val(), event.data.after.val())));

/* My calendar's feeds (mycal.js; SERVER.md, "My calendar's feed"). The
   triggers above mark a club when its entries, games or people change; these
   mark it for its training sessions, bookings and bookable times, and mark a
   person when her own address or the clubs she is in change. Marks only:
   the building happens in myCalBuild, every five minutes, once per feed
   however many marks reached it. */
exports.myCalSessions = onValueWritten('/training/{code}/sessions/{sid}', markClub);
exports.myCalBooked = onValueWritten('/training/{code}/booked/{sid}/{pid}', markClub);
exports.myCalAvail = onValueWritten('/training/{code}/avail/{bid}', markClub);
exports.myCalClubs = onValueWritten('/userOrgs/{uid}/{code}', event => mycal.touchPerson(markerOf(event), event.params.uid));
exports.myCalSetting = onValueWritten('/people/{uid}/set', event => mycal.touchPerson(markerOf(event), event.params.uid));
/* The default database only: it has no event to say which instance, and a
   rehearsal database's feeds are not worth a second schedule. One instance,
   so two runs never build the same feed at once. */
exports.myCalBuild = onSchedule({ schedule: 'every 5 minutes', maxInstances: 1 }, () => {
  const root = getDatabase().ref();
  return mycal.run({
    get: p => root.child(p).get().then(s => s.val()),
    set: (p, v) => root.child(p).set(v),
    claim: (p, fn) => root.child(p).transaction(fn).then(r => !!r.committed)
  });
});

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
