# Inngest Background Job Setup

This project uses [Inngest](https://www.inngest.com/) for processing large park files in the background, avoiding Vercel's timeout and memory limits.

## Setup

1. **Sign up for Inngest** (free tier available)
   - Go to https://www.inngest.com/
   - Create an account
   - Create a new app

2. **Get your Inngest credentials**
   - In your Inngest dashboard, go to Settings → Keys
   - Copy your **Event Key** (for sending events)
   - Copy your **Signing Key** (for webhook verification)

3. **Add environment variables**
   Add these to your `.env.local` file:
   ```bash
   INNGEST_EVENT_KEY=your_event_key_here
   INNGEST_SIGNING_KEY=your_signing_key_here
   ```

4. **Deploy the Inngest API route**
   The route is already set up at `/app/api/inngest/route.js`
   - Inngest will automatically discover your functions
   - Make sure this route is accessible at: `https://your-domain.com/api/inngest`

5. **Sync your functions**
   - In your Inngest dashboard, go to Apps → Your App
   - Click "Sync" to discover your functions
   - You should see `process-park-file` function listed

## How It Works

### Automatic Background Processing

When a file is uploaded that is:
- **Larger than 500MB**, OR
- **Uploaded in chunks** (has a `filePath`)

The system automatically queues it for background processing via Inngest.

### Manual Triggering

You can also manually trigger background processing by sending an event:

```javascript
import { inngest } from './inngest/client.js'

await inngest.send({
  name: 'file/process',
  data: {
    filePath: 'uploads/your-file.zip',
    bucketName: 'park-uploads',
    sourceType: 'State Agency',
    sourceName: 'Park Serve',
    defaultState: 'CA'
  }
})
```

## Monitoring

- View job status in the Inngest dashboard
- Jobs automatically retry up to 3 times on failure
- Processing progress is logged to console
- Check Vercel logs for detailed processing information

## Benefits

- ✅ **No timeout limits** - Process files of any size
- ✅ **Automatic retries** - Failed jobs retry automatically
- ✅ **Progress tracking** - Monitor job status in dashboard
- ✅ **Concurrency control** - Process max 2 files at a time
- ✅ **Memory efficient** - Streaming processing avoids memory issues

## Troubleshooting

### Jobs not running
- Check that `/api/inngest` route is accessible
- Verify environment variables are set correctly
- Check Inngest dashboard for error messages

### Jobs failing
- Check Vercel logs for detailed error messages
- Verify Supabase credentials are correct
- Ensure file exists in storage at the specified path

### Development
- Inngest has a local dev server: `npx inngest-cli dev`
- This allows testing functions locally before deploying

