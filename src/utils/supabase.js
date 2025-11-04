// src/utils/supabase.js
// Supabase client for database operations

import { createClient } from '@supabase/supabase-js'

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Create and export the client
export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Fetch parks with filters
 */
export async function fetchParks(filters = {}) {
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
 * Fetch park boundary
 */
export async function fetchParkBoundary(parkId) {
  const { data, error } = await supabase
    .from('parks')
    .select('boundary')
    .eq('id', parkId)
    .single()

  if (error) {
    console.error('Error fetching boundary:', error)
    return null
  }

  if (!data || !data.boundary) {
    return null
  }

  // Parse boundary data
  try {
    let coordinates = null
    
    if (typeof data.boundary === 'string') {
      const parsed = JSON.parse(data.boundary)
      if (parsed.type === 'Polygon') {
        coordinates = parsed.coordinates[0]
      } else if (parsed.type === 'MultiPolygon') {
        coordinates = parsed.coordinates[0][0]
      }
    } else if (data.boundary.type === 'Polygon') {
      coordinates = data.boundary.coordinates[0]
    } else if (data.boundary.type === 'MultiPolygon') {
      coordinates = data.boundary.coordinates[0][0]
    }

    // Convert to Leaflet format [lat, lng]
    if (coordinates && coordinates.length > 0) {
      return coordinates.map(coord => [coord[1], coord[0]])
    }
  } catch (err) {
    console.error('Error parsing boundary:', err)
  }

  return null
}

export default supabase
