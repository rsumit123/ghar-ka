import { cx } from '@gharka/ui';

export function FulfilmentOption({ selected, disabled, why, onSelect, title, sub, icon }: {
  selected: boolean; disabled: boolean; why: string | null; onSelect: () => void; title: string; sub: string; icon: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
      className={cx('flex min-h-16 items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition',
        selected ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-white/80', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="text-3xl" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className={cx('block text-sm', why ? 'font-medium text-terracotta-600' : 'text-ink-muted')}>{why ?? sub}</span>
      </span>
      <span className={cx('flex h-6 w-6 items-center justify-center rounded-full border-2', selected ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300')} aria-hidden>{selected ? '✓' : ''}</span>
    </button>
  );
}
