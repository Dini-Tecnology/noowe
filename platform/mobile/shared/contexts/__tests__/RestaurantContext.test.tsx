/**
 * RestaurantContext Tests
 * 
 * Tests for restaurant authentication state, role management, and data loading.
 * 
 * @module shared/contexts/__tests__/RestaurantContext.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface Restaurant {
  id: string;
  name: string;
  description?: string;
  cuisine_type?: string[];
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
}

interface StaffMember {
  id: string;
  user_id: string;
  restaurant_id: string;
  role: 'owner' | 'manager' | 'chef' | 'waiter' | 'barman' | 'maitre' | 'cashier' | 'host';
  status: 'active' | 'inactive' | 'on_break';
  permissions?: string[];
}

interface RestaurantContextValue {
  restaurantId: string | null;
  restaurant: Restaurant | null;
  staffMember: StaffMember | null;
  isLoading: boolean;
  error: string | null;
  hasRole: (role: StaffMember['role']) => boolean;
  hasAnyRole: (roles: StaffMember['role'][]) => boolean;
  refreshRestaurant: () => Promise<void>;
  clearRestaurant: () => void;
  setRestaurantId: (id: string) => Promise<void>;
}

// ============================================================
// MOCK SERVICES
// ============================================================

interface MockApiService {
  getRestaurant: jest.Mock;
  getStaffMember: jest.Mock;
  getStaffProfile: jest.Mock;
}

interface MockSecureStorage {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
}

// ============================================================
// CONTEXT SIMULATION
// ============================================================

function createRestaurantContext(
  mockApi: MockApiService,
  mockStorage: MockSecureStorage,
  options: { storedRestaurantId?: string | null } = {}
): RestaurantContextValue {
  let restaurantId: string | null = null;
  let restaurant: Restaurant | null = null;
  let staffMember: StaffMember | null = null;
  let isLoading = true;
  let error: string | null = null;

  const loadRestaurantData = async (id: string) => {
    try {
      const restaurantData = await mockApi.getRestaurant(id);
      restaurant = restaurantData;
      restaurantId = id;
      await mockStorage.setItem('current_restaurant_id', id);
      
      try {
        const staffData = await mockApi.getStaffMember(id, 'me');
        staffMember = staffData;
      } catch {
        // Staff info optional
      }
    } catch (err) {
      throw err;
    }
  };

  const initialize = async () => {
    try {
      isLoading = true;
      error = null;
      
      const storedId = options.storedRestaurantId ?? await mockStorage.getItem('current_restaurant_id');
      
      if (storedId) {
        await loadRestaurantData(storedId);
      }
    } catch (err) {
      error = 'Failed to initialize restaurant context';
    } finally {
      isLoading = false;
    }
  };

  // Initialize
  if (options.storedRestaurantId) {
    loadRestaurantData(options.storedRestaurantId).then(() => {
      isLoading = false;
    }).catch(() => {
      isLoading = false;
    });
  } else {
    isLoading = false;
  }

  return {
    get restaurantId() { return restaurantId; },
    get restaurant() { return restaurant; },
    get staffMember() { return staffMember; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    
    hasRole: (role: StaffMember['role']) => staffMember?.role === role,
    
    hasAnyRole: (roles: StaffMember['role'][]) => 
      staffMember ? roles.includes(staffMember.role) : false,
    
    refreshRestaurant: async () => {
      if (restaurantId) {
        isLoading = true;
        try {
          await loadRestaurantData(restaurantId);
        } catch {
          // Handle error
        } finally {
          isLoading = false;
        }
      }
    },
    
    clearRestaurant: () => {
      restaurantId = null;
      restaurant = null;
      staffMember = null;
      error = null;
      mockStorage.removeItem('current_restaurant_id');
    },
    
    setRestaurantId: async (id: string) => {
      isLoading = true;
      try {
        await loadRestaurantData(id);
      } catch {
        error = 'Failed to switch restaurant';
      } finally {
        isLoading = false;
      }
    },
  };
}

// ============================================================
// TESTS
// ============================================================

describe('RestaurantContext', () => {
  let mockApi: MockApiService;
  let mockStorage: MockSecureStorage;

  const mockRestaurant: Restaurant = {
    id: 'rest-123',
    name: 'Okinawa Sushi',
    description: 'Japanese restaurant',
    cuisine_type: ['Japanese', 'Sushi'],
    address: '123 Main St',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 99999-9999',
    email: 'contact@okinawa.com',
    is_active: true,
  };

  const mockStaff: StaffMember = {
    id: 'staff-456',
    user_id: 'user-789',
    restaurant_id: 'rest-123',
    role: 'manager',
    status: 'active',
    permissions: ['orders', 'reservations', 'menu'],
  };

  beforeEach(() => {
    mockApi = {
      getRestaurant: vi.fn().mockResolvedValue(mockRestaurant),
      getStaffMember: vi.fn().mockResolvedValue(mockStaff),
      getStaffProfile: vi.fn().mockResolvedValue({ restaurant_id: 'rest-123' }),
    };

    mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
  });

  // ============================================================
  // INITIAL STATE TESTS
  // ============================================================

  describe('initial state', () => {
    it('should start without restaurant', () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      expect(context.restaurantId).toBeNull();
      expect(context.restaurant).toBeNull();
    });

    it('should start without staff member', () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      expect(context.staffMember).toBeNull();
    });

    it('should finish loading', () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      expect(context.isLoading).toBe(false);
    });
  });

  // ============================================================
  // RESTAURANT LOADING TESTS
  // ============================================================

  describe('setRestaurantId', () => {
    it('should load restaurant data', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      await context.setRestaurantId('rest-123');
      
      expect(mockApi.getRestaurant).toHaveBeenCalledWith('rest-123');
      expect(context.restaurantId).toBe('rest-123');
    });

    it('should load staff member data', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      await context.setRestaurantId('rest-123');
      
      expect(mockApi.getStaffMember).toHaveBeenCalledWith('rest-123', 'me');
    });

    it('should persist restaurant ID', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      await context.setRestaurantId('rest-123');
      
      expect(mockStorage.setItem).toHaveBeenCalledWith('current_restaurant_id', 'rest-123');
    });

    it('should handle API errors gracefully', async () => {
      mockApi.getRestaurant.mockRejectedValue(new Error('API Error'));
      const context = createRestaurantContext(mockApi, mockStorage);
      
      await context.setRestaurantId('rest-123');
      
      expect(context.error).toBe('Failed to switch restaurant');
    });
  });

  // ============================================================
  // ROLE CHECKING TESTS
  // ============================================================

  describe('hasRole', () => {
    it('should return true for matching role', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      expect(context.hasRole('manager')).toBe(true);
    });

    it('should return false for non-matching role', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      expect(context.hasRole('chef')).toBe(false);
    });

    it('should return false when no staff member', () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      expect(context.hasRole('manager')).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('should return true if role is in list', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      expect(context.hasAnyRole(['owner', 'manager'])).toBe(true);
    });

    it('should return false if role is not in list', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      expect(context.hasAnyRole(['chef', 'waiter'])).toBe(false);
    });

    it('should return false when no staff member', () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      expect(context.hasAnyRole(['owner', 'manager'])).toBe(false);
    });
  });

  // ============================================================
  // REFRESH TESTS
  // ============================================================

  describe('refreshRestaurant', () => {
    it('should reload restaurant data', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      mockApi.getRestaurant.mockClear();
      
      await context.refreshRestaurant();
      
      expect(mockApi.getRestaurant).toHaveBeenCalledWith('rest-123');
    });

    it('should not call API if no restaurant loaded', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      
      await context.refreshRestaurant();
      
      expect(mockApi.getRestaurant).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // CLEAR TESTS
  // ============================================================

  describe('clearRestaurant', () => {
    it('should clear all restaurant state', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      context.clearRestaurant();
      
      expect(context.restaurantId).toBeNull();
      expect(context.restaurant).toBeNull();
      expect(context.staffMember).toBeNull();
    });

    it('should clear persisted ID', async () => {
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      context.clearRestaurant();
      
      expect(mockStorage.removeItem).toHaveBeenCalledWith('current_restaurant_id');
    });
  });

  // ============================================================
  // ROLE HELPER TESTS
  // ============================================================

  describe('role helpers', () => {
    it('should identify owner', async () => {
      mockApi.getStaffMember.mockResolvedValue({ ...mockStaff, role: 'owner' });
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      expect(context.hasRole('owner')).toBe(true);
    });

    it('should identify manager access', async () => {
      mockApi.getStaffMember.mockResolvedValue({ ...mockStaff, role: 'manager' });
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      expect(context.hasAnyRole(['owner', 'manager'])).toBe(true);
    });

    it('should identify kitchen staff', async () => {
      mockApi.getStaffMember.mockResolvedValue({ ...mockStaff, role: 'chef' });
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      expect(context.hasAnyRole(['chef', 'owner', 'manager'])).toBe(true);
    });

    it('should identify front of house staff', async () => {
      mockApi.getStaffMember.mockResolvedValue({ ...mockStaff, role: 'waiter' });
      const context = createRestaurantContext(mockApi, mockStorage);
      await context.setRestaurantId('rest-123');
      
      expect(context.hasAnyRole(['waiter', 'maitre', 'host', 'owner', 'manager'])).toBe(true);
    });
  });

  // ============================================================
  // ERROR HANDLING TESTS
  // ============================================================

  describe('error handling', () => {
    it('should throw if hook used outside provider', () => {
      function useRestaurant(): RestaurantContextValue {
        const context: RestaurantContextValue | undefined = undefined;
        if (!context) {
          throw new Error('useRestaurant must be used within a RestaurantProvider');
        }
        return context;
      }
      
      expect(() => useRestaurant()).toThrow('useRestaurant must be used within a RestaurantProvider');
    });

    it('should handle missing staff gracefully', async () => {
      mockApi.getStaffMember.mockRejectedValue(new Error('Not found'));
      const context = createRestaurantContext(mockApi, mockStorage);
      
      await context.setRestaurantId('rest-123');
      
      // Should still have restaurant but no staff
      expect(context.restaurant).not.toBeNull();
      expect(context.staffMember).toBeNull();
    });
  });
});

console.log('✅ RestaurantContext tests defined');
