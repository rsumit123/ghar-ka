import { Badge, Button, Card, EmptyState, Spinner, api, cx, qs, type BadgeTone } from '@gharka/ui';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { selectCls } from '../../components/admin/bits';
import type { AdminOrder, AdminOrdersPage, AdminVendorRow } from '../../lib/adminTypes';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { rupees } from '../../lib/dates';

const STATUSES = ['placed', 'accepted', 'ready', 'completed', 'cancelled'] as const;
const TONE: Record<AdminOrder['status'], BadgeTone> = { placed: 'terracotta', accepted: 'turmeric', ready: 'leaf', completed: 'leaf', cancelled: 'neutral' };
const PAGE_SIZE = 20;

const itemsText = (o: AdminOrder) => o.items.map((i) => `${i.qty} × ${i.name}`).join(', ');

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const vendorId = params.get('vendor_id') ?? '';
  const dateFrom = params.get('date_from') ?? '';
  const dateTo = params.get('date_to') ?? '';
  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [vendors, setVendors] = useState<AdminVendorRow[]>([]);
  const [data, setData] = useState<AdminOrdersPage | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const set = (patch: Record<string, string>) => setParams((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
    if (!('page' in patch)) n.delete('page');
    return n;
  }, { replace: true });

  useEffect(() => { api.get<AdminVendorRow[]>('/admin/vendors').then(setVendors).catch(() => undefined); }, []);
  useEffect(() => {
    setErr(null);
    api.get<AdminOrdersPage>(`/admin/orders${qs({ vendor_id: vendorId, date_from: dateFrom, date_to: dateTo, status, page, page_size: PAGE_SIZE })}`)
      .then(setData).catch((e: Error) => setErr(e.message));
  }, [vendorId, dateFrom, dateTo, status, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const allCount = data ? Object.values(data.summary).reduce((a, b) => a + b, 0) : 0;
  const chip = (on: boolean) => cx('inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-semibold', on ? 'border-ink bg-ink text-cream' : 'border-cream-300 bg-white/80 text-ink-soft');

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">Orders</h1>
      <Card className="mb-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-semibold text-ink-soft">Vendor
            <select className={cx(selectCls, 'mt-1 font-normal')} value={vendorId} onChange={(e) => set({ vendor_id: e.target.value })}>
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-ink-soft">From
            <input type="date" className={cx(selectCls, 'mt-1 font-normal')} value={dateFrom} max={dateTo || undefined} onChange={(e) => set({ date_from: e.target.value })} />
          </label>
          <label className="block text-sm font-semibold text-ink-soft">To
            <input type="date" className={cx(selectCls, 'mt-1 font-normal')} value={dateTo} min={dateFrom || undefined} onChange={(e) => set({ date_to: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Status">
          <button type="button" role="radio" aria-checked={!status} className={chip(!status)} onClick={() => set({ status: '' })}>All {data && <span className="opacity-70">{allCount}</span>}</button>
          {STATUSES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} className={chip(status === s)} onClick={() => set({ status: s })}>
              <span className="capitalize">{s}</span> {data && <span className="opacity-70">{data.summary[s]}</span>}
            </button>
          ))}
          {(vendorId || dateFrom || dateTo || status) && <button type="button" className="min-h-10 px-2 text-sm font-semibold text-terracotta-700 underline" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}
        </div>
      </Card>

      {err && <p className="text-terracotta-600" role="alert">{err}</p>}
      {!data && !err && <Spinner className="h-8 w-8" />}
      {data && data.items.length === 0 && <Card><EmptyState title="No orders match" hint="Try widening the dates or clearing a filter." /></Card>}
      {data && data.items.length > 0 && (
        <>
          {/* Desktop table */}
          <Card padded={false} className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream-100 text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="p-3">#</th><th className="p-3">Meal</th><th className="p-3">Customer</th><th className="p-3">Vendor</th><th className="p-3">Items</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {data.items.map((o) => (
                  <tr key={o.id} className="align-top">
                    <td className="p-3 font-semibold tabular-nums">{o.id}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDate(o.date)}<br /><span className="capitalize text-ink-muted">{o.slot}</span></td>
                    <td className="p-3">{o.customer.name}<br /><span className="text-ink-muted">{o.customer.phone}</span></td>
                    <td className="p-3"><Link className="underline decoration-turmeric-400" to={`/admin/vendors/${o.vendor.id}`}>{o.vendor.name}</Link></td>
                    <td className="max-w-[16rem] p-3">{o.is_tiffin && <Badge tone="turmeric" className="mr-1">Tiffin</Badge>}{itemsText(o)}<br /><span className="text-ink-muted">{o.fulfilment}</span></td>
                    <td className="p-3 text-right font-semibold tabular-nums">{rupees(o.total)}<br /><span className="text-xs font-normal text-ink-muted">{o.payment_method} · {o.payment_status}</span></td>
                    <td className="p-3"><Badge tone={TONE[o.status]}>{o.status}</Badge>{o.cancel_reason && <p className="mt-1 max-w-[10rem] text-xs text-ink-muted">{o.cancel_reason}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((o) => (
              <li key={o.id}>
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">#{o.id} · {o.vendor.name} {o.is_tiffin && <Badge tone="turmeric" className="ml-1">Tiffin</Badge>}</p>
                      <p className="text-sm text-ink-soft">{fmtDate(o.date)} · <span className="capitalize">{o.slot}</span> · {o.fulfilment}</p>
                    </div>
                    <Badge tone={TONE[o.status]}>{o.status}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm">{itemsText(o)}</p>
                  <div className="mt-1.5 flex items-baseline justify-between text-sm">
                    <span className="text-ink-soft">{o.customer.name} {o.customer.phone && <span className="text-ink-muted">· {o.customer.phone}</span>}</span>
                    <span className="font-semibold tabular-nums">{rupees(o.total)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">Placed {fmtDateTime(o.created_at)} · {o.payment_method} {o.payment_status}{o.cancel_reason ? ` · ${o.cancel_reason}` : ''}</p>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>← Newer</Button>
            <span className="text-center text-sm text-ink-soft">Page {page} of {pages} · {data.total} orders</span>
            <Button variant="outline" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Older →</Button>
          </div>
        </>
      )}
    </>
  );
}
