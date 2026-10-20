import { ApiError, api, brand } from '@gharka/ui';
import type { OrderData } from './types';

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

interface RzpResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RzpInstance { open(): void; on(ev: string, cb: (r: unknown) => void): void }
declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => RzpInstance } }

/** Loads checkout.js on demand (only ever called when VITE_RAZORPAY_ENABLED=true). */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.head.appendChild(s);
  });
}

export type PayResult = 'paid' | 'dismissed';

/** Opens Razorpay for an already-created order; resolves 'paid' after the server verified the signature. */
export async function payForOrder(order: OrderData, user: { name?: string | null; phone?: string | null }): Promise<PayResult> {
  if (!brand.razorpayEnabled) throw new Error('Online payment is not enabled');
  const [created] = await Promise.all([
    api.post<{ razorpay_order_id: string; amount: number; currency: string; key_id: string }>('/payments/razorpay/order', { order_id: order.id }),
    loadCheckout(),
  ]);
  return new Promise<PayResult>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: created.key_id, amount: created.amount, currency: created.currency, order_id: created.razorpay_order_id,
      name: brand.name, description: `Order #${order.id}`,
      prefill: { name: user.name ?? '', contact: user.phone ?? '' },
      theme: { color: '#C2603E' },
      handler: (r: RzpResponse) => {
        api.post('/payments/razorpay/verify', { order_id: order.id, ...r }).then(() => resolve('paid'))
          .catch((e) => reject(e instanceof ApiError ? new Error(e.detail) : e));
      },
      modal: { ondismiss: () => resolve('dismissed') },
    });
    rzp.on('payment.failed', () => { /* the sheet stays open so they can retry */ });
    rzp.open();
  });
}
