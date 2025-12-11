// lib/hooks/useParks.js
// Custom hook for managing park data with viewport-based loading (server-side)

import { useState, useEffect, useMemo, useRef } from 'react'
import { calculateDistance } from '../../src/utils/helpers.js'

// Client-side cache for parks (complements server-side caching)
const clientCache = new Map()
const CLIENT_CACHE_TTL = 2 * 60 * 1000 // 2 minutes (shorter than server cache)

function getClientCacheKey(bounds, filters) {
  if (!bounds) return `all_${JSON.stringify(filters)}`
  const rounded = {
    north: Math.floor(bounds.north * 10) / 10,
    south: Math.floor(bounds.south * 10) / 10,
    east: Math.floor(bounds.east * 10) / 10,
    west: Math.floor(bounds.west * 10) / 10
  }
  return `${JSON.stringify(rounded)}_${JSON.stringify(filters)}`
}

function getCachedParks(cacheKey) {
  const cached = clientCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedParks(cacheKey, data) {
  clientCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  })
  // Limit cache size
  if (clientCache.size > 50) {
    const firstKey = clientCache.keys().next().value
    clientCache.delete(firstKey)
  }
}

/**
 * Fetch parks from server-side API
 */
async function fetchParksFromAPI(bounds, filters) {
  const params = new URLSearchParams()
  
  if (bounds) {
    params.set('bounds', JSON.stringify(bounds))
  }
  if (filters && Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters))
  }

  const response = await fetch(`/api/parks?${params.toString()}`)
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch parks' }))
    throw new Error(error.message || error.error || 'Failed to fetch parks')
  }

  const data = await response.json()
  return data.parks || []
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
    const debounceTime = isViewportChange ? 800 : 0 // Longer debounce for viewport changes (increased to 800ms to reduce flickering)

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
        const cacheKey = getClientCacheKey(viewportBounds, filters)
        
        // Check client cache first
        const cached = getCachedParks(cacheKey)
        if (cached) {
          console.log('Using client-cached parks for viewport')
          data = cached
        } else {
          // Only fetch if bounds actually changed significantly (0.3 degree threshold - increased to reduce flickering)
          const boundsChanged = !lastBoundsRef.current || 
            Math.abs(lastBoundsRef.current.north - viewportBounds.north) > 0.3 ||
            Math.abs(lastBoundsRef.current.south - viewportBounds.south) > 0.3 ||
            Math.abs(lastBoundsRef.current.east - viewportBounds.east) > 0.3 ||
            Math.abs(lastBoundsRef.current.west - viewportBounds.west) > 0.3
          
          if (boundsChanged) {
            console.log('Fetching parks from server for viewport:', viewportBounds)
            data = await fetchParksFromAPI(viewportBounds, filters)
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
        console.log('Loading all parks from server (no viewport bounds)')
        data = await fetchParksFromAPI(null, filters)
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
