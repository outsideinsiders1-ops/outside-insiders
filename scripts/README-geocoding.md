# Geocoding Missing Park Coordinates

## Overview
Parks need both `latitude` and `longitude` coordinates to display on the map. If parks are missing coordinates, they won't appear even though they exist in the database.

## Step 1: Diagnose the Problem

Run this SQL script in **Supabase SQL Editor**:
```
scripts/check-coordinates-after-normalization.sql
```

This will show you:
- How many parks are missing coordinates
- Which states are affected
- Which parks have geometry (can calculate centroids)
- Which parks need geocoding

## Step 2: Fix Parks with Geometry

If parks have geometry (boundaries) but no coordinates, you can calculate centroids using PostGIS.

Run this SQL script in **Supabase SQL Editor**:
```
scripts/geocode-missing-coordinates-sql.sql
```

This uses PostGIS `ST_Centroid()` to calculate the center point from the boundary geometry.

## Step 3: Geocode Parks Without Geometry

For parks without geometry, you need to use the Mapbox Geocoding API.

### Option A: Run Node.js Script (Recommended)

**This is NOT in SQL Editor - it's a terminal command!**

1. Open your terminal/command prompt
2. Navigate to your project directory:
   ```bash
   cd /path/to/outside-insiders-current
   ```

3. Set environment variables:
   ```bash
   export NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
   export SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

   Or on Windows:
   ```cmd
   set NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
   set SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

4. Run the script:
   ```bash
   node scripts/geocode-missing-coordinates.js
   ```

The script will:
- Find all parks missing coordinates
- Attempt to geocode them using park name + state
- Update the database with coordinates
- Show progress and results

### Option B: Manual Geocoding

If you prefer, you can manually geocode parks using:
- Mapbox Geocoding API: https://docs.mapbox.com/api/search/geocoding/
- Google Geocoding API
- Or any other geocoding service

## Important Notes

1. **Normalization Script**: The state normalization script (`normalize-states.sql`) only updates the `state` column. It does NOT touch `latitude` or `longitude` columns, so it couldn't have removed coordinates.

2. **Map Display**: The map only shows parks with valid coordinates. This is by design - parks without coordinates can't be placed on a map.

3. **Rate Limits**: 
   - Mapbox Geocoding API: 600 requests/minute
   - The Node.js script includes rate limiting (100ms delay between requests)

4. **Coordinate Validation**: The script validates coordinates are in valid ranges:
   - Latitude: -90 to 90
   - Longitude: -180 to 180

## Troubleshooting

### "Cannot find module" error
Make sure you're in the project root directory and have installed dependencies:
```bash
npm install
```

### "MAPBOX_TOKEN not found" error
Set the environment variable before running:
```bash
export NEXT_PUBLIC_MAPBOX_TOKEN=your_token
```

### "Supabase credentials not found" error
Set the Supabase service role key:
```bash
export SUPABASE_SERVICE_ROLE_KEY=your_key
```

You can find your Supabase service role key in:
Supabase Dashboard → Settings → API → service_role key (secret)

