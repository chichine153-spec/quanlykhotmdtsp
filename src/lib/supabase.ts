import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

function isServiceRoleKeyDetected(key: string): boolean {
  if (!key) return false;
  try {
    if (key.startsWith('eyJ') && key.includes('.')) {
      const base64Url = key.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const binStr = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
      const jsonPayload = decodeURIComponent(
        binStr
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      return payload.role === 'service_role';
    }
  } catch (e) {
    // Ignore decoding errors
  }
  return false;
}

export function getSupabase(customUrl?: string, customKey?: string): SupabaseClient | null {
  // Priority: 1. Custom arguments (for testing) 2. LocalStorage (user config) 3. Global Config (admin set) 4. Environment variables (defaults)
  const supabaseAnonKey = customKey || 
                         localStorage.getItem('supabase_anon_key') || 
                         localStorage.getItem('global_supabase_key') ||
                         import.meta.env.VITE_SUPABASE_ANON_KEY;
                         
  const supabaseUrl = customUrl || 
                      localStorage.getItem('supabase_url') || 
                      localStorage.getItem('global_supabase_url') ||
                      import.meta.env.VITE_SUPABASE_URL;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Supabase URL or Anon Key is missing. Supabase features will be disabled.');
    return null;
  }

  // If custom credentials are provided, always create a new client for testing
  let client: SupabaseClient;
  if (customUrl || customKey) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  } else {
    if (!supabaseInstance) {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    }
    client = supabaseInstance;
  }

  // Wrap with proxy to detect service role key usage on any table/storage query
  if (isServiceRoleKeyDetected(supabaseAnonKey)) {
    console.error('[Supabase] CRITICAL SECURITY ERROR: You are using a SERVICE_ROLE_KEY in the browser. Supabase will block this request. Please use the ANON_KEY instead.');
    return new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === 'from' || prop === 'storage') {
          return () => {
            throw new Error('Supabase Error: Bạn đang sử dụng SECRET/SERVICE_ROLE API key thay vì ANON/PUBLIC key trong trình duyệt. Supabase chặn yêu cầu này để bảo quản khóa bảo mật cao nhất của bạn. Hãy đổi sang mã ANON PUBLIC key.');
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });
  }

  return client;
}

export function resetSupabaseInstance() {
  supabaseInstance = null;
}
