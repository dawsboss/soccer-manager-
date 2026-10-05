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
  /^teams\/[\w-]+(\/players\/[\w-]+(\/\w+)?|\/events\/[\w-]+(\/\w+)?|\/birthYear)?$/.test(p) || /^matches\/[\w-]+(\/\w+)?$/.test(p)
  || /^access\/org\/venues\/[\w-]+(\/\w+|\/permits\/[\w-]+)?$/.test(p))
  // a session and a booking each at its own path under training/{code}, never a collection
  && (plan.sessWrites || []).every(([p]) => /^sessions\/[\w-]+$/.test(p) || /^booked\/[\w-]+\/[\w-]+$/.test(p));

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
check('with its birth year', t.birthYear, 2015);
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

console.log('\n--- a birth year fills a gap, and never overrules one ---');
{
  const kept = A.importPlan({ teams: [{ name: 'Lakeside Thunder G12', birthYear: 2014 }] });
  check('a team that has one keeps it', kept.writes.length, 0);
  check('and says what it left out', kept.warnings.some(w => /already born 2015 here, so 2014 was left out/.test(w)), true);
  const keep = A.state.teams[t.id].birthYear;
  delete A.state.teams[t.id].birthYear;
  const fill = A.importPlan({ teams: [{ name: 'Lakeside Thunder G12', born: '2015' }] });
  deepEq('a team without one gets it, as one field', fill.writes, [[`teams/${t.id}/birthYear`, 2015]]);
  check('counted as an updated team', A.importSummary(fill.counts), 'updates 1 team');
  check('at a depth the rules grant', onlyDepths(fill), true);
  A.applyImport(fill);
  check('and it lands', A.state.teams[t.id].birthYear, keep);
  const odd = A.importPlan({ teams: [{ name: 'New Team', birthYear: 'twenty-sixteen' }] });
  check('a year that isn\'t one is left out', odd.writes[0][1].birthYear, undefined);
  check('with a warning, not an error', odd.errors.length === 0 && odd.warnings.some(w => /doesn't look like a year/.test(w)), true);
}

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

/* ---------------- fields and training sessions ---------------- */

/* The same promises, for the club's fields and its training sessions: matched,
   never doubled, never removed, nothing written while the file has an error.
   Sessions are matched by date, start and coach; a booking already here is
   the coach's and is left alone. */
const held = { state: JSON.stringify(A.state), sess: JSON.stringify(A.sess) };
const club2 = () => {
  A.state = {
    teams: {
      ta: { id: 'ta', name: 'G11 Flight', birthYear: 2016, players: {
        a1: { id: 'a1', name: 'Ella Fitz', number: '7', active: true },
        a2: { id: 'a2', name: 'Rosa Delgado', number: '9', active: true },
        a3: { id: 'a3', name: 'Maya Chen', number: '4', active: true } } },
      tb: { id: 'tb', name: 'G13 Storm', birthYear: 2014, players: {
        b1: { id: 'b1', name: 'Quinn Jones', number: '3', active: true },
        b2: { id: 'b2', name: 'Maya Chen', number: '5', active: true } } }
    },
    matches: {},
    access: {
      org: { name: 'Lakeside SC' }, admins: { adm: true }, index: { adm: true, jaz: true },
      members: { adm: { name: 'Ada' }, jaz: { name: 'Jaz Patel', email: 'Jaz@x.test' } },
      teams: { ta: { coaches: { jaz: true } } }
    }
  };
  A.sess = { sessions: {}, booked: {}, came: {}, fees: {}, pay: {}, splans: {}, dirty: {} };
  A.me = { uid: 'adm', name: 'Ada' };
};

console.log('\n--- fields, with their permits ---');
club2();
const fieldFile = { fields: [{ name: 'Lakeside Park', address: '1 Lake Rd', pitches: 2, surface: 'grass', lights: 'yes',
  permits: [{ days: 'Mon, Wed', start: '4pm', end: '8pm', from: '2026-09-01', until: '2026-11-30', number: 'City #4471' },
    { days: 'weekends', note: 'Saturdays and Sundays, all day' }] }] };
const fp = A.importPlan(fieldFile);
deepEq('a file of only fields is fine', fp.errors, []);
check('one field', fp.counts.newFields, 1);
check('every write at a depth the rules grant', onlyDepths(fp), true);
clickImport(fieldFile);
const lf = A.fieldList()[0];
check('the field is there', lf && lf.name, 'Lakeside Park');
check('under the club settings', !!A.state.access.org.venues[lf.id], true);
check('its surface, tidied', lf.surface, 'Grass');
check('lights', lf.lights, true);
const pms = A.permitsOf(lf);
check('both permits', pms.length, 2);
const weekday = pms.find(p => p.ref === 'City #4471');
deepEq('days read', weekday.days, [0, 2]);
check('4pm to 8pm read', weekday.start + '–' + weekday.end, '16:00–20:00');
check('and its dates', weekday.from + ' ' + weekday.until, '2026-09-01 2026-11-30');
deepEq('"weekends" is Saturday and Sunday', pms.find(p => !p.ref).days, [5, 6]);
check('a permit with no hours covers the day', !pms.find(p => !p.ref).start, true);
check('the same file again changes nothing', A.importPlan(fieldFile).writes.length, 0);

const moreFile = { fields: [{ name: 'lakeside park', pitches: 3,
  permits: [{ days: ['Mon', 'Wed'], start: '16:00', end: '20:00', from: '2026-09-01', until: '2026-11-30', number: 'City #4471' },
    { days: ['Fri'], from: '17:00', to: '19:00' }] }] };
const mp = A.importPlan(moreFile);
check('a second file finds the field by name', mp.counts.newFields + ' new, ' + mp.counts.fields + ' updated', '0 new, 1 updated');
clickImport(moreFile);
check('its pitches updated', A.fieldById(lf.id).pitches, 3);
check('a permit already listed is not added twice; a new one is', A.permitsOf(A.fieldById(lf.id)).length, 3);
check('"from" and "to" read as times when they are times', A.permitsOf(A.fieldById(lf.id)).some(p => p.days.join() === '4' && p.start === '17:00'), true);
check('and nothing it had is gone', A.fieldById(lf.id).address, '1 Lake Rd');

const badFields = A.importPlan({ fields: [{ name: 'X', permits: [{ days: 'Funday', start: '16:00', end: '18:00' }] },
  { name: 'Y', permits: [{ days: 'Mon', start: '18:00', end: '16:00' }] }, { permits: [] }, { name: 'Z', permits: [{ start: '16:00', end: '18:00' }] }] });
check('a day that is not a day is an error', badFields.errors.some(e => /"Funday" is not a day/.test(e)), true);
check('a permit that ends before it starts', badFields.errors.some(e => /ends at 16:00, before it starts at 18:00/.test(e)), true);
check('a field with no name', badFields.errors.some(e => /Field 3: a field needs a name/.test(e)), true);
check('a permit with no days', badFields.errors.some(e => /needs the days it covers/.test(e)), true);

console.log('\n--- training sessions ---');
club2();
const sessFile = {
  fields: [{ name: 'Lakeside Park', permits: [{ days: ['Mon', 'Wed'], start: '16:00', end: '20:00' }] }],
  sessions: [
    { type: '1-1', title: 'Finishing', coach: 'Jaz Patel', date: '2026-10-05', start: '5pm', end: '6pm', field: 'Lakeside Park', price: '$25', players: ['Ella Fitz'] },
    { type: 'group', title: 'Keepers', coach: 'jaz@x.test', date: '2026-10-07', start: '16:30', end: '17:30', field: 'Lakeside Park', where: 'goalmouth',
      spots: 2, ages: 'U10-U13', weekly: { days: ['Wed'], until: '2026-10-21' }, team: 'G11 Flight', players: ['Rosa Delgado', 9, { name: 'Quinn Jones', team: 'G13 Storm' }, { number: 4 }] },
    { type: 'group', title: 'Late one', date: '2026-10-08', start: '19:30', end: '20:30', field: 'Lakeside Park' },
    { type: '1-1', title: 'Somewhere new', coach: 'Jaz Patel', date: '2026-10-09', start: '10:00', end: '11:00', field: 'Riverside Rec' }
  ]
};
const sp = A.importPlan(sessFile);
deepEq('no errors', sp.errors, []);
check('one session plus a weekly group of three, plus two more', sp.counts.newSessions, 6);
check('every write at a depth the rules grant', onlyDepths(sp), true);
check('the sessions go to training, not into the workspace', sp.writes.some(([p]) => /session|booked/.test(p)), false);
check('a coach found by name or by email, whatever its case', sp.sessWrites.filter(([p, v]) => p.startsWith('sessions/') && v.coach === 'jaz').length, 5);
check('one with no coach is the importer\'s', sp.sessWrites.some(([p, v]) => p.startsWith('sessions/') && v.title === 'Late one' && v.coach === 'adm'), true);
check('and that is said', sp.warnings.some(w => /Late one\): no coach given, so it is yours/.test(w)), true);
check('a time outside the field\'s permit is said', sp.warnings.some(w => /Late one.*outside the club's permit/.test(w)), true);
check('a field nobody has is kept as the place', sp.sessWrites.some(([, v]) => v.title === 'Somewhere new' && v.place === 'Riverside Rec' && !v.field), true);
check('and that is said too', sp.warnings.some(w => /"Riverside Rec" is not a field/.test(w)), true);
clickImport(sessFile);
const one = A.sessAll().find(s => s.title === 'Finishing');
check('5pm to 6pm read', one.start + '–' + one.end, '17:00–18:00');
check('"$25" read', one.price, 25);
check('at the field from the same file', A.fieldById(one.field).name, 'Lakeside Park');
check('a session with players named is booked by the coach, not open', one.open, false);
check('Ella is booked', (A.bookOf(one.id, 'a1') || {}).st, 'in');
check('under her own team', A.bookOf(one.id, 'a1').tid, 'ta');
const wk = A.sessAll().filter(s => s.title === 'Keepers');
check('weekly: one session a week, to the last date', wk.map(s => s.date).join(), '2026-10-07,2026-10-14,2026-10-21');
check('sharing one series', new Set(wk.map(s => s.series)).size, 1);
deepEq('ages read', wk[0].ages, [10, 13]);
check('a name, a shirt number and another team\'s player all found', ['a2', 'b1', 'a3'].every(p => A.bookOf(wk[0].id, p)), true);
check('Rosa by name and by her number is one booking', A.bookingsOf(wk[0].id).length, 3);
check('two spots: two booked', A.bookingsOf(wk[0].id).filter(x => x.st === 'in').length, 2);
check('and the rest on the waiting list, in every week', wk.every(s => A.bookingsOf(s.id).filter(x => x.st === 'wait').length === 1), true);
check('a session with nobody named is open to families', A.sessAll().find(s => s.title === 'Late one').open, true);
check('each is owed to the club until it answers', Object.keys(A.sess.dirty).some(k => k.startsWith('sessions/')), true);

const again2 = A.importPlan(sessFile);
check('the same file again adds nothing', again2.sessWrites.length + again2.writes.length, 0);
check('and says so', A.importSummary(again2.counts), 'nothing new — everything in it is already here');
deepEq('quietly', again2.warnings.filter(w => !/waiting list|outside|not a field|already/.test(w)), []);

A.sess.booked[one.id].a1.st = 'out';
const changed = { sessions: [{ type: '1-1', title: 'Finishing', coach: 'Jaz Patel', date: '2026-10-05', start: '17:00', end: '18:00', field: 'Lakeside Park', price: 30, players: ['Ella Fitz'] }] };
const cp = A.importPlan(changed);
check('a changed price updates the session it matches', cp.counts.newSessions + ' new, ' + cp.counts.sessions + ' updated', '0 new, 1 updated');
check('written whole, at its own path', cp.sessWrites[0][0], 'sessions/' + one.id);
check('a booking the coach changed is left as it is', cp.sessWrites.some(([p]) => p.startsWith('booked/')), false);
check('and said', cp.warnings.some(w => /already "withdrew"/.test(w)), true);

const badSess = A.importPlan({ sessions: [
  { date: '05/10/2026', start: '17:00', end: '18:00', coach: 'Jaz Patel' },
  { date: '2026-10-05', start: '18:00', end: '17:00', coach: 'Jaz Patel' },
  { date: '2026-10-05', start: '17:00', end: '18:00', coach: 'Nobody' },
  { date: '2026-10-05', start: '17:00', end: '18:00', coach: 'Jaz Patel', players: ['Maya Chen'] },
  { date: '2026-10-05', start: '17:00', end: '18:00', coach: 'Jaz Patel', players: ['Zara Nobody'] },
  { date: '2026-10-05', start: '17:00', end: '18:00', coach: 'Jaz Patel', type: 'workshop' },
  { date: '2026-10-05', start: '17:00', end: '18:00', coach: 'Jaz Patel', ages: 'U30' },
  { date: '2026-10-05', start: '17:00', end: '18:00', coach: 'Jaz Patel', weekly: { days: ['Mon'] } },
  { date: '2026-10-05', start: '17', end: '18', coach: 'Jaz Patel' }
] });
check('a date the other way round', badSess.errors.some(e => /Session 1: date "05\/10\/2026"/.test(e)), true);
check('one that ends before it starts', badSess.errors.some(e => /Session 2: it ends at 17:00/.test(e)), true);
check('a coach nobody has heard of, with who there is', badSess.errors.some(e => /no coach or admin called "Nobody" here \(there are .*Jaz Patel/.test(e)), true);
check('a name on two teams needs its team', badSess.errors.some(e => /more than one player is called "Maya Chen"/.test(e)), true);
check('a name on no team', badSess.errors.some(e => /nobody in the club is called "Zara Nobody"/.test(e)), true);
check('a type it cannot read', badSess.errors.some(e => /should be "1-1" or "group"/.test(e)), true);
check('ages it cannot read', badSess.errors.some(e => /ages "U30"/.test(e)), true);
check('weekly with no last date', badSess.errors.some(e => /needs the date of the last one/.test(e)), true);
check('a bare "17" is not a time', badSess.errors.some(e => /Session 9: needs a start and an end/.test(e)), true);
const snap3 = JSON.stringify(A.sess);
clickImport({ sessions: [{ date: '2026-10-30', start: '17:00', end: '18:00', coach: 'Jaz Patel' }, { date: 'soon' }] });
check('with errors left, no session is written', JSON.stringify(A.sess) === snap3, true);

console.log('\n--- a whole club in one file ---');
club2();
const whole = A.importPlan(A.IMPORT_EXAMPLE);
deepEq('the example has no errors', whole.errors, []);
check('its team, its field and its sessions', [whole.counts.newTeams, whole.counts.newFields, whole.counts.newSessions > 2].join(), '1,1,true');
check('booking a player the same file adds', whole.sessWrites.some(([p, v]) => p.startsWith('booked/') && v.st === 'in'), true);
A.state = JSON.parse(held.state); A.sess = JSON.parse(held.sess); A.me = { uid: 'adm', name: 'Ada' };

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

/* ---------------- practices and the rest of the calendar ---------------- */

console.log('\n--- practices, events and match-day details ---');
{
admin();
A.applyImport(A.importPlan({ teams: [{ name: 'Flight' }] }));
const fl = Object.values(A.state.teams)[0];
const cal = {
  practices: [{ team: 'Flight', date: '2026-09-07', start: '5:30pm', end: '19:00', where: 'Lakeside Park', weekly: { days: ['Mon', 'Wed'], until: '2026-09-30' } }],
  events: [{ team: 'Flight', title: 'Picture day', date: '2026-09-20', start: '10:00', minutes: 30 }],
  games: [{ team: 'Flight', opponent: 'Riverside', date: '2026-09-13', kickoff: '9am', home: 'A', arrive: '8:30 am', uniform: 'Blue shirts' }]
};
const cp = A.importPlan(cal);
deepEq('no errors', cp.errors, []);
check('a weekly practice is one entry per week, Mondays and Wednesdays', cp.counts.newPractices, 8);
check('and the picture day', cp.counts.newEvents, 1);
check('each at its own path on the team\'s calendar', cp.writes.filter(([p]) => /^teams\/[\w-]+\/events\/[\w-]+$/.test(p)).length, 9);
check('every write at a depth the rules grant', onlyDepths(cp), true);
const pr = cp.writes.map(([, v]) => v).filter(v => v && v.kind === 'practice');
check('sharing one series', new Set(pr.map(v => v.series)).size === 1 && !!pr[0].series, true);
check('the time read from "5:30pm"', pr[0].start + '-' + pr[0].end, '17:30-19:00');
check('team-only unless the file says so', pr.every(v => v.public === false), true);
const pic = cp.writes.map(([, v]) => v).find(v => v && v.title === 'Picture day');
check('an end worked out from its length', pic && pic.end, '10:30');
const gm = cp.writes.map(([, v]) => v).find(v => v && v.opponent === 'Riverside');
check('a game\'s kick-off read from "9am"', gm.kickoff, '09:00');
check('away, arrive by, and the kit', [gm.home, gm.arrive, gm.kit].join(' '), 'away 08:30 Blue shirts');
A.applyImport(cp);
check('on the calendar', A.calItems([fl.id]).filter(x => x.kind === 'practice').length, 8);
check('a second run adds nothing', A.importPlan(cal).writes.length, 0);
const moved = JSON.parse(JSON.stringify(cal)); moved.practices[0].where = 'Hill End';
const mp = A.importPlan(moved);
check('a changed place updates each week, one field each', mp.writes.every(([p]) => /\/events\/[\w-]+\/venue$/.test(p)) && mp.writes.length, 8);
const handMade = Object.values(A.state.teams[fl.id].events).find(e => e.kind === 'practice');
A.state.teams[fl.id].events[handMade.id].public = true;
check('a practice already shared stays shared when the file is silent', A.importPlan(cal).writes.length, 0);
const fresh = A.importPlan({ teams: [{ name: 'Storm', practices: [{ date: '2026-09-08', start: '18:00' }] }] });
check('a new team\'s practices go out with it, in its one write', fresh.writes.length === 1 && Object.keys(fresh.writes[0][1].events).length, 1);
check('a bad date is an error', A.importPlan({ practices: [{ team: 'Flight', date: '8 Sept', start: '18:00' }] }).errors.length, 1);
check('a practice for a team that isn\'t here is an error', A.importPlan({ practices: [{ team: 'Nobody', date: '2026-09-08' }] }).errors.length, 1);
}

/* ---------------- spreadsheets ---------------- */

console.log('\n--- a spreadsheet, as other apps export them ---');
{
admin();
const roster = 'First Name,Last Name,Jersey #,Position,Date of birth\nAda,Lovelace,1,Goalkeeper,2015-02-01\n"Smith, Jr",Bea,7,Striker,2015-03-01\n';
let r = A.csvImport(roster, {});
check('a roster with no team column asks for the team', r.needsTeam && !!r.error, true);
r = A.csvImport(roster, { team: 'Flight' });
check('read as a roster', r.kind, 'players');
check('two players', r.data.teams[0].players.length, 2);
check('first and last names joined, a quoted comma kept', r.data.teams[0].players[1].name, 'Smith, Jr Bea');
check('a column it can\'t place is said', r.unused.join(), 'Date of birth');
const rp = A.importPlan(r.data);
deepEq('no errors', rp.errors, []);
check('makes the team it was picked for', rp.counts.newTeams + ' ' + rp.counts.newPlayers, '1 2');
check('a striker is a forward', Object.values(rp.writes[0][1].players).find(p => p.number === '7').preferred, 'Forward');
check('nobody\'s date of birth', /2015-0/.test(JSON.stringify(rp.writes)), false);

A.click({ act: 'bulkimport' });
A.dom.node('#impText').value = roster;
A.dom.node('#impTeam').value = '';
A.dom.node('#impNewTeam').value = '';
A.click({ act: 'importgo' });
check('nothing written while the team is missing', Object.keys(A.state.teams).length, 0);
check('and the sheet says why', /pick the team/.test(A.dom.node('#sheet').innerHTML), true);
A.dom.node('#impNewTeam').value = 'Flight';
A.click({ act: 'importgo' });
check('picked, it imports', Object.values(A.state.teams).map(x => x.name + ':' + Object.keys(x.players).length).join(), 'Flight:2');

const sched = [
  'Team,Event Type,Date,Start Time,End Time,Home Team,Away Team,Location,Arrival Time,Uniform,Notes',
  'Flight,Game,10/4/2026,9:30 AM,,Flight,Northgate,Lakeside Park,9:00 AM,Blue,',
  'Flight,League game,10/11/2026,10:00 AM,,Riverside,Flight,Riverside Rec,,White,Bring both kits',
  'Flight,Practice,10/6/2026,5:30 PM,7:00 PM,,,Lakeside Park,,,',
  'Flight,Team party,10/18/2026,4:00 PM,6:00 PM,,,Clubhouse,,,Families welcome'
].join('\r\n');
const s1 = A.csvImport(sched, {});
check('read as a schedule', s1.kind, 'schedule');
check('games, practices and the rest sorted by their type', [s1.data.games.length, s1.data.practices.length, s1.data.events.length].join(), '2,1,1');
check('month first, as written', s1.data.games[0].date, '2026-10-04');
check('ours at home: the other side is the opponent', s1.data.games[0].opponent + ' ' + s1.data.games[0].home, 'Northgate home');
check('ours away', s1.data.games[1].opponent + ' ' + s1.data.games[1].home, 'Riverside away');
const sp = A.importPlan(s1.data);
deepEq('no errors', sp.errors, []);
check('two games, a practice and a party', [sp.counts.newGames, sp.counts.newPractices, sp.counts.newEvents].join(), '2,1,1');
A.applyImport(sp);
const g1 = Object.values(A.state.matches).find(m => m.opponent === 'Northgate');
check('kick-off, arrive by and kit', [g1.kickoff, g1.arrive, g1.kit].join(' '), '09:30 09:00 Blue');
check('the same sheet again adds nothing', A.importPlan(A.csvImport(sched, {}).data).writes.length, 0);
const eu = A.csvImport('Team;Date;Time;Opponent\nFlight;25/10/2026;10:00;Hill End\nFlight;1/11/2026;10:00;Storm\n', {});
check('a day past twelve reads the whole column day first', eu.data.games.map(g => g.date).join(), '2026-10-25,2026-11-01');
check('semicolons too', eu.kind, 'schedule');
check('"Oct 4, 2026" and "Sat 4 October 2026"', A.csvImport('Team,Date,Opponent\nFlight,"Oct 4, 2026",X\nFlight,Sat 4 October 2026,Y\n', {}).data.games.map(g => g.date).join(), '2026-10-04,2026-10-04');
const badRow = A.importPlan(A.csvImport('Team,Date,Opponent\nFlight,next week,X\n', {}).data);
check('a date it can\'t read is an error, by row', badRow.errors.length === 1 && /^Row 2/.test(badRow.errors[0]), true);
const before = JSON.stringify(A.state);
A.dom.node('#impText').value = 'Team,Date,Opponent\nFlight,next week,X\nFlight,2026-12-01,Y\n';
A.click({ act: 'importgo' });
check('and nothing is written while it is there', JSON.stringify(A.state) === before, true);

const fieldsCsv = 'Name,Address,Pitches,Surface,Lights\nLakeside Park,1 Lake Rd,2,Grass,yes\n';
const fc = A.csvImport(fieldsCsv, {});
check('read as fields, and needing no team', fc.kind + ' ' + !!fc.needsTeam, 'fields false');
const fp = A.importPlan(fc.data);
check('a field added', fp.counts.newFields, 1);
check('nothing it can\'t tell', A.csvImport('Colour,Size\nred,4\n', {}).error.startsWith('Couldn\'t tell'), true);
check('a template for each, readable by itself', ['roster', 'schedule', 'fields', 'drills'].every(k => { const c = A.csvImport(A.CSV_TEMPLATES[k], {}); return !c.error && !A.importPlan(c.data).errors.length; }), true);
}

console.log('\n--- the club\'s drills ---');
{
  admin(); A.train = { practices: {}, dirty: {}, drills: {}, drillDirty: {}, tpls: {}, tplDirty: {} };
  const drill = (extra = {}) => ({ name: 'Gates dribble', summary: 'Through the gates', setup: 'Cones as gates', how: ['Dribble through a gate', 'Find another'], points: ['Eyes up'], ...extra });
  const p1 = A.importPlan({ drills: [drill({ type: 'Technical', ages: 'U7-U10', minutes: '10-15', players: '6-16', skills: ['dribbling', 'Ball mastery'], signals: 'Few shots; nonsense', links: ['https://example.org/v', 'http://insecure.example'] })] });
  deepEq('a drill list on its own is a file', p1.errors, []);
  check('one drill added', p1.counts.newDrills, 1);
  check('a word the library doesn\'t know is said', p1.warnings.some(w => /"nonsense"/.test(w)), true);
  check('and only https links kept', p1.warnings.some(w => /only https/.test(w)), true);
  check('said in the summary', A.importSummary(p1.counts), 'adds 1 drill');
  const d = p1.trainWrites[0][1];
  check('words or labels, held to the library\'s own', d.skills.join() + ' ' + d.signals.join() + ' ' + d.type, 'dribbling,ball-mastery few-shots technical');
  check('ranges read as ranges', JSON.stringify([d.ages, d.minutes, d.players]), JSON.stringify([[7, 10], [10, 15], { min: 6, best: 6, max: 16 }]));
  check('on the club\'s shelf, as the admin\'s', d.by + ' ' + d.byName + ' ' + JSON.stringify(d.team), 'adm Ada ""');
  A.applyImport(p1);
  check('there after importing', A.shelfItems('club').map(x => x.name).join(), 'Gates dribble');
  check('the same file again changes nothing', A.importPlan({ drills: [drill({ type: 'Technical', ages: 'U7-U10', minutes: '10-15', players: '6-16', skills: ['dribbling', 'Ball mastery'], signals: 'Few shots', links: ['https://example.org/v'] })] }).trainWrites.length, 0);
  const p2 = A.importPlan({ drills: [{ name: 'gates  DRIBBLE', why: 'Beating a player starts with the head up' }] });
  check('matched by name: updated, not doubled', p2.counts.newDrills + ' ' + p2.counts.drills, '0 1');
  const u = p2.trainWrites[0][1];
  check('field by field, the rest kept, its version bumped', u.why.startsWith('Beating') && u.setup === 'Cones as gates' && u.v === 2 && u.name === 'Gates dribble', true);
  const p3 = A.importPlan({ drills: [drill({ name: 'No setup', setup: '' }), drill({ name: 'Headers', skills: ['heading'], ages: 'U8-U10' })] });
  check('the five things the editor insists on, insisted on', p3.errors.some(e => /No setup.*set it up/.test(e)), true);
  check('and no heading below U11', p3.errors.some(e => /Headers.*U11/.test(e)), true);
  check('nothing planned while an error is left', A.importPlan({ drills: [drill({ name: 'Fine' }), drill({ name: 'Bad', how: [] })] }).errors.length > 0, true);
  const csv = A.csvImport(A.CSV_TEMPLATES.drills, {});
  check('a drills spreadsheet, read by its headings, with no team asked for', csv.kind + ' ' + !!csv.needsTeam, 'drills false');
  const cd = csv.data.drills[0];
  check('steps and points split a line each', Array.isArray(A.importPlan(csv.data).trainWrites[0][1].how) && A.importPlan(csv.data).trainWrites[0][1].how.length, 3);
  check('the sheet\'s link kept', A.importPlan(csv.data).trainWrites[0][1].media[0].url, 'https://example.org/gates');
  check('one name, one drill', cd.name, 'Gates dribble');
  A.me = { uid: 'co', name: 'Coach' }; A.state.access.teams = { t1: { coaches: { co: true } } };
  A.dom.node('#sheet').innerHTML = '';
  A.click({ act: 'importgo' });
  check('a coach cannot import', A.shelfItems('club').length, 1);
}

H.summary('bulk import');
