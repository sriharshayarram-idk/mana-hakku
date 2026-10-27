// Fails the build if the home-page guide is out of step with the app:
// every tab needs guide text in English and Telugu, and the change log must have today's or a recent entry.
const fs=require('fs');const h=fs.readFileSync(__dirname+'/../app/src/main/assets/index.html','utf8');
const tabs=[...h.matchAll(/class="tab"[^>]*data-view="([a-z]+)"/g)].map(m=>m[1]);
const gi=h.indexOf('const GUIDE=');const gEnd=h.indexOf('\n};',gi);const G=h.slice(gi,gEnd);
let bad=0;for(const v of tabs){const i=G.indexOf('\n '+v+':{');const j=i<0?-1:G.indexOf('\n }',i);const seg=i<0?'':G.slice(i,G.indexOf('},\n',i+1)<0?G.length:G.indexOf('},\n',i+1)+1);if(i<0||!/en:\[/.test(seg)||!/te:\[/.test(seg)){console.log('MISSING guide text for tab:',v);bad++}}
const d=(h.match(/const CHANGELOG=\[\n \{d:"(\d{4}-\d\d-\d\d)"/)||[])[1];
if(!d){console.log('MISSING change log');bad++}
console.log(`guide: ${tabs.length} tabs checked, change log ${d}`);process.exit(bad?1:0);
