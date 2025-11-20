'use client'
// src/components/Layout/StatsFooter.jsx
// Footer showing stats and legend

import React from 'react'
import { config } from '../../config/settings'

const StatsFooter = ({ parkCount, sortedByDistance }) => {
  return (
    <div className="stats">
      <div className="stats-left">
        <span>Showing {parkCount} parks</span>
        {sortedByDistance && (
          <span> (sorted by distance)</span>
        )}
      </div>
      
      <div className="legend">
        <span className="legend-item">
          <span 
            className="legend-dot" 
            style={{backgroundColor: config.markerColors.State}}
          />
          State
        </span>
        <span className="legend-item">
          <span 
            className="legend-dot" 
            style={{backgroundColor: config.markerColors.COUNTY}}
          />
          County
        </span>
        <span className="legend-item">
          <span 
            className="legend-dot" 
            style={{backgroundColor: config.markerColors.CITY}}
          />
          City
        </span>
        <span className="legend-item">
          <span 
            className="legend-dot" 
            style={{backgroundColor: config.markerColors.NPS}}
          />
          NPS
        </span>
        <span className="legend-item">
          <span 
            className="legend-dot" 
            style={{backgroundColor: config.markerColors.USFS}}
          />
          USFS
        </span>
        <span className="legend-item">
          <span 
            className="legend-dot" 
            style={{backgroundColor: config.markerColors.BLM}}
          />
          BLM
        </span>
        <span className="legend-item">
          <span 
            className="legend-dot" 
            style={{backgroundColor: config.markerColors.FWS}}
          />
          FWS
        </span>
      </div>
    </div>
  )
}

export default StatsFooter
