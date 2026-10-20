import { t, type DictKey } from '../i18n';

type Props = {
  k: DictKey;
  /** 'both' (default) renders "English / हिन्दी"; 'en' or 'hi' renders one language. */
  only?: 'both' | 'en' | 'hi';
  className?: string;
};

/** Bilingual label: "Accept / स्वीकार करें". */
export function Bi({ k, only = 'both', className }: Props) {
  const { en, hi } = t(k);
  if (only === 'en') return <span className={className}>{en}</span>;
  if (only === 'hi') return <span className={`font-devanagari ${className ?? ''}`} lang="hi">{hi}</span>;
  return (
    <span className={className}>
      {en} <span className="opacity-60">/</span>{' '}
      <span className="font-devanagari" lang="hi">{hi}</span>
    </span>
  );
}
