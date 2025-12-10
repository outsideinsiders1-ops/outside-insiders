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

  // Map name (PAD-US uses UNIT_NAME, LOC_NAME; TPL/ParkServe uses ParkName, etc.)
  const name = getValue([
    'name', 'NAME', 'Name',
    'UNIT_NAME', 'UNITNAME', 'unit_name', // PAD-US
    'Unit_Nm', 'UNIT_NM', // PAD-US alternative
    'LOC_NAME', 'LOCNAME', 'loc_name', // PAD-US
    'ParkName', 'park_name', 'PARK_NAME', // TPL/ParkServe
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

  // Map state (PAD-US uses State_Nm, STATE; ParkServe uses State, StateCode)
  const state = getValue([
    'state', 'STATE', 'State',
    'State_Nm', 'STATE_NM', 'state_nm', // PAD-US
    'state_code', 'STATE_CODE', 'StateCode', 'State_Code',
    'StateCode', 'STATECODE', // ParkServe
    'state_abbr', 'STATE_ABBR',
    'st', 'ST', 'St',
    'province', 'PROVINCE'
  ])

  // Map agency/owner type (PAD-US uses Mang_Name, ParkServe may use different fields)
  const agency = getValue([
    'agency', 'AGENCY', 'Agency',
    'Mang_Name', 'MANG_NAME', 'mang_name', // PAD-US
    'owner_type', 'OWNER_TYPE', 'OwnerType', 'OWNERTYPE',
    'owner', 'OWNER', 'Owner',
    'managing_agency', 'MANAGING_AGENCY', 'ManagingAgency',
    'mgmt_agency', 'MGMT_AGENCY',
    'manager', 'MANAGER', 'Manager',
    'agency_type', 'AGENCY_TYPE', 'AgencyType'
  ])
  
  // Map agency full name (for display purposes)
  const agency_full_name = getValue([
    'agency_full_name', 'AGENCY_FULL_NAME', 'AgencyFullName',
    'agency_name', 'AGENCY_NAME', 'AgencyName',
    'managing_agency_name', 'MANAGING_AGENCY_NAME'
  ])
  
  // Note: agency_type column doesn't exist in database, using agency instead

  // Map website URL (database column is 'website' not 'website_url')
  const website = getValue([
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

  // Map acres/area (for grouping - keep largest parcel)
  const acres = getValue([
    'acres', 'ACRES', 'Acres',
    'Acreage', 'ACREAGE', // ParkServe
    'GIS_Acres', 'GIS_ACRES', 'gis_acres', // PAD-US
    'AREA', 'area', 'Area',
    'size_acres', 'SIZE_ACRES',
    'park_acres', 'PARK_ACRES'
  ])

  // Map public access (PAD-US)
  const public_access = getValue([
    'public_access', 'PUBLIC_ACCESS', 'Public_Access',
    'Pub_Access', 'PUB_ACCESS', // PAD-US
    'access', 'ACCESS', 'Access'
  ])

  // Map category (PAD-US, ParkServe)
  const category = getValue([
    'category', 'CATEGORY', 'Category',
    'Category', // PAD-US
    'ParkType', 'PARK_TYPE', 'park_type', // ParkServe
    'type', 'TYPE', 'Type',
    'park_category', 'PARK_CATEGORY'
  ])

  // Map designation type (PAD-US)
  const designation_type = getValue([
    'designation_type', 'DESIGNATION_TYPE', 'Designation_Type',
    'Des_Tp', 'DES_TP', // PAD-US
    'designation', 'DESIGNATION', 'Designation'
  ])

  // Map county
  const county = getValue([
    'county', 'COUNTY', 'County',
    'county_name', 'COUNTY_NAME', 'CountyName',
    'admin_county', 'ADMIN_COUNTY'
  ])

  // Map address
  const address = getValue([
    'address', 'ADDRESS', 'Address',
    'street_address', 'STREET_ADDRESS', 'StreetAddress',
    'location', 'LOCATION', 'Location',
    'full_address', 'FULL_ADDRESS'
  ])

  // ParkServe-specific fields
  const parkAccess = getValue([
    'ParkAccess', 'PARK_ACCESS', 'park_access',
    'Access', 'ACCESS', 'access'
  ])

  // Use "N/A" as placeholder if state is missing (database NOT NULL constraint)
  const finalState = state || 'N/A'
  
  return {
    name,
    description,
    state: finalState,
    agency,
    agency_full_name,
    // Note: agency_type removed - column doesn't exist in database
    website, // Database column is 'website' not 'website_url'
    phone,
    email,
    amenities: amenities ? (Array.isArray(amenities) ? amenities : [amenities]) : null,
    activities: activities ? (Array.isArray(activities) ? activities : [activities]) : null,
    acres: acres ? parseFloat(acres) : null,
    public_access,
    category,
    designation_type,
    county,
    address,
    // ParkServe filter: only include if ParkAccess === 3 (Open Access)
    _parkAccess: parkAccess // Internal field for filtering
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

