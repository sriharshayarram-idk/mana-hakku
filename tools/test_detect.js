// Runs the app's own category detector against tools/detect_cases.json. Fails if accuracy drops below the target.
const fs=require("fs"),path=require("path");
const html=fs.readFileSync(path.join(__dirname,"..","app","src","main","assets","index.html"),"utf8");
const a=html.indexOf("const S={"),b=html.indexOf("const SKEYS=Object.keys(S);"),c=html.indexOf("const kwScore="),d=html.indexOf("let subPick=null;");
if(a<0||b<0||c<0||d<0)throw new Error("detector code not found");
const e=html.indexOf("function autoFix("),f=html.indexOf("let keepChoice=null;");
const code=html.slice(a,b+"const SKEYS=Object.keys(S);".length)+"\n"+html.slice(c,d)+"\n"+html.slice(e,f)+"\nmodule.exports={detect,detectSub,autoFix,S};";
const m={exports:{}};new Function("module","exports",code)(m,m.exports);
const {detect,detectSub,autoFix}=m.exports;
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,"detect_cases.json"),"utf8"));
let ok=0,popup=0,wrongSure=0;const bad=[];
for(const [text,sec,sub] of cases){const r=detect(text);const k=r.key;const sb=k?detectSub(k,text):null;
 // the app asks with a pop-up when the area is unclear, or when the area has sub-problems and the sub-problem is unclear
 const asks=!r.confident||(!!sub&&k===sec&&!sb);
 const right=k===sec&&(!sub||sb===sub);if(right&&!asks)ok++;
 if(asks)popup++;else if(!right)wrongSure++;
 if(!right)bad.push(`${r.confident?"SURE ":"popup"} got ${k}/${sb}  want ${sec}/${sub||"-"}  | ${text}`)}
const pct=Math.round((ok+popup)/cases.length*100);
console.log(`Right automatically ${ok}/${cases.length} · asked with pop-up ${popup} · wrong without asking ${wrongSure} · right-or-asked ${pct}%`);bad.forEach(x=>console.log("  "+x));
if(ok/cases.length<0.85||wrongSure>1){console.error("Detection below target (need 85% right automatically and at most 1 mistake without asking)");process.exit(1)}

// Auto-correction of a wrongly chosen area: [text, chosen area, expected area after correction]
const fixes=JSON.parse(fs.readFileSync(path.join(__dirname,"fix_cases.json"),"utf8"));let fok=0;const fbad=[];
for(const [text,chosen,want] of fixes){const r=autoFix(text,chosen);if(r.sector===want)fok++;else fbad.push(`got ${r.sector} want ${want} (chosen ${chosen}) | ${text}`)}
console.log(`Auto-correction ${fok}/${fixes.length}`);fbad.forEach(x=>console.log("  "+x));
if(fok<fixes.length){console.error("Auto-correction made a wrong move or missed a clear one");process.exit(1)}
