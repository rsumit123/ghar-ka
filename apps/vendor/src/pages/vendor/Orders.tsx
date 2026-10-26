import { api, ApiError, Badge, type BadgeTone, Bi, brand, Button, Card, cx, type DictKey, EmptyState, Icon, Input, Modal, Page, Spinner, t } from '@gharka/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { SiteHeader } from '../../components/SiteHeader';
import { DateStrip } from '../../components/vendor/DateStrip';
import { VendorTabs } from '../../components/vendor/VendorTabs';
import { clockTime, dateLong, isoDate, rupees } from '../../lib/dates';
import type { OrderStatus, OrdersResponse, Slot, VendorOrder } from '../../lib/types';
import { useVendor } from '../../lib/useVendor';

const REFRESH_MS = 30_000;
const STATUS: Record<OrderStatus, { k: DictKey; tone: BadgeTone }> = {
  placed: { k: 'newOrder', tone: 'terracotta' }, accepted: { k: 'statusAccepted', tone: 'turmeric' }, ready: { k: 'statusReady', tone: 'leaf' },
  completed: { k: 'statusCompleted', tone: 'leaf' }, cancelled: { k: 'statusCancelled', tone: 'neutral' },
};
const NEXT: Partial<Record<OrderStatus, { action: 'accept' | 'ready' | 'complete'; k: DictKey; cls: string }>> = {
  placed: { action: 'accept', k: 'accept', cls: 'bg-turmeric-500 text-ink hover:bg-turmeric-400' },
  accepted: { action: 'ready', k: 'ready', cls: 'bg-leaf-500 text-white hover:bg-leaf-600' },
  ready: { action: 'complete', k: 'done', cls: 'bg-ink text-cream hover:bg-ink-soft' },
};
type Handover = 'pickup' | 'self' | 'partner';
const handover = (o: VendorOrder): Handover => (o.fulfilment === 'pickup' ? 'pickup' : o.delivery_by === 'partner' ? 'partner' : 'self');
/** Words for the ready/done steps that match how the food leaves the kitchen. */
const READY_STATUS: Record<Handover, DictKey> = { pickup: 'statusReadyToCollect', self: 'statusOnTheWay', partner: 'statusWithPartner' };
const DONE_STATUS: Record<Handover, DictKey> = { pickup: 'statusCollected', self: 'statusDelivered', partner: 'statusDelivered' };
const READY_BUTTON: Record<Handover, DictKey> = { pickup: 'markReadyToCollect', self: 'markOutForDelivery', partner: 'markHandedToPartner' };
const DONE_BUTTON: Record<Handover, DictKey> = { pickup: 'markCollected', self: 'markDelivered', partner: 'markDelivered' };
const HANDOVER: Record<Handover, { k: DictKey; icon: ReactNode }> = {
  pickup: { k: 'pickup', icon: <Icon.Walk className="h-5 w-5" /> },
  self: { k: 'homeDelivery', icon: <Icon.Bike className="h-5 w-5" /> },
  partner: { k: 'partnerDelivery', icon: <Icon.Bike className="h-5 w-5" /> },
};
const REASONS: DictKey[] = ['reasonOutOfStock', 'reasonUnwell', 'reasonTooFar', 'reasonOther'];
const isActive = (o: VendorOrder) => o.status === 'placed' || o.status === 'accepted' || o.status === 'ready';

export default function Orders() {
  const { me } = useVendor();
  const [date, setDate] = useState(isoDate(0));
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [cancelling, setCancelling] = useState<VendorOrder | null>(null);
  const dateRef = useRef(date);
  dateRef.current = date;

  const load = useCallback(async (day: string, silent = false) => {
    if (!silent) setData(null);
    try {
      const r = await api.get<OrdersResponse>(`/vendor/orders?date=${day}`);
      if (day === dateRef.current) { setData(r); setError(null); setUpdated(new Date()); }
    } catch (e) {
      if (!silent) setError(e instanceof ApiError ? e.detail : 'Could not load orders');
    }
  }, []);

  useEffect(() => {
    void load(date);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(date, true); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [date, load]);

  const bySlot = useMemo(() => {
    const out: Record<Slot, VendorOrder[]> = { lunch: [], dinner: [] };
    for (const o of data?.orders ?? []) out[o.slot].push(o);
    return out;
  }, [data]);

  if (!me.onboarded) return <Navigate to="/onboarding" replace />;
  return (
    <Page header={<SiteHeader />} narrow title={<Bi k="todayOrders" />}>
      <VendorTabs />
      <DateStrip value={date} onChange={setDate} from={-1} />
      <div className="mt-2 flex items-center justify-between text-sm text-ink-muted">
        <span>{dateLong(date)} · <Bi k="autoRefresh" only="en" /></span>
        <button type="button" className="min-h-10 px-2 font-semibold text-leaf-700 underline" onClick={() => void load(date, true)}>
          ↻ <Bi k="refresh" only="en" />{updated ? ` (${clockTime(updated.toISOString())})` : ''}
        </button>
      </div>

      {error ? <p className="mt-6 text-terracotta-600" role="alert">{error}</p>
        : data === null ? <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        : (
          <div className="mt-4 space-y-8">
            {(['lunch', 'dinner'] as const).map((slot) => (
              <SlotSection key={slot} slot={slot} orders={bySlot[slot]} summary={data.summary.filter((s) => s.slot === slot)}
                onChanged={() => load(date, true)} onCancel={setCancelling} />
            ))}
          </div>
        )}

      <CancelSheet order={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); void load(date, true); }} />
    </Page>
  );
}

function SlotSection({ slot, orders, summary, onChanged, onCancel }: {
  slot: Slot; orders: VendorOrder[]; summary: OrdersResponse['summary']; onChanged: () => void; onCancel: (o: VendorOrder) => void;
}) {
  const active = orders.filter(isActive);
  const finished = orders.filter((o) => !isActive(o));
  return (
    <section aria-label={t(slot).en}>
      <h2 className="mb-2 flex items-center gap-2 font-serif text-2xl font-bold">
        {slot === 'lunch' ? <Icon.Sun className="h-6 w-6" /> : <Icon.Moon className="h-6 w-6" />}<Bi k={slot} />
        {active.length > 0 && <span className="rounded-full bg-terracotta-500 px-2.5 py-0.5 font-sans text-sm text-white">{active.length}</span>}
      </h2>
      {summary.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label={t('summaryToday').en}>
          {summary.map((s) => (
            <li key={s.offering_id} className={cx('rounded-full px-3.5 py-1.5 text-base font-semibold ring-1', s.sold >= s.total ? 'bg-terracotta-50 text-terracotta-700 ring-terracotta-200' : 'bg-white text-ink ring-cream-300')}>
              {s.dish_name}: {s.sold} <Bi k="of" only="en" /> {s.total} <Bi k="soldCount" only="en" />
            </li>
          ))}
        </ul>
      )}
      {orders.length === 0 ? <Card><EmptyState title={<Bi k="noOrders" />} illustration={<span className="text-5xl" aria-hidden>🍽️</span>} /></Card> : (
        <div className="space-y-4">
          {active.map((o) => <OrderCard key={o.id} o={o} onChanged={onChanged} onCancel={onCancel} />)}
          {finished.length > 0 && (
            <details className="rounded-2xl border border-cream-200 bg-white/50 p-3">
              <summary className="min-h-10 cursor-pointer text-base font-semibold text-ink-soft">
                <Bi k="statusCompleted" only="en" /> / <Bi k="statusCancelled" only="en" /> ({finished.length})
              </summary>
              <div className="mt-3 space-y-3">{finished.map((o) => <OrderCard key={o.id} o={o} onChanged={onChanged} onCancel={onCancel} />)}</div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function OrderCard({ o, onChanged, onCancel }: { o: VendorOrder; onChanged: () => void; onCancel: (o: VendorOrder) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const how = handover(o);
  const step = NEXT[o.status];
  const next = step && { ...step, k: o.status === 'accepted' ? READY_BUTTON[how] : o.status === 'ready' ? DONE_BUTTON[how] : step.k };
  const st = { ...STATUS[o.status], k: o.status === 'ready' ? READY_STATUS[how] : o.status === 'completed' ? DONE_STATUS[how] : STATUS[o.status].k };

  async function advance() {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/vendor/orders/${o.id}/${next.action}`);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Error');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const waText = `Hi ${o.customer.name || ''}, this is ${brand.name} about your order #${o.id}.`;
  const mapUrl = o.lat != null && o.lng != null ? `https://www.openstreetmap.org/?mlat=${o.lat}&mlon=${o.lng}#map=18/${o.lat}/${o.lng}` : null;
  return (
    <article className={cx('rounded-3xl border-2 bg-white p-4 shadow-soft', o.status === 'placed' ? 'border-terracotta-300' : 'border-cream-200', !isActive(o) && 'opacity-80')}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-2xl font-bold leading-tight">{o.customer.name || o.customer.phone}</h3>
            {o.is_tiffin && <Badge tone="turmeric" className="shrink-0 px-3 py-1 text-sm"><Bi k="tiffinBadge" /></Badge>}
          </div>
          <p className="text-sm text-ink-muted">#{o.id} · {clockTime(o.created_at)}</p>
        </div>
        <Badge tone={st.tone} className="px-3 py-1 text-sm"><Bi k={st.k} /></Badge>
      </header>

      <ul className="mt-3 space-y-0.5 text-xl">
        {o.items.map((i, idx) => <li key={idx}><strong className="tabular-nums">{i.qty} ×</strong> {i.name}</li>)}
      </ul>

      <div className="mt-3 rounded-2xl bg-cream-100/70 p-3 text-base">
        <p className="font-bold"><span className="inline-flex items-center gap-1.5">{HANDOVER[how].icon} <Bi k={HANDOVER[how].k} /></span></p>
        {o.fulfilment === 'delivery' && o.delivery_address && (
          <p className="mt-0.5">{o.delivery_address}{mapUrl && <> · <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-leaf-700 underline">Map</a></>}</p>
        )}
        {o.note && <p className="mt-1.5 font-serif italic"><span className="not-italic font-semibold"><Bi k="customerNote" only="en" />:</span> “{o.note}”</p>}
        <p className="mt-1.5 text-sm font-semibold text-ink-soft">
          {rupees(o.total)} · {o.payment_method === 'cod' ? (o.payment_status === 'paid' ? <Bi k="paid" /> : <Bi k="cashOnDelivery" />) : o.payment_status}
        </p>
      </div>
      {o.status === 'cancelled' && o.cancel_reason && <p className="mt-2 text-sm text-ink-muted">{o.cancel_reason}</p>}

      {o.customer.phone && o.status !== 'cancelled' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:${o.customer.phone}`} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-ink/20 bg-white font-bold"><Icon.Phone className="h-5 w-5" /><Bi k="call" /></a>
          <a href={`https://wa.me/${o.customer.whatsapp_digits}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-leaf-500 bg-white font-bold text-leaf-700"><Icon.Chat className="h-5 w-5" /><Bi k="whatsapp" /></a>
        </div>
      )}

      {error && <p className="mt-2 font-medium text-terracotta-600" role="alert">{error}</p>}
      {next && (
        <button type="button" disabled={busy} onClick={() => void advance()}
          className={cx('mt-3 flex min-h-[4.25rem] w-full items-center justify-center gap-2 rounded-2xl text-2xl font-bold shadow-soft transition active:scale-[.98] disabled:opacity-60', next.cls)}>
          {busy ? <Spinner className="h-6 w-6" /> : <Bi k={next.k} />}
        </button>
      )}
      {isActive(o) && (
        <button type="button" className="mt-2 min-h-11 w-full text-base font-semibold text-terracotta-600 underline" onClick={() => onCancel(o)}>
          <Bi k="cancelOrder" />
        </button>
      )}
    </article>
  );
}

function CancelSheet({ order, onClose, onDone }: { order: VendorOrder | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<DictKey | null>(null);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setReason(null); setOther(''); setError(null); }, [order]);

  const text = reason === 'reasonOther' ? other.trim() : reason ? t(reason).en : '';
  async function confirm() {
    if (!order || text.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/vendor/orders/${order.id}/cancel`, { reason: text });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={!!order} onClose={onClose} title={<Bi k="cancelWhy" />} footer={(
      <div className="space-y-2">
        {error && <p className="font-medium text-terracotta-600" role="alert">{error}</p>}
        <Button variant="danger" size="xl" block loading={busy} disabled={text.length < 3} onClick={() => void confirm()}><Bi k="confirmCancel" /></Button>
        <Button variant="outline" block onClick={onClose}><Bi k="keepOrder" /></Button>
      </div>
    )}>
      <div className="space-y-3">
        <p className="text-base text-ink-soft">{order?.customer.name} · #{order?.id}</p>
        <div className="flex flex-col gap-2">
          {REASONS.map((k) => (
            <button key={k} type="button" onClick={() => setReason(k)}
              className={cx('min-h-14 rounded-2xl border-2 px-4 text-left text-lg font-semibold', reason === k ? 'border-terracotta-500 bg-terracotta-50' : 'border-cream-300 bg-white')}><Bi k={k} /></button>
          ))}
        </div>
        {reason === 'reasonOther' && <Input value={other} onChange={(e) => setOther(e.target.value)} maxLength={300} placeholder="…" aria-label={t('reasonOther').en} autoFocus />}
      </div>
    </Modal>
  );
}
