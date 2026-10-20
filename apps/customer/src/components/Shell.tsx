import { Page } from '@gharka/ui';
import type { ComponentProps } from 'react';
import { BottomNav } from './BottomNav';
import { SiteHeader } from './SiteHeader';

/** Standard customer page: header, content column, phone bottom tabs. */
export function Shell({ children, ...rest }: Omit<ComponentProps<typeof Page>, 'header'>) {
  return (
    <>
      <Page header={<SiteHeader />} {...rest} className={`pb-28 sm:pb-10 ${rest.className ?? ''}`}>{children}</Page>
      <BottomNav />
    </>
  );
}
