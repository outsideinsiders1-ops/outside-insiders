# Vector Tiles Setup for Large Datasets

## Problem
Large shapefiles (2.5GB+, 15,000+ features) cannot be served directly to browsers as GeoJSON. They need to be served as vector tiles.

## Current Architecture
- ✅ PostGIS database (Supabase)
- ✅ Geometry stored in `geometry` column (geography type)
- ✅ Geometry simplification on upload (~500ft accuracy)
- ❌ No vector tile server
- ❌ Frontend uses Leaflet (doesn't support vector tiles well)

## Recommended Solution: Martin + MapLibre GL JS

### Step 1: Install Martin (Vector Tile Server)

Martin is a lightweight, fast vector tile server that works perfectly with PostGIS.

**Option A: Run Martin as a separate service**
```bash
# Download Martin binary
wget https://github.com/maplibre/martin/releases/latest/download/martin-linux-amd64
chmod +x martin-linux-amd64

# Run Martin pointing to your Supabase PostGIS database
./martin postgres://postgres:[PASSWORD]@[SUPABASE_HOST]:5432/postgres
```

**Option B: Deploy Martin on Vercel/Railway/Render**
- Create a new service that runs Martin
- Point it to your Supabase database connection string
- Martin will auto-detect tables with geometry columns

### Step 2: Update Frontend to Use MapLibre GL JS

Replace Leaflet with MapLibre GL JS (open-source fork of Mapbox GL JS) for vector tile support.

**Install:**
```bash
npm install maplibre-gl
```

**Update MapView component:**
- Use MapLibre GL JS instead of Leaflet
- Add vector tile source pointing to Martin endpoint
- Style layers for park boundaries

### Step 3: Update Upload Route

Current upload route already:
- ✅ Stores geometry in PostGIS
- ✅ Simplifies geometries
- ✅ Calculates centroids for map pins

**Additional optimizations needed:**
- Create simplified geometry column for different zoom levels
- Add spatial indexes (Supabase should do this automatically)
- Consider clustering for very dense areas

### Step 4: Serve Individual Park Boundaries

For park detail views, keep the current approach:
- Fetch individual park geometry on click
- Convert PostGIS geometry to GeoJSON
- Display on map

This works fine for single parks.

## Alternative: Use Supabase Edge Functions

If you can't run Martin separately, you could:
1. Create a Supabase Edge Function that serves vector tiles
2. Use PostGIS functions to generate MVT tiles on-demand
3. Cache tiles in Supabase Storage

This is more complex but keeps everything in Supabase.

## Migration Path

1. **Phase 1 (Current)**: Keep Leaflet for map pins, use GeoJSON for individual park boundaries
2. **Phase 2**: Add Martin server, test with small dataset
3. **Phase 3**: Update frontend to MapLibre, add vector tile layer for all parks
4. **Phase 4**: Optimize tile generation (simplification, clustering)

## Performance Expectations

- **Current (GeoJSON)**: 2.5GB file = unusable, browser crash
- **With Vector Tiles**: 2.5GB file = <2s load, smooth panning/zooming
- **Tile size**: ~50-200KB per tile (vs 2.5GB for full dataset)
- **Caching**: Tiles cached on CDN, instant repeat loads

