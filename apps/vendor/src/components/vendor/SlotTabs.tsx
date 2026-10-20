import { Bi, cx } from '@gharka/ui';
import type { Slot } from '../../lib/types';

export function SlotTabs({ value, onChange, counts }: { value: Slot; onChange: (s: Slot) => void; counts?: Partial<Record<Slot, number>> }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Meal">
      {(['lunch', 'dinner'] as const).map((s) => (
        <button key={s} type="button" role="tab" aria-selected={value === s} onClick={() => onChange(s)}
          className={cx('flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 text-lg font-bold transition',
            value === s ? 'border-leaf-500 bg-leaf-500 text-white shadow-soft' : 'border-cream-300 bg-white/80 text-ink')}>
          <span aria-hidden>{s === 'lunch' ? '☀️' : '🌙'}</span><Bi k={s} />
          {!!counts?.[s] && <span className={cx('rounded-full px-2 text-sm', value === s ? 'bg-white/25' : 'bg-cream-100')}>{counts[s]}</span>}
        </button>
      ))}
    </div>
  );
}
