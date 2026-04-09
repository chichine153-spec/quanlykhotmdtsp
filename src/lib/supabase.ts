import { createClient, SupabaseClient } from '@supabase/supabase-js';

const defaultUrl = `https://pdqhkeewyvimykvyexgo.supabase.co`;

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('supabase_anon_key');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('supabase_url') || defaultUrl;
  
  if (!supabaseAnonKey) {
    console.warn('[Supabase] Supabase Anon Key is missing. Supabase features will be disabled.');
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  
  return supabaseInstance;
}
