import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@okinawa/shared/services/supabase';
import { getOptionalSupabaseSessionUser } from '@okinawa/shared/services/supabase-auth';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import logger from '@okinawa/shared/utils/logger';
import { getActiveRestaurantId, setActiveRestaurantId } from '@okinawa/shared/services/active-restaurant';
import { loadStoredActiveRestaurantId, saveStoredActiveRestaurantId } from '@okinawa/shared/services/active-restaurant-storage';
import socketService from '../services/socket';
import { pickRoleRow } from './pickRestaurantRole';
import {
  DISABLED_SERVICE_TYPE_FEATURES,
  isSupportedServiceType,
  type ServiceType,
  type ServiceTypeFeatures,
  type CustomerExperienceConfig,
} from '@okinawa/shared/config/service-types';
import {
  clientFeaturesFromCapabilities,
  parseRestaurantCapabilityContract,
  type RestaurantCapabilityContract,
  type ServiceModel,
} from '@okinawa/shared/config/capabilities';

export interface RestaurantOption {
  id: string;
  name: string;
  city: string;
  state: string;
  serviceType: string;
  serviceConfig: Record<string, unknown>;
  customerExperience: CustomerExperienceConfig | null;
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
  | 'maitre-management'
  | 'maitre-settings';

export type ChefRoleView =
  | 'chef-kds'
  | 'chef-approvals'
  | 'chef-analytics'
  | 'chef-cost'
  | 'chef-menu'
  | 'chef-stock'
  | 'chef-settings';

export type BarmanRoleView =
  | 'barman-station'
  | 'bar-kds'
  | 'bar-recipes'
  | 'bar-stock'
  | 'barman-settings';

export type CookRoleView =
  | 'cook-station'
  | 'cook-kds'
  | 'cook-settings';

export type WaiterRoleView =
  | 'waiter'
  | 'waiter-calls'
  | 'waiter-table-actions'
  | 'waiter-kitchen'
  | 'waiter-assistance'
  | 'waiter-table-charge'
  | 'waiter-tap-to-pay'
  | 'waiter-order-management'
  | 'waiter-tips'
  | 'waiter-settings';

interface RestaurantRoleContextValue {
  role: RestaurantRole;
  /** Real role from server — cannot be changed by the user. */
  serverRole: RestaurantRole | null;
  restaurantId: string | null;
  serviceType: ServiceType | null;
  serviceFeatures: ServiceTypeFeatures;
  capabilities: RestaurantCapabilityContract | null;
  enabledServiceModels: ServiceModel[];
  switchServiceModel: (model: ServiceModel) => void;
  roleLoading: boolean;
  /** Owners/managers can switch to another role view for supervision purposes. */
  setRole: (role: RestaurantRole) => void;
  /** Re-fetch the signed-in user's restaurant role. Returns true when a role exists. */
  reloadRole: () => Promise<boolean>;
  /** All restaurants the signed-in user has an active role in. */
  restaurants: RestaurantOption[];
  restaurantsLoading: boolean;
  /** Re-fetch all restaurants available to the signed-in user. */
  reloadRestaurants: () => Promise<void>;
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
  const [activeServiceModel, setActiveServiceModel] = useState<ServiceModel | null>(null);
  const [capabilities, setCapabilities] = useState<RestaurantCapabilityContract | null>(null);
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
      .order('created_at', { ascending: true });

    query = targetRestaurantId ? query.eq('restaurant_id', targetRestaurantId) : query;

    const { data: roleRows, error } = await query;
    if (error) {
      logger.warn('[RestaurantRoleContext] Failed to load role:', error.message);
      return false;
    }
    // Uma pessoa pode ter mais de um papel no mesmo restaurante (ex.: gerente e depois dono).
    const data = pickRoleRow(roleRows ?? [], targetRestaurantId);
    if (data) {
      const loaded = data.role as RestaurantRole;
      setServerRole(loaded);
      setRoleState(loaded);
      setRestaurantId(data.restaurant_id as string);
      setActiveRestaurantId(data.restaurant_id as string);
      return true;
    }

    // Fallback: restaurant ownership via restaurants.owner_id
    let ownedQuery = getSupabaseClient()
      .from('restaurants')
      .select('id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    ownedQuery = targetRestaurantId ? ownedQuery.eq('id', targetRestaurantId) : ownedQuery;

    const { data: owned, error: ownedError } = await ownedQuery.maybeSingle();
    if (ownedError) {
      logger.warn('[RestaurantRoleContext] Failed to load owned restaurant:', ownedError.message);
      setServerRole(null);
      setRestaurantId(null);
      setActiveRestaurantId(null);
      return false;
    }

    if (owned?.id) {
      setServerRole('owner');
      setRoleState('owner');
      setRestaurantId(owned.id as string);
      setActiveRestaurantId(owned.id as string);
      return true;
    }

    setServerRole(null);
    setRestaurantId(null);
    setActiveRestaurantId(null);
    return false;
  }, []);

  /**
   * Abre o restaurante que a pessoa estava usando; se o vínculo não existe mais
   * (foi removido, ou é outra conta), cai no vínculo mais antigo.
   */
  const loadPreferredRole = useCallback(async (userId: string, preferredId?: string | null) => {
    if (preferredId && (await loadRoleForRestaurant(userId, preferredId))) return true;
    return loadRoleForRestaurant(userId);
  }, [loadRoleForRestaurant]);

  const reloadRole = useCallback(async () => {
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) return false;
    setRoleLoading(true);
    try {
      // Recarregar não pode devolver a pessoa ao primeiro restaurante: mantém o ativo.
      return await loadPreferredRole(user.id, getActiveRestaurantId());
    } finally {
      setRoleLoading(false);
    }
  }, [loadPreferredRole]);

  const switchRestaurant = useCallback(async (targetRestaurantId: string) => {
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) return;
    setRoleLoading(true);
    setCapabilities(null);
    setActiveServiceModel(null);
    try {
      const switched = await loadRoleForRestaurant(user.id, targetRestaurantId);
      if (switched) await saveStoredActiveRestaurantId(user.id, targetRestaurantId);
      else await loadPreferredRole(user.id);
    } finally {
      setRoleLoading(false);
    }
  }, [loadRoleForRestaurant, loadPreferredRole]);

  const reloadRestaurants = useCallback(async () => {
    setRestaurantsLoading(true);
    try {
      const rawRestaurants = await supabaseApiAdapter.getMyRestaurants();
      setRestaurants(Array.isArray(rawRestaurants) ? rawRestaurants.map((r: any) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
        serviceType: r.service_type,
        serviceConfig: r.service_config && typeof r.service_config === 'object'
          ? r.service_config
          : {},
        customerExperience: r.customer_experience && typeof r.customer_experience === 'object'
          ? r.customer_experience as CustomerExperienceConfig
          : null,
        logoUrl: r.logo_url ?? null,
      })) : []);
    } catch (err) {
      logger.warn('[RestaurantRoleContext] Failed to load restaurants list:', err);
    } finally {
      setRestaurantsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      try {
        const { user } = await getOptionalSupabaseSessionUser();
        if (!user) return;

        await loadPreferredRole(user.id, await loadStoredActiveRestaurantId(user.id));

        if (!cancelled) await reloadRestaurants();
      } catch (err) {
        if (!cancelled) {
          logger.warn('[RestaurantRoleContext] Unexpected error:', err);
        }
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    }

    void loadRole();
    return () => {
      cancelled = true;
      // Saiu da conta: o próximo login não herda o restaurante deste.
      setActiveRestaurantId(null);
    };
  }, [loadPreferredRole, reloadRestaurants]);

  // Eventos em tempo real só do restaurante em uso (a pessoa pode ter vários).
  useEffect(() => {
    if (!restaurantId) return;
    socketService.joinRestaurantRoom(restaurantId);
    return () => socketService.leaveRestaurantRoom(restaurantId);
  }, [restaurantId]);

  useEffect(() => {
    let cancelled = false;
    const current = restaurants.find((item) => item.id === restaurantId);
    const model = activeServiceModel
      ?? (isSupportedServiceType(current?.serviceType) ? current.serviceType : null);
    if (!restaurantId || !model) {
      return;
    }
    void (async () => {
      const { data, error } = await (getSupabaseClient() as any).rpc('get_restaurant_model_capabilities_v2', {
        p_restaurant_id: restaurantId,
        p_service_model: model,
      });
      if (cancelled) return;
      if (error) {
        logger.warn('[RestaurantRoleContext] Failed to load capabilities:', error.message);
        setCapabilities(null);
        return;
      }
      const parsed = parseRestaurantCapabilityContract(data);
      setCapabilities(parsed);
      if (parsed && parsed.serviceModel !== activeServiceModel) setActiveServiceModel(parsed.serviceModel);
    })();
    return () => { cancelled = true; };
  }, [restaurantId, restaurants, activeServiceModel]);

  const setRole = (newRole: RestaurantRole) => {
    // Only supervisory roles can impersonate another role view.
    if (serverRole && !SUPERVISORY_ROLES.includes(serverRole)) return;
    setRoleState(newRole);
  };

  const value = useMemo(
    () => {
      const currentRestaurant = restaurants.find((item) => item.id === restaurantId);
      const serviceType = capabilities?.serviceModel
        ?? (isSupportedServiceType(currentRestaurant?.serviceType) ? currentRestaurant.serviceType : null);
      return {
      role,
      serverRole,
      restaurantId,
      serviceType,
      serviceFeatures: capabilities
        ? clientFeaturesFromCapabilities(capabilities)
        : DISABLED_SERVICE_TYPE_FEATURES,
      capabilities,
      enabledServiceModels: capabilities?.enabledServiceModels ?? [],
      switchServiceModel: (model: ServiceModel) => {
        if (capabilities?.enabledServiceModels.includes(model)) setActiveServiceModel(model);
      },
      roleLoading,
      setRole,
      reloadRole,
      restaurants,
      restaurantsLoading,
      reloadRestaurants,
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
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, serverRole, restaurantId, roleLoading, reloadRole, restaurants, restaurantsLoading, reloadRestaurants, switchRestaurant, managerView, maitreView, chefView, barmanView, cookView, waiterView, capabilities],
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
