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
  /** When a pin already exists, show a one-line "Location pinned / Change" row until the user taps Change. */
  collapsed?: boolean;
};

function Follow({ pos }: { pos: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pos?.lat, pos?.lng]);
  return null;
}

/** Pan/zoom only once the map is activated, so a swipe over it scrolls the page instead. */
function Gesture({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    const h = [map.dragging, map.touchZoom, map.scrollWheelZoom, map.doubleClickZoom];
    h.forEach((x) => (active ? x.enable() : x.disable()));
  }, [map, active]);
  return null;
}

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** "Use my location" + place search (backend /geo/search) + draggable pin. */
export function LocationPicker({ value, onChange, fallbackCenter, height = 320, collapsed }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(false);
  const start = value ?? fallbackCenter ?? brand.map.center;

  const pick = (pos: LatLng) => { setExpanded(true); onChange(pos); };

  const markerHandlers = useMemo(() => ({
    dragend(e: L.LeafletEvent) {
      const ll = (e.target as L.Marker).getLatLng();
      onChange({ lat: ll.lat, lng: ll.lng });
    },
  }), [onChange]);

  if (collapsed && value && !expanded) {
    return (
      <div className="flex min-h-14 items-center gap-3 rounded-2xl border-2 border-leaf-500 bg-leaf-50 px-4">
        <Icon.Pin className="h-5 w-5 shrink-0 text-leaf-700" />
        <span className="flex-1 font-semibold text-leaf-700"><Bi k="locationPinned" /> ✓</span>
        <Button variant="outline" onClick={() => setExpanded(true)}><Bi k="changeLocation" /></Button>
      </div>
    );
  }

  function locate() {
    if (!navigator.geolocation) { setMsg('Location is not available on this device.'); return; }
    setBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); pick({ lat: p.coords.latitude, lng: p.coords.longitude }); },
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
        <Icon.Pin className="h-5 w-5" /> <Bi k="useMyLocation" />
      </Button>

      <form onSubmit={search} className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input aria-label="Search a place" placeholder="Search a place or landmark" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" className="shrink-0" disabled={busy || query.trim().length < 3}>
          <Bi k="findPlace" />
        </Button>
      </form>
      {msg && <p className="text-sm text-terracotta-600" role="status">{msg}</p>}
      {hits.length > 0 && (
        <ul className="divide-y divide-cream-200 overflow-hidden rounded-xl border border-cream-200 bg-white">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lng}`}>
              <button
                type="button" className="min-h-12 w-full px-4 py-2 text-left text-sm hover:bg-cream-100"
                onClick={() => { pick({ lat: h.lat, lng: h.lng }); setHits([]); }}
              >
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative isolate overflow-hidden rounded-2xl border border-cream-200 shadow-soft" style={{ height }}>
        <MapContainer center={[start.lat, start.lng]} zoom={value ? 16 : 13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={brand.map.tileUrl} attribution={brand.map.attribution} />
          <Follow pos={value} />
          <Gesture active={active} />
          <ClickToPlace onPick={pick} />
          {value && <Marker position={[value.lat, value.lng]} draggable eventHandlers={markerHandlers} />}
        </MapContainer>
        {!active && (
          <button type="button" onClick={() => setActive(true)} className="absolute inset-0 z-[1000] flex items-end justify-center bg-transparent pb-3">
            <span className="rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white"><Bi k="tapToMovePin" /></span>
          </button>
        )}
      </div>
      <p className="text-sm text-ink-muted"><Bi k="dragPin" /></p>
    </div>
  );
}
