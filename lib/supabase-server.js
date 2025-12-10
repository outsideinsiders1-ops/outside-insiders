/**
 * Server-side Supabase client
 * Use this for API routes and server components
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create client only if env vars are available (will fail gracefully at runtime if missing)
// Only create client if both URL and key are non-empty strings
// During build time, env vars might not be available, so we need to handle that
let supabaseServer = null
try {
  if (supabaseUrl && supabaseAnonKey && typeof supabaseUrl === 'string' && typeof supabaseAnonKey === 'string' && supabaseUrl.trim() && supabaseAnonKey.trim()) {
    supabaseServer = createClient(supabaseUrl, supabaseAnonKey)
  }
} catch (error) {
  // Silently fail during build if env vars aren't available
  if (process.env.NODE_ENV !== 'production' || !supabaseUrl || !supabaseAnonKey) {
    supabaseServer = null
  } else {
    throw error
  }
}

export { supabaseServer }

// Helper to check if client is initialized
export function isSupabaseInitialized() {
  return supabaseServer !== null
}

