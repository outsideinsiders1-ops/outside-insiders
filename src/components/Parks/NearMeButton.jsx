// src/components/Parks/NearMeButton.jsx
// Near me location button

import React, { useState } from 'react'

const NearMeButton = ({ onLocationFound }) => {
  const [loading, setLoading] = useState(false)

  const handleNearMe = () => {
    if ('geolocation' in navigator) {
      setLoading(true)
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude
          const userLon = position.coords.longitude
          
          onLocationFound({ 
            lat: userLat, 
            lon: userLon,
            isUserLocation: true 
          })
          
          setLoading(false)
        },
        (error) => {
          console.log('Location access denied or unavailable')
          alert('Could not get your location. Please enable location services.')
          setLoading(false)
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 300000 // 5 minutes
        }
      )
    } else {
      alert('Geolocation is not supported by your browser')
    }
  }

  return (
    <button 
      className="near-me-button"
      onClick={handleNearMe}
      disabled={loading}
      title="Find parks near me"
    >
      <svg 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="2" x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="6" y2="12"/>
        <line x1="18" y1="12" x2="22" y2="12"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    </button>
  )
}

export default NearMeButton
