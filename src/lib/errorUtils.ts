/**
 * Utility to classify and format errors from different services.
 */
export type ServiceType = 'Gemini' | 'Supabase' | 'Firebase' | 'GHN' | 'SPX';

export interface ClassifiedError {
  service: ServiceType;
  message: string;
  isQuota: boolean;
  isAuth: boolean;
}

export function classifyError(error: any, defaultService: ServiceType): ClassifiedError {
  const message = error?.message || String(error);
  const errorStr = JSON.stringify(error).toLowerCase();
  
  let service = defaultService;
  let isQuota = false;
  let isAuth = false;

  // Detect Service
  if (message.includes('Gemini') || message.includes('GoogleGenerativeAI')) {
    service = 'Gemini';
  } else if (message.includes('supabase') || message.includes('postgrest')) {
    service = 'Supabase';
  } else if (message.includes('firebase') || message.includes('firestore') || message.includes('auth/')) {
    service = 'Firebase';
  }

  // Detect Quota
  if (message.includes('429') || message.includes('Quota') || message.includes('RESOURCE_EXHAUSTED') || message.includes('limit exceeded')) {
    isQuota = true;
  }

  // Detect Auth
  if (message.includes('401') || message.includes('403') || message.includes('API key not valid') || message.includes('INVALID_ARGUMENT') || message.includes('permission-denied')) {
    isAuth = true;
  }

  return {
    service,
    message: formatFriendlyMessage(service, isQuota, isAuth, message),
    isQuota,
    isAuth
  };
}

function formatFriendlyMessage(service: ServiceType, isQuota: boolean, isAuth: boolean, originalMessage: string): string {
  if (isQuota) {
    return `Lỗi Hạn Mức (${service}): Bạn đã hết lượt sử dụng miễn phí trong ngày. Vui lòng kiểm tra Console ${service} hoặc thử lại sau.`;
  }
  if (isAuth) {
    return `Lỗi Xác Thực (${service}): API Key không hợp lệ hoặc không có quyền truy cập. Vui lòng cập nhật lại trong Cấu hình kết nối.`;
  }
  return `Lỗi ${service}: ${originalMessage}`;
}
