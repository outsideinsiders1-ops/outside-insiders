/**
 * Database Operations for Park Data
 * Handles intelligent merging, deduplication, and data protection
 */

import { supabaseServer, isSupabaseInitialized } from '../supabase-server.js'
import { calculateQualityScore, shouldUpdatePark, getSourcePriority } from '../qualityScorer.js'

/**
 * Normalize park name for deduplication matching
 */
export function normalizeParkName(name) {
  if (!name) return ''
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\b(state|county|city|park|recreation|area|preserve|reserve|forest|wildlife|refuge)\b/gi, '') // Remove common words
    .trim()
}

/**
 * Find existing park by normalized name and state
 */
export async function findExistingPark(name, state) {
  if (!name || !state) return null
  if (!isSupabaseInitialized()) {
    throw new Error('Supabase client not initialized')
  }
  
  const normalizedName = normalizeParkName(name)
  
  // Get all parks in the state
  const { data: parks, error } = await supabaseServer
    .from('parks')
    .select('*')
    .eq('state', state)
  
  if (error) {
    console.error('Error finding existing park:', error)
    return null
  }
  
  if (!parks || parks.length === 0) return null
  
  // Find best match by normalized name
  for (const park of parks) {
    const parkNormalized = normalizeParkName(park.name)
    if (parkNormalized === normalizedName) {
      return park
    }
    
    // Also check if names are very similar (fuzzy match)
    if (parkNormalized.includes(normalizedName) || normalizedName.includes(parkNormalized)) {
      // If one is contained in the other and lengths are similar, likely same park
      const lengthDiff = Math.abs(parkNormalized.length - normalizedName.length)
      if (lengthDiff < 5) {
        return park
      }
    }
  }
  
  return null
}

/**
 * Merge park data intelligently - fill blanks without overriding existing data
 */
export function mergeParkData(existingPark, newParkData, priority, qualityScore) {
  const merged = { ...existingPark }
  
  // For each field, only update if existing is empty/null OR new data is better
  const fields = [
    'name', 'description', 'latitude', 'longitude', 
    'website_url', 'phone', 'email', 'agency', 'agency_type',
    'amenities', 'activities', 'boundary'
  ]
  
  for (const field of fields) {
    const existingValue = existingPark[field]
    const newValue = newParkData[field]
    
    // If existing is empty/null, use new value
    if (!existingValue || existingValue === '' || 
        (Array.isArray(existingValue) && existingValue.length === 0)) {
      if (newValue !== undefined && newValue !== null && newValue !== '') {
        merged[field] = newValue
      }
    }
    // If both have values, keep existing (don't override)
    // Exception: If new has higher priority AND better quality for this field
    else if (newValue !== undefined && newValue !== null && newValue !== '') {
      // For now, keep existing - can enhance later with field-level quality scoring
      // This ensures we don't lose data
      merged[field] = existingValue
    }
  }
  
  // Special handling for coordinates - only update if existing are missing or clearly wrong
  if (newParkData.latitude && newParkData.longitude) {
    if (!existingPark.latitude || !existingPark.longitude) {
      merged.latitude = newParkData.latitude
      merged.longitude = newParkData.longitude
    }
    // If existing coordinates are 0,0 or clearly wrong, update
    else if (existingPark.latitude === 0 && existingPark.longitude === 0) {
      merged.latitude = newParkData.latitude
      merged.longitude = newParkData.longitude
    }
  }
  
  // Special handling for amenities - merge arrays
  if (newParkData.amenities && Array.isArray(newParkData.amenities)) {
    const existingAmenities = existingPark.amenities || []
    const mergedAmenities = [...new Set([...existingAmenities, ...newParkData.amenities])]
    merged.amenities = mergedAmenities
  }
  
  // Update metadata
  merged.data_source_priority = Math.max(existingPark.data_source_priority || 0, priority)
  merged.data_quality_score = Math.max(existingPark.data_quality_score || 0, qualityScore)
  merged.last_updated = new Date().toISOString()
  
  return merged
}

/**
 * Insert or update park with intelligent merging and data protection
 */
export async function insertOrUpdatePark(parkData, sourceType) {
  if (!isSupabaseInitialized()) {
    throw new Error('Supabase client not initialized')
  }
  
  if (!parkData.name || !parkData.state) {
    throw new Error('Park name and state are required')
  }
  
  // Get priority based on source type
  const priority = getSourcePriority(sourceType)
  
  // Calculate quality score
  const qualityResult = calculateQualityScore(parkData)
  const qualityScore = qualityResult.score
  
  // Check for existing park
  const existingPark = await findExistingPark(parkData.name, parkData.state)
  
  if (existingPark) {
    // Check if we should update using data protection rules
    const updateDecision = shouldUpdatePark(existingPark, {
      ...parkData,
      data_source_priority: priority,
      data_quality_score: qualityScore
    })
    
    if (!updateDecision.shouldUpdate) {
      return {
        action: 'skipped',
        reason: updateDecision.reason,
        park: existingPark
      }
    }
    
    // Merge data intelligently
    const mergedData = mergeParkData(existingPark, parkData, priority, qualityScore)
    
    // Update existing park
    const { data, error } = await supabaseServer
      .from('parks')
      .update(mergedData)
      .eq('id', existingPark.id)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to update park: ${error.message}`)
    }
    
    return {
      action: 'updated',
      park: data
    }
  } else {
    // Insert new park
    const newPark = {
      ...parkData,
      data_source_priority: priority,
      data_quality_score: qualityScore,
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString()
    }
    
    const { data, error } = await supabaseServer
      .from('parks')
      .insert(newPark)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to insert park: ${error.message}`)
    }
    
    return {
      action: 'added',
      park: data
    }
  }
}

/**
 * Batch insert/update parks
 */
export async function batchInsertOrUpdateParks(parks, sourceType) {
  const results = {
    added: 0,
    updated: 0,
    skipped: 0,
    errors: []
  }
  
  for (const park of parks) {
    try {
      const result = await insertOrUpdatePark(park, sourceType)
      
      if (result.action === 'added') {
        results.added++
      } else if (result.action === 'updated') {
        results.updated++
      } else if (result.action === 'skipped') {
        results.skipped++
      }
    } catch (error) {
      results.errors.push({
        park: park?.name || 'Unknown',
        error: error.message
      })
    }
  }
  
  return results
}

