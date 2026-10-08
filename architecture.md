# Fields — Architecture

## System

```
iPhone / browser / Home Screen PWA
              |
              v
      Workers Assets + Worker
              |
        +-----+-----+
        |           |
        v           v
      D1 API      static app
```

The client is vanilla JavaScript in `public/index.html`. The Worker in `src/worker.js` handles API routes and delegates asset requests to Workers Assets.

## Worker routing

The Worker explicitly serves:

- `/`
- `/index.html`
- `/fix.js`

through Workers Assets with `cache-control: no-store`.

Other non-API requests are served directly by Workers Assets.

All `/api/*` requests are handled by the Worker.

## API

Implemented routes:

- `GET /api/health`
- `GET /api/fields`
- `GET /api/fields?q=...`
- `POST /api/fields`
- `PUT /api/fields/:id`
- `DELETE /api/fields/:id`
- `POST /api/open`
- `GET /api/log`
- `GET /api/planting-records`
- `POST /api/planting-records`
- `PUT /api/planting-records/:id`
- `DELETE /api/planting-records/:id`
- `GET /api/planting-records/export`
- `POST /api/planting-records/archive`
- `GET /api/varieties`
- `POST /api/varieties`
- `POST /api/varieties/rename`
- `POST /api/varieties/delete`

API responses use JSON with `no-store` caching except the CSV export.

## Database

Current tables:

### fields

`id, name, heading, planted, lat, lng, updated_by, updated_at`

### planting_records

`id, field_id, field_name, heading, latitude, longitude, planting_date, variety, notes, created_by, created_at`

### activity

`id, at, user, action, detail`

There is no variety table.

## Field search and rendering

The client loads the complete field list, then:

1. Normalizes the search text.
2. Splits it into terms.
3. Matches every term against the field name.
4. Displays at most 80 matches.

The server-side `q` route searches the field `name` column and limits results to 100.

## Map architecture

Leaflet is loaded from the configured external CDN.

Each expanded field with coordinates gets its own Leaflet map.

Map state is local:

```
fieldMapStates[fieldId] = {
  lat,
  lng,
  zoom,
  updated
}
```

Map mode is stored as `mapMode`.

The marker is rotated from the field heading. Closing a field removes its Leaflet instance.

## Planting architecture

The client selects an existing field and sends its ID.

The Worker:

1. Validates the field ID.
2. Reads the authoritative field row.
3. Uses its name and heading.
4. Uses the supplied coordinates when present, otherwise the field coordinates.
5. Validates the variety against the active variety list.
6. Creates or updates the planting record.

Create/edit duplicate handling is keyed by field name + planting date.

## Variety architecture

Active varieties are reconstructed from:

- distinct varieties currently present in planting records;
- variety activity events.

Rename updates planting records. Delete is rejected while the variety is in use.

## Activity architecture

Field, planting, variety, open/install, and archive operations write audit events.

`x-user` identifies the operator label. It is not authentication.

`GET /api/log` and season archive require:

```
x-admin: <ADMIN_KEY>
```

Other implemented field/planting/variety routes are not administrator-gated.

## Client persistence

`localStorage` stores:

- `fieldUser`
- `fieldAdmin`
- `mapMode`
- `fieldMapStates`

`sessionStorage` stores the one-session app-open guard.

## PWA architecture

The manifest provides standalone PWA metadata.

The service worker caches the app shell and field list, uses network-first behavior for the field API, and provides cached navigation/app-shell behavior when offline.

The current Worker does not implement a special service-worker recovery route; `/service-worker.js` is served from Workers Assets.

## Deployment

`wrangler.jsonc` configures:

- Worker name `field-headings`
- `src/worker.js`
- Workers Assets from `./public`
- D1 binding `DB`
- API/service-worker/front-end paths that run through the Worker first

GitHub source and live Cloudflare deployment are separate states.
