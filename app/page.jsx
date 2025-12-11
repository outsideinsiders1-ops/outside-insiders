'use client'

// Main home page that brings all components together
import React, { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useParks } from '../lib/hooks/useParks'
import { config } from '../lib/config/settings'
import Header from '../src/components/Layout/Header'
import StatsFooter from '../src/components/Layout/StatsFooter'
import ParkSearch from '../src/components/Parks/ParkSearch'
import NearMeButton from '../src/components/Parks/NearMeButton'
import FilterButton from '../src/components/Parks/FilterButton'
import FilterDrawer from '../src/components/Parks/FilterDrawer'
import ParkDetail from '../src/components/Parks/ParkDetail'

// Dynamically import map components to avoid SSR issues with Mapbox GL
const MapView = dynamic(() => import('../src/components/Map/MapView'), { ssr: false })
const ParkBoundary = dynamic(() => import('../src/components/Map/ParkBoundary'), { ssr: false })
const MarkerClusterGroup = dynamic(() => import('../src/components/Map/MarkerClusterGroup'), { ssr: false })

export default function HomePage() {
  const [viewportBounds, setViewportBounds] = useState(null)
  
  const {
    parks,
    loading,
    loadingMore,
    error,
    filters,
    setFilters,
    userLocation,
    setUserLocation,
    sortByDistance,
    setSortByDistance,
  } = useParks(viewportBounds)

  const [mapCenter, setMapCenter] = useState(config.map.defaultCenter)
  const [mapZoom, setMapZoom] = useState(config.map.defaultZoom)
  const [selectedPark, setSelectedPark] = useState(null)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [parkBoundary, setParkBoundary] = useState(null)
  // Boundary auto-shows when park is selected (no toggle state needed)

  // Handle viewport bounds change from map
  const handleBoundsChange = useCallback((bounds) => {
    setViewportBounds(bounds)
  }, [])

  // Handle location found from search or near me
  const handleLocationFound = useCallback((location) => {
    setUserLocation(location)
    setMapCenter([location.lat, location.lon])
    setMapZoom(config.map.nearMeZoom)
    setSortByDistance(true)
  }, [setUserLocation, setSortByDistance])

  // Handle park marker click - fetch full park details
  const handleParkClick = useCallback(async (park) => {
    // Set basic park info immediately for responsive UI
    setSelectedPark(park)
    setMapCenter([park.latitude, park.longitude])
    setMapZoom(config.map.detailZoom)
    
    // Always fetch full park details from server (including all fields, geometry, etc.)
    try {
      console.log('Fetching full park details for:', park.id, park.name)
      const response = await fetch(`/api/parks/${park.id}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.park) {
          console.log('Full park data received:', {
            id: data.park.id,
            name: data.park.name,
            hasDescription: !!data.park.description,
            hasPhone: !!data.park.phone,
            hasEmail: !!data.park.email,
            hasAmenities: !!data.park.amenities,
            hasActivities: !!data.park.activities,
            hasGeometry: !!data.park.geometry,
            fields: Object.keys(data.park)
          })
          // Update with full park details - this has ALL fields
          setSelectedPark(data.park)
        } else {
          console.warn('Park detail API returned no data:', data)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to fetch full park details:', response.status, errorData.message || response.statusText)
        // Keep basic park info if fetch fails
      }
    } catch (error) {
      console.error('Error fetching park details:', error)
      // Continue with basic park info if fetch fails
    }
    // Boundary will auto-load and display via ParkDetail component
  }, [])

  // Handle park detail close
  const handleDetailClose = useCallback(() => {
    setSelectedPark(null)
    setParkBoundary(null)
    setMapZoom(userLocation ? config.map.nearMeZoom : config.map.defaultZoom)
  }, [userLocation])

  // Handle boundary display from detail panel (auto-show when park is clicked)
  const handleBoundaryToggle = useCallback((boundary) => {
    setParkBoundary(boundary)
  }, [])

  // Calculate active filter count
  const getActiveFilterCount = () => {
    let count = 0
    if (filters.landType !== 'ALL') count++
    count += filters.agencies.length
    count += filters.amenities.length
    return count
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Only show full loading screen on initial load
  if (loading && parks.length === 0) {
    return (
      <div className="app">
        <Header />
        <div className="loading">Loading parks...</div>
      </div>
    )
  }

  if (error && parks.length === 0) {
    return (
      <div className="app">
        <Header />
        <div className="error">Error loading parks: {error}</div>
      </div>
    )
  }

  return (
    <div className="app">
      <Header />
      
      <ParkSearch 
        onLocationFound={handleLocationFound}
        mapboxToken={mapboxToken}
      />
      
      <FilterButton 
        onClick={() => setFilterDrawerOpen(true)}
        activeFilterCount={getActiveFilterCount()}
      />
      
      <NearMeButton 
        onLocationFound={handleLocationFound}
      />
      
      <FilterDrawer 
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
      />
      
      <div className="main-content">
        <div className="map-container" style={{ position: 'relative' }}>
          {loadingMore && parks.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'rgba(255, 255, 255, 0.9)',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '0.9rem',
              zIndex: 1000,
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              Loading more parks...
            </div>
          )}
          <MapView 
            center={mapCenter} 
            zoom={mapZoom}
            onBoundsChange={handleBoundsChange}
          >
            <MarkerClusterGroup
              parks={parks}
              onMarkerClick={handleParkClick}
            />
            
            {parkBoundary && selectedPark && (
              <ParkBoundary 
                boundary={parkBoundary}
                parkName={selectedPark.name}
              />
            )}
          </MapView>
        </div>
        
        {selectedPark && (
          <ParkDetail 
            park={selectedPark}
            onClose={handleDetailClose}
            onBoundaryToggle={handleBoundaryToggle}
          />
        )}
      </div>
      
      <StatsFooter 
        parkCount={parks.length}
        sortedByDistance={sortByDistance}
      />
    </div>
  )
}

