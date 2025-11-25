-- Analyze why parks aren't displaying on map
-- The map only shows parks with both latitude AND longitude

-- 1. Total parks vs parks with coordinates
SELECT 
  COUNT(*) as total_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as parks_with_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as parks_missing_coords,
  ROUND(100.0 * COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) / COUNT(*), 1) as percent_displayable
FROM parks;

-- 2. Parks by agency (to see which agencies have missing coordinates)
SELECT 
  agency,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords
FROM parks
GROUP BY agency
ORDER BY total DESC;

-- 3. Parks by state (to see which states have missing coordinates)
SELECT 
  state,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords
FROM parks
GROUP BY state
ORDER BY total DESC;

-- 4. Parks by data source (to see which sources have missing coordinates)
SELECT 
  data_source,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords
FROM parks
GROUP BY data_source
ORDER BY total DESC;

-- 5. Sample parks missing coordinates (to understand the pattern)
SELECT 
  id,
  name,
  state,
  agency,
  data_source,
  latitude,
  longitude,
  CASE 
    WHEN geometry IS NOT NULL THEN 'Has geometry - can calculate centroid'
    ELSE 'No geometry - needs geocoding'
  END as status
FROM parks
WHERE latitude IS NULL OR longitude IS NULL
ORDER BY data_source, state, name
LIMIT 50;

-- 6. Check for parks with invalid coordinates (out of range)
SELECT 
  id,
  name,
  state,
  latitude,
  longitude,
  'Invalid coordinates (out of range)' as issue
FROM parks
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND (
    latitude < -90 OR latitude > 90 OR
    longitude < -180 OR longitude > 180
  )
LIMIT 20;

-- 7. Parks with geometry but missing coordinates (can be fixed)
SELECT 
  COUNT(*) as parks_with_geometry_but_no_coords
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL;

-- 8. NPS parks specifically (from recent sync)
SELECT 
  COUNT(*) as total_nps_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as nps_with_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as nps_missing_coords
FROM parks
WHERE data_source = 'NPS API' OR agency = 'NPS';

