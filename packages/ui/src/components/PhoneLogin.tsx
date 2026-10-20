import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth, type User } from '../auth';
import { Bi } from './Bi';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { Modal } from './Modal';
import { OtpLogin } from './OtpLogin';
import { Spinner } from './Spinner';

type Props = {
  role: 'customer' | 'vendor';
  onSuccess?: (user: User) => void;
  bilingual?: boolean;
};

/** Login for customers and cooks: SMS code (AUTH_MODE=otp) or invite-only phone + password (AUTH_MODE=password). */
export function PhoneLogin(props: Props) {
  const [mode, setMode] = useState<'otp' | 'password' | null>(null);

  useEffect(() => {
    api.get<{ mode: 'otp' | 'password' }>('/auth/config')
      .then((r) => setMode(r.mode))
      .catch(() => setMode('otp'));
  }, []);

  if (mode === null) return <div className="flex justify-center py-10"><Spinner className="h-8 w-8" /></div>;
  return mode === 'password' ? <PasswordLogin {...props} /> : <OtpLogin {...props} />;
}

function PasswordLogin({ role, onSuccess, bilingual = false }: Props) {
  const { setUser } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const only = bilingual ? 'both' : 'en';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.post<User>('/auth/password/login', { phone, role, password });
      setUser(user);
      onSuccess?.(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={<Bi k="phone" only={only} />} prefix="+91" size="lg" type="tel" inputMode="numeric"
          autoComplete="username" placeholder="98765 43210" autoFocus value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          label={<Bi k="password" only={only} />} size="lg" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} error={error}
        />
        <Button type="submit" size="xl" block loading={busy} disabled={phone.replace(/\D/g, '').length < 10 || !password}>
          <Bi k="login" only={only} />
        </Button>
      </form>
      <div className="mt-4 text-center">
        <Button variant="ghost" size="sm" onClick={() => setInviteOpen(true)}><Bi k="newHere" only={only} /></Button>
      </div>
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={<Bi k="inviteOnlyTitle" only={only} />}>
        <p className="text-ink-soft"><Bi k="inviteOnlyBody" only={only === 'both' ? 'en' : only} /></p>
        {bilingual && <p className="mt-2 text-ink-soft"><Bi k="inviteOnlyBody" only="hi" /></p>}
        <Button className="mt-5" size="lg" block onClick={() => setInviteOpen(false)}><Bi k="ok" only={only} /></Button>
      </Modal>
    </Card>
  );
}
