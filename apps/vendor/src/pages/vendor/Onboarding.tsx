import { api, ApiError, Bi, Button, Card, cx, type DictKey, Icon, Input, Page, t, TiffinIllustration } from '@gharka/ui';
import { LocationPicker } from '@gharka/ui/maps';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DocCards } from '../../components/vendor/DocCards';
import { KitchenPhotos } from '../../components/vendor/KitchenPhotos';
import { Steps } from '../../components/vendor/Steps';
import { SiteHeader } from '../../components/SiteHeader';
import type { Locality, VendorMe } from '../../lib/types';
import { useVendor } from '../../lib/useVendor';

const EXAMPLES: DictKey[] = ['cookEx1', 'cookEx2', 'cookEx3', 'cookEx4', 'cookEx5', 'cookEx6'];

function AboutStep({ onDone }: { onDone: () => void }) {
  const { setMe } = useVendor();
  const [localities, setLocalities] = useState<Locality[] | null>(null);
  const [name, setName] = useState('');
  const [localityId, setLocalityId] = useState<number | null>(null);
  const [manualPin, setManualPin] = useState(false);
  const [pincode, setPincode] = useState('');
  const [story, setStory] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.get<Locality[]>('/localities').then(setLocalities).catch(() => setLocalities([])); }, []);
  const chosen = localities?.find((l) => l.id === localityId);
  const hasArea = manualPin ? /^\d{4,10}$/.test(pincode.trim()) : localityId !== null;
  const canNext = name.trim().length >= 2 && hasArea;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const me = await api.post<VendorMe>('/vendor/onboard', {
        display_name: name.trim(), story: story.trim(),
        ...(manualPin ? { pincode: pincode.trim() } : { locality_id: localityId }),
        ...(pos ?? {}),
      });
      setMe(me);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Input size="lg" label={<Bi k="yourName" />} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-soft"><Bi k="yourArea" /></h2>
        {!manualPin ? (
          <div className="space-y-2">
            {localities === null && <p className="text-ink-muted"><Bi k="loading" /></p>}
            {localities?.map((l) => (
              <button
                key={l.id} type="button" onClick={() => setLocalityId(l.id)} aria-pressed={localityId === l.id}
                className={cx('flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 text-left',
                  localityId === l.id ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-white')}
              >
                <span className={cx('flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm', localityId === l.id ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-cream-300')}>
                  {localityId === l.id && '✓'}
                </span>
                <span className="flex-1"><span className="block text-lg font-bold">{l.name}</span><span className="text-sm text-ink-muted">{l.city} · {l.pincode}</span></span>
              </button>
            ))}
            <button type="button" className="min-h-12 px-2 font-semibold text-leaf-700 underline" onClick={() => { setManualPin(true); setLocalityId(null); }}>
              <Bi k="areaNotListed" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input size="lg" label={<Bi k="pincode" />} inputMode="numeric" maxLength={10} value={pincode} onChange={(e) => setPincode(e.target.value)} />
            {(localities?.length ?? 0) > 0 && (
              <button type="button" className="min-h-12 px-2 font-semibold text-leaf-700 underline" onClick={() => setManualPin(false)}>← <Bi k="yourArea" /></button>
            )}
          </div>
        )}
      </section>

      <section>
        <Input size="lg" label={<Bi k="whatYouCook" />} hint={<Bi k="tapExample" />} value={story} maxLength={280} onChange={(e) => setStory(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((k) => (
            <button key={k} type="button" onClick={() => setStory(t(k).en)}
              className={cx('min-h-11 rounded-full border-2 px-4 text-sm font-semibold', story === t(k).en ? 'border-turmeric-500 bg-turmeric-100' : 'border-cream-300 bg-white')}>
              <Bi k={k} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink-soft"><Bi k="kitchenLocation" /></h2>
          <span className="font-hand text-lg text-ink-muted"><Bi k="optional" only="en" /></span>
        </div>
        {!mapOpen ? (
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setMapOpen(true)}>
              <Icon.Pin className="mr-1 inline h-5 w-5 align-text-bottom" /> <Bi k={pos ? 'locationSet' : 'setOnMap'} />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <LocationPicker bilingual value={pos} onChange={setPos} fallbackCenter={chosen ? { lat: chosen.lat, lng: chosen.lng } : undefined} height={280} />
            <Button variant="ghost" onClick={() => { setMapOpen(false); setPos(null); }}><Bi k="skip" /></Button>
          </div>
        )}
      </section>

      {error && <p className="font-medium text-terracotta-600" role="alert">{error}</p>}
      <Button size="xl" block disabled={!canNext} loading={busy} onClick={() => void submit()}><Bi k="next" /> →</Button>
    </div>
  );
}

function PhotosStep({ onNext }: { onNext: () => void }) {
  const { me, reload } = useVendor();
  return (
    <div className="space-y-5">
      <p className="text-ink-soft"><Bi k="kitchenPhotosHint" /></p>
      <KitchenPhotos me={me} reload={reload} />
      <Button size="xl" block onClick={onNext} disabled={!me.media.some((m) => m.kind === 'kitchen')}><Bi k="next" /> →</Button>
      <Button variant="ghost" block onClick={onNext}><Bi k="later" /></Button>
    </div>
  );
}

function DocsStep({ onNext }: { onNext: () => void }) {
  const { me, reload } = useVendor();
  return (
    <div className="space-y-4">
      <p className="text-ink-soft"><Icon.Lock className="mr-1 inline h-5 w-5 align-text-bottom" /> <Bi k="docsPrivate" /></p>
      <DocCards me={me} reload={reload} />
      {me.docs_complete
        ? <Button size="xl" block onClick={onNext}><Bi k="finish" /> ✓</Button>
        : <Button variant="outline" size="lg" block onClick={onNext}><Bi k="later" /></Button>}
    </div>
  );
}

function DoneStep() {
  return (
    <Card className="flex flex-col items-center py-8 text-center">
      <TiffinIllustration />
      <h2 className="mt-4 font-serif text-3xl font-bold"><Bi k="doneTitle" /></h2>
      <p className="mt-2 max-w-xs text-lg text-ink-soft"><Bi k="doneMsg" /></p>
      <Link to="/status" className="mt-6 w-full"><Button size="xl" block><Bi k="viewStatus" /></Button></Link>
    </Card>
  );
}

export default function Onboarding() {
  const { me } = useVendor();
  const navigate = useNavigate();
  const start = !me.onboarded ? 1 : me.media.some((m) => m.kind === 'kitchen') ? (me.docs_complete ? 4 : 3) : 2;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(start as 1 | 2 | 3 | 4);

  useEffect(() => { if (me.onboarded && me.is_live) navigate('/', { replace: true }); }, [me.onboarded, me.is_live, navigate]);

  return (
    <Page header={<SiteHeader />} narrow>
      <Steps current={step} />
      {step === 1 && <AboutStep onDone={() => setStep(2)} />}
      {step === 2 && <PhotosStep onNext={() => setStep(3)} />}
      {step === 3 && <DocsStep onNext={() => setStep(4)} />}
      {step === 4 && <DoneStep />}
    </Page>
  );
}
