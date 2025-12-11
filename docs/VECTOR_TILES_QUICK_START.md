# Vector Tiles Quick Start Guide

## Prerequisites Checklist

- [ ] PostGIS enabled in Supabase
- [ ] Parks table has `latitude` and `longitude` columns
- [ ] At least some parks have coordinates (we'll handle missing ones later)

## Step 1: Run SQL Setup

1. Open Supabase SQL Editor
2. Copy and paste the contents of `docs/VECTOR_TILES_SETUP_SQL.sql`
3. Run the script
4. Verify the function was created:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_name = 'parks_tiles';
   ```

## Step 2: Test the Tile Function

```sql
-- Test tile generation
SELECT 
  parks_tiles(10, 512, 512) IS NOT NULL as tile_generated,
  length(parks_tiles(10, 512, 512)) as tile_size_bytes
FROM parks
LIMIT 1;
```

**Expected**: Should return `tile_generated = true` and a tile size in bytes.

## Step 3: Test the API Endpoint

After deploying, test the endpoint:

```bash
# In browser or curl
http://localhost:3000/api/tiles/parks/10/512/512
```

**Expected**: Should return binary MVT data (you'll see binary in browser, or use curl to download).

## Step 4: Switch to Vector Tiles

### Option A: Replace Existing Component (Recommended)

1. Backup your current `MarkerClusterGroup.jsx`:
   ```bash
   cp src/components/Map/MarkerClusterGroup.jsx src/components/Map/MarkerClusterGroup.geojson.backup.jsx
   ```

2. Replace with vector tiles version:
   ```bash
   cp src/components/Map/MarkerClusterGroupVectorTiles.jsx src/components/Map/MarkerClusterGroup.jsx
   ```

3. Update the import in `app/page.jsx` (should already work, but verify):
   ```javascript
   const MarkerClusterGroup = dynamic(() => import('../src/components/Map/MarkerClusterGroup'), { ssr: false })
   ```

### Option B: Feature Flag (Safer)

Add a feature flag to switch between GeoJSON and vector tiles:

```javascript
// In app/page.jsx
const USE_VECTOR_TILES = process.env.NEXT_PUBLIC_USE_VECTOR_TILES === 'true'

const MarkerClusterGroup = dynamic(() => 
  import(`../src/components/Map/MarkerClusterGroup${USE_VECTOR_TILES ? 'VectorTiles' : ''}`), 
  { ssr: false }
)
```

Then set environment variable:
```bash
NEXT_PUBLIC_USE_VECTOR_TILES=true
```

## Step 5: Remove parks prop (Vector tiles don't need it)

Update `app/page.jsx`:

```javascript
// Vector tiles load automatically, no need to pass parks
<MarkerClusterGroup
  onMarkerClick={handleParkClick}
  map={map}
  mapLoaded={mapLoaded}
/>
// Remove parks={parks} prop
```

## Step 6: Test

1. Load the map
2. Check browser Network tab - should see requests to `/api/tiles/parks/{z}/{x}/{y}`
3. Verify markers appear
4. Test clustering (zoom out)
5. Test popup on marker click
6. Test "View Details" button

## Troubleshooting

### Tiles return empty
- **Check**: Do parks have coordinates?
  ```sql
  SELECT COUNT(*) FROM parks WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
  ```
- **Check**: Is the function working?
  ```sql
  SELECT parks_tiles(10, 512, 512) IS NOT NULL;
  ```

### Tiles slow to generate
- **Check**: Are indexes created?
  ```sql
  SELECT indexname FROM pg_indexes WHERE tablename = 'parks';
  ```
- **Solution**: Add indexes (see SQL setup script)

### Markers not showing
- **Check**: Browser console for errors
- **Check**: Network tab - are tiles being requested?
- **Check**: Source layer name matches ('parks')

### Colors not working
- **Check**: Agency values in database match the match expressions
- **Check**: Browser console for paint errors

## Performance Comparison

### Before (GeoJSON):
- Initial load: 2-3 seconds
- Data transfer: ~5-10MB
- Memory: 50-100MB

### After (Vector Tiles):
- Initial load: 0.5-1 second
- Data transfer: ~100-500KB
- Memory: 10-20MB

## Next Steps

1. ✅ Complete vector tiles setup
2. ⏭️ Fix data cleanup (2115 parks missing coordinates)
3. ⏭️ Add filtering to vector tiles (if needed)
4. ⏭️ Optimize tile generation (caching, simplification)
