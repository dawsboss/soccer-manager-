const fs=require('fs'); const src=fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
const grab=(a,b)=>src.slice(src.indexOf(a), src.indexOf(b));
const code=grab('/* ---------------- roles ---------------- */','/* ---------------- model helpers')
 + `
 let state={teams:{},matches:{},access:{}}, ui={teamId:null}, me=null;
 const teams=()=>Object.values(state.teams);
 function delDeep(){} function quiet(){} function remoteDel(){} function saveLocal(){}
 module.exports={myTeams,canEditTeam,roleIn,canAdmin,isOwner,
   set:(st,who,tid)=>{state=st;me=who;ui.teamId=tid;}};`;
const m={exports:{}}; new Function('module','exports',code)(m,m.exports); const H=m.exports;

const club=()=>({
  teams:{
    t1:{id:'t1',name:'G14 Flight',players:{a:{id:'a',guardians:{mum:true}}}},
    t2:{id:'t2',name:'G12 Storm',players:{b:{id:'b'}}},
    t3:{id:'t3',name:'G16 Rush',players:{c:{id:'c'}}}
  },
  matches:{},
  access:{admins:{boss:true},teams:{t1:{coaches:{jaz:true},trackers:{trk:true}},t2:{coaches:{other:true}}},index:{}}
});
const names=t=>t.map(x=>x.name).join(', ')||'(none)';

console.log('--- who sees which teams ---');
for (const [who,uid] of [['admin','boss'],['coach of t1','jaz'],['coach of t2','other'],['tracker t1','trk'],['parent t1','mum'],['stranger','nobody']]) {
  H.set(club(), {uid}, 't1');
  const vis=H.myTeams();
  console.log(`  ${who.padEnd(12)} sees: ${names(vis).padEnd(34)} can edit t1: ${H.canEditTeam('t1')}`);
}

console.log('\n--- coaches read across the club, edit only their own ---');
H.set(club(), {uid:'jaz'}, 't2');
console.log('  coach of t1 viewing t2 -> visible:', H.myTeams().length, 'teams, editable:', H.canEditTeam('t2'), '(expect 3, false)');

console.log('\n--- before lockdown nothing is hidden ---');
const open={...club()}; open.access={};
H.set(open, null, 't1');
console.log('  signed out, no admins  ->', names(H.myTeams()), '| editable:', H.canEditTeam('t1'));
H.set(open, {uid:'anyone'}, 't1');
console.log('  signed in, no admins   ->', names(H.myTeams()), '| editable:', H.canEditTeam('t1'));
