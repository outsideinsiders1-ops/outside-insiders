/**
 * Data Quality Analysis API
 * Provides data quality metrics and identifies issues
 */

import { supabaseServer } from '../../../../lib/supabase-server.js'
import { analyzeParksQuality, filterParksForCleanup, calculateDataQualityScore, calculateQualityBreakdown, calculateQualityBreakdownMatrix } from '../../../../lib/utils/data-quality.js'

// Route segment config for Next.js
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Ensure GET handler is properly exported
export async function GET(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    const agency = searchParams.get('agency')
    const dataSource = searchParams.get('data_source')
    const action = searchParams.get('action') // 'analyze' or 'filter'

    // Check if Supabase is initialized
    if (!supabaseServer) {
      return Response.json({
        success: false,
        error: 'Database not initialized',
        details: 'Supabase client is not available. Please check environment variables.'
      }, { status: 500, headers })
    }

    // Build query
    let query = supabaseServer
      .from('parks')
      .select('*')

    if (state) {
      query = query.eq('state', state)
    }
    if (agency) {
      query = query.eq('agency', agency)
    }
    if (dataSource) {
      query = query.eq('data_source', dataSource)
    }

    const { data: parks, error } = await query

    if (error) {
      return Response.json({
        success: false,
        error: 'Failed to fetch parks',
        details: error.message
      }, { status: 500, headers })
    }

    if (!parks || parks.length === 0) {
      return Response.json({
        success: true,
        analysis: {
          total: 0,
          message: 'No parks found matching criteria'
        }
      }, { status: 200, headers })
    }

      // Perform analysis
      const analysis = analyzeParksQuality(parks)

      // If action is 'breakdown', return quality breakdown by category
      if (action === 'breakdown') {
        const groupBy = searchParams.get('groupBy') || 'agency'
        const matrixFormat = searchParams.get('matrix') === 'true'
        
        if (matrixFormat) {
          // Return matrix format (rows × columns = quality scores)
          const fields = searchParams.get('fields')?.split(',') || ['name', 'description', 'website', 'phone', 'address']
          const matrix = calculateQualityBreakdownMatrix(parks, groupBy, fields)
          
          return Response.json({
            success: true,
            matrix,
            groupBy,
            total: parks.length
          }, { status: 200, headers })
        } else {
          // Return simple breakdown format
          const breakdown = calculateQualityBreakdown(parks, groupBy)

          return Response.json({
            success: true,
            breakdown,
            groupBy,
            total: parks.length
          }, { status: 200, headers })
        }
      }

      // If action is 'filter', also return filtered list
      if (action === 'filter') {
        const filterCriteria = {
          nameKeywords: searchParams.get('nameKeywords')?.split(',').filter(Boolean),
          state: searchParams.get('filterState') || null,
          agency: searchParams.get('filterAgency') || null,
          maxAcres: searchParams.get('maxAcres') ? parseFloat(searchParams.get('maxAcres')) : undefined,
          minAcres: searchParams.get('minAcres') ? parseFloat(searchParams.get('minAcres')) : undefined,
          maxQualityScore: searchParams.get('maxQualityScore') ? parseInt(searchParams.get('maxQualityScore')) : undefined,
          missingFields: searchParams.get('missingFields')?.split(',').filter(Boolean)
        }

        // If no filter criteria, return all parks
        const hasCriteria = filterCriteria.nameKeywords?.length > 0 ||
                           filterCriteria.maxAcres !== undefined ||
                           filterCriteria.minAcres !== undefined ||
                           filterCriteria.maxQualityScore !== undefined ||
                           filterCriteria.missingFields?.length > 0

        const filteredParks = hasCriteria 
          ? filterParksForCleanup(parks, filterCriteria)
          : parks

        return Response.json({
          success: true,
          analysis,
          filteredParks: filteredParks.map(p => ({
            id: p.id,
            name: p.name,
            state: p.state,
            agency: p.agency,
            county: p.county || null,
            acres: p.acres ? parseFloat(p.acres) : null,
            qualityScore: calculateDataQualityScore(p)
          })),
          filterCriteria
        }, { status: 200, headers })
      }

    return Response.json({
      success: true,
      analysis
    }, { status: 200, headers })

  } catch (error) {
    console.error('Data quality API error:', error)
    return Response.json({
      success: false,
      error: 'Internal server error',
      message: error.message
    }, { status: 500, headers })
  }
}

export async function POST(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { action, parkIds } = body

    // Handle delete action via POST (for compatibility with proxies that block DELETE)
    if (action === 'delete') {
      if (!parkIds || !Array.isArray(parkIds) || parkIds.length === 0) {
        return Response.json({
          success: false,
          error: 'parkIds array is required'
        }, { status: 400, headers })
      }

      // Delete parks
      const { error } = await supabaseServer
        .from('parks')
        .delete()
        .in('id', parkIds)

      if (error) {
        return Response.json({
          success: false,
          error: 'Failed to delete parks',
          details: error.message
        }, { status: 500, headers })
      }

      return Response.json({
        success: true,
        deleted: parkIds.length,
        message: `Successfully deleted ${parkIds.length} park(s)`
      }, { status: 200, headers })
    }

    return Response.json({
      success: false,
      error: 'Invalid action',
      details: 'Supported actions: delete'
    }, { status: 400, headers })

  } catch (error) {
    console.error('Delete parks error:', error)
    return Response.json({
      success: false,
      error: 'Internal server error',
      message: error.message
    }, { status: 500, headers })
  }
}

export async function DELETE(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE,OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { parkIds } = body

    if (!parkIds || !Array.isArray(parkIds) || parkIds.length === 0) {
      return Response.json({
        success: false,
        error: 'parkIds array is required'
      }, { status: 400, headers })
    }

    // Delete parks
    const { error } = await supabaseServer
      .from('parks')
      .delete()
      .in('id', parkIds)

    if (error) {
      return Response.json({
        success: false,
        error: 'Failed to delete parks',
        details: error.message
      }, { status: 500, headers })
    }

    return Response.json({
      success: true,
      deleted: parkIds.length,
      message: `Successfully deleted ${parkIds.length} park(s)`
    }, { status: 200, headers })

  } catch (error) {
    console.error('Delete parks error:', error)
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
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

