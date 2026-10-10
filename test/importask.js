/* A bulk import applied by the server (functions/imports.js; SERVER.md,
   *Backups and imports*), on the fake server with functions/index.js
   required as deployed.

   The admin's phone plans the import as it always has (test/import.js) and
   sends the planned writes in one ask. The server writes with admin
   credentials, so this checks what the rules would have: only an admin of
   that club, only inside that club and only the parts an import writes
   (never a role, a lookup table, another club or the root), and a single
   write outside them refuses the whole import with nothing written. Then
   that it is applied in order and whole, in writes the database takes for a
   club of a real size, that a failure part way is said and finished by
   asking again, and that the plan, children's names and all, does not stay
   on the ask. And the phone half: the writes it sends are exactly the ones
   applyImport() would have sent, laid out for the club's tree, calendar
   writes stamped. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer, ORGS_MODE } = require('./fakebase');
const imports = require('../functions/imports');

const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true },
    teams: { t1: { coaches: { coach: true } } },
    teamIndex: { t1: { coach: 'coach' } }
  },
  teams: { t1: { id: 't1', name: 'Flight', players: { p1: { id: 'p1', name: 'Ella', number: '7' } } } },
  matches: {}
});
function server(edit) {
  const db = { workspaces: { CLUB: CLUB(), OTHER: { access: { admins: { o: true } }, teams: {} } } };
  if (edit) edit(db);
  const S = makeServer(db);
  S.loadFunctions();
  return S;
}
// the club's own base on this pass's tree, as the phone lays a path out
const B = ORGS_MODE ? 'orgs/CLUB' : 'workspaces/CLUB';
const TREE = ORGS_MODE ? 'orgs' : 'workspaces';
const sq = (tid, pid) => (ORGS_MODE ? `${B}/squad/${tid}/${pid}` : `${B}/teams/${tid}/players/${pid}`);
let n = 0;
const ask = (S, uid, writes, extra = {}) => S.fire(`importAsks/CLUB/${uid}/x${++n}`, { at: Date.now(), tree: TREE, writes, ...extra }).then(r => r.importAsk);
const W = 'workspaces/CLUB/';

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('an ask wakes the import', S.woken('importAsks/CLUB/adm/x').join(), 'importAsk');
    check('its answer wakes nothing', S.woken('importAsks/CLUB/adm/x/answer').length, 0);
  }

  console.log('\n--- an admin\'s import, applied whole ---');
  {
    const S = server();
    const writes = [
      { p: `${B}/teams/t2`, v: { id: 't2', name: 'Storm' } },
      { p: sq('t2', 'q1'), v: { id: 'q1', name: 'Gia', number: '3' } },
      { p: sq('t1', 'p1') + '/number', v: '8' },
      { p: `${B}/matches/m1`, v: { id: 'm1', teamId: 't2', opponent: 'Northgate', date: '2026-10-18', edit: { by: 'adm', at: 1 } } },
      { p: `${B}/teams/t2/events/e1`, v: { id: 'e1', kind: 'practice', date: '2026-10-14', start: '18:00' } },
      { p: 'training/CLUB/sessions/s1', v: { id: 's1', coach: 'coach', date: '2026-10-20', start: '16:00' } },
      { p: 'training/CLUB/booked/s1/q1', v: { tid: 't2', st: 'in', by: 'adm', at: 1 } },
      { p: 'training/CLUB/drills/d1', v: { id: 'd1', name: 'Rondo', at: 1 } }
    ];
    const a = await ask(S, 'adm', writes);
    deepEq('applied, every write', [a.ok, a.n], [true, 8]);
    check('a new team', S.at(W + 'teams/t2/name'), 'Storm');
    check('its player', S.at(W + 'teams/t2/players/q1/name'), 'Gia');
    check('a change to one already here, field by field', [S.at(W + 'teams/t1/players/p1/number'), S.at(W + 'teams/t1/players/p1/name')].join(), '8,Ella');
    check('a game, stamped as the phone stamped it', S.at(W + 'matches/m1/edit/by'), 'adm');
    check('a practice', S.at(W + 'teams/t2/events/e1/date'), '2026-10-14');
    check('a session and its booking', [S.at('training/CLUB/sessions/s1/coach'), S.at('training/CLUB/booked/s1/q1/st')].join(), 'coach,in');
    check('a club drill', S.at('training/CLUB/drills/d1/name'), 'Rondo');
    check('the answer beside the ask', S.at(`importAsks/CLUB/adm/x${n}/answer/ok`), true);
    check('and the plan, with its children\'s names, taken off the ask', S.at(`importAsks/CLUB/adm/x${n}/writes`), null);
    // a path and one beneath it, which one database update may not name together: in order, in two
    const b = await ask(S, 'adm', [{ p: `${B}/matches/m2`, v: { id: 'm2', teamId: 't1', date: '2026-10-19' } }, { p: `${B}/matches/m2/kickoff`, v: '09:00' }, { p: `${B}/matches/m2`, v: { id: 'm2', teamId: 't1', date: '2026-10-20' } }]);
    check('a path and one beneath it go in order', [b.ok, S.at(W + 'matches/m2/date'), S.at(W + 'matches/m2/kickoff')].join(), 'true,2026-10-20,');
    const c = await ask(S, 'adm', [{ p: `${B}/matches/m3`, v: { id: 'm3', teamId: 't1', date: '2026-10-19', edit: { by: 'coach', at: 1 } } }, { p: `${B}/matches/m3/edit`, v: { by: 'coach', at: 2 } }]);
    check('a stamp in somebody else\'s name is made the asker\'s', [c.ok, S.at(W + 'matches/m3/edit/by')].join(), 'true,adm');
    const again = await ask(S, 'adm', writes);
    check('the same file twice changes nothing more', [again.ok, S.at(W + 'teams/t2/name'), Object.keys(S.at(W + 'teams/t2/players')).length].join(), 'true,Storm,1');
  }

  console.log('\n--- only an admin, only inside the club, only what an import writes ---');
  {
    const no = async (label, uid, writes, why, edit, extra) => {
      const S = server(edit);
      const before = JSON.stringify([S.at('workspaces'), S.at('training'), S.at('userOrgs'), S.at('public')]);
      const a = await ask(S, uid, writes, extra);
      check(label, a.why, why);
      check('— and nothing was written', JSON.stringify([S.at('workspaces'), S.at('training'), S.at('userOrgs'), S.at('public')]), before);
    };
    const team = { p: `${B}/teams/t9`, v: { id: 't9', name: 'X' } };
    await no('a coach is refused', 'coach', [team], 'admin');
    await no('so is somebody not in the club', 'rando', [team], 'admin');
    await no('an admin of another club is refused here', 'o', [team], 'admin');
    await no('a role, slipped into an import: the whole import refused', 'adm', [team, { p: `${B}/access/admins/rando`, v: true }], 'outside');
    await no('a lookup table', 'adm', [team, { p: `${B}/access/index/rando`, v: true }], 'outside');
    await no('another club', 'adm', [team, { p: (ORGS_MODE ? 'orgs' : 'workspaces') + '/OTHER/teams/t1', v: { name: 'Mine now' } }], 'outside');
    await no('the root', 'adm', [team, { p: 'userOrgs/rando/CLUB', v: { name: 'x' } }], 'outside');
    await no('a share page', 'adm', [team, { p: 'public/abc', v: { team: {} } }], 'outside');
    await no('another club\'s training', 'adm', [team, { p: 'training/OTHER/sessions/s1', v: { id: 's1' } }], 'outside');
    await no('a part of training no import writes', 'adm', [team, { p: 'training/CLUB/secret/x', v: 1 }], 'outside');
    await no('a whole team list at once', 'adm', [{ p: `${B}/teams`, v: { t9: { id: 't9' } } }], 'outside');
    await no('a path with tricks in it', 'adm', [{ p: `${B}/teams/../access/admins/x`, v: true }], 'outside');
    await no('nothing to write', 'adm', [], 'bad');
    await no('a retired club', 'adm', [team], 'retired', db => { db.retired = { CLUB: true }; });
    await no('a club being moved', 'adm', [team], 'moving', db => { db.serverState = { moving: { CLUB: { by: 'adm', at: 1 } } }; });
    await no('laid out for the other tree', 'adm', [team], 'tree', null, { tree: ORGS_MODE ? 'workspaces' : 'orgs' });
    const S = server();
    const a = await S.fire('importAsks/CLUB/adm/old', { at: Date.now() - 3600000, tree: TREE, writes: [team] });
    check('an ask an hour old is not acted on', [a.importAsk.why, S.at(W + 'teams/t9')].join(), 'stale,');
  }

  console.log('\n--- a season at once, and a failure part way ---');
  {
    const S = server();
    const writes = [];
    for (let t = 0; t < 4; t++) {
      writes.push({ p: `${B}/teams/b${t}`, v: { id: 'b' + t, name: 'Team ' + t } });
      for (let i = 0; i < 120; i++) writes.push({ p: sq('b' + t, 'q' + i), v: { id: 'q' + i, name: 'P' + i, number: String(i) } });
      for (let i = 0; i < 300; i++) writes.push({ p: `${B}/teams/b${t}/events/e${i}`, v: { id: 'e' + i, kind: 'practice', date: '2026-11-01', start: '17:00' } });
    }
    for (let i = 0; i < 250; i++) writes.push({ p: `${B}/matches/g${i}`, v: { id: 'g' + i, teamId: 'b' + (i % 4), opponent: 'X', date: '2026-11-02', kickoff: '10:00', periods: { 0: { start: 1, end: 2 } }, goals: { a: { at: 1 } } } });
    const a = await ask(S, 'adm', writes);
    check('four teams, 480 players, 1,200 entries and 250 games: applied in writes the database takes', [a.ok, a.n].join(), 'true,' + writes.length);
    check('every one there', [Object.keys(S.at(W + 'matches')).length, Object.keys(S.at(W + 'teams/b3/players')).length, Object.keys(S.at(W + 'teams/b3/events')).length].join(), '250,120,300');
  }
  {
    const S = server();
    let calls = 0;
    const env = {
      get: p => S.ref(p).get().then(s => s.val()), set: (p, v) => S.ref(p).set(v),
      update: patch => (Object.keys(patch).some(k => /answer|\/writes$/.test(k)) || ++calls === 1 ? S.ref('').update(patch) : Promise.reject(new Error('unavailable')))
    };
    const writes = [];
    for (let i = 0; i < 150; i++) writes.push({ p: `${B}/teams/t1/events/e${i}`, v: { id: 'e' + i, kind: 'practice', date: '2026-11-01' } });
    const a = await imports.onAsk(env, { code: 'CLUB', uid: 'adm', id: 'f1' }, { at: Date.now(), tree: TREE, writes });
    deepEq('a failure part way is said, with how far it got', [a.ok, a.why, a.done, a.of], [false, 'failed', 100, 150]);
    const b = await ask(S, 'adm', writes);
    check('asking again finishes it', [b.ok, Object.keys(S.at(W + 'teams/t1/events')).length].join(), 'true,150');
    check('an ask answered once is not answered again', (await imports.onAsk(env, { code: 'CLUB', uid: 'adm', id: 'f1' }, { at: Date.now(), writes })).why, 'answered');
  }

  console.log('\n--- the phone: what it sends is what it would have written ---');
  {
    const A = H.loadApp({ storage: { 'sm.workspace': 'CLUB', ...(ORGS_MODE ? { 'sm.tree.v1:CLUB': 'orgs' } : {}) } });
    await A.flush();
    A.state = CLUB(); A.appOwners = {}; A.me = { uid: 'adm', name: 'Ada' };
    const plan = A.importPlan({
      teams: [
        { name: 'Flight', players: [{ name: 'Ella', number: 8, note: 'quick' }, { name: 'Rosa', number: 9 }],
          games: [{ opponent: 'Northgate', date: '2026-10-18', kickoff: '10:00' }], practices: [{ date: '2026-10-14', start: '18:00', end: '19:15' }] },
        { name: 'Storm', players: [{ name: 'Gia', number: 3, note: 'left foot' }] }
      ]
    }, A.state);
    check('the plan has writes', plan.writes.length > 0 && !plan.errors.length, true);
    const sent = A.importWrites(plan);
    const paths = sent.map(x => x.p);
    check('every one laid out for the club\'s tree', paths.every(p => p.startsWith(B + '/') || p.startsWith('training/CLUB/')), true);
    check('and every one the server takes', paths.every(p => imports.allowed(p, { base: B, tree: TREE, access: B + '/access' }, 'CLUB')), true);
    if (ORGS_MODE) {
      check('a coach\'s note goes where only coaches and admins read it', paths.some(p => /\/coachNotes\/[^/]+\/[^/]+\/note$/.test(p)), true);
      check('and never onto the record her family reads', sent.some(x => /\/squad\//.test(x.p) && JSON.stringify(x.v || {}).includes('quick')), false);
    }
    const game = sent.find(x => /\/matches\/[^/]+$/.test(x.p));
    check('a new game stamped with who made it', game && game.v.edit && game.v.edit.by, 'adm');
    const entry = sent.find(x => /\/events\/[^/]+$/.test(x.p));
    check('a new practice too', entry && entry.v.edit && entry.v.edit.by, 'adm');
    check('nothing undefined, which the database refuses', JSON.stringify(sent).includes('undefined'), false);

    // applied by the server, the club holds what the phone's own writes would have left
    const S = server();
    const a = await ask(S, 'adm', sent);
    check('the server takes the phone\'s plan', a.ok, true);
    const clubNow = S.at('workspaces/CLUB');
    const B2 = H.loadApp({ storage: { 'sm.workspace': 'CLUB' } });
    await B2.flush();
    B2.state = CLUB(); B2.appOwners = {}; B2.me = { uid: 'adm', name: 'Ada' };
    B2.applyImport(plan);
    // what each kept, its stamps aside, keys in order (the orgs/ pass reads the club back laid out again)
    const sortKeys = v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v);
    const strip = o => sortKeys(JSON.parse(JSON.stringify(o, (k, v) => (k === 'edit' || k === 'at' || k === 'createdAt' || k === 'made' ? undefined : v))));
    deepEq('the same teams and players as the phone\'s own import', strip(clubNow.teams), strip({ ...B2.state.teams }));
    deepEq('the same games', strip(clubNow.matches), strip(B2.state.matches));

    // what the phone keeps when the server applied it: the club's copy, owing nothing
    A.landImport(plan);
    check('kept on the phone', Object.values(A.state.teams).some(t => t.name === 'Storm'), true);
    check('with nothing owed', A.pendingCount(), 0);
  }
  {
    // asking from the page, with the server deployed
    const { makeFakebase } = require('./fakebase');
    const CONFIG = { apiKey: 'k', databaseURL: 'https://x', projectId: 'p' };
    const go = async (answer, refuse) => {
      const fbk = makeFakebase();
      if (refuse) fbk.refuseWrites(p => /^importAsks\//.test(p));
      const A = H.loadApp({ firebase: fbk, config: CONFIG, window: { SOCCER_SERVER: true }, storage: { 'sm.workspace': 'CLUB' } });
      await A.flush(); fbk.signIn('adm', { name: 'Ada' }); await A.flush();
      fbk.deliver('.info/connected', true);
      fbk.deliver('workspaces/CLUB', CLUB()); await A.flush();
      const plan = A.importPlan({ teams: [{ name: 'Storm', players: [{ name: 'Gia', number: 3 }] }] }, A.state);
      const done = A.importVia(plan);
      await A.flush();
      const ask = fbk.record.writes.find(w => /^importAsks\/CLUB\/adm\//.test(w.path));
      if (answer !== undefined && ask) { fbk.deliver(ask.path + '/answer', answer); }
      else if (!refuse) A.timers.run();
      const how = await done; await A.flush();
      return { A, fbk, ask, how };
    };
    const ok = await go({ ok: true, n: 3, at: 1 });
    check('the plan goes to the server in one ask', !!ok.ask && Array.isArray(ok.ask.value.writes) && ok.ask.value.tree === 'workspaces', true);
    check('and nothing to the club from the phone', ok.fbk.record.writes.some(w => /^workspaces\/CLUB\/teams/.test(w.path)), false);
    check('applied there: kept here, owing nothing', [ok.how, Object.values(ok.A.state.teams).some(t => t.name === 'Storm'), ok.A.pendingCount()].join(), 'server,true,0');
    check('the ask is cleared away', ok.fbk.record.removes.includes(ok.ask.path), true);
    const no = await go({ ok: false, why: 'admin', at: 1 });
    check('the server\'s no is said, and the phone does not write it either', [no.how, no.A.lastToast(), no.fbk.record.writes.some(w => /^workspaces\/CLUB\/teams/.test(w.path))].join(), 'refused,Only club admins can import,false');
    const half = await go({ ok: false, why: 'failed', done: 1, of: 3, at: 1 });
    check('a failure part way: the phone finishes it, as it always could', [half.how, half.fbk.record.writes.some(w => /^workspaces\/CLUB\/teams\//.test(w.path))].join(), 'phone,true');
    const quiet = await go(undefined);
    check('no answer: the phone writes it itself', [quiet.how, quiet.fbk.record.writes.some(w => /^workspaces\/CLUB\/teams\//.test(w.path))].join(), 'phone,true');
    const old = await go(undefined, true);
    check('rules too old for the ask: the phone writes it itself', [old.how, old.fbk.record.writes.some(w => /^workspaces\/CLUB\/teams\//.test(w.path))].join(), 'phone,true');
  }

  H.summary('a bulk import applied by the server');
})().catch(e => { console.error(e); process.exit(1); });
