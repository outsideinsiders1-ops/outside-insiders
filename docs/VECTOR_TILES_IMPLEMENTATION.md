# Vector Tiles Implementation Guide

## Overview

Vector tiles are a major performance improvement that will:
- **Reduce data transfer by 10-100x** (only visible tiles loaded)
- **Improve initial load time** from 2-3 seconds to 0.5-1 second
- **Reduce memory usage** from 50-100MB to 10-20MB
- **Enable smooth panning/zooming** with minimal data transfer

## Architecture

**Vector tiles are generated in Supabase (PostGIS) and consumed by Mapbox GL JS**

- **Supabase**: Generates vector tiles on-demand using PostGIS `ST_AsMVT`
- **Next.js API Route**: Serves tiles as HTTP endpoint
- **Mapbox GL JS**: Consumes tiles as vector source (replaces GeoJSON)

---

## Step 1: Enable PostGIS in Supabase

### 1.1 Check if PostGIS is enabled

Go to your Supabase dashboard:
1. Navigate to **Database** → **Extensions**
2. Search for "PostGIS"
3. If not enabled, click **Enable**

Or via SQL:
```sql
-- Check if PostGIS is enabled
SELECT * FROM pg_extension WHERE extname = 'postgis';

-- If not found, enable it
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 1.2 Verify PostGIS functions

```sql
-- Test PostGIS
SELECT PostGIS_version();
-- Should return version like "3.3.2"
```

---

## Step 2: Set Up Point Geometry for Vector Tiles

### 2.1 Check current schema

```sql
-- Check existing geometry column (likely for boundaries)
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_name = 'parks' 
  AND (column_name LIKE '%geom%' OR column_name LIKE '%boundary%' OR udt_name = 'geometry');

-- Check geometry column type
SELECT 
  column_name,
  data_type,
  (SELECT type FROM geometry_columns WHERE f_table_name = 'parks' AND f_geometry_column = column_name) as geometry_type
FROM information_schema.columns 
WHERE table_name = 'parks' AND udt_name = 'geometry';
```

### 2.2 Understanding Your Current Setup

You likely have:
- **Boundary geometry column**: Stores polygons/multipolygons for park boundaries
- **Latitude/Longitude columns**: Point coordinates for markers

**For vector tiles, we need point geometry for markers.** We have two options:

#### Option A: Add Separate Point Geometry Column (Recommended)
- Keep boundary geometry for boundary display
- Add point geometry for vector tile markers
- More efficient for queries

#### Option B: Use Centroid of Boundary Geometry
- Use existing boundary geometry
- Calculate centroid on-the-fly for markers
- Simpler but slightly slower

### 2.3 Option A: Add Point Geometry Column

```sql
-- Add point geometry column for markers (separate from boundary)
ALTER TABLE parks 
ADD COLUMN IF NOT EXISTS geom_point geometry(Point, 4326);

-- Create spatial index for performance
CREATE INDEX IF NOT EXISTS idx_parks_geom_point ON parks USING GIST (geom_point);
```

### 2.4 Populate Point Geometry

```sql
-- Strategy 1: Use existing lat/lng if available
UPDATE parks 
SET geom_point = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL 
  AND geom_point IS NULL;

-- Strategy 2: Calculate centroid from boundary geometry if lat/lng missing
-- First, identify your boundary column name (common names: geom, boundary, geometry)
-- Replace 'boundary' with your actual column name below

UPDATE parks 
SET geom_point = ST_Centroid(boundary)  -- Replace 'boundary' with your column name
WHERE geom_point IS NULL 
  AND boundary IS NOT NULL  -- Replace 'boundary' with your column name
  AND ST_GeometryType(boundary) IN ('ST_Polygon', 'ST_MultiPolygon');  -- Replace 'boundary'

-- Strategy 3: Fallback - use boundary centroid even if lat/lng exists (if boundary is more accurate)
-- Uncomment if you prefer boundary centroids:
-- UPDATE parks 
-- SET geom_point = ST_Centroid(boundary)  -- Replace 'boundary' with your column name
-- WHERE boundary IS NOT NULL 
--   AND ST_GeometryType(boundary) IN ('ST_Polygon', 'ST_MultiPolygon');

-- Verify
SELECT 
  COUNT(*) as total_parks,
  COUNT(geom_point) as parks_with_point_geom,
  COUNT(boundary) as parks_with_boundary  -- Replace 'boundary' with your column name
FROM parks;
```

### 2.5 Option B: Use Boundary Centroid Directly (Alternative)

If you prefer not to add a new column, you can calculate centroids in the vector tile function:

```sql
-- Skip adding geom_point column
-- We'll use ST_Centroid(boundary) in the tile function instead
-- See Step 3 for modified function
```

### 2.6 Keep Point Geometry Updated (Optional Trigger)

```sql
-- Create trigger to update point geometry when lat/lng changes
CREATE OR REPLACE FUNCTION update_park_point_geometry()
RETURNS TRIGGER AS $$
BEGIN
  -- Priority 1: Use lat/lng if available
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom_point = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  -- Priority 2: Use boundary centroid if lat/lng missing
  ELSIF NEW.boundary IS NOT NULL THEN  -- Replace 'boundary' with your column name
    NEW.geom_point = ST_Centroid(NEW.boundary);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parks_point_geometry_update
BEFORE INSERT OR UPDATE OF latitude, longitude, boundary ON parks  -- Add your boundary column name
FOR EACH ROW
EXECUTE FUNCTION update_park_point_geometry();
```

### 2.7 Identify Your Boundary Column Name

Before proceeding, identify your boundary geometry column name:

```sql
-- Find geometry columns in parks table
SELECT 
  f_geometry_column as column_name,
  type as geometry_type,
  coord_dimension,
  srid
FROM geometry_columns 
WHERE f_table_name = 'parks';

-- Common names: 'boundary', 'geom', 'geometry', 'shape'
```

**Note**: Replace `'boundary'` in all SQL examples with your actual column name.

---

## Step 3: Create Vector Tile Function

### 3.1 Determine Your Geometry Setup

Based on Step 2, you'll use one of these approaches:

**If you added `geom_point` column (Option A - Recommended):**
- Use `geom_point` for markers
- Keep boundary geometry separate for boundary display

**If using boundary centroids (Option B):**
- Calculate `ST_Centroid(boundary)` in the function
- Slightly slower but no schema changes needed

### 3.2 Create the tile generation function (Option A - Using geom_point)

Run this SQL in Supabase SQL Editor:

```sql
-- Function to generate vector tiles for parks
-- Uses geom_point column for marker points
CREATE OR REPLACE FUNCTION parks_tiles(z int, x int, y int)
RETURNS bytea AS $$
DECLARE
  tile_bbox geometry;
  result bytea;
BEGIN
  -- Calculate tile bounding box in Web Mercator (EPSG:3857)
  tile_bbox = ST_TileEnvelope(z, x, y);
  
  -- Transform to WGS84 (EPSG:4326) for query
  tile_bbox = ST_Transform(tile_bbox, 4326);
  
  -- Generate vector tile using point geometry
  SELECT ST_AsMVT(q, 'parks', 4096, 'geom') INTO result
  FROM (
    SELECT
      id,
      name,
      agency,
      state,
      source_id,
      data_source,
      -- Transform point geometry to Web Mercator and create MVT geometry
      ST_AsMVTGeom(
        ST_Transform(geom_point, 3857),
        ST_TileEnvelope(z, x, y),
        4096,  -- tile extent
        256,   -- buffer (pixels)
        true   -- clip geometry
      ) AS geom
    FROM parks
    WHERE geom_point IS NOT NULL
      AND ST_Intersects(geom_point, tile_bbox)
  ) q;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
```

### 3.3 Alternative: Using Boundary Centroids (Option B)

If you didn't add `geom_point` and want to use boundary centroids:

```sql
-- Function using boundary centroid for markers
-- Replace 'boundary' with your actual boundary column name
CREATE OR REPLACE FUNCTION parks_tiles(z int, x int, y int)
RETURNS bytea AS $$
DECLARE
  tile_bbox geometry;
  result bytea;
BEGIN
  tile_bbox = ST_TileEnvelope(z, x, y);
  tile_bbox = ST_Transform(tile_bbox, 4326);
  
  SELECT ST_AsMVT(q, 'parks', 4096, 'geom') INTO result
  FROM (
    SELECT
      id,
      name,
      agency,
      state,
      source_id,
      data_source,
      -- Calculate centroid from boundary and create MVT geometry
      ST_AsMVTGeom(
        ST_Transform(
          CASE 
            -- Use lat/lng if available (more accurate)
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL 
            THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
            -- Otherwise use boundary centroid
            WHEN boundary IS NOT NULL  -- Replace 'boundary' with your column name
            THEN ST_Centroid(boundary)  -- Replace 'boundary'
            ELSE NULL
          END,
          3857
        ),
        ST_TileEnvelope(z, x, y),
        4096,
        256,
        true
      ) AS geom
    FROM parks
    WHERE (
      (latitude IS NOT NULL AND longitude IS NOT NULL)
      OR boundary IS NOT NULL  -- Replace 'boundary'
    )
    AND ST_Intersects(
      CASE 
        WHEN latitude IS NOT NULL AND longitude IS NOT NULL 
        THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHEN boundary IS NOT NULL  -- Replace 'boundary'
        THEN ST_Centroid(boundary)  -- Replace 'boundary'
        ELSE NULL
      END,
      tile_bbox
    )
  ) q;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
```

### 3.4 Hybrid Approach (Best of Both)

Use lat/lng when available, fallback to boundary centroid:

```sql
-- Function that prefers lat/lng, uses boundary centroid as fallback
-- Replace 'boundary' with your actual boundary column name
CREATE OR REPLACE FUNCTION parks_tiles(z int, x int, y int)
RETURNS bytea AS $$
DECLARE
  tile_bbox geometry;
  result bytea;
BEGIN
  tile_bbox = ST_TileEnvelope(z, x, y);
  tile_bbox = ST_Transform(tile_bbox, 4326);
  
  SELECT ST_AsMVT(q, 'parks', 4096, 'geom') INTO result
  FROM (
    SELECT
      id,
      name,
      agency,
      state,
      source_id,
      data_source,
      ST_AsMVTGeom(
        ST_Transform(
          COALESCE(
            -- Priority 1: Use geom_point if it exists
            (SELECT geom_point FROM parks p2 WHERE p2.id = parks.id),
            -- Priority 2: Use lat/lng
            CASE 
              WHEN latitude IS NOT NULL AND longitude IS NOT NULL 
              THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
              ELSE NULL
            END,
            -- Priority 3: Use boundary centroid
            ST_Centroid(boundary)  -- Replace 'boundary' with your column name
          ),
          3857
        ),
        ST_TileEnvelope(z, x, y),
        4096,
        256,
        true
      ) AS geom
    FROM parks
    WHERE (
      geom_point IS NOT NULL
      OR (latitude IS NOT NULL AND longitude IS NOT NULL)
      OR boundary IS NOT NULL  -- Replace 'boundary'
    )
    AND ST_Intersects(
      COALESCE(
        geom_point,
        CASE 
          WHEN latitude IS NOT NULL AND longitude IS NOT NULL 
          THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
          ELSE ST_Centroid(boundary)  -- Replace 'boundary'
        END
      ),
      tile_bbox
    )
  ) q;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
```

### 3.2 Test the function

```sql
-- Test with a tile (zoom 10, x=512, y=512)
SELECT parks_tiles(10, 512, 512);
-- Should return binary data (bytea)
```

---

## Step 4: Create Next.js API Route for Tiles

### 4.1 Create tile endpoint

Create file: `app/api/tiles/parks/[...params]/route.js`

```javascript
/**
 * API Route: /api/tiles/parks/[z]/[x]/[y]
 * Serves vector tiles for parks from Supabase PostGIS
 */

import { supabaseServer } from '../../../../../lib/supabase-server.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

export async function GET(request, { params }) {
  try {
    const { params: routeParams } = params
    const [z, x, y] = routeParams.map(Number)
    
    // Validate tile coordinates
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return new Response('Invalid tile coordinates', { status: 400 })
    }
    
    // Validate zoom level (0-18 typical)
    if (z < 0 || z > 18) {
      return new Response('Invalid zoom level', { status: 400 })
    }
    
    // Validate x, y for given zoom
    const maxCoord = Math.pow(2, z)
    if (x < 0 || x >= maxCoord || y < 0 || y >= maxCoord) {
      return new Response('Tile out of bounds', { status: 400 })
    }
    
    // Call Supabase function to generate tile
    const { data, error } = await supabaseServer.rpc('parks_tiles', {
      z: z,
      x: x,
      y: y
    })
    
    if (error) {
      console.error('Tile generation error:', error)
      return new Response('Tile generation failed', { status: 500 })
    }
    
    // Return tile as binary (MVT format)
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
      },
    })
    
  } catch (error) {
    console.error('Tile route error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
```

### 4.2 Test the endpoint

After deployment, test with:
```
https://your-domain.com/api/tiles/parks/10/512/512
```

Should return binary MVT data.

---

## Step 5: Update Mapbox to Use Vector Tiles

### 5.1 Update MarkerClusterGroup component

Replace the GeoJSON source with vector tile source:

**File: `src/components/Map/MarkerClusterGroup.jsx`**

```javascript
'use client'
import React, { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { normalizeAgency, getAgencyFullName } from '../../utils/helpers'
import { config } from '../../config/settings'

const MarkerClusterGroup = ({ parks, onMarkerClick, map, mapLoaded }) => {
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

    // Add vector tile source (replaces GeoJSON)
    if (!hasSource(sourceId)) {
      try {
        // Get base URL for tiles (works in both dev and prod)
        const baseUrl = typeof window !== 'undefined' 
          ? window.location.origin 
          : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        
        map.addSource(sourceId, {
          type: 'vector',
          tiles: [`${baseUrl}/api/tiles/parks/{z}/{x}/{y}`],
          minzoom: 0,
          maxzoom: 14,
          // Enable clustering
          promoteId: 'id'
        })
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

    // Add unclustered points layer
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
        
        const park = {
          id: props.id,
          name: props.name,
          agency: props.agency,
          state: props.state,
          latitude: coordinates[1], // GeoJSON/MVT: [lng, lat]
          longitude: coordinates[0],
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

export default MarkerClusterGroup
```

### 5.2 Remove old GeoJSON-based code

You can now remove:
- The `parks` prop dependency (tiles load automatically)
- The GeoJSON conversion logic
- The `useParks` hook viewport-based loading (tiles handle this automatically)

**However**, keep the `useParks` hook for:
- Filtering (agency, state, etc.)
- Search functionality
- Other non-map features

---

## Step 6: Add Filtering to Vector Tiles

### 6.1 Update tile function to accept filters

```sql
-- Enhanced function with filtering
CREATE OR REPLACE FUNCTION parks_tiles(
  z int, 
  x int, 
  y int,
  filter_agency text DEFAULT NULL,
  filter_state text DEFAULT NULL
)
RETURNS bytea AS $$
DECLARE
  tile_bbox geometry;
  result bytea;
  where_clause text := 'geom IS NOT NULL';
BEGIN
  tile_bbox = ST_Transform(ST_TileEnvelope(z, x, y), 4326);
  
  -- Build WHERE clause
  IF filter_agency IS NOT NULL THEN
    where_clause := where_clause || ' AND agency = ' || quote_literal(filter_agency);
  END IF;
  
  IF filter_state IS NOT NULL THEN
    where_clause := where_clause || ' AND state = ' || quote_literal(filter_state);
  END IF;
  
  -- Generate tile with filters
  EXECUTE format('
    SELECT ST_AsMVT(q, ''parks'', 4096, ''geom'')
    FROM (
      SELECT
        id, name, agency, state, source_id, data_source,
        ST_AsMVTGeom(
          ST_Transform(geom, 3857),
          ST_TileEnvelope(%s, %s, %s),
          4096, 256, true
        ) AS geom
      FROM parks
      WHERE %s AND ST_Intersects(geom, $1)
    ) q',
    z, x, y, where_clause
  ) USING tile_bbox INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
```

### 6.2 Update API route to pass filters

```javascript
// In app/api/tiles/parks/[...params]/route.js
export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url)
  const filterAgency = searchParams.get('agency')
  const filterState = searchParams.get('state')
  
  // ... existing validation ...
  
  const { data, error } = await supabaseServer.rpc('parks_tiles', {
    z: z,
    x: x,
    y: y,
    filter_agency: filterAgency || null,
    filter_state: filterState || null
  })
  
  // ... rest of code ...
}
```

---

## Step 7: Testing & Verification

### 7.1 Test tile generation

```sql
-- Test with different zoom levels
SELECT 
  z, x, y,
  length(parks_tiles(z, x, y)) as tile_size_bytes
FROM (
  VALUES (10, 512, 512), (12, 2048, 2048), (14, 8192, 8192)
) AS tiles(z, x, y);
```

### 7.2 Test API endpoint

```bash
# Test tile endpoint
curl -I http://localhost:3000/api/tiles/parks/10/512/512

# Should return:
# Content-Type: application/vnd.mapbox-vector-tile
# Status: 200
```

### 7.3 Monitor performance

- Check browser Network tab - should see tile requests
- Verify tiles are cached (check Cache-Control headers)
- Monitor Supabase function execution time

---

## Step 8: Migration Strategy

### Option A: Gradual Migration (Recommended)

1. Keep both GeoJSON and vector tiles working
2. Add feature flag to switch between them
3. Test thoroughly
4. Switch default to vector tiles
5. Remove GeoJSON code after validation

### Option B: Direct Switch

1. Implement vector tiles
2. Test in staging
3. Deploy to production
4. Monitor for issues

---

## Troubleshooting

### Issue: Tiles return empty
- **Check**: Geometry column populated?
- **Check**: Tile coordinates valid?
- **Check**: PostGIS function working?

### Issue: Tiles slow to generate
- **Solution**: Add spatial index on `geom` column
- **Solution**: Limit data per tile (add WHERE clause)
- **Solution**: Cache tiles in Redis/CDN

### Issue: Markers not showing
- **Check**: Source layer name matches ('parks')
- **Check**: Filter expressions correct
- **Check**: Browser console for errors

### Issue: Colors not working
- **Check**: Agency values match exactly
- **Check**: Match expressions in paint properties
- **Check**: Data in tile properties

---

## Performance Comparison

### Before (GeoJSON):
- Initial load: 2-3 seconds
- Data transfer: ~5-10MB
- Memory: 50-100MB
- Viewport change: 500-800ms

### After (Vector Tiles):
- Initial load: 0.5-1 second
- Data transfer: ~100-500KB
- Memory: 10-20MB
- Viewport change: 50-100ms

---

## Next Steps After Implementation

1. **Monitor tile generation performance**
2. **Add tile caching** (Redis or CDN)
3. **Optimize tile simplification** by zoom level
4. **Add server-side clustering** for even better performance
5. **Consider tile pre-generation** for popular areas

---

## Resources

- [PostGIS ST_AsMVT Documentation](https://postgis.net/docs/ST_AsMVT.html)
- [Mapbox Vector Tiles Specification](https://github.com/mapbox/vector-tile-spec)
- [Supabase PostGIS Guide](https://supabase.com/docs/guides/database/extensions/postgis)
- [Mapbox GL JS Vector Source](https://docs.mapbox.com/mapbox-gl-js/style-spec/sources/#vector)
