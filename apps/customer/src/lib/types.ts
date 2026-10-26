export type Slot = 'lunch' | 'dinner';
export type Diet = 'veg' | 'egg' | 'nonveg';
export type Fulfilment = 'pickup' | 'delivery';
/** Who brings a delivery: the cook, or a delivery partner the cook hands it to. */
export type DeliveryBy = 'self' | 'partner';
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
  delivery_by: DeliveryBy;
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
  delivery_by: DeliveryBy;
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
  delivery_by: DeliveryBy | null;
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
  is_tiffin: boolean;
  subscription_id: number | null;
  can_review: boolean;
  review: { rating: number; text: string; created_at: string } | null;
  vendor: { id: number; display_name: string; whatsapp_digits: string; pickup_address: string | null };
};

export type Locality = { id: number; name: string; city: string; pincode: string; lat: number; lng: number };

export type SubStatus = 'active' | 'paused' | 'cancelled' | 'finished';
export type MealState = 'open' | 'skipped' | 'paused' | 'locked';
export type Meal = { date: string; state: MealState; cutoff_at: string; order_id: number | null; order_status: OrderStatus | null };
export type Subscription = {
  id: number;
  status: SubStatus;
  start_date: string;
  end_date: string;
  weeks: number;
  paused_until: string | null;
  fulfilment: Fulfilment;
  delivery_address: string | null;
  price_per_meal: number;
  next_meal_date: string | null;
  plan: { id: number; name: string; slot: Slot; days_of_week: number[]; price_per_week: number; diet: Diet; active: boolean };
  vendor: { id: number; display_name: string; whatsapp_digits: string };
  upcoming: Meal[];
};

export type Complaint = { id: number; order_id: number | null; vendor_id: number; vendor_name: string | null; text: string; status: 'open' | 'resolved'; created_at: string };
