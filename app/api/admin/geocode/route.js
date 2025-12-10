/**
 * API Route: /api/admin/geocode
 * Geocodes parks missing coordinates using Mapbox Geocoding API
 * Can be called from the admin panel instead of running Node.js script
 */

import { supabaseServer } from '../../../../lib/supabase-server.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for large batches

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN

export async function POST(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    if (!MAPBOX_TOKEN) {
      return Response.json({
        success: false,
        error: 'Mapbox token not configured',
        message: 'NEXT_PUBLIC_MAPBOX_TOKEN environment variable is required'
      }, { status: 500, headers })
    }

    const body = await request.json().catch(() => ({}))
    const { 
      limit = 50, // Process 50 parks at a time by default
      state = null, // Optional: filter by state
      useGeometry = true, // Try to calculate from geometry first
      geocodeType = 'coordinates' // 'coordinates' or 'state'
    } = body

    console.log('=== GEOCODING REQUEST ===')
    console.log(`Limit: ${limit}, State: ${state || 'All'}, Use Geometry: ${useGeometry}, Type: ${geocodeType}`)

    // Step 1: Find parks missing coordinates OR missing state (N/A)
    let query
    if (geocodeType === 'state') {
      // Find parks with N/A state but with coordinates
      query = supabaseServer
        .from('parks')
        .select('id, name, state, address, latitude, longitude, geometry')
        .eq('state', 'N/A')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(limit)
    } else {
      // Find parks missing coordinates
      query = supabaseServer
        .from('parks')
        .select('id, name, state, address, latitude, longitude, geometry')
        .or('latitude.is.null,longitude.is.null')
        .limit(limit)
    }

    if (state) {
      query = query.eq('state', state)
    }

    const { data: parks, error: fetchError } = await query

    if (fetchError) {
      console.error('Error fetching parks:', fetchError)
      return Response.json({
        success: false,
        error: 'Failed to fetch parks',
        message: fetchError.message
      }, { status: 500, headers })
    }

    if (!parks || parks.length === 0) {
      return Response.json({
        success: true,
        message: geocodeType === 'state' 
          ? 'No parks found missing state' 
          : 'No parks found missing coordinates',
        parksProcessed: 0,
        parksFixed: 0,
        parksSkipped: 0
      }, { status: 200, headers })
    }

    console.log(`Found ${parks.length} parks ${geocodeType === 'state' ? 'missing state' : 'missing coordinates'}`)

    let successCount = 0
    let failedCount = 0
    let skippedCount = 0
    const errors = []

    // Step 2: Process each park
    for (let i = 0; i < parks.length; i++) {
      const park = parks[i]
      console.log(`[${i + 1}/${parks.length}] Processing: ${park.name} (${park.state || 'no state'})`)

      if (geocodeType === 'state') {
        // Reverse geocode to get state from coordinates
        if (!park.latitude || !park.longitude) {
          console.log(`  ⚠️  Missing coordinates, cannot reverse geocode`)
          skippedCount++
          continue
        }

        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${park.longitude},${park.latitude}.json?access_token=${MAPBOX_TOKEN}&limit=1`
          const response = await fetch(url)
          
          if (!response.ok) {
            throw new Error(`Geocoding API error: ${response.status}`)
          }

          const data = await response.json()

          if (data.features && data.features.length > 0) {
            const feature = data.features[0]
            const context = feature.context || []
            
            // Look for region (state) in context
            const region = context.find(c => {
              const id = c.id || ''
              return id.startsWith('region.') || id.startsWith('region')
            })
            
            if (region && region.short_code) {
              // Extract state code from "US-CA" format
              const stateCode = region.short_code.replace('US-', '').toUpperCase()
              if (stateCode.length === 2) {
                // Update park with state
                const { error: updateError } = await supabaseServer
                  .from('parks')
                  .update({ state: stateCode })
                  .eq('id', park.id)

                if (updateError) {
                  console.error(`  ❌ Failed to update: ${updateError.message}`)
                  failedCount++
                  errors.push({ park: park.name, error: updateError.message })
                } else {
                  console.log(`  ✅ Geocoded state: ${stateCode}`)
                  successCount++
                }
              } else {
                console.log(`  ⚠️  Could not extract state code`)
                skippedCount++
              }
            } else {
              console.log(`  ⚠️  Could not find state in geocoding response`)
              skippedCount++
            }
          } else {
            console.log(`  ⚠️  No geocoding results`)
            skippedCount++
          }
        } catch (error) {
          console.warn(`  ⚠️  Reverse geocoding error: ${error.message}`)
          failedCount++
          errors.push({ park: park.name, error: error.message })
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }

      // Original logic for geocoding coordinates
      let coords = null

      // First, try to calculate from geometry if available
      if (useGeometry && park.geometry) {
        try {
          // For PostGIS, we'd use ST_Centroid, but here we'll calculate from GeoJSON
          if (park.geometry.type === 'Polygon' || park.geometry.type === 'MultiPolygon') {
            const coordsArray = park.geometry.coordinates
            let allLngs = []
            let allLats = []

            if (park.geometry.type === 'Polygon') {
              for (const ring of coordsArray) {
                for (const coord of ring) {
                  allLngs.push(coord[0])
                  allLats.push(coord[1])
                }
              }
            } else if (park.geometry.type === 'MultiPolygon') {
              for (const polygon of coordsArray) {
                for (const ring of polygon) {
                  for (const coord of ring) {
                    allLngs.push(coord[0])
                    allLats.push(coord[1])
                  }
                }
              }
            }

            if (allLngs.length > 0 && allLats.length > 0) {
              coords = {
                latitude: allLats.reduce((a, b) => a + b, 0) / allLats.length,
                longitude: allLngs.reduce((a, b) => a + b, 0) / allLngs.length
              }
              console.log(`  ✅ Calculated from geometry: (${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})`)
            }
          }
        } catch (error) {
          console.warn(`  ⚠️  Could not calculate from geometry: ${error.message}`)
        }
      }

      // If no geometry or calculation failed, try geocoding
      if (!coords) {
        try {
          const query = park.address || `${park.name}, ${park.state}`
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=poi,address`

          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`Geocoding API error: ${response.status}`)
          }

          const data = await response.json()

          if (data.features && data.features.length > 0) {
            const feature = data.features[0]
            const relevance = feature.relevance || 0

            if (relevance >= 0.7) {
              const [lng, lat] = feature.center
              coords = { latitude: lat, longitude: lng, relevance }
              console.log(`  ✅ Geocoded: (${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}) - Relevance: ${relevance.toFixed(2)}`)
            } else {
              console.warn(`  ⚠️  Low relevance (${relevance.toFixed(2)}): ${feature.place_name}`)
            }
          }
        } catch (error) {
          console.warn(`  ⚠️  Geocoding error: ${error.message}`)
        }
      }

      // Update park if we found coordinates
      if (coords) {
        const { error: updateError } = await supabaseServer
          .from('parks')
          .update({
            latitude: coords.latitude,
            longitude: coords.longitude
          })
          .eq('id', park.id)

        if (updateError) {
          console.error(`  ❌ Failed to update: ${updateError.message}`)
          failedCount++
          errors.push({ park: park.name, error: updateError.message })
        } else {
          successCount++
        }
      } else {
        console.log(`  ⚠️  Could not find coordinates`)
        skippedCount++
      }

      // Rate limiting: Mapbox allows 600 requests/minute
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`=== GEOCODING COMPLETE ===`)
    console.log(`Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`)

    return Response.json({
      success: true,
      message: `Processed ${parks.length} parks`,
      parksProcessed: parks.length,
      parksFixed: successCount,
      parksFailed: failedCount,
      parksSkipped: skippedCount,
      errors: errors.length > 0 ? errors : undefined
    }, { status: 200, headers })

  } catch (error) {
    console.error('Geocoding API error:', error)
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

