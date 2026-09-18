const fs=require('fs');
const app=fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8'), idx=fs.readFileSync('index.html','utf8');
const build=(app.match(/const BUILD = '(\d+)'/)||[])[1];
const meta=(idx.match(/meta name="build" content="(\d+)"/)||[])[1];
const qs=[...idx.matchAll(/(?:app\.js|styles\.css)\?v=(\d+)/g)].map(m=>m[1]);
console.log('app.js BUILD      :', build);
console.log('index meta build  :', meta);
console.log('index ?v= params  :', qs.join(', '));
const all=[build,meta,...qs];
console.log('all agree         :', new Set(all).size===1 ? 'yes' : 'NO — '+all.join(' / '));
// simulate a browser holding an older index.html
const staleMeta='19';
console.log('\nsimulating cached page at v'+staleMeta+':');
console.log('  stale() would return:', staleMeta!==build);
console.log('  banner shows         : "cached at v'+staleMeta+' but the code is v'+build+'"');
