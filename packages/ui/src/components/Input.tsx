import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../cx';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  size?: 'md' | 'lg';
  /** Fixed text shown inside the left edge, e.g. "+91". */
  prefix?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, size = 'md', prefix, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink-soft">{label}</label>}
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 font-semibold text-ink-muted">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={cx(
            // 16px+ text prevents iOS zoom on focus
            'w-full rounded-xl border-2 bg-white px-4 text-base text-ink placeholder:text-ink-muted/70',
            size === 'lg' ? 'min-h-14 text-lg' : 'min-h-12',
            error ? 'border-terracotta-400' : 'border-cream-300 focus:border-turmeric-500',
            prefix && 'pl-14',
          )}
          {...rest}
        />
      </div>
      {error ? <p className="mt-1.5 text-sm font-medium text-terracotta-600" role="alert">{error}</p>
        : hint ? <p className="mt-1.5 text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
});
