import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RestaurantCapabilityContract, ServiceModel } from '@okinawa/shared/config/capabilities';
import { useServiceTypeFor } from '../hooks/useServiceTypeFeatures';
import { ServiceTypeProvider } from '../contexts/ServiceTypeContext';

const mockSingle = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/shared/services/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: mockSingle,
          }),
        }),
      }),
    }),
    rpc: mockRpc,
  }),
}));

function buildContract(
  serviceModel: ServiceModel,
  capabilityOverrides: Partial<RestaurantCapabilityContract['capabilities']> = {},
): RestaurantCapabilityContract {
  return {
    contractVersion: 2,
    enabledServiceModels: [serviceModel],
    serviceModel,
    capabilities: {
      contractVersion: 2,
      reservations: false,
      reservationRequired: false,
      virtualQueue: false,
      queueIsPrimaryEntry: false,
      orderWhileWaiting: false,
      tableSession: false,
      tableCheckIn: false,
      tableQr: false,
      counterQr: false,
      guestLink: false, userInvite: false,
      splitBill: false,
      splitModes: ['equal'],
      serviceFee: false,
      staffCalls: false,
      staffCallTypes: [],
      familyMode: false,
      parties: false,
      comboBuilder: false,
      prepaidRequired: false,
      pickupCode: false,
      pickupSlots: false,
      qualityCheck: false,
      loyaltyMode: 'points',
      consumptionUnit: 'table_with_guests',
      orderTracking: 'table_order',
      ...capabilityOverrides,
    },
    policies: {
      serviceFeeBps: null,
      tipPresetsBps: [],
      queueCallToleranceMin: null,
      reservationNoShowMin: null,
      guestLinkTtlMin: null, userInviteTtlMin: null, userSearchMinChars: null, capacityRequestTtlMin: null,
      requireGuestAccount: false,
      enforceTableCapacity: false,
      capacityOverrideRoles: [],
      splitFixedRemainder: null,
      tipAllocation: null,
      comboDiscountBps: null,
      pickupCapacityPerSlot: null,
      pickupExpiryMin: null,
      stampsPerReward: null,
    },
  };
}

const PROFILE_CAPABILITIES: Record<ServiceModel, Partial<RestaurantCapabilityContract['capabilities']>> = {
  fine_dining: { reservations: true, tableSession: true, staffCalls: true, splitBill: true, guestLink: true },
  casual_dining: { reservations: false, tableSession: true, staffCalls: true, splitBill: true, familyMode: true },
  quick_service: {
    reservations: false,
    tableSession: false,
    staffCalls: false,
    pickupCode: true,
    prepaidRequired: true,
    consumptionUnit: 'individual_cart',
    orderTracking: 'pickup_steps',
  },
};

function renderServiceTypeFor(restaurantId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServiceTypeProvider>{children}</ServiceTypeProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useServiceTypeFor(restaurantId), { wrapper });
}

describe('useServiceTypeFor — resolves the 3 MVP profiles from the server', () => {
  afterEach(() => jest.clearAllMocks());

  it.each(['fine_dining', 'casual_dining', 'quick_service'] as ServiceModel[])(
    'resolves %s with the features the server contract enables',
    async (profile) => {
      mockSingle.mockResolvedValueOnce({ data: { id: 'r1', name: 'Restaurante Teste', service_type: profile }, error: null });
      const contract = buildContract(profile, PROFILE_CAPABILITIES[profile]);
      mockRpc.mockResolvedValueOnce({ data: contract, error: null });

      const { result } = renderServiceTypeFor('r1');

      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(result.current.type).toBe(profile);
      expect(result.current.features.reservations).toBe(contract.capabilities.reservations);
      expect(result.current.features.tableManagement).toBe(contract.capabilities.tableSession);
      expect(result.current.features.callWaiter).toBe(contract.capabilities.staffCalls);
      expect(mockRpc).toHaveBeenCalledWith('get_restaurant_model_capabilities_v2', {
        p_restaurant_id: 'r1',
        p_service_model: profile,
      });
    },
  );

  it('reports "loading" (not "unsupported") when the restaurant lookup fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: new Error('network down') });

    const { result } = renderServiceTypeFor('r1');

    await waitFor(() => expect(result.current.status).toBe('loading'));
    expect(result.current.type).toBeNull();
  });

  it('reports "loading" (not "unsupported") when the capabilities RPC fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'r1', name: 'Restaurante Teste', service_type: 'fine_dining' }, error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc unavailable' } });

    const { result } = renderServiceTypeFor('r1');

    await waitFor(() => expect(result.current.status).toBe('loading'));
    expect(result.current.type).toBeNull();
  });

  it('reports "unsupported" for a service_type outside the MVP scope', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'r1', name: 'Restaurante Teste', service_type: 'delivery_only' }, error: null });

    const { result } = renderServiceTypeFor('r1');

    await waitFor(() => expect(result.current.status).toBe('unsupported'));
    expect(result.current.type).toBeNull();
    // Unsupported types never enable the capabilities RPC — a table this
    // catches: `useServiceTypeFor` used to stay stuck on "loading" forever
    // here because it checked the (permanently disabled) capabilities
    // query's pending state before checking service-type support.
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
