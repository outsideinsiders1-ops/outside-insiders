import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import L from 'leaflet'
import AdminPanel from './AdminPanel'

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Mapbox access token - add this to your .env.local
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Enhanced marker icons - includes COUNTY and CITY
const createCustomIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10]
  })
}

const markerIcons = {
  STATE: createCustomIcon('#4a7c2f'),     // Green
  COUNTY: createCustomIcon('#0891b2'),    // Cyan/Teal
  CITY: createCustomIcon('#eab308'),      // Yellow
  NPS: createCustomIcon('#2563eb'),       // Blue
  USFS: createCustomIcon('#92400e'),      // Brown
  BLM: createCustomIcon('#ea580c'),       // Orange
  FWS: createCustomIcon('#9333ea'),       // Purple
  FEDERAL: createCustomIcon('#6b7280')    // Gray
}

// Component to handle map centering
function MapController({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView(center, zoom)
    }
  }, [center, zoom, map])
  return null
}

function App() {
  const [parks, setParks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPark, setSelectedPark] = useState(null)
  const [mapCenter, setMapCenter] = useState([35.5, -83.0])
  const [mapZoom, setMapZoom] = useState(7)
  
  // Admin panel state
  const [showAdmin, setShowAdmin] = useState(false)
  
  // Near Me feature state
  const [userLocation, setUserLocation] = useState(null)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [sortByDistance, setSortByDistance] = useState(false)

  // Enhanced filter drawer state
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [landTypeFilter, setLandTypeFilter] = useState('ALL')
  const [agencyFilters, setAgencyFilters] = useState({
    NPS: false,
    USFS: false,
    FWS: false,
    BLM: false
  })
  
  // Amenities filters
  const [amenitiesFilters, setAmenitiesFilters] = useState({
    camping: false,
    hiking: false,
    fishing: false,
    swimming: false,
    boating: false,
    picnicking: false,
    playground: false,
    'visitor center': false,
    'restrooms': false
  })
  
  const [activitiesExpanded, setActivitiesExpanded] = useState(false)
  const [landTypeExpanded, setLandTypeExpanded] = useState(true)
  const [agenciesExpanded, setAgenciesExpanded] = useState(false)

  // Check URL for /admin route
  useEffect(() => {
    const checkAdminRoute = () => {
      if (window.location.pathname === '/admin') {
        setShowAdmin(true)
      } else {
        setShowAdmin(false)
      }
    }
    
    checkAdminRoute()
    window.addEventListener('popstate', checkAdminRoute)
    
    return () => {
      window.removeEventListener('popstate', checkAdminRoute)
    }
  }, [])

  // Get user location on mount for "Near Me" auto-zoom
  useEffect(() => {
    if (!showAdmin) {
      getUserLocation()
      fetchParks()
    }
  }, [landTypeFilter, agencyFilters, amenitiesFilters, showAdmin])

  const getUserLocation = () => {
    if ('geolocation' in navigator) {
      setLoadingLocation(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude
          const userLon = position.coords.longitude
          
          setUserLocation({ lat: userLat, lon: userLon })
          setMapCenter([userLat, userLon])
          setMapZoom(10) // Good "Near Me" zoom level
          setLoadingLocation(false)
        },
        (error) => {
          console.log('Location access denied or unavailable, showing default view')
          setLoadingLocation(false)
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 300000 // 5 minutes
        }
      )
    }
  }

  const fetchParks = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('parks')
        .select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      // Land type filtering
      if (landTypeFilter === 'FEDERAL') {
        query = query.in('agency', ['NPS', 'USFS', 'BLM', 'FWS'])
      } else if (landTypeFilter === 'STATE') {
        query = query.eq('agency', 'STATE')
      } else if (landTypeFilter === 'COUNTY') {
        query = query.eq('agency', 'COUNTY')
      } else if (landTypeFilter === 'CITY') {
        query = query.eq('agency', 'CITY')
      }

      // Specific agency filters
      if (landTypeFilter !== 'STATE' && landTypeFilter !== 'COUNTY' && landTypeFilter !== 'CITY') {
        const selectedAgencies = Object.keys(agencyFilters).filter(key => agencyFilters[key])
        if (selectedAgencies.length > 0) {
          query = query.in('agency', selectedAgencies)
        }
      }

      const { data, error } = await query

      if (error) throw error

      console.log(`Loaded ${data.length} parks`)
      
      // Client-side amenities filtering
      let filteredParks = data
      const activeAmenities = Object.keys(amenitiesFilters).filter(key => amenitiesFilters[key])
      
      if (activeAmenities.length > 0) {
        filteredParks = data.filter(park => {
          if (!park.amenities || park.amenities.length === 0) return false
          
          return activeAmenities.every(amenity => 
            park.amenities.some(parkAmenity => 
              parkAmenity.toLowerCase().includes(amenity.toLowerCase())
            )
          )
        })
      }
      
      setParks(filteredParks)
    } catch (error) {
      console.error('Error fetching parks:', error)
      alert('Error loading parks. Check console for details.')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkerClick = (park) => {
    setSelectedPark(park)
    setMapCenter([park.latitude, park.longitude])
    setMapZoom(12)
  }

  const closeDetailPanel = () => {
    setSelectedPark(null)
    setMapZoom(userLocation ? 10 : 7)
  }

  const getAgencyFullName = (agency) => {
    const names = {
      STATE: 'State Park',
      COUNTY: 'County Park',
      CITY: 'City Park',
      NPS: 'National Park Service',
      USFS: 'U.S. Forest Service',
      BLM: 'Bureau of Land Management',
      FWS: 'Fish & Wildlife Service',
      FEDERAL: 'Federal Land'
    }
    return names[agency] || agency
  }

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  const handleNearMe = () => {
    if (loadingLocation) return
    getUserLocation()
    setSortByDistance(true)
  }

  const handleLandTypeChange = (type) => {
    setLandTypeFilter(type)
    if (type === 'STATE' || type === 'COUNTY' || type === 'CITY') {
      setAgencyFilters({ NPS: false, USFS: false, FWS: false, BLM: false })
    }
  }

  const handleAgencyToggle = (agency) => {
    setAgencyFilters(prev => ({
      ...prev,
      [agency]: !prev[agency]
    }))
    if (landTypeFilter === 'STATE' || landTypeFilter === 'COUNTY' || landTypeFilter === 'CITY') {
      setLandTypeFilter('ALL')
    }
  }

  const handleAmenityToggle = (amenity) => {
    setAmenitiesFilters(prev => ({
      ...prev,
      [amenity]: !prev[amenity]
    }))
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (landTypeFilter !== 'ALL') count++
    count += Object.values(agencyFilters).filter(Boolean).length
    count += Object.values(amenitiesFilters).filter(Boolean).length
    return count
  }

  const getTodaySchedule = (operatingHours) => {
    if (!operatingHours || operatingHours.length === 0) return null
    
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const today = days[new Date().getDay()]
    
    const schedule = operatingHours[0]
    return schedule[today] || 'Hours not available'
  }

  const parksWithDistances = userLocation 
    ? parks.map(park => ({
        ...park,
        distance: calculateDistance(
          userLocation.lat, 
          userLocation.lon, 
          park.latitude, 
          park.longitude
        )
      }))
    : parks

  const displayParks = sortByDistance 
    ? [...parksWithDistances].sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity))
    : parksWithDistances

  if (showAdmin) {
    return (
      <div className="app">
        <AdminPanel />
      </div>
    )
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>Outside Insiders</h1>
          <p>Discover all public recreation spaces in one place</p>
        </div>
      </header>

      {/* Filter Drawer Button */}
      <button 
        className="filter-drawer-button"
        onClick={() => setFilterDrawerOpen(true)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6"/>
          <line x1="4" y1="12" x2="20" y2="12"/>
          <line x1="4" y1="18" x2="20" y2="18"/>
          <circle cx="18" cy="6" r="2" fill="white"/>
          <circle cx="8" cy="12" r="2" fill="white"/>
          <circle cx="15" cy="18" r="2" fill="white"/>
        </svg>
        <span>Filters</span>
        {getActiveFilterCount() > 0 && (
          <span className="filter-badge">{getActiveFilterCount()}</span>
        )}
      </button>

      {/* Near Me Button */}
      <button 
        className="near-me-button"
        onClick={handleNearMe}
        disabled={loadingLocation}
        title="Find parks near me"
      >
        <svg 
          width="24" 
          height="24" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="2" x2="12" y2="6"/>
          <line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="6" y2="12"/>
          <line x1="18" y1="12" x2="22" y2="12"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>

      {/* Filter Drawer Backdrop */}
      {filterDrawerOpen && (
        <div 
          className="filter-drawer-backdrop"
          onClick={() => setFilterDrawerOpen(false)}
        />
      )}

      {/* Enhanced Filter Drawer */}
      <div className={`filter-drawer ${filterDrawerOpen ? 'open' : ''}`}>
        <div className="filter-drawer-header">
          <h2>Filters</h2>
          <button 
            className="filter-drawer-close"
            onClick={() => setFilterDrawerOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="filter-drawer-content">
          
          {/* Activities/Amenities Section */}
          <div className="filter-section">
            <button 
              className="filter-section-header"
              onClick={() => setActivitiesExpanded(!activitiesExpanded)}
            >
              <span className="filter-section-title">
                🎯 Amenities
                {Object.values(amenitiesFilters).filter(Boolean).length > 0 && (
                  <span className="filter-count">
                    {' '}({Object.values(amenitiesFilters).filter(Boolean).length})
                  </span>
                )}
              </span>
              <span className="filter-section-arrow">
                {activitiesExpanded ? '▼' : '▶'}
              </span>
            </button>
            {activitiesExpanded && (
              <div className="filter-section-content">
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters.camping}
                    onChange={() => handleAmenityToggle('camping')}
                  />
                  <span>🏕️ Camping</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters.hiking}
                    onChange={() => handleAmenityToggle('hiking')}
                  />
                  <span>🥾 Hiking</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters.fishing}
                    onChange={() => handleAmenityToggle('fishing')}
                  />
                  <span>🎣 Fishing</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters.swimming}
                    onChange={() => handleAmenityToggle('swimming')}
                  />
                  <span>🏊 Swimming</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters.boating}
                    onChange={() => handleAmenityToggle('boating')}
                  />
                  <span>⛵ Boating</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters.picnicking}
                    onChange={() => handleAmenityToggle('picnicking')}
                  />
                  <span>🧺 Picnic Areas</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters.playground}
                    onChange={() => handleAmenityToggle('playground')}
                  />
                  <span>🛝 Playground</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters['visitor center']}
                    onChange={() => handleAmenityToggle('visitor center')}
                  />
                  <span>🏛️ Visitor Center</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={amenitiesFilters.restrooms}
                    onChange={() => handleAmenityToggle('restrooms')}
                  />
                  <span>🚻 Restrooms</span>
                </label>
              </div>
            )}
          </div>

          {/* Land Type Section */}
          <div className="filter-section">
            <button 
              className="filter-section-header"
              onClick={() => setLandTypeExpanded(!landTypeExpanded)}
            >
              <span className="filter-section-title">
                Land Type
                {landTypeFilter !== 'ALL' && (
                  <span className="filter-count"> (1)</span>
                )}
              </span>
              <span className="filter-section-arrow">
                {landTypeExpanded ? '▼' : '▶'}
              </span>
            </button>
            {landTypeExpanded && (
              <div className="filter-section-content">
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={landTypeFilter === 'ALL'}
                    onChange={() => handleLandTypeChange('ALL')}
                  />
                  <span>Show All</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={landTypeFilter === 'FEDERAL'}
                    onChange={() => handleLandTypeChange('FEDERAL')}
                  />
                  <span>Federal Lands Only</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={landTypeFilter === 'STATE'}
                    onChange={() => handleLandTypeChange('STATE')}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: '#4a7c2f'}}></span>
                    State Parks Only
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={landTypeFilter === 'COUNTY'}
                    onChange={() => handleLandTypeChange('COUNTY')}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: '#0891b2'}}></span>
                    County Parks Only
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={landTypeFilter === 'CITY'}
                    onChange={() => handleLandTypeChange('CITY')}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: '#eab308'}}></span>
                    City Parks Only
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Specific Agencies Section */}
          <div className="filter-section">
            <button 
              className="filter-section-header"
              onClick={() => setAgenciesExpanded(!agenciesExpanded)}
            >
              <span className="filter-section-title">
                Federal Agencies
                {Object.values(agencyFilters).filter(Boolean).length > 0 && (
                  <span className="filter-count">
                    {' '}({Object.values(agencyFilters).filter(Boolean).length})
                  </span>
                )}
              </span>
              <span className="filter-section-arrow">
                {agenciesExpanded ? '▼' : '▶'}
              </span>
            </button>
            {agenciesExpanded && (
              <div className="filter-section-content">
                <label className="filter-option">
                  <input 
                    type="checkbox"
                    checked={agencyFilters.NPS}
                    onChange={() => handleAgencyToggle('NPS')}
                    disabled={landTypeFilter === 'STATE' || landTypeFilter === 'COUNTY' || landTypeFilter === 'CITY'}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: '#2563eb'}}></span>
                    National Parks (NPS)
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox"
                    checked={agencyFilters.USFS}
                    onChange={() => handleAgencyToggle('USFS')}
                    disabled={landTypeFilter === 'STATE' || landTypeFilter === 'COUNTY' || landTypeFilter === 'CITY'}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: '#92400e'}}></span>
                    National Forests (USFS)
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox"
                    checked={agencyFilters.FWS}
                    onChange={() => handleAgencyToggle('FWS')}
                    disabled={landTypeFilter === 'STATE' || landTypeFilter === 'COUNTY' || landTypeFilter === 'CITY'}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: '#9333ea'}}></span>
                    Fish & Wildlife (FWS)
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox"
                    checked={agencyFilters.BLM}
                    onChange={() => handleAgencyToggle('BLM')}
                    disabled={landTypeFilter === 'STATE' || landTypeFilter === 'COUNTY' || landTypeFilter === 'CITY'}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: '#ea580c'}}></span>
                    Bureau of Land Management (BLM)
                  </span>
                </label>
              </div>
            )}
          </div>

        </div>

        {/* Clear Filters Button */}
        {getActiveFilterCount() > 0 && (
          <div className="filter-drawer-footer">
            <button 
              className="clear-all-filters"
              onClick={() => {
                setLandTypeFilter('ALL')
                setAgencyFilters({ NPS: false, USFS: false, FWS: false, BLM: false })
                setAmenitiesFilters({
                  camping: false,
                  hiking: false,
                  fishing: false,
                  swimming: false,
                  boating: false,
                  picnicking: false,
                  playground: false,
                  'visitor center': false,
                  'restrooms': false
                })
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Map */}
        <div className="map-container">
          {loading ? (
            <div className="loading">Loading parks...</div>
          ) : (
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%' }}
            >
              <MapController center={mapCenter} zoom={mapZoom} />
              
              {/* Mapbox Tile Layer - Outdoors Style */}
              <TileLayer
                attribution='© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                url={`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}
                tileSize={512}
                zoomOffset={-1}
              />
              
              {displayParks.map((park) => {
                const icon = markerIcons[park.agency] || markerIcons.FEDERAL
                return (
                  <Marker
                    key={park.id}
                    position={[park.latitude, park.longitude]}
                    icon={icon}
                    eventHandlers={{
                      click: () => handleMarkerClick(park)
                    }}
                  >
                    <Popup>
                      <div className="popup-content">
                        <h3>{park.name}</h3>
                        {park.distance && (
                          <p><strong>Distance:</strong> {park.distance.toFixed(1)} miles</p>
                        )}
                        <p><strong>State:</strong> {park.state}</p>
                        <p><strong>Type:</strong> {getAgencyFullName(park.agency)}</p>
                        <button 
                          className="detail-button"
                          onClick={() => handleMarkerClick(park)}
                        >
                          View Details
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          )}
        </div>

        {/* Enhanced Detail Panel */}
        {selectedPark && (
          <div className="detail-panel">
            <button className="close-button" onClick={closeDetailPanel}>
              ✕
            </button>
            
            <div className="detail-content">
              
              {/* Alerts Banner (if any) */}
              {selectedPark.alerts && selectedPark.alerts.length > 0 && (
                <div className="alerts-banner">
                  <div className="alert-icon">⚠️</div>
                  <div className="alert-content">
                    <h3>Important Alerts</h3>
                    {selectedPark.alerts.map((alert, index) => (
                      <div key={index} className="alert-item">
                        <strong>{alert.title}</strong>
                        <p>{alert.description}</p>
                        {alert.url && (
                          <a href={alert.url} target="_blank" rel="noopener noreferrer">
                            More Info →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Park Title */}
              <h2>{selectedPark.name}</h2>
              
              {/* Quick Info Badges */}
              <div className="info-badges">
                {selectedPark.entrance_fees && selectedPark.entrance_fees.length > 0 && (
                  <span className="badge fee-badge">
                    {selectedPark.entrance_fees[0].cost === '0' || selectedPark.entrance_fees[0].cost === '0.00' 
                      ? '🎫 Free Entry' 
                      : `💰 $${selectedPark.entrance_fees[0].cost}`}
                  </span>
                )}
                {selectedPark.distance && (
                  <span className="badge distance-badge">
                    📍 {selectedPark.distance.toFixed(1)} miles away
                  </span>
                )}
              </div>

              {/* Description */}
              {selectedPark.description && (
                <div className="detail-section description-section">
                  <h3>About This Park</h3>
                  <p>{selectedPark.description}</p>
                </div>
              )}

              {/* Operating Hours & Contact */}
              <div className="detail-grid">
                {selectedPark.operating_hours && (
                  <div className="detail-section">
                    <h3>🕐 Hours Today</h3>
                    <p className="hours-today">{getTodaySchedule(selectedPark.operating_hours)}</p>
                  </div>
                )}

                {(selectedPark.phone || selectedPark.email) && (
                  <div className="detail-section">
                    <h3>📞 Contact</h3>
                    {selectedPark.phone && (
                      <p><a href={`tel:${selectedPark.phone}`}>{selectedPark.phone}</a></p>
                    )}
                    {selectedPark.email && (
                      <p><a href={`mailto:${selectedPark.email}`}>{selectedPark.email}</a></p>
                    )}
                  </div>
                )}
              </div>

              {/* Amenities Section */}
              {selectedPark.amenities && selectedPark.amenities.length > 0 && (
                <div className="detail-section">
                  <h3>🏕️ Amenities</h3>
                  <div className="activities-tags">
                    {selectedPark.amenities.map((amenity, index) => (
                      <span key={index} className="activity-tag">{amenity}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Activities */}
              {selectedPark.activities && selectedPark.activities.length > 0 && (
                <div className="detail-section">
                  <h3>🥾 Activities</h3>
                  <div className="activities-tags">
                    {selectedPark.activities.map((activity, index) => (
                      <span key={index} className="activity-tag">{activity}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Location */}
              <div className="detail-section">
                <h3>Location</h3>
                <p><strong>State:</strong> {selectedPark.state}</p>
                {selectedPark.county && (
                  <p><strong>County:</strong> {selectedPark.county}</p>
                )}
                {selectedPark.city && (
                  <p><strong>City:</strong> {selectedPark.city}</p>
                )}
              </div>

              {/* Management */}
              <div className="detail-section">
                <h3>Management</h3>
                <p><strong>Type:</strong> {getAgencyFullName(selectedPark.agency)}</p>
                {selectedPark.agency_full_name && (
                  <p><strong>Managed By:</strong> {selectedPark.agency_full_name}</p>
                )}
              </div>

              {/* Size & Designation */}
              <div className="detail-grid">
                {selectedPark.acres && (
                  <div className="detail-section">
                    <h3>Size</h3>
                    <p>{Math.round(selectedPark.acres).toLocaleString()} acres</p>
                  </div>
                )}

                {selectedPark.designation_type && (
                  <div className="detail-section">
                    <h3>Designation</h3>
                    <p>{selectedPark.designation_type}</p>
                  </div>
                )}
              </div>

              {/* Weather Info */}
              {selectedPark.weather_info && (
                <div className="detail-section">
                  <h3>🌤️ Weather Info</h3>
                  <p>{selectedPark.weather_info}</p>
                </div>
              )}

              {/* Directions Info */}
              {selectedPark.directions_info && (
                <div className="detail-section">
                  <h3>🚗 Getting There</h3>
                  <p>{selectedPark.directions_info}</p>
                </div>
              )}

              {/* Links */}
              <div className="detail-section action-links">
                {selectedPark.website && (
                  <a 
                    href={selectedPark.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="action-button primary"
                  >
                    Visit Official Website →
                  </a>
                )}
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedPark.latitude},${selectedPark.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-button secondary"
                >
                  Get Directions
                </a>
              </div>

              {/* Coordinates (small, at bottom) */}
              <div className="detail-section coordinates-section">
                <p className="coordinates-text">
                  {selectedPark.latitude.toFixed(4)}, {selectedPark.longitude.toFixed(4)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="stats">
        <div className="stats-left">
          <span>Showing {displayParks.length} parks</span>
          {sortByDistance && (
            <span> (sorted by distance)</span>
          )}
        </div>
        <div className="legend">
          <span className="legend-item">
            <span className="legend-dot" style={{backgroundColor: '#4a7c2f'}}></span>
            State
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{backgroundColor: '#0891b2'}}></span>
            County
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{backgroundColor: '#eab308'}}></span>
            City
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{backgroundColor: '#2563eb'}}></span>
            NPS
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{backgroundColor: '#92400e'}}></span>
            USFS
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{backgroundColor: '#ea580c'}}></span>
            BLM
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{backgroundColor: '#9333ea'}}></span>
            FWS
          </span>
        </div>
      </div>
    </div>
  )
}

export default App
