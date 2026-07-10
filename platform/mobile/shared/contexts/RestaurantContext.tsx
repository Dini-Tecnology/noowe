/**
 * Restaurant Context Provider
 * 
 * Provides restaurant authentication state and current restaurant information
 * to all screens in the Restaurant App. This context eliminates the need for
 * hardcoded restaurant IDs throughout the application.
 * 
 * @module contexts/RestaurantContext
 * @description Central state management for restaurant-specific data
 * 
 * Usage:
 * ```tsx
 * import { useRestaurant } from '@/shared/contexts/RestaurantContext';
 * 
 * function MyScreen() {
 *   const { restaurantId, restaurant, isLoading } = useRestaurant();
 *   // Use restaurantId for API calls
 * }
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { secureStorage } from '../services/secure-storage';
import { authService } from '../services/auth';
import {
  fetchMyRestaurantRolesGrouped,
  fetchRestaurantFromSupabase,
  fetchStaffMemberForCurrentUser,
  resolveInitialRestaurantId,
} from '../services/restaurant-data-supabase';
import { isSupabaseConfigured } from '../services/supabase';
import type { Restaurant, StaffMember, UserRestaurantRole } from '../types/restaurant-domain';

export type { Restaurant, StaffMember, UserRestaurantRole, StaffRole } from '../types/restaurant-domain';

/**
 * Context value interface for restaurant state
 */
interface RestaurantContextValue {
  /** Current restaurant ID - use this for all API calls */
  restaurantId: string | null;
  /** Full restaurant object with all details */
  restaurant: Restaurant | null;
  /** Current staff member information */
  staffMember: StaffMember | null;
  /** All restaurants the user has access to */
  userRestaurants: UserRestaurantRole[];
  /** Whether user has multiple restaurants */
  hasMultipleRestaurants: boolean;
  /** Loading state during initial fetch */
  isLoading: boolean;
  /** Error message if context initialization failed */
  error: string | null;
  /** Check if user has a specific role (supports multiple roles) */
  hasRole: (role: StaffMember['role']) => boolean;
  /** Check if user has any of the specified roles */
  hasAnyRole: (roles: StaffMember['role'][]) => boolean;
  /** Refresh restaurant data from server */
  refreshRestaurant: () => Promise<void>;
  /** Clear restaurant context (on logout) */
  clearRestaurant: () => void;
  /** Set restaurant manually (for switching between restaurants) */
  setRestaurantId: (id: string) => Promise<void>;
  /** Fetch all restaurants for the current user */
  fetchUserRestaurants: () => Promise<UserRestaurantRole[]>;
}

// ============================================================
// CONTEXT CREATION
// ============================================================

const RestaurantContext = createContext<RestaurantContextValue | undefined>(undefined);

// Storage key for persisting restaurant selection
const STORAGE_KEY_RESTAURANT_ID = 'current_restaurant_id';

// ============================================================
// PROVIDER COMPONENT
// ============================================================

interface RestaurantProviderProps {
  children: ReactNode;
}

/**
 * RestaurantProvider component that wraps the Restaurant App
 * and provides restaurant context to all child components.
 * 
 * @param children - Child components to wrap
 */
export const RestaurantProvider: React.FC<RestaurantProviderProps> = ({ children }) => {
  const [restaurantId, setRestaurantIdState] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [userRestaurants, setUserRestaurants] = useState<UserRestaurantRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load restaurant context on mount
   * Fetches stored restaurant ID and loads restaurant data
   */
  useEffect(() => {
    initializeContext();
  }, []);

  /**
   * Initialize context by loading stored restaurant ID
   * and fetching restaurant details from the API
   */
  const initializeContext = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!isSupabaseConfigured()) {
        console.warn('[RestaurantContext] Supabase not configured; restaurant bootstrap skipped');
        return;
      }

      const storedId = await secureStorage.getItem(STORAGE_KEY_RESTAURANT_ID);

      if (storedId) {
        await loadRestaurantData(storedId);
      } else {
        await loadFromUserProfile();
      }
    } catch (err) {
      console.error('[RestaurantContext] Initialization error:', err);
      setError('Failed to initialize restaurant context');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load restaurant data from user's staff profile
   * Used when no restaurant ID is stored
   */
  const loadFromUserProfile = async () => {
    try {
      const initialId = await resolveInitialRestaurantId();
      if (initialId) {
        await loadRestaurantData(initialId);
      }
    } catch (err) {
      console.warn('[RestaurantContext] Could not resolve restaurant from Supabase profile:', err);
    }
  };

  /**
   * Load restaurant details and staff member info
   * @param id - Restaurant ID to load
   */
  const loadRestaurantData = async (id: string) => {
    try {
      const restaurantData = await fetchRestaurantFromSupabase(id);
      if (!restaurantData) {
        throw new Error(`Restaurant not found: ${id}`);
      }
      setRestaurant(restaurantData);
      setRestaurantIdState(id);

      await secureStorage.setItem(STORAGE_KEY_RESTAURANT_ID, id);

      try {
        const staffData = await fetchStaffMemberForCurrentUser(id);
        setStaffMember(staffData);
      } catch (staffErr) {
        console.warn('[RestaurantContext] Could not load staff member:', staffErr);
        setStaffMember(null);
      }
    } catch (err) {
      console.error('[RestaurantContext] Failed to load restaurant:', err);
      throw err;
    }
  };

  /**
   * Refresh restaurant data from server
   */
  const refreshRestaurant = useCallback(async () => {
    if (restaurantId) {
      setIsLoading(true);
      try {
        await loadRestaurantData(restaurantId);
      } catch (err) {
        console.error('[RestaurantContext] Refresh failed:', err);
      } finally {
        setIsLoading(false);
      }
    }
  }, [restaurantId]);

  /**
   * Clear restaurant context (used on logout)
   */
  const clearRestaurant = useCallback(() => {
    setRestaurantIdState(null);
    setRestaurant(null);
    setStaffMember(null);
    setUserRestaurants([]);
    setError(null);
    secureStorage.removeItem(STORAGE_KEY_RESTAURANT_ID);
  }, []);

  /**
   * Clear restaurant/staff state whenever the user logs out, so it doesn't
   * survive into the next session on a shared device (e.g. a counter tablet
   * switching operators).
   */
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((authenticated) => {
      if (!authenticated) {
        clearRestaurant();
      }
    });
    return unsubscribe;
  }, [clearRestaurant]);

  /**
   * Fetch all restaurants for the current user
   * Used to populate the restaurant selector screen
   */
  const fetchUserRestaurants = useCallback(async (): Promise<UserRestaurantRole[]> => {
    try {
      const restaurants = await fetchMyRestaurantRolesGrouped();
      setUserRestaurants(restaurants);
      return restaurants;
    } catch (err) {
      console.error('[RestaurantContext] Failed to fetch user restaurants:', err);
      return [];
    }
  }, []);

  /**
   * Set restaurant ID manually (for switching restaurants)
   * @param id - New restaurant ID to set
   */
  const setRestaurantId = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      await loadRestaurantData(id);
    } catch (err) {
      console.error('[RestaurantContext] Failed to switch restaurant:', err);
      setError('Failed to switch restaurant');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Check if current staff member has a specific role
   * Updated to support multiple roles per restaurant
   * @param role - Role to check
   */
  const hasRole = useCallback((role: StaffMember['role']): boolean => {
    if (!staffMember) return false;
    // Check both primary role and all roles array
    return staffMember.role === role || (staffMember.roles?.includes(role) ?? false);
  }, [staffMember]);

  /**
   * Check if current staff member has any of the specified roles
   * Updated to support multiple roles per restaurant
   * @param roles - Array of roles to check
   */
  const hasAnyRole = useCallback((roles: StaffMember['role'][]): boolean => {
    if (!staffMember) return false;
    // Check if any role matches the primary role or roles array
    const allRoles = staffMember.roles || [staffMember.role];
    return allRoles.some(r => roles.includes(r));
  }, [staffMember]);

  // Computed property for multiple restaurants
  const hasMultipleRestaurants = useMemo(() => userRestaurants.length > 1, [userRestaurants]);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      restaurantId,
      restaurant,
      staffMember,
      userRestaurants,
      hasMultipleRestaurants,
      isLoading,
      error,
      hasRole,
      hasAnyRole,
      refreshRestaurant,
      clearRestaurant,
      setRestaurantId,
      fetchUserRestaurants,
    }),
    [
      restaurantId, 
      restaurant, 
      staffMember, 
      userRestaurants,
      hasMultipleRestaurants,
      isLoading, 
      error, 
      hasRole, 
      hasAnyRole, 
      refreshRestaurant, 
      clearRestaurant, 
      setRestaurantId,
      fetchUserRestaurants,
    ]
  );

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
};

// ============================================================
// CUSTOM HOOKS
// ============================================================

/**
 * Hook to access restaurant context
 * Must be used within a RestaurantProvider
 * 
 * @throws Error if used outside RestaurantProvider
 * @returns RestaurantContextValue
 */
export const useRestaurant = (): RestaurantContextValue => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant must be used within a RestaurantProvider');
  }
  return context;
};

/**
 * Hook to get just the restaurant ID
 * Useful for components that only need the ID for API calls
 * 
 * @returns Restaurant ID or null
 */
export const useRestaurantId = (): string | null => {
  const { restaurantId } = useRestaurant();
  return restaurantId;
};

/**
 * Hook to check role-based access
 * Returns helper functions for permission checking
 * Updated to support multiple roles per restaurant
 */
export const useRestaurantRole = () => {
  const { staffMember, hasRole, hasAnyRole, userRestaurants, hasMultipleRestaurants } = useRestaurant();
  
  return {
    /** Primary role */
    role: staffMember?.role || null,
    /** All roles in current restaurant */
    roles: staffMember?.roles || (staffMember?.role ? [staffMember.role] : []),
    /** Check for specific role */
    hasRole,
    /** Check for any of multiple roles */
    hasAnyRole,
    /** Is Owner */
    isOwner: hasRole('owner'),
    /** Is Manager or higher */
    isManager: hasAnyRole(['owner', 'manager']),
    /** Has kitchen access */
    isKitchenStaff: hasAnyRole(['chef', 'owner', 'manager']),
    /** Has front-of-house access */
    isFrontOfHouse: hasAnyRole(['waiter', 'maitre', 'host', 'owner', 'manager']),
    /** Has bar access */
    isBarStaff: hasAnyRole(['barman', 'owner', 'manager']),
    /** All restaurants user has access to */
    userRestaurants,
    /** Whether user works at multiple restaurants */
    hasMultipleRestaurants,
  };
};

export default RestaurantContext;
