import { useEffect } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { brand } from '../brand';
import { L } from './leafletSetup';

export type LatLng = { lat: number; lng: number };
export type MapMarker = LatLng & { id: string | number; label?: string; onClick?: () => void };

type Props = {
  center?: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  /** Translucent circle, e.g. a vendor's delivery radius. */
  circle?: { center: LatLng; radiusKm: number };
  /** Zoom to fit all markers (and the circle). */
  fit?: boolean;
  height?: number | string;
  className?: string;
  /** Disable pan/zoom gestures (small preview maps). */
  static?: boolean;
};

function Recenter({ center, zoom, fitPoints }: { center: LatLng; zoom: number; fitPoints?: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (fitPoints) map.fitBounds(fitPoints, { padding: [30, 30], maxZoom: 16 });
    else map.setView([center.lat, center.lng], zoom);
  }, [map, center.lat, center.lng, zoom, fitPoints]);
  return null;
}

/** Read-only OSM map with markers and an optional radius circle. Tiles/attribution come from env via brand. */
export function MapView({ center, zoom = 14, markers = [], circle, fit, height = 280, className, static: isStatic }: Props) {
  const c = center ?? markers[0] ?? circle?.center ?? brand.map.center;
  let fitPoints: L.LatLngBoundsExpression | undefined;
  if (fit) {
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
    if (circle) bounds.extend(L.latLng(circle.center.lat, circle.center.lng).toBounds(circle.radiusKm * 2000));
    if (bounds.isValid()) fitPoints = bounds;
  }

  return (
    <div className={`overflow-hidden rounded-2xl border border-cream-200 shadow-soft ${className ?? ''}`} style={{ height }}>
      <MapContainer
        center={[c.lat, c.lng]} zoom={zoom} scrollWheelZoom={!isStatic} dragging={!isStatic}
        zoomControl={!isStatic} doubleClickZoom={!isStatic} touchZoom={!isStatic} style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={brand.map.tileUrl} attribution={brand.map.attribution} />
        <Recenter center={c} zoom={zoom} fitPoints={fitPoints} />
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} eventHandlers={m.onClick ? { click: m.onClick } : undefined}>
            {m.label && <Popup>{m.label}</Popup>}
          </Marker>
        ))}
        {circle && (
          <Circle
            center={[circle.center.lat, circle.center.lng]} radius={circle.radiusKm * 1000}
            pathOptions={{ color: '#4F7942', fillColor: '#4F7942', fillOpacity: 0.12, weight: 2 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
