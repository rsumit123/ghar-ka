import { cx, mediaUrl } from '@gharka/ui';

/** Cook portrait with a turmeric ring; falls back to a warm initial when there is no photo. */
export function CookAvatar({ name, photo, size = 72, className }: { name: string; photo: string | null; size?: number; className?: string }) {
  const src = mediaUrl(photo);
  return (
    <span
      className={cx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-turmeric-100 ring-2 ring-turmeric-400 ring-offset-2 ring-offset-cream', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={`${name}, the cook`} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="font-serif font-bold text-terracotta-600" style={{ fontSize: size * 0.45 }} aria-hidden>{name.trim().charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
