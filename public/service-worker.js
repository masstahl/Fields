const CACHE='field-headings-static-v20261005-0600';
const STATIC=['/manifest.webmanifest?v=20261005-0600','/icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  if(u.pathname.startsWith('/api/')){e.respondWith(fetch(e.request).catch(()=>new Response(JSON.stringify({error:'Offline — reconnect and retry.'}),{status:503,headers:{'content-type':'application/json'}})));return}
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('/index.html')));return}
  e.respondWith(fetch(e.request).then(r=>{if(r.ok&&['script','style','image','font'].includes(e.request.destination)){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{})}return r}).catch(()=>caches.match(e.request)));
});