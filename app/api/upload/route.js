/**
 * Next.js API Route: /api/upload
 * Handles file uploads (GeoJSON, Shapefiles)
 * Priority: 1 (highest)
 */

import { batchInsertOrUpdateParks } from '../../../lib/utils/db-operations.js'
import { parseShapefile } from '../../../lib/utils/shapefile-parser.js'
import { simplifyBoundary } from '../../../lib/utils/geometry-simplify.js'
import { mapPropertiesToParkSchema, logUnmappedProperties } from '../../../lib/utils/field-mapper.js'

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
      } catch (error) {
        return Response.json({ 
          success: false, 
          error: `Failed to download file from storage: ${error.message}` 
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
    
    // Extract parks from GeoJSON features
    const parks = []
    const features = geojson.features || []
    
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
      let boundary = null
      
      if (feature.geometry.type === 'Point' && feature.geometry.coordinates) {
        // Point geometry: [longitude, latitude]
        longitude = feature.geometry.coordinates[0]
        latitude = feature.geometry.coordinates[1]
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
        
        // Simplify boundary geometry to reduce file size (~500 feet accuracy)
        // This significantly reduces point count while maintaining visual accuracy
        const simplifiedGeometry = simplifyBoundary(feature.geometry, 152) // 152 meters = ~500 feet
        boundary = simplifiedGeometry
      }
      
      // Extract properties and map to our schema
      const props = feature.properties
      const mappedProps = mapPropertiesToParkSchema(props)
      
      // Use defaultState if state is not in the file
      if (!mappedProps.state && defaultState) {
        mappedProps.state = defaultState
      }
      
      // Log unmapped properties for debugging (only for first few features to avoid spam)
      if (i < 5) {
        logUnmappedProperties(props)
      }
      
      // Build park object with mapped properties
      const park = {
        ...mappedProps,
        latitude,
        longitude,
        boundary: boundary ? JSON.stringify(boundary) : null,
      }
      
      // Validate required fields
      if (!park.name || park.name === 'Unnamed Park') {
        console.warn('Skipping feature with no name:', feature)
        continue
      }
      
      if (!park.latitude || !park.longitude) {
        console.warn('Skipping feature with no coordinates:', park.name)
        continue
      }
      
      parks.push(park)
    }
    
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
