import { Badge, Bi, Card, type DictKey } from '@gharka/ui';
import { DOC_KINDS, type MediaKind, type VendorMe } from '../../lib/types';
import { UploadTile } from './UploadTile';

const META: Record<(typeof DOC_KINDS)[number], { label: DictKey; hint: DictKey }> = {
  id_proof: { label: 'photoId', hint: 'photoIdHint' },
  address_proof: { label: 'addressProof', hint: 'addressProofHint' },
  passport_photo: { label: 'passportPhoto', hint: 'passportPhotoHint' },
};

/** Three big document cards (camera or file/PDF). Ticks once uploaded; replace by uploading again. */
export function DocCards({ me, reload, only }: { me: VendorMe; reload: () => Promise<unknown>; only?: MediaKind[] }) {
  return (
    <div className="space-y-3">
      {DOC_KINDS.filter((k) => !only || only.includes(k)).map((kind) => {
        const done = me.media.some((m) => m.kind === kind);
        const meta = META[kind];
        return (
          <Card key={kind} className={done ? 'border-leaf-300' : ''}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-lg ${done ? 'bg-leaf-500 text-white' : 'bg-cream-200 text-ink-muted'}`} aria-hidden>
                {done ? '✓' : '·'}
              </span>
              <h3 className="flex-1 text-lg font-bold"><Bi k={meta.label} /></h3>
              {done && <Badge tone="leaf"><Bi k="uploaded" /></Badge>}
            </div>
            <UploadTile
              kind={kind} accept="image/*,application/pdf" compact onDone={reload}
              label={<Bi k={done ? 'replace' : 'takePhoto'} />} hint={<Bi k={meta.hint} />}
            />
          </Card>
        );
      })}
    </div>
  );
}
