/* Forgetting an account (functions/forget.js, `forgetMe`, required as
   deployed on the fake server; AUTH.md, *Deleting*). Her request is hers
   alone (rules.js); this pins what goes and what stays, in every club she
   is in, and that a club is never left with no admin. */

const H = require('./harness');
const { check, deepEq } = H;
const { makeServer, ORGS_MODE } = require('./fakebase');

const club = () => ({
  access: {
    admins: { adm: true }, index: { adm: true, coachU: true, mum: 't1', dad: true, solo: true, gran: 't1' },
    teams: { t1: { coaches: { coachU: true, mum: true } } },
    teamIndex: { t1: { coachU: 'coach', mum: 'coach' } }, coachIndex: { coachU: 't1', mum: 't1' },
    teamParents: { t1: { mum: 'p1', dad: 'p1', solo: 'p2' } }, teamFans: { t1: { gran: 'p1' } }
  },
  org: { name: 'Lakeside SC' },
  members: { mum: { name: 'Mo', email: 'mo@x.test' }, adm: { name: 'Ada' } },
  names: { mum: { name: 'Mo' } },
  teams: { t1: { id: 't1', name: 'Flight' } },
  squad: { t1: {
    p1: { id: 'p1', name: 'Ella', number: '7', child: 'p1', guardians: { mum: true, dad: true }, familyNames: { mum: 'Mo', dad: 'Dev' }, fans: { gran: true } },
    p2: { id: 'p2', name: 'Rosa', number: '9', child: 'p2', guardians: { solo: true } }
  } },
  children: {
    p1: { id: 'p1', first: 'Ella', club: true, by: 'club', at: 1, teams: { t1: 'p1' }, guardians: { mum: 't1', dad: 't1' } },
    p2: { id: 'p2', first: 'Rosa', club: true, by: 'club', at: 1, teams: { t1: 'p2' }, guardians: { solo: 't1' } },
    k9: { id: 'k9', first: 'Mia', club: true, by: 'solo', at: 1, family: { solo: 'rl' } }
  },
  care: { p2: { by: 'solo', at: 1, contacts: { 0: { name: 'Solo', phone: '555' } } } },
  regs: { f27: { k9: { st: 'accepted', by: 'solo', at: 1 } } }
});
function server() {
  const S = makeServer({
    orgs: { CLUB: club(), ELSE: { access: { admins: { mum: true, other: true }, index: { mum: true, other: true } }, org: { name: 'Elsewhere' } } },
    userOrgs: { mum: { CLUB: { name: 'Lakeside SC' }, ELSE: { name: 'Elsewhere' } }, solo: { CLUB: { name: 'Lakeside SC' } }, adm: { CLUB: { name: 'Lakeside SC' } } },
    families: { solo: { CLUB: { k9: true } } },
    people: { mum: { set: { share: true } }, solo: { mute: { msg: true } } },
    pushTokens: { mum: { tok1: { at: 1 } } },
    userLibrary: { mum: { drills: { d1: { name: 'Rondo' } } } },
    claims: { CLUB: { t1: { mum: { shirt: '7' } } } },
    board: { CLUB: { t1: { n1: { by: 'mum', text: 'Bring water' } } } }
  });
  S.loadFunctions();
  return S;
}
// in the orgs pass the fake server keeps a club in the old tree's shape; ask it as the app's paths say
const at = (S, p) => {
  if (!ORGS_MODE) return S.at(p);
  const q = p.replace(/^orgs\/(\w+)\/squad\/([^/]+)\//, 'workspaces/$1/teams/$2/players/').replace(/^orgs\/(\w+)\/(members|names|org)(?=\/|$)/, (m, c, k) => `workspaces/${c}/${k === 'names' ? 'names' : 'access/' + k}`).replace(/^orgs\//, 'workspaces/');
  return S.at(q);
};

(async () => {
  console.log('--- what is deployed ---');
  {
    const S = server();
    check('a request wakes the forgetting', S.woken('forgetRequests/mum').includes('forgetMe'), true);
    check('its answer, beneath it, wakes nothing', S.woken('forgetRequests/mum/answer').includes('forgetMe'), false);
  }

  console.log('\n--- never the last admin of a club ---');
  {
    const S = server();
    S.put('orgs/ELSE/access/admins/other', null);
    await S.fire('forgetRequests/mum', { at: Date.now() });
    const a = S.at('forgetRequests/mum/answer') || {};
    deepEq('refused, naming the club', [a.ok, a.why, a.clubs], [false, 'lastAdmin', ['Elsewhere']]);
    check('— and nothing taken', !!at(S, 'orgs/CLUB/members/mum') && !!S.at('pushTokens/mum'), true);
  }

  console.log('\n--- a coach who is also a parent ---');
  {
    const S = server();
    await S.fire('forgetRequests/mum', { at: Date.now() });
    check('answered', (S.at('forgetRequests/mum/answer') || {}).ok, true);
    check('her coaching goes', !!at(S, 'orgs/CLUB/access/teams/t1/coaches/mum'), false);
    check('— and every table\'s entry for her', ['index/mum', 'teamIndex/t1/mum', 'coachIndex/mum', 'teamParents/t1/mum'].some(p => at(S, 'orgs/CLUB/access/' + p) != null), false);
    check('— her member entry and staff name', !!(at(S, 'orgs/CLUB/members/mum') || at(S, 'orgs/CLUB/names/mum')), false);
    check('her place as her child\'s family, on the squad and on the child', !!(at(S, 'orgs/CLUB/squad/t1/p1/guardians/mum') || at(S, 'orgs/CLUB/children/p1/guardians/mum')), false);
    check('her name off her child\'s record, her other parent\'s kept', [at(S, 'orgs/CLUB/squad/t1/p1/familyNames/mum'), at(S, 'orgs/CLUB/squad/t1/p1/familyNames/dad')].join(), ',Dev');
    check('her child keeps her other parent, and her team', !!at(S, 'orgs/CLUB/squad/t1/p1/guardians/dad') && at(S, 'orgs/CLUB/squad/t1/p1/active') !== false, true);
    check('— and is not marked as having left', at(S, 'orgs/CLUB/children/p1/left') == null, true);
    check('her ask on a team link', S.at('claims/CLUB/t1/mum'), null);
    check('another club she is an admin of: her role there goes too', !!at(S, 'orgs/ELSE/access/admins/mum'), false);
    check('— whose other admin stays', !!at(S, 'orgs/ELSE/access/admins/other'), true);
    for (const p of ['people/mum', 'pushTokens/mum', 'userLibrary/mum', 'userOrgs/mum']) check(p + ' goes', S.at(p), null);
    check('the notice she wrote stays, as in any group chat', !!S.at('board/CLUB/t1/n1'), true);
    check('nobody else\'s bookmark is touched', !!S.at('userOrgs/adm/CLUB') && !!S.at('userOrgs/solo/CLUB'), true);
    check('a fan of her child is untouched', !!at(S, 'orgs/CLUB/squad/t1/p1/fans/gran'), true);
  }

  console.log('\n--- the only family of two children ---');
  {
    const S = server();
    await S.fire('forgetRequests/solo', { at: 5 });
    check('her child on a team is taken off it (her games keep her name and number)', at(S, 'orgs/CLUB/squad/t1/p2/active'), false);
    check('— still on the squad by name and number', (at(S, 'orgs/CLUB/squad/t1/p2') || {}).name + '#' + (at(S, 'orgs/CLUB/squad/t1/p2') || {}).number, 'Rosa#9');
    check('— her record kept, marked as having left, for the admins', !!(at(S, 'orgs/CLUB/children/p2/left') || {}).at, true);
    check('— with her care details, for the admins to decide', !!at(S, 'orgs/CLUB/care/p2'), true);
    check('a child of hers on no team: kept and marked too', !!(at(S, 'orgs/CLUB/children/k9/left') || {}).at, true);
    check('— her registration kept for the admins', (at(S, 'orgs/CLUB/regs/f27/k9') || {}).st, 'accepted');
    check('her own list of her children goes', S.at('families/solo'), null);
    check('— and her settings', S.at('people/solo'), null);
  }

  H.summary('forgetting an account');
})().catch(e => { console.error(e); process.exit(1); });
