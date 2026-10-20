import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import { Bi } from './components/Bi';
import { EmptyState } from './components/EmptyState';
import { Spinner } from './components/Spinner';

export type Role = 'customer' | 'vendor' | 'admin';

export type User = {
  id: number;
  role: Role;
  phone: string | null;
  email: string | null;
  name: string;
  address_line: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
};

type AuthState = {
  user: User | null;
  /** true until the first /auth/me resolves */
  loading: boolean;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<User>('/auth/me'));
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) console.warn('auth/me failed', e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setUser(null); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(() => ({ user, loading, setUser, refresh, logout }), [user, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Route guard: redirects anonymous users to `loginTo`; shows "no access" for the wrong role. */
export function RequireRole({ roles, loginTo, children }: { roles: Role[]; loginTo: string; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-ink-muted"><Spinner className="h-8 w-8" /></div>;
  }
  if (!user) return <Navigate to={loginTo} replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <EmptyState title={<Bi k="notAllowed" />} />;
  return <>{children}</>;
}
