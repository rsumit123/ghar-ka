import { ApiError, Button, Card, Input, RequireRole, api, useAuth, type User } from '@gharka/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LocationPicker } from '../components/LazyMaps';
import { ReportSheet } from '../components/ReportSheet';
import { Shell } from '../components/Shell';
import { dateTimeShort } from '../lib/format';
import type { Complaint } from '../lib/types';

export default function Profile() {
  return <RequireRole roles={['customer']} loginTo="/login"><ProfileForm /></RequireRole>;
}

function ProfileForm() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [address, setAddress] = useState(user?.address_line ?? '');
  const [pincode, setPincode] = useState(user?.pincode ?? '');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reports, setReports] = useState<Complaint[]>([]);
  const loadReports = () => { api.get<Complaint[]>('/complaints').then(setReports).catch(() => undefined); };
  useEffect(loadReports, []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      setUser(await api.put<User>('/me', {
        name: name.trim() || undefined, address_line: address.trim(), pincode: pincode.trim() || undefined,
        lat: pos?.lat, lng: pos?.lng,
      }));
      setMsg({ ok: true, text: 'Saved' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.detail : 'Could not save' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Your profile" subtitle={user?.phone ?? undefined}>
      <div className="space-y-4">
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <div>
          <label htmlFor="addr" className="mb-1.5 block text-sm font-semibold text-ink-soft">Delivery address</label>
          <textarea id="addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={255}
            placeholder="Flat / house no., building, landmark" className="w-full rounded-xl border-2 border-cream-300 bg-white px-4 py-3 text-base focus:border-turmeric-500" />
        </div>
        <Input label="Pincode" inputMode="numeric" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        <Card padded={false} className="p-3">
          <p className="mb-2 font-semibold">Home location</p>
          <LocationPicker value={pos} onChange={setPos} height={240} />
        </Card>
        {msg && <p className={msg.ok ? 'font-medium text-leaf-700' : 'font-medium text-terracotta-600'} role="status">{msg.text}</p>}
        <Button size="xl" block loading={busy} onClick={() => void save()}>Save</Button>
        <section className="pt-4">
          <h2 className="font-serif text-xl font-bold">Help</h2>
          <p className="text-sm text-ink-muted">Something wrong with an order or a cook? Tell our team.</p>
          <Button variant="outline" block className="mt-2" onClick={() => setReporting(true)}>⚠ Report a problem</Button>
          {reports.length > 0 && (
            <ul className="mt-3 space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="rounded-2xl border border-cream-200 bg-white/80 p-3 text-sm">
                  <div className="flex justify-between gap-2"><span className="font-semibold">{r.vendor_name}</span>
                    <span className={r.status === 'open' ? 'font-semibold text-turmeric-700' : 'font-semibold text-leaf-700'}>{r.status === 'open' ? 'With our team' : 'Resolved'}</span></div>
                  <p className="mt-0.5 text-ink-soft">{r.text}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{dateTimeShort(r.created_at)}{r.order_id ? <> · <Link to={`/orders/${r.order_id}`} className="underline">order #{r.order_id}</Link></> : null}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Button variant="ghost" block onClick={() => void logout()}>Log out</Button>
      </div>
      <ReportSheet open={reporting} onClose={() => setReporting(false)} onSent={loadReports} />
    </Shell>
  );
}
