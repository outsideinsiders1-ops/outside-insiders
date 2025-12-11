/**
 * API Route: /api/parks
 * Server-side park fetching with viewport-based loading and caching
 */

import { supabaseServer } from '../../../lib/supabase-server.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// Simple in-memory cache (for serverless, consider Redis for production)
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCacheKey(bounds, filters) {
  if (!bounds) return `all_${JSON.stringify(filters)}`
  const rounded = {
    north: Math.floor(bounds.north * 10) / 10,
    south: Math.floor(bounds.south * 10) / 10,
    east: Math.floor(bounds.east * 10) / 10,
    west: Math.floor(bounds.west * 10) / 10
  }
  return `${JSON.stringify(rounded)}_${JSON.stringify(filters)}`
}

function getCached(key) {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() })
  // Limit cache size
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
}

export async function GET(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const { searchParams } = new URL(request.url)
    const boundsParam = searchParams.get('bounds')
    const filtersParam = searchParams.get('filters')
    
    let bounds = null
    let filters = {}
    
    if (boundsParam) {
      try {
        bounds = JSON.parse(boundsParam)
      } catch {
        // Invalid bounds, ignore
      }
    }
    
    if (filtersParam) {
      try {
        filters = JSON.parse(filtersParam)
      } catch {
        // Invalid filters, ignore
      }
    }

    // Check cache
    const cacheKey = getCacheKey(bounds, filters)
    const cached = getCached(cacheKey)
    if (cached) {
      return Response.json({
        success: true,
        parks: cached,
        cached: true
      }, { status: 200, headers })
    }

    // Build query - select only essential fields for map markers
    // Include parks with coordinates OR geometry (we'll calculate centroid from geometry if needed)
    let query = supabaseServer
      .from('parks')
      .select('id, name, latitude, longitude, agency, state, source_id, data_source, geometry')
    
    // Filter: must have either coordinates OR boundary
    // Note: We'll filter out parks without coordinates after calculating centroids from boundaries
    // For now, we'll get all parks and filter client-side after centroid calculation

    // Apply viewport bounds if provided
    if (bounds && bounds.north && bounds.south && bounds.east && bounds.west) {
      query = query
        .gte('latitude', bounds.south)
        .lte('latitude', bounds.north)
        .gte('longitude', bounds.west)
        .lte('longitude', bounds.east)
    }

    // Apply filters
    if (filters.agency) {
      query = query.eq('agency', filters.agency)
    }
    if (filters.state) {
      query = query.eq('state', filters.state)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching parks:', error)
      return Response.json({
        success: false,
        error: 'Failed to fetch parks',
        message: error.message
      }, { status: 500, headers })
    }

    let parks = data || []

    // Calculate centroids from geometry for parks missing coordinates
    parks = parks.map(park => {
      if (!park.latitude || !park.longitude) {
        // Try to calculate centroid from geometry
        if (park.geometry) {
          try {
            let boundaryData = park.geometry
            if (typeof boundaryData === 'string') {
              boundaryData = JSON.parse(boundaryData)
            }
            
            // Handle GeoJSON Polygon or MultiPolygon
            let coordinates = null
            if (boundaryData.type === 'Polygon' && boundaryData.coordinates && boundaryData.coordinates[0]) {
              coordinates = boundaryData.coordinates[0]
            } else if (boundaryData.type === 'MultiPolygon' && boundaryData.coordinates && boundaryData.coordinates[0] && boundaryData.coordinates[0][0]) {
              coordinates = boundaryData.coordinates[0][0]
            }
            
            if (coordinates && coordinates.length > 0) {
              // Calculate centroid (average of all coordinates)
              let sumLat = 0
              let sumLng = 0
              let count = 0
              
              coordinates.forEach(coord => {
                // GeoJSON format: [lng, lat]
                if (Array.isArray(coord) && coord.length >= 2) {
                  sumLng += coord[0]
                  sumLat += coord[1]
                  count++
                }
              })
              
              if (count > 0) {
                park.latitude = sumLat / count
                park.longitude = sumLng / count
              }
            }
          } catch (error) {
            console.warn(`Failed to calculate centroid for park ${park.id}:`, error.message)
          }
        }
      }
      
      // Only include parks that now have coordinates
      return park
    }).filter(park => park.latitude && park.longitude)

    // Apply client-side filters that can't be done in SQL
    let filteredParks = parks

    // Filter by land type (client-side)
    if (filters.landType === 'STATE') {
      filteredParks = filteredParks.filter(park => 
        park.agency && park.agency.toLowerCase().includes('state')
      )
    } else if (filters.landType === 'COUNTY') {
      filteredParks = filteredParks.filter(park => 
        park.agency && park.agency.toLowerCase().includes('county')
      )
    } else if (filters.landType === 'CITY') {
      filteredParks = filteredParks.filter(park => 
        park.agency && (
          park.agency.toLowerCase().includes('city') ||
          park.agency.toLowerCase().includes('municipal') ||
          park.agency.toLowerCase().includes('town')
        )
      )
    } else if (filters.landType === 'FEDERAL') {
      filteredParks = filteredParks.filter(park => 
        ['NPS', 'USFS', 'BLM', 'FWS'].includes(park.agency)
      )
    }

    // Filter by specific agencies
    if (filters.agencies && Array.isArray(filters.agencies) && filters.agencies.length > 0) {
      filteredParks = filteredParks.filter(park => 
        filters.agencies.includes(park.agency)
      )
    }

    // Cache the result
    setCached(cacheKey, filteredParks)

    return Response.json({
      success: true,
      parks: filteredParks,
      cached: false,
      count: filteredParks.length
    }, { status: 200, headers })

  } catch (error) {
    console.error('Parks API error:', error)
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
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
