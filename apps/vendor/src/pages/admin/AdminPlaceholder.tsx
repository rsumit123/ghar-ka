import { Card, EmptyState } from '@gharka/ui';

export default function AdminPlaceholder({ title }: { title: string }) {
  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">{title}</h1>
      <Card><EmptyState title="Coming with ordering" hint="This page fills in once orders and complaints go live." /></Card>
    </>
  );
}
