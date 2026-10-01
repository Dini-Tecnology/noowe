import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useServiceType,
  isSupportedServiceType,
  ServiceType,
  ServiceTypeStatus,
  ServiceTypeFeatures,
} from '../contexts/ServiceTypeContext';
import {
  SERVICE_TYPE_CONFIGS,
} from '@okinawa/shared/config/service-types';
import {
  clientFeaturesFromCapabilities,
  type RestaurantCapabilities,
  type RestaurantCapabilityPolicies,
} from '@okinawa/shared/config/capabilities';
import customerBackend from '../services/customer-backend';

type FeatureAvailability = ServiceTypeFeatures;

interface ServiceTypeFeatureHook {
  features: FeatureAvailability;
  serviceType: ServiceType | null;
  serviceName: string;
  isFeatureEnabled: (feature: keyof FeatureAvailability) => boolean;
  getEnabledFeatures: () => (keyof FeatureAvailability)[];
  getDisabledFeatures: () => (keyof FeatureAvailability)[];
}

const DEFAULT_FEATURES: FeatureAvailability = {
  reservations: false,
  virtualQueue: false,
  tableManagement: false,
  menu: false,
  menuPersonalization: false,
  ordering: false,
  orderTracking: false,
  qrOrdering: false,
  callWaiter: false,
  splitPayment: false,
  billing: false,
  payments: false,
  guestInvitations: false,
  aiPairing: false,
  loyalty: false,
  postVisit: false,
};

export const useServiceTypeFeatures = (): ServiceTypeFeatureHook => {
  const { currentServiceType, config, isFeatureEnabled } = useServiceType();

  const features = useMemo<FeatureAvailability>(() => {
    if (!config) return DEFAULT_FEATURES;
    return config.features;
  }, [config]);

  const serviceName = useMemo(() => {
    return config?.name ?? 'Desconhecido';
  }, [config]);

  const getEnabledFeatures = (): (keyof FeatureAvailability)[] => {
    return (Object.keys(features) as (keyof FeatureAvailability)[]).filter(
      (key) => features[key]
    );
  };

  const getDisabledFeatures = (): (keyof FeatureAvailability)[] => {
    return (Object.keys(features) as (keyof FeatureAvailability)[]).filter(
      (key) => !features[key]
    );
  };

  return {
    features,
    serviceType: currentServiceType,
    serviceName,
    isFeatureEnabled,
    getEnabledFeatures,
    getDisabledFeatures,
  };
};

// Hook to conditionally render based on service type
export const useConditionalFeature = (feature: keyof FeatureAvailability): boolean => {
  const { isFeatureEnabled } = useServiceType();
  return isFeatureEnabled(feature);
};

// Hook to get service-type specific UI configurations
export const useServiceTypeUI = () => {
  const { currentServiceType, config } = useServiceType();
  const features = config?.features ?? DEFAULT_FEATURES;

  const getOrderFlowType = (): 'table' | 'counter' | 'queue' => {
    if (features.tableManagement) return 'table';
    if (features.virtualQueue) return 'queue';
    return 'counter';
  };

  const getPaymentTiming = (): 'pre-order' | 'post-meal' | 'immediate' => {
    if (features.tableManagement) return 'post-meal';
    return features.payments ? 'pre-order' : 'immediate';
  };

  const shouldShowTableSelection = (): boolean => features.tableManagement;

  const shouldShowQueuePosition = (): boolean => features.virtualQueue;

  const getMenuStyle = (): 'traditional' | 'simple' => features.menuPersonalization ? 'simple' : 'traditional';

  return {
    serviceType: currentServiceType,
    serviceName: config?.name ?? '',
    serviceIcon: config?.icon ?? 'restaurant',
    orderFlowType: getOrderFlowType(),
    paymentTiming: getPaymentTiming(),
    shouldShowTableSelection: shouldShowTableSelection(),
    shouldShowQueuePosition: shouldShowQueuePosition(),
    menuStyle: getMenuStyle(),
  };
};

export interface ServiceTypeResolution {
  status: ServiceTypeStatus;
  type: ServiceType | null;
  serviceName: string;
  features: FeatureAvailability;
  isFeatureEnabled: (feature: keyof FeatureAvailability) => boolean;
  /** Journey capabilities from the server; null until resolved. */
  capabilities: RestaurantCapabilities | null;
  /** Configured values (fees, discounts, tolerances); null until resolved. */
  policies: RestaurantCapabilityPolicies | null;
  /** Terminal failure while resolving the restaurant capability contract. */
  error?: unknown;
  /** Retries whichever request is needed to resolve the contract. */
  retry?: () => Promise<unknown>;
}

const UNRESOLVED: Pick<ServiceTypeResolution, 'features' | 'isFeatureEnabled' | 'capabilities' | 'policies'> = {
  features: DEFAULT_FEATURES,
  isFeatureEnabled: () => false,
  capabilities: null,
  policies: null,
};

/**
 * Single entry point every screen should use to know which service-type
 * features apply.
 *
 * - With a `restaurantId`: resolves that specific restaurant, independent of
 *   the active visit session (e.g. a restaurant the user is looking at but
 *   hasn't scanned a table QR for yet). Shares the `['restaurant', id]`
 *   query key used across the app, so this is a cache hit — not an extra
 *   request — wherever that restaurant was already fetched.
 * - Without a `restaurantId`: falls back to the session-wide
 *   ServiceTypeContext (kept in sync by ServiceTypeSync), for screens that
 *   only know "the restaurant of the table I'm sitting at" — Cart,
 *   CallWaiter.
 *
 * A network failure resolving the restaurant is reported as `loading`, not
 * `unsupported` — screens must not tell the user a feature is unavailable
 * just because the request is still retrying.
 */
export const useServiceTypeFor = (restaurantId?: string | null, journeyModel?: ServiceType | null): ServiceTypeResolution => {
  const globalContext = useServiceType();

  const ownQuery = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => customerBackend.getRestaurant(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
  });

  const ownServiceType = journeyModel ?? ownQuery.data?.serviceType;
  const ownCapabilities = useQuery({
    queryKey: ['restaurant-capabilities', restaurantId, ownServiceType],
    queryFn: () => customerBackend.getRestaurantCapabilities(restaurantId!, ownServiceType as ServiceType),
    enabled: !!restaurantId && isSupportedServiceType(ownServiceType),
    staleTime: 5 * 60 * 1000,
  });

  return useMemo<ServiceTypeResolution>(() => {
    if (!restaurantId) {
      return {
        status: globalContext.status,
        type: globalContext.currentServiceType,
        serviceName: globalContext.config?.name ?? 'Desconhecido',
        features: globalContext.config?.features ?? DEFAULT_FEATURES,
        isFeatureEnabled: globalContext.isFeatureEnabled,
        capabilities: globalContext.contract?.capabilities ?? null,
        policies: globalContext.contract?.policies ?? null,
      };
    }

    if (ownQuery.isPending || ownQuery.isError) {
      return {
        status: 'loading', type: null, serviceName: 'Desconhecido', ...UNRESOLVED,
        error: ownQuery.error,
        retry: ownQuery.refetch,
      };
    }

    const serviceType = ownServiceType;
    if (!isSupportedServiceType(serviceType)) {
      return { status: 'unsupported', type: null, serviceName: 'Desconhecido', ...UNRESOLVED };
    }

    // Only checked once the type is known to be supported: an unsupported
    // type never enables this query, so it would stay `isPending` forever
    // and mask the `unsupported` status above with a permanent `loading`.
    if (ownCapabilities.isPending || ownCapabilities.isError || !ownCapabilities.data) {
      return {
        status: 'loading', type: null, serviceName: 'Desconhecido', ...UNRESOLVED,
        error: ownCapabilities.error,
        retry: ownCapabilities.refetch,
      };
    }

    const config = SERVICE_TYPE_CONFIGS[serviceType];
    const features = clientFeaturesFromCapabilities(ownCapabilities.data);
    return {
      status: 'ready',
      type: serviceType,
      serviceName: config.name,
      features,
      isFeatureEnabled: (feature) => features[feature],
      capabilities: ownCapabilities.data.capabilities,
      policies: ownCapabilities.data.policies,
    };
  }, [restaurantId, globalContext, ownQuery.isPending, ownQuery.isError, ownQuery.error, ownQuery.refetch, ownServiceType, ownCapabilities.isPending, ownCapabilities.isError, ownCapabilities.error, ownCapabilities.data, ownCapabilities.refetch]);
};
