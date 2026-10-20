import { ApiError, Button, Modal, api, cx } from '@gharka/ui';
import { useEffect, useState } from 'react';
import type { OrderData } from '../lib/types';

type Cook = { id: number; name: string };

/** "Report a problem" form. From an order, the cook and order are known; from the profile the customer picks the cook. */
export function ReportSheet({ open, onClose, vendor, orderId, onSent }: {
  open: boolean;
  onClose: () => void;
  vendor?: Cook;
  orderId?: number;
  onSent?: () => void;
}) {
  const [cooks, setCooks] = useState<Cook[]>([]);
  const [cookId, setCookId] = useState<number | null>(vendor?.id ?? null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setError(null);
    if (vendor) { setCookId(vendor.id); return; }
    api.get<OrderData[]>('/orders').then((orders) => {
      const seen = new Map<number, Cook>();
      for (const o of orders) if (!seen.has(o.vendor.id)) seen.set(o.vendor.id, { id: o.vendor.id, name: o.vendor.display_name });
      const list = [...seen.values()];
      setCooks(list);
      setCookId((c) => c ?? (list.length === 1 ? list[0].id : null));
    }).catch(() => setCooks([]));
  }, [open, vendor]);

  async function send() {
    if (cookId === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/complaints', { vendor_id: cookId, order_id: orderId, text: text.trim() });
      setSent(true);
      setText('');
      onSent?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not send. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={sent ? 'Thank you' : 'Report a problem'}>
      {sent ? (
        <>
          <p className="text-ink-soft">We&apos;ve got your message. Our team will look into it and get back to you.</p>
          <Button block className="mt-4" onClick={onClose}>Done</Button>
        </>
      ) : (
        <div className="space-y-4">
          {vendor ? (
            <p className="text-ink-soft">About <strong>{vendor.name}</strong>{orderId ? <> · order #{orderId}</> : null}</p>
          ) : (
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-soft">Which cook?</p>
              {cooks.length === 0 ? <p className="text-sm text-ink-muted">Place an order first, then you can report a problem with it.</p> : (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cook">
                  {cooks.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={c.id === cookId} onClick={() => setCookId(c.id)}
                      className={cx('min-h-11 rounded-full border-2 px-4 font-semibold', c.id === cookId ? 'border-ink bg-ink text-cream' : 'border-cream-300 bg-white/80 text-ink-soft')}>{c.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <label htmlFor="report-text" className="mb-1.5 block text-sm font-semibold text-ink-soft">What went wrong?</label>
            <textarea id="report-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
              placeholder="Tell us in your own words"
              className="w-full rounded-xl border-2 border-cream-300 bg-white px-4 py-3 text-base focus:border-turmeric-500" />
          </div>
          {error && <p className="font-medium text-terracotta-600" role="alert">{error}</p>}
          <Button size="lg" block loading={busy} disabled={cookId === null || text.trim().length < 5} onClick={() => void send()}>Send to our team</Button>
          <Button variant="ghost" block onClick={onClose}>Cancel</Button>
        </div>
      )}
    </Modal>
  );
}
