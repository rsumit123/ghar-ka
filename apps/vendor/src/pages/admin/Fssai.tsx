import { Badge, Card, EmptyState, Spinner, api, cx, qs } from '@gharka/ui';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FssaiBadge } from '../../components/admin/bits';
import type { FssaiRow } from '../../lib/adminTypes';
import { fmtDate } from '../../lib/format';

const FILTERS = [
  { v: '', label: 'All' },
  { v: '60', label: 'Expiring ≤ 60 days' },
  { v: '30', label: 'Expiring ≤ 30 days' },
];

function Expiry({ r }: { r: FssaiRow }) {
  const d = r.days_left;
  if (r.expiry_date === null || d === null) return <span className="text-ink-muted">—</span>;
  if (d < 0) return <span className="rounded-lg bg-terracotta-100 px-2 py-0.5 font-semibold text-terracotta-800">{fmtDate(r.expiry_date)} · expired {-d}d ago</span>;
  if (d <= 60) return <span className="rounded-lg bg-turmeric-100 px-2 py-0.5 font-semibold text-turmeric-900">{fmtDate(r.expiry_date)} · {d}d left</span>;
  return <span>{fmtDate(r.expiry_date)}</span>;
}

export default function AdminFssai() {
  const [sp, setSp] = useSearchParams();
  const within = sp.get('expiring') ?? '';
  const [rows, setRows] = useState<FssaiRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    api.get<FssaiRow[]>(`/admin/fssai${qs({ expiring_within: within })}`).then(setRows).catch((e: Error) => setErr(e.message));
  }, [within]);

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">FSSAI tracker</h1>
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button key={f.v} onClick={() => setSp(f.v ? { expiring: f.v } : {})} aria-pressed={within === f.v}
            className={cx('shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold', within === f.v ? 'border-turmeric-500 bg-turmeric-100' : 'border-cream-300 bg-white')}>
            {f.label}
          </button>
        ))}
      </div>
      {err && <p className="text-terracotta-600">{err}</p>}
      {!rows && !err && <Spinner className="h-8 w-8" />}
      {rows && rows.length === 0 && <Card><EmptyState title="Nothing expiring" hint="No vendors match this filter." /></Card>}
      {rows && rows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-cream-200 bg-white/85 shadow-soft md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream-100 text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="p-3">Vendor</th><th>Status</th><th>Application ID</th><th>Registration no.</th><th>Issued</th><th>Expiry</th></tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {rows.map((r) => (
                  <tr key={r.vendor_id} className={cx(r.days_left !== null && r.days_left < 0 && 'bg-terracotta-50', r.days_left !== null && r.days_left >= 0 && r.days_left <= 60 && 'bg-turmeric-50')}>
                    <td className="p-3"><Link className="font-semibold text-terracotta-700 underline" to={`/admin/vendors/${r.vendor_id}`}>{r.display_name}</Link></td>
                    <td><FssaiBadge status={r.status} /></td>
                    <td>{r.application_id ?? '—'}</td>
                    <td>{r.registration_number ?? '—'}</td>
                    <td>{fmtDate(r.issue_date)}</td>
                    <td><Expiry r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.vendor_id}>
                <Link to={`/admin/vendors/${r.vendor_id}`}>
                  <Card className={cx('space-y-1.5', r.days_left !== null && r.days_left < 0 && 'border-terracotta-300 bg-terracotta-50', r.days_left !== null && r.days_left >= 0 && r.days_left <= 60 && 'border-turmeric-300 bg-turmeric-50')}>
                    <div className="flex items-center justify-between gap-2"><b className="text-lg">{r.display_name}</b><FssaiBadge status={r.status} /></div>
                    <p className="text-sm text-ink-soft">App: {r.application_id ?? '—'} · Reg: {r.registration_number ?? '—'}</p>
                    <p className="text-sm">Expiry: <Expiry r={r} /></p>
                    {r.days_left !== null && r.days_left < 0 && <Badge tone="terracotta">Expired</Badge>}
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
