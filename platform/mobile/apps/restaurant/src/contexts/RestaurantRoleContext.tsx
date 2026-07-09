import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@okinawa/shared/services/supabase';
import { getOptionalSupabaseSessionUser } from '@okinawa/shared/services/supabase-auth';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import logger from '@okinawa/shared/utils/logger';

export interface RestaurantOption {
  id: string;
  name: string;
  city: string;
  state: string;
  serviceType: string;
  logoUrl: string | null;
}

export type RestaurantRole =
  | 'owner'
  | 'manager'
  | 'maitre'
  | 'chef'
  | 'barman'
  | 'cook'
  | 'waiter';

export type ManagerRoleView =
  | 'manager-ops'
  | 'manager-orders'
  | 'manager-approvals'
  | 'manager-cash'
  | 'manager-tables'
  | 'manager-staff'
  | 'manager-report'
  | 'manager-stock'
  | 'manager-promotions'
  | 'manager-qr'
  | 'manager-settings';

export type MaitreRoleView =
  | 'maitre-reservations'
  | 'maitre-flow'
  | 'maitre-tables'
  | 'maitre-management';

export type ChefRoleView =
  | 'chef-kds'
  | 'chef-approvals'
  | 'chef-analytics'
  | 'chef-cost'
  | 'chef-menu'
  | 'chef-stock';

export type BarmanRoleView =
  | 'barman-station'
  | 'bar-kds'
  | 'bar-recipes'
  | 'bar-stock';

export type CookRoleView =
  | 'cook-station'
  | 'cook-kds';

export type WaiterRoleView =
  | 'waiter'
  | 'waiter-calls'
  | 'waiter-table-actions'
  | 'waiter-assistance'
  | 'waiter-table-charge'
  | 'waiter-tap-to-pay'
  | 'waiter-order-management'
  | 'waiter-table-map'
  | 'waiter-tips';

interface RestaurantRoleContextValue {
  role: RestaurantRole;
  /** Real role from server — cannot be changed by the user. */
  serverRole: RestaurantRole | null;
  restaurantId: string | null;
  roleLoading: boolean;
  /** Owners/managers can switch to another role view for supervision purposes. */
  setRole: (role: RestaurantRole) => void;
  /** All restaurants the signed-in user has an active role in. */
  restaurants: RestaurantOption[];
  restaurantsLoading: boolean;
  /** Switch the active restaurant (multi-unit staff/owners). */
  switchRestaurant: (restaurantId: string) => Promise<void>;
  managerView: ManagerRoleView;
  setManagerView: (view: ManagerRoleView) => void;
  maitreView: MaitreRoleView;
  setMaitreView: (view: MaitreRoleView) => void;
  chefView: ChefRoleView;
  setChefView: (view: ChefRoleView) => void;
  barmanView: BarmanRoleView;
  setBarmanView: (view: BarmanRoleView) => void;
  cookView: CookRoleView;
  setCookView: (view: CookRoleView) => void;
  waiterView: WaiterRoleView;
  setWaiterView: (view: WaiterRoleView) => void;
}

const RestaurantRoleContext = createContext<RestaurantRoleContextValue | undefined>(undefined);

const SUPERVISORY_ROLES: RestaurantRole[] = ['owner', 'manager'];

export function RestaurantRoleProvider({ children }: { children: ReactNode }) {
  const [serverRole, setServerRole] = useState<RestaurantRole | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [role, setRoleState] = useState<RestaurantRole>('owner');
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [managerView, setManagerView] = useState<ManagerRoleView>('manager-ops');
  const [maitreView, setMaitreView] = useState<MaitreRoleView>('maitre-reservations');
  const [chefView, setChefView] = useState<ChefRoleView>('chef-kds');
  const [barmanView, setBarmanView] = useState<BarmanRoleView>('barman-station');
  const [cookView, setCookView] = useState<CookRoleView>('cook-station');
  const [waiterView, setWaiterView] = useState<WaiterRoleView>('waiter');

  const loadRoleForRestaurant = useCallback(async (userId: string, targetRestaurantId?: string) => {
    let query = getSupabaseClient()
      .from('user_roles')
      .select('role, restaurant_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1);

    query = targetRestaurantId ? query.eq('restaurant_id', targetRestaurantId) : query;

    const { data, error } = await query.maybeSingle();
    if (error) {
      logger.warn('[RestaurantRoleContext] Failed to load role:', error.message);
      return;
    }
    if (data) {
      const loaded = data.role as RestaurantRole;
      setServerRole(loaded);
      setRoleState(loaded);
      setRestaurantId(data.restaurant_id as string);
    }
  }, []);

  const switchRestaurant = useCallback(async (targetRestaurantId: string) => {
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) return;
    setRoleLoading(true);
    try {
      await loadRoleForRestaurant(user.id, targetRestaurantId);
    } finally {
      setRoleLoading(false);
    }
  }, [loadRoleForRestaurant]);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      try {
        const { user } = await getOptionalSupabaseSessionUser();
        if (!user) return;

        await loadRoleForRestaurant(user.id);

        try {
          const rawRestaurants = await supabaseApiAdapter.getMyRestaurants();
          if (!cancelled && Array.isArray(rawRestaurants)) {
            setRestaurants(rawRestaurants.map((r: any) => ({
              id: r.id,
              name: r.name,
              city: r.city,
              state: r.state,
              serviceType: r.service_type,
              logoUrl: r.logo_url ?? null,
            })));
          }
        } catch (err) {
          if (!cancelled) logger.warn('[RestaurantRoleContext] Failed to load restaurants list:', err);
        } finally {
          if (!cancelled) setRestaurantsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          logger.warn('[RestaurantRoleContext] Unexpected error:', err);
        }
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    }

    void loadRole();
    return () => { cancelled = true; };
  }, []);

  const setRole = (newRole: RestaurantRole) => {
    // Only supervisory roles can impersonate another role view.
    if (serverRole && !SUPERVISORY_ROLES.includes(serverRole)) return;
    setRoleState(newRole);
  };

  const value = useMemo(
    () => ({
      role,
      serverRole,
      restaurantId,
      roleLoading,
      setRole,
      restaurants,
      restaurantsLoading,
      switchRestaurant,
      managerView,
      setManagerView,
      maitreView,
      setMaitreView,
      chefView,
      setChefView,
      barmanView,
      setBarmanView,
      cookView,
      setCookView,
      waiterView,
      setWaiterView,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, serverRole, restaurantId, roleLoading, restaurants, restaurantsLoading, switchRestaurant, managerView, maitreView, chefView, barmanView, cookView, waiterView],
  );

  return (
    <RestaurantRoleContext.Provider value={value}>
      {children}
    </RestaurantRoleContext.Provider>
  );
}

export function useRestaurantRole() {
  const context = useContext(RestaurantRoleContext);
  if (!context) {
    throw new Error('useRestaurantRole must be used within RestaurantRoleProvider');
  }
  return context;
}
