// Mana Hakku offline cache for the website: the page opens instantly on repeat visits and works with a weak or no signal.
// Page and data: try the network first (so updates show at once), fall back to the saved copy. Fonts, photos, PDFs: saved copy first.
const C='mh-v1';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html']).catch(()=>{})))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(u.hostname==='script.google.com'||u.hostname.endsWith('googleusercontent.com'))return;   // the register is always live, never cached
 const stat=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)||/\/(people|pdfjs|docs)\//.test(u.pathname)||/\.(png|jpg|jpeg|webp|svg|woff2?)$/.test(u.pathname);
 if(stat){e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})));return}
 if(u.origin===location.origin){e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))))}});
