import { ApiError, Bi, Spinner, cx, type DictKey } from '@gharka/ui';
import { useRef, useState, type ReactNode } from 'react';
import { uploadWithProgress } from '../../lib/upload';
import type { MediaKind } from '../../lib/types';

/** Big camera tile. Tapping opens the camera on phones (capture=environment); a small link opens the gallery/files. */
export function UploadTile({ kind, label, hint, accept = 'image/*', onDone, children, className, camera = true, compact }: {
  kind: MediaKind;
  label: ReactNode;
  hint?: ReactNode;
  accept?: string;
  onDone: () => unknown;
  children?: ReactNode;
  className?: string;
  camera?: boolean;
  compact?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPct(0);
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    try {
      await uploadWithProgress('/vendor/media', form, setPct);
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Upload failed');
    } finally {
      setPct(null);
    }
  }

  const busy = pct !== null;
  const galleryKey: DictKey = 'fromGallery';
  return (
    <div className={className}>
      <div className={cx('flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-turmeric-400 bg-turmeric-50 p-3 text-center',
        compact ? 'min-h-28' : 'min-h-36')}>
        {busy ? (
          <div className="w-full px-2" role="progressbar" aria-valuenow={pct ?? 0}>
            <Spinner className="mx-auto mb-2 h-6 w-6" />
            <div className="h-2.5 overflow-hidden rounded-full bg-turmeric-100"><div className="h-full bg-turmeric-500 transition-all" style={{ width: `${pct}%` }} /></div>
            <p className="mt-1 text-sm text-ink-soft"><Bi k="uploading" /> {pct}%</p>
          </div>
        ) : (
          <>
            {camera && (
              <button type="button" className="flex min-h-16 w-full flex-col items-center justify-center rounded-xl px-2 py-2 active:bg-turmeric-100"
                onClick={() => camRef.current?.click()}>
                <span className="text-3xl" aria-hidden>📷</span>
                <span className="text-base font-bold leading-tight">{label}</span>
              </button>
            )}
            {!camera && <span className="text-base font-bold leading-tight">{label}</span>}
            {hint && <span className="text-xs text-ink-muted">{hint}</span>}
            <button type="button" className="min-h-10 px-3 text-sm font-semibold text-leaf-700 underline" onClick={() => fileRef.current?.click()}>
              <Bi k={galleryKey} />
            </button>
          </>
        )}
        {children}
      </div>
      <input ref={camRef} type="file" accept={accept} capture="environment" hidden onChange={(e) => { void send(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept={accept} hidden onChange={(e) => { void send(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="mt-1.5 text-sm font-medium text-terracotta-600" role="alert">{error}</p>}
    </div>
  );
}
