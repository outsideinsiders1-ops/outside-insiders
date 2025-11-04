// src/pages/HomePage.jsx
// Main home page that brings all components together

import React, { useState, useCallback } from 'react'
import { useParks } from '../hooks/useParks'
import { config } from '../config/settings'
import MapView from '../components/Map/MapView'
import ParkMarker from '../components/Map/ParkMarker'
import ParkBoundary from '../components/Map/ParkBoundary'
import Header from '../components/Layout/Header'
import StatsFooter from '../components/Layout/StatsFooter'
import ParkSearch from '../components/Parks/ParkSearch'
import NearMeButton from '../components/Parks/NearMeButton'
import FilterButton from '../components/Parks/FilterButton'
import FilterDrawer from '../components/Parks/FilterDrawer'
import ParkDetail from '../components/Parks/ParkDetail'

const HomePage = () => {
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
  const [showBoundary, setShowBoundary] = useState(true)

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
  }, [])

  // Handle park detail close
  const handleDetailClose = useCallback(() => {
    setSelectedPark(null)
    setParkBoundary(null)
    setMapZoom(userLocation ? config.map.nearMeZoom : config.map.defaultZoom)
  }, [userLocation])

  // Handle boundary toggle from detail panel
  const handleBoundaryToggle = useCallback((boundary, show) => {
    setParkBoundary(boundary)
    setShowBoundary(show)
  }, [])

  // Calculate active filter count
  const getActiveFilterCount = () => {
    let count = 0
    if (filters.landType !== 'ALL') count++
    count += filters.agencies.length
    count += filters.amenities.length
    return count
  }

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN

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
            
            {parkBoundary && showBoundary && selectedPark && (
              <ParkBoundary 
                boundary={parkBoundary}
                visible={showBoundary}
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

export default HomePage
