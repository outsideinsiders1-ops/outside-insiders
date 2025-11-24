-- SQL Script to Diagnose Why Parks Aren't Showing on Map
-- This checks for common issues that prevent parks from displaying

-- IMPORTANT: The map only displays parks with BOTH latitude AND longitude
-- Parks without coordinates won't show up on the map even if they exist in the database

-- 1. Check parks with missing coordinates (required for map pins)
SELECT 
  state,
  COUNT(*) as total_parks,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords,
  ROUND(100.0 * COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) / COUNT(*), 1) as percent_with_coords
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
GROUP BY state
ORDER BY state;

-- 2. Check parks with invalid coordinate ranges
SELECT 
  state,
  COUNT(*) as parks_with_invalid_coords
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
  AND (
    latitude IS NOT NULL AND (latitude < -90 OR latitude > 90)
    OR longitude IS NOT NULL AND (longitude < -180 OR longitude > 180)
  )
GROUP BY state;

-- 3. Check parks with missing geometry (boundaries won't show)
SELECT 
  state,
  COUNT(*) as total_parks,
  COUNT(*) FILTER (WHERE geometry IS NULL) as missing_geometry,
  COUNT(*) FILTER (WHERE geometry IS NOT NULL) as has_geometry
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
GROUP BY state
ORDER BY state;

-- 4. Sample parks from each state to verify data
SELECT 
  id,
  name,
  state,
  agency,
  latitude,
  longitude,
  CASE WHEN geometry IS NULL THEN 'No' ELSE 'Yes' END as has_boundary,
  data_source
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
ORDER BY state, name
LIMIT 30;

-- 5. Check if there are any parks with state codes that don't match expected values
SELECT DISTINCT state, COUNT(*) as count
FROM parks
WHERE state IN ('NC', 'SC', 'TN', 'North Carolina', 'South Carolina', 'Tennessee', 'N.C.', 'S.C.', 'T.N.')
GROUP BY state
ORDER BY state;

-- 6. Check total counts by state
SELECT 
  state,
  COUNT(*) as total_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as parks_with_coords,
  COUNT(*) FILTER (WHERE geometry IS NOT NULL) as parks_with_boundaries
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
GROUP BY state
ORDER BY state;

-- 7. List parks that are MISSING coordinates (these won't show on map)
SELECT 
  id,
  name,
  state,
  agency,
  latitude,
  longitude,
  data_source,
  'Missing coordinates - will not display on map' as issue
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
  AND (latitude IS NULL OR longitude IS NULL)
ORDER BY state, name
LIMIT 50;

-- 8. Calculate centroids from geometry for parks missing coordinates
-- This can help identify parks that have boundaries but no pin coordinates
SELECT 
  id,
  name,
  state,
  agency,
  latitude,
  longitude,
  CASE 
    WHEN geometry IS NOT NULL THEN 'Has boundary but missing coordinates'
    ELSE 'No boundary or coordinates'
  END as status
FROM parks
WHERE state IN ('NC', 'SC', 'TN')
  AND (latitude IS NULL OR longitude IS NULL)
ORDER BY state, name;

