import type { ReactNode } from 'react';
import { cx } from '../cx';

/** Big on/off toggle with a label; the whole row is the tap target. */
export function Switch({ checked, onChange, label, hint, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="flex min-h-14 sm:min-h-16 w-full items-center gap-4 rounded-2xl border-2 border-cream-300 bg-white px-4 py-3 text-left disabled:opacity-50"
    >
      <span className="flex-1">
        <span className="block text-lg font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink-muted">{hint}</span>}
      </span>
      <span className={cx('relative h-9 w-16 shrink-0 rounded-full transition', checked ? 'bg-leaf-500' : 'bg-cream-300')}>
        <span className={cx('absolute top-1 h-7 w-7 rounded-full bg-white shadow-soft transition-all', checked ? 'left-8' : 'left-1')} />
      </span>
    </button>
  );
}
