import { ApiError, Badge, Button, Card, EmptyState, Spinner, api, cx, qs } from '@gharka/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { textareaCls } from '../../components/admin/bits';
import type { AdminComplaint, AdminComplaintsPage } from '../../lib/adminTypes';
import { fmtDate, fmtDateTime } from '../../lib/format';

type Tab = 'open' | 'resolved';

export default function AdminComplaints() {
  const [tab, setTab] = useState<Tab>('open');
  const [data, setData] = useState<AdminComplaintsPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    api.get<AdminComplaintsPage>(`/admin/complaints${qs({ status: tab, page_size: 100 })}`).then((d) => { setData(d); setErr(null); }).catch((e: Error) => setErr(e.message));
  }, [tab]);
  useEffect(() => { setData(null); setOpenId(null); load(); }, [load]);

  const tabBtn = (t: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={cx('min-h-11 rounded-full border-2 px-5 font-semibold', tab === t ? 'border-ink bg-ink text-cream' : 'border-cream-300 bg-white/80 text-ink-soft')}>
      {label} {data && <span className="opacity-70">{data.summary[t]}</span>}
    </button>
  );

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">Complaints</h1>
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Complaint status">{tabBtn('open', 'Open')}{tabBtn('resolved', 'Resolved')}</div>
      {err && <p className="text-terracotta-600" role="alert">{err}</p>}
      {!data && !err && <Spinner className="h-8 w-8" />}
      {data && data.items.length === 0 && <Card><EmptyState title={tab === 'open' ? 'No open complaints' : 'Nothing resolved yet'} hint={tab === 'open' ? 'Good news. Customers can report a problem from any order.' : undefined} /></Card>}
      {data && data.items.length > 0 && (
        <ul className="space-y-3">
          {data.items.map((c) => (
            <li key={c.id}>
              <Card padded={false} className="overflow-hidden">
                <button type="button" className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={openId === c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.customer.name || c.customer.phone} <span className="font-normal text-ink-muted">about</span> {c.vendor.name}</p>
                    <p className={cx('mt-0.5 text-ink-soft', openId !== c.id && 'line-clamp-2')}>{c.text}</p>
                    <p className="mt-1 text-xs text-ink-muted">{fmtDateTime(c.created_at)}{c.order ? ` · order #${c.order.id}` : ''}</p>
                  </div>
                  <Badge tone={c.status === 'open' ? 'terracotta' : 'leaf'}>{c.status}</Badge>
                </button>
                {openId === c.id && <Detail c={c} onSaved={() => { setOpenId(null); load(); }} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Detail({ c, onSaved }: { c: AdminComplaint; onSaved: () => void }) {
  const [note, setNote] = useState(c.admin_note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(status: Tab) {
    setBusy(true);
    setErr(null);
    try {
      await api.put(`/admin/complaints/${c.id}`, { status, admin_note: note.trim() || null });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.detail : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  const orderLink = c.order ? `/admin/orders?vendor_id=${c.vendor.id}&date_from=${c.order.date}&date_to=${c.order.date}` : null;
  return (
    <div className="space-y-3 border-t border-cream-200 bg-cream-100/50 p-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Customer</dt><dd>{c.customer.name}<br />{c.customer.phone}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cook</dt><dd><Link className="underline decoration-turmeric-400" to={`/admin/vendors/${c.vendor.id}`}>{c.vendor.name}</Link></dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Order</dt>
          <dd>{c.order && orderLink ? <Link className="underline decoration-turmeric-400" to={orderLink}>#{c.order.id} · {fmtDate(c.order.date)} {c.order.slot} ({c.order.status})</Link> : 'Not about a specific order'}</dd></div>
      </dl>
      <label className="block text-sm font-semibold text-ink-soft">Internal note
        <textarea className={cx(textareaCls, 'mt-1 font-normal')} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What did you do? (only admins see this)" />
      </label>
      {err && <p className="font-medium text-terracotta-600" role="alert">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {c.status === 'open'
          ? <Button variant="secondary" loading={busy} onClick={() => void save('resolved')}>Mark resolved</Button>
          : <Button variant="outline" loading={busy} onClick={() => void save('open')}>Reopen</Button>}
        <Button variant="ghost" loading={busy} onClick={() => void save(c.status)}>Save note</Button>
      </div>
    </div>
  );
}
