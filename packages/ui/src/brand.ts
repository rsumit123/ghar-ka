/** Brand + runtime config. The only place that reads VITE_* env; never hardcode the brand name elsewhere. */
const env = import.meta.env;

const [lat, lng] = (env.VITE_MAP_CENTER ?? '12.9716,77.5946').split(',').map(Number);

export const brand = {
  name: env.VITE_BRAND_NAME || 'gharka',
  apiUrl: (env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, ''),
  customerUrl: env.VITE_CUSTOMER_URL || 'http://localhost:5173',
  vendorUrl: env.VITE_VENDOR_URL || 'http://localhost:5174',
  /** IANA zone used to format dates/times (mirror of the backend APP_TIMEZONE). */
  timezone: env.VITE_TIMEZONE || 'Asia/Kolkata',
  razorpayEnabled: env.VITE_RAZORPAY_ENABLED === 'true',
  map: {
    tileUrl: env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: env.VITE_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors',
    /** Fallback centre when no vendor/locality location is known. */
    center: { lat: Number.isFinite(lat) ? lat : 12.9716, lng: Number.isFinite(lng) ? lng : 77.5946 },
  },
} as const;

/** Absolute URL for a public upload path returned by the API (served at /media). */
export const mediaUrl = (path: string | null | undefined): string | undefined =>
  path ? `${brand.apiUrl}/media/${path.replace(/^\/+/, '')}` : undefined;
