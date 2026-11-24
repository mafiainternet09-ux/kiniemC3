import { createHash, randomUUID } from 'node:crypto';
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

async function verifyFirebaseMember(idToken: string): Promise<
  | { ok: true; uid: string; email: string; isAdmin: boolean }
  | { ok: false; status: number; error: string }
> {
  const lookup = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
      encodeURIComponent(firebaseConfig.apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!lookup.ok) {
    return { ok: false, status: 401, error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' };
  }

  const lookupData = (await lookup.json()) as {
    users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
  };
  const firebaseUser = lookupData.users?.[0];
  if (!firebaseUser?.localId || !firebaseUser.email || firebaseUser.emailVerified !== true) {
    return { ok: false, status: 403, error: 'Tài khoản cần xác minh email trước khi tải tư liệu.' };
  }

  if (firebaseUser.email === 'mafiainternet09@gmail.com') {
    return { ok: true, uid: firebaseUser.localId, email: firebaseUser.email, isAdmin: true };
  }

  const base =
    'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(firebaseConfig.projectId) +
    '/databases/' +
    encodeURIComponent(firebaseConfig.firestoreDatabaseId) +
    '/documents/';

  const headers = { Authorization: 'Bearer ' + idToken };
  const [userDocResponse, adminDocResponse] = await Promise.all([
    fetch(base + 'users/' + encodeURIComponent(firebaseUser.localId), { headers }),
    fetch(base + 'admins/' + encodeURIComponent(firebaseUser.localId), { headers }),
  ]);

  let role = '';
  if (userDocResponse.ok) {
    const userDoc = (await userDocResponse.json()) as {
      fields?: { role?: { stringValue?: string } };
    };
    role = userDoc.fields?.role?.stringValue || '';
  }

  const isAdmin = adminDocResponse.ok || role === 'admin';
  const isMember = role === 'member' || role === 'admin';
  if (!isMember && !isAdmin) {
    return { ok: false, status: 403, error: 'Tài khoản chưa được quản trị viên duyệt quyền thành viên C3.' };
  }

  return { ok: true, uid: firebaseUser.localId, email: firebaseUser.email, isAdmin };
}

function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
  const canonical = Object.entries(params)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value)
    .join('&');

  return createHash('sha1').update(canonical + apiSecret).digest('hex');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const idToken = readBearerToken(req);
    if (!idToken) return sendJson(res, 401, { error: 'Vui lòng đăng nhập để tải tư liệu.' });

    const auth = await verifyFirebaseMember(idToken);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });

    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const yearCode = String(body.yearCode || '');
    const mediaCategory = String(body.mediaCategory || '');
    const fileName = String(body.fileName || 'memory');

    if (!['10A3', '11B3', '12C3'].includes(yearCode)) {
      return sendJson(res, 400, { error: 'Năm học không hợp lệ.' });
    }
    if (!['image', 'video', 'thumbnail'].includes(mediaCategory)) {
      return sendJson(res, 400, { error: 'Loại tư liệu không hợp lệ.' });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return sendJson(res, 503, { error: 'Máy chủ chưa được cấu hình Cloudinary đầy đủ trong Vercel.' });
    }

    const resourceType = mediaCategory === 'video' ? 'video' : 'image';
    const folder = mediaCategory === 'thumbnail' ? 'thumbnail' : mediaCategory;
    const safeName = fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 40) || 'memory';
    const publicId =
      'c3-memories/' +
      yearCode +
      '/' +
      folder +
      '/' +
      safeName +
      '-' +
      randomUUID();

    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = {
      overwrite: 'false',
      public_id: publicId,
      timestamp: String(timestamp),
    };
    const signature = signCloudinaryParams(signedParams, apiSecret);

    return sendJson(res, 200, {
      cloudName,
      apiKey,
      timestamp,
      signature,
      publicId,
      resourceType,
    });
  } catch (error) {
    console.error('Cloudinary signing error:', error);
    return sendJson(res, 500, { error: 'Không thể chuẩn bị tải lên lúc này. Vui lòng thử lại.' });
  }
}
