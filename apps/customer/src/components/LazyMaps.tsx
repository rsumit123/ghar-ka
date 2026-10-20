import { Spinner } from '@gharka/ui';
import { Suspense, lazy, type ComponentProps } from 'react';

// Leaflet is big: keep it out of the main bundle. Both components share one lazy chunk.
const MapViewLazy = lazy(() => import('@gharka/ui/maps').then((m) => ({ default: m.MapView })));
const LocationPickerLazy = lazy(() => import('@gharka/ui/maps').then((m) => ({ default: m.LocationPicker })));

const Fallback = ({ height = 240 }: { height?: number | string }) => (
  <div className="flex items-center justify-center rounded-2xl border border-cream-200 bg-cream-100" style={{ height }}>
    <Spinner className="h-6 w-6" />
  </div>
);

export function MapView(props: ComponentProps<typeof MapViewLazy>) {
  return <Suspense fallback={<Fallback height={props.height} />}><MapViewLazy {...props} /></Suspense>;
}

export function LocationPicker(props: ComponentProps<typeof LocationPickerLazy>) {
  return <Suspense fallback={<Fallback height={props.height ?? 320} />}><LocationPickerLazy {...props} /></Suspense>;
}
