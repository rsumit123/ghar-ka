import type { FssaiInfo, Media, ReviewStatus } from './types';

export type AdminVendorRow = {
  id: number;
  display_name: string;
  phone: string | null;
  locality_name: string | null;
  pincode: string | null;
  review_status: ReviewStatus;
  is_live: boolean;
  live_override: boolean;
  fssai_status: string | null;
  fssai_expiry: string | null;
  fssai_days_left: number | null;
  docs_complete: boolean;
  docs_count: number;
  created_at: string;
};

export type AdminVendorDetail = AdminVendorRow & {
  story: string;
  address_line: string | null;
  whatsapp_phone: string | null;
  locality_id: number | null;
  lat: number | null;
  lng: number | null;
  review_note: string | null;
  offers_pickup: boolean;
  delivery_radius_km: number;
  live_override_reason: string | null;
  approved_at: string | null;
  user: { id: number; name: string; phone: string | null } | null;
  fssai: (FssaiInfo & { notes: string | null }) | null;
  media: Media[];
  missing_docs: string[];
};

export type AdminDashboardData = {
  active_vendors: number;
  live_vendors: number;
  pending_vendors: number;
  fssai_expiring_60d: number;
  orders_today: number;
  orders_this_week: number;
  repeat_customer_rate: number;
};

export type AuditItem = {
  id: number;
  action: string;
  entity: string;
  entity_id: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: string | null;
};

export type FssaiRow = FssaiInfo & {
  vendor_id: number;
  display_name: string;
  review_status: ReviewStatus;
  is_live: boolean;
  days_left: number | null;
};
