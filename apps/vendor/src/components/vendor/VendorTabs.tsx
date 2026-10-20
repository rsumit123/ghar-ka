import { Bi, cx } from '@gharka/ui';
import { NavLink } from 'react-router-dom';

/** Two big switches shown on Orders and Menu so cooks never hunt for navigation. */
export function VendorTabs() {
  return (
    <nav className="mb-4 grid grid-cols-2 gap-2" aria-label="Orders and menu">
      {[{ to: '/orders', k: 'orders', icon: '🧾' }, { to: '/menu', k: 'menu', icon: '🍛' }].map((i) => (
        <NavLink key={i.to} to={i.to}
          className={({ isActive }) => cx('flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 font-bold', isActive ? 'border-ink bg-ink text-cream' : 'border-cream-300 bg-white/70 text-ink-soft')}>
          <span aria-hidden>{i.icon}</span><Bi k={i.k as 'orders' | 'menu'} />
        </NavLink>
      ))}
    </nav>
  );
}
