# API Sync Routing Issue - Troubleshooting Guide

## Problem
Requests to `/api/sync` are being routed to `/api/scrape` instead. This is a Next.js App Router routing issue.

## Symptoms
- API sync requests return: `"message": "TEST: Scraping undefined - undefined in undefined"`
- Vercel logs show: `"Scrape request received"` (red circles 🔴) instead of `"SYNC ROUTE CALLED"` (blue circles 🔵)
- Error message: "Request was routed to /api/scrape instead of /api/sync"

## Root Cause
This appears to be a Next.js App Router caching/routing bug where the route handler isn't being recognized correctly.

## Solutions (Try in Order)

### 1. Clear Vercel Build Cache
1. Go to Vercel Dashboard → Your Project → Settings → Functions
2. Clear the build cache
3. Redeploy

### 2. Force Rebuild by Touching Files
```bash
touch app/api/sync/route.js
git add app/api/sync/route.js
git commit -m "Force rebuild sync route"
git push
```

### 3. Check for Vercel Configuration
Check if there's a `vercel.json` file with rewrites or redirects that might interfere:
```bash
find . -name "vercel.json"
```

### 4. Temporarily Rename Scrape Route
To test if there's a route conflict:
```bash
mv app/api/scrape app/api/scrape-backup
git add -A
git commit -m "Temporarily disable scrape route to test sync route"
git push
```

Then test if `/api/sync` works. If it does, there's a route conflict.

### 5. Check Next.js Version
This might be a Next.js bug. Check your `package.json` for the Next.js version and consider updating:
```bash
npm list next
```

### 6. Verify File Structure
Ensure the route file exists and is properly named:
```bash
ls -la app/api/sync/route.js
ls -la app/api/scrape/route.js
```

Both should exist and be valid JavaScript files.

### 7. Check for Middleware
Check if there's a `middleware.js` or `middleware.ts` file that might be interfering:
```bash
find . -name "middleware.*"
```

### 8. Nuclear Option: Recreate Route File
If nothing else works, try deleting and recreating the route:
```bash
# Backup first
cp app/api/sync/route.js app/api/sync/route.js.backup

# Delete and recreate (copy from backup)
rm app/api/sync/route.js
# Then manually recreate or restore from backup
```

## Verification
After trying solutions, check:
1. Vercel logs should show blue circles (🔵) for sync route
2. Response should include `"route": "SYNC_ROUTE"`
3. Response should NOT include `"route": "SCRAPE_ROUTE"` or `"TEST: Scraping"`

## Current Status
- ✅ Route file exists and is properly structured
- ✅ Route has unique identifiers (blue circles, route: 'SYNC_ROUTE')
- ✅ Error detection in place
- ❌ Still routing to wrong endpoint (Next.js/Vercel issue)

## Next Steps
If this persists after trying all solutions, this may be:
1. A Next.js App Router bug (report to Next.js GitHub)
2. A Vercel deployment cache issue (contact Vercel support)
3. A file system/permissions issue on Vercel

Consider opening an issue with Next.js or Vercel support with:
- Next.js version
- Vercel deployment logs
- File structure
- Steps to reproduce

