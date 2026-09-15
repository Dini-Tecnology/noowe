import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import {
  MVP_SERVICE_TYPES,
  SERVICE_TYPE_CONFIGS as SHARED_SERVICE_TYPE_CONFIGS,
  type ServiceType,
  type ServiceTypeDefinition,
  type ServiceTypeFeatures,
} from '@okinawa/shared/config/service-types';
import type { RestaurantCapabilityContract } from '@okinawa/shared/config/capabilities';

export type { ServiceType, ServiceTypeFeatures } from '@okinawa/shared/config/service-types';
export { isSupportedServiceType } from '@okinawa/shared/config/service-types';

/**
 * Values persisted in `restaurants.service_type` (snake_case), shared with the
 * restaurant app's SERVICE_TYPE_CATALOG. Keep in sync with the database.
 */
export const SUPPORTED_SERVICE_TYPES: ServiceType[] = [...MVP_SERVICE_TYPES];

/**
 * `idle`        no restaurant selected yet
 * `loading`     resolving the restaurant's service type
 * `ready`       resolved to one of the supported types
 * `unsupported` restaurant exists but runs a service type outside the MVP scope
 */
export type ServiceTypeStatus = 'idle' | 'loading' | 'ready' | 'unsupported';

export const SERVICE_TYPE_CONFIGS = SHARED_SERVICE_TYPE_CONFIGS;

/**
 * A type resolved without server capabilities enables nothing. The per-model
 * feature table in shared/config is display metadata, not a source of truth.
 */
const withoutFeatures = (features: ServiceTypeFeatures): ServiceTypeFeatures =>
  Object.fromEntries(Object.keys(features).map((key) => [key, false])) as ServiceTypeFeatures;

export type ServiceTypeResolution = {
  status: ServiceTypeStatus;
  type: ServiceType | null;
  features?: ServiceTypeFeatures;
  /** Server contract the features were derived from; absent while resolving. */
  contract?: RestaurantCapabilityContract;
};

interface ServiceTypeContextValue {
  currentServiceType: ServiceType | null;
  contract: RestaurantCapabilityContract | null;
  config: ServiceTypeDefinition | null;
  status: ServiceTypeStatus;
  /** True while the service type is still being resolved from the backend. */
  isResolving: boolean;
  setResolution: (resolution: ServiceTypeResolution) => void;
  setServiceType: (type: ServiceType | null) => void;
  isFeatureEnabled: (feature: keyof ServiceTypeFeatures) => boolean;
  getAllConfigs: () => ServiceTypeDefinition[];
}

const ServiceTypeContext = createContext<ServiceTypeContextValue | undefined>(undefined);

interface ServiceTypeProviderProps {
  children: ReactNode;
  initialResolution?: ServiceTypeResolution;
}

export const ServiceTypeProvider: React.FC<ServiceTypeProviderProps> = ({
  children,
  initialResolution = { status: 'idle', type: null },
}) => {
  const [resolution, setResolution] = useState<ServiceTypeResolution>(initialResolution);

  const config = resolution.type
    ? { ...SERVICE_TYPE_CONFIGS[resolution.type], features: resolution.features ?? withoutFeatures(SERVICE_TYPE_CONFIGS[resolution.type].features) }
    : null;

  const setServiceType = useCallback((type: ServiceType | null) => {
    setResolution({ status: type ? 'ready' : 'idle', type });
  }, []);

  const isFeatureEnabled = useCallback(
    (feature: keyof ServiceTypeFeatures): boolean => (config ? config.features[feature] : false),
    [config],
  );

  const getAllConfigs = useCallback((): ServiceTypeDefinition[] => Object.values(SERVICE_TYPE_CONFIGS), []);

  const value = useMemo<ServiceTypeContextValue>(
    () => ({
      currentServiceType: resolution.type,
      contract: resolution.contract ?? null,
      config,
      status: resolution.status,
      isResolving: resolution.status === 'loading',
      setResolution,
      setServiceType,
      isFeatureEnabled,
      getAllConfigs,
    }),
    [resolution, config, setResolution, setServiceType, isFeatureEnabled, getAllConfigs],
  );

  return <ServiceTypeContext.Provider value={value}>{children}</ServiceTypeContext.Provider>;
};

export const useServiceType = (): ServiceTypeContextValue => {
  const context = useContext(ServiceTypeContext);
  if (!context) {
    throw new Error('useServiceType must be used within a ServiceTypeProvider');
  }
  return context;
};
