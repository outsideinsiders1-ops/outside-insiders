'use client'
// src/components/Map/ParkBoundary.jsx
// Shows park boundary polygon on the map

import React from 'react'
import { Polygon } from 'react-leaflet'

const ParkBoundary = ({ boundary, visible = true }) => {
  if (!boundary || !visible) return null
  
  return (
    <Polygon
      positions={boundary}
      pathOptions={{
        color: '#4a7c2f',
        weight: 3,
        opacity: 0.8,
        fillColor: '#4a7c2f',
        fillOpacity: 0.2
      }}
    />
  )
}

export default ParkBoundary
