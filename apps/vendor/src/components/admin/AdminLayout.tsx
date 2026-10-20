import { cx } from '@gharka/ui';
import { NavLink, Outlet } from 'react-router-dom';
import { SiteHeader } from '../SiteHeader';

const LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/vendors', label: 'Vendors' },
  { to: '/admin/fssai', label: 'FSSAI' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/complaints', label: 'Complaints' },
  { to: '/admin/audit', label: 'Audit log' },
];

/** Top bar + scrollable nav (works on phones), content up to 6xl wide for tables. */
export function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <nav className="sticky top-16 z-20 border-b border-cream-200 bg-cream-100/95 backdrop-blur" aria-label="Admin">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}
              className={({ isActive }) => cx('shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold',
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
