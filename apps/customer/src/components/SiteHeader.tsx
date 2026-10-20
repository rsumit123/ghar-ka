import { Button, cx, Header, Icon, useAuth } from '@gharka/ui';
import { Link, NavLink } from 'react-router-dom';
import { cartCount, useCart } from '../lib/cart';

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-xl px-3 py-2 font-semibold ${isActive ? 'bg-turmeric-100 text-turmeric-900' : 'text-ink-soft hover:bg-cream-100'}`;

export function CartButton({ className }: { className?: string }) {
  const [cart] = useCart();
  const n = cartCount(cart);
  return (
    <Link to="/cart" aria-label={`Cart, ${n} items`} className={cx('relative flex h-11 w-11 items-center justify-center rounded-full text-2xl hover:bg-cream-100', className)}>
      <Icon.Basket className="h-5 w-5" />
      {n > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta-500 px-1 text-xs font-bold text-white">{n}</span>
      )}
    </Link>
  );
}

export function SiteHeader() {
  const { user, loading, logout } = useAuth();
  return (
    <Header
      tagline="ghar jaisa khaana"
      nav={user ? (
        <>
          <NavLink to="/tiffins" className={navCls}>My tiffins</NavLink>
          <NavLink to="/orders" className={navCls}>My orders</NavLink>
          <NavLink to="/profile" className={navCls}>Profile</NavLink>
        </>
      ) : null}
      actions={
        <>
          <CartButton />
          {loading ? null : user ? (
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => void logout()}>Log out</Button>
          ) : (
            <Link to="/login"><Button variant="outline" size="sm">Log in</Button></Link>
          )}
        </>
      }
    />
  );
}
