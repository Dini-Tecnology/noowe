import { ordersSocketService } from './orders-socket';
import { reservationsSocketService } from './reservations-socket';
import { notificationsSocketService } from './notifications-socket';
import { waitlistSocketService } from './waitlist-socket';
import { isSupabaseConfigured } from './supabase';

class SocketManager {
  async connectAll() {
    try {
      if (!isSupabaseConfigured()) {
        console.warn('Supabase realtime is not configured; skipping socket connection');
        return;
      }

      const connections = [
        ordersSocketService.connect(),
        reservationsSocketService.connect(),
        notificationsSocketService.connect(),
        waitlistSocketService.connect(),
      ];

      await Promise.all(connections);
      console.log('All sockets connected');
    } catch (error) {
      console.error('Failed to connect all sockets:', error);
    }
  }

  async disconnectAll() {
    await Promise.all([
      ordersSocketService.disconnect(),
      reservationsSocketService.disconnect(),
      notificationsSocketService.disconnect(),
      waitlistSocketService.disconnect(),
    ]);
    console.log('All sockets disconnected');
  }

  getOrdersSocket() {
    return ordersSocketService;
  }

  getReservationsSocket() {
    return reservationsSocketService;
  }

  getNotificationsSocket() {
    return notificationsSocketService;
  }

  getWaitlistSocket() {
    return waitlistSocketService;
  }
}

export const socketManager = new SocketManager();
export { ordersSocketService, reservationsSocketService, notificationsSocketService, waitlistSocketService };
