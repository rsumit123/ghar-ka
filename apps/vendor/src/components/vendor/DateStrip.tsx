import { cx, useLang, useT } from '@gharka/ui';
import { dayNum, isoDate, monthShort, weekday } from '../../lib/dates';

/** Horizontal strip of days. "Today"/"Tomorrow" follow the chosen language. */
export function DateStrip({ value, onChange, from = 0, days = 7, counts }: {
  value: string;
  onChange: (d: string) => void;
  from?: number;
  days?: number;
  counts?: Record<string, number>;
}) {
  const tt = useT();
  const [lang] = useLang();
  const today = isoDate(0);
  const tomorrow = isoDate(1);
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Day">
      {Array.from({ length: days }, (_, i) => isoDate(from + i)).map((d) => {
        const active = d === value;
        const special = d === today ? 'today' : d === tomorrow ? 'tomorrow' : null;
        const n = counts?.[d] ?? 0;
        return (
          <button key={d} type="button" role="tab" aria-selected={active} onClick={() => onChange(d)}
            className={cx('relative flex min-h-[4.5rem] min-w-[4.6rem] shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-2.5 py-1 transition',
              active ? 'border-terracotta-500 bg-terracotta-500 text-white shadow-soft' : 'border-cream-300 bg-white/80 text-ink')}>
            {special ? (
              <span className={cx('leading-6', lang === 'hi' ? 'font-devanagari text-xl font-bold' : 'font-hand text-2xl')} lang={lang}>{tt(special)}</span>
            ) : (
              <>
                <span className="text-base font-bold leading-6">{weekday(d)}</span>
                <span className="text-xs leading-4 opacity-80">{dayNum(d)} {monthShort(d)}</span>
              </>
            )}
            {n > 0 && <span className={cx('absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold', active ? 'bg-white text-terracotta-600' : 'bg-leaf-500 text-white')}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
