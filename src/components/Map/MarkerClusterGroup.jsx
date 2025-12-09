'use client'
// src/components/Map/MarkerClusterGroup.jsx
// Mapbox GL JS clustering implementation

import React, { useEffect } from 'react'

const MarkerClusterGroup = ({ parks, onMarkerClick, map, mapLoaded }) => {
  const sourceId = 'parks-cluster-source'
  const clusterLayerId = 'parks-clusters'
  const clusterCountLayerId = 'parks-cluster-count'
  const unclusteredLayerId = 'parks-unclustered'

  useEffect(() => {
    if (!map || !mapLoaded || !parks || parks.length === 0) return

    // Convert parks to GeoJSON - ensure all park data is in properties
    const geojson = {
      type: 'FeatureCollection',
      features: parks.map(park => ({
        type: 'Feature',
        properties: {
          // Core fields
          id: park.id,
          name: park.name,
          agency: park.agency,
          state: park.state,
          latitude: park.latitude,
          longitude: park.longitude,
          distance: park.distance,
          // Include all other park properties
          ...park
        },
        geometry: {
          type: 'Point',
          coordinates: [park.longitude, park.latitude]
        }
      }))
    }

    // Add source
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14, // Max zoom to cluster points on
        clusterRadius: 50, // Radius of each cluster when clustering points
      })
    } else {
      map.getSource(sourceId).setData(geojson)
    }

    // Add cluster circles
    if (!map.getLayer(clusterLayerId)) {
      map.addLayer({
        id: clusterLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#4a7c2f', // Default green
            10,
            '#3a6c1f', // Darker green for 10+
            50,
            '#2d5016' // Darkest green for 50+
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20, // Small clusters
            10,
            30, // Medium clusters
            50,
            40  // Large clusters
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.8
        }
      })
    }

    // Add cluster count labels
    if (!map.getLayer(clusterCountLayerId)) {
      map.addLayer({
        id: clusterCountLayerId,
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#fff'
        }
      })
    }

    // Add unclustered points
    if (!map.getLayer(unclusteredLayerId)) {
      map.addLayer({
        id: unclusteredLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#4a7c2f',
          'circle-radius': 10,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.8
        }
      })
    }

    // Spiderfy functionality - spread out markers when cluster is clicked
    const spiderfyCluster = (clusterId, center, pointCount) => {
      // Clean up any existing spiderfy first
      try {
        if (map.getLayer('spiderfy-lines')) map.removeLayer('spiderfy-lines')
        if (map.getLayer('spiderfy-layer')) map.removeLayer('spiderfy-layer')
        if (map.getSource('spiderfy-source')) map.removeSource('spiderfy-source')
        if (map.getSource('spiderfy-lines-source')) map.removeSource('spiderfy-lines-source')
      } catch {
        // Ignore errors if layers don't exist
      }
      
      // Get all points in the cluster
      map.getSource(sourceId).getClusterLeaves(clusterId, pointCount, 0, (err, leaves) => {
        if (err || !leaves || leaves.length === 0) {
          // Fallback to zoom in if spiderfy fails
          map.getSource(sourceId).getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (!err) {
              map.easeTo({
                center: center,
                zoom: zoom
              })
            }
          })
          return
        }

        // If only a few markers, just zoom in (increased threshold to 10 for better UX)
        if (leaves.length <= 10) {
          map.getSource(sourceId).getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (!err) {
              map.easeTo({
                center: center,
                zoom: zoom
              })
            }
          })
          return
        }

        // Calculate spiderfy positions in a circle
        const angleStep = (2 * Math.PI) / leaves.length
        const radius = 0.003 // ~300 meters at equator
        const spiderfyFeatures = leaves.map((leaf, i) => {
          const angle = i * angleStep
          const offsetLng = radius * Math.cos(angle)
          const offsetLat = radius * Math.sin(angle)
          
          return {
            type: 'Feature',
            properties: leaf.properties,
            geometry: {
              type: 'Point',
              coordinates: [
                center[0] + offsetLng,
                center[1] + offsetLat
              ]
            }
          }
        })

        // Temporarily add spiderfy source and layer
        const spiderfySourceId = 'spiderfy-source'
        const spiderfyLayerId = 'spiderfy-layer'
        const spiderfyLineLayerId = 'spiderfy-lines'

        // Remove existing spiderfy if present
        if (map.getLayer(spiderfyLineLayerId)) map.removeLayer(spiderfyLineLayerId)
        if (map.getLayer(spiderfyLayerId)) map.removeLayer(spiderfyLayerId)
        if (map.getSource(spiderfySourceId)) map.removeSource(spiderfySourceId)

        // Add spiderfy source
        map.addSource(spiderfySourceId, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: spiderfyFeatures
          }
        })

        // Add lines from center to each marker
        const lineFeatures = spiderfyFeatures.map(feature => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [center, feature.geometry.coordinates]
          }
        }))

        map.addSource('spiderfy-lines-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: lineFeatures
          }
        })

        map.addLayer({
          id: spiderfyLineLayerId,
          type: 'line',
          source: 'spiderfy-lines-source',
          paint: {
            'line-color': '#666',
            'line-width': 1.5,
            'line-opacity': 0.5
          }
        })

        // Add spiderfy markers
        map.addLayer({
          id: spiderfyLayerId,
          type: 'circle',
          source: spiderfySourceId,
          paint: {
            'circle-color': '#4a7c2f',
            'circle-radius': 10,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.9
          }
        })

        // Handle clicks on spiderfy markers
        const handleSpiderfyClick = (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: [spiderfyLayerId]
          })
          
          if (features.length > 0 && onMarkerClick) {
            const props = features[0].properties
            // Reconstruct full park object
            const park = {
              id: props.id,
              name: props.name,
              agency: props.agency,
              state: props.state,
              latitude: props.latitude || features[0].geometry.coordinates[1],
              longitude: props.longitude || features[0].geometry.coordinates[0],
              distance: props.distance,
              ...props
            }
            onMarkerClick(park)
            
            // Clean up spiderfy after click
            try {
              if (map.getLayer(spiderfyLineLayerId)) map.removeLayer(spiderfyLineLayerId)
              if (map.getLayer(spiderfyLayerId)) map.removeLayer(spiderfyLayerId)
              if (map.getSource(spiderfySourceId)) map.removeSource(spiderfySourceId)
              if (map.getSource('spiderfy-lines-source')) map.removeSource('spiderfy-lines-source')
              map.off('click', spiderfyLayerId, handleSpiderfyClick)
              map.off('mouseenter', spiderfyLayerId)
              map.off('mouseleave', spiderfyLayerId)
            } catch (err) {
              console.warn('Error cleaning up spiderfy on click:', err)
            }
          }
        }

        map.on('click', spiderfyLayerId, handleSpiderfyClick)
        map.on('mouseenter', spiderfyLayerId, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', spiderfyLayerId, () => {
          map.getCanvas().style.cursor = ''
        })

        // Clean up spiderfy when map moves or zooms
        let cleanupTimeout = null
        const cleanupSpiderfy = () => {
          // Debounce cleanup to avoid flickering
          if (cleanupTimeout) clearTimeout(cleanupTimeout)
          cleanupTimeout = setTimeout(() => {
            try {
              if (map.getLayer(spiderfyLineLayerId)) map.removeLayer(spiderfyLineLayerId)
              if (map.getLayer(spiderfyLayerId)) map.removeLayer(spiderfyLayerId)
              if (map.getSource(spiderfySourceId)) map.removeSource(spiderfySourceId)
              if (map.getSource('spiderfy-lines-source')) map.removeSource('spiderfy-lines-source')
              map.off('click', spiderfyLayerId, handleSpiderfyClick)
              map.off('mouseenter', spiderfyLayerId)
              map.off('mouseleave', spiderfyLayerId)
            } catch (err) {
              console.warn('Error cleaning up spiderfy:', err)
            }
          }, 100)
        }

        map.once('move', cleanupSpiderfy)
        map.once('zoom', cleanupSpiderfy)
        map.once('click', cleanupSpiderfy) // Also cleanup on any click
      })
    }

    // Handle clicks on clusters
    const handleClusterClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [clusterLayerId]
      })
      
      if (features.length === 0) return
      
      const clusterId = features[0].properties.cluster_id
      const pointCount = features[0].properties.point_count
      const center = features[0].geometry.coordinates
      
      // Use spiderfy for clusters with multiple points
      spiderfyCluster(clusterId, center, pointCount)
    }

    // Handle clicks on individual markers
    const handleMarkerClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [unclusteredLayerId]
      })
      
      if (features.length > 0 && onMarkerClick) {
        const props = features[0].properties
        // Reconstruct full park object from properties
        // Properties include all park data via spread operator
        const park = {
          id: props.id,
          name: props.name,
          agency: props.agency,
          state: props.state,
          latitude: props.latitude || features[0].geometry.coordinates[1],
          longitude: props.longitude || features[0].geometry.coordinates[0],
          distance: props.distance,
          // Include any other park properties
          ...props
        }
        onMarkerClick(park)
      }
    }

    map.on('click', clusterLayerId, handleClusterClick)
    map.on('click', unclusteredLayerId, handleMarkerClick)

    // Change cursor on hover
    map.on('mouseenter', clusterLayerId, () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', clusterLayerId, () => {
      map.getCanvas().style.cursor = ''
    })
    map.on('mouseenter', unclusteredLayerId, () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', unclusteredLayerId, () => {
      map.getCanvas().style.cursor = ''
    })

    // Cleanup
    return () => {
      map.off('click', clusterLayerId, handleClusterClick)
      map.off('click', unclusteredLayerId, handleMarkerClick)
      map.off('mouseenter', clusterLayerId)
      map.off('mouseleave', clusterLayerId)
      map.off('mouseenter', unclusteredLayerId)
      map.off('mouseleave', unclusteredLayerId)
      
      if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId)
      if (map.getLayer(clusterCountLayerId)) map.removeLayer(clusterCountLayerId)
      if (map.getLayer(unclusteredLayerId)) map.removeLayer(unclusteredLayerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }, [map, mapLoaded, parks, onMarkerClick])

  return null
}

export default MarkerClusterGroup
