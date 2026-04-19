// Small fetch wrapper over the resume API.
//
// We pull the ID token from Amplify on every call (cheap — cached in memory and
// refreshed lazily) rather than holding a long-lived copy in React state, so
// silent token refreshes never make us send a stale Authorization header.
// ETags flow through for If-Match PUTs so the API can reject lost-update writes.
import { fetchAuthSession } from 'aws-amplify/auth';
import { getConfig } from '../config.js';

export class ApiError extends Error {
  constructor({ status, code, message, errors }) {
    super(message ?? code ?? 'api error');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

const getIdToken = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new ApiError({ status: 401, code: 'Unauthorized', message: 'no id token' });
  return token;
};

// Dev: use relative paths so the Vite proxy (vite.config.js) forwards `/api/*` to the
// prod host — same-origin from the browser, no CORS preflight.
// Prod: use the absolute apiBaseUrl from config.json (same CloudFront host as the SPA,
// still same-origin in practice, but the explicit URL is what deploy.sh wrote).
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';

const request = async ({ method, path, body, etag, headers = {} }) => {
  const baseUrl = isDev ? '/api' : getConfig().apiBaseUrl;
  const token = await getIdToken();

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(etag ? { 'If-Match': etag } : {}),
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  const responseEtag = res.headers.get('etag');

  if (res.status === 204) return { data: null, etag: responseEtag };

  // The API returns JSON error bodies for failures too; parse defensively so a
  // malformed body still surfaces the HTTP status rather than crashing here.
  let parsed = null;
  const text = await res.text();
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; } }

  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      code: parsed?.error,
      message: parsed?.message,
      errors: parsed?.errors,
    });
  }
  return { data: parsed, etag: responseEtag };
};

export const api = {
  listResumes:    () =>            request({ method: 'GET',    path: '/resumes' }),
  createResume:   (body) =>        request({ method: 'POST',   path: '/resumes', body }),
  getResume:      (id) =>          request({ method: 'GET',    path: `/resumes/${id}` }),
  putResume:      (id, r, etag) => request({ method: 'PUT',    path: `/resumes/${id}`, body: r, etag }),
  deleteResume:   (id) =>          request({ method: 'DELETE', path: `/resumes/${id}` }),
  photoUploadUrl: (id) =>          request({ method: 'POST',   path: `/resumes/${id}/photo`, body: {} }),
  publish:        (id) =>          request({ method: 'POST',   path: `/resumes/${id}/publish`, body: {} }),
  revoke:         (id) =>          request({ method: 'POST',   path: `/resumes/${id}/revoke`, body: {} }),
};

// Direct S3 PUT against the presigned URL returned by `photoUploadUrl`. Runs
// outside the auth wrapper (no Authorization header — the URL is the auth).
export const uploadPhoto = async ({ uploadUrl, file }) => {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`photo upload failed (${res.status})`);
};
