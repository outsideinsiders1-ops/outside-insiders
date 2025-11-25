-- Fix SC Parks Not Displaying on Map
-- The CSV shows all SC parks have coordinates, so they should display
-- This script checks for any issues that might prevent them from showing

-- 1. Verify SC parks have valid coordinates
SELECT 
  COUNT(*) as total_sc_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE 
    latitude IS NOT NULL AND longitude IS NOT NULL AND
    latitude >= -90 AND latitude <= 90 AND
    longitude >= -180 AND longitude <= 180
  ) as valid_coords
FROM parks
WHERE state = 'SC';

-- 2. Check for duplicate parks (might be causing issues)
SELECT 
  name,
  state,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as park_ids
FROM parks
WHERE state = 'SC'
GROUP BY name, state
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 3. Check if parks have invalid coordinate ranges
SELECT 
  id,
  name,
  latitude,
  longitude,
  'Invalid coordinates (out of range)' as issue
FROM parks
WHERE state = 'SC'
  AND (
    latitude IS NOT NULL AND (latitude < -90 OR latitude > 90) OR
    longitude IS NOT NULL AND (longitude < -180 OR longitude > 180)
  );

-- 4. Sample SC parks to verify they should display
SELECT 
  id,
  name,
  state,
  agency,
  latitude,
  longitude,
  CASE 
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL 
         AND latitude >= -90 AND latitude <= 90 
         AND longitude >= -180 AND longitude <= 180
    THEN 'Should display on map'
    ELSE 'Will NOT display (missing or invalid coordinates)'
  END as display_status
FROM parks
WHERE state = 'SC'
ORDER BY name
LIMIT 30;

