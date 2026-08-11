import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseApiAdapter } from './supabase-api';
import { getSupabaseClient } from './supabase';

class OrdersSocketService {
  private channel: RealtimeChannel | null = null;
  private connected = false;
  private userId: string | null = null;
  private restaurantRooms = new Set<string>();
  private userRooms = new Set<string>();
  private orderRooms = new Set<string>();
  private onOrderNewListeners = new Set<(order: any) => void>();
  private onOrderUpdateListeners = new Set<(order: any) => void>();
  private onOrderCancelledListeners = new Set<(data: { order_id: string; reason?: string }) => void>();

  async connect() {
    if (this.connected && this.channel) {
      console.log('Orders realtime already connected');
      return;
    }

    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    this.userId = userData.user?.id ?? null;

    this.channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const row = (payload.new || payload.old || {}) as any;
        if (!this.shouldEmit(row)) return;

        if (payload.eventType === 'INSERT') {
          this.onOrderNewListeners.forEach((listener) => listener(payload.new));
          return;
        }

        if (payload.eventType === 'UPDATE') {
          this.onOrderUpdateListeners.forEach((listener) => listener(payload.new));
          if (payload.new?.status === 'cancelled') {
            this.onOrderCancelledListeners.forEach((listener) =>
              listener({
                order_id: payload.new.id,
                reason: payload.new.cancellation_reason,
              })
            );
          }
        }
      });

    await new Promise<void>((resolve, reject) => {
      this.channel!
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.connected = true;
            console.log('Connected to orders realtime');
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Orders realtime failed: ${status}`));
          }
        });
    });
  }

  private shouldEmit(row: any) {
    if (!row) return false;

    if (this.orderRooms.size > 0 && row.id && this.orderRooms.has(row.id)) {
      return true;
    }
    if (this.restaurantRooms.size > 0 && row.restaurant_id && this.restaurantRooms.has(row.restaurant_id)) {
      return true;
    }
    if (this.userRooms.size > 0 && row.customer_id && this.userRooms.has(row.customer_id)) {
      return true;
    }
    if (this.userId && row.customer_id && row.customer_id === this.userId) {
      return true;
    }

    // If no room filters were set by the caller, emit all rows visible via RLS
    return this.orderRooms.size === 0 && this.restaurantRooms.size === 0 && this.userRooms.size === 0;
  }

  async disconnect() {
    if (this.channel) {
      const supabase = getSupabaseClient();
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.connected = false;
    this.restaurantRooms.clear();
    this.userRooms.clear();
    this.orderRooms.clear();
  }

  joinRestaurantRoom(restaurantId: string) {
    this.restaurantRooms.add(restaurantId);
  }

  joinUserRoom(userId: string) {
    this.userRooms.add(userId);
  }

  leaveRestaurantRoom(restaurantId: string) {
    this.restaurantRooms.delete(restaurantId);
  }

  leaveUserRoom(userId: string) {
    this.userRooms.delete(userId);
  }

  onOrderNew(callback: (order: any) => void) {
    this.onOrderNewListeners.add(callback);
  }

  onOrderUpdate(callback: (order: any) => void) {
    this.onOrderUpdateListeners.add(callback);
  }

  onOrderCancelled(callback: (data: { order_id: string; reason?: string }) => void) {
    this.onOrderCancelledListeners.add(callback);
  }

  offOrderNew(callback?: (order: any) => void) {
    if (!callback) {
      this.onOrderNewListeners.clear();
      return;
    }
    this.onOrderNewListeners.delete(callback);
  }

  offOrderUpdate(callback?: (order: any) => void) {
    if (!callback) {
      this.onOrderUpdateListeners.clear();
      return;
    }
    this.onOrderUpdateListeners.delete(callback);
  }

  offOrderCancelled(callback?: (data: any) => void) {
    if (!callback) {
      this.onOrderCancelledListeners.clear();
      return;
    }
    this.onOrderCancelledListeners.delete(callback);
  }

  joinOrderRoom(orderId: string) {
    this.orderRooms.add(orderId);
  }

  leaveOrderRoom(orderId: string) {
    this.orderRooms.delete(orderId);
  }

  async updateOrderStatus(orderId: string, status: string, estimatedTime?: number) {
    await supabaseApiAdapter.updateOrderStatus(orderId, status, estimatedTime);
  }

  async markOrderReady(orderId: string) {
    await supabaseApiAdapter.updateOrderStatus(orderId, 'ready');
  }

  isConnected() {
    return this.connected;
  }
}

export const ordersSocketService = new OrdersSocketService();
