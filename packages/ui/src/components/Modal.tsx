import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Simple dialog: dimmed backdrop, bottom sheet on phones, centred card on larger screens. Esc / backdrop click closes. */
export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 pt-10 sm:items-center sm:p-4" onMouseDown={onClose}>
      {/* Height comes from the fixed overlay, not vh: on phones vh counts the hidden address bar and pushed the title off screen */}
      <div
        role="dialog" aria-modal="true"
        className="flex max-h-full w-full flex-col rounded-t-3xl bg-cream shadow-lift sm:max-w-md sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-cream-200 px-5 py-3">
          <h2 className="min-w-0 flex-1 font-serif text-2xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-cream-200">
            <Icon.Close className="h-6 w-6" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5 pt-4">{children}</div>
      </div>
    </div>
  );
}
