'use client'

// src/components/Map/MapView.jsx
import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Component to update map view when center/zoom changes
function MapUpdater({ center, zoom }) {
  const map = useMap()
  
  useEffect(() => {
    if (center && Array.isArray(center) && center.length === 2 && zoom !== undefined) {
      map.setView(center, zoom)
    }
  }, [center, zoom, map])
  
  return null
}

// Check WebGL support (improved for mobile browsers)
function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2')
    
    if (!gl) {
      return false
    }
    
    // Additional check: verify WebGL is actually functional
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (debugInfo) {
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      console.log('WebGL Info:', { vendor, renderer })
    }
    
    return true
  } catch (error) {
    console.warn('WebGL check failed:', error)
    return false
  }
}

// Check if device is mobile
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (typeof window !== 'undefined' && window.innerWidth < 768)
}

const MapView = ({ center, zoom, children }) => {
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const [useMapbox, setUseMapbox] = useState(true)
  const [mapboxError, setMapboxError] = useState(false)

  // Validate Mapbox token on mount
  useEffect(() => {
    // Check if mobile device
    const mobile = isMobileDevice()
    
    // Check WebGL support
    const hasWebGL = checkWebGLSupport()
    if (!hasWebGL) {
      console.warn('WebGL not supported - falling back to OpenStreetMap')
      setUseMapbox(false)
      return
    }

    // Validate token
    if (!MAPBOX_TOKEN) {
      console.warn('Mapbox token not found - using OpenStreetMap fallback')
      setUseMapbox(false)
      return
    }

    // Check token format (Mapbox tokens start with 'pk.')
    if (!MAPBOX_TOKEN.startsWith('pk.')) {
      console.warn('Invalid Mapbox token format - should start with "pk." - using OpenStreetMap fallback')
      setUseMapbox(false)
      return
    }

    // Note: Leaflet with Mapbox tiles works on mobile, but Mapbox GL JS requires WebGL
    // For now, we're using Leaflet with Mapbox tiles, which should work on mobile
    console.log(`Mapbox token validated, WebGL supported - using Mapbox tiles${mobile ? ' (mobile device)' : ''}`)
  }, [MAPBOX_TOKEN])

  // Ensure we have valid center and zoom
  const validCenter = (center && Array.isArray(center) && center.length === 2) ? center : [35.5, -83.0]
  const validZoom = (zoom !== undefined && zoom !== null) ? zoom : 7

  // Determine which tile source to use
  const shouldUseMapbox = useMapbox && MAPBOX_TOKEN && !mapboxError
  const tileUrl = shouldUseMapbox
    ? `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const handleTileError = (error) => {
    console.error('Tile loading error:', error)
    if (shouldUseMapbox && !mapboxError) {
      console.warn('Mapbox tile failed - switching to OpenStreetMap')
      setMapboxError(true)
      setUseMapbox(false)
    }
  }

  const handleTileLoad = () => {
    if (shouldUseMapbox) {
      console.log('Mapbox tile loaded successfully')
    }
  }

  return (
    <MapContainer
      center={validCenter}
      zoom={validZoom}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      key="main-map"
    >
      <TileLayer
        attribution={shouldUseMapbox
          ? '© <a href="https://www.mapbox.com/">Mapbox</a>'
          : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
        url={tileUrl}
        tileSize={256}
        zoomOffset={0}
        errorTileUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        eventHandlers={{
          tileerror: handleTileError,
          tileload: handleTileLoad
        }}
      />
      <MapUpdater center={validCenter} zoom={validZoom} />
      {children}
    </MapContainer>
  )
}

export default MapView
