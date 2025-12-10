// lib/hooks/useParks.js
// Custom hook for managing park data with viewport-based loading

import { useState, useEffect, useMemo, useRef } from 'react'
import { fetchParks, fetchParksByBounds } from '../../src/utils/supabase.js'
import { calculateDistance } from '../../src/utils/helpers.js'

// Simple cache to avoid re-fetching same viewport areas
const viewportCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCacheKey(bounds) {
  if (!bounds) return 'all'
  // Round bounds to ~0.1 degree for caching (reduces cache misses from tiny movements)
  return `${Math.floor(bounds.north * 10) / 10}_${Math.floor(bounds.south * 10) / 10}_${Math.floor(bounds.east * 10) / 10}_${Math.floor(bounds.west * 10) / 10}`
}

function getCachedParks(cacheKey) {
  const cached = viewportCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedParks(cacheKey, data) {
  viewportCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  })
  // Limit cache size to prevent memory issues
  if (viewportCache.size > 50) {
    const firstKey = viewportCache.keys().next().value
    viewportCache.delete(firstKey)
  }
}

export function useParks(viewportBounds = null) {
  const [parks, setParks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false) // Separate state for viewport loading
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    landType: 'ALL',
    agencies: [],
    amenities: [],
  })
  const [userLocation, setUserLocation] = useState(null)
  const [sortByDistance, setSortByDistance] = useState(false)
  const debounceTimer = useRef(null)
  const lastBoundsRef = useRef(null)
  const isInitialLoad = useRef(true)

  // Load parks when filters or viewport changes
  useEffect(() => {
    // Debounce viewport changes to avoid excessive API calls during panning
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    // For viewport changes, use longer debounce and don't show loading state
    // For filter changes or initial load, load immediately
    const isViewportChange = viewportBounds && lastBoundsRef.current
    const debounceTime = isViewportChange ? 500 : 0 // Longer debounce for viewport changes

    debounceTimer.current = setTimeout(() => {
      loadParks(isViewportChange)
    }, debounceTime)

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, viewportBounds])

  async function loadParks(isViewportChange = false) {
    // Only show main loading state on initial load or filter changes
    if (!isViewportChange) {
      setLoading(true)
    } else {
      // For viewport changes, show subtle loading indicator but keep existing parks visible
      setLoadingMore(true)
    }
    setError(null)
    
    try {
      let data = []
      
      // Use viewport-based loading if bounds provided
      if (viewportBounds && viewportBounds.north && viewportBounds.south && 
          viewportBounds.east && viewportBounds.west) {
        const cacheKey = getCacheKey(viewportBounds)
        
        // Check cache first
        const cached = getCachedParks(cacheKey)
        if (cached) {
          console.log('Using cached parks for viewport')
          data = cached
        } else {
          // Only fetch if bounds actually changed significantly (0.2 degree threshold for smoother experience)
          const boundsChanged = !lastBoundsRef.current || 
            Math.abs(lastBoundsRef.current.north - viewportBounds.north) > 0.2 ||
            Math.abs(lastBoundsRef.current.south - viewportBounds.south) > 0.2 ||
            Math.abs(lastBoundsRef.current.east - viewportBounds.east) > 0.2 ||
            Math.abs(lastBoundsRef.current.west - viewportBounds.west) > 0.2
          
          if (boundsChanged) {
            console.log('Fetching parks for viewport:', viewportBounds)
            data = await fetchParksByBounds(viewportBounds, filters)
            setCachedParks(cacheKey, data)
            lastBoundsRef.current = viewportBounds
          } else {
            // Use cached data if bounds haven't changed much
            const cached = getCachedParks(cacheKey)
            data = cached || []
          }
        }
      } else {
        // Fallback to loading all parks (for initial load or when viewport not available)
        console.log('Loading all parks (no viewport bounds)')
        data = await fetchParks(filters)
      }
      
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
      
      // For viewport changes, merge with existing parks instead of replacing
      if (isViewportChange && parks.length > 0) {
        // Merge new parks with existing, avoiding duplicates
        const existingIds = new Set(parks.map(p => p.id))
        const newParks = filtered.filter(p => !existingIds.has(p.id))
        setParks([...parks, ...newParks])
      } else {
        // For initial load or filter changes, replace parks
        setParks(filtered)
      }
      
      isInitialLoad.current = false
    } catch (err) {
      setError(err.message)
      console.error('Error loading parks:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
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
    loadingMore, // Separate loading state for viewport changes
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
