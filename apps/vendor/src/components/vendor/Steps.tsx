import { Bi, cx, type DictKey } from '@gharka/ui';

const STEPS: DictKey[] = ['stepAbout', 'stepPhotos', 'stepDocs', 'stepDone'];

/** Handwritten-feeling progress dots: 1 — 2 — 3 — 4 with the current label shown. */
export function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="mb-6">
      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((_, i) => {
          const n = i + 1;
          const done = n < current;
          return (
            <li key={n} className="flex flex-1 items-center gap-2 last:flex-none">
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-bold',
                done ? 'border-leaf-500 bg-leaf-500 text-white' : n === current ? 'border-turmeric-500 bg-turmeric-500 text-ink shadow-soft' : 'border-cream-300 bg-white text-ink-muted')}>
                {done ? '✓' : n}
              </span>
              {n < STEPS.length && <span className={cx('h-1 flex-1 rounded-full', done ? 'bg-leaf-400' : 'bg-cream-200')} />}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 font-serif text-2xl font-bold"><Bi k={STEPS[current - 1]} /></p>
    </div>
  );
}
