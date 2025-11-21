/**
 * Geometry WKT Converter
 * Converts GeoJSON geometries to WKT (Well-Known Text) format with SRID prefix
 * Required for PostGIS geography columns
 * 
 * Based on Python workflow: geometry stored as "SRID=4326;{WKT}"
 */

/**
 * Convert GeoJSON coordinates to WKT format
 */
function coordinatesToWKT(coordinates, geometryType) {
  if (!coordinates || !Array.isArray(coordinates)) {
    return null
  }

  switch (geometryType) {
    case 'Point':
      if (coordinates.length >= 2) {
        return `${coordinates[0]} ${coordinates[1]}`
      }
      return null

    case 'LineString':
      return coordinates.map(coord => `${coord[0]} ${coord[1]}`).join(', ')

    case 'Polygon':
      // Polygon has rings (exterior + holes)
      return coordinates.map(ring => {
        const points = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ')
        return `(${points})`
      }).join(', ')

    case 'MultiPolygon':
      // MultiPolygon has multiple polygons
      return coordinates.map(polygon => {
        const rings = polygon.map(ring => {
          const points = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ')
          return `(${points})`
        }).join(', ')
        return `(${rings})`
      }).join(', ')

    default:
      return null
  }
}

/**
 * Convert GeoJSON geometry to WKT format with SRID prefix
 * 
 * @param {Object} geometry - GeoJSON geometry object
 * @param {number} srid - Spatial Reference System ID (default: 4326 for WGS84)
 * @returns {string|null} WKT string with SRID prefix, or null if invalid
 */
export function geojsonToWKT(geometry, srid = 4326) {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return null
  }

  const wktCoords = coordinatesToWKT(geometry.coordinates, geometry.type)
  
  if (!wktCoords) {
    return null
  }

  // Format: SRID=4326;GEOMETRYTYPE(coordinates)
  const geometryType = geometry.type.toUpperCase()
  return `SRID=${srid};${geometryType}(${wktCoords})`
}

/**
 * Validate geometry before conversion
 * Basic validation to catch obvious issues
 */
export function validateGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    return { valid: false, error: 'Geometry is not an object' }
  }

  if (!geometry.type) {
    return { valid: false, error: 'Geometry missing type' }
  }

  if (!geometry.coordinates) {
    return { valid: false, error: 'Geometry missing coordinates' }
  }

  if (!Array.isArray(geometry.coordinates)) {
    return { valid: false, error: 'Coordinates must be an array' }
  }

  // Validate coordinate ranges
  const validateCoordinates = (coords, depth = 0) => {
    if (depth > 4) return true // Prevent infinite recursion
    
    if (Array.isArray(coords[0])) {
      return coords.every(coord => validateCoordinates(coord, depth + 1))
    }
    
    if (coords.length >= 2) {
      const lng = coords[0]
      const lat = coords[1]
      
      if (typeof lng !== 'number' || typeof lat !== 'number') {
        return false
      }
      
      if (isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
        return false
      }
      
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return false
      }
    }
    
    return true
  }

  if (!validateCoordinates(geometry.coordinates)) {
    return { valid: false, error: 'Invalid coordinate values (out of range or NaN)' }
  }

  // Check minimum points for polygons
  if (geometry.type === 'Polygon' && geometry.coordinates.length > 0) {
    const exteriorRing = geometry.coordinates[0]
    if (exteriorRing.length < 4) {
      return { valid: false, error: 'Polygon must have at least 4 points (closed ring)' }
    }
  }

  return { valid: true }
}

