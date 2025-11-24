-- SQL Script to Geocode Parks Missing Coordinates
-- This uses PostGIS to calculate centroids from geometry, then falls back to manual geocoding
-- 
-- IMPORTANT: This script calculates centroids for parks with geometry.
-- For parks without geometry, you'll need to use the Node.js script with Mapbox API.

-- Step 1: Check parks with geometry but missing coordinates
SELECT 
  state,
  COUNT(*) as parks_with_geometry_no_coords
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL
GROUP BY state
ORDER BY state;

-- Step 2: Calculate centroids from geometry for parks missing coordinates
-- This uses PostGIS ST_Centroid function
UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(geometry::geometry)),
  longitude = ST_X(ST_Centroid(geometry::geometry))
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL;

-- Step 3: Verify the updates
SELECT 
  state,
  COUNT(*) as parks_fixed,
  AVG(latitude) as avg_lat,
  AVG(longitude) as avg_lng
FROM parks
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND geometry IS NOT NULL
  AND (latitude != ST_Y(ST_Centroid(geometry::geometry)) OR 
       longitude != ST_X(ST_Centroid(geometry::geometry)))
GROUP BY state;

-- Step 4: Check remaining parks still missing coordinates
SELECT 
  state,
  COUNT(*) as still_missing_coords,
  COUNT(*) FILTER (WHERE geometry IS NOT NULL) as has_geometry,
  COUNT(*) FILTER (WHERE geometry IS NULL) as no_geometry
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
GROUP BY state
ORDER BY state;

-- Step 5: List parks that still need manual geocoding (no geometry)
SELECT 
  id,
  name,
  state,
  agency,
  address,
  'Needs manual geocoding - no geometry available' as status
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NULL
ORDER BY state, name
LIMIT 50;

