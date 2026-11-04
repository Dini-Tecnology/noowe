import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import QuickServiceCheckoutScreen from '../screens/production/QuickServiceCheckoutScreen';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }) }));
jest.mock('expo-crypto', () => { let n = 0; return { randomUUID: () => `key-${++n}` }; });
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockPolicies = jest.fn().mockReturnValue(null);
jest.mock('../hooks/useServiceTypeFeatures', () => ({ useServiceTypeFor: () => ({ policies: mockPolicies() }) }));
const mockTipQuote = jest.fn();
jest.mock('../services/bill-shares', () => ({ billShares: { tipQuote: (...a: unknown[]) => mockTipQuote(...a) } }));
jest.mock('../hooks/useDistanceToRestaurant', () => ({ useDistanceToRestaurant: () => null }));
const mockClearCart = jest.fn();
jest.mock('@/shared/contexts/CartContext', () => ({ useCart: () => ({
  restaurantId: 'r1', restaurantName: 'Burger', total: 30, itemCount: 1, clearCart: mockClearCart,
  items: [{ id: 'c1', menuItemId: 'm1', quantity: 1, price: 30, name: 'Lanche' }],
}) }));
const mockMode = jest.fn();
const mockPlace = jest.fn();
const mockStart = jest.fn();
const mockGetOrder = jest.fn();
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  getRestaurant: async () => ({ name: 'Burger' }),
  getOrderPaymentMode: (...a: unknown[]) => mockMode(...a),
  placeOrder: (...a: unknown[]) => mockPlace(...a),
  startPayment: (...a: unknown[]) => mockStart(...a),
  refreshQuickService: async () => undefined,
  getOrder: (...a: unknown[]) => mockGetOrder(...a),
  confirmSimulatedPix: jest.fn(),
} }));
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);

const charge = { transactionId: 'tx1', orderId: 'o1', paymentStatus: 'pending', idempotentReplay: false, simulated: false, fulfillmentStatus: null, pixCode: null, paymentExpiresAt: null, checkoutUrl: null };

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const nav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
  const view = render(<QueryClientProvider client={client}><QuickServiceCheckoutScreen navigation={nav} route={{ params: { callName: 'Ana' } }} /></QueryClientProvider>);
  return { view, nav, client };
}
async function acceptAndPay(view: ReturnType<typeof render>) {
  await waitFor(() => expect(mockMode).toHaveBeenCalled());
  fireEvent.press(view.getByLabelText('Li e aceito a política de retirada'));
  fireEvent.press(view.getByLabelText('Confirmar pagamento'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMode.mockResolvedValue('asaas');
  mockPlace.mockResolvedValue({ id: 'o1' });
  mockGetOrder.mockResolvedValue({ id: 'o1', paymentStatus: 'pending', fulfillmentStatus: 'pending' });
});

test('oferece só o que o provedor cobra de verdade', async () => {
  const { view, client } = renderScreen();
  await waitFor(() => expect(mockMode).toHaveBeenCalledWith('r1'));
  expect(view.getByText('PIX')).toBeTruthy();
  expect(view.getByText('Crédito')).toBeTruthy();
  for (const label of ['Apple Pay', 'Google Pay', 'TAP to Pay', 'Carteira']) expect(view.queryByText(label)).toBeNull();
  client.clear();
});

test('PIX real: mostra o código do provedor e só conclui quando o servidor confirmar', async () => {
  mockStart.mockResolvedValue({ ...charge, pixCode: '00020126-pix-real' });
  const { view, nav, client } = renderScreen();
  await acceptAndPay(view);
  await waitFor(() => expect(view.getByText('00020126-pix-real')).toBeTruthy());
  expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'o1', restaurantId: 'r1', paymentMethod: 'pix' }));
  expect(view.queryByLabelText('Simular pagamento')).toBeNull();
  expect(mockClearCart).not.toHaveBeenCalled();
  expect(nav.replace).not.toHaveBeenCalled();
  mockGetOrder.mockResolvedValue({ id: 'o1', paymentStatus: 'confirmed', fulfillmentStatus: 'pending' });
  fireEvent.press(view.getByLabelText('Já paguei'));
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' }));
  client.clear();
});

test('cartão: abre a página do Asaas e fica aguardando; voltar do navegador não confirma nada', async () => {
  mockStart.mockResolvedValue({ ...charge, checkoutUrl: 'https://asaas.test/i/1' });
  const { view, nav, client } = renderScreen();
  await waitFor(() => expect(view.getByText('Crédito')).toBeTruthy());
  fireEvent.press(view.getByText('Crédito'));
  await acceptAndPay(view);
  await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://asaas.test/i/1'));
  expect(view.getByText('Aguardando confirmação')).toBeTruthy();
  expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'credit_card' }));
  expect(nav.replace).not.toHaveBeenCalled();
  client.clear();
});

test('CPF exigido na primeira cobrança é pedido e reenviado com a mesma chave', async () => {
  mockStart.mockRejectedValueOnce(Object.assign(new Error('Informe seu CPF'), { code: 'payer_document_required' }));
  mockStart.mockResolvedValueOnce({ ...charge, pixCode: 'pix-2' });
  const { view, client } = renderScreen();
  await acceptAndPay(view);
  await waitFor(() => expect(view.getByLabelText('CPF do pagador')).toBeTruthy());
  fireEvent.changeText(view.getByLabelText('CPF do pagador'), '123.456.789-09');
  fireEvent.press(view.getByLabelText('Confirmar pagamento'));
  await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2));
  expect(mockStart.mock.calls[1][0]).toEqual(expect.objectContaining({ payerCpfCnpj: '12345678909', idempotencyKey: mockStart.mock.calls[0][0].idempotencyKey }));
  client.clear();
});

test('restaurante sem pagamento online avisa antes e não cria pedido', async () => {
  mockMode.mockResolvedValue('unavailable');
  const { view, client } = renderScreen();
  await waitFor(() => expect(view.getByText('Este restaurante ainda não aceita pagamento online.')).toBeTruthy());
  fireEvent.press(view.getByLabelText('Li e aceito a política de retirada'));
  fireEvent.press(view.getByLabelText('Confirmar pagamento'));
  expect(mockPlace).not.toHaveBeenCalled();
  client.clear();
});

test('gorjeta do Quick: opcional e sem nada marcado (G5, 7)', async () => {
  mockPolicies.mockReturnValue({ feeOrTipMode: 'tip', tipPresetsBps: [1000, 1500], tipDefaultBps: null });
  mockStart.mockResolvedValue({ ...charge, pixCode: 'pix' });
  const { view, client } = renderScreen();
  await waitFor(() => expect(view.getByText('Gorjeta (opcional)')).toBeTruthy());
  expect(view.getByText('10%')).toBeTruthy();
  await acceptAndPay(view);
  await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ tipBps: 0, tipCents: 0 })));
  expect(mockTipQuote).not.toHaveBeenCalled();
  mockPolicies.mockReturnValue(null);
  client.clear();
});

test('gorjeta do Quick: percentual escolhido vai ao servidor, que faz a conta', async () => {
  mockPolicies.mockReturnValue({ feeOrTipMode: 'tip', tipPresetsBps: [1000], tipDefaultBps: null });
  mockTipQuote.mockResolvedValue({ tipCents: 300, totalCents: 3300 });
  mockStart.mockResolvedValue({ ...charge, pixCode: 'pix' });
  const { view, client } = renderScreen();
  fireEvent.press(await view.findByText('10%'));
  await waitFor(() => expect(mockTipQuote).toHaveBeenCalledWith(3000, { tipBps: 1000, tipCents: 0 }));
  await waitFor(() => expect(view.getAllByText(/33,00/).length).toBeGreaterThan(0));
  await acceptAndPay(view);
  await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ tipBps: 1000, tipCents: 0 })));
  mockPolicies.mockReturnValue(null);
  client.clear();
});

test('restaurante em modo taxa não oferece gorjeta no Quick', async () => {
  mockPolicies.mockReturnValue({ feeOrTipMode: 'service_fee', tipPresetsBps: [1000], tipDefaultBps: null });
  const { view, client } = renderScreen();
  await waitFor(() => expect(mockMode).toHaveBeenCalled());
  expect(view.queryByText('Gorjeta (opcional)')).toBeNull();
  mockPolicies.mockReturnValue(null);
  client.clear();
});
