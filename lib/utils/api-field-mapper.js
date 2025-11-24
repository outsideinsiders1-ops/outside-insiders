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
      const longitude = parseFloat(lngMatch[1])

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
  if (!states || typeof states !== 'string') {
    return null
  }

  // Take first state if comma-separated and normalize to code
  const state = states.split(',')[0].trim()
  
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
  const state = extractState(npsPark.states || '')

  return {
    name: npsPark.fullName || 'Unnamed Park',
    description: npsPark.description || null,
    state: state,
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
export function mapRecreationGovToParkSchema(facility) {
  return {
    name: facility.FacilityName || 'Unnamed Recreation Area',
    description: facility.FacilityDescription || null,
    state: facility.FacilityState || null,
    agency: facility.OrgAbbrevName || 'Federal',
    agency_full_name: facility.OrgName || null,
    website: facility.FacilityURL || null,
    latitude: facility.FacilityLatitude || null,
    longitude: facility.FacilityLongitude || null,
    source_id: facility.FacilityID?.toString() || null,
    data_source: 'Recreation.gov API',
    // Recreation.gov specific
    category: facility.FacilityTypeDescription || null
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
