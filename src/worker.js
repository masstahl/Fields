const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const num = (v) => (v === null || v === "" || v === undefined || Number.isNaN(+v)) ? null : +v;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/service-worker.js") {
      const script = 'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil((async()=>{await self.clients.claim();await self.registration.unregister();const clients=await self.clients.matchAll({type:"window"});await Promise.all(clients.map(c=>c.navigate(c.url)))})()));';
      return new Response(script, { headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate",
        "service-worker-allowed": "/"
      }});
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
    if (a === "planting-records" && m === "POST") {
      const p = await request.json();
      const fieldName = String(p.field_name || "").trim();
      const heading = String(p.heading || "").trim();
      const plantingDate = String(p.planting_date || "").trim();
      if (!fieldName || !heading || !plantingDate) return json({ error: "Field name, heading and planting date are required" }, 400);

      const fieldId = Number.isInteger(+p.field_id) ? +p.field_id : null;
      const latitude = num(p.latitude);
      const longitude = num(p.longitude);
      const variety = String(p.variety || "").trim();
      const notes = String(p.notes || "").trim();

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

        await log("planting edited", `planting_id:${existing.id} merged duplicate`);
        return json({ id: existing.id, merged: true });
      }

      const r = await db.prepare(
        "INSERT INTO planting_records(field_id,field_name,heading,latitude,longitude,planting_date,variety,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)"
      ).bind(fieldId, fieldName, heading, latitude, longitude, plantingDate, variety || null, notes || null, who).run();

      await log("planting created", `planting_id:${r.meta.last_row_id}`);
      return json({ id: r.meta.last_row_id, merged: false });
    }

    if (a === "planting-records" && b && m === "PUT") {
      const id = Number(b);
      if (!Number.isInteger(id)) return json({ error: "Invalid planting record" }, 400);

      const existing = await db.prepare("SELECT * FROM planting_records WHERE id=?").bind(id).first();
      if (!existing) return json({ error: "Planting record not found" }, 404);

      const p = await request.json();
      const fieldName = String(p.field_name || "").trim();
      const heading = String(p.heading || "").trim();
      const plantingDate = String(p.planting_date || "").trim();
      if (!fieldName || !heading || !plantingDate) return json({ error: "Field name, heading and planting date are required" }, 400);

      const fieldId = Number.isInteger(+p.field_id) ? +p.field_id : null;
      const latitude = num(p.latitude);
      const longitude = num(p.longitude);
      const variety = String(p.variety || "").trim();
      const notes = String(p.notes || "").trim();

      const duplicate = await db.prepare(
        "SELECT * FROM planting_records WHERE field_name=? AND planting_date=? AND id<>? ORDER BY id DESC LIMIT 1"
      ).bind(fieldName, plantingDate, id).first();

      if (duplicate) {
        const mergedNotes = duplicate.notes && notes
          ? (String(duplicate.notes).includes(notes) ? String(duplicate.notes) : String(duplicate.notes) + "\n" + notes)
          : (notes || duplicate.notes || null);

        const priorEvents = (await db.prepare(
          "SELECT user,detail FROM activity WHERE action IN ('planting created','planting edited') ORDER BY id"
        ).all()).results.filter(x => new RegExp(`(^|\\s)planting_id:${id}(\\s|$)`).test(String(x.detail || "")));
        const priorContributors = [...new Set(priorEvents.map(x => x.user).filter(Boolean))];

        await db.prepare(
          "UPDATE planting_records SET field_id=?,field_name=?,heading=?,latitude=?,longitude=?,planting_date=?,variety=?,notes=? WHERE id=?"
        ).bind(fieldId, fieldName, heading, latitude, longitude, plantingDate, variety || null, mergedNotes, duplicate.id).run();
        await db.prepare("DELETE FROM planting_records WHERE id=?").bind(id).run();

        const contributorDetail = priorContributors.length
          ? ` contributors:${priorContributors.join("|")}`
          : "";
        await log("planting edited", `planting_id:${duplicate.id} merged duplicate${contributorDetail}`);
        return json({ id: duplicate.id, merged: true });
      }

      await db.prepare(
        "UPDATE planting_records SET field_id=?,field_name=?,heading=?,latitude=?,longitude=?,planting_date=?,variety=?,notes=? WHERE id=?"
      ).bind(fieldId, fieldName, heading, latitude, longitude, plantingDate, variety || null, notes || null, id).run();

      await log("planting edited", `planting_id:${id}`);
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
          last_modified_by: last?.user || row.created_by || "",
          contributors
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

      const cols = ["", "Field", "Date", "Latitude", "Longitude ", "Heading", "Variety", "Notes", "Acres ", "Bags", "Bags per acre", "Avg OZ PER SEED"];
      const excelDate = value => {
        const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? `${Number(match[2])}/${Number(match[3])}/${match[1].slice(-2)}` : value;
      };
      const rows = [...merged.values()].map(row => [
        "FALSE", row.field_name, excelDate(row.planting_date), row.latitude, row.longitude,
        row.heading, row.variety, row.notes, "", "", "", ""
      ]);
      const cell = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
      const csv = "\uFEFF" + [cols, ...rows].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
      return new Response(csv, {status:200,headers:{
        "content-type":"text/csv; charset=utf-8",
        "content-disposition":'attachment; filename="potato-planting-records.csv"',
        "cache-control":"no-store"
      }});
    }

    if (a === "planting-records" && b === "archive" && m === "POST") {
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
