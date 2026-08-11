import { socketManager } from '@okinawa/shared/services/socket';

type Listener = (data: unknown) => void;

class SocketService {
  private listeners: Map<string, Set<Listener>> = new Map();
  private connected = false;
  private realtimeEventsBound = false;
  private readonly handleOrderNew = (order: unknown) => this.emit('order:new', order);
  private readonly handleOrderUpdated = (order: unknown) => {
    this.emit('order:updated', order);
    this.emit('order:update', order);
  };
  private readonly handleOrderCancelled = (data: unknown) => this.emit('order:cancelled', data);
  private readonly handleReservationNew = (reservation: unknown) => this.emit('reservation:new', reservation);
  private readonly handleReservationUpdated = (reservation: unknown) => this.emit('reservation:updated', reservation);
  private readonly handleNotification = (notification: unknown) => this.emit('notification', notification);
  private readonly handleWaitlistPosition = (data: unknown) => this.emit('waitlist:position:update', data);
  private readonly handleWaitlistCalled = (data: unknown) => this.emit('waitlist:called', data);

  async connect() {
    await socketManager.connectAll();
    this.bindRealtimeEvents();
    this.connected = true;
    this.emit('connect', { connected: true });
  }

  async disconnect() {
    this.unbindRealtimeEvents();
    await socketManager.disconnectAll();
    this.connected = false;
    this.emit('disconnect', { connected: false });
  }

  on(event: string, callback: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    return () => this.off(event, callback);
  }

  off(event: string, callback?: Listener) {
    if (!callback) {
      this.listeners.delete(event);
      return;
    }
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(data));
  }

  private bindRealtimeEvents() {
    if (this.realtimeEventsBound) return;

    const ordersSocket = socketManager.getOrdersSocket();
    ordersSocket.onOrderNew(this.handleOrderNew);
    ordersSocket.onOrderUpdate(this.handleOrderUpdated);
    ordersSocket.onOrderCancelled(this.handleOrderCancelled);

    const reservationsSocket = socketManager.getReservationsSocket();
    reservationsSocket.onReservationNew(this.handleReservationNew);
    reservationsSocket.onReservationUpdate(this.handleReservationUpdated);

    socketManager.getNotificationsSocket().onNotification(this.handleNotification as any);

    const waitlistSocket = socketManager.getWaitlistSocket();
    waitlistSocket.onPositionUpdate(this.handleWaitlistPosition as any);
    waitlistSocket.onCalled(this.handleWaitlistCalled as any);

    this.realtimeEventsBound = true;
  }

  private unbindRealtimeEvents() {
    if (!this.realtimeEventsBound) return;

    const ordersSocket = socketManager.getOrdersSocket();
    ordersSocket.offOrderNew(this.handleOrderNew);
    ordersSocket.offOrderUpdate(this.handleOrderUpdated);
    ordersSocket.offOrderCancelled(this.handleOrderCancelled);

    const reservationsSocket = socketManager.getReservationsSocket();
    reservationsSocket.offReservationNew(this.handleReservationNew);
    reservationsSocket.offReservationUpdate(this.handleReservationUpdated);

    socketManager.getNotificationsSocket().offNotification(this.handleNotification as any);

    const waitlistSocket = socketManager.getWaitlistSocket();
    waitlistSocket.offPositionUpdate(this.handleWaitlistPosition as any);
    waitlistSocket.offCalled(this.handleWaitlistCalled as any);

    this.realtimeEventsBound = false;
  }

  joinRestaurantRoom(restaurantId: string) {
    socketManager.getOrdersSocket().joinRestaurantRoom(restaurantId);
    socketManager.getReservationsSocket().joinRestaurantRoom(restaurantId);
    socketManager.getWaitlistSocket().joinRestaurantRoom(restaurantId);
  }

  leaveRestaurantRoom(restaurantId: string) {
    socketManager.getOrdersSocket().leaveRestaurantRoom(restaurantId);
    socketManager.getReservationsSocket().leaveRestaurantRoom(restaurantId);
    socketManager.getWaitlistSocket().leaveRestaurantRoom(restaurantId);
  }

  send(event: string, payload?: unknown) {
    if (event === 'joinRoom' || event === 'leaveRoom') {
      const room = typeof payload === 'object' && payload && 'room' in payload
        ? String((payload as { room?: unknown }).room || '')
        : '';
      const restaurantId = room.split(':').pop();
      if (restaurantId) {
        if (event === 'joinRoom') {
          this.joinRestaurantRoom(restaurantId);
        } else {
          this.leaveRestaurantRoom(restaurantId);
        }
      }
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

export default new SocketService();
