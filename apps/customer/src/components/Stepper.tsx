import { cx } from '@gharka/ui';

/** − 2 + quantity control. Buttons are 40px (touch friendly in lists). */
export function Stepper({ value, onChange, max = 10, min = 0, label }: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  min?: number;
  label: string;
}) {
  const btn = 'flex h-10 w-10 items-center justify-center rounded-full text-2xl font-bold leading-none transition active:scale-95 disabled:opacity-35';
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-turmeric-50 p-1 ring-1 ring-turmeric-200" role="group" aria-label={label}>
      <button type="button" className={cx(btn, 'bg-white text-ink shadow-soft')} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label}`}>−</button>
      <span className="min-w-[2ch] text-center text-lg font-bold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className={cx(btn, 'bg-turmeric-500 text-ink shadow-soft')} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label}`}>+</button>
    </div>
  );
}
