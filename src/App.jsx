import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import L from 'leaflet'

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Custom marker icons by agency - Simple circle markers that always work
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
  STATE: createCustomIcon('#4a7c2f'),    // Green
  NPS: createCustomIcon('#2563eb'),      // Blue
  USFS: createCustomIcon('#92400e'),     // Brown
  BLM: createCustomIcon('#ea580c'),      // Orange
  FWS: createCustomIcon('#9333ea'),      // Purple - THIS ONE!
  FEDERAL: createCustomIcon('#6b7280')   // Gray
}

console.log('Marker icons created:', Object.keys(markerIcons))

// Component to handle map centering when a park is selected
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
  const [filter, setFilter] = useState('ALL')
  const [selectedPark, setSelectedPark] = useState(null)
  const [mapCenter, setMapCenter] = useState([35.5, -83.0])
  const [mapZoom, setMapZoom] = useState(7)

  // Fetch parks from Supabase
  useEffect(() => {
    fetchParks()
  }, [filter])

  const fetchParks = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('parks')
        .select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      // Apply filter
      if (filter === 'FEDERAL') {
        query = query.in('agency', ['NPS', 'USFS', 'BLM', 'FWS'])
      } else if (filter === 'STATE') {
        query = query.eq('agency', 'STATE')
      } else if (filter !== 'ALL') {
        query = query.eq('agency', filter)
      }

      const { data, error } = await query

      if (error) throw error

      console.log(`Loaded ${data.length} parks`)
      console.log('Agencies in data:', [...new Set(data.map(p => p.agency))].sort())
      console.log('FWS parks:', data.filter(p => p.agency === 'FWS').length)
      setParks(data)
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
    setMapZoom(7)
  }

  const getAgencyFullName = (agency) => {
    const names = {
      STATE: 'State Park',
      NPS: 'National Park Service',
      USFS: 'U.S. Forest Service',
      BLM: 'Bureau of Land Management',
      FWS: 'Fish & Wildlife Service',
      FEDERAL: 'Federal Land'
    }
    return names[agency] || agency
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

      {/* Filters */}
      <div className="filters">
        <button 
          className={filter === 'ALL' ? 'active' : ''} 
          onClick={() => setFilter('ALL')}
        >
          All Parks ({parks.length})
        </button>
        <button 
          className={filter === 'FEDERAL' ? 'active' : ''} 
          onClick={() => setFilter('FEDERAL')}
        >
          Federal Lands
        </button>
        <button 
          className={filter === 'STATE' ? 'active' : ''} 
          onClick={() => setFilter('STATE')}
        >
          State Parks
        </button>
        <button 
          className={filter === 'NPS' ? 'active' : ''} 
          onClick={() => setFilter('NPS')}
        >
          National Parks
        </button>
        <button 
          className={filter === 'USFS' ? 'active' : ''} 
          onClick={() => setFilter('USFS')}
        >
          National Forests
        </button>
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
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {parks.map((park) => {
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
                        <p><strong>State:</strong> {park.state}</p>
                        <p><strong>Agency:</strong> {getAgencyFullName(park.agency)}</p>
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

        {/* Detail Panel */}
        {selectedPark && (
          <div className="detail-panel">
            <button className="close-button" onClick={closeDetailPanel}>
              ✕
            </button>
            
            <div className="detail-content">
              <h2>{selectedPark.name}</h2>
              
              <div className="detail-section">
                <h3>Location</h3>
                <p><strong>State:</strong> {selectedPark.state}</p>
                {selectedPark.county && (
                  <p><strong>County:</strong> {selectedPark.county}</p>
                )}
                {selectedPark.address && (
                  <p><strong>Address:</strong> {selectedPark.address}</p>
                )}
              </div>

              <div className="detail-section">
                <h3>Management</h3>
                <p><strong>Agency:</strong> {getAgencyFullName(selectedPark.agency)}</p>
                {selectedPark.agency_full_name && (
                  <p><strong>Managed By:</strong> {selectedPark.agency_full_name}</p>
                )}
              </div>

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

              {selectedPark.category && (
                <div className="detail-section">
                  <h3>Category</h3>
                  <p>{selectedPark.category}</p>
                </div>
              )}

              {selectedPark.public_access && (
                <div className="detail-section">
                  <h3>Public Access</h3>
                  <p>{selectedPark.public_access === 'OA' ? 'Open Access' : selectedPark.public_access}</p>
                </div>
              )}

              {selectedPark.website && (
                <div className="detail-section">
                  <a 
                    href={selectedPark.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="website-link"
                  >
                    Visit Official Website →
                  </a>
                </div>
              )}

              <div className="detail-section coordinates">
                <h3>Coordinates</h3>
                <p>{selectedPark.latitude.toFixed(4)}, {selectedPark.longitude.toFixed(4)}</p>
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedPark.latitude},${selectedPark.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="directions-link"
                >
                  Get Directions
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="stats">
        <div className="stats-left">
          <span>Showing {parks.length} parks</span>
          {filter !== 'ALL' && (
            <button className="clear-filter" onClick={() => setFilter('ALL')}>
              Clear Filter
            </button>
          )}
        </div>
        <div className="legend">
          <span className="legend-item">
            <span className="legend-dot" style={{backgroundColor: '#4a7c2f'}}></span>
            State Parks
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