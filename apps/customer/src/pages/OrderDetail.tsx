import { api, ApiError, Badge, brand, Button, Card, cx, Icon, Modal, RequireRole, Spinner, TiffinIllustration, useAuth } from '@gharka/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { payForOrder } from '../lib/razorpay';
import { ReportSheet } from '../components/ReportSheet';
import { ReviewSection } from '../components/ReviewForm';
import { Shell } from '../components/Shell';
import { cutoffText, dateLong, dateTimeShort, rupees, slotLabel, waLink } from '../lib/format';
import type { OrderData } from '../lib/types';
import { stepLabels, statusText } from '../lib/handover';
import { STATUS_TONE } from './Orders';

const STEPS = [
  { key: 'placed', icon: <Icon.Receipt className="h-5 w-5" /> },
  { key: 'accepted', icon: <Icon.Chef className="h-5 w-5" /> },
  { key: 'ready', icon: <Icon.Tiffin className="h-5 w-5" /> },
  { key: 'completed', icon: <Icon.Smile className="h-5 w-5" /> },
] as const;

export default function OrderDetail() {
  return <RequireRole roles={['customer']} loginTo="/login"><Detail /></RequireRole>;
}

function Detail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [o, setO] = useState<OrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const { user } = useAuth();

  const load = useCallback(() => {
    api.get<OrderData>(`/orders/${id}`).then(setO).catch((e) => setError(e instanceof ApiError ? e.detail : 'Could not load this order'));
  }, [id]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function pay() {
    if (!o) return;
    setBusy(true);
    setActionError(null);
    try {
      await payForOrder(o, user ?? {});
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Payment did not go through');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setActionError(null);
    try {
      setO(await api.post<OrderData>(`/orders/${id}/cancel`, {}));
      setAsking(false);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.detail : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Shell><Card><p className="text-terracotta-600" role="alert">{error}</p><Link to="/orders" className="mt-3 inline-block underline">Back to my orders</Link></Card></Shell>;
  if (!o) return <Shell><div className="mt-16 flex justify-center"><Spinner className="h-8 w-8" /></div></Shell>;

  const awaitingPayment = o.payment_method === 'razorpay' && o.payment_status !== 'paid' && o.status === 'placed';
  const justPlaced = params.get('placed') === '1' && o.status === 'placed' && !awaitingPayment;
  const stepIndex = STEPS.findIndex((s) => s.key === o.status);
  const labels = stepLabels(o);
  const wa = o.vendor.whatsapp_digits ? waLink(o.vendor.whatsapp_digits, `Hi ${o.vendor.display_name}, about my ${brand.name} order #${o.id}`) : null;

  return (
    <Shell>
      {justPlaced && (
        <div className="mb-6 flex flex-col items-center rounded-3xl border border-leaf-200 bg-leaf-50 px-5 py-6 text-center">
          <TiffinIllustration className="h-32 w-24" />
          <p className="mt-2 font-hand text-3xl text-leaf-700">your order is in!</p>
          <h1 className="font-serif text-2xl font-bold">{o.vendor.display_name} will confirm shortly</h1>
          <p className="mt-1 text-ink-soft">We&apos;ll keep this page updated. {o.payment_method === 'cod' ? `You can pay ${rupees(o.total)} in cash.` : 'Payment received. Thank you!'}</p>
        </div>
      )}
      {awaitingPayment && (
        <Card className="mb-5 border-turmeric-300 bg-turmeric-50">
          <p className="font-serif text-xl font-bold">Complete your payment</p>
          <p className="mt-0.5 text-ink-soft">Your portions are held for a few minutes. The cook sees your order once you&apos;ve paid.</p>
          {actionError && <p className="mt-2 font-medium text-terracotta-600" role="alert">{actionError}</p>}
          <Button block className="mt-3" loading={busy} onClick={() => void pay()}>Pay {rupees(o.total)}</Button>
        </Card>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          {!justPlaced && <h1 className="font-serif text-2xl font-bold">{o.vendor.display_name} {o.is_tiffin && <Badge tone="turmeric" className="ml-1 align-middle font-sans text-xs leading-5">Tiffin</Badge>}</h1>}
          <p className="text-ink-soft">Order #{o.id} · {slotLabel(o.slot)}, {dateLong(o.date)}</p>
        </div>
        <Badge tone={STATUS_TONE[o.status]}>{statusText(o)}</Badge>
      </div>

      {o.status === 'cancelled' ? (
        <Card className="mt-4 border-terracotta-200 bg-terracotta-50">
          <p className="font-semibold text-terracotta-700">This order was cancelled</p>
          {o.cancel_reason && <p className="mt-0.5 text-terracotta-700/90">Reason: {o.cancel_reason}</p>}
        </Card>
      ) : (
        <ol className="mt-5 flex items-start" aria-label="Order progress">
          {STEPS.map((s, i) => {
            const done = i <= stepIndex;
            return (
              <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
                {i > 0 && <span className={cx('absolute right-1/2 top-5 h-1 w-full rounded-full', i <= stepIndex ? 'bg-leaf-500' : 'bg-cream-300')} aria-hidden />}
                <span className={cx('relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg', done ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300 bg-white text-ink-muted')} aria-hidden>{s.icon}</span>
                <span className={cx('mt-1 text-xs font-semibold', done ? 'text-leaf-700' : 'text-ink-muted')}>{labels[s.key]}{i === stepIndex && <span className="sr-only"> (current)</span>}</span>
              </li>
            );
          })}
        </ol>
      )}

      <Card className="mt-5">
        <ul className="space-y-1.5">
          {o.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-3"><span>{i.qty} × {i.name}</span><span className="tabular-nums">{rupees(i.qty * i.unit_price)}</span></li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-dashed border-cream-300 pt-3 font-semibold">
          <span>Total · {o.payment_method === 'cod' ? (o.payment_status === 'paid' ? 'paid in cash' : 'cash on delivery') : o.payment_status}</span>
          <span className="font-serif text-xl">{rupees(o.total)}</span>
        </div>
      </Card>

      <Card className="mt-3 space-y-2 text-[15px]">
        {o.fulfilment === 'pickup' ? (
          <p><strong>You collect</strong> from {o.vendor.display_name}&apos;s kitchen.
            {o.vendor.pickup_address ? <> Address: <strong>{o.vendor.pickup_address}</strong></> : ' The address will show here once the cook accepts.'}</p>
        ) : (
          <p><strong>{o.delivery_by === 'partner' ? 'A delivery partner brings it' : `${o.vendor.display_name} brings it`}</strong> to {o.delivery_address}</p>
        )}
        {o.note && <p className="text-ink-soft">Your note: “{o.note}”</p>}
        <p className="text-sm text-ink-muted">Placed {dateTimeShort(o.created_at)}</p>
      </Card>

      {o.status === 'completed' && <ReviewSection order={o} onDone={setO} />}

      <div className="mt-5 space-y-2">
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-leaf-500 bg-white/70 font-semibold text-leaf-700"><Icon.Chat className="h-5 w-5" /> Message {o.vendor.display_name}</a>}
        {o.can_cancel && o.cutoff_at && (
          <>
            <Button variant="outline" block onClick={() => setAsking(true)}>Cancel order</Button>
            <p className="text-center text-sm text-ink-muted">You can cancel until {cutoffText(o.cutoff_at, o.date)}.</p>
          </>
        )}
        {!o.can_cancel && o.status === 'placed' && <p className="text-center text-sm text-ink-muted">The order-by time has passed, so this order can&apos;t be cancelled. Message the cook if something changed.</p>}
        {o.status === 'accepted' && <p className="text-center text-sm text-ink-muted">The cook has started on your order. To change it, message the cook.</p>}
        <Button variant="ghost" block onClick={() => setReporting(true)}><Icon.Warn className="mr-1.5 h-5 w-5" /> Report a problem</Button>
        <Link to="/orders" className="block"><Button variant="ghost" block>All my orders</Button></Link>
      </div>
      <ReportSheet open={reporting} onClose={() => setReporting(false)} vendor={{ id: o.vendor.id, name: o.vendor.display_name }} orderId={o.id} />

      <Modal open={asking} onClose={() => setAsking(false)} title="Cancel this order?">
        <p className="text-ink-soft">The dishes go back on the menu for others.</p>
        {actionError && <p className="mt-2 font-medium text-terracotta-600" role="alert">{actionError}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="danger" block loading={busy} onClick={() => void cancel()}>Yes, cancel order</Button>
          <Button variant="outline" block onClick={() => setAsking(false)}>No, keep it</Button>
        </div>
      </Modal>
    </Shell>
  );
}
