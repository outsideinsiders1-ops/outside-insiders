-- SQL Script to Diagnose Why Parks Aren't Displaying on Web App
-- The web app filters out parks without latitude/longitude

-- 1. Check NPS parks specifically
SELECT 
    COUNT(*) as total_nps_parks,
    COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as nps_parks_with_coords,
    COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as nps_parks_missing_coords,
    COUNT(CASE WHEN data_source = 'NPS API' THEN 1 END) as nps_api_parks,
    COUNT(CASE WHEN data_source = 'NPS API' AND latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as nps_api_parks_with_coords
FROM parks
WHERE agency = 'NPS' OR data_source = 'NPS API';

-- 2. List NPS parks missing coordinates
SELECT 
    id,
    name,
    state,
    agency,
    data_source,
    latitude,
    longitude,
    CASE 
        WHEN geometry IS NOT NULL THEN 'Has geometry (can calculate centroid)'
        ELSE 'No geometry'
    END as geometry_status
FROM parks
WHERE (agency = 'NPS' OR data_source = 'NPS API')
  AND (latitude IS NULL OR longitude IS NULL)
ORDER BY name
LIMIT 50;

-- 3. Check parks by data source
SELECT 
    data_source,
    COUNT(*) as total_parks,
    COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as with_coords,
    COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as missing_coords,
    ROUND(100.0 * COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) / COUNT(*), 2) as percent_with_coords
FROM parks
WHERE data_source IS NOT NULL
GROUP BY data_source
ORDER BY total_parks DESC;

-- 4. Check if parks have geometry but no coordinates (can be fixed)
SELECT 
    COUNT(*) as parks_with_geometry_but_no_coords
FROM parks
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL;

-- 5. Sample of parks that should display but might not
SELECT 
    id,
    name,
    state,
    agency,
    data_source,
    latitude,
    longitude,
    CASE 
        WHEN latitude IS NULL OR longitude IS NULL THEN 'MISSING COORDS'
        WHEN ABS(latitude) > 90 OR ABS(longitude) > 180 THEN 'INVALID COORDS'
        ELSE 'OK'
    END as coord_status
FROM parks
WHERE (agency = 'NPS' OR data_source = 'NPS API')
ORDER BY name
LIMIT 20;

