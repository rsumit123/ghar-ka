import { ApiError, Badge, Button, Card, EmptyState, Modal, RequireRole, Spinner, TiffinIllustration, api, cx, type BadgeTone } from '@gharka/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DietMark } from '../components/DietMark';
import { Shell } from '../components/Shell';
import { cutoffText, dateLong, dateMedium, dayNum, daysText, isoDate, monthShort, rupees, slotLabel, weekdayShort } from '../lib/format';
import type { Meal, SubStatus, Subscription } from '../lib/types';

const STATUS_TEXT: Record<SubStatus, string> = { active: 'Active', paused: 'Paused', cancelled: 'Cancelled', finished: 'Finished' };
const STATUS_TONE: Record<SubStatus, BadgeTone> = { active: 'leaf', paused: 'turmeric', cancelled: 'terracotta', finished: 'neutral' };

export default function Tiffins() {
  return <RequireRole roles={['customer']} loginTo="/login"><TiffinList /></RequireRole>;
}

function TiffinList() {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();

  const load = useCallback(() => {
    api.get<Subscription[]>('/subscriptions').then(setSubs).catch((e) => setError(e instanceof ApiError ? e.detail : 'Could not load your tiffins'));
  }, []);
  useEffect(load, [load]);

  const replace = (s: Subscription) => setSubs((all) => all && all.map((x) => (x.id === s.id ? s : x)));
  const running = subs?.filter((s) => s.status === 'active' || s.status === 'paused') ?? [];
  const past = subs?.filter((s) => s.status === 'cancelled' || s.status === 'finished') ?? [];

  return (
    <Shell title="My tiffins" subtitle="Tap a day to skip it. Tap again to bring it back.">
      {params.get('new') === '1' && (
        <div className="mb-5 rounded-2xl border border-leaf-200 bg-leaf-50 px-4 py-3">
          <p className="font-hand text-2xl text-leaf-700">you&apos;re subscribed!</p>
          <p className="text-ink-soft">Your first tiffin is on its way. The cook sees your subscription right away.</p>
        </div>
      )}
      {error ? <p className="text-terracotta-600" role="alert">{error}</p>
        : subs === null ? <div className="mt-12 flex justify-center"><Spinner className="h-8 w-8" /></div>
        : subs.length === 0 ? (
          <Card><EmptyState illustration={<TiffinIllustration className="h-36 w-28" />} title="No tiffins yet"
            hint="Pick a weekly plan from a cook near you and your lunch or dinner sorts itself out."
            action={<Link to="/"><Button>Find a cook</Button></Link>} /></Card>
        ) : (
          <>
            {running.length === 0 && <p className="mb-4 text-ink-soft">No running subscriptions right now.</p>}
            <ul className="space-y-4">{running.map((s) => <li key={s.id}><SubCard sub={s} onChange={replace} /></li>)}</ul>
            {past.length > 0 && (
              <details className="mt-8">
                <summary className="cursor-pointer font-serif text-lg font-bold">Past tiffins ({past.length})</summary>
                <ul className="mt-3 space-y-3">{past.map((s) => <li key={s.id}><SubCard sub={s} onChange={replace} /></li>)}</ul>
              </details>
            )}
          </>
        )}
    </Shell>
  );
}

function SubCard({ sub, onChange }: { sub: Subscription; onChange: (s: Subscription) => void }) {
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'pause' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const live = sub.status === 'active' || sub.status === 'paused';

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError(null);
    try { return await fn(); } catch (e) { setError(e instanceof ApiError ? e.detail : 'Something went wrong'); return undefined; }
  }

  async function toggle(m: Meal) {
    if (m.state !== 'open' && m.state !== 'skipped') return;
    setBusyDay(m.date);
    const res = await run(() => m.state === 'open'
      ? api.post<Subscription>(`/subscriptions/${sub.id}/skip`, { date: m.date })
      : api.del<Subscription>(`/subscriptions/${sub.id}/skip/${m.date}`));
    if (res) onChange(res);
    setBusyDay(null);
  }

  async function act(path: string, body?: unknown) {
    setBusy(true);
    const res = await run(() => api.post<Subscription>(`/subscriptions/${sub.id}/${path}`, body));
    setBusy(false);
    if (res) { onChange(res); setDialog(null); }
  }

  return (
    <Card className={cx(!live && 'opacity-80')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-bold leading-snug"><DietMark diet={sub.plan.diet} className="mr-1.5 align-[-2px]" />{sub.plan.name}</h2>
          <p className="text-ink-soft">by <Link to={`/cook/${sub.vendor.id}`} className="font-semibold underline decoration-turmeric-400">{sub.vendor.display_name}</Link></p>
          <p className="text-sm text-ink-muted">{slotLabel(sub.plan.slot)} · {daysText(sub.plan.days_of_week)} · {rupees(sub.plan.price_per_week)}/week</p>
        </div>
        <Badge tone={STATUS_TONE[sub.status]}>{STATUS_TEXT[sub.status]}</Badge>
      </div>

      {sub.status === 'paused' && (
        <p className="mt-2 rounded-xl bg-turmeric-50 px-3 py-2 text-sm font-medium text-turmeric-900">
          Paused {sub.paused_until ? `until ${dateLong(sub.paused_until)}` : 'until you resume'}
        </p>
      )}
      {live && sub.next_meal_date && sub.status === 'active' && (
        <p className="mt-2 font-hand text-2xl leading-6 text-terracotta-600">next tiffin: {dateLong(sub.next_meal_date)}</p>
      )}
      {!live && <p className="mt-2 text-sm text-ink-muted">{dateMedium(sub.start_date)} to {dateMedium(sub.end_date)}</p>}

      {live && sub.upcoming.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-ink-soft">Next 2 weeks</p>
          <ul className="flex flex-wrap gap-2">
            {sub.upcoming.map((m) => <li key={m.date}><DayChip meal={m} busy={busyDay === m.date} onTap={() => void toggle(m)} /></li>)}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            🔒 Locked once the order-by time passes. {sub.upcoming.find((m) => m.state === 'open') && <>Next one closes {cutoffText(sub.upcoming.find((m) => m.state === 'open')!.cutoff_at, sub.upcoming.find((m) => m.state === 'open')!.date)}.</>}
          </p>
        </div>
      )}
      {live && sub.upcoming.length === 0 && <p className="mt-3 text-sm text-ink-muted">No more meals in the next 2 weeks.</p>}

      {error && <p className="mt-3 rounded-xl bg-terracotta-50 p-3 text-sm font-medium text-terracotta-700" role="alert">{error}</p>}

      {live && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sub.status === 'active'
            ? <Button variant="outline" size="sm" onClick={() => setDialog('pause')}>Pause</Button>
            : <Button variant="secondary" size="sm" loading={busy} onClick={() => void act('resume')}>Resume</Button>}
          <Button variant="ghost" size="sm" className="text-terracotta-700" onClick={() => setDialog('cancel')}>Cancel subscription</Button>
        </div>
      )}

      <PauseDialog open={dialog === 'pause'} busy={busy} onClose={() => setDialog(null)} onPause={(until) => void act('pause', until ? { until } : {})} />
      <Modal open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel this subscription?">
        <p className="text-ink-soft">Meals whose order-by time has already passed will still be made. Everything after that is cancelled.</p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="danger" block loading={busy} onClick={() => void act('cancel')}>Yes, cancel subscription</Button>
          <Button variant="outline" block onClick={() => setDialog(null)}>No, keep it</Button>
        </div>
      </Modal>
    </Card>
  );
}

function DayChip({ meal, busy, onTap }: { meal: Meal; busy: boolean; onTap: () => void }) {
  const { state, date } = meal;
  const tappable = state === 'open' || state === 'skipped';
  const label = `${weekdayShort(date)} ${dayNum(date)} ${monthShort(date)}: ${
    state === 'open' ? 'on, tap to skip' : state === 'skipped' ? 'skipped, tap to bring back' : state === 'paused' ? 'paused' : 'locked'}`;
  return (
    <button type="button" onClick={onTap} disabled={!tappable || busy} aria-label={label} aria-pressed={state === 'skipped'}
      className={cx(
        'relative flex min-h-14 w-[3.6rem] flex-col items-center justify-center rounded-2xl border-2 text-center transition active:scale-95',
        state === 'open' && 'border-leaf-300 bg-leaf-50 text-ink',
        state === 'skipped' && 'border-terracotta-300 bg-terracotta-50 text-terracotta-700',
        (state === 'locked' || state === 'paused') && 'border-cream-300 bg-cream-100 text-ink-muted',
        busy && 'opacity-50',
      )}>
      <span className={cx('text-xs font-semibold leading-4', state === 'skipped' && 'line-through')}>{weekdayShort(date)}</span>
      <span className={cx('text-lg font-bold leading-5 tabular-nums', state === 'skipped' && 'line-through')}>{dayNum(date)}</span>
      {state === 'locked' && <span className="absolute -right-1 -top-1 text-xs" aria-hidden>🔒</span>}
    </button>
  );
}

function PauseDialog({ open, busy, onClose, onPause }: { open: boolean; busy: boolean; onClose: () => void; onPause: (until: string | null) => void }) {
  const [until, setUntil] = useState('');
  const min = isoDate(1);
  return (
    <Modal open={open} onClose={onClose} title="Pause your tiffin">
      <p className="text-ink-soft">No meals will be made while paused. Meals already past their order-by time are still made.</p>
      <label htmlFor="pause-until" className="mt-4 block text-sm font-semibold text-ink-soft">Resume on (optional)</label>
      <input id="pause-until" type="date" min={min} value={until} onChange={(e) => setUntil(e.target.value)}
        className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-cream-300 bg-white px-4 text-base focus:border-turmeric-500" />
      <div className="mt-4 flex flex-col gap-2">
        <Button block loading={busy} disabled={!until || until < min} onClick={() => onPause(until)}>
          {until && until >= min ? `Pause until ${dateLong(until)}` : 'Pick a resume date'}
        </Button>
        <Button variant="outline" block loading={busy} onClick={() => onPause(null)}>Pause until I resume</Button>
        <Button variant="ghost" block onClick={onClose}>Never mind</Button>
      </div>
    </Modal>
  );
}
