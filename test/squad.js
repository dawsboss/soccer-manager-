/* The squad, all at once: the grid, adding several players from a list, and
   copying or moving players to another team.

   The grid holds a draft, so the cases that matter most are about what it
   does NOT write: a redraw from a sync update must not lose what was typed,
   Save must write only the fields that changed (one field at a time, so an
   edit made on another phone to a field untouched here survives), and
   nothing reaches the database before Save. Copy and move must never delete a
   player, because this season's minutes hang off her id. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeFakebase } = require('./fakebase');

const CONFIG = { apiKey: 'k', databaseURL: 'https://prod.example', projectId: 'p' };

const CLUB = {
  access: {
    org: { name: 'Lakeside SC' },
    admins: { adm: true },
    index: { adm: true, coach: true, mum: true },
    members: { adm: { name: 'Ada' }, coach: { name: 'Jaz' } },
    teams: { t1: { coaches: { coach: true } }, t2: { coaches: { coach: true } }, t3: { coaches: { other: true } } },
    teamIndex: { t1: { coach: 'coach' }, t2: { coach: 'coach' }, t3: { other: 'coach' } }
  },
  teams: {
    t1: {
      id: 't1', name: 'Flight', players: {
        p1: { id: 'p1', name: 'Ella', number: '7', active: true, preferred: 'Mid', rating: 4, guardians: { mum: true }, pairs: { p2: true, p3: true } },
        p2: { id: 'p2', name: 'Maya', number: '9', active: true, gk: true, pairs: { p1: true } },
        p3: { id: 'p3', name: 'Rosa', number: '4', active: true, pairs: { p1: true } }
      }
    },
    t2: { id: 't2', name: 'Flight 2027', players: { x1: { id: 'x1', name: 'Maya', number: '9', active: true } } },
    t3: { id: 't3', name: 'Storm', players: {} }
  },
  matches: { g1: { id: 'g1', teamId: 't1', opponent: 'Riverside', stints: { s1: { pid: 'p1', on: 0, off: 600 } } } }
};

async function boot(who = 'coach') {
  const fbk = makeFakebase();
  const A = H.loadApp({ firebase: fbk, config: CONFIG, storage: { 'sm.workspace': 'CLUB' } });
  await A.flush();
  fbk.signIn(who); await A.flush();
  fbk.deliver('workspaces/CLUB', JSON.parse(JSON.stringify(CLUB))); await A.flush();
  A.ui.teamId = 't1'; A.ui.view = 'roster'; A.render();
  return { A, fbk };
}
const W = 'workspaces/CLUB/teams/';
const writesUnder = (fbk, pre) => fbk.record.writes.filter(w => w.path.startsWith(pre));

(async () => {

  console.log('--- the grid ---');
  {
    const { A, fbk } = await boot();
    check('the squad offers it to its coach', /data-act="gridopen"/.test(A.rendered()), true);
    A.click({ act: 'gridopen' });
    const page = A.rendered();
    check('every player, in one table', ['Ella', 'Maya', 'Rosa'].every(n => page.includes(`value="${n}"`)), true);
    check('with Save and Cancel', /data-act="gridsave"/.test(page) && /data-act="gridcancel"/.test(page), true);
    const before = fbk.record.writes.length;

    A.type({ grid: 'number', pid: 'p1' }, '10');
    A.type({ grid: 'name', pid: 'p3' }, 'Rosa Diaz');
    A.type({ grid: 'preferred', pid: 'p3' }, 'Wing', 'change');
    A.type({ grid: 'active', pid: 'p2' }, false, 'change');
    check('nothing is written while typing', fbk.record.writes.length, before);
    check('the grid knows it has changes', A.gridChanged(), true);

    // a sync update redraws the screen mid-edit
    fbk.deliverChild('workspaces/CLUB/teams', 't1', JSON.parse(JSON.stringify(CLUB.teams.t1)), 'changed'); await A.flush();
    A.render();
    check('a redraw keeps what was typed', /value="10"/.test(A.rendered()) && /value="Rosa Diaz"/.test(A.rendered()), true);

    // another phone changes a field this grid never touched
    A.state.teams.t1.players.p1.name = 'Ella M';

    A.click({ act: 'gridsave' }); await A.flush();
    const w = writesUnder(fbk, W + 't1/players/').map(x => x.path.replace(W + 't1/players/', '') + '=' + JSON.stringify(x.value));
    deepEq('exactly the changed fields, one each', w.sort(), ['p1/number="10"', 'p2/active=false', 'p3/name="Rosa Diaz"', 'p3/preferred="Wing"']);
    check('no whole-player or whole-squad write', fbk.record.writes.some(x => /players(\/p\d)?$/.test(x.path)), false);
    check('the other phone\'s edit survives', A.state.teams.t1.players.p1.name, 'Ella M');
    check('Maya is off the roster, not deleted', A.state.teams.t1.players.p2.active === false && !!A.state.teams.t1.players.p2, true);
    check('the grid closes', A.grid, null);
    check('her minutes still stand', A.state.matches.g1.stints.s1.pid, 'p1');
    check('the parents\' page is republished', A.timers.pending.size > 0, true);
  }
  {
    const { A, fbk } = await boot();
    A.click({ act: 'gridopen' });
    A.type({ grid: 'name', pid: 'p1' }, '   ');
    A.click({ act: 'gridsave' });
    check('a blank name is refused', A.lastToast(), 'Every player needs a name');
    check('with nothing written', writesUnder(fbk, W).length, 0);
    check('and the grid still open', !!A.grid, true);
    A.type({ grid: 'name', pid: 'p1' }, 'Ella');
    A.click({ act: 'gridsave' });
    check('unchanged in the end, nothing is written', writesUnder(fbk, W).length, 0);
    check('and it says so', A.lastToast(), 'Nothing had changed');
  }
  {
    const { A } = await boot();
    A.click({ act: 'gridopen' });
    A.type({ grid: 'number', pid: 'p3' }, '9');
    A.render();
    check('two players on one number are flagged', /Shared shirt numbers: <b>#9<\/b>/.test(A.rendered()), true);
    A.type({ grid: 'number', pid: 'p3' }, '4');
    A.click({ act: 'gridcancel' });
    check('cancel after undoing needs no confirm, and closes', A.grid, null);
  }
  {
    const { A, fbk } = await boot('mum');
    A.render();
    check('a parent is not offered it', /data-act="gridopen"/.test(A.rendered()), false);
    A.click({ act: 'gridopen' });
    check('nor opens it by hand', A.grid, null);
    A.click({ act: 'gridsave' });
    check('nor saves anything', writesUnder(fbk, W).length, 0);
  }

  console.log('\n--- adding several at once ---');
  {
    const { A } = await boot();
    const { rows, bad } = A.parseSquadLines('7 Ella Moreno\nMaya Patel, 9\n#11 - Isla\nRosa Diaz\n\n12\n  3   Nia  ');
    deepEq('number first, last, or none', rows.map(r => r.number + ':' + r.name),
      ['7:Ella Moreno', '9:Maya Patel', '11:Isla', ':Rosa Diaz', '3:Nia']);
    deepEq('a bare number is not a player', bad, ['12']);
  }
  {
    const { A, fbk } = await boot();
    A.click({ act: 'gridopen' });
    A.dom.node('#gridPaste').value = '11 Isla\nElla, 7\n5 Nia';
    A.click({ act: 'gridpaste' }); await A.flush();
    const names = Object.values(A.state.teams.t1.players).map(p => p.name).sort();
    deepEq('new players are added', names, ['Ella', 'Isla', 'Maya', 'Nia', 'Rosa']);
    check('a name already on the team is skipped', /skipped 1 already on the team/.test(A.lastToast()), true);
    const adds = writesUnder(fbk, W + 't1/players/').filter(w => /players\/[^/]+$/.test(w.path));
    check('one write per player, at the player', adds.length, 2);
    check('and they appear in the open grid', /value="Isla"/.test(A.rendered()), true);
  }

  console.log('\n--- next season: copy and move ---');
  {
    const { A, fbk } = await boot();
    A.click({ act: 'gridopen' });
    A.click({ act: 'gridselall' });
    A.click({ act: 'gridcopy' });
    const sheet = A.rendered('#sheet');
    check('her other team is offered', /Flight 2027/.test(sheet), true);
    check('a team she does not coach is not', /Storm/.test(sheet), false);
    check('a coach cannot make a new team — the rules refuse her', /A new team/.test(sheet), false);
    A.click({ act: 'mvpick', k: 'to', v: 't2' });
    A.click({ act: 'mvgo' }); await A.flush();
    const t2 = Object.values(A.state.teams.t2.players);
    check('copied onto next season\'s team', t2.length, 3);
    check('Maya #9 was already there, so she is not doubled', /1 already there/.test(A.lastToast()), true);
    const ella = t2.find(p => p.name === 'Ella');
    check('a new id — history stays with the old one', !!ella && ella.id !== 'p1', true);
    check('her profile comes along', [ella.number, ella.preferred, ella.rating].join(), '7,Mid,4');
    check('her parent stays linked', !!(ella.guardians || {}).mum, true);
    const rosa = t2.find(p => p.name === 'Rosa');
    deepEq('pairings follow, to the Maya already there', Object.keys(ella.pairs).sort(), [rosa.id, 'x1'].sort());
    check('nothing left the old team', Object.keys(A.state.teams.t1.players).length, 3);
    check('and nobody there is off the roster', Object.values(A.state.teams.t1.players).every(p => p.active !== false), true);
    check('written one player at a time', writesUnder(fbk, W + 't2/players/').every(w => /t2\/players\/[^/]+$/.test(w.path)), true);
  }
  {
    const { A } = await boot();
    A.click({ act: 'gridopen' });
    A.click({ act: 'gridsel', pid: 'p3' });
    A.click({ act: 'gridmove' });
    A.click({ act: 'mvpick', k: 'to', v: 't2' });
    A.click({ act: 'mvgo' }); await A.flush();
    check('moved: on the new team', Object.values(A.state.teams.t2.players).some(p => p.name === 'Rosa'), true);
    check('off this roster, not deleted', A.state.teams.t1.players.p3.active, false);
  }
  {
    const { A } = await boot();
    A.click({ act: 'gridopen' });
    A.click({ act: 'gridsel', pid: 'p1' });
    A.type({ grid: 'number', pid: 'p1' }, '99');
    A.click({ act: 'gridcopy' });
    check('unsaved edits must be saved first', A.lastToast(), 'Save or cancel your changes first');
  }
  {
    // forged: a coach copying onto a team she does not coach
    const { A } = await boot();
    A.click({ act: 'gridopen' });
    A.click({ act: 'gridsel', pid: 'p1' });
    A.ui.mv = { mode: 'copy', to: 't3' };
    A.click({ act: 'mvgo' }); await A.flush();
    check('refused onto a team she cannot change', Object.keys(A.state.teams.t3.players || {}).length, 0);
  }
  {
    // an admin starts next season as a new team
    const { A, fbk } = await boot('adm');
    A.click({ act: 'gridopen' });
    A.click({ act: 'gridselall' });
    A.click({ act: 'gridcopy' });
    check('an admin may make a new team', /A new team/.test(A.rendered('#sheet')), true);
    A.click({ act: 'mvpick', k: 'to', v: 'new' });
    A.click({ act: 'mvgo' });
    check('it needs a name', A.lastToast(), 'Give the new team a name');
    A.dom.node('#mvName').value = 'Flight 2027/28';
    A.click({ act: 'mvgo' }); await A.flush();
    const made = Object.values(A.state.teams).find(x => x.name === 'Flight 2027/28');
    check('the new team exists', !!made, true);
    check('with the whole squad', Object.keys(made.players).length, 3);
    const teamWrite = fbk.record.writes.find(w => w.path === W + made.id);
    check('the team is written at the team, empty', !!teamWrite && Object.keys(teamWrite.value.players).length, 0);
    check('then each player at the player', writesUnder(fbk, W + made.id + '/players/').length, 3);
  }

  H.summary('squad');
})();
