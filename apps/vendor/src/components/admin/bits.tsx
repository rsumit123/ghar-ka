import { Badge } from '@gharka/ui';
import type { ReactNode } from 'react';
import { FSSAI_LABEL, FSSAI_TONE, REVIEW_TONE } from '../../lib/format';

export const ReviewBadge = ({ status }: { status: string }) => <Badge tone={REVIEW_TONE[status] ?? 'neutral'}>{status}</Badge>;
export const FssaiBadge = ({ status }: { status: string | null }) =>
  status ? <Badge tone={FSSAI_TONE[status] ?? 'neutral'}>{FSSAI_LABEL[status] ?? status}</Badge> : <span className="text-ink-muted">—</span>;
export const LiveBadge = ({ live, override }: { live: boolean; override?: boolean }) =>
  live ? <Badge tone="leaf">Live{override ? ' (override)' : ''}</Badge> : <Badge>Not live</Badge>;

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children || '—'}</dd>
    </div>
  );
}

export const selectCls = 'min-h-12 w-full rounded-xl border-2 border-cream-300 bg-white px-3 text-base focus:border-turmeric-500';
export const textareaCls = 'w-full rounded-xl border-2 border-cream-300 bg-white px-3 py-2 text-base focus:border-turmeric-500';
