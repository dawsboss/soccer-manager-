/* The Practice tab: the drill library, the position guide, and who gets them.

   TRAINING.md settles the access before any of it was built: drills are a
   club's and a coach's own work, so parents and trackers never see the tab, and
   a tap that reaches the handler anyway is refused there too, the same way the
   retire-club button checks canAdmin() inside its own branch. The built-in
   drills ship in the app's public files and are no secret on their own; what
   this pins is that the screen they sit on, where club drills and plans will
   live, is already shut to the right people before any of that arrives.

   The rest is the library being usable at the sideline: the team's age group
   starts the list at the right drills, every filter narrows it, a drill card
   and a position draw a picture, and a link straight to the tab works. */

const H = require('./harness');
const { check, deepEq } = H;

/* Booted with a config for the same reason visibility.js is: without one
   gated() is false, nothing is shut, and every "a parent can't" passes without
   testing anything. */
const CFG = { apiKey: 'k', databaseURL: 'https://prod.example' };
const A = H.loadApp({ config: CFG });
const L = require('../drills.js');
const tab = () => A.dom.node('#tabs [data-view="practice"]');
const sheet = () => String(A.dom.node('#sheet').innerHTML || '');

const club = () => ({
  teams: {
    t1: { id: 't1', name: 'G14 Flight', birthYear: 2016, players: { a: { id: 'a', name: 'Ava', guardians: { mum: true } } } },
    t2: { id: 't2', name: 'G12 Storm', players: { b: { id: 'b', name: 'Bea' } } }
  },
  matches: {},
  access: {
    admins: { boss: true },
    teams: { t1: { coaches: { jaz: true }, trackers: { trk: true } }, t2: { coaches: { other: true } } },
    index: {}
  }
});

function as(uid, tid = 't1', state = club()) {
  A.state = state;
  A.me = uid ? { uid, name: uid } : null;
  A.ui.teamId = tid;
  A.ui.matchId = null;
  A.appOwners = {};
  A.ui.practice = { tab: 'drills' };   // the library; Plans is the default, and has its own suite
  A.toasts.length = 0;
}
const open = () => { A.ui.view = 'practice'; A.render(); return A.ui.view; };

console.log('--- who gets the Practice tab ---');
{
  as('jaz');
  check('a coach has the tab', tab().hidden, false);
  check('and opening it stays on it', open(), 'practice');
  check('the library is on the screen', /data-act="drill"/.test(A.rendered()), true);

  as('jaz', 't2');
  check('a coach on another team still has it', open(), 'practice');

  as('other', 't1');
  check('so does another team\'s coach, on this one', open(), 'practice');

  as('boss');
  check('an admin has the tab', tab().hidden, false);
  check('and it opens', open(), 'practice');

  as('own'); A.appOwners = { own: true };
  check('the app owner has it', open(), 'practice');

  as('trk');
  check('a tracker has NO tab', (A.render(), tab().hidden), true);
  check('and a link to it lands on the games list', open(), 'matches');
  check('with no drill on the screen', /data-act="drill"/.test(A.rendered()), false);

  as('mum');
  check('a parent has NO tab', (A.render(), tab().hidden), true);
  check('and a link to it lands elsewhere', open() === 'practice', false);
  check('with no drill on the screen', /data-act="drill"/.test(A.rendered()), false);

  as('stranger');
  check('signed in to nothing: no tab', (A.render(), tab().hidden), true);

  /* Before a club has an admin nothing is gated, the same as every other
     screen, so a coach trying the app out alone has the library at once. */
  const open1 = club(); delete open1.access.admins;
  as(null, 't1', open1);
  check('a club with no admin yet: the tab is there', (A.render(), tab().hidden), false);
  check('and it opens', open(), 'practice');
}

console.log('\n--- a tap that reaches the handler is refused there too ---');
{
  for (const who of ['mum', 'trk']) {
    as(who);
    A.dom.node('#sheet').innerHTML = '';
    A.click({ act: 'drill', id: L.DRILLS[0].id });
    check(who + ': no drill card opens', sheet().includes(L.DRILLS[0].name), false);
    check(who + ': and says why', A.lastToast(), 'Practice is for coaches and admins');
    A.click({ act: 'roleguide', id: L.ROLE_GUIDE[0].id });
    check(who + ': nor a position', sheet().includes(L.ROLE_GUIDE[0].oneLine), false);
    A.click({ act: 'drillfilters' });
    check(who + ': nor the filters', sheet().includes('Kit you don'), false);
  }
  const lib = ['dfchip', 'dfclear', 'dfpick', 'drill', 'drillfilters', 'drillmore', 'drillpic', 'practab', 'roleguide', 'rolepic'];
  check('every library action is covered by the check', lib.every(x => A.PRACTICE_ACTS.has(x)), true);
}

console.log('\n--- a drill card and a position draw a picture ---');
{
  as('jaz');
  const d = L.DRILLS.find(x => x.diagram.frames && x.diagram.frames.length);
  A.click({ act: 'drill', id: d.id });
  check('the card names the drill', sheet().includes('<h3>' + d.name.replace(/&/g, '&amp;')), true);
  check('with a diagram', /<svg[\s\S]*<\/svg>/.test(sheet()), true);
  check('that moves by default', /<animate/.test(sheet()), true);
  A.click({ act: 'drillpic', id: d.id, k: 'still' });
  check('Still stops it', /<animate/.test(sheet()), false);
  check('and the steps stay readable', /class="drillsteps"/.test(sheet()), true);
  A.click({ act: 'drill', id: 'no-such-drill' });
  check('an unknown drill opens nothing new', /<animate|Still/.test(sheet()), true);

  const r = L.ROLE_GUIDE.find(x => x.id === 'full-back');
  A.click({ act: 'roleguide', id: r.id });
  check('a position card names it', sheet().includes(r.name), true);
  check('and its drills are links to their cards', (sheet().match(/data-act="drill"/g) || []).length >= 5, true);

  A.ui.view = 'practice';
  A.click({ act: 'practab', k: 'positions' });
  check('the Positions tab lists every guide', (A.rendered().match(/data-act="roleguide"/g) || []).length, L.ROLE_GUIDE.length);
  A.state.teams.t1.formations = { f: { name: '4-4-2', slots: [{ id: 's1', label: 'LB' }, { id: 's2', label: 'RB' }] } };
  A.render();
  check('and names the spots from the team\'s own shapes', /In your shapes: <b>LB, RB<\/b>/.test(A.rendered()), true);
  A.click({ act: 'practab', k: 'drills' });
  check('Drills goes back', A.ui.practice.tab, 'drills');
}

console.log('\n--- the team\'s age starts the list ---');
{
  /* The harness clock reads 12 September 2026, so the season is 2026–27. */
  check('born 2016 is U11 in September 2026', A.uAge(2016), 11);
  check('and still U11 in March 2027', A.uAge(2016, Date.UTC(2027, 2, 1)), 11);
  check('and U11 on 31 July 2027', A.uAge(2016, Date.UTC(2027, 6, 31, 12)), 11);
  check('U12 from August 2027', A.uAge(2016, Date.UTC(2027, 7, 1, 12)), 12);
  check('U10 in July 2026', A.uAge(2016, Date.UTC(2026, 6, 15)), 10);
  check('a year that is not a year', A.uAge('soon'), null);
  check('a birth year in the future', A.uAge(2030), null);
  check('adults read as Adult, not U27', A.uLabel(A.uAge(2000)), 'Adult');

  as('jaz');
  const all = L.DRILLS.length;
  const t1 = A.practiceDrills();
  check('the team\'s U11 filters the list', t1.length < all, true);
  check('to drills that suit U11', t1.every(d => d.ages[0] <= 11 && 11 <= d.ages[1]), true);
  check('which still leaves plenty', t1.length >= 30, true);
  A.ui.teamId = 't2';
  check('a team with no birth year shows everything', A.practiceDrills().length, all);
  A.ui.view = 'practice'; A.render();
  check('a coach of another team is not told to set it', /Give the team a birth year/.test(A.rendered()), false);
  A.me = { uid: 'other', name: 'other' }; A.render();
  check('its own coach is told how', /Give the team a birth year/.test(A.rendered()), true);
  A.me = { uid: 'jaz', name: 'jaz' };
  A.ui.teamId = 't1';
  A.change({ pick: 'dfpick', k: 'age', in: undefined }, 'any');
  check('Any age shows everything', A.practiceDrills().length, all);
  A.change({ pick: 'dfpick', k: 'age' }, '6');
  check('U6 shows only drills a U6 can do', A.practiceDrills().every(d => d.ages[0] <= 6), true);
  check('and no heading drill reaches them', A.practiceDrills().some(d => d.skills.includes('heading')), false);
  A.change({ pick: 'dfpick', k: 'age' }, 'team');
  check('back to the team\'s own', A.practiceDrills().length, t1.length);
}

console.log('\n--- every filter narrows, and clearing undoes them ---');
{
  as('jaz');
  A.change({ pick: 'dfpick', k: 'age' }, 'any');
  const all = A.practiceDrills().length;
  const narrows = (label, fn, ok) => {
    fn();
    const got = A.practiceDrills();
    check(label, got.length > 0 && got.length < all && got.every(ok), true);
    A.click({ act: 'dfclear' });
  };
  narrows('a type', () => A.click({ act: 'dfchip', k: 'types', v: 'warmup' }), d => d.type === 'warmup');
  narrows('a position', () => A.click({ act: 'dfchip', k: 'pos', v: 'GK' }), d => d.positions.includes('GK'));
  narrows('what needs work', () => A.change({ pick: 'dfpick', k: 'sig' }, 'late-goals'), d => d.signals.includes('late-goals'));
  narrows('fits in 10 minutes', () => A.change({ pick: 'dfpick', k: 'len' }, '10'), d => d.minutes[0] <= 10);
  narrows('a minute to set up', () => A.change({ pick: 'dfpick', k: 'setup' }, '1'), d => d.setupMins <= 1);
  narrows('six players coming', () => A.change({ pick: 'dfpick', k: 'players' }, '6'), d => d.players.min <= 6);
  narrows('competitive', () => A.change({ pick: 'dfpick', k: 'comp' }, 'yes'), d => d.competitive);
  narrows('beginner level', () => A.click({ act: 'dfchip', k: 'levels', v: '1' }), d => d.level === 1);
  narrows('low intensity', () => A.click({ act: 'dfchip', k: 'intens', v: '1' }), d => d.intensity === 1);
  narrows('everyone busy', () => A.click({ act: 'dfchip', k: 'inv', v: '3' }), d => d.involvement === 3);
  narrows('in pairs', () => A.click({ act: 'dfchip', k: 'groups', v: 'pairs' }), d => d.groups.includes('pairs'));
  narrows('no keeper needed', () => A.click({ act: 'dfchip', k: 'flags', v: 'noKeeper' }), d => d.gk === 0);
  narrows('one adult', () => A.click({ act: 'dfchip', k: 'flags', v: 'oneAdult' }), d => d.adults === 1);
  narrows('indoors', () => A.click({ act: 'dfchip', k: 'flags', v: 'indoor' }), d => d.indoor);
  narrows('no big goals', () => A.click({ act: 'dfchip', k: 'noKit', v: 'goals' }), d => !d.kit.goals);
  narrows('a skill', () => A.change({ pick: 'dfpick', k: 'skill' }, 'first-touch'), d => d.skills.includes('first-touch'));
  narrows('a principle', () => A.change({ pick: 'dfpick', k: 'principle' }, 'compactness'), d => d.principles.includes('compactness'));
  narrows('a moment', () => A.change({ pick: 'dfpick', k: 'moment' }, 'toDefend'), d => d.moments.includes('toDefend'));
  narrows('physical', () => A.change({ pick: 'dfpick', k: 'physical' }, 'agility'), d => d.physical.includes('agility'));

  A.click({ act: 'dfchip', k: 'types', v: 'warmup' });
  A.click({ act: 'dfchip', k: 'types', v: 'warmup' });
  check('a second tap on a chip takes it off', A.ui.practice.f.types.length, 0);

  A.ui.practice.f.q = 'rondo';
  const rondos = A.practiceDrills();
  check('search finds by name and text', rondos.length > 0 && rondos.length < all, true);
  A.ui.practice.f.q = 'first touch rondo';
  check('every word has to match', A.practiceDrills().length <= rondos.length, true);
  A.ui.practice.f.q = 'zzqx';
  A.ui.view = 'practice'; A.render();
  check('nothing matching says so', /No drill matches all of that/.test(A.rendered()), true);
  A.click({ act: 'dfclear' });
  check('clear takes the search off too', A.ui.practice.f.q, '');
  check('but keeps the age the coach picked', A.ui.practice.f.age, 'any');

  A.click({ act: 'dfchip', k: 'types', v: 'game' });
  A.click({ act: 'dfchip', k: 'levels', v: '3' });
  check('the Filters button counts what is on', A.practiceActive(A.ui.practice.f), 2);
  A.click({ act: 'drillfilters' });
  check('the filters sheet shows how many drills are left', new RegExp('Show ' + A.practiceDrills().length + ' drill').test(sheet()), true);
  A.click({ act: 'dfchip', k: 'levels', v: '3', in: 'sheet' });
  check('a chip in the sheet redraws the sheet', /Kit you don/.test(sheet()) && /aria-pressed="false">Advanced/.test(sheet()), true);
}

console.log('\n--- drills for the team\'s own shape ---');
{
  /* A coach playing a 2-5-1 asked for drills for it, and for her wide players
     who don't get back. The shape is the name on the team's saved formation,
     so the chip comes from what the team already plays, not from a setting. */
  as('jaz');
  A.change({ pick: 'dfpick', k: 'age' }, 'any');
  const all = A.practiceDrills().length;
  A.change({ pick: 'dfpick', k: 'shape' }, '2-5-1');
  const got = A.practiceDrills();
  check('the shape filter narrows the list', got.length > 2 && got.length < all, true);
  check('…to drills written for that shape', got.every(d => (d.shapes || []).includes('2-5-1')), true);
  check('and counts as a filter', A.practiceActive(A.ui.practice.f), 1);
  A.click({ act: 'drillfilters' });
  check('the filters sheet offers every shape', /Written for the shape/.test(sheet()) && /3-3-2 \(9v9\)/.test(sheet()), true);
  A.click({ act: 'dfclear' });
  check('clear takes it off', A.ui.practice.f.shape, '');

  A.ui.view = 'practice'; A.render();
  check('a team with no saved shape gets no chip', /data-k="shape"/.test(A.rendered()), false);
  A.state.teams.t1.formations = {
    f: { id: 'f', name: '2-5-1', size: 9, slots: [] },
    g: { id: 'g', name: 'Our diamond', size: 7, slots: [] },
    h: { id: 'h', name: '3-3-2', size: 9, slots: [] }
  };
  A.state.teams.t1.defaults = { 9: 'f' };
  A.render();
  check('a saved 2-5-1 gets a chip', /data-k="shape" data-v="2-5-1" aria-pressed="false">2-5-1 drills/.test(A.rendered()), true);
  check('so does every other preset it saved', /3-3-2 drills/.test(A.rendered()), true);
  check('but a shape she named herself matches no drill, so no chip', /Our diamond drills/.test(A.rendered()), false);
  check('the team\'s default comes first', A.rendered().indexOf('2-5-1 drills') < A.rendered().indexOf('3-3-2 drills'), true);
  A.click({ act: 'dfpick', k: 'shape', v: '2-5-1' });
  check('the chip turns the filter on', A.ui.practice.f.shape, '2-5-1');
  check('and is drawn pressed, ready to turn it off', /data-k="shape" data-v="" aria-pressed="true">2-5-1 drills/.test(A.rendered()), true);
  A.click({ act: 'dfpick', k: 'shape', v: '' });
  check('a second tap turns it off', A.ui.practice.f.shape, '');

  A.click({ act: 'drill', id: 'shape-2-5-1' });
  check('the card says which shape it is for', /Shape <b>2-5-1<\/b>/.test(sheet()), true);
  A.click({ act: 'drill', id: 'rondo-4v1' });
  check('and a drill for any shape says nothing about one', /Shape <b>/.test(sheet()), false);
  delete A.state.teams.t1.formations; delete A.state.teams.t1.defaults;
}

console.log('\n--- a long list pages, and its state survives a reload ---');
{
  as('jaz');
  A.change({ pick: 'dfpick', k: 'age' }, 'any');
  A.ui.view = 'practice'; A.render();
  check('24 drills drawn at first', (A.rendered().match(/class="drillrow"/g) || []).length, 24);
  A.click({ act: 'drillmore' });
  check('Show more adds 24', A.ui.practice.show, 48);
  A.click({ act: 'dfchip', k: 'types', v: 'game' });
  check('a new filter starts from the top again', A.ui.practice.show, 24);

  /* Saved with the rest of the screen, and read back through practiceUi(),
     which rebuilds from the blank so a filter an older build saved can't break
     the list. */
  A.ui.practice = { tab: 'nonsense', show: -3, f: { types: 'game', q: 7, stale: 1 } };
  const p = A.practiceUi();
  check('a broken saved tab reads as Plans', p.tab, 'plans');
  check('a broken page size reads as 24', p.show, 24);
  deepEq('a list saved as a string reads as empty', p.f.types, []);
  check('a non-string search reads as empty', p.f.q, '');
  check('and the list still draws', A.practiceDrills().length > 0, true);
}

console.log('\n--- a sheet opens at its top, and keeps its place while open ---');
{
  /* The drill card used to open wherever the last sheet had been scrolled
     to, which on a long card is halfway down the coaching points. */
  as('jaz');
  const el = A.dom.node('#sheet');
  el.hidden = true; el.scrollTop = 900;
  A.click({ act: 'drillfilters' });
  check('the filters open at the top', el.scrollTop, 0);
  el.scrollTop = 600;
  A.click({ act: 'dfchip', k: 'levels', v: '2', in: 'sheet' });
  check('a chip keeps her place in them', el.scrollTop, 600);
  el.hidden = true;
  const d = L.DRILLS.find(x => x.goesWith.length && x.diagram.frames && x.diagram.frames.length);
  A.click({ act: 'drill', id: d.id });
  check('a drill card opens at the top', el.scrollTop, 0);
  el.scrollTop = 120;
  A.click({ act: 'drillpic', id: d.id, k: 'still' });
  check('Moving / Still keeps her place', el.scrollTop, 120);
  el.scrollTop = 2000;
  A.click({ act: 'drill', id: d.goesWith[0] });
  check('a drill it goes with opens at its top', el.scrollTop, 0);
  el.scrollTop = 2000;
  A.click({ act: 'roleguide', id: L.ROLE_GUIDE[0].id });
  check('and so does a position', el.scrollTop, 0);
  A.click({ act: 'dfclear' });
}

console.log('\n--- links straight to the tab ---');
{
  as('jaz');
  A.ui.view = 'practice';
  check('the tab has its own address', A.uiToHash(), '#/team/t1/practice');
  A.ui.view = 'matches';
  global.location.hash = '#/team/t1/practice';
  check('and the address opens it', A.hashToUi() && A.ui.view, 'practice');
}

console.log('\n--- the team\'s birth year ---');
{
  as('jaz');
  A.dom.node('#tName').value = 'G14 Flight';
  A.dom.node('#tBirth').value = '2015';
  A.click({ act: 'saveteam', id: 't1' });
  check('saving the team sheet keeps the birth year', A.state.teams.t1.birthYear, 2015);
  check('which moves the age group', A.teamUAge(A.state.teams.t1), 12);
  A.dom.node('#tBirth').value = '';
  A.click({ act: 'saveteam', id: 't1' });
  check('clearing it takes it off', A.state.teams.t1.birthYear, undefined);
  A.state.teams.t1.birthYear = 2016;
  A.dom.node('#tBirth').value = '216';
  A.click({ act: 'saveteam', id: 't1' });
  check('a mistyped year is refused', A.lastToast(), 'That birth year doesn\'t look right');
  check('and the old one kept', A.state.teams.t1.birthYear, 2016);
  A.ui.view = 'teamset'; A.render();
  check('the team page shows the age group', /U11 this season · born 2016/.test(A.rendered()), true);

  as('mum');
  A.dom.node('#tName').value = 'Renamed';
  A.dom.node('#tBirth').value = '2010';
  A.click({ act: 'saveteam', id: 't1' });
  check('a parent cannot change it', A.state.teams.t1.birthYear, 2016);
}

console.log('\n--- when the library did not load ---');
{
  /* drills.js is a separate script. If it failed to arrive the tab still
     opens and says so, rather than throwing out of render() and taking the
     rest of the app down with it. */
  const B = H.loadApp({ config: CFG, drills: false });
  B.state = club(); B.me = { uid: 'jaz', name: 'jaz' }; B.ui.teamId = 't1';
  B.ui.view = 'practice';
  let threw = null;
  try { B.render(); } catch (e) { threw = e.message; }
  check('render does not throw', threw, null);
  check('and says the library did not load', /drill library didn't load/.test(B.rendered()), true);
  B.click({ act: 'drill', id: L.DRILLS[0].id });
  check('a stale link to a drill opens nothing', String(B.dom.node('#sheet').innerHTML || '').includes(L.DRILLS[0].name), false);
}

H.summary('practice');
