import * as Crypto from 'expo-crypto';
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

export type AssistanceSentiment = 'positive' | 'neutral' | 'negative';
export type AssistanceServiceStage = 'main' | 'dessert' | 'finishing' | 'other';
export type AssistanceSpecialRequestStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed';

export interface AssistanceOnboardingTable {
  table_id: string;
  table_number: string;
  section: string | null;
  seats: number;
  status: string;
  guest_name: string | null;
  guest_count: number;
  table_session_id: string | null;
  qr_code_data: string;
  qr_code_image: string | null;
}

export interface AssistanceAllergenGroup {
  key: string;
  name: string;
  item_count: number;
  items: string[];
  affected_customers: Array<{
    table_id: string;
    table_number: string;
    customer_id: string;
    customer_name: string;
  }>;
}

export interface AssistanceFeedbackCandidate {
  table_session_id: string;
  table_id: string;
  table_number: string;
  customer_name: string;
  guest_count: number;
  service_stage: AssistanceServiceStage;
  feedback_id: string | null;
  sentiment: AssistanceSentiment | null;
  rating: number | null;
  note: string | null;
  collected_at: string | null;
  collected_by_name: string | null;
}

export interface AssistanceSpecialRequest {
  id: string;
  table_id: string | null;
  table_number: string | null;
  table_session_id: string | null;
  reservation_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  request_type: 'birthday' | 'accessibility' | 'vip' | 'dietary' | 'courtesy' | 'photo' | 'other';
  source: 'customer' | 'staff' | 'reservation' | 'system';
  title: string;
  description: string;
  action_label: string | null;
  priority: number;
  status: AssistanceSpecialRequestStatus;
  assigned_to: string | null;
  assigned_to_name: string | null;
  handled_by: string | null;
  handled_by_name: string | null;
  handled_note: string | null;
  due_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CustomerAssistanceHub {
  generated_at: string;
  onboarding: AssistanceOnboardingTable[];
  allergens: AssistanceAllergenGroup[];
  feedback: AssistanceFeedbackCandidate[];
  feedback_stats: {
    positive: number;
    neutral: number;
    negative: number;
    collected: number;
    pending: number;
  };
  special_requests: AssistanceSpecialRequest[];
}

export interface CreateAssistanceSpecialRequestInput {
  restaurantId: string;
  requestType: AssistanceSpecialRequest['request_type'];
  title: string;
  description: string;
  tableId?: string;
  tableSessionId?: string;
  reservationId?: string;
  customerId?: string;
  actionLabel?: string;
  priority?: number;
  dueAt?: string;
  metadata?: Record<string, unknown>;
}

export type RestaurantApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface RestaurantApproval {
  id: string;
  restaurant_id: string;
  type: string;
  item_name: string;
  table_id: string | null;
  table_number: string | null;
  requester_id: string;
  requester_name: string;
  resolver_id: string | null;
  resolver_name: string | null;
  reason: string;
  resolution_note: string | null;
  amount: number;
  status: RestaurantApprovalStatus;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
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
  createRestaurantTable(restaurantId: string, data: Record<string, unknown>): Promise<any>;
  updateRestaurantTable(tableId: string, data: Record<string, unknown>): Promise<any>;
  deleteRestaurantTable(tableId: string): Promise<any>;
  updateTableStatus(tableId: string, status: string, notes?: string): Promise<any>;
  updateTableNotes(tableId: string, notes: string): Promise<any>;
  getMyTables(restaurantId?: string): Promise<any>;
  openTableSession(tableId: string, guestName?: string, guestCount?: number): Promise<any>;
  checkInReservation(reservationId: string, tableId: string, guestName?: string, guestCount?: number): Promise<any>;
  closeTableSession(sessionId: string): Promise<any>;
  // ── KDS ──────────────────────────────────────────────────────────────────────
  getKdsQueue(restaurantId?: string, stationId?: string): Promise<any>;
  getBarQueue(restaurantId?: string): Promise<any>;
  updateOrderItemStatus(itemId: string, status: string): Promise<any>;
  fireCourse(orderId: string, course: string): Promise<any>;
  getCookStations(restaurantId?: string): Promise<any>;
  createCookStation(restaurantId: string, data: Record<string, unknown>): Promise<any>;
  updateCookStation(stationId: string, data: Record<string, unknown>): Promise<any>;
  deleteCookStation(stationId: string): Promise<any>;
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
  // ── Customer Assistance ───────────────────────────────────────────────────
  getCustomerAssistanceHub(restaurantId?: string): Promise<CustomerAssistanceHub>;
  collectCustomerFeedback(
    tableSessionId: string,
    sentiment: AssistanceSentiment,
    rating?: number,
    note?: string,
    serviceStage?: AssistanceServiceStage,
  ): Promise<any>;
  createAssistanceSpecialRequest(input: CreateAssistanceSpecialRequestInput): Promise<any>;
  getMyAssistanceSpecialRequests(restaurantId?: string): Promise<any[]>;
  updateAssistanceSpecialRequestStatus(
    requestId: string,
    status: Exclude<AssistanceSpecialRequestStatus, 'pending'>,
    handledNote?: string,
    assignedTo?: string,
  ): Promise<any>;
  getApprovals(restaurantId?: string, status?: RestaurantApprovalStatus | null): Promise<RestaurantApproval[]>;
  resolveApproval(approvalId: string, status: Exclude<RestaurantApprovalStatus, 'pending'>, resolutionNote?: string): Promise<any>;
  requestApproval(input: {
    restaurantId: string;
    type: string;
    itemName: string;
    reason: string;
    amount?: number;
    tableId?: string;
    orderId?: string;
  }): Promise<any>;
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
  getFinancialDashboard(restaurantId?: string, from?: string, to?: string): Promise<any>;
  getSatisfactionRecurrence(restaurantId?: string, from?: string, to?: string): Promise<any>;
  createBill(restaurantId: string, supplierName: string, amount: number, dueDate: string, category?: string): Promise<any>;
  updateBillStatus(billId: string, status: string): Promise<any>;
  deleteBill(billId: string): Promise<any>;
  getCustomers(restaurantId?: string, limit?: number): Promise<any>;
  getShifts(restaurantId?: string, from?: string, to?: string): Promise<any>;
  createShift(restaurantId: string, staffId: string, date: string, startTime: string, endTime: string, role?: string, notes?: string): Promise<any>;
  updateShift(shiftId: string, patch: Record<string, unknown>): Promise<any>;
  deleteShift(shiftId: string): Promise<any>;
  getIntegrations(restaurantId: string): Promise<any>;
  setIntegrationConnection(restaurantId: string, provider: string, isConnected: boolean, externalStoreId?: string): Promise<any>;
  // ── Menu ───────────────────────────────────────────────────────────────────────
  getMenu(restaurantId?: string, includeUnavailable?: boolean): Promise<any>;
  createMenuItem(restaurantId: string, data: Record<string, unknown>): Promise<any>;
  updateMenuItem(itemId: string, data: Record<string, unknown>): Promise<any>;
  toggleMenuItem(itemId: string, isAvailable: boolean): Promise<any>;
  deleteMenuItem(itemId: string): Promise<any>;
  uploadMenuItemImage(restaurantId: string, uri: string, contentType?: string): Promise<string>;
  deleteMenuCategory(categoryId: string): Promise<any>;
  createMenuCategory(restaurantId: string, name: string, description?: string, imageUrl?: string, sortOrder?: number): Promise<any>;
  updateMenuCategory(categoryId: string, data: Record<string, unknown>): Promise<any>;
  // ── Staff ──────────────────────────────────────────────────────────────────────
  getStaff(restaurantId?: string): Promise<any>;
  upsertStaffRole(restaurantId: string, userId: string, role: string): Promise<any>;
  deactivateStaff(roleId: string): Promise<any>;
  reactivateStaff(roleId: string): Promise<any>;
  updateStaffRole(roleId: string, role: string): Promise<any>;
  removeStaffRole(roleId: string): Promise<any>;
  findUserByEmail(restaurantId: string, email: string): Promise<any>;
  createStaffUser(restaurantId: string, email: string, password: string, fullName: string, role: string): Promise<any>;
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
  upsertServiceConfigs(
    restaurantId: string,
    configs: Array<{
      service_type: string;
      is_active: boolean;
      config_metadata?: Record<string, unknown>;
    }>,
    primaryServiceType?: string,
  ): Promise<any>;
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
  exportUserData(): Promise<any>;
  requestAccountDeletion(): Promise<any>;
  getBills(restaurantId?: string, status?: string): Promise<any>;
  getGatewayConfig(restaurantId?: string): Promise<any>;
  calculateSplit(orderId: string, splitMode: string, parts?: number, percentages?: number[]): Promise<any>;
  // ── Profile ────────────────────────────────────────────────────────────────────
  getRestaurantProfile(restaurantId?: string): Promise<any>;
  updateRestaurantProfile(restaurantId: string, patch: Record<string, unknown>): Promise<any>;
  uploadRestaurantLogo(restaurantId: string, uri: string, contentType?: string): Promise<string>;
  uploadRestaurantBanner(restaurantId: string, uri: string, contentType?: string): Promise<string>;
  createMyRestaurant(input: {
    name: string;
    phone: string;
    email: string;
    city?: string;
    state?: string;
    address?: string;
    addressNumber?: string;
    addressComplement?: string;
    neighborhood?: string;
    zipCode?: string;
    serviceType?: string;
  }): Promise<any>;
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
  if (data?.restaurant_id) return data.restaurant_id as string;

  const { data: owned, error: ownedError } = await supabase
    .from('restaurants')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownedError) throw ownedError;
  if (!owned?.id) throw new Error('No restaurant available for current user');
  return owned.id as string;
}

export const supabaseApiAdapter: SupabaseApiAdapter = {
  async createOrder(data) {
    const supabase = getSupabaseClient();
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) throw new Error('Not authenticated');

    // Price is computed server-side in place_order from menu_items.price —
    // the client never sends (and can no longer write) unit_price/total_price.
    const { data: order, error } = await supabase.rpc('place_order', {
      p_restaurant_id: data.restaurant_id,
      p_order_type: data.order_type,
      p_items: data.items.map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        special_instructions: item.special_instructions,
      })),
      p_table_id: data.table_id || null,
      p_delivery_address: data.delivery_address || null,
    });
    if (error) throw error;

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

  async createRestaurantTable(restaurantId: string, table: Record<string, unknown>) {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from('tables')
      .insert({
        restaurant_id: restaurantId,
        table_number: table.table_number,
        seats: table.seats,
        section: table.section || null,
        notes: table.notes || null,
        status: 'available',
        shape: table.shape || 'rectangle',
        width: table.width || 1,
        height: table.height || 1,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateRestaurantTable(tableId: string, table: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient()
      .from('tables')
      .update({ ...table, updated_at: new Date().toISOString() })
      .eq('id', tableId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteRestaurantTable(tableId: string) {
    const { error } = await getSupabaseClient()
      .from('tables')
      .delete()
      .eq('id', tableId);
    if (error) throw error;
    return { id: tableId, deleted: true };
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
    let query = getSupabaseClient()
      .from('reservations')
      .select(`
        *,
        customer:profiles!customer_id(id, full_name, email, phone, avatar_url)
      `)
      .order('reservation_time', { ascending: true });

    if (params?.status) query = query.eq('status', params.status);
    if (params?.date) {
      query = query.gte('reservation_time', `${params.date}T00:00:00`).lt('reservation_time', `${params.date}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map((row: any) => ({
      ...row,
      customer_name: row.customer_name ?? row.customer?.full_name ?? null,
      table_number: row.table_number ?? row.table?.table_number ?? null,
    }));
  },

  async getReservation(id: string) {
    const { data, error } = await getSupabaseClient()
      .from('reservations')
      .select(`
        *,
        customer:profiles!customer_id(id, full_name, email, phone, avatar_url)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return {
      ...data,
      customer_name: data?.customer_name ?? data?.customer?.full_name ?? null,
      table_number: data?.table_number ?? data?.table?.table_number ?? null,
    };
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
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row: any) => ({
      ...row,
      customer_name: row.customer_name ?? row.customer?.full_name ?? null,
      table_number: row.table_number ?? row.table?.table_number ?? null,
    }));
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

  async checkInReservation(reservationId: string, tableId: string, guestName?: string, guestCount?: number) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_check_in_reservation', {
      p_reservation_id: reservationId,
      p_table_id: tableId,
      p_guest_name: guestName || null,
      p_guest_count: guestCount || null,
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

  async createCookStation(restaurantId: string, data: Record<string, unknown>) {
    const { data: result, error } = await getSupabaseClient().rpc('restaurant_create_cook_station', {
      p_restaurant_id: restaurantId,
      p_payload: data,
    });
    if (error) throw error;
    return result;
  },

  async updateCookStation(stationId: string, data: Record<string, unknown>) {
    const { data: result, error } = await getSupabaseClient().rpc('restaurant_update_cook_station', {
      p_station_id: stationId,
      p_payload: data,
    });
    if (error) throw error;
    return result;
  },

  async deleteCookStation(stationId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_delete_cook_station', {
      p_station_id: stationId,
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
  // Customer Assistance
  async getCustomerAssistanceHub(restaurantId?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_customer_assistance_hub', {
      p_restaurant_id: resolvedId,
    });
    if (error) throw error;
    return data as CustomerAssistanceHub;
  },

  async collectCustomerFeedback(
    tableSessionId: string,
    sentiment: AssistanceSentiment,
    rating?: number,
    note?: string,
    serviceStage?: AssistanceServiceStage,
  ) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_collect_customer_feedback', {
      p_table_session_id: tableSessionId,
      p_sentiment: sentiment,
      p_rating: rating ?? null,
      p_note: note?.trim() || null,
      p_service_stage: serviceStage || 'finishing',
    });
    if (error) throw error;
    return data;
  },

  async createAssistanceSpecialRequest(input: CreateAssistanceSpecialRequestInput) {
    const { data, error } = await getSupabaseClient().rpc('create_restaurant_special_request', {
      p_restaurant_id: input.restaurantId,
      p_request_type: input.requestType,
      p_title: input.title.trim(),
      p_description: input.description.trim(),
      p_table_id: input.tableId || null,
      p_table_session_id: input.tableSessionId || null,
      p_reservation_id: input.reservationId || null,
      p_customer_id: input.customerId || null,
      p_action_label: input.actionLabel?.trim() || null,
      p_priority: input.priority ?? 3,
      p_due_at: input.dueAt || null,
      p_metadata: input.metadata || {},
    });
    if (error) throw error;
    return data;
  },

  async getMyAssistanceSpecialRequests(restaurantId?: string) {
    const { data, error } = await getSupabaseClient().rpc('get_my_restaurant_special_requests', {
      p_restaurant_id: restaurantId || null,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },

  async updateAssistanceSpecialRequestStatus(
    requestId: string,
    status: Exclude<AssistanceSpecialRequestStatus, 'pending'>,
    handledNote?: string,
    assignedTo?: string,
  ) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_special_request_status', {
      p_request_id: requestId,
      p_status: status,
      p_handled_note: handledNote?.trim() || null,
      p_assigned_to: assignedTo || null,
    });
    if (error) throw error;
    return data;
  },

  async getApprovals(restaurantId?: string, status: RestaurantApprovalStatus | null = 'pending') {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_approvals', {
      p_restaurant_id: resolvedId,
      p_status: status,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },

  async resolveApproval(
    approvalId: string,
    status: Exclude<RestaurantApprovalStatus, 'pending'>,
    resolutionNote?: string,
  ) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_resolve_approval', {
      p_approval_id: approvalId,
      p_status: status,
      p_resolution_note: resolutionNote?.trim() || null,
    });
    if (error) throw error;
    return data;
  },

  async requestApproval(input: {
    restaurantId: string;
    type: string;
    itemName: string;
    reason: string;
    amount?: number;
    tableId?: string;
    orderId?: string;
  }) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_request_approval', {
      p_restaurant_id: input.restaurantId,
      p_type: input.type,
      p_item_name: input.itemName,
      p_reason: input.reason,
      p_amount: input.amount ?? 0,
      p_table_id: input.tableId ?? null,
      p_order_id: input.orderId ?? null,
    });
    if (error) throw error;
    return data;
  },

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

  async getFinancialDashboard(restaurantId?: string, from?: string, to?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_financial_dashboard', {
      p_restaurant_id: resolvedId,
      p_from: from || null,
      p_to: to || null,
    });
    if (error) throw error;
    return data;
  },

  async getSatisfactionRecurrence(restaurantId?: string, from?: string, to?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_satisfaction_recurrence', {
      p_restaurant_id: resolvedId,
      p_from: from || null,
      p_to: to || null,
    });
    if (error) throw error;
    return data;
  },

  async getCustomers(restaurantId?: string, limit = 50) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_customers', {
      p_restaurant_id: resolvedId,
      p_limit: limit,
    });
    if (error) throw error;
    return data;
  },

  async getShifts(restaurantId?: string, from?: string, to?: string) {
    const resolvedId = await resolveRestaurantId(restaurantId);
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_shifts', {
      p_restaurant_id: resolvedId,
      p_from: from || null,
      p_to: to || null,
    });
    if (error) throw error;
    return data;
  },

  async createShift(restaurantId: string, staffId: string, date: string, startTime: string, endTime: string, role?: string, notes?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_create_shift', {
      p_restaurant_id: restaurantId,
      p_staff_id: staffId,
      p_date: date,
      p_start_time: startTime,
      p_end_time: endTime,
      p_role: role || null,
      p_notes: notes || null,
    });
    if (error) throw error;
    return data;
  },

  async updateShift(shiftId: string, patch: Record<string, unknown>) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_shift', {
      p_shift_id: shiftId,
      p_date: patch.date || null,
      p_start_time: patch.start_time || null,
      p_end_time: patch.end_time || null,
      p_role: patch.role || null,
      p_status: patch.status || null,
      p_notes: patch.notes || null,
    });
    if (error) throw error;
    return data;
  },

  async deleteShift(shiftId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_delete_shift', {
      p_shift_id: shiftId,
    });
    if (error) throw error;
    return data;
  },

  async getIntegrations(restaurantId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_get_integrations', {
      p_restaurant_id: restaurantId,
    });
    if (error) throw error;
    return data;
  },

  async setIntegrationConnection(restaurantId: string, provider: string, isConnected: boolean, externalStoreId?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_set_integration_connection', {
      p_restaurant_id: restaurantId,
      p_provider: provider,
      p_is_connected: isConnected,
      p_external_store_id: externalStoreId || null,
    });
    if (error) throw error;
    return data;
  },

  async createBill(restaurantId: string, supplierName: string, amount: number, dueDate: string, category?: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_create_bill', {
      p_restaurant_id: restaurantId,
      p_supplier_name: supplierName,
      p_amount: amount,
      p_due_date: dueDate,
      p_category: category || null,
    });
    if (error) throw error;
    return data;
  },

  async updateBillStatus(billId: string, status: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_bill_status', {
      p_bill_id: billId,
      p_status: status,
    });
    if (error) throw error;
    return data;
  },

  async deleteBill(billId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_delete_bill', {
      p_bill_id: billId,
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
      // The RPC inserts p_metadata explicitly into a NOT NULL jsonb column.
      // Passing null bypasses the column default and makes every item creation fail.
      p_metadata: item.metadata || {},
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

  async uploadMenuItemImage(restaurantId: string, uri: string, contentType = 'image/jpeg') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Não foi possível preparar a imagem selecionada.');
    const file = await response.arrayBuffer();
    const supabase = getSupabaseClient();
    const path = `${restaurantId}/${Date.now()}`;
    const { error: uploadError } = await supabase.storage
      .from('menu-item-images')
      .upload(path, file, { contentType, upsert: true, cacheControl: '3600' });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from('menu-item-images').getPublicUrl(path);
    return publicData.publicUrl;
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

  async deleteMenuCategory(categoryId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_delete_menu_category', {
      p_category_id: categoryId,
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

  async reactivateStaff(roleId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_reactivate_staff', {
      p_role_id: roleId,
    });
    if (error) throw error;
    return data;
  },

  async updateStaffRole(roleId: string, role: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_update_staff_role', {
      p_role_id: roleId,
      p_role: role,
    });
    if (error) throw error;
    return data;
  },

  async removeStaffRole(roleId: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_remove_staff_role', {
      p_role_id: roleId,
    });
    if (error) throw error;
    return data;
  },

  async findUserByEmail(restaurantId: string, email: string) {
    const { data, error } = await getSupabaseClient().rpc('restaurant_find_user_by_email', {
      p_restaurant_id: restaurantId,
      p_email: email,
    });
    if (error) throw error;
    return data;
  },

  async createStaffUser(restaurantId: string, email: string, password: string, fullName: string, role: string) {
    const { data, error } = await getSupabaseClient().functions.invoke('create-staff-user', {
      body: { restaurantId, email, password, fullName, role },
    });
    if (error) {
      const context = (error as { context?: unknown }).context;
      // React Native's fetch polyfill may create the response in another JS
      // realm, where `context instanceof Response` is false. Use duck typing
      // so the API's actual message is shown instead of the SDK's generic
      // "Edge Function returned a non-2xx status code" error.
      if (context && typeof context === 'object' && 'json' in context) {
        const json = (context as { json?: () => Promise<unknown> }).json;
        if (typeof json === 'function') {
          const body = await json.call(context).catch(() => null) as { error?: unknown; message?: unknown } | null;
          const message = body?.error ?? body?.message;
          if (message) throw new Error(String(message));
        }
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
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

  async upsertServiceConfigs(
    restaurantId: string,
    configs: Array<{
      service_type: string;
      is_active: boolean;
      config_metadata?: Record<string, unknown>;
    }>,
    primaryServiceType?: string,
  ) {
    const supabase = getSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('restaurant_service_configs')
      .select('id, service_type')
      .eq('restaurant_id', restaurantId);
    if (existingError) throw existingError;

    const byType = new Map<string, string>(
      (existing ?? []).map((row: { id: string; service_type: string }) => [row.service_type, row.id]),
    );
    const now = new Date().toISOString();

    for (const config of configs) {
      const existingId = byType.get(config.service_type);
      if (existingId) {
        const { error } = await supabase
          .from('restaurant_service_configs')
          .update({
            is_active: config.is_active,
            config_metadata: config.config_metadata ?? {},
            updated_at: now,
          })
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('restaurant_service_configs').insert({
          restaurant_id: restaurantId,
          service_type: config.service_type,
          is_active: config.is_active,
          config_metadata: config.config_metadata ?? {},
          created_at: now,
          updated_at: now,
        });
        if (error) throw error;
      }
    }

    if (primaryServiceType) {
      const { error: primaryError } = await supabase
        .from('restaurants')
        .update({ service_type: primaryServiceType, updated_at: now })
        .eq('id', restaurantId);
      if (primaryError) throw primaryError;

      await supabaseApiAdapter.updateRestaurantProfile(restaurantId, {
        service_config: {
          primary_type: primaryServiceType,
          active_types: configs.filter((c) => c.is_active).map((c) => c.service_type),
        },
      });
    }

    return supabaseApiAdapter.getServiceConfigs(restaurantId);
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
    // The server now dedupes on (order_id, idempotency_key) instead of
    // always minting a fresh key itself — but that protection only kicks in
    // if a caller retries with the SAME key. This adapter generates a new
    // key per call, so it protects a caller that already owns retry logic
    // (pass the same key on each attempt); it does not by itself make a
    // second, independent tap of "Pay" idempotent — that still needs a
    // disabled-while-submitting guard in the UI, same as the cash register
    // actions in OwnerHubScreen.
    const { data, error } = await getSupabaseClient().rpc('restaurant_record_payment', {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
      p_amount: amount,
      p_tip_amount: tipAmount,
      p_notes: notes || null,
      p_idempotency_key: Crypto.randomUUID(),
    });
    if (error) throw error;
    return data;
  },

  async exportUserData() {
    const { data, error } = await getSupabaseClient().rpc('export_user_data');
    if (error) throw error;
    return data;
  },

  async requestAccountDeletion() {
    const { data, error } = await getSupabaseClient().rpc('request_account_deletion');
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

  async uploadRestaurantLogo(restaurantId: string, uri: string, contentType = 'image/jpeg') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Não foi possível preparar a imagem selecionada.');
    const file = await response.arrayBuffer();
    const supabase = getSupabaseClient();
    const path = `${restaurantId}/logo`;
    const { error: uploadError } = await supabase.storage
      .from('restaurant-logos')
      .upload(path, file, { contentType, upsert: true, cacheControl: '3600' });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from('restaurant-logos').getPublicUrl(path);
    const logoUrl = `${publicData.publicUrl}?v=${Date.now()}`;
    await supabaseApiAdapter.updateRestaurantProfile(restaurantId, { logo_url: logoUrl });
    return logoUrl;
  },

  async uploadRestaurantBanner(restaurantId: string, uri: string, contentType = 'image/jpeg') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Não foi possível preparar a imagem selecionada.');
    const file = await response.arrayBuffer();
    const supabase = getSupabaseClient();
    const path = `${restaurantId}/banner`;
    const { error: uploadError } = await supabase.storage
      .from('restaurant-logos')
      .upload(path, file, { contentType, upsert: true, cacheControl: '3600' });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from('restaurant-logos').getPublicUrl(path);
    const bannerUrl = `${publicData.publicUrl}?v=${Date.now()}`;
    await supabaseApiAdapter.updateRestaurantProfile(restaurantId, {
      banner_url: bannerUrl,
      cover_image_url: bannerUrl,
    });
    return bannerUrl;
  },

  async createMyRestaurant(input: {
    name: string;
    phone: string;
    email: string;
    city?: string;
    state?: string;
    address?: string;
    addressNumber?: string;
    addressComplement?: string;
    neighborhood?: string;
    zipCode?: string;
    serviceType?: string;
  }) {
    const { data, error } = await getSupabaseClient().rpc('create_my_restaurant', {
      p_name: input.name,
      p_phone: input.phone,
      p_email: input.email,
      p_city: input.city ?? 'São Paulo',
      p_state: input.state ?? 'SP',
      p_address: input.address ?? 'Endereço a definir',
      p_zip_code: input.zipCode ?? '00000-000',
      p_service_type: input.serviceType ?? 'casual_dining',
    });
    if (error) throw error;

    const restaurantId = data && typeof data === 'object' && 'id' in data ? String(data.id) : '';
    if (restaurantId) {
      const { data: updated, error: updateError } = await getSupabaseClient().rpc('restaurant_update_profile', {
        p_restaurant_id: restaurantId,
        p_patch: {
          address: input.address ?? 'Endereço a definir',
          address_number: input.addressNumber ?? '',
          address_complement: input.addressComplement ?? '',
          neighborhood: input.neighborhood ?? '',
          zip_code: input.zipCode ?? '00000-000',
          city: input.city ?? 'São Paulo',
          state: input.state ?? 'SP',
        },
      });
      if (updateError) throw updateError;
      return updated;
    }

    return data;
  },
};
