import { api, ApiError, Badge, Bi, brand, Button, Card, cx, DietMark, EmptyState, Icon, Page, Spinner, t, TiffinIllustration } from '@gharka/ui';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { PlanSheet, WEEKDAY_KEYS } from '../../components/plans/PlanSheet';
import { SiteHeader } from '../../components/SiteHeader';
import { VendorTabs } from '../../components/vendor/VendorTabs';
import { dateLong, rupees } from '../../lib/dates';
import type { Plan, Subscriber, SubscribersResponse } from '../../lib/types';
import { useVendor } from '../../lib/useVendor';

export default function Plans() {
  const { me } = useVendor();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [subs, setSubs] = useState<SubscribersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ editing: Plan | null } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api.get<Plan[]>('/vendor/plans'), api.get<SubscribersResponse>('/vendor/subscribers')]);
      setPlans(p);
      setSubs(s);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not load your plans');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!me.onboarded) return <Navigate to="/onboarding" replace />;
  const counts = new Map((subs?.plan_counts ?? []).map((c) => [c.plan_id, c]));

  return (
    <Page header={<SiteHeader />} narrow title={<Bi k="plans" />}>
      <VendorTabs />
      {error ? <p className="mt-6 text-terracotta-600" role="alert">{error}</p>
        : plans === null ? <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        : (
          <>
            <Button size="xl" block onClick={() => setSheet({ editing: null })}><span aria-hidden>＋</span> <Bi k="addPlan" /></Button>
            {plans.length === 0 ? (
              <Card className="mt-4"><EmptyState illustration={<TiffinIllustration className="h-32 w-24" />} title={<Bi k="noPlans" />} hint={<Bi k="noPlansHint" />} /></Card>
            ) : (
              <ul className="mt-4 space-y-4">
                {plans.map((p) => {
                  const c = counts.get(p.id);
                  const list = (subs?.subscribers ?? []).filter((s) => s.plan.id === p.id);
                  return (
                    <li key={p.id}>
                      <Card className={cx(!p.active && 'opacity-80')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="text-xl font-bold leading-snug"><DietMark diet={p.diet} className="mr-1.5 align-[-2px]" />{p.name}</h2>
                            <p className="text-ink-soft">{p.slot === 'lunch' ? <Icon.Sun className="inline h-4 w-4" /> : <Icon.Moon className="inline h-4 w-4" />} <Bi k={p.slot} /> · {p.days_of_week.map((d) => t(WEEKDAY_KEYS[d]).en).join(' ')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold">{rupees(p.price_per_week)}</p>
                            <p className="text-xs text-ink-muted"><Bi k="perWeek" /></p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge tone={p.active ? 'leaf' : 'neutral'} className="px-3 py-1 text-sm">{p.active ? <Bi k="planActive" /> : <Bi k="inactivePlan" />}</Badge>
                          <Badge tone="turmeric" className="px-3 py-1 text-sm">{p.subscriber_count} <Bi k="subscribers" /></Badge>
                        </div>
                        {c && c.subscribers > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                            <div className="rounded-2xl bg-turmeric-50 p-2.5"><p className="font-serif text-3xl font-bold">{c.today}</p><p className="text-sm text-ink-soft"><Bi k="tiffinToday" /></p></div>
                            <div className="rounded-2xl bg-cream-100 p-2.5"><p className="font-serif text-3xl font-bold">{c.tomorrow}</p><p className="text-sm text-ink-soft"><Bi k="tiffinTomorrow" /></p></div>
                          </div>
                        )}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button variant="outline" onClick={() => setSheet({ editing: p })}><span className="flex flex-col leading-tight"><Icon.Edit className="mb-0.5 inline h-4 w-4" /> <Bi k="editPlan" /></span></Button>
                          <Button variant="outline" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}><span className="flex flex-col leading-tight"><Icon.People className="mb-0.5 inline h-4 w-4" /> <Bi k="subscribers" /></span></Button>
                        </div>
                        {open === p.id && (
                          <div className="mt-3 border-t border-dashed border-cream-300 pt-3">
                            {list.length === 0 ? <p className="text-ink-muted"><Bi k="noSubscribers" /></p>
                              : <ul className="space-y-3">{list.map((s) => <SubscriberRow key={s.id} s={s} />)}</ul>}
                          </div>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
            {!me.is_live && <p className="mt-4 text-sm text-ink-muted"><Bi k="menuNotLiveNote" /></p>}
          </>
        )}
      <PlanSheet open={!!sheet} editing={sheet?.editing ?? null} onClose={() => setSheet(null)} onSaved={load} />
    </Page>
  );
}

function SubscriberRow({ s }: { s: Subscriber }) {
  const wa = `https://wa.me/${s.customer.whatsapp_digits}?text=${encodeURIComponent(`Hi ${s.customer.name}, this is ${brand.name} about your tiffin.`)}`;
  return (
    <li className="rounded-2xl bg-cream-100/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-lg font-bold">{s.customer.name || s.customer.phone}</p>
        {s.status === 'paused' && <Badge tone="turmeric"><Bi k="pausedShort" /></Badge>}
      </div>
      <p className="text-sm text-ink-soft">{s.fulfilment === 'delivery' ? <span className="inline-flex items-center gap-1.5"><Icon.Bike className="h-4 w-4 shrink-0" /> {s.delivery_address}</span> : <span className="inline-flex items-center gap-1.5"><Icon.Walk className="h-4 w-4" /> <Bi k="pickup" /></span>}</p>
      <p className="mt-0.5 text-sm">{s.next_meal_date ? <><Bi k="nextTiffin" />: <strong>{dateLong(s.next_meal_date)}</strong></> : '—'}</p>
      {s.skips_upcoming.length > 0 && <p className="text-sm text-terracotta-700"><Bi k="skippingDays" />: {s.skips_upcoming.map(dateLong).join(', ')}</p>}
      {s.customer.phone && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <a href={`tel:${s.customer.phone}`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-ink/20 bg-white font-bold"><Icon.Phone className="h-4 w-4" /><Bi k="call" /></a>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-leaf-500 bg-white font-bold text-leaf-700"><Icon.Chat className="h-4 w-4" /><Bi k="whatsapp" /></a>
        </div>
      )}
    </li>
  );
}
