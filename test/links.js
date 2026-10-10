/* Links with limits (the owner, 2026-10-09): whoever makes a link says how
   many people may use it and until when. Against the fake Firebase:

   - An invite for several people carries one seat each (`seats`), an id that
     says so ('m…'), and its maker's end date; each person takes a seat, then
     says it is hers (`took`), in the order the rules need; a full link turns
     the next person away before she writes anything, and nobody's leaving
     deletes it under the others. One person is still the default, and a
     player's own link and an emailed one are only ever for one.
   - The team link may have an end date and a number of families; an expired
     or full one says so before anyone types, and a seat comes before the ask.
   - A share page, a game's page, a team's calendar feed and My calendar's
     address can each be given an end date, which goes out on the page itself
     (`until`), for the rules and the calendar function to stop it at. A use
     limit is not offered there: nobody signs in to open them, so there is
     nobody to count. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CLUB = () => ({
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, mum: true },
    members: { adm: { name: 'Ada' }, coach: { name: 'Jaz' }, mum: { name: 'Mo' } },
    teams: { t1: { coaches: { coach: true } } },
    teamIndex: { t1: { coach: 'coach' } },
    teamParents: { t1: { mum: 'p1' } }
  },
  teams: {
    t1: { id: 't1', name: 'Flight', share: 'shareSeason01', calFeed: 'feedTeam0001', players: {
      p1: { id: 'p1', name: 'Ella', number: '7', active: true, guardians: { mum: true } },
      p2: { id: 'p2', name: 'Bea', number: '9', active: true }
    } }
  },
  matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', date: '2026-10-11', share: 'shareGame0001' } }
});
async function boot(who, extra = {}) {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB', ...(extra.storage || {}) }, search: extra.search });
  await A.flush();
  if (who) { fbk.signIn(who, { name: extra.name || who, email: who + '@x.test' }); await A.flush(); }
  if (!extra.search) { await fbk.serveClub('CLUB', CLUB(), A.flush); await A.flush(); }
  return { A, fbk };
}
const wrote = fbk => fbk.record.writes.map(w => w.path);
const valueAt = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
const sheet = A => String(A.dom.node('#sheet').innerHTML);

(async () => {
  console.log('--- an invite for several people ---');
  {
    const { A, fbk } = await boot('adm');
    A.ui.inv = { role: 'parent', team: 't1', player: 'p2' };
    A.click({ act: 'invitenew' });
    check('the invite sheet asks how many people and for how long', /id="invUses"/.test(sheet(A)) && /id="invDays"/.test(sheet(A)), true);
    A.ui.inv = { role: 'parent', team: 't1', player: 'p2' };
    A.dom.node('#invUses').value = '2'; A.dom.node('#invDays').value = '30';
    A.click({ act: 'invitemake' }); await A.flush(10);
    const inv = fbk.record.writes.find(w => /^invites\/[^/]+$/.test(w.path));
    check('an id that says it is for several', inv && /^invites\/m[0-9a-f]{36}$/.test(inv.path), true);
    deepEq('a seat for each of the two', inv && inv.value.seats, { s1: true, s2: true });
    check('— and how many, for the screen', inv && inv.value.max, 2);
    check('lasting the thirty days she chose', inv && Math.round((inv.value.expiresAt - inv.value.at) / 864e5), 30);
    check('the sheet says so', /Up to 2 people, until/.test(sheet(A)), true);
    check('the admin\'s list knows it is for two', (valueAt(fbk, 'clubInvites/CLUB/' + inv.path.split('/')[1]) || {}).max, 2);
  }
  {
    const { A, fbk } = await boot('adm');
    A.ui.inv = { role: 'coach', team: 't1' };
    A.click({ act: 'invitemake' }); await A.flush(10);
    const inv = fbk.record.writes.find(w => /^invites\/[^/]+$/.test(w.path));
    check('with nothing chosen: one person, fourteen days, as always', inv && [inv.path.split('/')[1][0], !!inv.value.seats, Math.round((inv.value.expiresAt - inv.value.at) / 864e5)].join(), 'i,false,14');
  }
  {
    const { A, fbk } = await boot('adm');
    A.ui.inv = { role: 'coach', team: 't1' };
    A.click({ act: 'invitenew' });
    A.ui.inv = { role: 'coach', team: 't1' };
    A.dom.node('#invEmail').value = 'kim@x.test'; A.dom.node('#invUses').value = '5';
    A.click({ act: 'invitemake' }); await A.flush(10);
    const inv = fbk.record.writes.find(w => /^invites\/[^/]+$/.test(w.path));
    check('an emailed invite is for that one person, whatever was chosen', inv && !inv.value.seats && inv.path[8], 'i');
  }

  console.log('\n--- taking a seat ---');
  const DOC = A => ({ ws: 'CLUB', team: 't1', teamName: 'Flight', role: 'parent', player: 'p2', playerNo: '9', clubName: 'Lakeside SC',
    by: 'adm', byName: 'Ada', at: A.nowMs() - 1000, expiresAt: A.nowMs() + 7 * 864e5, max: 2, seats: { s1: true, s2: true } });
  const ID = 'm' + 'a'.repeat(36);
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'workspaces' }, search: '?invite=' + ID });
    await A.flush();
    fbk.signIn('dad', { name: 'Dev', email: 'dad@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, { ...DOC(A), seat: { s1: { by: 'mum2', at: 1 } }, took: { mum2: 's1' } }); await A.flush();
    A.click({ act: 'inviteaccept' }); await A.flush(20);
    const p = wrote(fbk), at = x => p.indexOf(x);
    check('she takes the seat still free', valueAt(fbk, `invites/${ID}/seat/s2`) && valueAt(fbk, `invites/${ID}/seat/s2`).by, 'dad');
    check('then says it is hers', valueAt(fbk, `invites/${ID}/took/dad`), 's2');
    check('never the single-use way', p.includes(`invites/${ID}/used`), false);
    check('then the role it grants, carrying the link\'s id', valueAt(fbk, 'orgs/CLUB/squad/t1/p2/guardians/dad'), ID);
    check('seat, then hers, then the role', at(`invites/${ID}/seat/s2`) < at(`invites/${ID}/took/dad`) && at(`invites/${ID}/took/dad`) < at('orgs/CLUB/squad/t1/p2/guardians/dad'), true);
    check('ticked off on the admins\' list', !!valueAt(fbk, `clubInvites/CLUB/${ID}/took/dad`), true);
    check('the link stays for anyone still to use it', fbk.record.removes.includes('invites/' + ID), false);
  }
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.tree.v1:CLUB': 'workspaces' }, search: '?invite=' + ID });
    await A.flush();
    fbk.signIn('aunt', { name: 'Jo', email: 'jo@x.test' }); await A.flush();
    fbk.deliver('invites/' + ID, { ...DOC(A), seat: { s1: { by: 'mum2', at: 1 }, s2: { by: 'dad', at: 2 } }, took: { mum2: 's1', dad: 's2' } }); await A.flush();
    check('every seat taken: she is told it is used up', /That link has been used up/.test(A.rendered()) && /It was for 2 people/.test(A.rendered()), true);
    check('and offered no Accept', /data-act="inviteaccept"/.test(A.rendered()), false);
  }
  {
    const { A, fbk } = await boot('adm');
    A.forgetInvite(ID); A.forgetInvite('iSingle000');
    check('taking a role away never deletes a link for several', fbk.record.removes.includes('invites/' + ID), false);
    check('— a single-use one still goes', fbk.record.removes.includes('invites/iSingle000'), true);
  }

  console.log('\n--- the team link: until when, and for how many ---');
  {
    const { A, fbk } = await boot('coach');
    A.ui.teamId = 't1'; A.ui.view = 'roster'; A.render();
    check('Squad offers limits for the link', /id="joinUses"/.test(A.rendered()) && /id="joinDays"/.test(A.rendered()), true);
    A.dom.node('#joinUses').value = '10'; A.dom.node('#joinDays').value = '7';
    A.click({ act: 'joinnew', tid: 't1' }); await A.flush(10);
    const jc = fbk.record.writes.find(w => /^joinCodes\/[^/]+$/.test(w.path));
    check('the link carries ten seats', jc && Object.keys(jc.value.seats || {}).length + ' ' + jc.value.max, '10 10');
    check('and a week', jc && Math.round((jc.value.expiresAt - jc.value.at) / 864e5), 7);
    check('the team remembers both, to show', A.state.teams.t1.join.max + ' ' + !!A.state.teams.t1.join.until, '10 true');
    A.render();
    check('and says them', /Up to 10 people, until/.test(A.rendered()), true);
  }
  {
    const { A, fbk } = await boot('coach');
    A.click({ act: 'joinnew', tid: 't1' }); await A.flush(10);
    const jc = fbk.record.writes.find(w => /^joinCodes\/[^/]+$/.test(w.path));
    check('with no limits chosen, as it always was', jc && [!!jc.value.seats, !!jc.value.expiresAt].join(), 'false,false');
  }
  const JD = A => ({ ws: 'CLUB', team: 't1', teamName: 'Flight', clubName: 'Lakeside SC', by: 'coach', byName: 'Jaz', at: 1 });
  {
    const { A, fbk } = await boot('newmum', { storage: {}, search: '?join=jexp' });
    fbk.deliver('joinCodes/jexp', { ...JD(A), expiresAt: A.nowMs() - 1000 }); await A.flush();
    check('an expired team link says so', /That team link has expired/.test(A.rendered()), true);
    check('— before she types anything', /id="joinShirt"/.test(A.rendered()), false);
  }
  {
    const { A, fbk } = await boot('newmum', { storage: {}, search: '?join=jfull' });
    fbk.deliver('joinCodes/jfull', { ...JD(A), max: 1, seats: { s1: true }, seat: { s1: { by: 'x', at: 1 } }, took: { x: 's1' } }); await A.flush();
    check('a full one says it is used up', /That team link has been used up/.test(A.rendered()), true);
  }
  {
    const { A, fbk } = await boot('newmum', { storage: { 'sm.tree.v1:CLUB': 'workspaces' }, search: '?join=jseat' });
    fbk.deliver('joinCodes/jseat', { ...JD(A), max: 2, seats: { s1: true, s2: true } }); await A.flush();
    fbk.deliver('claims/CLUB/t1/newmum', null); await A.flush();
    A.dom.node('#joinShirt').value = '9';
    A.click({ act: 'joinsend' }); await A.flush(20);
    const p = wrote(fbk), at = x => p.indexOf(x);
    check('a seat first, then hers, then the ask', at('joinCodes/jseat/seat/s1') >= 0 && at('joinCodes/jseat/seat/s1') < at('joinCodes/jseat/took/newmum') && at('joinCodes/jseat/took/newmum') < at('claims/CLUB/t1/newmum'), true);
  }

  console.log('\n--- a share page or feed: an end date ---');
  {
    const { A, fbk } = await boot('coach');
    A.ui.teamId = 't1'; A.ui.matchId = 'g1';
    A.click({ act: 'sharesheet' });
    check('the share sheet offers an end date for the season link and the game\'s', (sheet(A).match(/data-act="linkuntil"/g) || []).length >= 10, true);
    A.click({ act: 'linkuntil', k: 'season', d: '30', tid: 't1' }); await A.flush(20);
    const u = A.state.teams.t1.shareUntil;
    check('the team keeps the date', Math.round((u - A.nowMs()) / 864e5), 30);
    check('— written to the club, for the server to put on the page', valueAt(fbk, 'orgs/CLUB/teams/t1/shareUntil'), u);
    check('the phone writes no page itself (SEC-10)', wrote(fbk).some(p => p.startsWith('public/')), false);
    A.click({ act: 'linkuntil', k: 'game', d: '7', tid: 't1', mid: 'g1' }); await A.flush(20);
    check('a game\'s page takes its own', Math.round((valueAt(fbk, 'orgs/CLUB/matches/g1/shareUntil') - A.nowMs()) / 864e5), 7);
    A.click({ act: 'linkuntil', k: 'feed', d: '90', tid: 't1' }); await A.flush(20);
    check('the team\'s calendar feed takes one too', Math.round((valueAt(fbk, 'orgs/CLUB/teams/t1/calFeedUntil') - A.nowMs()) / 864e5), 90);
    A.click({ act: 'linkuntil', k: 'season', d: '0', tid: 't1' }); await A.flush(20);
    check('No end takes it off', A.state.teams.t1.shareUntil == null && valueAt(fbk, 'orgs/CLUB/teams/t1/shareUntil') == null, true);
  }
  {
    const { A, fbk } = await boot('mum');
    const before = fbk.record.writes.length;
    A.click({ act: 'linkuntil', k: 'season', d: '1', tid: 't1' }); await A.flush(10);
    check('a parent cannot put an end date on the team\'s link', fbk.record.writes.slice(before).some(w => /shareUntil/.test(w.path)), false);
  }
  {
    const { A } = await boot('mum');
    A.state.teams.t1.shareUntil = 5; A.state.matches.g1.shareUntil = 6; A.state.teams.t1.calFeedUntil = 7;
    const t = A.state.teams.t1, m = A.state.matches.g1;
    check('every page carries its end date', [A.publicDoc(t).until, A.fixtureDoc(t, m).until, A.calendarDoc(t).until].join(), '5,6,7');
    delete t.shareUntil; delete m.shareUntil; delete t.calFeedUntil;
    check('— and none without one', [A.publicDoc(t), A.fixtureDoc(t, m), A.calendarDoc(t)].some(x => 'until' in x), false);
  }

  H.summary('links with limits: how many people, and until when');
})();
