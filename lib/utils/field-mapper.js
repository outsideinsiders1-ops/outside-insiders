/**
 * Field Mapping Utility
 * Maps various property names from different datasets to our park schema
 * Supports: PAD-US, TPL, state-specific formats, and common variations
 */

/**
 * Map properties from GeoJSON/Shapefile to our park schema
 * Handles multiple naming conventions from different data sources
 */
export function mapPropertiesToParkSchema(props) {
  if (!props || typeof props !== 'object') {
    return {}
  }

  // Helper to get value from multiple possible keys
  const getValue = (keys, defaultValue = null) => {
    for (const key of keys) {
      if (props[key] !== undefined && props[key] !== null && props[key] !== '') {
        return props[key]
      }
    }
    return defaultValue
  }

  // Helper to get array value
  const getArrayValue = (keys) => {
    for (const key of keys) {
      const value = props[key]
      if (Array.isArray(value) && value.length > 0) {
        return value
      }
      if (typeof value === 'string' && value.trim()) {
        // Try to parse comma-separated string
        return value.split(',').map(s => s.trim()).filter(s => s)
      }
    }
    return null
  }

  // Map name (PAD-US uses UNIT_NAME, LOC_NAME; TPL uses park_name, etc.)
  const name = getValue([
    'name', 'NAME', 'Name',
    'UNIT_NAME', 'UNITNAME', 'unit_name', // PAD-US
    'LOC_NAME', 'LOCNAME', 'loc_name', // PAD-US
    'ParkName', 'park_name', 'PARK_NAME', // TPL and others
    'PARKNAME', 'parkName',
    'site_name', 'SITE_NAME', 'SiteName',
    'facility_name', 'FACILITY_NAME'
  ], 'Unnamed Park')

  // Map description
  const description = getValue([
    'description', 'DESCRIPTION', 'Description', 'Desc',
    'DESC', 'desc',
    'COMMENTS', 'comments', 'Comments',
    'NOTES', 'notes', 'Notes',
    'REMARKS', 'remarks'
  ])

  // Map state (PAD-US uses STATE, state_code variations)
  const state = getValue([
    'state', 'STATE', 'State',
    'state_code', 'STATE_CODE', 'StateCode', 'STATE_CODE',
    'state_abbr', 'STATE_ABBR',
    'st', 'ST', 'St',
    'province', 'PROVINCE'
  ])

  // Map agency/owner type
  const agency = getValue([
    'agency', 'AGENCY', 'Agency',
    'owner_type', 'OWNER_TYPE', 'OwnerType', 'OWNERTYPE',
    'owner', 'OWNER', 'Owner',
    'managing_agency', 'MANAGING_AGENCY', 'ManagingAgency',
    'mgmt_agency', 'MGMT_AGENCY',
    'agency_type', 'AGENCY_TYPE', 'AgencyType'
  ])

  const agency_type = getValue([
    'agency_type', 'AGENCY_TYPE', 'AgencyType',
    'owner_type', 'OWNER_TYPE', 'OwnerType',
    'category', 'CATEGORY', 'Category',
    'type', 'TYPE', 'Type'
  ]) || agency

  // Map website URL
  const website_url = getValue([
    'website', 'WEBSITE', 'Website',
    'url', 'URL', 'Url',
    'website_url', 'WEBSITE_URL', 'WebsiteUrl',
    'homepage', 'HOMEPAGE', 'Homepage',
    'link', 'LINK', 'Link',
    'web_url', 'WEB_URL'
  ])

  // Map phone
  const phone = getValue([
    'phone', 'PHONE', 'Phone',
    'telephone', 'TELEPHONE', 'Telephone',
    'phone_number', 'PHONE_NUMBER', 'PhoneNumber',
    'contact_phone', 'CONTACT_PHONE',
    'tel', 'TEL'
  ])

  // Map email
  const email = getValue([
    'email', 'EMAIL', 'Email',
    'contact_email', 'CONTACT_EMAIL', 'ContactEmail',
    'e_mail', 'E_MAIL', 'E_MAIL'
  ])

  // Map amenities (can be array or comma-separated string)
  const amenities = getArrayValue([
    'amenities', 'AMENITIES', 'Amenities',
    'amenity', 'AMENITY', 'Amenity',
    'facilities', 'FACILITIES', 'Facilities',
    'facility', 'FACILITY', 'Facility',
    'features', 'FEATURES', 'Features'
  ])

  // Map activities
  const activities = getArrayValue([
    'activities', 'ACTIVITIES', 'Activities',
    'activity', 'ACTIVITY', 'Activity',
    'recreation', 'RECREATION', 'Recreation',
    'recreational_activities', 'RECREATIONAL_ACTIVITIES'
  ])

  return {
    name,
    description,
    state,
    agency,
    agency_type,
    website_url,
    phone,
    email,
    amenities,
    activities
  }
}

/**
 * Log unmapped properties for debugging
 * Helps identify new field names that need to be added to the mapper
 */
export function logUnmappedProperties(props) {
  const unmapped = {}
  const mappedKeys = new Set([
    'name', 'NAME', 'UNIT_NAME', 'LOC_NAME', 'ParkName', 'park_name',
    'description', 'DESCRIPTION', 'state', 'STATE', 'state_code',
    'agency', 'AGENCY', 'owner_type', 'website', 'phone', 'email',
    'amenities', 'activities'
  ])

  for (const key in props) {
    if (!mappedKeys.has(key) && props[key] !== null && props[key] !== '') {
      unmapped[key] = props[key]
    }
  }

  if (Object.keys(unmapped).length > 0) {
    console.log('Unmapped properties found:', unmapped)
  }

  return unmapped
}

