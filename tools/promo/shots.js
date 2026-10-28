// Captures Telugu screenshots of the app for the promo video (phone size, 2x).
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const OUT=process.argv[2]||'out/shots';fs.mkdirSync(OUT,{recursive:true});
const src=fs.readFileSync(path.join(__dirname,'../../app/src/main/assets/index.html'),'utf8');
const k=src.indexOf('(function(){\n"use strict";');const e=src.lastIndexOf('})();',src.indexOf('</script>',k));
fs.writeFileSync(path.join(__dirname,'../../app/src/main/assets/_promo.html'),src.slice(0,e)+'window.__ev=s=>eval(s);\n'+src.slice(e));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
 await ctx.route(/script\.google\.com/,r=>r.abort());
 const pg=await ctx.newPage();await pg.addInitScript(()=>{localStorage.setItem('mh-lang','te');localStorage.setItem('mh-state','ap')});
 const ev=(fn,a)=>pg.evaluate(([c,x])=>window.__ev('('+c+')')(x),[fn.toString(),a]);
 const url='file://'+path.resolve(__dirname,'../../app/src/main/assets/_promo.html');
 const shot=async(name,sel,h)=>{await pg.waitForTimeout(700);const y=sel?await pg.evaluate(s=>document.querySelector(s).getBoundingClientRect().top+scrollY,sel):0;
  const H=await pg.evaluate(()=>document.documentElement.scrollHeight);await pg.screenshot({path:`${OUT}/${name}.png`,fullPage:true,clip:{x:0,y:Math.max(0,y-8),width:390,height:Math.min(h,H-Math.max(0,y-8))}})};
 // hide the floating bottom bar for full-page shots except where it is the point
 const bar=on=>ev(v=>{document.getElementById('tabs').style.display=v?'':'none'},on);
 await pg.goto(url+'#ap/report');await pg.waitForTimeout(1500);
 await ev(()=>show("home"));await pg.waitForTimeout(500);await shot('home',null,844);
 await bar(false);
 // step 1: the problem in your own words
 await ev(()=>{show("report");wGo(1);const x=EXAMPLE;setForm(x);wGo(1)});await shot('step1','#f-report',470);
 // step 3: how serious
 await ev(()=>{secConfirm("water");document.getElementById("u-high").checked=true;wGo(3)});await shot('step3','#f-report',560);
 // result: the 4 key points
 await ev(()=>{renderResult(readForm());const c=document.querySelector('#r-result .mfact');if(c)c.remove()});
 await shot('result','#r-result',1500);
 // every report public (example reports)
 await ev(()=>{const d=["2026-10-03","2026-10-08","2026-10-12","2026-10-17","2026-10-21","2026-10-24"];sharedReports=DEMO.map((x,i)=>({...x,id:"d"+i,state:"ap",place:L(x.place),title:L(x.title),desc:L(x.desc),created:d[i%d.length]+"T10:00:00Z",mandal:mandalIn(x.district,x.place[0])}));sharedLoaded=true;sharedError=false;show("all");renderAll();const m=document.getElementById('a-mfact');if(m)m.innerHTML=""});
 await shot('all','#v-all',2000);
 // promised vs delivered: Polavaram (Eluru)
 await ev(()=>{show("history");const f=document.querySelector('#hi-dist details.fold');f.open=true;const d=document.querySelector('#hi-dist-body details[data-d="Eluru"]');d.open=true;document.querySelectorAll('.dvhow').forEach(x=>x.remove())});
 await shot('project','#hi-dist-body details[data-d="Eluru"] .dproj',1100);
 await ev(()=>{show("money");showMSec("ov")});await shot('money','#v-money',2000);
 await ev(()=>{show("rights");document.getElementById('rk-score').style.display='none'});await shot('rights','#v-rights',1400);
 await b.close();fs.unlinkSync(path.join(__dirname,'../../app/src/main/assets/_promo.html'));console.log('shots ok')})();
