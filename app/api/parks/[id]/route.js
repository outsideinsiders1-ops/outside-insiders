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
    // Handle Next.js 13+ App Router params (may be a Promise)
    let id = params?.id
    if (id instanceof Promise) {
      id = await id
    }
    
    // Also try extracting from URL as fallback
    if (!id) {
      try {
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/')
        id = pathParts[pathParts.length - 1]
      } catch (urlError) {
        console.error('Error parsing URL:', urlError)
      }
    }

    console.log('Park detail request - ID:', id, 'Params:', params, 'URL:', request.url)

    if (!id || id === '[id]' || id === 'undefined' || id === 'null') {
      return Response.json({
        success: false,
        error: 'Park ID is required',
        received: { id, params: params ? Object.keys(params) : 'none', url: request.url }
      }, { status: 400, headers })
    }

    // Fetch full park details including all fields and geometry
    // Try multiple ID fields since parks might use different identifiers
    let { data, error } = await supabaseServer
      .from('parks')
      .select('*')
      .eq('id', id)
      .single()

    // If not found by id, try source_id as fallback
    if (error && (error.code === 'PGRST116' || error.message?.includes('No rows'))) {
      console.log(`Park not found by id ${id}, trying source_id...`)
      const { data: sourceData, error: sourceError } = await supabaseServer
        .from('parks')
        .select('*')
        .eq('source_id', id)
        .single()
      
      if (!sourceError && sourceData) {
        console.log(`Found park by source_id: ${id}`)
        data = sourceData
        error = null
      } else {
        // Try one more check - query without .single() to see if park exists at all
        const { data: checkData, error: checkError } = await supabaseServer
          .from('parks')
          .select('id, name, source_id')
          .or(`id.eq.${id},source_id.eq.${id}`)
          .limit(1)
        
        if (!checkError && checkData && checkData.length > 0) {
          // Park exists but with different ID - fetch full data using the actual id
          console.log(`Found park with different ID, using actual id: ${checkData[0].id}`)
          const { data: foundPark, error: foundError } = await supabaseServer
            .from('parks')
            .select('*')
            .eq('id', checkData[0].id)
            .single()
          
          if (!foundError && foundPark) {
            data = foundPark
            error = null
          }
        }
      }
    }

    if (error) {
      console.error('Error fetching park:', error, 'ID:', id, 'Error code:', error.code)
      
      // Final check - query without .single() to see if park exists
      if (error.code === 'PGRST116' || error.message?.includes('No rows') || error.message?.includes('not found')) {
        const { data: checkData, error: checkError } = await supabaseServer
          .from('parks')
          .select('id, name, source_id')
          .or(`id.eq.${id},source_id.eq.${id}`)
          .limit(1)
        
        if (checkError || !checkData || checkData.length === 0) {
          console.log(`Park ${id} confirmed not found in database (checked both id and source_id)`)
          return Response.json({
            success: false,
            error: 'Park not found',
            message: `No park found with ID: ${id}`,
            debug: { errorCode: error.code, checkError: checkError?.message }
          }, { status: 404, headers })
        }
      }
      
      return Response.json({
        success: false,
        error: 'Failed to fetch park',
        message: error.message,
        debug: { errorCode: error.code, id }
      }, { status: 500, headers })
    }

    if (!data) {
      console.error('No data returned for park ID:', id)
      // Try one more time without .single() to see if park exists
      const { data: checkData } = await supabaseServer
        .from('parks')
        .select('id, name')
        .eq('id', id)
        .limit(1)
      
      if (!checkData || checkData.length === 0) {
        return Response.json({
          success: false,
          error: 'Park not found',
          message: `No park data returned for ID: ${id}`
        }, { status: 404, headers })
      }
      
      // Park exists but .single() failed - return what we have
      console.warn(`Park ${id} exists but .single() returned no data, using check query result`)
    }

    // Convert PostGIS geometry to GeoJSON if it exists
    let parkData = { ...data }
    if (parkData.geometry) {
      try {
        // If geometry is already a string, try to parse it
        if (typeof parkData.geometry === 'string') {
          // Check if it's already valid JSON
          if (parkData.geometry.trim().startsWith('{') || parkData.geometry.trim().startsWith('[')) {
            try {
              parkData.geometry = JSON.parse(parkData.geometry)
            } catch (parseError) {
              console.warn(`Geometry string is not valid JSON for park ${id}, might be WKT or PostGIS format`)
              // Don't try to parse WKT here - just leave it as string
              // The client-side code will handle it
            }
          } else {
            // Likely WKT format - leave as-is for now
            console.log(`Geometry appears to be WKT format for park ${id}`)
          }
        }
        // If geometry is already an object, assume it's already GeoJSON
      } catch (geoError) {
        console.warn(`Failed to process geometry for park ${id}:`, geoError.message)
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
