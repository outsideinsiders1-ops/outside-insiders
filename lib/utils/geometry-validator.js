/**
 * Geometry Validator and Fixer
 * Validates and fixes common geometry issues before storing in PostGIS
 * Based on Python geopandas automatic validation/fixing
 */

/**
 * Close unclosed polygon rings (first point != last point)
 */
export function closePolygonRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) {
    return ring
  }

  const first = ring[0]
  const last = ring[ring.length - 1]

  // Check if ring is closed (first point equals last point)
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring // Already closed
  }

  // Close the ring by adding first point at the end
  return [...ring, [first[0], first[1]]]
}

/**
 * Remove duplicate consecutive points
 */
export function removeDuplicatePoints(ring) {
  if (!Array.isArray(ring) || ring.length === 0) {
    return ring
  }

  const cleaned = [ring[0]]
  
  for (let i = 1; i < ring.length; i++) {
    const prev = cleaned[cleaned.length - 1]
    const curr = ring[i]
    
    // Only add if different from previous point
    if (prev[0] !== curr[0] || prev[1] !== curr[1]) {
      cleaned.push(curr)
    }
  }

  return cleaned
}

/**
 * Fix common geometry issues
 */
export function fixGeometry(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return geometry
  }

  try {
    if (geometry.type === 'Polygon') {
      // Fix each ring
      const fixedRings = geometry.coordinates.map(ring => {
        let fixed = removeDuplicatePoints(ring)
        fixed = closePolygonRing(fixed)
        return fixed
      })

      return {
        ...geometry,
        coordinates: fixedRings
      }
    }

    if (geometry.type === 'MultiPolygon') {
      // Fix each polygon
      const fixedPolygons = geometry.coordinates.map(polygon => {
        return polygon.map(ring => {
          let fixed = removeDuplicatePoints(ring)
          fixed = closePolygonRing(fixed)
          return fixed
        })
      })

      return {
        ...geometry,
        coordinates: fixedPolygons
      }
    }

    // Point and LineString don't need fixing
    return geometry
  } catch (error) {
    console.error('Error fixing geometry:', error)
    return geometry // Return original if fixing fails
  }
}

/**
 * Validate geometry structure and coordinates
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

  // Validate coordinate values
  const validateCoords = (coords, depth = 0) => {
    if (depth > 4) return { valid: true } // Prevent infinite recursion
    
    if (Array.isArray(coords[0])) {
      // Nested array - recurse
      for (const coord of coords) {
        const result = validateCoords(coord, depth + 1)
        if (!result.valid) return result
      }
      return { valid: true }
    }
    
    // Leaf coordinate pair
    if (coords.length < 2) {
      return { valid: false, error: 'Coordinate must have at least 2 values' }
    }
    
    const lng = coords[0]
    const lat = coords[1]
    
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return { valid: false, error: 'Coordinates must be numbers' }
    }
    
    if (isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
      return { valid: false, error: 'Coordinates must be finite numbers' }
    }
    
    if (lng < -180 || lng > 180) {
      return { valid: false, error: `Longitude ${lng} out of range [-180, 180]` }
    }
    
    if (lat < -90 || lat > 90) {
      return { valid: false, error: `Latitude ${lat} out of range [-90, 90]` }
    }
    
    return { valid: true }
  }

  const coordValidation = validateCoords(geometry.coordinates)
  if (!coordValidation.valid) {
    return coordValidation
  }

  // Check minimum points for polygons
  if (geometry.type === 'Polygon') {
    if (geometry.coordinates.length === 0) {
      return { valid: false, error: 'Polygon must have at least one ring' }
    }
    const exteriorRing = geometry.coordinates[0]
    if (exteriorRing.length < 4) {
      return { valid: false, error: 'Polygon exterior ring must have at least 4 points (closed ring)' }
    }
  }

  return { valid: true }
}

