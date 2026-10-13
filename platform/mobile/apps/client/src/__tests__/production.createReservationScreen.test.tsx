import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
    contractVersion: 2,
    enabledServiceModels: [serviceModel],
    serviceModel,
    capabilities: {
      contractVersion: 2,
      reservations: false,
      reservationRequired: false,
      orderWhileWaiting: false,
      tableCheckIn: false,
      tableQr: false,
      counterQr: false,
      orderAhead: false,
      pickupSlots: false,
      qualityCheck: false,
      staffCallTypes: [],
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
      noPickupPolicy: null,
      acceptMode: null,
      acceptTimeoutMin: null,
      ordersPaused: false,
      defaultPrepMin: null,
      closeOrdersBeforeMin: null,
      pixExpiryMin: null,
      distanceWarningKm: null,
      pickupLocation: null,
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

const OPEN_EVERY_DAY = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .map((day) => [day, { closed: false, shifts: [{ open: '00:00', close: '23:59' }] }]),
);

/** Restaurante aberto todo dia com reservas habilitadas; `capacity` vem da RPC de disponibilidade. */
function mockReservableRestaurant(capacity: number) {
  mockSingle.mockResolvedValue({
    data: { id: 'r1', name: 'Restaurante Teste', service_type: 'casual_dining', is_active: true, opening_hours: OPEN_EVERY_DAY },
    error: null,
  });
  mockRpc.mockImplementation((name: string, args: { p_slots?: string[] }) => {
    if (name === 'customer_reservation_availability') {
      return Promise.resolve({
        data: (args.p_slots ?? []).map((slot) => ({ slot, remaining: capacity, capacity })),
        error: null,
      });
    }
    return Promise.resolve({ data: buildContract('casual_dining', { reservations: true }), error: null });
  });
}

describe('CreateReservationScreen — restaurante sem mesas cadastradas', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockSingle.mockReset();
    mockRpc.mockReset();
  });

  it('avisa que não há mesas em vez de sugerir outro dia quando a capacidade é zero', async () => {
    mockReservableRestaurant(0);

    const { findByText, queryByText } = renderScreen();

    expect(await findByText('Este restaurante ainda não tem mesas disponíveis para reserva pelo app.')).toBeTruthy();
    expect(await findByText('Sem mesas cadastradas para reserva neste restaurante.')).toBeTruthy();
    expect(queryByText(/Tente outro dia ou reduza o grupo/)).toBeNull();
  });

  it('não mostra o aviso quando o restaurante tem mesas', async () => {
    mockReservableRestaurant(20);

    const { findAllByText, queryByText } = renderScreen();

    expect((await findAllByText(/^\d{2}:\d{2}$/)).length).toBeGreaterThan(0);
    expect(queryByText('Este restaurante ainda não tem mesas disponíveis para reserva pelo app.')).toBeNull();
  });
});

describe('CreateReservationScreen — chip "Outra data"', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockSingle.mockReset();
    mockRpc.mockReset();
  });

  it('continua visível depois de escolher uma data no calendário, ao lado do chip da data escolhida', async () => {
    mockReservableRestaurant(20);

    const { findByText, getByText, getByLabelText, queryByText } = renderScreen();

    // Espera os chips rápidos (dependem de opening_hours) antes de abrir o calendário.
    await findByText('Amanhã');
    fireEvent.press(getByText('Outra data'));
    fireEvent.press(getByLabelText('Próximo mês'));

    // Dia 28 do mês seguinte fica sempre além dos 7 chips rápidos e dentro do limite de 60 dias.
    const now = new Date();
    const picked = new Date(now.getFullYear(), now.getMonth() + 1, 28);
    const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    fireEvent.press(getByLabelText(`28 de ${monthNames[picked.getMonth()]}`));

    const weekday = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][picked.getDay()];
    expect(await findByText(`${weekday} 28/${picked.getMonth() + 1}`)).toBeTruthy();
    expect(queryByText('Outra data')).toBeTruthy();
  });
});
