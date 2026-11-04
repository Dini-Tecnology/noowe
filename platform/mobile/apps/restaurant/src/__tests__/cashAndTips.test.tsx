import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { centsFromText, textFromCents } from '../screens/v2/config/cashSettings';
import { CashSettingsCard, TipRulesCard } from '../screens/v2/config/CashAndTipsCards';
import { DayClosePanel } from '../screens/v2/shared/DayClosePanel';
import { MyTipsPanel } from '../screens/v2/shared/MyTipsPanel';
import { PaymentActionsPanel } from '../screens/v2/shared/PaymentActionsPanel';

const mockApi = {
  getCashSettings: jest.fn(), updateCashSettings: jest.fn(), getDayStatus: jest.fn(), closeOperationalDay: jest.fn(), reviewCashBreak: jest.fn(),
  getTipRules: jest.fn(), updateTipRules: jest.fn(), setTaxRegime: jest.fn(), getMyTips: jest.fn(), getRefundablePayments: jest.fn(),
  requestRefund: jest.fn(), requestBillReopen: jest.fn(),
};
let mockRoles = ['owner'];
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'Icon' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (fn: () => void) => { const React = require('react'); React.useEffect(() => { fn(); }, [fn]); } }));
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: () => ({ restaurantId: 'r1', serverRoles: mockRoles }) }));
jest.mock('../screens/v2/config/ConfigSectionCard', () => ({ ConfigSectionCard: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('../screens/v2/shared/staffRoles', () => ({ ROLE_LABELS: { waiter: 'Garçom', maitre: 'Maître' } }));
jest.mock('@okinawa/shared/utils/user-error-message', () => ({ userErrorMessage: (_: unknown, fallback: string) => fallback }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ get supabaseApiAdapter() { return mockApi; } }));
const api = mockApi;
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

const settings = { openingFloatCents: 10000, sangriaSuggestCents: null, breakLimitCents: 2000, dayTurnover: '06:00' };
const rules = { mode: 'equal', retentionBps: 0, rolePoints: {}, capBps: 2000, taxRegime: 'simples_nacional', pending: null };
const day = { dayId: 'd1', businessDate: '2026-11-04', startedAt: '', openSessions: 0, cashOpen: false, unclosedDays: [], pendingBreaks: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockRoles = ['owner'];
  api.getCashSettings.mockResolvedValue(settings);
  api.updateCashSettings.mockResolvedValue(settings);
  api.getTipRules.mockResolvedValue(rules);
  api.updateTipRules.mockResolvedValue({ ...rules, pending: { mode: 'hours', retentionBps: 500, rolePoints: {}, effectiveDay: '2026-11-05' } });
  api.getDayStatus.mockResolvedValue(day);
  api.closeOperationalDay.mockResolvedValue({ tipPoolCents: 500 });
  api.getMyTips.mockResolvedValue([]);
  api.getRefundablePayments.mockResolvedValue([]);
  api.requestRefund.mockResolvedValue({ status: 'pending' });
  api.requestBillReopen.mockResolvedValue({ status: 'pending' });
});

describe('valores do caixa', () => {
  it('lê reais sem ponto flutuante', () => {
    expect(centsFromText('12,50')).toBe(1250);
    expect(centsFromText('R$ 7')).toBe(700);
    expect(centsFromText('0,1')).toBe(10);
    expect(centsFromText('abc')).toBeNull();
    expect(centsFromText('1,234')).toBeNull();
    expect(textFromCents(1205)).toBe('12,05');
  });
});

describe('parâmetros do caixa (critério 10)', () => {
  it('o Dono salva o limite de quebra, em centavos', async () => {
    const view = render(<CashSettingsCard restaurantId="r1" />);
    fireEvent.changeText(await view.findByLabelText('Limite de quebra'), '30,00');
    fireEvent.press(view.getByText('Salvar caixa'));
    await waitFor(() => expect(api.updateCashSettings).toHaveBeenCalledWith('r1', expect.objectContaining({ breakLimitCents: 3000, openingFloatCents: 10000 })));
  });

  it('o Gerente não altera o limite: nem manda o valor', async () => {
    mockRoles = ['manager'];
    const view = render(<CashSettingsCard restaurantId="r1" />);
    expect(await view.findByText(/só o Dono altera/)).toBeTruthy();
    fireEvent.press(view.getByText('Salvar caixa'));
    await waitFor(() => expect(api.updateCashSettings).toHaveBeenCalledWith('r1', expect.objectContaining({ breakLimitCents: null })));
  });

  it('recusa virada do dia fora do formato', async () => {
    const view = render(<CashSettingsCard restaurantId="r1" />);
    fireEvent.changeText(await view.findByLabelText('Virada do dia'), '6h');
    fireEvent.press(view.getByText('Salvar caixa'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Confira os valores', expect.any(String)));
    expect(api.updateCashSettings).not.toHaveBeenCalled();
  });
});

describe('rateio (critério 6)', () => {
  it('mostra o aviso do contador e limita a retenção ao teto do regime', async () => {
    const view = render(<TipRulesCard restaurantId="r1" />);
    expect(await view.findByText(/Confirme estes valores com seu contador/)).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Percentual retido'), '21');
    fireEvent.press(view.getByText('Salvar rateio'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Retenção acima do teto', expect.stringContaining('20%')));
    expect(api.updateTipRules).not.toHaveBeenCalled();
  });

  it('salva em bps e avisa que vale do próximo dia', async () => {
    const view = render(<TipRulesCard restaurantId="r1" />);
    fireEvent.press(await view.findByText('Por horas'));
    fireEvent.changeText(view.getByLabelText('Percentual retido'), '5');
    fireEvent.press(view.getByText('Salvar rateio'));
    await waitFor(() => expect(api.updateTipRules).toHaveBeenCalledWith('r1', { mode: 'hours', retentionBps: 500, rolePoints: {} }));
    expect(await view.findByText(/vale a partir de 05\/11\/2026/)).toBeTruthy();
  });

  it('pontos só vão no modo por pontos', async () => {
    const view = render(<TipRulesCard restaurantId="r1" />);
    fireEvent.press(await view.findByText('Por pontos'));
    fireEvent.changeText(view.getByLabelText('Pontos de Garçom'), '2');
    fireEvent.press(view.getByText('Salvar rateio'));
    await waitFor(() => expect(api.updateTipRules).toHaveBeenCalledWith('r1', expect.objectContaining({ mode: 'points', rolePoints: { waiter: 2 } })));
  });
});

describe('fechamento do dia (critérios 3 e 5)', () => {
  it('bloqueia com comanda ou caixa abertos', async () => {
    api.getDayStatus.mockResolvedValue({ ...day, openSessions: 2, cashOpen: true });
    const view = render(<DayClosePanel />);
    expect(await view.findByText(/2 comanda/)).toBeTruthy();
    fireEvent.press(view.getByText('Fechar o dia'));
    expect(api.closeOperationalDay).not.toHaveBeenCalled();
  });

  it('fecha e informa o resumo', async () => {
    const view = render(<DayClosePanel />);
    fireEvent.press(await view.findByText('Fechar o dia'));
    await waitFor(() => expect(api.closeOperationalDay).toHaveBeenCalledWith('r1', null));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Dia fechado', expect.stringContaining('5,00')));
  });

  it('dia que ficou para trás pode ser fechado depois', async () => {
    api.getDayStatus.mockResolvedValue({ ...day, unclosedDays: [{ dayId: 'old', businessDate: '2026-11-02' }] });
    const view = render(<DayClosePanel />);
    fireEvent.press(await view.findByText('Fechar'));
    await waitFor(() => expect(api.closeOperationalDay).toHaveBeenCalledWith('r1', 'old'));
  });

  it('só o Dono registra a quebra', async () => {
    api.getDayStatus.mockResolvedValue({ ...day, pendingBreaks: [{ sessionId: 's1', differenceCents: -500, closedAt: '' }] });
    mockRoles = ['manager'];
    const manager = render(<DayClosePanel />);
    expect(await manager.findByText('Aguardando o Dono.')).toBeTruthy();
    mockRoles = ['owner'];
    const owner = render(<DayClosePanel />);
    fireEvent.changeText(await owner.findByLabelText('Como a quebra foi resolvida'), 'Troco errado');
    fireEvent.press(owner.getByText('Registrar'));
    await waitFor(() => expect(api.reviewCashBreak).toHaveBeenCalledWith('s1', 'Troco errado'));
  });
});

describe('Minha gorjeta (critério 7)', () => {
  it('mostra o próprio extrato e diz que o repasse é da folha', async () => {
    api.getMyTips.mockResolvedValue([{ businessDate: '2026-11-04', role: 'waiter', amountCents: 2550, mode: 'equal' }]);
    const view = render(<MyTipsPanel />);
    expect(await view.findByText(/25,50/)).toBeTruthy();
    expect(view.getByText(/04\/11 · Garçom/)).toBeTruthy();
    expect(view.getByText(/na folha/)).toBeTruthy();
  });

  it('sem nada apurado, não aparece', async () => {
    const view = render(<MyTipsPanel />);
    await waitFor(() => expect(api.getMyTips).toHaveBeenCalled());
    expect(view.queryByText('Minha gorjeta')).toBeNull();
  });
});

describe('Estornar valor e reabrir (critério 8)', () => {
  const payment = { paymentId: 'p1', method: 'pix', provider: 'asaas', amountCents: 5000, availableCents: 5000, createdAt: '', tableSessionId: 's1', orderId: null, tableNumber: '4', pendingApproval: false };

  it('estorno exige motivo e vai em centavos', async () => {
    api.getRefundablePayments.mockResolvedValue([payment]);
    const view = render(<PaymentActionsPanel />);
    fireEvent.press(await view.findByText('Estornar valor'));
    fireEvent.press(view.getByText('Pedir'));
    expect(api.requestRefund).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByLabelText('Valor do estorno'), '1500');
    fireEvent.changeText(view.getByLabelText('Motivo'), 'Prato errado');
    fireEvent.press(view.getByText('Pedir'));
    await waitFor(() => expect(api.requestRefund).toHaveBeenCalledWith('p1', 'Prato errado', 1500));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Pedido registrado', expect.stringContaining('aprovar')));
  });

  it('reabrir diz que nada é estornado sozinho', async () => {
    api.getRefundablePayments.mockResolvedValue([payment]);
    const view = render(<PaymentActionsPanel />);
    fireEvent.press(await view.findByText('Reabrir'));
    expect(view.getByText(/Nada é estornado sozinho/)).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Motivo'), 'Faltou a sobremesa');
    fireEvent.press(view.getByText('Pedir'));
    await waitFor(() => expect(api.requestBillReopen).toHaveBeenCalledWith('s1', 'Faltou a sobremesa'));
  });

  it('com aprovação pendente, não pede de novo', async () => {
    api.getRefundablePayments.mockResolvedValue([{ ...payment, pendingApproval: true }]);
    const view = render(<PaymentActionsPanel />);
    expect(await view.findByText(/aguardando aprovação/)).toBeTruthy();
    fireEvent.press(view.getByText('Estornar valor'));
    expect(view.queryByText('Pedir')).toBeNull();
  });
});
