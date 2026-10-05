const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const num = (v) => (v === null || v === "" || v === undefined || Number.isNaN(+v)) ? null : +v;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Emergency PWA recovery endpoint.
    if (url.pathname === "/service-worker.js") {
      return new Response(
        "self.addEventListener(\"install\",()=>self.skipWaiting());self.addEventListener(\"activate\",e=>e.waitUntil(self.clients.claim().then(()=>self.registration.unregister()).then(()=>self.clients.matchAll()).then(cs=>Promise.all(cs.map(c=>c.navigate(c.url))))));",
        {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate"
          }
        }
      );
    }\n    if (!url.pathname.startsWith("/api/")) {
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
    if (a === "fields" && m === "GET") {
      const q = new URL(request.url).searchParams.get("q")?.trim() || "";
      if (!q) return json((await db.prepare("SELECT * FROM fields ORDER BY name").all()).results);
      const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
      return json((await db.prepare("SELECT * FROM fields WHERE name LIKE ? ESCAPE '\\' OR heading LIKE ? ESCAPE '\\' ORDER BY name LIMIT 100").bind(like, like).all()).results);
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
