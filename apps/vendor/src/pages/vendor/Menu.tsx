import { api, ApiError, Bi, Button, Card, cx, DietMark, EmptyState, Icon, mediaUrl, Page, Spinner, t } from '@gharka/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { SiteHeader } from '../../components/SiteHeader';
import { AddDishSheet } from '../../components/menu/AddDishSheet';
import { DateStrip } from '../../components/vendor/DateStrip';
import { SlotTabs } from '../../components/vendor/SlotTabs';
import { VendorTabs } from '../../components/vendor/VendorTabs';
import { cutoffText, dateLong, isoDate, rupees } from '../../lib/dates';
import type { Offering, Slot } from '../../lib/types';
import { useVendor } from '../../lib/useVendor';

export default function Menu() {
  const { me } = useVendor();
  const [date, setDate] = useState(isoDate(0));
  const [slot, setSlot] = useState<Slot>('lunch');
  const [all, setAll] = useState<Offering[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ editing: Offering | null } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copying, setCopying] = useState(false);

  const load = useCallback(async () => {
    try {
      setAll(await api.get<Offering[]>(`/vendor/offerings?date_from=${isoDate(0)}&date_to=${isoDate(6)}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not load your menu');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of all ?? []) c[o.date] = (c[o.date] ?? 0) + 1;
    return c;
  }, [all]);
  const slotCounts = useMemo(() => {
    const c: Partial<Record<Slot, number>> = {};
    for (const o of all ?? []) if (o.date === date) c[o.slot] = (c[o.slot] ?? 0) + 1;
    return c;
  }, [all, date]);
  const dishes = (all ?? []).filter((o) => o.date === date && o.slot === slot);

  async function copyYesterday() {
    setCopying(true);
    setNotice(null);
    try {
      const prev = isoDate(-1, new Date(`${date}T12:00:00Z`));
      const r = await api.post<{ created: Offering[]; skipped: number }>('/vendor/offerings/copy', { from_date: prev, to_dates: [date] });
      await load();
      setNotice(r.created.length ? { ok: true, text: `${t('copiedDishes').en}: ${r.created.length}` } : { ok: false, text: t('nothingToCopy').en });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ApiError ? (e.status === 404 ? t('nothingToCopy').en : e.detail) : 'Error' });
    } finally {
      setCopying(false);
    }
  }

  if (!me.onboarded) return <Navigate to="/onboarding" replace />;
  return (
    <Page header={<SiteHeader />} narrow title={<Bi k="menu" />}>
      <VendorTabs />
      {!me.is_live && <p className="mb-4 rounded-2xl bg-turmeric-50 p-3 text-sm text-turmeric-900 ring-1 ring-turmeric-200"><Bi k="menuNotLiveNote" /></p>}
      <DateStrip value={date} onChange={setDate} counts={counts} />
      <div className="mt-4"><SlotTabs value={slot} onChange={setSlot} counts={slotCounts} /></div>

      <div className="mt-5 space-y-3">
        <Button size="xl" block onClick={() => setSheet({ editing: null })}><span aria-hidden>＋</span> <Bi k="addDish" /></Button>
        <Button variant="outline" block loading={copying} onClick={() => void copyYesterday()}><Icon.Copy className="h-5 w-5" /> <Bi k="copyYesterday" /></Button>
        {notice && <p className={cx('text-center font-semibold', notice.ok ? 'text-leaf-700' : 'text-terracotta-600')} role="status">{notice.text}</p>}
      </div>

      <h2 className="mb-2 mt-6 font-serif text-xl font-bold">{dateLong(date)} · <Bi k={slot} /></h2>
      {error ? <p className="text-terracotta-600" role="alert">{error}</p>
        : all === null ? <div className="flex justify-center py-10"><Spinner className="h-8 w-8" /></div>
        : dishes.length === 0 ? <Card><EmptyState title={<Bi k="noDishesYet" />} hint={<Bi k="tapAddDish" />} /></Card>
        : (
          <ul className="space-y-3">
            {dishes.map((o) => <DishCard key={o.id} o={o} onEdit={() => setSheet({ editing: o })} />)}
          </ul>
        )}

      <AddDishSheet open={!!sheet} onClose={() => setSheet(null)} date={date} slot={slot} editing={sheet?.editing ?? null}
        onSaved={load} notify={(text) => setNotice({ ok: false, text })} />
    </Page>
  );
}

function DishCard({ o, onEdit }: { o: Offering; onEdit: () => void }) {
  const pct = o.portions_total ? Math.min(100, Math.round((o.portions_sold / o.portions_total) * 100)) : 100;
  const soldOut = o.portions_left === 0;
  return (
    <li className={cx('rounded-2xl border border-cream-200 bg-white/90 p-3.5 shadow-soft', !o.is_open && 'bg-cream-100/80')}>
      <div className="flex gap-3">
        {o.photo ? <img src={mediaUrl(o.photo)} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
          : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-turmeric-50 text-2xl" aria-hidden>🍛</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <DietMark diet={o.diet} className="h-5 w-5" />
            <h3 className="truncate font-serif text-xl font-bold">{o.dish_name}</h3>
          </div>
          <p className="text-lg font-bold">{rupees(o.price)}</p>
        </div>
        <Button variant="outline" size="md" onClick={onEdit} aria-label={`${t('editDish').en}: ${o.dish_name}`}>✏️</Button>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-base font-semibold">
          <span>{o.portions_sold} <Bi k="of" only="en" /> {o.portions_total} <Bi k="soldCount" /></span>
          {o.is_open ? <span className="font-hand text-2xl leading-5 text-terracotta-600"><Bi k="orderBy" only="en" /> {cutoffText(o.cutoff_at, o.date)}</span>
            : <span className="rounded-full bg-ink px-3 py-0.5 text-sm text-cream"><Bi k={soldOut ? 'soldOut' : 'closed'} /></span>}
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-cream-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={cx('h-full rounded-full', soldOut ? 'bg-terracotta-500' : 'bg-leaf-500')} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </li>
  );
}
