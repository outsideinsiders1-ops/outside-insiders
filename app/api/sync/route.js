/**
 * Next.js API Route: /api/sync
 * Handles API synchronization (NPS, Recreation.gov, state parks)
 * Priority: 2
 */

import { fetchAllNPSParks } from '../../../lib/utils/nps-api.js'
import { fetchRecreationFacilities, fetchRecreationFacilityAddresses } from '../../../lib/utils/recreation-gov-api.js'
import { mapNPSParksToSchema, mapRecreationGovFacilitiesToSchema, mapRecreationGovToParkSchema } from '../../../lib/utils/api-field-mapper.js'
import { insertOrUpdatePark } from '../../../lib/utils/db-operations.js'
import { supabaseServer } from '../../../lib/supabase-server.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes (Vercel Pro max, Hobby plan limited to 10s)

export async function POST(request) {
  // CRITICAL: This is /api/sync route, NOT /api/scrape
  // If you see "Scrape request received" in logs, Next.js is routing incorrectly
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    // UNIQUE IDENTIFIER - If you see this, sync route is being called
    console.log('🔵🔵🔵 SYNC ROUTE CALLED (NOT SCRAPE) 🔵🔵🔵')
    console.log('🔵 Route: /api/sync')
    console.log('🔵 Request URL:', request.url)
    console.log('🔵 Request method:', request.method)
    
    const body = await request.json().catch(() => ({}))
    console.log('Request body:', { sourceType: body.sourceType, hasApiKey: !!body.apiKey })
    
    const { sourceType, apiKey } = body

    // Validate required fields
    if (!sourceType) {
      console.log('=== SYNC ROUTE: Missing sourceType ===')
      return Response.json({ 
        success: false, 
        error: 'Source type is required',
        details: 'Please specify the source type (e.g., "NPS", "Recreation.gov", "State Agency")',
        example: { sourceType: 'NPS', apiKey: 'your-api-key' },
        route: 'SYNC_ROUTE' // Unique identifier
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
    
    console.log('=== SYNC ROUTE: Processing sourceType ===', sourceType)
    
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
        
        // Debug: Check first few mapped parks and original NPS data
        if (mappedParks.length > 0) {
          console.log('=== SAMPLE MAPPED PARK DEBUG ===')
          console.log('Original NPS park:', {
            fullName: npsParks[0]?.fullName,
            states: npsParks[0]?.states,
            addresses: npsParks[0]?.addresses,
            hasAddresses: !!npsParks[0]?.addresses,
            addressCount: npsParks[0]?.addresses?.length || 0
          })
          console.log('Mapped park:', {
            name: mappedParks[0].name,
            state: mappedParks[0].state,
            hasName: !!mappedParks[0].name,
            hasState: !!mappedParks[0].state
          })
          
          // Count how many have missing state
          const missingState = mappedParks.filter(p => !p.state).length
          console.log(`Parks missing state: ${missingState} of ${mappedParks.length}`)
          if (missingState > 0) {
            console.log('First 5 parks missing state:', mappedParks.filter(p => !p.state).slice(0, 5).map(p => ({
              name: p.name,
              originalStates: npsParks.find(np => np.fullName === p.name)?.states
            })))
          }
        }

        // Process each park
        let processedCount = 0
        for (const park of mappedParks) {
          processedCount++
          try {
            // Log progress every 50 parks (reduced logging to avoid 256 log limit)
            if (processedCount % 50 === 0) {
              console.log(`📊 Progress: ${processedCount}/${mappedParks.length} parks (${parksAdded} added, ${parksUpdated} updated, ${parksSkipped} skipped)`)
            }
            
            // Validate required fields
            if (!park.name || !park.state) {
              parksSkipped++
              errors.push({
                park: park.name || 'Unknown',
                error: `Missing required fields - name: ${!!park.name}, state: ${!!park.state}`
              })
              continue
            }

            // Insert or update park with timeout protection (30 seconds per park)
            const result = await Promise.race([
              insertOrUpdatePark(park, 'NPS'),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Park processing timeout after 30 seconds')), 30000)
              )
            ])

            if (result.action === 'added') {
              parksAdded++
            } else if (result.action === 'updated') {
              parksUpdated++
            } else {
              parksSkipped++
            }
          } catch (error) {
            parksSkipped++
            const errorMessage = error.message || 'Failed to process park'
            errors.push({
              park: park.name || 'Unknown',
              error: errorMessage
            })
            // Only log errors (not every skipped park) to reduce log volume
            if (errorMessage.includes('timeout') || errorMessage.includes('Failed to')) {
              console.error(`❌ Error: "${park.name}" (${park.state || 'no state'}): ${errorMessage}`)
            }
            // Continue processing other parks even if one fails
            continue
          }
        }
        
        console.log(`=== NPS API SYNC COMPLETE ===`)
        console.log(`Processed: ${processedCount}/${mappedParks.length}, Added: ${parksAdded}, Updated: ${parksUpdated}, Skipped: ${parksSkipped}`)
        
        // Log if we didn't process all parks (might have hit timeout or error)
        if (processedCount < mappedParks.length) {
          const remaining = mappedParks.length - processedCount
          console.warn(`⚠️ WARNING: Only processed ${processedCount} of ${mappedParks.length} parks. ${remaining} parks were not processed.`)
          console.warn(`   This might indicate a timeout or an unhandled error. Check logs above for details.`)
        } else {
          console.log(`✅ Successfully processed all ${mappedParks.length} parks!`)
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
            console.log('=== RECREATION.GOV API SYNC START ===')
            
            const facilities = await fetchRecreationFacilities(effectiveApiKey, {
              onProgress: (progress) => {
                // Only log every 500 facilities to reduce log volume
                if (progress.fetched % 500 === 0 || progress.complete) {
                  console.log(`Recreation.gov API Progress: ${progress.fetched} facilities fetched`)
                }
              }
            })

            parksFound = facilities.length
            console.log(`=== RECREATION.GOV API RESPONSE ===`)
            console.log(`Total facilities fetched: ${parksFound}`)
            
            if (parksFound === 0) {
              return Response.json({
                success: false,
                error: 'No facilities found',
                message: 'Recreation.gov API returned 0 facilities. Please check your API key and try again.'
              }, { status: 400, headers })
            }

            // Map to our schema (initial mapping without addresses)
            let mappedParks = mapRecreationGovFacilitiesToSchema(facilities)
            console.log(`Mapped ${mappedParks.length} facilities to schema`)
            
            // Debug: Check sample and count missing fields
            const missingState = mappedParks.filter(p => !p.state).length
            const missingName = mappedParks.filter(p => !p.name).length
            console.log(`Facilities missing state: ${missingState}, missing name: ${missingName}`)
            
            // For facilities missing state, try to get it from addresses or coordinates
            if (missingState > 0) {
              console.log(`Fetching addresses for ${missingState} facilities missing state...`)
              
              const facilitiesNeedingState = facilities.filter((f, i) => !mappedParks[i].state)
              let addressesFetched = 0
              
              // Fetch addresses in batches (process 100 at a time to avoid overwhelming the API)
              const batchSize = 100
              for (let i = 0; i < facilitiesNeedingState.length; i += batchSize) {
                const batch = facilitiesNeedingState.slice(i, i + batchSize)
                
                // Fetch addresses for this batch in parallel (but limit concurrency)
                const addressPromises = batch.map(async (facility) => {
                  try {
                    const addresses = await fetchRecreationFacilityAddresses(effectiveApiKey, facility.FacilityID)
                    addressesFetched++
                    
                    // Remap this facility with addresses
                    const facilityIndex = facilities.indexOf(facility)
                    mappedParks[facilityIndex] = mapRecreationGovToParkSchema(facility, addresses)
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 50))
                  } catch (error) {
                    // If address fetch fails, keep the original mapping (might have coords for reverse geocoding)
                    console.warn(`Failed to fetch addresses for facility ${facility.FacilityID}:`, error.message)
                  }
                })
                
                await Promise.all(addressPromises)
                
                // Log progress
                if ((i + batchSize) % 500 === 0 || i + batchSize >= facilitiesNeedingState.length) {
                  console.log(`Fetched addresses for ${Math.min(i + batchSize, facilitiesNeedingState.length)}/${facilitiesNeedingState.length} facilities`)
                }
              }
              
              console.log(`Fetched addresses for ${addressesFetched} facilities`)
              
              // Re-check missing state after address fetch
              const stillMissingState = mappedParks.filter(p => !p.state).length
              console.log(`Facilities still missing state after address fetch: ${stillMissingState}`)
              
              // For facilities still missing state but with coordinates, use reverse geocoding
              if (stillMissingState > 0) {
                const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
                if (MAPBOX_TOKEN) {
                  console.log(`Attempting reverse geocoding for ${stillMissingState} facilities with coordinates...`)
                  
                  let geocoded = 0
                  for (let i = 0; i < mappedParks.length; i++) {
                    const park = mappedParks[i]
                    if (!park.state && park.latitude && park.longitude) {
                      try {
                        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${park.longitude},${park.latitude}.json?access_token=${MAPBOX_TOKEN}&types=region&limit=1`
                        const response = await fetch(url)
                        if (response.ok) {
                          const geoData = await response.json()
                          if (geoData.features && geoData.features.length > 0) {
                            // Extract state from context (US states are in context array)
                            const context = geoData.features[0].context || []
                            const region = context.find(c => c.id?.startsWith('region'))
                            if (region && region.short_code) {
                              // Mapbox returns state codes like "US-NC" or just "NC"
                              const stateCode = region.short_code.replace('US-', '').toUpperCase()
                              if (stateCode.length === 2) {
                                mappedParks[i].state = stateCode
                                geocoded++
                              }
                            }
                          }
                        }
                        // Rate limiting: small delay between geocoding requests
                        await new Promise(resolve => setTimeout(resolve, 100))
                      } catch (error) {
                        // Silently continue if geocoding fails
                      }
                    }
                  }
                  console.log(`Reverse geocoded state for ${geocoded} facilities`)
                }
              }
            }
            
            if (mappedParks.length > 0) {
              console.log('Sample mapped facility:', {
                name: mappedParks[0].name,
                state: mappedParks[0].state,
                agency: mappedParks[0].agency,
                hasCoords: !!(mappedParks[0].latitude && mappedParks[0].longitude)
              })
            }

            // Process each park
            let processedCount = 0
            for (const park of mappedParks) {
              processedCount++
              try {
                // Log progress every 500 parks
                if (processedCount % 500 === 0) {
                  console.log(`📊 Progress: ${processedCount}/${mappedParks.length} facilities (${parksAdded} added, ${parksUpdated} updated, ${parksSkipped} skipped)`)
                }
                
                // Validate required fields
                if (!park.name || !park.state) {
                  parksSkipped++
                  errors.push({
                    park: park.name || 'Unknown',
                    error: `Missing required fields - name: ${!!park.name}, state: ${!!park.state}`
                  })
                  continue
                }

                // Insert or update park
                const result = await insertOrUpdatePark(park, 'Recreation.gov')

                if (result.action === 'added') {
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
                  error: error.message || 'Failed to process facility'
                })
                // Only log errors (not every skipped park) to reduce log volume
                if (error.message.includes('timeout') || error.message.includes('Failed to')) {
                  console.error(`❌ Error: "${park.name}" (${park.state || 'no state'}): ${error.message}`)
                }
                continue
              }
            }
            console.log(`=== RECREATION.GOV API SYNC COMPLETE ===`)
            console.log(`Processed: ${processedCount}/${mappedParks.length}, Added: ${parksAdded}, Updated: ${parksUpdated}, Skipped: ${parksSkipped}`)
            
            // Log if we didn't process all parks
            if (processedCount < mappedParks.length) {
              console.warn(`⚠️ WARNING: Only processed ${processedCount} of ${mappedParks.length} facilities. This might indicate a timeout.`)
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
    const totalProcessed = parksAdded + parksUpdated + parksSkipped
    const response = {
      success: true,
      message: 'Sync complete',
      route: 'SYNC_ROUTE', // CRITICAL: This identifies this as the sync route
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
    }
    
    // Add warning if we might have hit a timeout
    if (parksFound > 0 && totalProcessed < parksFound) {
      response.warning = `Only processed ${totalProcessed} of ${parksFound} parks. This might indicate a Vercel function timeout. Consider upgrading to Vercel Pro for longer execution times (up to 5 minutes).`
      response.partial = true
    }
    
    return Response.json(response, { status: 200, headers })
    
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

