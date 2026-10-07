# Fields — Architecture

**Repository:** `masstahl/Fields`  
**Primary runtime:** Cloudflare Workers + Workers Assets + D1  
**Client:** HTML/CSS/vanilla JavaScript PWA  
**Map:** Leaflet 1.9.4 + Esri tiles  
**Last reviewed:** 2026-10-06

---

## 1. Architectural Summary

Fields is a single-origin web application deployed on Cloudflare. The application has three principal layers:

1. **Presentation/client layer**
   - `public/index.html`
   - Inline HTML, CSS, and application JavaScript.
   - Leaflet is loaded from `unpkg.com`.
   - `public/fix.js` provides PWA registration/update behavior and a small runtime recovery/diagnostic layer.

2. **Cloudflare edge/API layer**
   - `src/worker.js`
   - Routes `/api/*` requests to application handlers.
   - Routes all non-API requests to Workers Assets through `env.ASSETS.fetch(request)`.

3. **Persistent data layer**
   - Cloudflare D1.
   - Field records are stored in `fields`.
   - Audit/application activity is stored in `activity`.

Conceptually:

```
iPhone / Safari / Edge / Home Screen PWA
                |
                | HTTPS
                v
       Cloudflare Worker
          /          \
     /api/*        assets
       |              |
       v              v
      D1        Workers Assets
   fields/activity     |
                       v
                index.html / PWA files
                       |
                       v
              Leaflet + Esri tiles
```

---

# 2. Repository Architecture

## 2.1 `src/worker.js`

The Worker is the backend entry point.

Its top-level routing decision is intentionally simple:

```js
if (!url.pathname.startsWith("/api/")) {
  return env.ASSETS.fetch(request);
}
return handle(request, env, ...);
```

Therefore:

- API traffic is handled by Worker code.
- HTML/CSS/JS/icon/manifest/static resources are normally served by Workers Assets.
- The Worker does not need to contain the front-end application bundle.

This separation should be preserved.

---

## 2.2 `public/index.html`

This is currently the main application bundle.

It contains:

- document shell
- responsive CSS
- header/brand
- Fields and Activity tabs
- search UI
- field cards
- field detail expansion
- add/edit modal
- delete action
- map containers
- Leaflet map initialization
- map state persistence
- toast notifications
- API client
- activity-log UI

The application is intentionally dependency-light. There is no React/Vue/Svelte build pipeline currently required for the primary UI.

### Important implication

Changes to `index.html` can affect:

- normal browser rendering
- Home Screen PWA behavior
- JavaScript initialization
- Leaflet initialization
- API calls

Front-end changes should therefore be kept narrowly scoped.

---

## 2.3 `public/fix.js`

`fix.js` is a runtime/PWA support layer.

Responsibilities currently include:

- registering `/service-worker.js`
- service-worker update handling
- asking waiting workers to skip waiting
- reloading once after a controller change
- exposing a visible diagnostic bar for runtime failures
- replacing/wrapping the field-loading function
- recording app-open/install activity
- administrator activity-log loading support

### Important architectural concern

There are currently two implementations of the `load()` behavior:

- the main inline application script defines `load()`
- `fix.js` assigns `window.load`

This is deliberate legacy/recovery behavior, but it creates coupling between the two files.

Future cleanup should consolidate this into one application boot path rather than adding additional wrappers.

---

## 2.4 `public/manifest.webmanifest`

Defines PWA metadata:

- application identity
- standalone display
- start URL
- scope
- icon
- theme/background colors

The manifest is part of the PWA installation contract.

Changes to `id`, `scope`, or `start_url` should be treated as potentially disruptive to existing Home Screen installations.

---

## 2.5 `public/service-worker.js`

This file has historically contained application caching and navigation behavior.

Because service workers persist independently on client devices, this file is an architectural risk area.

A service worker can remain installed and controlling a client after the server-side Worker has been rolled back.

Therefore:

> Cloudflare Worker deployment state and browser service-worker state are separate state machines.

This is one of the most important architectural properties of the project.

---

## 2.6 `public/icon.svg`

Application icon used by the web/PWA presentation.

---

# 3. Request Routing

## 3.1 Normal static request

Example:

`GET /`

Flow:

```
Browser
  -> Cloudflare Worker
  -> env.ASSETS.fetch(request)
  -> Workers Assets
  -> index.html
```

The Worker does not query D1 for this request.

---

## 3.2 API request

Example:

`GET /api/fields`

Flow:

```
Browser
  -> Cloudflare Worker
  -> handle(request, env, "fields")
  -> D1
  -> JSON response
  -> browser
```

---

## 3.3 API error handling

The Worker wraps database operations in try/catch.

JSON responses use:

- `application/json; charset=utf-8`
- `cache-control: no-store`

The client also uses `cache: "no-store"` for API calls.

This is important because field data is operational data and should not become stale through browser HTTP caching.

---

# 4. API Architecture

## 4.1 `GET /api/health`

Purpose:

- verify D1 connectivity
- verify the `fields` table exists
- return current record count

Query:

```sql
SELECT COUNT(*) AS count FROM fields
```

Expected conceptual response:

```json
{
  "ok": true,
  "fields": 440
}
```

This endpoint should remain lightweight and side-effect free.

---

## 4.2 `GET /api/fields`

Without query:

```
GET /api/fields
```

Returns:

```sql
SELECT * FROM fields ORDER BY name
```

With query:

```
GET /api/fields?q=...
```

The Worker searches the field name.

The current source limits search results to 100.

The client also has local filtering behavior, so future architecture should avoid maintaining two different search implementations unless there is a clear reason.

---

## 4.3 `POST /api/fields`

Creates a field.

Required:

- `name`
- `heading`

Optional:

- `planted`
- `lat`
- `lng`

The Worker normalizes numeric coordinates using the `num()` helper.

After insertion, it records an `added` activity event.

---

## 4.4 `PUT /api/fields/:id`

Updates:

- `name`
- `heading`
- `planted`
- `lat`
- `lng`

It first retrieves the existing record so it can calculate a change description.

The update also records:

- `updated_by`
- `updated_at`

Then it creates an `edited` activity event.

---

## 4.5 `DELETE /api/fields/:id`

The Worker:

1. Retrieves the existing record.
2. Deletes it from `fields`.
3. Records a `deleted` activity entry.

The activity record is intended to preserve evidence that a deletion occurred even though the field itself is removed.

### Architectural limitation

This is an audit log, not a full soft-delete/archive system.

If future requirements demand restoration of deleted records, a dedicated archive/deleted-fields table would be preferable.

---

## 4.6 `POST /api/open`

Records application usage events.

Recognized event:

- `installed`

Anything else is treated as an application open.

This is operational telemetry rather than authentication.

---

## 4.7 `GET /api/log`

Returns up to 200 recent activity entries.

Access requires:

```
x-admin: <ADMIN_KEY>
```

and the Worker must have:

`env.ADMIN_KEY`

configured.

If not, access is denied.

### `POST /api/planting-records/archive`

Archives the season by removing planting records. The endpoint requires the same `x-admin: <ADMIN_KEY>` check as `GET /api/log`.

---

# 5. D1 Data Architecture

## 5.1 Database

Production D1 database:

`c2e9677e-38f2-4c32-a625-76365146367d`

Known production count:

**440 field records** at the time of the latest verification.

---

## 5.2 Binding compatibility

The Worker currently resolves the database as:

```js
const db = env.DB || env["field-headings"];
```

This allows compatibility with the historical binding name `field-headings` while supporting a normalized `DB` binding.

Do not remove this compatibility casually.

---

## 5.3 `fields` logical model

Known fields include:

| Column | Purpose |
|---|---|
| `id` | Primary record identifier |
| `name` | Field name |
| `heading` | Planting/field orientation |
| `planted` | Planting date |
| `lat` | Latitude |
| `lng` | Longitude |
| `updated_by` | Last editor |
| `updated_at` | Last update timestamp |

The exact DDL should be treated as authoritative if schema changes are needed.

---

## 5.4 `activity` logical model

Known application columns include:

| Column | Purpose |
|---|---|
| `id` | Activity sequence |
| `user` | Operator identity supplied by client |
| `action` | Event type |
| `detail` | Human-readable event description |
| `at` | Timestamp used by the activity UI |

The activity table is intended for operational audit/history.

---

# 6. Client State Architecture

There are two kinds of persistent client state.

## 6.1 Local application preferences

Stored in localStorage:

### User name

`fieldUser`

Used for activity logging.

### Admin credential

`fieldAdmin`

Used by the Activity tab.

This is a convenience mechanism, not a secure credential vault.

### Map mode

`mapMode`

Values are conceptually:

- `sat`
- `map`

### Map states

`fieldMapStates`

Object keyed by field ID.

Example:

```json
{
  "156": {
    "lat": 47.123,
    "lng": -119.456,
    "zoom": 17,
    "updated": 1790000000000
  }
}
```

This allows every field to retain its own map position.

---

## 6.2 Session state

Stored in sessionStorage:

- service-worker reload guard
- application-open logging guard

Session state is intentionally temporary.

---

# 7. Map Architecture

## 7.1 Leaflet

Leaflet 1.9.4 is loaded from:

`https://unpkg.com/leaflet@1.9.4/`

The map is initialized only when a field card is expanded and has coordinates.

This avoids creating hundreds of maps simultaneously.

---

## 7.2 Tile layers

Two Esri layers are configured:

### Satellite

World Imagery.

### Map

World Street Map.

Only the selected layer is added to the map at a time.

---

## 7.3 Map instance lifecycle

Maps are maintained in:

`const maps = new Map()`

Key:

- field ID

Value:

- Leaflet map instance
- satellite layer
- road layer

When a card is collapsed, `destroyClosedMaps()` removes map instances whose DOM element no longer exists.

This prevents unnecessary Leaflet instances from accumulating.

---

## 7.4 Marker architecture

Each field gets a custom Leaflet `divIcon`.

The marker consists of:

- circular ring
- directional arrow
- center core

The marker is rotated according to the field's heading.

This makes the map communicate both:

- geographic position
- field orientation

without requiring a separate legend.

---

## 7.5 Map persistence lifecycle

When initialized:

1. Check `fieldMapStates`.
2. If saved state exists, use saved center/zoom.
3. Otherwise use field coordinates and default zoom.
4. Attach `moveend` and `zoomend`.
5. Save center/zoom after movement.

Recenter explicitly resets the map to the field coordinates at approximately zoom 17.

---

# 8. Search Architecture

Search currently has both server and client responsibilities.

## Client

The application normalizes text and filters loaded records.

Normalization includes:

- lowercase
- Unicode normalization
- whitespace normalization
- dash normalization

The client displays up to 80 local results.

## Server

The API supports `q` searching against the database and limits results to 100.

### Future recommendation

Choose one authoritative search strategy.

For 440 records, client-side loading is inexpensive and provides excellent mobile responsiveness after initial load.

If the dataset grows substantially, move fully to server-side search and pagination.

---

# 9. PWA Architecture

## 9.1 Installation

The browser sees:

- manifest
- icon
- standalone display setting
- HTTPS origin

The Home Screen application is still a browser-controlled web application.

It is not a native iOS binary.

---

## 9.2 Service worker lifecycle

The lifecycle is:

```
registration
   |
   v
install
   |
   v
waiting
   |
   v
skipWaiting
   |
   v
activate
   |
   v
controllerchange
   |
   v
one-time reload
```

`fix.js` attempts to automate this lifecycle.

---

## 9.3 Critical PWA property

Service-worker state is stored on the user's device.

Therefore:

```
Cloudflare rollback
      !=
service-worker rollback
```

A client can continue running a service worker from a newer deployment even after the server is rolled back.

This explains why server rollback alone is insufficient as a universal PWA recovery mechanism.

---

# 10. Emergency Service-Worker Recovery Architecture

A special Worker endpoint was added in GitHub source:

`/service-worker.js`

Its purpose is to replace an installed stale/broken service worker with a temporary self-removing worker.

The recovery worker:

1. installs
2. calls `skipWaiting()`
3. claims clients
4. unregisters itself
5. reloads controlled clients

This is intentionally different from the normal application service worker.

### Why this is useful

It gives the server a way to repair stale clients without requiring the user to manually delete browser data.

### Deployment requirement

The endpoint has no effect until its Worker implementation is live in production.

---

# 11. Asset Deployment Architecture

Workers Assets and Worker code are separate deployment components.

A correct asset-backed Worker deployment must preserve the existing asset bundle.

The desired deployment behavior is:

```
new Worker code
      +
existing known-good Assets
      +
existing D1 binding
      =
new production version
```

Do not accidentally deploy only the Worker source and omit the asset bundle.

---

# 12. Security Architecture

## 12.1 Current security model

The application currently relies primarily on:

- Cloudflare HTTPS
- server-side D1 access
- an admin key for activity logs and season archive
- a client-supplied `x-user` value for activity attribution

This is appropriate for a small controlled operational application but is not equivalent to a fully authenticated multi-user SaaS application.

---

## 12.2 `x-user`

The client sends:

`x-user`

The Worker decodes and truncates it.

This is an audit label, not a cryptographically trusted identity.

A malicious client can forge it.

If identity becomes security-sensitive, introduce actual authentication.

---

## 12.3 Admin key

The Activity endpoint is protected by `ADMIN_KEY`.

The key should exist only as a Cloudflare Worker secret/secret binding.

Do not hard-code it in:

- `index.html`
- `fix.js`
- GitHub source
- public configuration

The client currently stores a supplied key in localStorage for convenience. This should be treated as sensitive and could be improved later.

---

# 13. Reliability Architecture

The system has several independent failure domains.

## Failure domain A — static assets

Symptoms:

- blank page
- broken UI
- missing JavaScript/CSS

Primary investigation:

- Workers Assets
- deployment
- `index.html`

## Failure domain B — Worker/API

Symptoms:

- UI loads
- fields do not load
- connection errors
- 5xx responses

Primary investigation:

- Worker deployment
- D1 binding
- `/api/health`
- D1 availability

## Failure domain C — D1

Symptoms:

- API returns database errors
- field count unavailable
- edits fail

Primary investigation:

- D1 binding
- schema
- database status

## Failure domain D — service worker/PWA

Symptoms:

- Home Screen app cannot open
- Safari reports it cannot open the page
- stale UI persists after deployment
- normal browser and standalone behavior differ

Primary investigation:

- registered service worker
- cached assets
- PWA navigation handling
- client controller state

This separation should guide debugging.

---

# 14. Observability

Current observability is intentionally lightweight.

Available mechanisms:

- `/api/health`
- Activity table
- visible front-end error diagnostic bar
- Cloudflare Worker deployment/version information
- browser service-worker state
- client-side connection status

### Recommended future observability

Add structured server-side error logging if operational scale increases.

Potential fields:

- request path
- method
- status
- error class
- timestamp
- deployment version

Do not log sensitive admin credentials.

---

# 15. Performance Architecture

The application is currently small enough that loading the complete field list is practical.

Known dataset size:

~440 records.

The architecture therefore favors:

- one initial API request
- local rendering/filtering
- lazy map creation
- no framework runtime
- no database request for every keystroke

This is appropriate for the current scale.

### Map optimization

Maps are created only for expanded cards with coordinates.

This is particularly important on iPhone because creating hundreds of Leaflet instances would be unnecessary and memory-intensive.

---

# 16. Deployment Architecture

Current desired deployment:

```
GitHub main
   |
   | deployment mechanism
   v
Cloudflare Worker
   |
   +--> Workers Assets
   |
   +--> D1
```

GitHub is the source of truth for application source.

Cloudflare is the source of truth for production runtime state.

These should not be conflated.

---

# 17. Production Configuration

Known production identifiers:

| Component | Identifier |
|---|---|
| Cloudflare account | `2ae2d9dcdd314bf2e28be89feb75509c` |
| Worker | `field-headings` |
| Environment | `production` |
| Worker URL | `https://field-headings.stahlsays.workers.dev` |
| D1 database | `c2e9677e-38f2-4c32-a625-76365146367d` |

D1 binding compatibility:

`DB` or `field-headings`

---

# 18. Known-Good Baseline

Worker version 34 was previously identified as the last known-good production baseline before the more aggressive PWA/map changes.

This baseline is valuable for diagnosis.

However, it is not sufficient by itself to repair a stale client-side service worker.

The recovery architecture must account for both:

1. server deployment state
2. browser/PWA state

---

# 19. Architectural Constraints

The following constraints should remain unless the product requirements explicitly change.

### Constraint 1 — Do not destroy production data

No migration, reset, or recreation should be performed during normal front-end work.

### Constraint 2 — Preserve the mobile-first experience

The app is primarily used on iPhone.

### Constraint 3 — Keep interaction fast

Avoid unnecessary navigation, page reloads, and server requests.

### Constraint 4 — Keep visual changes intentional

Do not redesign the application while implementing unrelated functionality.

### Constraint 5 — Treat service-worker changes as high risk

Any service-worker modification can affect already-installed applications.

### Constraint 6 — Preserve asset-backed Worker deployments

Worker code and Workers Assets must remain compatible.

---

# 20. Recommended Future Architecture

As the project matures, the following structure would improve maintainability:

```
Fields/
├── src/
│   ├── worker.js
│   ├── api/
│   │   ├── fields.js
│   │   ├── activity.js
│   │   └── health.js
│   └── db/
│       └── queries.js
│
├── public/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── fix.js
│   ├── service-worker.js
│   ├── manifest.webmanifest
│   └── icon.svg
│
├── migrations/
│   └── ...
│
├── PROJECT_MEMORY.md
└── ARCHITECTURE.md
```

This is a recommendation, not an instruction to refactor immediately.

The current single-file front end is functional and should not be split solely for aesthetics.

---

# 21. Future GIS Architecture

If field boundaries become available, the preferred model is:

```
field record
   |
   +-- point coordinates
   |
   +-- heading
   |
   +-- boundary geometry
   |
   +-- acreage
```

Boundary geometry should ideally be stored as:

- GeoJSON in a dedicated table/object store, or
- normalized geometry data appropriate to the chosen GIS strategy.

Do not store fabricated geometry.

The map should continue to work when a field has coordinates but no boundary.

---

# 22. Future Authentication Architecture

If multiple operators eventually need controlled permissions:

```
User
 |
 v
Authentication
 |
 v
Session / identity
 |
 v
Worker
 |
 +--> authorization
 |
 +--> D1
```

The current `x-user` model should then be replaced or supplemented with a trusted identity source.

Potential roles:

- operator
- supervisor
- administrator

Permissions could then control:

- add
- edit
- delete
- activity-log access
- GIS changes

---

# 23. Disaster Recovery Principles

The most important recoverable assets are:

1. GitHub source
2. Cloudflare Worker configuration
3. D1 database
4. Workers Assets
5. PWA/client state

These should be considered independently.

### Database

Back up/export before destructive schema changes.

### Worker

Keep known-good versions available.

### Assets

Do not overwrite known-good assets while testing Worker code.

### PWA

Have a service-worker recovery mechanism available.

---

# 24. Debugging Decision Tree

When the user reports "the app doesn't work":

### Step 1

Ask whether the failure occurs in:

- Safari
- Edge
- Home Screen
- all three

### Step 2

If normal browser works but Home Screen fails:

Investigate PWA/service-worker state first.

### Step 3

If browser and Home Screen both fail:

Check:

- Worker deployment
- Workers Assets
- API
- DNS/origin
- service-worker state

### Step 4

If page loads but fields fail:

Check:

`/api/health`

Then:

`/api/fields`

### Step 5

If field data works but maps fail:

Check:

- Leaflet load
- browser console/runtime errors
- coordinates
- external Esri tile availability
- CSP/network restrictions

### Step 6

Never modify D1 merely because the UI is failing.

---

# 25. Architectural Anti-Patterns to Avoid

## Anti-pattern: adding another service worker to fix a service worker

Prefer one explicit recovery strategy.

## Anti-pattern: cache everything indefinitely

Operational field data should not be treated as immutable.

## Anti-pattern: relying on localStorage for authoritative field data

localStorage is appropriate for:

- preferences
- map view
- UI state

D1 is authoritative for field records.

## Anti-pattern: using client identity as authorization

`x-user` is attribution only.

## Anti-pattern: coupling map state to server data

Map viewport state is a user/device preference and belongs in local storage.

## Anti-pattern: deploying Worker source without assets

The application will break because the Worker delegates non-API requests to `env.ASSETS`.

---

# 26. Current Architectural Status

### Stable

- Cloudflare Worker architecture
- D1 field database
- API model
- CRUD operations
- audit/activity model
- Leaflet map architecture
- per-field map state persistence
- mobile-first UI

### Needs attention

- Production deployment pipeline for asset-backed Worker versions.
- PWA/service-worker recovery deployment.
- Consolidation of duplicate `load()` behavior between `index.html` and `fix.js`.
- Long-term search architecture if field count grows significantly.
- Stronger authentication if the app becomes broadly multi-user.

### Do not change casually

- D1 production data
- Worker/API routing contract
- PWA `scope` / `id`
- service-worker behavior
- Workers Assets configuration

---

# 27. Architectural Invariants

These should remain true after future changes:

1. `/api/*` is handled by the Worker.
2. Non-API requests are served by Workers Assets unless an explicit Worker route is intentionally added.
3. D1 remains the authoritative field database.
4. Field map viewport state remains per-field and local to the device.
5. Map marker orientation comes from the field heading.
6. Activity records survive field deletion.
7. Activity-log access and season archive require server-side administrator authorization.
8. API responses are not browser-cached.
9. The application remains usable on iPhone.
10. PWA updates must not knowingly create an unrecoverable Home Screen state.
11. GitHub commits are not considered production deployments until Cloudflare confirms deployment.
12. Production data is never reset as a troubleshooting shortcut.

---

# 28. One-Sentence System Model

> **Fields is a lightweight, mobile-first Cloudflare application in which a vanilla JavaScript PWA talks to a Worker API, the Worker persists authoritative field/audit data in D1, Workers Assets serves the application shell, and Leaflet provides per-field interactive GIS state on the client.**
