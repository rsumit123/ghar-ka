import { cx } from '@gharka/ui';
import { NavLink, Outlet } from 'react-router-dom';
import { SiteHeader } from '../SiteHeader';

const LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/vendors', label: 'Vendors' },
  { to: '/admin/fssai', label: 'FSSAI' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/complaints', label: 'Complaints' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/audit', label: 'Audit log' },
];

/** Top bar + nav (wraps on phones, scrolls from sm), content up to 6xl wide for tables. */
export function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader wide />
      <nav className="sticky top-16 z-20 border-b border-cream-200 bg-cream-100/95 backdrop-blur" aria-label="Admin">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-2 sm:flex-nowrap sm:overflow-x-auto">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}
              className={({ isActive }) => cx('shrink-0 rounded-xl px-3 py-2 text-sm sm:px-4 sm:py-2.5 font-semibold',
                isActive ? 'bg-ink text-cream shadow-soft' : 'text-ink-soft hover:bg-cream-200')}>
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"><Outlet /></main>
    </div>
  );
}
