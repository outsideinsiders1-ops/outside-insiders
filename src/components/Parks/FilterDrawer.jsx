'use client'
// src/components/Parks/FilterDrawer.jsx
// Filter drawer component for park filtering

import React, { useState } from 'react'
import { config } from '../../config/settings'

const FilterDrawer = ({ 
  isOpen, 
  onClose, 
  filters, 
  onFiltersChange 
}) => {
  const [activitiesExpanded, setActivitiesExpanded] = useState(false)
  const [landTypeExpanded, setLandTypeExpanded] = useState(true)
  const [agenciesExpanded, setAgenciesExpanded] = useState(false)

  // Handle land type change
  const handleLandTypeChange = (type) => {
    onFiltersChange({
      ...filters,
      landType: type,
      agencies: type === 'STATE' || type === 'COUNTY' || type === 'CITY' ? [] : filters.agencies
    })
  }

  // Handle agency toggle
  const handleAgencyToggle = (agency) => {
    const newAgencies = filters.agencies.includes(agency)
      ? filters.agencies.filter(a => a !== agency)
      : [...filters.agencies, agency]
    
    onFiltersChange({
      ...filters,
      agencies: newAgencies,
      landType: newAgencies.length > 0 ? 'ALL' : filters.landType
    })
  }

  // Handle amenity toggle
  const handleAmenityToggle = (amenity) => {
    const newAmenities = filters.amenities.includes(amenity)
      ? filters.amenities.filter(a => a !== amenity)
      : [...filters.amenities, amenity]
    
    onFiltersChange({
      ...filters,
      amenities: newAmenities
    })
  }

  // Clear all filters
  const clearAllFilters = () => {
    onFiltersChange({
      landType: 'ALL',
      agencies: [],
      amenities: []
    })
  }

  // Calculate active filter count
  const getActiveFilterCount = () => {
    let count = 0
    if (filters.landType !== 'ALL') count++
    count += filters.agencies.length
    count += filters.amenities.length
    return count
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="filter-drawer-backdrop" onClick={onClose} />
      
      {/* Drawer */}
      <div className="filter-drawer open">
        <div className="filter-drawer-header">
          <h2>Filters</h2>
          <button className="filter-drawer-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="filter-drawer-content">
          
          {/* Amenities Section */}
          <div className="filter-section">
            <button 
              className="filter-section-header"
              onClick={() => setActivitiesExpanded(!activitiesExpanded)}
            >
              <span className="filter-section-title">
                🎯 Amenities
                {filters.amenities.length > 0 && (
                  <span className="filter-count">
                    {' '}({filters.amenities.length})
                  </span>
                )}
              </span>
              <span className="filter-section-arrow">
                {activitiesExpanded ? '▼' : '▶'}
              </span>
            </button>
            
            {activitiesExpanded && (
              <div className="filter-section-content">
                {config.amenities.map(amenity => (
                  <label key={amenity.key} className="filter-option">
                    <input 
                      type="checkbox" 
                      checked={filters.amenities.includes(amenity.key)}
                      onChange={() => handleAmenityToggle(amenity.key)}
                    />
                    <span>{amenity.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Land Type Section */}
          <div className="filter-section">
            <button 
              className="filter-section-header"
              onClick={() => setLandTypeExpanded(!landTypeExpanded)}
            >
              <span className="filter-section-title">
                Land Type
                {filters.landType !== 'ALL' && (
                  <span className="filter-count"> (1)</span>
                )}
              </span>
              <span className="filter-section-arrow">
                {landTypeExpanded ? '▼' : '▶'}
              </span>
            </button>
            
            {landTypeExpanded && (
              <div className="filter-section-content">
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={filters.landType === 'ALL'}
                    onChange={() => handleLandTypeChange('ALL')}
                  />
                  <span>Show All</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={filters.landType === 'FEDERAL'}
                    onChange={() => handleLandTypeChange('FEDERAL')}
                  />
                  <span>Federal Lands Only</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={filters.landType === 'STATE'}
                    onChange={() => handleLandTypeChange('STATE')}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: config.markerColors.State}}></span>
                    State Parks Only
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={filters.landType === 'COUNTY'}
                    onChange={() => handleLandTypeChange('COUNTY')}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: config.markerColors.COUNTY}}></span>
                    County Parks Only
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="landType"
                    checked={filters.landType === 'CITY'}
                    onChange={() => handleLandTypeChange('CITY')}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: config.markerColors.CITY}}></span>
                    City Parks Only
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Federal Agencies Section */}
          <div className="filter-section">
            <button 
              className="filter-section-header"
              onClick={() => setAgenciesExpanded(!agenciesExpanded)}
            >
              <span className="filter-section-title">
                Federal Agencies
                {filters.agencies.length > 0 && (
                  <span className="filter-count">
                    {' '}({filters.agencies.length})
                  </span>
                )}
              </span>
              <span className="filter-section-arrow">
                {agenciesExpanded ? '▼' : '▶'}
              </span>
            </button>
            
            {agenciesExpanded && (
              <div className="filter-section-content">
                <label className="filter-option">
                  <input 
                    type="checkbox"
                    checked={filters.agencies.includes('NPS')}
                    onChange={() => handleAgencyToggle('NPS')}
                    disabled={['STATE', 'COUNTY', 'CITY'].includes(filters.landType)}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: config.markerColors.NPS}}></span>
                    National Parks (NPS)
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox"
                    checked={filters.agencies.includes('USFS')}
                    onChange={() => handleAgencyToggle('USFS')}
                    disabled={['STATE', 'COUNTY', 'CITY'].includes(filters.landType)}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: config.markerColors.USFS}}></span>
                    National Forests (USFS)
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox"
                    checked={filters.agencies.includes('FWS')}
                    onChange={() => handleAgencyToggle('FWS')}
                    disabled={['STATE', 'COUNTY', 'CITY'].includes(filters.landType)}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: config.markerColors.FWS}}></span>
                    Fish & Wildlife (FWS)
                  </span>
                </label>
                <label className="filter-option">
                  <input 
                    type="checkbox"
                    checked={filters.agencies.includes('BLM')}
                    onChange={() => handleAgencyToggle('BLM')}
                    disabled={['STATE', 'COUNTY', 'CITY'].includes(filters.landType)}
                  />
                  <span>
                    <span className="legend-dot" style={{backgroundColor: config.markerColors.BLM}}></span>
                    Bureau of Land Management (BLM)
                  </span>
                </label>
              </div>
            )}
          </div>

        </div>

        {/* Clear Filters Button */}
        {getActiveFilterCount() > 0 && (
          <div className="filter-drawer-footer">
            <button 
              className="clear-all-filters"
              onClick={clearAllFilters}
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default FilterDrawer
