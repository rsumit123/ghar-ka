import { api, ApiError, Bi, Button, cx, type DictKey, DietMark, Icon, Input, mediaUrl, Modal, t } from '@gharka/ui';
import { useEffect, useRef, useState } from 'react';
import { dayNum, isoDate, monthShort, weekday } from '../../lib/dates';
import type { CutoffPreset, Diet, Offering, Slot } from '../../lib/types';
import { uploadWithProgress } from '../../lib/upload';

const SUGGESTIONS: { en: string; hi: string }[] = [
  { en: 'Dal', hi: 'दाल' }, { en: 'Sabzi', hi: 'सब्ज़ी' }, { en: 'Roti', hi: 'रोटी' }, { en: 'Rice', hi: 'चावल' },
  { en: 'Thali', hi: 'थाली' }, { en: 'Biryani', hi: 'बिरयानी' }, { en: 'Paratha', hi: 'पराठा' }, { en: 'Rajma', hi: 'राजमा' },
  { en: 'Khichdi', hi: 'खिचड़ी' }, { en: 'Paneer', hi: 'पनीर' }, { en: 'Chole', hi: 'छोले' }, { en: 'Kadhi', hi: 'कढ़ी' },
];
const QUICK_PRICES = [60, 80, 100, 120, 150];
const PRESETS: { id: CutoffPreset; k: DictKey }[] = [
  { id: '2h', k: 'cutoff2h' }, { id: '1h', k: 'cutoff1h' }, { id: 'night_before_9pm', k: 'cutoffNight' }, { id: 'morning_10am', k: 'cutoffMorning' },
];
const DIETS: { id: Diet; k: DictKey }[] = [{ id: 'veg', k: 'dietVeg' }, { id: 'egg', k: 'dietEgg' }, { id: 'nonveg', k: 'dietNonveg' }];

const chip = (on: boolean) => cx('inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border-2 px-4 text-base font-semibold transition',
  on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300 bg-white text-ink');

function BigStepper({ value, onChange, min, max, step = 1, format }: { value: number; onChange: (n: number) => void; min: number; max: number; step?: number; format: (n: number) => string }) {
  const b = 'flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-bold shadow-soft active:scale-95 disabled:opacity-35';
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" className={cx(b, 'bg-white')} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="Less">−</button>
      <span className="font-serif text-4xl font-bold tabular-nums">{format(value)}</span>
      <button type="button" className={cx(b, 'bg-turmeric-500')} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="More">+</button>
    </div>
  );
}

/** Add (or edit) a dish with as little typing as possible. */
export function AddDishSheet({ open, onClose, date, slot, editing, onSaved, notify }: {
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
  const [repeat, setRepeat] = useState<string[]>([]);
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
    setRepeat([]);
    setFile(null);
    setPreview(null);
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
  }, [open, editing]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const sold = editing?.portions_sold ?? 0;
  const days = Array.from({ length: 7 }, (_, i) => isoDate(i)).filter((d) => d !== date);
  const canSave = name.trim().length >= 2 && price >= 1;

  async function uploadPhoto(ids: number[]) {
    if (!file) return;
    for (const id of ids) {
      const form = new FormData();
      form.set('file', file);
      await uploadWithProgress(`/vendor/offerings/${id}/photo`, form);
    }
  }

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
          dish_name: name.trim(), slot, dates: [date, ...repeat], price: price * 100, diet, portions_total: portions, cutoff_preset: preset ?? '2h',
        });
        ids = made.map((o) => o.id);
      }
      try {
        await uploadPhoto(ids);
      } catch (e) {
        notify(`${t('saved').en}. ${e instanceof ApiError ? e.detail : 'Photo upload failed'}`);
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

  const photoSrc = preview ?? (editing?.photo ? mediaUrl(editing.photo) : null);
  return (
    <Modal open={open} onClose={onClose} title={<Bi k={editing ? 'editDish' : 'addDish'} />}>
      <div className="space-y-6 pb-2">
        <section>
          <p className="mb-2 text-lg font-bold"><Bi k="dishName" /></p>
          <div className="mb-2.5 flex flex-wrap gap-2" aria-label={t('dishNameHint').en}>
            {SUGGESTIONS.map((s) => (
              <button key={s.en} type="button" className={cx('min-h-11 rounded-full border-2 px-3.5 text-base font-semibold', name === s.en ? 'border-turmeric-500 bg-turmeric-100' : 'border-cream-300 bg-white')}
                onClick={() => setName(s.en)}>{s.en} <span className="font-devanagari text-sm opacity-70" lang="hi">{s.hi}</span></button>
            ))}
          </div>
          <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Dal, Roti, Sabzi…" aria-label={t('dishName').en} />
        </section>

        <section>
          <p className="mb-2 text-lg font-bold"><Bi k="price" /></p>
          <BigStepper value={price} onChange={setPrice} min={5} max={5000} step={price < 50 ? 5 : 10} format={(n) => `₹${n}`} />
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PRICES.map((p) => <button key={p} type="button" className={chip(price === p)} onClick={() => setPrice(p)}>₹{p}</button>)}
          </div>
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
          <p className="mb-2 text-lg font-bold"><Bi k="portions" /></p>
          <BigStepper value={portions} onChange={setPortions} min={Math.max(sold, editing ? 0 : 1)} max={500} format={(n) => String(n)} />
          {editing && sold > 0 && <p className="mt-1.5 text-center text-sm text-ink-muted">{sold} <Bi k="soldCount" /></p>}
        </section>

        <section>
          <p className="mb-2 text-lg font-bold"><Bi k="lastOrderTime" /></p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => <button key={p.id} type="button" className={chip(preset === p.id)} onClick={() => setPreset(p.id)}><Bi k={p.k} /></button>)}
          </div>
        </section>

        <section>
          <p className="mb-2 text-lg font-bold"><Bi k="addPhoto" /> <span className="text-sm font-normal text-ink-muted">(<Bi k="optional" only="en" />)</span></p>
          <div className="flex items-center gap-3">
            {photoSrc ? <img src={photoSrc} alt="" className="h-20 w-20 rounded-2xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-turmeric-50 text-3xl" aria-hidden>🍛</div>}
            <div className="flex flex-col gap-1">
              <Button variant="outline" onClick={() => camRef.current?.click()}><Icon.Camera className="h-5 w-5" /> <Bi k="takePhoto" /></Button>
              <button type="button" className="min-h-10 text-sm font-semibold text-leaf-700 underline" onClick={() => galRef.current?.click()}><Bi k="fromGallery" /></button>
            </div>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </section>

        {!editing && days.length > 0 && (
          <section>
            <p className="mb-2 text-lg font-bold"><Bi k="repeatOn" /></p>
            <div className="flex flex-wrap gap-2">
              {days.map((d) => {
                const on = repeat.includes(d);
                return (
                  <button key={d} type="button" role="checkbox" aria-checked={on} className={chip(on)} onClick={() => setRepeat((r) => (on ? r.filter((x) => x !== d) : [...r, d]))}>
                    <span aria-hidden>{on ? '☑' : '☐'}</span> {weekday(d)} {dayNum(d)} <span className="text-sm opacity-75">{monthShort(d)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {error && <p className="rounded-xl bg-terracotta-50 p-3 font-medium text-terracotta-700" role="alert">{error}</p>}
        <Button size="xl" block loading={busy} disabled={!canSave} onClick={() => void save()}>
          <Bi k="save" />{!editing && repeat.length > 0 ? ` (${repeat.length + 1})` : ''}
        </Button>

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
