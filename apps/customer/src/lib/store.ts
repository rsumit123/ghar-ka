import { useCallback, useSyncExternalStore } from 'react';

/** Tiny localStorage-backed store. Every access is wrapped: storage can be blocked, full, or absent. */
export function createPersistedStore<T>(key: string, initial: T, validate: (v: unknown) => v is T) {
  let cache: T | undefined;
  const listeners = new Set<() => void>();

  function read(): T {
    if (cache !== undefined) return cache;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (validate(parsed)) return (cache = parsed);
      }
    } catch { /* storage unavailable or corrupt: fall back */ }
    return (cache = initial);
  }

  function write(next: T) {
    cache = next;
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* keep in memory only */ }
    listeners.forEach((l) => l());
  }

  function subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  }

  function useStore(): [T, (next: T | ((prev: T) => T)) => void] {
    const value = useSyncExternalStore(subscribe, read, () => initial);
    const set = useCallback((next: T | ((prev: T) => T)) => write(typeof next === 'function' ? (next as (p: T) => T)(read()) : next), []);
    return [value, set];
  }

  return { useStore, read, write };
}
