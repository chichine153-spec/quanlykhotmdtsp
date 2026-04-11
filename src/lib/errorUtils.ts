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
  // Extract message from various possible structures
  let message = '';
  if (typeof error === 'string') {
    message = error;
  } else if (error?.error?.message) {
    message = error.error.message; // Handle Gemini nested error
  } else if (error?.message) {
    message = error.message;
  } else {
    message = JSON.stringify(error);
  }

  const errorStr = message.toLowerCase() + (error?.status || '').toLowerCase();
  
  let service = defaultService;
  let isQuota = false;
  let isAuth = false;

  // Detect Service
  if (errorStr.includes('gemini') || errorStr.includes('google') || errorStr.includes('generative')) {
    service = 'Gemini';
  } else if (errorStr.includes('supabase') || errorStr.includes('postgrest')) {
    service = 'Supabase';
  } else if (errorStr.includes('firebase') || errorStr.includes('firestore') || errorStr.includes('auth/')) {
    service = 'Firebase';
  }

  // Detect Quota (429)
  if (errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('resource_exhausted') || errorStr.includes('limit exceeded')) {
    isQuota = true;
  }

  // Detect Auth (401, 403)
  if (errorStr.includes('401') || errorStr.includes('403') || errorStr.includes('api key not valid') || errorStr.includes('invalid_argument') || errorStr.includes('permission_denied')) {
    isAuth = true;
  }

  // Detect Offline/Connection issues
  if (errorStr.includes('offline') || errorStr.includes('failed to get document')) {
    return {
      service,
      message: `Lỗi Kết Nối (${service}): Không thể kết nối tới máy chủ. Vui lòng kiểm tra Internet hoặc Project ID/API Key có chính xác không.`,
      isQuota: false,
      isAuth: false
    };
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
