import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrderDetailScreen from '../screens/production/OrderDetailScreen';
import { tableLabel } from '../screens/production/shared';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-linear-gradient',() => ({ LinearGradient: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('@okinawa/shared/components/orders/OrderStatusStepper', () => ({ __esModule: true, default: () => null }));
jest.mock('../hooks/useServiceTypeFeatures', () => ({
  useServiceTypeFor: () => ({ capabilities: { orderTracking: 'kitchen_steps', pickupCode: false } }),
}));
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({
  session: { restaurantId: 'r1', tableSessionId: 's1', tableId: 't1', tableNumber: '3' },
}) }));

let resolveOrder: (order: unknown) => void = () => undefined;
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  getOrder: () => new Promise((resolve) => { resolveOrder = resolve; }),
  subscribeToOrderChanges: () => new Promise(() => undefined),
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
