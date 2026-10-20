export function Stars({ avg, count }: { avg: number | null; count: number }) {
  if (avg === null) return <span className="text-sm text-ink-muted">New cook</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold">
      <span className="text-turmeric-600" aria-hidden>★</span>
      <span>{avg.toFixed(1)}</span>
      <span className="font-normal text-ink-muted">({count})</span>
    </span>
  );
}
