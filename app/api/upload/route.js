/**
 * Next.js API Route: /api/upload
 * Handles file uploads (GeoJSON, Shapefiles)
 * Priority: 1 (highest)
 */

import { batchInsertOrUpdateParks } from '../../../lib/utils/db-operations.js'
import { parseShapefile } from '../../../lib/utils/shapefile-parser.js'
import { simplifyBoundary } from '../../../lib/utils/geometry-simplify.js'

export async function POST(request) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const sourceType = formData.get('sourceType') || 'State Agency'
    const sourceName = formData.get('sourceName') || file?.name || 'unknown'
    
    if (!file) {
      return Response.json({ 
        success: false, 
        error: 'No file provided' 
      }, { status: 400, headers })
    }
    
    // Check file type
    const fileName = file.name.toLowerCase()
    const isShapefile = fileName.endsWith('.shp') || fileName.endsWith('.zip')
    let geojson
    
    // Parse file based on type
    if (isShapefile) {
      try {
        // Parse Shapefile (handles both .shp and .zip)
        geojson = await parseShapefile(file)
      } catch (error) {
        return Response.json({ 
          success: false, 
          error: `Failed to parse shapefile: ${error.message}` 
        }, { status: 400, headers })
      }
    } else {
      // Read and parse GeoJSON
      try {
        const fileContent = await file.text()
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
    
    for (const feature of features) {
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
      
      // Extract properties
      const props = feature.properties
      
      // Map common property names to our schema
      const park = {
        name: props.name || props.NAME || props.ParkName || props.park_name || 'Unnamed Park',
        description: props.description || props.DESCRIPTION || props.desc || null,
        state: props.state || props.STATE || props.state_code || props.State || null,
        agency: props.agency || props.AGENCY || props.agency_type || props.owner_type || null,
        agency_type: props.agency_type || props.AGENCY_TYPE || props.owner_type || null,
        website_url: props.website || props.WEBSITE || props.url || props.URL || null,
        phone: props.phone || props.PHONE || props.telephone || null,
        email: props.email || props.EMAIL || null,
        latitude,
        longitude,
        boundary: boundary ? JSON.stringify(boundary) : null,
        amenities: props.amenities || props.AMENITIES || (Array.isArray(props.amenities) ? props.amenities : null),
        activities: props.activities || props.ACTIVITIES || (Array.isArray(props.activities) ? props.activities : null),
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
