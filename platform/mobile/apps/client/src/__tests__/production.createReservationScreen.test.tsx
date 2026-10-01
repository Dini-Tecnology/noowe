import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@okinawa/shared/contexts/ThemeContext';
import type { RestaurantCapabilityContract, ServiceModel } from '@okinawa/shared/config/capabilities';
import { VisitSessionProvider } from '../contexts/VisitSessionContext';
import { ServiceTypeProvider } from '../contexts/ServiceTypeContext';
import CreateReservationScreen from '../screens/production/CreateReservationScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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
    rpc: (name: string, ...args: unknown[]) => name === 'customer_get_active_visit'
      ? Promise.resolve({ data: null, error: null })
      : mockRpc(name, ...args),
  }),
}));

function buildContract(
  serviceModel: ServiceModel,
  capabilityOverrides: Partial<RestaurantCapabilityContract['capabilities']> = {},
): RestaurantCapabilityContract {
  return {
    serviceModel,
    capabilities: {
      reservations: false,
      virtualQueue: false,
      queueIsPrimaryEntry: false,
      tableSession: false,
      guestLink: false, userInvite: false,
      splitBill: false,
      splitModes: ['equal'],
      serviceFee: false,
      staffCalls: false,
      familyMode: false,
      parties: false,
      comboBuilder: false,
      prepaidRequired: false,
      pickupCode: false,
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

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  const route = { params: { restaurantId: 'r1', restaurantName: 'Restaurante Teste', restaurantAddress: '' } };
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultMode="light">
          <VisitSessionProvider>
            <ServiceTypeProvider>
              <CreateReservationScreen navigation={navigation} route={route} />
            </ServiceTypeProvider>
          </VisitSessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, navigation };
}

const UNAVAILABLE_MESSAGE = 'Este restaurante não aceita reservas pelo app.';

describe('CreateReservationScreen — gates reservations by service-type capability', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows the reservation form when fine_dining enables reservations', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'r1', name: 'Restaurante Teste', service_type: 'fine_dining' }, error: null });
    mockRpc.mockResolvedValueOnce({ data: buildContract('fine_dining', { reservations: true }), error: null });

    const { queryByText, getByText } = renderScreen();

    await waitFor(() => expect(getByText('Confirmar Reserva')).toBeTruthy());
    expect(queryByText(UNAVAILABLE_MESSAGE)).toBeNull();
  });

  it('shows the unavailable-reservations hint when quick_service disables reservations', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'r1', name: 'Restaurante Teste', service_type: 'quick_service' }, error: null });
    mockRpc.mockResolvedValueOnce({ data: buildContract('quick_service', { reservations: false }), error: null });

    const { findByText } = renderScreen();

    expect(await findByText(UNAVAILABLE_MESSAGE)).toBeTruthy();
  });

  it('renders without the unavailable hint while the service type is still resolving', () => {
    mockSingle.mockReturnValueOnce(new Promise(() => {})); // never resolves

    const { queryByText, getByText } = renderScreen();

    expect(getByText('Confirmar Reserva')).toBeTruthy();
    expect(queryByText(UNAVAILABLE_MESSAGE)).toBeNull();
  });
});
