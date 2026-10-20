import { ApiError, Bi, Button, DietMark, Input, Modal, Switch, api, cx, t, type DictKey } from '@gharka/ui';
import { useEffect, useState } from 'react';
import type { Diet, Plan, Slot } from '../../lib/types';
import { SlotTabs } from '../vendor/SlotTabs';

export const WEEKDAY_KEYS: DictKey[] = ['weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat', 'weekdaySun'];
const NAME_CHIPS = ['5 lunches/week', '6 lunches/week', '5 dinners/week', '6 dinners/week', 'Sunday special'];
const QUICK_PRICES = [500, 700, 900, 1200, 1500];
const DIETS: { id: Diet; k: DictKey }[] = [{ id: 'veg', k: 'dietVeg' }, { id: 'egg', k: 'dietEgg' }, { id: 'nonveg', k: 'dietNonveg' }];
const MON_SAT = [0, 1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** "Night before" lands at about 9-10 pm the previous evening for either slot. */
const nightBefore = (slot: Slot) => (slot === 'lunch' ? 15 : 22);

const chip = (on: boolean) => cx('inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border-2 px-4 text-base font-semibold transition',
  on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300 bg-white text-ink');

/** Add / edit a tiffin plan with taps instead of typing. */
export function PlanSheet({ open, editing, onClose, onSaved }: { open: boolean; editing: Plan | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<Slot>('lunch');
  const [days, setDays] = useState<number[]>(MON_SAT.slice(0, 5));
  const [price, setPrice] = useState(700);
  const [diet, setDiet] = useState<Diet>('veg');
  const [hours, setHours] = useState(12);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setName(editing.name); setSlot(editing.slot); setDays(editing.days_of_week); setPrice(Math.round(editing.price_per_week / 100));
      setDiet(editing.diet); setHours(editing.cutoff_hours_before); setActive(editing.active);
    } else {
      setName(''); setSlot('lunch'); setDays([0, 1, 2, 3, 4]); setPrice(700); setDiet('veg'); setHours(12); setActive(true);
    }
  }, [open, editing]);

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const sameDays = (a: number[]) => a.length === days.length && a.every((d) => days.includes(d));
  const canSave = name.trim().length >= 2 && days.length > 0 && price >= 10;
  const perMeal = days.length ? Math.floor((price * 100) / days.length / 100) : 0;

  async function save() {
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), slot, days_of_week: days, price_per_week: price * 100, diet, active, cutoff_hours_before: hours };
    try {
      if (editing) await api.put(`/vendor/plans/${editing.id}`, body);
      else await api.post('/vendor/plans', body);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const b = 'flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-bold shadow-soft active:scale-95 disabled:opacity-35';
  return (
    <Modal open={open} onClose={onClose} title={<Bi k={editing ? 'editPlan' : 'addPlan'} />}>
      <div className="space-y-6 pb-2">
        <SlotTabs value={slot} onChange={(s) => { setSlot(s); if (hours === nightBefore(slot)) setHours(nightBefore(s)); }} />

        <section>
          <p className="mb-2 text-lg font-bold"><Bi k="planName" /></p>
          <div className="mb-2.5 flex flex-wrap gap-2">
            {NAME_CHIPS.map((n) => (
              <button key={n} type="button" className={cx('min-h-11 rounded-full border-2 px-3.5 text-base font-semibold', name === n ? 'border-turmeric-500 bg-turmeric-100' : 'border-cream-300 bg-white')} onClick={() => setName(n)}>{n}</button>
            ))}
          </div>
          <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="5 lunches/week" aria-label={t('planName').en} />
        </section>

        <section>
          <p className="mb-2 text-lg font-bold"><Bi k="planDays" /></p>
          <div className="flex gap-1.5" role="group" aria-label={t('planDays').en}>
            {WEEKDAY_KEYS.map((k, d) => {
              const on = days.includes(d);
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => toggleDay(d)}
                  className={cx('flex min-h-16 flex-1 flex-col items-center justify-center rounded-2xl border-2 px-0 text-base font-bold transition active:scale-95',
                    on ? 'border-leaf-500 bg-leaf-500 text-white shadow-soft' : 'border-cream-300 bg-white text-ink-muted')}>
                  <span><Bi k={k} only="en" /></span>
                  <span className="font-devanagari text-xs font-semibold opacity-80" lang="hi"><Bi k={k} only="hi" /></span>
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className={chip(sameDays(MON_SAT))} onClick={() => setDays(MON_SAT)}><Bi k="monToSat" /></button>
            <button type="button" className={chip(sameDays(ALL_DAYS))} onClick={() => setDays(ALL_DAYS)}><Bi k="everyDay" /></button>
          </div>
        </section>

        <section>
          <p className="mb-2 text-lg font-bold"><Bi k="pricePerWeek" /></p>
          <div className="flex items-center justify-between gap-3">
            <button type="button" className={cx(b, 'bg-white')} disabled={price <= 50} onClick={() => setPrice((p) => Math.max(50, p - 50))} aria-label="Less">−</button>
            <span className="font-serif text-4xl font-bold tabular-nums">₹{price}</span>
            <button type="button" className={cx(b, 'bg-turmeric-500')} disabled={price >= 20000} onClick={() => setPrice((p) => p + 50)} aria-label="More">+</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PRICES.map((p) => <button key={p} type="button" className={chip(price === p)} onClick={() => setPrice(p)}>₹{p}</button>)}
          </div>
          {days.length > 0 && <p className="mt-2 text-center text-sm text-ink-muted">{days.length} <Bi k="mealsAWeek" only="en" /> · about ₹{perMeal} each</p>}
        </section>

        <section>
          <div className="flex flex-wrap gap-2">
            {DIETS.map((d) => (
              <button key={d.id} type="button" className={chip(diet === d.id)} onClick={() => setDiet(d.id)}>
                <DietMark diet={d.id} className="h-5 w-5" /><Bi k={d.k} />
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-lg font-bold"><Bi k="skipUntil" /></p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(hours === 6)} onClick={() => setHours(6)}><Bi k="hoursBefore6" /></button>
            <button type="button" className={chip(hours === 12)} onClick={() => setHours(12)}><Bi k="hoursBefore12" /></button>
            <button type="button" className={chip(hours === nightBefore(slot))} onClick={() => setHours(nightBefore(slot))}><Bi k="nightBefore" /></button>
          </div>
        </section>

        <Switch checked={active} onChange={setActive} label={<Bi k={active ? 'planActive' : 'planPaused'} />} hint={active ? undefined : <Bi k="planInactiveNote" only="en" />} />

        {error && <p className="rounded-xl bg-terracotta-50 p-3 font-medium text-terracotta-700" role="alert">{error}</p>}
        <Button size="xl" block loading={busy} disabled={!canSave} onClick={() => void save()}><Bi k="save" /></Button>
      </div>
    </Modal>
  );
}
