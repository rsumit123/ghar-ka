import { ApiError, Badge, Bi, Button, Card, Page, TiffinIllustration, api, cx, type DictKey } from '@gharka/ui';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { SiteHeader } from '../../components/SiteHeader';
import { DocCards } from '../../components/vendor/DocCards';
import { KitchenPhotos } from '../../components/vendor/KitchenPhotos';
import type { FssaiStatus, VendorMe } from '../../lib/types';
import { useVendor } from '../../lib/useVendor';

const FSSAI_STEPS: { key: DictKey; reached: FssaiStatus[] }[] = [
  { key: 'fssaiDocs', reached: ['docs_pending', 'docs_received', 'application_filed', 'registration_issued'] },
  { key: 'fssaiReceived', reached: ['docs_received', 'application_filed', 'registration_issued'] },
  { key: 'fssaiFiled', reached: ['application_filed', 'registration_issued'] },
  { key: 'fssaiIssued', reached: ['registration_issued'] },
];

function FssaiTracker({ me }: { me: VendorMe }) {
  const status = me.fssai?.status ?? 'docs_pending';
  // "Documents sent" is only ticked when all three are really uploaded.
  const sent = me.docs_complete || status !== 'docs_pending';
  const reachedCount = FSSAI_STEPS.filter((s, i) => (i === 0 ? sent : s.reached.includes(status))).length;
  return (
    <Card>
      <h2 className="mb-4 font-serif text-xl font-bold"><Bi k="fssaiProgress" /></h2>
      <ol>
        {FSSAI_STEPS.map((s, i) => {
          const done = i < reachedCount;
          const current = i === reachedCount;
          return (
            <li key={s.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-bold',
                  done ? 'border-leaf-500 bg-leaf-500 text-white' : current ? 'border-turmeric-500 bg-turmeric-100' : 'border-cream-300 bg-white text-ink-muted')}>
                  {done ? '✓' : i + 1}
                </span>
                {i < FSSAI_STEPS.length - 1 && <span className={cx('my-1 w-1 flex-1 rounded-full', done ? 'bg-leaf-300' : 'bg-cream-200')} style={{ minHeight: 18 }} />}
              </div>
              <p className={cx('pt-1.5 text-lg', done ? 'font-semibold' : current ? 'font-bold text-turmeric-900' : 'text-ink-muted')}><Bi k={s.key} /></p>
            </li>
          );
        })}
      </ol>
      {me.fssai?.registration_number && <p className="mt-3 text-sm text-ink-soft">No. {me.fssai.registration_number}</p>}
    </Card>
  );
}

export default function Status() {
  const { me, reload } = useVendor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me.onboarded) return <Navigate to="/onboarding" replace />;
  if (me.is_live) return <Navigate to="/" replace />;

  const review = me.review_status ?? 'pending';
  const headline: Record<string, { key: DictKey; tone: 'turmeric' | 'leaf' | 'terracotta' }> = {
    pending: { key: 'reviewPending', tone: 'turmeric' },
    approved: { key: 'reviewApproved', tone: 'leaf' },
    rejected: { key: 'reviewRejected', tone: 'terracotta' },
    suspended: { key: 'reviewSuspended', tone: 'terracotta' },
  };
  const h = headline[review];
  const kitchenCount = me.media.filter((m) => m.kind === 'kitchen').length;

  async function resubmit() {
    setBusy(true);
    setError(null);
    try { await api.post('/vendor/resubmit'); await reload(); } catch (e) { setError(e instanceof ApiError ? e.detail : 'Error'); } finally { setBusy(false); }
  }

  return (
    <Page header={<SiteHeader />} narrow title={<Bi k="statusTitle" />}>
      <div className="space-y-4">
        <Card className={cx('flex items-center gap-4', review === 'rejected' && 'border-terracotta-300')}>
          <TiffinIllustration className="h-24 w-20 shrink-0" />
          <div>
            <Badge tone={h.tone} className="mb-1"><Bi k={h.key} only="en" /></Badge>
            <p className="font-serif text-xl font-bold leading-snug"><Bi k={h.key} /></p>
          </div>
        </Card>

        {me.review_note && (review === 'rejected' || review === 'suspended') && (
          <Card className="border-terracotta-300 bg-terracotta-50">
            <p className="font-hand text-xl text-terracotta-700"><Bi k="noteFromTeam" only="en" /></p>
            <p className="mt-1 text-lg">{me.review_note}</p>
          </Card>
        )}

        {review === 'rejected' && (
          <>
            {error && <p className="text-terracotta-600" role="alert">{error}</p>}
            <Button size="xl" block loading={busy} onClick={() => void resubmit()}><Bi k="fixResubmit" /></Button>
          </>
        )}

        <FssaiTracker me={me} />

        {(!me.docs_complete || kitchenCount === 0 || review === 'rejected') && (
          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold"><Bi k={me.docs_complete && kitchenCount > 0 ? 'addMore' : 'stillNeeded'} /></h2>
            {kitchenCount === 0 && <><p className="font-semibold"><Bi k="stepPhotos" /></p><KitchenPhotos me={me} reload={reload} /></>}
            {(!me.docs_complete || review === 'rejected') && <DocCards me={me} reload={reload} />}
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Link to="/delivery"><Button variant="outline" block><Bi k="delivery" /></Button></Link>
          <Link to="/profile"><Button variant="outline" block><Bi k="profile" /></Button></Link>
        </div>
      </div>
    </Page>
  );
}
