# Batch Geocode Parks with Addresses

## Overview

If your 2115 parks have addresses but are missing coordinates, we can geocode them using Mapbox Geocoding API.

## Step 1: Check Geocodable Parks

```sql
-- Count parks that can be geocoded
SELECT 
  COUNT(*) as total_missing,
  COUNT(CASE 
    WHEN address IS NOT NULL 
    AND state IS NOT NULL 
    AND state != 'N/A' 
    THEN 1 
  END) as can_geocode
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL);  -- Replace 'geometry'
```

## Step 2: Create Batch Geocoding API Route

Create: `app/api/admin/geocode-batch/route.js`

```javascript
/**
 * Batch geocode parks with addresses but missing coordinates
 */

import { supabaseServer } from '../../../../lib/supabase-server.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

export async function POST(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100') // Default 100 at a time
    const dryRun = searchParams.get('dryRun') === 'true'

    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN

    if (!MAPBOX_TOKEN) {
      return Response.json({
        success: false,
        error: 'Mapbox token not configured'
      }, { status: 500, headers })
    }

    // Fetch parks with addresses but no coordinates
    const { data: parks, error: fetchError } = await supabaseServer
      .from('parks')
      .select('id, name, address, state, city')
      .or('latitude.is.null,longitude.is.null')
      .not('address', 'is', null)
      .not('state', 'is', null)
      .neq('state', 'N/A')
      .limit(limit)

    if (fetchError) {
      return Response.json({
        success: false,
        error: 'Failed to fetch parks',
        message: fetchError.message
      }, { status: 500, headers })
    }

    if (!parks || parks.length === 0) {
      return Response.json({
        success: true,
        message: 'No parks found that need geocoding',
        geocoded: 0,
        failed: 0
      }, { status: 200, headers })
    }

    const results = {
      total: parks.length,
      geocoded: 0,
      failed: 0,
      errors: []
    }

    // Geocode each park
    for (const park of parks) {
      try {
        // Build geocoding query
        let query = park.address
        if (park.city) {
          query += `, ${park.city}`
        }
        if (park.state && park.state !== 'N/A') {
          query += `, ${park.state}, USA`
        }

        // Geocode using Mapbox
        const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
        
        const response = await fetch(geocodeUrl)
        if (!response.ok) {
          throw new Error(`Geocoding API error: ${response.statusText}`)
        }

        const data = await response.json()
        
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center

          if (!dryRun) {
            // Update park with coordinates
            const { error: updateError } = await supabaseServer
              .from('parks')
              .update({
                longitude: lng,
                latitude: lat
              })
              .eq('id', park.id)

            if (updateError) {
              throw new Error(`Update failed: ${updateError.message}`)
            }
          }

          results.geocoded++
        } else {
          results.failed++
          results.errors.push({
            park: park.name,
            id: park.id,
            error: 'No results from geocoding'
          })
        }

        // Rate limiting - Mapbox allows 600 requests per minute
        // Wait 100ms between requests to stay under limit
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        results.failed++
        results.errors.push({
          park: park.name,
          id: park.id,
          error: error.message
        })
        console.error(`Geocoding failed for park ${park.id}:`, error)
      }
    }

    return Response.json({
      success: true,
      message: dryRun 
        ? `Dry run: Would geocode ${results.geocoded} of ${results.total} parks`
        : `Geocoded ${results.geocoded} of ${results.total} parks`,
      ...results
    }, { status: 200, headers })

  } catch (error) {
    console.error('Batch geocoding error:', error)
    return Response.json({
      success: false,
      error: 'Internal server error',
      message: error.message
    }, { status: 500, headers })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
```

## Step 3: Use the Batch Geocoding

### Option A: Via Admin Panel

Add a button in your admin panel to trigger batch geocoding.

### Option B: Via API Call

```bash
# Dry run first (see what would be geocoded)
curl -X POST "http://localhost:3000/api/admin/geocode-batch?limit=100&dryRun=true"

# Actually geocode (100 at a time)
curl -X POST "http://localhost:3000/api/admin/geocode-batch?limit=100"
```

## Step 4: Handle Rate Limits

Mapbox Geocoding API limits:
- **600 requests per minute**
- **100ms delay = ~10 requests/second = safe**

The script includes 100ms delay between requests.

For 2115 parks:
- **Time needed**: ~3.5 minutes (at 10 req/sec)
- **Run in batches**: Process 100-200 at a time to avoid timeouts

## Step 5: Monitor Progress

```sql
-- Check progress
SELECT 
  COUNT(*) as still_missing,
  COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as has_address_but_missing
FROM parks
WHERE 
  (latitude IS NULL OR longitude IS NULL)
  AND (geometry IS NULL OR geometry::geometry IS NULL);  -- Replace 'geometry'
```
