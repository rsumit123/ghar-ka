import type { HTMLAttributes } from 'react';
import { cx } from '../cx';

export type BadgeTone = 'turmeric' | 'leaf' | 'terracotta' | 'neutral';

const tones: Record<BadgeTone, string> = {
  turmeric: 'bg-turmeric-100 text-turmeric-900',
  leaf: 'bg-leaf-100 text-leaf-800',
  terracotta: 'bg-terracotta-100 text-terracotta-800',
  neutral: 'bg-cream-100 text-ink-soft',
};

export function Badge({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}
      {...rest}
    />
  );
}
