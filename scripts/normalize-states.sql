-- SQL Script to Normalize State Names to State Codes
-- Run this in your Supabase SQL Editor to update all existing parks
-- This converts full state names (e.g., "Georgia", "North Carolina") to 2-letter codes (e.g., "GA", "NC")

-- First, let's see what states we currently have
SELECT DISTINCT state, COUNT(*) as count
FROM parks
GROUP BY state
ORDER BY state;

-- Update states to 2-letter codes
-- Alabama
UPDATE parks SET state = 'AL' WHERE UPPER(TRIM(state)) IN ('ALABAMA', 'AL');

-- Alaska
UPDATE parks SET state = 'AK' WHERE UPPER(TRIM(state)) IN ('ALASKA', 'AK');

-- Arizona
UPDATE parks SET state = 'AZ' WHERE UPPER(TRIM(state)) IN ('ARIZONA', 'AZ');

-- Arkansas
UPDATE parks SET state = 'AR' WHERE UPPER(TRIM(state)) IN ('ARKANSAS', 'AR');

-- California
UPDATE parks SET state = 'CA' WHERE UPPER(TRIM(state)) IN ('CALIFORNIA', 'CA');

-- Colorado
UPDATE parks SET state = 'CO' WHERE UPPER(TRIM(state)) IN ('COLORADO', 'CO');

-- Connecticut
UPDATE parks SET state = 'CT' WHERE UPPER(TRIM(state)) IN ('CONNECTICUT', 'CT');

-- Delaware
UPDATE parks SET state = 'DE' WHERE UPPER(TRIM(state)) IN ('DELAWARE', 'DE');

-- Florida
UPDATE parks SET state = 'FL' WHERE UPPER(TRIM(state)) IN ('FLORIDA', 'FL');

-- Georgia
UPDATE parks SET state = 'GA' WHERE UPPER(TRIM(state)) IN ('GEORGIA', 'GA');

-- Hawaii
UPDATE parks SET state = 'HI' WHERE UPPER(TRIM(state)) IN ('HAWAII', 'HI');

-- Idaho
UPDATE parks SET state = 'ID' WHERE UPPER(TRIM(state)) IN ('IDAHO', 'ID');

-- Illinois
UPDATE parks SET state = 'IL' WHERE UPPER(TRIM(state)) IN ('ILLINOIS', 'IL');

-- Indiana
UPDATE parks SET state = 'IN' WHERE UPPER(TRIM(state)) IN ('INDIANA', 'IN');

-- Iowa
UPDATE parks SET state = 'IA' WHERE UPPER(TRIM(state)) IN ('IOWA', 'IA');

-- Kansas
UPDATE parks SET state = 'KS' WHERE UPPER(TRIM(state)) IN ('KANSAS', 'KS');

-- Kentucky
UPDATE parks SET state = 'KY' WHERE UPPER(TRIM(state)) IN ('KENTUCKY', 'KY');

-- Louisiana
UPDATE parks SET state = 'LA' WHERE UPPER(TRIM(state)) IN ('LOUISIANA', 'LA');

-- Maine
UPDATE parks SET state = 'ME' WHERE UPPER(TRIM(state)) IN ('MAINE', 'ME');

-- Maryland
UPDATE parks SET state = 'MD' WHERE UPPER(TRIM(state)) IN ('MARYLAND', 'MD');

-- Massachusetts
UPDATE parks SET state = 'MA' WHERE UPPER(TRIM(state)) IN ('MASSACHUSETTS', 'MA');

-- Michigan
UPDATE parks SET state = 'MI' WHERE UPPER(TRIM(state)) IN ('MICHIGAN', 'MI');

-- Minnesota
UPDATE parks SET state = 'MN' WHERE UPPER(TRIM(state)) IN ('MINNESOTA', 'MN');

-- Mississippi
UPDATE parks SET state = 'MS' WHERE UPPER(TRIM(state)) IN ('MISSISSIPPI', 'MS');

-- Missouri
UPDATE parks SET state = 'MO' WHERE UPPER(TRIM(state)) IN ('MISSOURI', 'MO');

-- Montana
UPDATE parks SET state = 'MT' WHERE UPPER(TRIM(state)) IN ('MONTANA', 'MT');

-- Nebraska
UPDATE parks SET state = 'NE' WHERE UPPER(TRIM(state)) IN ('NEBRASKA', 'NE');

-- Nevada
UPDATE parks SET state = 'NV' WHERE UPPER(TRIM(state)) IN ('NEVADA', 'NV');

-- New Hampshire
UPDATE parks SET state = 'NH' WHERE UPPER(TRIM(state)) IN ('NEW HAMPSHIRE', 'NH');

-- New Jersey
UPDATE parks SET state = 'NJ' WHERE UPPER(TRIM(state)) IN ('NEW JERSEY', 'NJ');

-- New Mexico
UPDATE parks SET state = 'NM' WHERE UPPER(TRIM(state)) IN ('NEW MEXICO', 'NM');

-- New York
UPDATE parks SET state = 'NY' WHERE UPPER(TRIM(state)) IN ('NEW YORK', 'NY');

-- North Carolina
UPDATE parks SET state = 'NC' WHERE UPPER(TRIM(state)) IN ('NORTH CAROLINA', 'NC', 'N. CAROLINA', 'N CAROLINA');

-- North Dakota
UPDATE parks SET state = 'ND' WHERE UPPER(TRIM(state)) IN ('NORTH DAKOTA', 'ND', 'N. DAKOTA', 'N DAKOTA');

-- Ohio
UPDATE parks SET state = 'OH' WHERE UPPER(TRIM(state)) IN ('OHIO', 'OH');

-- Oklahoma
UPDATE parks SET state = 'OK' WHERE UPPER(TRIM(state)) IN ('OKLAHOMA', 'OK');

-- Oregon
UPDATE parks SET state = 'OR' WHERE UPPER(TRIM(state)) IN ('OREGON', 'OR');

-- Pennsylvania
UPDATE parks SET state = 'PA' WHERE UPPER(TRIM(state)) IN ('PENNSYLVANIA', 'PA');

-- Rhode Island
UPDATE parks SET state = 'RI' WHERE UPPER(TRIM(state)) IN ('RHODE ISLAND', 'RI');

-- South Carolina
UPDATE parks SET state = 'SC' WHERE UPPER(TRIM(state)) IN ('SOUTH CAROLINA', 'SC', 'S. CAROLINA', 'S CAROLINA');

-- South Dakota
UPDATE parks SET state = 'SD' WHERE UPPER(TRIM(state)) IN ('SOUTH DAKOTA', 'SD', 'S. DAKOTA', 'S DAKOTA');

-- Tennessee
UPDATE parks SET state = 'TN' WHERE UPPER(TRIM(state)) IN ('TENNESSEE', 'TN');

-- Texas
UPDATE parks SET state = 'TX' WHERE UPPER(TRIM(state)) IN ('TEXAS', 'TX');

-- Utah
UPDATE parks SET state = 'UT' WHERE UPPER(TRIM(state)) IN ('UTAH', 'UT');

-- Vermont
UPDATE parks SET state = 'VT' WHERE UPPER(TRIM(state)) IN ('VERMONT', 'VT');

-- Virginia
UPDATE parks SET state = 'VA' WHERE UPPER(TRIM(state)) IN ('VIRGINIA', 'VA');

-- Washington
UPDATE parks SET state = 'WA' WHERE UPPER(TRIM(state)) IN ('WASHINGTON', 'WA');

-- West Virginia
UPDATE parks SET state = 'WV' WHERE UPPER(TRIM(state)) IN ('WEST VIRGINIA', 'WV', 'W. VIRGINIA', 'W VIRGINIA');

-- Wisconsin
UPDATE parks SET state = 'WI' WHERE UPPER(TRIM(state)) IN ('WISCONSIN', 'WI');

-- Wyoming
UPDATE parks SET state = 'WY' WHERE UPPER(TRIM(state)) IN ('WYOMING', 'WY');

-- District of Columbia
UPDATE parks SET state = 'DC' WHERE UPPER(TRIM(state)) IN ('DISTRICT OF COLUMBIA', 'WASHINGTON DC', 'DC', 'WASHINGTON D.C.', 'WASHINGTON D C');

-- Verify the results
SELECT DISTINCT state, COUNT(*) as count
FROM parks
GROUP BY state
ORDER BY state;

-- Check for any remaining non-standard state values (should be empty or only valid codes)
SELECT DISTINCT state, COUNT(*) as count
FROM parks
WHERE LENGTH(TRIM(state)) != 2 OR state !~ '^[A-Z]{2}$'
GROUP BY state
ORDER BY state;

