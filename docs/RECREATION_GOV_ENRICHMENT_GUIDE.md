# Recreation.gov Enrichment Guide

## Overview

This guide explains the new Recreation.gov facility enrichment system that processes facilities in the background using Inngest jobs.

## What Changed

### 1. Removed Geocoding from Initial Sync
- The `/api/sync` route no longer performs geocoding for Recreation.gov facilities
- Facilities are saved with basic information from the main facilities endpoint
- This significantly speeds up the initial sync and avoids timeout issues

### 2. Background Enrichment via Inngest
- New Inngest functions process facilities in batches
- Each facility is enriched with detailed data from the `facility{id}` endpoint
- Jobs run continuously in the background, respecting rate limits

## How to Use

### Step 1: Run Initial Sync (if not done already)

First, sync all Recreation.gov facilities to get them into the database:

```bash
POST /api/sync
{
  "sourceType": "Recreation.gov",
  "apiKey": "your-recreation-gov-api-key"
}
```

This will:
- Fetch all facilities from Recreation.gov
- Save basic information (name, coordinates, etc.)
- Skip geocoding (faster)
- Complete in a few minutes

### Step 2: Start Enrichment Process

Once facilities are in the database, trigger the enrichment process:

```bash
POST /api/sync/recreation-gov-enrich
{
  "apiKey": "your-recreation-gov-api-key",
  "batchSize": 50
}
```

This will:
- Find all Recreation.gov facilities in the database
- Split them into batches (default: 50 facilities per batch)
- Trigger Inngest jobs to process each batch
- Jobs run with concurrency limit of 1 (to respect rate limits)
- Each facility is enriched with detailed data from `facility{id}` endpoint

### Step 3: Monitor Progress

The enrichment process runs in the background. You can monitor it via:
- Inngest dashboard (if configured)
- Database queries to check which facilities have been enriched
- Application logs

## Timing

For ~15,000 facilities:
- Batch size: 50 facilities per batch
- Total batches: ~300 batches
- Processing time per batch: ~5-10 seconds (with rate limiting)
- Total time: ~2.5 hours (as requested)

The jobs will automatically:
- Process batches sequentially (concurrency limit: 1)
- Retry failed batches (up to 3 retries)
- Continue until all facilities are processed

## What Gets Enriched

Each facility is updated with:
- **State** (if missing, extracted from addresses)
- **Description** (if more detailed than existing)
- **Phone/Email** (if missing)
- **Activities** (merged with existing)
- **Amenities** (merged with existing)
- **Website** (if missing)
- **Coordinates** (if missing)

## Deduplication

The system uses strong deduplication logic:
- Matches by `source_id` first (most reliable)
- Falls back to name + state matching
- Uses fuzzy matching for similar names
- Prevents duplicate entries

## API Endpoints

### `/api/sync` (existing)
- Syncs Recreation.gov facilities
- No geocoding (removed for speed)
- Saves basic facility information

### `/api/sync/recreation-gov-enrich` (new)
- Triggers background enrichment process
- Requires Recreation.gov API key
- Optional `batchSize` parameter (default: 50)

## Environment Variables

Make sure these are set:
- `RECREATION_GOV_API_KEY` or `NEXT_PUBLIC_RECREATION_GOV_API_KEY`
- Inngest configuration (if using Inngest cloud)

## Troubleshooting

### Jobs not running
- Check Inngest configuration
- Verify API key is valid
- Check application logs for errors

### Rate limiting
- The system includes rate limiting (100ms between requests)
- If you hit rate limits, jobs will retry automatically
- Consider reducing batch size if needed

### Missing data
- Some facilities may not have all fields available
- The system only updates fields that are missing or can be improved
- Check individual facility responses for available data
