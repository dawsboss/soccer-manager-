/* Nightly backups by the server (functions/backup.js; SERVER.md, *Backups
   and imports*), on the fake server with functions/index.js required as
   deployed, its bucket in memory.

   A backup is every club, whole, in the project's private bucket: so this
   checks that each club anybody is in gets one file a day with all of it
   (the club, its training records, its messages, the admin's invites), that
   a retired club and a test club get none, that older files go after the
   window and today's and the rest stay, that a club that cannot be read
   gets no half file and keeps yesterday's, that one club failing never
   stops the others, and that nothing of it reaches public/ or any phone. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer } = require('./fakebase');
const backup = require('../functions/backup');

const NOW = Date.UTC(2026, 9, 10, 3);
const DAY = 864e5;
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const CLUB = () => ({
  access: { org: { name: 'Lakeside SC' }, admins: { adm: true }, index: { adm: true, mum: true }, teams: { t1: { coaches: { adm: true } } } },
  teams: { t1: { id: 't1', name: 'Flight', players: { p1: { id: 'p1', name: 'Ella', number: '7', note: 'shy in goal', guardians: { mum: true } } } } },
  matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Northgate', date: '2026-10-18' } },
  care: { c1: { allergies: 'nuts' } }
});
function server(edit) {
  const db = {
    workspaces: { CLUB: CLUB(), OLD: { access: { admins: { o: true }, index: { o: true } }, teams: {} }, 'test-abc': { access: { admins: { adm: true }, index: { adm: true } }, teams: {} } },
    training: { CLUB: { sessions: { s1: { id: 's1', coach: 'adm', date: '2026-10-20' } }, practices: { t1: { e1: { id: 'e1', eid: 'e1' } } } } },
    board: { CLUB: { t1: { n1: { by: 'adm', text: 'Bring water' } } } },
    dm: { CLUB: { t1: { mum: { m: { x: { by: 'mum', text: 'Running late' } } } } } },
    clubInvites: { CLUB: { i1: { role: 'parent' } } },
    userOrgs: { adm: { CLUB: {}, 'test-abc': {} }, mum: { CLUB: {} }, o: { OLD: {} } },
    retired: { OLD: true }
  };
  if (edit) edit(db);
  const S = makeServer(db);
  S.loadFunctions();
  return S;
}
const env = (S, extra = {}) => ({
  get: p => S.ref(p).get().then(s => s.val()),
  set: (p, v) => S.ref(p).set(v),
  save: (p, t) => { S.files[p] = { text: t }; return Promise.resolve(); },
  list: prefix => Promise.resolve(Object.keys(S.files).filter(n => n.startsWith(prefix))),
  remove: p => { delete S.files[p]; return Promise.resolve(); },
  ...extra
});

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('one scheduled run', S.triggers.backupNightly && S.triggers.backupNightly.kind, 'schedule');
    check('nightly, one at a time', [S.triggers.backupNightly.opts.schedule, S.triggers.backupNightly.opts.maxInstances].join(), 'every day 03:00,1');
    check('woken by nothing written', S.woken('orgs/CLUB/teams/t1/name').includes('backupNightly'), false);
  }

  console.log('\n--- every club, whole, once a day ---');
  {
    const S = server();
    const r = await S.tick('backupNightly');
    const file = 'backups/CLUB/' + iso(Date.now()) + '.json';
    check('one file for the club, today', !!S.files[file], true);
    check('said as such', r.CLUB && r.CLUB.file, file);
    const doc = JSON.parse(S.files[file].text);
    check('the club whole: its teams, squad, the coach\'s notes, games', [doc.club.teams.t1.name, Object.keys(doc.club.squad.t1).join(), doc.club.coachNotes.t1.p1.note, doc.club.matches.g1.opponent].join('|'), 'Flight|p1|shy in goal|Northgate');
    check('care details too: this is the club\'s own copy, not a file on a phone', doc.club.care.c1.allergies, 'nuts');
    check('its training records', [doc.training.sessions.s1.id, doc.training.practices.t1.e1.eid].join(), 's1,e1');
    check('its notices and conversations', [doc.board.t1.n1.text, doc.dm.t1.mum.m.x.text].join('|'), 'Bring water|Running late');
    check('the admin\'s list of invites', doc.clubInvites.i1.role, 'parent');
    check('stamped as the server\'s, with when', [doc.by, typeof doc.savedAt].join(), 'server,number');
    check('a retired club gets none', [Object.keys(S.files).some(n => n.startsWith('backups/OLD/')), r.OLD.skipped].join(), 'false,retired');
    check('nor a test club', [Object.keys(S.files).some(n => n.startsWith('backups/test-abc/')), r['test-abc'].skipped].join(), 'false,test club');
    check('the server\'s own note of it', S.at('serverState/backups/CLUB/file'), file);
    check('nothing reaches public/', S.at('public'), null);
    check('and nothing a phone could read is written', Object.keys(S.tree).filter(k => !['workspaces', 'training', 'board', 'dm', 'clubInvites', 'userOrgs', 'retired', 'serverState'].includes(k)).join(), '');
  }
  {
    // the window: thirty days kept, older gone, a file of another club untouched
    const S = server();
    for (const d of [1, 29, 30, 31, 90]) S.files[`backups/CLUB/${iso(NOW - d * DAY)}.json`] = { text: '{}' };
    S.files['backups/OTHER/' + iso(NOW - 90 * DAY) + '.json'] = { text: '{}' };
    await backup.run(env(S), NOW);
    const have = Object.keys(S.files).filter(n => n.startsWith('backups/CLUB/')).map(n => n.slice(13, 23)).sort();
    deepEq('today and the last thirty days stay, older go', have, [iso(NOW - 30 * DAY), iso(NOW - 29 * DAY), iso(NOW - DAY), iso(NOW)].sort());
    check('another club\'s files are not this club\'s to tidy', !!S.files['backups/OTHER/' + iso(NOW - 90 * DAY) + '.json'], true);
    const again = await backup.run(env(S), NOW);
    check('run twice in a day: the same file, written again, nothing else', [Object.keys(S.files).filter(n => n.startsWith('backups/CLUB/')).length, again.CLUB.file].join(), '4,backups/CLUB/' + iso(NOW) + '.json');
  }
  {
    // a club that cannot be read whole: no file today, yesterday's kept, the others still go
    const S = server(db => { db.userOrgs.x = { OTHER: {} }; db.workspaces.OTHER = { access: { admins: { x: true }, index: { x: true } }, teams: { t: { id: 't', name: 'T' } } }; });
    S.files['backups/CLUB/' + iso(NOW - DAY) + '.json'] = { text: '{"old":true}' };
    const e = env(S, { get: p => (/^training\/CLUB/.test(p) ? Promise.reject(new Error('unavailable')) : S.ref(p).get().then(s => s.val())) });
    const r = await backup.run(e, NOW);
    check('a club that could not be read gets no half file', [r.CLUB.failed, !!S.files['backups/CLUB/' + iso(NOW) + '.json']].join(), 'unreadable,false');
    check('and keeps yesterday\'s', S.files['backups/CLUB/' + iso(NOW - DAY) + '.json'].text, '{"old":true}');
    check('the other club still goes', !!S.files['backups/OTHER/' + iso(NOW) + '.json'], true);
    const e2 = env(S, { save: p => (p.startsWith('backups/CLUB/') ? Promise.reject(new Error('bucket')) : (S.files[p] = { text: '{}' }, Promise.resolve())) });
    const r2 = await backup.run(e2, NOW);
    check('the bucket refusing one club is said, and the rest still go', [/bucket/.test(r2.CLUB.failed), !!S.files['backups/OTHER/' + iso(NOW) + '.json']].join(), 'true,true');
  }

  H.summary('nightly backups by the server');
})().catch(e => { console.error(e); process.exit(1); });
