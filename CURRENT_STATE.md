# CURRENT_STATE

## Status
Application is operational as a Cloudflare Worker backed by D1.

## Implemented

### Fields
- Search fields
- Add field
- Edit field
- Delete field
- View heading
- View planting date
- View coordinates

### Mapping
- Leaflet integration
- Satellite view
- Street map view
- Recenter control
- Heading direction marker
- Persistent map state

### Planting Records
- Create records
- Edit records
- Delete records
- Contributor tracking
- Duplicate merge handling
- Variety tracking
- Notes tracking

### Export
- CSV export endpoint
- Potato planting CSV filename
- Duplicate consolidation during export

### Activity
- Install tracking
- Open tracking
- Field change logging
- Planting change logging
- Admin-protected log access

### GPS
- Browser geolocation
- Nearest-field detection

## Database Objects

Tables:
- fields
- planting_records
- activity

Migration present:
- 0002_planting_records.sql
