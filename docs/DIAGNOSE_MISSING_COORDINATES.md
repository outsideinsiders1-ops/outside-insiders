# Diagnose Parks Missing Coordinates and Boundaries

## Step 1: Investigate the 2115 Parks

Run this query to understand what data these parks have:

```sql
-- Check what data exists for parks without coordinates or boundaries
SELECT 
  COUNT(*) as total_missing,
  COUNT(CASE WHEN name IS NOT NULL THEN 1 END) as has_name,
  COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as has_address,
  COUNT(CASE WHEN state IS NOT NULL AND state != 'N/A' THEN 1 END) as has_state,
  COUNT(CASE WHEN city IS NOT NULL THEN 1 END) as has_city,
  COUNT(CASE WHEN website IS NOT NULL THEN 1 END) as has_website,
  COUNT(CASE WHEN source_id IS NOT NULL THEN 1 END) as has_source_id,
  COUNT(CASE WHEN data_source IS NOT NULL THEN 1 END) as has_data_source
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL);  -- Replace 'geometry' with your boundary column name
```

## Step 2: Sample the Data

```sql
-- See sample of parks missing coordinates
SELECT 
  id,
  name,
  state,
  city,
  address,
  agency,
  source_id,
  data_source,
  website,
  created_at
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL)  -- Replace 'geometry'
ORDER BY created_at DESC
LIMIT 20;
```

## Step 3: Check by Data Source

```sql
-- Group by data source to see where missing coordinates come from
SELECT 
  data_source,
  COUNT(*) as parks_missing_coords,
  COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as has_address,
  COUNT(CASE WHEN state IS NOT NULL AND state != 'N/A' THEN 1 END) as has_state,
  COUNT(CASE WHEN website IS NOT NULL THEN 1 END) as has_website
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL)  -- Replace 'geometry'
GROUP BY data_source
ORDER BY parks_missing_coords DESC;
```

## Step 4: Check by Agency

```sql
-- Group by agency to see if certain agencies have more missing data
SELECT 
  agency,
  COUNT(*) as parks_missing_coords,
  COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as has_address,
  COUNT(CASE WHEN state IS NOT NULL AND state != 'N/A' THEN 1 END) as has_state
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL)  -- Replace 'geometry'
GROUP BY agency
ORDER BY parks_missing_coords DESC
LIMIT 20;
```

## Step 5: Options for Handling

### Option A: Geocode from Address (If addresses exist)

If many parks have addresses, we can geocode them:

```sql
-- Check how many have geocodable addresses
SELECT 
  COUNT(*) as parks_with_address,
  COUNT(CASE WHEN state IS NOT NULL AND state != 'N/A' THEN 1 END) as parks_with_state
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL)  -- Replace 'geometry'
  AND address IS NOT NULL;
```

**If significant number have addresses:**
- Use Mapbox Geocoding API to geocode addresses
- Create an API endpoint to batch geocode
- Or use the existing geocoding functionality in admin panel

### Option B: Flag as Incomplete Data

Mark these parks so they're excluded from map display but kept in database:

```sql
-- Add a flag to mark incomplete parks
ALTER TABLE parks 
ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT true;

-- Mark parks without coordinates as incomplete
UPDATE parks
SET is_complete = false
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL);  -- Replace 'geometry'

-- Update map queries to exclude incomplete parks
-- In your API routes, add: .eq('is_complete', true)
```

### Option C: Delete Parks Without Coordinates

**⚠️ Only if these are truly invalid/incomplete records:**

```sql
-- First, backup or export these parks
SELECT * 
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL)  -- Replace 'geometry'
-- Export this data before deleting

-- Then delete (CAREFUL - this is permanent!)
-- DELETE FROM parks
-- WHERE 
--   (latitude IS NULL OR longitude IS NULL)
--   AND (geometry IS NULL OR geometry::geometry IS NULL);
```

### Option D: Manual Review Queue

Create a view for manual review:

```sql
-- Create view for parks needing manual review
CREATE OR REPLACE VIEW parks_needing_review AS
SELECT 
  id,
  name,
  state,
  city,
  address,
  agency,
  source_id,
  data_source,
  website,
  created_at
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL)  -- Replace 'geometry'
ORDER BY created_at DESC;

-- Query the view
SELECT * FROM parks_needing_review LIMIT 50;
```

## Step 6: Recommended Approach

Based on your data, here's what I recommend:

### 1. First, investigate the data:

```sql
-- Run all diagnostic queries above to understand the data
```

### 2. If parks have addresses → Geocode them

```sql
-- Check if geocoding is feasible
SELECT 
  COUNT(*) as total_missing,
  COUNT(CASE WHEN address IS NOT NULL AND state IS NOT NULL AND state != 'N/A' THEN 1 END) as geocodable
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL);  -- Replace 'geometry'
```

### 3. If no addresses → Flag as incomplete

```sql
-- Add flag and mark incomplete
ALTER TABLE parks 
ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT true;

UPDATE parks
SET is_complete = false
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL);  -- Replace 'geometry'
```

### 4. Update queries to exclude incomplete parks

Update your API routes to filter out incomplete parks:

```javascript
// In app/api/parks/route.js
let query = supabaseServer
  .from('parks')
  .select('id, name, latitude, longitude, agency, state, source_id, data_source')
  .eq('is_complete', true)  // Add this line
  .not('latitude', 'is', null)
  .not('longitude', 'is', null)
```

## Step 7: Batch Geocoding Script (If addresses exist)

If you want to geocode addresses in bulk, here's a script structure:

```javascript
// This would be a new API route: /api/admin/geocode-batch
// Or use the existing geocoding functionality

// Pseudo-code:
// 1. Fetch parks with addresses but no coordinates
// 2. For each park, geocode address using Mapbox
// 3. Update park with coordinates
// 4. Handle rate limiting (Mapbox has limits)
```

## Quick Decision Tree

```
Do the 2115 parks have addresses?
│
├─ YES → Geocode them (Option A)
│   │
│   └─ How many? 
│       ├─ < 100 → Use admin panel geocoding
│       └─ > 100 → Create batch geocoding script
│
└─ NO → 
    │
    ├─ Are they valid parks? 
    │   ├─ YES → Flag as incomplete, keep in DB (Option B)
    │   └─ NO → Delete them (Option C - careful!)
    │
    └─ Need manual review? → Create review queue (Option D)
```

## Next Steps

1. **Run the diagnostic queries** to understand your data
2. **Share the results** and we can decide the best approach
3. **Implement the chosen solution** (geocoding, flagging, or deletion)
