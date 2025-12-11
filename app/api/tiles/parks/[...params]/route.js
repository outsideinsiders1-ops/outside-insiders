/**
 * API Route: /api/tiles/parks/[z]/[x]/[y]
 * Serves vector tiles for parks from Supabase PostGIS
 */

import { supabaseServer } from '../../../../../lib/supabase-server.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

export async function GET(request, { params }) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
  }

  try {
    const { params: routeParams } = params
    const [z, x, y] = routeParams.map(Number)
    
    // Validate tile coordinates
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return new Response('Invalid tile coordinates', { status: 400, headers })
    }
    
    // Validate zoom level (0-18 typical)
    if (z < 0 || z > 18) {
      return new Response('Invalid zoom level', { status: 400, headers })
    }
    
    // Validate x, y for given zoom
    const maxCoord = Math.pow(2, z)
    if (x < 0 || x >= maxCoord || y < 0 || y >= maxCoord) {
      return new Response('Tile out of bounds', { status: 400, headers })
    }
    
    // Call Supabase function to generate tile
    const { data, error } = await supabaseServer.rpc('parks_tiles', {
      z: z,
      x: x,
      y: y
    })
    
    if (error) {
      console.error('Tile generation error:', error)
      return new Response(`Tile generation failed: ${error.message}`, { status: 500, headers })
    }
    
    // Return tile as binary (MVT format)
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
    
  } catch (error) {
    console.error('Tile route error:', error)
    return new Response('Internal server error', { status: 500, headers })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
