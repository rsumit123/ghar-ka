import { useCallback, useSyncExternalStore } from 'react';
import { t, type DictKey } from './i18n';

export type Lang = 'en' | 'hi';

const KEY = 'gharka.lang';
const listeners = new Set<() => void>();

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = read();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage unavailable: keep in memory only */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** [current language, setter]. Re-renders on change. */
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(subscribe, getLang, () => 'en' as Lang);
  return [lang, setLang];
}

/** Translate a dictionary key into the chosen language (for aria-labels, placeholders, notices). */
export function useT(): (k: DictKey) => string {
  const lang = useSyncExternalStore(subscribe, getLang, () => 'en' as Lang);
  return useCallback((k: DictKey) => t(k)[lang], [lang]);
}
