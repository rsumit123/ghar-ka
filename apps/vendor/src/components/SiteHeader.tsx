import { Bi, Button, Header, useAuth } from '@gharka/ui';
import { Link, NavLink } from 'react-router-dom';

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-xl px-3 py-2 font-semibold ${isActive ? 'bg-turmeric-100 text-turmeric-900' : 'text-ink-soft hover:bg-cream-100'}`;

export function SiteHeader() {
  const { user, loading, logout } = useAuth();
  const isVendor = user?.role === 'vendor';
  return (
    <Header
      homeTo={user?.role === 'admin' ? '/admin' : '/'}
      tagline={user?.role === 'admin' ? 'admin' : 'for home cooks'}
      nav={isVendor ? (
        <>
          <NavLink to="/orders" className={navCls}><Bi k="orders" /></NavLink>
          <NavLink to="/menu" className={navCls}><Bi k="menu" /></NavLink>
        </>
      ) : null}
      actions={
        loading ? null : user ? (
          <Button variant="ghost" size="sm" onClick={() => void logout()}><Bi k="logout" /></Button>
        ) : (
          <Link to="/login"><Button variant="outline" size="sm"><Bi k="login" /></Button></Link>
        )
      }
    />
  );
}
