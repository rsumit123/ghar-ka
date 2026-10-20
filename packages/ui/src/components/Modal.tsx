import { useEffect, type ReactNode } from 'react';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-cream p-5 shadow-lift sm:max-w-md sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 font-serif text-2xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
