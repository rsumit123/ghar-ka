import type { Diet, Slot } from './types';
import { createPersistedStore } from './store';

export type CartLine = { offeringId: number; name: string; price: number; qty: number; diet: Diet; max: number };
/** One cart = one cook, one date, one meal. */
export type Cart = {
  vendorId: number;
  vendorName: string;
  date: string;
  slot: Slot;
  cutoffAt: string;
  lines: CartLine[];
};

const isCart = (v: unknown): v is Cart | null =>
  v === null || (typeof v === 'object' && Array.isArray((v as Cart).lines) && typeof (v as Cart).vendorId === 'number');

export const cartStore = createPersistedStore<Cart | null>('gharka.cart', null, isCart);
export const useCart = cartStore.useStore;

export const MAX_QTY = 10;
export const cartCount = (c: Cart | null) => c?.lines.reduce((n, l) => n + l.qty, 0) ?? 0;
export const cartTotal = (c: Cart | null) => c?.lines.reduce((n, l) => n + l.qty * l.price, 0) ?? 0;

export function sameMeal(c: Cart | null, vendorId: number, date: string, slot: Slot): boolean {
  return !!c && c.vendorId === vendorId && c.date === date && c.slot === slot;
}

/** Set a dish quantity inside a cart for this meal (creating the cart if needed). qty 0 removes the line. */
export function withQty(
  cart: Cart | null,
  meal: Pick<Cart, 'vendorId' | 'vendorName' | 'date' | 'slot' | 'cutoffAt'>,
  line: Omit<CartLine, 'qty'>,
  qty: number,
): Cart | null {
  const base: Cart = sameMeal(cart, meal.vendorId, meal.date, meal.slot) && cart ? { ...cart, cutoffAt: meal.cutoffAt } : { ...meal, lines: [] };
  const q = Math.max(0, Math.min(qty, MAX_QTY, line.max));
  const others = base.lines.filter((l) => l.offeringId !== line.offeringId);
  const lines = q > 0 ? [...others, { ...line, qty: q }].sort((a, b) => a.offeringId - b.offeringId) : others;
  return lines.length ? { ...base, lines } : null;
}
