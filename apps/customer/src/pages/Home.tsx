import { Badge, Button, Card, EmptyState, Page, TiffinIllustration, brand } from '@gharka/ui';
import { Link } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export default function Home() {
  return (
    <Page header={<SiteHeader />}>
      <section className="grid items-center gap-6 rounded-3xl border border-cream-200 bg-gradient-to-br from-turmeric-50 via-cream to-terracotta-50 p-6 shadow-soft sm:grid-cols-[1fr_auto] sm:p-10">
        <div>
          <p className="font-hand text-2xl text-terracotta-600">your neighbour's kitchen</p>
          <h1 className="mt-1 text-4xl font-bold leading-tight sm:text-5xl">
            Home-cooked meals, made a few lanes away.
          </h1>
          <p className="mt-4 max-w-lg text-lg text-ink-soft">
            Pre-order today's lunch or dinner from home cooks in your locality, or subscribe to a weekly tiffin.
            Real kitchens. Real names. Real ghar ka khaana.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="xl" disabled>Find cooks near me</Button>
            <Badge tone="leaf">Coming soon</Badge>
          </div>
        </div>
        <TiffinIllustration className="mx-auto h-48 w-40 sm:h-60 sm:w-48" />
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Cooks near you</h2>
        <Card className="mt-3">
          <EmptyState
            title="Kitchens are being set up"
            hint={`${brand.name} is opening in your neighbourhood soon. Log in to be ready when the first cooks go live.`}
            action={<Link to="/login"><Button variant="secondary">Log in with your phone</Button></Link>}
          />
        </Card>
      </section>
    </Page>
  );
}
