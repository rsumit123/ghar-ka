import { Button, EmptyState, Page } from '@gharka/ui';
import { Link } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export default function NotFound() {
  return (
    <Page header={<SiteHeader />}>
      <EmptyState title="Page not found" action={<Link to="/"><Button>Home</Button></Link>} />
    </Page>
  );
}
