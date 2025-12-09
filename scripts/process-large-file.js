#!/usr/bin/env node
/**
 * Local Script to Process Large Park Files
 * 
 * This script processes large shapefile/GeoJSON files locally and uploads
 * the results to Supabase in batches. This avoids Vercel's memory limits.
 * 
 * Usage:
 *   node scripts/process-large-file.js <file-path> [options]
 * 
 * Options:
 *   --source-type <type>     Source type (default: "State Agency")
 *   --source-name <name>      Source name (default: file name)
 *   --default-state <code>    Default state code if not in file
 *   --batch-size <number>     Batch size for processing (default: 500)
 *   --upload-batch-size <num> Batch size for database uploads (default: 100)
 * 
 * Examples:
 *   # Process a local file
 *   node scripts/process-large-file.js ./data/parks.zip --source-type "State Agency" --default-state "CA"
 * 
 *   # Process a file from Supabase Storage
 *   node scripts/process-large-file.js "uploads/1234567890-parks.zip" --from-storage
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parseShapefile } from '../lib/utils/shapefile-parser.js'
import { mapPropertiesToParkSchema } from '../lib/utils/field-mapper.js'
import { simplifyBoundary } from '../lib/utils/geometry-simplify.js'
import { geojsonToWKT } from '../lib/utils/geometry-wkt.js'
import { validateGeometry, fixGeometry } from '../lib/utils/geometry-validator.js'
import { normalizeParkName } from '../lib/utils/db-operations.js'
import { normalizeStateToCode } from '../lib/utils/state-normalizer.js'
import JSZip from 'jszip'
import * as shapefile from 'shapefile'

// Load environment variables
import dotenv from 'dotenv'
import { pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Try multiple env file locations
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing Supabase credentials')
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Parse command line arguments
const args = process.argv.slice(2)
const filePath = args[0]

if (!filePath) {
  console.error('❌ Error: File path required')
  console.error('Usage: node scripts/process-large-file.js <file-path> [options]')
  process.exit(1)
}

const options = {
  sourceType: 'State Agency',
  sourceName: filePath.split('/').pop() || 'unknown',
  defaultState: null,
  batchSize: 500,
  uploadBatchSize: 100,
  fromStorage: args.includes('--from-storage')
}

// Parse options
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--source-type' && args[i + 1]) {
    options.sourceType = args[i + 1]
    i++
  } else if (args[i] === '--source-name' && args[i + 1]) {
    options.sourceName = args[i + 1]
    i++
  } else if (args[i] === '--default-state' && args[i + 1]) {
    options.defaultState = args[i + 1].toUpperCase()
    i++
  } else if (args[i] === '--batch-size' && args[i + 1]) {
    options.batchSize = parseInt(args[i + 1])
    i++
  } else if (args[i] === '--upload-batch-size' && args[i + 1]) {
    options.uploadBatchSize = parseInt(args[i + 1])
    i++
  }
}

console.log('🚀 Starting large file processing...')
console.log(`📁 File: ${filePath}`)
console.log(`📊 Options:`, options)
console.log('')

/**
 * Process features in batches and upload to database
 */
async function processAndUpload(geojson, sourceType, sourceName, defaultState) {
  const features = geojson.features || []
  console.log(`📦 Processing ${features.length} features...`)
  
  const rawParks = []
  const BATCH_SIZE = options.batchSize
  
  // Step 1: Process features in batches
  const totalBatches = Math.ceil(features.length / BATCH_SIZE)
  console.log(`\n🔄 Processing ${totalBatches} batches of ${BATCH_SIZE} features each...`)
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE
    const batchEnd = Math.min(batchStart + BATCH_SIZE, features.length)
    const batch = features.slice(batchStart, batchEnd)
    
    console.log(`\n📦 Batch ${batchIndex + 1}/${totalBatches} (features ${batchStart + 1}-${batchEnd})...`)
    
    for (const feature of batch) {
      if (!feature.geometry || !feature.properties) continue
      
      // Extract coordinates
      let latitude = null
      let longitude = null
      let geometry = null
      
      if (feature.geometry.type === 'Point' && feature.geometry.coordinates) {
        longitude = feature.geometry.coordinates[0]
        latitude = feature.geometry.coordinates[1]
        geometry = feature.geometry
      } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        // Calculate centroid
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
        
        // Store full geometry
        geometry = feature.geometry
      }
      
      if (!latitude || !longitude) continue
      
      // Map properties to park schema
      const parkData = mapPropertiesToParkSchema(feature.properties, {
        sourceType,
        sourceName,
        defaultState,
        latitude,
        longitude
      })
      
      // Add geometry
      if (geometry) {
        try {
          // Simplify geometry if it's a polygon
          if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            geometry = simplifyBoundary(geometry)
          }
          
          // Validate and fix geometry
          const validation = validateGeometry(geometry)
          if (!validation.valid) {
            geometry = fixGeometry(geometry) || geometry
          }
          
          // Convert to WKT
          parkData.boundary = geojsonToWKT(geometry)
        } catch (err) {
          console.warn(`⚠️  Geometry processing error for ${parkData.name}: ${err.message}`)
        }
      }
      
      // Normalize park name
      if (parkData.name) {
        parkData.name = normalizeParkName(parkData.name)
      }
      
      // Normalize state
      if (parkData.state) {
        parkData.state = normalizeStateToCode(parkData.state)
      }
      
      rawParks.push(parkData)
    }
    
    console.log(`   ✅ Processed ${batch.length} features (${rawParks.length} total parks so far)`)
  }
  
  console.log(`\n✅ Processed ${rawParks.length} parks from ${features.length} features`)
  
  // Step 2: Deduplicate parks
  console.log('\n🔍 Deduplicating parks...')
  const parksByKey = new Map()
  
  for (const park of rawParks) {
    if (!park.name) continue
    
    const key = `${park.name.toLowerCase()}_${park.state || 'unknown'}_${park.agency || 'unknown'}`
    
    if (!parksByKey.has(key)) {
      parksByKey.set(key, park)
    } else {
      // Keep the one with larger area
      const existing = parksByKey.get(key)
      if ((park.acres || 0) > (existing.acres || 0)) {
        parksByKey.set(key, park)
      }
    }
  }
  
  const parks = Array.from(parksByKey.values())
  console.log(`✅ ${parks.length} unique parks (removed ${rawParks.length - parks.length} duplicates)`)
  
  // Step 3: Upload to database in batches
  console.log(`\n📤 Uploading ${parks.length} parks to database in batches of ${options.uploadBatchSize}...`)
  
  const uploadBatches = Math.ceil(parks.length / options.uploadBatchSize)
  let added = 0
  let updated = 0
  let skipped = 0
  
  for (let i = 0; i < uploadBatches; i++) {
    const batchStart = i * options.uploadBatchSize
    const batchEnd = Math.min(batchStart + options.uploadBatchSize, parks.length)
    const batch = parks.slice(batchStart, batchEnd)
    
    console.log(`\n📤 Uploading batch ${i + 1}/${uploadBatches} (${batch.length} parks)...`)
    
    // Insert or update parks
    for (const park of batch) {
      try {
        // Check if park exists
        const { data: existing } = await supabase
          .from('parks')
          .select('id')
          .eq('name', park.name)
          .eq('state', park.state || '')
          .maybeSingle()
        
        if (existing) {
          // Update
          const { error } = await supabase
            .from('parks')
            .update({
              ...park,
              updated_at: new Date().toISOString(),
              source: sourceType
            })
            .eq('id', existing.id)
          
          if (error) throw error
          updated++
        } else {
          // Insert
          const { error } = await supabase
            .from('parks')
            .insert({
              ...park,
              source: sourceType
            })
          
          if (error) throw error
          added++
        }
      } catch (error) {
        console.warn(`⚠️  Error processing ${park.name}: ${error.message}`)
        skipped++
      }
    }
    
    console.log(`   ✅ Batch ${i + 1} complete (Added: ${added}, Updated: ${updated}, Skipped: ${skipped})`)
  }
  
  return { added, updated, skipped, total: parks.length }
}

/**
 * Main processing function
 */
async function main() {
  try {
    let file
    
    if (options.fromStorage) {
      // Download from Supabase Storage
      console.log('📥 Downloading file from Supabase Storage...')
      const { data, error } = await supabase.storage
        .from('park-uploads')
        .download(filePath)
      
      if (error) throw error
      
      const arrayBuffer = await data.arrayBuffer()
      const fileName = filePath.split('/').pop() || 'file.zip'
      file = new File([arrayBuffer], fileName, { type: 'application/zip' })
    } else {
      // Read local file
      console.log('📥 Reading local file...')
      const fileData = readFileSync(filePath)
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'file.zip'
      
      // Parse file directly based on extension
      console.log('🔍 Parsing file...')
      let geojson
      
      if (fileName.toLowerCase().endsWith('.zip') || fileName.toLowerCase().endsWith('.shp')) {
        // Parse shapefile - create a File-like object
        const fileLike = {
          name: fileName,
          arrayBuffer: async () => fileData.buffer
        }
        geojson = await parseShapefile(fileLike)
      } else if (fileName.toLowerCase().endsWith('.geojson') || fileName.toLowerCase().endsWith('.json')) {
        // Parse GeoJSON
        const text = fileData.toString('utf-8')
        geojson = JSON.parse(text)
      } else {
        throw new Error(`Unsupported file type: ${fileName}. Expected .zip, .shp, .geojson, or .json`)
      }
      
      if (!geojson.type || !geojson.features) {
        throw new Error('Invalid GeoJSON format')
      }
      
      console.log(`✅ Parsed ${geojson.features.length} features`)
      
      // Process and upload
      const results = await processAndUpload(
        geojson,
        options.sourceType,
        options.sourceName,
        options.defaultState
      )
      
      console.log('\n' + '='.repeat(50))
      console.log('✅ PROCESSING COMPLETE')
      console.log('='.repeat(50))
      console.log(`📊 Total parks: ${results.total}`)
      console.log(`➕ Added: ${results.added}`)
      console.log(`🔄 Updated: ${results.updated}`)
      console.log(`⏭️  Skipped: ${results.skipped}`)
      console.log('')
      
      return
    }
    
    // For storage files, parse after download
    console.log('🔍 Parsing file...')
    let geojson
    
    if (file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.shp')) {
      geojson = await parseShapefile(file)
    } else {
      const text = await file.text()
      geojson = JSON.parse(text)
    }
    
    if (!geojson.type || !geojson.features) {
      throw new Error('Invalid GeoJSON format')
    }
    
    if (!geojson.type || !geojson.features) {
      throw new Error('Invalid GeoJSON format')
    }
    
    console.log(`✅ Parsed ${geojson.features.length} features`)
    
    // Process and upload
    const results = await processAndUpload(
      geojson,
      options.sourceType,
      options.sourceName,
      options.defaultState
    )
    
    console.log('\n' + '='.repeat(50))
    console.log('✅ PROCESSING COMPLETE')
    console.log('='.repeat(50))
    console.log(`📊 Total parks: ${results.total}`)
    console.log(`➕ Added: ${results.added}`)
    console.log(`🔄 Updated: ${results.updated}`)
    console.log(`⏭️  Skipped: ${results.skipped}`)
    console.log('')
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()

