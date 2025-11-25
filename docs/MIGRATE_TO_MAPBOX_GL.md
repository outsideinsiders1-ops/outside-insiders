# Migrating to Mapbox GL JS

## Why Migrate?

1. **You're paying for Mapbox** - use the full feature set
2. **Large datasets** (2.5GB, 15,000 features) need vector tiles
3. **Better performance** with Mapbox GL JS
4. **Future-proof** for vector tile layers

## Current Architecture

- ❌ Leaflet with Mapbox raster tiles (limited)
- ✅ PostGIS database (good)
- ✅ Geometry simplification (good)
- ❌ No vector tile server (needed for large datasets)

## Migration Plan

### Phase 1: Install Mapbox GL JS

```bash
npm install mapbox-gl
```

### Phase 2: Update MapView Component

Replace Leaflet `MapContainer` with Mapbox GL JS `Map` component.

**Benefits:**
- Native vector tile support
- Better rendering
- Access to Mapbox styles
- Better performance

### Phase 3: Keep Individual Park Boundaries

For single park boundaries (on click), keep current approach:
- Fetch GeoJSON from PostGIS
- Display as GeoJSON layer
- Works fine for individual parks

### Phase 4: Add Vector Tiles for Large Datasets

For displaying all parks at once (or large datasets):
1. Set up Martin or pg_tileserv (vector tile server)
2. Point to Supabase PostGIS database
3. Add vector tile source to Mapbox GL JS map
4. Style layers for park boundaries

## Implementation Steps

1. **Install dependencies:**
   ```bash
   npm install mapbox-gl
   ```

2. **Update MapView.jsx:**
   - Replace `react-leaflet` imports with `mapbox-gl`
   - Replace `MapContainer` with Mapbox `Map` component
   - Update park markers to use Mapbox GL JS markers
   - Keep park boundaries as GeoJSON layers

3. **Update ParkMarker component:**
   - Use Mapbox GL JS markers instead of Leaflet markers
   - Or use HTML markers (simpler)

4. **Test with small dataset first:**
   - Verify map loads
   - Verify markers display
   - Verify boundaries display

5. **Add vector tiles for large datasets:**
   - Set up Martin server
   - Add vector tile source
   - Style layers

## Code Example

```jsx
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

function MapView() {
  const mapContainer = useRef(null)
  const map = useRef(null)

  useEffect(() => {
    if (map.current) return // Initialize map only once

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [lng, lat],
      zoom: zoom,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    })

    // Add park markers
    parks.forEach(park => {
      new mapboxgl.Marker()
        .setLngLat([park.longitude, park.latitude])
        .addTo(map.current)
    })

    // Add park boundary (GeoJSON)
    if (boundary) {
      map.current.addSource('park-boundary', {
        type: 'geojson',
        data: boundary
      })
      
      map.current.addLayer({
        id: 'park-boundary-fill',
        type: 'fill',
        source: 'park-boundary',
        paint: {
          'fill-color': '#4a7c2f',
          'fill-opacity': 0.2
        }
      })
    }
  }, [])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
}
```

## For Large Datasets: Vector Tiles

Once you have 15,000+ parks, add vector tile source:

```jsx
// Add vector tile source (from Martin server)
map.current.addSource('parks', {
  type: 'vector',
  url: 'https://your-martin-server.com/parks'
})

map.current.addLayer({
  id: 'parks-fill',
  type: 'fill',
  source: 'parks',
  'source-layer': 'parks',
  paint: {
    'fill-color': '#4a7c2f',
    'fill-opacity': 0.2
  }
})
```

