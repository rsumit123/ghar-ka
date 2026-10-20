import { ApiError, CSRF_HEADER, appHeaders, brand } from '@gharka/ui';

/** Multipart upload with progress (fetch can't report upload progress, XHR can). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${brand.apiUrl}/api/v1${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    for (const [k, v] of Object.entries({ ...CSRF_HEADER, ...appHeaders() })) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new ApiError(0, 'Cannot reach the server. Check your connection.'));
    xhr.onload = () => {
      let data: unknown = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      const d = (data as { detail?: unknown } | null)?.detail;
      reject(new ApiError(xhr.status, typeof d === 'string' ? d : 'Upload failed. Try a smaller photo.', data));
    };
    xhr.send(form);
  });
}
