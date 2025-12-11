-- Vector Tiles Setup SQL Script
-- Run these in order in Supabase SQL Editor

-- ============================================
-- STEP 1: Enable PostGIS (if not already enabled)
-- ============================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify PostGIS is enabled
SELECT PostGIS_version();

-- ============================================
-- STEP 2: Check Current Schema
-- ============================================
-- Find your boundary column name
SELECT 
  f_geometry_column as column_name,
  type as geometry_type,
  coord_dimension,
  srid
FROM geometry_columns 
WHERE f_table_name = 'parks';

-- Check if parks have coordinates
SELECT 
  COUNT(*) as total_parks,
  COUNT(latitude) as has_latitude,
  COUNT(longitude) as has_longitude,
  COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as has_both_coords
FROM parks;

-- ============================================
-- STEP 3: Create Vector Tile Function
-- ============================================
-- This function generates vector tiles for parks
-- It uses lat/lng columns (assumes cleanup will happen later)
-- For now, it only includes parks that have coordinates

CREATE OR REPLACE FUNCTION parks_tiles(z int, x int, y int)
RETURNS bytea AS $$
DECLARE
  tile_bbox geometry;
  result bytea;
BEGIN
  -- Calculate tile bounding box in Web Mercator (EPSG:3857)
  tile_bbox = ST_TileEnvelope(z, x, y);
  
  -- Transform to WGS84 (EPSG:4326) for query
  tile_bbox = ST_Transform(tile_bbox, 4326);
  
  -- Generate vector tile
  SELECT ST_AsMVT(q, 'parks', 4096, 'geom') INTO result
  FROM (
    SELECT
      id,
      name,
      agency,
      state,
      source_id,
      data_source,
      -- Use geom_point if it exists, otherwise create from lat/lng
      ST_AsMVTGeom(
        ST_Transform(
          COALESCE(
            geom_point,
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
          ),
          3857
        ),
        ST_TileEnvelope(z, x, y),
        4096,  -- tile extent
        256,   -- buffer (pixels)
        true   -- clip geometry
      ) AS geom
    FROM parks
    WHERE (
      geom_point IS NOT NULL 
      OR (latitude IS NOT NULL AND longitude IS NOT NULL)
    )
    AND ST_Intersects(
      COALESCE(
        geom_point,
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
      ),
      tile_bbox
    )
  ) q;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- STEP 4: Test the Function
-- ============================================
-- Test with a tile (zoom 10, x=512, y=512)
-- Should return binary data (bytea)
SELECT 
  parks_tiles(10, 512, 512) IS NOT NULL as tile_generated,
  length(parks_tiles(10, 512, 512)) as tile_size_bytes
FROM parks
LIMIT 1;

-- Test with different zoom levels
SELECT 
  z,
  x,
  y,
  length(parks_tiles(z, x, y)) as tile_size_bytes
FROM (
  VALUES (10, 512, 512), (12, 2048, 2048), (14, 8192, 8192)
) AS tiles(z, x, y);

-- ============================================
-- STEP 5: Create Indexes (if not exist)
-- ============================================
-- These indexes improve query performance

-- Index for lat/lng queries
CREATE INDEX IF NOT EXISTS idx_parks_lat_lng ON parks (latitude, longitude);

-- Composite index for viewport queries
CREATE INDEX IF NOT EXISTS idx_parks_bounds ON parks (latitude, longitude, state, agency);

-- Spatial index if you have geometry column
-- CREATE INDEX IF NOT EXISTS idx_parks_geom ON parks USING GIST (geom);

-- ============================================
-- STEP 6: Verify Setup
-- ============================================
-- Check function exists
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'parks_tiles';

-- Check indexes
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'parks'
  AND indexname LIKE 'idx_parks%';
