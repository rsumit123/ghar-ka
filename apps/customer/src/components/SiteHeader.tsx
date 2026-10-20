import { Bi, Button, Header, useAuth } from '@gharka/ui';
import { Link } from 'react-router-dom';

export function SiteHeader() {
  const { user, loading, logout } = useAuth();
  return (
    <Header
      tagline="ghar jaisa khaana"
      actions={
        loading ? null : user ? (
          <>
            <span className="hidden text-sm text-ink-soft sm:inline">{user.name || user.phone}</span>
            <Button variant="ghost" size="sm" onClick={() => void logout()}><Bi k="logout" only="en" /></Button>
          </>
        ) : (
          <Link to="/login"><Button variant="outline" size="sm"><Bi k="login" only="en" /></Button></Link>
        )
      }
    />
  );
}
