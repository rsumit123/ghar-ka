import { Bi, Icon, cx, type DictKey } from '@gharka/ui';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const TABS: { to: string; k: DictKey; icon: ReactNode }[] = [
  { to: '/orders', k: 'orders', icon: <Icon.Receipt className="h-6 w-6" /> },
  { to: '/menu', k: 'menu', icon: <Icon.Pot className="h-6 w-6" /> },
  { to: '/plans', k: 'plans', icon: <Icon.Tiffin className="h-6 w-6" /> },
  { to: '/delivery', k: 'delivery', icon: <Icon.Bike className="h-6 w-6" /> },
];

/** Big switches shown on Orders, Menu, Plans and Delivery so cooks never hunt for navigation. */
export function VendorTabs() {
  return (
    <nav className="mb-4 grid grid-cols-4 gap-2" aria-label="Orders, menu, plans and delivery">
      {TABS.map((i) => (
        <NavLink key={i.to} to={i.to}
          className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 py-1.5 text-center text-sm font-bold leading-tight',
            isActive ? 'border-ink bg-ink text-cream' : 'border-cream-300 bg-white/70 text-ink-soft')}>
          {i.icon}<span><Bi k={i.k} /></span>
        </NavLink>
      ))}
    </nav>
  );
}
