# Mapbox Troubleshooting Guide

## Current Issue: Mapbox Falling Back to Leaflet/OpenStreetMap

### Why This Happens

The current implementation uses **Leaflet** with Mapbox tiles as a raster TileLayer. This is not the optimal way to use Mapbox, especially for large datasets.

**Current checks that cause fallback:**
1. ❌ Missing `NEXT_PUBLIC_MAPBOX_TOKEN` environment variable
2. ❌ Invalid token format (must start with `pk.`)
3. ❌ WebGL not supported in browser
4. ❌ Tile loading errors (network/CORS issues)

### How to Check What's Happening

1. **Open browser console** and look for these messages:
   - `"Mapbox token not found"` → Token not set
   - `"Invalid Mapbox token format"` → Token doesn't start with `pk.`
   - `"WebGL not supported"` → Browser doesn't support WebGL
   - `"Mapbox tile failed"` → Network/CORS issue

2. **Check environment variables in Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Verify `NEXT_PUBLIC_MAPBOX_TOKEN` is set
   - Value should start with `pk.`

3. **Test token directly:**
   ```bash
   curl "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/256/0/0/0@2x?access_token=YOUR_TOKEN"
   ```
   Should return a tile image, not an error.

### Recommended Solution: Use Mapbox GL JS

Since you're paying for Mapbox, you should use **Mapbox GL JS** instead of Leaflet:

**Benefits:**
- ✅ Native vector tile support (perfect for large datasets)
- ✅ Better performance with large datasets
- ✅ Access to Mapbox's full feature set
- ✅ Better rendering quality
- ✅ Supports 3D terrain, custom styles, etc.

**Migration Path:**
1. Install `mapbox-gl` package
2. Replace Leaflet MapView with Mapbox GL JS
3. Keep individual park boundaries as GeoJSON (works fine for single parks)
4. For large datasets, use vector tiles via Martin/pg_tileserv

### Quick Fixes

**If token is missing:**
1. Get your token from https://account.mapbox.com/access-tokens/
2. Add to Vercel: `NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here`
3. Redeploy

**If token format is wrong:**
- Mapbox tokens always start with `pk.`
- Make sure you're using a public token, not a secret token

**If WebGL is disabled:**
- Enable WebGL in browser settings
- Update graphics drivers
- Try a different browser

**If tiles fail to load:**
- Check CORS settings
- Verify token has correct scopes
- Check network tab for 401/403 errors

