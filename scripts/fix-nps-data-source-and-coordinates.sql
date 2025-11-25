-- Fix NPS API data_source and coordinate issues
-- This script helps diagnose and fix parks that should have NPS API as data_source
-- and parks that are missing coordinates

-- 1. Check current state: How many parks have NPS API as data_source?
SELECT 
  COUNT(*) FILTER (WHERE data_source = 'NPS API') as nps_api_parks,
  COUNT(*) FILTER (WHERE data_source = 'PADUS') as padus_parks,
  COUNT(*) FILTER (WHERE data_source IS NULL) as null_source_parks,
  COUNT(*) FILTER (WHERE agency = 'NPS' AND data_source != 'NPS API') as nps_agency_wrong_source,
  COUNT(*) as total_parks
FROM parks;

-- 2. Find parks with NPS agency but wrong data_source (should be 'NPS API')
SELECT 
  id,
  name,
  state,
  agency,
  data_source,
  data_source_priority,
  latitude,
  longitude
FROM parks
WHERE agency = 'NPS' 
  AND (data_source != 'NPS API' OR data_source IS NULL)
ORDER BY name
LIMIT 50;

-- 3. Update data_source for parks with NPS agency to 'NPS API'
-- (Only if they don't already have a higher priority source)
UPDATE parks
SET 
  data_source = 'NPS API',
  data_source_priority = 100,
  last_updated = NOW()
WHERE agency = 'NPS' 
  AND (data_source != 'NPS API' OR data_source IS NULL)
  AND (data_source_priority IS NULL OR data_source_priority < 100);

-- 4. Check how many parks are missing coordinates
SELECT 
  COUNT(*) as total_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE (latitude IS NULL OR longitude IS NULL) AND geometry IS NOT NULL) as missing_coords_but_has_geometry
FROM parks;

-- 5. Parks with geometry but missing coordinates (can calculate centroid)
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
    ELSE 'No geometry'
  END as status
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL
ORDER BY data_source, state, name
LIMIT 100;

-- 6. Calculate and update coordinates from geometry for parks missing coordinates
-- This uses PostGIS ST_Centroid to get the center point
UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(geometry)),
  longitude = ST_X(ST_Centroid(geometry)),
  last_updated = NOW()
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL
  AND ST_IsValid(geometry);

-- 7. Verify the updates
SELECT 
  'After updates' as status,
  COUNT(*) FILTER (WHERE data_source = 'NPS API') as nps_api_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as parks_with_coords,
  COUNT(*) FILTER (WHERE agency = 'NPS' AND data_source = 'NPS API') as nps_parks_with_correct_source
FROM parks;

-- 8. Sample of parks that should now display on map (have coordinates)
SELECT 
  name,
  state,
  agency,
  data_source,
  latitude,
  longitude
FROM parks
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND agency = 'NPS'
ORDER BY name
LIMIT 20;

