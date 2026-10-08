# CURRENT_STATE

**Updated:** 2026-10-07

## Current implementation

The repository contains a functional field-reference and planting PWA backed by Cloudflare Worker + D1.

### Fields

- Search field names.
- View heading, direction, planting date, and coordinates.
- Expand field cards.
- Edit and delete fields.
- Add fields from Activity.
- Record field changes in the activity table.

### Maps

- Leaflet maps on expanded fields.
- Satellite/street-map toggle.
- Heading marker.
- Recenter.
- Per-field saved center/zoom.
- Google Maps link when coordinates exist.

### Planting

- GPS nearest-field selection.
- Search/select an existing field.
- Read-only field heading/coordinates in the planting form.
- Create, edit, and delete planting records.
- Duplicate field/date merge.
- Notes and operator/contributor tracking.

### Varieties

- Variety selection.
- Add variety.
- Rename variety.
- Delete unused variety.
- Usage counts.
- Variety changes logged in Activity.
- No variety table.

### Activity

- Login activity.
- Planting records.
- Variety management.
- Add Field.
- CSV export.
- Administrator-only season archive.

### PWA

- Standalone manifest.
- Service-worker registration.
- App-shell caching.
- Cached field-list fallback.
- Online API requests use `no-store`.
- Runtime error diagnostic bar.

## Database

Current schema has three application tables:

- `fields`
- `planting_records`
- `activity`

No schema change is represented by the current planting/variety implementation beyond the existing `planting_records` table.

## Deployment state

The repository is the source of truth for implemented code. Live Cloudflare deployment has not been verified by this documentation update.

## Known current behavior

- Field search is client-side against field names after the initial field load.
- The Worker also supports server-side `GET /api/fields?q=...` by field name.
- Planting requires an existing field ID.
- Variety management is implemented without a separate variety table.
- Activity log and season archive require the configured administrator key.
