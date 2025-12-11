-- Quick Fix: Data Cleanup for Geography Type Columns
-- This handles the case where your boundary column is 'geography' type instead of 'geometry'
-- Replace 'geometry' with your actual boundary column name

-- Step 1: Check your column type
SELECT 
  column_name,
  udt_name,
  data_type
FROM information_schema.columns 
WHERE table_name = 'parks' 
  AND (udt_name = 'geometry' OR udt_name = 'geography' OR column_name LIKE '%boundary%' OR column_name LIKE '%geom%');

-- Step 2: Update parks missing coordinates (handles geography type)
-- Replace 'geometry' with your actual boundary column name

UPDATE parks
SET 
  latitude = ST_Y(ST_Centroid(geometry::geometry)),  -- Replace 'geometry' with your column name
  longitude = ST_X(ST_Centroid(geometry::geometry))  -- Replace 'geometry' with your column name
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND geometry IS NOT NULL  -- Replace 'geometry' with your column name
  AND ST_GeometryType(geometry::geometry) IN ('ST_Polygon', 'ST_MultiPolygon');  -- Replace 'geometry'

-- Step 3: Verify the update
SELECT 
  COUNT(*) as total_parks,
  COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as has_coordinates,
  COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as missing_coordinates,
  ROUND(
    100.0 * COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) / COUNT(*),
    2
  ) as percent_with_coordinates
FROM parks;
