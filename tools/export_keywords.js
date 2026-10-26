// Publishes the app's category keywords so the register script corrects categories with exactly the same rules.
const fs=require("fs"),path=require("path");
const html=fs.readFileSync(path.join(__dirname,"..","app","src","main","assets","index.html"),"utf8");
const a=html.indexOf("const S={"),b=html.indexOf("const SKEYS=Object.keys(S);");
const m={exports:{}};new Function("module",html.slice(a,b+27)+"\nmodule.exports=S;")(m);
const out={v:1,generated:new Date().toISOString().slice(0,10),sectors:{}};
for(const [k,s] of Object.entries(m.exports)){out.sectors[k]={kw:s.kw,subs:s.subs?Object.fromEntries(Object.entries(s.subs).map(([sk,sv])=>[sk,sv.kw])):null}}
const dest=process.argv[2]||path.join(__dirname,"..","web","data","keywords.json");
fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out));
console.log("keywords:",Object.keys(out.sectors).length,"areas ->",dest);
