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
} }));
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

const bill = { balanceCents: 6000, chargeBaseCents: 6000, feeCents: 600, totalWithFeeCents: 6600, feeBps: 1000, feeOrTipMode: 'service_fee', adjusted: false };
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
    await waitFor(() => expect(mockBill).toHaveBeenCalledWith('s1', 999900));
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
