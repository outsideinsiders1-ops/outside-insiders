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
    try {
      const { data: parkBySourceId, error: sourceIdError } = await supabaseServer
        .from('parks')
        .select('*')
        .eq('source_id', sourceId)
        .maybeSingle()
      
      if (sourceIdError) {
        console.warn(`Warning: Error querying by source_id "${sourceId}":`, sourceIdError.message)
        // Continue to name-based matching
      } else if (parkBySourceId) {
        return parkBySourceId
      }
    } catch (error) {
      console.warn(`Warning: Exception querying by source_id "${sourceId}":`, error.message)
      // Continue to name-based matching
    }
  }
  
  // Fall back to name matching
  // Get all parks in the state
  let parks
  try {
    const { data, error } = await supabaseServer
      .from('parks')
      .select('*')
      .eq('state', state)
    
    if (error) {
      console.error(`Error finding existing park by state "${state}":`, error.message)
      return null
    }
    
    parks = data
    if (!parks || parks.length === 0) return null
  } catch (error) {
    console.error(`Exception finding existing park by state "${state}":`, error.message)
    return null
  }
  
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
 * Find existing park by name and coordinates (when state is unknown)
 */
export async function findExistingParkByCoordinates(name, latitude, longitude, sourceId = null) {
  if (!name || !latitude || !longitude) return null
  if (!isSupabaseInitialized()) {
    throw new Error('Supabase client not initialized')
  }
  
  const normalizedName = normalizeParkName(name)
  
  // First, try to find by source_id if provided (most reliable)
  if (sourceId) {
    try {
      const { data: parkBySourceId, error: sourceIdError } = await supabaseServer
        .from('parks')
        .select('*')
        .eq('source_id', sourceId)
        .maybeSingle()
      
      if (sourceIdError) {
        console.warn(`Warning: Error querying by source_id "${sourceId}":`, sourceIdError.message)
      } else if (parkBySourceId) {
        return parkBySourceId
      }
    } catch (error) {
      console.warn(`Warning: Exception querying by source_id "${sourceId}":`, error.message)
    }
  }
  
  // Find by name and nearby coordinates (within ~1km)
  // Use PostGIS distance if available, otherwise approximate
  try {
    const { data: parks, error } = await supabaseServer
      .from('parks')
      .select('*')
      .ilike('name', `%${name}%`)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
    
    if (error) {
      console.warn(`Error finding park by coordinates:`, error.message)
      return null
    }
    
    if (!parks || parks.length === 0) return null
    
    // Find closest match by distance
    let closestPark = null
    let closestDistance = Infinity
    
    for (const park of parks) {
      const parkNormalized = normalizeParkName(park.name)
      if (parkNormalized === normalizedName || 
          parkNormalized.includes(normalizedName) || 
          normalizedName.includes(parkNormalized)) {
        // Calculate distance
        const distance = Math.sqrt(
          Math.pow(park.latitude - latitude, 2) + 
          Math.pow(park.longitude - longitude, 2)
        ) * 111 // Rough km conversion
        
        if (distance < 1 && distance < closestDistance) { // Within 1km
          closestDistance = distance
          closestPark = park
        }
      }
    }
    
    return closestPark
  } catch (error) {
    console.warn(`Exception finding park by coordinates:`, error.message)
    return null
  }
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
  
  if (!parkData.name) {
    throw new Error('Park name is required')
  }
  
  // State is preferred but not required if we have coordinates
  // Parks without state can be geocoded later
  let normalizedState = null
  if (parkData.state) {
    normalizedState = normalizeStateToCode(parkData.state)
    parkData.state = normalizedState
  } else if (!parkData.latitude || !parkData.longitude) {
    // Require either state OR coordinates
    throw new Error('Park must have either state or coordinates (latitude and longitude)')
  }
  
  // Get priority based on source type
  const priority = getSourcePriority(sourceType)
  
  // Calculate quality score
  const qualityResult = calculateQualityScore(parkData)
  const qualityScore = qualityResult.score
  
  // Check for existing park (use normalized state and source_id if available)
  // If no state, try to find by name and coordinates
  let existingPark = null
  if (normalizedState) {
    existingPark = await findExistingPark(parkData.name, normalizedState, parkData.source_id)
  } else if (parkData.latitude && parkData.longitude) {
    // Try to find by name and coordinates if no state
    existingPark = await findExistingParkByCoordinates(parkData.name, parkData.latitude, parkData.longitude, parkData.source_id)
  }
  
  if (existingPark) {
    // Check if we should update using data protection rules
    const updateDecision = shouldUpdatePark(existingPark, {
      ...parkData,
      data_source_priority: priority,
      data_quality_score: qualityScore
    })
    
    if (!updateDecision.shouldUpdate) {
      // Don't log skipped parks - this was causing 256 log limit
      return {
        action: 'skipped',
        reason: updateDecision.reason,
        park: existingPark
      }
    }
    
    // Only log when actually updating (reduces log volume significantly)
    
    // Merge data intelligently
    const mergedData = mergeParkData(existingPark, parkData, priority, qualityScore)
    
    // Remove fields that don't exist in database schema
    // agency_type, category, directions, accessibility don't exist
    // Map website_url to website (schema uses 'website' not 'website_url')
    const { 
      agency_type: _, 
      website_url: url, 
      category: __, 
      directions: ____, 
      accessibility: _____,
      ...updateData 
    } = mergedData
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
      
      // Don't log every successful update to reduce log volume
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
    // Only log new parks (they're less common)
    console.log(`➕ Adding new park: "${parkData.name}" (${normalizedState})`)
    // Remove fields that don't exist in database schema
    // agency_type, category, directions, accessibility don't exist
    // Map website_url to website (schema uses 'website' not 'website_url')
    const { 
      agency_type: _, 
      website_url: url, 
      category: __, 
      directions: ____, 
      accessibility: _____,
      ...parkDataClean 
    } = parkData
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
    
    try {
      const { data, error } = await supabaseServer
        .from('parks')
        .insert(newPark)
        .select()
        .single()
      
      if (error) {
        console.error(`❌ Supabase insert error for "${parkData.name}":`, error.message)
        console.error(`   Error details:`, JSON.stringify(error, null, 2))
        throw new Error(`Failed to insert park: ${error.message}`)
      }
      
      // Log successful addition (new parks are important)
      console.log(`✅ Added: "${data.name}" (ID: ${data.id})`)
      return {
        action: 'added',
        park: data
      }
    } catch (insertError) {
      console.error(`❌ Exception inserting park "${parkData.name}":`, insertError.message)
      if (insertError.stack) {
        console.error(`   Stack trace:`, insertError.stack.split('\n').slice(0, 3).join('\n'))
      }
      throw insertError
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

