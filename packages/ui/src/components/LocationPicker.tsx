import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { api, ApiError, qs } from '../api';
import { brand } from '../brand';
import { Bi } from './Bi';
import { Button } from './Button';
import { Icon } from './Icon';
import { Input } from './Input';
import { L } from './leafletSetup';
import type { LatLng } from './MapView';

type SearchHit = { display_name: string; lat: number; lng: number };

type Props = {
  value: LatLng | null;
  onChange: (pos: LatLng) => void;
  /** Where to centre the map before a pin exists (e.g. the locality centroid). */
  fallbackCenter?: LatLng;
  height?: number | string;
  bilingual?: boolean;
};

function Follow({ pos }: { pos: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pos?.lat, pos?.lng]);
  return null;
}

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** "Use my location" + place search (backend /geo/search) + draggable pin. */
export function LocationPicker({ value, onChange, fallbackCenter, height = 320, bilingual }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const mode = bilingual ? 'both' : 'en';
  const start = value ?? fallbackCenter ?? brand.map.center;

  const markerHandlers = useMemo(() => ({
    dragend(e: L.LeafletEvent) {
      const ll = (e.target as L.Marker).getLatLng();
      onChange({ lat: ll.lat, lng: ll.lng });
    },
  }), [onChange]);

  function locate() {
    if (!navigator.geolocation) { setMsg('Location is not available on this device.'); return; }
    setBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); onChange({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { setBusy(false); setMsg('Could not get your location. Search below or tap the map.'); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.get<SearchHit[]>(`/geo/search${qs({ q: query.trim() })}`);
      setHits(res);
      if (!res.length) setMsg('No places found. Try a different name.');
    } catch (err) {
      setMsg(err instanceof ApiError ? err.detail : 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="secondary" size="xl" block onClick={locate} loading={busy}>
        <Icon.Pin className="h-5 w-5" /> <Bi k="useMyLocation" only={mode} />
      </Button>

      <form onSubmit={search} className="flex gap-2">
        <Input
          className="flex-1" aria-label="Search a place" placeholder="Search a place or landmark" value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy || query.trim().length < 3}>
          <Bi k="searchPlace" only={mode} />
        </Button>
      </form>
      {msg && <p className="text-sm text-terracotta-600" role="status">{msg}</p>}
      {hits.length > 0 && (
        <ul className="divide-y divide-cream-200 overflow-hidden rounded-xl border border-cream-200 bg-white">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lng}`}>
              <button
                type="button" className="min-h-12 w-full px-4 py-2 text-left text-sm hover:bg-cream-100"
                onClick={() => { onChange({ lat: h.lat, lng: h.lng }); setHits([]); }}
              >
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-2xl border border-cream-200 shadow-soft" style={{ height }}>
        <MapContainer center={[start.lat, start.lng]} zoom={value ? 16 : 13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={brand.map.tileUrl} attribution={brand.map.attribution} />
          <Follow pos={value} />
          <ClickToPlace onPick={onChange} />
          {value && <Marker position={[value.lat, value.lng]} draggable eventHandlers={markerHandlers} />}
        </MapContainer>
      </div>
      <p className="text-sm text-ink-muted"><Bi k="dragPin" only={mode} /></p>
    </div>
  );
}
