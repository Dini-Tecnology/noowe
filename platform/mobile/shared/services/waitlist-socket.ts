import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

class WaitlistSocketService {
  private channel: RealtimeChannel | null = null;
  private connected = false;
  private userId: string | null = null;
  private restaurantRooms = new Set<string>();
  private userRooms = new Set<string>();
  private waitlistRooms = new Set<string>();
  private onPositionUpdateListeners = new Set<(data: { waitlist_id: string; position: number; estimated_wait_minutes?: number }) => void>();
  private onCalledListeners = new Set<(data: { waitlist_id: string; table_id?: string; message?: string }) => void>();
  private onAutoCalledListeners = new Set<(data: { waitlist_id: string; table_id?: string; message?: string }) => void>();

  async connect() {
    if (this.connected && this.channel) {
      console.log('Waitlist realtime already connected');
      return;
    }

    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    this.userId = userData.user?.id ?? null;

    this.channel = supabase
      .channel('waitlist-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist_entries' }, (payload) => {
        const row = (payload.new || payload.old || {}) as any;
        if (!row) return;
        if (!this.shouldEmit(row)) return;

        if (payload.eventType === 'UPDATE') {
          if (typeof row.position === 'number') {
            this.onPositionUpdateListeners.forEach((listener) =>
              listener({
                waitlist_id: row.id,
                position: row.position,
                estimated_wait_minutes: row.estimated_wait_minutes,
              })
            );
          }

          if (row.status === 'called') {
            const calledData = { waitlist_id: row.id, table_id: row.table_number, message: row.notes };
            this.onCalledListeners.forEach((listener) => listener(calledData));
            if (row.called_by === 'system') {
              this.onAutoCalledListeners.forEach((listener) => listener(calledData));
            }
          }
        }
      });

    await new Promise<void>((resolve, reject) => {
      this.channel!
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.connected = true;
            console.log('Connected to waitlist realtime');
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Waitlist realtime failed: ${status}`));
          }
        });
    });
  }

  private shouldEmit(row: any) {
    if (this.waitlistRooms.size > 0 && row.id && this.waitlistRooms.has(row.id)) return true;
    if (this.restaurantRooms.size > 0 && row.restaurant_id && this.restaurantRooms.has(row.restaurant_id)) return true;
    if (this.userRooms.size > 0 && row.customer_id && this.userRooms.has(row.customer_id)) return true;
    if (this.userId && row.customer_id && row.customer_id === this.userId) return true;
    return this.waitlistRooms.size === 0 && this.restaurantRooms.size === 0 && this.userRooms.size === 0;
  }

  async disconnect() {
    if (this.channel) {
      await getSupabaseClient().removeChannel(this.channel);
      this.channel = null;
    }
    this.connected = false;
    this.restaurantRooms.clear();
    this.userRooms.clear();
    this.waitlistRooms.clear();
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

  onPositionUpdate(callback: (data: { waitlist_id: string; position: number; estimated_wait_minutes?: number }) => void) {
    this.onPositionUpdateListeners.add(callback);
  }

  onCalled(callback: (data: { waitlist_id: string; table_id?: string; message?: string }) => void) {
    this.onCalledListeners.add(callback);
  }

  onAutoCalled(callback: (data: { waitlist_id: string; table_id?: string; message?: string }) => void) {
    this.onAutoCalledListeners.add(callback);
  }

  offPositionUpdate(callback?: (data: any) => void) {
    if (!callback) {
      this.onPositionUpdateListeners.clear();
      return;
    }
    this.onPositionUpdateListeners.delete(callback);
  }

  offCalled(callback?: (data: any) => void) {
    if (!callback) {
      this.onCalledListeners.clear();
      return;
    }
    this.onCalledListeners.delete(callback);
  }

  offAutoCalled(callback?: (data: any) => void) {
    if (!callback) {
      this.onAutoCalledListeners.clear();
      return;
    }
    this.onAutoCalledListeners.delete(callback);
  }

  joinWaitlistRoom(waitlistId: string) {
    this.waitlistRooms.add(waitlistId);
  }

  leaveWaitlistRoom(waitlistId: string) {
    this.waitlistRooms.delete(waitlistId);
  }

  isConnected() {
    return this.connected;
  }
}

export const waitlistSocketService = new WaitlistSocketService();
