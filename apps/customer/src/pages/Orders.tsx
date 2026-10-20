import { ApiError, Badge, Button, Card, EmptyState, RequireRole, Spinner, api, type BadgeTone } from '@gharka/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { dateLong, rupees, slotLabel } from '../lib/format';
import type { OrderData, OrderStatus } from '../lib/types';

export const STATUS_TEXT: Record<OrderStatus, string> = {
  placed: 'Waiting for the cook', accepted: 'Cook is preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
};
export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  placed: 'turmeric', accepted: 'turmeric', ready: 'leaf', completed: 'leaf', cancelled: 'terracotta',
};

export default function Orders() {
  return <RequireRole roles={['customer']} loginTo="/login"><OrdersList /></RequireRole>;
}

function OrdersList() {
  const [orders, setOrders] = useState<OrderData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<OrderData[]>('/orders').then(setOrders).catch((e) => setError(e instanceof ApiError ? e.detail : 'Could not load your orders'));
  }, []);

  return (
    <Shell title="My orders">
      {error ? <p className="text-terracotta-600" role="alert">{error}</p>
        : orders === null ? <div className="mt-12 flex justify-center"><Spinner className="h-8 w-8" /></div>
        : orders.length === 0 ? <Card><EmptyState title="No orders yet" hint="Your first home-cooked meal is a few taps away." action={<Link to="/"><Button>Find a cook</Button></Link>} /></Card>
        : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="block rounded-2xl border border-cream-200 bg-white/85 p-4 shadow-soft active:scale-[.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-serif text-lg font-bold">{o.vendor.display_name} {o.is_tiffin && <Badge tone="turmeric" className="ml-1 align-middle font-sans text-xs leading-5">Tiffin</Badge>}</p>
                      <p className="text-sm text-ink-soft">{slotLabel(o.slot)} · {dateLong(o.date)}</p>
                    </div>
                    <Badge tone={STATUS_TONE[o.status]}>{STATUS_TEXT[o.status]}</Badge>
                  </div>
                  <p className="mt-2 truncate text-sm text-ink-soft">{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>
                  <p className="mt-1 font-semibold">{rupees(o.total)} <span className="font-normal text-ink-muted">· {o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</span></p>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </Shell>
  );
}
