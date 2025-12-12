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
    // Handle Next.js App Router params
    let id = params?.id
    
    // In Next.js 15+, params might be a Promise
    if (id instanceof Promise) {
      id = await id
    }
    
    // Fallback: Extract from URL if params not available
    if (!id) {
      try {
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/').filter(p => p)
        // Find the ID part (should be after 'parks')
        const parksIndex = pathParts.indexOf('parks')
        if (parksIndex >= 0 && pathParts.length > parksIndex + 1) {
          id = pathParts[parksIndex + 1]
        } else {
          // Last resort: use last part of path
          id = pathParts[pathParts.length - 1]
        }
      } catch (urlError) {
        console.error('Error parsing URL:', urlError)
      }
    }

    console.log('🔍 Park detail request:', {
      id,
      url: request.url,
      params: params ? Object.keys(params) : 'none',
      paramsId: params?.id
    })

    if (!id || id === '[id]' || id === 'undefined' || id === 'null') {
      return Response.json({
        success: false,
        error: 'Park ID is required',
        received: { id, params: params ? Object.keys(params) : 'none', url: request.url }
      }, { status: 400, headers })
    }

    // First, let's check if ANY park exists with this ID in any field
    console.log(`Checking for park with ID: ${id}`)
    const { data: idCheck } = await supabaseServer
      .from('parks')
      .select('id, name, source_id')
      .or(`id.eq.${id},source_id.eq.${id}`)
      .limit(5)
    
    console.log(`Found ${idCheck?.length || 0} parks matching ID ${id}:`, idCheck)

    // Fetch full park details including all fields and geometry
    // Try multiple ID fields since parks might use different identifiers
    let { data, error } = await supabaseServer
      .from('parks')
      .select('*')
      .eq('id', id)
      .single()
    
    console.log(`Query by id result - Error:`, error?.code, error?.message, 'Data:', !!data)

    // If not found by id, try source_id as fallback
    if (error && (error.code === 'PGRST116' || error.message?.includes('No rows'))) {
      console.log(`Park not found by id ${id}, trying source_id...`)
      const { data: sourceData, error: sourceError } = await supabaseServer
        .from('parks')
        .select('*')
        .eq('source_id', id)
        .single()
      
      console.log(`Query by source_id result - Error:`, sourceError?.code, sourceError?.message, 'Data:', !!sourceData)
      
      if (!sourceError && sourceData) {
        console.log(`Found park by source_id: ${id}, park name: ${sourceData.name}`)
        data = sourceData
        error = null
      } else {
        // Use the idCheck we did earlier to find the actual ID
        if (idCheck && idCheck.length > 0) {
          const actualId = idCheck[0].id
          console.log(`Park exists but with different id. Requested: ${id}, Actual: ${actualId}, trying with actual id...`)
          
          const { data: foundPark, error: foundError } = await supabaseServer
            .from('parks')
            .select('*')
            .eq('id', actualId)
            .single()
          
          console.log(`Query by actual id result - Error:`, foundError?.code, foundError?.message, 'Data:', !!foundPark)
          
          if (!foundError && foundPark) {
            console.log(`Found park using actual id: ${actualId}, park name: ${foundPark.name}`)
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
            } catch {
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
