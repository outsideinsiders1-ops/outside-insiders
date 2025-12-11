/**
 * API Field Mapper
 * Transforms API responses (NPS, Recreation.gov) to park schema
 */

/**
 * Parses NPS latLong string format "lat:XX.XXXX, long:YY.YYYY" to {latitude, longitude}
 * @param {string} latLong - NPS latLong string
 * @returns {{latitude: number|null, longitude: number|null}}
 */
function parseNPSLatLong(latLong) {
  if (!latLong || typeof latLong !== 'string') {
    return { latitude: null, longitude: null }
  }

  try {
    // Format: "lat:XX.XXXX, long:YY.YYYY"
    const latMatch = latLong.match(/lat:([-\d.]+)/i)
    const lngMatch = latLong.match(/long:([-\d.]+)/i)

    if (latMatch && lngMatch) {
      const latitude = parseFloat(latMatch[1])
      const longitude = parseFloat(lngMatch[1])  // Fixed: was using lngMatch[1] for both

      // Validate ranges
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return { latitude, longitude }
      }
    }
  } catch (error) {
    console.warn('Error parsing NPS latLong:', latLong, error)
  }

  return { latitude: null, longitude: null }
}

/**
 * Extracts state from NPS states field (can be comma-separated)
 * @param {string} states - NPS states field (e.g., "NC,SC" or "NC")
 * @returns {string|null} First state code or null
 */
function extractState(states) {
  // Handle null, undefined, or empty string
  if (!states) {
    return null
  }
  
  // Convert to string if it's not already
  const statesStr = typeof states === 'string' ? states : String(states)
  
  if (!statesStr.trim()) {
    return null
  }

  // Take first state if comma-separated and normalize to code
  const state = statesStr.split(',')[0].trim()
  
  // If it's already a 2-letter code, return it uppercase
  if (state.length === 2) {
    return state.toUpperCase()
  }
  
  // Otherwise return as-is (will be normalized later in insertOrUpdatePark)
  return state || null
}

/**
 * Extracts phone number from NPS contacts
 * @param {Object} contacts - NPS contacts object
 * @returns {string|null}
 */
function extractPhone(contacts) {
  if (!contacts || !contacts.phoneNumbers || !Array.isArray(contacts.phoneNumbers)) {
    return null
  }

  const phoneNumber = contacts.phoneNumbers.find(p => p.type === 'Voice' || p.type === 'Phone')
  return phoneNumber ? phoneNumber.phoneNumber : null
}

/**
 * Extracts email from NPS contacts
 * @param {Object} contacts - NPS contacts object
 * @returns {string|null}
 */
function extractEmail(contacts) {
  if (!contacts || !contacts.emailAddresses || !Array.isArray(contacts.emailAddresses)) {
    return null
  }

  return contacts.emailAddresses[0]?.emailAddress || null
}

/**
 * Formats NPS address to string
 * @param {Array} addresses - NPS addresses array
 * @returns {string|null}
 */
function formatAddress(addresses) {
  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return null
  }

  // Prefer physical address over mailing address
  const address = addresses.find(a => a.type === 'Physical') || addresses[0]

  const parts = []
  if (address.line1) parts.push(address.line1)
  if (address.line2) parts.push(address.line2)
  if (address.line3) parts.push(address.line3)
  if (address.city) parts.push(address.city)
  if (address.stateCode) parts.push(address.stateCode)
  if (address.postalCode) parts.push(address.postalCode)

  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Extracts activities from NPS activities array
 * @param {Array} activities - NPS activities array
 * @returns {Array<string>}
 */
function extractActivities(activities) {
  if (!activities || !Array.isArray(activities)) {
    return []
  }

  return activities.map(a => a.name || a).filter(Boolean)
}

/**
 * Maps NPS API response to park schema
 * @param {Object} npsPark - Park object from NPS API
 * @returns {Object} Park object in our schema format
 */
export function mapNPSToParkSchema(npsPark) {
  const { latitude, longitude } = parseNPSLatLong(npsPark.latLong || '')
  
  // Extract state - handle various formats
  let state = extractState(npsPark.states)
  
  // If state is still null, try to get it from addresses
  if (!state && npsPark.addresses && Array.isArray(npsPark.addresses) && npsPark.addresses.length > 0) {
    // Try to find stateCode in any address
    for (const address of npsPark.addresses) {
      if (address && address.stateCode) {
        state = address.stateCode.toUpperCase().trim()
        break
      }
    }
  }
  
  // Last resort: if we have coordinates, we could geocode, but for now we'll skip parks without state
  // This is better than inserting invalid data
  
  // Ensure name is always present
  const name = npsPark.fullName || npsPark.name || 'Unnamed Park'
  
  // Use "N/A" as placeholder if state is still missing (database NOT NULL constraint)
  const finalState = state || 'N/A'

  return {
    name: name,
    description: npsPark.description || null,
    state: finalState, // Will be "N/A" if no state info available
    agency: 'NPS',
    agency_full_name: 'National Park Service',
    website: npsPark.url || null,
    phone: extractPhone(npsPark.contacts),
    email: extractEmail(npsPark.contacts),
    address: formatAddress(npsPark.addresses),
    activities: extractActivities(npsPark.activities),
    latitude: latitude,
    longitude: longitude,
    source_id: npsPark.parkCode || null,
    data_source: 'NPS API',
    // Additional NPS-specific fields
    designation_type: npsPark.designation || null,
    category: npsPark.parkCode ? 'National Park' : null
  }
}

/**
 * Maps Recreation.gov facility to park schema
 * @param {Object} facility - Facility object from Recreation.gov API
 * @returns {Object} Park object in our schema format
 */
/**
 * Extracts state from Recreation.gov facility addresses
 * @param {Array} addresses - Array of address objects from Recreation.gov API
 * @returns {string|null} State code (2-letter) or null
 */
function extractStateFromAddresses(addresses) {
  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return null
  }
  
  // Prefer physical address over mailing address
  const address = addresses.find(a => a.AddressType === 'Physical') || addresses[0]
  
  // Check various state fields
  return address?.AddressStateCode || 
         address?.StateCode || 
         address?.State || 
         null
}

export function mapRecreationGovToParkSchema(facility, addresses = null) {
  // Try to get state from facility first
  let state = facility.FacilityState || null
  
  // If no state, check FACILITYADDRESS array in the main response (it's already included!)
  if (!state && facility.FACILITYADDRESS && Array.isArray(facility.FACILITYADDRESS) && facility.FACILITYADDRESS.length > 0) {
    state = extractStateFromAddresses(facility.FACILITYADDRESS)
  }
  
  // If still no state and we have addresses from separate API call, extract from those
  if (!state && addresses) {
    state = extractStateFromAddresses(addresses)
  }
  
  // Normalize state to 2-letter code if needed
  if (state && typeof state === 'string') {
    const stateUpper = state.trim().toUpperCase()
    // If it's already a 2-letter code, use it
    if (stateUpper.length === 2) {
      state = stateUpper
    } else {
      // Try to normalize full state name to code (will be handled by normalizeStateToCode in db-operations)
      state = stateUpper
    }
  }
  
  // Extract activities from ACTIVITY array
  let activities = []
  if (facility.ACTIVITY && Array.isArray(facility.ACTIVITY)) {
    activities = facility.ACTIVITY
      .map(a => a.ActivityName || a.activityName)
      .filter(Boolean)
  }
  
  // Extract amenities from various sources
  let amenities = []
  
  // 1. CAMPSITE array indicates camping amenity
  if (facility.CAMPSITE && Array.isArray(facility.CAMPSITE) && facility.CAMPSITE.length > 0) {
    amenities.push('camping')
  }
  
  // 2. FacilityTypeDescription can indicate amenities
  const facilityType = facility.FacilityTypeDescription?.toLowerCase() || ''
  if (facilityType.includes('campground') || facilityType.includes('camp')) {
    if (!amenities.includes('camping')) amenities.push('camping')
  }
  if (facilityType.includes('day use') || facilityType.includes('picnic')) {
    amenities.push('picnicking')
  }
  if (facilityType.includes('boat') || facilityType.includes('marina')) {
    amenities.push('boating')
  }
  
  // 3. Parse FacilityDescription for common amenities
  const description = facility.FacilityDescription || ''
  const descLower = description.toLowerCase()
  
  // Common amenity keywords
  const amenityKeywords = {
    'camping': ['camping', 'campsite', 'campground', 'rv', 'tent'],
    'hiking': ['hiking', 'trail', 'trails', 'hike'],
    'fishing': ['fishing', 'fish', 'angler', 'fisherman'],
    'swimming': ['swimming', 'swim', 'beach', 'swim beach'],
    'boating': ['boating', 'boat launch', 'boat ramp', 'marina', 'dock'],
    'picnicking': ['picnic', 'picnic area', 'picnic table', 'picnicking'],
    'playground': ['playground', 'play area', 'playground equipment'],
    'visitor center': ['visitor center', 'visitor centre', 'information center'],
    'restrooms': ['restroom', 'restrooms', 'bathroom', 'toilet', 'flush toilet', 'vault toilet']
  }
  
  for (const [amenity, keywords] of Object.entries(amenityKeywords)) {
    if (keywords.some(keyword => descLower.includes(keyword))) {
      if (!amenities.includes(amenity)) {
        amenities.push(amenity)
      }
    }
  }
  
  // 4. Check FacilityAccessibilityText for restrooms (but don't store accessibility field)
  if (facility.FacilityAccessibilityText) {
    const accessLower = facility.FacilityAccessibilityText.toLowerCase()
    if ((accessLower.includes('restroom') || accessLower.includes('toilet')) && !amenities.includes('restrooms')) {
      amenities.push('restrooms')
    }
  }
  
  // Use "N/A" as placeholder if state is still missing (database NOT NULL constraint)
  const finalState = state || 'N/A'
  
  // Parse agency from Recreation.gov data
  // OrgAbbrevName can be things like "USFS", "BLM", "NPS", "FWS", "ARMY", "NAVY", etc.
  // If it's missing or generic, try to infer from OrgName
  let agency = facility.OrgAbbrevName || null
  if (!agency || agency === 'Federal' || agency === 'Federal Land') {
    // Try to parse from OrgName
    const orgName = facility.OrgName || ''
    if (orgName.includes('Forest Service') || orgName.includes('USFS')) {
      agency = 'USFS'
    } else if (orgName.includes('Bureau of Land Management') || orgName.includes('BLM')) {
      agency = 'BLM'
    } else if (orgName.includes('National Park Service') || orgName.includes('NPS')) {
      agency = 'NPS'
    } else if (orgName.includes('Fish and Wildlife') || orgName.includes('FWS')) {
      agency = 'FWS'
    } else if (orgName.includes('Army') || orgName.includes('Corps of Engineers')) {
      agency = 'ARMY'
    } else if (orgName.includes('Navy')) {
      agency = 'NAVY'
    } else {
      // Default to 'Federal' if we can't determine
      agency = 'Federal'
    }
  }
  
  return {
    name: facility.FacilityName || 'Unnamed Recreation Area',
    description: facility.FacilityDescription || null,
    state: finalState,
    agency: agency,
    agency_full_name: facility.OrgName || null,
    website: facility.FacilityURL || null,
    phone: facility.FacilityPhone || null,
    email: facility.FacilityEmail || null,
    latitude: facility.FacilityLatitude || facility.GEOJSON?.COORDINATES?.[1] || null,
    longitude: facility.FacilityLongitude || facility.GEOJSON?.COORDINATES?.[0] || null,
    source_id: facility.FacilityID?.toString() || null,
    data_source: 'Recreation.gov API',
    // Recreation.gov specific
    // Note: category field not included - not in database schema
    activities: activities.length > 0 ? activities : null,
    amenities: amenities.length > 0 ? amenities : null
    // Note: directions, accessibility, and category fields not included - not in database schema
  }
}

/**
 * Maps multiple NPS parks to park schema
 * @param {Array} npsParks - Array of park objects from NPS API
 * @returns {Array} Array of park objects in our schema format
 */
export function mapNPSParksToSchema(npsParks) {
  return npsParks.map(mapNPSToParkSchema)
}

/**
 * Maps multiple Recreation.gov facilities to park schema
 * @param {Array} facilities - Array of facility objects from Recreation.gov API
 * @returns {Array} Array of park objects in our schema format
 */
export function mapRecreationGovFacilitiesToSchema(facilities) {
  return facilities.map(mapRecreationGovToParkSchema)
}
