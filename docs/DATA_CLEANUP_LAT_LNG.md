# Data Cleanup: Ensure All Parks Have Lat/Lng

## Overview

This cleanup ensures every park has `latitude` and `longitude` values:
1. **Keep existing lat/lng** if present
2. **Calculate from boundary centroid** if lat/lng missing
3. **Result**: All parks can be displayed on map, boundaries loaded separately when needed

## Benefits

- ✅ **Simpler queries**: Always query lat/lng columns (no geometry calculations)
- ✅ **Better performance**: Indexed lat/lng columns are faster than geometry calculations
- ✅ **Consistent data**: Every park has coordinates
- ✅ **Separation of concerns**: Points for markers, boundaries for detail view

---

## Step 1: Identify Your Boundary Column

First, find your boundary geometry column name:

```sql
-- Find geometry columns
SELECT 
  f_geometry_column as column_name,
  type as geometry_type,
  srid
FROM geometry_columns 
WHERE f_table_name = 'parks';

-- Check sample data
SELECT 
  id,
  name,
  latitude,
  longitude,
  CASE 
    WHEN boundary IS NOT NULL THEN ST_GeometryType(boundary)  -- Replace 'boundary' with your column name
    ELSE 'NULL'
  END as boundary_type
FROM parks
LIMIT 10;
```

**Note**: Replace `'boundary'` in all SQL below with your actual column name.

---

## Step 2: Check Current Data Status

```sql
-- Check how many parks are missing coordinates
SELECT 
  COUNT(*) as total_parks,
  COUNT(latitude) as has_latitude,
  COUNT(longitude) as has_longitude,
  COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as has_both_coords,
  COUNT(boundary) as has_boundary,  -- Replace 'boundary'
  COUNT(CASE 
    WHEN (latitude IS NULL OR longitude IS NULL) 
    AND boundary IS NOT NULL  -- Replace 'boundary'
    THEN 1 
  END) as missing_coords_but_has_boundary
FROM parks;
```

---

## Step 3: Cleanup Script

### 3.1 Update Parks Missing Coordinates

**First, check if your column is `geometry` or `geography` type:**

```sql
-- Check column type
SELECT 
  column_name,
  udt_name,
  data_type
FROM information_schema.columns 
WHERE table_name = 'parks' 
  AND (udt_name = 'geometry' OR udt_name = 'geography');
```

**If it's `geography`, use this version (cast to geometry first):**

```sql
-- Update parks that are missing lat/lng but have boundary geometry
-- Replace 'boundary' with your actual boundary column name
-- This version handles both geometry and geography types

UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(boundary::geometry)),  -- Replace 'boundary', cast to geometry
  longitude = ST_X(ST_Centroid(boundary::geometry))  -- Replace 'boundary', cast to geometry
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND boundary IS NOT NULL  -- Replace 'boundary'
  AND ST_GeometryType(boundary::geometry) IN ('ST_Polygon', 'ST_MultiPolygon');  -- Replace 'boundary', cast to geometry
```

**If it's `geometry` type, use this version (no cast needed):**

```sql
-- Update parks that are missing lat/lng but have boundary geometry
-- Replace 'boundary' with your actual boundary column name

UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(boundary)),  -- Replace 'boundary'
  longitude = ST_X(ST_Centroid(boundary))  -- Replace 'boundary'
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND boundary IS NOT NULL  -- Replace 'boundary'
  AND ST_GeometryType(boundary) IN ('ST_Polygon', 'ST_MultiPolygon');  -- Replace 'boundary'
```

-- Verify the update
SELECT 
  COUNT(*) as updated_count,
  AVG(latitude) as avg_lat,
  AVG(longitude) as avg_lng
FROM parks
WHERE 
  latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND (latitude, longitude) IN (
    SELECT latitude, longitude 
    FROM parks 
    WHERE boundary IS NOT NULL  -- Replace 'boundary'
  );
```

### 3.2 Handle Edge Cases

```sql
-- Check for parks with invalid coordinates
SELECT 
  id,
  name,
  latitude,
  longitude,
  CASE 
    WHEN latitude < -90 OR latitude > 90 THEN 'Invalid latitude'
    WHEN longitude < -180 OR longitude > 180 THEN 'Invalid longitude'
    ELSE 'Valid'
  END as coordinate_status
FROM parks
WHERE latitude IS NOT NULL OR longitude IS NOT NULL
HAVING coordinate_status != 'Valid';

-- Fix invalid coordinates (if any)
-- Use ::geometry cast if your column is geography type
UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(boundary::geometry)),  -- Replace 'boundary', add ::geometry if geography
  longitude = ST_X(ST_Centroid(boundary::geometry))  -- Replace 'boundary', add ::geometry if geography
WHERE 
  (latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180)
  AND boundary IS NOT NULL  -- Replace 'boundary'
  AND ST_GeometryType(boundary::geometry) IN ('ST_Polygon', 'ST_MultiPolygon');  -- Replace 'boundary', add ::geometry if geography
```

### 3.3 Handle MultiPolygon Boundaries

**Simpler approach** (works for both Polygon and MultiPolygon, handles geography type):

```sql
-- Works for both Polygon and MultiPolygon
-- Handles both geometry and geography types (casts to geometry)
-- Replace 'boundary' with your actual column name

UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(boundary::geometry)),  -- Replace 'boundary', cast to geometry
  longitude = ST_X(ST_Centroid(boundary::geometry))  -- Replace 'boundary', cast to geometry
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND boundary IS NOT NULL  -- Replace 'boundary'
  AND ST_GeometryType(boundary::geometry) IN ('ST_Polygon', 'ST_MultiPolygon');  -- Replace 'boundary', cast to geometry
```

**Note**: The `::geometry` cast converts geography to geometry, which is needed for `ST_Centroid` and `ST_GeometryType` functions. This works for both geometry and geography columns.

---

## Step 4: Create Trigger for Future Data

Ensure new parks automatically get coordinates from boundaries:

```sql
-- Function to set lat/lng from boundary if missing
-- Handles both geometry and geography types
CREATE OR REPLACE FUNCTION ensure_park_coordinates()
RETURNS TRIGGER AS $$
BEGIN
  -- If lat/lng missing but boundary exists, calculate from boundary
  -- Cast to geometry to handle both geometry and geography types
  IF (NEW.latitude IS NULL OR NEW.longitude IS NULL) 
     AND NEW.boundary IS NOT NULL  -- Replace 'boundary' with your column name
     AND ST_GeometryType(NEW.boundary::geometry) IN ('ST_Polygon', 'ST_MultiPolygon') THEN  -- Replace 'boundary', cast to geometry
    NEW.latitude := ST_Y(ST_Centroid(NEW.boundary::geometry));  -- Replace 'boundary', cast to geometry
    NEW.longitude := ST_X(ST_Centroid(NEW.boundary::geometry));  -- Replace 'boundary', cast to geometry
  END IF;
  
  -- Validate coordinates
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    IF NEW.latitude < -90 OR NEW.latitude > 90 THEN
      RAISE EXCEPTION 'Invalid latitude: %', NEW.latitude;
    END IF;
    IF NEW.longitude < -180 OR NEW.longitude > 180 THEN
      RAISE EXCEPTION 'Invalid longitude: %', NEW.longitude;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS parks_ensure_coordinates ON parks;

CREATE TRIGGER parks_ensure_coordinates
BEFORE INSERT OR UPDATE OF latitude, longitude, boundary ON parks  -- Add your boundary column name
FOR EACH ROW
EXECUTE FUNCTION ensure_park_coordinates();
```

---

## Step 5: Verify Cleanup

```sql
-- Final verification
SELECT 
  COUNT(*) as total_parks,
  COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as has_coordinates,
  COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as missing_coordinates,
  COUNT(boundary) as has_boundary,  -- Replace 'boundary'
  ROUND(
    100.0 * COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) / COUNT(*),
    2
  ) as percent_with_coordinates
FROM parks;

-- Sample of parks that were updated
SELECT 
  id,
  name,
  latitude,
  longitude,
  CASE 
    WHEN boundary IS NOT NULL THEN 'Has boundary'  -- Replace 'boundary'
    ELSE 'No boundary'
  END as boundary_status
FROM parks
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL
ORDER BY id
LIMIT 20;
```

---

## Step 6: Update Vector Tiles Function

Now that all parks have lat/lng, simplify the vector tiles function:

```sql
-- Simplified function - all parks have lat/lng now
CREATE OR REPLACE FUNCTION parks_tiles(z int, x int, y int)
RETURNS bytea AS $$
DECLARE
  tile_bbox geometry;
  result bytea;
BEGIN
  tile_bbox = ST_TileEnvelope(z, x, y);
  tile_bbox = ST_Transform(tile_bbox, 4326);
  
  SELECT ST_AsMVT(q, 'parks', 4096, 'geom') INTO result
  FROM (
    SELECT
      id,
      name,
      agency,
      state,
      source_id,
      data_source,
      -- Simple: create point from lat/lng (all parks have these now)
      ST_AsMVTGeom(
        ST_Transform(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
          3857
        ),
        ST_TileEnvelope(z, x, y),
        4096,
        256,
        true
      ) AS geom
    FROM parks
    WHERE latitude IS NOT NULL 
      AND longitude IS NOT NULL
      AND ST_Intersects(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        tile_bbox
      )
  ) q;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## Step 7: Update API Route

The `/api/parks` route can also be simplified:

```javascript
// In app/api/parks/route.js
// Now we can simply query lat/lng - all parks have them

let query = supabaseServer
  .from('parks')
  .select('id, name, latitude, longitude, agency, state, source_id, data_source')
  .not('latitude', 'is', null)
  .not('longitude', 'is', null)

// No need to calculate centroids from boundaries anymore!
```

---

## Maintenance: Periodic Cleanup

Run this periodically to catch any parks that might have lost coordinates:

```sql
-- Monthly cleanup check
SELECT 
  COUNT(*) as parks_needing_coordinates
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND boundary IS NOT NULL  -- Replace 'boundary'
  AND ST_GeometryType(boundary::geometry) IN ('ST_Polygon', 'ST_MultiPolygon');  -- Replace 'boundary', cast to geometry

-- If count > 0, run the update:
UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(boundary::geometry)),  -- Replace 'boundary', cast to geometry
  longitude = ST_X(ST_Centroid(boundary::geometry))  -- Replace 'boundary', cast to geometry
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND boundary IS NOT NULL  -- Replace 'boundary'
  AND ST_GeometryType(boundary::geometry) IN ('ST_Polygon', 'ST_MultiPolygon');  -- Replace 'boundary', cast to geometry
```

---

## Benefits Summary

✅ **Simpler queries**: Always use lat/lng columns  
✅ **Better performance**: Indexed columns faster than geometry calculations  
✅ **Consistent data**: Every park has coordinates  
✅ **Cleaner code**: No need for centroid calculations in queries  
✅ **Easier debugging**: Coordinates visible in database  
✅ **Boundary separation**: Boundaries only loaded when viewing details  

---

## Migration Checklist

- [ ] Identify boundary column name
- [ ] Check current data status (Step 2)
- [ ] Run cleanup script (Step 3)
- [ ] Create trigger for future data (Step 4)
- [ ] Verify cleanup (Step 5)
- [ ] Update vector tiles function (Step 6)
- [ ] Update API routes (Step 7)
- [ ] Test map display
- [ ] Test boundary display in detail view

---

## Notes

- **Boundary data is preserved**: This only updates lat/lng, boundaries remain unchanged
- **No data loss**: Existing lat/lng values are kept
- **Reversible**: You can always recalculate from boundaries if needed
- **Performance**: Much faster than calculating centroids on-the-fly
