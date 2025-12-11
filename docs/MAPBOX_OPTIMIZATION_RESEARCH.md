# Mapbox GL JS Optimization & Capabilities Research

## Current Implementation Analysis

### What We're Currently Using
- ✅ Mapbox GL JS for map rendering
- ✅ Clustering for point data (`clusterMaxZoom: 12`, `clusterRadius: 50`)
- ✅ Viewport-based data loading (server-side API with bounds filtering)
- ✅ Server-side caching (5-minute TTL)
- ✅ Client-side caching (2-minute TTL)
- ✅ Debounced viewport updates (800ms)
- ✅ GeoJSON source for park markers

### What We're Missing (Opportunities)

## 1. Vector Tiles (Major Performance Opportunity)

### Current: GeoJSON Source
- **Problem**: Entire GeoJSON dataset loaded into browser memory
- **Limitation**: All parks sent to client, even outside viewport
- **Performance**: Slower with large datasets (>10k points)

### Opportunity: PostGIS Vector Tiles via Supabase
- **Benefit**: Only visible tiles loaded, dramatically reduced data transfer
- **Implementation**: Use Supabase PostGIS `ST_AsMVT` function
- **Performance Gain**: 10-100x reduction in data transfer for large datasets

**How to Implement:**
```sql
-- Create a function to generate vector tiles
CREATE OR REPLACE FUNCTION parks_tiles(z int, x int, y int)
RETURNS bytea AS $$
  SELECT ST_AsMVT(q, 'parks', 4096, 'geom')
  FROM (
    SELECT
      id,
      name,
      agency,
      state,
      ST_AsMVTGeom(
        ST_Transform(geom, 3857),
        ST_TileEnvelope(z, x, y),
        4096,
        64,
        true
      ) AS geom
    FROM parks
    WHERE ST_Intersects(
      ST_Transform(geom, 3857),
      ST_TileEnvelope(z, x, y)
    )
  ) q;
$$ LANGUAGE SQL STABLE;
```

**Mapbox Integration:**
```javascript
map.addSource('parks-tiles', {
  type: 'vector',
  tiles: [`${SUPABASE_URL}/rest/v1/rpc/parks_tiles/{z}/{x}/{y}`],
  minzoom: 0,
  maxzoom: 14
})
```

## 2. Server-Side Clustering with PostGIS

### Current: Client-Side Clustering
- Clustering happens in browser after all data loaded
- Still requires all data to be sent

### Opportunity: ST_ClusterDBSCAN in PostGIS
- Cluster on server before sending to client
- Only send cluster centers and counts
- Expand clusters on zoom

**Implementation:**
```sql
-- Cluster parks by zoom level
WITH clustered AS (
  SELECT
    ST_ClusterDBSCAN(geom, 0.01, 5) OVER() AS cluster_id,
    id, name, agency, state, geom
  FROM parks
  WHERE ST_Intersects(geom, ST_MakeEnvelope(...))
)
SELECT
  cluster_id,
  COUNT(*) as point_count,
  ST_Centroid(ST_Collect(geom)) as center,
  array_agg(id) as park_ids
FROM clustered
GROUP BY cluster_id;
```

## 3. Spatial Indexing Optimization

### Current Status: Unknown
- Need to verify spatial indexes exist on `parks` table

### Required Indexes:
```sql
-- GIST index for geometry column (if using PostGIS geometry)
CREATE INDEX IF NOT EXISTS idx_parks_geom ON parks USING GIST (geom);

-- Index for latitude/longitude queries (current implementation)
CREATE INDEX IF NOT EXISTS idx_parks_lat_lng ON parks (latitude, longitude);

-- Composite index for viewport queries
CREATE INDEX IF NOT EXISTS idx_parks_bounds ON parks (latitude, longitude, state, agency);
```

## 4. Tile Simplification by Zoom Level

### Strategy:
- **Zoom 0-6**: Show only major parks (filter by size/importance)
- **Zoom 7-9**: Show all parks with simplified boundaries
- **Zoom 10+**: Show full detail

**PostGIS Implementation:**
```sql
SELECT
  CASE
    WHEN $zoom < 7 THEN ST_Simplify(geom, 0.1)
    WHEN $zoom < 10 THEN ST_Simplify(geom, 0.01)
    ELSE geom
  END as simplified_geom
FROM parks;
```

## 5. WebGL Performance Optimizations

### Current: Basic Symbol Rendering
- Markers rendered as individual symbols

### Opportunities:
- **Symbol Sort Key**: Batch draw calls for same-colored markers
- **Data-Driven Styling**: Use `match` expressions for agency colors
- **Layer Optimization**: Combine similar layers

**Example:**
```javascript
map.addLayer({
  id: 'parks-markers',
  type: 'circle',
  source: 'parks-tiles',
  paint: {
    'circle-color': [
      'match',
      ['get', 'agency'],
      'NPS', '#ff0000',
      'USFS', '#00ff00',
      'BLM', '#0000ff',
      '#888888' // default
    ],
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['zoom'],
      0, 3,
      14, 8
    ]
  }
})
```

## 6. Supabase Real-time for Live Updates

### Opportunity: Real-time Park Updates
- Subscribe to park changes via Supabase Realtime
- Update map markers without full refresh
- Useful for admin updates, new park additions

**Implementation:**
```javascript
const channel = supabase
  .channel('parks-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'parks'
  }, (payload) => {
    // Update map markers based on change
    updateParkMarker(payload.new, payload.eventType)
  })
  .subscribe()
```

## 7. Progressive Data Loading

### Current: Load all parks in viewport at once

### Opportunity: Progressive Loading
- Load high-priority parks first (NPS, large parks)
- Load lower-priority parks in background
- Show loading indicators per category

## 8. Boundary Rendering Optimization

### Current: Full boundary GeoJSON loaded per park

### Opportunity: Simplified Boundaries by Zoom
- Use `ST_Simplify` for boundaries at lower zooms
- Only show boundaries when zoomed in enough
- Cache simplified boundaries

## 9. Mapbox Studio Custom Styles

### Opportunity: Custom Map Style
- Create custom style in Mapbox Studio
- Pre-configure layers, colors, typography
- Better performance than runtime style changes

## 10. Offline Capability with Mapbox

### Opportunity: Offline Map Support
- Cache map tiles for offline use
- Store park data in IndexedDB
- Useful for areas with poor connectivity

## Recommended Implementation Priority

### Phase 1 (High Impact, Medium Effort)
1. ✅ **Verify spatial indexes** - Quick win, immediate performance boost
2. ✅ **Implement vector tiles** - Major performance improvement for large datasets
3. ✅ **Add server-side clustering** - Reduce data transfer significantly

### Phase 2 (Medium Impact, Medium Effort)
4. ✅ **Tile simplification by zoom** - Better performance at low zooms
5. ✅ **Progressive loading** - Better perceived performance
6. ✅ **Boundary simplification** - Faster boundary rendering

### Phase 3 (Nice to Have)
7. ✅ **Real-time updates** - For live data scenarios
8. ✅ **Custom Mapbox Studio style** - Branding and consistency
9. ✅ **Offline support** - For specific use cases

## Performance Benchmarks (Expected)

### Current (GeoJSON, ~10k parks):
- Initial load: ~2-3 seconds
- Viewport change: ~500-800ms
- Memory usage: ~50-100MB

### With Vector Tiles:
- Initial load: ~0.5-1 second
- Viewport change: ~100-200ms
- Memory usage: ~10-20MB

### With Server-Side Clustering:
- Initial load: ~0.3-0.5 seconds
- Viewport change: ~50-100ms
- Memory usage: ~5-10MB

## Integration with Current Architecture

### Supabase + PostGIS Setup Required:
1. Enable PostGIS extension in Supabase
2. Convert `latitude`/`longitude` to PostGIS `geometry` column (or add alongside)
3. Create spatial indexes
4. Create vector tile generation function
5. Set up tile endpoint in Next.js API route

### Mapbox Changes Required:
1. Replace GeoJSON source with vector tile source
2. Update layer definitions for vector tiles
3. Adjust clustering configuration
4. Update click handlers for vector tile features

## Resources

- [Mapbox Vector Tiles Guide](https://docs.mapbox.com/help/glossary/vector-tiles/)
- [PostGIS ST_AsMVT Documentation](https://postgis.net/docs/ST_AsMVT.html)
- [Supabase PostGIS Guide](https://supabase.com/docs/guides/database/extensions/postgis)
- [Mapbox Performance Best Practices](https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/)

## Next Steps

1. **Audit current database**: Check for spatial indexes, PostGIS setup
2. **Benchmark current performance**: Measure load times, memory usage
3. **Implement Phase 1 optimizations**: Start with indexes, then vector tiles
4. **Measure improvements**: Compare before/after metrics
5. **Iterate**: Continue with Phase 2 based on results
