const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const [a, b] = url.pathname.slice(5).split('/').filter(Boolean);
    return handle(request, env, a, b);
  }
};
async function handle(request, env, a, b) {
  const db = env.DB, m = request.method;
  let who = 'unknown';
  try { who = decodeURIComponent(request.headers.get('x-user') || 'unknown').slice(0, 40); } catch (e) {}
  const log = (action, detail) => db.prepare('INSERT INTO activity(user,action,detail) VALUES(?,?,?)').bind(who, action, detail).run();
  const num = v => (v === null || v === '' || v === undefined || isNaN(+v)) ? null : +v;
  if (a === 'fields' && m === 'GET') return J((await db.prepare('SELECT * FROM fields ORDER BY name').all()).results);
  if (a === 'fields' && m === 'POST') {
    const f = await request.json();
    if (!f.name || !f.heading) return J({ error: 'name and heading required' }, 400);
    const r = await db.prepare('INSERT INTO fields(name,heading,planted,lat,lng,updated_by) VALUES(?,?,?,?,?,?)')
      .bind(f.name, f.heading, f.planted || null, num(f.lat), num(f.lng), who).run();
    await log('added', `${f.name} (heading ${f.heading})`);
    return J({ id: r.meta.last_row_id });
  }
  if (a === 'fields' && b && m === 'PUT') {
    const old = await db.prepare('SELECT * FROM fields WHERE id=?').bind(b).first();
    if (!old) return J({ error: 'not found' }, 404);
    const f = await request.json(); f.lat = num(f.lat); f.lng = num(f.lng); f.planted = f.planted || null;
    await db.prepare('UPDATE fields SET name=?,heading=?,planted=?,lat=?,lng=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(f.name, f.heading, f.planted, f.lat, f.lng, who, b).run();
    const ch = ['name', 'heading', 'planted', 'lat', 'lng'].filter(k => String(old[k] ?? '') !== String(f[k] ?? ''))
      .map(k => `${k}: ${old[k] ?? '—'} → ${f[k] ?? '—'}`);
    await log('edited', `${old.name} (${ch.join('; ') || 'no change'})`);
    return J({ ok: 1 });
  }
  if (a === 'fields' && b && m === 'DELETE') {
    const old = await db.prepare('SELECT * FROM fields WHERE id=?').bind(b).first();
    if (old) { await db.prepare('DELETE FROM fields WHERE id=?').bind(b).run(); await log('deleted', `${old.name} (heading ${old.heading})`); }
    return J({ ok: 1 });
  }
  if (a === 'open' && m === 'POST') {
    const { event } = await request.json();
    await log(event === 'installed' ? 'installed app' : 'opened app', '');
    return J({ ok: 1 });
  }
  if (a === 'log' && m === 'GET') {
    if (env.ADMIN_KEY && request.headers.get('x-admin') !== env.ADMIN_KEY) return J({ error: 'denied' }, 403);
    return J((await db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 200').all()).results);
  }
  return J({ error: 'not found' }, 404);
}
