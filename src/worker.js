const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const num = (v) => (v === null || v === "" || v === undefined || Number.isNaN(+v)) ? null : +v;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
      const r = await db.prepare("INSERT INTO planting_records(field_id,field_name,heading,latitude,longitude,planting_date,variety,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(fieldId, fieldName, heading, latitude, longitude, plantingDate, variety || null, notes || null, who).run();
      return json({ id: r.meta.last_row_id });
    }

    if (a === "planting-records" && m === "GET") {
      return json((await db.prepare("SELECT id,field_id,field_name,heading,latitude,longitude,planting_date,variety,notes,created_by,created_at FROM planting_records ORDER BY id").all()).results);
    }

    if (a === "planting-records" && b === "export" && m === "GET") {
      const rows = (await db.prepare("SELECT id,field_id,field_name,heading,latitude,longitude,planting_date,variety,notes,created_by,created_at FROM planting_records ORDER BY id").all()).results;
      const cols = ["id","field_id","field_name","heading","latitude","longitude","planting_date","variety","notes","created_by","created_at"];
      const cell = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
      const csv = "\uFEFF" + [cols, ...rows.map(row => cols.map(c => row[c]))].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
      return new Response(csv, {status:200,headers:{
        "content-type":"text/csv; charset=utf-8",
        "content-disposition":'attachment; filename="planting-records.csv"',
        "cache-control":"no-store"
      }});
    }

    if (a === "planting-records" && b === "archive" && m === "POST") {
      const r = await db.prepare("DELETE FROM planting_records").run();
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
