/**
 * Inngest Background Job Functions
 * Handles long-running file processing tasks
 */

import { inngest } from './client.js'
import { processFileFromStorage } from '../lib/utils/streaming-processor.js'
import { batchInsertOrUpdateParks } from '../lib/utils/db-operations.js'
import { supabaseServer } from '../lib/supabase-server.js'

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

