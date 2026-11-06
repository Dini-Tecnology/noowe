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
const mockSavedCards = jest.fn();
const mockSummary = jest.fn();
const mockQuote = jest.fn();
const mockWaive = jest.fn();
const mockCoupon = jest.fn();
const mockLatestReceipt = jest.fn().mockResolvedValue(null);
const mockMyTaxDocument = jest.fn().mockResolvedValue(null);
jest.mock('../services/bill-shares', () => ({
  SPLIT_ERRORS: { P0012: 'A conta mudou. Confira os valores atualizados.' },
  billShares: {
    preview: (...a: unknown[]) => mockPreview(...a), commit: (...a: unknown[]) => mockCommit(...a),
    list: (...a: unknown[]) => mockList(...a), listClaims: async () => [], claimItem: jest.fn(),
    listSavedCards: (...a: unknown[]) => mockSavedCards(...a),
    latestReceiptId: (...a: unknown[]) => mockLatestReceipt(...a),
    summary: (...a: unknown[]) => mockSummary(...a),
    tipQuote: (...a: unknown[]) => mockQuote(...a),
    setFeeWaived: (...a: unknown[]) => mockWaive(...a),
    applyCoupon: (...a: unknown[]) => mockCoupon(...a), removeCoupon: jest.fn(),
    tipOptions: (...a: unknown[]) => mockTips(...a), pay: (...a: unknown[]) => mockPay(...a), abandon: jest.fn(),
    subscribe: () => ({ unsubscribe: jest.fn() }),
    myTaxDocument: (...a: unknown[]) => mockMyTaxDocument(...a),
  },
}));
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);

const baseSummary = {
  consumptionCents: 8832, paidCents: 0, pendingCents: 0, balanceCents: 8832, settled: false, feeOrTipMode: 'tip', feeBps: 0,
  tipPresetsBps: [1000, 1500, 2000], tipDefaultBps: 1000, leftWithoutPaying: [], itemsRemaining: [],
};

const plan = {
  mode: 'equal', balanceCents: 8832, totalRemCents: 9715, unassignedCents: 0, version: 'v1', adjusted: false, feeOrTipMode: 'service_fee', feeBps: 1000,
  shares: [
    { participantId: 'p-me', mode: 'equal', baseCents: 4416, feeCents: 442, amountCents: 4858, tipCents: 0, chargeCents: 4858, feeWaived: false },
    { participantId: 'p-bia', mode: 'equal', baseCents: 4416, feeCents: 441, amountCents: 4857, tipCents: 0, chargeCents: 4857, feeWaived: false },
  ],
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const normalize = (text: string) => text.replace(/ /g, ' ');

beforeEach(() => {
  jest.clearAllMocks();
  mockSummary.mockResolvedValue(baseSummary);
  mockQuote.mockImplementation(async (amountCents: number, tip: { tipCents: number }) => ({ tipCents: tip.tipCents, totalCents: amountCents + tip.tipCents }));
});

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

test('valor fixo: acima do saldo, avisa e mostra consumo e taxa antes de confirmar (G5, 4 e 11)', async () => {
  mockPreview.mockResolvedValue({
    ...plan, mode: 'fixed_amount', adjusted: true, balanceCents: 5000,
    shares: [{ participantId: 'p-me', mode: 'fixed_amount', baseCents: 5000, feeCents: 500, amountCents: 5500, tipCents: 0, chargeCents: 5500, feeWaived: false }],
  });
  const screen = renderWithClient(<SplitBillScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  fireEvent.press(await screen.findByText('Valor Fixo'));
  fireEvent.changeText(await screen.findByLabelText('Valor a pagar'), '999900');
  expect(await screen.findByText(/Restam só/)).toBeTruthy();
  expect(screen.getByText('Consumo')).toBeTruthy();
  expect(screen.getByText('Taxa de serviço (opcional)')).toBeTruthy();
});

test('valor fixo em modo gorjeta: percentual vai em bps e valor livre vai à parte (G5, 12)', async () => {
  mockPreview.mockResolvedValue({ ...plan, mode: 'fixed_amount', feeOrTipMode: 'tip', feeBps: 0, shares: [plan.shares[0]] });
  const screen = renderWithClient(<SplitBillScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  fireEvent.press(await screen.findByText('Valor Fixo'));
  fireEvent.changeText(await screen.findByLabelText('Valor a pagar'), '5000');
  fireEvent.press(await screen.findByText('10%'));
  await waitFor(() => expect(mockPreview).toHaveBeenCalledWith('s1', 'fixed_amount', { amountCents: 5000, tipBps: 1000 }));
  fireEvent.changeText(screen.getByLabelText('Gorjeta em valor'), '300');
  await waitFor(() => expect(mockPreview).toHaveBeenCalledWith('s1', 'fixed_amount', { amountCents: 5000, tipCents: 300 }));
});

test('valor fixo com gorjeta: "Como fica" mostra o total que sai do cartão (G5, 11 e 12)', async () => {
  mockPreview.mockResolvedValue({
    ...plan, mode: 'fixed_amount', feeOrTipMode: 'tip', feeBps: 0,
    shares: [{ participantId: 'p-me', mode: 'fixed_amount', baseCents: 4545, feeCents: 0, amountCents: 4545, tipCents: 455, chargeCents: 5000, feeWaived: false }],
  });
  const screen = renderWithClient(<SplitBillScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  fireEvent.press(await screen.findByText('Valor Fixo'));
  fireEvent.changeText(await screen.findByLabelText('Valor a pagar'), '5000');
  await waitFor(() => expect(screen.getAllByText(/R\$\s50,00/).length).toBeGreaterThan(0));
  expect(screen.getByText(/R\$\s45,45/)).toBeTruthy();
  expect(screen.getByText(/R\$\s4,55/)).toBeTruthy();
});

test('partes iguais: ajustar o número de pessoas manda só esse número (G5)', async () => {
  mockPreview.mockResolvedValue(plan);
  const screen = renderWithClient(<SplitBillScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  fireEvent.press(await screen.findByText('Partes Iguais'));
  fireEvent.press(await screen.findByLabelText('Mais uma pessoa'));
  await waitFor(() => expect(mockPreview).toHaveBeenCalledWith('s1', 'equal', { people: 3 }));
  expect(screen.getByText(/Você paga a sua parte/)).toBeTruthy();
});

const myShare = { id: 'sh1', participantId: 'p-me', mode: 'equal', baseCents: 4416, feeCents: 442, amountCents: 4858, tipCents: 0, feeWaived: false, status: 'open' };

test('modo taxa: sem gorjeta; a taxa é opcional e retirar vai para o servidor (G5, 6)', async () => {
  mockSummary.mockResolvedValue({ ...baseSummary, feeOrTipMode: 'service_fee', feeBps: 1000 });
  mockList.mockResolvedValue([myShare]);
  mockPay.mockResolvedValue({ paymentId: 'pay1', status: 'pending', amountCents: 4858, expiresAt: null, checkoutUrl: null, pix: { payload: 'pix', expiresAt: null }, alreadyPaid: false });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  expect(await screen.findByText('Taxa de serviço (opcional)')).toBeTruthy();
  expect(screen.queryByText('Gorjeta (opcional)')).toBeNull();
  expect(mockTips).not.toHaveBeenCalled();
  fireEvent(screen.getByTestId('service-fee-switch'), 'valueChange', false);
  await waitFor(() => expect(mockWaive.mock.calls[0]).toEqual(['sh1', true]));
  await waitFor(() => expect(screen.getAllByText(/R\$\s48,58/).length).toBeGreaterThan(0));
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ tipCents: 0 })));
});

test('modo gorjeta: gorjeta em valor livre, com total vindo do servidor (G5, 12)', async () => {
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue([{ percent: 10, cents: 442, totalCents: 5300 }]);
  mockPay.mockResolvedValue({ paymentId: 'pay1', status: 'pending', amountCents: 5158, expiresAt: null, checkoutUrl: null, pix: { payload: 'pix', expiresAt: null }, alreadyPaid: false });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  fireEvent.changeText(await screen.findByLabelText('Gorjeta em valor'), '300');
  await waitFor(() => expect(mockQuote).toHaveBeenCalledWith(4858, { tipCents: 300 }));
  await waitFor(() => expect(screen.getAllByText(/R\$\s51,58/).length).toBeGreaterThan(0));
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ tipCents: 300 })));
});

test('valor fixo: a gorjeta já escolhida não é refeita na tela de pagamento', async () => {
  mockList.mockResolvedValue([{ ...myShare, mode: 'fixed_amount', tipCents: 455 }]);
  mockPay.mockResolvedValue({ paymentId: 'pay1', status: 'pending', amountCents: 5313, expiresAt: null, checkoutUrl: null, pix: { payload: 'pix', expiresAt: null }, alreadyPaid: false });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  expect(screen.queryByText('Gorjeta (opcional)')).toBeNull();
  await waitFor(() => expect(mockQuote).toHaveBeenCalledWith(4858, { tipCents: 455 }));
  await waitFor(() => expect(screen.getAllByText(/R\$\s53,13/).length).toBeGreaterThan(0));
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ tipCents: 455 })));
});

test('pagamento: conta que mudou não cobra e volta para escolher de novo', async () => {
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue([{ percent: 10, cents: 442, totalCents: 5300 }]);
  mockPay.mockRejectedValue(Object.assign(new Error('x'), { code: 'bill_changed' }));
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await waitFor(() => expect(screen.getAllByText(/R\$\s53,00/).length).toBeGreaterThan(0));
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(require('react-native').Alert.alert).toHaveBeenCalledWith('A conta mudou', expect.any(String), expect.anything()));
});

test('cupom: vai ao servidor, e a mensagem de por que não vale chega à pessoa (P3)', async () => {
  mockList.mockResolvedValue([{ ...myShare, couponDiscountCents: 0 }]);
  mockTips.mockResolvedValue([{ percent: 10, cents: 442, totalCents: 5300 }]);
  mockCoupon.mockRejectedValueOnce(new Error('Válido de terça a quinta, das 15h às 18h')).mockResolvedValue(undefined);
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  fireEvent.changeText(await screen.findByLabelText('Cupom'), 'dez');
  fireEvent.press(screen.getByText('Aplicar'));
  await waitFor(() => expect(mockCoupon).toHaveBeenCalledWith('sh1', 'dez'));
  await waitFor(() => expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Cupom não aplicado', 'Válido de terça a quinta, das 15h às 18h'));
});

test('cupom digitado e não aplicado trava o pagamento, para o desconto não sumir (P3)', async () => {
  mockList.mockResolvedValue([{ ...myShare, couponDiscountCents: 0 }]);
  mockTips.mockResolvedValue([{ percent: 10, cents: 442, totalCents: 5300 }]);
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  fireEvent.changeText(await screen.findByLabelText('Cupom'), 'dez');
  fireEvent.press(screen.getByText(/Gerar PIX|Pagar/));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(mockPay).not.toHaveBeenCalled();
});

test('cupom aplicado aparece no resumo, com o valor do servidor', async () => {
  mockList.mockResolvedValue([{ ...myShare, couponDiscountCents: 500 }]);
  mockTips.mockResolvedValue([]);
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  expect(await screen.findByText('Cupom')).toBeTruthy();
  expect(screen.getByText(/5,00/)).toBeTruthy();
  expect(screen.getByText('Remover')).toBeTruthy();
});

const tips = [
  { percent: 10, cents: 486, totalCents: 5344 },
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

// ---- F6: cartão salvo (checkout hospedado do Asaas) ----------------------------------------
const cardPaid = { paymentId: 'pay1', status: 'pending', amountCents: 5344, expiresAt: null, checkoutUrl: null, pix: null, alreadyPaid: false };

test('cartão salvo: o padrão já vem escolhido e a cobrança vai com o id do cartão, sem abrir a página do Asaas', async () => {
  const openBrowser = require('expo-web-browser').openBrowserAsync as jest.Mock;
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue(tips);
  mockSavedCards.mockResolvedValue([{ id: 'c1', brand: 'visa', lastFour: '4242', isDefault: true }, { id: 'c2', brand: 'mastercard', lastFour: '1111', isDefault: false }]);
  mockPay.mockResolvedValue({ ...cardPaid, savedCard: true });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  fireEvent.press(screen.getByText('Cartão de crédito'));
  expect(await screen.findByText(/VISA •••• 4242/)).toBeTruthy();
  expect(screen.queryByTestId('save-card-switch')).toBeNull();
  fireEvent.press(screen.getByText('Pagar com cartão'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ method: 'credit_card', paymentMethodId: 'c1' })));
  expect(mockPay.mock.calls[0][0].saveCard).toBeUndefined();
  expect(openBrowser).not.toHaveBeenCalled();
});

test('cartão salvo: escolher outro cartão salvo troca o id enviado', async () => {
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue(tips);
  mockSavedCards.mockResolvedValue([{ id: 'c1', brand: 'visa', lastFour: '4242', isDefault: true }, { id: 'c2', brand: 'mastercard', lastFour: '1111', isDefault: false }]);
  mockPay.mockResolvedValue({ ...cardPaid, savedCard: true });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  fireEvent.press(screen.getByText('Cartão de crédito'));
  fireEvent.press(await screen.findByTestId('saved-card-c2'));
  fireEvent.press(screen.getByText('Pagar com cartão'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: 'c2' })));
});

test('cartão novo: sem consentimento não salva; com o interruptor ligado pede para salvar; abre a página do Asaas', async () => {
  const openBrowser = require('expo-web-browser').openBrowserAsync as jest.Mock;
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue(tips);
  mockSavedCards.mockResolvedValue([]);
  mockPay.mockResolvedValue({ ...cardPaid, checkoutUrl: 'https://asaas/i/1', savedCard: false });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  fireEvent.press(screen.getByText('Cartão de crédito'));
  await screen.findByText('Salvar este cartão');
  fireEvent.press(screen.getByText('Pagar com cartão'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledTimes(1));
  expect(mockPay.mock.calls[0][0].saveCard).toBeUndefined();
  expect(mockPay.mock.calls[0][0].paymentMethodId).toBeUndefined();
  await waitFor(() => expect(openBrowser).toHaveBeenCalledWith('https://asaas/i/1'));
});

test('cartão novo: com o interruptor "Salvar este cartão" ligado, a cobrança pede para salvar', async () => {
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue(tips);
  mockSavedCards.mockResolvedValue([]);
  mockPay.mockResolvedValue({ ...cardPaid, checkoutUrl: 'https://asaas/i/1', savedCard: false });
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  fireEvent.press(screen.getByText('Cartão de crédito'));
  fireEvent(await screen.findByTestId('save-card-switch'), 'valueChange', true);
  fireEvent.press(screen.getByText('Pagar com cartão'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ method: 'credit_card', saveCard: true })));
  expect(mockPay.mock.calls[0][0].paymentMethodId).toBeUndefined();
});

test('cartão salvo que sumiu (404): volta para a escolha e recarrega a lista', async () => {
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue(tips);
  mockSavedCards.mockResolvedValue([{ id: 'c1', brand: 'visa', lastFour: '4242', isDefault: true }]);
  mockPay.mockRejectedValue(Object.assign(new Error('Cartão salvo não encontrado. Escolha outro cartão.'), { code: 'card_not_found' }));
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  fireEvent.press(screen.getByText('Cartão de crédito'));
  await screen.findByText(/VISA •••• 4242/);
  const before = mockSavedCards.mock.calls.length;
  fireEvent.press(screen.getByText('Pagar com cartão'));
  await waitFor(() => expect(mockSavedCards.mock.calls.length).toBeGreaterThan(before));
});

test('recibo: depois de pagar, o cliente chega ao recibo em vez de voltar à Home sem nada', async () => {
  mockList.mockResolvedValue([{ ...myShare, status: 'paid' }]);
  mockTips.mockResolvedValue(tips);
  mockLatestReceipt.mockResolvedValue('receipt-1');
  const navigate = jest.fn();
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn(), navigate }} />);
  fireEvent.press(await screen.findByText('Ver recibo'));
  expect(navigate).toHaveBeenCalledWith('DigitalReceipt', { receiptId: 'receipt-1' });
  expect(screen.getByText('Concluir')).toBeTruthy();
});

test('recibo: enquanto o recibo não existe, Concluir continua disponível', async () => {
  mockList.mockResolvedValue([{ ...myShare, status: 'paid' }]);
  mockTips.mockResolvedValue(tips);
  mockLatestReceipt.mockResolvedValue(null);
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  expect(await screen.findByText('Concluir')).toBeTruthy();
  expect(screen.queryByText('Ver recibo')).toBeNull();
});

test('gorjeta alta pede confirmação antes de cobrar (resposta 55)', async () => {
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue(tips);
  mockQuote.mockImplementation(async (amountCents: number, tip: { tipCents: number }) => ({ tipCents: tip.tipCents, totalCents: amountCents + tip.tipCents, confirmTip: true, cardAvailable: true, pixAvailable: true }));
  mockPay.mockResolvedValue({ paymentId: 'pay1', status: 'pending', amountCents: 5344, expiresAt: null, checkoutUrl: null, pix: { payload: '000201-pix', expiresAt: null }, alreadyPaid: false });
  const alertSpy = require('react-native').Alert.alert as jest.Mock;
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1', restaurantName: 'Casa' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  await waitFor(() => expect(screen.getByText('Gerar PIX')).toBeTruthy());
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Confirma a gorjeta?', expect.stringMatching(/^Confirma gorjeta de R\$/), expect.anything()));
  expect(mockPay).not.toHaveBeenCalled();
  (alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as any[]).find((b) => b.text === 'Confirmar').onPress();
  await waitFor(() => expect(mockPay).toHaveBeenCalled());
});

test('abaixo do mínimo do cartão, o cartão some; sem nenhum meio, paga no salão (resposta 79)', async () => {
  mockList.mockResolvedValue([myShare]);
  mockTips.mockResolvedValue(tips);
  mockQuote.mockImplementation(async (amountCents: number, tip: { tipCents: number }) => ({ tipCents: tip.tipCents, totalCents: amountCents + tip.tipCents, confirmTip: false, cardAvailable: false, pixAvailable: true }));
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1', restaurantName: 'Casa' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  await waitFor(() => expect(screen.queryByText('Cartão de crédito')).toBeNull());
  expect(screen.getByText('PIX')).toBeTruthy();
  mockQuote.mockImplementation(async (amountCents: number, tip: { tipCents: number }) => ({ tipCents: tip.tipCents, totalCents: amountCents + tip.tipCents, confirmTip: false, cardAvailable: false, pixAvailable: false }));
  const none = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1', restaurantName: 'Casa' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  expect(await none.findByTestId('pay-at-table')).toBeTruthy();
});

test('CPF na nota: opcional, sugere o CPF já informado e vai na cobrança; desmarcado vai nulo', async () => {
  mockList.mockResolvedValue([{ ...myShare, mode: 'fixed_amount', tipCents: 0 }]);
  mockPay.mockResolvedValue({ paymentId: 'pay1', status: 'pending', amountCents: 4858, expiresAt: null, checkoutUrl: null, pix: { payload: 'pix', expiresAt: null }, alreadyPaid: false });
  mockMyTaxDocument.mockResolvedValue('52998224725');
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  expect(screen.getByText(/consumidor não identificado/)).toBeTruthy();
  expect(screen.queryByTestId('receipt-document-input')).toBeNull();
  fireEvent(screen.getByTestId('receipt-document-switch'), 'valueChange', true);
  await waitFor(() => expect(screen.getByTestId('receipt-document-input').props.value).toBe('529.982.247-25'));
  fireEvent(screen.getByTestId('receipt-document-switch'), 'valueChange', false);
  expect(screen.queryByTestId('receipt-document-input')).toBeNull();
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ receiptDocument: null })));
});

test('CPF na nota inválido não gera cobrança', async () => {
  mockList.mockResolvedValue([{ ...myShare, mode: 'fixed_amount', tipCents: 0 }]);
  mockMyTaxDocument.mockResolvedValue(null);
  const alert = require('react-native').Alert.alert as jest.Mock;
  const screen = renderWithClient(<SharePaymentScreen route={{ params: { tableSessionId: 's1' } }} navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
  await screen.findByText('Total a pagar');
  fireEvent(screen.getByTestId('receipt-document-switch'), 'valueChange', true);
  fireEvent.changeText(await screen.findByTestId('receipt-document-input'), '123.456.789-00');
  expect(screen.getByText('CPF ou CNPJ inválido.')).toBeTruthy();
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Pagamento não iniciado', expect.stringContaining('CPF da nota')));
  expect(mockPay).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByTestId('receipt-document-input'), '123.456.789-09');
  mockPay.mockResolvedValue({ paymentId: 'pay1', status: 'pending', amountCents: 4858, expiresAt: null, checkoutUrl: null, pix: { payload: 'pix', expiresAt: null }, alreadyPaid: false });
  fireEvent.press(screen.getByText('Gerar PIX'));
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ receiptDocument: '12345678909' })));
});
