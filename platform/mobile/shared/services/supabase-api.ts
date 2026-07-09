import { getSupabaseClient } from './supabase';
import { getOptionalSupabaseSessionUser } from './supabase-auth';

export type SupabaseOrderItemInput = {
  menu_item_id: string;
  quantity: number;
  special_instructions?: string;
};

export type SupabaseOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled';
export type SupabaseReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export interface SupabaseCreateOrderInput {
  restaurant_id: string;
  items: SupabaseOrderItemInput[];
  delivery_address?: { street: string; city: string; state: string; zip: string; complement?: string };
  order_type: 'dine_in' | 'pickup' | 'delivery';
  table_id?: string;
}

export interface SupabaseRestaurantOrdersParams {
  restaurant_id?: string;
  status?: string;
  date?: string;
  table_id?: string;
}

export interface SupabaseCreateReservationInput {
  restaurant_id: string;
  reservation_time: string;
  party_size: number;
  special_requests?: string;
}

export interface SupabaseReservationsParams {
  date?: string;
  status?: SupabaseReservationStatus | string;
}

export interface SupabaseApiAdapter {
  // ── Orders ──────────────────────────────────────────────────────────────────
  createOrder(data: SupabaseCreateOrderInput): Promise<any>;
  getMyOrders(): Promise<any>;
  getOrder(id: string): Promise<any>;
  getRestaurantOrders(params?: SupabaseRestaurantOrdersParams): Promise<any>;
  updateOrderStatus(orderId: string, status: SupabaseOrderStatus | string, estimated_time?: number): Promise<any>;
  cancelOrder(id: string, reason?: string): Promise<any>;
  // ── Tables ───────────────────────────────────────────────────────────────────
  getRestaurantTables(restaurantId?: string): Promise<any>;
  getRestaurantTable(tableId: string): Promise<any>;
  updateTableStatus(tableId: string, status: string, notes?: string): Promise<any>;
  updateTableNotes(tableId: string, notes: string): Promise<any>;
  getMyTables(restaurantId?: string): Promise<any>;
  openTableSession(tableId: string, guestName?: string, guestCount?: number): Promise<any>;
  closeTableSession(sessionId: string): Promise<any>;
  // ── KDS ──────────────────────────────────────────────────────────────────────
  getKdsQueue(restaurantId?: string, stationId?: string): Promise<any>;
  getBarQueue(restaurantId?: string): Promise<any>;
  updateOrderItemStatus(itemId: string, status: string): Promise<any>;
  fireCourse(orderId: string, course: string): Promise<any>;
  getCookStations(restaurantId?: string): Promise<any>;
  getKdsConfig(restaurantId?: string): Promise<any>;
  updateKdsConfig(restaurantId: string, config: Record<string, unknown>): Promise<any>;
  // ── Dashboard ────────────────────────────────────────────────────────────────
  getDashboardSnapshot(restaurantId?: string): Promise<any>;
  // ── Reservations ─────────────────────────────────────────────────────────────
  createReservation(data: SupabaseCreateReservationInput): Promise<any>;
  getMyReservations(): Promise<any>;
  getReservations(params?: SupabaseReservationsParams): Promise<any>;
  getReservation(id: string): Promise<any>;
  updateReservationStatus(id: string, status: SupabaseReservationStatus | string, extra?: Record<string, unknown>): Promise<any>;
  updateReservation(id: string, patch: Record<string, unknown>): Promise<any>;
  getRestaurantReservations(restaurantId: string, date?: string, status?: string[]): Promise<any>;
  updateRestaurantReservationStatus(reservationId: string, status: string, tableId?: string, notes?: string): Promise<any>;
  getWaitlist(restaurantId?: string): Promise<any>;
  getTableBills(restaurantId?: string): Promise<any>;
  getMyRestaurants(): Promise<any>;
  // ── Service Calls ─────────────────────────────────────────────────────────────
  getServiceCalls(restaurantId?: string, status?: string[]): Promise<any>;
  acknowledgeServiceCall(callId: string): Promise<any>;
  resolveServiceCall(callId: string): Promise<any>;
  createServiceCall(restaurantId: string, tableId?: string, callType?: string, message?: string): Promise<any>;
  getCallStats(restaurantId?: string): Promise<any>;
  // ── Cash Register ──────────────────────────────────────────────────────────────
  getCashRegister(restaurantId?: string): Promise<any>;
  getCashRegisterHistory(restaurantId?: string, limit?: number): Promise<any>;
  openCashRegister(restaurantId: string, openingBalance: number): Promise<any>;
  addCashMovement(sessionId: string, type: string, amount: number, description?: string, isCash?: boolean, orderId?: string): Promise<any>;
  closeCashRegister(sessionId: string, actualBalance: number, closingNotes?: string): Promise<any>;
  // ── Financial ──────────────────────────────────────────────────────────────────
  getFinancialSummary(restaurantId?: string, from?: string, to?: string): Promise<any>;
  getTransactions(restaurantId?: string, from?: string, to?: string, limit?: number): Promise<any>;
  getTipsSummary(restaurantId?: string, from?: string, to?: string): Promise<any>;
  getReports(restaurantId?: string, from?: string, to?: string): Promise<any>;
  // ── Menu ───────────────────────────────────────────────────────────────────────
  getMenu(restaurantId?: string, includeUnavailable?: boolean): Promise<any>;
  createMenuItem(restaurantId: string, data: Record<string, unknown>): Promise<any>;
  updateMenuItem(itemId: string, data: Record<string, unknown>): Promise<any>;
  toggleMenuItem(itemId: string, isAvailable: boolean): Promise<any>;
  deleteMenuItem(itemId: string): Promise<any>;
  createMenuCategory(restaurantId: string, name: string, description?: string, imageUrl?: string, sortOrder?: number): Promise<any>;
  updateMenuCategory(categoryId: string, data: Record<string, unknown>): Promise<any>;
  // ── Staff ──────────────────────────────────────────────────────────────────────
  getStaff(restaurantId?: string): Promise<any>;
  upsertStaffRole(restaurantId: string, userId: string, role: string): Promise<any>;
  deactivateStaff(roleId: string): Promise<any>;
  findUserByEmail(email: string): Promise<any>;
  // ── Notifications ──────────────────────────────────────────────────────────────
  getMyNotifications(unreadOnly?: boolean, limit?: number): Promise<any>;
  markNotificationRead(notificationId: string): Promise<any>;
  markAllNotificationsRead(): Promise<any>;
  getNotificationUnreadCount(): Promise<any>;
  // ── Stock ──────────────────────────────────────────────────────────────────────
  getStock(restaurantId?: string, includeInactive?: boolean): Promise<any>;
  getLowStockAlerts(restaurantId?: string): Promise<any>;
  updateStockLevel(itemId: string, quantityDelta: number, notes?: string): Promise<any>;
  createStockItem(restaurantId: string, data: Record<string, unknown>): Promise<any>;
  // ── Loyalty ────────────────────────────────────────────────────────────────────
  getLoyaltyConfig(restaurantId?: string): Promise<any>;
  getLoyaltyStats(restaurantId?: string): Promise<any>;
  getServiceConfigs(restaurantId?: string): Promise<any>;
  getActiveShiftCount(restaurantId?: string): Promise<any>;
  getTableQRCodes(restaurantId?: string): Promise<any>;
  generateTableQR(tableId: string): Promise<any>;
  getPromotions(restaurantId?: string, status?: string): Promise<any>;
  closePromotion(promotionId: string): Promise<any>;
  getReviews(restaurantId?: string, limit?: number): Promise<any>;
  respondReview(reviewId: string, response: string): Promise<any>;
  getMyLoyalty(restaurantId: string): Promise<any>;
  // ── Payment ────────────────────────────────────────────────────────────────────
  recordPayment(orderId: string, paymentMethod: string, amount: number, tipAmount?: number, notes?: string): Promise<any>;
  getBills(restaurantId?: string, status?: string): Promise<any>;
  getGatewayConfig(restaurantId?: string): Promise<any>;
  calculateSplit(orderId: string, splitMode: string, parts?: number, percentages?: number[]): Promise<any>;
  // ── Profile ────────────────────────────────────────────────────────────────────
  getRestaurantProfile(restaurantId?: string): Promise<any>;
  updateRestaurantProfile(restaurantId: string, patch: Record<string, unknown>): Promise<any>;
}

async function resolveRestaurantId(restaurantId?: string): Promise<string> {
  if (restaurantId) return restaurantId;

  const supabase = getSupabaseClient();
  const { user } = await getOptionalSupabaseSessionUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_roles')
    .select('restaurant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.restaurant_id) throw new Error('No restaurant available for current user');
  return data.restaurant_id as string;
}

export const supabaseApiAdapter: SupabaseApiAdapter = {
  async createOrder(data) {
    const supabase = getSupabaseClient();
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) throw new Error('Not authenticated');

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        restaurant_id: data.restaurant_id,
        customer_id: user.id,
        order_type: data.order_type,
        table_id: data.table_id,
        delivery_address: data.delivery_address,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;

    if (data.items.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(
        data.items.map((item) => ({
          order_id: order.id,
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          special_instructions: item.special_instructions,
        }))
      );
      if (itemsError) throw itemsError;
    }

    return order;
  },

  async getMyOrders() {
    const supabase = getSupabaseClient();
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getOrder(id: string) {
    const { data, error } = await getSupabaseClient()
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async getRestaurantOrders(params) {
    const resolvedRestaurantId = await resolveRestaurantId(params?.restaurant_id);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_orders', {
      p_restaurant_id: resolvedRestaurantId,
      p_statuses: params?.status ? params.status.split(',') : null,
      p_date: params?.date || null,
      p_table_id: params?.table_id || null,
    });
    if (error) throw error;
    return data;
  },

  async updateOrderStatus(orderId: string, status: string, estimated_time?: number) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_order_status', {
      p_order_id: orderId,
      p_status: status,
      p_estimated_time: estimated_time || null,
    });
    if (error) throw error;
    return data;
  },

  async cancelOrder(id: string, reason?: string) {
    const { data, error } = await getSupabaseClient()
      .from('orders')
      .update({ status: 'cancelled', cancellation_reason: reason })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getRestaurantTables(restaurantId?: string) {
    const resolvedRestaurantId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_tables', {
      p_restaurant_id: resolvedRestaurantId,
    });
    if (error) throw error;
    return data;
  },

  async getRestaurantTable(tableId: string) {
    const { data, error } = await getSupabaseClient()
      .from('tables')
      .select('*')
      .eq('id', tableId)
      .single();
    if (error) throw error;
    return data;
  },

  async updateTableStatus(tableId: string, status: string, notes?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_table_status', {
      p_table_id: tableId,
      p_status: status,
      p_notes: notes || null,
    });
    if (error) throw error;
    return data;
  },

  async updateTableNotes(tableId: string, notes: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_table_status', {
      p_table_id: tableId,
      p_status: null,
      p_notes: notes,
    });
    if (error) throw error;
    return data;
  },

  async getKdsQueue(restaurantId?: string, stationId?: string) {
    const resolvedRestaurantId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_kds_queue', {
      p_restaurant_id: resolvedRestaurantId,
      p_station_id: stationId || null,
    });
    if (error) throw error;
    return data;
  },

  async getDashboardSnapshot(restaurantId?: string) {
    const resolvedRestaurantId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_dashboard_snapshot', {
      p_restaurant_id: resolvedRestaurantId,
    });
    if (error) throw error;
    return data;
  },

  async createReservation(data) {
    const supabase = getSupabaseClient();
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) throw new Error('Not authenticated');

    const { data: reservation, error } = await supabase
      .from('reservations')
      .insert({
        ...data,
        customer_id: user.id,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    return reservation;
  },

  async getMyReservations() {
    const supabase = getSupabaseClient();
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('customer_id', user.id)
      .order('reservation_time', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getReservations(params) {
    let query = getSupabaseClient().from('reservations').select('*').order('reservation_time', { ascending: true });

    if (params?.status) query = query.eq('status', params.status);
    if (params?.date) {
      query = query.gte('reservation_time', `${params.date}T00:00:00`).lt('reservation_time', `${params.date}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getReservation(id: string) {
    const { data, error } = await getSupabaseClient().from('reservations').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async updateReservationStatus(id: string, status: string, extra?: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient()
      .from('reservations')
      .update({ status, ...extra })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateReservation(id: string, patch: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient()
      .from('reservations')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ── Restaurant-side reservations ───────────────────────────────────────────
  async getRestaurantReservations(restaurantId: string, date?: string, status?: string[]) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_reservations', {
      p_restaurant_id: restaurantId,
      p_date: date || null,
      p_status: status || null,
    });
    if (error) throw error;
    return data;
  },

  async updateRestaurantReservationStatus(reservationId: string, status: string, tableId?: string, notes?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_reservation_status', {
      p_reservation_id: reservationId,
      p_status: status,
      p_table_id: tableId || null,
      p_notes: notes || null,
    });
    if (error) throw error;
    return data;
  },

  async getWaitlist(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_waitlist', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async getTableBills(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_table_bills', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async getMyRestaurants() {
    const { data, error } = await getSupabaseClient().rpc('get_my_restaurants');
    if (error) throw error;
    return data;
  },

  // ── Tables (extended) ──────────────────────────────────────────────────────
  async getMyTables(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_my_tables', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async openTableSession(tableId: string, guestName?: string, guestCount?: number) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_open_table_session', {
      p_table_id: tableId,
      p_guest_name: guestName || null,
      p_guest_count: guestCount || 1,
    });
    if (error) throw error;
    return data;
  },

  async closeTableSession(sessionId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_close_table_session', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return data;
  },

  // ── KDS (extended) ─────────────────────────────────────────────────────────
  async getBarQueue(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_bar_queue', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async updateOrderItemStatus(itemId: string, status: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_order_item_status', {
      p_item_id: itemId,
      p_status: status,
    });
    if (error) throw error;
    return data;
  },

  async fireCourse(orderId: string, course: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_fire_course', {
      p_order_id: orderId,
      p_course: course,
    });
    if (error) throw error;
    return data;
  },

  async getCookStations(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_cook_stations', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async getKdsConfig(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_kds_config', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async updateKdsConfig(restaurantId: string, config: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_kds_config', {
      p_restaurant_id: restaurantId,
      p_config: config,
    });
    if (error) throw error;
    return data;
  },

  // ── Service Calls ──────────────────────────────────────────────────────────
  async getServiceCalls(restaurantId?: string, status?: string[]) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_service_calls', {
      p_restaurant_id: resolvedId,
      p_status: status || null,
    });
    if (error) throw error;
    return data;
  },

  async acknowledgeServiceCall(callId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_acknowledge_service_call', {
      p_call_id: callId,
    });
    if (error) throw error;
    return data;
  },

  async resolveServiceCall(callId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_resolve_service_call', {
      p_call_id: callId,
    });
    if (error) throw error;
    return data;
  },

  async createServiceCall(restaurantId: string, tableId?: string, callType?: string, message?: string) {
    const { data, error } = await getSupabaseClient().rpc('create_service_call', {
      p_restaurant_id: restaurantId,
      p_table_id: tableId || null,
      p_call_type: callType || 'waiter',
      p_message: message || null,
    });
    if (error) throw error;
    return data;
  },

  async getCallStats(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_call_stats', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  // ── Cash Register ──────────────────────────────────────────────────────────
  async getCashRegister(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_cash_register', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async getCashRegisterHistory(restaurantId?: string, limit = 20) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_cash_register_history', {
      p_restaurant_id: resolvedId,
      p_limit: limit,
    });
    if (error) throw error;
    return data;
  },

  async openCashRegister(restaurantId: string, openingBalance: number) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_open_cash_register', {
      p_restaurant_id: restaurantId,
      p_opening_balance: openingBalance,
    });
    if (error) throw error;
    return data;
  },

  async addCashMovement(sessionId: string, type: string, amount: number, description?: string, isCash = true, orderId?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_add_cash_movement', {
      p_session_id: sessionId,
      p_type: type,
      p_amount: amount,
      p_description: description || null,
      p_is_cash: isCash,
      p_order_id: orderId || null,
    });
    if (error) throw error;
    return data;
  },

  async closeCashRegister(sessionId: string, actualBalance: number, closingNotes?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_close_cash_register', {
      p_session_id: sessionId,
      p_actual_balance: actualBalance,
      p_closing_notes: closingNotes || null,
    });
    if (error) throw error;
    return data;
  },

  // ── Financial ──────────────────────────────────────────────────────────────
  async getFinancialSummary(restaurantId?: string, from?: string, to?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_financial_summary', {
      p_restaurant_id: resolvedId,
      p_from: from || null,
      p_to: to || null,
    });
    if (error) throw error;
    return data;
  },

  async getTransactions(restaurantId?: string, from?: string, to?: string, limit = 50) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_transactions', {
      p_restaurant_id: resolvedId,
      p_from: from || null,
      p_to: to || null,
      p_limit: limit,
    });
    if (error) throw error;
    return data;
  },

  async getTipsSummary(restaurantId?: string, from?: string, to?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_tips_summary', {
      p_restaurant_id: resolvedId,
      p_from: from || null,
      p_to: to || null,
    });
    if (error) throw error;
    return data;
  },

  async getReports(restaurantId?: string, from?: string, to?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_reports', {
      p_restaurant_id: resolvedId,
      p_from: from || null,
      p_to: to || null,
    });
    if (error) throw error;
    return data;
  },

  // ── Menu ───────────────────────────────────────────────────────────────────
  async getMenu(restaurantId?: string, includeUnavailable = false) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_menu', {
      p_restaurant_id: resolvedId,
      p_include_unavailable: includeUnavailable,
    });
    if (error) throw error;
    return data;
  },

  async createMenuItem(restaurantId: string, item: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_create_menu_item', {
      p_restaurant_id: restaurantId,
      p_category_id: item.category_id,
      p_name: item.name,
      p_description: item.description || null,
      p_price: item.price || 0,
      p_original_price: item.original_price || null,
      p_image_url: item.image_url || null,
      p_is_available: item.is_available !== false,
      p_is_featured: item.is_featured || false,
      p_allergens: item.allergens || null,
      p_dietary_info: item.dietary_info || null,
      p_preparation_time: item.preparation_time || null,
      p_course: item.course || null,
      p_station_id: item.station_id || null,
      p_sort_order: item.sort_order || 0,
      p_calories: item.calories || null,
      p_metadata: item.metadata || null,
    });
    if (error) throw error;
    return data;
  },

  async updateMenuItem(itemId: string, item: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_menu_item', {
      p_item_id: itemId,
      p_name: item.name || null,
      p_description: item.description || null,
      p_price: item.price || null,
      p_original_price: item.original_price || null,
      p_image_url: item.image_url || null,
      p_is_available: item.is_available !== undefined ? item.is_available : null,
      p_is_featured: item.is_featured !== undefined ? item.is_featured : null,
      p_allergens: item.allergens || null,
      p_dietary_info: item.dietary_info || null,
      p_preparation_time: item.preparation_time || null,
      p_course: item.course || null,
      p_station_id: item.station_id || null,
      p_sort_order: item.sort_order !== undefined ? item.sort_order : null,
      p_calories: item.calories || null,
      p_category_id: item.category_id || null,
      p_metadata: item.metadata || null,
    });
    if (error) throw error;
    return data;
  },

  async toggleMenuItem(itemId: string, isAvailable: boolean) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_toggle_menu_item', {
      p_item_id: itemId,
      p_is_available: isAvailable,
    });
    if (error) throw error;
    return data;
  },

  async deleteMenuItem(itemId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_delete_menu_item', {
      p_item_id: itemId,
    });
    if (error) throw error;
    return data;
  },

  async createMenuCategory(restaurantId: string, name: string, description?: string, imageUrl?: string, sortOrder = 0) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_create_menu_category', {
      p_restaurant_id: restaurantId,
      p_name: name,
      p_description: description || null,
      p_image_url: imageUrl || null,
      p_sort_order: sortOrder,
    });
    if (error) throw error;
    return data;
  },

  async updateMenuCategory(categoryId: string, patch: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_menu_category', {
      p_category_id: categoryId,
      p_name: patch.name || null,
      p_description: patch.description || null,
      p_image_url: patch.image_url || null,
      p_sort_order: patch.sort_order !== undefined ? patch.sort_order : null,
      p_is_active: patch.is_active !== undefined ? patch.is_active : null,
    });
    if (error) throw error;
    return data;
  },

  // ── Staff ──────────────────────────────────────────────────────────────────
  async getStaff(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_staff', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async upsertStaffRole(restaurantId: string, userId: string, role: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_upsert_staff_role', {
      p_restaurant_id: restaurantId,
      p_user_id: userId,
      p_role: role,
    });
    if (error) throw error;
    return data;
  },

  async deactivateStaff(roleId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_deactivate_staff', {
      p_role_id: roleId,
    });
    if (error) throw error;
    return data;
  },

  async findUserByEmail(email: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_find_user_by_email', {
      p_email: email,
    });
    if (error) throw error;
    return data;
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  async getMyNotifications(unreadOnly = false, limit = 50) {
    const { data, error } = await getSupabaseClient().rpc('get_my_notifications', {
      p_unread_only: unreadOnly,
      p_limit: limit,
    });
    if (error) throw error;
    return data;
  },

  async markNotificationRead(notificationId: string) {
    const { data, error } = await getSupabaseClient().rpc('mark_notification_read', {
      p_notification_id: notificationId,
    });
    if (error) throw error;
    return data;
  },

  async markAllNotificationsRead() {
    const { data, error } = await getSupabaseClient().rpc('mark_all_notifications_read');
    if (error) throw error;
    return data;
  },

  async getNotificationUnreadCount() {
    const { data, error } = await getSupabaseClient().rpc('get_notification_unread_count');
    if (error) throw error;
    return data;
  },

  // ── Stock / Inventory ──────────────────────────────────────────────────────
  async getStock(restaurantId?: string, includeInactive = false) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_stock', {
      p_restaurant_id: resolvedId,
      p_include_inactive: includeInactive,
    });
    if (error) throw error;
    return data;
  },

  async getLowStockAlerts(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_low_stock_alerts', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async updateStockLevel(itemId: string, quantityDelta: number, notes?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_stock_level', {
      p_item_id: itemId,
      p_quantity_delta: quantityDelta,
      p_notes: notes || null,
    });
    if (error) throw error;
    return data;
  },

  async createStockItem(restaurantId: string, item: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_create_stock_item', {
      p_restaurant_id: restaurantId,
      p_name: item.name,
      p_category: item.category,
      p_unit: item.unit,
      p_current_level: item.current_level || 0,
      p_min_level: item.min_level || 0,
      p_max_level: item.max_level || null,
      p_unit_cost: item.unit_cost || null,
      p_supplier: item.supplier || null,
      p_notes: item.notes || null,
    });
    if (error) throw error;
    return data;
  },

  // ── Loyalty ────────────────────────────────────────────────────────────────
  async getLoyaltyConfig(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_loyalty_config', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async getMyLoyalty(restaurantId: string) {
    const { data, error } = await getSupabaseClient().rpc('get_my_loyalty', {
      p_restaurant_id: restaurantId,
    });
    if (error) throw error;
    return data;
  },

  async getLoyaltyStats(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_loyalty_stats', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async getServiceConfigs(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_service_configs', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async getActiveShiftCount(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_active_shift_count', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async getTableQRCodes(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_table_qr_codes', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async generateTableQR(tableId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_generate_table_qr', {
      p_table_id: tableId,
    });
    if (error) throw error;
    return data;
  },

  async getPromotions(restaurantId?: string, status?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_promotions', {
      p_restaurant_id: resolvedId,
      p_status: status ?? null,
    });
    if (error) throw error;
    return data;
  },

  async closePromotion(promotionId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_close_promotion', {
      p_promotion_id: promotionId,
    });
    if (error) throw error;
    return data;
  },

  async getReviews(restaurantId?: string, limit?: number) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_reviews', {
      p_restaurant_id: resolvedId,
      p_limit: limit ?? 50,
    });
    if (error) throw error;
    return data;
  },

  async respondReview(reviewId: string, response: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_respond_review', {
      p_review_id: reviewId,
      p_response: response,
    });
    if (error) throw error;
    return data;
  },

  // ── Payment ────────────────────────────────────────────────────────────────
  async recordPayment(orderId: string, paymentMethod: string, amount: number, tipAmount = 0, notes?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_record_payment', {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
      p_amount: amount,
      p_tip_amount: tipAmount,
      p_notes: notes || null,
    });
    if (error) throw error;
    return data;
  },

  async getBills(restaurantId?: string, status?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_bills', {
      p_restaurant_id: resolvedId,
      p_status: status || null,
    });
    if (error) throw error;
    return data;
  },

  async getGatewayConfig(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_gateway_config', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async calculateSplit(orderId: string, splitMode: string, parts = 2, percentages?: number[]) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_calculate_split', {
      p_order_id: orderId,
      p_split_mode: splitMode,
      p_parts: parts,
      p_percentages: percentages || null,
    });
    if (error) throw error;
    return data;
  },

  // ── Restaurant Profile ─────────────────────────────────────────────────────
  async getRestaurantProfile(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_profile', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data;
  },

  async updateRestaurantProfile(restaurantId: string, patch: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_profile', {
      p_restaurant_id: restaurantId,
      p_patch: patch,
    });
    if (error) throw error;
    return data;
  },
};
