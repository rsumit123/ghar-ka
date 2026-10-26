import { ApiError, Bi, Button, DietMark, Input, Modal, Switch, api, cx, t, type DictKey, useT } from '@gharka/ui';
import { useEffect, useState } from 'react';
import type { Diet, Plan, Slot } from '../../lib/types';
import { SlotTabs } from '../vendor/SlotTabs';

export const WEEKDAY_KEYS: DictKey[] = ['weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat', 'weekdaySun'];
const QUICK_PRICES = [500, 700, 900, 1200, 1500];
const DIETS: { id: Diet; k: DictKey }[] = [{ id: 'veg', k: 'dietVeg' }, { id: 'egg', k: 'dietEgg' }, { id: 'nonveg', k: 'dietNonveg' }];
const MON_SAT = [0, 1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** "Night before" lands at about 9-10 pm the previous evening for either slot. */
const nightBefore = (slot: Slot) => (slot === 'lunch' ? 15 : 22);

/** Name a plan from its meal and days: "Weekday lunch", "Mon–Sat dinner", "Daily lunch", "3 lunches a week". */
function suggestName(slot: Slot, days: number[]) {
  const n = days.length;
  if (!n) return '';
  if (n === 7) return `Daily ${slot}`;
  if (n === 5 && days.every((d, i) => d === i)) return `Weekday ${slot}`;
  if (n > 1 && days.every((d, i) => d === days[0] + i)) return `${t(WEEKDAY_KEYS[days[0]]).en}–${t(WEEKDAY_KEYS[days[n - 1]]).en} ${slot}`;
  return n === 1 ? `1 ${slot} a week` : `${n} ${slot}s a week`;
}

const chip = (on: boolean) => cx('inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border-2 px-4 text-base font-semibold transition',
  on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300 bg-white text-ink');

/** Add / edit a tiffin plan with taps instead of typing. */
export function PlanSheet({ open, editing, onClose, onSaved }: { open: boolean; editing: Plan | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const tt = useT();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
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
    setNameTouched(!!editing);
    if (editing) {
      setName(editing.name); setSlot(editing.slot); setDays(editing.days_of_week); setPrice(Math.round(editing.price_per_week / 100));
      setDiet(editing.diet); setHours(editing.cutoff_hours_before); setActive(editing.active);
    } else {
      setName(''); setSlot('lunch'); setDays([0, 1, 2, 3, 4]); setPrice(700); setDiet('veg'); setHours(12); setActive(true);
    }
  }, [open, editing]);

  // New plans: keep the name in step with meal + days until the cook types her own.
  useEffect(() => {
    if (open && !editing && !nameTouched) setName(suggestName(slot, days));
  }, [open, editing, nameTouched, slot, days]);

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
  const seg = (on: boolean) => cx('flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 text-center font-semibold leading-tight transition',
    on ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-white');
  const link = 'min-h-11 text-base font-semibold text-leaf-700 underline underline-offset-4';

  const mealSec = (
    <SlotTabs value={slot} onChange={(s) => { setSlot(s); if (hours === nightBefore(slot)) setHours(nightBefore(s)); }} />
  );

  const daysSec = (
    <section>
      <p className="mb-2 text-lg font-bold"><Bi k="planDays" /></p>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={tt('planDays')}>
        {WEEKDAY_KEYS.map((k, d) => {
          const on = days.includes(d);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => toggleDay(d)}
              className={cx('flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 px-0 text-sm font-bold transition active:scale-95',
                on ? 'border-leaf-500 bg-leaf-500 text-white shadow-soft' : 'border-cream-300 bg-white text-ink-muted')}>
              <Bi k={k} />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-5">
        <button type="button" className={cx(link, sameDays(MON_SAT) && 'text-ink-muted no-underline')} onClick={() => setDays(MON_SAT)}><Bi k="monToSat" /></button>
        <button type="button" className={cx(link, sameDays(ALL_DAYS) && 'text-ink-muted no-underline')} onClick={() => setDays(ALL_DAYS)}><Bi k="everyDay" /></button>
      </div>
    </section>
  );

  const priceSec = (
    <section>
      <p className="mb-2 text-lg font-bold"><Bi k="pricePerWeek" /></p>
      <div className="flex items-center justify-between gap-3">
        <button type="button" className={cx(b, 'bg-white')} disabled={price <= 50} onClick={() => setPrice((p) => Math.max(50, p - 50))} aria-label="Less">−</button>
        <span className="font-serif text-4xl font-bold tabular-nums">₹{price}</span>
        <button type="button" className={cx(b, 'bg-turmeric-500')} disabled={price >= 20000} onClick={() => setPrice((p) => p + 50)} aria-label="More">+</button>
      </div>
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {QUICK_PRICES.map((p) => <button key={p} type="button" className={cx(chip(price === p), 'shrink-0')} onClick={() => setPrice(p)}>₹{p}</button>)}
      </div>
      {days.length > 0 && <p className="mt-2 text-center text-sm text-ink-muted">{days.length} <Bi k="mealsAWeek" /> · about ₹{perMeal} each</p>}
    </section>
  );

  const dietSec = (
    <section>
      <p className="mb-2 text-lg font-bold"><Bi k="foodType" /></p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tt('foodType')}>
        {DIETS.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={diet === d.id} onClick={() => setDiet(d.id)} className={seg(diet === d.id)}>
            <span className="flex items-center gap-1.5"><DietMark diet={d.id} className="h-4 w-4" /><Bi k={d.k} /></span>
          </button>
        ))}
      </div>
    </section>
  );

  const nameSec = (
    <section>
      <p className="mb-2 text-lg font-bold"><Bi k="planName" /></p>
      <Input size="lg" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(e.target.value !== ''); }} maxLength={160} placeholder="Weekday lunch" aria-label={tt('planName')} />
    </section>
  );

  const cutoffs: { h: number; k: DictKey }[] = [{ h: 6, k: 'cutoff6' }, { h: 12, k: 'cutoff12' }, { h: nightBefore(slot), k: 'planCutoffNight' }];
  const cutoffSec = (
    <section>
      <p className="mb-2 text-lg font-bold"><Bi k="skipUntil" /></p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tt('skipUntil')}>
        {cutoffs.map((c) => (
          <button key={c.h} type="button" role="radio" aria-checked={hours === c.h} onClick={() => setHours(c.h)} className={seg(hours === c.h)}>
            <Bi k={c.k} className="text-base" />
          </button>
        ))}
      </div>
    </section>
  );

  const activeSec = <Switch checked={active} onChange={setActive} label={<Bi k={active ? 'planActive' : 'planPaused'} />} hint={active ? undefined : <Bi k="planInactiveNote" />} />;

  return (
    <Modal open={open} onClose={onClose} title={<Bi k={editing ? 'editPlan' : 'addPlan'} />} footer={(
      <>
        {error && <p className="mb-2 rounded-xl bg-terracotta-50 p-3 font-medium text-terracotta-700" role="alert">{error}</p>}
        <Button size="xl" block loading={busy} disabled={!canSave} onClick={() => void save()}><Bi k="save" /></Button>
      </>
    )}>
      {editing ? (
        <div className="space-y-6 pb-2">
          {daysSec}
          {priceSec}
          {activeSec}
          <details className="group rounded-2xl border-2 border-cream-300 bg-white/60">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 text-lg font-bold [&::-webkit-details-marker]:hidden">
              <Bi k="moreOptions" /><span className="text-ink-muted transition group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <div className="space-y-6 px-4 pb-4 pt-2">
              {mealSec}
              {dietSec}
              {nameSec}
              {cutoffSec}
            </div>
          </details>
        </div>
      ) : (
        <div className="space-y-6 pb-2">
          {mealSec}
          {daysSec}
          {priceSec}
          {dietSec}
          {nameSec}
          {cutoffSec}
          {activeSec}
        </div>
      )}
    </Modal>
  );
}
