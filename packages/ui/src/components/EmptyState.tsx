import type { ReactNode } from 'react';
import { TiffinIllustration } from './TiffinIllustration';

export function EmptyState({ title, hint, action, illustration }: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {illustration ?? <TiffinIllustration />}
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      {hint && <p className="mt-1.5 max-w-sm text-ink-soft">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
