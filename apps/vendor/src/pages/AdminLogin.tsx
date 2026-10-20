import { ApiError, Bi, Button, Card, Input, Page, api, useAuth, type User } from '@gharka/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export default function AdminLogin() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') navigate(from, { replace: true });
  }, [user, from, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(await api.post<User>('/auth/admin/login', { email, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page header={<SiteHeader />} narrow title={<Bi k="adminLogin" only="en" />}>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Input label={<Bi k="email" only="en" />} type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
          <Input label={<Bi k="password" only="en" />} type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} error={error} required />
          <Button type="submit" size="lg" block loading={busy}><Bi k="login" only="en" /></Button>
        </form>
      </Card>
    </Page>
  );
}
