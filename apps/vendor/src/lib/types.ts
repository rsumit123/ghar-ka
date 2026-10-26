export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type FssaiStatus = 'docs_pending' | 'docs_received' | 'application_filed' | 'registration_issued' | 'rejected';
/** Who brings a delivery: the cook, or a delivery partner the cook hands it to. */
export type DeliveryBy = 'self' | 'partner';
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
  delivery_by?: DeliveryBy;
  is_live: boolean;
  fssai?: FssaiInfo | null;
  media: Media[];
  docs_complete: boolean;
  missing_docs: MediaKind[];
};

export type Locality = { id: number; name: string; city: string; pincode: string; lat: number; lng: number };

export const DOC_KINDS = ['id_proof', 'address_proof', 'passport_photo'] as const;

export type Slot = 'lunch' | 'dinner';
export type Diet = 'veg' | 'egg' | 'nonveg';
export type OrderStatus = 'placed' | 'accepted' | 'ready' | 'completed' | 'cancelled';
export type CutoffPreset = '1h' | '2h' | '3h' | 'night_before_9pm' | 'morning_10am';

export type Offering = {
  id: number;
  date: string;
  slot: Slot;
  dish_name: string;
  description: string | null;
  photo: string | null;
  /** paise */
  price: number;
  diet: Diet;
  portions_total: number;
  portions_sold: number;
  portions_left: number;
  cutoff_at: string;
  is_open: boolean;
};

export type VendorOrder = {
  id: number;
  status: OrderStatus;
  date: string;
  slot: Slot;
  fulfilment: 'pickup' | 'delivery';
  delivery_by: DeliveryBy | null;
  delivery_address: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  total: number;
  payment_method: 'cod' | 'razorpay';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  cancel_reason: string | null;
  is_tiffin?: boolean;
  items: { name: string; qty: number; unit_price: number }[];
  created_at: string;
  customer: { name: string; phone: string | null; whatsapp_digits: string };
};

export type OrdersResponse = {
  date: string;
  orders: VendorOrder[];
  summary: { offering_id: number; slot: Slot; dish_name: string; sold: number; total: number }[];
};

export type Plan = {
  id: number;
  name: string;
  description: string | null;
  slot: Slot;
  days_of_week: number[];
  /** paise */
  price_per_week: number;
  price_per_meal: number;
  diet: Diet;
  active: boolean;
  cutoff_hours_before: number;
  subscriber_count: number;
};

export type Subscriber = {
  id: number;
  status: 'active' | 'paused' | 'cancelled' | 'finished';
  customer: { name: string; phone: string | null; whatsapp_digits: string };
  plan: { id: number; name: string; slot: Slot };
  fulfilment: 'pickup' | 'delivery';
  delivery_address: string | null;
  start_date: string;
  end_date: string;
  paused_until: string | null;
  next_meal_date: string | null;
  skips_upcoming: string[];
};

export type SubscribersResponse = {
  subscribers: Subscriber[];
  plan_counts: { plan_id: number; subscribers: number; today: number; tomorrow: number }[];
};
