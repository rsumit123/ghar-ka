import { api, ApiError, Button, cx, Icon, Modal, useAuth } from '@gharka/ui';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dayNum, daysText, haversineKm, isoDate, monthShort, rupees, slotLabel, weekdayIndex, weekdayShort } from '../lib/format';
import { deliverySub } from '../lib/handover';
import { placeStore } from '../lib/place';
import type { Fulfilment, Plan, Subscription, VendorProfile } from '../lib/types';
import { FulfilmentOption } from './FulfilmentOption';
import { LocationPicker } from './LazyMaps';
import { Stepper } from './Stepper';
import { DietMark } from './DietMark';

type Pos = { lat: number; lng: number };

/** Bottom sheet to subscribe to a tiffin plan. Opened from the cook's profile. */
export function SubscribeSheet({ plan, vendor, onClose }: { plan: Plan | null; vendor: VendorProfile; onClose: () => void }) {
  return plan ? <Body plan={plan} vendor={vendor} onClose={onClose} /> : null;
}

const TITLE = 'Subscribe to a tiffin';

function Body({ plan, vendor, onClose }: { plan: Plan; vendor: VendorProfile; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [start, setStart] = useState(isoDate(1));
  const [weeks, setWeeks] = useState(1);
  const [fulfilment, setFulfilment] = useState<Fulfilment>(vendor.offers_pickup ? 'pickup' : 'delivery');
  const [address, setAddress] = useState(user?.address_line ?? '');
  const [pos, setPos] = useState<Pos | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.lat != null && user?.lng != null) setPos({ lat: user.lat, lng: user.lng });
    else {
      const p = placeStore.read();
      if (p?.precise && p.lat !== undefined && p.lng !== undefined) setPos({ lat: p.lat, lng: p.lng });
    }
    if (user?.address_line) setAddress((a) => a || user.address_line!);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips = Array.from({ length: 7 }, (_, i) => isoDate(i + 1));
  const firstMeal = useMemo(() => {
    for (let i = 0; i < 7; i++) {
      const d = isoDate(1 + chips.indexOf(start) + i);
      if (plan.days_of_week.includes(weekdayIndex(d))) return d;
    }
    return start;
  }, [start, plan.days_of_week]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    const dist = pos && vendor.lat !== null && vendor.lng !== null ? haversineKm(pos, { lat: vendor.lat, lng: vendor.lng }) : null;
    let deliveryWhy: string | null = null;
    if (vendor.delivery_radius_km <= 0) deliveryWhy = `${vendor.display_name} doesn't deliver.`;
    else if (dist !== null && dist > vendor.delivery_radius_km + 0.15)
      deliveryWhy = `You're about ${dist.toFixed(1)} km away. Delivery is within ${vendor.delivery_radius_km} km.`;
    return { dist, deliveryWhy, pickupWhy: vendor.offers_pickup ? null : `${vendor.display_name} doesn't offer pickup.` };
  }, [vendor, pos]);

  useEffect(() => {
    if (fulfilment === 'delivery' && options.deliveryWhy && !options.pickupWhy) setFulfilment('pickup');
    if (fulfilment === 'pickup' && options.pickupWhy && !options.deliveryWhy) setFulfilment('delivery');
  }, [options, fulfilment]);

  if (!user) {
    return (
      <Modal open onClose={onClose} title={TITLE}>
        <p className="text-ink-soft">Log in with your mobile number to subscribe to <strong>{plan.name}</strong>.</p>
        <Link to="/login" state={{ from: `/cook/${vendor.id}` }} className="mt-4 block" onClick={onClose}><Button size="lg" block>Log in to subscribe</Button></Link>
      </Modal>
    );
  }
  if (user.role !== 'customer') return <Modal open onClose={onClose} title={TITLE}><p className="text-ink-soft">Please use a customer account to subscribe.</p></Modal>;

  const total = plan.price_per_week * weeks;
  const blocked = fulfilment === 'delivery' ? (!address.trim() ? 'Add your delivery address' : !pos ? 'Pin your location on the map' : null) : null;

  async function submit() {
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<Subscription>('/subscriptions', {
        plan_id: plan.id, start_date: start, weeks, fulfilment,
        ...(fulfilment === 'delivery' ? { delivery_address: address.trim(), lat: pos?.lat, lng: pos?.lng } : {}),
      });
      onClose();
      navigate('/tiffins?new=1');
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <div className="space-y-2">
      {blocked && <p className="text-sm font-medium text-terracotta-600">{blocked}</p>}
      {error && <p className="rounded-xl bg-terracotta-50 p-3 font-medium text-terracotta-700" role="alert">{error}</p>}
      <Button size="xl" block loading={busy} disabled={!!blocked} onClick={() => void submit()}>Subscribe · {rupees(total)}</Button>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={TITLE} footer={footer}>
      <div className="space-y-5">
        <div className="rounded-2xl bg-turmeric-50/70 p-3.5">
          <p className="font-serif text-lg font-bold"><DietMark diet={plan.diet} className="mr-1.5 align-[-2px]" />{plan.name}</p>
          <p className="text-sm text-ink-soft">{vendor.display_name} · {slotLabel(plan.slot)} · {daysText(plan.days_of_week)}</p>
        </div>

        <section>
          <h3 className="mb-2 font-semibold">Start from</h3>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Start date">
            {chips.map((d, i) => (
              <button key={d} type="button" role="radio" aria-checked={d === start} onClick={() => setStart(d)}
                className={cx('flex min-h-16 min-w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-2 transition',
                  d === start ? 'border-terracotta-500 bg-terracotta-500 text-white shadow-soft' : 'border-cream-300 bg-white/80')}>
                <span className={cx(i === 0 ? 'font-hand text-xl leading-6' : 'text-sm font-semibold')}>{i === 0 ? 'Tomorrow' : weekdayShort(d)}</span>
                <span className={cx('text-xs', d === start ? 'text-white/85' : 'text-ink-muted')}>{dayNum(d)} {monthShort(d)}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">First meal: {weekdayShort(firstMeal)} {dayNum(firstMeal)} {monthShort(firstMeal)}</p>
        </section>

        <section className="flex items-center justify-between gap-3">
          <div><h3 className="font-semibold">How many weeks?</h3><p className="text-sm text-ink-muted">You can pause or cancel any time.</p></div>
          <Stepper value={weeks} onChange={setWeeks} min={1} max={8} label="weeks" />
        </section>

        <section>
          <h3 className="mb-2 font-semibold">How will you get it?</h3>
          <div className="grid gap-2.5">
            <FulfilmentOption selected={fulfilment === 'pickup'} disabled={!!options.pickupWhy} why={options.pickupWhy} onSelect={() => setFulfilment('pickup')}
              title="I'll collect it" sub={`from ${vendor.display_name}'s kitchen`} icon={<Icon.Walk className="h-8 w-8" />} />
            <FulfilmentOption selected={fulfilment === 'delivery'} disabled={!!options.deliveryWhy} why={options.deliveryWhy} onSelect={() => setFulfilment('delivery')}
              title="Bring it to me" sub={deliverySub(vendor)} icon={<Icon.Bike className="h-8 w-8" />} />
          </div>
          {fulfilment === 'delivery' && (
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="sub-addr" className="mb-1.5 block text-sm font-semibold text-ink-soft">Delivery address</label>
                <textarea id="sub-addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={400}
                  placeholder="Flat / house no., building, landmark" className="w-full rounded-xl border-2 border-cream-300 bg-white px-4 py-3 text-base focus:border-turmeric-500" />
              </div>
              <LocationPicker value={pos} onChange={setPos} height={220}
                fallbackCenter={vendor.lat !== null && vendor.lng !== null ? { lat: vendor.lat, lng: vendor.lng } : undefined} />
              {options.deliveryWhy && <p className="text-sm font-medium text-terracotta-600" role="alert">{options.deliveryWhy}</p>}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-dashed border-cream-300 bg-white/70 p-3.5">
          <p className="text-sm text-ink-soft">{daysText(plan.days_of_week)} · {plan.days_of_week.length} {plan.days_of_week.length === 1 ? 'meal' : 'meals'} a week · {rupees(plan.price_per_week)} per week</p>
          <div className="mt-1 flex items-baseline justify-between"><span className="font-semibold">Total for {weeks} {weeks === 1 ? 'week' : 'weeks'}</span><span className="font-serif text-2xl font-bold">{rupees(total)}</span></div>
          <p className="mt-1 text-sm text-ink-muted">Pay in cash as you collect each tiffin. Skip a day any time until {plan.cutoff_hours_before} hours before the meal.</p>
        </section>
      </div>
    </Modal>
  );
}
