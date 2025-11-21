/**
 * Data Quality Analysis Utilities
 * Identifies data quality issues, non-park entries, and provides cleanup tools
 */

/**
 * Keywords that indicate a park might actually be an office/facility
 */
const NON_PARK_KEYWORDS = [
  'office', 'offices', 'headquarters', 'hq', 'admin', 'administration',
  'facility', 'facilities', 'service center', 'service center',
  'city hall', 'county office', 'county building', 'municipal building',
  'government center', 'courthouse', 'courthouse annex',
  'maintenance', 'maintenance facility', 'equipment yard',
  'warehouse', 'storage', 'depot'
]

/**
 * Calculate data quality score for a park (0-100)
 */
export function calculateDataQualityScore(park) {
  if (!park) return 0

  let score = 0
  const maxScore = 100

  // Required fields (40 points)
  if (park.name && park.name !== 'Unnamed Park') score += 10
  if (park.state) score += 10
  if (park.agency) score += 10
  if (park.latitude && park.longitude) score += 10

  // Important optional fields (40 points)
  if (park.description && park.description.trim().length > 0) score += 10
  if (park.website) score += 5
  if (park.phone) score += 5
  if (park.address) score += 5
  if (park.acres && park.acres > 0) score += 5
  if (park.geometry) score += 10

  // Additional fields (20 points)
  if (park.email) score += 3
  if (park.county) score += 2
  if (park.amenities && Array.isArray(park.amenities) && park.amenities.length > 0) score += 5
  if (park.activities && Array.isArray(park.activities) && park.activities.length > 0) score += 5
  if (park.category) score += 2
  if (park.public_access) score += 3

  return Math.min(score, maxScore)
}

/**
 * Check if a park name suggests it's not actually a park
 */
export function isLikelyNonPark(park) {
  if (!park || !park.name) return false

  const nameLower = park.name.toLowerCase()

  // Check for non-park keywords
  for (const keyword of NON_PARK_KEYWORDS) {
    if (nameLower.includes(keyword)) {
      return {
        isNonPark: true,
        reason: `Name contains "${keyword}"`,
        confidence: 'high'
      }
    }
  }

  // Check for very small size (might be an office)
  if (park.acres && park.acres < 0.1) {
    return {
      isNonPark: true,
      reason: `Very small size (${park.acres} acres) - likely office/facility`,
      confidence: 'medium'
    }
  }

  // Check for name patterns
  const nonParkPatterns = [
    /county\s+office/i,
    /city\s+hall/i,
    /municipal\s+building/i,
    /government\s+center/i,
    /service\s+center/i,
    /\badmin\b/i,
    /\bfacility\b/i
  ]

  for (const pattern of nonParkPatterns) {
    if (pattern.test(park.name)) {
      return {
        isNonPark: true,
        reason: `Name matches non-park pattern`,
        confidence: 'high'
      }
    }
  }

  return {
    isNonPark: false,
    reason: null,
    confidence: null
  }
}

/**
 * Analyze parks for data quality issues
 */
export function analyzeParksQuality(parks) {
  const analysis = {
    total: parks.length,
    withCoordinates: 0,
    withDescription: 0,
    withWebsite: 0,
    withPhone: 0,
    withAddress: 0,
    withGeometry: 0,
    averageQualityScore: 0,
    qualityDistribution: {
      excellent: 0, // 80-100
      good: 0,      // 60-79
      fair: 0,      // 40-59
      poor: 0       // 0-39
    },
    likelyNonParks: [],
    missingFields: {
      description: 0,
      website: 0,
      phone: 0,
      address: 0,
      geometry: 0,
      coordinates: 0
    },
    issues: []
  }

  let totalScore = 0

  for (const park of parks) {
    // Count fields
    if (park.latitude && park.longitude) analysis.withCoordinates++
    if (park.description && park.description.trim()) analysis.withDescription++
    if (park.website) analysis.withWebsite++
    if (park.phone) analysis.withPhone++
    if (park.address) analysis.withAddress++
    if (park.geometry) analysis.withGeometry++

    // Count missing fields
    if (!park.description || !park.description.trim()) analysis.missingFields.description++
    if (!park.website) analysis.missingFields.website++
    if (!park.phone) analysis.missingFields.phone++
    if (!park.address) analysis.missingFields.address++
    if (!park.geometry) analysis.missingFields.geometry++
    if (!park.latitude || !park.longitude) analysis.missingFields.coordinates++

    // Calculate quality score
    const score = calculateDataQualityScore(park)
    totalScore += score

    // Categorize quality
    if (score >= 80) analysis.qualityDistribution.excellent++
    else if (score >= 60) analysis.qualityDistribution.good++
    else if (score >= 40) analysis.qualityDistribution.fair++
    else analysis.qualityDistribution.poor++

    // Check for non-park
    const nonParkCheck = isLikelyNonPark(park)
    if (nonParkCheck.isNonPark) {
      analysis.likelyNonParks.push({
        id: park.id,
        name: park.name,
        state: park.state,
        agency: park.agency,
        reason: nonParkCheck.reason,
        confidence: nonParkCheck.confidence,
        acres: park.acres
      })
    }

    // Collect issues
    const issues = []
    if (!park.latitude || !park.longitude) {
      issues.push('Missing coordinates')
    }
    if (!park.description || !park.description.trim()) {
      issues.push('Missing description')
    }
    if (!park.geometry) {
      issues.push('Missing boundary geometry')
    }
    if (park.acres && park.acres < 0.1) {
      issues.push('Very small size (< 0.1 acres)')
    }
    if (score < 40) {
      issues.push('Low quality score')
    }

    if (issues.length > 0) {
      analysis.issues.push({
        id: park.id,
        name: park.name,
        state: park.state,
        agency: park.agency,
        score,
        issues
      })
    }
  }

  // Calculate averages
  analysis.averageQualityScore = analysis.total > 0 
    ? Math.round((totalScore / analysis.total) * 100) / 100 
    : 0

  // Calculate percentages
  analysis.percentages = {
    withCoordinates: analysis.total > 0 ? Math.round((analysis.withCoordinates / analysis.total) * 100) : 0,
    withDescription: analysis.total > 0 ? Math.round((analysis.withDescription / analysis.total) * 100) : 0,
    withWebsite: analysis.total > 0 ? Math.round((analysis.withWebsite / analysis.total) * 100) : 0,
    withPhone: analysis.total > 0 ? Math.round((analysis.withPhone / analysis.total) * 100) : 0,
    withAddress: analysis.total > 0 ? Math.round((analysis.withAddress / analysis.total) * 100) : 0,
    withGeometry: analysis.total > 0 ? Math.round((analysis.withGeometry / analysis.total) * 100) : 0
  }

  return analysis
}

/**
 * Filter parks by criteria for cleanup
 */
export function filterParksForCleanup(parks, criteria) {
  return parks.filter(park => {
    // Name contains keywords
    if (criteria.nameKeywords && criteria.nameKeywords.length > 0) {
      const nameLower = park.name?.toLowerCase() || ''
      const matches = criteria.nameKeywords.some(keyword => 
        nameLower.includes(keyword.toLowerCase())
      )
      if (!matches) return false
    }

    // State filter
    if (criteria.state && park.state !== criteria.state) {
      return false
    }

    // Agency filter
    if (criteria.agency && park.agency !== criteria.agency) {
      return false
    }

    // Size filter
    if (criteria.maxAcres !== undefined && park.acres && park.acres > criteria.maxAcres) {
      return false
    }
    if (criteria.minAcres !== undefined && park.acres && park.acres < criteria.minAcres) {
      return false
    }

    // Quality score filter
    if (criteria.maxQualityScore !== undefined) {
      const score = calculateDataQualityScore(park)
      if (score > criteria.maxQualityScore) {
        return false
      }
    }

    // Missing fields filter
    if (criteria.missingFields && criteria.missingFields.length > 0) {
      const hasAllMissing = criteria.missingFields.every(field => {
        if (field === 'coordinates') return !park.latitude || !park.longitude
        if (field === 'geometry') return !park.geometry
        return !park[field]
      })
      if (!hasAllMissing) return false
    }

    return true
  })
}

