import { cx, Icon } from '@gharka/ui';
import { NavLink } from 'react-router-dom';
import { cartCount, useCart } from '../lib/cart';

const items = [
  { to: '/', label: 'Cooks', icon: <Icon.Pot className="h-6 w-6" />, end: true },
  { to: '/cart', label: 'Cart', icon: <Icon.Basket className="h-6 w-6" /> },
  { to: '/tiffins', label: 'Tiffins', icon: <Icon.Tiffin className="h-6 w-6" /> },
  { to: '/orders', label: 'Orders', icon: <Icon.Receipt className="h-6 w-6" /> },
  { to: '/profile', label: 'Me', icon: <Icon.Person className="h-6 w-6" /> },
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
              {i.icon}
              {i.label}
              {i.to === '/cart' && n > 0 && (
                <span className="absolute right-[24%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta-500 px-1 text-[10px] font-bold text-white">{n}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
