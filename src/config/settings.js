// src/config/settings.js
// Central configuration for the entire app

export const config = {
  // Map settings
  map: {
    defaultCenter: [35.5, -83.0], // Western North Carolina
    defaultZoom: 7,
    nearMeZoom: 10,
    detailZoom: 12,
    minZoom: 4,
    maxZoom: 18,
  },

  // Marker colors for different park types
  markerColors: {
    State: '#4a7c2f',      // Green
    COUNTY: '#0891b2',     // Cyan/Teal  
    CITY: '#eab308',       // Yellow
    NPS: '#2563eb',        // Blue
    USFS: '#92400e',       // Brown
    BLM: '#ea580c',        // Orange
    FWS: '#9333ea',        // Purple
    ARMY: '#dc2626',       // Red (Army/Corps of Engineers)
    NAVY: '#1e40af',       // Navy Blue
    FEDERAL: '#6b7280',    // Gray (generic federal)
  },

  // API endpoints (we'll use these later)
  api: {
    scrape: '/api/scrape',
    sync: '/api/sync',
    upload: '/api/upload',
  },

  // Search settings
  search: {
    debounceMs: 300,  // Wait 300ms after typing stops
    minChars: 2,       // Minimum characters to search
  },

  // Filter options
  amenities: [
    { key: 'camping', label: '🏕️ Camping' },
    { key: 'hiking', label: '🥾 Hiking' },
    { key: 'fishing', label: '🎣 Fishing' },
    { key: 'swimming', label: '🏊 Swimming' },
    { key: 'boating', label: '⛵ Boating' },
    { key: 'picnicking', label: '🧺 Picnic Areas' },
    { key: 'playground', label: '🛝 Playground' },
    { key: 'visitor center', label: '🏛️ Visitor Center' },
    { key: 'restrooms', label: '🚻 Restrooms' },
  ],

  // Agency types
  agencies: {
    federal: ['NPS', 'USFS', 'BLM', 'FWS'],
    state: ['State'],
    local: ['COUNTY', 'CITY'],
  },
}

export default config
