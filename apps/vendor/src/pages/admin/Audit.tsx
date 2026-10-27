import { Button, Card, EmptyState, Spinner, api, qs } from '@gharka/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditItem } from '../../lib/adminTypes';
import { fmtDateTime } from '../../lib/format';

type Page = { total: number; page: number; page_size: number; items: AuditItem[] };

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    api.get<Page>(`/admin/audit${qs({ page, page_size: 25 })}`).then(setData).catch((e: Error) => setErr(e.message));
  }, [page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">Audit log</h1>
      {err && <p className="text-terracotta-600">{err}</p>}
      {!data && !err && <Spinner className="h-8 w-8" />}
      {data && data.items.length === 0 && <Card><EmptyState title="No activity yet" /></Card>}
      {data && data.items.length > 0 && (
        <>
          <Card padded={false} className="overflow-hidden">
            <ul className="divide-y divide-cream-200">
              {data.items.map((a) => (
                <li key={a.id} className="p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{a.action}</span>
                    {a.entity === 'vendor' && a.entity_id ? <Link className="text-sm text-terracotta-700 underline" to={`/admin/vendors/${a.entity_id}`}>vendor #{a.entity_id}</Link>
                      : <span className="text-sm text-ink-muted">{a.entity} #{a.entity_id}</span>}
                    <span className="ml-auto text-sm text-ink-muted">{a.actor ?? 'system'} · {fmtDateTime(a.created_at)}</span>
                  </div>
                  {a.details && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-cream-100 p-2 text-xs text-ink-soft">{JSON.stringify(a.details, null, 1)}</pre>}
                </li>
              ))}
            </ul>
          </Card>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="whitespace-nowrap" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</Button>
            <span className="min-w-0 text-center text-xs text-ink-soft sm:text-sm">Page {page} of {pages} · {data.total} {data.total === 1 ? 'entry' : 'entries'}</span>
            <Button variant="outline" size="sm" className="whitespace-nowrap" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older →</Button>
          </div>
        </>
      )}
    </>
  );
}
