import { Card, EmptyState, Page, useAuth } from '@gharka/ui';
import { SiteHeader } from '../components/SiteHeader';

export default function AdminDashboard() {
  const { user } = useAuth();
  return (
    <Page header={<SiteHeader />} title="Admin dashboard" subtitle={`Signed in as ${user?.email}`}>
      <Card><EmptyState title="Dashboard coming soon" hint="Vendor queue, FSSAI tracker, orders and complaints land here." /></Card>
    </Page>
  );
}
