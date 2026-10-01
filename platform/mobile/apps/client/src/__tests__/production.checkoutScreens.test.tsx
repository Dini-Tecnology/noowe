import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PaymentSuccessScreen from '../screens/production/PaymentSuccessScreen';
import FecharContaScreen from '../screens/production/FecharContaScreen';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../utils/pending-payment-confirmation', () => ({
  clearPendingPaymentConfirmation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../hooks/useServiceTypeFeatures', () => ({
  useServiceTypeFor: () => ({ capabilities: null, features: {}, policies: null, status: 'loading' }),
}));
const mockBill = jest.fn();
const mockReviews = jest.fn().mockResolvedValue([]);
const mockLeave = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  getTableBill: () => mockBill(), getRestaurant: async () => ({ name: 'Restaurante' }),
  listMyReviews: () => mockReviews(),
} }));
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({
  session: { restaurantId: 'r1', tableSessionId: 's1', tableId: 't1', tableNumber: '1' }, leaveTable: mockLeave,
}) }));
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
function navigation() { return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() }; }

test('confirmation uses the charged server amount and offers another QR only after settlement', () => {
  const nav = navigation();
  const view = renderWithClient(<PaymentSuccessScreen navigation={nav} route={{ params: {
    paidAmount: 999, result: { charged: 24, simulated: true, sessionReleased: true },
  } }} />);
  expect(view.getByText('Pagamento simulado concluído!')).toBeTruthy();
  expect(view.getByText(/Sua conta foi encerrada/)).toBeTruthy();
  expect(view.queryByText(/999/)).toBeNull();
  fireEvent.press(view.getByText('Ler QR Code de outra mesa'));
  expect(nav.replace).toHaveBeenCalledWith('QrScanner');
});

test('partial payment confirmation offers the remaining bill and does not claim closure', () => {
  const nav = navigation();
  const view = renderWithClient(<PaymentSuccessScreen navigation={nav} route={{ params: {
    tableSessionId: 's1', result: { charged: 5, simulated: true, sessionReleased: false },
  } }} />);
  expect(view.queryByText('Ler QR Code de outra mesa')).toBeNull();
  expect(view.getByText(/Ainda há saldo/)).toBeTruthy();
  fireEvent.press(view.getByText('Ver saldo restante'));
  expect(nav.replace).toHaveBeenCalledWith('FecharConta', { tableSessionId: 's1' });
});

test('closing a bill leads to payment instead of only calling staff', async () => {
  mockBill.mockResolvedValue({ items: [{ orderItemId: 'i1', placedByIsMe: true, totalPrice: 20, quantity: 1, name: 'Prato' }], participants: [], subtotal: 20, serviceFeePercent: 10 });
  const nav = navigation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><FecharContaScreen navigation={nav} route={{}} /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('Pagar e concluir minha conta')).toBeTruthy());
  fireEvent.press(view.getByText('Pagar e concluir minha conta'));
  expect(nav.navigate).toHaveBeenCalledWith('TipPayment', expect.objectContaining({ tableSessionId: 's1', baseAmount: 20, splitMode: 'mine' }));
  client.clear();
});

test('review CTA is replaced once the order has already been reviewed', async () => {
  mockReviews.mockResolvedValueOnce([{ id: 'rv1', orderId: 'o1' }]);
  const view = renderWithClient(<PaymentSuccessScreen navigation={navigation()} route={{ params: {
    result: { charged: 10, simulated: true, sessionReleased: true, orderId: 'o1', restaurantId: 'r1' },
  } }} />);
  await waitFor(() => expect(view.getByText('Avaliação enviada. Obrigado!')).toBeTruthy());
  expect(view.queryByText('Avaliar experiência')).toBeNull();
});

test('split option is hidden when the table has a single person', async () => {
  mockBill.mockResolvedValue({ items: [], participants: [{ dinerId: 'd1', isMe: true, displayName: 'Eu', isHost: true }], subtotal: 0, serviceFeePercent: 10 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><FecharContaScreen navigation={navigation()} route={{}} /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText(/Na mesa \(1\)/)).toBeTruthy());
  expect(view.queryByText('Dividir a conta')).toBeNull();
  client.clear();
});
