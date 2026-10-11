/* Old data moved once, by the server (functions/migrate.js; SERVER.md,
   *Moving old data*), on the fake server with functions/index.js required as
   deployed: practice plans from before the calendar given their entry, and
   the coach's notes still on a child's record moved to coachNotes on orgs/.

   It writes with admin credentials across every club, so this checks that
   it does exactly what the phones' movePlans() and moveCoachNotes() did and
   nothing more: the same entry, never an entry over something else, never
   a note over a newer one, never a note left in both places; that it runs
   once (and reads nothing after), skips a retired club and waits for one
   being moved; and that a failure leaves the club to be tried again. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer } = require('./fakebase');
const migrate = require('../functions/migrate');

const NOW = Date.UTC(2026, 9, 10, 12);
const CLUB = () => ({
  access: { org: { name: 'Lakeside SC' }, admins: { adm: true }, index: { adm: true, jaz: true }, teams: { t1: { coaches: { jaz: true } } } },
  teams: {
    t1: {
      id: 't1', name: 'Flight',
      players: { p1: { id: 'p1', name: 'Ella', number: '7' } },
      events: {
        e1: { id: 'e1', kind: 'practice', date: '2026-10-14', start: '18:00' },
        px: { id: 'px', kind: 'practice', date: '2026-09-30', start: '17:00', title: 'Made on a phone already' },
        ev: { id: 'ev', kind: 'event', date: '2026-10-01', title: 'Picture day' }
      }
    }
  },
  matches: {}
});
const PLANS = () => ({
  t1: {
    o1: { id: 'o1', teamId: 't1', date: '2026-09-24', start: '18:00', minutes: 75, place: 'Hill End', blocks: [], status: 'plan', made: 5, by: 'jaz', at: 1 },
    o2: { id: 'o2', teamId: 't1', date: '2026-09-02', minutes: 60, place: '', blocks: [], status: 'done', at: 1 },
    late: { id: 'late', teamId: 't1', date: '2026-09-03', start: '23:30', minutes: 60, at: 1 },
    e1: { id: 'e1', teamId: 't1', eid: 'e1', blocks: [], at: 1 },
    gone: { id: 'gone', teamId: 't1', eid: 'gone', blocks: [], at: 1 },
    px: { id: 'px', teamId: 't1', date: '2026-09-30', start: '17:00', at: 1 },
    ev: { id: 'ev', teamId: 't1', date: '2026-10-01', start: '10:00', at: 1 },
    nodate: { id: 'nodate', teamId: 't1', date: 'soon', at: 1 }
  },
  t9: { z1: { id: 'z1', teamId: 't9', date: '2026-09-10', start: '10:00', at: 1 } }
});
// a club already on orgs/ (made there, or moved): the coach's notes on two records, one with a newer copy beside it
const NOTES = () => ({
  access: { admins: { nadm: true }, index: { nadm: true } },
  org: { name: 'Hill United' },
  teams: { n1: { id: 'n1', name: 'Hill U12' } },
  squad: { n1: {
    q1: { id: 'q1', name: 'Kai', number: '4', note: 'shy in goal', rating: 4, guardians: { kmum: true } },
    q2: { id: 'q2', name: 'Lou', number: '5', note: 'old note', pairs: { q1: true } },
    q3: { id: 'q3', name: 'Max', number: '6' }
  } },
  coachNotes: { n1: { q2: { note: 'newer note' } } },
  matches: {}
});
function server(edit) {
  const db = {
    workspaces: { CLUB: CLUB(), GONE: { access: { admins: { g: true } }, teams: {} }, BUSY: { access: { admins: { b: true } }, teams: { b1: { id: 'b1', events: {} } } } },
    orgs: { NOTES: NOTES() },
    training: { CLUB: { practices: PLANS() }, GONE: { practices: { b1: { q: { id: 'q', date: '2026-09-01' } } } }, BUSY: { practices: { b1: { m: { id: 'm', date: '2026-09-01' } } } } },
    userOrgs: { jaz: { CLUB: { name: 'Lakeside SC' } }, adm: { CLUB: {}, GONE: {} }, nadm: { NOTES: {} }, b: { BUSY: {} } },
    retired: { GONE: true }
  };
  if (edit) edit(db);
  const S = makeServer(db);
  S.loadFunctions();
  return S;
}
const W = 'workspaces/CLUB/';
const raw = (S, p) => S.ref(p).get().then(s => s.val());
const env = S => ({
  get: p => S.ref(p).get().then(s => s.val()),
  set: (p, v) => S.ref(p).set(v),
  update: patch => S.ref('').update(patch)
});

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('one scheduled run', S.triggers.migrateOld && S.triggers.migrateOld.kind, 'schedule');
    check('daily, one at a time', JSON.stringify(S.triggers.migrateOld.opts), JSON.stringify({ schedule: 'every 24 hours', maxInstances: 1 }));
    check('woken by nothing written', S.woken('training/CLUB/practices/t1/o1').includes('migrateOld'), false);
  }

  console.log('\n--- practice plans from before the calendar ---');
  {
    const S = server();
    S.put('serverState/moving/BUSY', { by: 'b', at: 1 });
    const r = await migrate.run(env(S), NOW);
    deepEq('this club: the plans with no entry, by their own ids', r.CLUB, { plans: 4, notes: 0 });
    const e = S.at(W + 'teams/t1/events/o1');
    check('a plan with its own date gets a practice entry, under its own id', e && e.kind, 'practice');
    check('from its day, time and place', [e.date, e.start, e.end, e.venue].join(' '), '2026-09-24 18:00 19:15 Hill End');
    check('for the team only, as the calendar does by default', e.public, false);
    check('made when the plan was, by whoever made it', [e.createdAt, e.by].join(), '5,jaz');
    check('the plan is marked as moved', S.at('training/CLUB/practices/t1/o1/eid'), 'o1');
    check('and nothing else about it changes', JSON.stringify({ ...S.at('training/CLUB/practices/t1/o1'), eid: undefined }), JSON.stringify(PLANS().t1.o1));
    const o2 = S.at(W + 'teams/t1/events/o2');
    check('with no time, the entry has none', [o2.start, o2.end].join('|'), '|');
    check('a past one too, so its register has somewhere to hang', o2.date, '2026-09-02');
    check('one that runs past midnight ends on the clock', S.at(W + 'teams/t1/events/late/end'), '00:30');
    check('an entry a phone already made is left as it is', S.at(W + 'teams/t1/events/px/title'), 'Made on a phone already');
    check('and the plan is marked', S.at('training/CLUB/practices/t1/px/eid'), 'px');
    check('an id taken by something that is not a practice: nothing written over it', S.at(W + 'teams/t1/events/ev/kind'), 'event');
    check('and that plan left as it was', S.at('training/CLUB/practices/t1/ev/eid'), null);
    check('a plan whose entry was deleted is not given one back', S.at(W + 'teams/t1/events/gone'), null);
    check('a plan with no date it could be put on is left', [S.at(W + 'teams/t1/events/nodate'), S.at('training/CLUB/practices/t1/nodate/eid')].join(), ',');
    check('a plan for a team that has gone makes no team', S.at(W + 'teams/t9'), null);
    check('a retired club is left alone', [S.at('training/GONE/practices/b1/q/eid'), JSON.stringify(r.GONE)].join(), ',{"skipped":"retired"}');
    check('a club being moved is left for another day', [S.at('training/BUSY/practices/b1/m/eid'), JSON.stringify(r.BUSY)].join(), ',{"later":"moving"}');
    check('so the run is not done', S.at(migrate.RUN + '/done'), null);
    check('the clubs that went through are marked', !!S.at(migrate.RUN + '/clubs/CLUB') && !!S.at(migrate.RUN + '/clubs/GONE'), true);

    // the next day: only what was left is read
    S.put('serverState/moving/BUSY', null);
    const before = S.reads.length;
    const r2 = await migrate.run(env(S), NOW + 864e5);
    deepEq('the next day: only the club that waited', Object.keys(r2), ['BUSY']);
    check('nothing of a club that went through is read again', S.reads.slice(before).some(p => /CLUB/.test(p)), false);
    check('the club that waited goes through', S.at('training/BUSY/practices/b1/m/eid'), 'm');
    check('and the run is done', S.at(migrate.RUN + '/done'), NOW + 864e5);
    const n = S.reads.length;
    deepEq('then it never runs again', await S.tick('migrateOld'), { done: true });
    deepEq('reading one thing to know it', S.reads.slice(n), [migrate.RUN + '/done']);
  }
  {
    // a phone and the server moving the same plan: the same entry, wherever it came from
    const S = server();
    await migrate.run(env(S), NOW);
    const A = H.loadApp({});
    A.state = { teams: { t1: { id: 't1', name: 'Flight', players: {}, events: {} } }, matches: {} };
    A.train.practices.t1 = { o1: PLANS().t1.o1, o2: PLANS().t1.o2 };
    A.movePlans('t1');
    // o2 says nothing of when it was made, so each stamps its own clock
    const when = (e, id) => (id === 'o2' ? { ...e, createdAt: 0 } : e);
    for (const id of ['o1', 'o2']) deepEq(`${id}: the server's entry is the phone's`, when(S.at(W + 'teams/t1/events/' + id), id), when(A.state.teams.t1.events[id], id));
  }
  {
    // a club of a real size: more entries than one write may wake runs for
    const S = server(db => {
      for (let i = 0; i < 400; i++) db.training.CLUB.practices.t1['m' + i] = { id: 'm' + i, teamId: 't1', date: '2026-08-01', start: '17:00', at: 1 };
    });
    const r = await migrate.run(env(S), NOW);
    check('four hundred old plans: all moved, in writes the database takes', [r.CLUB.plans, Object.keys(S.at(W + 'teams/t1/events')).length].join(), [404, 406].join());
  }
  {
    // a write refused part way: the club is not marked, and the next run finishes it
    const S = server();
    const e = env(S);
    let fail = true;
    const real = e.update;
    e.update = patch => (fail ? Promise.reject(new Error('unavailable')) : real(patch));
    const r = await migrate.run(e, NOW);
    check('a club whose write failed says so', /unavailable/.test(r.CLUB.failed), true);
    check('and is not marked done', [S.at(migrate.RUN + '/clubs/CLUB'), S.at(migrate.RUN + '/done')].join(), ',');
    fail = false;
    await migrate.run(e, NOW + 864e5);
    check('the next run finishes it', S.at('training/CLUB/practices/t1/o1/eid'), 'o1');
  }

  console.log('\n--- the coach\'s notes still on a child\'s record ---');
  {
    const S = server();
    const r = await migrate.run(env(S), NOW);
    deepEq('the records with notes on them', r.NOTES, { plans: 0, notes: 2 });
    const q1 = await raw(S, 'orgs/NOTES/squad/n1/q1'), n1 = await raw(S, 'orgs/NOTES/coachNotes/n1/q1');
    deepEq('the notes go where only coaches and admins read them', n1, { note: 'shy in goal', rating: 4 });
    deepEq('and come off the record her family reads, in the same write', q1, { id: 'q1', name: 'Kai', number: '4', guardians: { kmum: true } });
    deepEq('a newer note already there is kept, and the old one still comes off', await raw(S, 'orgs/NOTES/coachNotes/n1/q2'), { note: 'newer note', pairs: { q1: true } });
    check('nothing of hers left on the record', 'note' in (await raw(S, 'orgs/NOTES/squad/n1/q2')), false);
    check('a record with no notes is not written', S.reads.length > 0 && (await raw(S, 'orgs/NOTES/coachNotes/n1/q3')), null);
  }
  H.summary('old data moved once, by the server');
})().catch(e => { console.error(e); process.exit(1); });
