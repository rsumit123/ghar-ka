import { Bi, cx, type DictKey } from '@gharka/ui';
import { NavLink } from 'react-router-dom';

const TABS: { to: string; k: DictKey; icon: string }[] = [
  { to: '/orders', k: 'orders', icon: '🧾' },
  { to: '/menu', k: 'menu', icon: '🍛' },
  { to: '/plans', k: 'plans', icon: '🍱' },
];

/** Big switches shown on Orders, Menu and Plans so cooks never hunt for navigation. */
export function VendorTabs() {
  return (
    <nav className="mb-4 grid grid-cols-3 gap-2" aria-label="Orders, menu and plans">
      {TABS.map((i) => (
        <NavLink key={i.to} to={i.to}
          className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 py-1.5 text-center text-sm font-bold leading-tight',
            isActive ? 'border-ink bg-ink text-cream' : 'border-cream-300 bg-white/70 text-ink-soft')}>
          <span className="text-lg" aria-hidden>{i.icon}</span><span><Bi k={i.k} only="en" /> <Bi k={i.k} only="hi" className="block text-xs font-semibold opacity-80" /></span>
        </NavLink>
      ))}
    </nav>
  );
}
