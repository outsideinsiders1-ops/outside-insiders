/**
 * API Route: /api/admin/data-quality/update
 * Handles bulk updates to park data from the data quality table
 */

import { supabaseServer } from '../../../../../lib/supabase-server.js'

export async function POST(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { updates } = body

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return Response.json({
        success: false,
        error: 'Updates array is required',
        details: 'Please provide an array of park updates'
      }, { status: 400, headers })
    }

    const supabase = supabaseServer
    let updated = 0
    const errors = []

    // Process each update
    for (const update of updates) {
      try {
        if (!update.id) {
          errors.push({ park: 'Unknown', error: 'Missing park ID' })
          continue
        }

        // Extract only valid park fields (prevent SQL injection)
        const validFields = [
          'name', 'description', 'state', 'agency', 'website', 'phone', 'email',
          'address', 'county', 'city', 'acres', 'public_access', 'category',
          'designation_type', 'agency_full_name', 'activities', 'amenities'
        ]

        const updateData = {}
        for (const field of validFields) {
          if (update[field] !== undefined) {
            updateData[field] = update[field]
          }
        }

        // Validate required fields
        if (updateData.name === null || updateData.name === '') {
          errors.push({ park: update.id, error: 'Name cannot be empty' })
          continue
        }

        if (updateData.state === null || updateData.state === '') {
          errors.push({ park: update.id, error: 'State cannot be empty' })
          continue
        }

        if (updateData.agency === null || updateData.agency === '') {
          errors.push({ park: update.id, error: 'Agency cannot be empty' })
          continue
        }

        // Validate data types
        if (updateData.acres !== undefined && updateData.acres !== null) {
          const acres = parseFloat(updateData.acres)
          if (isNaN(acres) || acres < 0) {
            errors.push({ park: update.id, error: 'Acres must be a positive number' })
            continue
          }
          updateData.acres = acres
        }

        // Handle JSON fields
        if (updateData.activities !== undefined && typeof updateData.activities === 'string') {
          try {
            updateData.activities = JSON.parse(updateData.activities)
          } catch {
            // If not valid JSON, treat as comma-separated string
            updateData.activities = updateData.activities.split(',').map(s => s.trim()).filter(Boolean)
          }
        }

        if (updateData.amenities !== undefined && typeof updateData.amenities === 'string') {
          try {
            updateData.amenities = JSON.parse(updateData.amenities)
          } catch {
            updateData.amenities = updateData.amenities.split(',').map(s => s.trim()).filter(Boolean)
          }
        }

        // Update the park
        const { error: updateError } = await supabase
          .from('parks')
          .update(updateData)
          .eq('id', update.id)

        if (updateError) {
          errors.push({ park: update.id, error: updateError.message })
          continue
        }

        updated++

      } catch (error) {
        errors.push({
          park: update.id || 'Unknown',
          error: error.message || 'Failed to update park'
        })
        console.error(`Error updating park ${update.id}:`, error)
      }
    }

    return Response.json({
      success: true,
      message: `Updated ${updated} of ${updates.length} park(s)`,
      updated,
      total: updates.length,
      errors: errors.length > 0 ? errors : undefined
    }, { status: 200, headers })

  } catch (error) {
    console.error('Bulk update error:', error)
    
    return Response.json({
      success: false,
      error: 'Internal server error',
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

