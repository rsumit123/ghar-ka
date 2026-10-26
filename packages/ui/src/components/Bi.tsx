import type { DictKey } from '../i18n';
import { useT, useLang } from '../lang';

type Props = {
  k: DictKey;
  className?: string;
};

/** Label in the language the user picked (see LangSwitch). */
export function Bi({ k, className }: Props) {
  const [lang] = useLang();
  const text = useT()(k);
  if (lang === 'hi') return <span className={`font-devanagari ${className ?? ''}`} lang="hi">{text}</span>;
  return <span className={className}>{text}</span>;
}
