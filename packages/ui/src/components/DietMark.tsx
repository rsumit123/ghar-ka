import { cx } from '../cx';

export type Diet = 'veg' | 'egg' | 'nonveg';

const colour: Record<Diet, string> = { veg: '#2E7D32', egg: '#D99A00', nonveg: '#8B4A2B' };
const names: Record<Diet, string> = { veg: 'Vegetarian', egg: 'Contains egg', nonveg: 'Non-vegetarian' };

/** Indian packaged-food style mark: outlined square with a dot (green veg, yellow egg, brown non-veg). */
export function DietMark({ diet, className }: { diet: Diet; className?: string }) {
  return (
    <span
      role="img" aria-label={names[diet]} title={names[diet]}
      className={cx('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-2 bg-white', className)}
      style={{ borderColor: colour[diet] }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: colour[diet] }} />
    </span>
  );
}
