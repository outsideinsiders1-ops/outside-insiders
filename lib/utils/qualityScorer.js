/**
 * Quality Scoring System for Outside Insiders
 * This protects your data quality - NEVER remove this!
 * 
 * How it works:
 * 1. Every park gets a quality score (0-100 points)
 * 2. Every source gets a priority (20-100)
 * 3. BAD data can NEVER overwrite GOOD data
 */

/**
 * Source priorities - Higher number = Better data
 * NEVER change these without careful thought!
 */
export const SOURCE_PRIORITIES = {
  NPS_API: 100,                    // National Park Service API - Best quality
  RECREATION_GOV_API: 95,          // Recreation.gov API
  STATE_PARK_API: 90,              // Official state park APIs
  MANUAL_CURATION: 80,             // You manually verified it
  EMAIL_RESPONSE: 75,              // Park staff sent you data
  OFFICIAL_WEBSITE_SCRAPE: 60,     // Scraped from .gov sites
  WEB_SEARCH_SCRAPE: 40,           // General web scraping
  USER_GENERATED: 20,              // Future: user submissions
};

/**
 * Calculate quality score for a park (0-100 points)
 */
export function calculateQualityScore(parkData) {
  let score = 0;
  const breakdown = {};
  
  // Has name (required) - 15 points
  if (parkData.name && parkData.name.trim().length > 0) {
    score += 15;
    breakdown.name = 15;
  }
  
  // Has description - 10 points
  if (parkData.description && parkData.description.trim().length > 20) {
    score += 10;
    breakdown.description = 10;
  }
  
  // Has coordinates (CRITICAL for map) - 25 points
  if (parkData.latitude && parkData.longitude) {
    const lat = parseFloat(parkData.latitude);
    const lng = parseFloat(parkData.longitude);
    
    if (!isNaN(lat) && !isNaN(lng) && 
        lat >= -90 && lat <= 90 && 
        lng >= -180 && lng <= 180) {
      score += 25;
      breakdown.coordinates = 25;
    }
  }
  
  // Has website - 10 points
  if (parkData.website) {
    try {
      new URL(parkData.website);
      score += 10;
      breakdown.website = 10;
    } catch {
      // Invalid URL, no points
    }
  }
  
  // Has contact info - 10 points
  if (parkData.phone || parkData.email) {
    score += 10;
    breakdown.contact = 10;
  }
  
  // Has amenities - 10 points
  if (parkData.amenities && Array.isArray(parkData.amenities) && parkData.amenities.length > 0) {
    score += 10;
    breakdown.amenities = 10;
  }
  
  // Has activities - 5 points
  if (parkData.activities && Array.isArray(parkData.activities) && parkData.activities.length > 0) {
    score += 5;
    breakdown.activities = 5;
  }
  
  // Has boundaries - 10 points
  if (parkData.boundaries && parkData.boundaries.length > 0) {
    score += 10;
    breakdown.boundaries = 10;
  }
  
  // Official source bonus - 5 points
  if (parkData.data_source_priority >= 90) {
    score += 5;
    breakdown.officialSource = 5;
  }
  
  return {
    score,
    breakdown,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get priority number from source name
 */
export function getSourcePriority(source) {
  const sourceUpper = (source || '').toUpperCase();
  
  if (sourceUpper.includes('NPS')) {
    return SOURCE_PRIORITIES.NPS_API;
  }
  if (sourceUpper.includes('RECREATION.GOV')) {
    return SOURCE_PRIORITIES.RECREATION_GOV_API;
  }
  if (sourceUpper.includes('STATE') && sourceUpper.includes('API')) {
    return SOURCE_PRIORITIES.STATE_PARK_API;
  }
  if (sourceUpper.includes('MANUAL')) {
    return SOURCE_PRIORITIES.MANUAL_CURATION;
  }
  if (sourceUpper.includes('EMAIL')) {
    return SOURCE_PRIORITIES.EMAIL_RESPONSE;
  }
  if (sourceUpper.includes('.GOV')) {
    return SOURCE_PRIORITIES.OFFICIAL_WEBSITE_SCRAPE;
  }
  
  // Default for web scraping
  return SOURCE_PRIORITIES.WEB_SEARCH_SCRAPE;
}

/**
 * THE MOST IMPORTANT FUNCTION!
 * Should we update existing park data?
 */
export function shouldUpdatePark(existingPark, newParkData) {
  const existingPriority = existingPark.data_source_priority || 0;
  const newPriority = newParkData.data_source_priority || 0;
  
  const existingScore = existingPark.data_quality_score || 0;
  const newScore = newParkData.data_quality_score || 0;
  
  // RULE 1: NEVER downgrade API data to scraped data
  if (existingPriority >= 90 && newPriority < 90) {
    console.log('🛡️ PROTECTED: Cannot overwrite API data');
    return {
      shouldUpdate: false,
      reason: 'Protected: API data cannot be overwritten by scraped data',
    };
  }
  
  // RULE 2: Update if new source is better
  if (newPriority > existingPriority) {
    console.log('✅ UPDATE: Better data source');
    return {
      shouldUpdate: true,
      reason: 'Higher priority data source',
    };
  }
  
  // RULE 3: Same priority? Only update if quality improved
  if (newPriority === existingPriority && newScore > existingScore) {
    console.log('✅ UPDATE: Better quality');
    return {
      shouldUpdate: true,
      reason: 'Improved data quality',
    };
  }
  
  // RULE 4: Skip - no improvement
  console.log('⏭️ SKIP: No improvement');
  return {
    shouldUpdate: false,
    reason: 'No quality improvement',
  };
}

/**
 * Validate park data before saving
 */
export function validateParkData(parkData) {
  const errors = [];
  const warnings = [];
  
  // Must have name
  if (!parkData.name || parkData.name.trim() === '') {
    errors.push('Park name is required');
  }
  
  // Must have state
  if (!parkData.state || parkData.state.trim() === '') {
    errors.push('State is required');
  }
  
  // Check coordinates
  if (parkData.latitude || parkData.longitude) {
    const lat = parseFloat(parkData.latitude);
    const lng = parseFloat(parkData.longitude);
    
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push('Invalid latitude');
    }
    
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push('Invalid longitude');
    }
  } else {
    warnings.push('No coordinates - park won\'t show on map');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Remove duplicate parks
 */
export function deduplicateParks(parks) {
  const unique = [];
  const seen = new Set();
  
  for (const park of parks) {
    // Create a simple key from name + state
    const key = `${park.name}-${park.state}`.toLowerCase();
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(park);
    }
  }
  
  return unique;
}
