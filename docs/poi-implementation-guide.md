# POI (Points of Interest) Implementation Guide

## Overview

This document provides a quick start guide for using the POI functionality in Trackly.

## Features

### Backend Features
- ✅ Automatic waypoint extraction from GPX files
- ✅ Intelligent deduplication based on location and name
- ✅ Distance calculation along track geometry
- ✅ Audit logging for all POI changes
- ✅ Full CRUD API for POI management
- ✅ Search and filtering by bounding box, category, or track
- ✅ Automatic cleanup of orphaned POIs

### Frontend Features (To Be Implemented)
- ⏳ Display POIs on map with custom icons
- ⏳ POI clustering for dense areas
- ⏳ POI info popups with details
- ⏳ Manual POI creation from map
- ⏳ POI filtering and search

## API Endpoints

### List POIs
```http
GET /pois?bbox=minLon,minLat,maxLon,maxLat&limit=100&offset=0
GET /pois?track_id={uuid}
GET /pois?search=water
```

**Response:**
```json
{
  "pois": [
    {
      "id": 1,
      "name": "Summit",
      "description": "Highest point of the trail",
      "category": "Summit",
      "elevation": 200.0,
      "geom": {
        "type": "Point",
        "coordinates": [37.6200, 55.7570]
      },
      "session_id": null,
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 1
}
```

### Get POI Details
```http
GET /pois/{id}
```

### Get Track POIs
```http
GET /tracks/{track_id}/pois
```

**Response:**
```json
[
  {
    "poi": {
      "id": 1,
      "name": "Trailhead",
      "description": "Starting point",
      "category": "Trailhead",
      "elevation": 150.0,
      "geom": {...},
      "session_id": null,
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    },
    "distance_from_start_m": 0.0,
    "sequence_order": 0
  }
]
```

### Create Manual POI
```http
POST /pois
Content-Type: application/json

{
  "name": "Camping Spot",
  "description": "Great place to camp",
  "category": "Campsite",
  "elevation": 180.5,
  "lat": 55.7560,
  "lon": 37.6180,
  "session_id": "uuid-of-user"
}
```

### Unlink POI from Track
```http
DELETE /tracks/{track_id}/pois/{poi_id}
```

### Delete POI
```http
DELETE /pois/{id}
Content-Type: application/json

{
  "session_id": "uuid-of-owner"
}
```

**Notes:**
- POIs can only be deleted if not used in any track
- Only the owner (session_id) can delete manually created POIs
- Auto-created POIs (from GPX) have session_id = null

## Database Schema

### Tables

#### `pois`
- `id` - Serial primary key
- `name` - POI name (required)
- `description` - Optional description
- `category` - Optional category (e.g., "Summit", "Water", "Trailhead")
- `elevation` - Elevation in meters
- `geom` - Geography point (SRID 4326)
- `dedup_hash` - Generated hash for deduplication
- `session_id` - Owner (null for auto-created POIs)
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

#### `track_pois`
- `track_id` - UUID reference to tracks
- `poi_id` - Integer reference to pois
- `distance_from_start_m` - Distance along track
- `sequence_order` - Order along track
- Primary key: (track_id, poi_id)

#### `poi_audit_log`
- `id` - Serial primary key
- `poi_id` - Reference to pois
- `action` - Action type (created, updated, deleted, merged)
- `changed_fields` - JSONB of changes
- `session_id` - User who made the change
- `ip_address` - IP address of requester
- `user_agent` - User agent string
- `created_at` - Timestamp of action

## Deduplication Strategy

POIs are deduplicated using a hash of:
1. Coordinates rounded to ~1 meter precision (5 decimal places)
2. Lowercase, trimmed name

This ensures that:
- Same location + same name = same POI
- Slightly different coordinates = different POI
- Different names at same location = different POI

Example:
```
"Summit" at (55.75580, 37.61730) 
= 
"Summit" at (55.75581, 37.61731)  (within 1m tolerance)
```

## GPX Waypoint Parsing

The parser extracts waypoints from GPX `<wpt>` elements:

```xml
<wpt lat="55.7558" lon="37.6173">
  <ele>150</ele>
  <name>Trailhead</name>
  <desc>Starting point of the trail</desc>
  <sym>Trailhead</sym>
  <type>Trailhead</type>
</wpt>
```

Extracted fields:
- **name** - From `<name>` (required)
- **description** - From `<desc>` (optional)
- **category** - From `<type>` or `<sym>` (optional)
- **lat/lon** - From `wpt` attributes (required)
- **elevation** - From `<ele>` (optional)

## Testing

### Manual Testing with cURL

1. **Upload a track with waypoints:**
```bash
curl -X POST http://localhost:8080/tracks \
  -F "file=@/path/to/track-with-waypoints.gpx" \
  -F "session_id=00000000-0000-0000-0000-000000000001"
```

2. **List all POIs:**
```bash
curl http://localhost:8080/pois
```

3. **Get POIs for a track:**
```bash
curl http://localhost:8080/tracks/{track_id}/pois
```

4. **Create a manual POI:**
```bash
curl -X POST http://localhost:8080/pois \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom POI",
    "description": "Manually created",
    "category": "Custom",
    "lat": 55.7560,
    "lon": 37.6180,
    "elevation": 175.0,
    "session_id": "00000000-0000-0000-0000-000000000001"
  }'
```

### Unit Tests

Run backend tests:
```bash
cd backend
cargo test
```

Specific POI tests:
```bash
cargo test poi_deduplication
```

## Performance Considerations

### Indexes
The following indexes are created for optimal performance:
- `pois_dedup_hash_idx` - Unique index on dedup_hash (O(1) lookups)
- `pois_geom_idx` - GIST spatial index for bbox queries
- `pois_category_idx` - B-tree index for category filtering
- `pois_name_trgm_idx` - GIN index for fuzzy name search
- `track_pois_track_id_idx` - Fast lookup of POIs for a track
- `track_pois_poi_id_idx` - Fast lookup of tracks using a POI

### Query Performance
- Deduplication: O(1) via hash index
- Bbox queries: O(log n) via GIST index
- Track POIs: O(1) via primary key index
- List all POIs: O(n) with LIMIT/OFFSET pagination

### Scaling
The system is designed to handle:
- 10,000+ POIs: Excellent performance
- 100,000+ POIs: Good performance with proper indexing
- 1,000,000+ POIs: May require partitioning or read replicas

## Maintenance

### Cleanup Orphaned POIs

Run periodically (e.g., daily via cron):
```sql
SELECT cleanup_orphaned_pois(7); -- Grace period of 7 days
```

This removes auto-created POIs that are no longer associated with any track.

### Refresh Statistics

If using materialized views (future enhancement):
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY poi_stats;
```

### Monitor Performance

Check slow queries:
```sql
SELECT * FROM pg_stat_statements 
WHERE query LIKE '%pois%' 
ORDER BY total_exec_time DESC 
LIMIT 10;
```

Check index usage:
```sql
SELECT * FROM pg_stat_user_indexes 
WHERE schemaname = 'public' 
AND relname = 'pois';
```

## Future Enhancements

See the full specification for planned features:
- POI clustering on frontend
- Photo uploads for POIs
- User ratings and reviews
- POI import/export
- Advanced search with fuzzy matching
- POI merge suggestions
- Category management UI

## Troubleshooting

### POIs not appearing after track upload
1. Check logs for waypoint parsing errors
2. Verify GPX file contains `<wpt>` elements
3. Ensure waypoints have both name and coordinates

### Duplicate POIs created
1. Check if coordinates differ by more than 1 meter
2. Verify names are exactly the same (case-insensitive)
3. Check dedup_hash values in database

### Cannot delete POI
1. Verify POI is not used in any track (check `track_pois`)
2. Ensure session_id matches owner for manually created POIs
3. Check audit log for deletion attempts

### Distance calculation issues
1. Ensure track geometry is valid LineString
2. Verify POI coordinates are close to track
3. Check PostGIS function `calculate_poi_distance_on_track`

## Support

For issues or questions:
1. Check the specification: `docs/poi-markers-specification.md`
2. Review audit logs: `SELECT * FROM poi_audit_log WHERE poi_id = {id}`
3. Enable debug logging: Set `RUST_LOG=debug`

## License

Part of the Trackly project.
