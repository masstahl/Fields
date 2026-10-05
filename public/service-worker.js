const CACHE='field-headings-static-v20261005-0900';
const STATIC=['/index.html','/manifest.webmanifest?v=20261005-0900','/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(STATIC).catch(()=>{});
 try{
   const response=await fetch('/api/fields',{cache:'no-store'});
   if(response.ok)await cache.put('/api/fields',response);
 }catch{}
 await self.skipWaiting();
})())});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
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
 if(request.mode==='navigate'){
   event.respondWith((async()=>{
     try{
       const response=await fetch(new Request(url.href,{method:'GET',headers:request.headers,cache:'no-store',redirect:'error'}));
       if(response.type==='opaqueredirect'||response.redirected)throw new Error('redirected navigation');
       return response;
     }catch{
       const cached=await caches.match('/index.html',{ignoreSearch:true});
       return cached||new Response('The app is temporarily unavailable. Reconnect to the internet and try again.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
     }
   })());
   return;
 }
 event.respondWith(fetch(request).then(response=>{
   if(response.ok&&['script','style','image','font'].includes(request.destination)){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy)).catch(()=>{})}
   return response;
 }).catch(()=>caches.match(request)));
});