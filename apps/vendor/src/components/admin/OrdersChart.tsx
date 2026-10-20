/** Orders-per-day bar chart in plain SVG (no chart library). Scales to the container width. */
export function OrdersChart({ data }: { data: { date: string; count: number }[] }) {
  const W = 760, H = 240, padL = 28, padR = 6, padT = 16, padB = 28;
  const max = Math.max(4, ...data.map((d) => d.count));
  const top = Math.ceil(max / 4) * 4; // round the scale to 4 steps
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / Math.max(data.length, 1);
  const bw = Math.min(26, slot * 0.62);
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const ticks = [0, top / 4, top / 2, (top * 3) / 4, top];
  const total = data.reduce((a, d) => a + d.count, 0);
  const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Orders per day for the last ${data.length} days, ${total} in total`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-cream-300" strokeWidth={t === 0 ? 1.5 : 1} strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-muted text-[11px]">{Number.isInteger(t) ? t : ''}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          const isLast = i === data.length - 1;
          return (
            <g key={d.date}>
              <title>{`${label(d.date)}: ${d.count} ${d.count === 1 ? 'order' : 'orders'}`}</title>
              <rect x={x} y={y(d.count)} width={bw} height={Math.max(d.count > 0 ? 2 : 0, plotH - (y(d.count) - padT))} rx={4}
                className={isLast ? 'fill-terracotta-500' : 'fill-turmeric-500'} />
              {d.count > 0 && <text x={x + bw / 2} y={y(d.count) - 4} textAnchor="middle" className="fill-ink text-[11px] font-semibold">{d.count}</text>}
              {i % 2 === (data.length - 1) % 2 && (
                <text x={x + bw / 2} y={H - 10} textAnchor="middle" className="fill-ink-muted text-[11px]">{label(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{data.map((d) => `${label(d.date)}: ${d.count}`).join('; ')}</figcaption>
    </figure>
  );
}
