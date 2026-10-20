import { cx } from '@gharka/ui';
import { NavLink } from 'react-router-dom';
import { cartCount, useCart } from '../lib/cart';

const items = [
  { to: '/', label: 'Cooks', icon: '🍲', end: true },
  { to: '/cart', label: 'Cart', icon: '🧺' },
  { to: '/orders', label: 'Orders', icon: '🧾' },
  { to: '/profile', label: 'Me', icon: '🙂' },
];

/** Phone-only bottom tabs. */
export function BottomNav() {
  const [cart] = useCart();
  const n = cartCount(cart);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-cream-200 bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <ul className="mx-auto flex max-w-md">
        {items.map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink to={i.to} end={i.end}
              className={({ isActive }) => cx('relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold', isActive ? 'text-terracotta-600' : 'text-ink-muted')}>
              <span className="text-xl" aria-hidden>{i.icon}</span>
              {i.label}
              {i.to === '/cart' && n > 0 && (
                <span className="absolute right-[28%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta-500 px-1 text-[10px] font-bold text-white">{n}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
