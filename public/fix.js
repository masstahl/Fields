(function () {
  // Red banner at the bottom shows any error instead of failing silently
  const bar = m => {
    let b = document.getElementById('dbg');
    if (!b) { b = document.createElement('div'); b.id = 'dbg';
      b.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#9a514b;color:#fff;padding:10px 12px;border-radius:10px;font:12px system-ui;white-space:pre-wrap';
      document.body.appendChild(b); }
    b.textContent = m;
  };
  addEventListener('error', e => bar('Page error: ' + e.message));
  addEventListener('unhandledrejection', e => bar('Request error: ' + ((e.reason && e.reason.message) || e.reason)));

  // If the main script never started, find out why
  setTimeout(async () => {
    const stuck = typeof load !== 'function' || document.getElementById('count').textContent.indexOf('Loading fields') === 0;
    if (!stuck) return;
    try {
      const h = await (await fetch('/?x=' + Date.now(), { cache: 'no-store' })).text();
      const m = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop();
      try { new Function(m[1]); bar('Main script is valid but did not start. Send me a screenshot of this page.'); }
      catch (e) { bar('Main script error: ' + e.message); }
    } catch (e) { bar('Could not re-read the page: ' + e.message); }
  }, 2500);

  // Refresh quietly: no more "Connecting\u2026" wipe every 30 seconds, and keeps your search
  window.load = async function () {
    const q = $('#q').value.trim();
    try {
      const data = await api(q ? 'fields?q=' + encodeURIComponent(q) : 'fields');
      if (!Array.isArray(data)) throw new Error('Bad data from server');
      fields = data;
      $('#count').textContent = q ? data.length + (data.length === 100 ? '+' : '') + ' matching fields' : data.length + ' fields available';
      $('#dot').classList.remove('bad'); $('#statusText').textContent = 'Database connected';
      render();
    } catch (e) {
      $('#count').textContent = 'Unable to load fields';
      $('#dot').classList.add('bad'); $('#statusText').textContent = 'Connection error';
      if (!fields.length) {
        $('#out').innerHTML = '<div class="empty"><strong>Couldn\u2019t load the field database</strong><div style="margin-top:8px">' + esc(e.message) + '</div><div style="margin-top:16px"><button class="action primary" id="retryLoad">Retry</button></div></div>';
        $('#retryLoad').onclick = load;
      }
    }
  };
  window.load();

  // Activity tab: send the admin key (the redesigned page never did)
  window.loadActivity = async function () {
    let key = localStorage.getItem('fieldAdmin') || '';
    const get = () => fetch('/api/log', { cache: 'no-store', headers: { 'x-admin': key, 'x-user': encodeURIComponent(user) } });
    let r = await get();
    if (r.status === 403) { key = prompt('Admin key to view activity:') || ''; if (key) localStorage.setItem('fieldAdmin', key); r = await get(); }
    const data = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(data)) {
      if (r.status === 403) localStorage.removeItem('fieldAdmin');
      $('#activityStatus').textContent = 'Restricted';
      $('#activity').innerHTML = '<div class="empty"><strong>Activity log</strong>' + esc((data && data.error) || 'Admin key needed') + '</div>';
      return;
    }
    $('#activityStatus').textContent = data.length + ' entries';
    $('#activity').innerHTML = data.length ? data.map(x => '<div class="log"><b>' + esc(x.user) + '</b> ' + esc(x.action) + ' ' + esc(x.detail) + '<small>' + new Date(String(x.at).replace(' ', 'T') + 'Z').toLocaleString() + '</small></div>').join('') : '<div class="empty">No activity recorded yet.</div>';
  };

  // Log who opens the app (the redesigned page never did)
  const hdr = () => ({ 'content-type': 'application/json', 'x-user': encodeURIComponent(user) });
  if (!sessionStorage.getItem('opened')) {
    if (!user) { const n = prompt('Your name (so changes are tracked):', ''); user = (n || 'Guest').trim() || 'Guest'; localStorage.setItem('fieldUser', user); $('#who').textContent = user + ' \u00b7 field reference'; }
    fetch('/api/open', { method: 'POST', headers: hdr(), body: '{"event":"open"}' }).catch(() => {});
    sessionStorage.setItem('opened', '1');
  }
  addEventListener('appinstalled', () => fetch('/api/open', { method: 'POST', headers: hdr(), body: '{"event":"installed"}' }).catch(() => {}));
})();
