# Large File Processing Guide

## Current Approach

The current system uses chunked uploads to Supabase Storage, then processes files in Vercel serverless functions. This works well for files up to ~1GB, but has limitations:

### Limitations
- **Vercel Memory Limits**: Serverless functions have ~1GB memory limit
- **Vercel Timeout**: Functions timeout after 5 minutes (Pro plan) or 10 seconds (Hobby)
- **Processing Time**: Large files can take hours to process
- **Chunk Detection**: Currently uses timestamp-based filenames, making re-upload detection difficult

## Alternative Approaches for Very Large Files (>1GB)

### Option 1: Pre-process Files Locally (Recommended)

**Best for:** One-time large dataset imports

1. **Use QGIS or GDAL** to:
   - Simplify geometries before upload
   - Split files by state/region
   - Convert to optimized GeoJSON
   - Remove unnecessary properties

2. **Command-line tools:**
   ```bash
   # Simplify geometries (reduces file size significantly)
   ogr2ogr -simplify 0.0001 output.geojson input.shp
   
   # Split by attribute (e.g., state)
   ogr2ogr -where "STATE='GA'" georgia.geojson input.shp
   
   # Remove unnecessary fields
   ogr2ogr -select "NAME,STATE,AGENCY" simplified.geojson input.shp
   ```

3. **Benefits:**
   - Much smaller files to upload
   - Faster processing
   - No server memory issues
   - Can process offline

### Option 2: Direct Database Import

**Best for:** Very large datasets that need to be imported once

1. **Use PostGIS tools directly:**
   ```bash
   # Import shapefile directly to PostGIS
   shp2pgsql -s 4326 -I large_file.shp parks_temp | psql your_database
   
   # Then process in database with SQL
   ```

2. **Benefits:**
   - Bypasses Vercel entirely
   - Much faster for large files
   - Can use database transactions
   - Better error handling

3. **Setup:**
   - Connect directly to Supabase PostGIS database
   - Use `psql` or database client
   - Run SQL scripts to process data

### Option 3: Background Job Processing

**Best for:** Regular large file uploads

1. **Use a job queue** (e.g., BullMQ, Bull):
   - Upload file to Supabase Storage
   - Create a job in queue
   - Process in background worker (separate from Vercel)
   - Update status via webhook or polling

2. **Worker Options:**
   - Railway, Render, or Fly.io for long-running processes
   - AWS Lambda with longer timeouts
   - Google Cloud Run with extended timeouts

3. **Benefits:**
   - No timeout limits
   - Better error handling and retries
   - Progress tracking
   - Can process multiple files in parallel

### Option 4: Streaming Processing

**Best for:** Very large files that can be processed incrementally

1. **Process file in chunks:**
   - Read file stream from Supabase Storage
   - Process features in batches
   - Insert to database incrementally
   - No need to load entire file in memory

2. **Implementation:**
   - Use Node.js streams
   - Process GeoJSON features one at a time
   - Batch database inserts

## Recommended Workflow for Large Files

1. **Pre-process locally:**
   - Simplify geometries (reduces size by 80-90%)
   - Split by state/region if possible
   - Remove unnecessary fields

2. **Upload in chunks:**
   - Current chunked upload system works well
   - Files are stored in Supabase Storage

3. **Process in batches:**
   - Current batch processing (1000 features) is good
   - Consider increasing batch size for very large files

4. **For files >2GB:**
   - Use Option 1 (pre-process locally) or Option 2 (direct DB import)
   - Consider splitting into multiple smaller files

## Improving Current System

### Better Chunk Detection

The current system uses timestamp-based filenames. To improve:

1. **Use file hash for chunk naming:**
   ```javascript
   // Generate hash from file content
   const fileHash = await generateFileHash(file)
   const filePath = `uploads/${fileHash}-${file.name}`
   ```

2. **Store upload metadata:**
   - Track uploaded files in database
   - Check if file hash already exists
   - Skip upload if already processed

3. **Resume failed uploads:**
   - Store upload state
   - Resume from last successful chunk
   - Better progress tracking

### Processing Optimization

1. **Stream processing:**
   - Don't load entire file in memory
   - Process features as they're read
   - Better for very large files

2. **Parallel processing:**
   - Process multiple batches in parallel
   - Use worker threads for CPU-intensive tasks
   - Better database connection pooling

## Quick Reference

**For files <500MB:** Current system works fine  
**For files 500MB-1GB:** Pre-process to simplify, then upload  
**For files >1GB:** Use local pre-processing or direct DB import  
**For regular large uploads:** Consider background job processing

