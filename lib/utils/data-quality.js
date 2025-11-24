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
 * New scoring system:
 * - Name (required): +20
 * - Coordinates: +20
 * - Website: +20
 * - Contact info (phone OR email): +10
 * - Activities: +10
 * - Amenities: +10
 * - Boundary polygon (geometry): +10
 */
export function calculateDataQualityScore(park) {
  if (!park) return 0

  let score = 0
  const maxScore = 100

  // Name (required): +20
  if (park.name && park.name !== 'Unnamed Park' && park.name.trim().length > 0) {
    score += 20
  }

  // Coordinates: +20
  if (park.latitude && park.longitude) {
    const lat = parseFloat(park.latitude)
    const lng = parseFloat(park.longitude)
    if (!isNaN(lat) && !isNaN(lng) && 
        lat >= -90 && lat <= 90 && 
        lng >= -180 && lng <= 180) {
      score += 20
    }
  }

  // Website: +20
  if (park.website && park.website.trim().length > 0) {
    try {
      // Validate URL format
      new URL(park.website)
      score += 20
    } catch {
      // Invalid URL, no points
    }
  }

  // Contact info (phone OR email): +10
  if ((park.phone && park.phone.trim().length > 0) || 
      (park.email && park.email.trim().length > 0)) {
    score += 10
  }

  // Activities: +10
  if (park.activities && Array.isArray(park.activities) && park.activities.length > 0) {
    score += 10
  }

  // Amenities: +10
  if (park.amenities && Array.isArray(park.amenities) && park.amenities.length > 0) {
    score += 10
  }

  // Boundary polygon (geometry): +10
  if (park.geometry) {
    score += 10
  }

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

/**
 * Calculate quality breakdown by category (agency, state, city, county, etc.)
 * @param {Array} parks - Array of park objects
 * @param {string} groupBy - Category to group by: 'agency', 'state', 'city', 'county', 'category'
 * @returns {Array} Array of grouped quality metrics
 */
export function calculateQualityBreakdown(parks, groupBy = 'agency') {
  if (!parks || parks.length === 0) {
    return []
  }

  const groups = new Map()

  for (const park of parks) {
    // Get group key based on groupBy parameter
    let groupKey = null
    
    switch (groupBy) {
      case 'agency':
        groupKey = park.agency || 'Unknown'
        break
      case 'state':
        groupKey = park.state || 'Unknown'
        break
      case 'city':
        groupKey = park.city || 'Unknown'
        break
      case 'county':
        groupKey = park.county || 'Unknown'
        break
      case 'category':
        groupKey = park.category || park.designation_type || 'Unknown'
        break
      default:
        groupKey = park[groupBy] || 'Unknown'
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        group: groupKey,
        count: 0,
        totalScore: 0,
        withCoordinates: 0,
        withDescription: 0,
        withWebsite: 0,
        withPhone: 0,
        withAddress: 0,
        withGeometry: 0,
        missingFields: {
          description: 0,
          website: 0,
          phone: 0,
          address: 0,
          geometry: 0,
          coordinates: 0
        }
      })
    }

    const group = groups.get(groupKey)
    group.count++

    // Calculate quality score
    const score = calculateDataQualityScore(park)
    group.totalScore += score

    // Count fields
    if (park.latitude && park.longitude) group.withCoordinates++
    if (park.description && park.description.trim()) group.withDescription++
    if (park.website) group.withWebsite++
    if (park.phone) group.withPhone++
    if (park.address) group.withAddress++
    if (park.geometry) group.withGeometry++

    // Count missing fields
    if (!park.description || !park.description.trim()) group.missingFields.description++
    if (!park.website) group.missingFields.website++
    if (!park.phone) group.missingFields.phone++
    if (!park.address) group.missingFields.address++
    if (!park.geometry) group.missingFields.geometry++
    if (!park.latitude || !park.longitude) group.missingFields.coordinates++
  }

  // Convert to array and calculate averages/percentages
  const breakdown = Array.from(groups.values()).map(group => {
    const avgScore = group.count > 0 ? Math.round((group.totalScore / group.count) * 100) / 100 : 0
    
    return {
      group: group.group,
      count: group.count,
      averageScore: avgScore,
      completeness: {
        coordinates: group.count > 0 ? Math.round((group.withCoordinates / group.count) * 100) : 0,
        description: group.count > 0 ? Math.round((group.withDescription / group.count) * 100) : 0,
        website: group.count > 0 ? Math.round((group.withWebsite / group.count) * 100) : 0,
        phone: group.count > 0 ? Math.round((group.withPhone / group.count) * 100) : 0,
        address: group.count > 0 ? Math.round((group.withAddress / group.count) * 100) : 0,
        geometry: group.count > 0 ? Math.round((group.withGeometry / group.count) * 100) : 0
      },
      missingFields: group.missingFields,
      weakFields: Object.entries(group.missingFields)
        .filter(([, count]) => count > 0 && count / group.count > 0.5) // More than 50% missing
        .map(([field]) => field)
    }
  })

  // Sort by average score (lowest first - weakest data first)
  breakdown.sort((a, b) => a.averageScore - b.averageScore)

  return breakdown
}

/**
 * Calculate quality breakdown matrix (rows = agencies/states, columns = fields, cells = avg quality score)
 * @param {Array} parks - Array of park objects
 * @param {string} rowGroupBy - Category for rows: 'agency', 'state', 'city', 'county', 'category'
 * @param {Array} fields - Array of field names to use as columns (e.g., ['name', 'description', 'website', 'phone', 'address'])
 * @returns {Object} Matrix with rows, columns, and cell scores
 */
export function calculateQualityBreakdownMatrix(parks, rowGroupBy = 'agency', fields = ['name', 'description', 'website', 'phone', 'address']) {
  if (!parks || parks.length === 0) {
    return { rows: [], columns: fields, matrix: {} }
  }

  const rowGroups = new Map()
  const fieldScores = {} // Map of rowKey -> { field: score }

  // Define field quality scoring
  const getFieldScore = (park, field) => {
    switch (field) {
      case 'name':
        return park.name && park.name !== 'Unnamed Park' ? 100 : 0
      case 'description':
        return park.description && park.description.trim().length > 0 ? 100 : 0
      case 'website':
        return park.website ? 100 : 0
      case 'phone':
        return park.phone ? 100 : 0
      case 'address':
        return park.address ? 100 : 0
      case 'coordinates':
        return (park.latitude && park.longitude) ? 100 : 0
      case 'geometry':
        return park.geometry ? 100 : 0
      case 'acres':
        return park.acres && park.acres > 0 ? 100 : 0
      default:
        return park[field] ? 100 : 0
    }
  }

  // Group parks by row category
  for (const park of parks) {
    let rowKey = null
    
    switch (rowGroupBy) {
      case 'agency':
        rowKey = park.agency || 'Unknown'
        break
      case 'state':
        rowKey = park.state || 'Unknown'
        break
      case 'city':
        rowKey = park.city || 'Unknown'
        break
      case 'county':
        rowKey = park.county || 'Unknown'
        break
      case 'category':
        rowKey = park.category || park.designation_type || 'Unknown'
        break
      default:
        rowKey = park[rowGroupBy] || 'Unknown'
    }

    if (!rowGroups.has(rowKey)) {
      rowGroups.set(rowKey, [])
      fieldScores[rowKey] = {}
      for (const field of fields) {
        fieldScores[rowKey][field] = { total: 0, count: 0 }
      }
    }

    rowGroups.get(rowKey).push(park)

    // Calculate field scores for this park
    for (const field of fields) {
      const score = getFieldScore(park, field)
      fieldScores[rowKey][field].total += score
      fieldScores[rowKey][field].count += 1
    }
  }

  // Calculate averages
  const rows = Array.from(rowGroups.keys()).sort()
  const matrix = {}

  for (const rowKey of rows) {
    matrix[rowKey] = {}
    for (const field of fields) {
      const { total, count } = fieldScores[rowKey][field]
      matrix[rowKey][field] = count > 0 ? Math.round((total / count) * 100) / 100 : 0
    }
  }

  return { rows, columns: fields, matrix }
}

