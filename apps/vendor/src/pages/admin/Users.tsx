import { ApiError, Badge, Button, Card, EmptyState, Input, Spinner, api, brand, cx, qs } from '@gharka/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { selectCls } from '../../components/admin/bits';
import { fmtDateTime } from '../../lib/format';

type Role = 'customer' | 'vendor';
type InvitedUser = { id: number; role: Role; phone: string | null; name: string; has_password: boolean; created_at: string };
type Filter = Role | 'all';

const ROLE_LABEL: Record<Role, string> = { customer: 'Customer', vendor: 'Cook' };

/** Readable random password: no 0/O/1/l lookalikes. */
function newPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export default function AdminUsers() {
  const [filter, setFilter] = useState<Filter>('all');
  const [users, setUsers] = useState<InvitedUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<InvitedUser[]>(`/admin/users${qs({ role: filter === 'all' ? undefined : filter })}`)
      .then((u) => { setUsers(u); setErr(null); }).catch((e: Error) => setErr(e.message));
  }, [filter]);
  useEffect(() => { setUsers(null); load(); }, [load]);
  useEffect(() => { api.get<{ mode: string }>('/auth/config').then((c) => setMode(c.mode)).catch(() => undefined); }, []);

  const tabBtn = (f: Filter, label: string) => (
    <button type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
      className={cx('min-h-11 rounded-full border-2 px-5 font-semibold', filter === f ? 'border-ink bg-ink text-cream' : 'border-cream-300 bg-white/80 text-ink-soft')}>
      {label}
    </button>
  );

  return (
    <>
      <h1 className="mb-1 text-3xl font-bold">Users</h1>
      <p className="mb-4 text-ink-muted">
        {mode === 'otp'
          ? 'Login is by SMS code right now (AUTH_MODE=otp), so passwords set here are not used.'
          : 'Invite only: customers and cooks log in with their mobile number and the password you set here.'}
      </p>
      <InviteForm onSaved={load} />
      <div className="mb-4 mt-8 flex gap-2" role="tablist" aria-label="Role">
        {tabBtn('all', 'All')}{tabBtn('vendor', 'Cooks')}{tabBtn('customer', 'Customers')}
      </div>
      {err && <p className="text-terracotta-600" role="alert">{err}</p>}
      {!users && !err && <Spinner className="h-8 w-8" />}
      {users && users.length === 0 && <Card><EmptyState title="No users yet" hint="Add a cook or customer above." /></Card>}
      {users && users.length > 0 && (
        <>
        <ul className="space-y-2 sm:hidden">
          {users.map((u) => (
            <li key={u.id}>
              <Card className="!p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{u.name || '—'}</p>
                    <p className="text-sm">{u.phone}</p>
                  </div>
                  <Badge tone={u.role === 'vendor' ? 'turmeric' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Password: {u.has_password ? 'Set' : 'None (signed up by SMS)'} · Added {fmtDateTime(u.created_at)}
                </p>
              </Card>
            </li>
          ))}
        </ul>
        <Card padded={false} className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-cream-200 text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="p-3">Name</th><th className="p-3">Mobile</th><th className="p-3">Role</th><th className="p-3">Password</th><th className="p-3">Added</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-cream-100 last:border-0">
                  <td className="p-3 font-semibold">{u.name || '—'}</td>
                  <td className="p-3">{u.phone}</td>
                  <td className="p-3"><Badge tone={u.role === 'vendor' ? 'turmeric' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge></td>
                  <td className="p-3">{u.has_password ? 'Set' : <span className="text-ink-muted">None (signed up by SMS)</span>}</td>
                  <td className="p-3 text-ink-muted">{fmtDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        </>
      )}
    </>
  );
}

function InviteForm({ onSaved }: { onSaved: () => void }) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('vendor');
  const [name, setName] = useState('');
  const [password, setPassword] = useState(newPassword);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ phone: string; role: Role; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const u = await api.post<InvitedUser>('/admin/users', { phone, role, name, password });
      setDone({ phone: u.phone ?? phone, role, password });
      setCopied(false);
      setPhone('');
      setName('');
      setPassword(newPassword());
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.detail : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const site = done?.role === 'vendor' ? brand.vendorUrl : brand.customerUrl;
  const message = done ? `Your ${brand.name} login\n${site}\nMobile: ${done.phone}\nPassword: ${done.password}` : '';

  return (
    <Card>
      <h2 className="mb-1 text-xl font-bold">Add a user or reset a password</h2>
      <p className="mb-4 text-sm text-ink-muted">Using an existing mobile number and role sets a new password and logs them out everywhere.</p>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Mobile number" prefix="+91" type="tel" inputMode="numeric" placeholder="98765 43210" value={phone}
          onChange={(e) => setPhone(e.target.value)} required />
        <label className="block">
          <span className="mb-1.5 block font-semibold">Role</span>
          <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="vendor">Cook</option>
            <option value="customer">Customer</option>
          </select>
        </label>
        <Input label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <Input label="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required error={err} />
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => setPassword(newPassword())}>Generate another</Button>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="lg" loading={busy} disabled={phone.replace(/\D/g, '').length < 10 || password.length < 8}>Save login</Button>
        </div>
      </form>
      {done && (
        <div className="mt-5 rounded-2xl border-2 border-leaf-200 bg-leaf-50 p-4">
          <p className="font-semibold">Saved. Send them this (the password is not shown again):</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm">{message}</pre>
          <Button size="sm" className="mt-2" onClick={() => { void navigator.clipboard?.writeText(message).then(() => setCopied(true)); }}>
            {copied ? 'Copied' : 'Copy message'}
          </Button>
        </div>
      )}
    </Card>
  );
}
