import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../cx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-turmeric-500 text-ink hover:bg-turmeric-400 active:bg-turmeric-600 shadow-soft',
  secondary: 'bg-leaf-500 text-white hover:bg-leaf-600 active:bg-leaf-700 shadow-soft',
  outline: 'border-2 border-ink/20 bg-white/60 text-ink hover:border-ink/40 hover:bg-white',
  ghost: 'text-ink-soft hover:bg-cream-100',
  danger: 'bg-terracotta-500 text-white hover:bg-terracotta-600 active:bg-terracotta-700 shadow-soft',
};

/** sm 40px · md 48px (min tap target) · lg 52px · xl 56px (primary actions for cooks) */
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 text-sm',
  md: 'min-h-12 px-5 text-base',
  lg: 'min-h-[52px] px-6 text-lg',
  xl: 'min-h-14 px-7 text-xl',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});
