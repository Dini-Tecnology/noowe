import { ordersSocketService } from './orders-socket';
import { reservationsSocketService } from './reservations-socket';
import { notificationsSocketService } from './notifications-socket';
import { waitlistSocketService } from './waitlist-socket';
import { isSupabaseConfigured } from './supabase';
import { getOptionalSupabaseSessionUser } from './supabase-auth';

class SocketManager {
  async connectAll(): Promise<boolean> {
    try {
      if (!isSupabaseConfigured()) {
        console.warn('Supabase realtime is not configured; skipping socket connection');
        return false;
      }

      const { user } = await getOptionalSupabaseSessionUser();
      if (!user) {
        return false;
      }

      const connections = [
        ordersSocketService.connect(),
        reservationsSocketService.connect(),
        notificationsSocketService.connect(),
        waitlistSocketService.connect(),
      ];

      const failures = (
        await Promise.all(
          connections.map(async (connection) => {
            try {
              await connection;
              return null;
            } catch (error) {
              return error;
            }
          })
        )
      ).filter(Boolean);

      if (failures.length > 0) {
        console.warn('Some realtime sockets failed to connect:', failures);
        return false;
      }

      console.log('All sockets connected');
      return true;
    } catch (error) {
      console.warn('Unable to prepare realtime sockets:', error);
      return false;
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
