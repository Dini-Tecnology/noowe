// User & Authentication Types
export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  dietary_restrictions?: string[];
  roles?: UserRole[];
}

export interface UserRole {
  id: string;
  role: string;
  restaurant_id: string;
  restaurant?: Restaurant;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// Restaurant Types
export interface Restaurant {
  id: string;
  name: string;
  description?: string;
  cuisine_type?: string[];
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  cover_image_url?: string;
  rating?: number;
  price_range?: number;
  is_active?: boolean;
  opening_hours?: Record<string, any>;
  delivery_radius?: number;
  min_order_amount?: number;
  delivery_fee?: number;
  estimated_delivery_time?: number;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  distance?: number; // Distance from user (in km)
  created_at?: string;
  updated_at?: string;
}

export interface MenuCategory {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
  menu_items?: MenuItem[];
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  is_available?: boolean;
  preparation_time?: number;
  calories?: number;
  allergens?: string[];
  dietary_info?: Record<string, any>;
  customizations?: Record<string, any>;
  category?: MenuCategory;
}

// Order Types
// IMPORTANT: These must match the backend enums exactly
// Backend: /backend/src/common/enums/order-status.enum.ts
// Backend: /backend/src/common/enums/order-type.enum.ts
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivering'  // Changed from 'in_delivery' to match backend
  | 'completed'
  | 'cancelled';

export type OrderType = 'dine_in' | 'pickup' | 'delivery'; // Changed 'takeaway' to 'pickup' to match backend

// Item-level status (for KDS/Kitchen)
export type OrderItemStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  id?: string;
  menu_item_id: string;
  menu_item?: MenuItem;
  quantity: number;
  unit_price?: number;
  total_price?: number;
  special_instructions?: string;
  status?: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  restaurant?: Restaurant;
  customer_id: string;
  customer?: User;
  order_number?: string;
  order_type: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax_amount?: number;
  delivery_fee?: number;
  service_fee?: number;
  discount_amount?: number;
  total_amount: number;
  payment_method?: string;
  payment_status?: string;
  delivery_address?: any;
  table_id?: string;
  special_instructions?: string;
  estimated_delivery_time?: string;
  actual_delivery_time?: string;
  tracking_updates?: any[];
  created_at: string;
  updated_at: string;
}

export interface CreateOrderRequest {
  restaurant_id: string;
  items: Array<{
    menu_item_id: string;
    quantity: number;
    special_instructions?: string;
  }>;
  delivery_address?: any;
  order_type: OrderType;
  table_id?: string;
  special_instructions?: string;
}

// Reservation Types
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface Reservation {
  id: string;
  restaurant_id: string;
  restaurant?: Restaurant;
  customer_id: string;
  customer?: User;
  reservation_time: string;
  party_size: number;
  status: ReservationStatus;
  table_id?: string;
  special_requests?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateReservationRequest {
  restaurant_id: string;
  reservation_time: string;
  party_size: number;
  special_requests?: string;
}

// Review Types
export interface Review {
  id: string;
  restaurant_id: string;
  restaurant?: Restaurant;
  customer_id: string;
  customer?: User;
  order_id?: string;
  rating: number;
  comment?: string;
  response?: string;
  response_date?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateReviewRequest {
  restaurant_id: string;
  order_id?: string;
  rating: number;
  comment?: string;
}

// Loyalty Types
export interface LoyaltyProgram {
  id: string;
  restaurant_id: string;
  restaurant?: Restaurant;
  customer_id: string;
  points_balance: number;
  total_points_earned: number;
  total_points_redeemed: number;
  tier?: string;
  tier_benefits?: Record<string, any>;
  joined_at: string;
  last_activity: string;
}

export interface LoyaltyTransaction {
  id: string;
  loyalty_program_id: string;
  transaction_type: 'earn' | 'redeem' | 'expire' | 'adjust';
  points_amount: number;
  order_id?: string;
  description?: string;
  expires_at?: string;
  created_at: string;
}

// Wallet Types
// IMPORTANT: Must match backend WalletType enum: client, restaurant, staff
export type WalletType = 'client' | 'restaurant' | 'staff';

export interface Wallet {
  id: string;
  user_id: string;
  wallet_type: WalletType;
  balance: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  transaction_type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  description?: string;
  reference_type?: string;
  reference_id?: string;
  created_at: string;
}

// Notification Types
export type NotificationType =
  | 'order:created'
  | 'order:updated'
  | 'order:ready'
  | 'order:completed'
  | 'reservation:confirmed'
  | 'reservation:reminder'
  | 'loyalty:points_earned'
  | 'loyalty:reward_available'
  | 'tip:received'
  | 'promotion'
  | 'system';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  is_read: boolean;
  read_at?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// Payment Types
// IMPORTANT: Must match backend PaymentMethodType enum
export type PaymentMethodType = 'credit_card' | 'debit_card' | 'pix' | 'wallet' | 'cash' | 'voucher';

export interface PaymentMethod {
  id: string;
  user_id: string;
  method_type: PaymentMethodType;
  provider?: string;
  card_last4?: string;
  card_brand?: string;
  expiry_month?: string;
  expiry_year?: string;
  is_default: boolean;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
}

// Payment Success Params
export interface PaymentSuccessParams {
  orderId: string;
  amountPaid: number;
  paymentMethod: string;
  pointsEarned: number;
  badge?: { text: string; icon?: string };
  receiptId?: string;
}

// Navigation Types
export type RootStackParamList = {
  // Auth
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;

  // Main Tabs
  Home: undefined;
  Explore: undefined;
  Orders: undefined;
  Profile: undefined;

  // Restaurant
  RestaurantDetail: { restaurantId: string };
  Menu: { restaurantId: string };
  MenuItemDetail: { itemId: string };
  Cart: { restaurantId: string };

  // Payment Flow
  Checkout: { orderId: string };
  Payment: { orderId: string };
  UnifiedPayment: { orderId: string };
  SplitPayment: { orderId: string };
  PaymentSuccess: PaymentSuccessParams;
  DigitalReceipt: { orderId: string; transactionId?: string };

  // Orders
  OrderDetail: { orderId: string };
  OrderTracking: { orderId: string };

  // Reservations
  Reservations: undefined;
  CreateReservation: { restaurantId: string };
  ReservationDetail: { reservationId: string };

  // Reviews
  Reviews: undefined;
  CreateReview: { restaurantId: string; orderId?: string };

  // Loyalty
  Loyalty: undefined;
  LoyaltyDetail: { restaurantId: string };

  // Profile
  EditProfile: undefined;
  PaymentMethods: undefined;
  AddPaymentMethod: undefined;
  Wallet: undefined;
  Settings: undefined;

  // Service screens
  CallWaiter: { orderId: string; restaurantId?: string };
  RestaurantMenu: { restaurantId: string; orderId?: string };
  QRScanner: { orderId?: string };
  Addresses: undefined;
  Coupons: undefined;
  TabScreen: { restaurantId?: string };
  TabPayment: { tabId?: string };
  Reservation: { restaurantId: string };
  Restaurant: { restaurantId: string };
  RestaurantVirtualQueue: { restaurantId?: string };
  RestaurantCallTeam: { restaurantId?: string; tableNumber?: number };
  RestaurantReserve: { restaurantId?: string };
};

// Component Props Types
export interface RestaurantCardProps {
  restaurant: Restaurant;
  onPress?: () => void;
}

export interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart?: (item: MenuItem) => void;
}

export interface OrderCardProps {
  order: Order;
  onPress?: () => void;
}

export interface ReservationCardProps {
  reservation: Reservation;
  onPress?: () => void;
}

export interface ReviewCardProps {
  review: Review;
}

// Form Types
export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}

export interface ResetPasswordFormData {
  email: string;
}

export interface EditProfileFormData {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  default_address?: string;
  dietary_restrictions?: string[];
  favorite_cuisines?: string[];
}

// Filter & Search Types
export interface RestaurantFilters {
  search?: string;
  cuisine_type?: string[];
  price_range?: number;
  rating?: number;
  is_open?: boolean;
  has_delivery?: boolean;
  max_distance?: number;
  sort_by?: 'distance' | 'rating' | 'price' | 'delivery_time';
}

export interface Location {
  latitude: number;
  longitude: number;
}

// API Response Types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}
