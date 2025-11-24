-- Check if normalization script accidentally removed coordinates
-- This script compares parks before/after normalization to see if coordinates were affected

-- 1. Check if any parks have NULL coordinates (these won't display on map)
SELECT 
  COUNT(*) as parks_with_null_coords
FROM parks
WHERE latitude IS NULL OR longitude IS NULL;

-- 2. Check parks by state that are missing coordinates
SELECT 
  state,
  COUNT(*) as total_parks,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords
FROM parks
WHERE state IN ('NC', 'SC', 'TN', 'GA')
GROUP BY state
ORDER BY state;

-- 3. Check if parks with geometry have coordinates
-- (If they have geometry but no coordinates, we can calculate centroids)
SELECT 
  state,
  COUNT(*) as parks_with_geometry_no_coords
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL
  AND state IN ('NC', 'SC', 'TN', 'GA')
GROUP BY state
ORDER BY state;

-- 4. Sample parks missing coordinates to see what happened
SELECT 
  id,
  name,
  state,
  agency,
  latitude,
  longitude,
  data_source,
  created_at,
  updated_at,
  CASE 
    WHEN geometry IS NOT NULL THEN 'Has geometry - can calculate centroid'
    WHEN address IS NOT NULL THEN 'Has address - can geocode'
    ELSE 'No geometry or address - needs manual geocoding'
  END as fix_option
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND state IN ('NC', 'SC', 'TN', 'GA')
ORDER BY state, name
LIMIT 50;

-- 5. Check recent uploads to see if coordinates were saved
SELECT 
  data_source,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as without_coords,
  ROUND(100.0 * COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) / COUNT(*), 1) as percent_with_coords
FROM parks
WHERE data_source LIKE '%PADUS%' OR data_source LIKE '%Federal%' OR data_source LIKE '%Southeast%'
GROUP BY data_source
ORDER BY data_source;

