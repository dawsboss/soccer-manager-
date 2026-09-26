/* Bulk import: a season's teams, rosters and fixtures from one JSON file.

   What has to hold is mostly about what it must NOT do. It must not replace
   anything — a game tracked offline on the admin's phone, or a coach's edit to
   a roster, is not the importer's to throw away. It must not double up when the
   same file is run twice, which is the first thing anyone does after a
   half-successful import. It must not write anything while the file still has
   an error in it. And it must write at the depth the rules sit at: a whole
   collection is refused once a club is locked down, one team or one field at a
   time is not. */

const H = require('./harness');
const { check, deepEq } = H;

const A = H.loadApp();
const admin = () => {
  A.state = {
    teams: {}, matches: {},
    access: { org: { name: 'Lakeside SC' }, admins: { adm: true }, index: { adm: true } }
  };
  A.me = { uid: 'adm', name: 'Ada' };
};
const text = o => JSON.stringify(o);
const clickImport = o => {
  A.dom.node('#impText').value = typeof o === 'string' ? o : text(o);
  A.click({ act: 'importgo' });
};
const onlyDepths = plan => plan.writes.every(([p]) =>
  /^teams\/[\w-]+(\/players\/[\w-]+(\/\w+)?)?$/.test(p) || /^matches\/[\w-]+(\/\w+)?$/.test(p));

/* ---------------- a club from nothing ---------------- */

console.log('--- the example file, into an empty club ---');
admin();
const plan = A.importPlan(A.IMPORT_EXAMPLE);
deepEq('no errors', plan.errors, []);
check('one team', plan.counts.newTeams, 1);
check('three players', plan.counts.newPlayers, 3);
check('two games', plan.counts.newGames, 2);
check('one of them already played', plan.counts.results, 1);
check('planning changed nothing', Object.keys(A.state.teams).length, 0);
check('every write at a depth the rules grant', onlyDepths(plan), true);
check('a new team goes out whole, players and all', plan.writes.filter(([p]) => p.startsWith('teams/')).length, 1);

clickImport(A.IMPORT_EXAMPLE);
const t = Object.values(A.state.teams)[0];
check('the team is there', t && t.name, 'Lakeside Thunder G12');
check('with its roster', Object.keys(t.players).length, 3);
const bea = Object.values(t.players).find(p => p.name === 'Bea Smith');
check('position read', bea.preferred, 'Forward');
deepEq('also-plays read', bea.canPlay, ['Wing']);
check('rating read', bea.rating, 4);
check('shirt numbers are strings, as the app keeps them', bea.number, '7');
check('a keeper is a keeper', Object.values(t.players).find(p => p.number === '1').gk, true);
check('defaults as if added by hand', Object.values(t.players).find(p => p.number === '10').anywhere, true);

const games = A.teamMatches(t.id);
check('both games belong to the team', games.length, 2);
const played = games.find(g => g.opponent === 'Riverside');
const next = games.find(g => g.opponent === 'Northgate');
deepEq('the result is the score', A.score(played), { us: 3, them: 1 });
check('and the game is finished', A.gameStatus(played), 'done');
check('with no clock to close', A.elapsedSec(played), 0);
const bySc = pid => A.goalList(played).filter(g => g.pid === pid).length;
check('scorers credited by shirt number', bySc(bea.id), 2);
check('opponents\' goals credited to nobody', A.goalList(played).filter(g => g.side === 'them' && g.pid).length, 0);
check('the fixture is upcoming', A.gameStatus(next), 'upcoming');
check('with the shape asked for', next.formation && next.formation.name, '3-3-2');
check('and a spot for each of the nine', next.formation.slots.length, 9);
check('told the admin what it did', /Imported: adds 1 team, 3 players, 2 games/.test(A.lastToast()), true);

/* ---------------- running it twice ---------------- */

console.log('\n--- the same file again ---');
const again = A.importPlan(A.IMPORT_EXAMPLE);
check('writes nothing', again.writes.length, 0);
check('and says so', A.importSummary(again.counts), 'nothing new — everything in it is already here');
deepEq('no complaints either', again.warnings, []);

/* ---------------- updating what is there ---------------- */

console.log('\n--- a second file updates in place ---');
const before = JSON.stringify(A.state);
const upd = A.importPlan({
  teams: [{
    name: '  lakeside thunder g12 ', // how a spreadsheet will spell it
    players: [{ name: 'bea smith', rating: 5 }, { name: 'Dara Kim', number: 22, position: 'defender' }],
    games: [{ opponent: 'Northgate', date: '2026-10-04', venue: 'Moved: Lakeside Park' }]
  }]
});
deepEq('no errors', upd.errors, []);
check('the team is found by name, not added again', upd.counts.newTeams, 0);
check('one player added', upd.counts.newPlayers, 1);
check('one player updated', upd.counts.players, 1);
check('one game updated', upd.counts.games, 1);
check('planning an update touched nothing', JSON.stringify(A.state) === before, true);
deepEq('an update writes the field, not the player',
  upd.writes.map(([p]) => p).filter(p => p.includes(bea.id)), [`teams/${t.id}/players/${bea.id}/rating`]);
deepEq('nor the game', upd.writes.map(([p]) => p).filter(p => p.includes(next.id)), [`matches/${next.id}/venue`]);
check('every write at a depth the rules grant', onlyDepths(upd), true);
A.applyImport(upd);
check('rating updated', A.state.teams[t.id].players[bea.id].rating, 5);
check('her other details kept', A.state.teams[t.id].players[bea.id].preferred, 'Forward');
check('venue updated', A.state.matches[next.id].venue, 'Moved: Lakeside Park');
check('kick-off kept', A.state.matches[next.id].kickoff, '09:30');
check('"defender" means Back', Object.values(A.state.teams[t.id].players).find(p => p.name === 'Dara Kim').preferred, 'Back');

console.log('\n--- a score for a game that already has goals ---');
const clash = A.importPlan({ teams: [{ name: 'Lakeside Thunder G12', games: [{ opponent: 'Riverside', date: '2026-09-06', score: '5-0' }] }] });
check('adds no goals on top', clash.writes.some(([p]) => p.includes('goals')), false);
check('and says why', clash.warnings.some(w => /already has goals recorded here \(3-1\)/.test(w)), true);

/* ---------------- a game tracked here survives ---------------- */

console.log('\n--- a game tracked on this device is not the importer\'s ---');
A.state.matches[next.id].stints = { s1: { pid: bea.id, on: 0 } };
A.applyImport(A.importPlan({ teams: [{ name: 'Lakeside Thunder G12', games: [{ opponent: 'Northgate', date: '2026-10-04', kickoff: '10:15' }] }] }));
check('its stints are untouched', Object.keys(A.state.matches[next.id].stints).length, 1);
check('its details updated', A.state.matches[next.id].kickoff, '10:15');

/* ---------------- problems in the file ---------------- */

console.log('\n--- a file with mistakes in it ---');
const snap = JSON.stringify(A.state);
const badData = {
  teams: [{ name: 'U10 Blue', players: [{ number: 4 }, { name: 'Edie', position: 'sweeper', rating: 9 }],
    games: [{ opponent: 'Hill End', date: '04/10/2026' }, { date: '2026-10-11' }] }],
  games: [{ team: 'Nobody FC', opponent: 'X', date: '2026-10-18' }]
};
const bad = A.importPlan(badData);
check('a nameless player is an error', bad.errors.some(e => /player 1: a player needs a name/.test(e)), true);
check('a date written the other way round is an error', bad.errors.some(e => /should be written 2026-10-04/.test(e)), true);
check('a game with no opponent is an error', bad.errors.some(e => /needs an opponent/.test(e)), true);
check('a game for a team nobody has heard of is an error', bad.errors.some(e => /no team called "Nobody FC"/.test(e)), true);
check('an unknown position is only a warning', bad.warnings.some(w => /"sweeper" is not a position/.test(w)), true);
check('so is a rating off the scale', bad.warnings.some(w => /rating 9 is not 1 to 5/.test(w)), true);
clickImport(badData);
check('with errors left, nothing is written', JSON.stringify(A.state) === snap, true);
clickImport('{ "teams": [ oops');
check('nor from a file that is not JSON', JSON.stringify(A.state) === snap, true);
deepEq('an empty object is explained, not ignored', A.importPlan({}).errors.length, 1);

console.log('\n--- the same thing twice in one file ---');
const dup = A.importPlan({ teams: [{ name: 'U9 Red', players: [{ name: 'Gia', number: 3 }, { name: 'gia', rating: 2 }],
  games: [{ opponent: 'Oaks', date: '2026-11-01' }, { opponent: 'oaks', date: '2026-11-01' }] }] });
check('one player', dup.counts.newPlayers, 1);
check('who got both rows', Object.values(dup.writes[0][1].players)[0].rating, 2);
check('one game', dup.counts.newGames, 1);
check('with a note', dup.warnings.some(w => /appears twice/.test(w)), true);

/* ---------------- who may ---------------- */

console.log('\n--- only an admin ---');
const snap2 = JSON.stringify(A.state);
A.me = { uid: 'coach', name: 'Jaz' };
clickImport({ teams: [{ name: 'Sneaky XI' }] });
check('a coach is refused', JSON.stringify(A.state) === snap2, true);
check('and told', A.lastToast(), 'Only club admins can import');
A.dom.node('#sheet').innerHTML = '';
A.click({ act: 'bulkimport' });
check('nor is the sheet opened for her', A.dom.node('#sheet').innerHTML, '');
A.me = { uid: 'adm', name: 'Ada' };
A.click({ act: 'bulkimport' });
check('an admin gets the sheet', /Bulk import/.test(A.dom.node('#sheet').innerHTML), true);
A.dom.node('#impText').value = text(A.IMPORT_EXAMPLE);
A.click({ act: 'importcheck' });
check('checking shows what it would do', /This file (adds|updates)/.test(A.dom.node('#sheet').innerHTML), true);

/* ---------------- a backup file ---------------- */

console.log('\n--- loading a backup ---');
const backup = JSON.parse(JSON.stringify({ teams: A.state.teams, matches: A.state.matches }));
admin();
A.state.teams[t.id] = { id: t.id, name: 'Renamed here', players: {} };
const bk = A.importPlan(backup);
deepEq('no errors', bk.errors, []);
check('recognised as a backup', bk.backup, true);
check('a team already here is kept, not overwritten', bk.writes.some(([p]) => p === `teams/${t.id}`), false);
check('its games still come back', bk.counts.newGames, Object.keys(backup.matches).length);
A.applyImport(bk);
check('this club\'s copy of the team kept', A.state.teams[t.id].name, 'Renamed here');
check('the club\'s admins untouched — the old import dropped them', !!A.state.access.admins.adm, true);
check('the tracked game came back whole', Object.keys(A.state.matches[next.id].stints).length, 1);
check('loading it again adds nothing', A.importPlan(backup).writes.length, 0);

H.summary('bulk import');
