const CACHE='field-headings-static-v20261008-1';
const STATIC=[];
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 for(const url of STATIC){try{await cache.add(url)}catch{}}
 await self.skipWaiting();
})())});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate')return;
 const request=event.request,url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(request.method!=='GET')return;
 if(url.pathname==='/api/fields'&&!url.search){
   event.respondWith((async()=>{
     try{
       const response=await fetch(request,{cache:'no-store'});
       if(response.ok){try{await caches.open(CACHE).then(cache=>cache.put('/api/fields',response.clone()))}catch{}}
       return response;
     }catch{
       const cached=await caches.open(CACHE).then(cache=>cache.match('/api/fields'));
       return cached||new Response(JSON.stringify({error:'No saved field list is available offline. Connect once to download fields.'}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
     }
   })());
   return;
 }
 if(url.pathname.startsWith('/api/')){
   event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>new Response(JSON.stringify({error:'Offline — reconnect and retry.'}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})));
   return;
 }
 event.respondWith(fetch(request).then(response=>{
   if(response.ok&&['script','style','image','font'].includes(request.destination)){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy)).catch(()=>{})}
   return response;
 }).catch(()=>caches.match(request)));
});
