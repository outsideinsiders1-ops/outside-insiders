'use client'
// src/components/Parks/ParkDetail.jsx
// Park detail panel component

import React, { useState, useEffect } from 'react'
import { fetchParkBoundary } from '../../utils/supabase'
import { getAgencyFullName, getTodaySchedule } from '../../utils/helpers'

const ParkDetail = ({ park, onClose, onBoundaryToggle }) => {
  const [boundary, setBoundary] = useState(null)
  const [showBoundary, setShowBoundary] = useState(true)
  const [boundaryLoading, setBoundaryLoading] = useState(false)

  useEffect(() => {
    if (park) {
      loadBoundary()
    }
  }, [park])

  const loadBoundary = async () => {
    setBoundaryLoading(true)
    try {
      const boundaryData = await fetchParkBoundary(park.id)
      setBoundary(boundaryData)
      if (onBoundaryToggle && boundaryData) {
        onBoundaryToggle(boundaryData, true)
      }
    } catch (err) {
      console.error('Error loading boundary:', err)
    } finally {
      setBoundaryLoading(false)
    }
  }

  const handleBoundaryToggle = () => {
    const newShowState = !showBoundary
    setShowBoundary(newShowState)
    if (onBoundaryToggle && boundary) {
      onBoundaryToggle(boundary, newShowState)
    }
  }

  if (!park) return null

  return (
    <div className="detail-panel">
      <button className="close-button" onClick={onClose}>
        ✕
      </button>
      
      <div className="detail-content">
        
        {/* Alerts if any */}
        {park.alerts && park.alerts.length > 0 && (
          <div className="alerts-banner">
            <div className="alert-icon">⚠️</div>
            <div className="alert-content">
              <h3>Important Alerts</h3>
              {park.alerts.map((alert, index) => (
                <div key={index} className="alert-item">
                  <strong>{alert.title}</strong>
                  <p>{alert.description}</p>
                  {alert.url && (
                    <a href={alert.url} target="_blank" rel="noopener noreferrer">
                      More Info →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Park Title */}
        <h2>{park.name}</h2>
        
        {/* Info Badges */}
        <div className="info-badges">
          {park.entrance_fees && park.entrance_fees.length > 0 && (
            <span className="badge fee-badge">
              {park.entrance_fees[0].cost === '0' || park.entrance_fees[0].cost === '0.00' 
                ? '🎫 Free Entry' 
                : `💰 $${park.entrance_fees[0].cost}`}
            </span>
          )}
          
          {park.distance && (
            <span className="badge distance-badge">
              📍 {park.distance.toFixed(1)} miles away
            </span>
          )}
          
          {boundary && (
            <button 
              className={`badge boundary-toggle ${showBoundary ? 'active' : ''}`}
              onClick={handleBoundaryToggle}
              title={showBoundary ? 'Hide boundary' : 'Show boundary'}
            >
              {showBoundary ? '🗺 Hide Boundary' : '🗺 Show Boundary'}
            </button>
          )}
          
          {boundaryLoading && (
            <span className="badge">Loading boundary...</span>
          )}
        </div>

        {/* Description */}
        {park.description && (
          <div className="detail-section description-section">
            <h3>About This Park</h3>
            <p>{park.description}</p>
          </div>
        )}

        {/* Hours & Contact */}
        <div className="detail-grid">
          {park.operating_hours && (
            <div className="detail-section">
              <h3>🕐 Hours Today</h3>
              <p className="hours-today">{getTodaySchedule(park.operating_hours)}</p>
            </div>
          )}

          {(park.phone || park.email) && (
            <div className="detail-section">
              <h3>📞 Contact</h3>
              {park.phone && (
                <p><a href={`tel:${park.phone}`}>{park.phone}</a></p>
              )}
              {park.email && (
                <p><a href={`mailto:${park.email}`}>{park.email}</a></p>
              )}
            </div>
          )}
        </div>

        {/* Amenities */}
        {park.amenities && park.amenities.length > 0 && (
          <div className="detail-section">
            <h3>🏕️ Amenities</h3>
            <div className="activities-tags">
              {park.amenities.map((amenity, index) => (
                <span key={index} className="activity-tag">{amenity}</span>
              ))}
            </div>
          </div>
        )}

        {/* Activities */}
        {park.activities && park.activities.length > 0 && (
          <div className="detail-section">
            <h3>🥾 Activities</h3>
            <div className="activities-tags">
              {park.activities.map((activity, index) => (
                <span key={index} className="activity-tag">{activity}</span>
              ))}
            </div>
          </div>
        )}

        {/* Location */}
        <div className="detail-section">
          <h3>Location</h3>
          <p><strong>State:</strong> {park.state}</p>
          {park.county && (
            <p><strong>County:</strong> {park.county}</p>
          )}
          {park.city && (
            <p><strong>City:</strong> {park.city}</p>
          )}
        </div>

        {/* Management */}
        <div className="detail-section">
          <h3>Management</h3>
          <p><strong>Type:</strong> {getAgencyFullName(park.agency)}</p>
          {park.agency_full_name && (
            <p><strong>Managed By:</strong> {park.agency_full_name}</p>
          )}
        </div>

        {/* Size & Designation */}
        <div className="detail-grid">
          {park.acres && (
            <div className="detail-section">
              <h3>Size</h3>
              <p>{Math.round(park.acres).toLocaleString()} acres</p>
            </div>
          )}

          {park.designation_type && (
            <div className="detail-section">
              <h3>Designation</h3>
              <p>{park.designation_type}</p>
            </div>
          )}
        </div>

        {/* Weather Info */}
        {park.weather_info && (
          <div className="detail-section">
            <h3>🌤️ Weather Info</h3>
            <p>{park.weather_info}</p>
          </div>
        )}

        {/* Directions Info */}
        {park.directions_info && (
          <div className="detail-section">
            <h3>🚗 Getting There</h3>
            <p>{park.directions_info}</p>
          </div>
        )}

        {/* Links */}
        <div className="detail-section action-links">
          {park.website && (
            <a 
              href={park.website} 
              target="_blank" 
              rel="noopener noreferrer"
              className="action-button primary"
            >
              Visit Official Website →
            </a>
          )}
          <a 
            href={`https://www.google.com/maps/search/?api=1&query=${park.latitude},${park.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="action-button secondary"
          >
            Get Directions
          </a>
        </div>

        {/* Coordinates */}
        <div className="detail-section coordinates-section">
          <p className="coordinates-text">
            {park.latitude.toFixed(4)}, {park.longitude.toFixed(4)}
          </p>
        </div>
      </div>
    </div>
  )
}

export default ParkDetail
