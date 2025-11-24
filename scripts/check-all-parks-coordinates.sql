-- Comprehensive Check: All Parks and Their Coordinate Status
-- This helps identify why parks aren't displaying on the map

-- 1. Overall statistics
SELECT 
  COUNT(*) as total_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE geometry IS NOT NULL) as has_geometry,
  COUNT(*) FILTER (WHERE geometry IS NULL) as no_geometry,
  COUNT(*) FILTER (WHERE geometry IS NOT NULL AND (latitude IS NULL OR longitude IS NULL)) as has_geometry_but_no_coords
FROM parks;

-- 2. By state - see which states are affected
SELECT 
  state,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE geometry IS NOT NULL) as has_geometry,
  ROUND(100.0 * COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) / COUNT(*), 1) as percent_with_coords
FROM parks
GROUP BY state
ORDER BY 
  missing_coords DESC,
  state;

-- 3. Parks with geometry but missing coordinates (can be fixed with centroid calculation)
SELECT 
  id,
  name,
  state,
  agency,
  'Has geometry but missing coordinates - can calculate centroid' as status
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL
ORDER BY state, name
LIMIT 100;

-- 4. Parks without geometry or coordinates (need geocoding)
SELECT 
  id,
  name,
  state,
  agency,
  address,
  'No geometry or coordinates - needs geocoding' as status
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NULL
ORDER BY state, name
LIMIT 100;

-- 5. Check for invalid coordinates (out of range)
SELECT 
  id,
  name,
  state,
  latitude,
  longitude,
  'Invalid coordinates (out of valid range)' as issue
FROM parks
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND (
    latitude < -90 OR latitude > 90 OR
    longitude < -180 OR longitude > 180
  )
LIMIT 50;

-- 6. Recent uploads - check if coordinates were saved
SELECT 
  id,
  name,
  state,
  agency,
  data_source,
  latitude,
  longitude,
  CASE 
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 'Has coordinates'
    WHEN geometry IS NOT NULL THEN 'Has geometry, missing coordinates'
    ELSE 'Missing both'
  END as coordinate_status,
  created_at
FROM parks
WHERE data_source LIKE '%PADUS%' OR data_source LIKE '%Federal%'
ORDER BY created_at DESC
LIMIT 50;

