/**
 * API Endpoint: /api/scrape
 * This handles scraping requests from your Admin Panel
 */

import { createClient } from '@supabase/supabase-js';
import { calculateQualityScore, getSourcePriority, shouldUpdatePark, validateParkData } from '../lib/qualityScorer';

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Allow requests from your domain
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Main handler for scraping
 */
export default async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { type, name } = req.body;
    
    // Check required fields
    if (!type || !name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing type or name' 
      });
    }
    
    console.log(`📡 Scraping ${type}: ${name}`);
    
    // For now, only handle state parks
    if (type !== 'state') {
      return res.status(200).json({ 
        success: true, 
        message: `County and city scraping coming soon!`,
        parksFound: 0
      });
    }
    
    // Scrape the parks
    const results = await scrapeStateParks(name);
    
    // Return results
    return res.status(200).json({ 
      success: true, 
      message: `Found ${results.found} parks for ${name}`,
      parksFound: results.found,
      parksAdded: results.added,
      parksUpdated: results.updated,
      parksSkipped: results.skipped
    });
    
  } catch (error) {
    console.error('Scraping error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * Scrape state parks - SIMPLIFIED VERSION FOR TESTING
 */
async function scrapeStateParks(stateName) {
  const stats = {
    found: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };
  
  try {
    console.log(`🔍 Starting scrape for ${stateName}`);
    
    // Get state park website URL
    const websiteUrl = getStateParkWebsite(stateName);
    if (!websiteUrl) {
      console.log(`No website configured for ${stateName}`);
      return stats;
    }
    
    // Fetch the website
    console.log(`📡 Fetching ${websiteUrl}`);
    const response = await fetch(websiteUrl);
    const html = await response.text();
    
    // Extract parks from HTML
    const parks = extractParksFromHtml(html, stateName);
    stats.found = parks.length;
    
    console.log(`📦 Found ${parks.length} parks`);
    
    // Process each park
    for (const parkData of parks) {
      try {
        // Add quality score
        const qualityResult = calculateQualityScore(parkData);
        parkData.data_quality_score = qualityResult.score;
        
        // Add source priority (web scrape = 40)
        parkData.data_source_priority = getSourcePriority('web_scrape');
        parkData.data_source = 'web_scrape';
        
        // Validate
        const validation = validateParkData(parkData);
        if (!validation.isValid) {
          console.error(`Invalid park data:`, validation.errors);
          stats.errors++;
          continue;
        }
        
        // Check if exists
        const { data: existing } = await supabase
          .from('parks')
          .select('*')
          .eq('name', parkData.name)
          .eq('state', parkData.state)
          .maybeSingle();
        
        if (existing) {
          // Check if we should update
          const decision = shouldUpdatePark(existing, parkData);
          
          if (decision.shouldUpdate) {
            // Update park
            await supabase
              .from('parks')
              .update(parkData)
              .eq('id', existing.id);
            
            console.log(`✅ Updated: ${parkData.name}`);
            stats.updated++;
          } else {
            console.log(`⏭️ Skipped: ${parkData.name} - ${decision.reason}`);
            stats.skipped++;
          }
        } else {
          // Insert new park
          await supabase
            .from('parks')
            .insert(parkData);
          
          console.log(`✅ Added: ${parkData.name}`);
          stats.added++;
        }
        
      } catch (error) {
        console.error(`Error processing park:`, error);
        stats.errors++;
      }
    }
    
    console.log(`✅ Scraping complete:`, stats);
    
  } catch (error) {
    console.error(`Scraping failed for ${stateName}:`, error);
  }
  
  return stats;
}

/**
 * Get state park website URL
 */
function getStateParkWebsite(stateName) {
  const websites = {
    'North Carolina': 'https://www.ncparks.gov',
    'South Carolina': 'https://southcarolinaparks.com',
    'Georgia': 'https://gastateparks.org',
    'Tennessee': 'https://tnstateparks.com',
    'Virginia': 'https://www.dcr.virginia.gov/state-parks',
    'Florida': 'https://www.floridastateparks.org',
    'Alabama': 'https://www.alapark.com',
    'Kentucky': 'https://parks.ky.gov',
    'West Virginia': 'https://wvstateparks.com',
    'Ohio': 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/state-parks-lodges',
  };
  
  return websites[stateName];
}

/**
 * Extract parks from HTML - BASIC VERSION
 * This finds links that look like park pages
 */
function extractParksFromHtml(html, stateName) {
  const parks = [];
  
  try {
    // Find all links that might be parks
    // Looking for patterns like "park", "recreation", "lake", "forest"
    const parkPatterns = [
      /[^>]*state park/gi,
      /[^>]*recreation area/gi,
      /[^>]*lake[^>]*park/gi,
      /[^>]*forest/gi,
      /[^>]*beach/gi,
      /[^>]*mountain/gi
    ];
    
    // Extract park names from links and headings
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]+)</gi;
    let match;
    const foundParks = new Set();
    
    while ((match = linkRegex.exec(html)) !== null) {
      const [_, url, text] = match;
      const cleanText = text.trim();
      
      // Check if this looks like a park name
      for (const pattern of parkPatterns) {
        if (pattern.test(cleanText)) {
          // Avoid duplicates
          if (!foundParks.has(cleanText)) {
            foundParks.add(cleanText);
            
            parks.push({
              name: cleanText,
              state: stateName,
              agency: 'State',
              website: url.startsWith('http') ? url : null,
              description: `State park in ${stateName}`,
              // These would be filled in with more advanced scraping
              latitude: null,
              longitude: null,
              amenities: [],
              activities: []
            });
            
            // Limit to prevent too many results
            if (parks.length >= 10) break;
          }
        }
      }
      
      if (parks.length >= 10) break;
    }
    
    // If no parks found with patterns, try a simpler approach
    if (parks.length === 0) {
      console.log('No parks found with patterns, adding test park');
      parks.push({
        name: `${stateName} Test State Park`,
        state: stateName,
        agency: 'State',
        description: `Test park for ${stateName} (scraper needs improvement)`,
        latitude: null,
        longitude: null,
        amenities: ['Information'],
        activities: ['Sightseeing']
      });
    }
    
  } catch (error) {
    console.error('Error extracting parks:', error);
  }
  
  return parks;
}
