import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DigitalReceiptScreen from '../screens/production/DigitalReceiptScreen';
import { fiscalIsSettling, fiscalNotice } from '../screens/production/receipt-fiscal';
import type { DigitalReceipt } from '../services/customer-backend';
import { parseReceiptFiscal, type ReceiptFiscal } from '../services/receipt-fiscal';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
const mockOpen = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...a: unknown[]) => mockOpen(...a) }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../screens/production/shared', () => ({ rootNavigate: jest.fn(), StateView: () => null }));
const mockGetReceipt = jest.fn();
const mockGetOrder = jest.fn();
const mockGetOrderFiscal = jest.fn();
jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: {
    getReceipt: (...a: unknown[]) => mockGetReceipt(...a),
    getOrder: (...a: unknown[]) => mockGetOrder(...a),
    getOrderFiscal: (...a: unknown[]) => mockGetOrderFiscal(...a),
  },
}));

const pending: ReceiptFiscal = { status: 'issuing', number: null, series: null, accessKey: null, qrCodeUrl: null, danfeUrl: null, homologation: false, contingency: false };
const authorized: ReceiptFiscal = {
  status: 'authorized', number: '12', series: '1', accessKey: '41190612345678000123650010000000121743484310',
  qrCodeUrl: 'http://qr', danfeUrl: 'http://danfe', homologation: false, contingency: false,
};
const receipt = (fiscal: ReceiptFiscal): DigitalReceipt => ({
  simulated: false, id: 'r1', restaurantName: 'Casa', restaurantCnpj: null, items: [], subtotal: 60, serviceFeePercent: 10,
  serviceFee: 6, discount: 0, discountReason: null, total: 66, tip: 3, paymentMethod: 'pix', cashback: 0, pointsAwarded: 0,
  familyTier: null, familyVisitCount: null, accessKey: 'COMPROVANTE', createdAt: '2026-11-02T15:00:00Z', fiscal,
});

function renderScreen(params: Record<string, string>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DigitalReceiptScreen route={{ params }} navigation={{ goBack: jest.fn(), navigate: jest.fn() }} />
    </QueryClientProvider>,
  );
}

test('nota autorizada: o recibo mostra o número emitido, a chave e abre o documento', async () => {
  mockGetReceipt.mockResolvedValue(receipt(authorized));
  const screen = renderScreen({ receiptId: 'r1' });
  expect(await screen.findByText('NFC-e nº 12 · Série 1')).toBeTruthy();
  expect(screen.getByText('Autorizada pela SEFAZ')).toBeTruthy();
  expect(screen.getByText('41190612345678000123650010000000121743484310')).toBeTruthy();
  expect(screen.getByTestId('fiscal-qr')).toBeTruthy();
  expect(screen.queryByText(/Sem valor fiscal/)).toBeNull();
  fireEvent.press(screen.getByText('Abrir nota fiscal'));
  expect(mockOpen).toHaveBeenCalledWith('http://danfe');
});

test('nota em emissão: não mostra número nem QR, e o código do comprovante não finge ser chave', async () => {
  mockGetReceipt.mockResolvedValue(receipt(pending));
  const screen = renderScreen({ receiptId: 'r1' });
  expect(await screen.findByText('Nota fiscal em emissão')).toBeTruthy();
  expect(screen.queryByTestId('fiscal-qr')).toBeNull();
  expect(screen.getByText('Comprovante COMPROVANTE')).toBeTruthy();
  expect(screen.queryByText('Abrir nota fiscal')).toBeNull();
});

test('nota de homologação nunca parece documento válido', async () => {
  mockGetReceipt.mockResolvedValue(receipt({ ...authorized, homologation: true }));
  const screen = renderScreen({ receiptId: 'r1' });
  expect(await screen.findByText('Ambiente de teste · Sem valor fiscal')).toBeTruthy();
});

test('Quick Service: o comprovante do pedido traz a nota do servidor', async () => {
  mockGetOrder.mockResolvedValue({
    id: 'o1', restaurantName: 'Casa', items: [], subtotal: 50, total: 40, pickupCode: 'A12', orderNumber: '12',
    createdAt: '2026-11-02T15:00:00Z', pickedUpAt: null,
  });
  mockGetOrderFiscal.mockResolvedValue(authorized);
  const screen = renderScreen({ orderId: 'o1' });
  expect(await screen.findByText('NFC-e nº 12 · Série 1')).toBeTruthy();
  await waitFor(() => expect(mockGetOrderFiscal).toHaveBeenCalledWith('o1'));
});

test('avisos cobrem cada situação sem expor erro interno', () => {
  expect(fiscalNotice({ ...pending, status: 'awaiting_close' }).title).toBe('Nota fiscal no fechamento da conta');
  expect(fiscalNotice({ ...pending, status: 'delayed' }).detail).toBe('A emissão atrasou. Este comprovante ainda não tem valor fiscal.');
  expect(fiscalNotice({ ...pending, status: 'none' }).detail).toBe('Sem valor fiscal');
  expect(fiscalNotice({ ...authorized, contingency: true }).detail).toContain('contingência');
});

test('só acompanha a nota enquanto ela ainda pode mudar sozinha', () => {
  expect(fiscalIsSettling(pending)).toBe(true);
  expect(fiscalIsSettling({ ...pending, status: 'awaiting_close' })).toBe(true);
  expect(fiscalIsSettling(authorized)).toBe(false);
  expect(fiscalIsSettling({ ...pending, status: 'delayed' })).toBe(false);
});

test('situação desconhecida do servidor não vira nota', () => {
  expect(parseReceiptFiscal({ status: 'bogus', number: 1 }).status).toBe('none');
  expect(parseReceiptFiscal({ status: 'authorized', number: 12, series: 1 }).number).toBe('12');
  expect(parseReceiptFiscal(null).status).toBe('none');
});
