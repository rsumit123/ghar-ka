import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { brand } from '../brand';
import { cx } from '../cx';

/** Top bar: brand wordmark (links home), optional nav, optional right-side actions. */
export function Header({ nav, actions, homeTo = '/', tagline, wide }: {
  wide?: boolean;
  nav?: ReactNode;
  actions?: ReactNode;
  homeTo?: string;
  tagline?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-cream-200 bg-cream/90 backdrop-blur">
      <div className={cx('mx-auto flex min-h-16 items-center gap-3 px-4', wide ? 'max-w-6xl' : 'max-w-5xl')}>
        <Link to={homeTo} className="flex items-baseline gap-2">
          <span className="font-serif text-2xl font-bold tracking-tight text-terracotta-600">{brand.name}</span>
          {tagline && <span className="hidden font-hand text-lg text-ink-muted sm:inline">{tagline}</span>}
        </Link>
        <nav className="ml-4 hidden items-center gap-1 sm:flex">{nav}</nav>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}

/** Page shell: sticky header + centred content column. */
export function Page({ header, title, subtitle, children, narrow, className }: {
  header?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <main className={cx('mx-auto w-full flex-1 px-4 py-6 sm:py-8', narrow ? 'max-w-md' : 'max-w-5xl', className)}>
        {title && (
          <div className="mb-4 sm:mb-5">
            <h1 className="text-3xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
