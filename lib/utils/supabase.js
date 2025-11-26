// src/utils/supabase.js
// Supabase client for database operations

import { createClient } from '@supabase/supabase-js'

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create and export the client (will fail gracefully if env vars are missing)
export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null

/**
 * Fetch parks with filters
 * Note: Supabase has a default limit of 1000 rows. We'll fetch in batches if needed.
 */
export async function fetchParks(filters = {}) {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.')
  }
  
  let allParks = []
  let page = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    let query = supabase
      .from('parks')
      .select('*')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1)

    // Apply agency filter if provided
    if (filters.agency) {
      query = query.eq('agency', filters.agency)
    }

    // Apply state filter if provided
    if (filters.state) {
      query = query.eq('state', filters.state)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching parks:', error)
      throw error
    }

    if (data && data.length > 0) {
      allParks = [...allParks, ...data]
      // If we got fewer than pageSize, we've reached the end
      hasMore = data.length === pageSize
      page++
    } else {
      hasMore = false
    }
  }

  console.log(`Fetched ${allParks.length} parks total`)
  return allParks
}

/**
 * Fetch a single park by ID
 */
export async function fetchParkById(id) {
  if (!supabase) {
    throw new Error('Supabase client not initialized.')
  }
  const { data, error } = await supabase
    .from('parks')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching park:', error)
    throw error
  }

  return data
}

/**
 * Fetch park geometry (boundary)
 */
export async function fetchParkBoundary(parkId) {
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('parks')
    .select('geometry')
    .eq('id', parkId)
    .single()

  if (error) {
    console.error('Error fetching geometry:', error)
    return null
  }

  if (!data || !data.geometry) {
    return null
  }

  // Parse geometry data
  // PostGIS geography column returns as GeoJSON when queried via Supabase
  // (Supabase automatically converts WKT to GeoJSON for JSON responses)
  try {
    let coordinates = null
    let geometry = data.geometry
    
    // Supabase returns PostGIS geography as GeoJSON object
    if (typeof geometry === 'string') {
      // Try parsing as JSON first
      try {
        geometry = JSON.parse(geometry)
      } catch {
        // If it's WKT format string, we'd need to parse it
        // But Supabase should return GeoJSON, so this is unlikely
        console.warn('Geometry is string but not JSON - may be WKT format')
        return null
      }
    }
    
    // Handle GeoJSON geometry object (Supabase's default format)
    if (geometry && geometry.type) {
      if (geometry.type === 'Polygon' && geometry.coordinates) {
        coordinates = geometry.coordinates[0]
      } else if (geometry.type === 'MultiPolygon' && geometry.coordinates) {
        coordinates = geometry.coordinates[0][0]
      }
    }

    // Convert to Leaflet format [lat, lng]
    if (coordinates && coordinates.length > 0) {
      return coordinates.map(coord => [coord[1], coord[0]])
    }
  } catch (err) {
    console.error('Error parsing geometry:', err)
  }

  return null
}

export default supabase
