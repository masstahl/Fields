const APP_BUILD = "variety-delete-verified-preview-2026-10-09";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-app-build": APP_BUILD } });
const num = (v) => (v === null || v === "" || v === undefined || Number.isNaN(+v)) ? null : +v;
const nameKey = value => String(value ?? "").trim().toLowerCase();

async function getCurrentGrowerAssignments(db) {
  const rows = (await db.prepare("SELECT id,action,detail FROM activity WHERE action IN ('planting created','planting edited','grower renamed') ORDER BY id").all()).results;
  const assignments = new Map();
  for (const row of rows) {
    const detail = String(row.detail || "");
    if (row.action === "grower renamed" && detail.startsWith("grower rename:")) {
      try {
        const v = JSON.parse(detail.slice(14));
        for (const [id, name] of assignments) {
          if (nameKey(name) === nameKey(v.from)) assignments.set(id, String(v.to || "").trim());
        }
      } catch {}
      continue;
    }
    const idMatch = detail.match(/planting_id:(\d+)/);
    const growerMatch = detail.match(/(?:^|\s)grower=(.*?)(?:\s+contributors:|$)/);
    if (idMatch && growerMatch) assignments.set(Number(idMatch[1]), growerMatch[1].trim());
  }
  return assignments;
}

async function getGrowers(db) {
  const active = new Map();
  const rows = (await db.prepare("SELECT id,action,detail FROM activity WHERE action IN ('grower added','grower renamed','grower deleted','planting created','planting edited') ORDER BY id").all()).results;
  for (const row of rows) {
    const detail = String(row.detail || "");
    try {
      if (detail.startsWith("grower:")) {
        const value = JSON.parse(detail.slice(7));
        const name = String(value?.name || "").trim();
        if (!name) continue;
        if (row.action === "grower deleted") active.delete(nameKey(name));
        else active.set(nameKey(name), name);
      } else if (detail.startsWith("grower rename:")) {
        const value = JSON.parse(detail.slice(14));
        if (value?.from) active.delete(nameKey(value.from));
        if (value?.to) active.set(nameKey(value.to), String(value.to).trim());
      } else if (detail.includes(" grower=")) {
        const match = detail.match(/(?:^|\s)grower=(.*?)(?:\s+contributors:|$)/);
        const name = String(match?.[1] || "").trim();
        if (name) active.set(nameKey(name), name);
      }
    } catch {}
  }
  return [...active.values()].filter(Boolean).sort((a, b) => a.localeCompare(b)).map(name => ({ name }));
}

async function getVarieties(db) {
  const rows = (await db.prepare("SELECT DISTINCT variety FROM planting_records WHERE variety IS NOT NULL AND TRIM(variety)<>''").all()).results;
  const active = new Map(rows.map(row => {
    const name = String(row.variety || "").trim();
    return [nameKey(name), name];
  }).filter(([key, name]) => key && name));
  const events = (await db.prepare("SELECT id,action,detail FROM activity WHERE action IN ('variety added','variety renamed','variety deleted') ORDER BY id ASC").all()).results;
  for (const event of events) {
    try {
      const detail = String(event.detail || "");
      if ((event.action === "variety added" || event.action === "variety deleted") && detail.startsWith("variety:")) {
        const value = JSON.parse(detail.slice(8));
        const name = String(value?.name || "").trim();
        if (!name) continue;
        if (event.action === "variety deleted") active.delete(nameKey(name));
        else active.set(nameKey(name), name);
      } else if (event.action === "variety renamed" && detail.startsWith("variety rename:")) {
        const value = JSON.parse(detail.slice(15));
        if (value?.from) active.delete(nameKey(value.from));
        if (value?.to) active.set(nameKey(value.to), String(value.to).trim());
      }
    } catch {}
  }
  const names = [...active.values()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return Promise.all(names.map(async name => {
    const row = await db.prepare("SELECT COUNT(*) AS count FROM planting_records WHERE LOWER(TRIM(variety))=LOWER(?)").bind(name).first();
    return { name, used: Number(row?.count || 0) };
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/fix.js" || url.pathname === "/" || url.pathname === "/index.html") {
      const asset = await env.ASSETS.fetch(request);
      if (!asset.ok) return asset;
      let source = await asset.text();
      if (url.pathname === "/fix.js") {
        source = "\n(function(){\n  const APP_VERSION='2026.10.05.0900';\n  const bar=m=>{let b=document.getElementById('dbg');if(!b){b=document.createElement('div');b.id='dbg';b.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#9a514b;color:#fff;padding:10px 12px;border-radius:10px;font:12px system-ui;white-space:pre-wrap';document.body.appendChild(b)}b.textContent=m};\n  addEventListener('error',e=>bar('Page error: '+e.message));\n  addEventListener('unhandledrejection',e=>bar('Request error: '+((e.reason&&e.reason.message)||e.reason)));\n  // The Worker recovery endpoint unregisters stale service workers. Keep new installs unregistered.\n  setTimeout(async()=>{const stuck=typeof load!=='function'||document.getElementById('count').textContent.indexOf('Loading fields')===0;if(!stuck)return;try{const h=await(await fetch('/?x='+Date.now(),{cache:'no-store'})).text();const m=[...h.matchAll(/<script>([\s\\S]*?)<\\/script>/g)].pop();try{new Function(m[1]);bar('Main script is valid but did not start. Send me a screenshot of this page.')}catch(e){bar('Main script error: '+e.message)}}catch(e){bar('Could not re-read the page: '+e.message)}},3000);\n  window.load=async function(){const q=$('#q').value.trim();try{const data=await api(q?'fields?q='+encodeURIComponent(q):'fields');if(!Array.isArray(data))throw new Error('Bad data from server');fields=data;$('#count').textContent=q?data.length+(data.length===100?'+':'')+' matching fields':data.length+' fields available';$('#dot').classList.remove('bad');$('#statusText').textContent='Database connected';render()}catch(e){$('#count').textContent='Unable to load fields';$('#dot').classList.add('bad');$('#statusText').textContent='Connection error';if(!fields.length){$('#out').innerHTML='<div class=\"empty\"><strong>Could not load the field database</strong><div style=\"margin-top:8px\">'+esc(e.message)+'</div><div style=\"margin-top:16px\"><button class=\"action primary\" id=\"retryLoad\">Retry</button></div></div>';$('#retryLoad').onclick=load}}};\n  const hdr=()=>({'content-type':'application/json','x-user':encodeURIComponent(user)});if(!sessionStorage.getItem('opened')){if(!user){const n=prompt('Your name (used only for the activity log):','');user=(n||'Guest').trim()||'Guest';localStorage.setItem('fieldUser',user);$('#who').textContent=user+' � field reference'}fetch('/api/open',{method:'POST',headers:hdr(),body:'{\"event\":\"open\"}'}).catch(()=>{});sessionStorage.setItem('opened','1')}addEventListener('appinstalled',()=>fetch('/api/open',{method:'POST',headers:hdr(),body:'{\"event\":\"installed\"}'}).catch(()=>{}));\n})();";
      }
      const headers = new Headers(asset.headers);
      headers.delete("content-length");
      headers.delete("etag");
      headers.set("cache-control", "no-store");
      return new Response(source, { status: asset.status, statusText: asset.statusText, headers });
    }
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    return handle(request, env, ...url.pathname.slice(5).split("/").filter(Boolean));
  }
};

async function handle(request, env, a, b) {
  const db = env.DB || env["field-headings"];
  if (!db) return json({ error: "Database binding is not configured" }, 500);
  const m = request.method;

  if (a === "diagnostics" && m === "GET") {
    const r = await db.prepare("SELECT COUNT(*) AS count FROM activity WHERE action='variety deleted'").first();
    return json({ build: APP_BUILD, dbBinding: env.DB ? "DB" : "field-headings", deleteEventCount: Number(r?.count || 0), varietyCount: (await getVarieties(db)).length });
  }

  if (a === "health" && m === "GET") {
    try {
      const r = await db.prepare("SELECT COUNT(*) AS count FROM fields").first();
      return json({ ok: true, fields: r?.count ?? 0 });
    } catch (e) {
      return json({ ok: false, error: e?.message || "Database health check failed" }, 500);
    }
  }

  let who = "unknown";
  try { who = decodeURIComponent(request.headers.get("x-user") || "unknown").slice(0, 40); } catch {}
  const log = async (action, detail) => {
    await db.prepare("INSERT INTO activity(user,action,detail) VALUES(?,?,?)").bind(who, action, detail).run();
  };

  try {
    if (a === "growers" && m === "GET") return json(await getGrowers(db));
    if (a === "growers" && m === "POST") {
      const p=await request.json();const name=String(p.name||"").trim();
      if(!name)return json({error:"Grower name is required"},400);
      const growers=await getGrowers(db);
      if(growers.some(g=>nameKey(g.name)===nameKey(name)))return json({name,existing:true,growers});
      await log("grower added","grower:"+JSON.stringify({name}));
      return json({name,existing:false,growers:await getGrowers(db)});
    }
    if (a === "growers" && b === "rename" && m === "POST") {
      const p=await request.json();const from=String(p.from||"").trim(),to=String(p.to||"").trim();
      if(!from||!to)return json({error:"Current and new grower names are required"},400);
      if(from===to)return json({name:to,growers:await getGrowers(db)});
      const growers=await getGrowers(db);
      if(!growers.some(g=>nameKey(g.name)===nameKey(from)))return json({error:"Grower not found"},404);
      if(growers.some(g=>nameKey(g.name)===nameKey(to)))return json({error:"That grower name already exists"},409);
      await db.prepare("INSERT INTO activity(user,action,detail) VALUES(?,?,?)").bind(who,"grower renamed","grower rename:"+JSON.stringify({from,to})).run();
      return json({name:to,growers:await getGrowers(db)});
    }
    if (a === "growers" && b === "delete" && m === "POST") {
      const p=await request.json();const name=String(p.name||"").trim();
      if(!name)return json({error:"Grower name is required"},400);
      const growers=await getGrowers(db);
      const grower=growers.find(value=>nameKey(value.name)===nameKey(name));
      if(!grower)return json({error:"Grower not found"},404);
      const assignments = await getCurrentGrowerAssignments(db);
      const plantingIds = new Set((await db.prepare("SELECT id FROM planting_records").all()).results.map(row => Number(row.id)));
      const usedCount = [...assignments].filter(([id, value]) => plantingIds.has(id) && nameKey(value) === nameKey(grower.name)).length;
      if (usedCount) return json({ error: "Used by " + usedCount + " planting records", count: usedCount }, 409);
      await db.prepare("INSERT INTO activity(user,action,detail) VALUES(?,?,?)").bind(who,"grower deleted","grower:"+JSON.stringify({name:grower.name})).run();
      return json({ok:true,growers:await getGrowers(db)});
    }
    if (a === "varieties" && m === "GET") return json(await getVarieties(db));
    if (a === "varieties" && m === "POST") {
      const p=await request.json(); const name=String(p.name||"").trim();
      if(!name)return json({error:"Variety name is required"},400);
      const varieties=await getVarieties(db);
      if(varieties.some(v=>nameKey(v.name)===nameKey(name)))return json({name,existing:true,varieties});
      await log("variety added","variety:"+JSON.stringify({name}));
      return json({name,existing:false,varieties:await getVarieties(db)});
    }
    if (a === "varieties" && b === "rename" && m === "POST") {
      const p=await request.json(); const from=String(p.from||"").trim(); const to=String(p.to||"").trim();
      if(!from||!to)return json({error:"Current and new variety names are required"},400);
      if(from===to)return json({name:to,varieties:await getVarieties(db)});
      const varieties=await getVarieties(db);
      if(!varieties.some(v=>nameKey(v.name)===nameKey(from)))return json({error:"Variety not found"},404);
      if(varieties.some(v=>nameKey(v.name)===nameKey(to)))return json({error:"That variety name already exists"},409);
      await db.batch([
        db.prepare("UPDATE planting_records SET variety=? WHERE variety=?").bind(to,from),
        db.prepare("INSERT INTO activity(user,action,detail) VALUES(?,?,?)").bind(who,"variety renamed","variety rename:"+JSON.stringify({from,to}))
      ]);
      return json({name:to,varieties:await getVarieties(db)});
    }
    if (a === "varieties" && b === "delete" && m === "POST") {
      const p=await request.json(); const name=String(p.name||"").trim();
      if(!name)return json({error:"Variety name is required"},400);
      const varieties = await getVarieties(db);
      const variety = varieties.find(value => nameKey(value.name) === nameKey(name));
      if (!variety) return json({ error: "Variety not found" }, 404);
      const usedCount = Number((await db.prepare("SELECT COUNT(*) AS count FROM planting_records WHERE LOWER(TRIM(variety))=LOWER(?)").bind(name).first())?.count || 0);
      if (usedCount) return json({ error: "Used by " + usedCount + " planting records", count: usedCount }, 409);
      await db.prepare("INSERT INTO activity(user,action,detail) VALUES(?,?,?)")
        .bind(who, "variety deleted", "variety:" + JSON.stringify({ name: variety.name })).run();
      const event = await db.prepare("SELECT id FROM activity WHERE action='variety deleted' AND detail=? ORDER BY id DESC LIMIT 1")
        .bind("variety:" + JSON.stringify({ name: variety.name })).first();
      const updatedVarieties = await getVarieties(db);
      const stillListed = updatedVarieties.some(value => nameKey(value.name) === nameKey(variety.name));
      if (!event || stillListed) {
        return json({ error: "Deletion verification failed", diagnostic: { build: APP_BUILD, eventPersisted: !!event, stillListed, deleteEventCount: Number((await db.prepare("SELECT COUNT(*) AS count FROM activity WHERE action='variety deleted'").first())?.count || 0) } }, 500);
      }
      return json({ ok: true, name: variety.name, varieties: updatedVarieties, diagnostic: { build: APP_BUILD, eventPersisted: true, stillListed: false } });
    }

    if (a === "planting-records" && m === "POST") {
      const p = await request.json();
      const fieldId = Number.isInteger(+p.field_id) ? +p.field_id : null;
      const plantingDate = String(p.planting_date || "").trim();
      if (!fieldId || !plantingDate) return json({ error: "An existing field and planting date are required" }, 400);
      const field = await db.prepare("SELECT id,name,heading,lat,lng FROM fields WHERE id=?").bind(fieldId).first();
      if (!field) return json({ error: "Selected field does not exist" }, 400);
      const fieldName = String(field.name || "").trim();
      const heading = String(field.heading || "").trim();
      const latitude = num(p.latitude) ?? field.lat ?? null;
      const longitude = num(p.longitude) ?? field.lng ?? null;
      const variety = String(p.variety || "").trim();
      const grower = String(p.grower || "").trim();
      const notes = String(p.notes || "").trim();
      if(grower && !(await getGrowers(db)).some(g=>g.name===grower))return json({error:"Select an existing grower or add the grower first"},400);
      if (variety) {
        const varieties = await getVarieties(db);
        if (!varieties.some(v => v.name === variety)) return json({ error: "Select an existing variety or add the new variety first" }, 400);
      }

      const existing = await db.prepare(
        "SELECT * FROM planting_records WHERE field_name=? AND planting_date=? ORDER BY id DESC LIMIT 1"
      ).bind(fieldName, plantingDate).first();

      if (existing) {
        const mergedNotes = existing.notes && notes
          ? (String(existing.notes).includes(notes) ? String(existing.notes) : String(existing.notes) + "\n" + notes)
          : (notes || existing.notes || null);

        await db.prepare(
          "UPDATE planting_records SET field_id=?,field_name=?,heading=?,latitude=?,longitude=?,planting_date=?,variety=?,notes=? WHERE id=?"
        ).bind(fieldId, fieldName, heading, latitude, longitude, plantingDate, variety || null, mergedNotes, existing.id).run();

        await log("planting edited", `planting_id:${existing.id} merged duplicate grower=${grower}`);
        return json({ id: existing.id, merged: true });
      }

      const r = await db.prepare(
        "INSERT INTO planting_records(field_id,field_name,heading,latitude,longitude,planting_date,variety,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)"
      ).bind(fieldId, fieldName, heading, latitude, longitude, plantingDate, variety || null, notes || null, who).run();

      await log("planting created", `planting_id:${r.meta.last_row_id} grower=${grower}`);
      return json({ id: r.meta.last_row_id, merged: false });
    }

    if (a === "planting-records" && b && m === "PUT") {
      const id = Number(b);
      if (!Number.isInteger(id)) return json({ error: "Invalid planting record" }, 400);

      const existing = await db.prepare("SELECT * FROM planting_records WHERE id=?").bind(id).first();
      if (!existing) return json({ error: "Planting record not found" }, 404);

      const p = await request.json();
      const fieldId = Number.isInteger(+p.field_id) ? +p.field_id : null;
      const plantingDate = String(p.planting_date || "").trim();
      if (!fieldId || !plantingDate) return json({ error: "An existing field and planting date are required" }, 400);
      const field = await db.prepare("SELECT id,name,heading,lat,lng FROM fields WHERE id=?").bind(fieldId).first();
      if (!field) return json({ error: "Selected field does not exist" }, 400);
      const fieldName = String(field.name || "").trim();
      const heading = String(field.heading || "").trim();
      const latitude = num(p.latitude) ?? field.lat ?? null;
      const longitude = num(p.longitude) ?? field.lng ?? null;
      const variety = String(p.variety || "").trim();
      const grower = String(p.grower || "").trim();
      const notes = String(p.notes || "").trim();
      if(grower && !(await getGrowers(db)).some(g=>g.name===grower))return json({error:"Select an existing grower or add the grower first"},400);
      if (variety) {
        const varieties = await getVarieties(db);
        if (!varieties.some(v => v.name === variety)) return json({ error: "Select an existing variety or add the new variety first" }, 400);
      }

      const duplicate = await db.prepare(
        "SELECT * FROM planting_records WHERE field_name=? AND planting_date=? AND id<>? ORDER BY id DESC LIMIT 1"
      ).bind(fieldName, plantingDate, id).first();

      if (duplicate) {
        const mergedNotes = duplicate.notes && notes
          ? (String(duplicate.notes).includes(notes) ? String(duplicate.notes) : String(duplicate.notes) + "\n" + notes)
          : (notes || duplicate.notes || null);

        const priorEvents = (await db.prepare(
          "SELECT user,detail FROM activity WHERE action IN ('planting created','planting edited') ORDER BY id"
        ).all()).results.filter(x => new RegExp(`(^|\s)planting_id:${id}(\s|$)`).test(String(x.detail || "")));
        const priorContributors = [...new Set(priorEvents.map(x => x.user).filter(Boolean))];

        await db.prepare(
          "UPDATE planting_records SET field_id=?,field_name=?,heading=?,latitude=?,longitude=?,planting_date=?,variety=?,notes=? WHERE id=?"
        ).bind(fieldId, fieldName, heading, latitude, longitude, plantingDate, variety || null, mergedNotes, duplicate.id).run();
        await db.prepare("DELETE FROM planting_records WHERE id=?").bind(id).run();

        const contributorDetail = priorContributors.length
          ? ` contributors:${priorContributors.join("|")}`
          : "";
        await log("planting edited", `planting_id:${duplicate.id} merged duplicate grower=${grower}${contributorDetail}`);
        return json({ id: duplicate.id, merged: true });
      }

      await db.prepare(
        "UPDATE planting_records SET field_id=?,field_name=?,heading=?,latitude=?,longitude=?,planting_date=?,variety=?,notes=? WHERE id=?"
      ).bind(fieldId, fieldName, heading, latitude, longitude, plantingDate, variety || null, notes || null, id).run();

      await log("planting edited", `planting_id:${id} grower=${grower}`);
      return json({ id, merged: false });
    }

    if (a === "planting-records" && b && m === "DELETE") {
      const id = Number(b);
      if (!Number.isInteger(id)) return json({ error: "Invalid planting record" }, 400);
      const existing = await db.prepare("SELECT * FROM planting_records WHERE id=?").bind(id).first();
      if (!existing) return json({ error: "Planting record not found" }, 404);
      await db.prepare("DELETE FROM planting_records WHERE id=?").bind(id).run();
      await log("planting deleted", `planting_id:${id} field:${existing.field_name} date:${existing.planting_date}`);
      return json({ ok: true });
    }

    if (a === "planting-records" && m === "GET") {
      const rows = (await db.prepare(
        "SELECT id,field_id,field_name,heading,latitude,longitude,planting_date,variety,notes,created_by,created_at FROM planting_records ORDER BY id"
      ).all()).results;

      const history = (await db.prepare(
        "SELECT id,at,user,action,detail FROM activity WHERE action IN ('planting created','planting edited') ORDER BY id"
      ).all()).results;

      const growerByRecord = await getCurrentGrowerAssignments(db);
      const byRecord = new Map();
      for (const item of history) {
        const match = String(item.detail || "").match(/planting_id:(\d+)/);
        if (!match) continue;
        const id = Number(match[1]);
        if (!byRecord.has(id)) byRecord.set(id, []);
        byRecord.get(id).push(item);
      }

      return json(rows.map(row => {
        const events = byRecord.get(row.id) || [];
        const carriedContributors = events.flatMap(x => {
          const match = String(x.detail || "").match(/contributors:(.*)$/);
          return match ? match[1].split("|") : [];
        });
        const contributors = [...new Set([row.created_by, ...events.map(x => x.user), ...carriedContributors].filter(Boolean))];
        const last = events.length ? events[events.length - 1] : null;
        return {
          ...row,
          grower: growerByRecord.get(row.id) || "",
          last_modified_by: last?.user || row.created_by || "",
          contributors,
          history: events.map(x => ({at:x.at,user:x.user,action:x.action,detail:x.detail}))
        };
      }));
    }

    if (a === "planting-records" && b === "export" && m === "GET") {
      const rows = (await db.prepare(
        "SELECT id,field_id,field_name,heading,latitude,longitude,planting_date,variety,notes,created_by,created_at FROM planting_records ORDER BY id"
      ).all()).results;

      const merged = new Map();
      for (const row of rows) {
        const key = String(row.field_name) + "\u0000" + String(row.planting_date);
        if (!merged.has(key)) {
          merged.set(key, {...row});
          continue;
        }
        const current = merged.get(key);
        current.heading = row.heading;
        current.latitude = row.latitude;
        current.longitude = row.longitude;
        current.variety = row.variety;
        current.notes = current.notes && row.notes
          ? (String(current.notes).includes(String(row.notes)) ? current.notes : String(current.notes) + "\n" + row.notes)
          : (row.notes || current.notes || null);
        current.created_by = current.created_by || row.created_by;
      }

      const cols = ["Field", "Date", "Latitude", "Longitude", "Heading", "Variety", "Notes"];
      const excelDate = value => {
        const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? `${Number(match[2])}/${Number(match[3])}/${match[1].slice(-2)}` : value;
      };
      const exportRows = [...merged.values()].map(row => [
        row.field_name, excelDate(row.planting_date), row.latitude, row.longitude,
        row.heading, row.variety, row.notes
      ]);
      const cell = v => {
        const value = String(v ?? "");
        return /[\",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
      };
      const csv = [cols, ...exportRows].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
      return new Response(csv, {status:200,headers:{
        "content-type":"text/csv; charset=utf-8",
        "content-disposition":'attachment; filename="planting-records.csv"',
        "cache-control":"no-store"
      }});
    }

    if (a === "planting-records" && b === "archive" && m === "POST") {
      if (!env.ADMIN_KEY || request.headers.get("x-admin") !== env.ADMIN_KEY) return json({ error: "denied" }, 403);
      const r = await db.prepare("DELETE FROM planting_records").run();
      await log("archive season", `${r.meta?.changes ?? 0} planting records archived`);
      return json({ ok:true, removed:r.meta?.changes ?? 0 });
    }

    if (a === "fields" && m === "GET") {
      const q = new URL(request.url).searchParams.get("q")?.trim() || "";
      if (!q) return json((await db.prepare("SELECT * FROM fields ORDER BY name").all()).results);
      const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
      return json((await db.prepare("SELECT * FROM fields WHERE name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 100").bind(like).all()).results);
    }
    if (a === "fields" && m === "POST") {
      const f = await request.json();
      if (!f.name?.trim() || !f.heading?.trim()) return json({ error: "Field name and heading are required" }, 400);
      const r = await db.prepare("INSERT INTO fields(name,heading,planted,lat,lng,updated_by) VALUES(?,?,?,?,?,?)")
        .bind(f.name.trim(), f.heading.trim(), f.planted || null, num(f.lat), num(f.lng), who).run();
      await log("added", `${f.name.trim()} (heading ${f.heading.trim()})`);
      return json({ id: r.meta.last_row_id });
    }
    if (a === "fields" && b && m === "PUT") {
      const old = await db.prepare("SELECT * FROM fields WHERE id=?").bind(b).first();
      if (!old) return json({ error: "Field not found" }, 404);
      const f = await request.json();
      f.lat = num(f.lat); f.lng = num(f.lng); f.planted = f.planted || null;
      await db.prepare("UPDATE fields SET name=?,heading=?,planted=?,lat=?,lng=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(f.name.trim(), f.heading.trim(), f.planted, f.lat, f.lng, who, b).run();
      const ch = ["name", "heading", "planted", "lat", "lng"]
        .filter((k) => String(old[k] ?? "") !== String(f[k] ?? ""))
        .map((k) => `${k}: ${old[k] ?? "—"} → ${f[k] ?? "—"}`);
      await log("edited", `${old.name} (${ch.join("; ") || "no change"})`);
      return json({ ok: true });
    }
    if (a === "fields" && b && m === "DELETE") {
      const old = await db.prepare("SELECT * FROM fields WHERE id=?").bind(b).first();
      if (old) {
        await db.prepare("DELETE FROM fields WHERE id=?").bind(b).run();
        await log("deleted", `${old.name} (heading ${old.heading})`);
      }
      return json({ ok: true });
    }
    if (a === "open" && m === "POST") {
      const body = await request.json();
      await log(body.event === "installed" ? "installed app" : "opened app", "");
      return json({ ok: true });
    }
    if (a === "log" && m === "GET") {
      if (!env.ADMIN_KEY || request.headers.get("x-admin") !== env.ADMIN_KEY) return json({ error: "denied" }, 403);
      return json((await db.prepare("SELECT * FROM activity ORDER BY id DESC LIMIT 200").all()).results);
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: e?.message || "Database request failed" }, 500);
  }
}
