-- SQL Script to Fix Missing Coordinates for Parks
-- This calculates centroids from geometry for parks that have boundaries but no coordinates

-- WARNING: Only run this if you have parks with geometry but missing coordinates
-- This uses PostGIS to calculate the centroid from the boundary geometry

-- Step 1: Check how many parks need fixing
SELECT 
  state,
  COUNT(*) as parks_needing_coords
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
  AND (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL
GROUP BY state;

-- Step 2: Update parks with geometry but missing coordinates
-- This extracts the centroid (center point) from the geometry
UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(geometry::geometry)),
  longitude = ST_X(ST_Centroid(geometry::geometry))
WHERE state IN ('NC', 'SC', 'TN')
  AND (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL;

-- Step 3: Verify the updates
SELECT 
  state,
  COUNT(*) as parks_fixed,
  AVG(latitude) as avg_lat,
  AVG(longitude) as avg_lng
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
  AND latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND geometry IS NOT NULL
GROUP BY state;

-- Note: Parks without geometry cannot have coordinates calculated this way
-- Those parks will need coordinates added manually or from another data source

