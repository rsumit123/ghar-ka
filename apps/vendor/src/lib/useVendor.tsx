import { api } from '@gharka/ui';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { VendorMe } from './types';

type Ctx = { me: VendorMe; reload: () => Promise<VendorMe | null>; setMe: (m: VendorMe) => void };
const VendorContext = createContext<Ctx | null>(null);

/** Loads GET /vendor/me once for all vendor pages; `reload()` after any change. */
export function VendorProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [me, setMe] = useState<VendorMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const m = await api.get<VendorMe>('/vendor/me');
      setMe(m);
      setError(null);
      return m;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      return null;
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  if (!me) {
    return error ? (
      <div className="p-8 text-center">
        <p className="mb-3 text-terracotta-600">{error}</p>
        <button className="underline" onClick={() => void reload()}>Retry</button>
      </div>
    ) : <>{fallback}</>;
  }
  return <VendorContext.Provider value={{ me, reload, setMe }}>{children}</VendorContext.Provider>;
}

export function useVendor(): Ctx {
  const ctx = useContext(VendorContext);
  if (!ctx) throw new Error('useVendor must be used inside <VendorProvider>');
  return ctx;
}
