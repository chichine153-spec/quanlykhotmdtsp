import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(customUrl?: string, customKey?: string): SupabaseClient | null {
  // Priority: 1. Custom arguments (for testing) 2. LocalStorage (user config) 3. Environment variables (defaults)
  const supabaseAnonKey = customKey || localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
  const supabaseUrl = customUrl || localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Supabase URL or Anon Key is missing. Supabase features will be disabled.');
    return null;
  }

  // Check if it's a service role key (security risk in browser)
  try {
    if (supabaseAnonKey.startsWith('eyJ') && supabaseAnonKey.includes('.')) {
      const payload = JSON.parse(atob(supabaseAnonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'service_role') {
        console.error('[Supabase] CRITICAL SECURITY ERROR: You are using a SERVICE_ROLE_KEY in the browser. Supabase will block this request. Please use the ANON_KEY instead.');
        // We still return the client, but it will fail on requests, which is what the user is seeing.
        // Adding a property to the client to indicate this might be helpful but SupabaseClient is typed.
      }
    }
  } catch (e) {
    // Ignore decoding errors
  }

  // If custom credentials are provided, always create a new client for testing
  if (customUrl || customKey) {
    return createClient(supabaseUrl, supabaseAnonKey);
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  
  return supabaseInstance;
}

export function resetSupabaseInstance() {
  supabaseInstance = null;
}
