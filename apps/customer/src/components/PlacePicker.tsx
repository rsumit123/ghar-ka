import { ApiError, Button, Input, Spinner, api, qs } from '@gharka/ui';
import { useEffect, useState, type FormEvent } from 'react';
import type { Place } from '../lib/place';
import type { Locality } from '../lib/types';

type Hit = { display_name: string; lat: number; lng: number };
const shortName = (s: string) => s.split(',').slice(0, 2).join(',').trim();

/** Pick where you are: a launch locality, your GPS position, or a searched place. */
export function PlacePicker({ onPick }: { onPick: (p: Place) => void }) {
  const [localities, setLocalities] = useState<Locality[] | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.get<Locality[]>('/localities').then(setLocalities).catch(() => setLocalities([]));
  }, []);

  function locate() {
    if (!navigator.geolocation) { setMsg('Location is not available on this device. Pick your area below.'); return; }
    setBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let name = 'Near you';
        try { name = shortName((await api.get<Hit>(`/geo/reverse${qs({ lat, lng })}`)).display_name); } catch { /* keep the generic name */ }
        setBusy(false);
        onPick({ name, lat, lng, precise: true });
      },
      () => { setBusy(false); setMsg('Could not get your location. Pick your area below.'); },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.get<Hit[]>(`/geo/search${qs({ q: query.trim() })}`);
      setHits(res);
      if (!res.length) setMsg('No places found. Try another name or landmark.');
    } catch (err) {
      setMsg(err instanceof ApiError ? err.detail : 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Button variant="secondary" size="xl" block onClick={locate} loading={busy && !hits.length}>
        <span aria-hidden>📍</span> Use my location
      </Button>
      {msg && <p className="text-sm font-medium text-terracotta-600" role="status">{msg}</p>}

      <div>
        <h3 className="mb-2 font-serif text-lg font-bold">Or pick your area</h3>
        {localities === null ? <Spinner className="h-6 w-6" /> : localities.length === 0 ? (
          <p className="text-sm text-ink-muted">No areas are open yet. Search for your street below.</p>
        ) : (
          <ul className="grid gap-2">
            {localities.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between rounded-2xl border-2 border-cream-300 bg-white/80 px-4 text-left transition hover:border-turmeric-400 active:scale-[.99]"
                  onClick={() => onPick({ name: l.name, lat: l.lat, lng: l.lng, pincode: l.pincode, localityId: l.id, precise: false })}
                >
                  <span className="font-semibold">{l.name}</span>
                  <span className="text-sm text-ink-muted">{l.city} · {l.pincode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={search} className="space-y-2">
        <h3 className="font-serif text-lg font-bold">Or search a street / landmark</h3>
        <div className="flex gap-2">
          <Input className="flex-1" aria-label="Search a place" placeholder="e.g. 12th Main, Indiranagar" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" variant="outline" disabled={busy || query.trim().length < 3}>Search</Button>
        </div>
      </form>
      {hits.length > 0 && (
        <ul className="divide-y divide-cream-200 overflow-hidden rounded-xl border border-cream-200 bg-white">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lng}`}>
              <button type="button" className="min-h-12 w-full px-4 py-2 text-left text-sm hover:bg-cream-100"
                onClick={() => onPick({ name: shortName(h.display_name), lat: h.lat, lng: h.lng, precise: true })}>
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
