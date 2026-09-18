const fs=require('fs'); const src=fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
const grab=(a,b)=>src.slice(src.indexOf(a), src.indexOf(b));
const code=grab('/* ---------------- routing ---------------- */','let routing = false')
 + `
 let ui={view:'matches',gameView:'live',teamId:null,matchId:null,editFid:null};
 let state={teams:{t7:{id:'t7'}},matches:{g3:{id:'g3'}}};
 let location={hash:''};
 module.exports={uiToHash,hashToUi,ui,setHash:h=>location.hash=h};`;
const m={exports:{}}; new Function('module','exports',code)(m,m.exports); const H=m.exports;

console.log('--- ui turns into a readable path ---');
const cases=[
  [{view:'matches',teamId:'t7'},'#/team/t7/games'],
  [{view:'roster',teamId:'t7'},'#/team/t7/squad'],
  [{view:'season',teamId:'t7'},'#/team/t7/season'],
  [{view:'teamset',teamId:'t7'},'#/team/t7/planning'],
  [{view:'game',teamId:'t7',matchId:'g3',gameView:'stats'},'#/team/t7/game/g3/stats'],
  [{view:'club'},'#/club'],
  [{view:'admin'},'#/club/settings'],
  [{view:'mine'},'#/my-players'],
  [{view:'setup'},'#/settings'],
];
let ok=true;
for (const [st,want] of cases){
  Object.assign(H.ui,{view:'matches',gameView:'live',teamId:null,matchId:null},st);
  const got=H.uiToHash();
  if(got!==want) ok=false;
  console.log(`  ${String(want).padEnd(28)} ${got===want?'ok':'GOT '+got}`);
}
console.log('\n--- and back again ---');
for (const [st,path] of cases){
  Object.assign(H.ui,{view:'x',gameView:'live',teamId:null,matchId:null});
  H.setHash(path);
  H.hashToUi();
  const match=Object.entries(st).every(([k,v])=>H.ui[k]===v);
  if(!match) ok=false;
  console.log(`  ${path.padEnd(28)} -> view=${H.ui.view} team=${H.ui.teamId||'-'} ${match?'ok':'MISMATCH'}`);
}
console.log('\n--- a link to a team or game that does not exist is ignored ---');
H.setHash('#/team/nope/games'); console.log('  unknown team accepted:', H.hashToUi(), '(expect false)');
H.setHash('#/team/t7/game/nope/live'); console.log('  unknown game accepted:', H.hashToUi(), '(expect false)');
console.log('\nall round-trips:', ok?'pass':'FAIL');
