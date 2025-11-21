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

// Dynamically import map components to avoid SSR issues with Leaflet
const MapView = dynamic(() => import('../src/components/Map/MapView'), { ssr: false })
const ParkMarker = dynamic(() => import('../src/components/Map/ParkMarker'), { ssr: false })
const ParkBoundary = dynamic(() => import('../src/components/Map/ParkBoundary'), { ssr: false })

export default function HomePage() {
  const {
    parks,
    loading,
    error,
    filters,
    setFilters,
    userLocation,
    setUserLocation,
    sortByDistance,
    setSortByDistance,
  } = useParks()

  const [mapCenter, setMapCenter] = useState(config.map.defaultCenter)
  const [mapZoom, setMapZoom] = useState(config.map.defaultZoom)
  const [selectedPark, setSelectedPark] = useState(null)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [parkBoundary, setParkBoundary] = useState(null)
  // Boundary auto-shows when park is selected (no toggle state needed)

  // Handle location found from search or near me
  const handleLocationFound = useCallback((location) => {
    setUserLocation(location)
    setMapCenter([location.lat, location.lon])
    setMapZoom(config.map.nearMeZoom)
    setSortByDistance(true)
  }, [setUserLocation, setSortByDistance])

  // Handle park marker click
  const handleParkClick = useCallback((park) => {
    setSelectedPark(park)
    setMapCenter([park.latitude, park.longitude])
    setMapZoom(config.map.detailZoom)
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

  if (loading) {
    return (
      <div className="app">
        <Header />
        <div className="loading">Loading parks...</div>
      </div>
    )
  }

  if (error) {
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
        <div className="map-container">
          <MapView 
            center={mapCenter} 
            zoom={mapZoom}
          >
            {parks.map(park => (
              <ParkMarker 
                key={park.id}
                park={park}
                onDetailsClick={handleParkClick}
              />
            ))}
            
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

