/**
 * API Route: /api/parks/[id]
 * Server-side park detail fetching with all fields including boundaries
 */

import { supabaseServer } from '../../../../lib/supabase-server.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request, { params }) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    // Handle both Next.js 13+ params format and legacy format
    let id = params?.id
    if (!id) {
      // Try to extract from URL path
      const url = new URL(request.url)
      const pathParts = url.pathname.split('/')
      id = pathParts[pathParts.length - 1]
    }

    console.log('Park detail request - ID:', id, 'Params:', params)

    if (!id || id === '[id]' || id === 'undefined') {
      return Response.json({
        success: false,
        error: 'Park ID is required',
        received: { id, params }
      }, { status: 400, headers })
    }

    // Fetch full park details including all fields and geometry
    const { data, error } = await supabaseServer
      .from('parks')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching park:', error)
      return Response.json({
        success: false,
        error: 'Failed to fetch park',
        message: error.message
      }, { status: 500, headers })
    }

    if (!data) {
      return Response.json({
        success: false,
        error: 'Park not found'
      }, { status: 404, headers })
    }

    // Convert PostGIS geometry to GeoJSON if it exists
    let parkData = { ...data }
    if (parkData.geometry) {
      try {
        // If geometry is already a string (GeoJSON), parse it
        if (typeof parkData.geometry === 'string') {
          try {
            parkData.geometry = JSON.parse(parkData.geometry)
          } catch {
            // If parsing fails, it might be WKT format - convert using PostGIS
            // For now, we'll query it as GeoJSON from database
            const { data: geoData } = await supabaseServer.rpc('st_asgeojson', {
              geom: parkData.geometry
            }).catch(() => ({ data: null }))
            if (geoData) {
              parkData.geometry = JSON.parse(geoData)
            }
          }
        }
        // If geometry is a PostGIS geometry object, we need to convert it
        // The simplest approach: query it as GeoJSON directly
      } catch (geoError) {
        console.warn(`Failed to convert geometry for park ${id}:`, geoError.message)
        // Keep geometry as-is if conversion fails
      }
    }

    // Log what fields we're returning for debugging
    console.log(`Park ${id} detail fetched:`, {
      id: parkData.id,
      name: parkData.name,
      hasDescription: !!parkData.description,
      hasPhone: !!parkData.phone,
      hasEmail: !!parkData.email,
      hasAmenities: !!parkData.amenities,
      hasActivities: !!parkData.activities,
      hasGeometry: !!parkData.geometry,
      geometryType: parkData.geometry ? (typeof parkData.geometry === 'string' ? 'string' : typeof parkData.geometry) : 'none',
      totalFields: Object.keys(parkData).length
    })

    return Response.json({
      success: true,
      park: parkData
    }, { status: 200, headers })

  } catch (error) {
    console.error('Park detail API error:', error)
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
