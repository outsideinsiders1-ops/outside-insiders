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
          
          // Check if chunks exist by listing the directory
          try {
            const { data: files } = await supabaseServer.storage
              .from('park-uploads')
              .list(directory)
            
            if (files && files.length > 0) {
              // Check if any files match the chunk pattern
              const chunkPattern = new RegExp(`^${baseFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.chunk\\.\\d+$`)
              const chunkFiles = files.filter(f => chunkPattern.test(f.name))
              isChunked = chunkFiles.length > 0
              
              if (isChunked) {
                console.log(`Detected ${chunkFiles.length} chunks for file: ${baseFileName}`)
              }
            }
          } catch (listError) {
            console.warn('Could not check for chunks, assuming regular file:', listError)
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
          
          // Count chunks that match our base filename (chunks are named: baseFileName.chunk.0, baseFileName.chunk.1, etc.)
          const chunkPattern = new RegExp(`^${baseFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.chunk\\.\\d+$`)
          const chunkFiles = (files || []).filter(f => chunkPattern.test(f.name))
          const totalChunks = chunkFiles.length
          
          console.log(`Found ${totalChunks} chunks matching pattern for ${baseFileName}`)
          
          // Sort chunks by number to ensure correct order
          chunkFiles.sort((a, b) => {
            const aNum = parseInt(a.name.match(/\.chunk\.(\d+)$/)?.[1] || '0')
            const bNum = parseInt(b.name.match(/\.chunk\.(\d+)$/)?.[1] || '0')
            return aNum - bNum
          })
          
          if (totalChunks === 0) {
            // Fallback: try to download as regular file
            console.log('No chunks found, trying to download as regular file...')
            const response = await fetch(fileUrl)
            if (!response.ok) {
              throw new Error(`Failed to download file from storage: ${response.statusText}`)
            }
            const blob = await response.blob()
            const urlParts = fileUrl.split('/')
            const urlFileName = urlParts[urlParts.length - 1].split('?')[0]
            fileName = urlFileName || sourceName
            fileToProcess = new File([blob], fileName, { type: blob.type })
          } else {
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
            // We'll download chunks in order based on the sorted list
            const chunks = []
            for (let i = 0; i < totalChunks; i++) {
              const chunkPath = `${basePath}.chunk.${i}`
              console.log(`Downloading chunk ${i + 1}/${totalChunks}: ${chunkPath}`)
              
              try {
                const { data, error } = await supabaseServer.storage
                  .from('park-uploads')
                  .download(chunkPath)
                
                if (error) {
                  throw new Error(`Failed to download chunk ${i + 1}/${totalChunks}: ${error.message}`)
                }
                
                if (!data) {
                  throw new Error(`Chunk ${i + 1}/${totalChunks} returned no data`)
                }
                
                chunks.push(await data.arrayBuffer())
                
                // Log progress every 10 chunks
                if ((i + 1) % 10 === 0) {
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
            
            // Check memory constraints
            if (totalSize > 1.5 * 1024 * 1024 * 1024) {
              throw new Error(
                `File size (${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB) exceeds server memory limits. ` +
                `Please split the file into smaller parts (<1GB each).`
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
          // Regular file download
          console.log('Downloading regular file (not chunked)')
          const response = await fetch(fileUrl)
          if (!response.ok) {
            throw new Error(`Failed to download file from storage: ${response.statusText}`)
          }
          
          // Get file as blob
          const blob = await response.blob()
          
          // Create a File-like object from blob for processing
          // Extract filename from URL or use sourceName
          const urlParts = fileUrl.split('/')
          const urlFileName = urlParts[urlParts.length - 1].split('?')[0] // Remove query params
          fileName = urlFileName || sourceName
          
          fileToProcess = new File([blob], fileName, { type: blob.type })
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
    
    for (let i = 0; i < features.length; i++) {
      const feature = features[i]
      
      // Log progress for large files (every 100 features)
      if (features.length > 100 && i % 100 === 0) {
        console.log(`Processing feature ${i + 1} of ${features.length}...`)
      }
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
      if (i < 5) {
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
    return Response.json({ 
      success: false, 
      error: error.message || 'Unknown error processing file' 
    }, { status: 500, headers })
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
