import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SplitBillScreen from '../screens/production/SplitBillScreen';
import SharePaymentScreen from '../screens/production/SharePaymentScreen';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../hooks/useServiceTypeFeatures', () => ({
  useServiceTypeFor: () => ({ capabilities: { splitModes: ['by_owner', 'equal', 'by_item', 'fixed_amount'] } }),
}));
const mockComplete = jest.fn().mockResolvedValue(undefined);
jest.mock('../contexts/VisitSessionContext', () => ({
  useVisitSession: () => ({ session: { restaurantId: 'r1', tableSessionId: 's1' }, completeCheckout: mockComplete }),
}));
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  getTableBill: async () => ({
    tableSessionId: 's1', items: [{ orderItemId: 'i1', name: 'Pizza', quantity: 1, totalPrice: 40, dinerName: 'Ana' }],
    participants: [{ dinerId: 'p-me', displayName: 'Ana', isMe: true }, { dinerId: 'p-bia', displayName: 'Bia', isMe: false }],
  }),
} }));
const mockPreview = jest.fn();
const mockCommit = jest.fn();
const mockList = jest.fn();
const mockPay = jest.fn();
const mockTips = jest.fn();
jest.mock('../services/bill-shares', () => ({
  SPLIT_ERRORS: { P0012: 'A conta mudou. Confira os valores atualizados.' },
  billShares: {
    preview: (...a: unknown[]) => mockPreview(...a), commit: (...a: unknown[]) => mockCommit(...a),
    list: (...a: unknown[]) => mockList(...a), listClaims: async () => [], claimItem: jest.fn(),
    tipOptions: (...a: unknown[]) => mockTips(...a), pay: (...a: unknown[]) => mockPay(...a), abandon: jest.fn(),
    subscribe: () => ({ unsubscribe: jest.fn() }),
  },
}));
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);

const plan = {
  mode: 'equal', totalRemCents: 9715, unassignedCents: 0, version: 'v1',
  shares: [
    { participantId: 'p-me', mode: 'equal', baseCents: 4416, feeCents: 442, amountCents: 4858 },
    { participantId: 'p-bia', mode: 'equal', baseCents: 4416, feeCents: 441, amountCents: 4857 },
  ],
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const normalize = (text: string) => text.replace(/ /g, ' ');

beforeEach(() => jest.clearAllMocks());

test('dividir: mostra as parcelas calculadas pelo servidor e confirma com a versão vista', async () => {
  mockPreview.mockResolvedValue(plan);
  mockCommit.mockResolvedValue(['sh1', 'sh2']);
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const screen = renderWithClient(<SplitBillScreen route={{ params: { tableSessionId: 's1', restaurantName: 'Casa' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByText('Partes Iguais'));
  await waitFor(() => expect(screen.getAllByText(/R\$\s48,58/).length).toBeGreaterThan(0));
  expect(screen.getByText(/R\$\s48,57/)).toBeTruthy();
  fireEvent.press(screen.getByText('Confirmar e ir para o pagamento'));
  await waitFor(() => expect(mockCommit).toHaveBeenCalledWith(expect.objectContaining({ tableSessionId: 's1', mode: 'equal', version: 'v1' })));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('SharePayment', { tableSessionId: 's1', restaurantName: 'Casa' }));
});

test('dividir: conta que mudou (P0012) não navega e pede novo cálculo', async () => {
  mockPreview.mockResolvedValue(plan);
  mockCommit.mockRejectedValue(Object.assign(new Error('x'), { code: 'P0012' }));
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const screen = renderWithClient(<SplitBillScreen route={{ params: { tableSessionId: 's1' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByText('Partes Iguais'));
  await screen.findByText('Como fica');
  fireEvent.press(screen.getByText('Confirmar e ir para o pagamento'));
  await waitFor(() => expect(mockPreview.mock.calls.length).toBeGreaterThan(1));
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('valor fixo: o campo é máscara de centavos e o app envia inteiros', async () => {
  mockPreview.mockResolvedValue({ ...plan, mode: 'fixed_amount', shares: [plan.shares[0]] });
  const screen = renderWithClient(<SplitBillScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  fireEvent.press(await screen.findByText('Valor Fixo'));
  fireEvent.changeText(await screen.findByLabelText('Valor a pagar'), '3000');
  await waitFor(() => expect(mockPreview).toHaveBeenCalledWith('s1', 'fixed_amount', { amountCents: 3000 }));
});

const myShare = { id: 'sh1', participantId: 'p-me', mode: 'equal', amountCents: 4858, tipCents: 0, status: 'open' };
const tips = [
  { percent: 0, cents: 0, totalCents: 4858 }, { percent: 10, cents: 486, totalCents: 5344 },
  { percent: 15, cents: 729, totalCents: 5587 }, { percent: 20, cents: 972, totalCents: 5830 },
];

test('pagamento: total e gorjeta vêm do servidor; PIX é criado em centavos com a gorjeta escolhida', async () => {
  mockList.mockResolvedValue([myShare, { ...myShare, id: 'sh2', participantId: 'p-bia', amountCents: 4857 }]);
  mockTips.mockResolvedValue(tips);
  mockPay.mockResolvedValue({ paymentId: 'pay1', status: 'pending', amountCents: 5344, expiresAt: null, checkoutUrl: null, pix: { payload: '000201-pix', expiresAt: null }, alreadyPaid: false });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1', restaurantName: 'Casa' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  await waitFor(() => expect(screen.getAllByText(/R\$\s53,44/).length).toBeGreaterThan(0));
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ shareId: 'sh1', method: 'pix', tipCents: 486, idempotencyKey: 'key-1' })));
  expect(await screen.findByText('Aguardando confirmação')).toBeTruthy();
  expect(screen.getByText('000201-pix')).toBeTruthy();
});

test('pagamento: pagamento só vale quando o servidor marca a parcela como paga', async () => {
  mockList.mockResolvedValue([{ ...myShare, status: 'paid' }]);
  mockTips.mockResolvedValue(tips);
  const reset = jest.fn();
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset }} />);
  expect(await screen.findByText('Pagamento confirmado')).toBeTruthy();
  fireEvent.press(screen.getByText('Concluir'));
  await waitFor(() => expect(mockComplete).toHaveBeenCalledWith('s1'));
  expect(reset).toHaveBeenCalled();
});

test('pagamento: CPF exigido na primeira cobrança é pedido e reenviado', async () => {
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue(tips);
  mockPay.mockRejectedValueOnce(Object.assign(new Error('cpf'), { code: 'payer_document_required' }))
    .mockResolvedValueOnce({ paymentId: 'pay1', status: 'pending', amountCents: 5344, expiresAt: null, checkoutUrl: null, pix: { payload: 'pix', expiresAt: null }, alreadyPaid: false });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  await waitFor(() => expect(screen.getAllByText(/R\$\s53,44/).length).toBeGreaterThan(0));
  fireEvent.press(screen.getByText('Gerar PIX'));
  fireEvent.changeText(await screen.findByLabelText('CPF do pagador'), '12345678909');
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(mockPay).toHaveBeenLastCalledWith(expect.objectContaining({ payerCpfCnpj: '12345678909' })));
});
