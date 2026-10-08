
(function(){
  const APP_VERSION='2026.10.07.2145';
  const bar=m=>{let b=document.getElementById('dbg');if(!b){b=document.createElement('div');b.id='dbg';b.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#9a514b;color:#fff;padding:10px 12px;border-radius:10px;font:12px system-ui;white-space:pre-wrap';document.body.appendChild(b)}b.textContent=m};
  addEventListener('error',e=>bar('Page error: '+e.message));
  addEventListener('unhandledrejection',e=>bar('Request error: '+((e.reason&&e.reason.message)||e.reason)));
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/service-worker.js?v='+APP_VERSION,{scope:'/',updateViaCache:'none'}).catch(e=>bar('PWA offline service unavailable: '+e.message));
  }
  // The Worker recovery endpoint unregisters stale service workers. Keep new installs unregistered.
  setTimeout(async()=>{const stuck=typeof load!=='function'||document.getElementById('count').textContent.indexOf('Loading fields')===0;if(!stuck)return;try{const h=await(await fetch('/?x='+Date.now(),{cache:'no-store'})).text();const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop();try{new Function(m[1]);bar('Main script is valid but did not start. Send me a screenshot of this page.')}catch(e){bar('Main script error: '+e.message)}}catch(e){bar('Could not re-read the page: '+e.message)}},3000);
  window.load=async function(){const q=$('#q').value.trim();try{const data=await api(q?'fields?q='+encodeURIComponent(q):'fields');if(!Array.isArray(data))throw new Error('Bad data from server');fields=data;$('#count').textContent=q?data.length+(data.length===100?'+':'')+' matching fields':data.length+' fields available';$('#dot').classList.remove('bad');$('#statusText').textContent='Database connected';render()}catch(e){$('#count').textContent='Unable to load fields';$('#dot').classList.add('bad');$('#statusText').textContent='Connection error';if(!fields.length){$('#out').innerHTML='<div class="empty"><strong>Could not load the field database</strong><div style="margin-top:8px">'+esc(e.message)+'</div><div style="margin-top:16px"><button class="action primary" id="retryLoad">Retry</button></div></div>';$('#retryLoad').onclick=load}}};
  const hdr=()=>({'content-type':'application/json','x-user':encodeURIComponent(user)});if(!sessionStorage.getItem('opened')){if(!user){const n=prompt('Your name (used only for the activity log):','');user=(n||'Guest').trim()||'Guest';localStorage.setItem('fieldUser',user);$('#who').textContent=user+' � field reference'}fetch('/api/open',{method:'POST',headers:hdr(),body:'{"event":"open"}'}).catch(()=>{});sessionStorage.setItem('opened','1')}addEventListener('appinstalled',()=>fetch('/api/open',{method:'POST',headers:hdr(),body:'{"event":"installed"}'}).catch(()=>{}));
  load();
})();
