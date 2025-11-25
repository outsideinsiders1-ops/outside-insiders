/**
 * Database Operations for Park Data
 * Handles intelligent merging, deduplication, and data protection
 */

import { supabaseServer, isSupabaseInitialized } from '../supabase-server.js'
import { calculateQualityScore, shouldUpdatePark, getSourcePriority } from '../qualityScorer.js'
import { normalizeStateToCode } from './state-normalizer.js'

/**
 * Normalize park name for deduplication matching
 * Handles abbreviations, common words, and variations
 */
export function normalizeParkName(name) {
  if (!name) return ''
  
  let normalized = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/[^\w\s]/g, '') // Remove special characters
  
  // Expand common abbreviations
  const abbreviations = {
    '\\bnp\\b': 'national park',
    '\\bnm\\b': 'national monument',
    '\\bnf\\b': 'national forest',
    '\\bnwr\\b': 'national wildlife refuge',
    '\\bnra\\b': 'national recreation area',
    '\\bnps\\b': 'national park service',
    '\\bsp\\b': 'state park',
    '\\bsf\\b': 'state forest',
    '\\bsra\\b': 'state recreation area',
    '\\bcr\\b': 'county recreation',
    '\\bcp\\b': 'county park',
    '\\bcity\\b': 'city park',
    '\\bco\\b': 'county',
    '\\bst\\b': 'state'
  }
  
  for (const [abbr, full] of Object.entries(abbreviations)) {
    normalized = normalized.replace(new RegExp(abbr, 'gi'), full)
  }
  
  // Remove common words that don't help with matching
  normalized = normalized.replace(/\b(state|county|city|park|recreation|area|preserve|reserve|forest|wildlife|refuge|national|monument|memorial|historic|site|center|centre)\b/gi, '')
  
  return normalized.trim()
}

/**
 * Find existing park by normalized name and state
 */
export async function findExistingPark(name, state, sourceId = null) {
  if (!name || !state) return null
  if (!isSupabaseInitialized()) {
    throw new Error('Supabase client not initialized')
  }
  
  const normalizedName = normalizeParkName(name)
  
  // First, try to find by source_id if provided (most reliable)
  if (sourceId) {
    const { data: parkBySourceId, error: sourceIdError } = await supabaseServer
      .from('parks')
      .select('*')
      .eq('source_id', sourceId)
      .maybeSingle()
    
    if (!sourceIdError && parkBySourceId) {
      return parkBySourceId
    }
  }
  
  // Fall back to name matching
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
    // BUT: Only match if the names are actually similar (not just substring)
    if (parkNormalized.includes(normalizedName) || normalizedName.includes(parkNormalized)) {
      // If one is contained in the other and lengths are similar, likely same park
      const lengthDiff = Math.abs(parkNormalized.length - normalizedName.length)
      // Make fuzzy matching stricter: require names to be very similar (length diff < 10% of longer name)
      const longerLength = Math.max(parkNormalized.length, normalizedName.length)
      const similarityThreshold = Math.max(5, longerLength * 0.1) // At least 5 chars or 10% of longer name
      
      if (lengthDiff < similarityThreshold) {
        // Additional check: ensure the shorter name is at least 80% of the longer name
        const shorterLength = Math.min(parkNormalized.length, normalizedName.length)
        if (shorterLength / longerLength >= 0.8) {
          return park
        }
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
    'website', 'phone', 'email', 'agency',
    'amenities', 'activities', 'geometry'
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
  
  // Special handling for geometry - only update if existing is empty
  // Geometry is now stored as WKT string (SRID=4326;POLYGON(...))
  if (newParkData.geometry !== undefined && newParkData.geometry !== null && newParkData.geometry !== '') {
    // If existing has no geometry, use new one
    if (!existingPark.geometry || existingPark.geometry === '') {
      // Geometry is WKT string, validate it starts with SRID=
      if (typeof newParkData.geometry === 'string' && newParkData.geometry.startsWith('SRID=')) {
        merged.geometry = newParkData.geometry
      }
    } else {
      // Keep existing geometry (don't override)
      merged.geometry = existingPark.geometry
    }
  }
  
  // Update metadata
  merged.data_source_priority = Math.max(existingPark.data_source_priority || 0, priority)
  merged.data_quality_score = Math.max(existingPark.data_quality_score || 0, qualityScore)
  merged.last_updated = new Date().toISOString()
  
  // Update data_source if new source has higher priority OR if existing is null/empty
  // This ensures NPS API (priority 100) always updates the data_source
  if (newParkData.data_source) {
    const existingPriority = existingPark.data_source_priority || 0
    if (!existingPark.data_source || existingPark.data_source === '' || priority > existingPriority) {
      merged.data_source = newParkData.data_source
    }
  }
  
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
  
  // Normalize state to state code for consistency
  const normalizedState = normalizeStateToCode(parkData.state)
  parkData.state = normalizedState
  
  // Get priority based on source type
  const priority = getSourcePriority(sourceType)
  
  // Calculate quality score
  const qualityResult = calculateQualityScore(parkData)
  const qualityScore = qualityResult.score
  
  // Check for existing park (use normalized state and source_id if available)
  const existingPark = await findExistingPark(parkData.name, normalizedState, parkData.source_id)
  
  if (existingPark) {
    // Verify this is actually the same park by checking source_id (parkCode) if available
    const isSamePark = parkData.source_id && existingPark.source_id && 
                       parkData.source_id === existingPark.source_id
    
    console.log(`🔍 Found existing park: "${existingPark.name}" (${existingPark.state}) - matching "${parkData.name}" (${normalizedState})${isSamePark ? ' [VERIFIED by source_id]' : ' [name match only]'}`)
    
    // Check if we should update using data protection rules
    const updateDecision = shouldUpdatePark(existingPark, {
      ...parkData,
      data_source_priority: priority,
      data_quality_score: qualityScore
    })
    
    if (!updateDecision.shouldUpdate) {
      console.log(`⏭️ Skipping update: ${updateDecision.reason}`)
      return {
        action: 'skipped',
        reason: updateDecision.reason,
        park: existingPark
      }
    }
    
    console.log(`✅ Will update park: ${parkData.name}`)
    
    // Merge data intelligently
    const mergedData = mergeParkData(existingPark, parkData, priority, qualityScore)
    
    // Remove agency_type if it exists (column doesn't exist in database)
    // Map website_url to website (schema uses 'website' not 'website_url')
    const { agency_type: _, website_url: url, ...updateData } = mergedData
    if (url) {
      updateData.website = url
    }
    
    // Update existing park
    try {
      const { data, error } = await supabaseServer
        .from('parks')
        .update(updateData)
        .eq('id', existingPark.id)
        .select()
        .single()
      
      if (error) {
        console.error(`❌ Supabase update error for "${parkData.name}":`, error.message)
        throw new Error(`Failed to update park: ${error.message}`)
      }
      
      console.log(`✅ Successfully updated park: "${data.name}" (ID: ${data.id})`)
      return {
        action: 'updated',
        park: data
      }
    } catch (error) {
      console.error(`❌ Exception updating park "${parkData.name}":`, error.message)
      throw error
    }
  } else {
    // Insert new park
    console.log(`➕ Adding new park: "${parkData.name}" (${normalizedState})`)
    // Remove fields that don't exist in database schema
    // Map website_url to website (schema uses 'website' not 'website_url')
    const { agency_type: _, website_url: url, ...parkDataClean } = parkData
    if (url) {
      parkDataClean.website = url
    }
    
    const newPark = {
      ...parkDataClean,
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
      console.error(`❌ Failed to insert park "${parkData.name}":`, error.message)
      throw new Error(`Failed to insert park: ${error.message}`)
    }
    
    console.log(`✅ Successfully added park: "${data.name}" (ID: ${data.id})`)
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

