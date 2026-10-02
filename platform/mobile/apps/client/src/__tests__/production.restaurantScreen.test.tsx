import React from 'react';
import { Dimensions } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@okinawa/shared/contexts/ThemeContext';
import type { RestaurantCapabilityContract, ServiceModel } from '@okinawa/shared/config/capabilities';
import { VisitSessionProvider } from '../contexts/VisitSessionContext';
import { ServiceTypeProvider } from '../contexts/ServiceTypeContext';
import { amenityChipLimitForWidth, restaurantAmenityChips } from '../screens/production/casual-dining-ui';
import RestaurantScreen from '../screens/production/RestaurantScreen';
import { journeyButtonWidth } from '../screens/production/RestaurantDetailView';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../components/cart/FloatingCartBar', () => ({ FloatingCartBar: () => null }));

const mockGetRestaurant = jest.fn();
const mockGetCapabilities = jest.fn();
const mockGetLiveStatus = jest.fn();
const mockListFavorites = jest.fn();

jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: {
    getRestaurant: (...args: unknown[]) => mockGetRestaurant(...args),
    getRestaurantCapabilities: (...args: unknown[]) => mockGetCapabilities(...args),
    getRestaurantLiveStatus: (...args: unknown[]) => mockGetLiveStatus(...args),
    listFavorites: (...args: unknown[]) => mockListFavorites(...args),
    setFavorite: jest.fn(),
  },
}));

/** Nine amenities — more than any device shows inline, so the "…" chip appears. */
const AMENITIES = [
  'kids_friendly',
  'table_service',
  'optional_reservation',
  'high_chair',
  'pet_friendly',
  'outdoor_seating',
  'parking',
  'accessible',
  'wifi',
];

const AMENITY_LABELS = [
  'Kids Friendly',
  'Garçom na mesa',
  'Reserva opcional',
  'Cadeirão',
  'Pet Friendly',
  'Área ao ar livre',
  'Estacionamento',
  'Acessível',
  'Wi-Fi',
];

function buildRestaurant(serviceType: ServiceModel) {
  return {
    id: 'r1',
    name: 'Restaurante Teste',
    description: 'Cozinha contemporânea',
    address: 'Rua A, 100',
    city: 'São Paulo',
    state: 'SP',
    cuisineTypes: ['Contemporânea'],
    logoUrl: null,
    bannerUrl: null,
    photos: [],
    openingHours: {},
    rating: 4.6,
    totalReviews: 120,
    averagePriceCents: 5000,
    lat: null,
    lng: null,
    serviceConfig: { amenities: AMENITIES },
    customerExperience: null,
    serviceType,
  };
}

function buildContract(
  serviceModel: ServiceModel,
  capabilityOverrides: Partial<RestaurantCapabilityContract['capabilities']> = {},
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
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const route = { params: { restaurantId: 'r1' } };
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultMode="light">
          <VisitSessionProvider>
            <ServiceTypeProvider>
              <RestaurantScreen navigation={navigation} route={route} />
            </ServiceTypeProvider>
          </VisitSessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, navigation };
}

const SERVICE_MODELS: ServiceModel[] = ['fine_dining', 'casual_dining', 'quick_service'];

beforeEach(() => {
  mockGetLiveStatus.mockResolvedValue(null);
  mockListFavorites.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

describe('RestaurantScreen — one page for every service model', () => {
  it('shows a recoverable error and keeps the back action when capabilities fail', async () => {
    mockGetRestaurant.mockResolvedValue(buildRestaurant('casual_dining'));
    mockGetCapabilities.mockRejectedValue(new Error('rpc unavailable'));

    const { findByText, getByLabelText, navigation } = renderScreen();

    expect(await findByText('Não foi possível carregar os dados.')).toBeTruthy();
    expect(await findByText('Tentar novamente')).toBeTruthy();

    fireEvent.press(getByLabelText('Voltar'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it.each(SERVICE_MODELS)('renders the same page layout for %s', async (serviceModel) => {
    mockGetRestaurant.mockResolvedValue(buildRestaurant(serviceModel));
    mockGetCapabilities.mockResolvedValue(buildContract(serviceModel));

    const { findByText, queryByText } = renderScreen();

    // The shared page: identity block + Cardápio/Fotos/Avaliações/Como ir.
    expect(await findByText('Cardápio')).toBeTruthy();
    expect(queryByText('Avaliações')).toBeTruthy();
    expect(queryByText('Como ir')).toBeTruthy();

    // Preço médio cadastrado pelo restaurante, não "por pessoa".
    expect(queryByText('Preço médio R$\u00A050,00')).toBeTruthy();
    expect(queryByText(/pessoa/)).toBeNull();

    // The casual-dining-only CTAs and hint are gone.
    expect(queryByText('Entrar no Restaurante')).toBeNull();
    expect(queryByText('Reservar mesa')).toBeNull();
    expect(queryByText('Walk-in com fila inteligente ou reserve antecipado')).toBeNull();
  });

  it('não mostra preço quando o restaurante não cadastrou o preço médio', async () => {
    mockGetRestaurant.mockResolvedValue({ ...buildRestaurant('casual_dining'), averagePriceCents: null });
    mockGetCapabilities.mockResolvedValue(buildContract('casual_dining'));

    const { findByText, queryByText } = renderScreen();

    expect(await findByText('Cardápio')).toBeTruthy();
    expect(queryByText(/Preço médio/)).toBeNull();
  });

  it.each(SERVICE_MODELS)('shows the three journey actions for %s', async (serviceModel) => {
    mockGetRestaurant.mockResolvedValue(buildRestaurant(serviceModel));
    mockGetCapabilities.mockResolvedValue(buildContract(serviceModel));

    const { findByText, queryByText } = renderScreen();

    expect(await findByText('Escanear QR')).toBeTruthy();
    expect(queryByText('Reservar')).toBeTruthy();
    expect(queryByText('Fila Virtual')).toBeTruthy();
  });

  it.each(SERVICE_MODELS)('never offers "Chamar Garçom" on the %s page', async (serviceModel) => {
    mockGetRestaurant.mockResolvedValue(buildRestaurant(serviceModel));
    // staffCalls ligado: a ausência é decisão da tela, não falta de capability.
    mockGetCapabilities.mockResolvedValue(buildContract(serviceModel, { staffCalls: true }));

    const { findByText, queryByText } = renderScreen();

    await findByText('Escanear QR');
    expect(queryByText('Chamar Garçom')).toBeNull();
  });

  it('hides a journey action the restaurant capabilities disable', async () => {
    mockGetRestaurant.mockResolvedValue(buildRestaurant('quick_service'));
    mockGetCapabilities.mockResolvedValue(
      buildContract('quick_service', { tableSession: false, staffCalls: false }),
    );

    const { findByText, queryByText } = renderScreen();

    expect(await findByText('Fila Virtual')).toBeTruthy();
    expect(queryByText('Reservar')).toBeTruthy();
    expect(queryByText('Escanear QR')).toBeNull();
  });
});

describe('RestaurantScreen — amenity chips are capped and responsive', () => {
  it('shows at most the width limit inline and hides the rest behind the "…" chip', async () => {
    mockGetRestaurant.mockResolvedValue(buildRestaurant('casual_dining'));
    mockGetCapabilities.mockResolvedValue(buildContract('casual_dining'));

    const limit = amenityChipLimitForWidth(Dimensions.get('window').width);
    expect(limit).toBeLessThanOrEqual(6);

    const { findByText, queryByText } = renderScreen();

    await findByText(AMENITY_LABELS[0]);
    for (const label of AMENITY_LABELS.slice(0, limit)) {
      expect(queryByText(label)).toBeTruthy();
    }
    for (const label of AMENITY_LABELS.slice(limit)) {
      expect(queryByText(label)).toBeNull();
    }
    expect(queryByText(`+${AMENITY_LABELS.length - limit}`)).toBeTruthy();
  });

  it('opens a sheet with every amenity when the "…" chip is pressed', async () => {
    mockGetRestaurant.mockResolvedValue(buildRestaurant('fine_dining'));
    mockGetCapabilities.mockResolvedValue(buildContract('fine_dining'));

    const limit = amenityChipLimitForWidth(Dimensions.get('window').width);
    const { findByText, getByLabelText, getAllByText, queryByText } = renderScreen();

    await findByText(AMENITY_LABELS[0]);
    fireEvent.press(getByLabelText(`Ver todas as ${AMENITY_LABELS.length} características do restaurante`));

    await waitFor(() => expect(queryByText('O que este restaurante oferece')).toBeTruthy());
    for (const label of AMENITY_LABELS.slice(limit)) {
      expect(queryByText(label)).toBeTruthy();
    }
    // The first chips now appear twice: inline and inside the sheet.
    expect(getAllByText(AMENITY_LABELS[0]).length).toBe(2);
  });

  it('caps at six chips and only narrows below a phone width', () => {
    for (const width of [320, 360, 390, 430, 768, 1024]) {
      expect(amenityChipLimitForWidth(width)).toBeLessThanOrEqual(6);
      expect(amenityChipLimitForWidth(width)).toBeGreaterThanOrEqual(4);
    }
    // A regular phone gets the full six; only very narrow devices show fewer.
    expect(amenityChipLimitForWidth(390)).toBe(6);
    expect(amenityChipLimitForWidth(320)).toBeLessThan(amenityChipLimitForWidth(390));
  });
});

describe('restaurantAmenityChips — every tag vocabulary reads the same way', () => {
  it('labels fine dining ambiance tags instead of showing the raw key', () => {
    const restaurant = {
      ...buildRestaurant('fine_dining'),
      serviceConfig: { amenities: ['bar', 'cafe'] },
    } as any;

    expect(restaurantAmenityChips(restaurant).map((chip) => chip.label)).toEqual(['Bar', 'Café']);
  });

  it('falls back to cuisine tags when a restaurant has no amenities', () => {
    const restaurant = {
      ...buildRestaurant('quick_service'),
      serviceConfig: {},
      cuisineTypes: ['burgers', 'acai'],
    } as any;

    expect(restaurantAmenityChips(restaurant).map((chip) => chip.label)).toEqual(['Burgers', 'Açaí']);
  });

  it('keeps unknown tags as free text', () => {
    const restaurant = {
      ...buildRestaurant('fine_dining'),
      serviceConfig: { amenities: ['Vista panorâmica'] },
    } as any;

    expect(restaurantAmenityChips(restaurant).map((chip) => chip.label)).toEqual(['Vista panorâmica']);
  });
});

describe('RestaurantScreen — pop-up de horários', () => {
  const liveStatus = {
    restaurantId: 'r1', isOpen: false, opensAt: '19:00', closesAt: null, groupsWaiting: 0,
    estimatedWaitMinutes: 0, occupancyLevel: 'low', occupancyRatio: 0, occupancyPercent: 0,
    tablesTotal: 4, tablesOccupied: 0,
  };
  const everyDay = (day: unknown) => Object.fromEntries(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((key) => [key, day]),
  );

  it('abre ao tocar no status, com os turnos cadastrados e dias fechados', async () => {
    mockGetRestaurant.mockResolvedValue({
      ...buildRestaurant('casual_dining'),
      openingHours: {
        ...everyDay({ closed: false, shifts: [{ open: '11:00', close: '14:00' }, { open: '19:00', close: '23:00' }] }),
        sunday: { closed: true, shifts: [] },
      },
    });
    mockGetCapabilities.mockResolvedValue(buildContract('casual_dining'));
    mockGetLiveStatus.mockResolvedValue(liveStatus);

    const { findByText, getByLabelText, getAllByText, queryByText } = renderScreen();

    expect(await findByText('Fechado · abre às 19:00')).toBeTruthy();
    expect(queryByText('Horários de funcionamento')).toBeNull();

    fireEvent.press(getByLabelText('Ver horários de funcionamento'));

    expect(await findByText('Horários de funcionamento')).toBeTruthy();
    expect(getAllByText('11:00–14:00 · 19:00–23:00').length).toBe(6);
    expect(getAllByText('Fechado').length).toBe(1);
    expect(queryByText('Horário não informado pelo restaurante.')).toBeNull();
  });

  it('avisa quando o restaurante não cadastrou horário', async () => {
    mockGetRestaurant.mockResolvedValue({ ...buildRestaurant('casual_dining'), openingHours: {} });
    mockGetCapabilities.mockResolvedValue(buildContract('casual_dining'));
    mockGetLiveStatus.mockResolvedValue({ ...liveStatus, opensAt: null });

    const { findByText, findByLabelText } = renderScreen();

    fireEvent.press(await findByLabelText('Ver horários de funcionamento'));
    expect(await findByText('Horário não informado pelo restaurante.')).toBeTruthy();
  });
});

describe('RestaurantDetailView — journey buttons stay on one row', () => {
  // 375 SE/mini · 390/393 iPhone 12–15 · 402 17 Pro · 428 13 Pro Max · 430/440 Pro Max.
  it.each([375, 390, 393, 402, 414, 428, 430, 440])('three buttons fit a %ipt wide screen', (width) => {
    const itemWidth = journeyButtonWidth(width, 3);
    const available = width - 16 * 2;
    expect(Number.isInteger(itemWidth)).toBe(true);
    expect(itemWidth * 3 + 10 * 2).toBeLessThanOrEqual(available);
  });
});
