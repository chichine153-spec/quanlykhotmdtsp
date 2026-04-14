import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // If it's a quota error or internal assertion failure, add a user-friendly hint
  const isQuotaError = errInfo.error.includes('Quota exceeded');
  const isAssertionError = errInfo.error.includes('INTERNAL ASSERTION FAILED');

  if (isQuotaError || isAssertionError) {
    const quotaMsg = isQuotaError 
      ? "Zenith OMS đã đạt giới hạn truy cập miễn phí trong ngày. Vui lòng quay lại sau 24h hoặc nâng cấp gói dịch vụ."
      : "Hệ thống gặp sự cố kết nối với cơ sở dữ liệu. Vui lòng thử tải lại trang.";
    
    throw new Error(JSON.stringify({ ...errInfo, userFriendlyMessage: quotaMsg }));
  }

  throw new Error(JSON.stringify(errInfo));
}
