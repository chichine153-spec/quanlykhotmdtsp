import { getSupabase } from './supabase';

interface ErrorLog {
  shop_id?: string;
  error_message: string;
  stack_trace?: string;
  feature?: string;
}

export async function logErrorToSupabase(error: any, feature?: string, shopId?: string, customMessage?: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  const errorMessage = customMessage || (error instanceof Error ? error.message : String(error));
  const stackTrace = error instanceof Error ? error.stack : undefined;

  try {
    const { error: supabaseError } = await supabase
      .from('error_logs')
      .insert({
        shop_id: shopId || 'unknown',
        error_message: errorMessage,
        stack_trace: stackTrace,
        feature: feature || 'general',
        created_at: new Date().toISOString()
      });

    if (supabaseError) {
      console.error('[ErrorLogger] Failed to log error to Supabase:', supabaseError);
    }
  } catch (err) {
    console.error('[ErrorLogger] Unexpected error during logging:', err);
  }
}

export const FRIENDLY_ERROR_MESSAGE = 'Hệ thống đang bận, Quản trị viên đã được thông báo để xử lý. Vui lòng thử lại sau ít phút';
