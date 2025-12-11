-- Debug Vector Tiles - Find Why Tiles Are Empty

-- ============================================
-- STEP 1: Check if parks have coordinates
-- ============================================
SELECT 
  COUNT(*) as total_parks,
  COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as has_coordinates,
  COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as missing_coordinates
FROM parks;

-- ============================================
-- STEP 2: Check tile bounds for zoom 10, x=512, y=512
-- ============================================
-- This shows what geographic area the tile covers
SELECT 
  ST_AsText(ST_Transform(ST_TileEnvelope(10, 512, 512), 4326)) as tile_bounds_wgs84,
  ST_AsText(ST_TileEnvelope(10, 512, 512)) as tile_bounds_mercator;

-- Get bounds as lat/lng box
WITH tile_bounds AS (
  SELECT ST_Transform(ST_TileEnvelope(10, 512, 512), 4326) as bbox
)
SELECT 
  ST_YMin(bbox) as south,
  ST_YMax(bbox) as north,
  ST_XMin(bbox) as west,
  ST_XMax(bbox) as east
FROM tile_bounds;

-- ============================================
-- STEP 3: Check if any parks are in this tile
-- ============================================
WITH tile_bounds AS (
  SELECT ST_Transform(ST_TileEnvelope(10, 512, 512), 4326) as bbox
)
SELECT 
  COUNT(*) as parks_in_tile
FROM parks, tile_bounds
WHERE 
  latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND ST_Intersects(
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
    tile_bounds.bbox
  );

-- ============================================
-- STEP 4: Find parks in a specific area (e.g., where you know parks exist)
-- ============================================
-- Check parks in a known area (adjust bounds to your data)
SELECT 
  COUNT(*) as parks_in_area,
  MIN(latitude) as min_lat,
  MAX(latitude) as max_lat,
  MIN(longitude) as min_lng,
  MAX(longitude) as max_lng
FROM parks
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================
-- STEP 5: Test tile for a specific area
-- ============================================
-- Find tile coordinates for a known park location
-- Replace with actual lat/lng from your data
WITH park_location AS (
  SELECT 
    ST_SetSRID(ST_MakePoint(-83.0, 35.5), 4326) as point  -- Example: Western NC
)
SELECT 
  z,
  x,
  y,
  ST_AsText(ST_Transform(ST_TileEnvelope(z, x, y), 4326)) as tile_bounds
FROM 
  park_location,
  generate_series(8, 12) as z
CROSS JOIN LATERAL (
  SELECT 
    floor((ST_X(ST_Transform(point, 3857)) + 20037508.34) / (40075016.68 / pow(2, z)))::int as x,
    floor((20037508.34 - ST_Y(ST_Transform(point, 3857))) / (40075016.68 / pow(2, z)))::int as y
) tile_coords;

-- ============================================
-- STEP 6: Test function with actual data bounds
-- ============================================
-- First, find where your parks actually are
SELECT 
  MIN(latitude) as min_lat,
  MAX(latitude) as max_lat,
  MIN(longitude) as min_lng,
  MAX(longitude) as max_lng,
  AVG(latitude) as avg_lat,
  AVG(longitude) as avg_lng
FROM parks
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Then calculate tile coordinates for that center point
-- Use the avg_lat and avg_lng from above
WITH center_point AS (
  SELECT ST_SetSRID(ST_MakePoint(
    -83.0,  -- Replace with your avg_lng
    35.5    -- Replace with your avg_lat
  ), 4326) as point
),
tile_coords AS (
  SELECT 
    10 as z,
    floor((ST_X(ST_Transform(point, 3857)) + 20037508.34) / (40075016.68 / pow(2, 10)))::int as x,
    floor((20037508.34 - ST_Y(ST_Transform(point, 3857))) / (40075016.68 / pow(2, 10)))::int as y
  FROM center_point
)
SELECT 
  z, x, y,
  parks_tiles(z, x, y) IS NOT NULL as tile_generated,
  length(parks_tiles(z, x, y)) as tile_size_bytes
FROM tile_coords;

-- ============================================
-- STEP 7: Test function directly with sample data
-- ============================================
-- Check if the function logic works with actual park data
SELECT 
  id,
  name,
  latitude,
  longitude,
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) as point_geom
FROM parks
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
LIMIT 5;

-- ============================================
-- STEP 8: Manual tile generation test
-- ============================================
-- Test the exact query from the function
WITH tile_bounds AS (
  SELECT ST_Transform(ST_TileEnvelope(10, 512, 512), 4326) as bbox
)
SELECT
  COUNT(*) as parks_found,
  array_agg(name) as park_names
FROM parks, tile_bounds
WHERE 
  latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND ST_Intersects(
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
    tile_bounds.bbox
  )
LIMIT 10;
