-- Check SC Parks - Why aren't they displaying on map?
-- Parks need both latitude AND longitude to display

-- 1. Check SC parks coordinate status
SELECT 
  COUNT(*) as total_sc_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE geometry IS NOT NULL) as has_geometry,
  ROUND(100.0 * COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) / COUNT(*), 1) as percent_with_coords
FROM parks
WHERE state = 'SC';

-- 2. List SC parks missing coordinates
SELECT 
  id,
  name,
  state,
  agency,
  latitude,
  longitude,
  CASE 
    WHEN geometry IS NOT NULL THEN 'Has geometry - can calculate centroid'
    ELSE 'No geometry - needs geocoding'
  END as status
FROM parks
WHERE state = 'SC'
  AND (latitude IS NULL OR longitude IS NULL)
ORDER BY name
LIMIT 50;

-- 3. Check for invalid coordinates
SELECT 
  id,
  name,
  latitude,
  longitude,
  'Invalid coordinates (out of range)' as issue
FROM parks
WHERE state = 'SC'
  AND latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND (
    latitude < -90 OR latitude > 90 OR
    longitude < -180 OR longitude > 180
  );

-- 4. Sample SC parks with coordinates (to verify they exist)
SELECT 
  id,
  name,
  state,
  agency,
  latitude,
  longitude,
  'Has coordinates - should display' as status
FROM parks
WHERE state = 'SC'
  AND latitude IS NOT NULL 
  AND longitude IS NOT NULL
ORDER BY name
LIMIT 20;

