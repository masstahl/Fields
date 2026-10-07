# CURRENT_STATE

**Last updated:** 2026-10-07

## Status

Application source is operational as a Cloudflare Worker-backed D1 application. The latest GitHub changes implement a safer planting workflow and variety management. Production deployment of these latest GitHub changes has not been verified.

## Implemented

### Fields

- Search existing fields
- Edit field
- Delete field
- View heading
- View planting date
- View coordinates
- Add Field is available from Activity rather than the primary screen
- Existing field database structure is unchanged

### Mapping

- Leaflet integration
- Satellite view
- Street map view
- Recenter control
- Heading direction marker
- Persistent per-field map state

### Plant Field

- GPS nearest-field detection remains unchanged and runs immediately when Plant Field is tapped
- Planting starts automatically on the GPS-detected existing field
- Plant Field has one searchable Field Name control; typing filters existing fields only
- A later manual selection can override the GPS-detected field
- Field name cannot be created or saved from Plant Field; a non-matching search shows “No matching field found” and blocks save
- Heading, latitude, and longitude are automatically populated from the selected field
- Heading, latitude, and longitude are read-only in the planting form
- Planting save is server-validated against an existing D1 field ID
- Planting workflow cannot create a new field

### Planting Records

- Create records
- Edit records
- Delete records
- Contributor tracking
- Duplicate merge handling
- Notes tracking
- Variety tracking
- Planting edits use existing fields only

### Varieties

- Variety dropdown in planting forms
- Previously used/managed varieties appear in the dropdown
- Add new variety from the dropdown
- Activity Variety Management section
- View varieties
- Rename varieties
- Delete unused varieties
- Variety usage counts
- Variety catalog changes recorded through the existing activity table
- No new D1 table or schema migration

### Activity

- Login Activity
- Export CSV
- Archive Season
- Planting Records always visible
- Add Field access
- Variety Management
- Login Activity opens only when selected

### Export

- Existing CSV export endpoint preserved
- Existing merged/final-record export behavior preserved
- Existing potato planting CSV filename preserved

### GPS

- Browser geolocation
- Nearest-field detection
- Existing GPS workflow preserved

## Database Objects

Tables remain:

- fields
- planting_records
- activity

No database schema changes were made for this workflow update.

## Latest GitHub Changes

- `src/worker.js` — existing-field enforcement plus variety management API
- `public/index.html` — existing-field planting UI, variety dropdown/management, Add Field moved to Activity
- `PROJECT_MEMORY.md` — workflow and architecture memory synchronized
- `architecture.md` — architecture synchronized
- `CURRENT_STATE.md` — current behavior synchronized
- `NEXT_TASK.md` — next verification work synchronized

## Verification

Source-level checks confirm:

- Planting API verifies the selected field ID against D1.
- Planting API derives field name/heading/coordinates from D1.
- Variety GET/add/rename/delete routes exist.
- Add Field is absent from the primary header.
- Add Field exists in Activity.
- Planting field search/select exists.
- Planting heading/coordinates are read-only.
- Variety dropdown and Add New Variety option exist.
- Variety Management section exists.
- Planting edit form also requires an existing field.

Production Cloudflare deployment and live-device behavior still require verification after deployment.
