import { api, ApiError, Badge, brand, Button, Card, cx, EmptyState, Icon, mediaUrl, Modal, qs, Spinner, useAuth } from '@gharka/ui';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CookAvatar } from '../components/CookAvatar';
import { DateChips, SlotToggle, next7 } from '../components/Chips';
import { DietMark } from '../components/DietMark';
import { MapView } from '../components/LazyMaps';
import { Shell } from '../components/Shell';
import { SubscribeSheet } from '../components/SubscribeSheet';
import { Stars } from '../components/Stars';
import { Stepper } from '../components/Stepper';
import { MAX_QTY, cartCount, cartTotal, sameMeal, useCart, withQty } from '../lib/cart';
import { cutoffText, dateLong, dateTimeShort, daysText, isoDate, rupees, slotLabel, waLink } from '../lib/format';
import { placeStore } from '../lib/place';
import type { Dish, MenuGroup, Plan, Slot, VendorProfile } from '../lib/types';

export default function Vendor() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const [v, setV] = useState<VendorProfile | null>(null);
  const [error, setError] = useState<{ status: number; text: string } | null>(null);
  const [subscribing, setSubscribing] = useState<Plan | null>(null);

  const date = params.get('date') && next7().includes(params.get('date')!) ? params.get('date')! : isoDate(0);
  const slot: Slot = params.get('slot') === 'dinner' ? 'dinner' : 'lunch';
  const set = (k: string, val: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(k, val); return n; }, { replace: true });

  const point = (() => {
    const p = placeStore.read();
    if (p?.precise && p.lat !== undefined) return { lat: p.lat, lng: p.lng };
    return user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : {};
  })();

  useEffect(() => {
    let live = true;
    setV(null);
    setError(null);
    api.get<VendorProfile>(`/vendors/${id}${qs({ ...point })}`)
      .then((r) => live && setV(r))
      .catch((e) => live && setError(e instanceof ApiError ? { status: e.status, text: e.detail } : { status: 0, text: 'Could not load' }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <Shell>
        <Card><EmptyState title={error.status === 404 ? 'This kitchen is not open right now' : "Couldn't load this cook"} hint={error.text}
          action={<Link to="/"><Button>See other cooks</Button></Link>} /></Card>
      </Shell>
    );
  }
  if (!v) return <Shell><div className="mt-16 flex justify-center"><Spinner className="h-8 w-8" /></div></Shell>;

  const group = v.menu.find((g) => g.date === date && g.slot === slot) ?? null;
  const marked = new Set(v.menu.filter((g) => g.slot === slot).map((g) => g.date));
  return (
    <Shell>
      <Hero v={v} />
      <section className="mt-5">
        <h2 className="font-serif text-2xl font-bold">What&apos;s cooking</h2>
        <div className="mt-3"><DateChips value={date} onChange={(d) => set('date', d)} marked={marked} /></div>
        <div className="mt-3"><SlotToggle value={slot} onChange={(s) => set('slot', s)} /></div>
        <MenuSection v={v} group={group} date={date} slot={slot} />
      </section>

      {v.plans.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-2xl font-bold">Weekly tiffin plans</h2>
          <p className="font-hand text-xl text-terracotta-600">same food, every day, no daily ordering</p>
          <div className="mt-3 space-y-3">
            {v.plans.map((p) => (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-lg font-bold"><DietMark diet={p.diet} className="mr-1.5 align-[-2px]" />{p.name}</h3>
                    <p className="text-sm text-ink-soft">{slotLabel(p.slot)} · {daysText(p.days_of_week)}</p>
                    {p.description && <p className="mt-1 text-sm text-ink-soft">{p.description}</p>}
                  </div>
                  <p className="shrink-0 text-right font-semibold">{rupees(p.price_per_week)}<span className="block text-xs font-normal text-ink-muted">per week</span></p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-ink-muted">Skip any day up to {p.cutoff_hours_before}h before. Pay in cash.</p>
                  <Button size="sm" className="shrink-0" onClick={() => setSubscribing(p)}>Subscribe</Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {v.lat !== null && v.lng !== null && (
        <section className="mt-8">
          <h2 className="font-serif text-2xl font-bold">Where she cooks</h2>
          <p className="mb-2 text-sm text-ink-muted">
            {v.locality_name ?? 'Nearby'}{v.distance_km !== null ? ` · ${v.distance_km} km from you` : ''}. The pin is approximate; you get the exact address after your order is accepted.
          </p>
          <MapView center={{ lat: v.lat, lng: v.lng }} zoom={15} markers={[{ id: 'k', lat: v.lat, lng: v.lng }]}
            circle={v.delivery_radius_km > 0 ? { center: { lat: v.lat, lng: v.lng }, radiusKm: v.delivery_radius_km } : undefined}
            fit={v.delivery_radius_km > 0} height={200} static />
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-serif text-2xl font-bold">What neighbours say</h2>
        {v.reviews.length === 0 ? (
          <p className="mt-2 text-ink-soft">No reviews yet. Be the first to taste and tell.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {v.reviews.slice(0, 6).map((r) => (
              <li key={r.id} className="rounded-2xl border border-cream-200 bg-white/80 p-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{r.customer_name}</span>
                  <span className="text-turmeric-600" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}<span className="text-cream-300">{'★'.repeat(5 - r.rating)}</span></span>
                </div>
                {r.text && <p className="mt-1 font-serif italic text-ink-soft">“{r.text}”</p>}
                <p className="mt-1 text-xs text-ink-muted">{dateTimeShort(r.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <SubscribeSheet plan={subscribing} vendor={v} onClose={() => setSubscribing(null)} />
      <BasketBar />
    </Shell>
  );
}

function Hero({ v }: { v: VendorProfile }) {
  const photos = v.kitchen_photos;
  const wa = v.whatsapp_digits ? waLink(v.whatsapp_digits, `Hi ${v.display_name}, I found you on ${brand.name}. I have a question about your food.`) : null;
  return (
    <header>
      {photos.length > 0 ? (
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Kitchen photos">
          {photos.map((p, i) => (
            <img key={p} src={mediaUrl(p)} alt={`${v.display_name}'s kitchen, photo ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'}
              className={cx('h-44 shrink-0 snap-center rounded-3xl object-cover shadow-soft', photos.length === 1 ? 'w-full' : 'w-[85%]')} />
          ))}
        </div>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-3xl bg-gradient-to-br from-turmeric-100 via-cream-100 to-terracotta-100" aria-hidden>
          <span className="font-hand text-3xl text-terracotta-600">a home kitchen</span>
        </div>
      )}
      <div className="-mt-9 flex items-end gap-3 px-2">
        <CookAvatar name={v.display_name} photo={v.cook_photo} size={84} />
      </div>
      <h1 className="mt-3 font-serif text-3xl font-bold leading-tight">{v.display_name}</h1>
      {v.story && <p className="mt-1 font-serif text-lg italic leading-snug text-ink-soft">“{v.story}”</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Stars avg={v.stats.rating_avg} count={v.stats.rating_count} />
        {v.stats.orders_served > 0 && <span className="text-sm font-semibold text-ink-soft">{v.stats.orders_served} meals served</span>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {v.fssai_registered && <Badge tone="leaf"><Icon.Check className="h-3.5 w-3.5" /> FSSAI registered</Badge>}
        {v.offers_pickup && <Badge>Pickup</Badge>}
        {v.delivery_radius_km > 0 && <Badge tone={v.delivers_to_you ? 'turmeric' : 'neutral'}>🛵 {v.delivers_to_you ? 'Delivers to you' : `Delivers within ${v.delivery_radius_km} km`}</Badge>}
      </div>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-leaf-500 bg-white/70 px-5 font-semibold text-leaf-700 active:bg-leaf-50">
          <Icon.Chat className="h-5 w-5" /> Message on WhatsApp
        </a>
      )}
    </header>
  );
}

function MenuSection({ v, group, date, slot }: { v: VendorProfile; group: MenuGroup | null; date: string; slot: Slot }) {
  const [cart, setCart] = useCart();
  const [pending, setPending] = useState<{ dish: Dish; qty: number } | null>(null);

  const meal = useMemo(
    () => ({ vendorId: v.id, vendorName: v.display_name, date, slot, cutoffAt: group?.cutoff_at ?? '' }),
    [v.id, v.display_name, date, slot, group?.cutoff_at],
  );
  const here = sameMeal(cart, v.id, date, slot) ? cart : null;
  const qtyOf = (d: Dish) => here?.lines.find((l) => l.offeringId === d.id)?.qty ?? 0;

  function change(d: Dish, qty: number) {
    const line = { offeringId: d.id, name: d.dish_name, price: d.price, diet: d.diet, max: d.portions_left };
    if (cart && !sameMeal(cart, v.id, date, slot) && qty > 0) { setPending({ dish: d, qty }); return; }
    setCart(withQty(cart, meal, line, qty));
  }
  function confirmSwitch() {
    if (!pending) return;
    const d = pending.dish;
    setCart(withQty(null, meal, { offeringId: d.id, name: d.dish_name, price: d.price, diet: d.diet, max: d.portions_left }, pending.qty));
    setPending(null);
  }

  if (!group) {
    return (
      <Card className="mt-4">
        <EmptyState title={`No ${slotLabel(slot).toLowerCase()} menu for ${dateLong(date)}`} hint="Try another day (days with a green dot have a menu), or message the cook to ask what she can make." />
      </Card>
    );
  }
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-lg font-bold">{slotLabel(slot)}, {dateLong(date)}</h3>
        {group.is_open ? <p className="font-hand text-2xl leading-6 text-terracotta-600">order by {cutoffText(group.cutoff_at, date)}</p>
          : <Badge tone="neutral">Orders closed</Badge>}
      </div>
      <ul className="mt-3 space-y-3">
        {group.dishes.map((d) => {
          const q = qtyOf(d);
          return (
            <li key={d.id} className={cx('flex gap-3 rounded-2xl border border-cream-200 bg-white/85 p-3 shadow-soft', !d.is_open && 'opacity-75')}>
              {d.photo ? (
                <img src={mediaUrl(d.photo)} alt={d.dish_name} loading="lazy" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-turmeric-50 text-3xl" aria-hidden>🍛</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5">
                  <DietMark diet={d.diet} className="mt-1" />
                  <h4 className="font-serif text-lg font-bold leading-snug">{d.dish_name}</h4>
                </div>
                {d.description && <p className="line-clamp-2 text-sm text-ink-soft">{d.description}</p>}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold tabular-nums">{rupees(d.price)}</p>
                    <p className={cx('text-xs font-semibold', d.is_open ? (d.portions_left <= 3 ? 'text-terracotta-600' : 'text-leaf-600') : 'text-ink-muted')}>
                      {d.is_open ? `${d.portions_left} left` : d.portions_left === 0 ? 'Sold out' : 'Closed'}
                    </p>
                  </div>
                  {d.is_open ? (
                    q === 0 ? <Button size="sm" onClick={() => change(d, 1)}>Add</Button>
                      : <Stepper value={q} onChange={(n) => change(d, n)} max={Math.min(MAX_QTY, d.portions_left)} label={d.dish_name} />
                  ) : <span className="rounded-full bg-cream-100 px-3 py-1.5 text-sm font-semibold text-ink-muted">{d.portions_left === 0 ? 'Sold out' : 'Closed'}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Modal open={!!pending} onClose={() => setPending(null)} title="Start a new basket?">
        <p className="text-ink-soft">
          Your basket has food from <strong>{cart?.vendorName}</strong> ({cart && dateLong(cart.date)}, {cart && slotLabel(cart.slot).toLowerCase()}).
          One order can only be from one cook for one meal.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" size="lg" block onClick={confirmSwitch}>Clear it and start new</Button>
          <Button variant="outline" block onClick={() => setPending(null)}>Keep my basket</Button>
        </div>
      </Modal>
    </div>
  );
}

/** Sticky "view basket" bar. Sits above the phone tab bar. */
function BasketBar() {
  const [cart] = useCart();
  const navigate = useNavigate();
  if (!cart) return null;
  return (
    <div className="fixed inset-x-0 bottom-[3.75rem] z-20 px-4 sm:bottom-4">
      <button type="button" onClick={() => navigate('/cart')}
        className="mx-auto flex min-h-14 w-full max-w-md items-center justify-between rounded-2xl bg-ink px-5 text-cream shadow-lift active:scale-[.99]">
        <span className="font-semibold"><Icon.Basket className="mr-1 inline h-5 w-5 align-text-bottom" /> {cartCount(cart)} {cartCount(cart) === 1 ? 'item' : 'items'} · {cart.vendorName}</span>
        <span className="font-bold">{rupees(cartTotal(cart))} <Icon.Arrow className="inline h-4 w-4" /></span>
      </button>
    </div>
  );
}
