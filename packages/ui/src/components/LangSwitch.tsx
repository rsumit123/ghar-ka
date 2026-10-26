import { cx } from '../cx';
import { useLang, type Lang } from '../lang';

const OPTIONS: { id: Lang; label: string; lang: string }[] = [
  { id: 'en', label: 'EN', lang: 'en' },
  { id: 'hi', label: 'हिं', lang: 'hi' },
];

/** Compact EN / हिं segmented pill. */
export function LangSwitch({ className }: { className?: string }) {
  const [lang, setLang] = useLang();
  return (
    <div role="group" aria-label="Language" className={cx('inline-flex shrink-0 overflow-hidden rounded-full border-2 border-cream-300 bg-white/70', className)}>
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" aria-pressed={lang === o.id} lang={o.lang} onClick={() => setLang(o.id)}
          className={cx('min-h-9 min-w-9 px-2.5 text-sm font-bold', o.id === 'hi' && 'font-devanagari',
            lang === o.id ? 'bg-ink text-cream' : 'text-ink-soft')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
