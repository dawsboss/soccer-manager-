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
const adminwatch = require('./adminwatch');
const booking = require('./book');
const news = require('./news');

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

/* What mirror.js may touch: reads, writes under public/ (the share pages,
   which only the server writes: SECURITY.md, SEC-10), and its own notes at
   serverState/pages and serverState/publish, on this event's own database;
   and the site's address, for a calendar feed's links back
   (functions/.env, SOCCER_SITE: https://…/index.html; blank leaves them out). */
function mirrorOf(event) {
  const root = (event.data.after || event.data).ref.root;
  const ours = p => /^(public|serverState\/pages|serverState\/publish)\//.test(p);
  const refuse = p => Promise.reject(new Error('mirror writes public/ and its own notes only, not ' + p));
  return {
    get: p => root.child(p).get().then(s => s.val()),
    set: (p, v) => (ours(p) ? root.child(p).set(v) : refuse(p)),
    update: patch => { const bad = Object.keys(patch).find(p => !ours(p)); return bad ? refuse(bad) : root.update(patch); },
    claim: (p, fn) => (ours(p) ? root.child(p).transaction(fn).then(r => !!r.committed) : refuse(p)),
    site: process.env.SOCCER_SITE || ''
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
/* Every trigger on a club is on orgs/{code} (AUTH.md, *The move to
   `orgs/{orgId}`*). Each was registered twice while clubs moved there, once
   per tree, the second named with Orgs on the end; the old tree's came out a
   fortnight after the last club moved (build order step 5), and the new
   tree's keep their names, so a deploy removes the old ones and leaves every
   live one where it is, with no moment when a club has no trigger. Where
   orgs/ puts a part elsewhere (the squad out from under its team), the
   pattern says so with {squad}. */
const clubPathOf = p => '/orgs/' + p.replace('{squad}', 'squad/{tid}');
function onClub(name, pattern, make, handler) {
  exports[name + 'Orgs'] = make(clubPathOf(pattern), handler);
}

onClub('pushEntry', '{code}/teams/{tid}/events/{eid}', onValueWritten, event =>
  push.onEntry(envOf(event), event.params, event.data.before.val(), event.data.after.val()));

/* A game's when and whether, one field each and never the game itself: a
   game being played is written every few seconds (goals, subs, the clock),
   and none of that may wake the server. Its date, kick-off and called-off
   fields change only when somebody reschedules it. */
for (const field of ['date', 'kickoff', 'called'])
  onClub('pushGame' + field[0].toUpperCase() + field.slice(1), `{code}/matches/{mid}/${field}`, onValueWritten, event =>
    push.onGameField(envOf(event), event.params, field, event.data.before.val()));

/* A game somebody follows (push.js, onFollowed): its goals, each stretch of
   play starting, each half ending and full time. Small things a game being
   played writes once each, never the game: a goal is created once under its
   own id (and its scorer added once, a moment later), a stretch of play is a new periods/{i} (its end, written
   when the clock stops, is beneath it and wakes nothing), and currentHalf
   and ended change once a half. */
onClub('followGoal', '{code}/matches/{mid}/goals/{gid}', onValueCreated, event =>
  push.onFollowed(envOf(event), event.params, 'goal', event.params.gid));
onClub('followScorer', '{code}/matches/{mid}/goals/{gid}/pid', onValueWritten, event =>
  push.onFollowed(envOf(event), event.params, 'scorer', event.params.gid, event.data.before.val()));
onClub('followPeriod', '{code}/matches/{mid}/periods/{i}', onValueCreated, event =>
  push.onFollowed(envOf(event), event.params, 'period', event.params.i));
onClub('followHalf', '{code}/matches/{mid}/currentHalf', onValueWritten, event =>
  push.onFollowed(envOf(event), event.params, 'half', null, event.data.before.val()));
onClub('followEnded', '{code}/matches/{mid}/ended', onValueWritten, event =>
  push.onFollowed(envOf(event), event.params, 'ended', null, event.data.before.val()));

/* The lookup tables the rules read (access.js; SERVER.md, "The lookup tables
   the rules read"), rebuilt the moment a role changes rather than when an
   admin's or coach's phone next connects. One trigger per place a role lives,
   each as deep as the role itself: a coach saving the whole team writes
   teams/{tid} every time, and only a change to a player's guardians or self
   may wake these. */
onClub('accessAdmin', '{code}/access/admins/{uid}', onValueWritten, event =>
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
  onClub('watch' + kind[0].toUpperCase() + kind.slice(1), `{code}/access/${part}/{uid}`, onValueWritten, event =>
    adminwatch.onChange(watchOf(event), { ...event.params, eid: event.id }, kind, event.data.before.val(), event.data.after.val()));
/* The three on a team's people also mark the club for My calendar's feeds
   (mycal.js, below): who is on a team is what decides whose calendar it is in. */
onClub('accessStaff', '{code}/access/teams/{tid}', onValueWritten, event => Promise.all([
  access.onTeamStaff(writerOf(event), event.params, event.data.before.val(), event.data.after.val()),
  markRoles(event, [...staffIn(event.data.before.val()), ...staffIn(event.data.after.val())])]).then(r => r[0]));
onClub('accessGuardians', '{code}/{squad}/{pid}/guardians', onValueWritten, event => Promise.all([
  access.onGuardians(writerOf(event), event.params, event.data.before.val(), event.data.after.val()),
  markRoles(event, [...peopleIn(event.data.before.val()), ...peopleIn(event.data.after.val())])]).then(r => r[0]));
onClub('accessSelf', '{code}/{squad}/{pid}/self', onValueWritten, event => Promise.all([
  access.onSelf(writerOf(event), event.params, event.data.before.val(), event.data.after.val()),
  markRoles(event, [...peopleIn(event.data.before.val()), ...peopleIn(event.data.after.val())])]).then(r => r[0]));
/* A player's fans (AUTH.md, *More kinds of people*, 1). */
onClub('accessFans', '{code}/{squad}/{pid}/fans', onValueWritten, event => Promise.all([
  access.onFans(writerOf(event), event.params, event.data.before.val(), event.data.after.val()),
  markRoles(event, [...peopleIn(event.data.before.val()), ...peopleIn(event.data.after.val())])]).then(r => r[0]));

/* A club viewer (access.js; AUTH.md, *Club viewers, as built*): in the
   index like any role, so it is kept like one. */
exports.accessViewer = onValueWritten('/orgs/{code}/access/viewers/{uid}', event =>
  access.onViewer(writerOf(event), event.params, event.data.before.val(), event.data.after.val()));

/* Two derived parts (access.js): staff names, so a family can
   see who her coach is without reading anyone's email, and the roster, the
   numbers the whole club reads in place of the squad. A child's record is
   watched one child at a time, so saving the whole squad wakes only the
   children that changed. */
exports.namesMember = onValueWritten('/orgs/{code}/members/{uid}', event =>
  access.onMember(writerOf(event), event.params));
exports.rosterPlayer = onValueWritten('/orgs/{code}/squad/{tid}/{pid}', event =>
  access.onSquadPlayer(writerOf(event), event.params));
exports.rosterOpen = onValueWritten('/orgs/{code}/org/rosterOpen', event =>
  access.onRosterOpen(writerOf(event), event.params));

/* The share pages (mirror.js; SERVER.md, "The share pages"): the only
   writer of public/ for a team. A team's entries are watched whole, as
   pushEntry watches each one; a game never whole, because a game being
   played is written every few seconds, but each of its parts on its own
   (matches/{mid}/{part}: a goal, a sub, the clock each wake one run, and a
   whole game saved wakes only the parts that changed). Then a team's own
   fields, a player one at a time, and a game's answers one game at a time. */
/* The entries and a game's when and where also mark the club for My
   calendar's feeds, which carry the same entries and games; play marks
   nothing. */
onClub('mirrorEvents', '{code}/teams/{tid}/events', onValueWritten, event => Promise.all([
  mirror.onEvents(mirrorOf(event), event.params), markClub(event)]).then(r => r[0]));
onClub('publishGame', '{code}/matches/{mid}/{part}', onValueWritten, event => Promise.all([
  mirror.onGamePart(mirrorOf(event), event.params, event.data.before.val(), event.data.after.val()),
  mirror.GAME_FIELDS.includes(event.params.part) ? markClub(event) : null]).then(r => r[0]));
for (const field of mirror.TEAM_FIELDS)
  onClub('publishTeam' + field[0].toUpperCase() + field.slice(1), `{code}/teams/{tid}/${field}`, onValueWritten, event =>
    mirror.onTeamField(mirrorOf(event), event.params, field, event.data.before.val(), event.data.after.val()));
onClub('publishPlayer', '{code}/{squad}/{pid}', onValueWritten, event =>
  mirror.onPlayer(mirrorOf(event), event.params, event.data.before.val(), event.data.after.val()));
onClub('publishAnswers', '{code}/rsvp/{tid}/{item}', onValueWritten, event =>
  mirror.onAnswers(mirrorOf(event), event.params));

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
exports.bookAsk = onValueCreated('/bookAsks/{code}/{uid}/{id}', event =>
  booking.onAsk(bookerOf(event), event.params, event.data.val()));
exports.bookFreed = onValueWritten('/training/{code}/booked/{sid}/{pid}', event =>
  booking.onBooked(bookerOf(event), event.params, event.data.before.val(), event.data.after.val()));

/* Training sessions and club activity, to a closed phone (news.js; SERVER.md,
   "Notifications"): a booking changing, a session added, moved or called
   off, a coach's time off or call-out. Each is one small record written
   once per change, never anything a game being played writes. */
exports.newsBooked = onValueWritten('/training/{code}/booked/{sid}/{pid}', event =>
  news.onBooked(envOf(event), event.params, event.data.before.val(), event.data.after.val()));
exports.newsSession = onValueWritten('/training/{code}/sessions/{sid}', event =>
  news.onSession(envOf(event), event.params, event.data.before.val(), event.data.after.val()));
exports.newsAway = onValueWritten('/training/{code}/away/{uid}/{id}', event =>
  news.onAway(envOf(event), event.params, event.data.before.val(), event.data.after.val()));

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
/* Her setting: marked for the next build, and an address she replaced or
   turned off taken down now (her phone no longer writes public/). */
exports.myCalSetting = onValueWritten('/people/{uid}/set', event => {
  const root = event.data.after.ref.root;
  return Promise.all([mycal.touchPerson(markerOf(event), event.params.uid), mycal.onSetting({
    get: p => root.child(p).get().then(s => s.val()),
    set: (p, v) => (/^(public|serverState\/pages)\//.test(p) ? root.child(p).set(v) : Promise.reject(new Error('not ' + p))),
    claim: (p, fn) => root.child(p).transaction(fn).then(r => !!r.committed)
  }, event.params.uid, event.data.before.val(), event.data.after.val())]).then(r => r[1]);
});
/* The default database only: it has no event to say which instance, and a
   rehearsal database's feeds are not worth a second schedule. One instance,
   so two runs never build the same feed at once. */
exports.myCalBuild = onSchedule({ schedule: 'every 5 minutes', maxInstances: 1 }, () => {
  const root = getDatabase().ref();
  return mycal.run({
    site: process.env.SOCCER_SITE || '',
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
