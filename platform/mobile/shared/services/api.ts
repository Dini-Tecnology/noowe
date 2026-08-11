import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { secureStorage } from './secure-storage';
import { supabaseAuthAdapter } from './supabase-auth';
import {
  supabaseApiAdapter,
  type SupabaseCreateOrderInput,
  type SupabaseCreateReservationInput,
  type SupabaseRestaurantOrdersParams,
  type SupabaseReservationsParams,
} from './supabase-api';
import { getSupabaseClient } from './supabase';
import logger from '../utils/logger';

// React Native global __DEV__ type declaration
declare const __DEV__: boolean;

/**
 * API URL Configuration
 * - Development: HTTP localhost is acceptable (exempt from App Transport Security)
 * - Production: HTTPS is mandatory for security compliance
 *
 * SECURITY: Never use HTTP in production. iOS App Transport Security and
 * Android Network Security Config enforce HTTPS by default.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ENV } = require('../config/env');
const API_URL = ENV.API_BASE_URL;

// Security validation: Ensure HTTPS in production
if (!__DEV__ && !API_URL.startsWith('https://')) {
  throw new Error('SECURITY ERROR: Production API must use HTTPS');
}

// Security constants
const MAX_REFRESH_RETRIES = 3;
const REFRESH_RETRY_WINDOW_MS = 60000; // 1 minute

/**
 * Event listener type for the re-consent event (HTTP 451).
 * The navigation layer subscribes to this so it can show the ReConsentScreen.
 */
type ConsentRequiredListener = (data: {
  currentTermsVersion: string;
  currentPrivacyVersion: string;
}) => void;

/** Module-level listeners for consent-required events (451 responses). */
const consentListeners: Set<ConsentRequiredListener> = new Set();

/**
 * Subscribe to consent-required events emitted when the API returns 451.
 * Returns an unsubscribe function.
 */
export function onConsentRequired(listener: ConsentRequiredListener): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

class ApiService {
  private api: AxiosInstance;
  private refreshing: boolean = false;
  private refreshRetryCount: number = 0;
  private refreshRetryWindowStart: number = 0;
  private failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  /** Queue of requests that failed with 451, to be retried after consent. */
  private consentQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
    config: InternalAxiosRequestConfig;
  }> = [];
  private consentPending: boolean = false;

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - attach token
    this.api.interceptors.request.use(
      async (config) => {
        const token = await secureStorage.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        logger.api(config.method?.toUpperCase() || 'GET', config.url || '');
        return config;
      },
      (error) => {
        logger.apiError('REQUEST', error.config?.url || 'unknown', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle errors and token refresh
    this.api.interceptors.response.use(
      (response) => {
        logger.apiResponse(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status
        );
        return response;
      },
      async (error: AxiosError) => {
        logger.apiError(
          error.config?.method?.toUpperCase() || 'UNKNOWN',
          error.config?.url || 'unknown',
          error
        );
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean; _consentRetry?: boolean };

        // LGPD Sprint 2: Handle 451 (Unavailable For Legal Reasons) — re-consent required
        if (error.response?.status === 451 && !originalRequest._consentRetry) {
          const data = error.response.data as any;
          if (data?.requiresConsent) {
            originalRequest._consentRetry = true;

            // Queue the failed request so it can be retried after consent
            const retryPromise = new Promise((resolve, reject) => {
              this.consentQueue.push({ resolve, reject, config: originalRequest });
            }).then(() => this.api(originalRequest));

            // Emit consent-required event for the navigation layer (only once per burst)
            if (!this.consentPending) {
              this.consentPending = true;
              const consentData = {
                currentTermsVersion: data.currentTermsVersion || '1.0.0',
                currentPrivacyVersion: data.currentPrivacyVersion || '1.0.0',
              };
              for (const listener of consentListeners) {
                try { listener(consentData); } catch { /* swallow */ }
              }
            }

            return retryPromise;
          }
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.refreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then(() => {
              return this.api(originalRequest);
            });
          }

          originalRequest._retry = true;
          this.refreshing = true;

          try {
            // Rate limiting: Check if we've exceeded max retries in window
            const now = Date.now();
            if (now - this.refreshRetryWindowStart > REFRESH_RETRY_WINDOW_MS) {
              // Reset window
              this.refreshRetryCount = 0;
              this.refreshRetryWindowStart = now;
            }

            this.refreshRetryCount++;

            if (this.refreshRetryCount > MAX_REFRESH_RETRIES) {
              logger.warn('Max token refresh retries exceeded, forcing logout');
              await secureStorage.clearAll();
              this.processQueue(new Error('Session expired'));
              this.refreshing = false;
              throw new Error('Session expired - too many refresh attempts');
            }

            let access_token: string | undefined;
            let newRefreshToken: string | undefined;

            const session = await supabaseAuthAdapter.refreshSession();
            access_token = session.access_token;
            newRefreshToken = session.refresh_token;

            if (!access_token) {
              throw new Error('No refreshed access token');
            }

            await secureStorage.setAccessToken(access_token);
            if (newRefreshToken) {
              await secureStorage.setRefreshToken(newRefreshToken);
            }

            // Reset retry count on successful refresh
            this.refreshRetryCount = 0;

            this.processQueue(null);
            this.refreshing = false;

            originalRequest.headers.Authorization = `Bearer ${access_token}`;
            return this.api(originalRequest);
          } catch (refreshError) {
            this.processQueue(refreshError instanceof Error ? refreshError : new Error(String(refreshError)));
            this.refreshing = false;

            // Clear tokens and redirect to login
            await secureStorage.clearAll();

            throw refreshError;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private processQueue(error: Error | null) {
    this.failedQueue.forEach((promise) => {
      if (error) {
        promise.reject(error);
      } else {
        promise.resolve();
      }
    });

    this.failedQueue = [];
  }

  /**
   * Call after the user has accepted re-consent to retry all queued 451 requests.
   */
  resolveConsentQueue() {
    this.consentPending = false;
    for (const queued of this.consentQueue) {
      queued.resolve();
    }
    this.consentQueue = [];
  }

  /**
   * Reject all queued 451 requests (e.g. user declined terms).
   */
  rejectConsentQueue() {
    this.consentPending = false;
    for (const queued of this.consentQueue) {
      queued.reject(new Error('User declined re-consent'));
    }
    this.consentQueue = [];
  }

  // ======================
  // AUTH ENDPOINTS
  // ======================

  async login(email: string, password: string) {
    const data = await supabaseAuthAdapter.login(email, password);
    const { access_token, refresh_token, user } = data;

    await Promise.all([
      access_token ? secureStorage.setAccessToken(access_token) : Promise.resolve(),
      refresh_token ? secureStorage.setRefreshToken(refresh_token) : Promise.resolve(),
      user ? secureStorage.setUser(user) : Promise.resolve(),
    ]);

    return data;
  }

  async register(data: { email: string; password: string; full_name: string }) {
    const authData = await supabaseAuthAdapter.register(data.email, data.password, data.full_name);
    const { access_token, refresh_token, user } = authData;

    await Promise.all([
      access_token ? secureStorage.setAccessToken(access_token) : Promise.resolve(),
      refresh_token ? secureStorage.setRefreshToken(refresh_token) : Promise.resolve(),
      user ? secureStorage.setUser(user) : Promise.resolve(),
    ]);

    return authData;
  }

  async logout() {
    await secureStorage.clearAll();
  }

  async getCurrentUser() {
    const user = await supabaseAuthAdapter.getCurrentUser();
    if (user) {
      await secureStorage.setUser(user);
    }
    return user;
  }

  async updateProfile(data: { full_name?: string; phone?: string; avatar_url?: string }) {
    const row = await supabaseAuthAdapter.updateProfile({
      full_name: data.full_name,
      phone: data.phone,
      avatar_url: data.avatar_url,
    });
    await secureStorage.setUser(row);
    return row;
  }

  async deleteAccount() {
    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update({
        deletion_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userData.user.id);
    if (error) throw error;

    await supabaseAuthAdapter.logout();
    await secureStorage.clearAll();
    return { success: true };
  }

  // ======================
  // RESTAURANT ENDPOINTS (Customer Side)
  // ======================

  async getRestaurants(params?: { lat?: number; lng?: number; search?: string }) {
    const response = await this.api.get('/restaurants', { params });
    return response.data;
  }

  async getNearbyRestaurants(latitude: number, longitude: number, radius: number = 5000) {
    const response = await this.api.get('/restaurants', {
      params: { lat: latitude, lng: longitude, radius },
    });
    return response.data;
  }

  async getRestaurant(id: string) {
    const response = await this.api.get(`/restaurants/${id}`);
    return response.data;
  }

  async getRestaurantMenu(restaurantId: string) {
    const response = await this.api.get(`/menu-items/restaurant/${restaurantId}`);
    return response.data;
  }

  // ======================
  // RESTAURANT MANAGEMENT (Restaurant Side)
  // ======================

  async createRestaurant(data: {
    name: string;
    description?: string;
    cuisine_type?: string;
    address?: { street: string; city: string; state: string; zip: string; country?: string };
    phone?: string;
    email?: string;
    opening_hours?: Record<string, { open: string; close: string; closed?: boolean }>;
  }) {
    const response = await this.api.post('/restaurants', data);
    return response.data;
  }

  async getMyRestaurant() {
    const response = await this.api.get('/restaurants/my-restaurant');
    return response.data;
  }

  async updateRestaurant(data: Record<string, unknown>) {
    const response = await this.api.patch('/restaurants/my-restaurant', data);
    return response.data;
  }

  async getMyRestaurants() {
    const response = await this.api.get('/restaurants/my-restaurants');
    return response.data;
  }

  async getStaffProfile() {
    const response = await this.api.get('/users/staff-profile');
    return response.data;
  }

  async getStaffMember(restaurantId: string, memberId: string) {
    const response = await this.api.get(`/restaurants/${restaurantId}/staff/${memberId}`);
    return response.data;
  }

  // ======================
  // ORDER ENDPOINTS (Customer Side)
  // ======================

  async createOrder(data: SupabaseCreateOrderInput) {
    return supabaseApiAdapter.createOrder(data);
  }

  async getMyOrders() {
    return supabaseApiAdapter.getMyOrders();
  }

  async getOrder(id: string) {
    return supabaseApiAdapter.getOrder(id);
  }

  async cancelOrder(id: string, reason?: string) {
    return supabaseApiAdapter.cancelOrder(id, reason);
  }

  async rateOrder(orderId: string, rating: number, review?: string) {
    const response = await this.api.post('/reviews', {
      order_id: orderId,
      rating,
      comment: review,
    });
    return response.data;
  }

  // ======================
  // ORDER MANAGEMENT (Restaurant Side)
  // ======================

  async getRestaurantOrders(params?: SupabaseRestaurantOrdersParams) {
    return supabaseApiAdapter.getRestaurantOrders(params);
  }

  async updateOrderStatus(
    orderId: string,
    status: string,
    estimated_time?: number
  ) {
    return supabaseApiAdapter.updateOrderStatus(orderId, status, estimated_time);
  }

  async acceptOrder(orderId: string, estimated_time?: number) {
    return this.updateOrderStatus(orderId, 'confirmed', estimated_time);
  }

  async rejectOrder(orderId: string, reason: string) {
    const response = await this.api.patch(`/orders/${orderId}/status`, {
      status: 'cancelled',
      cancellation_reason: reason,
    });
    return response.data;
  }

  /**
   * Confirm cash payment for an order (Staff only).
   * Marks order as completed and triggers post-payment cascade.
   */
  async confirmCashPayment(orderId: string) {
    const response = await this.api.patch(`/orders/${orderId}/confirm-cash-payment`);
    return response.data;
  }

  // ======================
  // KDS (Kitchen Display System)
  // ======================

  async getActiveKitchenOrders() {
    const response = await this.api.get('/orders/restaurant', {
      params: { status: 'confirmed,preparing' }
    });
    return response.data;
  }

  /**
   * Marks an order item as prepared/ready.
   * Used by KDS (Kitchen Display System) to update item status.
   * 
   * @param orderId - The order ID containing the item
   * @param itemId - The specific item ID to mark as ready
   * @returns Updated item data
   */
  async markItemPrepared(orderId: string, itemId: string) {
    const response = await this.api.patch(`/order-items/${itemId}/status`, {
      status: 'ready'
    });
    return response.data;
  }

  /**
   * Cancels a bar item from an order.
   * Used by Bar KDS to remove items that cannot be prepared.
   * 
   * @param orderId - The order ID containing the item
   * @param itemId - The specific item ID to cancel
   * @param reason - Optional cancellation reason
   * @returns Updated item data with cancelled status
   */
  async cancelBarItem(orderId: string, itemId: string, reason?: string) {
    const response = await this.api.patch(`/order-items/${itemId}/status`, {
      status: 'cancelled',
      cancellation_reason: reason,
    });
    return response.data;
  }

  /**
   * Marks the entire order as ready for pickup/delivery.
   * 
   * @param orderId - The order ID to mark as ready
   * @returns Updated order data
   */
  async markOrderReady(orderId: string) {
    return this.updateOrderStatus(orderId, 'ready');
  }

  // ======================
  // RESERVATION ENDPOINTS (Customer Side)
  // ======================

  async createReservation(data: SupabaseCreateReservationInput) {
    return supabaseApiAdapter.createReservation(data);
  }

  async getMyReservations() {
    return supabaseApiAdapter.getMyReservations();
  }

  async cancelReservation(id: string, reason?: string) {
    return supabaseApiAdapter.updateReservationStatus(id, 'cancelled', { cancellation_reason: reason });
  }

  // ======================
  // RESERVATION MANAGEMENT (Restaurant Side)
  // ======================

  async getReservations(params?: SupabaseReservationsParams) {
    return supabaseApiAdapter.getReservations(params);
  }

  async getReservation(id: string) {
    return supabaseApiAdapter.getReservation(id);
  }

  async confirmReservation(id: string) {
    return supabaseApiAdapter.updateReservationStatus(id, 'confirmed');
  }

  async rejectReservation(id: string, reason: string) {
    return supabaseApiAdapter.updateReservationStatus(id, 'cancelled', { cancellation_reason: reason });
  }

  async assignReservationTable(id: string, tableId: string) {
    return supabaseApiAdapter.updateReservation(id, { table_id: tableId });
  }

  async updateReservationStatus(id: string, status: string) {
    return supabaseApiAdapter.updateReservationStatus(id, status);
  }

  // ======================
  // MENU MANAGEMENT (Restaurant Side)
  // ======================

  async getMenu() {
    const response = await this.api.get('/menu-items/restaurant');
    return response.data;
  }

  async createMenuItem(data: {
    restaurant_id?: string;
    name: string;
    description?: string;
    price: number;
    category?: string;
    image_url?: string;
    preparation_time?: number;
    allergens?: string[];
    dietary_info?: Record<string, boolean>;
    [key: string]: unknown;
  }) {
    const response = await this.api.post('/menu-items', data);
    return response.data;
  }

  async updateMenuItem(id: string, data: {
    name?: string;
    description?: string;
    price?: number;
    is_available?: boolean;
    category?: string;
    preparation_time?: number;
    [key: string]: unknown;
  }) {
    const response = await this.api.patch(`/menu-items/${id}`, data);
    return response.data;
  }

  async setMenuItemAvailability(id: string, is_available: boolean) {
    const response = await this.api.patch(`/menu-items/${id}`, {
      is_available,
    });
    return response.data;
  }

  async toggleMenuItemAvailability(id: string) {
    const response = await this.api.patch(`/menu-items/${id}/toggle-availability`);
    return response.data;
  }

  async deleteMenuItem(id: string) {
    const response = await this.api.delete(`/menu-items/${id}`);
    return response.data;
  }

  // ======================
  // TABLE MANAGEMENT (Restaurant Side)
  // ======================

  async getTables() {
    const response = await this.api.get('/tables/restaurant');
    return response.data;
  }

  async getTable(tableId: string) {
    const response = await this.api.get(`/tables/${tableId}`);
    return response.data;
  }

  async updateTableStatus(tableId: string, status: string) {
    const response = await this.api.patch(`/tables/${tableId}/status`, {
      status,
    });
    return response.data;
  }

  async updateTableNotes(tableId: string, notes: string) {
    const response = await this.api.patch(`/tables/${tableId}/notes`, { notes });
    return response.data;
  }

  async assignOrderToTable(orderId: string, tableId: string) {
    const response = await this.api.patch(`/orders/${orderId}`, {
      table_id: tableId,
    });
    return response.data;
  }

  // ======================
  // WALLET ENDPOINTS (Customer Side)
  // ======================

  async getWallet() {
    const response = await this.api.get('/payments/wallet');
    return response.data;
  }

  async addFunds(amount: number, payment_method_id: string) {
    const response = await this.api.post('/payments/wallet/recharge', {
      amount,
      payment_method_id,
    });
    return response.data;
  }

  async getTransactions() {
    const response = await this.api.get('/payments/transactions');
    return response.data;
  }

  async getWalletTransactions() {
    const response = await this.api.get('/payments/wallet/transactions');
    return response.data;
  }

  async withdrawFunds(amount: number, bank_account_id?: string) {
    const response = await this.api.post('/payments/wallet/withdraw', {
      amount,
      bank_account_id,
    });
    return response.data;
  }

  // ======================
  // PAYMENT METHODS (Customer Side)
  // ======================

  async getPaymentMethods() {
    const response = await this.api.get('/payments/methods');
    return response.data;
  }

  async addPaymentMethod(data: {
    method_type: string;
    card_number?: string;
    card_holder_name?: string;
    card_exp_month?: string;
    card_exp_year?: string;
    card_cvv?: string;
    pix_key?: string;
  }) {
    const response = await this.api.post('/payments/methods', data);
    return response.data;
  }

  async deletePaymentMethod(id: string) {
    const response = await this.api.delete(`/payments/methods/${id}`);
    return response.data;
  }

  async setDefaultPaymentMethod(id: string) {
    const response = await this.api.patch(`/payments/methods/${id}/set-default`);
    return response.data;
  }

  async processPayment(data: {
    order_id: string;
    payment_method: string;
    amount: number;
    card?: {
      number: string;
      name: string;
      expiry: string;
      cvv: string;
    };
    pix_key?: string;
  }) {
    const response = await this.api.post('/payments/process', data);
    return response.data;
  }

  // ======================
  // REVIEW ENDPOINTS
  // ======================

  async createReview(data: {
    restaurant_id: string;
    order_id?: string;
    rating: number;
    comment?: string;
  }) {
    const response = await this.api.post('/reviews', data);
    return response.data;
  }

  async getRestaurantReviews(restaurantId: string) {
    const response = await this.api.get(`/reviews/restaurant/${restaurantId}`);
    return response.data;
  }

  async getMyReviews() {
    const response = await this.api.get('/reviews/user');
    return response.data;
  }

  async updateReview(reviewId: string, data: {
    rating?: number;
    comment?: string;
  }) {
    const response = await this.api.patch(`/reviews/${reviewId}`, data);
    return response.data;
  }

  async deleteReview(reviewId: string) {
    const response = await this.api.delete(`/reviews/${reviewId}`);
    return response.data;
  }

  // ======================
  // LOYALTY ENDPOINTS
  // ======================

  async getMyLoyaltyPoints() {
    const response = await this.api.get('/loyalty/my-programs');
    return response.data;
  }

  async getLoyaltyProfile(restaurantId: string) {
    const response = await this.api.get('/loyalty/profile', {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  // ======================
  // TIPS ENDPOINTS
  // ======================

  async createTip(data: {
    order_id: string;
    amount: number;
    staff_id?: string;
    message?: string;
  }) {
    const response = await this.api.post('/tips', data);
    return response.data;
  }

  async getMyTips() {
    const response = await this.api.get('/tips/customer');
    return response.data;
  }

  async getTips(params?: { date?: string; staff_id?: string }) {
    const response = await this.api.get('/tips/restaurant', { params });
    return response.data;
  }

  async distributeTips(data: { distributions: Array<{ staff_id: string; amount: number }> }) {
    const response = await this.api.post('/tips/distribute', data);
    return response.data;
  }

  // ======================
  // STAFF MANAGEMENT (Restaurant Side)
  // ======================

  async getStaff() {
    const response = await this.api.get('/users/staff');
    return response.data;
  }

  async addStaff(data: {
    email: string;
    full_name: string;
    role: string;
    phone?: string;
  }) {
    const response = await this.api.post('/users/staff', data);
    return response.data;
  }

  async updateStaffRole(userId: string, role: string) {
    const response = await this.api.patch(`/users/staff/${userId}/role`, {
      role,
    });
    return response.data;
  }

  async removeStaff(userId: string) {
    const response = await this.api.delete(`/users/staff/${userId}`);
    return response.data;
  }

  // ======================
  // FINANCIAL REPORTS (Restaurant Side)
  // ======================

  async getFinancialReport(params: { start_date: string; end_date: string; period?: string }) {
    const response = await this.api.get('/financial/reports', { params });
    return response.data;
  }

  async getFinancialSummary(params?: { start_date?: string; end_date?: string }) {
    const response = await this.api.get('/financial/summary', { params });
    return response.data;
  }

  // ======================
  // ANALYTICS (Restaurant Side)
  // ======================

  async getAnalytics(params?: {
    start_date?: string;
    end_date?: string;
    metric?: string;
  }) {
    const response = await this.api.get('/analytics/dashboard', { params });
    return response.data;
  }

  async getSalesReport(params: { start_date: string; end_date: string }) {
    const response = await this.api.get('/analytics/sales', { params });
    return response.data;
  }

  async getPopularItems(params?: { start_date?: string; end_date?: string; limit?: number }) {
    const response = await this.api.get('/analytics/popular-items', { params });
    return response.data;
  }

  // ======================
  // NOTIFICATIONS
  // ======================

  async getNotifications(params?: {
    unread_only?: boolean;
    type?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get('/notifications', { params });
    return response.data;
  }

  async getNotificationById(id: string) {
    const response = await this.api.get(`/notifications/${id}`);
    return response.data;
  }

  async getUnreadNotificationsCount() {
    const response = await this.api.get('/notifications/unread-count');
    return response.data;
  }

  async getNotificationStatistics() {
    const response = await this.api.get('/notifications/statistics');
    return response.data;
  }

  async markNotificationRead(id: string) {
    const response = await this.api.patch(`/notifications/${id}/read`);
    return response.data;
  }

  async markMultipleNotificationsRead(notificationIds: string[]) {
    const response = await this.api.post('/notifications/mark-as-read', {
      notification_ids: notificationIds,
    });
    return response.data;
  }

  async markAllNotificationsRead() {
    const response = await this.api.post('/notifications/mark-all-read');
    return response.data;
  }

  async deleteNotification(id: string) {
    const response = await this.api.delete(`/notifications/${id}`);
    return response.data;
  }

  async deleteAllReadNotifications() {
    const response = await this.api.delete('/notifications/read/all');
    return response.data;
  }

  // ======================
  // HR ENDPOINTS
  // ======================

  async getAttendance(params: {
    restaurant_id: string;
    start_date?: string;
    end_date?: string;
  }) {
    const response = await this.api.get('/hr/attendance', { params });
    return response.data;
  }

  async checkIn(restaurantId: string) {
    const response = await this.api.post('/hr/attendance/check-in', null, {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  async checkOut(restaurantId: string) {
    const response = await this.api.post('/hr/attendance/check-out', null, {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  async getLeaveRequests(params: {
    restaurant_id: string;
    status?: string;
  }) {
    const response = await this.api.get('/hr/leave-requests', { params });
    return response.data;
  }

  async createLeaveRequest(data: {
    restaurant_id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason?: string;
  }) {
    const response = await this.api.post('/hr/leave-requests', data);
    return response.data;
  }

  async updateLeaveRequest(id: string, data: {
    status: string;
    rejection_reason?: string;
  }) {
    const response = await this.api.patch(`/hr/leave-requests/${id}`, data);
    return response.data;
  }

  // ======================
  // FAVORITES ENDPOINTS
  // ======================

  async addFavorite(restaurantId: string, notes?: string) {
    const response = await this.api.post('/favorites', {
      restaurant_id: restaurantId,
      notes,
    });
    return response.data;
  }

  async getFavorites() {
    const response = await this.api.get('/favorites');
    return response.data;
  }

  async isFavorite(restaurantId: string) {
    const response = await this.api.get(`/favorites/${restaurantId}/check`);
    return response.data;
  }

  async removeFavorite(restaurantId: string) {
    const response = await this.api.delete(`/favorites/${restaurantId}`);
    return response.data;
  }

  async updateFavoriteNotes(restaurantId: string, notes: string) {
    const response = await this.api.patch(`/favorites/${restaurantId}/notes`, { notes });
    return response.data;
  }

  // ======================
  // QR CODE ENDPOINTS
  // ======================

  async generateTableQR(restaurantId: string, tableId: string) {
    const response = await this.api.get('/qr-code/table', {
      params: { restaurantId, tableId },
    });
    return response.data;
  }

  async generateMenuQR(restaurantId: string) {
    const response = await this.api.get('/qr-code/menu', {
      params: { restaurantId },
    });
    return response.data;
  }

  async generatePaymentQR(restaurantId: string, orderId: string, amount: number) {
    const response = await this.api.get('/qr-code/payment', {
      params: { restaurantId, orderId, amount },
    });
    return response.data;
  }

  async validateQRCode(data: string) {
    const response = await this.api.post('/qr-code/validate', { data });
    return response.data;
  }

  // ======================
  // RESERVATION GUESTS ENDPOINTS
  // ======================

  async inviteGuestToReservation(
    reservationId: string,
    data: {
      guest_user_id?: string;
      guest_name?: string;
      guest_phone?: string;
      guest_email?: string;
      invite_method: 'app' | 'sms' | 'email' | 'link';
      requires_host_approval?: boolean;
    }
  ) {
    const response = await this.api.post(
      `/reservation-guests/reservations/${reservationId}/invite`,
      data
    );
    return response.data;
  }

  async respondToReservationInvite(
    guestId: string,
    response: 'accept' | 'decline',
    message?: string
  ) {
    const responseData = await this.api.patch(
      `/reservation-guests/invites/${guestId}/respond`,
      { response, message }
    );
    return responseData.data;
  }

  async getReservationGuests(reservationId: string) {
    const response = await this.api.get(
      `/reservation-guests/reservations/${reservationId}/guests`
    );
    return response.data;
  }

  async removeReservationGuest(reservationId: string, guestId: string) {
    const response = await this.api.delete(
      `/reservation-guests/reservations/${reservationId}/guests/${guestId}`
    );
    return response.data;
  }

  async markGuestArrived(reservationId: string, guestId: string) {
    const response = await this.api.patch(
      `/reservation-guests/reservations/${reservationId}/guests/${guestId}/arrived`
    );
    return response.data;
  }

  async getMyPendingInvites() {
    const response = await this.api.get('/reservation-guests/my-invites');
    return response.data;
  }

  async validateInviteToken(token: string) {
    const response = await this.api.get(`/reservation-guests/invites/validate/${token}`);
    return response.data;
  }

  // ======================
  // PAYMENT SPLIT ENDPOINTS
  // ======================

  async calculatePaymentSplit(data: {
    order_id: string;
    split_mode: 'individual' | 'split_equal' | 'split_selective';
    selected_items?: string[];
  }) {
    const response = await this.api.post('/payment-splits/calculate', data);
    return response.data;
  }

  async createPaymentSplit(data: {
    order_id: string;
    guest_user_id: string;
    split_mode: 'individual' | 'split_equal' | 'split_selective';
    amount_due: number;
    selected_items?: string[];
    custom_amount?: number;
    service_charge?: number;
    tip_amount?: number;
    notes?: string;
  }) {
    const response = await this.api.post('/payment-splits', data);
    return response.data;
  }

  async createAllPaymentSplits(
    orderId: string,
    splitMode: 'individual' | 'split_equal' | 'split_selective'
  ) {
    const response = await this.api.post(
      `/payment-splits/orders/${orderId}/create-all`,
      { split_mode: splitMode }
    );
    return response.data;
  }

  async getOrderPaymentSplits(orderId: string) {
    const response = await this.api.get(`/payment-splits/orders/${orderId}`);
    return response.data;
  }

  async getPaymentStatus(orderId: string) {
    const response = await this.api.get(`/payment-splits/orders/${orderId}/status`);
    return response.data;
  }

  async getMyPaymentSplits() {
    const response = await this.api.get('/payment-splits/my-splits');
    return response.data;
  }

  async processSplitPayment(data: {
    split_id: string;
    amount: number;
    payment_method: string;
    payment_details?: Record<string, unknown>;
    notes?: string;
  }) {
    const response = await this.api.post('/payment-splits/process-payment', data);
    return response.data;
  }

  // ======================
  // ORDER GUESTS ENDPOINTS
  // ======================

  async addOrderGuest(orderId: string, data: {
    guest_user_id?: string;
    guest_name: string;
  }) {
    const response = await this.api.post(`/orders/${orderId}/guests`, data);
    return response.data;
  }

  async getOrderGuests(orderId: string) {
    const response = await this.api.get(`/orders/${orderId}/guests`);
    return response.data;
  }

  async removeOrderGuest(orderId: string, guestId: string) {
    const response = await this.api.delete(`/orders/${orderId}/guests/${guestId}`);
    return response.data;
  }

  // ======================
  // AI ENDPOINTS
  // ======================

  async analyzeSentiment(reviewId: string) {
    const response = await this.api.post(`/ai/sentiment/${reviewId}`);
    return response.data;
  }

  async batchAnalyzeSentiments(restaurantId: string) {
    const response = await this.api.get(`/ai/sentiment/restaurant/${restaurantId}`);
    return response.data;
  }

  async getMenuRecommendations(restaurantId: string) {
    const response = await this.api.get('/ai/recommendations/menu', {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  async predictChurnRisk(userId: string, restaurantId: string) {
    const response = await this.api.get(`/ai/churn/${userId}`, {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  async forecastDemand(restaurantId: string, days?: number) {
    const response = await this.api.get('/ai/forecast/demand', {
      params: { restaurant_id: restaurantId, days },
    });
    return response.data;
  }

  async getMenuAnalysis(restaurantId: string) {
    const response = await this.api.get(`/ai/menu-analysis/${restaurantId}`);
    return response.data;
  }

  async optimizeQueue(restaurantId: string) {
    const response = await this.api.post(`/ai/queue-optimization/${restaurantId}`);
    return response.data;
  }

  // ======================
  // QR CODE ENDPOINTS
  // ======================

  async generateQRCode(type: 'table' | 'menu' | 'payment', referenceId: string) {
    const response = await this.api.post('/qr-code/generate', {
      type,
      reference_id: referenceId,
    });
    return response.data;
  }

  async scanQRCode(code: string) {
    const response = await this.api.post('/qr-code/scan', { code });
    return response.data;
  }

  async getQRCodeByReference(type: string, referenceId: string) {
    const response = await this.api.get('/qr-code/reference', {
      params: { type, reference_id: referenceId },
    });
    return response.data;
  }

  async getRestaurantQRCodes(restaurantId: string) {
    const response = await this.api.get(`/qr-code/restaurant/${restaurantId}`);
    return response.data;
  }

  async deleteQRCode(id: string) {
    const response = await this.api.delete(`/qr-code/${id}`);
    return response.data;
  }

  // ======================
  // TABLE MANAGEMENT ENDPOINTS
  // ======================

  /**
   * Get all tables for a restaurant (with pagination)
   */
  async getRestaurantTablesPaginated(restaurantId: string, params?: { page?: number; limit?: number }) {
    const response = await this.api.get('/tables', {
      params: { restaurant_id: restaurantId, ...params },
    });
    return response.data;
  }

  /**
   * Create a new table
   */
  async createTable(data: {
    restaurant_id: string;
    table_number: string;
    capacity: number;
    section?: string;
    position_x?: number;
    position_y?: number;
    notes?: string;
  }) {
    const response = await this.api.post('/tables', data);
    return response.data;
  }

  /**
   * Update an existing table
   */
  async updateTable(tableId: string, data: {
    table_number?: string;
    capacity?: number;
    section?: string;
    position_x?: number;
    position_y?: number;
    notes?: string;
  }) {
    const response = await this.api.patch(`/tables/${tableId}`, data);
    return response.data;
  }

  /**
   * Delete a table
   */
  async deleteTable(tableId: string) {
    const response = await this.api.delete(`/tables/${tableId}`);
    return response.data;
  }

  /**
   * Get available tables for a restaurant
   */
  async getAvailableTables(restaurantId: string, seats?: number) {
    const response = await this.api.get('/tables/available', {
      params: { restaurant_id: restaurantId, seats },
    });
    return response.data;
  }

  // ======================
  // TABLE QR CODE MANAGEMENT
  // ======================

  /**
   * Generate QR code for a single table
   */
  async generateTableQRCode(tableId: string, options?: {
    style?: 'minimal' | 'premium' | 'bold' | 'elegant';
    color_primary?: string;
    color_secondary?: string;
    include_logo?: boolean;
  }) {
    const response = await this.api.post(`/qr-code/tables/${tableId}/generate`, options || {});
    return response.data;
  }

  /**
   * Batch generate QR codes for multiple tables
   */
  async batchGenerateTableQRCodes(restaurantId: string, data: {
    table_ids: string[];
    style?: 'minimal' | 'premium' | 'bold' | 'elegant';
    color_primary?: string;
    color_secondary?: string;
    include_logo?: boolean;
  }) {
    const response = await this.api.post(`/qr-code/tables/batch-generate`, {
      restaurant_id: restaurantId,
      ...data,
    });
    return response.data;
  }

  /**
   * Get QR code for a table
   */
  async getTableQRCode(tableId: string) {
    const response = await this.api.get(`/qr-code/tables/${tableId}`);
    return response.data;
  }

  /**
   * Regenerate QR code for a table (creates new version)
   */
  async regenerateTableQRCode(tableId: string) {
    const response = await this.api.post(`/qr-code/tables/${tableId}/regenerate`);
    return response.data;
  }

  /**
   * Revoke/deactivate a table's QR code
   */
  async revokeTableQRCode(tableId: string) {
    const response = await this.api.delete(`/qr-code/tables/${tableId}`);
    return response.data;
  }

  // ======================
  // TABLE SESSION ENDPOINTS
  // ======================

  /**
   * Start a new table session (called after QR scan)
   */
  async startTableSession(data: {
    restaurant_id: string;
    table_id: string;
    signature: string;
    version?: number;
    guest_name?: string;
    guest_count?: number;
  }) {
    const response = await this.api.post('/table-sessions/start', data);
    return response.data;
  }

  /**
   * Get current active session for a table
   */
  async getActiveTableSession(tableId: string) {
    const response = await this.api.get(`/table-sessions/table/${tableId}/active`);
    return response.data;
  }

  /**
   * Get my current active sessions (for customer)
   */
  async getMyActiveSessions() {
    const response = await this.api.get('/table-sessions/my-sessions');
    return response.data;
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string) {
    const response = await this.api.patch(`/table-sessions/${sessionId}/activity`);
    return response.data;
  }

  /**
   * End a table session
   */
  async endTableSession(sessionId: string, status?: 'completed' | 'abandoned') {
    const response = await this.api.post(`/table-sessions/${sessionId}/end`, {
      status: status || 'completed',
    });
    return response.data;
  }

  /**
   * Get session details
   */
  async getTableSession(sessionId: string) {
    const response = await this.api.get(`/table-sessions/${sessionId}`);
    return response.data;
  }

  /**
   * Get all sessions for a restaurant (for restaurant management)
   */
  async getRestaurantSessions(restaurantId: string, params?: {
    status?: 'active' | 'completed' | 'abandoned';
    date?: string;
  }) {
    const response = await this.api.get('/table-sessions/restaurant', {
      params: { restaurant_id: restaurantId, ...params },
    });
    return response.data;
  }

  /**
   * Validate QR code and get table info (before starting session)
   */
  async validateTableQRCode(data: {
    restaurant_id: string;
    table_id: string;
    signature: string;
    version?: number;
  }) {
    const response = await this.api.post('/qr-code/tables/validate', data);
    return response.data;
  }

  // ======================
  // USER ROLES ENDPOINTS
  // ======================

  async getUserRoles(userId: string) {
    const response = await this.api.get(`/user-roles/user/${userId}`);
    return response.data;
  }

  async getRestaurantStaff(restaurantId: string) {
    const response = await this.api.get(`/user-roles/restaurant/${restaurantId}`);
    return response.data;
  }

  async assignRole(data: {
    user_id: string;
    restaurant_id: string;
    role: string;
  }) {
    const response = await this.api.post('/user-roles', data);
    return response.data;
  }

  async updateUserRole(roleId: string, data: { role?: string; is_active?: boolean }) {
    const response = await this.api.patch(`/user-roles/${roleId}`, data);
    return response.data;
  }

  async removeUserRole(roleId: string) {
    const response = await this.api.delete(`/user-roles/${roleId}`);
    return response.data;
  }

  // ======================
  // WEBHOOKS ENDPOINTS
  // ======================

  async createWebhook(data: {
    restaurant_id: string;
    url: string;
    events: string[];
    secret?: string;
    is_active?: boolean;
  }) {
    const response = await this.api.post('/webhooks', data);
    return response.data;
  }

  async getRestaurantWebhooks(restaurantId: string) {
    const response = await this.api.get(`/webhooks/restaurant/${restaurantId}`);
    return response.data;
  }

  async updateWebhook(webhookId: string, data: {
    url?: string;
    events?: string[];
    is_active?: boolean;
  }) {
    const response = await this.api.patch(`/webhooks/${webhookId}`, data);
    return response.data;
  }

  async deleteWebhook(webhookId: string) {
    const response = await this.api.delete(`/webhooks/${webhookId}`);
    return response.data;
  }

  async testWebhook(webhookId: string) {
    const response = await this.api.post(`/webhooks/${webhookId}/test`);
    return response.data;
  }

  async getWebhookDeliveries(webhookId: string) {
    const response = await this.api.get(`/webhooks/${webhookId}/deliveries`);
    return response.data;
  }

  async retryWebhookDelivery(deliveryId: string) {
    const response = await this.api.post(`/webhooks/deliveries/${deliveryId}/retry`);
    return response.data;
  }

  // ======================
  // TABLES ENDPOINTS (Additional)
  // ======================

  async getTablesByRestaurant(restaurantId: string) {
    const response = await this.api.get(`/tables/restaurant/${restaurantId}`);
    return response.data;
  }

  // ======================
  // USERS ENDPOINTS (Additional)
  // ======================

  async getAllUsers(params?: {
    search?: string;
    role?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get('/users', { params });
    return response.data;
  }

  async getUserById(userId: string) {
    const response = await this.api.get(`/users/${userId}`);
    return response.data;
  }

  async updateUser(userId: string, data: {
    full_name?: string;
    phone?: string;
    avatar_url?: string;
  }) {
    const response = await this.api.patch(`/users/${userId}`, data);
    return response.data;
  }

  async deactivateUser(userId: string) {
    const response = await this.api.patch(`/users/${userId}/deactivate`);
    return response.data;
  }

  // ======================
  // PUSH NOTIFICATIONS ENDPOINTS
  // ======================

  async registerPushToken(data: {
    token: string;
    platform: string;
    device_info?: Record<string, string>;
  }) {
    const response = await this.api.post('/notifications/register-token', data);
    return response.data;
  }

  async unregisterPushToken(token: string) {
    const response = await this.api.delete('/notifications/unregister-token', {
      data: { token },
    });
    return response.data;
  }

  async updateNotificationPreferences(data: {
    orders?: boolean;
    reservations?: boolean;
    promotions?: boolean;
    general?: boolean;
  }) {
    const response = await this.api.patch('/notifications/preferences', data);
    return response.data;
  }

  async getNotificationPreferences() {
    const response = await this.api.get('/notifications/preferences');
    return response.data;
  }

  // ======================
  // KDS / STAFF ENDPOINTS
  // ======================

  async getKitchenOrders(params?: { status?: string; restaurant_id?: string; station?: string }) {
    const response = await this.api.get('/orders/kds/kitchen', { params });
    return response.data;
  }

  async getBarOrders(params?: { status?: string; restaurant_id?: string }) {
    const response = await this.api.get('/orders/kds/bar', { params });
    return response.data;
  }

  async getWaiterTables() {
    const response = await this.api.get('/orders/waiter/my-tables');
    return response.data;
  }

  async getWaiterStats(params?: { start_date?: string; end_date?: string }) {
    const response = await this.api.get('/orders/waiter/stats', { params });
    return response.data;
  }

  async getMaitreOverview(restaurant_id: string) {
    const response = await this.api.get('/orders/maitre/overview', {
      params: { restaurant_id },
    });
    return response.data;
  }

  // ========== KDS BRAIN ENDPOINTS ==========

  async getStations(restaurantId: string) {
    const res = await this.api.get(`/kds/brain/stations`, { params: { restaurant_id: restaurantId } });
    return res.data;
  }

  async getStationQueue(stationId: string, restaurantId: string) {
    const res = await this.api.get(`/kds/brain/stations/${stationId}/queue`, { params: { restaurant_id: restaurantId } });
    return res.data;
  }

  async bumpItem(itemId: string) {
    const res = await this.api.patch(`/kds/brain/items/${itemId}/bump`);
    return res.data;
  }

  async undoItem(itemId: string) {
    const res = await this.api.patch(`/kds/brain/items/${itemId}/undo`);
    return res.data;
  }

  async toggleItemAvailability(menuItemId: string) {
    const res = await this.api.patch(`/kds/brain/menu-items/${menuItemId}/toggle-available`);
    return res.data;
  }

  async createStation(data: any) {
    const res = await this.api.post('/kds/brain/stations', data);
    return res.data;
  }

  async updateStation(stationId: string, data: any) {
    const res = await this.api.patch(`/kds/brain/stations/${stationId}`, data);
    return res.data;
  }

  async deleteStation(stationId: string) {
    const res = await this.api.delete(`/kds/brain/stations/${stationId}`);
    return res.data;
  }

  async getChefOverview(restaurantId: string) {
    const res = await this.api.get('/kds/brain/chef/overview', { params: { restaurant_id: restaurantId } });
    return res.data;
  }

  // ========== KDS BRAIN ANALYTICS & CONFIG ENDPOINTS ==========

  async getKdsPrepTimes(restaurantId: string, period: number = 7) {
    const res = await this.api.get('/kds/brain/analytics/prep-times', { params: { restaurant_id: restaurantId, period } });
    return res.data;
  }

  async getKdsBottlenecks(restaurantId: string, period: number = 7) {
    const res = await this.api.get('/kds/brain/analytics/bottlenecks', { params: { restaurant_id: restaurantId, period } });
    return res.data;
  }

  async getKdsThroughput(restaurantId: string, period: number = 7) {
    const res = await this.api.get('/kds/brain/analytics/throughput', { params: { restaurant_id: restaurantId, period } });
    return res.data;
  }

  async getKdsPlatformPerformance(restaurantId: string, period: number = 30) {
    const res = await this.api.get('/kds/brain/analytics/platform-performance', { params: { restaurant_id: restaurantId, period } });
    return res.data;
  }

  async getKdsSuggestions(restaurantId: string) {
    const res = await this.api.get('/kds/brain/suggestions', { params: { restaurant_id: restaurantId } });
    return res.data;
  }

  async generateKdsSuggestions(restaurantId: string) {
    const res = await this.api.post('/kds/brain/suggestions/generate', null, { params: { restaurant_id: restaurantId } });
    return res.data;
  }

  async acceptSuggestion(suggestionId: string) {
    const res = await this.api.patch(`/kds/brain/suggestions/${suggestionId}/accept`);
    return res.data;
  }

  async rejectSuggestion(suggestionId: string) {
    const res = await this.api.patch(`/kds/brain/suggestions/${suggestionId}/reject`);
    return res.data;
  }

  async getKdsBrainConfig(restaurantId: string) {
    const res = await this.api.get('/kds/brain/config', { params: { restaurant_id: restaurantId } });
    return res.data;
  }

  async updateKdsBrainConfig(data: any) {
    const res = await this.api.put('/kds/brain/config', data);
    return res.data;
  }

  // ========== SERVICE CONFIG ENDPOINTS ==========

  async getServiceConfig(restaurant_id: string) {
    const response = await this.api.get(`/restaurants/${restaurant_id}/service-config`);
    return response.data;
  }

  async updateServiceConfig(restaurant_id: string, config: Record<string, unknown>) {
    const response = await this.api.patch(`/restaurants/${restaurant_id}/service-config`, config);
    return response.data;
  }

  // ========== SETUP PROGRESS ENDPOINTS ==========

  async getSetupProgress(restaurant_id: string) {
    const response = await this.api.get(`/restaurants/${restaurant_id}/setup-progress`);
    return response.data;
  }

  async updateSetupProgress(restaurant_id: string, completedSteps: string[]) {
    const response = await this.api.patch(`/restaurants/${restaurant_id}/setup-progress`, {
      completedSteps,
    });
    return response.data;
  }

  // ========== REVIEWS ADVANCED ENDPOINTS ==========

  async getRestaurantReviewStats(restaurantId: string) {
    const response = await this.api.get(`/reviews/restaurant/${restaurantId}/stats`);
    return response.data;
  }

  async getTopReviews(restaurantId: string, limit: number = 10) {
    const response = await this.api.get(`/reviews/restaurant/${restaurantId}/top`, {
      params: { limit },
    });
    return response.data;
  }

  async getRecentReviews(limit: number = 20) {
    const response = await this.api.get('/reviews/recent', {
      params: { limit },
    });
    return response.data;
  }

  async addOwnerResponse(reviewId: string, response_text: string) {
    const response = await this.api.post(`/reviews/${reviewId}/response`, {
      response: response_text,
    });
    return response.data;
  }

  async markReviewHelpful(reviewId: string) {
    const response = await this.api.post(`/reviews/${reviewId}/helpful`);
    return response.data;
  }

  async toggleReviewVisibility(reviewId: string) {
    const response = await this.api.patch(`/reviews/${reviewId}/visibility`);
    return response.data;
  }

  // ========== LOYALTY COMPLETE ENDPOINTS ==========

  async updateLoyaltyProfile(data: {
    user_id: string;
    restaurant_id: string;
    tier?: string;
    points?: number;
  }) {
    const response = await this.api.patch('/loyalty/profile', data);
    return response.data;
  }

  async addLoyaltyPoints(userId: string, points: number, reason: string) {
    const response = await this.api.post('/loyalty/points', {
      user_id: userId,
      points,
      reason,
    });
    return response.data;
  }

  async getLoyaltyHistory(params: {
    user_id?: string;
    restaurant_id?: string;
    start_date?: string;
    end_date?: string;
  }) {
    const response = await this.api.get('/loyalty/history', { params });
    return response.data;
  }

  async getAvailableRewards(restaurantId: string) {
    const response = await this.api.get(`/loyalty/rewards/${restaurantId}`);
    return response.data;
  }

  async redeemReward(rewardId: string) {
    const response = await this.api.post(`/loyalty/rewards/${rewardId}/redeem`);
    return response.data;
  }

  async getLoyaltyTiers(restaurantId: string) {
    const response = await this.api.get(`/loyalty/tiers/${restaurantId}`);
    return response.data;
  }

  async getLoyaltyLeaderboard(restaurantId: string, limit: number = 10) {
    const response = await this.api.get(`/loyalty/leaderboard/${restaurantId}`, {
      params: { limit },
    });
    return response.data;
  }

  async getLoyaltyStatistics(restaurantId: string) {
    const response = await this.api.get(`/loyalty/statistics/${restaurantId}`);
    return response.data;
  }

  // ========== ANALYTICS COMPLETE ENDPOINTS ==========

  async getCustomerAnalytics(params: {
    restaurant_id: string;
    start_date?: string;
    end_date?: string;
  }) {
    const response = await this.api.get('/analytics/customers', { params });
    return response.data;
  }

  async getPerformanceMetrics(params: {
    restaurant_id: string;
    start_date?: string;
    end_date?: string;
  }) {
    const response = await this.api.get('/analytics/performance', { params });
    return response.data;
  }

  async getRevenueForecast(params: {
    restaurant_id: string;
    days?: number;
  }) {
    const response = await this.api.get('/analytics/forecast', { params });
    return response.data;
  }

  async getRealtimeMetrics(restaurantId: string) {
    const response = await this.api.get('/analytics/realtime', {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  // ========== USER ROLES ADVANCED ENDPOINTS ==========

  async bulkAssignRoles(data: {
    restaurant_id: string;
    assignments: Array<{ user_id: string; role: string }>;
  }) {
    const response = await this.api.post('/user-roles/bulk-assign', data);
    return response.data;
  }

  async transferOwnership(data: {
    restaurant_id: string;
    new_owner_id: string;
    current_owner_id: string;
  }) {
    const response = await this.api.post('/user-roles/transfer-ownership', data);
    return response.data;
  }

  async getUserRestaurantRole(restaurantId: string, userId: string) {
    const response = await this.api.get(`/user-roles/restaurant/${restaurantId}/user/${userId}`);
    return response.data;
  }

  async getUsersByRole(restaurantId: string, role: string) {
    const response = await this.api.get(`/user-roles/restaurant/${restaurantId}/role/${role}`);
    return response.data;
  }

  async getRoleStatistics(restaurantId: string) {
    const response = await this.api.get(`/user-roles/restaurant/${restaurantId}/statistics`);
    return response.data;
  }

  // ========== TABLES ENDPOINTS ==========

  async assignTableToReservation(tableId: string, reservationId: string) {
    const response = await this.api.post(`/tables/${tableId}/assign`, {
      reservation_id: reservationId,
    });
    return response.data;
  }

  // ========== FINANCIAL REPORT ENDPOINTS ==========

  /**
   * Exports a financial report for a restaurant within a date range.
   * Supports multiple export formats (PDF, CSV, Excel).
   * 
   * @param params - Export parameters including restaurant ID, date range, and format
   * @returns Report data or download URL depending on format
   */
  async exportFinancialReport(params: {
    restaurant_id: string;
    start_date: string;
    end_date: string;
    format: 'pdf' | 'csv' | 'excel';
    report_type: 'summary' | 'detailed' | 'transactions';
  }) {
    const response = await this.api.get('/financial/export', {
      params,
      responseType: params.format === 'pdf' ? 'blob' : 'json',
    });
    return response.data;
  }

  /**
   * Gets profit and loss statement for a restaurant.
   * 
   * @param restaurantId - The restaurant ID
   * @param startDate - Start date for the report period
   * @param endDate - End date for the report period
   * @returns Profit and loss data including revenue, expenses, and net profit
   */
  async getProfitLossReport(
    restaurantId: string,
    startDate: string,
    endDate: string
  ) {
    const response = await this.api.get('/financial/profit-loss', {
      params: { restaurant_id: restaurantId, start_date: startDate, end_date: endDate },
    });
    return response.data;
  }

  /**
   * Gets cash flow report for a restaurant.
   * 
   * @param restaurantId - The restaurant ID
   * @param startDate - Start date for the report period
   * @param endDate - End date for the report period
   * @returns Cash flow data including inflows, outflows, and net cash
   */
  async getCashFlowReport(
    restaurantId: string,
    startDate: string,
    endDate: string
  ) {
    const response = await this.api.get('/financial/cash-flow', {
      params: { restaurant_id: restaurantId, start_date: startDate, end_date: endDate },
    });
    return response.data;
  }

  // ======================
  // LEGAL ENDPOINTS
  // ======================

  // ======================
  // CONSENT ENDPOINTS (LGPD Sprint 2)
  // ======================

  /**
   * Record user consent for a specific document type/version.
   */
  async acceptConsent(consentType: string, version: string) {
    const response = await this.api.post('/users/me/consent', {
      consent_type: consentType,
      version,
    });
    return response.data;
  }

  /**
   * Get the user's current active consents.
   */
  async getMyConsents() {
    const response = await this.api.get('/users/me/consent');
    return response.data;
  }

  /**
   * Get current versions of all legal documents.
   */
  async getLegalVersions() {
    const response = await this.api.get('/legal/versions');
    return response.data;
  }

  /**
   * Request human review of an automated AI decision (LGPD Art. 20).
   */
  async requestAIDecisionReview(decisionId: string, reason: string) {
    const response = await this.api.post(`/ai/decisions/${decisionId}/review-request`, {
      reason,
    });
    return response.data;
  }

  /**
   * Get the privacy policy document in the requested language.
   */
  async getPrivacyPolicy(lang?: string) {
    const response = await this.api.get('/legal/privacy-policy', {
      params: lang ? { lang } : undefined,
    });
    return response.data;
  }

  /**
   * Get the terms of service document in the requested language.
   */
  async getTermsOfService(lang?: string) {
    const response = await this.api.get('/legal/terms-of-service', {
      params: lang ? { lang } : undefined,
    });
    return response.data;
  }

  // ======================
  // INTEGRATION / PLATFORM CONNECTION ENDPOINTS
  // ======================

  async getPlatformConnections(restaurantId: string) {
    const res = await this.api.get('/integrations/connections', { params: { restaurant_id: restaurantId } });
    return res.data;
  }

  async createPlatformConnection(data: any) {
    const res = await this.api.post('/integrations/connections', data);
    return res.data;
  }

  async updatePlatformConnection(id: string, data: any) {
    const res = await this.api.patch(`/integrations/connections/${id}`, data);
    return res.data;
  }

  async deletePlatformConnection(id: string) {
    const res = await this.api.delete(`/integrations/connections/${id}`);
    return res.data;
  }

  // ======================
  // HEALTH / MAINTENANCE ENDPOINTS
  // ======================

  /**
   * Check current maintenance mode status.
   */
  async getMaintenanceStatus() {
    const response = await this.api.get('/health/maintenance');
    return response.data;
  }

  // ======================
  // PAYMENT GATEWAY (Financial Brain)
  // ======================

  async processGatewayPayment(data: {
    order_id: string;
    payment_method: string;
    amount: number;
    gateway?: string;
  }) {
    const response = await this.api.post('/payment-gateway/process', data);
    return response.data;
  }

  async getStripeConnectionToken(restaurantId: string) {
    const response = await this.api.post('/payment-gateway/connection-token', {
      restaurant_id: restaurantId,
    });
    return response.data;
  }

  async createTapToPayIntent(orderId: string, amount: number) {
    const response = await this.api.post('/payment-gateway/tap-to-pay/intent', {
      order_id: orderId,
      amount,
    });
    return response.data;
  }

  async getPixQrCode(orderId: string) {
    const response = await this.api.get(`/payment-gateway/pix/${orderId}/qrcode`);
    return response.data;
  }

  async refundGatewayPayment(transactionId: string) {
    const response = await this.api.post(`/payment-gateway/refund/${transactionId}`);
    return response.data;
  }

  // ======================
  // CASH REGISTER (Financial Brain)
  // ======================

  async openCashRegister(data: {
    restaurant_id: string;
    opening_balance: number;
  }) {
    const response = await this.api.post('/cash-register/open', data);
    return response.data;
  }

  async getCurrentCashRegister(restaurantId: string) {
    const response = await this.api.get('/cash-register/current', {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  async addCashMovement(data: {
    session_id: string;
    type: 'sangria' | 'reforco';
    amount: number;
    description?: string;
  }) {
    const response = await this.api.post('/cash-register/movement', data);
    return response.data;
  }

  async closeCashRegister(data: {
    session_id: string;
    actual_balance: number;
    closing_notes?: string;
  }) {
    const response = await this.api.post('/cash-register/close', data);
    return response.data;
  }

  async getCashRegisterHistory(restaurantId: string) {
    const response = await this.api.get('/cash-register/history', {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  async getCashRegisterReport(sessionId: string) {
    const response = await this.api.get(`/cash-register/sessions/${sessionId}/report`);
    return response.data;
  }

  // ======================
  // COST CONTROL (Financial Brain Sprint 2)
  // ======================

  async createIngredient(data: {
    restaurant_id: string;
    name: string;
    unit: 'kg' | 'l' | 'un' | 'g' | 'ml';
    category?: string;
  }) {
    const response = await this.api.post('/cost-control/ingredients', data);
    return response.data;
  }

  async getIngredients(restaurantId: string) {
    const response = await this.api.get('/cost-control/ingredients', {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  async updateIngredient(id: string, data: {
    name?: string;
    unit?: string;
    category?: string;
    is_active?: boolean;
  }) {
    const response = await this.api.patch(`/cost-control/ingredients/${id}`, data);
    return response.data;
  }

  async addIngredientPrice(ingredientId: string, data: {
    price_per_unit: number;
    supplier?: string;
    effective_date: string;
  }) {
    const response = await this.api.post(`/cost-control/ingredients/${ingredientId}/price`, data);
    return response.data;
  }

  async getRecipes(restaurantId: string) {
    const response = await this.api.get('/cost-control/recipes', {
      params: { restaurant_id: restaurantId },
    });
    return response.data;
  }

  async createRecipe(data: {
    menu_item_id: string;
    restaurant_id: string;
  }) {
    const response = await this.api.post('/cost-control/recipes', data);
    return response.data;
  }

  async addRecipeIngredient(recipeId: string, data: {
    ingredient_id: string;
    quantity: number;
  }) {
    const response = await this.api.post(`/cost-control/recipes/${recipeId}/ingredients`, data);
    return response.data;
  }

  async removeRecipeIngredient(recipeId: string, ingredientId: string) {
    const response = await this.api.delete(`/cost-control/recipes/${recipeId}/ingredients/${ingredientId}`);
    return response.data;
  }

  async calculateRecipeCost(recipeId: string) {
    const response = await this.api.post(`/cost-control/recipes/${recipeId}/calculate`);
    return response.data;
  }

  async getMargins(restaurantId: string, period: number = 30) {
    const response = await this.api.get('/cost-control/margins', {
      params: { restaurant_id: restaurantId, period },
    });
    return response.data;
  }

  async getMarginAlerts(restaurantId: string, threshold?: number) {
    const response = await this.api.get('/cost-control/alerts', {
      params: { restaurant_id: restaurantId, ...(threshold && { threshold }) },
    });
    return response.data;
  }

  async getFoodCost(restaurantId: string, period: number = 30) {
    const response = await this.api.get('/cost-control/food-cost', {
      params: { restaurant_id: restaurantId, period },
    });
    return response.data;
  }

  // ======================
  // FINANCIAL BRAIN — FORECAST (Sprint 4)
  // ======================

  async getForecast(restaurantId: string, days: number = 30) {
    const response = await this.api.get('/financial-brain/forecast', {
      params: { restaurant_id: restaurantId, days },
    });
    return response.data;
  }

  async exportAccounting(restaurantId: string, period: string, format: 'csv' | 'pdf' = 'csv') {
    const response = await this.api.get('/financial-brain/export', {
      params: { restaurant_id: restaurantId, period, format },
    });
    return response.data;
  }

  // ======================
  // ACCOUNTS PAYABLE — BILLS (Sprint 4)
  // ======================

  async getBills(restaurantId: string, status?: string, category?: string) {
    const response = await this.api.get('/accounts-payable/bills', {
      params: { restaurant_id: restaurantId, ...(status && { status }), ...(category && { category }) },
    });
    return response.data;
  }

  async createBill(data: {
    restaurant_id: string;
    description: string;
    supplier?: string;
    category: string;
    amount: number;
    due_date: string;
    is_recurring?: boolean;
    recurrence?: string;
  }) {
    const response = await this.api.post('/accounts-payable/bills', data);
    return response.data;
  }

  async updateBill(id: string, data: {
    description?: string;
    supplier?: string;
    category?: string;
    amount?: number;
    due_date?: string;
    is_recurring?: boolean;
    recurrence?: string;
  }) {
    const response = await this.api.patch(`/accounts-payable/bills/${id}`, data);
    return response.data;
  }

  async markBillPaid(id: string) {
    const response = await this.api.patch(`/accounts-payable/bills/${id}/pay`);
    return response.data;
  }

  async deleteBill(id: string) {
    const response = await this.api.delete(`/accounts-payable/bills/${id}`);
    return response.data;
  }

  // ======================
  // BUFFET ENDPOINTS
  // ======================

  async buffetCheckin(restaurantId: string) {
    const response = await this.api.post(`/buffet/${restaurantId}/checkin`);
    return response.data;
  }

  // ======================
  // CLUB ENDPOINTS
  // ======================

  async getClubEvents(restaurantId: string) {
    const response = await this.api.get(`/clubs/${restaurantId}/events`);
    return response.data;
  }

  async getClubLineup(eventId: string) {
    const response = await this.api.get(`/clubs/${eventId}/lineup`);
    return response.data;
  }

  async getBirthdayPackages() {
    const response = await this.api.get('/clubs/birthday-packages');
    return response.data;
  }

  async createBirthdayBooking(data: any) {
    const response = await this.api.post('/clubs/birthday-bookings', data);
    return response.data;
  }

  async purchaseClubEntry(data: any) {
    const response = await this.api.post('/club-entries', data);
    return response.data;
  }

  async getVipTables() {
    const response = await this.api.get('/tables/vip');
    return response.data;
  }

  async createTableReservation(data: any) {
    const response = await this.api.post('/table-reservations', data);
    return response.data;
  }

  // ======================
  // QUEUE ENDPOINTS
  // ======================

  async getMyQueuePosition() {
    const response = await this.api.get('/queue/my');
    return response.data;
  }

  async joinQueue(data: any) {
    const response = await this.api.post('/queue', data);
    return response.data;
  }

  async leaveQueue() {
    const response = await this.api.delete('/queue/my');
    return response.data;
  }

  // ======================
  // TABS INVITATION ENDPOINTS
  // ======================

  async acceptTabInvite(tabId: string) {
    const response = await this.api.post(`/tabs/${tabId}/invite/accept`);
    return response.data;
  }

  async declineTabInvite(tabId: string) {
    const response = await this.api.post(`/tabs/${tabId}/invite/decline`);
    return response.data;
  }

  // ======================
  // PROMOTIONS ENDPOINTS
  // ======================

  async getCurrentPromotions() {
    const response = await this.api.get('/promotions/current');
    return response.data;
  }

  // ======================
  // LOYALTY STAMP CARDS ENDPOINTS
  // ======================

  async getCurrentStampCards() {
    const response = await this.api.get('/loyalty/stamp-cards/current');
    return response.data;
  }

  // ======================
  // ORDERS ITEMS ENDPOINTS
  // ======================

  async addItemsToOrder(orderId: string, items: any[]) {
    const response = await this.api.post(`/orders/${orderId}/items`, { items });
    return response.data;
  }

  // ======================
  // RESERVATIONS GROUP ENDPOINTS
  // ======================

  async createGroupReservation(data: any) {
    const response = await this.api.post('/reservations/group', data);
    return response.data;
  }

  async generateInviteLink(reservationId: string) {
    const response = await this.api.post(`/reservation-guests/reservations/${reservationId}/invite-link`);
    return response.data;
  }

  // ======================
  // WAITLIST ENDPOINTS
  // ======================

  async getWaitlistQueue(restaurantId: string) {
    const response = await this.api.get(`/restaurant-waitlist/${restaurantId}/queue`);
    return response.data;
  }

  async getMyWaitlistEntries() {
    const response = await this.api.get('/restaurant-waitlist/my-entries');
    return response.data;
  }

  async joinWaitlist(data: any) {
    const response = await this.api.post('/restaurant-waitlist/join', data);
    return response.data;
  }

  async cancelWaitlistEntry(id: string) {
    const response = await this.api.patch(`/restaurant-waitlist/${id}/cancel`);
    return response.data;
  }

  async confirmWaitlistArrival(id: string) {
    const response = await this.api.patch(`/restaurant-waitlist/${id}/confirm-arrival`);
    return response.data;
  }

  async getWaitlistInfo(restaurantId: string) {
    const response = await this.api.get(`/restaurant-waitlist/${restaurantId}`);
    return response.data;
  }

  async setWaitlistFamilyMode(id: string, data: any) {
    const response = await this.api.patch(`/restaurant/waitlist/${id}/family`, data);
    return response.data;
  }

  async orderFromWaitlistBar(id: string, data: any) {
    const response = await this.api.post(`/restaurant/waitlist/${id}/bar-order`, data);
    return response.data;
  }

  // ======================
  // REVIEW REPORT ENDPOINTS
  // ======================

  async reportReview(reviewId: string, data: any) {
    const response = await this.api.post(`/reviews/${reviewId}/report`, data);
    return response.data;
  }

  // ======================
  // QR / TABLE ASSOCIATION ENDPOINTS
  // ======================

  async associateTable(tableId: string) {
    const response = await this.api.post('/tables/associate', { tableId });
    return response.data;
  }

  async acceptReservationInvite(token: string) {
    const response = await this.api.post('/reservations/guests/accept', { inviteToken: token });
    return response.data;
  }

  // ======================
  // REFUND ENDPOINTS
  // ======================

  async refundOrder(orderId: string, amount?: number) {
    const response = await this.api.post(`/payments/${orderId}/refund`, { amount });
    return response.data;
  }

  // ======================
  // WAITER ASSIGNMENT ENDPOINTS
  // ======================

  async assignWaiterToTable(tableId: string, waiterId: string) {
    const response = await this.api.patch(`/tables/${tableId}/assign-waiter`, { waiter_id: waiterId });
    return response.data;
  }

  // ======================
  // FOOD TRUCK LOCATION (F12)
  // ======================

  async updateRestaurantLocation(id: string, latitude: number, longitude: number) {
    const response = await this.api.patch(`/restaurants/${id}/location`, { latitude, longitude });
    return response.data;
  }

  // ======================
  // INTERCEPTOR HELPERS
  // ======================

  /**
   * Register an additional response interceptor on the axios instance.
   * Returns the interceptor ID for later removal.
   */
  addResponseInterceptor(
    onFulfilled: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>,
    onRejected: (error: AxiosError) => AxiosError | Promise<AxiosError>,
  ): number {
    return this.api.interceptors.response.use(onFulfilled, onRejected);
  }

  /**
   * Remove a previously registered response interceptor by ID.
   */
  removeResponseInterceptor(id: number): void {
    this.api.interceptors.response.eject(id);
  }

  // ======================
  // GENERIC HTTP METHODS
  // ======================

  /**
   * Generic POST request. Used by auth/otp services for custom endpoints.
   */
  async post<T = any>(url: string, data?: any, config?: Record<string, any>) {
    return this.api.post<T>(url, data, config);
  }

  /**
   * Generic GET request. Used by auth/otp services for custom endpoints.
   */
  async get<T = any>(url: string, config?: Record<string, any>) {
    return this.api.get<T>(url, config);
  }

  /**
   * Generic PATCH request.
   */
  async patch<T = any>(url: string, data?: any, config?: Record<string, any>) {
    return this.api.patch<T>(url, data, config);
  }

  /**
   * Generic PUT request.
   */
  async put<T = any>(url: string, data?: any, config?: Record<string, any>) {
    return this.api.put<T>(url, data, config);
  }

  /**
   * Generic DELETE request.
   */
  async delete<T = any>(url: string, config?: Record<string, any>) {
    return this.api.delete<T>(url, config);
  }

  /**
   * Generic request method. Used by offline-storage sync queue.
   */
  async request<T = any>(config: { method: string; url: string; data?: any }) {
    return this.api.request<T>(config);
  }
}

const apiServiceInstance = new ApiService();

export { apiServiceInstance as ApiService };
export default apiServiceInstance;
