import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = `https://pdqhkeewyvimykvyexgo.supabase.co`;

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseAnonKey) {
    console.warn('[Supabase] VITE_SUPABASE_ANON_KEY is missing. Supabase features will be disabled.');
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  
  return supabaseInstance;
}
