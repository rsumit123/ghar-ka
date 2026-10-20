import { Bi, Page, type DictKey } from '@gharka/ui';
import { Link, Navigate } from 'react-router-dom';
import { SiteHeader } from '../../components/SiteHeader';
import { useVendor } from '../../lib/useVendor';

const TILES: { to: string; key: DictKey; icon: string; tone: string }[] = [
  { to: '/orders', key: 'orders', icon: '🧾', tone: 'bg-turmeric-100 border-turmeric-300' },
  { to: '/menu', key: 'menu', icon: '🍛', tone: 'bg-terracotta-100 border-terracotta-200' },
  { to: '/plans', key: 'plans', icon: '🍱', tone: 'bg-leaf-100 border-leaf-200' },
  { to: '/delivery', key: 'delivery', icon: '🛵', tone: 'bg-cream-100 border-cream-300' },
  { to: '/profile', key: 'profile', icon: '👩‍🍳', tone: 'bg-turmeric-50 border-turmeric-200' },
];

/** Live vendors land here; everyone else is routed to onboarding / status. */
export function VendorEntry() {
  const { me } = useVendor();
  if (!me.onboarded) return <Navigate to="/onboarding" replace />;
  if (!me.is_live) return <Navigate to="/status" replace />;
  return <Home />;
}

function Home() {
  const { me } = useVendor();
  return (
    <Page header={<SiteHeader />} narrow>
      <p className="font-hand text-2xl text-terracotta-600"><Bi k="youAreLive" only="en" /></p>
      <h1 className="mb-5 font-serif text-3xl font-bold"><Bi k="hello" only="hi" /> {me.display_name}</h1>
      <div className="grid grid-cols-2 gap-4">
        {TILES.map((tile) => (
          <Link key={tile.to} to={tile.to}
            className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-3xl border-2 p-3 text-center shadow-soft transition active:scale-[.98] ${tile.tone}`}>
            <span className="text-5xl" aria-hidden>{tile.icon}</span>
            <span className="text-lg font-bold leading-tight"><Bi k={tile.key} /></span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
