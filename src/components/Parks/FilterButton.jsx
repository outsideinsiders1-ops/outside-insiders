// src/components/Parks/FilterButton.jsx
// Button to open filter drawer

import React from 'react'

const FilterButton = ({ onClick, activeFilterCount }) => {
  return (
    <button 
      className="filter-drawer-button"
      onClick={onClick}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="6" x2="20" y2="6"/>
        <line x1="4" y1="12" x2="20" y2="12"/>
        <line x1="4" y1="18" x2="20" y2="18"/>
        <circle cx="18" cy="6" r="2" fill="white"/>
        <circle cx="8" cy="12" r="2" fill="white"/>
        <circle cx="15" cy="18" r="2" fill="white"/>
      </svg>
      <span>Filters</span>
      {activeFilterCount > 0 && (
        <span className="filter-badge">{activeFilterCount}</span>
      )}
    </button>
  )
}

export default FilterButton
