// Old address: clear the saved offline copy and send open pages to the new address.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())await caches.delete(k);await self.registration.unregister();for(const c of await self.clients.matchAll({type:'window'})){const u=new URL(c.url);c.navigate('https://manahakku-team.github.io/manahakku'+u.pathname.replace(/^\/mana-hakku/i,'')+u.search+u.hash)}})()));
