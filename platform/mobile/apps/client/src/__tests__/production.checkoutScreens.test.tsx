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
const mockPreview = jest.fn();
const mockCommit = jest.fn();
const mockShares = jest.fn();
const mockSummary = jest.fn().mockResolvedValue({ balanceCents: 0, paidCents: 0, feeOrTipMode: 'service_fee', leftWithoutPaying: [] });
jest.mock('../services/bill-shares', () => ({
  SPLIT_ERRORS: { P0012: 'A conta mudou. Confira os valores atualizados.' },
  billShares: {
    preview: (...a: unknown[]) => mockPreview(...a), commit: (...a: unknown[]) => mockCommit(...a),
    summary: (...a: unknown[]) => mockSummary(...a),
  },
}));
jest.mock('../hooks/useBillShares', () => ({ useBillShares: () => ({ shares: { data: mockShares() } }) }));
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
beforeEach(() => { mockCommit.mockClear(); });
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

const myPlan = { mode: 'by_owner', totalRemCents: 2200, unassignedCents: 0, version: 'v1', shares: [{ participantId: 'd1', mode: 'by_owner', baseCents: 2000, feeCents: 200, amountCents: 2200 }] };
const soloBill = { items: [{ orderItemId: 'i1', placedByIsMe: true, totalPrice: 20, quantity: 1, name: 'Prato' }], participants: [{ dinerId: 'd1', isMe: true, displayName: 'Eu', isHost: true }], subtotal: 20, serviceFeePercent: 10 };

test('closing a bill creates the share on the server and goes to the real payment, with server amounts', async () => {
  mockBill.mockResolvedValue(soloBill);
  mockPreview.mockResolvedValue(myPlan);
  mockCommit.mockResolvedValue(['sh1']);
  mockShares.mockReturnValue([]);
  const nav = navigation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><FecharContaScreen navigation={nav} route={{}} /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('Pagar e concluir minha conta')).toBeTruthy());
  expect(view.getAllByText(/22,00/).length).toBeGreaterThan(0);
  fireEvent.press(view.getByText('Pagar e concluir minha conta'));
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('SharePayment', expect.objectContaining({ tableSessionId: 's1' })));
  expect(mockCommit).toHaveBeenCalledWith({ tableSessionId: 's1', mode: 'by_owner', version: 'v1' });
  expect(nav.navigate).not.toHaveBeenCalledWith('TipPayment', expect.anything());
  client.clear();
});

test('an open share resumes the payment instead of splitting again', async () => {
  mockBill.mockResolvedValue(soloBill);
  mockPreview.mockResolvedValue(myPlan);
  mockShares.mockReturnValue([{ id: 'sh1', participantId: 'd1', status: 'pending_payment', amountCents: 2200, tipCents: 0, mode: 'by_owner' }]);
  const nav = navigation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><FecharContaScreen navigation={nav} route={{}} /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('Continuar pagamento')).toBeTruthy());
  fireEvent.press(view.getByText('Continuar pagamento'));
  expect(nav.navigate).toHaveBeenCalledWith('SharePayment', expect.objectContaining({ tableSessionId: 's1' }));
  expect(mockCommit).not.toHaveBeenCalled();
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
  mockShares.mockReturnValue([]);
  mockBill.mockResolvedValue({ items: [], participants: [{ dinerId: 'd1', isMe: true, displayName: 'Eu', isHost: true }], subtotal: 0, serviceFeePercent: 10 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><FecharContaScreen navigation={navigation()} route={{}} /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText(/Na mesa \(1\)/)).toBeTruthy());
  expect(view.queryByText('Dividir a conta')).toBeNull();
  client.clear();
});

test('o titular é avisado de quem saiu sem pagar ao abrir a comanda (G5, 9)', async () => {
  mockBill.mockResolvedValue(soloBill);
  mockPreview.mockResolvedValue(myPlan);
  mockShares.mockReturnValue([]);
  mockSummary.mockResolvedValue({ balanceCents: 2000, paidCents: 0, feeOrTipMode: 'service_fee', leftWithoutPaying: [{ participantId: 'd2', name: 'Bia' }] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><FecharContaScreen navigation={navigation()} route={{}} /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText(/Bia saiu sem pagar\. A parte ficou com você\./)).toBeTruthy());
  client.clear();
});

test('com saldo e sem parte marcada, a pessoa escolhe como pagar em vez de encerrar a visita', async () => {
  mockBill.mockResolvedValue(soloBill);
  mockPreview.mockRejectedValue(new Error('sem parte'));
  mockShares.mockReturnValue([]);
  mockSummary.mockResolvedValue({ balanceCents: 2000, paidCents: 500, feeOrTipMode: 'service_fee', leftWithoutPaying: [] });
  const nav = navigation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><FecharContaScreen navigation={nav} route={{}} /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('Escolher como pagar')).toBeTruthy());
  fireEvent.press(view.getByText('Escolher como pagar'));
  expect(nav.navigate).toHaveBeenCalledWith('SplitBill', expect.objectContaining({ tableSessionId: 's1' }));
  client.clear();
});

afterEach(() => mockSummary.mockResolvedValue({ balanceCents: 0, paidCents: 0, feeOrTipMode: 'service_fee', leftWithoutPaying: [] }));
