import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrderDetailScreen from '../screens/production/OrderDetailScreen';
import { tableLabel } from '../screens/production/shared';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-linear-gradient',() => ({ LinearGradient: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('@okinawa/shared/components/orders/OrderStatusStepper', () => ({
  __esModule: true,
  default: ({ steps, currentStep }: { steps: { label: string }[]; currentStep: number }) => {
    const { Text } = require('react-native');
    return <Text testID="stepper">{`${steps.map((step) => step.label).join('|')}@${currentStep}`}</Text>;
  },
}));
let mockCapabilities: Record<string, unknown> = { orderTracking: 'kitchen_steps', pickupCode: false };
jest.mock('../hooks/useServiceTypeFeatures', () => ({
  useServiceTypeFor: () => ({
    capabilities: mockCapabilities,
    policies: { pickupExpiryMin: 30, noPickupPolicy: 'none' },
  }),
}));
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({
  session: { restaurantId: 'r1', tableSessionId: 's1', tableId: 't1', tableNumber: '3' },
}) }));

let resolveOrder: (order: unknown) => void = () => undefined;
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  getOrder: () => new Promise((resolve) => { resolveOrder = resolve; }),
  subscribeToOrderChanges: () => new Promise(() => undefined),
  listOrderStatusEvents: () => Promise.resolve([]),
  startPayment: jest.fn(),
  cancelOrder: jest.fn(),
} }));

function navigation() { return { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() }; }

test('renders after loading without changing the hook order', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <OrderDetailScreen navigation={navigation()} route={{ params: { orderId: 'o1' } }} />
    </QueryClientProvider>,
  );
  resolveOrder({
    id: 'o1', orderNumber: '#0001', restaurantId: 'r1', restaurantName: 'Casa', tableId: 't1',
    // RLS hides `tables` from customers, so the embedded name comes back null.
    tableNumber: null, tableSessionId: 's1', partySize: 1, status: 'pending', subtotal: 35, total: 35,
    estimatedTime: null, createdAt: '', updatedAt: '', rating: null, items: [],
  });
  // The active visit supplies the table name the order query couldn't read.
  await waitFor(() => expect(view.getByText('Mesa 3 · Casa')).toBeTruthy());
  expect(view.getByText('Fechar Conta')).toBeTruthy();
  client.clear();
});

test.each([
  ['12', 'Mesa 12'],
  ['S04', 'Mesa S04'],
  ['Mesa 3', 'Mesa 3'],
  ['mesa 7', 'mesa 7'],
  ['Varanda 1', 'Mesa Varanda 1'],
  [null, 'Mesa'],
])('tableLabel(%p) → %p', (input, expected) => {
  expect(tableLabel(input)).toBe(expected);
});

describe('OrderDetail — acompanhamento do Quick Service (ADR-013)', () => {
  const quickOrder = (overrides: Record<string, unknown>) => ({
    id: 'q1', orderNumber: 'K7M2PQ', restaurantId: 'r1', restaurantName: 'Burger', serviceModel: 'quick_service',
    tableId: null, tableNumber: null, tableSessionId: null, partySize: 1, status: 'confirmed',
    paymentStatus: 'confirmed', fulfillmentStatus: 'accepted', pickupCode: 'K7M2PQ', pickupExpiresAt: null,
    callName: 'Ana', consumptionMode: 'takeaway', subtotal: 40, total: 40, estimatedTime: 12,
    createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:01:00Z', rating: null, items: [], ...overrides,
  });

  const renderQuick = async (order: Record<string, unknown>) => {
    mockCapabilities = { orderTracking: 'pickup_steps', pickupCode: true, staffCalls: false };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const nav = navigation();
    const view = render(
      <QueryClientProvider client={client}>
        <OrderDetailScreen navigation={nav} route={{ params: { orderId: 'q1' } }} />
      </QueryClientProvider>,
    );
    resolveOrder(order);
    await waitFor(() => expect(view.getByTestId('stepper')).toBeTruthy());
    return { view, nav, client };
  };

  afterEach(() => { mockCapabilities = { orderTracking: 'kitchen_steps', pickupCode: false }; });

  it('mostra as cinco etapas do cliente e destaca a etapa "Aceito"', async () => {
    const { view, client } = await renderQuick(quickOrder({ fulfillmentStatus: 'accepted' }));
    expect(view.getByTestId('stepper').props.children).toBe('Pago|Aceito|Em preparo|Pronto|Retirado@1');
    client.clear();
  });

  it('a conferência do KDS aparece como "Em preparo"', async () => {
    const { view, client } = await renderQuick(quickOrder({ fulfillmentStatus: 'checking', status: 'preparing' }));
    expect(view.getByTestId('stepper').props.children).toMatch(/@2$/);
    client.clear();
  });

  it('antes do pagamento mostra "Aguardando pagamento" e oferece retomar o Pix', async () => {
    const { view, client } = await renderQuick(quickOrder({ paymentStatus: 'pending', fulfillmentStatus: 'received', status: 'pending' }));
    expect(view.getByText('Aguardando pagamento')).toBeTruthy();
    expect(view.getByLabelText('Retomar pagamento')).toBeTruthy();
    client.clear();
  });

  it('só oferece cancelar até o início do preparo', async () => {
    const early = await renderQuick(quickOrder({ fulfillmentStatus: 'accepted' }));
    expect(early.view.getByText('Cancelar Pedido')).toBeTruthy();
    early.view.unmount();
    early.client.clear();

    const started = await renderQuick(quickOrder({ fulfillmentStatus: 'preparing', status: 'preparing' }));
    expect(started.view.queryByText('Cancelar Pedido')).toBeNull();
    started.client.clear();
  });

  it('pedido não retirado explica a política em vez de mostrar o código', async () => {
    const { view, client } = await renderQuick(quickOrder({ fulfillmentStatus: 'not_picked_up', status: 'completed' }));
    expect(view.getByText('Pedido não retirado')).toBeTruthy();
    expect(view.getByText(/não há reembolso/)).toBeTruthy();
    expect(view.queryByText('Código de retirada')).toBeNull();
    client.clear();
  });

  it('pedido estornado mostra o estorno integral', async () => {
    const { view, client } = await renderQuick(quickOrder({ fulfillmentStatus: 'cancelled', paymentStatus: 'refunded', status: 'cancelled' }));
    expect(view.getByText('Pedido cancelado e estornado')).toBeTruthy();
    expect(view.getByText('O valor do pedido foi estornado integralmente.')).toBeTruthy();
    client.clear();
  });

  it('o Quick não oferece "chamar equipe": a capability staffCalls está desligada', async () => {
    const { view, client } = await renderQuick(quickOrder({ fulfillmentStatus: 'preparing', status: 'preparing' }));
    expect(view.queryByText('Precisa de ajuda?')).toBeNull();
    client.clear();
  });

  it('mostra o nome para chamada e o modo de consumo', async () => {
    const { view, client } = await renderQuick(quickOrder({ fulfillmentStatus: 'accepted' }));
    expect(view.getByText('Chamaremos: Ana · Para levar')).toBeTruthy();
    client.clear();
  });
});
