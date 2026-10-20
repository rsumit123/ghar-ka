import { cx, Icon } from '@gharka/ui';
import type { ReactNode } from 'react';
import { dayLabel, dayNum, isoDate, monthShort } from '../lib/format';
import type { Diet, Slot } from '../lib/types';
import { DietMark } from './DietMark';

export const next7 = () => Array.from({ length: 7 }, (_, i) => isoDate(i));

/** Horizontally scrolling day chips. "Today"/"Tomorrow" are set in the hand font. */
export function DateChips({ value, onChange, marked }: { value: string; onChange: (d: string) => void; marked?: Set<string> }) {
  const days = next7();
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Choose a day">
      {days.map((d) => {
        const active = d === value;
        const special = d === days[0] || d === days[1];
        return (
          <button
            key={d} type="button" role="tab" aria-selected={active} onClick={() => onChange(d)}
            className={cx(
              'relative flex min-h-[4.25rem] min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-3 py-1.5 transition',
              active ? 'border-terracotta-500 bg-terracotta-500 text-white shadow-soft' : 'border-cream-300 bg-white/80 text-ink hover:border-turmeric-400',
            )}
          >
            <span className={cx(special ? 'font-hand text-2xl leading-6' : 'text-sm font-semibold leading-6')}>{dayLabel(d)}</span>
            <span className={cx('text-xs leading-4', active ? 'text-white/85' : 'text-ink-muted')}>{dayNum(d)} {monthShort(d)}</span>
            {marked?.has(d) && !active && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-leaf-500" aria-label="Has a menu" />}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div className="inline-flex rounded-full bg-cream-100 p-1 ring-1 ring-cream-300" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cx('min-h-10 rounded-full px-4 text-sm font-semibold transition', o.value === value ? 'bg-leaf-500 text-white shadow-soft' : 'text-ink-soft')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SlotToggle({ value, onChange }: { value: Slot; onChange: (s: Slot) => void }) {
  return (
    <Segmented<Slot> label="Meal" value={value} onChange={onChange} options={[
      { value: 'lunch', label: <span className="inline-flex items-center gap-1.5"><Icon.Sun className="h-4 w-4" /> Lunch</span> }, { value: 'dinner', label: <span className="inline-flex items-center gap-1.5"><Icon.Moon className="h-4 w-4" /> Dinner</span> },
    ]} />
  );
}

export type DietFilter = Diet | 'all';
export function DietChips({ value, onChange }: { value: DietFilter; onChange: (d: DietFilter) => void }) {
  const items: { v: DietFilter; label: ReactNode }[] = [
    { v: 'all', label: 'All' },
    { v: 'veg', label: <><DietMark diet="veg" /> Veg</> },
    { v: 'egg', label: <><DietMark diet="egg" /> Egg</> },
    { v: 'nonveg', label: <><DietMark diet="nonveg" /> Non-veg</> },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Diet">
      {items.map((i) => (
        <button
          key={i.v} type="button" role="radio" aria-checked={i.v === value} onClick={() => onChange(i.v)}
          className={cx('inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-semibold transition',
            i.v === value ? 'border-ink bg-ink text-cream' : 'border-cream-300 bg-white/80 text-ink-soft')}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
