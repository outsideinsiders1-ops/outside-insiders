/**
 * Inngest Client Configuration
 */

import { Inngest } from 'inngest'

// Initialize Inngest client
// Get API key from environment variable
export const inngest = new Inngest({
  id: 'outside-insiders',
  name: 'Outside Insiders',
  // Inngest will automatically detect if running in development or production
  // For production, set INNGEST_EVENT_KEY in environment variables
})

