/**
 * Geometry Simplification Utility
 * Simplifies polygon boundaries to reduce file size while maintaining accuracy
 */

import { simplify } from '@turf/turf'

/**
 * Simplify a GeoJSON geometry to reduce point count
 * Uses Douglas-Peucker algorithm with specified tolerance
 * 
 * @param {Object} geometry - GeoJSON geometry (Polygon or MultiPolygon)
 * @param {number} toleranceMeters - Tolerance in meters (default: 152m = ~500 feet)
 * @returns {Object} Simplified GeoJSON geometry
 */
export function simplifyBoundary(geometry, toleranceMeters = 152) {
  if (!geometry || !geometry.type) {
    return geometry
  }

  // Only simplify Polygon and MultiPolygon geometries
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    return geometry
  }

  // Create a temporary feature for Turf.js simplify function
  const feature = {
    type: 'Feature',
    geometry: geometry,
    properties: {}
  }

  try {
    // Simplify using Douglas-Peucker algorithm
    // tolerance is in degrees (approximate conversion: 1 degree ≈ 111km)
    // For 152 meters: 152 / 111000 ≈ 0.00137 degrees
    const toleranceDegrees = toleranceMeters / 111000
    
    const simplifiedFeature = simplify(feature, {
      tolerance: toleranceDegrees,
      highQuality: true // Use higher quality algorithm
    })

    return simplifiedFeature.geometry
  } catch (error) {
    console.error('Error simplifying geometry:', error)
    // Return original geometry if simplification fails
    return geometry
  }
}

/**
 * Simplify boundaries in a GeoJSON feature
 * 
 * @param {Object} feature - GeoJSON feature
 * @param {number} toleranceMeters - Tolerance in meters
 * @returns {Object} Feature with simplified geometry
 */
export function simplifyFeature(feature, toleranceMeters = 152) {
  if (!feature || !feature.geometry) {
    return feature
  }

  return {
    ...feature,
    geometry: simplifyBoundary(feature.geometry, toleranceMeters)
  }
}

/**
 * Simplify all features in a GeoJSON FeatureCollection
 * 
 * @param {Object} featureCollection - GeoJSON FeatureCollection
 * @param {number} toleranceMeters - Tolerance in meters
 * @returns {Object} FeatureCollection with simplified geometries
 */
export function simplifyFeatureCollection(featureCollection, toleranceMeters = 152) {
  if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
    return featureCollection
  }

  return {
    ...featureCollection,
    features: featureCollection.features.map(feature => 
      simplifyFeature(feature, toleranceMeters)
    )
  }
}

