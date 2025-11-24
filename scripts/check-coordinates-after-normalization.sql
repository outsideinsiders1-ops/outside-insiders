-- Check if normalization script accidentally removed coordinates
-- This compares parks before/after normalization to see if coordinates were affected

-- 1. Check parks that might have lost coordinates during normalization
-- (This is unlikely since normalization only updated the 'state' column, but let's verify)
SELECT 
  state,
  COUNT(*) as total_parks,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE geometry IS NOT NULL) as has_geometry
FROM parks
WHERE state IN ('NC', 'SC', 'TN', 'GA')
GROUP BY state
ORDER BY state;

-- 2. Check if there are parks with state codes but missing coordinates
-- (These might have been affected if normalization somehow broke something)
SELECT 
  id,
  name,
  state,
  agency,
  latitude,
  longitude,
  geometry IS NOT NULL as has_geometry,
  created_at,
  updated_at
FROM parks
WHERE state IN ('NC', 'SC', 'TN', 'GA')
  AND (latitude IS NULL OR longitude IS NULL)
ORDER BY state, name
LIMIT 50;

-- 3. Check parks created/updated around the time normalization was run
-- (Look for patterns that might indicate normalization affected coordinates)
SELECT 
  DATE(updated_at) as update_date,
  COUNT(*) as parks_updated,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coords,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as without_coords
FROM parks
WHERE updated_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(updated_at)
ORDER BY update_date DESC;

-- 4. Verify normalization only affected state column (not coordinates)
-- This query should return 0 if normalization didn't touch coordinates
SELECT 
  'Parks where state was normalized but coordinates are missing' as check_type,
  COUNT(*) as count
FROM parks
WHERE state IN ('NC', 'SC', 'TN', 'GA') -- Normalized states
  AND (latitude IS NULL OR longitude IS NULL)
  AND updated_at >= NOW() - INTERVAL '7 days'; -- Recently updated

-- 5. Compare coordinate completeness before/after normalization
-- Parks with normalized state codes should still have their coordinates
SELECT 
  state,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) / COUNT(*), 1) as percent_with_coords
FROM parks
WHERE state IN ('NC', 'SC', 'TN', 'GA')
GROUP BY state
ORDER BY percent_with_coords, state;
