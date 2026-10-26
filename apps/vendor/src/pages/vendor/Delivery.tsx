import { ApiError, Bi, Button, Card, cx, type DictKey, Icon, Page, Switch, api } from '@gharka/ui';
import { MapView } from '@gharka/ui/maps';
import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { SiteHeader } from '../../components/SiteHeader';
import type { DeliveryBy, VendorMe } from '../../lib/types';
import { useVendor } from '../../lib/useVendor';

export default function Delivery() {
  const { me, setMe } = useVendor();
  const [pickup, setPickup] = useState(me.offers_pickup ?? true);
  const [radius, setRadius] = useState(me.delivery_radius_km ?? 0);
  const [by, setBy] = useState<DeliveryBy>(me.delivery_by ?? 'self');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!me.onboarded) return <Navigate to="/onboarding" replace />;
  const center = me.lat != null && me.lng != null ? { lat: me.lat, lng: me.lng } : undefined;
  const delivers = radius > 0;
  const noWay = !pickup && !delivers;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      setMe(await api.put<VendorMe>('/vendor/fulfilment', { offers_pickup: pickup, delivery_radius_km: radius, delivery_by: by }));
      setMsg({ ok: true, text: 'saved' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.detail : 'Error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page header={<SiteHeader />} narrow title={<Bi k="deliverySettings" />}>
      <div className="space-y-5">
        <Switch checked={pickup} onChange={setPickup} label={<Bi k="pickupOk" />} hint={<Bi k="pickupOkHint" />} />
        <Card>
          <label htmlFor="radius" className="block text-lg font-semibold"><Bi k="deliveryDistance" /></label>
          <p className="my-2 font-serif text-4xl font-bold text-leaf-700">
            {radius === 0 ? <Bi k="noDelivery" /> : <>{radius} <span className="text-2xl"><Bi k="km" only="en" /></span></>}
          </p>
          <input
            id="radius" type="range" min={0} max={10} step={0.5} value={radius} onChange={(e) => setRadius(Number(e.target.value))}
            className="h-12 w-full cursor-pointer accent-leaf-500"
          />
          <div className="flex justify-between text-sm text-ink-muted"><span>0</span><span>5</span><span>10 km</span></div>
        </Card>
        {delivers && (
          <fieldset>
            <legend className="mb-2 text-lg font-semibold"><Bi k="whoDelivers" /></legend>
            <div className="grid gap-2.5" role="radiogroup">
              <ByOption selected={by === 'self'} onSelect={() => setBy('self')} title="deliverSelf" hint="deliverSelfHint" icon={<Icon.Bike className="h-8 w-8" />} />
              <ByOption selected={by === 'partner'} onSelect={() => setBy('partner')} title="deliverPartner" hint="deliverPartnerHint" icon={<Icon.Tiffin className="h-8 w-8" />} />
            </div>
          </fieldset>
        )}
        {center ? (
          <MapView center={center} markers={[{ id: 'me', ...center }]} circle={delivers ? { center, radiusKm: radius } : undefined}
            fit={delivers} zoom={15} height={260} />
        ) : null}
        {noWay ? (
          <p className="rounded-2xl bg-terracotta-50 p-3 font-medium text-terracotta-700" role="alert"><Bi k="needOneWay" /></p>
        ) : (
          <Card className="bg-cream-100/70">
            <p className="font-semibold"><Bi k="customersCanChoose" />:</p>
            <ul className="mt-1.5 space-y-1">
              {pickup && <li className="flex items-center gap-2"><Icon.Walk className="h-5 w-5 text-leaf-700" /><Bi k="custCollect" /></li>}
              {delivers && <li className="flex items-center gap-2"><Icon.Bike className="h-5 w-5 shrink-0 text-leaf-700" /><span><Bi k={by === 'partner' ? 'custDeliverPartner' : 'custDeliverSelf'} /> <span className="whitespace-nowrap">· {radius} km</span></span></li>}
            </ul>
          </Card>
        )}
        {msg && <p className={msg.ok ? 'font-semibold text-leaf-700' : 'text-terracotta-600'} role="status">{msg.ok ? <>✓ <Bi k="saved" /></> : msg.text}</p>}
        <Button size="xl" block loading={busy} disabled={noWay} onClick={() => void save()}><Bi k="save" /></Button>
      </div>
    </Page>
  );
}

function ByOption({ selected, onSelect, title, hint, icon }: { selected: boolean; onSelect: () => void; title: DictKey; hint: DictKey; icon: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className={cx('flex min-h-16 items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition', selected ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-white')}>
      <span className="text-leaf-700" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold"><Bi k={title} /></span>
        <span className="block text-sm text-ink-muted"><Bi k={hint} /></span>
      </span>
      <span className={cx('flex h-6 w-6 items-center justify-center rounded-full border-2', selected ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300')} aria-hidden>{selected && <Icon.Check className="h-4 w-4" />}</span>
    </button>
  );
}
