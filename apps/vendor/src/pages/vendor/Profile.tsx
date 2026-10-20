import { ApiError, Bi, Button, Card, Input, Page, api, mediaUrl, useAuth } from '@gharka/ui';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { SiteHeader } from '../../components/SiteHeader';
import { UploadTile } from '../../components/vendor/UploadTile';
import type { VendorMe } from '../../lib/types';
import { useVendor } from '../../lib/useVendor';

export default function Profile() {
  const { me, setMe, reload } = useVendor();
  const { logout } = useAuth();
  const [name, setName] = useState(me.display_name ?? '');
  const [story, setStory] = useState(me.story ?? '');
  const [wa, setWa] = useState(me.whatsapp_phone ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!me.onboarded) return <Navigate to="/onboarding" replace />;
  const photo = me.media.find((m) => m.kind === 'profile');

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      setMe(await api.put<VendorMe>('/vendor/profile', { display_name: name.trim(), story: story.trim(), whatsapp_phone: wa.trim() || null }));
      setMsg({ ok: true, text: 'saved' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.detail : 'Error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page header={<SiteHeader />} narrow title={<Bi k="profile" />}>
      <div className="space-y-5">
        <Card className="flex items-center gap-4">
          {photo ? (
            <img src={mediaUrl(photo.path)} alt="" className="h-24 w-24 shrink-0 rounded-full border-4 border-turmeric-200 object-cover" />
          ) : (
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-turmeric-100 text-4xl" aria-hidden>👩‍🍳</span>
          )}
          <UploadTile kind="profile" compact label={<Bi k="yourPhoto" />} onDone={reload} className="flex-1" />
        </Card>
        <Input size="lg" label={<Bi k="yourName" />} value={name} onChange={(e) => setName(e.target.value)} />
        <Input size="lg" label={<Bi k="aboutCooking" />} value={story} maxLength={280} onChange={(e) => setStory(e.target.value)} />
        <Input size="lg" label={<Bi k="whatsappNumber" />} type="tel" inputMode="numeric" value={wa} onChange={(e) => setWa(e.target.value)} />
        {msg && <p className={msg.ok ? 'font-semibold text-leaf-700' : 'text-terracotta-600'} role="status">{msg.ok ? <>✓ <Bi k="saved" /></> : msg.text}</p>}
        <Button size="xl" block loading={busy} onClick={() => void save()}><Bi k="save" /></Button>
        <Button variant="outline" size="lg" block onClick={() => void logout()}><Bi k="logout" /></Button>
      </div>
    </Page>
  );
}
