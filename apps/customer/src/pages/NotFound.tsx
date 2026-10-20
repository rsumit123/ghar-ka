import { Button, EmptyState, Page } from '@gharka/ui';
import { Link } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export default function NotFound() {
  return (
    <Page header={<SiteHeader />}>
      <EmptyState title="We couldn't find that page" action={<Link to="/"><Button>Back home</Button></Link>} />
    </Page>
  );
}
