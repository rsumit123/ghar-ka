import { Bi, Button, Header, LangSwitch, t, useAuth } from '@gharka/ui';
import { Link, NavLink, useLocation } from 'react-router-dom';

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-xl px-3 py-2 font-semibold ${isActive ? 'bg-turmeric-100 text-turmeric-900' : 'text-ink-soft hover:bg-cream-100'}`;

export function SiteHeader({ wide }: { wide?: boolean }) {
  const { user, loading, logout } = useAuth();
  const isAdminArea = useLocation().pathname.startsWith('/admin');
  const isVendor = user?.role === 'vendor';
  return (
    <Header
      wide={wide}
      homeTo={user?.role === 'admin' ? '/admin' : '/'}
      tagline={user?.role === 'admin' ? 'admin' : 'for home cooks'}
      nav={isVendor ? (
        <>
          <NavLink to="/orders" className={navCls}><Bi k="orders" /></NavLink>
          <NavLink to="/menu" className={navCls}><Bi k="menu" /></NavLink>
          <NavLink to="/plans" className={navCls}><Bi k="plans" /></NavLink>
          <NavLink to="/delivery" className={navCls}><Bi k="delivery" /></NavLink>
        </>
      ) : null}
      actions={<>
        {!isAdminArea && user?.role !== 'admin' && <LangSwitch />}
        {loading ? null : user ? (
          <Button variant="ghost" size="sm" onClick={() => void logout()}>{isAdminArea || user.role === 'admin' ? t('logout').en : <Bi k="logout" />}</Button>
        ) : (
          <Link to="/login"><Button variant="outline" size="sm">{isAdminArea ? t('login').en : <Bi k="login" />}</Button></Link>
        )}
      </>}
    />
  );
}
