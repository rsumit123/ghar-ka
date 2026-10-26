import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth, type User } from '../auth';
import { Bi } from './Bi';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';

type Props = {
  role: 'customer' | 'vendor';
  onSuccess?: (user: User) => void;
};

/** Phone → 6-digit code login, shared by both apps. */
export function OtpLogin({ role, onSuccess }: Props) {
  const { setUser } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.detail : 'Something went wrong'); } finally { setBusy(false); }
  }

  const requestCode = (e?: FormEvent) => {
    e?.preventDefault();
    void run(async () => {
      await api.post('/auth/otp/request', { phone, role });
      setCode('');
      setStep('code');
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const user = await api.post<User>('/auth/otp/verify', { phone, role, code });
      setUser(user);
      onSuccess?.(user);
    });
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      {step === 'phone' ? (
        <form onSubmit={requestCode} className="space-y-4">
          <Input
            label={<Bi k="phone" />} prefix="+91" size="lg" type="tel" inputMode="numeric"
            autoComplete="tel-national" placeholder="98765 43210" autoFocus value={phone}
            onChange={(e) => setPhone(e.target.value)} error={error}
          />
          <Button type="submit" size="xl" block loading={busy} disabled={phone.replace(/\D/g, '').length < 10}>
            <Bi k="sendCode" />
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-ink-soft">
            <Bi k="codeSentTo" /> <strong className="text-ink">+91 {phone}</strong>
          </p>
          <Input
            label={<Bi k="enterCode" />} size="lg" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} autoFocus value={code} placeholder="••••••"
            className="[&_input]:text-center [&_input]:font-semibold [&_input]:tracking-[0.5em]"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={error}
          />
          <Button type="submit" size="xl" block loading={busy} disabled={code.length < 6}>
            <Bi k="verify" />
          </Button>
          <div className="flex justify-between text-sm">
            <Button variant="ghost" size="sm" onClick={() => { setStep('phone'); setError(null); }}>
              <Bi k="changeNumber" />
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => requestCode()}>
              <Bi k="resend" />
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
