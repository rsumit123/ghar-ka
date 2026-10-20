import { Card, Icon, Spinner, api } from '@gharka/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminDashboardData } from '../../lib/adminTypes';
import { OrdersChart } from '../../components/admin/OrdersChart';

function Stat({ label, value, to, tone = 'bg-white/85', note }: { label: string; value: string | number; to?: string; tone?: string; note?: string }) {
  const body = (
    <Card className={`h-full ${tone} transition hover:shadow-lift`}>
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <p className="mt-1 font-serif text-4xl font-bold">{value}</p>
      {note && <p className="mt-1 font-hand text-lg text-ink-muted">{note}</p>}
    </Card>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}

export default function AdminDashboard() {
  const [d, setD] = useState<AdminDashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.get<AdminDashboardData>('/admin/dashboard').then(setD).catch((e: Error) => setErr(e.message)); }, []);

  if (err) return <p className="text-terracotta-600">{err}</p>;
  if (!d) return <Spinner className="h-8 w-8" />;
  return (
    <>
      <h1 className="mb-5 text-3xl font-bold">Dashboard</h1>

      {d.fssai_expiring_60d > 0 && (
        <Link to="/admin/fssai?expiring=60" className="mb-5 flex items-center gap-3 rounded-2xl border-2 border-terracotta-300 bg-terracotta-50 p-4 shadow-soft">
          <Icon.Warn className="h-8 w-8 shrink-0 text-terracotta-600" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-terracotta-800">{d.fssai_expiring_60d} FSSAI {d.fssai_expiring_60d === 1 ? 'registration expires' : 'registrations expire'} within 60 days</span>
            <span className="block text-sm text-terracotta-700">Cooks go offline the day theirs lapses. Open the tracker to chase renewals.</span>
          </span>
          <span className="font-semibold text-terracotta-800" aria-hidden>→</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Waiting for review" value={d.pending_vendors} to="/admin/vendors?status=pending" tone="bg-turmeric-50" note={d.pending_vendors ? 'someone is waiting!' : 'all caught up'} />
        <Stat label="Live vendors" value={d.live_vendors} to="/admin/vendors" tone="bg-leaf-50" />
        <Stat label="Approved vendors" value={d.active_vendors} to="/admin/vendors?status=approved" />
        <Stat label="FSSAI expiring ≤ 60 days" value={d.fssai_expiring_60d} to="/admin/fssai?expiring=60" tone={d.fssai_expiring_60d ? 'bg-terracotta-50' : 'bg-white/85'} />
        <Stat label="Orders today" value={d.orders_today} to="/admin/orders" />
        <Stat label="Orders this week" value={d.orders_this_week} to="/admin/orders" note="Mon to Sun" />
        <Stat label="Repeat customers" value={d.repeat_customer_rate === null ? '—' : `${Math.round(d.repeat_customer_rate * 100)}%`}
          note={d.customers_served ? `${d.repeat_customers} of ${d.customers_served} with 2+ meals` : 'no completed orders yet'} />
        <Stat label="Active tiffin subscriptions" value={d.active_subscriptions} tone="bg-turmeric-50/60" />
        <Stat label="Open complaints" value={d.open_complaints} to="/admin/complaints" tone={d.open_complaints ? 'bg-terracotta-50' : 'bg-white/85'} />
      </div>

      <Card className="mt-6">
        <h2 className="font-serif text-xl font-bold">Orders per day</h2>
        <p className="mb-3 text-sm text-ink-muted">Last 14 days, cancelled orders not counted.</p>
        <OrdersChart data={d.orders_per_day} />
      </Card>
    </>
  );
}
