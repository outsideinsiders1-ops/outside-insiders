/**
 * Inngest Background Job Functions
 * Handles long-running file processing tasks
 */

import { inngest } from './client.js'
import { processFileFromStorage } from '../lib/utils/streaming-processor.js'
import { batchInsertOrUpdateParks, insertOrUpdatePark } from '../lib/utils/db-operations.js'
import { supabaseServer } from '../lib/supabase-server.js'
import { fetchRecreationFacilityById } from '../lib/utils/recreation-gov-api.js'
import { mapRecreationGovToParkSchema } from '../lib/utils/api-field-mapper.js'

// Note: Inngest functions run in a separate environment
// Make sure all imports are compatible with the Inngest runtime

/**
 * Process a large park file in the background
 * This function runs with extended timeouts and can handle very large files
 */
export const processParkFile = inngest.createFunction(
  {
    id: 'process-park-file',
    name: 'Process Park File',
    retries: 3, // Retry up to 3 times on failure
    concurrency: {
      limit: 2, // Process max 2 files at a time
      key: 'event.data.filePath' // Use filePath as the concurrency key
    }
  },
  { event: 'file/process' },
  async ({ event, step }) => {
    const {
      filePath,
      bucketName = 'park-uploads',
      sourceType = 'State Agency',
      sourceName = 'Unknown',
      defaultState = null
    } = event.data

    console.log(`🚀 Starting background processing for: ${filePath}`)

    // Step 1: Process file in batches
    const results = await step.run('process-file', async () => {
      let totalProcessed = 0
      let totalAdded = 0
      let totalUpdated = 0
      let totalSkipped = 0
      const errors = []

      try {
        // Process file from storage using streaming
        for await (const batch of processFileFromStorage(
          supabaseServer,
          bucketName,
          filePath,
          sourceType,
          sourceName,
          defaultState,
          {
            batchSize: 500, // Larger batches for background processing
            simplifyTolerance: 0.0001,
            skipInvalidGeometry: true
          }
        )) {
          // Insert/update batch in database
          try {
            const batchResults = await batchInsertOrUpdateParks(batch, sourceType)
            totalProcessed += batch.length
            totalAdded += batchResults.added || 0
            totalUpdated += batchResults.updated || 0
            totalSkipped += batchResults.skipped || 0

            console.log(
              `📊 Progress: ${totalProcessed} processed (${totalAdded} added, ${totalUpdated} updated, ${totalSkipped} skipped)`
            )
          } catch (batchError) {
            console.error(`❌ Error processing batch:`, batchError)
            errors.push({
              batch: batch.length,
              error: batchError.message
            })
          }
        }

        return {
          success: true,
          totalProcessed,
          totalAdded,
          totalUpdated,
          totalSkipped,
          errors: errors.length > 0 ? errors : undefined
        }
      } catch (error) {
        console.error(`❌ Error processing file:`, error)
        return {
          success: false,
          error: error.message,
          totalProcessed,
          totalAdded,
          totalUpdated,
          totalSkipped,
          errors
        }
      }
    })

    // Step 2: Update file status in database (optional)
    await step.run('update-status', async () => {
      // You could store processing status in a database table
      // For now, we'll just log it
      console.log(`✅ Processing complete for ${filePath}:`, results)
      return results
    })

    return results
  }
)

/**
 * Enrich Recreation.gov facilities with detailed data from facility{id} endpoint
 * Processes facilities in batches to avoid rate limits and timeouts
 */
export const enrichRecreationGovFacilities = inngest.createFunction(
  {
    id: 'enrich-recreation-gov-facilities',
    name: 'Enrich Recreation.gov Facilities',
    retries: 3,
    concurrency: {
      limit: 1, // Process one batch at a time to avoid rate limits
      key: 'event.data.batchId'
    }
  },
  { event: 'recreation-gov/enrich-batch' },
  async ({ event, step }) => {
    const {
      facilityIds,
      apiKey,
      batchId,
      totalBatches
    } = event.data

    console.log(`🚀 Starting enrichment for batch ${batchId}/${totalBatches} (${facilityIds.length} facilities)`)

    // Step 1: Fetch detailed facility data for each facility in the batch
    const enrichmentResults = await step.run('enrich-facilities', async () => {
      let enriched = 0
      let failed = 0
      let updated = 0
      const errors = []

      // Process facilities sequentially to respect rate limits
      for (const facilityId of facilityIds) {
        try {
          // Fetch existing park from database
          const { data: existingPark, error: fetchError } = await supabaseServer
            .from('parks')
            .select('id, name, source_id, state, latitude, longitude, description, phone, email, website, activities, amenities')
            .eq('data_source', 'Recreation.gov API')
            .eq('source_id', facilityId.toString())
            .maybeSingle()

          if (fetchError) {
            errors.push({ facilityId, error: `Database fetch error: ${fetchError.message}` })
            failed++
            continue
          }

          if (!existingPark) {
            errors.push({ facilityId, error: 'Park not found in database' })
            failed++
            continue
          }

          // Fetch detailed facility data
          const detailedFacility = await fetchRecreationFacilityById(apiKey, facilityId)

          if (!detailedFacility || !detailedFacility.RECDATA || detailedFacility.RECDATA.length === 0) {
            errors.push({ facilityId, error: 'No facility data returned' })
            failed++
            continue
          }

          const facility = detailedFacility.RECDATA[0]

          // Map to park schema with all detailed fields
          const addresses = facility.FACILITYADDRESS || []
          const enrichedPark = mapRecreationGovToParkSchema(facility, addresses)

          // Update the existing park with enriched data
          // Only update fields that are missing or can be improved
          const updateData = {}

          // Update description if it's more detailed
          if (enrichedPark.description && (!existingPark.description || enrichedPark.description.length > (existingPark.description?.length || 0))) {
            updateData.description = enrichedPark.description
          }

          // Update phone/email if missing
          if (enrichedPark.phone && !existingPark.phone) updateData.phone = enrichedPark.phone
          if (enrichedPark.email && !existingPark.email) updateData.email = enrichedPark.email

          // Update state if we got it from addresses
          if (enrichedPark.state && !existingPark.state) updateData.state = enrichedPark.state

          // Update activities if available (merge with existing)
          if (enrichedPark.activities) {
            const existingActivities = existingPark.activities || []
            const newActivities = Array.isArray(enrichedPark.activities) ? enrichedPark.activities : [enrichedPark.activities]
            updateData.activities = [...new Set([...existingActivities, ...newActivities])]
          }

          // Update amenities if available (merge with existing)
          if (enrichedPark.amenities) {
            const existingAmenities = existingPark.amenities || []
            const newAmenities = Array.isArray(enrichedPark.amenities) ? enrichedPark.amenities : [enrichedPark.amenities]
            updateData.amenities = [...new Set([...existingAmenities, ...newAmenities])]
          }

          // Update other fields
          if (enrichedPark.website && !existingPark.website) updateData.website = enrichedPark.website

          // Update coordinates if missing
          if (enrichedPark.latitude && !existingPark.latitude) updateData.latitude = enrichedPark.latitude
          if (enrichedPark.longitude && !existingPark.longitude) updateData.longitude = enrichedPark.longitude

          // If state is still missing but we have coordinates, try reverse geocoding
          if (!updateData.state && !existingPark.state) {
            const lat = updateData.latitude || existingPark.latitude
            const lon = updateData.longitude || existingPark.longitude
            
            if (lat && lon) {
              try {
                const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
                if (MAPBOX_TOKEN) {
                  // Use reverse geocoding to get state from coordinates
                  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
                  const geoResponse = await fetch(url)
                  
                  if (geoResponse.ok) {
                    const geoData = await geoResponse.json()
                    
                    if (geoData.features && geoData.features.length > 0) {
                      const feature = geoData.features[0]
                      const context = feature.context || []
                      
                      // Look for region (state) in context
                      const region = context.find(c => {
                        const id = c.id || ''
                        return id.startsWith('region.') || id.startsWith('region')
                      })
                      
                      if (region && region.short_code) {
                        // Extract state code from "US-CA" format
                        const stateCode = region.short_code.replace('US-', '').toUpperCase()
                        if (stateCode.length === 2) {
                          updateData.state = stateCode
                        }
                      }
                      
                      // Fallback: check if the feature itself is a region
                      if (!updateData.state && feature.place_type && feature.place_type.includes('region')) {
                        const shortCode = feature.properties?.short_code
                        if (shortCode) {
                          const stateCode = shortCode.replace('US-', '').toUpperCase()
                          if (stateCode.length === 2) {
                            updateData.state = stateCode
                          }
                        }
                      }
                    }
                  }
                  
                  // Rate limiting for Mapbox: wait 100ms after geocoding
                  await new Promise(resolve => setTimeout(resolve, 100))
                }
              } catch (geoError) {
                // Silently continue if geocoding fails - not critical
                console.warn(`Reverse geocode failed for facility ${facilityId}:`, geoError.message)
              }
            }
          }

          if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await supabaseServer
              .from('parks')
              .update(updateData)
              .eq('id', existingPark.id)

            if (updateError) {
              errors.push({ facilityId, error: `Update error: ${updateError.message}` })
              failed++
            } else {
              updated++
              enriched++
            }
          } else {
            enriched++ // Count as enriched even if no updates needed
          }

          // Rate limiting: wait 100ms between requests
          await new Promise(resolve => setTimeout(resolve, 100))

        } catch (error) {
          errors.push({ facilityId, error: error.message || 'Unknown error' })
          failed++
        }
      }

      return {
        batchId,
        enriched,
        updated,
        failed,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit error details
      }
    })

    // Step 2: Trigger next batch if there are more batches
    if (batchId < totalBatches) {
      await step.run('trigger-next-batch', async () => {
        // The next batch will be triggered by the orchestrator function
        console.log(`✅ Batch ${batchId} complete. Next batch will be triggered.`)
      })
    }

    return enrichmentResults
  }
)

/**
 * Orchestrator function that starts the enrichment process for all Recreation.gov facilities
 * Splits facilities into batches and triggers enrichment jobs
 */
export const startRecreationGovEnrichment = inngest.createFunction(
  {
    id: 'start-recreation-gov-enrichment',
    name: 'Start Recreation.gov Enrichment',
    retries: 1
  },
  { event: 'recreation-gov/start-enrichment' },
  async ({ event, step }) => {
    const { apiKey, batchSize = 50 } = event.data

    console.log(`🚀 Starting Recreation.gov enrichment process`)

    // Step 1: Get all Recreation.gov facilities from database
    const facilities = await step.run('fetch-facilities', async () => {
      const { data: parks, error } = await supabaseServer
        .from('parks')
        .select('id, source_id')
        .eq('data_source', 'Recreation.gov API')
        .not('source_id', 'is', null)

      if (error) {
        throw new Error(`Failed to fetch facilities: ${error.message}`)
      }

      return parks || []
    })

    console.log(`📊 Found ${facilities.length} Recreation.gov facilities to enrich`)

    // Step 2: Split into batches and trigger enrichment jobs
    const batches = await step.run('create-batches', async () => {
      const batches = []
      const totalBatches = Math.ceil(facilities.length / batchSize)

      for (let i = 0; i < facilities.length; i += batchSize) {
        const batch = facilities.slice(i, i + batchSize)
        const batchId = Math.floor(i / batchSize) + 1
        const facilityIds = batch.map(p => p.source_id).filter(Boolean)

        batches.push({
          batchId,
          facilityIds,
          totalBatches
        })
      }

      return batches
    })

    // Step 3: Trigger all batch jobs (they'll run with concurrency limit)
    await step.sendEvent('trigger-batches', batches.map(batch => ({
      name: 'recreation-gov/enrich-batch',
      data: {
        ...batch,
        apiKey
      }
    })))

    return {
      success: true,
      totalFacilities: facilities.length,
      totalBatches: batches.length,
      batchSize
    }
  }
)

