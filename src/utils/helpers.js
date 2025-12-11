// src/utils/helpers.js
// Helper functions used throughout the app

/**
 * Calculate distance between two points
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959 // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

/**
 * Normalize agency names for consistent display
 */
export function normalizeAgency(agency) {
  if (!agency) return 'FEDERAL'
  
  const agencyLower = agency.toLowerCase()
  
  // Check for state parks
  if (agencyLower.includes('state')) return 'State'
  
  // Check for county parks
  if (agencyLower.includes('county')) return 'COUNTY'
  
  // Check for city/municipal parks
  if (agencyLower.includes('city') || 
      agencyLower.includes('municipal') || 
      agencyLower.includes('town')) return 'CITY'
  
  // Federal agencies - check for exact matches
  if (agency === 'NPS') return 'NPS'
  if (agency === 'USFS') return 'USFS'
  if (agency === 'BLM') return 'BLM'
  if (agency === 'FWS') return 'FWS'
  if (agency === 'ARMY' || agency === 'Army' || agency === 'USACE') return 'ARMY'
  if (agency === 'NAVY' || agency === 'Navy') return 'NAVY'
  
  // Check if it's a generic "Federal" agency
  if (agency === 'Federal' || agency === 'Federal Land') return 'FEDERAL'
  
  // Default
  return 'FEDERAL'
}

/**
 * Get full agency name from abbreviation
 */
export function getAgencyFullName(agency) {
  const names = {
    'State': 'State Park',
    'COUNTY': 'County Park',
    'CITY': 'City Park',
    'NPS': 'National Park Service',
    'USFS': 'U.S. Forest Service',
    'BLM': 'Bureau of Land Management',
    'FWS': 'Fish & Wildlife Service',
    'ARMY': 'U.S. Army / Corps of Engineers',
    'NAVY': 'U.S. Navy',
    'FEDERAL': 'Federal Land'
  }
  const normalized = normalizeAgency(agency)
  return names[normalized] || agency
}

/**
 * Get today's day name
 */
export function getTodaySchedule(operatingHours) {
  if (!operatingHours || operatingHours.length === 0) return null
  
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const today = days[new Date().getDay()]
  
  const schedule = operatingHours[0]
  return schedule[today] || 'Hours not available'
}
