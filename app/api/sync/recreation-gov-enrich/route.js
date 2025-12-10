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

    try {
      // Trigger the orchestrator function
      const result = await inngest.send({
        name: 'recreation-gov/start-enrichment',
        data: {
          apiKey: effectiveApiKey,
          batchSize: parseInt(batchSize) || 50
        }
      })

      // Inngest returns {ids: [...]} - extract first ID for display
      const eventId = result?.ids?.[0] || 'Unknown'

      console.log(`✅ Enrichment event sent. Event IDs: ${result?.ids?.join(', ') || 'Unknown'}`)

      return Response.json({
        success: true,
        message: 'Recreation.gov enrichment process started',
        eventId: eventId,
        eventIds: result?.ids || [],
        details: 'The enrichment process is running in the background. Facilities will be processed in batches and enriched with detailed data from the facility{id} endpoint.'
      }, { status: 200, headers })
    } catch (inngestError) {
      console.error('Inngest send error:', inngestError)
      // Check if Inngest is properly configured
      if (inngestError.message?.includes('INNGEST_EVENT_KEY') || inngestError.message?.includes('signing key')) {
        return Response.json({
          success: false,
          error: 'Inngest not configured',
          message: 'Inngest event key is missing. Please set INNGEST_EVENT_KEY environment variable.',
          details: 'The enrichment process requires Inngest to be properly configured. Check your environment variables.'
        }, { status: 500, headers })
      }
      throw inngestError // Re-throw to be caught by outer catch
    }

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
