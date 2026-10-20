import { brand } from '@gharka/ui';

/** YYYY-MM-DD for now + offsetDays in the app timezone. */
export function isoDate(offsetDays = 0, from: Date = new Date()): string {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: brand.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(from);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

const at = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', ...o });
export const weekday = (iso: string) => at(iso, { weekday: 'short' });
export const dayNum = (iso: string) => at(iso, { day: 'numeric' });
export const monthShort = (iso: string) => at(iso, { month: 'short' });
export const dateLong = (iso: string) => at(iso, { weekday: 'long', day: 'numeric', month: 'short' });

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: brand.timezone, hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

/** "10:30 am" or "Tue 9:00 pm" when the cutoff falls on another day than the meal. */
export function cutoffText(cutoffIso: string, mealDate: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: brand.timezone }).format(new Date(cutoffIso));
  return day === mealDate ? clockTime(cutoffIso) : `${weekday(day)} ${clockTime(cutoffIso)}`;
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
