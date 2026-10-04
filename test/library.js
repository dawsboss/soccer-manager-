/* The club's drills and a coach's own: who sees which shelf, how a drill moves
   between them, and how each reaches the database and comes back.

   TRAINING.md is the design and TRAINING-NEXT.md the brief. What's pinned here
   is what would be easy to get quietly wrong:

   - Drills are the club's and the coach's secret sauce. A parent's or a
     tracker's phone never draws a shelf and never asks the database for one,
     so it never holds a copy to leak.
   - Mine is the person's, not the phone's. Cached per account, cleared when she
     signs out or someone else signs in; another account's library is never
     read, except by the app owner, once, and never kept.
   - Copied, never linked. Every copy says where it came from, a copy whose
     original moved on says so and never merges, and deleting from any shelf
     leaves every plan that used the drill readable.
   - Merge on read, never replace, the same as practice plans.
   - Anything any coach can write is drawn as text, and held to the library's
     own vocabularies so the filters find it. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');
const L = require('../drills.js');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };
const CODE = 'CLUB';
const WS = 'workspaces/' + CODE;
const CLUBD = 'training/' + CODE + '/drills';
const LIB = uid => 'userLibrary/' + uid + '/drills';

const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G11 Flight', birthYear: 2016, players: { p1: { id: 'p1', name: 'Ella', number: '7', guardians: { mum: true } } } },
    t2: { id: 't2', name: 'G13 Storm', birthYear: 2014, players: {} }
  },
  matches: {},
  access: {
    admins: { boss: true },
    index: { boss: true, jaz: true, trk: true, mum: true, kim: true },
    members: { boss: { name: 'Ada' }, jaz: { name: 'Jaz' }, kim: { name: 'Kim' } },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { kim: true } } },
    coachIndex: { jaz: 't1', kim: 't2' }
  }
});

const sheet = D => String(D.dom.node('#sheet').innerHTML || '');
const written = (fbk, p) => { const w = fbk.writtenTo(p); return w.length ? w[w.length - 1].value : undefined; };
const unesc = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/* The stub DOM keeps whatever a test last typed into a node and knows nothing
   of the markup, so after the editor opens its fields are filled in from the
   sheet the way a browser would fill them. */
function loadForm(D) {
  const html = sheet(D);
  for (const m of html.matchAll(/<input[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const v = /\bvalue="([^"]*)"/.exec(m[0]);
    D.dom.node('#' + m[1]).value = v ? unesc(v[1]) : '';
  }
  for (const m of html.matchAll(/<textarea id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) D.dom.node('#' + m[1]).value = unesc(m[2]);
  for (const m of html.matchAll(/<select id="([^"]+)">([\s\S]*?)<\/select>/g)) {
    const sel = /<option value="([^"]*)" selected>/.exec(m[2]) || /<option value="([^"]*)"/.exec(m[2]);
    D.dom.node('#' + m[1]).value = sel ? unesc(sel[1]) : '';
  }
}
const type = (D, v) => { for (const [k, x] of Object.entries(v)) D.dom.node('#' + k).value = x; };

async function device(uid, opts = {}) {
  const fbk = makeFakebase();
  const D = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': CODE, ...(opts.storage || {}) } });
  await D.flush();
  fbk.signIn(uid, { name: uid }); await D.flush();
  fbk.deliver(WS, opts.club || club()); await D.flush();
  if (opts.owner) { fbk.deliver('appOwners', { [uid]: true }); await D.flush(); }
  return { D, fbk };
}
const toDrills = (D, shelf = 'all') => {
  D.ui.view = 'practice'; D.ui.teamId = D.ui.teamId || 't1';
  D.ui.practice = { tab: 'drills', shelf }; D.render();
};
/* A drill the way a coach's editor writes one. */
function writeOne(D, extra = {}) {
  D.click({ act: 'drillnew' }); loadForm(D);
  type(D, { deName: 'Box rondo', deSummary: 'Four keep it from one', deSetup: 'A 10 yd square', deHow: 'Four on the outside\nOne in the middle', dePoints: 'Open your body', ...extra });
  D.click({ act: 'dedsave' });
  return D.shelfItems('mine').find(x => x.name === (extra.deName || 'Box rondo'));
}

(async () => {

  console.log('--- who gets the shelves ---');
  {
    for (const who of ['mum', 'trk']) {
      const { D, fbk } = await device(who);
      toDrills(D);
      check(who + ': no shelves drawn', /data-act="shelf"/.test(D.rendered()), false);
      check(who + ': never asks for the club\'s drills', fbk.readPaths().some(p => p.includes('/drills')), false);
      check(who + ': nor anybody\'s library', fbk.readPaths().some(p => p.startsWith('userLibrary')), false);
      D.click({ act: 'drillnew' });
      check(who + ': a tap that gets through is refused', D.lastToast(), 'Practice is for coaches and admins');
      D.click({ act: 'clubdrills' });
      check(who + ': including the way in from Admin', D.lastToast(), 'Practice is for coaches and admins');
      check(who + ': and nothing is written', fbk.record.writes.some(w => w.path.includes('/drills')), false);
    }
    const { D, fbk } = await device('jaz');
    check('every library action is behind the practice check', [...D.LIB_ACTS].every(x => D.PRACTICE_ACTS.has(x)), true);
    check('nothing is read before Drills opens', fbk.readPaths().some(p => p.includes('drills')), false);
    toDrills(D);
    check('a coach gets Built-in, Club and Mine', ['all', 'builtin', 'club', 'mine'].every(k => D.rendered().includes(`data-act="shelf" data-k="${k}"`)), true);
    check('reading the club\'s drills', fbk.watching(CLUBD), true);
    check('and her own library', fbk.watching(LIB('jaz')), true);
    check('and nobody else\'s', fbk.readPaths().filter(p => p.startsWith('userLibrary')).every(p => p === LIB('jaz')), true);
    D.render(); D.render();
    check('once, however often it redraws', fbk.countReads(CLUBD) + fbk.countReads(LIB('jaz')), 2);

    const a = await device('boss');
    toDrills(a.D);
    check('an admin reads the club\'s drills too', a.fbk.watching(CLUBD), true);
  }

  await H.flush(20);
  console.log('\n--- writing her own ---');
  {
    const { D, fbk } = await device('jaz');
    toDrills(D, 'mine');
    check('an empty Mine says what it is for', /Private to you/.test(D.rendered()), true);
    D.click({ act: 'drillnew' });
    check('the editor opens', /Write a drill/.test(sheet(D)), true);
    check('and says unlisted is not private', /Unlisted isn't private/.test(sheet(D)), true);
    loadForm(D);
    type(D, { deName: 'Box rondo' });
    D.click({ act: 'dedsave' });
    check('a drill with no summary is refused', D.lastToast(), 'Say what it is in one line');
    check('and nothing is saved', D.shelfItems('mine').length, 0);

    type(D, { deSummary: 'Four keep it from one', deSetup: 'A 10 yd square', deHow: 'Four on the outside\nOne in the middle', dePoints: 'Open your body' });
    D.click({ act: 'dedchip', k: 'skills', v: 'passing' });
    check('a chip keeps what was typed', D.drillDraft.d.name, 'Box rondo');
    D.click({ act: 'dedchip', k: 'skills', v: 'telepathy' });
    D.click({ act: 'dedchip', k: 'colour', v: 'red' });
    deepEq('the editor only takes the library\'s own words', D.drillDraft.d.skills, ['passing']);
    D.click({ act: 'dedchip', k: 'positions', v: 'Mid' });
    check('the editor offers the shapes too', /Written for the shape/.test(sheet(D)), true);
    D.click({ act: 'dedchip', k: 'shapes', v: '2-5-1' });
    D.click({ act: 'dedchip', k: 'shapes', v: '9-9-9' });
    deepEq('…only the app\'s own', D.drillDraft.d.shapes, ['2-5-1']);
    loadForm(D);
    type(D, { dlUrl: 'javascript:alert(1)', dlTitle: 'x' });
    D.click({ act: 'dedlinkadd' });
    check('a link that is not https is refused', D.lastToast(), 'A link has to start with https://');
    type(D, { dlUrl: 'https://youtu.be/abc', dlTitle: 'The set-up' });
    D.click({ act: 'dedlinkadd' });
    check('an https link is taken', D.drillDraft.d.media.length, 1);
    loadForm(D);
    D.click({ act: 'dedsave' });
    const d = D.shelfItems('mine')[0];
    check('saved to Mine', d && d.name, 'Box rondo');
    deepEq('with its lines as lists', d.how, ['Four on the outside', 'One in the middle']);
    deepEq('and its shape, so the 2-5-1 chip finds it', d.shapes, ['2-5-1']);
    check('version 1', d.v, 1);
    await D.flush();
    const w = written(fbk, LIB('jaz') + '/' + d.id);
    check('written to her library, one drill at that depth', w && w.name, 'Box rondo');
    check('never the whole library', fbk.record.writes.some(x => x.path === LIB('jaz')), false);
    check('acknowledged, nothing pending', D.mine.dirty[d.id], undefined);
    check('kept on the phone under her account', /Box rondo/.test(D.storage.getItem('sm.mine.v1:jaz') || ''), true);
    check('and not in the club\'s cache', /Box rondo/.test(D.storage.getItem('sm.train.v1:' + CODE) || ''), false);

    toDrills(D, 'all'); D.ui.practice.f = { q: 'box rondo' }; D.render();
    check('it is in the list with the built-in ones', /Box rondo/.test(D.rendered()) && /Mine<\/span>/.test(D.rendered()), true);
    D.ui.practice.f = { q: '', skill: 'passing' }; D.ui.practice.shelf = 'mine'; D.render();
    check('and the filters find it', /Box rondo/.test(D.rendered()), true);
    D.ui.practice.f = { skill: 'shooting' }; D.render();
    check('and leave it out when it does not match', /Box rondo/.test(D.rendered()), false);
    D.ui.practice.f = {}; D.render();

    D.click({ act: 'drill', id: 'mine:' + d.id });
    check('its card has the link, opening outside the app', /href="https:\/\/youtu.be\/abc" target="_blank" rel="noopener noreferrer"/.test(sheet(D)), true);
    check('and says a link needs a signal', /needs a signal/.test(sheet(D)), true);
    check('offers to edit, share and delete', ['drilledit', 'drillshare', 'drilldel'].every(x => sheet(D).includes(`data-act="${x}"`)), true);
    D.click({ act: 'drilledit', id: 'mine:' + d.id }); loadForm(D);
    type(D, { deName: 'Box rondo 5v2' });
    D.click({ act: 'dedsave' });
    check('editing her own bumps its version', D.findDrill('mine:' + d.id).v, 2);
    check('under the same id', D.findDrill('mine:' + d.id).name, 'Box rondo 5v2');
    check('heading is refused below U11', (() => { D.click({ act: 'drillnew' }); loadForm(D); type(D, { deName: 'Headers', deSummary: 's', deSetup: 's', deHow: 'h', dePoints: 'p', deAge0: '8' }); D.click({ act: 'dedchip', k: 'skills', v: 'heading' }); D.click({ act: 'dedsave' }); return D.lastToast(); })(), 'Heading drills start at U11: US Soccer rules out heading for under-elevens');
  }

  await H.flush(20);
  console.log('\n--- copied, never linked ---');
  {
    const { D, fbk } = await device('jaz');
    toDrills(D);
    const b = L.DRILLS.find(x => x.id === 'rondo-4v1') || L.DRILLS[10];
    D.click({ act: 'drill', id: b.id });
    check('a built-in card offers Save to mine', /data-act="drillmine"/.test(sheet(D)), true);
    D.click({ act: 'drillmine', id: b.id });
    const c = D.shelfItems('mine')[0];
    deepEq('save to mine records where it came from', c.from, { shelf: 'builtin', id: b.id, v: b.v });
    check('keeps its name', c.name, b.name);
    check('and its drawing, by name, from the library', c.pic === b.id && c.diagram === b.diagram, true);
    check('the card says whose version it is', new RegExp('Your version of').test(sheet(D)), true);
    check('nothing changed in the library itself', L.DRILLS.find(x => x.id === b.id).name, b.name);

    /* Edit a built-in drill: that is saving her own copy. */
    D.click({ act: 'drilledit', id: b.id });
    check('editing a built-in drill copies it first', D.shelfItems('mine').length, 2);
    check('and says the original is untouched', /original is untouched/.test(D.toasts.join(' ')), true);

    /* The original moves on. */
    const v0 = b.v; b.v = v0 + 1;
    D.click({ act: 'drill', id: 'mine:' + c.id });
    check('a copy whose original moved on says so', /The original has changed/.test(sheet(D)), true);
    check('and has not merged by itself', D.findDrill('mine:' + c.id).name, c.name);
    D.click({ act: 'drillorig', id: 'mine:' + c.id });
    check('with a way to see the original', /data-act="drillmine" data-id="/.test(sheet(D)) && sheet(D).includes(b.name), true);
    b.v = v0;

    /* Share with the club: a copy, hers stays hers. */
    D.click({ act: 'drillshare', id: 'mine:' + c.id });
    const cl = D.shelfItems('club')[0];
    check('share with the club makes a club copy', !!cl, true);
    check('under a new id', cl.id !== c.id, true);
    check('stamped with who shared it', cl.by + ' ' + cl.byName, 'jaz jaz');
    check('for a team she coaches', cl.team, 't1');
    deepEq('and where it came from', cl.from, { shelf: 'mine', id: c.id, v: c.v });
    check('hers is still in Mine', !!D.findDrill('mine:' + c.id), true);
    await D.flush();
    const w = written(fbk, CLUBD + '/' + cl.id);
    check('written to the club, one drill at that depth', w && w.id, cl.id);
    check('carrying what the rule checks', !!(w && w.by === 'jaz' && w.team === 't1' && typeof w.at === 'number'), true);
    check('never the whole shelf', fbk.record.writes.some(x => x.path === CLUBD), false);

    D.click({ act: 'drilledit', id: 'mine:' + c.id }); loadForm(D); type(D, { deName: 'Rondo, my way' }); D.click({ act: 'dedsave' });
    check('editing hers leaves the club\'s copy alone', D.findDrill('club:' + cl.id).name, b.name);
  }

  await H.flush(20);
  console.log('\n--- the club\'s shelf, and who tidies it ---');
  {
    const shelf = {
      d1: { id: 'd1', name: 'Jaz\'s rondo', type: 'opposed', ages: [8, 12], by: 'jaz', byName: 'Jaz', team: 't1', at: 1, v: 1, summary: 's', setup: 's', how: ['h'], points: ['p'] },
      d2: { id: 'd2', name: 'Kim\'s rondo', type: 'opposed', ages: [8, 12], by: 'kim', byName: 'Kim', team: 't2', at: 1, v: 1, summary: 's', setup: 's', how: ['h'], points: ['p'] },
      d3: { id: 'd3', name: 'Old team drill', type: 'game', by: 'jaz', byName: 'Jaz', team: 't2', at: 1, v: 1, summary: 's', setup: 's', how: ['h'], points: ['p'] }
    };
    const { D, fbk } = await device('jaz');
    toDrills(D, 'club');
    fbk.deliver(CLUBD, shelf); await D.flush(); D.render();
    check('the club\'s drills arrive', D.shelfItems('club').length, 3);
    check('and are drawn with who shared them', /shared by Kim/.test(D.rendered()), true);
    check('a coach may tidy what she shared', D.canCurate(D.findDrill('club:d1')), true);
    check('not another coach\'s', D.canCurate(D.findDrill('club:d2')), false);
    check('not her own once she stops coaching its team', D.canCurate(D.findDrill('club:d3')), false);
    D.click({ act: 'drill', id: 'club:d2' });
    check('another coach\'s card offers her own copy, not removal', /Edit your own copy/.test(sheet(D)) && !/data-act="drilldel"/.test(sheet(D)), true);
    D.click({ act: 'drilldel', id: 'club:d2' });
    check('and a tap that gets through is refused', D.lastToast(), 'Only an admin, or the coach who shared it, can remove it');
    check('with nothing removed', !!D.findDrill('club:d2'), true);
    D.click({ act: 'drilledit', id: 'club:d2' });
    check('editing another coach\'s drill saves her own copy', D.drillDraft.shelf, 'mine');
    deepEq('recorded as from the club', D.findDrill('mine:' + D.drillDraft.id).from, { shelf: 'club', id: 'd2', v: 1 });

    D.click({ act: 'drilledit', id: 'club:d1' }); loadForm(D);
    check('her own club drill edits in place', D.drillDraft.shelf + ' ' + D.drillDraft.id, 'club d1');
    type(D, { deName: 'Jaz\'s rondo, tidied' }); D.click({ act: 'dedsave' });
    const e = D.findDrill('club:d1');
    check('bumping its version', e.v, 2);
    check('still hers, still for her team', e.by + ' ' + e.team, 'jaz t1');

    const a = await device('boss');
    toDrills(a.D, 'club');
    a.fbk.deliver(CLUBD, shelf); await a.D.flush();
    check('an admin may tidy anyone\'s', a.D.canCurate(a.D.findDrill('club:d2')), true);
    a.D.click({ act: 'drilldel', id: 'club:d2' });
    check('and remove it', a.D.findDrill('club:d2'), null);
    await a.D.flush();
    check('one drill deleted at that depth', a.fbk.record.writes.some(w => w.path === CLUBD + '/d2' && w.value === null), true);
    a.D.ui.view = 'admin'; a.D.render();
    check('Admin has a way into the club\'s drills', /data-act="clubdrills"/.test(a.D.rendered()), true);
  }

  await H.flush(20);
  console.log('\n--- in a plan, a copy that outlives the shelf ---');
  {
    const { D } = await device('jaz');
    toDrills(D);
    const d = writeOne(D);
    D.ui.view = 'practice'; D.ui.practice = { tab: 'plans' };
    D.click({ act: 'pracnew', tid: 't1' });
    type(D, { evTitle: '', evDate: '2026-09-15', evStart: '17:30', evEnd: '18:30', evVenue: 'Lakeside', evNotes: '' });
    D.click({ act: 'calsave', tid: 't1' });
    const pid = D.ui.practice.open;
    D.click({ act: 'pracpick', id: pid });
    let asked = null;
    global.confirm = m => { asked = m; return true; };
    D.click({ act: 'pracadd', id: pid, v: 'mine:' + d.id });
    check('the first of hers says it shares it with the team\'s coaches', /shares it with this team's coaches/.test(asked || ''), true);
    asked = null;
    D.click({ act: 'pracadd', id: pid, v: 'mine:' + d.id });
    check('and only the first time', asked, null);
    const blk = D.practiceById('t1', pid).blocks[0];
    check('the plan holds a copy of the card', blk.drill.shelf + ' ' + (blk.drill.card && blk.drill.card.name), 'mine Box rondo');
    check('without who wrote it', blk.drill.card.by === undefined && blk.drill.card.from === undefined, true);

    D.click({ act: 'drill', id: 'mine:' + d.id }); D.click({ act: 'drilldel', id: 'mine:' + d.id });
    check('deleting it from Mine', D.findDrill('mine:' + d.id), null);
    const pr = D.practiceById('t1', pid);
    check('leaves the plan whole', pr.blocks.length, 2);
    check('still reading the drill', D.blockDrill(L, pr.blocks[0]) && D.blockDrill(L, pr.blocks[0]).name, 'Box rondo');
    D.ui.practice = { tab: 'plans', open: pid }; D.render();
    check('the plan does not say it is gone', /no longer in the library/.test(D.rendered()), false);
    check('and opens the plan\'s own copy', D.rendered().includes(`data-id="plan:${pid}:0"`), true);
    D.click({ act: 'drill', id: `plan:${pid}:0` });
    check('which draws', /Box rondo/.test(sheet(D)) && /The copy this plan keeps/.test(sheet(D)), true);
    let threw = null;
    try { D.click({ act: 'pracrun', id: pid }); D.render(); } catch (e) { threw = e.message; }
    check('and runs', threw, null);
    check('in run mode', /Box rondo/.test(D.rendered()), true);
  }

  await H.flush(20);
  console.log('\n--- merge on read, never replace ---');
  {
    const { D, fbk } = await device('jaz');
    toDrills(D);
    fbk.deliver(LIB('jaz'), { r1: { id: 'r1', name: 'From another phone', at: 1, v: 1 } }); await D.flush();
    check('her library arrives', !!D.findDrill('mine:r1'), true);
    fbk.refuseWrites(p => p.startsWith('userLibrary'));
    const off = writeOne(D, { deName: 'Written offline' });
    await D.flush();
    check('a refused write stays on the phone', !!off, true);
    check('still pending', D.mine.dirty[off.id] !== undefined, true);
    D.ui.practice.shelf = 'mine'; D.render();
    check('and the screen says why', /Saved on this phone only/.test(D.rendered()), true);
    fbk.deliver(LIB('jaz'), { r1: { id: 'r1', name: 'From another phone', at: 1, v: 1 } }); await D.flush();
    check('the database\'s answer does not wipe it', !!D.findDrill('mine:' + off.id), true);
    fbk.deliver(LIB('jaz'), {}); await D.flush();
    check('one gone from the database, with nothing pending here, was deleted there', D.findDrill('mine:r1'), null);
    check('the pending one is still here', !!D.findDrill('mine:' + off.id), true);

    const saved = { ...D.storage._d };
    const fbk2 = makeFakebase();
    const D2 = H.loadApp({ firebase: fbk2, config: CONFIG, storage: saved });
    await D2.flush(); fbk2.signIn('jaz'); await D2.flush(); fbk2.deliver(WS, club()); await D2.flush();
    check('after a reload it is still here', !!D2.findDrill('mine:' + off.id), true);
    /* Sent on connect, not only when the Drills screen opens: a drill made
       offline reaches the club even if she never opens Drills again. */
    check('and connecting sends it, before Drills is even opened', !!written(fbk2, LIB('jaz') + '/' + off.id), true);
    check('then it is no longer pending', D2.mine.dirty[off.id], undefined);
    toDrills(D2);
    fbk2.deliver(LIB('jaz'), { [off.id]: written(fbk2, LIB('jaz') + '/' + off.id) }); await D2.flush();
    check('and the club\'s answer has it', !!D2.findDrill('mine:' + off.id), true);

    /* the club shelf, the same way */
    fbk2.refuseWrites(p => p.startsWith('training/'));
    D2.click({ act: 'drillshare', id: 'mine:' + off.id });
    const cl = D2.shelfItems('club')[0];
    await D2.flush();
    fbk2.deliver(CLUBD, {}); await D2.flush();
    check('a club drill not yet accepted survives the club\'s answer', !!D2.findDrill('club:' + cl.id), true);
  }

  await H.flush(20);
  console.log('\n--- hers, not the phone\'s ---');
  {
    const { D, fbk } = await device('jaz');
    toDrills(D);
    const d = writeOne(D);
    await D.flush();
    check('her library is cached under her account', !!D.storage.getItem('sm.mine.v1:jaz'), true);
    fbk.signOut(); await D.flush();
    check('signing out clears it from the phone', D.storage.getItem('sm.mine.v1:jaz'), null);
    check('and from memory', D.shelfItems('mine').length, 0);

    const two = await device('jaz');
    toDrills(two.D); writeOne(two.D); await two.D.flush();
    two.fbk.signIn('kim'); await two.D.flush();
    check('someone else signing in on the same phone clears hers', two.D.storage.getItem('sm.mine.v1:jaz'), null);
    check('and she sees none of it', two.D.shelfItems('mine').length, 0);
    toDrills(two.D);
    check('her library is never read for the next person', two.fbk.watching(LIB('kim')) && !two.fbk.readPaths().slice(-3).includes(LIB('jaz')), true);

    const three = await device('jaz');
    toDrills(three.D);
    three.fbk.refuseWrites(() => true);
    writeOne(three.D); await three.D.flush();
    let asked = null;
    global.confirm = m => { asked = m; return false; };
    three.D.click({ act: 'signout' });
    check('signing out with changes not sent asks first', /n't reached the database yet/.test(asked || ''), true);
    check('and saying no keeps them', !!three.D.storage.getItem('sm.mine.v1:jaz'), true);
    global.confirm = () => true;
    void d;
  }

  await H.flush(20);
  console.log('\n--- the app owner, for support ---');
  {
    const { D, fbk } = await device('own', { owner: true });
    D.ui.view = 'setup'; D.render();
    check('the owner has a support view', /data-act="peeklib"/.test(D.rendered()), true);
    D.click({ act: 'peeklib' });
    type(D, { peekUid: 'jaz-uid-123' });
    D.click({ act: 'peekgo' });
    check('reads that one library', fbk.watching(LIB('jaz-uid-123')), true);
    check('once', fbk.record.listeners.find(l => l.path === LIB('jaz-uid-123')).once, true);
    fbk.deliver(LIB('jaz-uid-123'), { x: { id: 'x', name: 'Secret sauce', at: 1 } }); await D.flush();
    check('and shows it', /Secret sauce/.test(sheet(D)), true);
    check('never keeping a copy', Object.keys(D.storage._d).some(k => /Secret sauce/.test(D.storage._d[k])), false);
    check('nor putting it in her own library', D.shelfItems('mine').length, 0);

    const c = await device('jaz');
    c.D.ui.view = 'setup'; c.D.render();
    check('nobody else has it', /data-act="peeklib"/.test(c.D.rendered()), false);
    c.D.click({ act: 'peekgo' }); c.D.click({ act: 'peeklib' });
    check('nor reaches it with a tap', c.fbk.readPaths().some(p => p.startsWith('userLibrary/') && p !== LIB('jaz')), false);
  }

  console.log('\n--- who made it, even after she has gone ---');
  {
    const shelf = {
      d1: { id: 'd1', name: 'Kim\'s rondo', type: 'opposed', by: 'kim', byName: 'Kim', team: 't2', at: 1, v: 1, summary: 's', setup: 's', how: ['h'], points: ['p'] },
      d2: { id: 'd2', name: 'Jaz\'s finisher', type: 'opposed', by: 'jaz', byName: 'Jaz', team: 't1', at: 1, v: 1, summary: 's', setup: 's', how: ['h'], points: ['p'] },
      d3: { id: 'd3', name: 'Lou\'s warm-up', type: 'warmup', by: 'lou', byName: 'Lou', team: 't1', at: 1, v: 1, summary: 's', setup: 's', how: ['h'], points: ['p'] }
    };
    const { D, fbk } = await device('jaz');
    toDrills(D);
    fbk.deliver(CLUBD, shelf); await D.flush();
    D.click({ act: 'drill', id: L.DRILLS[0].id });
    check('a built-in drill is credited to the app', /From the Minutes library/.test(sheet(D)), true);
    D.click({ act: 'drill', id: 'club:d1' });
    check('a club drill to the coach who shared it', /Shared with the club by Kim\./.test(sheet(D)), true);
    D.click({ act: 'drill', id: 'club:d3' });
    check('still, after she stops coaching here', /by Lou, who no longer coaches here/.test(sheet(D)), true);
    D.ui.practice.shelf = 'club'; D.render();
    check('and on the list', /shared by Lou/.test(D.rendered()), true);

    D.click({ act: 'drillfilters' });
    check('Filters has a Made by', /data-k="by"/.test(sheet(D)), true);
    check('offering the app', /value="app"[^>]*>Minutes \(built-in\)/.test(sheet(D)), true);
    check('you', /value="me"[^>]*>You/.test(sheet(D)), true);
    check('each coach who shared one, by name', /value="u:kim"[^>]*>Kim</.test(sheet(D)), true);
    check('saying who has left', /value="u:lou"[^>]*>Lou \(left\)/.test(sheet(D)), true);
    check('and not herself twice', /value="u:jaz"/.test(sheet(D)), false);
    const names = by => { D.ui.practice.shelf = 'all'; D.ui.practice.f = { by }; return D.practiceDrills(D.ui.practice.f).map(d => d.name); };
    deepEq('by a coach: hers only', names('u:lou'), ['Lou\'s warm-up']);
    check('by you: what she shared and her own', names('me').join(), 'Jaz\'s finisher');
    check('by the app: the built-in library only', names('app').length === L.DRILLS.filter(d => d.ages[0] <= 11 && 11 <= d.ages[1]).length && !names('app').includes('Kim\'s rondo'), true);
    check('anyone: all of them', names('').length > names('app').length, true);
    D.ui.practice.f = {};

    const a = await device('boss');
    toDrills(a.D, 'club');
    a.fbk.deliver(CLUBD, shelf); await a.D.flush();
    a.D.click({ act: 'drilledit', id: 'club:d3' }); loadForm(a.D);
    type(a.D, { deName: 'Lou\'s warm-up, tidied' }); a.D.click({ act: 'dedsave' });
    const t = a.D.findDrill('club:d3');
    check('an admin tidying it leaves the author the author', t.by + ' ' + t.byName, 'lou Lou');
    check('and says who tidied it', /Last tidied by boss/.test(sheet(a.D)), true);
    await a.D.flush();
    const w = written(a.fbk, CLUBD + '/d3');
    check('as written', !!w && w.by === 'lou' && w.edBy === 'boss', true);
  }

  console.log('\n--- describe it, and an AI draws it ---');
  {
    const copied = [];
    const { D } = await device('jaz', { club: (() => { const c = club(); c.teams.t2.players = { q1: { id: 'q1', name: 'Rosa Diaz', number: '4' } }; return c; })() });
    // Node has a navigator of its own that a plain assignment can't replace
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { clipboard: { writeText: t => { copied.push(t); return Promise.resolve(); } } } });
    toDrills(D);
    D.click({ act: 'drillnew' }); loadForm(D);
    type(D, { deName: 'Box rondo', deSummary: 'Four keep it from one', deSetup: 'A 10 yd square', deHow: 'Four outside\nOne inside', dePoints: 'Open your body' });
    check('the editor offers an AI drawing', /data-act="dedai"/.test(sheet(D)), true);
    D.click({ act: 'dedai' });
    check('which says the app sends nothing itself', /doesn't send anything anywhere itself/.test(sheet(D)), true);
    type(D, { daIdea: 'Ella and Rosa pass round the square, Rosa goes in the middle when she loses it', daReply: '' });
    D.click({ act: 'dedaicopy' }); await D.flush();
    const p = copied[copied.length - 1] || '';
    check('the prompt is copied', p.length > 500, true);
    check('with the drill and the idea in it', /Box rondo/.test(p) && /pass round the square/.test(p), true);
    check('with the format and an example from the library', /"area": \[width, length\]/.test(p) && /"frames":/.test(p), true);
    check('asking for the JSON only', /Reply with the JSON object only/.test(p), true);
    check('with no child\'s name in it, from any team', /Ella|Rosa/.test(p), false);
    check('and the coach is told', /names? taken out/.test(D.lastToast()), true);
    check('what is copied is what she is shown', sheet(D).includes('the middle when she loses it') && !/Rosa/.test(String(D.dom.node('#sheet').innerHTML).split('id="daPrompt"')[1].split('</textarea>')[0]), true);

    type(D, { daReply: 'Sure! Here is a lovely drill for you.' });
    D.click({ act: 'dedaiuse' });
    check('an answer with no drawing in it is refused', /isn't a drawing/.test(D.drillDraft.ai.problems.join()) && /planwarn/.test(sheet(D)), true);
    check('and nothing is drawn', D.drillDraft.d.diagram, undefined);

    const bad = { area: [10, 10], players: { A1: [0, 0], A2: [10, 0], D1: [5, 5] }, ball: 'A1', frames: [['A2>A1', '# Round the square'], ['A1 passes to D1']] };
    type(D, { daReply: JSON.stringify(bad) });
    D.click({ act: 'dedaiuse' });
    check('a drawing that does not hold together says why', /A2 passes without a ball/.test(sheet(D)), true);
    check('including moves it could not read', D.drillDraft.ai.problems.some(x => /1 move isn't written in the format/.test(x)), true);
    D.click({ act: 'dedaifix' }); await D.flush();
    check('and the problems copy back to the AI', /A2 passes without a ball/.test(copied[copied.length - 1]) && /corrected JSON object only/.test(copied[copied.length - 1]), true);
    check('still nothing drawn', D.drillDraft.d.diagram, undefined);

    const good = "Here you go:\n```js\n{ area: [10, 10], mark: 'grid', cones: [[0,0],[10,0],[0,10],[10,10]], players: { A1: [0, 5], A2: [5, 0], A3: [10, 5], A4: [5, 10], D1: [5, 5] }, ball: 'A1',\n frames: [['A1>A2', '# Pass round the <b>square</b>'], ['A2>A3', 'D1-7,3', '# Defender chases'],] }\n```\nEnjoy!";
    type(D, { daReply: good });
    D.click({ act: 'dedaiuse' });
    const dg = D.drillDraft.d.diagram;
    check('a good answer, even written as JavaScript in a code fence, is drawn', !!dg && Object.keys(dg.players).length, 5);
    check('back in the editor, with the drawing shown', /Edit the drill|Write a drill/.test(sheet(D)) && /<svg/.test(sheet(D)), true);
    check('its text escaped', /<b>square/.test(sheet(D)), false);
    check('and a way to remove it', /data-k="clear"/.test(sheet(D)), true);
    loadForm(D);
    D.click({ act: 'dedsave' });
    const saved = D.shelfItems('mine').find(x => x.name === 'Box rondo');
    check('saved with the drawing', !!(saved && saved.diagram && saved.diagram.frames.length === 2), true);
    check('its card draws it, moving', /<svg/.test(sheet(D)) && /animateTransform/.test(sheet(D)), true);
    toDrills(D, 'mine'); D.ui.practice.f = {}; D.render();
    check('and so does its row', /drillthumb" aria-hidden="true"><svg/.test(D.rendered()), true);
    D.click({ act: 'drillshare', id: 'mine:' + saved.id });
    check('sharing it takes the drawing to the club', !!D.shelfItems('club')[0].diagram, true);
  }

  await H.flush(20);
  console.log('\n--- drawn by hand, on a pitch ---');
  {
    const { D } = await device('jaz');
    toDrills(D);
    D.click({ act: 'drillnew' }); loadForm(D);
    check('the editor starts with what every drill needs', /1 · What it is/.test(sheet(D)) && /needed/.test(sheet(D)), true);
    check('and folds the filters away', /data-act="dedmore" aria-expanded="false"/.test(sheet(D)) && /<div hidden>/.test(sheet(D)), true);
    D.click({ act: 'dedmore' });
    check('until she asks for them', /aria-expanded="true"/.test(sheet(D)) && !/<div hidden>/.test(sheet(D)), true);
    type(D, { deName: 'Pass and move', deSummary: 'Pass, then run', deSetup: 'A 20 yd square', deHow: 'Pass\nMove', dePoints: 'Move after the pass' });
    check('it offers a pitch to draw on', /data-act="dbopen"[^>]*>Draw it on a pitch/.test(sheet(D)), true);
    D.click({ act: 'dbopen' });
    check('which opens on the set-up', /Draw it/.test(sheet(D)) && /data-act="dbstep" data-k="0" aria-pressed="true"/.test(sheet(D)), true);
    check('the board takes taps', /data-act="dbtap"/.test(sheet(D)), true);
    const tap = (x, y) => D.click({ act: 'dbtap', x, y });
    const b = () => D.drillDraft.board;
    tap(2, 10); tap(10, 2);
    D.click({ act: 'dbtool', k: 'D' }); tap(10, 10);
    deepEq('a tap puts a player where it lands', b().dg.players, { A1: [2, 10], A2: [10, 2], D1: [10, 10] });
    D.click({ act: 'dbtool', k: 'mini' }); tap(19, 10);
    deepEq('a goal goes on the nearest edge, facing in', b().dg.goals, [[20, 10, 'mini', 'w']]);
    D.click({ act: 'dbtool', k: 'ball' }); tap(2, 10);
    check('the ball tool gives a player a ball', JSON.stringify(b().dg.ball), '["A1"]');
    D.click({ act: 'dbtool', k: 'A' }); tap(2.3, 10);
    check('two players never stand on one spot', Object.keys(b().dg.players).length, 3);

    D.click({ act: 'dbaddstep' });
    check('a step is added and opened', b().step, 1);
    tap(10, 2); tap(15, 5);
    deepEq('a player without the ball runs', b().dg.frames[0], ['A2-15,5']);
    tap(2, 10); tap(10, 2);
    deepEq('one with it passes to whoever she taps, where they end up', b().dg.frames[0], ['A2-15,5', 'A1>A2']);
    tap(10, 10); D.click({ act: 'dbverb', k: 'run' }); tap(15, 5);
    deepEq('a tap on the end of a run means the runner, and the chips pick the move', b().dg.frames[0], ['A2-15,5', 'A1>A2', 'D1-A2']);
    tap(2, 10); tap(4, 4);
    deepEq('a pass, then a run: pass and follow', b().dg.frames[0], ['A2-15,5', 'A1>A2', 'D1-A2', 'A1-4,4']);
    tap(2, 10); tap(6, 8);
    check('a second run in one step is refused', b().dg.frames[0].length, 4);
    check('in words', D.lastToast(), 'They already move in this step. Add a step for their next move');
    D.click({ act: 'dbverb', k: 'none' });
    tap(15, 5);
    check('one passed the ball in this step is told what she can do with it', /passed it in this step: tap a teammate for a first-time pass/.test(sheet(D)), true);
    tap(17, 9);
    check('carrying it is the next step', D.lastToast(), 'A2 gets the ball in this step. Add a step for what they do with it');
    D.click({ act: 'dbverb', k: 'none' });
    tap(10, 10); D.click({ act: 'dbverb', k: 'pass' }); tap(2, 10);
    check('so is a pass from someone without the ball', D.lastToast(), 'D1 hasn\'t got the ball then. Give them one in the set-up, or pass it to them first');
    D.click({ act: 'dbverb', k: 'none' });
    type(D, { dbCap: 'Pass and follow' });
    D.click({ act: 'dbaddstep' });
    check('the caption is kept', b().dg.frames[0].includes('# Pass and follow'), true);
    type(D, { dbCap: '' });
    tap(15, 5); D.click({ act: 'dbverb', k: 'shoot' });
    deepEq('a shot needs one tap', b().dg.frames[1], ['A2>G']);
    D.click({ act: 'dbundo' });
    deepEq('and undo takes it back', b().dg.frames[1], []);
    tap(15, 5); tap(18, 8);
    deepEq('with the ball, a tap on the grass is a dribble', b().dg.frames[1], ['A2~18,8']);
    check('it plays as it is drawn', /How it plays/.test(sheet(D)) && /animateTransform/.test(sheet(D)), true);

    D.click({ act: 'dbstep', k: 0 }); D.click({ act: 'dbtool', k: 'del' }); tap(10, 2);
    check('a player who moves later is taken off with their moves', !b().dg.players.A2 && b().dg.frames.flat().every(m => !/A2/.test(m)), true);
    D.click({ act: 'dbback' });
    check('going back leaves the drill undrawn', D.drillDraft.d.diagram, undefined);

    D.click({ act: 'dbopen' });
    check('starting again from an empty pitch', Object.keys(b().dg.players).length, 0);
    tap(2, 10); tap(10, 2); D.click({ act: 'dbtool', k: 'ball' }); tap(2, 10);
    D.click({ act: 'dbaddstep' }); tap(2, 10); tap(10, 2);
    D.click({ act: 'dbuse' });
    const dg = D.drillDraft.d.diagram;
    check('used, the drawing is in the draft', !!dg && dg.frames.length, 1);
    check('and holds to the same checks as any drawing', JSON.stringify(D.cleanDrawing(dg)), JSON.stringify(dg));
    check('back in the editor, offering to change it', /Change the drawing/.test(sheet(D)), true);
    loadForm(D); D.click({ act: 'dedsave' });
    const saved = D.shelfItems('mine').find(x => x.name === 'Pass and move');
    check('saved with it', !!(saved && saved.diagram && saved.diagram.frames.length === 1), true);
    D.click({ act: 'drilledit', id: 'mine:' + saved.id });
    D.click({ act: 'dbopen' });
    check('and it opens on the board again to change', Object.keys(D.drillDraft.board.dg.players).length, Object.keys(saved.diagram.players).length);
  }

  await H.flush(20);
  console.log('\n--- one drill, sent to another coach ---');
  {
    const shelf = {
      d1: { id: 'd1', name: 'Jaz\'s secret rondo', type: 'opposed', ages: [8, 12], by: 'jaz', byName: 'Jaz', team: 't1', at: 1, v: 1, summary: 's', setup: 's', how: ['h'], points: ['p'] }
    };
    const open = (D, key, code = CODE) => {
      global.location.hash = '#/drill/' + (/^club:/.test(key) ? D.clubTag(code) + '/' : '') + encodeURIComponent(key);
      return D.hashToUi();
    };
    const bi = L.DRILLS.find(x => x.goesWith.length && x.diagram);

    // the coach who has it sends it
    const a = await device('jaz');
    toDrills(a.D, 'club');
    a.fbk.deliver(CLUBD, shelf); await a.D.flush();
    a.D.click({ act: 'drill', id: 'club:d1' });
    check('a club drill offers Send to a coach', /data-act="drillsend"/.test(sheet(a.D)), true);
    a.D.click({ act: 'drillsend', id: 'club:d1' });
    check('the link names the club and the drill', sheet(a.D).includes('https://x.test/#/drill/' + a.D.clubTag(CODE) + '/club%3Ad1'), true);
    check('and says who it opens for', /only for the club's coaches and admins/.test(sheet(a.D)), true);
    check('the club\'s code itself is not in it', /#\/drill\/[^"<]*CLUB\b/.test(sheet(a.D)), false);
    check('a different club has a different tag', a.D.clubTag('OTHER') !== a.D.clubTag(CODE), true);
    a.D.click({ act: 'drill', id: bi.id }); a.D.click({ act: 'drillsend', id: bi.id });
    check('a built-in drill\'s link opens for anyone', /opens for anyone/.test(sheet(a.D)) && sheet(a.D).includes('#/drill/' + bi.id), true);
    const mine = writeOne(a.D);
    a.D.click({ act: 'drillsend', id: 'mine:' + mine.id });
    check('her own drill is never sent: it is private', /yours, and private/.test(sheet(a.D)) && !/#\/drill\//.test(sheet(a.D)), true);
    check('she is offered sharing it with the club instead', /data-act="drillshare"/.test(sheet(a.D)), true);

    // another team's coach opens it
    const k = await device('kim');
    check('a link is taken', open(k.D, 'club:d1'), true);
    check('and the address goes back to the screen, so Back does not reopen it', /#\/drill/.test(k.D.dom.replaced || ''), false);
    check('the club\'s drills are asked for', k.fbk.watching(CLUBD), true);
    check('nothing is said before they arrive', /secret rondo|isn't here/.test(sheet(k.D)), false);
    k.fbk.deliver(CLUBD, shelf); await k.D.flush(); k.D.timers.run();
    check('a coach of another team opens it once they do', /<h3>Jaz&#39;s secret rondo<\/h3>|<h3>Jaz's secret rondo<\/h3>/.test(sheet(k.D)), true);
    check('with what a coach can do with it', /data-act="drillmine"/.test(sheet(k.D)), true);
    open(k.D, 'club:gone'); k.D.timers.run();
    check('a drill removed since is said, not guessed', /That drill isn't here/.test(sheet(k.D)), true);
    open(k.D, 'mine:' + mine.id); k.D.timers.run();
    check('somebody else\'s own drill is private', /That drill is private/.test(sheet(k.D)), true);

    // a parent and a tracker it was forwarded to
    for (const who of ['mum', 'trk']) {
      const p = await device(who);
      open(p.D, 'club:d1'); p.D.timers.run();
      check(who + ': a club drill is refused with a reason', /for the club's coaches/.test(sheet(p.D)), true);
      check(who + ': naming her role', new RegExp(`signed in as a ${who === 'mum' ? 'parent' : 'tracker'}`).test(sheet(p.D)), true);
      check(who + ': and showing nothing of it', /secret rondo/.test(sheet(p.D)), false);
      check(who + ': her phone never asks for the club\'s drills', p.fbk.readPaths().some(x => x.includes('/drills')), false);
      p.D.click({ act: 'drillopen', id: 'club:d1' });
      check(who + ': nor by a tap that gets through', /for the club's coaches/.test(sheet(p.D)) && !/secret rondo/.test(sheet(p.D)), true);
      p.D.click({ act: 'drillsend', id: bi.id });
      check(who + ': and she cannot send drills on', p.D.lastToast(), 'Practice is for coaches and admins');

      open(p.D, bi.id); p.D.timers.run();
      const sh = sheet(p.D);
      check(who + ': a built-in drill opens for her', sh.includes('<h3>' + bi.name.replace(/'/g, '&#39;') + '</h3>') || sh.includes('<h3>' + bi.name + '</h3>'), true);
      check(who + ': to read, with nothing a coach does on it',
        ['drillmine', 'drilledit', 'drillsend', 'drillshare', 'pracadd', 'drill', 'drillpic'].some(x => sh.includes(`data-act="${x}"`)), false);
      p.D.click({ act: 'drillopen', id: bi.goesWith[0] });
      check(who + ': and the drills it goes with open the same way', sheet(p.D).includes(L.DRILLS.find(x => x.id === bi.goesWith[0]).name.replace(/'/g, '&#39;')), true);
    }

    // a link that can't be answered never waits for ever
    const s = await device('kim');
    open(s.D, 'club:d1');
    s.D.clock.advance(9000); s.D.render(); s.D.timers.run();
    check('with no answer from the club, it says so rather than hanging', /That drill isn't here/.test(sheet(s.D)), true);
  }

  console.log('\n--- a drill from another of her clubs opens that club ---');
  {
    const open = (D, key, code) => { global.location.hash = '#/drill/' + D.clubTag(code) + '/' + encodeURIComponent(key); return D.hashToUi(); };
    // kim coaches in a second club this phone has kept a copy of
    const { D } = await device('kim', { storage: { 'sm.data.v1:SECOND': JSON.stringify({ teams: {}, matches: {}, access: { org: { name: 'Second FC' } } }) } });
    D.dom.reloads = 0;
    open(D, 'club:x9', 'SECOND'); D.timers.run();
    check('the phone switches to the club the link names', D.storage.getItem('sm.workspace'), 'SECOND');
    check('and reloads into it', D.dom.reloads, 1);
    check('with the link kept on the address, to open there', D.dom.replaced, '/#/drill/' + D.clubTag('SECOND') + '/club%3Ax9');
    check('saying where it is going', D.lastToast(), 'Opening Second FC');

    const o = await device('kim');
    o.D.dom.reloads = 0;
    open(o.D, 'club:x9', 'NOTMINE'); o.D.timers.run();
    o.D.clock.advance(9000); o.D.render(); o.D.timers.run();
    check('a club she isn\'t in is never switched to', o.D.storage.getItem('sm.workspace') + ' ' + (o.D.dom.reloads || 0), CODE + ' 0');
    check('and is said, not guessed', /from another club/.test(sheet(o.D)), true);

    const p = await device('mum');
    open(p.D, 'club:x9', 'NOTMINE'); p.D.timers.run(); p.D.clock.advance(9000); p.D.render(); p.D.timers.run();
    check('a parent with a link from another club gets the same, and nothing of it', /from another club/.test(sheet(p.D)) && p.D.storage.getItem('sm.workspace') === CODE, true);
  }

  console.log('\n--- a hostile drill cannot break the next coach\'s screen ---');
  {
    const { D, fbk } = await device('kim');
    D.ui.teamId = 't2'; toDrills(D, 'club');
    const evil = '<img src=x onerror=alert(1)>';
    fbk.deliver(CLUBD, {
      h1: { id: 'h1', name: evil, summary: evil, type: '__proto__', ages: ['x', 99], minutes: { 1: 'lots' }, players: 'many', kit: { cones: '<b>', balls: 'each', rockets: 3 },
        skills: ['passing', evil, '__proto__'], positions: ['Mid', 'Sweeper'], shapes: ['2-5-1', '9-9-9', evil, 'constructor'], how: { 0: evil, 5: 'ok' }, points: evil, safety: { x: 1 },
        media: [{ url: 'javascript:alert(1)' }, { url: 'https://x.test/a.gif" onerror="alert(1)' }, { url: 'https://ok.test/a.gif', title: evil }],
        diagram: { area: [1, 1], players: { 'A1"><script>': [0, 0] } }, pic: '../../etc', by: 'kim', team: 't2', at: 1 },
      h2: 'not a drill', h3: { name: '' }
    });
    await D.flush();
    let threw = null;
    try { D.render(); D.click({ act: 'drill', id: 'club:h1' }); D.click({ act: 'drilledit', id: 'club:h1' }); } catch (e) { threw = e.message; }
    check('it draws without throwing', threw, null);
    const all = D.rendered() + sheet(D);
    check('and nothing in it reaches the page as markup', /<img src=x|<script|onerror="alert/.test(all), false);
    const h = D.findDrill('club:h1');
    check('only drills with a name are drills', D.shelfItems('club').length, 1);
    check('an unknown type is a technique drill', h.type, 'technical');
    deepEq('only skills the filters know', h.skills, ['passing']);
    deepEq('only the app\'s own positions', h.positions, ['Mid']);
    deepEq('only the app\'s own shapes', h.shapes, ['2-5-1']);
    deepEq('only kit the library knows', Object.keys(h.kit).sort(), ['balls']);
    check('only https links that are links', h.media.map(m => m.url).join(), 'https://ok.test/a.gif');
    check('a stored diagram that does not hold together is not drawn', h.diagram, null);
  }

  H.summary('the club\'s drills and a coach\'s own');
})();
