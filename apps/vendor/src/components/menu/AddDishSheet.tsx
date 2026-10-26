import { api, ApiError, Bi, brand, Button, cx, type DictKey, DietMark, Icon, Input, mediaUrl, Modal, t } from '@gharka/ui';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clockTime, dateLong, dayNum, isoDate, monthShort, weekday } from '../../lib/dates';
import type { CutoffPreset, Diet, Offering, Slot } from '../../lib/types';
import { uploadWithProgress } from '../../lib/upload';
import { SlotTabs } from '../vendor/SlotTabs';

const SUGGESTIONS: { en: string; hi: string }[] = [
  { en: 'Dal', hi: 'दाल' }, { en: 'Rice', hi: 'चावल' }, { en: 'Roti', hi: 'रोटी' }, { en: 'Sabzi', hi: 'सब्ज़ी' },
  { en: 'Rajma', hi: 'राजमा' }, { en: 'Chole', hi: 'छोले' }, { en: 'Kadhi', hi: 'कढ़ी' }, { en: 'Paneer', hi: 'पनीर' },
  { en: 'Paratha', hi: 'पराठा' }, { en: 'Khichdi', hi: 'खिचड़ी' }, { en: 'Biryani', hi: 'बिरयानी' }, { en: 'Thali', hi: 'थाली' },
  { en: 'Raita', hi: 'रायता' }, { en: 'Salad', hi: 'सलाद' }, { en: 'Sweet', hi: 'मीठा' },
];
const QUICK_PRICES = [60, 80, 100, 120, 150, 200];
const PRESETS: { id: CutoffPreset; k: DictKey }[] = [
  { id: '2h', k: 'cutoff2h' }, { id: '1h', k: 'cutoff1h' }, { id: 'night_before_9pm', k: 'cutoffNight' }, { id: 'morning_10am', k: 'cutoffMorning' },
];
const DIETS: { id: Diet; k: DictKey }[] = [{ id: 'veg', k: 'dietVeg' }, { id: 'egg', k: 'dietEgg' }, { id: 'nonveg', k: 'dietNonveg' }];

/** GET /vendor/offerings/cutoffs: per day, the order-by time each preset gives (null = not possible for that meal). */
type CutoffRow = { date: string; presets: Partial<Record<CutoffPreset, { cutoff_at: string; open: boolean } | null>> };

/** "Dal + Rice + Roti" <-> ['Dal', 'Rice', 'Roti'], so the chips work as a multi-select on top of the free text. */
const partsOf = (name: string) => name.split(/\s*[+,]\s*/).map((p) => p.trim()).filter(Boolean);

const chip = (on: boolean) => cx('inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-2xl border-2 px-4 text-base font-semibold transition',
  on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300 bg-white text-ink');

function Section({ n, title, hint, children }: { n?: number; title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-baseline gap-2 text-lg font-bold">
        {n && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm text-cream">{n}</span>}
        <span>{title}</span>
      </h3>
      {hint && <p className="mb-2 mt-0.5 text-sm text-ink-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

function BigStepper({ value, onChange, min, max, step = 1, format }: { value: number; onChange: (n: number) => void; min: number; max: number; step?: number; format: (n: number) => string }) {
  const b = 'flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-bold shadow-soft active:scale-95 disabled:opacity-35';
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 p-1.5 ring-1 ring-cream-200">
      <button type="button" className={cx(b, 'bg-white')} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="Less">−</button>
      <span className="font-serif text-4xl font-bold tabular-nums">{format(value)}</span>
      <button type="button" className={cx(b, 'bg-turmeric-500')} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="More">+</button>
    </div>
  );
}

/** Add (or edit) a dish with as little typing as possible. */
export function AddDishSheet({ open, onClose, date, slot: pageSlot, editing, onSaved, notify }: {
  open: boolean;
  onClose: () => void;
  date: string;
  slot: Slot;
  editing: Offering | null;
  onSaved: () => void | Promise<void>;
  notify: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState(80);
  const [diet, setDiet] = useState<Diet>('veg');
  const [portions, setPortions] = useState(10);
  const [preset, setPreset] = useState<CutoffPreset | null>('2h');
  const [slot, setSlot] = useState<Slot>(pageSlot);
  const [days, setDays] = useState<string[]>([date]);
  const [cutoffs, setCutoffs] = useState<CutoffRow[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'close' | 'remove' | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirm(null);
    setFile(null);
    setPreview(null);
    setSlot(pageSlot);
    setDays([date]);
    if (editing) {
      setName(editing.dish_name);
      setPrice(Math.round(editing.price / 100));
      setDiet(editing.diet);
      setPortions(editing.portions_total);
      setPreset(null); // keep the current order-by time unless a chip is tapped
    } else {
      setName('');
      setPrice(80);
      setDiet('veg');
      setPortions(10);
      setPreset('2h');
    }
  }, [open, editing, date, pageSlot]);

  useEffect(() => {
    if (!open || editing) return;
    setCutoffs(null);
    api.get<CutoffRow[]>(`/vendor/offerings/cutoffs?slot=${slot}&days=7`).then((rows) => {
      setCutoffs(rows);
      // If the picked days have all closed for this meal (e.g. lunch today at 3 pm), move to the next day still open.
      const open = (d: string) => !!rows.find((r) => r.date === d)?.presets['2h']?.open;
      const next = rows.find((r) => open(r.date))?.date;
      setDays((ds) => (ds.some(open) || !next ? ds : [next]));
    }).catch(() => setCutoffs([]));
  }, [open, editing, slot]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const byDate = useMemo(() => Object.fromEntries((cutoffs ?? []).map((r) => [r.date, r.presets])), [cutoffs]);
  const isOpen = (d: string, p: CutoffPreset | null) => !cutoffs?.length || !!byDate[d]?.[p ?? '2h']?.open;
  const dayList = Array.from({ length: 7 }, (_, i) => isoDate(i));
  const chosen = days.filter((d) => isOpen(d, preset)).sort();
  const firstDay = chosen[0] ?? dayList.find((d) => isOpen(d, preset)) ?? days[0];
  const parts = partsOf(name);
  const sold = editing?.portions_sold ?? 0;
  const canSave = name.trim().length >= 2 && price >= 1 && (editing !== null || chosen.length > 0);

  function togglePart(word: string) {
    const has = parts.some((p) => p.toLowerCase() === word.toLowerCase());
    setName((has ? parts.filter((p) => p.toLowerCase() !== word.toLowerCase()) : [...parts, word]).join(' + '));
  }
  const toggleDay = (d: string) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let ids: number[];
      if (editing) {
        await api.put(`/vendor/offerings/${editing.id}`, {
          dish_name: name.trim(), price: price * 100, diet, portions_total: portions, ...(preset ? { cutoff_preset: preset } : {}),
        });
        ids = [editing.id];
      } else {
        const made = await api.post<Offering[]>('/vendor/offerings', {
          dish_name: name.trim(), slot, dates: chosen, price: price * 100, diet, portions_total: portions, cutoff_preset: preset ?? '2h',
        });
        ids = made.map((o) => o.id);
      }
      if (file) {
        try {
          // One upload shared by every day of this dish.
          const form = new FormData();
          form.set('file', file);
          form.set('also', ids.slice(1).join(','));
          await uploadWithProgress(`/vendor/offerings/${ids[0]}/photo`, form);
        } catch (e) {
          notify(`${t('saved').en}. ${e instanceof ApiError ? e.detail : 'Photo upload failed'}`);
        }
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function closeDish() {
    if (!editing) return;
    setBusy(true);
    try {
      await api.put(`/vendor/offerings/${editing.id}`, { portions_total: editing.portions_sold });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not close');
    } finally {
      setBusy(false);
    }
  }

  async function removeDish() {
    if (!editing) return;
    setBusy(true);
    try {
      await api.del(`/vendor/offerings/${editing.id}`);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not remove');
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const presetTime = (p: CutoffPreset) => {
    const c = byDate[firstDay]?.[p];
    if (c === undefined) return null;
    if (c === null || !c.open) return <span className="font-normal opacity-80">· <Bi k="closed" only="en" /></span>;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: brand.timezone }).format(new Date(c.cutoff_at));
    return <span className="font-normal opacity-80">· {day === firstDay ? '' : `${weekday(day)} `}{clockTime(c.cutoff_at)}</span>;
  };
  const photoSrc = preview ?? (editing?.photo ? mediaUrl(editing.photo) : null);
  const allClosedForMeal = !editing && cutoffs !== null && cutoffs.length > 0 && chosen.length === 0 && days.length > 0;

  return (
    <Modal open={open} onClose={onClose} title={<Bi k={editing ? 'editDish' : 'addDish'} />}>
      <div className="space-y-7">
        <Section n={1} title={<Bi k="dishName" />} hint={<Bi k="dishNameHint" />}>
          <div className="mb-2.5 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => {
              const on = parts.some((p) => p.toLowerCase() === s.en.toLowerCase());
              return (
                <button key={s.en} type="button" role="checkbox" aria-checked={on} onClick={() => togglePart(s.en)}
                  className={cx('inline-flex min-h-11 items-center gap-1 rounded-full border-2 px-3.5 text-base font-semibold transition',
                    on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300 bg-white')}>
                  {on && <Icon.Check className="h-4 w-4" />}{s.en} <span className="font-devanagari text-sm opacity-75" lang="hi">{s.hi}</span>
                </button>
              );
            })}
          </div>
          <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Rajma + Rice + Salad" aria-label={t('dishName').en} />
        </Section>

        <Section n={2} title={<Bi k="foodType" />}>
          <div className="grid grid-cols-3 gap-2">
            {DIETS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={diet === d.id} onClick={() => setDiet(d.id)}
                className={cx('flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 text-center font-semibold leading-tight transition',
                  diet === d.id ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-white')}>
                <span className="flex items-center gap-1.5"><DietMark diet={d.id} className="h-4 w-4" /><Bi k={d.k} only="en" /></span>
                <Bi k={d.k} only="hi" className="text-sm text-ink-muted" />
              </button>
            ))}
          </div>
        </Section>

        <Section n={3} title={<Bi k="pricePerPlate" />}>
          <BigStepper value={price} onChange={setPrice} min={5} max={5000} step={price < 50 ? 5 : 10} format={(n) => `₹${n}`} />
          <div className="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
            {QUICK_PRICES.map((p) => <button key={p} type="button" className={cx(chip(price === p), 'min-h-10 px-3.5')} onClick={() => setPrice(p)}>₹{p}</button>)}
          </div>
        </Section>

        <Section n={4} title={<Bi k="portions" />}>
          <BigStepper value={portions} onChange={setPortions} min={Math.max(sold, editing ? 0 : 1)} max={500} format={(n) => String(n)} />
          {editing && sold > 0 && <p className="mt-1.5 text-center text-sm text-ink-muted">{sold} <Bi k="soldCount" /></p>}
        </Section>

        <Section n={5} title={<Bi k="whenServe" />} hint={editing ? undefined : <Bi k="pickDays" />}>
          {editing ? (
            <p className="rounded-2xl bg-white/70 p-3 font-semibold ring-1 ring-cream-200">{dateLong(editing.date)} · <Bi k={editing.slot} /></p>
          ) : (
            <>
              <SlotTabs value={slot} onChange={setSlot} />
              <div className="mt-3 grid grid-cols-4 gap-2">
                {dayList.map((d, i) => {
                  const on = days.includes(d);
                  const closed = cutoffs !== null && !isOpen(d, preset);
                  return (
                    <button key={d} type="button" role="checkbox" aria-checked={on && !closed} disabled={closed} onClick={() => toggleDay(d)}
                      className={cx('relative flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 leading-tight transition',
                        closed ? 'border-dashed border-cream-300 bg-cream-100 text-ink-muted' : on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300 bg-white')}>
                      <span className="text-sm font-semibold">{i === 0 ? <Bi k="today" only="en" /> : i === 1 ? <Bi k="tomorrow" only="en" /> : weekday(d)}</span>
                      <span className="text-lg font-bold">{dayNum(d)} <span className="text-xs font-semibold opacity-75">{monthShort(d)}</span></span>
                      {closed && <span className="text-[11px] font-semibold"><Bi k="closed" only="en" /></span>}
                    </button>
                  );
                })}
              </div>
              {allClosedForMeal && <p className="mt-2 rounded-xl bg-turmeric-50 p-2.5 text-sm font-medium text-turmeric-900"><Bi k="mealClosed" /></p>}
            </>
          )}
        </Section>

        <Section n={6} title={<Bi k="lastOrderTime" />}>
          <div className="grid gap-2">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => setPreset(p.id)}
                className={cx('flex min-h-12 items-center justify-between gap-2 rounded-2xl border-2 px-4 text-left font-semibold transition',
                  preset === p.id ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-white')}>
                <span><Bi k={p.k} /></span>
                {!editing && <span className="shrink-0 text-sm">{presetTime(p.id)}</span>}
              </button>
            ))}
          </div>
        </Section>

        <Section n={7} title={<><Bi k="addPhoto" /> <span className="text-sm font-normal text-ink-muted">(<Bi k="optional" only="en" />)</span></>}>
          <div className="flex items-center gap-3">
            {photoSrc ? <img src={photoSrc} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
              : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-turmeric-50 text-3xl" aria-hidden>🍛</div>}
            <div className="grid flex-1 gap-2">
              <Button variant="outline" block onClick={() => camRef.current?.click()}><Icon.Camera className="h-5 w-5" /> <Bi k="takePhoto" only="en" /></Button>
              <Button variant="ghost" size="sm" block onClick={() => galRef.current?.click()}><Bi k="fromGallery" only="en" /></Button>
            </div>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </Section>

        {editing && (
          <div className="border-t border-dashed border-cream-300 pt-4">
            {confirm === null ? (
              <div className="flex flex-col gap-2">
                {editing.is_open && editing.portions_sold > 0 && <Button variant="outline" block onClick={() => setConfirm('close')}><Bi k="closeDish" /></Button>}
                {editing.portions_sold === 0 && <Button variant="ghost" block className="text-terracotta-600" onClick={() => setConfirm('remove')}><Bi k="removeDish" /></Button>}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-lg font-semibold"><Bi k={confirm === 'close' ? 'closeDishAsk' : 'removeDish'} />?</p>
                <Button variant="danger" size="lg" block loading={busy} onClick={() => void (confirm === 'close' ? closeDish() : removeDish())}>
                  <Bi k={confirm === 'close' ? 'closeDish' : 'removeDish'} />
                </Button>
                <Button variant="outline" block onClick={() => setConfirm(null)}><Bi k="back" /></Button>
              </div>
            )}
          </div>
        )}

        <div className="sticky -bottom-5 -mx-5 -mb-5 border-t border-cream-200 bg-cream/95 px-5 pb-5 pt-3 backdrop-blur">
          {error && <p className="mb-2 rounded-xl bg-terracotta-50 p-3 font-medium text-terracotta-700" role="alert">{error}</p>}
          {!editing && chosen.length === 0 && !allClosedForMeal && <p className="mb-2 text-center text-sm font-medium text-terracotta-600"><Bi k="pickADay" /></p>}
          <Button size="xl" block loading={busy} disabled={!canSave} onClick={() => void save()}>
            <Bi k="save" />{!editing && chosen.length > 1 ? <span className="ml-1 font-semibold opacity-90">· {chosen.length} <Bi k="days" only="en" /></span> : null}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
