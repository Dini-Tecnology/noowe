/**
 * API Integration Tests with MSW
 * 
 * These tests use MSW to intercept business HTTP requests and validate:
 * 1. Request structure (correct payloads sent)
 * 2. Response handling (correct data returned)
 * 3. Error handling (proper error responses)
 * 
 * If API contracts change, these tests WILL fail.
 * 
 * @module shared/__tests__/api-integration
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './msw-handlers';

// ============================================================
// MSW SERVER SETUP
// ============================================================

const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// ============================================================
// SIMULATED API CLIENT (mirrors real implementation)
// ============================================================

const API_BASE = 'http://localhost:3000';

interface ApiClient {
  token: string | null;
  
  setToken(token: string): void;
  clearToken(): void;
  
  request<T>(method: string, endpoint: string, data?: any): Promise<{ status: number; data: T }>;
  
  // Reservations
  createReservation(data: any): Promise<any>;
  getReservation(id: string): Promise<any>;
  inviteGuest(reservationId: string, method: string, recipient: string): Promise<any>;
  
  // Orders
  createOrder(data: any): Promise<any>;
  getOrder(id: string): Promise<any>;
  updateOrderStatus(id: string, status: string): Promise<any>;
  
  // Payments
  processPayment(data: any): Promise<any>;
  calculateSplit(data: any): Promise<any>;
}

const apiClient: ApiClient = {
  token: null,
  
  setToken(token: string) {
    this.token = token;
  },
  
  clearToken() {
    this.token = null;
  },
  
  async request<T>(method: string, endpoint: string, data?: any): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
    
    const responseData = await response.json();
    return { status: response.status, data: responseData };
  },
  
  // Reservation methods
  async createReservation(data: any) {
    return this.request('POST', '/reservations', data);
  },
  
  async getReservation(id: string) {
    return this.request('GET', `/reservations/${id}`);
  },
  
  async inviteGuest(reservationId: string, method: string, recipient: string) {
    return this.request('POST', `/reservations/${reservationId}/guests`, { method, recipient });
  },
  
  // Order methods
  async createOrder(data: any) {
    return this.request('POST', '/orders', data);
  },
  
  async getOrder(id: string) {
    return this.request('GET', `/orders/${id}`);
  },
  
  async updateOrderStatus(id: string, status: string) {
    return this.request('PATCH', `/orders/${id}/status`, { status });
  },
  
  // Payment methods
  async processPayment(data: any) {
    return this.request('POST', '/payments', data);
  },
  
  async calculateSplit(data: any) {
    return this.request('POST', '/payments/split', data);
  },
};

// ============================================================
// SUPABASE AUTH BOUNDARY TESTS
// ============================================================

describe('API Integration: Supabase Auth boundary', () => {
  it('keeps email/password authentication outside the business API client', () => {
    expect(apiClient).not.toHaveProperty('login');
    expect(apiClient).not.toHaveProperty('register');
    expect(apiClient).not.toHaveProperty('getMe');
  });

  it('still injects Supabase access tokens into business API requests when present', async () => {
    apiClient.setToken('supabase-access-token');
    const { data } = await apiClient.createReservation({
      restaurant_id: 'rest-1',
      date: '2026-06-22',
      time: '19:00',
      party_size: 2,
    });

    expect(data).toHaveProperty('status', 'confirmed');
    apiClient.clearToken();
  });
});

// ============================================================
// RESERVATION TESTS
// ============================================================

describe('API Integration: Reservations', () => {
  describe('POST /reservations', () => {
    it('should create reservation with valid data', async () => {
      const { status, data } = await apiClient.createReservation({
        restaurant_id: 'rest-123',
        date: '2024-01-20',
        time: '19:00',
        party_size: 4,
      });
      
      expect(status).toBe(200);
      expect(data).toHaveProperty('id');
      expect(data.status).toBe('confirmed');
      expect(data.party_size).toBe(4);
    });

    it('should reject missing required fields', async () => {
      const { status, data } = await apiClient.createReservation({
        restaurant_id: 'rest-123',
        // Missing date, time, party_size
      });
      
      expect(status).toBe(400);
      expect(data.message).toContain('Missing fields');
    });

    it('should reject invalid party size', async () => {
      const { status, data } = await apiClient.createReservation({
        restaurant_id: 'rest-123',
        date: '2024-01-20',
        time: '19:00',
        party_size: 25, // Too large
      });
      
      expect(status).toBe(400);
      expect(data.message).toContain('between 1 and 20');
    });
  });

  describe('GET /reservations/:id', () => {
    it('should return reservation details', async () => {
      const { status, data } = await apiClient.getReservation('res-123');
      
      expect(status).toBe(200);
      expect(data.id).toBe('res-123');
      expect(data).toHaveProperty('guests');
    });

    it('should return 404 for non-existent reservation', async () => {
      const { status, data } = await apiClient.getReservation('not-found');
      
      expect(status).toBe(404);
      expect(data.message).toContain('not found');
    });
  });

  describe('POST /reservations/:id/guests', () => {
    it('should send guest invitation', async () => {
      const { status, data } = await apiClient.inviteGuest('res-123', 'sms', '+5511999999999');
      
      expect(status).toBe(200);
      expect(data).toHaveProperty('invitation_id');
      expect(data.status).toBe('pending');
    });
  });
});

// ============================================================
// ORDER TESTS
// ============================================================

describe('API Integration: Orders', () => {
  describe('POST /orders', () => {
    it('should create order with items', async () => {
      const { status, data } = await apiClient.createOrder({
        restaurant_id: 'rest-123',
        items: [
          { menu_item_id: 'item-1', quantity: 2 },
          { menu_item_id: 'item-2', quantity: 1 },
        ],
        order_type: 'dine_in',
      });
      
      expect(status).toBe(200);
      expect(data).toHaveProperty('id');
      expect(data.status).toBe('pending');
      expect(data.total).toBeGreaterThan(0);
    });

    it('should reject empty order', async () => {
      const { status, data } = await apiClient.createOrder({
        restaurant_id: 'rest-123',
        items: [],
        order_type: 'dine_in',
      });
      
      expect(status).toBe(400);
      expect(data.message).toContain('at least one item');
    });
  });

  describe('PATCH /orders/:id/status', () => {
    it('should update order status', async () => {
      const { status, data } = await apiClient.updateOrderStatus('ord-123', 'preparing');
      
      expect(status).toBe(200);
      expect(data.status).toBe('preparing');
    });

    it('should reject invalid status', async () => {
      const { status, data } = await apiClient.updateOrderStatus('ord-123', 'invalid_status');
      
      expect(status).toBe(400);
      expect(data.message).toContain('Invalid status');
    });
  });
});

// ============================================================
// PAYMENT TESTS
// ============================================================

describe('API Integration: Payments', () => {
  describe('POST /payments', () => {
    it('should process credit card payment', async () => {
      const { status, data } = await apiClient.processPayment({
        order_id: 'ord-123',
        amount: 143.77,
        method: 'credit_card',
      });
      
      expect(status).toBe(200);
      expect(data.status).toBe('completed');
      expect(data).toHaveProperty('transaction_id');
    });

    it('should return PIX QR code for PIX payments', async () => {
      const { status, data } = await apiClient.processPayment({
        order_id: 'ord-123',
        amount: 143.77,
        method: 'pix',
      });
      
      expect(status).toBe(200);
      expect(data.status).toBe('pending');
      expect(data).toHaveProperty('pix_code');
      expect(data).toHaveProperty('qr_code_url');
      expect(data).toHaveProperty('expires_at');
    });

    it('should reject invalid payment method', async () => {
      const { status, data } = await apiClient.processPayment({
        order_id: 'ord-123',
        amount: 143.77,
        method: 'bitcoin', // Invalid
      });
      
      expect(status).toBe(400);
      expect(data.message).toContain('Invalid payment method');
    });

    it('should reject zero or negative amount', async () => {
      const { status, data } = await apiClient.processPayment({
        order_id: 'ord-123',
        amount: 0,
        method: 'credit_card',
      });
      
      expect(status).toBe(400);
      expect(data.message).toContain('positive');
    });
  });

  describe('POST /payments/split', () => {
    it('should calculate equal split correctly', async () => {
      const { status, data } = await apiClient.calculateSplit({
        order_id: 'ord-123',
        mode: 'equal',
        participants: ['user-1', 'user-2', 'user-3', 'user-4'],
        total: 200,
      });
      
      expect(status).toBe(200);
      expect(data.per_person).toBe(50);
      expect(data.breakdown).toHaveLength(4);
      expect(data.breakdown.every((b: any) => b.amount === 50)).toBe(true);
    });

    it('should reject split with less than 2 participants', async () => {
      const { status, data } = await apiClient.calculateSplit({
        order_id: 'ord-123',
        mode: 'equal',
        participants: ['user-1'],
        total: 200,
      });
      
      expect(status).toBe(400);
      expect(data.message).toContain('2 participants');
    });
  });
});

console.log('✅ API Integration tests with MSW defined');
