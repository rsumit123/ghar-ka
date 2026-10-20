import { ApiError, Button, Card, api, cx } from '@gharka/ui';
import { useState } from 'react';
import { dateTimeShort } from '../lib/format';
import type { OrderData } from '../lib/types';

export function StarRow({ rating }: { rating: number }) {
  return <span className="text-turmeric-600" aria-label={`${rating} out of 5`}>{'★'.repeat(rating)}<span className="text-cream-300">{'★'.repeat(5 - rating)}</span></span>;
}

const WORDS = ['', 'Not good', 'Could be better', 'Okay', 'Tasty', 'Loved it!'];

/** Five big stars + a short note. Shown on a completed order; afterwards the submitted review is shown instead. */
export function ReviewSection({ order, onDone }: { order: OrderData; onDone: (o: OrderData) => void }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (order.review) {
    return (
      <Card className="mt-5 border-leaf-200 bg-leaf-50/60">
        <p className="font-semibold">Your review</p>
        <p className="text-2xl"><StarRow rating={order.review.rating} /></p>
        {order.review.text && <p className="mt-1 font-serif italic text-ink-soft">“{order.review.text}”</p>}
        <p className="mt-1 text-xs text-ink-muted">{dateTimeShort(order.review.created_at)}</p>
      </Card>
    );
  }
  if (!order.can_review) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.post<OrderData>(`/orders/${order.id}/review`, { rating, text: text.trim() }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not save your review');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5">
      <p className="font-serif text-xl font-bold">How was it?</p>
      <div className="mt-2 flex justify-between gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}
            className={cx('flex h-14 flex-1 items-center justify-center rounded-2xl text-4xl transition active:scale-95', n <= rating ? 'bg-turmeric-100 text-turmeric-500' : 'bg-cream-100 text-cream-300')}>★</button>
        ))}
      </div>
      <p className="mt-1 h-5 text-center font-hand text-xl text-terracotta-600">{WORDS[rating]}</p>
      <label htmlFor="review-text" className="sr-only">Tell others about it</label>
      <textarea id="review-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={280}
        placeholder="A line about the food (optional)" className="mt-2 w-full rounded-xl border-2 border-cream-300 bg-white px-4 py-3 text-base focus:border-turmeric-500" />
      <p className="text-right text-xs text-ink-muted">{text.length}/280</p>
      {error && <p className="mt-1 font-medium text-terracotta-600" role="alert">{error}</p>}
      <Button block className="mt-2" loading={busy} disabled={rating === 0} onClick={() => void submit()}>Post review</Button>
    </Card>
  );
}
