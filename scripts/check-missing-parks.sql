-- SQL Script to Check for Missing Parks After State Normalization
-- This helps identify if parks were incorrectly updated during normalization

-- Check parks by state code
SELECT state, COUNT(*) as count
FROM parks
GROUP BY state
ORDER BY state;

-- Check for parks that might have been incorrectly normalized
-- Look for any state values that are not 2-letter codes
SELECT DISTINCT state, COUNT(*) as count
FROM parks
WHERE LENGTH(TRIM(state)) != 2 OR state !~ '^[A-Z]{2}$'
GROUP BY state
ORDER BY state;

-- Check specific states that were mentioned as missing
SELECT COUNT(*) as count, state
FROM parks
WHERE state IN ('SC', 'NC', 'TN')
GROUP BY state;

-- Check for parks with state codes that might have been overwritten
-- This shows parks that might need manual review
SELECT id, name, state, agency, data_source
FROM parks
WHERE state IN ('SC', 'NC', 'TN')
ORDER BY state, name
LIMIT 50;

