// src/utils/supabase.js
// Supabase client for database operations

import { createClient } from '@supabase/supabase-js'

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create and export the client (with safety check for build time)
export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null

/**
 * Fetch parks by viewport bounds (for map performance)
 * Uses bounding box query to only fetch parks visible in current viewport
 * @param {Object} bounds - Bounding box {north, south, east, west}
 * @param {Object} filters - Additional filters (agency, state, etc.)
 * @returns {Promise<Array>} Array of park objects
 */
export async function fetchParksByBounds(bounds, filters = {}) {
  if (!bounds || !bounds.north || !bounds.south || !bounds.east || !bounds.west) {
    // Fallback to regular fetch if bounds not provided
    return fetchParks(filters)
  }

  // Select only essential fields for map markers to reduce payload
  let query = supabase
    .from('parks')
    .select('id, name, latitude, longitude, agency, state, source_id, data_source')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    // Use bounding box filter: parks within viewport
    .gte('latitude', bounds.south)
    .lte('latitude', bounds.north)
    .gte('longitude', bounds.west)
    .lte('longitude', bounds.east)

  // Apply agency filter if provided
  if (filters.agency) {
    query = query.eq('agency', filters.agency)
  }

  // Apply state filter if provided
  if (filters.state) {
    query = query.eq('state', filters.state)
  }

  // Apply land type filter (client-side for now, can be optimized later)
  // For now, we'll filter client-side after fetching

  const { data, error } = await query

  if (error) {
    console.error('Error fetching parks by bounds:', error)
    throw error
  }

  return data || []
}

/**
 * Fetch parks with filters (fallback for non-viewport loading)
 * @deprecated Use fetchParksByBounds for better performance
 */
export async function fetchParks(filters = {}) {
  // Select only essential fields for map markers
  let query = supabase
    .from('parks')
    .select('id, name, latitude, longitude, agency, state, source_id, data_source')
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
 * Fetch a single park by ID (with all fields for detail view)
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
