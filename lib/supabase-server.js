/**
 * Server-side Supabase client
 * Use this for API routes and server components
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create client only if env vars are available (will fail gracefully at runtime if missing)
export const supabaseServer = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Helper to check if client is initialized
export function isSupabaseInitialized() {
  return supabaseServer !== null
}

