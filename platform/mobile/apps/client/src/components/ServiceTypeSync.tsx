import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVisitSession } from '../contexts/VisitSessionContext';
import { isSupportedServiceType, useServiceType } from '../contexts/ServiceTypeContext';
import customerBackend from '../services/customer-backend';
import { clientFeaturesFromCapabilities, type ServiceModel } from '@okinawa/shared/config/capabilities';

/**
 * Keeps ServiceTypeContext in sync with the restaurant of the active visit
 * session. Renders nothing — mount once inside both VisitSessionProvider and
 * ServiceTypeProvider.
 */
export function ServiceTypeSync() {
  const { session } = useVisitSession();
  const { setResolution } = useServiceType();
  const restaurantId = session?.restaurantId ?? null;

  const restaurant = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => customerBackend.getRestaurant(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
  });

  const serviceType = restaurant.data?.serviceType;
  const capabilities = useQuery({
    queryKey: ['restaurant-capabilities', restaurantId, serviceType],
    queryFn: () => customerBackend.getRestaurantCapabilities(restaurantId!, serviceType as ServiceModel),
    enabled: !!restaurantId && isSupportedServiceType(serviceType),
    staleTime: 5 * 60 * 1000,
  });
  const { isPending, isError } = restaurant;

  useEffect(() => {
    if (!restaurantId) {
      setResolution({ status: 'idle', type: null });
      return;
    }
    if (isPending) {
      setResolution({ status: 'loading', type: null });
      return;
    }
    // A failed lookup is not the same as an unsupported restaurant: keep it in
    // `loading` so screens show a neutral state instead of claiming the feature
    // is unavailable. React Query retries in the background.
    if (isError) {
      setResolution({ status: 'loading', type: null });
      return;
    }
    if (isSupportedServiceType(serviceType)) {
      if (capabilities.isPending || capabilities.isError || !capabilities.data) {
        setResolution({ status: 'loading', type: null });
        return;
      }
      setResolution({
        status: 'ready',
        type: serviceType,
        features: clientFeaturesFromCapabilities(capabilities.data),
        contract: capabilities.data,
      });
      return;
    }
    setResolution({ status: 'unsupported', type: null });
  }, [restaurantId, serviceType, isPending, isError, capabilities.isPending, capabilities.isError, capabilities.data, setResolution]);

  return null;
}
