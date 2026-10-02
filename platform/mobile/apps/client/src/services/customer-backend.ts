import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/shared/services/supabase';
import type { Database } from '@/shared/types/database.generated';
import type { CustomerExperienceConfig } from '@okinawa/shared/config/service-types';
import { normalizeUsernameInput } from '../utils/username';
import {
  isServiceModel,
  parseRestaurantCapabilityContract,
  type RestaurantCapabilityContract,
  type ServiceModel,
} from '@okinawa/shared/config/capabilities';

type RestaurantRow = Database['public']['Tables']['restaurants']['Row'];

export type Page<T> = { data: T[]; nextCursor: string | null };

export type VisitSession = {
  restaurantId: string;
  tableId: string;
  tableSessionId: string;
  tableNumber: string;
  serviceModel?: ServiceModel;
  waitlistEntryId?: string;
};

export type ServiceQrResolution =
  | { kind: 'counter'; restaurantId: string; serviceModel: 'quick_service'; counterLabel: string }
  | { kind: 'table'; restaurantId: string; serviceModel: 'fine_dining' | 'casual_dining'; tableId: string; tableQrId: string; allowedServiceModels: ServiceModel[] };

export type TableParticipant = {
  userId: string;
  displayName: string | null;
  isHost: boolean;
  isMe: boolean;
};

export type TableBillItem = {
  orderItemId: string;
  orderId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  placedBy: string;
  placedByName: string;
  placedByIsMe: boolean;
  /** Who the item was ordered *for* — the casual dining "Quem está pedindo?". */
  dinerId: string | null;
  dinerName: string;
  dinerIsKid: boolean;
  status: string;
  specialInstructions: string | null;
  description: string | null;
  imageUrl: string | null;
};

/**
 * A seat at the table. App users who scanned the QR (or accepted an invite)
 * and companions typed in by whoever is hosting — kids and relatives without
 * the app — share this shape; `isCompanion` tells them apart.
 */
export type TableDiner = {
  dinerId: string;
  userId: string | null;
  displayName: string;
  isHost: boolean;
  isKid: boolean;
  isMe: boolean;
  isCompanion: boolean;
  kidAge: number | null;
  kidAllergies: string | null;
};

export type TableBill = {
  tableSessionId: string;
  participants: TableDiner[];
  items: TableBillItem[];
  subtotal: number;
  serviceFeePercent: number;
  serviceFee: number;
};

export type CustomerProfile = {
  id: string;
  email: string | null;
  fullName: string;
  /** Public unique handle, without the "@" (ADR-011). */
  username: string;
  phone: string | null;
  avatarUrl: string | null;
  favoriteCuisines: string[];
  dietaryRestrictions: string[];
  preferences: Record<string, unknown>;
};

/** What anyone at a table may see about another user (ADR-011): no e-mail, no phone. */
export type PublicUserCard = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type TableUserInviteState = 'invitable' | 'already_at_table' | 'invite_pending';

export type TableUserSearchResult = PublicUserCard & { inviteState: TableUserInviteState };

export type TableUserInviteStatus =
  | 'pending'
  | 'awaiting_capacity'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'capacity_rejected';

export type TableUserInvite = {
  id: string;
  tableSessionId: string;
  restaurantId: string;
  restaurantName: string;
  tableId: string;
  tableNumber: string;
  status: TableUserInviteStatus;
  closedReason: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  capacityRequestId: string | null;
  capacityExpiresAt: string | null;
  inviter: PublicUserCard;
  invitee: PublicUserCard;
  sentByMe: boolean;
  canCancel: boolean;
  canRespond: boolean;
};

export type AcceptTableUserInviteResult = {
  status: TableUserInviteStatus;
  /** Present when the invitee is now at the table. */
  visit: VisitSession | null;
  capacityRequestId: string | null;
  invite: TableUserInvite | null;
  idempotentReplay: boolean;
};

/** Row change pushed by Realtime on table_session_user_invites. */
export type TableInviteChange = {
  inviteId: string;
  status: TableUserInviteStatus;
  inviteeId: string;
  tableSessionId: string;
};

export type UsernameAvailability = {
  normalized: string | null;
  available: boolean;
  reason: 'invalid_format' | 'reserved' | 'taken' | 'current' | null;
};

export type CustomerRestaurant = {
  id: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  state: string;
  cuisineTypes: string[];
  logoUrl: string | null;
  bannerUrl: string | null;
  /** Every image the restaurant published, de-duplicated: banner, cover, logo. */
  photos: string[];
  openingHours: Record<string, unknown>;
  rating: number;
  totalReviews: number;
  /** Preço médio por pessoa cadastrado pelo restaurante, em centavos; null = não informado. */
  averagePriceCents: number | null;
  lat: number | null;
  lng: number | null;
  serviceConfig: Record<string, unknown>;
  customerExperience: CustomerExperienceConfig | null;
  serviceType: string;
};

export type CustomerMenuCategory = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
};

export type CustomerMenuItem = {
  id: string;
  restaurantId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  /** Pre-discount price (e.g. a pre-made combo) — show as a strikethrough when set and higher than `price`. */
  originalPrice: number | null;
  imageUrl: string | null;
  preparationTime: number | null;
  allergens: string[];
  dietaryInfo: Record<string, boolean>;
  customizations: unknown[];
  isPopular: boolean;
  isKidsFriendly: boolean;
};

export type PlaceOrderItem = {
  menuItemId: string;
  quantity: number;
  specialInstructions?: string;
  customizations?: unknown[];
  /** Diner the item is for (casual dining group ordering). */
  dinerId?: string | null;
  /** Groups server-priced lines into a configured Quick Service combo. */
  comboGroup?: string | null;
};

export type PlaceOrderInput = {
  restaurantId: string;
  /** Omit for a quick_service (counter) order placed without a table session. */
  tableSessionId?: string | null;
  items: PlaceOrderItem[];
  idempotencyKey?: string;
  serviceModel?: ServiceModel;
  waitlistEntryId?: string | null;
  pickupSlotStart?: string | null;
};

export type CustomerOrderStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready'
  | 'delivered' | 'completed' | 'cancelled';

export type CustomerPaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type CustomerFulfillmentStatus = 'received' | 'preparing' | 'checking' | 'ready' | 'delivered' | 'picked_up' | 'cancelled';

export type CustomerOrder = {
  id: string;
  orderNumber: string;
  restaurantId: string;
  restaurantName: string;
  restaurantPhoto: string | null;
  tableId: string | null;
  tableNumber: string | null;
  tableSessionId: string | null;
  partySize: number;
  status: CustomerOrderStatus;
  serviceModel: ServiceModel | null;
  paymentStatus: CustomerPaymentStatus;
  fulfillmentStatus: CustomerFulfillmentStatus;
  pickupCode: string | null;
  pickupExpiresAt: string | null;
  subtotal: number;
  total: number;
  estimatedTime: number | null;
  createdAt: string;
  updatedAt: string;
  rating: number | null;
  items: {
    id: string;
    menuItemId: string;
    name: string;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    status: string;
    specialInstructions: string | null;
    expectedReadyAt: string | null;
    preparedByName: string | null;
  }[];
};

export type CustomerReservation = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantPhoto: string | null;
  confirmationCode: string;
  reservationTime: string;
  partySize: number;
  specialRequests: string | null;
  status: string;
  createdAt: string;
};

export type KidActivity = {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  status: 'available' | 'coming_soon';
};

export type CustomerWaitlistEntry = {
  id: string;
  restaurantId: string;
  partySize: number;
  preference: string;
  status: string;
  hasKids: boolean;
  position: number;
  estimatedWaitMinutes: number | null;
  tableNumber: string | null;
  createdAt: string;
};

export type WaitlistOccupancyLevel = 'baixa' | 'media' | 'alta' | 'indisponivel';

export type CustomerWaitlistStats = {
  restaurantId: string;
  groupsWaiting: number;
  estimatedWaitMinutes: number;
  occupancyLevel: WaitlistOccupancyLevel;
  occupancyRatio: number | null;
};

/** Live "Status Agora" for a restaurant card / page. */
export type RestaurantLiveStatus = {
  restaurantId: string;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  groupsWaiting: number;
  estimatedWaitMinutes: number;
  occupancyLevel: WaitlistOccupancyLevel;
  occupancyRatio: number | null;
  occupancyPercent: number | null;
  tablesTotal: number;
  tablesOccupied: number;
};

export type CustomerNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  relatedId: string | null;
  relatedType: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
};

export type ReservationGuest = {
  id: string;
  name: string;
  status: string;
  isHost: boolean;
};

export type CustomerReview = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantPhoto: string | null;
  orderId: string | null;
  rating: number;
  comment: string | null;
  ownerResponse: string | null;
  createdAt: string;
};

export type PaymentMethodType = 'pix' | 'credit_card' | 'debit_card' | 'apple_pay' | 'google_pay' | 'tap_to_pay' | 'wallet';

export type TableCheckoutResult = {
  simulated: boolean;
  sessionReleased: boolean;
  tableClosed: boolean;
  receiptId: string;
  orderId: string | null;
  restaurantId: string;
  total: number;
  tip: number;
  charged: number;
  cashback: number;
  pointsAwarded: number;
  familyTier: 'bronze' | 'silver' | 'gold' | null;
  familyVisitCount: number | null;
  visitsUntilNextReward: number | null;
  tablePaidCount: number | null;
  tableTotalCount: number | null;
};

export type DigitalReceiptItem = { name: string; quantity: number; unitPrice: number; totalPrice: number };

export type DigitalReceipt = {
  simulated: boolean;
  id: string;
  restaurantName: string;
  restaurantCnpj: string | null;
  items: DigitalReceiptItem[];
  subtotal: number;
  serviceFeePercent: number;
  serviceFee: number;
  discount: number;
  discountReason: string | null;
  total: number;
  tip: number;
  paymentMethod: PaymentMethodType;
  cashback: number;
  pointsAwarded: number;
  familyTier: string | null;
  familyVisitCount: number | null;
  accessKey: string;
  createdAt: string;
};
export type CustomerLoyaltyClaim = {
  code: string;
  title: string;
  pointsCost: number;
  createdAt: string;
};

export type CustomerLoyalty = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  points: number;
  totalVisits: number;
  tier: string;
  lastVisit: string | null;
  claimedRewards: CustomerLoyaltyClaim[];
};
export type CustomerPromotion = { id: string; restaurantId: string; code: string; title: string; description: string | null; validUntil: string };

export type CustomerPaymentMethod = {
  id: string;
  methodType: string;
  displayName: string;
  detail: string;
  isDefault: boolean;
};

/** Only non-sensitive card metadata. The full number and CVV never leave the device. */
export type CustomerCardInput = {
  cardType: 'credit_card' | 'debit_card';
  brand: string;
  lastFour: string;
  expMonth: number;
  expYear: number;
  holderName?: string;
  setDefault?: boolean;
};

export type CustomerWalletTransaction = {
  id: string;
  kind: string;
  amount: number;
  description: string;
  restaurantName: string | null;
  createdAt: string;
  cashbackAmount: number | null;
};

export type CustomerWalletSnapshot = {
  walletId: string;
  balance: number;
  cashback: number;
  points: number;
  credits: number;
  currency: 'BRL';
  paymentMethods: CustomerPaymentMethod[];
  transactions: CustomerWalletTransaction[];
  updatedAt: string;
};

export interface CustomerBackend {
  restoreAuth(): Promise<boolean>;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: { email: string; password: string; fullName: string; emailRedirectTo: string }): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  getProfile(): Promise<CustomerProfile>;
  updateProfile(patch: Partial<Pick<CustomerProfile, 'fullName' | 'phone' | 'avatarUrl' | 'favoriteCuisines' | 'dietaryRestrictions' | 'preferences'>>): Promise<CustomerProfile>;
  uploadProfileAvatar(uri: string, contentType?: string): Promise<CustomerProfile>;
  checkUsernameAvailability(username: string): Promise<UsernameAvailability>;
  /** Returns the stored (normalized) username. */
  setUsername(username: string): Promise<string>;
  listRestaurants(input?: {
    search?: string;
    cuisine?: string;
    serviceType?: string;
    /** Restaurants must offer *all* of these (jsonb containment on service_config). */
    amenities?: string[];
    /** quick_service only: restaurant_service_configs.skip_the_line_enabled = true. */
    skipTheLine?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<Page<CustomerRestaurant>>;
  getRestaurant(id: string): Promise<CustomerRestaurant>;
  getRestaurantCapabilities(restaurantId: string, serviceModel: ServiceModel): Promise<RestaurantCapabilityContract>;
  getRestaurantLiveStatus(id: string): Promise<RestaurantLiveStatus | null>;
  listRestaurantsLiveStatus(ids: string[]): Promise<Record<string, RestaurantLiveStatus>>;
  getMenu(restaurantId: string): Promise<{ categories: CustomerMenuCategory[]; items: CustomerMenuItem[] }>;
  getActiveVisit(): Promise<VisitSession | null>;
  openTableSession(qrData: string): Promise<VisitSession>;
  resolveServiceQr(qrData: string): Promise<ServiceQrResolution>;
  checkIn(qrData: string, serviceModel: 'fine_dining' | 'casual_dining'): Promise<VisitSession>;
  /** Development only. Same as checkIn without the reservation/waitlist requirement; gated by the database dev flag. */
  devCheckIn(qrData: string, serviceModel: 'fine_dining' | 'casual_dining'): Promise<VisitSession>;
  /** Development only. Returns a real table QR so the emulator can open a comanda without the camera. */
  devPickTableQr(restaurantId?: string): Promise<{ qrCodeData: string; restaurantId: string; tableNumber: string }>;
  /** Development only. Marks the caller's order ready so the prep wait can be skipped. */
  devSkipPrep(orderId: string): Promise<void>;
  leaveTableSession(tableSessionId: string): Promise<void>;
  placeOrder(input: PlaceOrderInput): Promise<CustomerOrder>;
  startPayment(input: { orderId: string; paymentMethod: string; idempotencyKey?: string }): Promise<{
    transactionId: string; orderId: string; paymentStatus: CustomerPaymentStatus; idempotentReplay: boolean; simulated: boolean;
  }>;
  /** quick_service "Monte seu Combo": places a pickup order for 1 lanche + 1 acompanhamento + 1 bebida at 20% off, computed server-side. */
  orderCustomCombo(input: {
    restaurantId: string;
    lancheItemId: string;
    acompanhamentoItemId: string;
    bebidaItemId: string;
  }): Promise<CustomerOrder>;
  listOrders(limit?: number, cursor?: string): Promise<Page<CustomerOrder>>;
  getOrder(id: string): Promise<CustomerOrder>;
  cancelOrder(id: string, reason?: string): Promise<CustomerOrder>;
  listReservations(): Promise<CustomerReservation[]>;
  createReservation(input: { restaurantId: string; reservationTime: string; partySize: number; specialRequests?: string }): Promise<CustomerReservation>;
  cancelReservation(id: string, reason?: string): Promise<CustomerReservation>;
  listReservationAvailability(restaurantId: string, slots: string[]): Promise<{ slot: string; remaining: number }[]>;
  createReservationInvite(id: string): Promise<string>;
  listReservationGuests(id: string): Promise<ReservationGuest[]>;
  acceptReservationInvite(token: string): Promise<void>;
  listMyWaitlist(): Promise<CustomerWaitlistEntry[]>;
  joinWaitlist(input: { restaurantId: string; partySize: number; preference?: string; hasKids?: boolean }): Promise<CustomerWaitlistEntry>;
  updateWaitlist(id: string, action: 'cancel' | 'arrive'): Promise<CustomerWaitlistEntry>;
  setWaitlistHasKids(id: string, hasKids: boolean): Promise<CustomerWaitlistEntry>;
  getWaitlistStats(restaurantId: string): Promise<CustomerWaitlistStats>;
  callWaiter(input: { restaurantId: string; tableId: string; type: string; message?: string }): Promise<unknown>;
  getTableFamilyMode(tableSessionId: string): Promise<boolean>;
  setTableFamilyMode(tableSessionId: string, enabled: boolean): Promise<boolean>;
  listKidActivities(): Promise<KidActivity[]>;
  createSpecialRequest(input: {
    restaurantId: string;
    requestType: 'birthday' | 'accessibility' | 'vip' | 'dietary' | 'courtesy' | 'photo' | 'other';
    title: string;
    description: string;
    tableSessionId?: string | null;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
  createTableInvite(tableSessionId: string): Promise<string>;
  joinTableInvite(token: string): Promise<VisitSession>;
  getTableBill(tableSessionId: string): Promise<TableBill>;
  listTableDiners(tableSessionId: string): Promise<TableDiner[]>;
  addTableCompanion(input: {
    tableSessionId: string;
    name: string;
    isKid?: boolean;
    kidAge?: number;
    kidAllergies?: string;
  }): Promise<TableDiner>;
  removeTableCompanion(dinerId: string): Promise<void>;
  searchUsersForTable(tableSessionId: string, query: string): Promise<TableUserSearchResult[]>;
  sendTableUserInvite(tableSessionId: string, username: string): Promise<TableUserInvite>;
  cancelTableUserInvite(inviteId: string): Promise<TableUserInvite>;
  acceptTableUserInvite(inviteId: string): Promise<AcceptTableUserInviteResult>;
  declineTableUserInvite(inviteId: string): Promise<TableUserInvite | null>;
  listIncomingTableInvites(): Promise<TableUserInvite[]>;
  getTableUserInvites(inviteIds: string[]): Promise<TableUserInvite[]>;
  listTableSessionUserInvites(tableSessionId: string): Promise<TableUserInvite[]>;
  listFavorites(): Promise<CustomerRestaurant[]>;
  setFavorite(restaurantId: string, favorite: boolean): Promise<void>;
  listNotifications(limit?: number, cursor?: string): Promise<Page<CustomerNotification>>;
  clearNotifications(): Promise<number>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  getUnreadNotificationCount(): Promise<number>;
  registerPushToken(token: string, platform: 'ios' | 'android', deviceInfo?: Record<string, unknown>): Promise<void>;
  listMyReviews(): Promise<CustomerReview[]>;
  createReview(input: {
    orderId: string;
    restaurantId: string;
    rating?: number;
    comment?: string;
    foodRating?: number;
    serviceRating?: number;
    ambianceRating?: number;
    tags?: string[];
  }): Promise<CustomerReview>;
  payTableBill(input: {
    tableSessionId: string;
    tipPercent: number;
    paymentMethod: PaymentMethodType;
    splitMode?: 'mine' | 'equal' | 'byItem' | 'fixed';
    itemIds?: string[];
    baseAmount?: number;
    idempotencyKey?: string;
  }): Promise<TableCheckoutResult>;
  getReceipt(receiptId: string): Promise<DigitalReceipt>;
  getLatestReviewableOrder(restaurantId: string): Promise<string | null>;
  updateReview(id: string, input: { rating: number; comment?: string }): Promise<void>;
  deleteReview(id: string): Promise<void>;
  reportReview(id: string, reason: string, details?: string): Promise<void>;
  listLoyalty(): Promise<CustomerLoyalty[]>;
  redeemLoyaltyReward(programId: string, rewardCode: string): Promise<void>;
  listPromotions(restaurantId?: string): Promise<CustomerPromotion[]>;
  redeemPromotion(id: string): Promise<void>;
  getWalletSnapshot(): Promise<CustomerWalletSnapshot>;
  addPixPaymentMethod(pixKey: string, setDefault?: boolean): Promise<CustomerWalletSnapshot>;
  addCardPaymentMethod(input: CustomerCardInput): Promise<CustomerWalletSnapshot>;
  setDefaultPaymentMethod(id: string): Promise<CustomerWalletSnapshot>;
  removePaymentMethod(id: string): Promise<CustomerWalletSnapshot>;
  transferWallet(input: { recipientUsername: string; amount: number; idempotencyKey?: string }): Promise<CustomerWalletSnapshot>;
  exportUserData(): Promise<unknown>;
  requestAccountDeletion(): Promise<void>;
  subscribeToWalletChanges(onChange: () => void): Promise<RealtimeChannel>;
  subscribeToUserChanges(onChange: () => void): Promise<RealtimeChannel>;
  subscribeToWaitlistChanges(restaurantId: string, onChange: () => void): Promise<RealtimeChannel>;
  subscribeToOrderChanges(orderId: string, onChange: () => void): Promise<RealtimeChannel>;
  /** Invites addressed to me and, when given, every invite of that table session. */
  subscribeToTableInvites(tableSessionId: string | null, onChange: (change: TableInviteChange | null) => void): Promise<RealtimeChannel>;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapRestaurant(row: RestaurantRow): CustomerRestaurant {
  const settings = objectValue(row.settings);
  const customerExperience = objectValue(settings.customer_experience);
  const photos = [
    ...stringArray(settings.gallery),
    row.banner_url,
    row.cover_image_url,
    row.logo_url,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    address: String(row.address ?? ''),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    cuisineTypes: stringArray(row.cuisine_types),
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null,
    bannerUrl: typeof row.banner_url === 'string' ? row.banner_url : null,
    photos: [...new Set(photos)],
    openingHours: objectValue(row.opening_hours),
    rating: numberValue(row.rating),
    totalReviews: numberValue(row.total_reviews),
    averagePriceCents: row.average_price_cents == null ? null : numberValue(row.average_price_cents),
    lat: row.lat == null ? null : numberValue(row.lat),
    lng: row.lng == null ? null : numberValue(row.lng),
    serviceConfig: objectValue(row.service_config),
    customerExperience: Object.keys(customerExperience).length > 0
      ? customerExperience as CustomerExperienceConfig
      : null,
    serviceType: String(row.service_type ?? ''),
  };
}

function mapOrder(row: Record<string, unknown>): CustomerOrder {
  const restaurant = objectValue(row.restaurant);
  const table = objectValue(row.table);
  const rawItems = Array.isArray(row.order_items) ? row.order_items : [];
  const reviews = Array.isArray(row.reviews) ? row.reviews : [];
  const review = reviews.length ? objectValue(reviews[0]) : {};
  return {
    id: String(row.id),
    orderNumber: String(row.pickup_code ?? `#${(parseInt(String(row.id).replaceAll('-', '').slice(0, 8), 16) % 10000).toString().padStart(4, '0')}`),
    restaurantId: String(row.restaurant_id),
    restaurantName: String(restaurant.name ?? row.restaurant_name ?? 'Restaurante'),
    restaurantPhoto:
      typeof restaurant.banner_url === 'string' && restaurant.banner_url ? restaurant.banner_url
        : typeof restaurant.logo_url === 'string' && restaurant.logo_url ? restaurant.logo_url
        : null,
    tableId: typeof row.table_id === 'string' ? row.table_id : null,
    tableNumber: typeof table.table_number === 'string' ? table.table_number : null,
    tableSessionId: typeof row.table_session_id === 'string' ? row.table_session_id : null,
    partySize: numberValue(row.party_size) || 1,
    status: String(row.status) as CustomerOrderStatus,
    serviceModel: isServiceModel(row.service_model) ? row.service_model : null,
    paymentStatus: String(row.payment_status ?? 'pending') as CustomerPaymentStatus,
    fulfillmentStatus: String(row.fulfillment_status ?? (
      row.status === 'confirmed' || row.status === 'pending' ? 'received' : row.status
    )) as CustomerFulfillmentStatus,
    pickupCode: optionalString(row.pickup_code),
    pickupExpiresAt: optionalString(row.pickup_expires_at),
    subtotal: numberValue(row.subtotal),
    total: numberValue(row.total_amount),
    estimatedTime: row.estimated_time == null ? null : numberValue(row.estimated_time),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    rating: review.rating == null ? null : numberValue(review.rating),
    items: rawItems.map((raw) => {
      const item = objectValue(raw);
      const menuItem = objectValue(item.menu_item);
      return {
        id: String(item.id),
        menuItemId: String(item.menu_item_id),
        name: String(menuItem.name ?? item.menu_item_name ?? 'Item'),
        imageUrl: typeof menuItem.image_url === 'string' ? menuItem.image_url : null,
        quantity: numberValue(item.quantity),
        unitPrice: numberValue(item.unit_price),
        totalPrice: numberValue(item.total_price),
        status: String(item.status ?? 'pending'),
        specialInstructions: typeof item.special_instructions === 'string' ? item.special_instructions : null,
        expectedReadyAt: typeof item.expected_ready_at === 'string' ? item.expected_ready_at : null,
        preparedByName: null,
      };
    }),
  };
}

function mapReservation(row: Record<string, unknown>): CustomerReservation {
  const restaurant = objectValue(row.restaurant);
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    restaurantName: String(restaurant.name ?? 'Restaurante'),
    restaurantPhoto:
      typeof restaurant.banner_url === 'string' ? restaurant.banner_url
        : typeof restaurant.logo_url === 'string' ? restaurant.logo_url
        : null,
    confirmationCode: String(row.confirmation_code ?? `BN-${String(row.id).replaceAll('-', '').slice(0, 6).toUpperCase()}`),
    reservationTime: String(row.reservation_time),
    partySize: numberValue(row.party_size),
    specialRequests: typeof row.special_requests === 'string' ? row.special_requests : null,
    status: String(row.status),
    createdAt: String(row.created_at),
  };
}

function mapWaitlist(row: Record<string, unknown>): CustomerWaitlistEntry {
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    partySize: numberValue(row.party_size),
    preference: String(row.preference ?? 'qualquer'),
    status: String(row.status),
    hasKids: Boolean(row.has_kids),
    position: numberValue(row.position),
    estimatedWaitMinutes: row.estimated_wait_minutes == null ? null : numberValue(row.estimated_wait_minutes),
    tableNumber: typeof row.table_number === 'string' ? row.table_number : null,
    createdAt: String(row.created_at),
  };
}

const OCCUPANCY_LEVELS: WaitlistOccupancyLevel[] = ['baixa', 'media', 'alta', 'indisponivel'];

function occupancyLevel(value: unknown): WaitlistOccupancyLevel {
  const level = String(value ?? 'indisponivel');
  return (OCCUPANCY_LEVELS as string[]).includes(level) ? (level as WaitlistOccupancyLevel) : 'indisponivel';
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapLiveStatus(value: unknown): RestaurantLiveStatus | null {
  const row = objectValue(value);
  if (!row.restaurantId) return null;
  return {
    restaurantId: String(row.restaurantId),
    isOpen: Boolean(row.isOpen),
    opensAt: optionalString(row.opensAt),
    closesAt: optionalString(row.closesAt),
    groupsWaiting: numberValue(row.groupsWaiting),
    estimatedWaitMinutes: numberValue(row.estimatedWaitMinutes),
    occupancyLevel: occupancyLevel(row.occupancyLevel),
    occupancyRatio: row.occupancyRatio == null ? null : numberValue(row.occupancyRatio),
    occupancyPercent: row.occupancyPercent == null ? null : numberValue(row.occupancyPercent),
    tablesTotal: numberValue(row.tablesTotal),
    tablesOccupied: numberValue(row.tablesOccupied),
  };
}

function mapPublicUserCard(value: unknown): PublicUserCard {
  const row = objectValue(value);
  const username = String(row.username ?? '');
  return {
    userId: String(row.userId ?? ''),
    username,
    displayName: String(row.displayName ?? (username ? `@${username}` : 'Cliente')),
    avatarUrl: optionalString(row.avatarUrl),
  };
}

const TABLE_USER_INVITE_STATES: readonly TableUserInviteState[] = ['invitable', 'already_at_table', 'invite_pending'];

function mapTableUserSearchResult(value: unknown): TableUserSearchResult {
  const row = objectValue(value);
  const state = TABLE_USER_INVITE_STATES.find((item) => item === row.inviteState) ?? 'invitable';
  return { ...mapPublicUserCard(row), inviteState: state };
}

const TABLE_USER_INVITE_STATUSES: readonly TableUserInviteStatus[] = [
  'pending', 'awaiting_capacity', 'accepted', 'declined', 'cancelled', 'expired', 'capacity_rejected',
];

function inviteStatusValue(value: unknown): TableUserInviteStatus {
  return TABLE_USER_INVITE_STATUSES.find((item) => item === value) ?? 'expired';
}

function mapTableUserInvite(value: unknown): TableUserInvite {
  const row = objectValue(value);
  return {
    id: String(row.id ?? ''),
    tableSessionId: String(row.tableSessionId ?? ''),
    restaurantId: String(row.restaurantId ?? ''),
    restaurantName: String(row.restaurantName ?? ''),
    tableId: String(row.tableId ?? ''),
    tableNumber: String(row.tableNumber ?? ''),
    status: inviteStatusValue(row.status),
    closedReason: optionalString(row.closedReason),
    expiresAt: String(row.expiresAt ?? ''),
    respondedAt: optionalString(row.respondedAt),
    createdAt: String(row.createdAt ?? ''),
    capacityRequestId: optionalString(row.capacityRequestId),
    capacityExpiresAt: optionalString(row.capacityExpiresAt),
    inviter: mapPublicUserCard(row.inviter),
    invitee: mapPublicUserCard(row.invitee),
    sentByMe: Boolean(row.sentByMe),
    canCancel: Boolean(row.canCancel),
    canRespond: Boolean(row.canRespond),
  };
}

function mapTableUserInviteList(value: unknown): TableUserInvite[] {
  return (Array.isArray(value) ? value : []).map(mapTableUserInvite);
}

function mapVisitSession(value: unknown): VisitSession | null {
  const row = objectValue(value);
  if (!row.tableSessionId) return null;
  return {
    restaurantId: String(row.restaurantId ?? ''),
    tableId: String(row.tableId ?? ''),
    tableSessionId: String(row.tableSessionId),
    tableNumber: String(row.tableNumber ?? ''),
  };
}

function mapTableDiner(value: unknown): TableDiner {
  const row = objectValue(value);
  return {
    dinerId: String(row.id ?? row.dinerId ?? ''),
    userId: optionalString(row.userId),
    displayName: String(row.displayName ?? 'Convidado'),
    isHost: Boolean(row.isHost),
    isKid: Boolean(row.isKid),
    isMe: Boolean(row.isMe),
    isCompanion: Boolean(row.isCompanion ?? row.userId == null),
    kidAge: row.kidAge == null ? null : numberValue(row.kidAge),
    kidAllergies: optionalString(row.kidAllergies),
  };
}

function mapWaitlistStats(row: Record<string, unknown>): CustomerWaitlistStats {
  return {
    restaurantId: String(row.restaurantId ?? ''),
    groupsWaiting: numberValue(row.groupsWaiting),
    estimatedWaitMinutes: numberValue(row.estimatedWaitMinutes),
    occupancyLevel: occupancyLevel(row.occupancyLevel),
    occupancyRatio: row.occupancyRatio == null ? null : numberValue(row.occupancyRatio),
  };
}

export function mapWalletSnapshot(value: unknown): CustomerWalletSnapshot {
  const row = objectValue(value);
  const rawMethods = Array.isArray(row.paymentMethods) ? row.paymentMethods : [];
  const rawTransactions = Array.isArray(row.transactions) ? row.transactions : [];

  return {
    walletId: String(row.walletId ?? ''),
    balance: numberValue(row.balance),
    cashback: numberValue(row.cashback),
    points: numberValue(row.points),
    credits: numberValue(row.credits),
    currency: 'BRL',
    paymentMethods: rawMethods.map((raw) => {
      const method = objectValue(raw);
      return {
        id: String(method.id),
        methodType: String(method.methodType ?? 'unknown'),
        displayName: String(method.displayName ?? 'Método de pagamento'),
        detail: String(method.detail ?? ''),
        isDefault: Boolean(method.isDefault),
      };
    }),
    transactions: rawTransactions.map((raw) => {
      const transaction = objectValue(raw);
      return {
        id: String(transaction.id),
        kind: String(transaction.kind ?? 'transaction'),
        amount: numberValue(transaction.amount),
        description: String(transaction.description ?? 'Movimentação'),
        restaurantName: typeof transaction.restaurantName === 'string' ? transaction.restaurantName : null,
        createdAt: String(transaction.createdAt ?? new Date().toISOString()),
        cashbackAmount: transaction.cashbackAmount == null ? null : numberValue(transaction.cashbackAmount),
      };
    }),
    updatedAt: String(row.updatedAt ?? new Date().toISOString()),
  };
}

// RLS also lets restaurant staff read their restaurant's rows, so every
// "my …" list in the customer app filters by the signed-in user explicitly —
// otherwise a staff member's app shows other customers' orders and points.
async function requireUserId(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error || !data.user) throw error ?? new Error('Authentication required');
  return data.user.id;
}

async function rpcCheckIn(
  rpc: 'customer_check_in' | 'customer_dev_check_in',
  qrData: string,
  serviceModel: 'fine_dining' | 'casual_dining',
): Promise<VisitSession> {
  const { data, error } = await (getSupabaseClient() as any).rpc(rpc, {
    p_qr_data: qrData,
    p_service_model: serviceModel,
  });
  if (error) throw error;
  if (!data?.tableSessionId && data?.status === 'awaiting_capacity') {
    throw Object.assign(new Error('A recepção precisa liberar um lugar adicional.'), {
      code: 'P0008',
      capacityRequestId: data.capacityRequestId,
    });
  }
  return data as VisitSession;
}

export const customerBackend: CustomerBackend = {
  async restoreAuth() {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    return Boolean(data.session);
  },

  async signIn(email, password) {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw error;
  },

  async signUp(input) {
    const { error } = await getSupabaseClient().auth.signUp({ email: input.email.trim().toLowerCase(), password: input.password, options: { data: { full_name: input.fullName.trim() }, emailRedirectTo: input.emailRedirectTo } });
    if (error) throw error;
  },

  async requestPasswordReset(email, redirectTo) {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error) throw error;
  },

  async signOut() {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
  },
  async getProfile() {
    const userId = await requireUserId();
    const { data, error } = await getSupabaseClient().from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return {
      id: userId,
      email: typeof row.email === 'string' ? row.email : null,
      fullName: String(row.full_name ?? ''),
      username: String(row.username ?? ''),
      phone: typeof row.phone === 'string' ? row.phone : null,
      avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
      favoriteCuisines: stringArray(row.favorite_cuisines),
      dietaryRestrictions: stringArray(row.dietary_restrictions),
      preferences: objectValue(row.preferences),
    };
  },

  async updateProfile(patch) {
    const userId = await requireUserId();
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.fullName !== undefined) payload.full_name = patch.fullName;
    if (patch.phone !== undefined) payload.phone = patch.phone;
    if (patch.avatarUrl !== undefined) payload.avatar_url = patch.avatarUrl;
    if (patch.favoriteCuisines !== undefined) payload.favorite_cuisines = patch.favoriteCuisines;
    if (patch.dietaryRestrictions !== undefined) payload.dietary_restrictions = patch.dietaryRestrictions;
    if (patch.preferences !== undefined) payload.preferences = patch.preferences;
    const { error } = await getSupabaseClient().from('profiles').update(payload).eq('id', userId);
    if (error) throw error;
    return this.getProfile();
  },

  async checkUsernameAvailability(username) {
    const { data, error } = await getSupabaseClient().rpc('customer_check_username_availability', {
      p_username: username,
    });
    if (error) throw error;
    const row = objectValue(data);
    const reasons = ['invalid_format', 'reserved', 'taken', 'current'] as const;
    return {
      normalized: optionalString(row.normalized),
      available: Boolean(row.available),
      reason: reasons.find((item) => item === row.reason) ?? null,
    };
  },

  async setUsername(username) {
    const { data, error } = await getSupabaseClient().rpc('customer_set_my_username', { p_username: username });
    if (error) throw error;
    return String(objectValue(data).username ?? '');
  },

  async uploadProfileAvatar(uri, contentType = 'image/jpeg') {
    const userId = await requireUserId();
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Não foi possível preparar a imagem selecionada.');
    const file = await response.arrayBuffer();
    const supabase = getSupabaseClient();
    const path = `${userId}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from('user-avatars')
      .upload(path, file, { contentType, upsert: true, cacheControl: '3600' });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('user-avatars').getPublicUrl(path);
    return this.updateProfile({ avatarUrl: `${data.publicUrl}?v=${Date.now()}` });
  },

  async listRestaurants(input = {}) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    let query = getSupabaseClient().from('restaurants').select('*')
      .eq('is_active', true)
      .in('service_type', ['fine_dining', 'casual_dining', 'quick_service'])
      .order('id', { ascending: true }).limit(limit + 1);
    if (input.search?.trim()) query = query.ilike('name', `%${input.search.trim()}%`);
    if (input.cuisine?.trim()) query = query.contains('cuisine_types', [input.cuisine.trim()]);
    if (input.serviceType?.trim()) query = query.eq('service_type', input.serviceType.trim());
    if (input.amenities?.length) {
      // Server-side AND filter: the restaurant must list every requested
      // amenity in service_config.amenities (GIN-indexed jsonb containment).
      query = query.contains('service_config', { amenities: input.amenities });
    }
    if (input.skipTheLine) {
      // skip_the_line_enabled lives on the separate restaurant_service_configs
      // table, not on restaurants itself — resolve the matching ids first.
      const { data: configs, error: configError } = await getSupabaseClient()
        .from('restaurant_service_configs')
        .select('restaurant_id')
        .eq('skip_the_line_enabled', true);
      if (configError) throw configError;
      const ids = (configs ?? []).map((row) => row.restaurant_id);
      if (ids.length === 0) return { data: [], nextCursor: null };
      query = query.in('id', ids);
    }
    if (input.cursor) query = query.gt('id', input.cursor);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as RestaurantRow[];
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    return { data: pageRows.map(mapRestaurant), nextCursor: hasMore ? String(pageRows.at(-1)?.id) : null };
  },

  async getRestaurant(id) {
    const { data, error } = await getSupabaseClient().from('restaurants').select('*')
      .eq('id', id).eq('is_active', true).single();
    if (error) throw error;
    return mapRestaurant(data as RestaurantRow);
  },

  async getRestaurantCapabilities(restaurantId, serviceModel) {
    // database.generated.ts is regenerated after the migration is deployed.
    // Keep this boundary typed in the meantime instead of falling back to a
    // service-type feature registry on the device.
    const client = getSupabaseClient() as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await client.rpc('get_restaurant_model_capabilities_v2', {
      p_restaurant_id: restaurantId,
      p_service_model: serviceModel,
    });
    if (error) throw new Error(error.message);
    const contract = parseRestaurantCapabilityContract(data);
    if (!contract) throw new Error('Resposta de capabilities inválida.');
    return contract;
  },

  async getRestaurantLiveStatus(id) {
    const { data, error } = await getSupabaseClient().rpc('customer_restaurant_live_status', {
      p_restaurant_id: id,
    });
    if (error) throw error;
    return mapLiveStatus(data);
  },

  async listRestaurantsLiveStatus(ids) {
    if (ids.length === 0) return {};
    const { data, error } = await getSupabaseClient().rpc('customer_restaurants_live_status', {
      p_restaurant_ids: ids,
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const byId: Record<string, RestaurantLiveStatus> = {};
    for (const raw of rows) {
      const status = mapLiveStatus(raw);
      if (status) byId[status.restaurantId] = status;
    }
    return byId;
  },

  async getMenu(restaurantId) {
    const [categoriesResult, itemsResult] = await Promise.all([
      getSupabaseClient().from('menu_categories').select('*').eq('restaurant_id', restaurantId)
        .eq('is_active', true).order('display_order'),
      getSupabaseClient().from('menu_items').select('*').eq('restaurant_id', restaurantId)
        .eq('is_available', true).order('display_order'),
    ]);
    if (categoriesResult.error) throw categoriesResult.error;
    if (itemsResult.error) throw itemsResult.error;
    return {
      categories: (categoriesResult.data ?? []).map((row) => ({
        id: row.id, name: row.name, description: row.description,
        displayOrder: numberValue(row.display_order),
      })),
      items: (itemsResult.data ?? []).map((row) => ({
        id: row.id, restaurantId: row.restaurant_id, categoryId: row.category_id,
        name: row.name, description: row.description, price: numberValue(row.price),
        originalPrice: row.original_price == null ? null : numberValue(row.original_price),
        imageUrl: row.image_url, preparationTime: row.preparation_time,
        allergens: stringArray(row.allergens), dietaryInfo: objectValue(row.dietary_info) as Record<string, boolean>,
        customizations: Array.isArray(row.customizations) ? row.customizations : [],
        isPopular: Boolean(row.is_popular),
        isKidsFriendly: Boolean((row as Record<string, unknown>).is_kids_friendly),
      })),
    };
  },

  async getActiveVisit() {
    const { data, error } = await getSupabaseClient().rpc('customer_get_active_visit');
    if (error) throw error;
    return data ? data as unknown as VisitSession : null;
  },

  async openTableSession(qrData) {
    const { data, error } = await getSupabaseClient().rpc('customer_open_table_session', { p_qr_data: qrData });
    if (error) throw error;
    return data as unknown as VisitSession;
  },

  async resolveServiceQr(qrData) {
    const { data, error } = await (getSupabaseClient() as any).rpc('customer_resolve_service_qr', { p_qr_data: qrData });
    if (error) throw error;
    return data as ServiceQrResolution;
  },

  async checkIn(qrData, serviceModel) {
    return rpcCheckIn('customer_check_in', qrData, serviceModel);
  },

  async devCheckIn(qrData, serviceModel) {
    return rpcCheckIn('customer_dev_check_in', qrData, serviceModel);
  },

  async devPickTableQr(restaurantId) {
    const { data, error } = await getSupabaseClient().rpc('customer_dev_pick_table_qr', {
      p_restaurant_id: restaurantId ?? null,
    });
    if (error) throw error;
    const row = data as { qrCodeData?: string; restaurantId?: string; tableNumber?: string } | null;
    if (!row?.qrCodeData || !row.restaurantId) {
      throw new Error('Resposta inválida ao simular o QR da mesa.');
    }
    return {
      qrCodeData: row.qrCodeData,
      restaurantId: row.restaurantId,
      tableNumber: String(row.tableNumber ?? ''),
    };
  },

  async devSkipPrep(orderId) {
    const { error } = await getSupabaseClient().rpc('customer_dev_skip_prep', { p_order_id: orderId });
    if (error) throw error;
  },

  async leaveTableSession(tableSessionId) {
    const { error } = await getSupabaseClient().rpc('customer_leave_table_session', {
      p_table_session_id: tableSessionId,
    });
    if (error) throw error;
  },

  async placeOrder(input) {
    const items = input.items.map((item) => ({
      menu_item_id: item.menuItemId, quantity: item.quantity,
      special_instructions: item.specialInstructions,
      customizations: item.customizations ?? [],
      diner_id: item.dinerId ?? null,
      ...(item.comboGroup ? { combo_group: item.comboGroup } : {}),
    }));
    const requestId = input.idempotencyKey ?? Crypto.randomUUID();
    const { data, error } = input.serviceModel
      ? await (getSupabaseClient() as any).rpc('customer_create_order_v2', {
          p_restaurant_id: input.restaurantId,
          p_service_model: input.serviceModel,
          p_items: items,
          p_client_request_id: requestId,
          p_table_session_id: input.tableSessionId ?? null,
          p_waitlist_entry_id: input.waitlistEntryId ?? null,
          p_pickup_slot_start: input.pickupSlotStart ?? null,
        })
      : await getSupabaseClient().rpc('customer_place_order', {
          p_restaurant_id: input.restaurantId,
          p_table_session_id: input.tableSessionId ?? null,
          p_items: items,
          p_client_request_id: requestId,
        });
    if (error) throw error;
    return mapOrder(data as unknown as Record<string, unknown>);
  },

  async startPayment(input) {
    const { data, error } = await (getSupabaseClient() as any).rpc('customer_start_payment', {
      p_order_id: input.orderId,
      p_payment_method: input.paymentMethod,
      p_idempotency_key: input.idempotencyKey ?? Crypto.randomUUID(),
    });
    if (error) throw error;
    const row = objectValue(data);
    return {
      transactionId: String(row.transactionId ?? ''),
      orderId: String(row.orderId ?? input.orderId),
      paymentStatus: String(row.paymentStatus ?? 'pending') as CustomerPaymentStatus,
      idempotentReplay: Boolean(row.idempotentReplay),
      simulated: Boolean(row.simulated),
    };
  },

  async orderCustomCombo(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_order_custom_combo', {
      p_restaurant_id: input.restaurantId,
      p_lanche_item_id: input.lancheItemId,
      p_acompanhamento_item_id: input.acompanhamentoItemId,
      p_bebida_item_id: input.bebidaItemId,
    });
    if (error) throw error;
    return mapOrder(data as unknown as Record<string, unknown>);
  },

  async listOrders(limit = 30, cursor) {
    const userId = await requireUserId();
    let query = getSupabaseClient().from('orders').select(
      '*, restaurant:restaurants(name, logo_url, banner_url), table:tables(table_number), order_items(*, menu_item:menu_items(name, image_url)), reviews(rating)',
    ).eq('customer_id', userId).is('reviews.deleted_at', null).order('created_at', { ascending: false }).limit(limit + 1);
    if (cursor) query = query.lt('created_at', cursor);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const pageRows = rows.slice(0, limit);
    return { data: pageRows.map(mapOrder), nextCursor: rows.length > limit ? String(pageRows.at(-1)?.created_at) : null };
  },

  async getOrder(id) {
    const { data, error } = await getSupabaseClient().from('orders').select(
      '*, restaurant:restaurants(name, logo_url, banner_url), table:tables(table_number), order_items(*, menu_item:menu_items(name, image_url)), reviews(rating)',
    ).eq('id', id).is('reviews.deleted_at', null).single();
    if (error) throw error;
    const order = mapOrder(data as unknown as Record<string, unknown>);

    const { data: preparers } = await getSupabaseClient().rpc('customer_get_order_item_preparers', { p_order_id: id });
    if (preparers) {
      const nameByItemId = new Map(
        (preparers as { order_item_id: string; chef_name: string | null }[]).map((row) => [row.order_item_id, row.chef_name]),
      );
      order.items = order.items.map((item) => ({ ...item, preparedByName: nameByItemId.get(item.id) ?? null }));
    }

    return order;
  },

  async cancelOrder(id, reason) {
    const { data, error } = await getSupabaseClient().rpc('customer_cancel_order', { p_order_id: id, p_reason: reason ?? null });
    if (error) throw error;
    return mapOrder(data as unknown as Record<string, unknown>);
  },

  async listReservations() {
    const userId = await requireUserId();
    const { data, error } = await getSupabaseClient().from('reservations')
      .select('*, restaurant:restaurants(name, logo_url, banner_url)').eq('customer_id', userId)
      .order('reservation_time', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapReservation(row as unknown as Record<string, unknown>));
  },

  async createReservation(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_create_reservation', {
      p_restaurant_id: input.restaurantId, p_reservation_time: input.reservationTime,
      p_party_size: input.partySize, p_special_requests: input.specialRequests ?? null,
    });
    if (error) throw error;
    return mapReservation(data as unknown as Record<string, unknown>);
  },

  async cancelReservation(id, reason) {
    const { data, error } = await getSupabaseClient().rpc('customer_cancel_reservation', {
      p_reservation_id: id, p_reason: reason ?? null,
    });
    if (error) throw error;
    return mapReservation(data as unknown as Record<string, unknown>);
  },

  async listReservationAvailability(restaurantId, slots) {
    // database.generated.ts is regenerated after the migration is deployed.
    // Cast the client to bypass the typed RPC surface until then.
    const client = getSupabaseClient() as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await client.rpc('customer_reservation_availability', {
      p_restaurant_id: restaurantId,
      p_slots: slots,
    });
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];
    return rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return { slot: String(row.slot), remaining: Number(row.remaining ?? 0) };
    });
  },

  async createReservationInvite(id) {
    const { data, error } = await getSupabaseClient().rpc('customer_create_reservation_invite', { p_reservation_id: id });
    if (error) throw error;
    return String(data);
  },

  async listReservationGuests(id) {
    const { data, error } = await getSupabaseClient().from('reservation_guests')
      .select('id, guest_name, status, is_host, guest:profiles!reservation_guests_guest_user_id_fkey(full_name)')
      .eq('reservation_id', id)
      .order('is_host', { ascending: false })
      .order('invited_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((raw) => {
      const row = raw as unknown as Record<string, unknown>;
      const guest = objectValue(row.guest);
      return {
        id: String(row.id),
        name: String(guest.full_name ?? row.guest_name ?? 'Convidado pendente'),
        status: String(row.status ?? 'pending'),
        isHost: Boolean(row.is_host),
      };
    });
  },

  async acceptReservationInvite(token) {
    const { error } = await getSupabaseClient().rpc('customer_accept_reservation_invite', { p_token: token });
    if (error) throw error;
  },

  async listMyWaitlist() {
    await requireUserId();
    // RPC instead of a table select: it returns the live queue position (the
    // stored one is frozen at join time) and is scoped to auth.uid(), so staff
    // RLS on the same account never leaks other customers' entries.
    const { data, error } = await getSupabaseClient().rpc('customer_my_waitlist');
    if (error) throw error;
    return ((data ?? []) as unknown[]).map((row) => mapWaitlist(row as Record<string, unknown>));
  },

  async joinWaitlist(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_join_waitlist', {
      p_restaurant_id: input.restaurantId, p_party_size: input.partySize,
      p_preference: input.preference ?? 'qualquer', p_has_kids: input.hasKids ?? false,
    });
    if (error) throw error;
    return mapWaitlist(data as unknown as Record<string, unknown>);
  },

  async updateWaitlist(id, action) {
    const { data, error } = await getSupabaseClient().rpc('customer_update_waitlist', { p_entry_id: id, p_action: action });
    if (error) throw error;
    return mapWaitlist(data as unknown as Record<string, unknown>);
  },

  async setWaitlistHasKids(id, hasKids) {
    const { data, error } = await getSupabaseClient().rpc('customer_set_waitlist_has_kids', {
      p_entry_id: id, p_has_kids: hasKids,
    });
    if (error) throw error;
    return mapWaitlist(data as unknown as Record<string, unknown>);
  },

  async getWaitlistStats(restaurantId) {
    const { data, error } = await getSupabaseClient().rpc('customer_waitlist_stats', { p_restaurant_id: restaurantId });
    if (error) throw error;
    return mapWaitlistStats(data as unknown as Record<string, unknown>);
  },

  async callWaiter(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_call_waiter', {
      p_restaurant_id: input.restaurantId, p_table_id: input.tableId,
      p_message: input.message ?? null, p_call_type: input.type,
    });
    if (error) throw error;
    return data;
  },

  async getTableFamilyMode(tableSessionId) {
    const { data, error } = await getSupabaseClient().rpc('customer_get_table_family_mode', {
      p_table_session_id: tableSessionId,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async setTableFamilyMode(tableSessionId, enabled) {
    const { data, error } = await getSupabaseClient().rpc('customer_set_table_family_mode', {
      p_table_session_id: tableSessionId, p_enabled: enabled,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async listKidActivities() {
    const { data, error } = await getSupabaseClient().rpc('customer_list_kid_activities');
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map((raw) => {
      const row = objectValue(raw);
      return {
        key: String(row.key),
        title: String(row.title),
        subtitle: String(row.subtitle ?? ''),
        icon: String(row.icon ?? 'sparkles-outline'),
        status: row.status === 'coming_soon' ? 'coming_soon' : 'available',
      } as KidActivity;
    });
  },

  async createSpecialRequest(input) {
    const { data, error } = await getSupabaseClient().rpc('create_restaurant_special_request', {
      p_restaurant_id: input.restaurantId,
      p_request_type: input.requestType,
      p_title: input.title,
      p_description: input.description,
      p_table_id: null,
      p_table_session_id: input.tableSessionId ?? null,
      p_reservation_id: null,
      p_customer_id: null,
      p_action_label: input.actionLabel ?? null,
      p_priority: 3,
      p_due_at: null,
      p_metadata: input.metadata ?? {},
    });
    if (error) throw error;
    return data;
  },

  async createTableInvite(tableSessionId) {
    const { data, error } = await getSupabaseClient().rpc('customer_create_table_invite', {
      p_table_session_id: tableSessionId,
    });
    if (error) throw error;
    return data as unknown as string;
  },

  async joinTableInvite(token) {
    const { data, error } = await getSupabaseClient().rpc('customer_join_table_invite', { p_token: token });
    if (error) throw error;
    if (!(data as any)?.tableSessionId && (data as any)?.status === 'awaiting_capacity') {
      throw Object.assign(new Error('A recepção precisa liberar um lugar adicional.'), {
        code: 'P0008',
        capacityRequestId: (data as any).capacityRequestId,
      });
    }
    return data as unknown as VisitSession;
  },

  async getTableBill(tableSessionId) {
    const { data, error } = await getSupabaseClient().rpc('customer_get_table_bill', {
      p_table_session_id: tableSessionId,
    });
    if (error) throw error;
    const raw = objectValue(data);
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const rawParticipants = Array.isArray(raw.participants) ? raw.participants : [];
    return {
      tableSessionId: String(raw.tableSessionId ?? tableSessionId),
      participants: rawParticipants.map(mapTableDiner),
      items: rawItems.map((value) => {
        const item = objectValue(value);
        return {
          orderItemId: String(item.orderItemId),
          orderId: String(item.orderId),
          menuItemId: String(item.menuItemId),
          name: String(item.name ?? 'Item'),
          quantity: numberValue(item.quantity),
          unitPrice: numberValue(item.unitPrice),
          totalPrice: numberValue(item.totalPrice),
          placedBy: String(item.placedBy ?? ''),
          placedByName: String(item.placedByName ?? 'Convidado'),
          placedByIsMe: Boolean(item.placedByIsMe),
          dinerId: optionalString(item.dinerId),
          dinerName: String(item.dinerName ?? item.placedByName ?? 'Convidado'),
          dinerIsKid: Boolean(item.dinerIsKid),
          status: String(item.status ?? 'pending'),
          specialInstructions: optionalString(item.specialInstructions),
          description: optionalString(item.description),
          imageUrl: optionalString(item.imageUrl),
        };
      }),
      subtotal: numberValue(raw.subtotal),
      serviceFeePercent: numberValue(raw.serviceFeePercent),
      serviceFee: numberValue(raw.serviceFee),
    };
  },

  async listTableDiners(tableSessionId) {
    const { data, error } = await getSupabaseClient().rpc('customer_list_table_diners', {
      p_table_session_id: tableSessionId,
    });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(mapTableDiner);
  },

  async addTableCompanion(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_add_table_companion', {
      p_table_session_id: input.tableSessionId,
      p_name: input.name.trim(),
      p_is_kid: input.isKid ?? false,
      p_kid_age: input.kidAge ?? null,
      p_kid_allergies: input.kidAllergies ?? null,
    });
    if (error) throw error;
    if ((data as any)?.status === 'awaiting_capacity') {
      throw Object.assign(new Error('A recepção precisa liberar um lugar adicional.'), {
        code: 'P0008',
        capacityRequestId: (data as any).capacityRequestId,
      });
    }
    return mapTableDiner(data);
  },

  async removeTableCompanion(dinerId) {
    const { error } = await getSupabaseClient().rpc('customer_remove_table_companion', {
      p_diner_id: dinerId,
    });
    if (error) throw error;
  },

  async searchUsersForTable(tableSessionId, query) {
    const { data, error } = await getSupabaseClient().rpc('customer_search_users_for_table', {
      p_table_session_id: tableSessionId,
      p_query: query,
    });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(mapTableUserSearchResult);
  },

  async sendTableUserInvite(tableSessionId, username) {
    const { data, error } = await getSupabaseClient().rpc('customer_send_table_user_invite', {
      p_table_session_id: tableSessionId,
      p_invitee_username: username,
    });
    if (error) throw error;
    return mapTableUserInvite(data);
  },

  async cancelTableUserInvite(inviteId) {
    const { data, error } = await getSupabaseClient().rpc('customer_cancel_table_user_invite', {
      p_invite_id: inviteId,
    });
    if (error) throw error;
    return mapTableUserInvite(data);
  },

  async acceptTableUserInvite(inviteId) {
    const { data, error } = await getSupabaseClient().rpc('customer_accept_table_user_invite', {
      p_invite_id: inviteId,
    });
    if (error) throw error;
    const row = objectValue(data);
    return {
      status: inviteStatusValue(row.status),
      visit: mapVisitSession(row.visit),
      capacityRequestId: optionalString(row.capacityRequestId),
      invite: row.invite ? mapTableUserInvite(row.invite) : null,
      idempotentReplay: Boolean(row.idempotentReplay),
    };
  },

  async declineTableUserInvite(inviteId) {
    const { data, error } = await getSupabaseClient().rpc('customer_decline_table_user_invite', {
      p_invite_id: inviteId,
    });
    if (error) throw error;
    const row = objectValue(data);
    return row.invite ? mapTableUserInvite(row.invite) : null;
  },

  async listIncomingTableInvites() {
    const { data, error } = await getSupabaseClient().rpc('customer_list_incoming_table_invites');
    if (error) throw error;
    return mapTableUserInviteList(data);
  },

  async getTableUserInvites(inviteIds) {
    if (inviteIds.length === 0) return [];
    const { data, error } = await getSupabaseClient().rpc('customer_get_table_user_invites', {
      p_invite_ids: inviteIds,
    });
    if (error) throw error;
    return mapTableUserInviteList(data);
  },

  async listTableSessionUserInvites(tableSessionId) {
    const { data, error } = await getSupabaseClient().rpc('customer_list_table_session_user_invites', {
      p_table_session_id: tableSessionId,
    });
    if (error) throw error;
    return mapTableUserInviteList(data);
  },

  async listFavorites() {
    const userId = await requireUserId();
    const { data, error } = await getSupabaseClient().from('favorites')
      .select('restaurant:restaurants(*)').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).flatMap((row) => row.restaurant ? [mapRestaurant(row.restaurant as unknown as RestaurantRow)] : []);
  },

  async setFavorite(restaurantId, favorite) {
    const userId = await requireUserId();
    const result = favorite
      ? await getSupabaseClient().from('favorites').upsert({ user_id: userId, restaurant_id: restaurantId }, { onConflict: 'user_id,restaurant_id' })
      : await getSupabaseClient().from('favorites').delete().eq('user_id', userId).eq('restaurant_id', restaurantId);
    if (result.error) throw result.error;
  },

  async listNotifications(limit = 20, cursor) {
    const { data, error } = await getSupabaseClient().rpc('customer_list_notifications', {
      p_limit: limit,
      p_cursor: cursor ?? null,
    });
    if (error) throw error;
    const page = objectValue(data);
    const rows = Array.isArray(page.data) ? page.data : [];
    return { data: rows.map((raw) => {
      const row = objectValue(raw);
      return {
        id: String(row.id), title: String(row.title), message: String(row.message),
        type: String(row.notification_type ?? 'system'),
        relatedId: typeof row.related_id === 'string' ? row.related_id : null,
        relatedType: typeof row.related_type === 'string' ? row.related_type : null,
        metadata: objectValue(row.metadata),
        isRead: Boolean(row.is_read), createdAt: String(row.created_at),
      };
    }), nextCursor: typeof page.next_cursor === 'string' ? page.next_cursor : null };
  },

  async clearNotifications() {
    const { data, error } = await getSupabaseClient().rpc('clear_my_notifications');
    if (error) throw error;
    return numberValue(data);
  },

  async markNotificationRead(id) {
    const { error } = await getSupabaseClient().rpc('mark_notification_read', { p_notification_id: id });
    if (error) throw error;
  },

  async markAllNotificationsRead() {
    const { error } = await getSupabaseClient().rpc('mark_all_notifications_read');
    if (error) throw error;
  },

  async getUnreadNotificationCount() {
    const { data, error } = await getSupabaseClient().rpc('get_notification_unread_count');
    if (error) throw error;
    return numberValue(data);
  },

  async registerPushToken(token, platform, deviceInfo = {}) {
    const { error } = await getSupabaseClient().rpc('customer_register_push_token', {
      p_token: token, p_platform: platform, p_device_info: deviceInfo,
    });
    if (error) throw error;
  },

  async listMyReviews() {
    const userId = await requireUserId();
    const { data, error } = await getSupabaseClient().from('reviews')
      .select('*, restaurant:restaurants!inner(name, logo_url, banner_url, is_active)')
      .eq('user_id', userId)
      .eq('restaurant.is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const restaurant = objectValue(row.restaurant);
      return {
        id: row.id,
        restaurantId: row.restaurant_id,
        restaurantName: String(restaurant.name ?? ''),
        restaurantPhoto: optionalString(restaurant.banner_url) ?? optionalString(restaurant.logo_url),
        orderId: row.order_id,
        rating: numberValue(row.rating),
        comment: row.comment,
        ownerResponse: row.owner_response,
        createdAt: row.created_at,
      };
    });
  },

  async createReview(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_create_review', {
      p_order_id: input.orderId, p_restaurant_id: input.restaurantId,
      p_rating: input.rating ?? null, p_comment: input.comment ?? null,
      p_food_rating: input.foodRating ?? null, p_service_rating: input.serviceRating ?? null,
      p_ambiance_rating: input.ambianceRating ?? null, p_tags: input.tags ?? null,
    });
    if (error) throw error;
    const row = data as unknown as Record<string, unknown>;
    const restaurant = await this.getRestaurant(input.restaurantId);
    return { id: String(row.id), restaurantId: String(row.restaurant_id), restaurantName: restaurant.name, restaurantPhoto: restaurant.bannerUrl ?? restaurant.logoUrl, orderId: typeof row.order_id === 'string' ? row.order_id : null, rating: numberValue(row.rating), comment: typeof row.comment === 'string' ? row.comment : null, ownerResponse: typeof row.owner_response === 'string' ? row.owner_response : null, createdAt: String(row.created_at) };
  },

  async payTableBill(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_pay_table_bill', {
      p_table_session_id: input.tableSessionId,
      p_tip_percent: input.tipPercent,
      p_payment_method: input.paymentMethod,
      p_base_amount: input.baseAmount ?? null,
      p_split_mode: input.splitMode ?? 'mine',
      p_item_ids: input.itemIds ?? null,
      p_idempotency_key: input.idempotencyKey ?? Crypto.randomUUID(),
    });
    if (error) throw error;
    const row = objectValue(data);
    return {
      simulated: row.simulated === true,
      sessionReleased: row.sessionReleased === true,
      tableClosed: row.tableClosed === true,
      receiptId: String(row.receiptId),
      orderId: optionalString(row.orderId),
      restaurantId: String(row.restaurantId ?? ''),
      total: numberValue(row.total),
      tip: numberValue(row.tip),
      charged: numberValue(row.charged),
      cashback: numberValue(row.cashback),
      pointsAwarded: numberValue(row.pointsAwarded),
      familyTier: (row.familyTier as 'bronze' | 'silver' | 'gold' | null) ?? null,
      familyVisitCount: row.familyVisitCount == null ? null : numberValue(row.familyVisitCount),
      visitsUntilNextReward: row.visitsUntilNextReward == null ? null : numberValue(row.visitsUntilNextReward),
      tablePaidCount: row.tablePaidCount == null ? null : numberValue(row.tablePaidCount),
      tableTotalCount: row.tableTotalCount == null ? null : numberValue(row.tableTotalCount),
    };
  },

  async getReceipt(receiptId) {
    const { data, error } = await getSupabaseClient().rpc('customer_get_receipt', { p_receipt_id: receiptId });
    if (error) throw error;
    const row = objectValue(data);
    const rawItems = Array.isArray(row.items) ? row.items : [];
    return {
      id: String(row.id),
      simulated: row.simulated === true,
      restaurantName: String(row.restaurantName ?? 'Restaurante'),
      restaurantCnpj: optionalString(row.restaurantCnpj),
      items: rawItems.map((raw) => {
        const item = objectValue(raw);
        return {
          name: String(item.name ?? 'Item'),
          quantity: numberValue(item.quantity),
          unitPrice: numberValue(item.unitPrice),
          totalPrice: numberValue(item.totalPrice),
        };
      }),
      subtotal: numberValue(row.subtotal),
      serviceFeePercent: numberValue(row.service_fee_percent),
      serviceFee: numberValue(row.service_fee),
      discount: numberValue(row.discount),
      discountReason: optionalString(row.discount_reason),
      total: numberValue(row.total),
      tip: numberValue(row.tip),
      paymentMethod: String(row.payment_method ?? 'pix') as PaymentMethodType,
      cashback: numberValue(row.cashback),
      pointsAwarded: numberValue(row.points_awarded),
      familyTier: optionalString(row.family_tier),
      familyVisitCount: row.family_visit_count == null ? null : numberValue(row.family_visit_count),
      accessKey: String(row.accessKey ?? ''),
      createdAt: String(row.created_at),
    };
  },

  async getLatestReviewableOrder(restaurantId) {
    const { data, error } = await getSupabaseClient().rpc('customer_get_latest_reviewable_order', {
      p_restaurant_id: restaurantId,
    });
    if (error) throw error;
    return optionalString(data);
  },

  async updateReview(id, input) {
    const { error } = await getSupabaseClient().rpc('customer_update_review', { p_review_id: id, p_rating: input.rating, p_comment: input.comment ?? null });
    if (error) throw error;
  },

  async deleteReview(id) {
    const { error } = await getSupabaseClient().rpc('customer_delete_review', { p_review_id: id });
    if (error) throw error;
  },

  async reportReview(id, reason, details) {
    const userId = await requireUserId();
    const { error } = await getSupabaseClient().from('review_reports').upsert({ review_id: id, user_id: userId, reason, details: details ?? null }, { onConflict: 'review_id,user_id' });
    if (error) throw error;
  },

  async listLoyalty() {
    const userId = await requireUserId();
    const { data, error } = await getSupabaseClient().from('loyalty_programs').select('*, restaurant:restaurants(name)')
      .eq('user_id', userId).eq('is_active', true).order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const restaurant = objectValue(row.restaurant);
      const claims = Array.isArray(row.rewards_claimed)
        ? row.rewards_claimed.flatMap((value: unknown) => {
          const claim = objectValue(value);
          if (!claim.code || !claim.title || !claim.created_at) return [];
          return [{
            code: String(claim.code),
            title: String(claim.title),
            pointsCost: numberValue(claim.points_cost),
            createdAt: String(claim.created_at),
          }];
        })
        : [];
      return {
        id: row.id,
        restaurantId: row.restaurant_id,
        restaurantName: String(restaurant.name ?? 'Restaurante'),
        points: numberValue(row.points),
        totalVisits: numberValue(row.total_visits),
        tier: row.tier,
        lastVisit: row.last_visit,
        claimedRewards: claims,
      };
    });
  },

  async redeemLoyaltyReward(programId, rewardCode) {
    const { error } = await getSupabaseClient().rpc('customer_redeem_loyalty_reward', {
      p_loyalty_program_id: programId,
      p_reward_code: rewardCode,
    });
    if (error) throw error;
  },

  async listPromotions(restaurantId) {
    let query = getSupabaseClient().from('promotions').select('*').eq('status', 'active').lte('valid_from', new Date().toISOString()).gte('valid_until', new Date().toISOString()).order('valid_until');
    if (restaurantId) query = query.eq('restaurant_id', restaurantId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, restaurantId: row.restaurant_id, code: row.code, title: row.title, description: row.description, validUntil: row.valid_until }));
  },

  async redeemPromotion(id) {
    const { error } = await getSupabaseClient().rpc('customer_redeem_promotion', { p_promotion_id: id });
    if (error) throw error;
  },

  async getWalletSnapshot() {
    const { data, error } = await getSupabaseClient().rpc('customer_get_wallet_snapshot');
    if (error) throw error;
    return mapWalletSnapshot(data);
  },

  async addPixPaymentMethod(pixKey, setDefault = false) {
    const { data, error } = await getSupabaseClient().rpc('customer_add_pix_payment_method', {
      p_pix_key: pixKey.trim(),
      p_set_default: setDefault,
    });
    if (error) throw error;
    return mapWalletSnapshot(data);
  },

  async addCardPaymentMethod(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_add_card_payment_method', {
      p_card_type: input.cardType,
      p_brand: input.brand,
      p_last_four: input.lastFour,
      p_exp_month: String(input.expMonth),
      p_exp_year: String(input.expYear),
      p_holder_name: input.holderName ?? null,
      p_set_default: input.setDefault ?? false,
    });
    if (error) throw error;
    return mapWalletSnapshot(data);
  },

  async setDefaultPaymentMethod(id) {
    const { data, error } = await getSupabaseClient().rpc('customer_set_default_payment_method', {
      p_payment_method_id: id,
    });
    if (error) throw error;
    return mapWalletSnapshot(data);
  },

  async removePaymentMethod(id) {
    const { data, error } = await getSupabaseClient().rpc('customer_remove_payment_method', {
      p_payment_method_id: id,
    });
    if (error) throw error;
    return mapWalletSnapshot(data);
  },

  async transferWallet(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_transfer_wallet', {
      p_recipient_username: normalizeUsernameInput(input.recipientUsername),
      p_amount: input.amount,
      p_idempotency_key: input.idempotencyKey ?? Crypto.randomUUID(),
    });
    if (error) throw error;
    return mapWalletSnapshot(data);
  },

  async exportUserData() {
    const { data, error } = await getSupabaseClient().rpc('export_user_data');
    if (error) throw error;
    return data;
  },

  async requestAccountDeletion() {
    const { error } = await getSupabaseClient().rpc('request_account_deletion');
    if (error) throw error;
  },

  async subscribeToWalletChanges(onChange) {
    const userId = await requireUserId();
    return getSupabaseClient().channel(`customer-wallet:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_methods', filter: `user_id=eq.${userId}` }, onChange)
      .subscribe();
  },

  async subscribeToUserChanges(onChange) {
    const userId = await requireUserId();
    return getSupabaseClient().channel(`customer:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `customer_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist_entries', filter: `customer_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, onChange)
      .subscribe();
  },

  async subscribeToWaitlistChanges(restaurantId, onChange) {
    const userId = await requireUserId();
    const channelName = `customer-waitlist:${restaurantId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return getSupabaseClient().channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'waitlist_entries', filter: `customer_id=eq.${userId}`,
      }, onChange)
      .subscribe();
  },

  async subscribeToOrderChanges(orderId, onChange) {
    await requireUserId();
    const channelName = `customer-order:${orderId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return getSupabaseClient().channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}`,
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}`,
      }, onChange)
      .subscribe();
  },

  async subscribeToTableInvites(tableSessionId, onChange) {
    const userId = await requireUserId();
    const handle = (payload: { new?: unknown }) => {
      const row = objectValue(payload.new);
      onChange(row.id ? {
        inviteId: String(row.id),
        status: inviteStatusValue(row.status),
        inviteeId: String(row.invitee_id ?? ''),
        tableSessionId: String(row.table_session_id ?? ''),
      } : null);
    };
    const channelName = `customer-table-invites:${userId}:${tableSessionId ?? 'none'}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const channel = getSupabaseClient().channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'table_session_user_invites', filter: `invitee_id=eq.${userId}`,
      }, handle);
    if (tableSessionId) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table: 'table_session_user_invites', filter: `table_session_id=eq.${tableSessionId}`,
      }, handle);
    }
    return channel.subscribe();
  },
};

export default customerBackend;
