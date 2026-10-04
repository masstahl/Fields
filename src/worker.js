const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const num=v=>(v===null||v===''||v===undefined||Number.isNaN(+v))?null:+v;
export default{async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/')){
    if(url.pathname==='/manifest.webmanifest')return new Response("{\n  \"name\":\"Field Headings\",\n  \"short_name\":\"Headings\",\n  \"start_url\":\"/\",\n  \"scope\":\"/\",\n  \"display\":\"standalone\",\n  \"background_color\":\"#ecece7\",\n  \"theme_color\":\"#242522\",\n  \"icons\":[{\"src\":\"/icon.svg\",\"sizes\":\"any\",\"type\":\"image/svg+xml\",\"purpose\":\"any maskable\"}]\n}",{headers:{'content-type':'application/manifest+json','cache-control':'no-cache'}});
    if(url.pathname==='/icon.svg')return new Response("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" rx=\"22\" fill=\"#242522\"/><path d=\"M27 67 66 28l9 9-39 39H27v-9Z\" fill=\"none\" stroke=\"#f4f4f0\" stroke-width=\"7\" stroke-linejoin=\"round\"/><path d=\"m53 37 10 10M38 52l10 10\" stroke=\"#bcbdb6\" stroke-width=\"5\" stroke-linecap=\"round\"/></svg>",{headers:{'content-type':'image/svg+xml','cache-control':'no-cache'}});
    return env.ASSETS.fetch(request);
  }
  return handle(request,env,...url.pathname.slice(5).split('/').filter(Boolean));
}};
async function handle(request,env,a,b){
  const db=env.DB||env['field-headings'];
  if(!db)return json({error:'Database binding is not configured'},500);
  const m=request.method;
  let who='unknown';try{who=decodeURIComponent(request.headers.get('x-user')||'unknown').slice(0,40)}catch{}
  const log=async(action,detail)=>{await db.prepare('INSERT INTO activity(user,action,detail) VALUES(?,?,?)').bind(who,action,detail).run()};
  try{
    if(a==='health'&&m==='GET'){const r=await db.prepare('SELECT COUNT(*) AS count FROM fields').first();return json({ok:true,fields:r?.count??0})}
    if(a==='fields'&&m==='GET'){
      const q=new URL(request.url).searchParams.get('q')?.trim()||'';
      if(!q)return json((await db.prepare('SELECT * FROM fields ORDER BY name').all()).results);
      const like='%'+q.replace(/[%_]/g,'$&')+'%';
      return json((await db.prepare("SELECT * FROM fields WHERE name LIKE ? OR heading LIKE ? ORDER BY name LIMIT 100").bind(like,like).all()).results);
    }
    if(a==='fields'&&m==='POST'){
      const f=await request.json();if(!f.name?.trim()||!f.heading?.trim())return json({error:'Field name and heading are required'},400);
      const r=await db.prepare('INSERT INTO fields(name,heading,planted,lat,lng,updated_by) VALUES(?,?,?,?,?,?)').bind(f.name.trim(),f.heading.trim(),f.planted||null,num(f.lat),num(f.lng),who).run();
      await log('added',`${f.name.trim()} (heading ${f.heading.trim()})`);return json({id:r.meta.last_row_id});
    }
    if(a==='fields'&&b&&m==='PUT'){
      const old=await db.prepare('SELECT * FROM fields WHERE id=?').bind(b).first();if(!old)return json({error:'Field not found'},404);
      const f=await request.json();f.lat=num(f.lat);f.lng=num(f.lng);f.planted=f.planted||null;
      await db.prepare('UPDATE fields SET name=?,heading=?,planted=?,lat=?,lng=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(f.name.trim(),f.heading.trim(),f.planted,f.lat,f.lng,who,b).run();
      const ch=['name','heading','planted','lat','lng'].filter(k=>String(old[k]??'')!==String(f[k]??'')).map(k=>`${k}: ${old[k]??'—'} → ${f[k]??'—'}`);
      await log('edited',`${old.name} (${ch.join('; ')||'no change'})`);return json({ok:true});
    }
    if(a==='fields'&&b&&m==='DELETE'){
      const old=await db.prepare('SELECT * FROM fields WHERE id=?').bind(b).first();
      if(old){await db.prepare('DELETE FROM fields WHERE id=?').bind(b).run();await log('deleted',`${old.name} (heading ${old.heading})`)}
      return json({ok:true});
    }
    if(a==='open'&&m==='POST'){const body=await request.json();await log(body.event==='installed'?'installed app':'opened app','');return json({ok:true})}
    if(a==='log'&&m==='GET'){
      if(env.ADMIN_KEY&&request.headers.get('x-admin')!==env.ADMIN_KEY)return json({error:'denied'},403);
      return json((await db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 200').all()).results);
    }
    return json({error:'Not found'},404);
  }catch(e){return json({error:e?.message||'Database request failed'},500)}
}