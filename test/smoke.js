const fs=require('fs');
/* The DOM stub and the storage stub live in harness.js now — three copies of
   them had grown up across this file, sandbox.js and the slice tests, so a fix
   to one fixed one test. Everything below is unchanged. */
const { mk, makeStorage } = require('./harness');

// one node per selector, so what render() writes into #app can be read back
const nodes = {};
const node = sel => (nodes[sel] = nodes[sel] || mk());
global.document = { querySelector: sel=>node(sel), querySelectorAll: ()=>[], addEventListener(){}, createElement:()=>mk(), body:mk() };
global.rendered = () => String(node('#app').innerHTML || '');
global.window = {};
global.location = { reload(){}, hash:'', pathname:'/', search:'' };
global.history = { replaceState(){} };
global.window = { addEventListener(){}, SOCCER_FIREBASE_CONFIG:null };
global.setInterval = ()=>0; global.setTimeout=()=>0; global.clearTimeout=()=>{};
global.confirm = ()=>false; global.alert=()=>{};
global.Blob=function(){}; global.URL={createObjectURL:()=>'x',revokeObjectURL(){}}; global.FileReader=function(){};

// reproduce the broken state: a team with NO name, one player, plus a normal team
const store = {
  teams:{
    t_bad:{ id:'t_bad', players:{ p1:{id:'p1',name:'Test',number:'99'} } },
    t_ok:{ id:'t_ok', name:'Flight', players:{ p2:{id:'p2',name:'Ella',number:'7'} } }
  },
  matches:{}
};
global.localStorage = makeStorage({
  'sm.data.v1': JSON.stringify(store),
  'sm.ui.v1': JSON.stringify({view:'setup',teamId:'t_bad'})
});

let src = fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
src = src.replace(/await import\([^)]*\)/g,'({})');   // never reached, but keep Node happy
try {
  new Function(src + `
    sheetTeams();
    // exercise a real sub in the live view
    ui.teamId='t_ok';
    state.matches.g1={id:'g1',teamId:'t_ok',opponent:'Riverside',date:'2026-09-12',
      periodCount:2,periodMinutes:40,onFieldCount:7,currentHalf:1,
      periods:{0:{half:1,start:Date.now()-600000}},
      planned:{p2:40,p3:40}, positions:{p2:{x:50,y:50,slot:null}},
      stints:{s1:{pid:'p2',on:0}}};
    state.teams.t_ok.players.p3={id:'p3',name:'Mia',number:'8',anywhere:true};
    ui.matchId='g1'; ui.view='game'; ui.gameView='live'; render();
    tapLive('p3'); render();
    tapLive('p2');
    console.log('after sub — p2 min:', Math.round(playedSec(state.matches.g1,'p2')/60),
                '| p3 on field:', onField(state.matches.g1,'p3'),
                '| stints:', Object.keys(state.matches.g1.stints).length);
    ui.view='game'; ui.gameView='live'; render();
    ui.view='matches'; render();
    // fill the game with every kind of data so no branch is skipped
    const M=state.matches.g1;
    M.formation={name:'3-3-2',size:7,slots:[{id:'s1',label:'GK',role:'GK',x:50,y:92},{id:'s2',label:'LB',role:'Back',x:25,y:70},{id:'s3',label:'ST',role:'Forward',x:50,y:22}]};
    M.periods={0:{half:1,start:Date.now()-2400000,end:Date.now()-1200000},1:{half:2,start:Date.now()-900000}};
    M.currentHalf=2;
    M.goals={g1:{t:300,side:'us',pid:'p2',assist:'p3',by:'uid_x',byName:'Grant'},g2:{t:1500,side:'them'}};
    M.shots={s1:{t:200,side:'us',onTarget:true,pid:'p2',xy:{x:40,y:20},by:null,byName:'videotool'},
             s2:{t:400,side:'them',onTarget:false},s3:{t:1800,side:'us',onTarget:false,xy:{x:60,y:35}}};
    M.events={e1:{t:250,side:'us',kind:'corner'},e2:{t:700,side:'them',kind:'foul'},
              e3:{t:900,side:'us',kind:'keeper'},e4:{t:1100,side:'them',kind:'throw'}};
    M.poss={t1:{t:100,to:'us'},t2:{t:1300,to:'them'}};
    M.planned={p2:40,p3:35};
    M.plan={blockMinutes:10,blocks:[{start:0,ids:['p2','p3'],assign:{s3:'p2'}},{start:600,ids:['p3'],assign:{}}]};
    state.teams.t_ok.track={possession:true};
    state.teams.t_ok.players.p3.gk=true;
    ui.plan={matchId:'g1',items:[{k:'sub',out:'p2',in:'p3'},{k:'add',pid:'p3'},{k:'move',pid:'p2',sid:'s2',label:'LB'}]};
    ui.picked='p3';
    ui.view='game'; ['live','track','stats','pitch'].forEach(g=>{
      ui.gameView=g;
      const out=[]; const orig=document.querySelector;
      render(); console.log('  rendered game/'+g+' with full data');
    });
    ui.plan=null; ui.picked=null;
    ['all','goal','shot','set','sub','poss'].forEach(f=>{ui.logFilter=f; ui.gameView='track'; render();});
    console.log('  all six log filters rendered');
    ui.sortBy='number'; ui.gameView='live'; render(); console.log('  live in shirt-number order');

    // --- roles ---
    state.access={};
    console.log('  no membership at all -> myRole', myRole(), '| restricted', restricted());
    me={uid:'u1',name:'Grant',email:'g@x.com'};
    console.log('  signed in, no roles  -> myRole', myRole(), '| restricted', restricted(), '(must stay null: nobody gets locked out)');
    state.access={admins:{u1:true},members:{u1:{name:'Grant'},u2:{name:'Jaz'},u3:{name:'Parent'}},
      teams:{t_ok:{coaches:{u2:true},trackers:{u3:true}}}};
    ui.teamId='t_ok';
    console.log('  admin                ->', myRole(), '| restricted', restricted());
    me={uid:'u2',name:'Jaz'};  console.log('  coach                ->', myRole(), '| restricted', restricted());
    me={uid:'u3',name:'Trk'};  console.log('  tracker              ->', myRole(), '| restricted', restricted());
    state.teams.t_ok.players.p2.guardians={u4:true};
    me={uid:'u4',name:'Mum'};  console.log('  guardian of a player ->', myRole(), '| restricted', restricted());
    me={uid:'u9',name:'Rando'};console.log('  signed in, unknown   ->', myRole(), '| restricted', restricted());
    /* Not just "did not throw". The role banner is built by concatenation right
       where the view is chosen, and === binds looser than +. Get that wrong and
       the banner never reaches the page AND everyone holding one lands on the
       games list instead of the game, so a tracker cannot open Track at all.
       Both halves are checked: one can pass while the other does not. */
    var roleFail = 0;
    for (const row of [['coach','u2','live'],['tracker','u3','track'],['parent','u4','stats']]) {
      const who=row[0], want=row[2];
      me={uid:row[1]}; ui.view='game'; ui.gameView=want; render();
      const html=rendered(), onGame=/class="barrow"/.test(html), banner=/class="rolebar"/.test(html);
      const wantBanner = who!=='coach';   // a coach of this team is unrestricted here
      if (!onGame || banner!==wantBanner) roleFail++;
      console.log('  ' + who.padEnd(7) + ' opens a game -> '
        + (onGame ? 'the game screen' : 'THE GAMES LIST')
        + ', ' + want + ' tab kept: ' + (ui.gameView===want)
        + ', banner: ' + (banner?'shown':'none') + (banner===wantBanner?'':' (WRONG)'));
    }
    console.log('  every role reached the game screen:', roleFail?'NO - '+roleFail+' wrong':'yes');
    global.roleFail = roleFail;
    // app owner and tab visibility
    console.log('  before appOwners is read      -> isOwner', isOwner(), '(nobody is owner by default)');
    me={uid:'own',name:'Grant',email:'g@x.com'};
    console.log('  signed in, not in appOwners  -> isOwner', isOwner(), '| canAdmin', canAdmin());
    appOwners={own:true};
    console.log('  after the console grants it  -> isOwner', isOwner(), '|', myRole(), '| canAdmin', canAdmin());
    me={uid:'u3',name:'Trk'}; state.access={teams:{t_ok:{trackers:{u3:true}}}};
    console.log('  tracker                      ->', myRole(), '| canAdmin', canAdmin());
    ui.view='admin'; render(); console.log('  tracker opening admin lands on', ui.view);
    me={uid:'own'}; ui.view='admin'; render(); console.log('  owner opening admin stays on', ui.view);
    // subtabs must hide when there is no game
    const keep=state.matches; state.matches={}; ui.view='game'; render();
    console.log('  game view with no games redirects to', ui.view);
    state.matches=keep;
    // --- the three worked scenarios ---
    state.teams.tB={id:'tB',name:'G12 Storm',players:{k2:{id:'k2',name:'Rosa',number:'4',guardians:{mumU:true}}}};
    state.teams.t_ok.players.p2.guardians={mumU:true};
    state.teams.t_ok.players.p3.guardians={coachU:true};
    state.access={admins:{bossU:true},teams:{t_ok:{coaches:{coachU:true}}},
      members:{mumU:{name:'Mum'},coachU:{name:'Jaz'},bossU:{name:'Boss'}},index:{}};

    me={uid:'mumU',name:'Mum'};
    console.log('  parent, kids on two teams -> My players:', myPlayers().map(x=>x.p.name+' ('+x.t.name+')').join(', '));
    console.log('     visible teams:', myTeams().map(t=>t.name).join(', '), '| tab shown:', guardsAnyone());
    ui.view='mine'; render(); console.log('     rendered My players as a parent');

    me={uid:'coachU',name:'Jaz'};
    console.log('  coach with a kid on her own team -> role here:', myRole(), '| My players:', myPlayers().map(x=>x.p.name).join(', '));
    console.log('     visible teams:', myTeams().map(t=>t.name).join(', '), '(a coach reads the whole club)');
    ui.view='mine'; render(); console.log('     rendered My players as a coach');

    me={uid:'bossU',name:'Boss'};
    console.log('  admin, no children        -> My players tab shown:', guardsAnyone(), '| canAdmin', canAdmin());
    ui.view='mine'; render(); console.log('     mine view with nobody linked ->', ui.view);

    me=null; state.access={};
    ui.view='club'; render(); console.log('  rendered club home');
    state.access={admins:{own:true},members:{own:{name:'Grant',email:'g@x',at:Date.now()},u9:{name:'New Person',email:'n@x',at:Date.now()}},teams:{},index:{}};
    me={uid:'own',name:'Grant'}; appOwners={};
    ui.view='people'; render(); console.log('  rendered people page as admin');
    ui.view='admin'; render(); console.log('  rendered club settings with readiness');
    appOwners={own:true}; state.access.index={own:true};
    ui.view='admin'; render(); console.log('  readiness renders when everything passes too');
    ['all','pending','coach','tracker','parent'].forEach(f=>{ui.peopleFilter=f; render();});
    console.log('  all five people filters rendered');
    ui.peopleSort='joined'; render(); console.log('  people sorted by join date');
    ui.view='teamset'; render(); console.log('  rendered team page');
    ui.view='setup'; render();
    ui.view='match'; render();
    ui.view='roster'; render();
    ui.view='season'; render();
    ui.teamId='t_ok'; ui.view='setup'; render();
  `)();
  console.log('BOOT OK + team sheet + all five tabs rendered, no exception');
  // CLAUDE.md asks for exit 0 from this file, so actually refuse to give it
  if (global.roleFail) {
    console.log('FAILED:', global.roleFail, 'role(s) did not reach the game screen');
    process.exit(1);
  }
} catch (e) {
  console.log('BOOT CRASH:', e.constructor.name, '-', e.message);
  console.log(e.stack.split('\n').slice(1,4).join('\n'));
  process.exit(1);
}
