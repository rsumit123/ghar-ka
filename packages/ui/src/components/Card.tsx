import type { HTMLAttributes } from 'react';
import { cx } from '../cx';

export function Card({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={cx('rounded-2xl border border-cream-200 bg-white/85 shadow-soft', padded && 'p-4 sm:p-5', className)}
      {...rest}
    />
  );
}
