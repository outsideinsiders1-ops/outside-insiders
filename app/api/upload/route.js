/**
 * Next.js API Route: /api/upload
 * Handles file uploads (GeoJSON, Shapefiles)
 * Priority: 1 (highest)
 */

import { batchInsertOrUpdateParks } from '../../../lib/utils/db-operations.js'
import { parseShapefile } from '../../../lib/utils/shapefile-parser.js'
import { simplifyBoundary } from '../../../lib/utils/geometry-simplify.js'
import { mapPropertiesToParkSchema, logUnmappedProperties } from '../../../lib/utils/field-mapper.js'
import { geojsonToWKT, validateGeometry as validateWKT } from '../../../lib/utils/geometry-wkt.js'
import { validateGeometry, fixGeometry } from '../../../lib/utils/geometry-validator.js'
import { normalizeParkName } from '../../../lib/utils/db-operations.js'
import { cleanupChunks } from '../../../lib/utils/chunked-upload.js'
import { supabaseServer } from '../../../lib/supabase-server.js'
import { normalizeStateToCode } from '../../../lib/utils/state-normalizer.js'
import { inngest } from '../../../inngest/client.js'

// Increase timeout for large file processing (5 minutes)
// Note: Vercel Hobby plan has 10s limit, Pro plan supports up to 300s
export const maxDuration = 300

export async function POST(request) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const formData = await request.formData()
    const fileUrl = formData.get('fileUrl') // Supabase Storage URL
    const file = formData.get('file') // Fallback for direct uploads (small files)
    const sourceType = formData.get('sourceType') || 'State Agency'
    const sourceName = formData.get('sourceName') || file?.name || 'unknown'
    const defaultState = formData.get('defaultState') || null // User-provided state if file doesn't have it
    // Note: filePath available via formData.get('filePath') for future cleanup if needed
    
    // Determine if we're using storage URL or direct file upload
    let fileToProcess = file
    let fileName = file?.name || sourceName
    
    // If fileUrl is provided, download from Supabase Storage
    if (fileUrl) {
      try {
        console.log(`Downloading file from storage: ${fileUrl}`)
        
        // Check if this is a chunked upload
        // Always check for chunks if filePath is provided, even if URL doesn't explicitly say it's chunked
        const filePath = formData.get('filePath') || null
        
        // If we have a filePath, check if chunks exist in storage
        let isChunked = false
        let basePath = null
        let directory = 'uploads'
        let baseFileName = null
        
        if (filePath) {
          // Extract base path (filePath is like "uploads/1234567890-file.zip")
          // Chunks will be "uploads/1234567890-file.zip.chunk.0", etc.
          basePath = filePath
          const pathParts = basePath.split('/')
          directory = pathParts.slice(0, -1).join('/') || 'uploads'
          baseFileName = pathParts[pathParts.length - 1]
          
          // ALWAYS check for chunks first if filePath is provided
          // When chunks are uploaded, there's no actual file at the public URL
          try {
            const { data: files, error: listError } = await supabaseServer.storage
              .from('park-uploads')
              .list(directory)
            
            if (listError) {
              console.warn('Could not list directory to check for chunks:', listError.message)
              // If we can't list, try to download as regular file
              isChunked = false
            } else if (files && files.length > 0) {
              // Check if any files match the chunk pattern
              const chunkPattern = new RegExp(`^${baseFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.chunk\\.\\d+$`)
              const chunkFiles = files.filter(f => chunkPattern.test(f.name))
              isChunked = chunkFiles.length > 0
              
              if (isChunked) {
                console.log(`Detected ${chunkFiles.length} chunks for file: ${baseFileName}`)
              } else {
                console.log(`No chunks found for ${baseFileName}, will try to download as regular file`)
              }
            } else {
              // No files in directory, try regular file download
              console.log(`No files found in directory ${directory}, will try to download as regular file`)
              isChunked = false
            }
          } catch (listError) {
            console.warn('Could not check for chunks, will try regular file download:', listError.message)
            isChunked = false
          }
        }
        
        if (isChunked && basePath) {
          // Reassemble chunks from storage
          console.log('Detected chunked upload, reassembling chunks...')
          console.log('File path:', basePath)
          
          // List all files in the directory to find chunks
          const { data: files, error: listError } = await supabaseServer.storage
            .from('park-uploads')
            .list(directory)
          
          if (listError) {
            console.error('Error listing files:', listError)
            throw new Error(`Failed to list chunks: ${listError.message}`)
          }
          
          console.log(`Listing directory "${directory}" - found ${files?.length || 0} files`)
          if (files && files.length > 0) {
            console.log('All files in directory:', files.map(f => f.name))
          }
          
          // First, check if there are ANY chunk files in the directory
          const allChunkFiles = (files || []).filter(f => f.name.includes('.chunk.'))
          console.log(`Found ${allChunkFiles.length} total chunk files in directory`)
          
          if (allChunkFiles.length > 0) {
            console.log('Chunk files found:', allChunkFiles.map(f => f.name))
          }
          
          // Count chunks that match our base filename (chunks are named: baseFileName.chunk.0, baseFileName.chunk.1, etc.)
          const escapedBaseFileName = baseFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const chunkPattern = new RegExp(`^${escapedBaseFileName}\\.chunk\\.\\d+$`)
          let chunkFiles = (files || []).filter(f => {
            const matches = chunkPattern.test(f.name)
            if (matches) {
              console.log(`Matched chunk: ${f.name}`)
            }
            return matches
          })
          
          // Also try to find chunks with any timestamp prefix (in case filePath changed)
          if (chunkFiles.length === 0 && allChunkFiles.length > 0) {
            console.log('No exact matches found, trying to find chunks with any timestamp prefix...')
            // Extract original filename (remove timestamp if present)
            const originalFileName = baseFileName.replace(/^\d+-/, '')
            const escapedOriginal = originalFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const flexiblePattern = new RegExp(`^\\d+-${escapedOriginal}\\.chunk\\.\\d+$`)
            const flexibleMatches = (files || []).filter(f => {
              const matches = flexiblePattern.test(f.name)
              if (matches) {
                console.log(`Found chunk with flexible pattern: ${f.name}`)
              }
              return matches
            })
            
            if (flexibleMatches.length > 0) {
              console.log(`Found ${flexibleMatches.length} chunks with flexible pattern matching`)
              // Use the first match to determine the actual base path
              const firstMatch = flexibleMatches[0].name
              const actualBaseFileName = firstMatch.replace(/\.chunk\.\d+$/, '')
              basePath = directory ? `${directory}/${actualBaseFileName}` : actualBaseFileName
              baseFileName = actualBaseFileName
              chunkFiles = flexibleMatches
            } else {
              // Last resort: if we found chunk files but pattern doesn't match, try to use them anyway
              // This handles cases where the filename might have changed slightly
              console.log('Found chunk files but pattern matching failed. Attempting to use any chunk files...')
              if (allChunkFiles.length > 0) {
                // Group chunks by base name (everything before .chunk.)
                const chunkGroups = {}
                allChunkFiles.forEach(f => {
                  const baseName = f.name.replace(/\.chunk\.\d+$/, '')
                  if (!chunkGroups[baseName]) {
                    chunkGroups[baseName] = []
                  }
                  chunkGroups[baseName].push(f)
                })
                
                // Use the group with the most chunks (likely our file)
                const largestGroup = Object.values(chunkGroups).sort((a, b) => b.length - a.length)[0]
                if (largestGroup && largestGroup.length > 0) {
                  console.log(`Using chunk group with ${largestGroup.length} chunks: ${largestGroup[0].name.replace(/\.chunk\.\d+$/, '')}`)
                  const actualBaseFileName = largestGroup[0].name.replace(/\.chunk\.\d+$/, '')
                  basePath = directory ? `${directory}/${actualBaseFileName}` : actualBaseFileName
                  baseFileName = actualBaseFileName
                  chunkFiles = largestGroup
                }
              }
            }
          }
          
          const totalChunks = chunkFiles.length
          
          console.log(`Found ${totalChunks} chunks matching pattern for ${baseFileName}`)
          
          if (totalChunks === 0) {
            // No chunks found - try to download as regular file
            console.log('No chunks found, trying to download as regular file from storage...')
            try {
              // Try to download directly from Supabase Storage using the filePath
              const { data: fileData, error: downloadError } = await supabaseServer.storage
                .from('park-uploads')
                .download(basePath)
              
              if (downloadError) {
                // If direct download fails, try the public URL
                console.log('Direct download failed, trying public URL...')
                const response = await fetch(fileUrl)
                if (!response.ok) {
                  throw new Error(`Failed to download file from storage: ${response.statusText}. File may not exist or chunks may not have been uploaded correctly.`)
                }
                const blob = await response.blob()
                const urlParts = fileUrl.split('/')
                const urlFileName = urlParts[urlParts.length - 1].split('?')[0]
                fileName = urlFileName || sourceName
                fileToProcess = new File([blob], fileName, { type: blob.type })
              } else {
                // Direct download succeeded
                const arrayBuffer = await fileData.arrayBuffer()
                fileName = baseFileName || sourceName
                fileToProcess = new File([arrayBuffer], fileName, { type: 'application/zip' })
              }
            } catch (fetchError) {
              throw new Error(`Failed to download file: ${fetchError.message}. If this was a chunked upload, ensure all chunks were uploaded successfully.`)
            }
          } else {
            // Sort chunks by number to ensure correct order
            chunkFiles.sort((a, b) => {
              const aNum = parseInt(a.name.match(/\.chunk\.(\d+)$/)?.[1] || '0')
              const bNum = parseInt(b.name.match(/\.chunk\.(\d+)$/)?.[1] || '0')
              return aNum - bNum
            })
            console.log(`Reassembling ${totalChunks} chunks from base path: ${basePath}`)
            
            // Estimate total file size from first chunk
            let estimatedSize = 0
            try {
              const { data: firstChunk } = await supabaseServer.storage
                .from('park-uploads')
                .download(`${basePath}.chunk.0`)
              if (firstChunk) {
                const firstChunkSize = (await firstChunk.arrayBuffer()).byteLength
                estimatedSize = firstChunkSize * totalChunks
              }
            } catch (e) {
              console.warn('Could not estimate file size:', e)
            }
            
            // Warn if file is very large (>1GB) - Vercel has memory limits
            if (estimatedSize > 1024 * 1024 * 1024) {
              const sizeGB = (estimatedSize / (1024 * 1024 * 1024)).toFixed(2)
              console.warn(`⚠️ Large file detected: ~${sizeGB} GB. This may exceed server memory limits.`)
              
              // For files >1GB, we'll try but warn the user
              if (estimatedSize > 2 * 1024 * 1024 * 1024) {
                throw new Error(
                  `File is too large (${sizeGB} GB) to process in a single request. ` +
                  `Vercel serverless functions have memory limits. ` +
                  `Please split the file into smaller parts (<1GB each) or use a different processing method.`
                )
              }
            }
            
            // Reassemble chunks using the sorted chunk files
            // Use the actual chunk file names from the sorted list instead of constructing paths
            const chunks = []
            const chunkNumbers = chunkFiles.map(f => {
              const match = f.name.match(/\.chunk\.(\d+)$/)
              return match ? parseInt(match[1]) : -1
            }).filter(n => n >= 0).sort((a, b) => a - b)
            
            console.log(`Chunk numbers found: ${chunkNumbers.join(', ')}`)
            console.log(`Expected range: 0 to ${totalChunks - 1}`)
            
            // Check for missing chunks
            const missingChunks = []
            for (let i = 0; i < totalChunks; i++) {
              if (!chunkNumbers.includes(i)) {
                missingChunks.push(i)
              }
            }
            
            if (missingChunks.length > 0) {
              throw new Error(`Missing chunks: ${missingChunks.join(', ')}. Expected ${totalChunks} chunks but found ${chunkNumbers.length}.`)
            }
            
            // Download chunks in order
            for (let i = 0; i < totalChunks; i++) {
              const chunkPath = `${basePath}.chunk.${i}`
              console.log(`Downloading chunk ${i + 1}/${totalChunks}: ${chunkPath}`)
              
              try {
                const { data, error } = await supabaseServer.storage
                  .from('park-uploads')
                  .download(chunkPath)
                
                if (error) {
                  console.error(`Chunk download error details:`, {
                    chunkPath,
                    error: error.message,
                    errorCode: error.statusCode
                  })
                  throw new Error(`Failed to download chunk ${i + 1}/${totalChunks} (${chunkPath}): ${error.message}`)
                }
                
                if (!data) {
                  throw new Error(`Chunk ${i + 1}/${totalChunks} returned no data`)
                }
                
                const arrayBuffer = await data.arrayBuffer()
                chunks.push(arrayBuffer)
                
                console.log(`Chunk ${i + 1}/${totalChunks} downloaded: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`)
                
                // Log progress every 10 chunks
                if ((i + 1) % 10 === 0 || i === totalChunks - 1) {
                  console.log(`Downloaded ${i + 1}/${totalChunks} chunks (${Math.round((i + 1) / totalChunks * 100)}%)`)
                }
              } catch (error) {
                console.error(`Error downloading chunk ${i + 1}:`, error)
                throw new Error(`Failed to download chunk ${i + 1}/${totalChunks}: ${error.message}`)
              }
            }
            
            console.log(`All ${totalChunks} chunks downloaded. Reassembling...`)
            
            // Combine chunks into single Blob
            const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
            console.log(`Total file size: ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`)
            
            // Check memory constraints (Vercel serverless functions have ~1GB memory limit)
            // We use 1.2GB as a safe limit to leave room for processing
            if (totalSize > 1.2 * 1024 * 1024 * 1024) {
              throw new Error(
                `File size (${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB) exceeds server memory limits. ` +
                `Vercel serverless functions have memory constraints. ` +
                `Please split the file into smaller parts (<1GB each) or contact support for assistance with very large files.`
              )
            }
            
            const combined = new Uint8Array(totalSize)
            let offset = 0
            
            for (const chunk of chunks) {
              combined.set(new Uint8Array(chunk), offset)
              offset += chunk.byteLength
            }
            
            console.log('File reassembled successfully')
            const blob = new Blob([combined])
            
            // Clean up chunks after reassembly
            try {
              await cleanupChunks(supabaseServer, 'park-uploads', basePath, totalChunks)
              console.log('Chunks cleaned up')
            } catch (cleanupError) {
              console.warn('Failed to cleanup chunks (non-fatal):', cleanupError)
            }
            
            // Extract filename
            fileName = baseFileName || sourceName
            fileToProcess = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
          }
        } else {
          // Regular file download (no chunks detected)
          console.log('Downloading regular file (not chunked)')
          
          // For files < 150MB, try direct download from Supabase Storage
          let blob = null
          if (filePath) {
            try {
              console.log(`Attempting direct download from path: ${filePath}`)
              const { data: fileData, error: downloadError } = await supabaseServer.storage
                .from('park-uploads')
                .download(filePath)
              
              if (!downloadError && fileData) {
                blob = await fileData.blob()
                console.log(`Downloaded file directly: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)
              } else if (downloadError) {
                console.warn('Direct download error:', downloadError.message, downloadError.statusCode)
                // If direct download fails, it might be chunked but detection failed
                // Check if chunks exist with a more flexible pattern
                console.log('Direct download failed, checking if file might be chunked...')
                const { data: checkFiles } = await supabaseServer.storage
                  .from('park-uploads')
                  .list(directory)
                
                if (checkFiles) {
                  // Look for any .chunk files in the directory
                  const anyChunks = checkFiles.filter(f => f.name.includes('.chunk.'))
                  if (anyChunks.length > 0) {
                    console.log(`Found ${anyChunks.length} chunk files but pattern didn't match. Chunk files:`, anyChunks.slice(0, 5).map(f => f.name))
                    throw new Error(
                      `File appears to be chunked (found ${anyChunks.length} chunk files) but chunk detection failed. ` +
                      `Please ensure all chunks were uploaded with the correct naming pattern: ${baseFileName}.chunk.0, ${baseFileName}.chunk.1, etc.`
                    )
                  }
                }
              }
            } catch (directError) {
              console.warn('Direct download failed:', directError.message)
              // Continue to try public URL
            }
          }
          
          // Fallback to public URL if direct download didn't work
          if (!blob) {
            console.log('Trying public URL download...')
            try {
              const response = await fetch(fileUrl)
              if (!response.ok) {
                // Provide more helpful error message
                if (response.status === 400) {
                  throw new Error(
                    `File not found at public URL (Bad Request). ` +
                    `If this was a chunked upload, the chunks may not have been uploaded correctly, ` +
                    `or the file may be too large for direct download. ` +
                    `Please check that all chunks were uploaded successfully.`
                  )
                }
                throw new Error(`Failed to download file from storage: ${response.status} ${response.statusText}`)
              }
              blob = await response.blob()
              console.log(`Downloaded from public URL: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)
            } catch (fetchError) {
              throw new Error(
                `Failed to download file: ${fetchError.message}. ` +
                `If this was a chunked upload, ensure all chunks were uploaded successfully. ` +
                `File path: ${filePath || 'unknown'}`
              )
            }
          }
          
          // Create a File-like object from blob for processing
          // Extract filename from URL or use sourceName
          const urlParts = fileUrl.split('/')
          const urlFileName = urlParts[urlParts.length - 1].split('?')[0] // Remove query params
          fileName = urlFileName || sourceName
          
          fileToProcess = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
        }
      } catch (error) {
        console.error('File download/reassembly error:', error)
        const errorMessage = error.message || 'Unknown error'
        
        // Provide more helpful error messages
        let userMessage = errorMessage
        if (errorMessage.includes('memory') || errorMessage.includes('too large')) {
          userMessage = errorMessage
        } else if (errorMessage.includes('Failed to download chunk')) {
          userMessage = `File reassembly failed: ${errorMessage}. The file may be too large or some chunks may be missing.`
        } else {
          userMessage = `Failed to process uploaded file: ${errorMessage}`
        }
        
        return Response.json({ 
          success: false, 
          error: userMessage,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 400, headers })
      }
    }
    
    if (!fileToProcess) {
      return Response.json({ 
        success: false, 
        error: 'No file provided. Please upload a file or provide a file URL.' 
      }, { status: 400, headers })
    }

    // Check if file should be processed in background (large files)
    const fileSize = fileToProcess.size || 0
    const filePath = formData.get('filePath') || null
    const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024 // 500MB
    const LARGE_FEATURE_THRESHOLD = 10000 // 10,000 features

    // For large files or if filePath is provided (chunked upload), use background processing
    if (fileSize > LARGE_FILE_THRESHOLD || filePath) {
      console.log(`📦 File is large (${(fileSize / 1024 / 1024).toFixed(2)} MB) or chunked. Queuing for background processing...`)
      
      // If we have a filePath, use it; otherwise, we need to upload first
      if (!filePath) {
        return Response.json({
          success: false,
          error: 'Large files must be uploaded in chunks first. Please use the chunked upload feature.'
        }, { status: 400, headers })
      }

      // Trigger Inngest background job
      try {
        await inngest.send({
          name: 'file/process',
          data: {
            filePath: filePath,
            bucketName: 'park-uploads',
            sourceType: sourceType,
            sourceName: sourceName,
            defaultState: defaultState
          }
        })

        return Response.json({
          success: true,
          message: 'File queued for background processing. This may take several minutes for large files.',
          backgroundJob: true,
          filePath: filePath
        }, { headers })
      } catch (error) {
        console.error('Failed to queue background job:', error)
        // Fall back to direct processing if Inngest fails
        console.log('Falling back to direct processing...')
      }
    }
    
    // Check file type
    const fileNameLower = fileName.toLowerCase()
    const isShapefile = fileNameLower.endsWith('.shp') || fileNameLower.endsWith('.zip')
    let geojson
    
    // Parse file based on type
    if (isShapefile) {
      try {
        // Parse Shapefile (handles both .shp and .zip)
        geojson = await parseShapefile(fileToProcess)
      } catch (error) {
        return Response.json({ 
          success: false, 
          error: `Failed to parse shapefile: ${error.message}` 
        }, { status: 400, headers })
      }
    } else {
      // Read and parse GeoJSON
      try {
        const fileContent = await fileToProcess.text()
        geojson = JSON.parse(fileContent)
      } catch {
        return Response.json({ 
          success: false, 
          error: 'Invalid JSON file. Please upload a valid GeoJSON file (.geojson or .json with GeoJSON format).' 
        }, { status: 400, headers })
      }
    }
    
    // Validate GeoJSON structure
    if (!geojson.type || !geojson.features) {
      return Response.json({ 
        success: false, 
        error: 'Invalid GeoJSON format. File must have "type" and "features" properties.' 
      }, { status: 400, headers })
    }
    
    // Step 1: Process all features and extract park data
    const features = geojson.features || []
    const rawParks = []
    
    console.log(`Processing ${features.length} features from ${sourceName}`)
    
    // For very large files, process in batches to avoid memory issues
    const BATCH_SIZE = 1000
    const totalBatches = Math.ceil(features.length / BATCH_SIZE)
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE
      const batchEnd = Math.min(batchStart + BATCH_SIZE, features.length)
      const batch = features.slice(batchStart, batchEnd)
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (features ${batchStart + 1}-${batchEnd} of ${features.length})...`)
      
      for (let i = 0; i < batch.length; i++) {
        const feature = batch[i]
        const globalIndex = batchStart + i
        
        if (!feature.geometry || !feature.properties) continue
      
        // Extract coordinates from geometry
        let latitude = null
        let longitude = null
        let geometry = null
        
        if (feature.geometry.type === 'Point' && feature.geometry.coordinates) {
          // Point geometry: [longitude, latitude]
          longitude = feature.geometry.coordinates[0]
          latitude = feature.geometry.coordinates[1]
          // For points, store as GeoJSON for geometry column
          geometry = feature.geometry
        } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          // Polygon geometry: calculate centroid for lat/lng
          const coords = feature.geometry.coordinates
          let allLngs = []
          let allLats = []
          
          if (feature.geometry.type === 'Polygon') {
            for (const ring of coords) {
              for (const coord of ring) {
                allLngs.push(coord[0])
                allLats.push(coord[1])
              }
            }
          } else if (feature.geometry.type === 'MultiPolygon') {
            for (const polygon of coords) {
              for (const ring of polygon) {
                for (const coord of ring) {
                  allLngs.push(coord[0])
                  allLats.push(coord[1])
                }
              }
            }
          }
          
          if (allLngs.length > 0 && allLats.length > 0) {
            longitude = allLngs.reduce((a, b) => a + b, 0) / allLngs.length
            latitude = allLats.reduce((a, b) => a + b, 0) / allLats.length
          }
          
          // Simplify geometry to reduce file size (~500 feet accuracy)
          // This significantly reduces point count while maintaining visual accuracy
          const simplifiedGeometry = simplifyBoundary(feature.geometry, 152) // 152 meters = ~500 feet
          geometry = simplifiedGeometry
        }
        
          // Extract properties and map to our schema
        const props = feature.properties
        const mappedProps = mapPropertiesToParkSchema(props)
        
        // Use defaultState if state is not in the file
        if (!mappedProps.state && defaultState) {
          mappedProps.state = defaultState
        }
        
        // Normalize state to state code for consistency (e.g., "Georgia" -> "GA")
        if (mappedProps.state) {
          mappedProps.state = normalizeStateToCode(mappedProps.state)
        }
        
        // CRITICAL: Derive agency from sourceType if not found in file
        // Agency is REQUIRED (NOT NULL) in database schema
        if (!mappedProps.agency || mappedProps.agency === '') {
          const stateCode = mappedProps.state || normalizeStateToCode(defaultState) || ''
          if (sourceType && stateCode) {
            // Derive agency name from sourceType + state code
            const agencyMap = {
              'State Agency': `${stateCode} State Parks`,
              'Public State': `${stateCode} State Parks`,
              'County Agency': `${stateCode} County Parks`,
              'City Agency': `${stateCode} City Parks`,
              'Public Federal': 'Federal Agency',
              'Federal Agency': 'Federal Agency'
            }
            mappedProps.agency = agencyMap[sourceType] || sourceType
            console.log(`Derived agency "${mappedProps.agency}" from sourceType "${sourceType}" and state "${stateCode}"`)
          } else {
            // Fallback to sourceType if no state
            mappedProps.agency = sourceType || 'Unknown Agency'
          }
        }
        
        // Filter ParkServe parks: only include if ParkAccess === 3 (Open Access)
        if (mappedProps._parkAccess !== undefined && mappedProps._parkAccess !== null) {
          const parkAccess = String(mappedProps._parkAccess).trim()
          if (parkAccess !== '3' && parkAccess !== '3.0') {
            console.log(`Skipping park ${mappedProps.name}: ParkAccess is ${parkAccess}, not 3 (Open Access)`)
            continue // Skip this park
          }
        }
        // Remove internal filter field
        delete mappedProps._parkAccess
        
        // Set data_source field
        if (!mappedProps.data_source) {
          mappedProps.data_source = sourceType || sourceName
        }
        
        // Ensure activities and amenities are JSON arrays (not strings)
        if (mappedProps.activities && !Array.isArray(mappedProps.activities)) {
          mappedProps.activities = [mappedProps.activities]
        }
        if (mappedProps.amenities && !Array.isArray(mappedProps.amenities)) {
          mappedProps.amenities = [mappedProps.amenities]
        }
        
        // Log unmapped properties for debugging (only for first few features to avoid spam)
        if (globalIndex < 5) {
          logUnmappedProperties(props)
        }
        
        // Validate and fix geometry
        let geometryValue = null
        if (geometry) {
          try {
            // Validate geometry structure
            const validation = validateGeometry(geometry)
            if (!validation.valid) {
              console.warn(`Park ${mappedProps.name} has invalid geometry: ${validation.error}`)
              // Try to fix common issues
              const fixed = fixGeometry(geometry)
              const fixedValidation = validateGeometry(fixed)
              if (fixedValidation.valid) {
                geometry = fixed
                console.log(`Fixed geometry for ${mappedProps.name}`)
              } else {
                console.warn(`Could not fix geometry for ${mappedProps.name}, skipping geometry`)
                geometry = null
              }
            }
            
            // Convert to WKT format for PostGIS geography column
            if (geometry) {
              const wktValidation = validateWKT(geometry)
              if (wktValidation.valid) {
                geometryValue = geojsonToWKT(geometry, 4326) // SRID 4326 (WGS84)
                if (!geometryValue) {
                  console.warn(`Failed to convert geometry to WKT for ${mappedProps.name}`)
                }
              } else {
                console.warn(`Geometry validation failed for ${mappedProps.name}: ${wktValidation.error}`)
              }
            }
          } catch (err) {
            console.warn(`Failed to process geometry for ${mappedProps.name}:`, err)
            geometryValue = null
          }
        }
        
        // Get area/acres for grouping (keep largest parcel)
        const acres = mappedProps.acres || 
          (props.GIS_Acres ? parseFloat(props.GIS_Acres) : null) ||
          (props.acres ? parseFloat(props.acres) : null) ||
          (props.AREA ? parseFloat(props.AREA) : null) ||
          0
        
        const park = {
          ...mappedProps,
          latitude,
          longitude,
          acres,
          // Store geometry as WKT string for PostGIS geography column
          ...(geometryValue && { geometry: geometryValue }),
        }
        
        // Validate required fields
        if (!park.name || park.name === 'Unnamed Park') {
          console.warn('Skipping feature with no name:', feature)
          continue
        }
        
        // CRITICAL: Parks must have coordinates to display on map
        // If coordinates are missing but we have geometry, try to calculate centroid
        if ((!park.latitude || !park.longitude) && geometry) {
          console.log(`Park ${park.name} missing coordinates but has geometry - calculating centroid...`)
          // Recalculate from geometry if we have it
          if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            const coords = geometry.coordinates
            let allLngs = []
            let allLats = []
            
            if (geometry.type === 'Polygon') {
              for (const ring of coords) {
                for (const coord of ring) {
                  allLngs.push(coord[0])
                  allLats.push(coord[1])
                }
              }
            } else if (geometry.type === 'MultiPolygon') {
              for (const polygon of coords) {
                for (const ring of polygon) {
                  for (const coord of ring) {
                    allLngs.push(coord[0])
                    allLats.push(coord[1])
                  }
                }
              }
            }
            
            if (allLngs.length > 0 && allLats.length > 0) {
              park.longitude = allLngs.reduce((a, b) => a + b, 0) / allLngs.length
              park.latitude = allLats.reduce((a, b) => a + b, 0) / allLats.length
              console.log(`Calculated centroid for ${park.name}: (${park.latitude}, ${park.longitude})`)
            }
          }
        }
        
        // Final validation - skip if still no valid coordinates
        if (!park.latitude || !park.longitude || 
            isNaN(park.latitude) || isNaN(park.longitude) ||
            park.latitude < -90 || park.latitude > 90 ||
            park.longitude < -180 || park.longitude > 180) {
          console.warn(`Skipping ${park.name}: Invalid or missing coordinates (${park.latitude}, ${park.longitude})`)
          continue
        }
        
        rawParks.push(park)
      }
      
      // Log batch completion
      if (batchIndex < totalBatches - 1) {
        console.log(`Batch ${batchIndex + 1} complete. Processed ${rawParks.length} parks so far...`)
      }
    }
    
    // Step 2: Group and deduplicate parks (keep largest parcel per park)
    console.log(`Grouping ${rawParks.length} parks to remove duplicates...`)
    const parksByKey = new Map()
    
    for (const park of rawParks) {
      // Create key: normalized name + state
      const normalizedName = normalizeParkName(park.name)
      const key = `${normalizedName}_${park.state || 'UNKNOWN'}`
      
      const existing = parksByKey.get(key)
      
      if (!existing) {
        // First occurrence - keep it
        parksByKey.set(key, park)
      } else {
        // Duplicate found - keep the one with larger area
        if (park.acres > (existing.acres || 0)) {
          parksByKey.set(key, park)
          console.log(`Replaced ${park.name} (${existing.acres || 0} acres) with larger version (${park.acres} acres)`)
        }
      }
    }
    
    const parks = Array.from(parksByKey.values())
    console.log(`After grouping: ${parks.length} unique parks (removed ${rawParks.length - parks.length} duplicates)`)
    
    if (parks.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'No valid parks found in file. Ensure features have name and coordinates.' 
      }, { status: 400, headers })
    }
    
    // Process parks with intelligent merging and deduplication
    const results = await batchInsertOrUpdateParks(parks, sourceType)
    
    return Response.json({ 
      success: true,
      message: `Processed ${parks.length} parks from ${sourceName}`,
      parksFound: parks.length,
      parksAdded: results.added,
      parksUpdated: results.updated,
      parksSkipped: results.skipped,
      errors: results.errors.length > 0 ? results.errors : undefined,
      sourceType,
      sourceName
    }, { headers })
    
  } catch (error) {
    console.error('Upload API Error:', error)
    console.error('Error stack:', error.stack)
    
    // Provide more detailed error messages
    let errorMessage = error.message || 'Unknown error processing file'
    let statusCode = 500
    
    // Check for specific error types
    if (error.message && error.message.includes('too large')) {
      statusCode = 400
    } else if (error.message && (error.message.includes('memory') || error.message.includes('timeout'))) {
      statusCode = 413 // Payload Too Large
      errorMessage = `File processing failed: ${error.message}. The file may be too large for serverless processing. Consider splitting into smaller files.`
    }
    
    return Response.json({ 
      success: false, 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: statusCode, headers })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
