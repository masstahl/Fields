# Fields — Project Memory

**Updated:** 2026-10-07  
**Repository:** `masstahl/Fields`  
**Runtime:** Cloudflare Worker + Workers Assets + D1  
**Worker:** `field-headings`

## Purpose

Fields is a mobile-first field reference and planting-record PWA. It lets operators find field records, view heading/location information, edit fields, and record planting activity.

## Repository structure

- `public/index.html` — main UI and client logic.
- `public/service-worker.js` — PWA caching/offline behavior.
- `public/fix.js` — error display, service-worker registration, app boot/load logic.
- `src/worker.js` — API and Workers Assets routing.
- `schema.sql` — current database schema.
- `migrations/0002_planting_records.sql` — planting-record table migration.

Workers Assets uses `public/`.

## Data model

D1 currently contains:

- `fields` — field name, heading, planting date, coordinates, update metadata.
- `planting_records` — field reference, planting date, variety, notes, creator, timestamps.
- `activity` — operator/audit events.

The Worker resolves the database as `env.DB || env["field-headings"]`.

## Field workflow

The main Fields view:

- Loads fields from `GET /api/fields`.
- Shows up to 80 results locally.
- Searches field names locally with normalized, space-separated terms.
- Displays heading, planting date, coordinates, and direction.
- Expands a field to show its map and details.
- Allows field edit/delete.
- Adds fields from the Activity tab.

Field CRUD is handled by the Worker. Deletes are logged in `activity`.

## Maps

Leaflet 1.9.4 provides:

- Satellite and street-map layers from Esri.
- Touch/mouse pan and zoom.
- Heading-oriented field marker.
- Recenter.
- External Google Maps link when coordinates exist.

Each field's map center/zoom is stored locally in `fieldMapStates`. Map mode is stored in `mapMode`.

Maps are created only for expanded fields and removed when their cards close.

## Planting workflow

Planting uses existing fields only.

- Plant Field requests browser geolocation and selects the nearest loaded field with coordinates.
- The field can then be changed through the searchable existing-field control.
- Heading and coordinates are populated from the selected field and are read-only.
- The Worker requires a valid `field_id` and re-reads the field from D1.
- Planting date, variety, and notes are saved.
- A duplicate field/date record is merged rather than creating another record.
- Planting records can be edited or deleted.
- Contributor/last-modified information is derived from planting activity.

## Varieties

Varieties do not have a separate D1 table.

The Worker reconstructs the active variety list from planting records plus variety activity events. The UI supports:

- Selecting a variety.
- Adding a variety.
- Renaming a variety and updating current planting records.
- Deleting unused varieties.
- Showing usage counts.

Variety changes are logged in `activity`.

## Activity

The Activity tab contains:

- Login Activity.
- Planting Records.
- Variety Management.
- Add Field.
- CSV export.
- Administrator-only season archive.

Login activity is retrieved through the administrator-protected `GET /api/log` endpoint. Season archive uses the same `ADMIN_KEY` / `x-admin` check.

## Export and archive

`GET /api/planting-records/export` produces the existing planting CSV format.

`POST /api/planting-records/archive` deletes planting records only and requires administrator authorization.

## User/audit state

The client stores the operator name in `localStorage.fieldUser` and sends it as `x-user`. This is an audit label, not authentication.

The administrator key is stored locally after entry as `fieldAdmin`.

## PWA

The app is installable as a standalone PWA.

The current service worker:

- Caches the app shell.
- Attempts to cache the field list.
- Fetches current API data without browser caching when online.
- Uses the cached field list when `/api/fields` cannot be reached.
- Serves cached `index.html` for navigation when available.
- Caches successful static resources.

`fix.js` registers `/service-worker.js` with `updateViaCache: 'none'` and reports runtime errors in a visible diagnostic bar.

There is no separate emergency service-worker recovery endpoint in the current Worker.

## Production configuration

- Worker: `field-headings`
- D1 database: `field-headings`
- D1 database ID: `c2e9677e-38f2-4c32-a625-76365146367d`
- Assets binding: `ASSETS`
- D1 binding: `DB`

Current source should be treated as authoritative. Production deployment status must be verified separately from GitHub source.


## Grower and Variety Workflow — 2026-10-08

- Plant Field shows planting date in a compact top-right control and includes a Grower dropdown using an audit-backed catalog; no new D1 table is added.
- Activity includes Grower Management for adding growers, editing spelling, and deleting growers.
- Variety management no longer shows Rename/Delete buttons. Tapping a variety filters Planting Records to records with that exact variety; tapping it again clears the filter.
- A variety with zero current records can be deleted by long-pressing its row for about one second and confirming. Varieties with current records cannot be deleted.
- Variety usage counts must refresh after planting records change.
- Grower values are stored in activity audit events associated with planting record IDs to avoid changing the D1 schema.
