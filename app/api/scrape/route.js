/**
 * Next.js API Route: /api/scrape
 * Handles park scraping requests
 */

export async function POST(request) {
  try {
    const body = await request.json()
    const { type, name, state } = body
    
    console.log('Scrape request received:', { type, name, state })
    
    // For now, return a test response to verify the endpoint works
    return Response.json({ 
      success: true, 
      message: `TEST: Scraping ${type} - ${name} in ${state}`,
      parksFound: 0,
      parksAdded: 0,
      parksUpdated: 0,
      parksSkipped: 0,
      note: 'This is a test response - scraping logic coming next!'
    })
    
  } catch (error) {
    console.error('API Error:', error)
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

