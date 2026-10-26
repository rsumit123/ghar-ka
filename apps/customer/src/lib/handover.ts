import type { DeliveryBy, Fulfilment, OrderStatus } from './types';

/** How the food reaches the customer, in plain words. One place so checkout, the orders list and the order page agree. */
type Handover = { fulfilment: Fulfilment; delivery_by: DeliveryBy | null };

export function handoverLabel(o: Handover): string {
  if (o.fulfilment === 'pickup') return 'You collect';
  return o.delivery_by === 'partner' ? 'Delivery partner' : 'Cook delivers';
}

/** Status words that match the handover: "Ready to collect" for a pickup, "On the way" for a delivery. */
export function statusText(o: Handover & { status: OrderStatus }): string {
  const pickup = o.fulfilment === 'pickup';
  switch (o.status) {
    case 'placed': return 'Waiting for the cook';
    case 'accepted': return 'Cook is preparing';
    case 'ready': return pickup ? 'Ready to collect' : o.delivery_by === 'partner' ? 'With the delivery partner' : 'On the way';
    case 'completed': return pickup ? 'Collected' : 'Delivered';
    case 'cancelled': return 'Cancelled';
  }
}

export function stepLabels(o: Handover): Record<'placed' | 'accepted' | 'ready' | 'completed', string> {
  const pickup = o.fulfilment === 'pickup';
  return { placed: 'Placed', accepted: 'Cooking', ready: pickup ? 'Ready' : 'On the way', completed: pickup ? 'Collected' : 'Delivered' };
}

/** Sub-line under "Bring it to me" at checkout. */
export function deliverySub(v: { display_name: string; delivery_by: DeliveryBy; delivery_radius_km: number }): string {
  const who = v.delivery_by === 'partner' ? 'Sent with a delivery partner' : `${v.display_name} brings it`;
  return `${who}, within ${v.delivery_radius_km} km`;
}
