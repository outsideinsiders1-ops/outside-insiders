'use client'
// src/components/Map/ParkMarker.jsx
// Individual park marker component

import React, { useRef, useEffect } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { normalizeAgency, getAgencyFullName } from '../../utils/helpers'
import { config } from '../../config/settings'

// Create custom icon based on park type
function createIcon(agency) {
  const normalized = normalizeAgency(agency)
  const color = config.markerColors[normalized] || config.markerColors.FEDERAL
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10]
  })
}

const ParkMarker = ({ park, onDetailsClick }) => {
  const icon = createIcon(park.agency)
  const markerRef = useRef(null)
  
  useEffect(() => {
    if (markerRef.current) {
      const marker = markerRef.current
      marker.on('popupopen', () => {
        // Store reference to popup for closing
        marker._popup = marker.getPopup()
      })
    }
  }, [])
  
  const handleViewDetails = (e) => {
    e.stopPropagation()
    
    // Close the popup if it's open
    if (markerRef.current) {
      const marker = markerRef.current
      if (marker.isPopupOpen()) {
        marker.closePopup()
      }
    }
    
    // Open detail panel
    onDetailsClick(park)
  }
  
  return (
    <Marker
      ref={markerRef}
      position={[park.latitude, park.longitude]}
      icon={icon}
    >
      <Popup>
        <div className="popup-content">
          <h3>{park.name}</h3>
          
          {park.distance && (
            <p>
              <strong>Distance:</strong> {park.distance.toFixed(1)} miles
            </p>
          )}
          
          <p>
            <strong>State:</strong> {park.state}
          </p>
          
          <p>
            <strong>Type:</strong> {getAgencyFullName(park.agency)}
          </p>
          
          <button 
            className="detail-button"
            onClick={handleViewDetails}
          >
            View Details
          </button>
        </div>
      </Popup>
    </Marker>
  )
}

export default ParkMarker
