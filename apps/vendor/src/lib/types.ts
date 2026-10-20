export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type FssaiStatus = 'docs_pending' | 'docs_received' | 'application_filed' | 'registration_issued' | 'rejected';
export type MediaKind = 'profile' | 'kitchen' | 'id_proof' | 'address_proof' | 'passport_photo' | 'dish';

export type Media = {
  id: number;
  kind: MediaKind;
  is_private: boolean;
  /** relative to /media; null for private docs */
  path: string | null;
  is_pdf: boolean;
  created_at: string;
  admin_url?: string;
};

export type FssaiInfo = {
  status: FssaiStatus;
  application_id: string | null;
  registration_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes?: string | null;
  updated_at?: string;
};

export type VendorMe = {
  onboarded: boolean;
  id?: number;
  display_name?: string;
  story?: string;
  phone?: string | null;
  whatsapp_phone?: string | null;
  locality_id?: number | null;
  locality_name?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
  review_status?: ReviewStatus;
  review_note?: string | null;
  offers_pickup?: boolean;
  delivery_radius_km?: number;
  is_live: boolean;
  fssai?: FssaiInfo | null;
  media: Media[];
  docs_complete: boolean;
  missing_docs: MediaKind[];
};

export type Locality = { id: number; name: string; city: string; pincode: string; lat: number; lng: number };

export const DOC_KINDS = ['id_proof', 'address_proof', 'passport_photo'] as const;
