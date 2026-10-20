import type { BadgeTone } from '@gharka/ui';

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const REVIEW_TONE: Record<string, BadgeTone> = { pending: 'turmeric', approved: 'leaf', rejected: 'terracotta', suspended: 'terracotta' };

export const FSSAI_LABEL: Record<string, string> = {
  docs_pending: 'Docs pending',
  docs_received: 'Docs received',
  application_filed: 'Application filed',
  registration_issued: 'Registration issued',
  rejected: 'Rejected',
};
export const FSSAI_TONE: Record<string, BadgeTone> = {
  docs_pending: 'neutral', docs_received: 'turmeric', application_filed: 'turmeric', registration_issued: 'leaf', rejected: 'terracotta',
};
