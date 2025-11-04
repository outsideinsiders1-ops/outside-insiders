// src/components/Parks/ParkSearch.jsx
// Location search component

import React, { useState } from 'react'

const ParkSearch = ({ onLocationFound, mapboxToken }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setSearchLoading(true)
    setSearchError(null)

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${mapboxToken}&country=us&limit=1`
      )

      const data = await response.json()

      if (data.features && data.features.length > 0) {
        const [lon, lat] = data.features[0].center
        const placeName = data.features[0].place_name

        // Call parent callback with location
        onLocationFound({ lat, lon, name: placeName })
        
        setSearchError(null)
        console.log(`Found location: ${placeName}`)
      } else {
        setSearchError('Location not found. Try "City, State" format.')
      }
    } catch (error) {
      console.error('Geocoding error:', error)
      setSearchError('Error searching location. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchError(null)
  }

  return (
    <div className="search-container">
      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-wrapper">
          <svg 
            className="search-icon" 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search location (e.g., Asheville, NC)"
            className="search-input"
            disabled={searchLoading}
          />
          
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="search-clear"
            >
              ✕
            </button>
          )}
        </div>
        
        <button 
          type="submit" 
          className="search-button"
          disabled={searchLoading || !searchQuery.trim()}
        >
          {searchLoading ? '🔍...' : 'Search'}
        </button>
      </form>
      
      {searchError && (
        <div className="search-error">
          {searchError}
        </div>
      )}
    </div>
  )
}

export default ParkSearch
