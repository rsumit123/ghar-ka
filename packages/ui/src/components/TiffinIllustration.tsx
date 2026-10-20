/** Hand-drawn-ish steel tiffin (stacked dabbas with a carry handle). Inline SVG, no assets. */
export function TiffinIllustration({ className = 'h-40 w-32' }: { className?: string }) {
  const steel = '#D9D4CB';
  const steelDark = '#A9A398';
  const line = '#2B2118';
  return (
    <svg viewBox="0 0 160 200" className={className} role="img" aria-label="Steel tiffin box" fill="none">
      <ellipse cx="80" cy="190" rx="52" ry="7" fill="#2B2118" opacity=".10" />
      {/* handle */}
      <path d="M44 40 C44 6 116 6 116 40" stroke={line} strokeWidth="5" strokeLinecap="round" />
      <path d="M44 40 C44 8 116 8 116 40" stroke={steelDark} strokeWidth="2" strokeLinecap="round" />
      {/* lid knob */}
      <rect x="70" y="26" width="20" height="10" rx="5" fill="#C2603E" stroke={line} strokeWidth="3" />
      {/* tiers */}
      {[
        { y: 36, h: 42, fill: '#E3A008' },
        { y: 82, h: 42, fill: steel },
        { y: 128, h: 46, fill: steel },
      ].map((t, i) => (
        <g key={i}>
          <rect x="30" y={t.y} width="100" height={t.h} rx="14" fill={t.fill} stroke={line} strokeWidth="3" />
          <path d={`M42 ${t.y + 12} Q80 ${t.y + 5} 118 ${t.y + 12}`} stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
          <path d={`M40 ${t.y + t.h - 9} Q80 ${t.y + t.h - 3} 120 ${t.y + t.h - 9}`} stroke={line} strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      {/* side clips */}
      <path d="M26 54 V150" stroke={line} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M134 54 V150" stroke={line} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="26" cy="54" r="4" fill="#4F7942" stroke={line} strokeWidth="2.5" />
      <circle cx="134" cy="54" r="4" fill="#4F7942" stroke={line} strokeWidth="2.5" />
      {/* steam */}
      <path d="M62 -2 q-6 -8 0 -14 M80 -4 q6 -8 0 -14 M98 -2 q-6 -8 0 -14" stroke={steelDark} strokeWidth="3" strokeLinecap="round" transform="translate(0 16)" opacity=".7" />
    </svg>
  );
}
