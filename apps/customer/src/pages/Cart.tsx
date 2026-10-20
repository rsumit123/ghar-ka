import { Badge, Button, Card, EmptyState, Modal } from '@gharka/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DietMark } from '../components/DietMark';
import { Shell } from '../components/Shell';
import { Stepper } from '../components/Stepper';
import { MAX_QTY, cartCount, cartStore, cartTotal, useCart } from '../lib/cart';
import { cutoffText, dateLong, rupees, slotLabel } from '../lib/format';

export default function Cart() {
  const [cart, setCart] = useCart();
  const [confirmClear, setConfirmClear] = useState(false);
  const navigate = useNavigate();

  if (!cart || cart.lines.length === 0) {
    return (
      <Shell title="Your basket">
        <Card><EmptyState title="Your basket is empty" hint="Pick a cook and add today's dishes." action={<Link to="/"><Button>Find a cook</Button></Link>} /></Card>
      </Shell>
    );
  }
  const closed = cart.cutoffAt !== '' && new Date(cart.cutoffAt).getTime() <= Date.now();
  const setQty = (id: number, qty: number) =>
    setCart((c) => c && { ...c, lines: c.lines.map((l) => (l.offeringId === id ? { ...l, qty } : l)).filter((l) => l.qty > 0) });

  return (
    <Shell title="Your basket">
      <Card className="bg-turmeric-50/60">
        <p className="text-sm text-ink-muted">Ordering from</p>
        <Link to={`/cook/${cart.vendorId}?date=${cart.date}&slot=${cart.slot}`} className="font-serif text-2xl font-bold underline-offset-4 hover:underline">{cart.vendorName}</Link>
        <p className="mt-0.5 text-ink-soft">{slotLabel(cart.slot)} · {dateLong(cart.date)}</p>
        {cart.cutoffAt && !closed && <p className="mt-1 font-hand text-2xl leading-6 text-terracotta-600">order by {cutoffText(cart.cutoffAt, cart.date)}</p>}
        {closed && <Badge tone="terracotta" className="mt-2">Order time is over for this meal</Badge>}
      </Card>

      <ul className="mt-4 divide-y divide-cream-200 rounded-2xl border border-cream-200 bg-white/85 shadow-soft">
        {cart.lines.map((l) => (
          <li key={l.offeringId} className="flex items-center gap-3 p-3.5">
            <DietMark diet={l.diet} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{l.name}</p>
              <p className="text-sm text-ink-muted">{rupees(l.price)} each</p>
            </div>
            <Stepper value={l.qty} onChange={(n) => setQty(l.offeringId, n)} max={Math.min(MAX_QTY, l.max)} label={l.name} />
            <p className="w-16 text-right font-semibold tabular-nums">{rupees(l.price * l.qty)}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-lg">
        <span className="font-semibold">Total ({cartCount(cart)} items)</span>
        <span className="font-serif text-2xl font-bold">{rupees(cartTotal(cart))}</span>
      </div>

      <div className="mt-5 space-y-2">
        <Button size="xl" block disabled={closed} onClick={() => navigate('/checkout')}>Checkout</Button>
        <Link to={`/cook/${cart.vendorId}?date=${cart.date}&slot=${cart.slot}`} className="block"><Button variant="outline" block>Add more from {cart.vendorName}</Button></Link>
        <Button variant="ghost" block onClick={() => setConfirmClear(true)}>Empty basket</Button>
      </div>
      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Empty your basket?">
        <div className="flex flex-col gap-2">
          <Button variant="danger" block onClick={() => { cartStore.write(null); setConfirmClear(false); }}>Yes, empty it</Button>
          <Button variant="outline" block onClick={() => setConfirmClear(false)}>Keep it</Button>
        </div>
      </Modal>
    </Shell>
  );
}
