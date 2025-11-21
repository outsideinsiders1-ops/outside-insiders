'use client'

// src/components/Map/MapView.jsx
import React, { useEffect } from 'react'
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

const MapView = ({ center, zoom, children }) => {
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Ensure we have valid center and zoom
  const validCenter = (center && Array.isArray(center) && center.length === 2) ? center : [35.5, -83.0]
  const validZoom = (zoom !== undefined && zoom !== null) ? zoom : 7

  return (
    <MapContainer
      center={validCenter}
      zoom={validZoom}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      key="main-map"
    >
      <TileLayer
        attribution={MAPBOX_TOKEN 
          ? '© <a href="https://www.mapbox.com/">Mapbox</a>'
          : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
        url={MAPBOX_TOKEN 
          ? `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        }
        tileSize={256}
        zoomOffset={0}
        errorTileUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        eventHandlers={{
          tileerror: (error) => {
            console.error('Tile loading error:', error)
          }
        }}
      />
      <MapUpdater center={validCenter} zoom={validZoom} />
      {children}
    </MapContainer>
  )
}

export default MapView
