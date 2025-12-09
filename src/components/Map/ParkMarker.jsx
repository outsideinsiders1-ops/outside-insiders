'use client'
// src/components/Map/ParkMarker.jsx
// Mapbox GL JS marker implementation

import React, { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { normalizeAgency, getAgencyFullName } from '../../utils/helpers'
import { config } from '../../config/settings'

const ParkMarker = ({ park, onDetailsClick, map, mapLoaded }) => {
  const markerRef = useRef(null)
  const popupRef = useRef(null)

  useEffect(() => {
    if (!map || !mapLoaded || !park.latitude || !park.longitude) return

    // Create marker element
    const el = document.createElement('div')
    el.className = 'park-marker'
    
    const normalized = normalizeAgency(park.agency)
    const color = config.markerColors[normalized] || config.markerColors.FEDERAL
    
    el.style.cssText = `
      background-color: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      cursor: pointer;
    `

    // Create popup
    const popup = new mapboxgl.Popup({ offset: 25, closeOnClick: false })
      .setHTML(`
        <div class="popup-content">
          <h3>${park.name || 'Unnamed Park'}</h3>
          ${park.distance ? `<p><strong>Distance:</strong> ${park.distance.toFixed(1)} miles</p>` : ''}
          <p><strong>State:</strong> ${park.state || 'N/A'}</p>
          <p><strong>Type:</strong> ${getAgencyFullName(park.agency)}</p>
          <button class="detail-button" data-park-id="${park.id}">View Details</button>
        </div>
      `)

    // Create marker
    const marker = new mapboxgl.Marker(el)
      .setLngLat([park.longitude, park.latitude])
      .setPopup(popup)
      .addTo(map)

    markerRef.current = marker
    popupRef.current = popup

    // Handle popup button click
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      if (onDetailsClick) {
        onDetailsClick(park)
      }
    })

    // Handle popup button click
    popup.getElement().addEventListener('click', (e) => {
      if (e.target.classList.contains('detail-button')) {
        e.stopPropagation()
        if (onDetailsClick) {
          onDetailsClick(park)
          popup.remove()
        }
      }
    })

    // Cleanup
    return () => {
      if (markerRef.current) {
        markerRef.current.remove()
      }
    }
  }, [map, mapLoaded, park, onDetailsClick])

  return null
}

export default ParkMarker
