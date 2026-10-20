import { ApiError, Button, Card, EmptyState, Input, PhoneLogin, Spinner, api, brand, cx, Icon, useAuth, type User } from '@gharka/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LocationPicker } from '../components/LazyMaps';
import { FulfilmentOption } from '../components/FulfilmentOption';
import { Shell } from '../components/Shell';
import { cartCount, cartStore, cartTotal, useCart } from '../lib/cart';
import { cutoffText, dateLong, haversineKm, rupees, slotLabel } from '../lib/format';
import { placeStore } from '../lib/place';
import { payForOrder } from '../lib/razorpay';
import type { Fulfilment, OrderData, VendorProfile } from '../lib/types';

type Pos = { lat: number; lng: number };

export default function Checkout() {
  const [cart] = useCart();
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [fulfilment, setFulfilment] = useState<Fulfilment>('pickup');
  const [address, setAddress] = useState('');
  const [pos, setPos] = useState<Pos | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [method, setMethod] = useState<'cod' | 'razorpay'>('cod');

  useEffect(() => {
    if (!cart) return;
    api.get<VendorProfile>(`/vendors/${cart.vendorId}`).then(setVendor).catch((e) => setError(e instanceof ApiError ? e.detail : 'Could not load this cook'));
  }, [cart?.vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill once from the profile (or the area they browsed from).
  useEffect(() => {
    if (!user || seeded) return;
    setSeeded(true);
    setName(user.name ?? '');
    setAddress(user.address_line ?? '');
    const p = placeStore.read();
    if (user.lat != null && user.lng != null) setPos({ lat: user.lat, lng: user.lng });
    else if (p?.precise && p.lat !== undefined && p.lng !== undefined) setPos({ lat: p.lat, lng: p.lng });
  }, [user, seeded]);

  const options = useMemo(() => {
    if (!vendor) return null;
    const dist = pos && vendor.lat !== null && vendor.lng !== null ? haversineKm(pos, { lat: vendor.lat, lng: vendor.lng }) : null;
    let deliveryWhy: string | null = null;
    if (vendor.delivery_radius_km <= 0) deliveryWhy = `${vendor.display_name} doesn't deliver. Pick up from the kitchen instead.`;
    else if (dist !== null && dist > vendor.delivery_radius_km + 0.15)
      deliveryWhy = `You're about ${dist.toFixed(1)} km away. Delivery is within ${vendor.delivery_radius_km} km.`;
    return { dist, deliveryWhy, pickupWhy: vendor.offers_pickup ? null : `${vendor.display_name} doesn't offer pickup.` };
  }, [vendor, pos]);

  // Keep the selection valid if the chosen way becomes unavailable.
  useEffect(() => {
    if (!options) return;
    if (fulfilment === 'delivery' && options.deliveryWhy && !options.pickupWhy) setFulfilment('pickup');
    if (fulfilment === 'pickup' && options.pickupWhy && !options.deliveryWhy) setFulfilment('delivery');
  }, [options, fulfilment]);

  if (!cart || cart.lines.length === 0) {
    return <Shell title="Checkout"><Card><EmptyState title="Nothing to check out" action={<Link to="/"><Button>Find a cook</Button></Link>} /></Card></Shell>;
  }
  if (loading) return <Shell><div className="mt-16 flex justify-center"><Spinner className="h-8 w-8" /></div></Shell>;

  if (!user) {
    return (
      <Shell title="Log in to order">
        <PhoneLogin role="customer" />
      </Shell>
    );
  }
  if (user.role !== 'customer') return <Shell title="Checkout"><Card><EmptyState title="Please use a customer account to order" /></Card></Shell>;

  const deliveryNeeds = fulfilment === 'delivery' ? (!address.trim() ? 'Add your delivery address' : !pos ? 'Pin your location on the map' : null) : null;
  const needsName = !name.trim();
  const blocked = needsName ? 'Add your name so the cook knows who it is for' : deliveryNeeds;

  async function place() {
    if (!cart || blocked) return;
    setBusy(true);
    setError(null);
    try {
      if (name.trim() !== user!.name || (fulfilment === 'delivery' && !user!.address_line)) {
        const patch: Record<string, unknown> = { name: name.trim() };
        if (fulfilment === 'delivery' && !user!.address_line) Object.assign(patch, { address_line: address.trim(), lat: pos?.lat, lng: pos?.lng });
        try { setUser(await api.put<User>('/me', patch)); } catch { /* the order matters more than the profile */ }
      }
      const order = await api.post<OrderData>('/orders', {
        items: cart.lines.map((l) => ({ offering_id: l.offeringId, qty: l.qty })),
        fulfilment, vendor_id: cart.vendorId, date: cart.date, slot: cart.slot,
        ...(fulfilment === 'delivery' ? { delivery_address: address.trim(), lat: pos?.lat, lng: pos?.lng } : {}),
        note: note.trim() || undefined,
        payment_method: method,
      });
      cartStore.write(null);
      if (method === 'razorpay') {
        // The order exists (portions reserved). If they close the payment window they can pay from the order page.
        try {
          const result = await payForOrder(order, user!);
          navigate(`/orders/${order.id}${result === 'paid' ? '?placed=1' : '?pay=1'}`, { replace: true });
        } catch {
          navigate(`/orders/${order.id}?pay=1`, { replace: true });
        }
        return;
      }
      navigate(`/orders/${order.id}?placed=1`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Checkout">
      <Card className="bg-turmeric-50/60">
        <p className="font-serif text-xl font-bold">{cart.vendorName}</p>
        <p className="text-ink-soft">{slotLabel(cart.slot)} · {dateLong(cart.date)}</p>
        {cart.cutoffAt && <p className="font-hand text-2xl leading-6 text-terracotta-600">order by {cutoffText(cart.cutoffAt, cart.date)}</p>}
        <ul className="mt-2 text-sm text-ink-soft">{cart.lines.map((l) => <li key={l.offeringId}>{l.qty} × {l.name}</li>)}</ul>
      </Card>

      {!vendor || !options ? (
        error ? <p className="mt-4 text-terracotta-600" role="alert">{error}</p> : <div className="mt-8 flex justify-center"><Spinner className="h-6 w-6" /></div>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="font-serif text-xl font-bold">How will you get it?</h2>
            <div className="mt-2 grid gap-2.5">
              <FulfilmentOption selected={fulfilment === 'pickup'} disabled={!!options.pickupWhy} why={options.pickupWhy} onSelect={() => setFulfilment('pickup')}
                title="Pick up" sub={vendor.locality_name ? `from ${vendor.display_name}'s kitchen, ${vendor.locality_name}` : `from ${vendor.display_name}'s kitchen`} icon={<Icon.Walk className="h-8 w-8" />} />
              <FulfilmentOption selected={fulfilment === 'delivery'} disabled={!!options.deliveryWhy} why={options.deliveryWhy} onSelect={() => setFulfilment('delivery')}
                title="Deliver to me" sub={`within ${vendor.delivery_radius_km} km`} icon={<Icon.Bike className="h-8 w-8" />} />
            </div>
            {fulfilment === 'pickup' && <p className="mt-2 text-sm text-ink-muted">The exact address is shared once the cook accepts your order.</p>}
          </section>

          {fulfilment === 'delivery' && (
            <section className="mt-5 space-y-3">
              <div>
                <label htmlFor="addr" className="mb-1.5 block text-sm font-semibold text-ink-soft">Delivery address</label>
                <textarea id="addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={400}
                  placeholder="Flat / house no., building, landmark"
                  className="w-full rounded-xl border-2 border-cream-300 bg-white px-4 py-3 text-base focus:border-turmeric-500" />
              </div>
              <p className="text-sm font-semibold text-ink-soft">Pin the exact spot</p>
              <LocationPicker value={pos} onChange={setPos} height={260}
                fallbackCenter={vendor.lat !== null && vendor.lng !== null ? { lat: vendor.lat, lng: vendor.lng } : undefined} />
              {pos && options.dist !== null && !options.deliveryWhy && <p className="text-sm font-medium text-leaf-700">✓ About {options.dist.toFixed(1)} km from {vendor.display_name}. Delivery is available here.</p>}
              {options.deliveryWhy && <p className="text-sm font-medium text-terracotta-600" role="alert">{options.deliveryWhy}</p>}
            </section>
          )}

          <section className="mt-6 space-y-3">
            {!user.name && <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="So the cook knows who it's for" />}
            <Input label="Anything the cook should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Less spicy, no onion…" />
          </section>

          <section className="mt-6">
            <h2 className="font-serif text-xl font-bold">Payment</h2>
            <PaymentOptions method={method} onChange={setMethod} />
          </section>

          <div className="mt-6 rounded-2xl bg-white/70 px-4 py-3">
            <div className="flex items-center justify-between text-lg"><span className="font-semibold">Total ({cartCount(cart)} items)</span><span className="font-serif text-2xl font-bold">{rupees(cartTotal(cart))}</span></div>
            <p className="text-sm text-ink-muted">{method === 'cod' ? <>Pay {rupees(cartTotal(cart))} in cash when you {fulfilment === 'pickup' ? 'pick up' : 'receive'} your food.</> : <>You&apos;ll pay online next. Unpaid orders are released after a few minutes.</>}</p>
          </div>
          {blocked && <p className="mt-3 text-sm font-medium text-terracotta-600">{blocked}</p>}
          {error && <p className="mt-3 rounded-xl bg-terracotta-50 p-3 font-medium text-terracotta-700" role="alert">{error}</p>}
          <Button size="xl" block className="mt-4" loading={busy} disabled={!!blocked} onClick={() => void place()}>Place order · {rupees(cartTotal(cart))}</Button>
          <Link to="/cart" className="mt-2 block"><Button variant="ghost" block>Back to basket</Button></Link>
        </>
      )}
    </Shell>
  );
}

/** Payment methods: cash on delivery always; "Pay online" (Razorpay) only when VITE_RAZORPAY_ENABLED=true. */
function PaymentOptions({ method, onChange }: { method: 'cod' | 'razorpay'; onChange: (m: 'cod' | 'razorpay') => void }) {
  const opt = (id: 'cod' | 'razorpay', title: string, sub: string, icon: ReactNode) => (
    <button type="button" role="radio" aria-checked={method === id} onClick={() => onChange(id)}
      className={cx('flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left', method === id ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-white/60')}>
      <span className="text-leaf-700" aria-hidden>{icon}</span>
      <span className="flex-1"><span className="block font-semibold">{title}</span><span className="block text-sm text-ink-muted">{sub}</span></span>
      {method === id && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf-500 text-white" aria-hidden><Icon.Check /></span>}
    </button>
  );
  return (
    <div className="mt-2 grid gap-2.5" role="radiogroup" aria-label="Payment method">
      {opt('cod', 'Cash on delivery', 'Pay the cook directly', <Icon.Cash />)}
      {brand.razorpayEnabled && opt('razorpay', 'Pay online', 'UPI, cards, netbanking. Order is held for a few minutes.', <Icon.Card />)}
    </div>
  );
}
