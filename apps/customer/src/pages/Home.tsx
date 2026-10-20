import { ApiError, Button, Card, EmptyState, Modal, Spinner, TiffinIllustration, api, brand, qs } from '@gharka/ui';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DateChips, DietChips, Segmented, SlotToggle, next7, type DietFilter } from '../components/Chips';
import { MapView } from '../components/LazyMaps';
import { PlacePicker } from '../components/PlacePicker';
import { Shell } from '../components/Shell';
import { VendorCard } from '../components/VendorCard';
import { dateLong, isoDate, slotLabel } from '../lib/format';
import { placeParams, usePlace, type Place } from '../lib/place';
import type { Slot, VendorCardData } from '../lib/types';

/** Dinner after 5pm local, lunch otherwise: a sensible default meal for "now". */
function defaultSlot(): Slot {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: brand.timezone, hour: '2-digit', hour12: false }).format(new Date()));
  return h >= 15 ? 'dinner' : 'lunch';
}

export default function Home() {
  const [place, setPlace] = usePlace();
  const [params, setParams] = useSearchParams();
  const [changing, setChanging] = useState(false);

  const date = params.get('date') && next7().includes(params.get('date')!) ? params.get('date')! : isoDate(0);
  const slot = (params.get('slot') as Slot | null) ?? defaultSlot();
  const diet = (params.get('diet') as DietFilter | null) ?? 'all';
  const view = params.get('view') === 'map' ? 'map' : 'list';
  const set = (k: string, v: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (v === null) n.delete(k); else n.set(k, v); return n; }, { replace: true });

  if (!place) return <FirstVisit onPick={setPlace} />;

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setChanging(true)} className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-full bg-white/80 px-3.5 text-left ring-1 ring-cream-300">
          <span aria-hidden>📍</span>
          <span className="truncate font-semibold">{place.name}</span>
          <span className="text-ink-muted" aria-hidden>▾</span>
        </button>
        <Segmented<'list' | 'map'> label="View" value={view} onChange={(v) => set('view', v === 'map' ? 'map' : null)}
          options={[{ value: 'list', label: '☰ List' }, { value: 'map', label: '🗺 Map' }]} />
      </div>

      <p className="mt-5 font-hand text-2xl text-terracotta-600">who&apos;s cooking near you?</p>
      <div className="mt-1.5"><DateChips value={date} onChange={(d) => set('date', d === isoDate(0) ? null : d)} /></div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SlotToggle value={slot} onChange={(s) => set('slot', s)} />
      </div>
      <div className="mt-3"><DietChips value={diet} onChange={(d) => set('diet', d === 'all' ? null : d)} /></div>

      <Vendors place={place} date={date} slot={slot} diet={diet} view={view} />

      <Modal open={changing} onClose={() => setChanging(false)} title="Where are you?">
        <PlacePicker onPick={(p) => { setPlace(p); setChanging(false); }} />
      </Modal>
    </Shell>
  );
}

function Vendors({ place, date, slot, diet, view }: { place: Place; date: string; slot: Slot; diet: DietFilter; view: 'list' | 'map' }) {
  const [list, setList] = useState<VendorCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const key = JSON.stringify([placeParams(place), date, slot, diet]);

  useEffect(() => {
    let live = true;
    setList(null);
    setError(null);
    api.get<VendorCardData[]>(`/vendors${qs({ ...placeParams(place), date, slot, diet: diet === 'all' ? undefined : diet })}`)
      .then((r) => live && setList(r))
      .catch((e) => live && setError(e instanceof ApiError ? e.detail : 'Could not load cooks'));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const markers = useMemo(
    () => (list ?? []).filter((v) => v.lat !== null && v.lng !== null).map((v) => ({
      id: v.id, lat: v.lat!, lng: v.lng!, label: `${v.display_name}${v.distance_km !== null ? ` · ${v.distance_km} km` : ''}`,
      onClick: () => navigate(`/cook/${v.id}?date=${date}&slot=${slot}`),
    })),
    [list, navigate, date, slot],
  );

  if (error) {
    return <Card className="mt-6"><EmptyState title="Couldn't load cooks" hint={error} action={<Button onClick={() => window.location.reload()}>Try again</Button>} /></Card>;
  }
  if (list === null) return <div className="mt-12 flex justify-center"><Spinner className="h-8 w-8" /></div>;

  if (list.length === 0) {
    return (
      <Card className="mt-6">
        <EmptyState
          title="No cooks here yet"
          hint={`We couldn't find a cook ${diet !== 'all' ? 'with that food ' : ''}near ${place.name}. New kitchens open every week, so check back soon or try another day.`}
        />
      </Card>
    );
  }

  const center = place.lat !== undefined && place.lng !== undefined ? { lat: place.lat, lng: place.lng } : undefined;
  return (
    <section className="mt-5" aria-label="Cooks near you">
      <h2 className="mb-3 font-serif text-xl font-bold">
        {list.length} {list.length === 1 ? 'cook' : 'cooks'} for {slotLabel(slot).toLowerCase()}, {dateLong(date)}
      </h2>
      {view === 'map' ? (
        <>
          <MapView markers={center ? [...markers, { id: 'you', ...center, label: 'You are here' }] : markers} fit height={360} />
          <p className="mt-2 text-sm text-ink-muted">Pins are approximate, to protect the cooks&apos; privacy. Tap a pin, then its name to open the kitchen.</p>
          <div className="mt-4 space-y-3">{list.map((v) => <VendorCard key={v.id} v={v} date={date} slot={slot} />)}</div>
        </>
      ) : (
        <div className="space-y-4">{list.map((v) => <VendorCard key={v.id} v={v} date={date} slot={slot} />)}</div>
      )}
    </section>
  );
}

function FirstVisit({ onPick }: { onPick: (p: Place) => void }) {
  return (
    <Shell>
      <section className="rounded-3xl border border-cream-200 bg-gradient-to-br from-turmeric-50 via-cream to-terracotta-50 p-5 shadow-soft">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-hand text-2xl leading-6 text-terracotta-600">your neighbour&apos;s kitchen</p>
            <h1 className="mt-1 text-3xl font-bold leading-tight">Home-cooked meals, a few lanes away.</h1>
          </div>
          <TiffinIllustration className="h-28 w-24 shrink-0" />
        </div>
        <p className="mt-3 text-ink-soft">Tell us where you are and we&apos;ll show the home cooks who cook for your neighbourhood.</p>
      </section>
      <div className="mt-6"><PlacePicker onPick={onPick} /></div>
    </Shell>
  );
}
