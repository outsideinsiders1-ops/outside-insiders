/**
 * Next.js API Route: /api/sync
 * Handles API synchronization (NPS, Recreation.gov, state parks)
 * Priority: 2
 */

import { fetchAllNPSParks } from '../../../lib/utils/nps-api.js'
import { fetchRecreationFacilities } from '../../../lib/utils/recreation-gov-api.js'
import { mapNPSParksToSchema, mapRecreationGovFacilitiesToSchema } from '../../../lib/utils/api-field-mapper.js'
import { insertOrUpdatePark } from '../../../lib/utils/db-operations.js'
import { supabaseServer } from '../../../lib/supabase-server.js'

export async function POST(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { sourceType, apiKey } = body

    // Validate required fields
    if (!sourceType) {
      return Response.json({ 
        success: false, 
        error: 'Source type is required',
        details: 'Please specify the source type (e.g., "NPS", "Recreation.gov", "State Agency")',
        example: { sourceType: 'NPS', apiKey: 'your-api-key' }
      }, { status: 400, headers })
    }

    // Get API key from request or environment
    let effectiveApiKey = apiKey
    if (sourceType === 'NPS' && !effectiveApiKey) {
      effectiveApiKey = process.env.NPS_API_KEY || process.env.NEXT_PUBLIC_NPS_API_KEY
    }
    if (sourceType === 'Recreation.gov' && !effectiveApiKey) {
      effectiveApiKey = process.env.RECREATION_GOV_API_KEY || process.env.NEXT_PUBLIC_RECREATION_GOV_API_KEY
    }

    if (!effectiveApiKey) {
      return Response.json({ 
        success: false, 
        error: 'API key is required',
        details: `Please provide an API key for ${sourceType}. You can provide it in the request body or set it as an environment variable.`,
        example: { sourceType: 'NPS', apiKey: 'your-api-key' }
      }, { status: 400, headers })
    }

    let parksFound = 0
    let parksAdded = 0
    let parksUpdated = 0
    let parksSkipped = 0
    const errors = []

    if (!supabaseServer) {
      return Response.json({
        success: false,
        error: 'Supabase client not initialized',
        message: 'Server configuration error'
      }, { status: 500, headers })
    }
    
        // Handle NPS API
        if (sourceType === 'NPS' || sourceType === 'National Park Service') {
          try {
            console.log('=== NPS API SYNC START ===')
            console.log('API Key provided:', effectiveApiKey ? 'Yes' : 'No')
            console.log('API Key length:', effectiveApiKey?.length || 0)
            console.log('API Key preview:', effectiveApiKey ? `${effectiveApiKey.substring(0, 10)}...` : 'None')
            
            const npsParks = await fetchAllNPSParks(effectiveApiKey, {
              onProgress: (progress) => {
                console.log(`NPS API Progress: ${progress.fetched} parks fetched${progress.total !== 'unknown' ? ` of ${progress.total}` : ''}`)
              }
            })

            parksFound = npsParks.length
            console.log(`=== NPS API RESPONSE ===`)
            console.log(`Total parks fetched: ${parksFound}`)
            console.log(`First park sample:`, npsParks[0] ? {
              fullName: npsParks[0].fullName,
              parkCode: npsParks[0].parkCode,
              states: npsParks[0].states
            } : 'No parks')

            if (parksFound === 0) {
              console.error('=== NPS API ERROR: 0 PARKS RETURNED ===')
              console.error('This could indicate:')
              console.error('1. Invalid API key')
              console.error('2. API rate limiting')
              console.error('3. Network issue')
              console.error('4. API endpoint changed')
              return Response.json({
                success: false,
                error: 'No parks found',
                message: 'NPS API returned 0 parks. Please check your API key and try again.',
                details: 'This could indicate an authentication issue or the API returned no results.',
                debug: {
                  apiKeyProvided: !!effectiveApiKey,
                  apiKeyLength: effectiveApiKey?.length || 0,
                  apiKeyPreview: effectiveApiKey ? `${effectiveApiKey.substring(0, 10)}...` : null
                }
              }, { status: 400, headers })
            }

        // Map to our schema
        const mappedParks = mapNPSParksToSchema(npsParks)
        console.log(`Mapped ${mappedParks.length} parks to schema`)

        // Process each park
        for (const park of mappedParks) {
          try {
            // Validate required fields
            if (!park.name || !park.state) {
              parksSkipped++
              errors.push({
                park: park.name || 'Unknown',
                error: 'Missing required fields (name or state)'
              })
              continue
            }

            // Insert or update park
            const result = await insertOrUpdatePark(supabaseServer, park, 'NPS')

            if (result.action === 'inserted') {
              parksAdded++
            } else if (result.action === 'updated') {
              parksUpdated++
            } else {
              parksSkipped++
            }
          } catch (error) {
            parksSkipped++
            errors.push({
              park: park.name || 'Unknown',
              error: error.message || 'Failed to process park'
            })
            console.error(`Error processing park ${park.name}:`, error)
          }
        }

      } catch (error) {
        console.error('NPS API Error:', error)
        return Response.json({
          success: false,
          error: 'Failed to sync NPS data',
          message: error.message || 'An error occurred while fetching NPS data',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500, headers })
      }
    }
    // Handle Recreation.gov API
    else if (sourceType === 'Recreation.gov' || sourceType === 'Recreation.gov API') {
      try {
        console.log('Fetching facilities from Recreation.gov API...')
        
        const facilities = await fetchRecreationFacilities(effectiveApiKey, {
          onProgress: (progress) => {
            console.log(`Recreation.gov API Progress: ${progress.fetched} facilities fetched`)
          }
        })

        parksFound = facilities.length
        console.log(`Found ${parksFound} facilities from Recreation.gov API`)

        // Map to our schema
        const mappedParks = mapRecreationGovFacilitiesToSchema(facilities)

        // Process each park
        for (const park of mappedParks) {
          try {
            // Validate required fields
            if (!park.name) {
              parksSkipped++
              errors.push({
                park: park.name || 'Unknown',
                error: 'Missing required field (name)'
              })
              continue
            }

            // Insert or update park
            const result = await insertOrUpdatePark(supabaseServer, park, 'Recreation.gov')

            if (result.action === 'inserted') {
              parksAdded++
            } else if (result.action === 'updated') {
              parksUpdated++
            } else {
              parksSkipped++
            }
          } catch (error) {
            parksSkipped++
            errors.push({
              park: park.name || 'Unknown',
              error: error.message || 'Failed to process park'
            })
            console.error(`Error processing park ${park.name}:`, error)
          }
        }

      } catch (error) {
        console.error('Recreation.gov API Error:', error)
        return Response.json({
          success: false,
          error: 'Failed to sync Recreation.gov data',
          message: error.message || 'An error occurred while fetching Recreation.gov data',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500, headers })
      }
    }
    // Handle custom API URLs (future: LLM-powered analysis)
    else {
      return Response.json({
        success: false,
        error: 'Unsupported source type',
        details: `Source type "${sourceType}" is not yet supported. Currently supported: "NPS", "Recreation.gov"`,
        supportedTypes: ['NPS', 'National Park Service', 'Recreation.gov', 'Recreation.gov API']
      }, { status: 400, headers })
    }

    // Return response with both formats for compatibility
    return Response.json({
      success: true,
      message: 'Sync complete',
      parksFound,
      parksAdded,
      parksUpdated,
      parksSkipped,
      results: {
        parksFound,
        parksAdded,
        parksUpdated,
        parksSkipped
      },
      errors: errors.length > 0 ? errors : undefined
    }, { status: 200, headers })
    
  } catch (error) {
    console.error('Sync API Error:', error)
    
    // Provide detailed error information
    const errorResponse = {
      success: false,
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }

    return Response.json(errorResponse, { status: 500, headers })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

