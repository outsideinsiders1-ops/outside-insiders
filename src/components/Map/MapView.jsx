'use client'

// src/components/Map/MapView.jsx
// Mapbox GL JS implementation

import React, { useEffect, useRef, useState, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Check WebGL support
function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2')
    return !!gl
  } catch (error) {
    console.warn('WebGL check failed:', error)
    return false
  }
}

const MapView = ({ center, zoom, children, onBoundsChange }) => {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const boundsChangeTimer = useRef(null)

  // Ensure we have valid center and zoom - memoize to avoid dependency issues
  const validCenter = useMemo(() => {
    return (center && Array.isArray(center) && center.length === 2) ? center : [35.5, -83.0]
  }, [center])
  
  const validZoom = useMemo(() => {
    return (zoom !== undefined && zoom !== null) ? zoom : 7
  }, [zoom])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    // Check WebGL support
    if (!checkWebGLSupport()) {
      console.error('WebGL not supported. Mapbox GL JS requires WebGL.')
      return
    }

    // Validate token
    if (!MAPBOX_TOKEN) {
      console.error('Mapbox token not found')
      return
    }

    // Initialize map with performance optimizations
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [validCenter[1], validCenter[0]], // Mapbox uses [lng, lat]
      zoom: validZoom,
      accessToken: MAPBOX_TOKEN,
      // Performance optimizations
      renderWorldCopies: false, // Don't render multiple world copies
      maxPitch: 60, // Limit pitch for better performance
      antialias: false, // Disable antialiasing for better performance on low-end devices
    })

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Track viewport changes for viewport-based loading
    const updateBounds = () => {
      if (!map.current || !onBoundsChange) return
      
      const bounds = map.current.getBounds()
      const ne = bounds.getNorthEast()
      const sw = bounds.getSouthWest()
      
      const viewportBounds = {
        north: ne.lat,
        south: sw.lat,
        east: ne.lng,
        west: sw.lng
      }
      
      // Debounce bounds updates to avoid excessive calls
      if (boundsChangeTimer.current) {
        clearTimeout(boundsChangeTimer.current)
      }
      
      boundsChangeTimer.current = setTimeout(() => {
        onBoundsChange(viewportBounds)
      }, 300) // 300ms debounce
    }

    // Handle map load
    map.current.on('load', () => {
      setMapLoaded(true)
      console.log('Mapbox GL map loaded')
      // Get initial bounds
      if (onBoundsChange) {
        updateBounds()
      }
    })

    // Listen to map move/zoom events for viewport-based loading
    if (onBoundsChange) {
      map.current.on('moveend', updateBounds)
      map.current.on('zoomend', updateBounds)
    }

    // Handle errors
    map.current.on('error', (e) => {
      console.error('Mapbox GL error:', e)
    })

    // Cleanup
    return () => {
      if (boundsChangeTimer.current) {
        clearTimeout(boundsChangeTimer.current)
      }
      if (map.current) {
        if (onBoundsChange) {
          map.current.off('moveend', updateBounds)
          map.current.off('zoomend', updateBounds)
        }
        map.current.remove()
        map.current = null
        setMapLoaded(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Update map center and zoom when props change
  useEffect(() => {
    if (map.current && mapLoaded) {
      const currentCenter = map.current.getCenter()
      const currentZoom = map.current.getZoom()
      const newCenter = [validCenter[1], validCenter[0]] // Mapbox uses [lng, lat]
      
      // Only update if center or zoom actually changed
      const centerChanged = Math.abs(currentCenter.lng - newCenter[0]) > 0.0001 || 
                           Math.abs(currentCenter.lat - newCenter[1]) > 0.0001
      const zoomChanged = Math.abs(currentZoom - validZoom) > 0.1
      
      if (centerChanged || zoomChanged) {
        map.current.flyTo({
          center: newCenter,
          zoom: validZoom,
          duration: 1000,
        })
      }
    }
  }, [validCenter, validZoom, mapLoaded])

  // Pass map instance to children via context or cloneElement
  const childrenWithMap = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { map: map.current, mapLoaded })
    }
    return child
  })

  return (
    <div ref={mapContainer} style={{ height: '100%', width: '100%' }}>
      {childrenWithMap}
    </div>
  )
}

export default MapView
