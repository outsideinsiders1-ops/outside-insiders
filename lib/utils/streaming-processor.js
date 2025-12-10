/**
 * Streaming File Processor
 * Processes large files as they stream from storage, avoiding memory issues
 */

import { parseShapefile } from './shapefile-parser.js'
import { mapPropertiesToParkSchema } from './field-mapper.js'
import { simplifyBoundary } from './geometry-simplify.js'
import { geojsonToWKT } from './geometry-wkt.js'
import { validateGeometry, fixGeometry } from './geometry-validator.js'
import { normalizeStateToCode } from './state-normalizer.js'

/**
 * Process a file stream from Supabase Storage
 * Processes features incrementally and yields batches for database insertion
 * 
 * @param {ReadableStream} stream - File stream from Supabase Storage
 * @param {string} fileName - Name of the file being processed
 * @param {string} sourceType - Source type for the parks
 * @param {string} sourceName - Source name
 * @param {string|null} defaultState - Default state if not in file
 * @param {Object} options - Processing options
 * @returns {AsyncGenerator<Array>} Yields batches of processed park data
 */
export async function* processFileStream(stream, fileName, sourceType, sourceName, defaultState, options = {}) {
  const {
    batchSize = 100, // Process features in batches
    simplifyTolerance = 0.0001,
    skipInvalidGeometry = true
  } = options

  // Read the entire stream into memory (for now - can be optimized for true streaming)
  // For shapefiles/zip files, we need the full file to parse
  const chunks = []
  const reader = stream.getReader()
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  // Combine chunks into a single buffer
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const buffer = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }

  // Create a File-like object for parsing
  const file = {
    name: fileName,
    arrayBuffer: async () => buffer.buffer,
    type: fileName.toLowerCase().endsWith('.zip') ? 'application/zip' : 'application/octet-stream',
    size: buffer.length
  }

  // Parse the file
  let geojson
  if (fileName.toLowerCase().endsWith('.zip') || fileName.toLowerCase().endsWith('.shp')) {
    geojson = await parseShapefile(file)
  } else if (fileName.toLowerCase().endsWith('.geojson') || fileName.toLowerCase().endsWith('.json')) {
    const text = new TextDecoder().decode(buffer)
    geojson = JSON.parse(text)
  } else {
    throw new Error(`Unsupported file type: ${fileName}`)
  }

  if (!geojson.type || !geojson.features) {
    throw new Error('Invalid GeoJSON format')
  }

  // Process features in batches
  const features = geojson.features
  let batch = []
  let processedCount = 0

  for (const feature of features) {
    try {
      // Map properties to park schema
      const parkData = mapPropertiesToParkSchema(feature.properties, sourceType, sourceName, defaultState)

      // Handle geometry
      if (feature.geometry) {
        let geometry = feature.geometry

        // Validate and fix geometry
        const validation = validateGeometry(geometry)
        if (!validation.isValid) {
          if (skipInvalidGeometry) {
            console.warn(`⚠️ Skipping invalid geometry for park: ${parkData.name}`)
            continue
          }
          geometry = fixGeometry(geometry)
        }

        // Simplify if needed
        if (simplifyTolerance > 0) {
          geometry = simplifyBoundary(geometry, simplifyTolerance)
        }

        // Convert to WKT for PostGIS
        parkData.geometry = geojsonToWKT(geometry)
      }

      // Normalize state
      if (parkData.state) {
        parkData.state = normalizeStateToCode(parkData.state)
      } else if (defaultState) {
        parkData.state = normalizeStateToCode(defaultState)
      }

      // Add to batch
      batch.push(parkData)
      processedCount++

      // Yield batch when it reaches batchSize
      if (batch.length >= batchSize) {
        yield batch
        batch = []
      }
    } catch (error) {
      console.error(`Error processing feature: ${error.message}`)
      if (!skipInvalidGeometry) {
        throw error
      }
    }
  }

  // Yield remaining batch
  if (batch.length > 0) {
    yield batch
  }

  console.log(`✅ Processed ${processedCount} features from ${fileName}`)
}

/**
 * Process a file from Supabase Storage
 * Downloads the file and processes it in batches
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} bucketName - Storage bucket name
 * @param {string} filePath - Path to file in storage
 * @param {string} sourceType - Source type
 * @param {string} sourceName - Source name
 * @param {string|null} defaultState - Default state
 * @param {Object} options - Processing options
 * @returns {AsyncGenerator<Array>} Yields batches of processed park data
 */
export async function* processFileFromStorage(supabase, bucketName, filePath, sourceType, sourceName, defaultState, options = {}) {
  console.log(`📥 Downloading file from storage: ${filePath}`)
  
  // Download file from Supabase Storage
  const { data, error } = await supabase.storage
    .from(bucketName)
    .download(filePath)

  if (error) {
    throw new Error(`Failed to download file from storage: ${error.message}`)
  }

  // Convert Blob to ArrayBuffer for processing
  const arrayBuffer = await data.arrayBuffer()

  // Extract filename from path
  const fileName = filePath.split('/').pop() || 'unknown'

  // Create a File-like object for parsing
  const file = {
    name: fileName,
    arrayBuffer: async () => arrayBuffer,
    type: fileName.toLowerCase().endsWith('.zip') ? 'application/zip' : 'application/octet-stream',
    size: arrayBuffer.byteLength
  }

  // Parse the file
  let geojson
  if (fileName.toLowerCase().endsWith('.zip') || fileName.toLowerCase().endsWith('.shp')) {
    console.log('📦 Parsing shapefile...')
    geojson = await parseShapefile(file)
  } else if (fileName.toLowerCase().endsWith('.geojson') || fileName.toLowerCase().endsWith('.json')) {
    console.log('📄 Parsing GeoJSON...')
    const text = new TextDecoder().decode(new Uint8Array(arrayBuffer))
    geojson = JSON.parse(text)
  } else {
    throw new Error(`Unsupported file type: ${fileName}`)
  }

  if (!geojson.type || !geojson.features) {
    throw new Error('Invalid GeoJSON format')
  }

  console.log(`✅ Parsed ${geojson.features.length} features from ${fileName}`)

  // Process features in batches
  const features = geojson.features
  const {
    batchSize = 500,
    simplifyTolerance = 0.0001,
    skipInvalidGeometry = true
  } = options

  let batch = []
  let processedCount = 0

  for (const feature of features) {
    try {
      // Map properties to park schema
      const parkData = mapPropertiesToParkSchema(feature.properties, sourceType, sourceName, defaultState)

      // Handle geometry
      if (feature.geometry) {
        let geometry = feature.geometry

        // Validate and fix geometry
        const validation = validateGeometry(geometry)
        if (!validation.isValid) {
          if (skipInvalidGeometry) {
            console.warn(`⚠️ Skipping invalid geometry for park: ${parkData.name}`)
            continue
          }
          geometry = fixGeometry(geometry)
        }

        // Simplify if needed
        if (simplifyTolerance > 0) {
          geometry = simplifyBoundary(geometry, simplifyTolerance)
        }

        // Convert to WKT for PostGIS
        parkData.geometry = geojsonToWKT(geometry)
      }

      // Normalize state
      if (parkData.state) {
        parkData.state = normalizeStateToCode(parkData.state)
      } else if (defaultState) {
        parkData.state = normalizeStateToCode(defaultState)
      }

      // Add to batch
      batch.push(parkData)
      processedCount++

      // Yield batch when it reaches batchSize
      if (batch.length >= batchSize) {
        yield batch
        batch = []
      }
    } catch (error) {
      console.error(`Error processing feature: ${error.message}`)
      if (!skipInvalidGeometry) {
        throw error
      }
    }
  }

  // Yield remaining batch
  if (batch.length > 0) {
    yield batch
  }

  console.log(`✅ Processed ${processedCount} features from ${fileName}`)
}

