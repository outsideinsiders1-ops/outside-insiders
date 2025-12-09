# Processing Large Park Files

This directory contains scripts for processing large park data files that exceed Vercel's serverless function memory limits.

## process-large-file.js

A local Node.js script that processes large shapefile/GeoJSON files and uploads them to Supabase in batches.

### Prerequisites

1. Node.js installed on your computer
2. Your `.env.local` file with Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

### Installation

The script uses existing project dependencies. Make sure you've run:
```bash
npm install
```

### Usage

#### Process a Local File

```bash
node scripts/process-large-file.js ./path/to/your/file.zip
```

#### Process a File from Supabase Storage

First, upload your file to Supabase Storage (via the web interface), then:

```bash
node scripts/process-large-file.js "uploads/1234567890-your-file.zip" --from-storage
```

#### Options

- `--source-type <type>` - Source type (default: "State Agency")
- `--source-name <name>` - Source name (default: file name)
- `--default-state <code>` - Default state code if not in file (e.g., "CA", "NY")
- `--batch-size <number>` - Batch size for processing features (default: 500)
- `--upload-batch-size <number>` - Batch size for database uploads (default: 100)
- `--from-storage` - Download file from Supabase Storage instead of local filesystem

### Examples

```bash
# Process a local California state parks file
node scripts/process-large-file.js ./data/ca-parks.zip \
  --source-type "State Agency" \
  --source-name "California State Parks" \
  --default-state "CA"

# Process a large file with smaller batches (for very large files)
node scripts/process-large-file.js ./data/huge-file.zip \
  --batch-size 250 \
  --upload-batch-size 50

# Process a file already uploaded to Supabase Storage
node scripts/process-large-file.js "uploads/1765312215421-Parkserve_Shapefiles_05212025.zip" \
  --from-storage \
  --source-type "ParkServe" \
  --source-name "ParkServe Shapefiles 2025"
```

### How It Works

1. **Downloads/Reads the file** - Either from local filesystem or Supabase Storage
2. **Parses the file** - Converts shapefile/GeoJSON to standard format
3. **Processes in batches** - Extracts park data in configurable batch sizes
4. **Deduplicates** - Removes duplicate parks (keeps the one with larger area)
5. **Uploads to database** - Inserts/updates parks in Supabase in batches

### Progress Tracking

The script provides detailed progress information:
- Feature processing progress
- Batch upload progress
- Final summary with counts (added, updated, skipped)

### Troubleshooting

**Error: Missing Supabase credentials**
- Make sure `.env.local` exists in the project root
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

**Error: File not found**
- Check the file path is correct
- For local files, use relative paths from project root or absolute paths

**Error: Out of memory**
- Reduce `--batch-size` (try 250 or 100)
- Reduce `--upload-batch-size` (try 50)

**Error: Invalid GeoJSON format**
- Verify your file is a valid shapefile or GeoJSON
- Check file isn't corrupted

### Tips

- For very large files (>2GB), use smaller batch sizes
- Monitor your Supabase database size and quotas
- The script will continue processing even if some parks fail (they'll be marked as skipped)
- Check the console output for detailed error messages

