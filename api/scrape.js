/**
 * Vercel Serverless Function: /api/scrape
 * Handles park scraping requests
 */

// Test endpoint first - we'll add real scraping later
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { type, name, state } = req.body;
    
    console.log('Scrape request received:', { type, name, state });
    
    // For now, return a test response to verify the endpoint works
    return res.status(200).json({ 
      success: true, 
      message: `TEST: Scraping ${type} - ${name} in ${state}`,
      parksFound: 0,
      parksAdded: 0,
      parksUpdated: 0,
      parksSkipped: 0,
      note: 'This is a test response - scraping logic coming next!'
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
