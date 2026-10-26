import { api, ApiError, Bi, brand, Button, cx, type DictKey, DietMark, Icon, Input, mediaUrl, Modal, useLang, useT } from '@gharka/ui';
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

/** GET /vendor/offerings/recent: one row per dish the cook has made, newest first. */
type Recent = { offering_id: number; dish_name: string; price: number; diet: Diet; portions_total: number; photo: string | null; photo_from: number | null };

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
  const tt = useT();
  const [lang] = useLang();
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
  const [recent, setRecent] = useState<Recent[]>([]);
  const [picked, setPicked] = useState<Recent | null>(null);
  const [showChips, setShowChips] = useState(false);
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
    setPicked(null);
    setShowChips(!editing);
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
    if (!open || editing) return;
    api.get<Recent[]>('/vendor/offerings/recent').then(setRecent).catch(() => setRecent([]));
  }, [open, editing]);

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
  // The photo of a picked past dish is reused only while the name still matches it.
  const reuse = picked && name === picked.dish_name ? picked : null;
  // While a word is half typed ("Ra"), only the chips that start with it are shown, matching first.
  const known = (w: string) => SUGGESTIONS.some((s) => s.en.toLowerCase() === w.toLowerCase());
  const typing = parts.length && !known(parts[parts.length - 1]) && !/[+,]\s*$/.test(name) ? parts[parts.length - 1].toLowerCase() : '';
  const typed = typing ? SUGGESTIONS.filter((s) => s.en.toLowerCase().startsWith(typing) || s.hi.startsWith(typing)) : [];
  const chips = typed.length ? typed : SUGGESTIONS;
  const sold = editing?.portions_sold ?? 0;
  const canSave = name.trim().length >= 2 && price >= 1 && (editing !== null || chosen.length > 0);

  function togglePart(word: string) {
    const has = parts.some((p) => p.toLowerCase() === word.toLowerCase());
    const base = typed.length ? parts.slice(0, -1) : parts; // finishing a half-typed word replaces it
    setName((has ? parts.filter((p) => p.toLowerCase() !== word.toLowerCase()) : [...base, word]).join(' + '));
  }

  function pickRecent(r: Recent) {
    setPicked(r);
    setName(r.dish_name);
    setDiet(r.diet);
    setPrice(Math.round(r.price / 100));
    setPortions(r.portions_total);
    setFile(null);
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
          ...(reuse?.photo_from && !file ? { photo_from: reuse.photo_from } : {}),
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
          notify(`${tt('saved')}. ${e instanceof ApiError ? e.detail : 'Photo upload failed'}`);
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
    if (c === null || !c.open) return <span className="font-normal opacity-80">· <Bi k="closed" /></span>;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: brand.timezone }).format(new Date(c.cutoff_at));
    return <span className="font-normal opacity-80">· {day === firstDay ? '' : `${weekday(day)} `}{clockTime(c.cutoff_at)}</span>;
  };
  const oldPhoto = editing?.photo ?? reuse?.photo;
  const photoSrc = preview ?? (oldPhoto ? mediaUrl(oldPhoto) : null);
  const allClosedForMeal = !editing && cutoffs !== null && cutoffs.length > 0 && chosen.length === 0 && days.length > 0;

  const footer = (
    <>
      {error && <p className="mb-2 rounded-xl bg-terracotta-50 p-3 font-medium text-terracotta-700" role="alert">{error}</p>}
      {!editing && chosen.length === 0 && !allClosedForMeal && <p className="mb-2 text-center text-sm font-medium text-terracotta-600"><Bi k="pickADay" /></p>}
      <Button size="xl" block loading={busy} disabled={!canSave} onClick={() => void save()}>
        <Bi k="save" />{!editing && chosen.length > 1 ? <span className="ml-1 font-semibold opacity-90">· {chosen.length} <Bi k="days" /></span> : null}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={<Bi k={editing ? 'editDish' : 'addDish'} />} footer={footer}>
      <div className="space-y-7">
        {!editing && recent.length > 0 && (
          <Section title={<Bi k="yourDishes" />} hint={<Bi k="yourDishesHint" />}>
            <div className="-mx-5 flex snap-x scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1">
              {recent.map((r) => {
                const on = reuse?.offering_id === r.offering_id;
                return (
                  <button key={r.offering_id} type="button" aria-pressed={on} onClick={() => pickRecent(r)}
                    className={cx('relative flex w-28 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border-2 bg-white text-left transition',
                      on ? 'border-leaf-500 ring-2 ring-leaf-500/30' : 'border-cream-300')}>
                    {r.photo ? <img src={mediaUrl(r.photo)} alt="" className="h-20 w-full object-cover" />
                      : <span className="flex h-20 w-full items-center justify-center bg-turmeric-50 text-3xl" aria-hidden>🍛</span>}
                    <span className="flex flex-1 flex-col gap-0.5 p-2">
                      <span className="line-clamp-2 text-sm font-semibold leading-tight">{r.dish_name}</span>
                      <span className="mt-auto flex items-center gap-1 text-sm text-ink-muted"><DietMark diet={r.diet} className="h-3 w-3" />₹{Math.round(r.price / 100)}</span>
                    </span>
                    {on && <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-leaf-500 text-white"><Icon.Check className="h-4 w-4" /></span>}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <Section n={1} title={!editing && recent.length > 0 ? <Bi k="orNewDish" /> : <Bi k="dishName" />} hint={showChips ? <Bi k="dishNameHint" /> : undefined}>
          <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Rajma + Rice + Salad" aria-label={tt('dishName')} />
          {showChips ? (
            <div className="-mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5 pb-1">
              {chips.map((s) => {
                const on = parts.some((p) => p.toLowerCase() === s.en.toLowerCase());
                return (
                  <button key={s.en} type="button" role="checkbox" aria-checked={on} onClick={() => togglePart(s.en)}
                    className={cx('inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 px-3.5 text-base font-semibold transition',
                      on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300 bg-white')}>
                    {on && <Icon.Check className="h-4 w-4" />}{lang === 'hi' ? <span className="font-devanagari" lang="hi">{s.hi}</span> : s.en}
                  </button>
                );
              })}
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => setShowChips(true)}><Bi k="pickFromList" /></Button>
          )}
        </Section>

        <Section n={2} title={<Bi k="foodType" />}>
          <div className="grid grid-cols-3 gap-2">
            {DIETS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={diet === d.id} onClick={() => setDiet(d.id)}
                className={cx('flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 text-center font-semibold leading-tight transition',
                  diet === d.id ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-white')}>
                <span className="flex items-center gap-1.5"><DietMark diet={d.id} className="h-4 w-4" /><Bi k={d.k} /></span>
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
                      <span className="text-sm font-semibold">{i === 0 ? <Bi k="today" /> : i === 1 ? <Bi k="tomorrow" /> : weekday(d)}</span>
                      <span className="text-lg font-bold">{dayNum(d)} <span className="text-xs font-semibold opacity-75">{monthShort(d)}</span></span>
                      {closed && <span className="text-[11px] font-semibold"><Bi k="closed" /></span>}
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

        <Section n={7} title={<><Bi k="addPhoto" /> <span className="text-sm font-normal text-ink-muted">(<Bi k="optional" />)</span></>}>
          <div className="flex items-center gap-3">
            {photoSrc ? <img src={photoSrc} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
              : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-turmeric-50 text-3xl" aria-hidden>🍛</div>}
            <div className="grid flex-1 gap-2">
              <Button variant="outline" block onClick={() => camRef.current?.click()}><Icon.Camera className="h-5 w-5" /> <Bi k="takePhoto" /></Button>
              <Button variant="ghost" size="sm" block onClick={() => galRef.current?.click()}><Bi k="fromGallery" /></Button>
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
      </div>
    </Modal>
  );
}
