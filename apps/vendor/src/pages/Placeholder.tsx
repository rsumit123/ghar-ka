import { Bi, Card, EmptyState, Page, type DictKey } from '@gharka/ui';
import { SiteHeader } from '../components/SiteHeader';

export default function Placeholder({ titleKey }: { titleKey: DictKey }) {
  return (
    <Page header={<SiteHeader />} title={<Bi k={titleKey} />}>
      <Card><EmptyState title={<Bi k="emptyNothingYet" />} /></Card>
    </Page>
  );
}
