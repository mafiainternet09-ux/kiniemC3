import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
storage.maxUploadRetryTime = 10000;
storage.maxOperationRetryTime = 10000;
export const googleProvider = new GoogleAuthProvider();

export const BOOTSTRAP_ADMIN_EMAIL = 'mafiainternet09@gmail.com';

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function reportFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = reportFirestoreError(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}

function unwrapFirestoreErrorMessage(error: unknown): {
  rawMessage: string;
  isSerializedFirestoreError: boolean;
} {
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown; operationType?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
        return { rawMessage: parsed.error, isSerializedFirestoreError: true };
      }
    } catch {
      // Not valid JSON; treat as plain error string
    }
  }
  return { rawMessage: raw, isSerializedFirestoreError: false };
}

export function formatFirestoreErrorForUi(error: unknown): string {
  const { rawMessage } = unwrapFirestoreErrorMessage(error);
  const lower = rawMessage.toLowerCase();

  if (rawMessage.includes("Quota exceeded for quota metric 'Free daily read units per project")) {
    const upgradeUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;
    return `Đã vượt hạn mức đọc miễn phí hằng ngày của Firestore (Free daily read units). Hạn mức sẽ tự đặt lại vào ngày mai hoặc bạn có thể kiểm tra tại: ${upgradeUrl}`;
  }

  if (lower.includes('quota exceeded') || lower.includes('resource-exhausted')) {
    return 'Đã vượt quá hạn mức sử dụng miễn phí (Quota exceeded) của Cloud Firestore hôm nay. Hạn mức sẽ tự động đặt lại vào ngày mai (Spark plan · Enterprise edition).';
  }

  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return 'Không đủ quyền truy cập Firestore cho thao tác này. Hãy đảm bảo tài khoản đã đăng nhập đúng email được cấp quyền hoặc thử tải lại trang.';
  }

  if (lower.includes('failed-precondition') || lower.includes('requires an index')) {
    return 'Truy vấn Firestore đang thiếu điều kiện chỉ mục (index) hoặc dữ liệu gốc chưa được khởi tạo.';
  }

  if (lower.includes('the client is offline') || lower.includes('unavailable')) {
    return 'Không thể kết nối tới Cloud Firestore (ngoại tuyến hoặc mạng không ổn định). Vui lòng kiểm tra kết nối mạng.';
  }

  return `Lỗi Firestore: ${rawMessage}`;
}

export function formatUserFacingError(error: unknown, fallbackMessage: string): string {
  const { rawMessage, isSerializedFirestoreError } = unwrapFirestoreErrorMessage(error);
  const lower = rawMessage.toLowerCase();
  if (
    isSerializedFirestoreError ||
    lower.includes('quota exceeded') ||
    lower.includes('resource-exhausted') ||
    lower.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions') ||
    lower.includes('failed-precondition') ||
    lower.includes('requires an index') ||
    lower.includes('the client is offline')
  ) {
    return formatFirestoreErrorForUi(error);
  }
  return rawMessage.trim() || fallbackMessage;
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'siteConfig', 'main'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Vui lòng kiểm tra cấu hình kết nối Firebase (client is offline).');
    }
  }
}

void testConnection();
