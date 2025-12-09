'use client'
// src/components/Map/ParkBoundary.jsx
// Mapbox GL JS boundary implementation

import React, { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

const ParkBoundary = ({ boundary, parkName, map, mapLoaded, visible = true }) => {
  const sourceId = 'park-boundary-source'
  const layerId = 'park-boundary-layer'

  useEffect(() => {
    if (!map || !mapLoaded || !boundary || !visible) return

    // Convert boundary to GeoJSON format
    let geojson = null
    
    if (Array.isArray(boundary) && boundary.length > 0) {
      // If boundary is array of coordinates
      if (Array.isArray(boundary[0]) && Array.isArray(boundary[0][0])) {
        // MultiPolygon or Polygon coordinates
        geojson = {
          type: 'Feature',
          properties: { name: parkName },
          geometry: {
            type: 'Polygon',
            coordinates: boundary
          }
        }
      } else if (typeof boundary === 'object' && boundary.type) {
        // Already GeoJSON
        geojson = boundary
      }
    }

    if (!geojson) return

    // Add source if it doesn't exist
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson
      })
    } else {
      // Update existing source
      map.getSource(sourceId).setData(geojson)
    }

    // Add layer if it doesn't exist
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#4a7c2f',
          'fill-opacity': 0.2
        }
      })

      // Add outline
      map.addLayer({
        id: `${layerId}-outline`,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#4a7c2f',
          'line-width': 3,
          'line-opacity': 0.8
        }
      })
    }

    // Cleanup
    return () => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId)
      }
      if (map.getLayer(`${layerId}-outline`)) {
        map.removeLayer(`${layerId}-outline`)
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId)
      }
    }
  }, [map, mapLoaded, boundary, parkName, visible])

  return null
}

export default ParkBoundary
