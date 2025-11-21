/**
 * Data Quality Analysis API
 * Provides data quality metrics and identifies issues
 */

import { supabaseServer } from '../../../../lib/supabase-server.js'
import { analyzeParksQuality, filterParksForCleanup, calculateDataQualityScore } from '../../../../lib/utils/data-quality.js'

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

      const filteredParks = filterParksForCleanup(parks, filterCriteria)

      return Response.json({
        success: true,
        analysis,
        filteredParks: filteredParks.map(p => ({
          id: p.id,
          name: p.name,
          state: p.state,
          agency: p.agency,
          acres: p.acres,
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

export async function DELETE(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE,OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

