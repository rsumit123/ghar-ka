import { brand } from './brand';

/** Value the backend requires on multipart endpoints (CSRF defence). */
export const CSRF_HEADER = { 'X-Requested-With': 'gharka' } as const;

/** Which site this is ('customer' | 'vendor' | 'admin'); sent as X-App so each keeps its own login cookie.
 *  A function is read on every request (the vendor site hosts /admin too). */
type AppName = 'customer' | 'vendor' | 'admin';
let appName: AppName | (() => AppName) | undefined;
export function setApiApp(name: AppName | (() => AppName)) { appName = name; }
export const appHeaders = (): Record<string, string> => {
  const name = typeof appName === 'function' ? appName() : appName;
  return name ? { 'X-App': name } : {};
};

export class ApiError extends Error {
  constructor(public status: number, public detail: string, public raw?: unknown) {
    super(detail);
    this.name = 'ApiError';
  }
}

function detailOf(body: unknown, fallback: string): string {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    // FastAPI validation errors
    return d.map((e) => (e as { msg?: string }).msg?.replace(/^Value error, /, '') ?? '').filter(Boolean).join('; ') || fallback;
  }
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json', ...appHeaders(), ...(init.headers as Record<string, string>) };
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (isForm) Object.assign(headers, CSRF_HEADER);

  let res: Response;
  try {
    res = await fetch(`${brand.apiUrl}/api/v1${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) throw new ApiError(res.status, detailOf(data, res.statusText || 'Something went wrong'), data);
  return data as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** multipart upload; adds the X-Requested-With header automatically */
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
