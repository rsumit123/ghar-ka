import { ApiError, Badge, Button, Card, Input, MapView, Modal, Spinner, Switch, api, brand, mediaUrl, qs } from '@gharka/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Field, FssaiBadge, LiveBadge, ReviewBadge, selectCls, textareaCls } from '../../components/admin/bits';
import type { AdminVendorDetail, AuditItem } from '../../lib/adminTypes';
import { FSSAI_LABEL, fmtDate, fmtDateTime } from '../../lib/format';
import type { Media } from '../../lib/types';

const DOC_LABEL: Record<string, string> = { id_proof: 'Photo ID', address_proof: 'Address proof', passport_photo: 'Passport photo' };

function errMsg(e: unknown) { return e instanceof ApiError ? e.detail : 'Something went wrong'; }

function Gallery({ title, items }: { title: string; items: Media[] }) {
  if (!items.length) return <p className="text-ink-muted">No {title.toLowerCase()} yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((m) => (
        <a key={m.id} href={mediaUrl(m.path)} target="_blank" rel="noreferrer">
          <img src={mediaUrl(m.path)} alt={title} className="aspect-square w-full rounded-xl border border-cream-200 object-cover" />
        </a>
      ))}
    </div>
  );
}

function PrivateDocs({ v }: { v: AdminVendorDetail }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {(['id_proof', 'address_proof', 'passport_photo'] as const).map((kind) => {
        const m = v.media.find((x) => x.kind === kind);
        const href = m?.admin_url ? `${brand.apiUrl}${m.admin_url}` : undefined;
        return (
          <div key={kind}>
            <p className="mb-1.5 text-sm font-semibold">{DOC_LABEL[kind]}</p>
            {!m || !href ? <p className="rounded-xl border-2 border-dashed border-terracotta-300 p-6 text-center text-sm text-terracotta-700">Missing</p>
              : m.is_pdf ? <a href={href} target="_blank" rel="noreferrer" className="block rounded-xl border-2 border-cream-300 bg-white p-6 text-center font-semibold underline">📄 Open PDF</a>
                : <a href={href} target="_blank" rel="noreferrer"><img src={href} alt={DOC_LABEL[kind]} className="max-h-72 w-full rounded-xl border border-cream-200 bg-white object-contain" /></a>}
          </div>
        );
      })}
    </div>
  );
}

function FssaiForm({ v, onSaved }: { v: AdminVendorDetail; onSaved: () => void }) {
  const f = v.fssai;
  const [status, setStatus] = useState(f?.status ?? 'docs_pending');
  const [appId, setAppId] = useState(f?.application_id ?? '');
  const [regNo, setRegNo] = useState(f?.registration_number ?? '');
  const [issue, setIssue] = useState(f?.issue_date ?? '');
  const [expiry, setExpiry] = useState(f?.expiry_date ?? '');
  const [notes, setNotes] = useState(f?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setStatus(f?.status ?? 'docs_pending'); setAppId(f?.application_id ?? ''); setRegNo(f?.registration_number ?? '');
    setIssue(f?.issue_date ?? ''); setExpiry(f?.expiry_date ?? ''); setNotes(f?.notes ?? '');
  }, [f]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.put(`/admin/vendors/${v.id}/fssai`, {
        status, application_id: appId.trim() || null, registration_number: regNo.trim() || null,
        issue_date: issue || null, expiry_date: expiry || null, notes: notes.trim() || null,
      });
      setMsg({ ok: true, text: 'FSSAI details saved' });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="fs" className="mb-1.5 block text-sm font-semibold text-ink-soft">Status</label>
        <select id="fs" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          {Object.entries(FSSAI_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <Input label="Application ID" value={appId} onChange={(e) => setAppId(e.target.value)} />
      <Input label="Registration number" value={regNo} onChange={(e) => setRegNo(e.target.value)} hint={status === 'registration_issued' ? 'Required' : undefined} />
      <Input label="Issue date" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
      <Input label="Expiry date" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      <div className="sm:col-span-2">
        <label htmlFor="fn" className="mb-1.5 block text-sm font-semibold text-ink-soft">Notes</label>
        <textarea id="fn" rows={2} className={textareaCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" loading={busy}>Save FSSAI</Button>
        {msg && <p className={msg.ok ? 'font-semibold text-leaf-700' : 'font-medium text-terracotta-600'} role="status">{msg.text}</p>}
      </div>
    </form>
  );
}

function OverrideBox({ v, onSaved }: { v: AdminVendorDetail; onSaved: () => void }) {
  const [on, setOn] = useState(v.live_override);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setOn(v.live_override); }, [v.live_override]);
  const changed = on !== v.live_override;

  async function apply() {
    setBusy(true);
    setErr(null);
    try { await api.put(`/admin/vendors/${v.id}/override`, { enabled: on, reason: reason.trim() }); setReason(''); onSaved(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">Lets a vendor go live without approval + FSSAI registration (suspension still blocks). Every change needs a reason and is logged.</p>
      <Switch checked={on} onChange={setOn} label="Live override" hint={v.live_override_reason ? `Last reason: ${v.live_override_reason}` : undefined} />
      {changed && (
        <>
          <Input label="Reason (required, min 5 characters)" value={reason} onChange={(e) => setReason(e.target.value)} error={err} />
          <Button variant="secondary" loading={busy} disabled={reason.trim().length < 5} onClick={() => void apply()}>{on ? 'Turn override on' : 'Turn override off'}</Button>
        </>
      )}
      {!changed && err && <p className="text-terracotta-600">{err}</p>}
    </div>
  );
}

function describe(a: AuditItem): string {
  const d = a.details as { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  if (d?.after) {
    const keys = Object.keys(d.after).filter((k) => JSON.stringify(d.after![k]) !== JSON.stringify(d.before?.[k]));
    return keys.map((k) => `${k}: ${String(d.before?.[k] ?? '—')} → ${String(d.after![k] ?? '—')}`).join('; ');
  }
  return '';
}

export default function AdminVendorDetail() {
  const { id } = useParams();
  const [v, setV] = useState<AdminVendorDetail | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<'reject' | 'suspend' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        api.get<AdminVendorDetail>(`/admin/vendors/${id}`),
        api.get<{ items: AuditItem[] }>(`/admin/audit${qs({ entity: 'vendor', entity_id: id, page_size: 20 })}`),
      ]);
      setV(d);
      setAudit(a.items);
    } catch (e) { setErr(errMsg(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(action: string, body: { note?: string } = {}) {
    setBusy(true);
    setActionErr(null);
    try {
      await api.post(`/admin/vendors/${id}/${action}`, body);
      setModal(null);
      setNote('');
      await load();
    } catch (e) { setActionErr(errMsg(e)); } finally { setBusy(false); }
  }

  if (err) return <p className="text-terracotta-600">{err}</p>;
  if (!v) return <Spinner className="h-8 w-8" />;
  const pos = v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null;
  const days = v.fssai_days_left;

  return (
    <div className="space-y-5">
      <Link to="/admin/vendors" className="text-sm font-semibold text-ink-soft underline">← All vendors</Link>

      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold">{v.display_name}</h1>
            <p className="text-ink-soft">{v.story || <em>No cooking line</em>}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><ReviewBadge status={v.review_status} /><FssaiBadge status={v.fssai?.status ?? null} /><LiveBadge live={v.is_live} override={v.live_override} />
              {days !== null && days <= 60 && <Badge tone={days < 0 ? 'terracotta' : 'turmeric'}>{days < 0 ? `FSSAI expired ${-days}d ago` : `FSSAI expires in ${days}d`}</Badge>}</div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {(v.review_status === 'pending' || v.review_status === 'rejected') && <Button variant="secondary" loading={busy} onClick={() => void act('approve')}>Approve</Button>}
            {(v.review_status === 'pending' || v.review_status === 'approved') && <Button variant="outline" onClick={() => { setActionErr(null); setModal('reject'); }}>Reject…</Button>}
            {v.review_status === 'suspended'
              ? <Button variant="secondary" loading={busy} onClick={() => void act('unsuspend')}>Unsuspend</Button>
              : <Button variant="danger" onClick={() => { setActionErr(null); setModal('suspend'); }}>Suspend…</Button>}
          </div>
        </div>
        {actionErr && !modal && <p className="mt-3 text-terracotta-600" role="alert">{actionErr}</p>}
        {v.review_note && <p className="mt-3 rounded-xl bg-terracotta-50 p-3 text-sm"><b>Note:</b> {v.review_note}</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-serif text-xl font-bold">Details</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Phone">{v.phone}</Field>
            <Field label="WhatsApp">{v.whatsapp_phone}</Field>
            <Field label="Locality">{v.locality_name}</Field>
            <Field label="Pincode">{v.pincode}</Field>
            <Field label="Address">{v.address_line}</Field>
            <Field label="Exact location">{pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : null}</Field>
            <Field label="Pickup">{v.offers_pickup ? 'Yes' : 'No'}</Field>
            <Field label="Delivery radius">{v.delivery_radius_km ? `${v.delivery_radius_km} km` : 'No delivery'}</Field>
            <Field label="Joined">{fmtDate(v.created_at)}</Field>
            <Field label="Approved">{fmtDate(v.approved_at)}</Field>
          </dl>
        </Card>
        <div>{pos ? <MapView center={pos} markers={[{ id: v.id, ...pos, label: v.display_name }]} circle={v.delivery_radius_km ? { center: pos, radiusKm: v.delivery_radius_km } : undefined} height={300} zoom={15} fit={!!v.delivery_radius_km} />
          : <Card className="flex h-full min-h-40 items-center justify-center text-ink-muted">No map location</Card>}</div>
      </div>

      <Card>
        <h2 className="mb-3 font-serif text-xl font-bold">Photos</h2>
        <p className="mb-1.5 text-sm font-semibold">Profile</p>
        <div className="mb-4 max-w-[10rem]"><Gallery title="Profile photo" items={v.media.filter((m) => m.kind === 'profile')} /></div>
        <p className="mb-1.5 text-sm font-semibold">Kitchen</p>
        <Gallery title="Kitchen photos" items={v.media.filter((m) => m.kind === 'kitchen')} />
      </Card>

      <Card>
        <h2 className="mb-3 font-serif text-xl font-bold">Private documents <span className="text-sm font-normal text-ink-muted">(admin only)</span></h2>
        <PrivateDocs v={v} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card><h2 className="mb-3 font-serif text-xl font-bold">FSSAI</h2><FssaiForm v={v} onSaved={() => void load()} /></Card>
        <Card><h2 className="mb-3 font-serif text-xl font-bold">Go-live override</h2><OverrideBox v={v} onSaved={() => void load()} /></Card>
      </div>

      <Card>
        <h2 className="mb-3 font-serif text-xl font-bold">History</h2>
        {audit.length === 0 ? <p className="text-ink-muted">Nothing yet.</p> : (
          <ul className="divide-y divide-cream-200 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="py-2">
                <span className="font-semibold">{a.action}</span> <span className="text-ink-muted">by {a.actor ?? 'system'} · {fmtDateTime(a.created_at)}</span>
                <div className="break-words text-ink-soft">{describe(a)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'reject' ? 'Reject vendor' : 'Suspend vendor'}>
        <p className="mb-2 text-sm text-ink-soft">{modal === 'reject' ? 'This note is shown to the vendor so they can fix things.' : 'Suspending signs the vendor out immediately and takes them off the listing.'}</p>
        <label htmlFor="note" className="sr-only">Note</label>
        <textarea id="note" rows={3} className={textareaCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" autoFocus />
        {actionErr && <p className="mt-2 text-terracotta-600" role="alert">{actionErr}</p>}
        <div className="mt-4 flex gap-2">
          <Button variant="danger" loading={busy} disabled={modal === 'reject' && note.trim().length < 3}
            onClick={() => void act(modal!, { note: note.trim() })}>{modal === 'reject' ? 'Reject' : 'Suspend'}</Button>
          <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}
