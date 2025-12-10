# GeoJSON File Upload Tips

## Overview

This document provides tips for setting up GeoJSON files for upload to make the process as smooth as possible, based on the Supabase schema and field mapping system.

## Database Schema Fields

The following fields are supported in the parks table:

### Required Fields
- **name** - Park name (required)
- **state** - State code (2-letter, preferred) OR **latitude/longitude** (if state missing)

### Optional Fields
- **description** - Park description
- **agency** - Managing agency (e.g., "NPS", "State Parks", "County Parks")
- **agency_full_name** - Full agency name
- **website** - Website URL
- **phone** - Phone number
- **email** - Email address
- **activities** - Array of activities (e.g., ["hiking", "camping", "fishing"])
- **amenities** - Array of amenities (e.g., ["restrooms", "picnic tables", "parking"])
- **latitude** - Latitude coordinate
- **longitude** - Longitude coordinate
- **geometry** - WKT format polygon (SRID=4326;POLYGON(...))
- **address** - Physical address
- **county** - County name
- **designation_type** - Designation type (e.g., "National Park", "State Park")
- **acres** - Park size in acres
- **public_access** - Public access information

### Fields NOT in Database Schema
These fields will be ignored or mapped:
- `agency_type` - Use `agency` instead
- `category` - Not stored (but can be used for filtering during upload)
- `directions` - Not stored
- `accessibility` - Not stored
- `website_url` - Will be mapped to `website`

## GeoJSON Structure

Your GeoJSON files should follow this structure:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lon, lat], [lon, lat], ...]]
      },
      "properties": {
        "name": "Park Name",
        "state": "NC",
        "description": "Park description",
        "agency": "State Parks",
        "website": "https://example.com",
        "phone": "(555) 123-4567",
        "email": "info@example.com",
        "activities": ["hiking", "camping"],
        "amenities": ["restrooms", "parking"],
        "latitude": 35.1234,
        "longitude": -80.5678
      }
    }
  ]
}
```

## Field Name Mapping

The system supports multiple field name variations. Use any of these:

### Name Field
- `name`, `NAME`, `Name`
- `UNIT_NAME`, `UNITNAME`, `unit_name` (PAD-US)
- `LOC_NAME`, `LOCNAME`, `loc_name` (PAD-US)
- `ParkName`, `park_name`, `PARK_NAME` (TPL/ParkServe)
- `site_name`, `SITE_NAME`, `SiteName`
- `facility_name`, `FACILITY_NAME`

### State Field
- `state`, `STATE`, `State`
- `State_Nm`, `STATE_NM`, `state_nm` (PAD-US)
- `state_code`, `STATE_CODE`, `StateCode`
- `state_abbr`, `STATE_ABBR`
- `st`, `ST`, `St`

### Agency Field
- `agency`, `AGENCY`, `Agency`
- `Mang_Name`, `MANG_NAME`, `mang_name` (PAD-US)
- `owner_type`, `OWNER_TYPE`, `OwnerType`
- `owner`, `OWNER`, `Owner`
- `managing_agency`, `MANAGING_AGENCY`
- `manager`, `MANAGER`, `Manager`

### Website Field
- `website`, `WEBSITE`, `Website`
- `url`, `URL`, `Url`
- `website_url`, `WEBSITE_URL` (will be mapped to `website`)
- `homepage`, `HOMEPAGE`
- `link`, `LINK`

### Activities/Amenities
Can be provided as:
- **Array**: `["hiking", "camping", "fishing"]`
- **Comma-separated string**: `"hiking, camping, fishing"`

## Tips for Breaking Down Large Files

### 1. Split by State
Break files into state-specific GeoJSON files:
- `parks-north-carolina.geojson`
- `parks-south-carolina.geojson`
- etc.

**Benefits:**
- Easier to process
- Can set `defaultState` parameter if state field is missing
- Smaller file sizes
- Can process states in parallel

### 2. Split by County
For very large states, split by county:
- `parks-nc-mecklenburg.geojson`
- `parks-nc-wake.geojson`
- etc.

### 3. Split by Park Type
Split by designation or category:
- `state-parks.geojson`
- `county-parks.geojson`
- `city-parks.geojson`

### 4. Optimal File Size
- **Target size**: 5-50 MB per file
- **Max features**: ~10,000 features per file (for smooth processing)
- **Geometry complexity**: Simplify complex polygons before upload

## Geometry Tips

### Coordinate System
- Use **WGS84 (EPSG:4326)** - standard lat/lon coordinates
- Coordinates should be `[longitude, latitude]` (GeoJSON standard)

### Geometry Types Supported
- **Polygon** - Preferred for park boundaries
- **MultiPolygon** - For parks with multiple areas
- **Point** - Will be converted to small buffer polygon

### Geometry Simplification
- Complex geometries are automatically simplified during upload
- Tolerance: 0.0001 degrees (~11 meters)
- Very complex geometries may take longer to process

### Geometry Format in Database
- Stored as **WKT (Well-Known Text)** format
- Format: `SRID=4326;POLYGON((lon lat, lon lat, ...))`
- Automatically converted from GeoJSON during upload

## Best Practices

### 1. Include State in Every Feature
Even if you're splitting by state, include the state field:
```json
{
  "properties": {
    "name": "Park Name",
    "state": "NC"
  }
}
```

### 2. Use Standardized Field Names
Use lowercase, snake_case when possible:
- `name` (not `NAME` or `ParkName`)
- `state` (not `STATE` or `StateCode`)
- `agency` (not `AGENCY` or `Mang_Name`)

### 3. Provide Coordinates
Even if you have geometry, include `latitude` and `longitude` in properties:
```json
{
  "properties": {
    "latitude": 35.1234,
    "longitude": -80.5678
  }
}
```

### 4. Normalize Activities and Amenities
Use consistent values:
- Activities: `["hiking", "camping", "fishing", "swimming", "boating", "picnicking"]`
- Amenities: `["restrooms", "parking", "picnic tables", "playground", "visitor center"]`

### 5. Validate Before Upload
- Check that all features have a `name` property
- Ensure coordinates are valid (lat: -90 to 90, lon: -180 to 180)
- Verify geometry is valid (no self-intersections, closed polygons)

## Upload Process

### Using the API
```bash
POST /api/upload
Content-Type: multipart/form-data

- file: (GeoJSON file)
- sourceType: "State Agency" (or your source type)
- sourceName: "North Carolina State Parks"
- defaultState: "NC" (optional, used if state missing in file)
```

### Using Chunked Upload (Large Files)
For files > 50MB, use chunked upload:
1. Split file into chunks client-side
2. Upload chunks sequentially
3. System automatically reassembles and processes

## Common Issues and Solutions

### Issue: "Missing required field - name"
**Solution:** Ensure every feature has a `name` property in its `properties` object.

### Issue: "Missing required fields - state and coordinates"
**Solution:** Either:
- Add `state` field to properties, OR
- Add `latitude` and `longitude` to properties, OR
- Use `defaultState` parameter in upload request

### Issue: "Invalid geometry"
**Solution:**
- Ensure polygons are closed (first point = last point)
- Check for self-intersections
- Verify coordinate order: `[longitude, latitude]`

### Issue: "Timeout during upload"
**Solution:**
- Split file into smaller chunks
- Simplify geometry before upload
- Use chunked upload for large files

## Example: Minimal Valid GeoJSON

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-80.8431, 35.2271],
          [-80.8400, 35.2271],
          [-80.8400, 35.2250],
          [-80.8431, 35.2250],
          [-80.8431, 35.2271]
        ]]
      },
      "properties": {
        "name": "Example Park",
        "state": "NC"
      }
    }
  ]
}
```

## Example: Complete GeoJSON with All Fields

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-80.8431, 35.2271],
          [-80.8400, 35.2271],
          [-80.8400, 35.2250],
          [-80.8431, 35.2250],
          [-80.8431, 35.2271]
        ]]
      },
      "properties": {
        "name": "Example State Park",
        "state": "NC",
        "description": "A beautiful state park with hiking trails and camping",
        "agency": "State Parks",
        "agency_full_name": "North Carolina State Parks",
        "website": "https://www.ncparks.gov/example-park",
        "phone": "(555) 123-4567",
        "email": "example@ncparks.gov",
        "activities": ["hiking", "camping", "fishing"],
        "amenities": ["restrooms", "parking", "picnic tables"],
        "latitude": 35.2260,
        "longitude": -80.8415,
        "address": "123 Park Road, Charlotte, NC 28202",
        "county": "Mecklenburg",
        "designation_type": "State Park",
        "acres": 500
      }
    }
  ]
}
```

## Questions?

If you need help setting up your GeoJSON files, check:
1. Field mapper: `lib/utils/field-mapper.js`
2. Upload route: `app/api/upload/route.js`
3. Database operations: `lib/utils/db-operations.js`
