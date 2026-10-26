import type { SVGProps } from 'react';

/** Small stroke icons (24px grid, currentColor) so UI chrome renders the same on every device instead of emoji. */
function make(name: string, d: React.ReactNode) {
  const C = ({ className = 'h-5 w-5', ...rest }: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden focusable="false" {...rest}>{d}</svg>
  );
  C.displayName = `Icon.${name}`;
  return C;
}

export const Icon = {
  Check: make('Check', <path d="M5 12.5l4.5 4.5L19 7.5" />),
  Pin: make('Pin', <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>),
  Pot: make('Pot', <><path d="M4 11h16v3a6 6 0 01-6 6h-4a6 6 0 01-6-6v-3z" /><path d="M8 7c0-1.2 1-1.2 1-2.4M12 7c0-1.2 1-1.2 1-2.4M16 7c0-1.2 1-1.2 1-2.4" /></>),
  Basket: make('Basket', <><path d="M3.5 10h17l-1.6 9H5.1L3.5 10z" /><path d="M8 10l3-5.5M16 10l-3-5.5" /></>),
  Tiffin: make('Tiffin', <><rect x="6" y="3.5" width="12" height="4.5" rx="1.5" /><rect x="6" y="8" width="12" height="5" rx="1.5" /><rect x="6" y="13" width="12" height="5" rx="1.5" /><path d="M9 20.5h6M4.5 7v10M19.5 7v10" /></>),
  Receipt: make('Receipt', <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>),
  Person: make('Person', <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" /></>),
  Sun: make('Sun', <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>),
  Moon: make('Moon', <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />),
  Walk: make('Walk', <><circle cx="13" cy="4.5" r="1.8" /><path d="M10 21l2-6-2.5-2.5 1-4.5 3 1.5 2.5 2.5M9.5 9.5L7 12M12 15l3.5 1.5V21" /></>),
  Bike: make('Bike', <><circle cx="6" cy="16.5" r="3.5" /><circle cx="18" cy="16.5" r="3.5" /><path d="M6 16.5l4-8h5l3 8M10 8.5l3.5 8M14 6h3" /></>),
  Chat: make('Chat', <path d="M4 5.5h16v10H12l-4.5 3.5v-3.5H4v-10z" />),
  Phone: make('Phone', <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 006 6l1.5-2 4 1.5v3a2 2 0 01-2 2A15.5 15.5 0 014.5 5.5a2 2 0 012-2z" />),
  Warn: make('Warn', <><path d="M12 3.5l9.5 16.5h-19L12 3.5z" /><path d="M12 10v4.5M12 17.5v.2" /></>),
  Cash: make('Cash', <><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.1M17.5 14.5v.1" /></>),
  Card: make('Card', <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>),
  Lock: make('Lock', <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></>),
  Camera: make('Camera', <><path d="M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4V8z" /><circle cx="12" cy="13.5" r="3.2" /></>),
  List: make('List', <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.1M4 12h.1M4 17.5h.1" />),
  Map: make('Map', <><path d="M3.5 6l5.5-2 6 2 5.5-2v14l-5.5 2-6-2-5.5 2V6z" /><path d="M9 4v14M15 6v14" /></>),
  Star: make('Star', <path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.9l6.1-.8L12 3.5z" fill="currentColor" />),
  Edit: make('Edit', <path d="M4 20l1-4.5L16.5 4a2 2 0 013 3L8 18.5 4 20z" />),
  Copy: make('Copy', <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>),
  People: make('People', <><circle cx="9" cy="8.5" r="3" /><path d="M3 19.5c.6-3 3-4.5 6-4.5s5.4 1.5 6 4.5M16 6a3 3 0 010 5.5M18 15.3c1.6.6 2.6 2 3 4.2" /></>),
  Chef: make('Chef', <><path d="M7 14V10a3.5 3.5 0 010-7 4 4 0 017.5-.5 3.5 3.5 0 012.5 6.7V14" /><path d="M7 14h10v6H7v-6z" /></>),
  Smile: make('Smile', <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14c1 1.5 2.2 2.2 3.5 2.2s2.5-.7 3.5-2.2M9 9.8v.1M15 9.8v.1" /></>),
  Doc: make('Doc', <><path d="M6 3h8l4 4v14H6V3z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>),
  Arrow: make('Arrow', <path d="M5 12h14M13 6l6 6-6 6" />),
  Close: make('Close', <path d="M6 6l12 12M18 6L6 18" />),
  ArrowLeft: make('ArrowLeft', <path d="M19 12H5M11 6l-6 6 6 6" />),
  Refresh: make('Refresh', <><path d="M20 11a8 8 0 00-14-4M4 4v3.5h3.5" /><path d="M4 13a8 8 0 0014 4M20 20v-3.5h-3.5" /></>),
};
