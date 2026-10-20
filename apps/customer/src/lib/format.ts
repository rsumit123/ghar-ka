import { brand } from '@gharka/ui';
import type { Diet, Slot } from './types';

const TZ = brand.timezone;

/** paise -> "₹80" (or "₹82.50") */
export function rupees(paise: number): string {
  const v = paise / 100;
  return `₹${Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

/** YYYY-MM-DD for "now + offsetDays" in the app timezone. */
export function isoDate(offsetDays = 0, from: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(from);
  const [y, m, d] = parts.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

const dateOf = (iso: string) => new Date(`${iso}T12:00:00Z`);
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => dateOf(iso).toLocaleDateString('en-IN', { timeZone: 'UTC', ...opts });

export const weekdayShort = (iso: string) => fmt(iso, { weekday: 'short' });
export const dayNum = (iso: string) => fmt(iso, { day: 'numeric' });
export const monthShort = (iso: string) => fmt(iso, { month: 'short' });
export const dateLong = (iso: string) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'short' });

export function dayLabel(iso: string): string {
  if (iso === isoDate(0)) return 'Today';
  if (iso === isoDate(1)) return 'Tomorrow';
  return weekdayShort(iso);
}

export const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ').toLowerCase();

const dateKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

/** "10:30 am", "tonight 9 pm" style cutoff text relative to the meal date. */
export function cutoffText(cutoffIso: string, mealDate: string): string {
  const day = dateKey(cutoffIso);
  const t = timeOf(cutoffIso).replace(':00', '');
  if (day === mealDate) return t;
  if (day === isoDate(0)) return `tonight ${t}`;
  return `${weekdayShort(day)} ${t}`;
}

export const slotLabel = (s: Slot) => (s === 'lunch' ? 'Lunch' : 'Dinner');
export const dietLabel: Record<Diet, string> = { veg: 'Veg', egg: 'Egg', nonveg: 'Non-veg' };

export const dateTimeShort = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371.0088;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const waLink = (digits: string, text: string) => `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
