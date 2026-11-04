import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { BillChargeModal } from '../screens/v2/shared/BillChargeModal';
import { ChargePolicyCard } from '../screens/v2/config/ChargePolicyCard';
import { parsePresets, presetsText, toggleSplitMode } from '../screens/v2/config/chargePolicy';

const mockBill = jest.fn();
const mockRecord = jest.fn();
const mockPolicies = jest.fn();
const mockUpdate = jest.fn();
const mockAbsorb = jest.fn().mockResolvedValue({});
const mockTap = jest.fn().mockResolvedValue({ paymentId: 'p1', amountCents: 6600, sdkPayload: {} });
jest.mock('expo-crypto', () => { let n = 0; return { randomUUID: () => `key-${++n}` }; });
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'Icon' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: () => ({ serverRoles: mockRoles() }) }));
const mockRoles = jest.fn(() => ['owner']);
jest.mock('../screens/v2/config/ConfigSectionCard', () => ({ ConfigSectionCard: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('@okinawa/shared/utils/user-error-message', () => ({ userErrorMessage: (_: unknown, fallback: string) => fallback }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ supabaseApiAdapter: {
  getSessionBill: (...a: unknown[]) => mockBill(...a),
  recordBillPayment: (...a: unknown[]) => mockRecord(...a),
  getChargePolicies: (...a: unknown[]) => mockPolicies(...a),
  updateChargePolicy: (...a: unknown[]) => mockUpdate(...a),
  setConvenienceAbsorbed: (...a: unknown[]) => mockAbsorb(...a),
  startTapCharge: (...a: unknown[]) => mockTap(...a),
} }));
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

const bill = { balanceCents: 6000, chargeBaseCents: 6000, feeCents: 600, totalWithFeeCents: 6600, totalWithoutFeeCents: 6000, couponDiscountCents: 0, couponRefusal: null, feeBps: 1000, feeOrTipMode: 'service_fee', adjusted: false };
const scene = (extra = {}) => render(<BillChargeModal tableSessionId="s1" tableLabel="Mesa 4" onClose={jest.fn()} onCharged={jest.fn().mockResolvedValue(undefined)} {...extra} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockBill.mockResolvedValue(bill);
  mockRecord.mockResolvedValue({});
});

describe('cobrança presencial (G5)', () => {
  it('mostra o saldo com a taxa, vindos do servidor, e cobra o saldo todo', async () => {
    const view = scene();
    await waitFor(() => expect(view.getByText(/66,00/)).toBeTruthy());
    fireEvent.press(view.getByText('Dinheiro'));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith('s1', expect.objectContaining({ method: 'cash', baseCents: null, waiveFee: false, idempotencyKey: 'key-1' })));
  });

  it('o garçom desmarca a taxa, com motivo', async () => {
    const view = scene();
    await waitFor(() => expect(view.getByText(/66,00/)).toBeTruthy());
    fireEvent(view.getByTestId('charge-fee-switch'), 'valueChange', false);
    expect(view.getByText('Retirada')).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Motivo da retirada da taxa'), 'Demora no prato');
    fireEvent.press(view.getByText('Pix'));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith('s1', expect.objectContaining({ method: 'pix', waiveFee: true, reason: 'Demora no prato' })));
  });

  it('valor parcial pede a conta ao servidor; acima do saldo avisa', async () => {
    mockBill.mockResolvedValueOnce(bill).mockResolvedValue({ ...bill, adjusted: true });
    const view = scene();
    await waitFor(() => expect(view.getByText(/66,00/)).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Consumo a receber'), '999900');
    await waitFor(() => expect(mockBill).toHaveBeenCalledWith('s1', 999900, null));
    expect(await view.findByText(/Restam só/)).toBeTruthy();
  });

  it('repetir depois de uma falha usa a mesma chave: nunca lança duas vezes', async () => {
    mockRecord.mockRejectedValueOnce(new Error('rede'));
    const view = scene();
    await waitFor(() => expect(view.getByText(/66,00/)).toBeTruthy());
    fireEvent.press(view.getByText('Crédito'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Falha ao cobrar', expect.any(String)));
    fireEvent.press(view.getByText('Crédito'));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(2));
    expect(mockRecord.mock.calls[0][1].idempotencyKey).toBe(mockRecord.mock.calls[1][1].idempotencyKey);
  });

  it('não cobra enquanto a conta do valor digitado não chegou', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mockBill.mockResolvedValueOnce(bill).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const view = scene();
    await waitFor(() => expect(view.getByText(/66,00/)).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Consumo a receber'), '2000');
    fireEvent.press(view.getByText('Dinheiro'));
    expect(mockRecord).not.toHaveBeenCalled();
    resolve({ ...bill, chargeBaseCents: 2000, feeCents: 200, totalWithFeeCents: 2200 });
    await waitFor(() => expect(view.getByText(/22,00/)).toBeTruthy());
    fireEvent.press(view.getByText('Dinheiro'));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith('s1', expect.objectContaining({ baseCents: 2000 })));
  });

  it('vale: só os aceitos pelo restaurante, e vai a forma escolhida (V1)', async () => {
    mockBill.mockResolvedValue({ ...bill, acceptedVouchers: ['refeicao'], payers: [] });
    const view = scene();
    fireEvent.press(await view.findByText('Vale-refeição'));
    expect(view.queryByText('Vale-alimentação')).toBeNull();
    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith('s1', expect.objectContaining({ method: 'voucher', voucherKind: 'refeicao' })));
  });

  it('sem fornecedor ativo, não há aproximação; com fornecedor, inicia e não abate sozinho (T1)', async () => {
    const off = scene();
    await waitFor(() => expect(off.getByText(/66,00/)).toBeTruthy());
    expect(off.queryByText('Aproximação')).toBeNull();
    mockBill.mockResolvedValue({ ...bill, tapActive: true });
    const on = scene();
    fireEvent.press(await on.findByText('Aproximação'));
    await waitFor(() => expect(mockTap).toHaveBeenCalledWith('s1', expect.objectContaining({ baseCents: null, idempotencyKey: expect.any(String) })));
    expect(mockRecord).not.toHaveBeenCalled();
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Aproxime o cartão', expect.stringContaining('aprovada')));
  });

  it('vale com gorjeta: a gorjeta vai antes, no cartão, com chave própria; o vale só paga o consumo (V1)', async () => {
    mockBill.mockResolvedValue({ ...bill, feeOrTipMode: 'tip', feeBps: 0, feeCents: 0, totalWithFeeCents: 6000, totalWithoutFeeCents: 6000, acceptedVouchers: ['refeicao'] });
    const view = scene();
    await waitFor(() => expect(view.getByText('Vale-refeição')).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Gorjeta'), '500');
    fireEvent.press(view.getByText('Vale-refeição'));
    const buttons = alert.mock.calls[alert.mock.calls.length - 1][2] as any[];
    expect(mockRecord).not.toHaveBeenCalled();
    buttons.find((b) => b.text === 'Crédito').onPress();
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(2));
    const [first, second] = mockRecord.mock.calls.map((c) => c[1]);
    expect(first).toMatchObject({ method: 'credit_card', baseCents: 0, tipCents: 500 });
    expect(second).toMatchObject({ method: 'voucher', voucherKind: 'refeicao', tipCents: 0 });
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  it('aproximação repetida mantém a chave depois de queda, e troca só se o servidor disser que falhou (T1)', async () => {
    mockBill.mockResolvedValue({ ...bill, tapActive: true });
    const view = scene();
    await waitFor(() => expect(view.getByText('Aproximação')).toBeTruthy());
    mockTap.mockRejectedValueOnce(new Error('rede'));
    fireEvent.press(view.getByText('Aproximação'));
    await waitFor(() => expect(mockTap).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.getByText('Aproximação')).toBeTruthy());
    mockTap.mockRejectedValueOnce(Object.assign(new Error('charge_failed'), { code: 'charge_failed' }));
    fireEvent.press(view.getByText('Aproximação'));
    await waitFor(() => expect(mockTap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Cobrança não concluída', expect.any(String)));
    fireEvent.press(view.getByText('Aproximação'));
    await waitFor(() => expect(mockTap).toHaveBeenCalledTimes(3));
    const keys = mockTap.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('cupom: o valor a receber vem do servidor, já com o desconto; recusado diz o motivo e não vai (P3)', async () => {
    mockBill.mockImplementation(async (_s: string, _b: number | null, code: string | null) => (code === 'DEZ'
      ? { ...bill, couponDiscountCents: 1000, feeCents: 500, totalWithFeeCents: 5500, totalWithoutFeeCents: 5000 }
      : code ? { ...bill, couponRefusal: 'Cupom não encontrado' } : bill));
    const view = scene();
    await waitFor(() => expect(view.getByText(/66,00/)).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Cupom do cliente'), 'XX');
    fireEvent.press(view.getByText('Aplicar'));
    expect(await view.findByText('Cupom não encontrado')).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Cupom do cliente'), 'DEZ');
    fireEvent.press(view.getByText('Aplicar'));
    await waitFor(() => expect(view.getByText(/55,00/)).toBeTruthy());
    expect(view.getByText(/− R\$\s10,00/)).toBeTruthy();
    fireEvent.press(view.getByText('Dinheiro'));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith('s1', expect.objectContaining({ couponCode: 'DEZ' })));
  });

  it('em modo gorjeta não há taxa para desmarcar', async () => {
    mockBill.mockResolvedValue({ ...bill, feeOrTipMode: 'tip', feeBps: 0, feeCents: 0, totalWithFeeCents: 6000 });
    const view = scene();
    await waitFor(() => expect(view.getAllByText(/60,00/).length).toBeGreaterThan(0));
    expect(view.queryByTestId('charge-fee-switch')).toBeNull();
  });
});

describe('taxa ou gorjeta por serviço (G5)', () => {
  const casual = { serviceModel: 'casual_dining', feeOrTipMode: 'service_fee', serviceFeeBps: 1000, tipPresetsBps: [1000, 1500], tipDefaultBps: 1000, splitModes: ['by_owner', 'equal'], prepaid: false };
  const quick = { serviceModel: 'quick_service', feeOrTipMode: 'tip', serviceFeeBps: 0, tipPresetsBps: [1000], tipDefaultBps: null, splitModes: [], prepaid: true };

  it('lê os percentuais digitados, sem repetir nem aceitar fora da faixa', () => {
    expect(parsePresets('10, 15 e 20')).toEqual([1000, 1500, 2000]);
    expect(parsePresets('10 10 150 0')).toEqual([1000]);
    expect(presetsText([1000, 1500])).toBe('10, 15');
  });

  it('mantém ao menos uma forma de divisão, na ordem da tela', () => {
    expect(toggleSplitMode(['equal'], 'equal')).toEqual(['equal']);
    expect(toggleSplitMode(['equal'], 'by_owner')).toEqual(['by_owner', 'equal']);
  });

  it('troca a taxa por gorjeta num serviço e salva em bps', async () => {
    mockPolicies.mockResolvedValue([casual]);
    const view = render(<ChargePolicyCard restaurantId="r1" />);
    fireEvent.press(await view.findByText('Gorjeta'));
    fireEvent.press(view.getByText('Salvar Casual Dining'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('r1', 'casual_dining', expect.objectContaining({
      feeOrTipMode: 'tip', tipPresetsBps: [1000, 1500], tipDefaultBps: 1000,
    })));
  });

  it('muda o percentual da taxa', async () => {
    mockPolicies.mockResolvedValue([casual]);
    const view = render(<ChargePolicyCard restaurantId="r1" />);
    fireEvent.changeText(await view.findByLabelText('Percentual da taxa, Casual Dining'), '12,5');
    fireEvent.press(view.getByText('Salvar Casual Dining'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('r1', 'casual_dining', expect.objectContaining({ serviceFeeBps: 1250 })));
  });

  it('com a conveniência ligada, só o Dono pode assumir a taxa (M3)', async () => {
    mockPolicies.mockResolvedValue([{ ...quick, convenienceCents: 99, convenienceAbsorbed: false }]);
    const view = render(<ChargePolicyCard restaurantId="r1" />);
    fireEvent(await view.findByLabelText('Pagar a taxa de conveniência pelos meus clientes'), 'valueChange', true);
    await waitFor(() => expect(mockAbsorb).toHaveBeenCalledWith('r1', true));
    mockRoles.mockReturnValueOnce(['manager']).mockReturnValueOnce(['manager']);
    const manager = render(<ChargePolicyCard restaurantId="r1" />);
    await manager.findByText(/só gorjeta opcional/);
    expect(manager.queryByLabelText('Pagar a taxa de conveniência pelos meus clientes')).toBeNull();
  });

  it('Quick: só gorjeta, sem marcar nada e sem dividir conta', async () => {
    mockPolicies.mockResolvedValue([quick]);
    const view = render(<ChargePolicyCard restaurantId="r1" />);
    expect(await view.findByText(/só gorjeta opcional/)).toBeTruthy();
    expect(view.queryByText('Taxa de serviço')).toBeNull();
    expect(view.queryByText('Já vem marcada')).toBeNull();
    expect(view.queryByText('Formas de dividir a conta')).toBeNull();
    fireEvent.press(view.getByText('Salvar Quick Service'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('r1', 'quick_service', expect.objectContaining({ tipDefaultBps: null, splitModes: null })));
  });
});
