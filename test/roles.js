const fs=require('fs'); const src=fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
const grab=(a,b)=>src.slice(src.indexOf(a), src.indexOf(b));
const code=grab('/* ---------------- roles ---------------- */','/* ---------------- model helpers')
 + `
 let state={teams:{},matches:{},access:{}}, ui={teamId:'t1'}, me=null;
 function delDeep(o,p){const k=p.split('/');let c=o;for(let i=0;i<k.length-1;i++){if(!c[k[i]])return;c=c[k[i]];}delete c[k[k.length-1]];}
 function setDeep(o,p,v){const k=p.split('/');let c=o;for(let i=0;i<k.length-1;i++){if(typeof c[k[i]]!=='object'||!c[k[i]])c[k[i]]={};c=c[k[i]];}c[k[k.length-1]]=v;}
 function quiet(p,v){setDeep(state,p,v);} function remoteDel(){} function saveLocal(){}
 module.exports={hasAnyRole,syncIndex,approved,roleIn,isAdmin,isCoach,isTracker,isGuardian,
   setState:v=>state=v, getState:()=>state, setMe:v=>me=v, setTeam:v=>ui.teamId=v};`;
const m={exports:{}}; new Function('module','exports',code)(m,m.exports); const H=m.exports;

const base=()=>({
  teams:{t1:{id:'t1',name:'Flight',players:{p1:{id:'p1',guardians:{mum:true}},p2:{id:'p2'}}}},
  matches:{}, access:{admins:{boss:true},teams:{t1:{coaches:{coach:true},trackers:{trk:true}}},members:{},index:{}}
});

console.log('--- role derivation ---');
H.setState(base()); H.setTeam('t1');
for (const uid of ['boss','coach','trk','mum','rando'])
  console.log(`  ${uid.padEnd(6)} -> ${H.roleIn('t1',uid) || 'none'}`);

console.log('\n--- index is built from every kind of role ---');
H.setState(base());
for (const uid of ['boss','coach','trk','mum','rando']) H.syncIndex(uid);
console.log('  indexed:', Object.keys(H.getState().access.index).sort().join(', '), '(rando must be absent)');

console.log('\n--- losing a role removes you, unless you hold another ---');
let st=base(); H.setState(st);
st.access.teams.t1.trackers.coach=true;          // coach is also a tracker
H.syncIndex('coach');
delete st.access.teams.t1.coaches.coach;          // demoted from coach
H.syncIndex('coach');
console.log('  still indexed as tracker:', !!H.getState().access.index.coach, '(expect true)');
delete st.access.teams.t1.trackers.coach;
H.syncIndex('coach');
console.log('  after losing both:', !!H.getState().access.index.coach, '(expect false)');

console.log('\n--- a guardian keeps access through the player, not a team list ---');
st=base(); H.setState(st);
H.syncIndex('mum');
console.log('  mum indexed:', !!H.getState().access.index.mum);
delete st.teams.t1.players.p1.guardians.mum;
H.syncIndex('mum');
console.log('  after unlinking from the player:', !!H.getState().access.index.mum, '(expect false)');

console.log('\n--- bootstrap: an empty workspace has nobody, so nobody is locked in ---');
H.setState({teams:{},matches:{},access:{}});
console.log('  hasAnyRole(anyone):', H.hasAnyRole('boss'), '| approved:', H.approved('boss'));
