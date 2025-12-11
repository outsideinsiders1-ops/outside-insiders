# Vector Tiles Setup Checklist

## Pre-Implementation Check

Before starting, identify your current setup:

### 1. Check Your Geometry Column

Run this in Supabase SQL Editor:

```sql
-- Find all geometry columns
SELECT 
  f_geometry_column as column_name,
  type as geometry_type,
  coord_dimension,
  srid
FROM geometry_columns 
WHERE f_table_name = 'parks';

-- Check what data is in your geometry column
SELECT 
  id,
  name,
  CASE 
    WHEN boundary IS NOT NULL THEN ST_GeometryType(boundary)  -- Replace 'boundary' with your column name
    ELSE 'NULL'
  END as geometry_type,
  latitude,
  longitude
FROM parks
LIMIT 10;
```

### 2. Determine Your Approach

**Scenario A: You have a boundary geometry column (polygons)**
- ✅ Use Option A: Add `geom_point` column
- ✅ Populate from lat/lng OR boundary centroid
- ✅ Keep boundary separate for boundary display

**Scenario B: You want minimal schema changes**
- ✅ Use Option B: Calculate centroids in function
- ✅ No new columns needed
- ⚠️ Slightly slower performance

**Scenario C: You have both boundary AND point geometry**
- ✅ Use existing point geometry
- ✅ Skip Step 2.3-2.4
- ✅ Proceed to Step 3

### 3. Common Boundary Column Names

Your boundary column might be named:
- `boundary` (most common)
- `geom` 
- `geometry`
- `shape`
- `the_geom`

**Action**: Replace `'boundary'` in all SQL examples with your actual column name.

## Quick Start Decision Tree

```
Do you have a geometry column?
│
├─ YES → What type?
│   │
│   ├─ Point → Use it directly (skip to Step 3)
│   │
│   └─ Polygon/MultiPolygon → 
│       │
│       ├─ Want best performance? → Add geom_point column (Option A)
│       │
│       └─ Want minimal changes? → Use centroid in function (Option B)
│
└─ NO → Add geom_point column, populate from lat/lng
```

## Recommended Approach

**For best performance and flexibility:**

1. ✅ Add `geom_point` column (Step 2.3)
2. ✅ Populate from lat/lng first (Step 2.4 Strategy 1)
3. ✅ Fill gaps with boundary centroids (Step 2.4 Strategy 2)
4. ✅ Use `geom_point` in vector tile function (Step 3.2)
5. ✅ Keep boundary geometry for boundary display feature

This gives you:
- Fast vector tile queries (indexed point geometry)
- Accurate markers (lat/lng when available, centroid when not)
- Separate boundary data for boundary visualization
- No conflicts between marker points and boundaries

## Testing After Setup

```sql
-- Verify point geometry is populated
SELECT 
  COUNT(*) as total,
  COUNT(geom_point) as with_point_geom,
  COUNT(latitude) as with_lat_lng,
  COUNT(boundary) as with_boundary  -- Replace 'boundary'
FROM parks;

-- Test tile generation
SELECT 
  length(parks_tiles(10, 512, 512)) as tile_size_bytes,
  parks_tiles(10, 512, 512) IS NOT NULL as tile_generated
FROM parks
LIMIT 1;
```
