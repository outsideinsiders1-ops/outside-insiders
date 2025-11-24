/**
 * State Normalization Utility
 * Converts state names to state codes for consistency
 */

const STATE_NAME_TO_CODE = {
  'alabama': 'AL',
  'alaska': 'AK',
  'arizona': 'AZ',
  'arkansas': 'AR',
  'california': 'CA',
  'colorado': 'CO',
  'connecticut': 'CT',
  'delaware': 'DE',
  'florida': 'FL',
  'georgia': 'GA',
  'hawaii': 'HI',
  'idaho': 'ID',
  'illinois': 'IL',
  'indiana': 'IN',
  'iowa': 'IA',
  'kansas': 'KS',
  'kentucky': 'KY',
  'louisiana': 'LA',
  'maine': 'ME',
  'maryland': 'MD',
  'massachusetts': 'MA',
  'michigan': 'MI',
  'minnesota': 'MN',
  'mississippi': 'MS',
  'missouri': 'MO',
  'montana': 'MT',
  'nebraska': 'NE',
  'nevada': 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  'ohio': 'OH',
  'oklahoma': 'OK',
  'oregon': 'OR',
  'pennsylvania': 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  'tennessee': 'TN',
  'texas': 'TX',
  'utah': 'UT',
  'vermont': 'VT',
  'virginia': 'VA',
  'washington': 'WA',
  'west virginia': 'WV',
  'wisconsin': 'WI',
  'wyoming': 'WY',
  'district of columbia': 'DC',
  'washington dc': 'DC',
  'dc': 'DC'
}

const STATE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name])
)

/**
 * Normalize state to state code (2-letter uppercase)
 * @param {string} state - State name or code
 * @returns {string} - State code (e.g., "GA", "NC") or original if not found
 */
export function normalizeStateToCode(state) {
  if (!state || typeof state !== 'string') {
    return state
  }

  const trimmed = state.trim()
  
  // If already a 2-letter code, uppercase it
  if (trimmed.length === 2) {
    return trimmed.toUpperCase()
  }

  // Try to match state name
  const normalized = trimmed.toLowerCase()
  return STATE_NAME_TO_CODE[normalized] || trimmed
}

/**
 * Convert state code to full state name
 * @param {string} stateCode - 2-letter state code
 * @returns {string} - Full state name or original if not found
 */
export function stateCodeToName(stateCode) {
  if (!stateCode || typeof stateCode !== 'string') {
    return stateCode
  }

  const code = stateCode.toUpperCase()
  const name = STATE_CODE_TO_NAME[code]
  
  if (name) {
    // Capitalize first letter of each word
    return name.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  return stateCode
}

/**
 * Check if a string is a valid state code
 * @param {string} state - State string to check
 * @returns {boolean}
 */
export function isValidStateCode(state) {
  if (!state || typeof state !== 'string') {
    return false
  }
  
  const code = state.trim().toUpperCase()
  return code.length === 2 && STATE_CODE_TO_NAME[code] !== undefined
}

