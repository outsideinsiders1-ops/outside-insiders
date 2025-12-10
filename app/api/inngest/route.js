/**
 * Inngest API Route
 * Handles webhooks from Inngest and serves the Inngest API
 */

import { serve } from 'inngest/next'
import { inngest } from '../../../inngest/client.js'
import { 
  processParkFile, 
  enrichRecreationGovFacilities, 
  startRecreationGovEnrichment 
} from '../../../inngest/functions.js'

// Serve Inngest API
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processParkFile,
    enrichRecreationGovFacilities,
    startRecreationGovEnrichment
  ]
})

