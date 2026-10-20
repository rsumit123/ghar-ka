import { Badge, Card, EmptyState, Input, Spinner, api, cx, qs } from '@gharka/ui';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FssaiBadge, LiveBadge, ReviewBadge } from '../../components/admin/bits';
import type { AdminVendorRow } from '../../lib/adminTypes';
import { fmtDate } from '../../lib/format';

const TABS = [
  { v: '', label: 'All' },
  { v: 'pending', label: 'Pending' },
  { v: 'approved', label: 'Approved' },
  { v: 'rejected', label: 'Rejected' },
  { v: 'suspended', label: 'Suspended' },
];

export default function AdminVendors() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') ?? '';
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminVendorRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    const h = setTimeout(() => {
      api.get<AdminVendorRow[]>(`/admin/vendors${qs({ status, q: q.trim() })}`).then(setRows).catch((e: Error) => setErr(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(h);
  }, [status, q]);

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">Vendors</h1>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button key={t.v} role="tab" aria-selected={status === t.v} onClick={() => setSp(t.v ? { status: t.v } : {})}
              className={cx('shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold',
                status === t.v ? 'border-turmeric-500 bg-turmeric-100' : 'border-cream-300 bg-white')}>
              {t.label}
            </button>
          ))}
        </div>
        <Input className="sm:ml-auto sm:w-72" placeholder="Search name, phone, pincode" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <p className="text-terracotta-600">{err}</p>}
      {!rows && !err && <Spinner className="h-8 w-8" />}
      {rows && rows.length === 0 && <Card><EmptyState title="No vendors here" hint="Try another tab or search." /></Card>}
      {rows && rows.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-cream-200 bg-white/85 shadow-soft md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream-100 text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="p-3">Vendor</th><th>Area</th><th>Review</th><th>FSSAI</th><th>Docs</th><th>Go-live</th><th>Joined</th></tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-turmeric-50">
                    <td className="p-3"><Link to={`/admin/vendors/${r.id}`} className="font-semibold text-terracotta-700 underline">{r.display_name}</Link><div className="text-ink-muted">{r.phone}</div></td>
                    <td>{r.locality_name ?? '—'}<div className="text-ink-muted">{r.pincode}</div></td>
                    <td><ReviewBadge status={r.review_status} /></td>
                    <td><FssaiBadge status={r.fssai_status} /></td>
                    <td>{r.docs_complete ? <Badge tone="leaf">3/3</Badge> : <Badge tone="turmeric">{r.docs_count}/3</Badge>}</td>
                    <td><LiveBadge live={r.is_live} override={r.live_override} /></td>
                    <td>{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/admin/vendors/${r.id}`}>
                  <Card className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="text-lg font-bold">{r.display_name}</p><p className="text-sm text-ink-muted">{r.phone} · {r.locality_name ?? r.pincode}</p></div>
                      <LiveBadge live={r.is_live} override={r.live_override} />
                    </div>
                    <div className="flex flex-wrap gap-1.5"><ReviewBadge status={r.review_status} /><FssaiBadge status={r.fssai_status} /><Badge tone={r.docs_complete ? 'leaf' : 'turmeric'}>Docs {r.docs_count}/3</Badge></div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
