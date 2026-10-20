import { Bi, api, mediaUrl } from '@gharka/ui';
import { useState } from 'react';
import type { VendorMe } from '../../lib/types';
import { UploadTile } from './UploadTile';

export const MAX_KITCHEN = 6;

/** Grid of kitchen photos with remove (×) and an "add" camera tile (max 6). */
export function KitchenPhotos({ me, reload }: { me: VendorMe; reload: () => Promise<unknown> }) {
  const photos = me.media.filter((m) => m.kind === 'kitchen');
  const [removing, setRemoving] = useState<number | null>(null);

  async function remove(id: number) {
    setRemoving(id);
    try { await api.del(`/vendor/media/${id}`); await reload(); } finally { setRemoving(null); }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {photos.map((p) => (
        <div key={p.id} className="relative overflow-hidden rounded-2xl border border-cream-200 shadow-soft">
          <img src={mediaUrl(p.path)} alt="" className="aspect-square w-full object-cover" />
          <button
            type="button" aria-label="Remove / हटाएँ" disabled={removing === p.id} onClick={() => void remove(p.id)}
            className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-ink/70 text-xl text-white"
          >×</button>
        </div>
      ))}
      {photos.length < MAX_KITCHEN && (
        <UploadTile kind="kitchen" label={<Bi k="takePhoto" />} onDone={reload} className={photos.length === 0 ? 'col-span-2' : ''} />
      )}
    </div>
  );
}
