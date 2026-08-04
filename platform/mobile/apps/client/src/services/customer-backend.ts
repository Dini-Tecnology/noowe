import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/shared/services/supabase';
import type { Database } from '@/shared/types/database.generated';

type RestaurantRow = Database['public']['Tables']['restaurants']['Row'];

export type Page<T> = { data: T[]; nextCursor: string | null };

export type VisitSession = {
  restaurantId: string;
  tableId: string;
  tableSessionId: string;
  tableNumber: string;
};

export type CustomerProfile = {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  favoriteCuisines: string[];
  dietaryRestrictions: string[];
  preferences: Record<string, unknown>;
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
  openingHours: Record<string, unknown>;
  rating: number;
  totalReviews: number;
  averageTicket: number | null;
  lat: number | null;
  lng: number | null;
  serviceConfig: Record<string, unknown>;
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
  imageUrl: string | null;
  preparationTime: number | null;
  allergens: string[];
  dietaryInfo: Record<string, boolean>;
  customizations: unknown[];
};

export type PlaceOrderItem = {
  menuItemId: string;
  quantity: number;
  specialInstructions?: string;
  customizations?: unknown[];
};

export type PlaceOrderInput = {
  restaurantId: string;
  tableSessionId: string;
  items: PlaceOrderItem[];
  idempotencyKey?: string;
};

export type CustomerOrderStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready'
  | 'delivered' | 'completed' | 'cancelled';

export type CustomerOrder = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  tableId: string | null;
  status: CustomerOrderStatus;
  subtotal: number;
  total: number;
  estimatedTime: number | null;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    status: string;
    specialInstructions: string | null;
  }[];
};

export type CustomerReservation = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  reservationTime: string;
  partySize: number;
  specialRequests: string | null;
  status: string;
  createdAt: string;
};

export type CustomerWaitlistEntry = {
  id: string;
  restaurantId: string;
  partySize: number;
  preference: string;
  status: string;
  position: number;
  estimatedWaitMinutes: number | null;
  tableNumber: string | null;
  createdAt: string;
};

export type CustomerNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  relatedId: string | null;
  relatedType: string | null;
  isRead: boolean;
  createdAt: string;
};

export type CustomerReview = { id: string; restaurantId: string; orderId: string | null; rating: number; comment: string | null; ownerResponse: string | null; createdAt: string };
export type CustomerLoyalty = { id: string; restaurantId: string; restaurantName: string; points: number; totalVisits: number; tier: string };
export type CustomerPromotion = { id: string; restaurantId: string; code: string; title: string; description: string | null; validUntil: string };

export interface CustomerBackend {
  restoreAuth(): Promise<boolean>;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: { email: string; password: string; fullName: string; emailRedirectTo: string }): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  getProfile(): Promise<CustomerProfile>;
  updateProfile(patch: Partial<Pick<CustomerProfile, 'fullName' | 'phone' | 'favoriteCuisines' | 'dietaryRestrictions' | 'preferences'>>): Promise<CustomerProfile>;
  listRestaurants(input?: { search?: string; cuisine?: string; limit?: number; cursor?: string }): Promise<Page<CustomerRestaurant>>;
  getRestaurant(id: string): Promise<CustomerRestaurant>;
  getMenu(restaurantId: string): Promise<{ categories: CustomerMenuCategory[]; items: CustomerMenuItem[] }>;
  openTableSession(qrData: string): Promise<VisitSession>;
  placeOrder(input: PlaceOrderInput): Promise<CustomerOrder>;
  listOrders(limit?: number, cursor?: string): Promise<Page<CustomerOrder>>;
  getOrder(id: string): Promise<CustomerOrder>;
  cancelOrder(id: string, reason?: string): Promise<CustomerOrder>;
  listReservations(): Promise<CustomerReservation[]>;
  createReservation(input: { restaurantId: string; reservationTime: string; partySize: number; specialRequests?: string }): Promise<CustomerReservation>;
  cancelReservation(id: string, reason?: string): Promise<CustomerReservation>;
  createReservationInvite(id: string): Promise<string>;
  listMyWaitlist(): Promise<CustomerWaitlistEntry[]>;
  joinWaitlist(input: { restaurantId: string; partySize: number; preference?: string; hasKids?: boolean }): Promise<CustomerWaitlistEntry>;
  updateWaitlist(id: string, action: 'cancel' | 'arrive'): Promise<CustomerWaitlistEntry>;
  callWaiter(input: { restaurantId: string; tableId: string; type: string; message?: string }): Promise<unknown>;
  listFavorites(): Promise<CustomerRestaurant[]>;
  setFavorite(restaurantId: string, favorite: boolean): Promise<void>;
  listNotifications(): Promise<CustomerNotification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  getUnreadNotificationCount(): Promise<number>;
  registerPushToken(token: string, platform: 'ios' | 'android', deviceInfo?: Record<string, unknown>): Promise<void>;
  listMyReviews(): Promise<CustomerReview[]>;
  createReview(input: { orderId: string; restaurantId: string; rating: number; comment?: string }): Promise<CustomerReview>;
  updateReview(id: string, input: { rating: number; comment?: string }): Promise<void>;
  deleteReview(id: string): Promise<void>;
  reportReview(id: string, reason: string, details?: string): Promise<void>;
  listLoyalty(): Promise<CustomerLoyalty[]>;
  listPromotions(restaurantId?: string): Promise<CustomerPromotion[]>;
  redeemPromotion(id: string): Promise<void>;
  exportUserData(): Promise<unknown>;
  requestAccountDeletion(): Promise<void>;
  subscribeToUserChanges(onChange: () => void): Promise<RealtimeChannel>;
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
    openingHours: objectValue(row.opening_hours),
    rating: numberValue(row.rating),
    totalReviews: numberValue(row.total_reviews),
    averageTicket: row.average_ticket == null ? null : numberValue(row.average_ticket),
    lat: row.lat == null ? null : numberValue(row.lat),
    lng: row.lng == null ? null : numberValue(row.lng),
    serviceConfig: objectValue(row.service_config),
  };
}

function mapOrder(row: Record<string, unknown>): CustomerOrder {
  const restaurant = objectValue(row.restaurant);
  const rawItems = Array.isArray(row.order_items) ? row.order_items : [];
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    restaurantName: String(restaurant.name ?? row.restaurant_name ?? 'Restaurante'),
    tableId: typeof row.table_id === 'string' ? row.table_id : null,
    status: String(row.status) as CustomerOrderStatus,
    subtotal: numberValue(row.subtotal),
    total: numberValue(row.total_amount),
    estimatedTime: row.estimated_time == null ? null : numberValue(row.estimated_time),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    items: rawItems.map((raw) => {
      const item = objectValue(raw);
      const menuItem = objectValue(item.menu_item);
      return {
        id: String(item.id),
        menuItemId: String(item.menu_item_id),
        name: String(menuItem.name ?? item.menu_item_name ?? 'Item'),
        quantity: numberValue(item.quantity),
        unitPrice: numberValue(item.unit_price),
        totalPrice: numberValue(item.total_price),
        status: String(item.status ?? 'pending'),
        specialInstructions: typeof item.special_instructions === 'string' ? item.special_instructions : null,
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
    position: numberValue(row.position),
    estimatedWaitMinutes: row.estimated_wait_minutes == null ? null : numberValue(row.estimated_wait_minutes),
    tableNumber: typeof row.table_number === 'string' ? row.table_number : null,
    createdAt: String(row.created_at),
  };
}

async function requireUserId(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error || !data.user) throw error ?? new Error('Authentication required');
  return data.user.id;
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
    if (patch.favoriteCuisines !== undefined) payload.favorite_cuisines = patch.favoriteCuisines;
    if (patch.dietaryRestrictions !== undefined) payload.dietary_restrictions = patch.dietaryRestrictions;
    if (patch.preferences !== undefined) payload.preferences = patch.preferences;
    const { error } = await getSupabaseClient().from('profiles').update(payload).eq('id', userId);
    if (error) throw error;
    return this.getProfile();
  },

  async listRestaurants(input = {}) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    let query = getSupabaseClient().from('restaurants').select('*')
      .eq('is_active', true).eq('service_type', 'casual_dining')
      .order('id', { ascending: true }).limit(limit + 1);
    if (input.search?.trim()) query = query.ilike('name', `%${input.search.trim()}%`);
    if (input.cuisine?.trim()) query = query.contains('cuisine_types', [input.cuisine.trim()]);
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
      .eq('id', id).eq('is_active', true).eq('service_type', 'casual_dining').single();
    if (error) throw error;
    return mapRestaurant(data as RestaurantRow);
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
        imageUrl: row.image_url, preparationTime: row.preparation_time,
        allergens: stringArray(row.allergens), dietaryInfo: objectValue(row.dietary_info) as Record<string, boolean>,
        customizations: Array.isArray(row.customizations) ? row.customizations : [],
      })),
    };
  },

  async openTableSession(qrData) {
    const { data, error } = await getSupabaseClient().rpc('customer_open_table_session', { p_qr_data: qrData });
    if (error) throw error;
    return data as unknown as VisitSession;
  },

  async placeOrder(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_place_order', {
      p_restaurant_id: input.restaurantId,
      p_table_session_id: input.tableSessionId,
      p_items: input.items.map((item) => ({
        menu_item_id: item.menuItemId, quantity: item.quantity,
        special_instructions: item.specialInstructions,
        customizations: item.customizations ?? [],
      })),
      p_client_request_id: input.idempotencyKey ?? Crypto.randomUUID(),
    });
    if (error) throw error;
    return mapOrder(data as unknown as Record<string, unknown>);
  },

  async listOrders(limit = 30, cursor) {
    let query = getSupabaseClient().from('orders').select(
      '*, restaurant:restaurants(name), order_items(*, menu_item:menu_items(name))',
    ).order('created_at', { ascending: false }).limit(limit + 1);
    if (cursor) query = query.lt('created_at', cursor);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const pageRows = rows.slice(0, limit);
    return { data: pageRows.map(mapOrder), nextCursor: rows.length > limit ? String(pageRows.at(-1)?.created_at) : null };
  },

  async getOrder(id) {
    const { data, error } = await getSupabaseClient().from('orders').select(
      '*, restaurant:restaurants(name), order_items(*, menu_item:menu_items(name))',
    ).eq('id', id).single();
    if (error) throw error;
    return mapOrder(data as unknown as Record<string, unknown>);
  },

  async cancelOrder(id, reason) {
    const { data, error } = await getSupabaseClient().rpc('customer_cancel_order', { p_order_id: id, p_reason: reason ?? null });
    if (error) throw error;
    return mapOrder(data as unknown as Record<string, unknown>);
  },

  async listReservations() {
    const { data, error } = await getSupabaseClient().from('reservations')
      .select('*, restaurant:restaurants(name)').order('reservation_time');
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

  async createReservationInvite(id) {
    const { data, error } = await getSupabaseClient().rpc('customer_create_reservation_invite', { p_reservation_id: id });
    if (error) throw error;
    return String(data);
  },

  async listMyWaitlist() {
    const { data, error } = await getSupabaseClient().from('waitlist_entries').select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapWaitlist(row as Record<string, unknown>));
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

  async callWaiter(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_call_waiter', {
      p_restaurant_id: input.restaurantId, p_table_id: input.tableId,
      p_message: input.message ?? null,
    });
    if (error) throw error;
    return data;
  },

  async listFavorites() {
    const { data, error } = await getSupabaseClient().from('favorites')
      .select('restaurant:restaurants(*)').order('created_at', { ascending: false });
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

  async listNotifications() {
    const { data, error } = await getSupabaseClient().rpc('get_my_notifications', { p_limit: 100, p_unread_only: false });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return rows.map((raw) => {
      const row = objectValue(raw);
      return {
        id: String(row.id), title: String(row.title), message: String(row.message),
        type: String(row.notification_type ?? 'system'),
        relatedId: typeof row.related_id === 'string' ? row.related_id : null,
        relatedType: typeof row.related_type === 'string' ? row.related_type : null,
        isRead: Boolean(row.is_read), createdAt: String(row.created_at),
      };
    });
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
    const { data, error } = await getSupabaseClient().from('reviews').select('*').eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, restaurantId: row.restaurant_id, orderId: row.order_id, rating: numberValue(row.rating), comment: row.comment, ownerResponse: row.owner_response, createdAt: row.created_at }));
  },

  async createReview(input) {
    const { data, error } = await getSupabaseClient().rpc('customer_create_review', { p_order_id: input.orderId, p_restaurant_id: input.restaurantId, p_rating: input.rating, p_comment: input.comment ?? null });
    if (error) throw error;
    const row = data as unknown as Record<string, unknown>;
    return { id: String(row.id), restaurantId: String(row.restaurant_id), orderId: typeof row.order_id === 'string' ? row.order_id : null, rating: numberValue(row.rating), comment: typeof row.comment === 'string' ? row.comment : null, ownerResponse: typeof row.owner_response === 'string' ? row.owner_response : null, createdAt: String(row.created_at) };
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
    const { data, error } = await getSupabaseClient().from('loyalty_programs').select('*, restaurant:restaurants(name)').eq('is_active', true).order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => { const restaurant = objectValue(row.restaurant); return { id: row.id, restaurantId: row.restaurant_id, restaurantName: String(restaurant.name ?? 'Restaurante'), points: numberValue(row.points), totalVisits: numberValue(row.total_visits), tier: row.tier }; });
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

  async exportUserData() {
    const { data, error } = await getSupabaseClient().rpc('export_user_data');
    if (error) throw error;
    return data;
  },

  async requestAccountDeletion() {
    const { error } = await getSupabaseClient().rpc('request_account_deletion');
    if (error) throw error;
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
};

export default customerBackend;
