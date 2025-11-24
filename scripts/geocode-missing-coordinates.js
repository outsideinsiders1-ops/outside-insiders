/**
 * Script to geocode parks missing coordinates using Mapbox Geocoding API
 * 
 * This script:
 * 1. Finds all parks missing latitude/longitude
 * 2. Attempts to geocode them using park name + state
 * 3. Updates the database with coordinates
 * 
 * Run this with: node scripts/geocode-missing-coordinates.js
 * 
 * Requires:
 * - NEXT_PUBLIC_MAPBOX_TOKEN environment variable
 * - Supabase service role key (for direct database access)
 */

import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MAPBOX_TOKEN) {
  console.error('❌ MAPBOX_TOKEN not found. Please set NEXT_PUBLIC_MAPBOX_TOKEN or MAPBOX_TOKEN')
  process.exit(1)
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

/**
 * Geocode a park using Mapbox Geocoding API
 */
async function geocodePark(parkName, state, address = null) {
  // Build search query: prefer address, fallback to park name + state
  let query = address || `${parkName}, ${state}`
  
  // Clean up query
  query = query
    .replace(/\s+/g, ' ')
    .trim()
  
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=poi,address`
  
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`  ⚠️  Geocoding API error: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center
      const relevance = data.features[0].relevance || 0
      
      // Only accept high-relevance results (0.7+)
      if (relevance >= 0.7) {
        return { latitude: lat, longitude: lng, relevance }
      } else {
        console.warn(`  ⚠️  Low relevance (${relevance.toFixed(2)}): ${data.features[0].place_name}`)
        return null
      }
    }
    
    return null
  } catch (error) {
    console.warn(`  ⚠️  Geocoding error: ${error.message}`)
    return null
  }
}

/**
 * Calculate centroid from geometry if available
 */
async function getCentroidFromGeometry(park) {
  if (!park.geometry) {
    return null
  }
  
  try {
    // Query PostGIS to calculate centroid
    const { data, error } = await supabase.rpc('st_centroid', {
      geom: park.geometry
    })
    
    if (error) {
      // Try direct SQL query
      const { data: result, error: sqlError } = await supabase
        .from('parks')
        .select('id')
        .eq('id', park.id)
        .single()
      
      // Use raw SQL if RPC doesn't work
      const { data: centroidData, error: centroidError } = await supabase
        .rpc('calculate_centroid', { park_id: park.id })
      
      if (centroidError) {
        console.warn(`  ⚠️  Could not calculate centroid: ${centroidError.message}`)
        return null
      }
      
      return centroidData
    }
    
    return data
  } catch (error) {
    console.warn(`  ⚠️  Centroid calculation error: ${error.message}`)
    return null
  }
}

/**
 * Main function to geocode missing parks
 */
async function geocodeMissingParks() {
  console.log('🔍 Finding parks missing coordinates...\n')
  
  // Find all parks missing coordinates
  const { data: parks, error } = await supabase
    .from('parks')
    .select('id, name, state, address, latitude, longitude, geometry')
    .or('latitude.is.null,longitude.is.null')
    .limit(1000) // Process in batches
  
  if (error) {
    console.error('❌ Error fetching parks:', error)
    return
  }
  
  console.log(`📊 Found ${parks.length} parks missing coordinates\n`)
  
  if (parks.length === 0) {
    console.log('✅ All parks have coordinates!')
    return
  }
  
  let successCount = 0
  let failedCount = 0
  let skippedCount = 0
  
  for (let i = 0; i < parks.length; i++) {
    const park = parks[i]
    console.log(`[${i + 1}/${parks.length}] ${park.name} (${park.state})`)
    
    // First, try to get centroid from geometry
    let coords = null
    if (park.geometry) {
      console.log('  📍 Attempting to calculate centroid from geometry...')
      // For now, we'll use geocoding since PostGIS RPC might not be set up
      // You can add a SQL function to calculate centroids if needed
    }
    
    // If no geometry or centroid failed, try geocoding
    if (!coords) {
      console.log(`  🔍 Geocoding: "${park.name}, ${park.state}"`)
      coords = await geocodePark(park.name, park.state, park.address)
    }
    
    if (coords) {
      // Update park with coordinates
      const { error: updateError } = await supabase
        .from('parks')
        .update({
          latitude: coords.latitude,
          longitude: coords.longitude
        })
        .eq('id', park.id)
      
      if (updateError) {
        console.error(`  ❌ Failed to update: ${updateError.message}`)
        failedCount++
      } else {
        console.log(`  ✅ Updated: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`)
        successCount++
      }
    } else {
      console.log(`  ⚠️  Could not find coordinates`)
      skippedCount++
    }
    
    // Rate limiting: Mapbox allows 600 requests/minute
    // Wait 100ms between requests to stay under limit
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log('\n' + '='.repeat(50))
  console.log('📊 SUMMARY')
  console.log('='.repeat(50))
  console.log(`✅ Successfully geocoded: ${successCount}`)
  console.log(`❌ Failed: ${failedCount}`)
  console.log(`⚠️  Skipped (no results): ${skippedCount}`)
  console.log(`📈 Success rate: ${((successCount / parks.length) * 100).toFixed(1)}%`)
}

// Run the script
geocodeMissingParks().catch(console.error)

