/* States a parent meets before she is in the club, rendered by the app's own
   code on the test harness (test/harness.js + test/fakebase.js), because the
   real page would need the club's database to answer: an invite ready to
   accept, a team link's form and its waiting screen, a registration link and
   its form. Also the share pages' documents (publicDoc/fixtureDoc) for the
   fake SDK the share-page capture serves. Writes states.json and pubdocs.json. */
const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, '..', '..', 'test', 'harness'));
const { makeFakebase } = require(path.join(__dirname, '..', '..', 'test', 'fakebase'));
const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const Q = JSON.parse(fs.readFileSync('quiet.json', 'utf8')), L = JSON.parse(fs.readFileSync('live.json', 'utf8'));
const out = {};
const grab = (A, name, note) => { out[name] = { note, hash: '', titlebar: A.rendered('#titlebar'), app: A.rendered(), tabbar: A.rendered('#tabbar'), sheet: String(A.dom.node('#sheet').innerHTML || ''), toast: A.lastToast() || '' }; };

(async () => {
  H.clock.set(Q.NOW);
  // --- an invite, as a parent opens it ---
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, search: '?invite=iabc123' });
    await A.flush();
    fbk.signOut(); await A.flush();
    grab(A, 'invite-signedout', 'an invite link opened signed out');
    fbk.signIn('mum', { name: 'Mo Delgado', email: 'mo.delgado@example.com' }); await A.flush();
    grab(A, 'invite-opening', 'signed in, the invite being read');
    fbk.deliver('invites/iabc123', { ws: 'lakeside', team: 'sbA', teamName: 'G12 Flight', role: 'parent', player: 'sbA_p5', playerNo: '7', clubName: 'Lakeside SC', by: 'boss', byName: 'Ada Okafor', at: Q.NOW - 1000, expiresAt: Q.NOW + 7 * 864e5 }); await A.flush();
    grab(A, 'invite-ready', 'the invite, ready to accept (a parent of #7)');
    fbk.deliver('invites/iabc123', { ws: 'lakeside', team: 'sbA', teamName: 'G12 Flight', role: 'parent', player: 'sbA_p5', playerNo: '7', clubName: 'Lakeside SC', by: 'boss', byName: 'Ada Okafor', at: Q.NOW - 20 * 864e5, expiresAt: Q.NOW - 864e5 }); await A.flush();
    grab(A, 'invite-expired', 'an invite past its date');
  }
  // --- a team link ---
  {
    const CODE = 'jabc123';
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, search: '?join=' + CODE });
    await A.flush();
    fbk.signOut(); await A.flush();
    grab(A, 'join-signedout', 'a team link opened signed out');
    fbk.signIn('sam', { name: 'Sam Newby', email: 'sam.newby@example.com' }); await A.flush();
    fbk.deliver('joinCodes/' + CODE, { ws: 'lakeside', team: 'sbA', teamName: 'G12 Flight', clubName: 'Lakeside SC', by: 'jaz', byName: 'Jaz Aldritt', at: 1 }); await A.flush();
    fbk.deliver('claims/lakeside/sbA/sam', null); await A.flush();
    grab(A, 'join-form', 'the team link: asking for the shirt number');
    A.click({ act: 'joinkid', v: '1' }); await A.flush();
    grab(A, 'join-form-newchild', 'the team link: a child not on the squad yet');
    A.click({ act: 'joinkid', v: '0' }); await A.flush();
    A.dom.node('#joinShirt').value = '7'; A.dom.node('#joinChild').value = 'Rosa'; A.dom.node('#joinKidName').value = 'Rosa Delgado'; A.dom.node('#joinKidBorn').value = '2015-03-05';
    A.click({ act: 'joinsend' }); await A.flush(); await A.flush(20);
    grab(A, 'join-waiting', 'after sending: waiting for the coach');
    fbk.deliver('claims/lakeside/sbA/sam', null); await A.flush();
    grab(A, 'join-refused', 'the coach turned it down');
  }
  // --- a registration link ---
  {
    const fbk = makeFakebase();
    const A = H.loadApp({ firebase: fbk, config: CONFIG, search: '?reg=rl1' });
    await A.flush();
    fbk.signIn('newmum', { name: 'Ann Cole', email: 'ann.cole@example.com' }); await A.flush();
    fbk.deliver('.info/connected', true);
    await fbk.serve('regOpen', { rl1: { ws: 'lakeside', prog: 'f27', name: 'Fall 2027 season', kind: 'season', club: 'Lakeside SC', money: '$', born: { lo: 2014, hi: 2019 }, gender: 'F', fee: 120, feeNote: 'Transfer to the club', about: 'Girls born 2014 to 2019. Practices twice a week, games on Saturdays.',
      asks: { q1: { q: 'Any position she loves?', o: 0 }, q2: { q: 'Can you help on match days?', o: 1, need: true } }, waivers: { w1: { title: 'Photos', v: 2, text: 'We may take photos at games and use them on the club website.' } }, by: 'adm', at: 1 } }, A.flush);
    await fbk.serve('families', { newmum: {} }, A.flush);
    await fbk.serve('regOpen', { rl1: null }, A.flush); await A.flush(20);
    grab(A, 'reg-open', 'a registration link, opened by a family not in the club');
    A.click({ act: 'regform', id: 'new' }); await A.flush();
    grab(A, 'reg-form', 'the registration form');
  }
  fs.writeFileSync('states.json', JSON.stringify(out, null, 1));
  console.log('states:', Object.keys(out).map(k => k + ':' + out[k].app.length).join(' '));

  // --- the share pages' documents, from the admin's whole copy ---
  const docs = {};
  for (const [tag, P] of [['quiet', Q], ['live', L]]) {
    H.clock.set(P.NOW);
    const A = H.loadApp({ config: CONFIG, storage: { 'sm.workspace': 'lakeside', ['sm.data.v1:lakeside']: P.personas.boss['sm.data.v1:lakeside'] } });
    A.me = { uid: 'boss', name: 'Ada', email: 'a@x' };
    const s = A.state; s.teams.sbA.share = 'seasonabc'; for (const m of Object.values(s.matches)) m.share = 'game_' + m.id;
    const t = s.teams.sbA;
    docs[tag + '-season'] = A.publicDoc(t);
    docs[tag + '-game-sbg5'] = A.fixtureDoc(t, s.matches.sbg5);
    docs[tag + '-game-sbg3'] = A.fixtureDoc(t, s.matches.sbg3);
  }
  fs.writeFileSync('pubdocs.json', JSON.stringify(docs));
  console.log('pubdocs:', Object.keys(docs).join(' '));
})().catch(e => { console.error(e); process.exit(1); });
