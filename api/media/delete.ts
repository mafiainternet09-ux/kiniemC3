import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

interface ApiRequest extends IncomingMessage {
  body?: unknown;
}
type ApiResponse = ServerResponse;

function sendJson(res: ApiResponse, status: number, payload: Record<string, unknown>) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readBearerToken(req: ApiRequest): string | null {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || null;
}

async function verifyFirebaseMember(idToken: string) {
  const lookup = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
      encodeURIComponent(firebaseConfig.apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!lookup.ok) return null;

  const lookupData = (await lookup.json()) as {
    users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
  };
  const user = lookupData.users?.[0];
  if (!user?.localId || !user.email || user.emailVerified !== true) return null;

  if (user.email === 'mafiainternet09@gmail.com') {
    return { uid: user.localId, isAdmin: true };
  }

  const base =
    'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(firebaseConfig.projectId) +
    '/databases/' +
    encodeURIComponent(firebaseConfig.firestoreDatabaseId) +
    '/documents/';
  const headers = { Authorization: 'Bearer ' + idToken };
  const [userResponse, adminResponse] = await Promise.all([
    fetch(base + 'users/' + encodeURIComponent(user.localId), { headers }),
    fetch(base + 'admins/' + encodeURIComponent(user.localId), { headers }),
  ]);

  let role = '';
  if (userResponse.ok) {
    const data = (await userResponse.json()) as { fields?: { role?: { stringValue?: string } } };
    role = data.fields?.role?.stringValue || '';
  }

  const isAdmin = adminResponse.ok || role === 'admin';
  if (!isAdmin && role !== 'member') return null;
  return { uid: user.localId, isAdmin };
}

function signParams(params: Record<string, string>, secret: string) {
  const canonical = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value)
    .join('&');
  return createHash('sha1').update(canonical + secret).digest('hex');
}

async function destroyAsset(
  cloudName: string,
  apiKey: string,
  apiSecret: string,
  resourceType: 'image' | 'video',
  publicId: string
) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = { invalidate: 'true', public_id: publicId, timestamp };
  const signature = signParams(params, apiSecret);
  const form = new FormData();
  form.append('public_id', publicId);
  form.append('timestamp', timestamp);
  form.append('invalidate', 'true');
  form.append('api_key', apiKey);
  form.append('signature', signature);

  const response = await fetch(
    'https://api.cloudinary.com/v1_1/' +
      encodeURIComponent(cloudName) +
      '/' +
      resourceType +
      '/destroy',
    { method: 'POST', body: form }
  );
  if (!response.ok) throw new Error('Cloudinary không thể xóa một tệp trong kho lưu trữ.');
  const result = (await response.json()) as { result?: string; error?: { message?: string } };
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(result.error?.message || 'Cloudinary không xác nhận thao tác xóa.');
  }
}

function parseCloudinaryPath(value: unknown): { resourceType: 'image' | 'video'; publicId: string } | null {
  if (typeof value !== 'string') return null;
  const match = /^cloudinary:(image|video):([a-zA-Z0-9_/-]+)$/.exec(value);
  if (!match) return null;
  return { resourceType: match[1] as 'image' | 'video', publicId: match[2] };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const idToken = readBearerToken(req);
    if (!idToken) return sendJson(res, 401, { error: 'Vui lòng đăng nhập lại.' });

    const auth = await verifyFirebaseMember(idToken);
    if (!auth) return sendJson(res, 403, { error: 'Tài khoản không có quyền xóa tư liệu.' });

    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const mediaId = String(body.mediaId || '');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(mediaId)) {
      return sendJson(res, 400, { error: 'Mã tư liệu không hợp lệ.' });
    }

    const documentUrl =
      'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(firebaseConfig.projectId) +
      '/databases/' +
      encodeURIComponent(firebaseConfig.firestoreDatabaseId) +
      '/documents/media/' +
      encodeURIComponent(mediaId);
    const documentResponse = await fetch(documentUrl, {
      headers: { Authorization: 'Bearer ' + idToken },
    });
    if (!documentResponse.ok) {
      return sendJson(res, 404, { error: 'Không tìm thấy tư liệu hoặc bạn không có quyền truy cập.' });
    }

    const document = (await documentResponse.json()) as {
      fields?: {
        uploadedBy?: { stringValue?: string };
        storagePath?: { stringValue?: string };
        thumbnailStoragePath?: { stringValue?: string };
      };
    };
    const fields = document.fields || {};
    const ownerUid = fields.uploadedBy?.stringValue || '';
    if (!auth.isAdmin && ownerUid !== auth.uid) {
      return sendJson(res, 403, { error: 'Bạn chỉ có thể xóa tư liệu do chính mình tải lên.' });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return sendJson(res, 503, { error: 'Máy chủ chưa được cấu hình Cloudinary đầy đủ.' });
    }

    const assets = [
      parseCloudinaryPath(fields.storagePath?.stringValue),
      parseCloudinaryPath(fields.thumbnailStoragePath?.stringValue),
    ].filter((asset): asset is { resourceType: 'image' | 'video'; publicId: string } => Boolean(asset));

    for (const asset of assets) {
      await destroyAsset(cloudName, apiKey, apiSecret, asset.resourceType, asset.publicId);
    }

    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error('Cloudinary deletion error:', error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Không thể xóa tư liệu khỏi Cloudinary.',
    });
  }
}
