import { createPersistedStore } from './store';

/** The customer's chosen area, remembered in localStorage. */
export type Place = {
  name: string;
  lat?: number;
  lng?: number;
  pincode?: string;
  localityId?: number;
  /** true for GPS / searched address (lat+lng are the customer's own point); false for a locality centroid */
  precise: boolean;
};

const isPlace = (v: unknown): v is Place | null =>
  v === null || (typeof v === 'object' && typeof (v as Place).name === 'string' && typeof (v as Place).precise === 'boolean');

export const placeStore = createPersistedStore<Place | null>('gharka.place', null, isPlace);
export const usePlace = placeStore.useStore;

/** Query params for GET /vendors. */
export function placeParams(p: Place): Record<string, string | number | undefined> {
  return p.precise
    ? { lat: p.lat, lng: p.lng, pincode: p.pincode }
    : { locality_id: p.localityId, pincode: p.pincode };
}
