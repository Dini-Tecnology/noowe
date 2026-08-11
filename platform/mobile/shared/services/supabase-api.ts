import { getSupabaseClient } from './supabase';

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
  createOrder(data: SupabaseCreateOrderInput): Promise<any>;
  getMyOrders(): Promise<any>;
  getOrder(id: string): Promise<any>;
  getRestaurantOrders(params?: SupabaseRestaurantOrdersParams): Promise<any>;
  updateOrderStatus(orderId: string, status: SupabaseOrderStatus | string, estimated_time?: number): Promise<any>;
  cancelOrder(id: string, reason?: string): Promise<any>;
  createReservation(data: SupabaseCreateReservationInput): Promise<any>;
  getMyReservations(): Promise<any>;
  getReservations(params?: SupabaseReservationsParams): Promise<any>;
  getReservation(id: string): Promise<any>;
  updateReservationStatus(id: string, status: SupabaseReservationStatus | string, extra?: Record<string, unknown>): Promise<any>;
  updateReservation(id: string, patch: Record<string, unknown>): Promise<any>;
}

export const supabaseApiAdapter: SupabaseApiAdapter = {
  async createOrder(data) {
    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        restaurant_id: data.restaurant_id,
        customer_id: userData.user?.id,
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
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('customer_id', userData.user?.id)
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
    let query = getSupabaseClient()
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });

    if (params?.restaurant_id) query = query.eq('restaurant_id', params.restaurant_id);
    if (params?.status) query = query.in('status', params.status.split(','));
    if (params?.table_id) query = query.eq('table_id', params.table_id);
    if (params?.date) {
      query = query.gte('created_at', `${params.date}T00:00:00`).lt('created_at', `${params.date}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async updateOrderStatus(orderId: string, status: string, estimated_time?: number) {
    const { data, error } = await getSupabaseClient()
      .from('orders')
      .update({ status, estimated_time })
      .eq('id', orderId)
      .select()
      .single();
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

  async createReservation(data) {
    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const { data: reservation, error } = await supabase
      .from('reservations')
      .insert({
        ...data,
        customer_id: userData.user?.id,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    return reservation;
  },

  async getMyReservations() {
    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('customer_id', userData.user?.id)
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
};
