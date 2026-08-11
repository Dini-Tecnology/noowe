import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  is_read: boolean;
}

class NotificationsSocketService {
  private channel: RealtimeChannel | null = null;
  private connected = false;
  private userId: string | null = null;
  private userRooms = new Set<string>();
  private listeners = new Set<(notification: Notification) => void>();

  async connect() {
    if (this.connected && this.channel) {
      console.log('Notifications realtime already connected');
      return;
    }

    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    this.userId = userData.user?.id ?? null;

    this.channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, (payload) => {
        const row = (payload.new || payload.old || {}) as any;
        if (!row) return;
        const targetUserId = row.user_id || row.recipient_id;
        const canEmit = (this.userId && targetUserId === this.userId) || this.userRooms.has(targetUserId);
        if (!canEmit) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const notification = {
            ...(payload.new as any),
            type: (payload.new as any).type || (payload.new as any).notification_type,
          } as Notification;
          this.listeners.forEach((listener) => listener(notification));
        }
      });

    await new Promise<void>((resolve, reject) => {
      this.channel!
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.connected = true;
            console.log('Connected to notifications realtime');
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Notifications realtime failed: ${status}`));
          }
        });
    });
  }

  async disconnect() {
    if (this.channel) {
      await getSupabaseClient().removeChannel(this.channel);
      this.channel = null;
    }
    this.connected = false;
    this.userRooms.clear();
  }

  joinUserRoom(userId: string) {
    this.userRooms.add(userId);
  }

  leaveUserRoom(userId: string) {
    this.userRooms.delete(userId);
  }

  onNotification(callback: (notification: Notification) => void) {
    this.listeners.add(callback);
  }

  offNotification(callback?: (notification: Notification) => void) {
    if (!callback) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(callback);
  }

  async markAsRead(notificationId: string) {
    await getSupabaseClient()
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);
  }

  isConnected() {
    return this.connected;
  }
}

export const notificationsSocketService = new NotificationsSocketService();
