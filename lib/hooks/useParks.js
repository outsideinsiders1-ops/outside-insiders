// src/hooks/useParks.js
// Custom hook for managing park data

import { useState, useEffect, useMemo } from 'react'
import { fetchParks } from '../utils/supabase'
import { calculateDistance } from '../utils/helpers'

export function useParks() {
  const [parks, setParks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    landType: 'ALL',
    agencies: [],
    amenities: [],
  })
  const [userLocation, setUserLocation] = useState(null)
  const [sortByDistance, setSortByDistance] = useState(false)

  // Load parks when filters change
  useEffect(() => {
    loadParks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  async function loadParks() {
    setLoading(true)
    setError(null)
    
    try {
      const data = await fetchParks()
      
      // Apply client-side filters
      let filtered = data
      
      // Filter by land type
      if (filters.landType === 'STATE') {
        filtered = filtered.filter(park => 
          park.agency && park.agency.toLowerCase().includes('state')
        )
      } else if (filters.landType === 'COUNTY') {
        filtered = filtered.filter(park => 
          park.agency && park.agency.toLowerCase().includes('county')
        )
      } else if (filters.landType === 'CITY') {
        filtered = filtered.filter(park => 
          park.agency && (
            park.agency.toLowerCase().includes('city') ||
            park.agency.toLowerCase().includes('municipal') ||
            park.agency.toLowerCase().includes('town')
          )
        )
      } else if (filters.landType === 'FEDERAL') {
        filtered = filtered.filter(park => 
          ['NPS', 'USFS', 'BLM', 'FWS'].includes(park.agency)
        )
      }
      
      // Filter by specific agencies
      if (filters.agencies.length > 0) {
        filtered = filtered.filter(park => 
          filters.agencies.includes(park.agency)
        )
      }
      
      // Filter by amenities
      if (filters.amenities.length > 0) {
        filtered = filtered.filter(park => {
          if (!park.amenities || park.amenities.length === 0) return false
          
          return filters.amenities.every(amenity => 
            park.amenities.some(parkAmenity => 
              parkAmenity.toLowerCase().includes(amenity.toLowerCase())
            )
          )
        })
      }
      
      setParks(filtered)
    } catch (err) {
      setError(err.message)
      console.error('Error loading parks:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate distances and sort
  const displayParks = useMemo(() => {
    let result = parks
    
    // Add distances if we have user location
    if (userLocation) {
      result = parks.map(park => ({
        ...park,
        distance: calculateDistance(
          userLocation.lat,
          userLocation.lon,
          park.latitude,
          park.longitude
        )
      }))
    }
    
    // Sort by distance if requested
    if (sortByDistance && userLocation) {
      result = [...result].sort((a, b) => 
        (a.distance || Infinity) - (b.distance || Infinity)
      )
    }
    
    return result
  }, [parks, userLocation, sortByDistance])

  return {
    parks: displayParks,
    loading,
    error,
    filters,
    setFilters,
    userLocation,
    setUserLocation,
    sortByDistance,
    setSortByDistance,
    refetch: loadParks,
  }
}

export default useParks
