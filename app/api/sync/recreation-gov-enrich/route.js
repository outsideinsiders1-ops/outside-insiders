/**
 * API Route to trigger Recreation.gov facility enrichment via Inngest
 * This starts background jobs to enrich all Recreation.gov facilities with detailed data
 */

import { inngest } from '../../../../inngest/client.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute (just to trigger the job)

export async function POST(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { apiKey, batchSize = 50 } = body

    // Get API key from request or environment
    const effectiveApiKey = apiKey || 
      process.env.RECREATION_GOV_API_KEY || 
      process.env.NEXT_PUBLIC_RECREATION_GOV_API_KEY

    if (!effectiveApiKey) {
      return Response.json({
        success: false,
        error: 'API key is required',
        details: 'Please provide a Recreation.gov API key in the request body or set it as an environment variable.'
      }, { status: 400, headers })
    }

    console.log('🚀 Triggering Recreation.gov enrichment process via Inngest')

    // Trigger the orchestrator function
    const eventId = await inngest.send({
      name: 'recreation-gov/start-enrichment',
      data: {
        apiKey: effectiveApiKey,
        batchSize: parseInt(batchSize) || 50
      }
    })

    return Response.json({
      success: true,
      message: 'Recreation.gov enrichment process started',
      eventId,
      details: 'The enrichment process is running in the background. Facilities will be processed in batches and enriched with detailed data from the facility{id} endpoint.'
    }, { status: 200, headers })

  } catch (error) {
    console.error('Error triggering Recreation.gov enrichment:', error)
    return Response.json({
      success: false,
      error: 'Failed to trigger enrichment process',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500, headers })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
