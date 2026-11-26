import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentSheet, type PaymentSheetProps } from '../components/payment/PaymentSheet';
import AddCardScreen, { validateNewCard } from '../screens/payment/AddCardScreen';
import { SavedCardsSection } from '../components/payment/SavedCardsSection';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-svg', () => ({ SvgXml: 'SvgXml' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('../services/bill-shares', () => ({ billShares: { myTaxDocument: async () => null } }));
const mockAdd = jest.fn();
const mockList = jest.fn();
const mockRemove = jest.fn();
const mockDefault = jest.fn();
jest.mock('../services/saved-cards', () => ({ savedCards: {
  add: (...a: unknown[]) => mockAdd(...a), list: (...a: unknown[]) => mockList(...a),
  remove: (...a: unknown[]) => mockRemove(...a), setDefault: (...a: unknown[]) => mockDefault(...a),
} }));
const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);

const cards = [{ id: 'c1', brand: 'visa', lastFour: '4242', isDefault: true }, { id: 'c2', brand: 'mastercard', lastFour: '1111', isDefault: false }];
const base: PaymentSheetProps = {
  savedCards: cards, onAddCard: jest.fn(), payerDocument: { required: false, value: '', onChange: jest.fn() },
  summary: [{ label: 'Subtotal', value: 'R$ 30,00' }], totalCents: 3000, paying: false, disabled: false, onPay: jest.fn(),
  coupon: { value: '', onChangeText: jest.fn(), action: null, onAction: jest.fn() },
  receiptDocument: { value: { enabled: false, document: '' }, onChange: jest.fn() },
};
const texts = (view: ReturnType<typeof render>) => (view.toJSON() ? JSON.stringify(view.toJSON()).match(/"(Forma de pagamento|Gorjeta \(opcional\)|Taxa de serviço \(opcional\)|Cupom|Resumo|Total a pagar|Pix|Adicionar novo cartão|Pagar R\$[^"]*)"/g) : []);

test('mesma folha, mesma ordem e textos para Quick (gorjeta) e mesa (taxa)', () => {
  const quick = render(<PaymentSheet {...base} tip={{ options: [{ key: '0', label: 'Sem', selected: true, onPress: jest.fn() }], customCents: 0, onCustomChange: jest.fn() }} />);
  const casual = render(<PaymentSheet {...base} serviceFee={{ amountCents: 300, waived: false, disabled: false, onToggle: jest.fn() }} />);
  const strip = (t: string[] | null) => (t ?? []).filter((x) => !/Gorjeta|Taxa de serviço/.test(x));
  expect(strip(texts(quick))).toEqual(strip(texts(casual)));
  expect(strip(texts(quick))).toEqual(['"Forma de pagamento"', '"Pix"', '"Adicionar novo cartão"', '"Cupom"', '"Cupom"', '"Resumo"', '"Total a pagar"', expect.stringMatching(/Pagar R\$\s30,00/)]);
  expect(quick.getByText('Gorjeta (opcional)')).toBeTruthy();
  expect(casual.getByText('Taxa de serviço (opcional)')).toBeTruthy();
});

test('uma escolha só: Pix por padrão, tocar um cartão troca e vai no onPay', () => {
  const onPay = jest.fn();
  const view = render(<PaymentSheet {...base} onPay={onPay} />);
  expect(view.getByTestId('method-pix').props.accessibilityState).toEqual({ selected: true });
  fireEvent.press(view.getByTestId('saved-card-c2'));
  expect(view.getByTestId('method-pix').props.accessibilityState).toEqual({ selected: false });
  fireEvent.press(view.getByTestId('pay-button'));
  expect(onPay).toHaveBeenCalledWith({ kind: 'card', cardId: 'c2' });
});

test('sem Pix (abaixo do mínimo), o cartão padrão vem escolhido', () => {
  const onPay = jest.fn();
  const view = render(<PaymentSheet {...base} pixAvailable={false} onPay={onPay} />);
  expect(view.queryByTestId('method-pix')).toBeNull();
  fireEvent.press(view.getByTestId('pay-button'));
  expect(onPay).toHaveBeenCalledWith({ kind: 'card', cardId: 'c1' });
});

test('adicionar cartão: validação de UX (Luhn, validade, CVV, CPF, CEP, celular)', () => {
  const ok = { number: '4111111111111111', expiry: '12/39', ccv: '123', holderName: 'ANA SILVA', cpf: '52998224725', postalCode: '01310-100', addressNumber: '10', phone: '11999998888' };
  expect(validateNewCard(ok)).toBeNull();
  expect(validateNewCard({ ...ok, number: '4111111111111112' })).toMatch(/número/);
  expect(validateNewCard({ ...ok, expiry: '01/20' })).toMatch(/vencido/);
  expect(validateNewCard({ ...ok, ccv: '1' })).toMatch(/CVV/);
  expect(validateNewCard({ ...ok, cpf: '11111111111' })).toMatch(/CPF/);
  expect(validateNewCard({ ...ok, postalCode: '123' })).toMatch(/CEP/);
  expect(validateNewCard({ ...ok, phone: '123' })).toMatch(/celular/);
});

test('adicionar cartão: inválido não chama o servidor; válido envia uma vez e limpa número e CVV', async () => {
  const client = new QueryClient();
  const nav = { goBack: jest.fn() };
  mockAdd.mockRejectedValueOnce(Object.assign(new Error('Cartão inválido'), { code: 'card_invalid' }));
  const view = render(<QueryClientProvider client={client}><AddCardScreen route={{ params: { restaurantId: 'r1' } }} navigation={nav} /></QueryClientProvider>);
  fireEvent.press(view.getByTestId('save-card'));
  expect(await view.findByText('Confira o número do cartão.')).toBeTruthy();
  expect(mockAdd).not.toHaveBeenCalled();
  const fill: Record<string, string> = { 'Número do cartão': '4111 1111 1111 1111', Validade: '1239', CVV: '123', 'Nome impresso no cartão': 'ANA SILVA', 'CPF do titular': '52998224725', CEP: '01310100', Número: '10', Celular: '11999998888' };
  for (const [label, value] of Object.entries(fill)) fireEvent.changeText(view.getByLabelText(label), value);
  fireEvent.press(view.getByTestId('save-card'));
  expect(await view.findByText('Cartão inválido')).toBeTruthy();
  expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: 'r1', card: expect.objectContaining({ number: '4111111111111111', expiryMonth: '12', expiryYear: '2039', ccv: '123' }) }));
  expect(view.getByLabelText('Número do cartão').props.value).toBe('');
  expect(view.getByLabelText('CVV').props.value).toBe('');
  expect(nav.goBack).not.toHaveBeenCalled();
});

test('Meus cartões: tornar padrão e remover (com confirmação) vão ao servidor', async () => {
  mockList.mockResolvedValue(cards);
  mockDefault.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SavedCardsSection /></QueryClientProvider>);
  fireEvent.press(await view.findByLabelText('Tornar padrão o cartão final 1111'));
  await waitFor(() => expect(mockDefault.mock.calls[0][0]).toBe('c2'));
  fireEvent.press(view.getByLabelText('Remover o cartão final 4242'));
  const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === 'Remover')!.onPress!();
  await waitFor(() => expect(mockRemove.mock.calls[0][0]).toBe('c1'));
  expect(mockList).toHaveBeenCalledWith();
});
