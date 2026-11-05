import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@okinawa/shared/contexts/ThemeContext';
import { CartProvider } from '@okinawa/shared/contexts/CartContext';
import type { RestaurantCapabilityContract, ServiceModel } from '@okinawa/shared/config/capabilities';
import { VisitSessionProvider } from '../contexts/VisitSessionContext';
import { ServiceTypeProvider } from '../contexts/ServiceTypeContext';
import MenuScreen from '../screens/production/MenuScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockGetRestaurant = jest.fn();
const mockGetCapabilities = jest.fn();
const mockGetMenu = jest.fn();
const mockGetCustomizations = jest.fn();
const mockGetActiveVisit = jest.fn();

jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: {
    getRestaurant: (...args: unknown[]) => mockGetRestaurant(...args),
    getRestaurantCapabilities: (...args: unknown[]) => mockGetCapabilities(...args),
    getMenu: (...args: unknown[]) => mockGetMenu(...args),
    getMenuCustomizations: (...args: unknown[]) => mockGetCustomizations(...args),
    getActiveVisit: (...args: unknown[]) => mockGetActiveVisit(...args),
    listTableDiners: jest.fn().mockResolvedValue([]),
  },
}));

const ITEM = {
  id: 'i1',
  categoryId: 'c1',
  name: 'Risoto de Funghi',
  description: 'Arroz arbóreo e funghi secchi',
  price: 68,
  originalPrice: null,
  imageUrl: null,
  preparationTime: 25,
  dietaryInfo: [],
  isPopular: false,
  isKidsFriendly: false,
};

const PRICE = /R\$\s*68,00/;

function contract(
  serviceModel: ServiceModel,
  capabilities: Partial<RestaurantCapabilityContract['capabilities']>,
): RestaurantCapabilityContract {
  return {
    serviceModel,
    capabilities: {
      reservations: true,
      virtualQueue: true,
      queueIsPrimaryEntry: false,
      tableSession: true,
      guestLink: false, userInvite: false,
      splitBill: false,
      splitModes: ['equal'],
      serviceFee: false,
      staffCalls: true,
      familyMode: false,
      parties: false,
      comboBuilder: false,
      prepaidRequired: false,
      orderAhead: false,
      pickupSlots: false,
      pickupCode: false,
      loyaltyMode: 'points',
      consumptionUnit: 'table_with_guests',
      orderTracking: 'table_order',
      ...capabilities,
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
      noPickupPolicy: null, acceptMode: null, acceptTimeoutMin: null, ordersPaused: false,
      defaultPrepMin: null, closeOrdersBeforeMin: null, pixExpiryMin: null, distanceWarningKm: null,
      pickupLocation: null,
    },
  };
}

const quickService = () => contract('quick_service', {
  tableSession: false, staffCalls: false, reservations: false, virtualQueue: false,
  prepaidRequired: true, orderAhead: true, pickupCode: true, comboBuilder: true,
  consumptionUnit: 'individual' as RestaurantCapabilityContract['capabilities']['consumptionUnit'],
});
const casualDining = () => contract('casual_dining', { consumptionUnit: 'per_person' });
const fineDining = () => contract('fine_dining', { consumptionUnit: 'table_with_guests' });

function setup(serviceModel: ServiceModel, built: RestaurantCapabilityContract, browse?: boolean) {
  mockGetRestaurant.mockResolvedValue({
    id: 'r1', name: 'Restaurante Teste', serviceType: serviceModel, serviceConfig: {}, customerExperience: null,
  });
  mockGetCapabilities.mockResolvedValue(built);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), dispatch: jest.fn(), getParent: () => undefined };
  const route = { params: { restaurantId: 'r1', ...(browse ? { browse } : {}) } };
  return render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultMode="light">
          <VisitSessionProvider>
            <ServiceTypeProvider>
              <CartProvider>
                <MenuScreen navigation={navigation} route={route} />
              </CartProvider>
            </ServiceTypeProvider>
          </VisitSessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockGetActiveVisit.mockResolvedValue(null);
  mockGetCustomizations.mockResolvedValue({
    i1: { groups: [{ id: 'g1', name: 'Ponto', required: true, min: 1, max: 1, options: [] }], removableIngredients: [], upsellItemIds: [] },
  });
  mockGetMenu.mockResolvedValue({
    categories: [{ id: 'c1', name: 'Combos' }],
    items: [ITEM],
  });
});

afterEach(() => jest.clearAllMocks());

describe('MenuScreen — modo expositivo da descoberta', () => {
  it.each([
    ['fine_dining', fineDining],
    ['casual_dining', casualDining],
    ['quick_service', quickService],
  ] as const)('%s: mostra item e preço, sem nenhuma ação de pedido', async (serviceModel, build) => {
    const screen = setup(serviceModel, build(), true);

    expect(await screen.findByText('Risoto de Funghi')).toBeTruthy();
    expect(screen.getByText('Arroz arbóreo e funghi secchi')).toBeTruthy();
    expect(screen.getByText(PRICE)).toBeTruthy();

    // Espera a capability chegar: o que some precisa sumir com ela já carregada.
    await screen.findByText('Combos');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('Adicionar')).toBeNull();
    expect(screen.queryByText('Chamar Garçom')).toBeNull();
    expect(screen.queryByText('Modo Família')).toBeNull();
    expect(screen.queryByLabelText('Ver comanda')).toBeNull();
    expect(screen.queryByText(/adicionar à comanda/)).toBeNull();
    expect(screen.queryByText(/Monte seu pedido/)).toBeNull();
    expect(mockGetCustomizations).not.toHaveBeenCalled();
  });

  it('não oferece o combo builder, nem na aba de combos', async () => {
    const screen = setup('quick_service', quickService(), true);

    fireEvent.press(await screen.findByText('Combos'));

    expect(await screen.findByText('Risoto de Funghi')).toBeTruthy();
    expect(screen.queryByText('Monte seu Combo')).toBeNull();
  });

  it.each([
    ['fine_dining', fineDining],
    ['casual_dining', casualDining],
    ['quick_service', quickService],
  ] as const)('%s: o toque abre o detalhe sem adicionar nem quantidade', async (serviceModel, build) => {
    const screen = setup(serviceModel, build(), true);

    await screen.findByText('Combos');
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.press(await screen.findByText('Risoto de Funghi'));

    expect(await screen.findByLabelText('Fechar')).toBeTruthy();
    expect(screen.getAllByText(PRICE).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/^Adicionar/)).toBeNull();
    expect(screen.queryByLabelText('Aumentar quantidade')).toBeNull();
    expect(screen.queryByLabelText('Diminuir quantidade')).toBeNull();
    expect(screen.queryByText(/^Escolha:/)).toBeNull();
    expect(screen.queryByText('Ponto')).toBeNull();
  });
});

describe('MenuScreen — fora do modo expositivo o pedido continua igual', () => {
  it('sem browse, "Adicionar" e o botão de comanda aparecem', async () => {
    const screen = setup('quick_service', quickService());

    expect(await screen.findByText('Adicionar')).toBeTruthy();
    expect(screen.getByLabelText('Ver comanda')).toBeTruthy();
    expect(await screen.findByText(/Monte seu pedido/)).toBeTruthy();
  });

  it('sem browse, a mesa mantém "Chamar Garçom" e o aviso de adicionar à comanda', async () => {
    const screen = setup('fine_dining', fineDining());

    expect(await screen.findByText('Chamar Garçom')).toBeTruthy();
    expect(screen.getByText(/adicionar à comanda/)).toBeTruthy();
    expect(screen.getByLabelText('Ver comanda')).toBeTruthy();
  });
});
