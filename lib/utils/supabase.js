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
 */
export async function fetchParks(filters = {}) {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.')
  }
  let query = supabase
    .from('parks')
    .select('*')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  // Apply agency filter if provided
  if (filters.agency) {
    query = query.eq('agency', filters.agency)
  }

  // Apply state filter if provided
  if (filters.state) {
    query = query.eq('state', filters.state)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching parks:', error)
    throw error
  }

  return data || []
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

  // Parse geometry data (PostGIS geography returns as GeoJSON)
  try {
    let coordinates = null
    let geometry = data.geometry
    
    // If geometry is a string, parse it
    if (typeof geometry === 'string') {
      try {
        geometry = JSON.parse(geometry)
      } catch {
        // If parsing fails, might be PostGIS WKT format - skip for now
        return null
      }
    }
    
    // Handle GeoJSON geometry object
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
