export type Slot = 'lunch' | 'dinner';
export type Diet = 'veg' | 'egg' | 'nonveg';
export type Fulfilment = 'pickup' | 'delivery';
export type OrderStatus = 'placed' | 'accepted' | 'ready' | 'completed' | 'cancelled';

export type Dish = {
  id: number;
  date: string;
  slot: Slot;
  dish_name: string;
  description: string | null;
  photo: string | null;
  /** paise */
  price: number;
  diet: Diet;
  portions_left: number;
  cutoff_at: string;
  is_open: boolean;
};

export type VendorCardData = {
  id: number;
  display_name: string;
  story: string;
  locality_name: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  delivers_to_you: boolean;
  offers_pickup: boolean;
  delivery_radius_km: number;
  fssai_registered: boolean;
  cook_photo: string | null;
  kitchen_photo: string | null;
  rating_avg: number | null;
  rating_count: number;
  orders_served: number;
  offerings: Dish[];
};

export type MenuGroup = { date: string; slot: Slot; cutoff_at: string; is_open: boolean; dishes: Dish[] };

export type Plan = {
  id: number;
  name: string;
  description: string | null;
  slot: Slot;
  days_of_week: number[];
  price_per_week: number;
  diet: Diet;
  cutoff_hours_before: number;
};

export type Review = { id: number; rating: number; text: string; created_at: string; customer_name: string };

export type VendorProfile = {
  id: number;
  display_name: string;
  story: string;
  locality_name: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  whatsapp_digits: string;
  offers_pickup: boolean;
  delivery_radius_km: number;
  distance_km: number | null;
  delivers_to_you: boolean;
  fssai_registered: boolean;
  cook_photo: string | null;
  kitchen_photos: string[];
  stats: { rating_avg: number | null; rating_count: number; orders_served: number };
  menu: MenuGroup[];
  plans: Plan[];
  reviews: Review[];
};

export type OrderItem = { offering_id: number | null; name: string; qty: number; unit_price: number };

export type OrderData = {
  id: number;
  status: OrderStatus;
  date: string;
  slot: Slot;
  fulfilment: Fulfilment;
  delivery_address: string | null;
  note: string | null;
  total: number;
  payment_method: 'cod' | 'razorpay';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  cancel_reason: string | null;
  items: OrderItem[];
  cutoff_at: string | null;
  created_at: string;
  updated_at: string;
  can_cancel: boolean;
  vendor: { id: number; display_name: string; whatsapp_digits: string; pickup_address: string | null };
};

export type Locality = { id: number; name: string; city: string; pincode: string; lat: number; lng: number };
