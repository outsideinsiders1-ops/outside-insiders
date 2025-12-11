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
    const { id } = params

    if (!id) {
      return Response.json({
        success: false,
        error: 'Park ID is required'
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

    // Log what fields we're returning for debugging
    console.log(`Park ${id} detail fetched:`, {
      id: data.id,
      name: data.name,
      hasDescription: !!data.description,
      hasPhone: !!data.phone,
      hasEmail: !!data.email,
      hasAmenities: !!data.amenities,
      hasActivities: !!data.activities,
      hasGeometry: !!data.geometry,
      totalFields: Object.keys(data).length
    })

    return Response.json({
      success: true,
      park: data
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
