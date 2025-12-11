'use client'
// src/components/Map/MarkerClusterGroupVectorTiles.jsx
// Mapbox GL JS vector tiles implementation (replaces GeoJSON)

import React, { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { getAgencyFullName } from '../../utils/helpers'
import { config } from '../../config/settings'

const MarkerClusterGroupVectorTiles = ({ onMarkerClick, map, mapLoaded }) => {
  const popupRef = useRef(null)
  const sourceId = 'parks-tiles-source'
  const clusterLayerId = 'parks-clusters'
  const clusterCountLayerId = 'parks-cluster-count'
  const unclusteredLayerId = 'parks-unclustered'

  useEffect(() => {
    if (!map || !mapLoaded) return

    if (!map.isStyleLoaded()) {
      map.once('styledata', () => {
        if (map && mapLoaded) {
          // Retry after style loads
        }
      })
      return
    }

    const hasSource = (id) => {
      try {
        return map.getSource(id) !== undefined
      } catch {
        return false
      }
    }

    const hasLayer = (id) => {
      try {
        return map.getLayer(id) !== undefined
      } catch {
        return false
      }
    }

    // Get base URL for tiles (works in both dev and prod)
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Add vector tile source (replaces GeoJSON)
    if (!hasSource(sourceId)) {
      try {
        map.addSource(sourceId, {
          type: 'vector',
          tiles: [`${baseUrl}/api/tiles/parks/{z}/{x}/{y}`],
          minzoom: 0,
          maxzoom: 14,
          promoteId: 'id' // Use 'id' as feature ID
        })
        console.log('Vector tile source added')
      } catch (error) {
        console.error('Error adding vector tile source:', error)
        return
      }
    }

    // Add cluster layer
    if (!hasLayer(clusterLayerId)) {
      try {
        map.addLayer({
          id: clusterLayerId,
          type: 'circle',
          source: sourceId,
          'source-layer': 'parks',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#51bbd6',
              100,
              '#f1f075',
              750,
              '#f28cb1'
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              20,
              100,
              30,
              750,
              40
            ]
          }
        })
      } catch (error) {
        console.error('Error adding cluster layer:', error)
      }
    }

    // Add cluster count layer
    if (!hasLayer(clusterCountLayerId)) {
      try {
        map.addLayer({
          id: clusterCountLayerId,
          type: 'symbol',
          source: sourceId,
          'source-layer': 'parks',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12
          }
        })
      } catch (error) {
        console.error('Error adding cluster count layer:', error)
      }
    }

    // Add unclustered points layer with agency-based colors
    if (!hasLayer(unclusteredLayerId)) {
      try {
        map.addLayer({
          id: unclusteredLayerId,
          type: 'circle',
          source: sourceId,
          'source-layer': 'parks',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'match',
              ['get', 'agency'],
              'NPS', config.markerColors.NPS,
              'USFS', config.markerColors.USFS,
              'BLM', config.markerColors.BLM,
              'FWS', config.markerColors.FWS,
              'ARMY', config.markerColors.ARMY,
              'NAVY', config.markerColors.NAVY,
              'State', config.markerColors.State,
              'COUNTY', config.markerColors.COUNTY,
              'CITY', config.markerColors.CITY,
              config.markerColors.FEDERAL // default
            ],
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
          }
        })
      } catch (error) {
        console.error('Error adding unclustered layer:', error)
      }
    }

    // Handle clicks on clusters
    const handleClusterClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [clusterLayerId]
      })
      
      if (features.length > 0) {
        const clusterId = features[0].properties.cluster_id
        const source = map.getSource(sourceId)
        
        if (source && typeof source.getClusterExpansionZoom === 'function') {
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (!err) {
              map.easeTo({
                center: features[0].geometry.coordinates,
                zoom: zoom
              })
            }
          })
        }
      }
    }

    // Handle clicks on individual markers
    const handleMarkerClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [unclusteredLayerId]
      })
      
      if (features.length > 0) {
        const props = features[0].properties
        const coordinates = features[0].geometry.coordinates
        
        // Reconstruct park object from vector tile properties
        const park = {
          id: props.id,
          name: props.name,
          agency: props.agency,
          state: props.state,
          latitude: coordinates[1], // GeoJSON/MVT: [lng, lat]
          longitude: coordinates[0],
          source_id: props.source_id,
          data_source: props.data_source,
          ...props
        }
        
        // Show popup
        if (popupRef.current) {
          popupRef.current.remove()
        }
        
        const popup = new mapboxgl.Popup({ 
          offset: 25, 
          closeOnClick: false,
          closeButton: true
        })
          .setLngLat(coordinates)
          .setHTML(`
            <div class="popup-content" style="min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${park.name || 'Unnamed Park'}</h3>
              <p style="margin: 4px 0; font-size: 14px;"><strong>State:</strong> ${park.state || 'N/A'}</p>
              <p style="margin: 4px 0; font-size: 14px;"><strong>Type:</strong> ${getAgencyFullName(park.agency)}</p>
              <button 
                class="detail-button" 
                data-park-id="${park.id}"
                style="
                  margin-top: 8px;
                  padding: 8px 16px;
                  background-color: #007bff;
                  color: white;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 14px;
                  width: 100%;
                "
              >View Details</button>
            </div>
          `)
          .addTo(map)
        
        popupRef.current = popup
        
        popup.getElement().addEventListener('click', (e) => {
          if (e.target.classList.contains('detail-button') || e.target.closest('.detail-button')) {
            e.stopPropagation()
            if (popupRef.current) {
              popupRef.current.remove()
              popupRef.current = null
            }
            if (onMarkerClick) {
              onMarkerClick(park)
            }
          }
        })
      }
    }

    // Add event listeners
    map.on('click', clusterLayerId, handleClusterClick)
    map.on('click', unclusteredLayerId, handleMarkerClick)

    // Cleanup
    return () => {
      map.off('click', clusterLayerId, handleClusterClick)
      map.off('click', unclusteredLayerId, handleMarkerClick)
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
    }
  }, [map, mapLoaded, onMarkerClick])

  // Cleanup popup on unmount
  useEffect(() => {
    return () => {
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
    }
  }, [])

  return null
}

export default MarkerClusterGroupVectorTiles
