import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

class ReservationsSocketService {
  private channel: RealtimeChannel | null = null;
  private connected = false;
  private userId: string | null = null;
  private restaurantRooms = new Set<string>();
  private userRooms = new Set<string>();
  private reservationRooms = new Set<string>();
  private onReservationNewListeners = new Set<(reservation: any) => void>();
  private onReservationUpdateListeners = new Set<(reservation: any) => void>();
  private onReservationCancelledListeners = new Set<(data: { reservation_id: string; reason?: string }) => void>();
  private onReservationConfirmedListeners = new Set<(data: { reservation_id: string }) => void>();
  private onReservationReminderListeners = new Set<
    (data: { reservation_id: string; reservation_time: string; restaurant_name?: string; minutes_until?: number }) => void
  >();

  async connect() {
    if (this.connected && this.channel) {
      console.log('Reservations realtime already connected');
      return;
    }

    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    this.userId = userData.user?.id ?? null;

    this.channel = supabase
      .channel('reservations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, (payload) => {
        const row = (payload.new || payload.old || {}) as any;
        if (!this.shouldEmit(row)) return;

        if (payload.eventType === 'INSERT') {
          this.onReservationNewListeners.forEach((listener) => listener(payload.new));
          return;
        }

        if (payload.eventType === 'UPDATE') {
          this.onReservationUpdateListeners.forEach((listener) => listener(payload.new));

          if (payload.new?.status === 'cancelled') {
            this.onReservationCancelledListeners.forEach((listener) =>
              listener({
                reservation_id: payload.new.id,
                reason: payload.new.cancellation_reason,
              })
            );
          }

          if (payload.new?.status === 'confirmed') {
            this.onReservationConfirmedListeners.forEach((listener) =>
              listener({ reservation_id: payload.new.id })
            );
          }
        }
      });

    await new Promise<void>((resolve, reject) => {
      this.channel!
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.connected = true;
            console.log('Connected to reservations realtime');
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Reservations realtime failed: ${status}`));
          }
        });
    });
  }

  private shouldEmit(row: any) {
    if (!row) return false;

    if (this.reservationRooms.size > 0 && row.id && this.reservationRooms.has(row.id)) {
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

    return this.reservationRooms.size === 0 && this.restaurantRooms.size === 0 && this.userRooms.size === 0;
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
    this.reservationRooms.clear();
    this.onReservationReminderListeners.clear();
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

  onReservationNew(callback: (reservation: any) => void) {
    this.onReservationNewListeners.add(callback);
  }

  onReservationUpdate(callback: (reservation: any) => void) {
    this.onReservationUpdateListeners.add(callback);
  }

  onReservationCancelled(callback: (data: { reservation_id: string; reason?: string }) => void) {
    this.onReservationCancelledListeners.add(callback);
  }

  onReservationConfirmed(callback: (data: { reservation_id: string }) => void) {
    this.onReservationConfirmedListeners.add(callback);
  }

  offReservationNew(callback?: (reservation: any) => void) {
    if (!callback) {
      this.onReservationNewListeners.clear();
      return;
    }
    this.onReservationNewListeners.delete(callback);
  }

  offReservationUpdate(callback?: (reservation: any) => void) {
    if (!callback) {
      this.onReservationUpdateListeners.clear();
      return;
    }
    this.onReservationUpdateListeners.delete(callback);
  }

  offReservationCancelled(callback?: (data: any) => void) {
    if (!callback) {
      this.onReservationCancelledListeners.clear();
      return;
    }
    this.onReservationCancelledListeners.delete(callback);
  }

  offReservationConfirmed(callback?: (data: any) => void) {
    if (!callback) {
      this.onReservationConfirmedListeners.clear();
      return;
    }
    this.onReservationConfirmedListeners.delete(callback);
  }

  onReservationReminder(callback: (data: { reservation_id: string; reservation_time: string; restaurant_name?: string; minutes_until?: number }) => void) {
    this.onReservationReminderListeners.add(callback);
  }

  offReservationReminder(callback?: (data: any) => void) {
    if (!callback) {
      this.onReservationReminderListeners.clear();
      return;
    }
    this.onReservationReminderListeners.delete(callback);
  }

  joinReservationRoom(reservationId: string) {
    this.reservationRooms.add(reservationId);
  }

  leaveReservationRoom(reservationId: string) {
    this.reservationRooms.delete(reservationId);
  }

  isConnected() {
    return this.connected;
  }
}

export const reservationsSocketService = new ReservationsSocketService();
