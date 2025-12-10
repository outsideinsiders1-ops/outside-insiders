# Recreation.gov API Sync - Deep Analysis & Best Practices

## Current Problems Identified

1. **Vercel Serverless Timeout (300 seconds)**
   - Current sync tries to fetch ~15,000 facilities in one request
   - Each facility requires multiple API calls (facility + addresses + geocoding)
   - Even with batching, this exceeds timeout limits

2. **Rate Limiting Issues**
   - Recreation.gov API has rate limits (not well documented)
   - Mapbox Geocoding API also has rate limits
   - Current approach hits both APIs sequentially, causing cascading delays

3. **Memory Constraints**
   - Loading 15,000+ facilities into memory at once
   - Processing all in a single serverless function

4. **Complex Multi-Step Process**
   - Fetch facilities → Fetch addresses → Geocode → Save to DB
   - Each step can fail independently
   - No checkpoint/resume capability

## Research Findings

### Recreation.gov API Characteristics

1. **Pagination**
   - Default limit: 50 facilities per page (max: 50)
   - Uses offset-based pagination
   - No official rate limit documentation, but appears to be ~10-20 requests/second

2. **Data Structure**
   - Main endpoint: `/facilities` - returns basic facility info
   - Address endpoint: `/facilities/{id}/addresses` - returns state info
   - Detail endpoint: `/facilities/{id}` - returns full facility details
   - Main endpoint includes `FACILITYADDRESS` array in response (state info often included)

3. **API Reliability**
   - Generally stable but can have intermittent issues
   - 429 rate limit responses are common under load
   - No webhook support - must poll

### Best Practices for Large API Syncs

1. **Incremental/Delta Syncs**
   - Only sync new/changed records
   - Use timestamps or change detection
   - Reduces load and time

2. **Background Job Processing**
   - Use job queues (Inngest, BullMQ, etc.)
   - Process in small batches
   - Automatic retries and error handling

3. **State Management**
   - Save progress/checkpoints
   - Resume from last successful batch
   - Track what's been processed

4. **Parallel Processing**
   - Process multiple facilities concurrently (within rate limits)
   - Use worker pools for independent tasks

5. **Deferred Geocoding**
   - Don't geocode during initial sync
   - Save parks without state, geocode later in background
   - Much faster initial sync

## Recommended Approaches (Ranked)

### Option 1: Inngest Scheduled Jobs (RECOMMENDED) ⭐

**How it works:**
- Create an Inngest function that runs on a schedule (daily/weekly)
- Function processes facilities in small batches (100-200 at a time)
- Each batch is a separate Inngest event/job
- Automatic retries, progress tracking, no timeout limits

**Pros:**
- ✅ No timeout limits (Inngest functions can run for hours)
- ✅ Automatic retries on failure
- ✅ Built-in progress tracking
- ✅ Can process incrementally over time
- ✅ Already set up in your project
- ✅ Can pause/resume easily

**Cons:**
- ⚠️ Takes longer to complete (but more reliable)
- ⚠️ Requires Inngest account (free tier available)

**Implementation:**
```
1. Scheduled trigger (daily at 2 AM)
2. Fetch batch of 200 facilities
3. Process and save to DB
4. Trigger next batch via event
5. Continue until all processed
6. Send completion notification
```

### Option 2: Vercel Cron Jobs + Incremental Sync

**How it works:**
- Use Vercel Cron Jobs (scheduled functions)
- Run daily, sync only new/changed facilities
- Process in small batches (200-500 per run)
- Track last sync timestamp

**Pros:**
- ✅ No additional service needed
- ✅ Incremental syncs are fast
- ✅ Built into Vercel
- ✅ Free tier available

**Cons:**
- ⚠️ Still limited to 300s per execution
- ⚠️ Need to track state between runs
- ⚠️ More complex state management

**Implementation:**
```
1. Cron job runs daily
2. Check last sync timestamp
3. Fetch facilities modified since last sync
4. Process batch (200-500 facilities)
5. Save timestamp
6. If more remain, trigger next batch
```

### Option 3: Two-Phase Approach (Current, but improved)

**How it works:**
- Phase 1: Fast bulk import (facilities endpoint only)
  - Fetch all facilities, save basic info
  - Skip geocoding, skip address fetching
  - Very fast, completes in < 5 minutes
  
- Phase 2: Background enrichment (Inngest jobs)
  - Process existing parks in batches
  - Fetch detailed facility data
  - Geocode missing states
  - Update parks incrementally

**Pros:**
- ✅ Fast initial sync
- ✅ Parks available immediately
- ✅ Enrichment happens in background
- ✅ Can retry enrichment independently

**Cons:**
- ⚠️ Two separate processes to manage
- ⚠️ Parks initially incomplete

### Option 4: Direct Database Import (One-time)

**How it works:**
- Download Recreation.gov data dump (if available)
- Or use their bulk export API (if exists)
- Import directly to PostGIS
- Much faster for initial load

**Pros:**
- ✅ Fastest for initial import
- ✅ No API rate limits
- ✅ Can process offline

**Cons:**
- ⚠️ May not be available
- ⚠️ One-time only, not for ongoing syncs
- ⚠️ Requires manual setup

## Recommended Solution: Hybrid Approach

### Initial Sync (One-time)
1. Use Inngest function to fetch all facilities
2. Process in batches of 200
3. Save basic info only (skip geocoding)
4. Complete in ~2-3 hours (but reliable)

### Ongoing Sync (Daily)
1. Vercel Cron Job runs daily
2. Fetch facilities modified in last 24 hours
3. Process small batch (200-500)
4. Update existing parks or add new ones

### Background Enrichment (Continuous)
1. Inngest scheduled job (runs continuously)
2. Processes parks missing state/amenities
3. Fetches detailed facility data
4. Updates parks incrementally
5. Never times out, auto-retries

## Key Improvements Needed

1. **Remove Geocoding from Initial Sync**
   - Save parks without state initially
   - Geocode later in background job
   - Cuts sync time by 80%

2. **Use Facilities Endpoint Only**
   - Main endpoint includes `FACILITYADDRESS` array
   - Don't fetch addresses separately unless needed
   - Cuts API calls by 50%

3. **Batch Processing**
   - Process 200-500 facilities per batch
   - Save progress between batches
   - Resume on failure

4. **State Management**
   - Track last sync timestamp
   - Track which facilities processed
   - Enable incremental syncs

5. **Error Handling**
   - Retry failed facilities individually
   - Don't fail entire batch on one error
   - Log errors for manual review

## Implementation Priority

1. **Immediate (Fix current issues):**
   - Remove geocoding from sync (save time)
   - Use FACILITYADDRESS from main response (reduce API calls)
   - Process in smaller batches (avoid timeout)

2. **Short-term (Improve reliability):**
   - Move to Inngest scheduled jobs
   - Add checkpoint/resume capability
   - Better error handling

3. **Long-term (Optimize):**
   - Implement incremental syncs
   - Add change detection
   - Background enrichment pipeline

## Questions to Answer Before Implementation

1. How often does Recreation.gov data change? (Daily? Weekly?)
   **Answer:** Not sure how often they update, but once we have the complete existing dataset, we only need to update it once a month to catch any new information.

2. Do we need real-time updates or is daily sync sufficient?
   **Answer:** Daily is fine if it's easy, but could be weekly or monthly.

3. How many facilities are we actually syncing? (15,000+ seems high)
   **Answer:** We are going to sync them all. While not ideal, we can create filters to filter out things like boat ramps and other items. There's an idea to add a layer with a fishing toggle that turns everything off except rivers, creeks, parks, lakes, boat ramps, reefs, etc. (Should be added to product roadmap)

4. Can we filter by state/region to reduce initial load?
   **Answer:** Not sure about this, especially if we're finding a bunch without the state listed. It may be best to just get them all in the dataset and then enrich them.

5. Is there a way to get only new/changed facilities?
   **Answer:** Not sure, but we have functionality built into the sync/upload/scrape system that checks if a facility exists first. Strong deduplication logic is in place.

## Next Steps

1. **Research Recreation.gov API more:**
   - Check for change detection endpoints
   - Look for bulk export options
   - Verify rate limits with Recreation.gov support

2. **Test batch sizes:**
   - Find optimal batch size (200-500 facilities)
   - Test rate limits
   - Measure processing time

3. **Implement Inngest scheduled job:**
   - Create function for batch processing
   - Add progress tracking
   - Test with small batch first

4. **Add state management:**
   - Track sync progress in database
   - Enable resume capability
   - Log errors for review

