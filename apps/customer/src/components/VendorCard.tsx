import { Badge, cx } from '@gharka/ui';
import { Link } from 'react-router-dom';
import { cutoffText, rupees } from '../lib/format';
import type { Slot, VendorCardData } from '../lib/types';
import { CookAvatar } from './CookAvatar';
import { DietMark } from './DietMark';
import { Stars } from './Stars';

/** Cook-first card: the person leads, the food follows. */
export function VendorCard({ v, date, slot }: { v: VendorCardData; date: string; slot: Slot }) {
  const dishes = v.offerings.filter((o) => o.date === date && o.slot === slot);
  const open = dishes.filter((d) => d.is_open);
  const shown = dishes.slice(0, 4);
  return (
    <Link
      to={`/cook/${v.id}?date=${date}&slot=${slot}`}
      className="block rounded-3xl border border-cream-200 bg-white/90 p-4 shadow-soft transition active:scale-[.99] hover:shadow-lift"
    >
      <div className="flex gap-3.5">
        <CookAvatar name={v.display_name} photo={v.cook_photo} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-serif text-xl font-bold leading-tight">{v.display_name}</h3>
          {v.story && <p className="mt-0.5 line-clamp-2 font-serif text-[15px] italic leading-snug text-ink-soft">“{v.story}”</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
        <Stars avg={v.rating_avg} count={v.rating_count} />
        {v.orders_served > 0 && <span>{v.orders_served} meals served</span>}
        {v.distance_km !== null && <span>📍 {v.distance_km} km</span>}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {v.fssai_registered && <Badge tone="leaf">✓ FSSAI registered</Badge>}
        {v.offers_pickup && <Badge tone="neutral">Pickup</Badge>}
        {v.delivers_to_you ? <Badge tone="turmeric">🛵 Delivers to you</Badge>
          : v.delivery_radius_km > 0 && <Badge tone="neutral">Delivers within {v.delivery_radius_km} km</Badge>}
      </div>

      <div className="mt-3 border-t border-dashed border-cream-300 pt-2.5">
        {shown.length === 0 ? (
          <p className="text-sm text-ink-muted">No menu yet for this meal. Peek at the profile.</p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <DietMark diet={d.diet} />
                <span className={cx('min-w-0 flex-1 truncate font-medium', !d.is_open && 'text-ink-muted')}>{d.dish_name}</span>
                <span className="font-semibold tabular-nums">{rupees(d.price)}</span>
                <span className={cx('w-16 text-right text-xs font-semibold', d.is_open ? (d.portions_left <= 3 ? 'text-terracotta-600' : 'text-leaf-600') : 'text-ink-muted')}>
                  {d.is_open ? `${d.portions_left} left` : d.portions_left === 0 ? 'Sold out' : 'Closed'}
                </span>
              </li>
            ))}
            {dishes.length > shown.length && <li className="text-xs text-ink-muted">+ {dishes.length - shown.length} more</li>}
          </ul>
        )}
        {open.length > 0 && (
          <p className="mt-2 font-hand text-xl leading-5 text-terracotta-600">
            order by {cutoffText(open.reduce((a, b) => (a.cutoff_at < b.cutoff_at ? a : b)).cutoff_at, date)}
          </p>
        )}
      </div>
    </Link>
  );
}
