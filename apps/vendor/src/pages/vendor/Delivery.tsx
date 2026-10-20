import { ApiError, Bi, Button, Card, Page, Switch, api } from '@gharka/ui';
import { MapView } from '@gharka/ui/maps';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { SiteHeader } from '../../components/SiteHeader';
import type { VendorMe } from '../../lib/types';
import { useVendor } from '../../lib/useVendor';

export default function Delivery() {
  const { me, setMe } = useVendor();
  const [pickup, setPickup] = useState(me.offers_pickup ?? true);
  const [radius, setRadius] = useState(me.delivery_radius_km ?? 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!me.onboarded) return <Navigate to="/onboarding" replace />;
  const center = me.lat != null && me.lng != null ? { lat: me.lat, lng: me.lng } : undefined;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      setMe(await api.put<VendorMe>('/vendor/fulfilment', { offers_pickup: pickup, delivery_radius_km: radius }));
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
        <Switch checked={pickup} onChange={setPickup} label={<Bi k="pickupOk" />} />
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
        {center ? (
          <MapView center={center} markers={[{ id: 'me', ...center }]} circle={radius > 0 ? { center, radiusKm: radius } : undefined}
            fit={radius > 0} zoom={15} height={260} />
        ) : null}
        {msg && <p className={msg.ok ? 'font-semibold text-leaf-700' : 'text-terracotta-600'} role="status">{msg.ok ? <>✓ <Bi k="saved" /></> : msg.text}</p>}
        <Button size="xl" block loading={busy} onClick={() => void save()}><Bi k="save" /></Button>
      </div>
    </Page>
  );
}
