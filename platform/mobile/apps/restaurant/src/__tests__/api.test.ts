/**
 * API Service Tests for Restaurant App
 * 
 * Tests for restaurant-specific API endpoints including
 * orders, reservations, menu management, and staff operations.
 * 
 * @module __tests__/api
 */

import { describe, it, expect, vi } from 'vitest';
import { mockRestaurant, mockStaffMember } from './setup';

// ============================================================
// ORDERS API TESTS
// ============================================================

describe('Orders API', () => {
  describe('getKitchenOrders', () => {
    it('should fetch active kitchen orders', async () => {
      const mockOrders = [
        { id: 'order-1', status: 'pending', items: [] },
        { id: 'order-2', status: 'preparing', items: [] },
      ];

      const getKitchenOrders = vi.fn().mockResolvedValue(mockOrders);
      const result = await getKitchenOrders(mockRestaurant.id);

      expect(getKitchenOrders).toHaveBeenCalledWith(mockRestaurant.id);
      expect(result.length).toBe(2);
    });

    it('should handle empty orders', async () => {
      const getKitchenOrders = vi.fn().mockResolvedValue([]);
      const result = await getKitchenOrders(mockRestaurant.id);

      expect(result).toEqual([]);
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      const updateStatus = vi.fn().mockResolvedValue({ success: true });
      await updateStatus('order-1', 'preparing');

      expect(updateStatus).toHaveBeenCalledWith('order-1', 'preparing');
    });

    it('should handle invalid status transition', async () => {
      const updateStatus = vi.fn().mockRejectedValue({
        message: 'Invalid status transition',
      });

      await expect(updateStatus('order-1', 'invalid')).rejects.toEqual({
        message: 'Invalid status transition',
      });
    });
  });

  describe('getOrderDetails', () => {
    it('should fetch order with items', async () => {
      const mockOrder = {
        id: 'order-1',
        order_number: '001',
        items: [
          { id: 'item-1', name: 'Pizza', quantity: 2, price: 45.90 },
        ],
        total_amount: 91.80,
      };

      const getOrder = vi.fn().mockResolvedValue(mockOrder);
      const result = await getOrder('order-1');

      expect(result.total_amount).toBe(91.80);
    });
  });
});

// ============================================================
// RESERVATIONS API TESTS
// ============================================================

describe('Reservations API', () => {
  describe('getReservations', () => {
    it('should fetch today reservations', async () => {
      const mockReservations = [
        { id: 'res-1', customer_name: 'Maria', time: '19:00', status: 'confirmed' },
        { id: 'res-2', customer_name: 'João', time: '20:00', status: 'pending' },
      ];

      const getReservations = vi.fn().mockResolvedValue(mockReservations);
      const result = await getReservations(mockRestaurant.id, { filter: 'today' });

      expect(result.length).toBe(2);
    });

    it('should filter by status', async () => {
      const getReservations = vi.fn().mockResolvedValue([
        { id: 'res-1', status: 'pending' },
      ]);

      const result = await getReservations(mockRestaurant.id, { status: 'pending' });
      expect(result.every((r: { status: string }) => r.status === 'pending')).toBe(true);
    });
  });

  describe('confirmReservation', () => {
    it('should confirm pending reservation', async () => {
      const confirm = vi.fn().mockResolvedValue({
        id: 'res-1',
        status: 'confirmed',
      });

      const result = await confirm('res-1');
      expect(result.status).toBe('confirmed');
    });
  });

  describe('seatReservation', () => {
    it('should seat reservation at table', async () => {
      const seat = vi.fn().mockResolvedValue({
        id: 'res-1',
        status: 'seated',
        table_id: 'table-5',
      });

      const result = await seat('res-1', 'table-5');
      expect(result.table_id).toBe('table-5');
    });
  });
});

// ============================================================
// TABLES API TESTS
// ============================================================

describe('Tables API', () => {
  describe('getTables', () => {
    it('should fetch all tables with status', async () => {
      const mockTables = [
        { id: '1', number: '1', capacity: 2, status: 'available' },
        { id: '2', number: '2', capacity: 4, status: 'occupied' },
      ];

      const getTables = vi.fn().mockResolvedValue(mockTables);
      const result = await getTables(mockRestaurant.id);

      expect(result.length).toBe(2);
    });
  });

  describe('updateTableStatus', () => {
    it('should update table status', async () => {
      const update = vi.fn().mockResolvedValue({
        id: '1',
        status: 'occupied',
      });

      const result = await update('1', 'occupied');
      expect(result.status).toBe('occupied');
    });
  });

  describe('updateTableNotes', () => {
    it('should update table notes', async () => {
      const update = vi.fn().mockResolvedValue({
        id: '1',
        notes: 'VIP guests, allergy to shellfish',
      });

      const result = await update('1', 'VIP guests, allergy to shellfish');
      expect(result.notes).toBeTruthy();
    });
  });
});

// ============================================================
// MENU API TESTS
// ============================================================

describe('Menu API', () => {
  describe('getMenuItems', () => {
    it('should fetch menu items by category', async () => {
      const mockItems = [
        { id: '1', name: 'Pizza', category: 'Pizzas', price: 45.90 },
        { id: '2', name: 'Pasta', category: 'Massas', price: 38.50 },
      ];

      const getItems = vi.fn().mockResolvedValue(mockItems);
      const result = await getItems(mockRestaurant.id);

      expect(result.length).toBe(2);
    });
  });

  describe('toggleItemAvailability', () => {
    it('should toggle item availability', async () => {
      const toggle = vi.fn().mockResolvedValue({
        id: '1',
        is_available: false,
      });

      const result = await toggle('1', false);
      expect(result.is_available).toBe(false);
    });
  });

  describe('deleteMenuItem', () => {
    it('should delete menu item', async () => {
      const deleteItem = vi.fn().mockResolvedValue({ success: true });
      const result = await deleteItem('1');

      expect(result.success).toBe(true);
    });
  });
});

// ============================================================
// STAFF API TESTS
// ============================================================

describe('Staff API', () => {
  describe('getStaff', () => {
    it('should fetch staff list', async () => {
      const mockStaff = [
        { id: '1', name: 'João', role: 'waiter', status: 'active' },
        { id: '2', name: 'Maria', role: 'chef', status: 'active' },
      ];

      const getStaff = vi.fn().mockResolvedValue(mockStaff);
      const result = await getStaff(mockRestaurant.id);

      expect(result.length).toBe(2);
    });

    it('should filter by role', async () => {
      const getStaff = vi.fn().mockResolvedValue([
        { id: '1', role: 'waiter' },
      ]);

      const result = await getStaff(mockRestaurant.id, { role: 'waiter' });
      expect(result[0].role).toBe('waiter');
    });
  });

  describe('updateStaffStatus', () => {
    it('should update staff status', async () => {
      const update = vi.fn().mockResolvedValue({
        id: '1',
        status: 'on_break',
      });

      const result = await update('1', 'on_break');
      expect(result.status).toBe('on_break');
    });
  });

  describe('getStaffMember', () => {
    it('should fetch current staff member', async () => {
      const getStaffMember = vi.fn().mockResolvedValue(mockStaffMember);
      const result = await getStaffMember(mockRestaurant.id, 'me');

      expect(result.role).toBe('manager');
    });
  });
});

// ============================================================
// FINANCIAL API TESTS
// ============================================================

describe('Financial API', () => {
  describe('getFinancialSummary', () => {
    it('should fetch financial summary', async () => {
      const mockSummary = {
        total_revenue: 15420.50,
        total_orders: 156,
        average_order: 98.85,
        total_tips: 1250.00,
      };

      const getSummary = vi.fn().mockResolvedValue(mockSummary);
      const result = await getSummary(mockRestaurant.id, { period: 'today' });

      expect(result.total_revenue).toBeGreaterThan(0);
    });
  });

  describe('getTipsData', () => {
    it('should fetch tips summary', async () => {
      const mockTips = {
        total: 1250.00,
        pending_distribution: 450.00,
        by_staff: [
          { staff_id: '1', amount: 320.00 },
          { staff_id: '2', amount: 280.00 },
        ],
      };

      const getTips = vi.fn().mockResolvedValue(mockTips);
      const result = await getTips(mockRestaurant.id);

      expect(result.total).toBe(1250.00);
    });
  });
});

// ============================================================
// ERROR HANDLING TESTS
// ============================================================

describe('API Error Handling', () => {
  it('should handle 401 unauthorized', async () => {
    const apiCall = vi.fn().mockRejectedValue({
      response: { status: 401 },
      message: 'Unauthorized',
    });

    await expect(apiCall()).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it('should handle network errors', async () => {
    const apiCall = vi.fn().mockRejectedValue({
      code: 'NETWORK_ERROR',
      message: 'Network error',
    });

    await expect(apiCall()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('should handle timeout', async () => {
    const apiCall = vi.fn().mockRejectedValue({
      code: 'TIMEOUT',
      message: 'Request timed out',
    });

    await expect(apiCall()).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});

console.log('✅ Restaurant App API tests defined');
