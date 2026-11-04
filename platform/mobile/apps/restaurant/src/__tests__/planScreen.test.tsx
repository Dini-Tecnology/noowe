import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PlanScreen from '../screens/v2/config/PlanScreen';
import { PlanGateBanner } from '../screens/v2/shared/PlanGateBanner';
import { planChangeKind, usagePercent } from '../screens/v2/config/planView';

const mockApi = {
  getPlanSummary: jest.fn(), listPlans: jest.fn(), choosePlan: jest.fn(), changePlan: jest.fn(), cancelSubscription: jest.fn(),
  listInvoices: jest.fn(), getCredits: jest.fn(), applyPromoCode: jest.fn(),
};
let mockRoles = ['owner'];
const mockNavigate = jest.fn();
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (fn: () => void) => { const React = require('react'); React.useEffect(() => { fn(); }, [fn]); },
}));
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: () => ({ restaurantId: 'r1', serverRoles: mockRoles }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({ V2Shell: ({ children, title }: any) => { const { Text } = require('react-native'); return <>{<Text>{title}</Text>}{children}</>; } }));
jest.mock('@okinawa/shared/utils/user-error-message', () => ({ userErrorMessage: (_: unknown, fallback: string) => fallback }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ get supabaseApiAdapter() { return mockApi; } }));
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const api = mockApi;

const plans = [
  { code: 'essencial', name: 'Essencial', isContract: false, monthlyCents: 19900, annualCents: 199000, annualSavingsCents: 39800, orderAllowance: 1000, overageCents: 15, features: ['menu'], suggested: false },
  { code: 'profissional', name: 'Profissional', isContract: false, monthlyCents: 34900, annualCents: 349000, annualSavingsCents: 69800, orderAllowance: 3000, overageCents: 15, features: ['menu', 'reservations'], suggested: true },
  { code: 'enterprise', name: 'Enterprise', isContract: true, monthlyCents: null, annualCents: null, annualSavingsCents: null, orderAllowance: null, overageCents: null, features: [], suggested: false },
];
const active = { needsChoice: false, planCode: 'essencial', planName: 'Essencial', isContract: false, cycle: 'monthly', status: 'active', priceCents: 19900, periodEnd: '2026-12-04', locked: ['reservations'],
  usage: { orders: 900, allowance: 1000, projectedOrders: 1100, projectedOverageCents: 1500, overageCents: 0 }, promo: { code: 'METADE', endsAt: '2027-01-04', startsWithFirstInvoice: false, priceAfterCents: 19900 }, category: null };
const credits = { indexBps: 5000, tierCode: 'silver', paidCents: 900000, revenueCents: 1800000, minVolumeCents: 800000, marks: [{ code: 'silver', name: 'Prata', minIndexBps: 4000, creditBps: 500 }], forecastCents: 995,
  nextTier: { name: 'Ouro', missingCents: 450000 }, balanceCents: 500, toRelease: [{ amountCents: 3980, availableFrom: '2027-01-01' }], expiringSoonCents: 100, statement: [{ kind: 'generated', amountCents: 3980, at: '2026-11-01', invoiceId: null, month: '2026-10-01' }] };

beforeEach(() => {
  jest.clearAllMocks();
  mockRoles = ['owner'];
  api.listPlans.mockResolvedValue(plans);
  api.getPlanSummary.mockResolvedValue(active);
  api.listInvoices.mockResolvedValue([{ id: 'i1', kind: 'renewal', status: 'overdue', totalCents: 9950, dueAt: '', paidAt: null, periodStart: '2026-11-04', periodEnd: '', checkoutUrl: 'https://asaas/i', nfseStatus: 'waiting_company_data', nfseUrl: null, lines: [{ kind: 'plan', description: 'Plano Essencial', amountCents: 19900 }, { kind: 'promo', description: 'Código promocional METADE', amountCents: -9950 }] }]);
  api.getCredits.mockResolvedValue(credits);
  api.choosePlan.mockResolvedValue(active);
  api.changePlan.mockResolvedValue(active);
  api.applyPromoCode.mockResolvedValue(active);
  api.cancelSubscription.mockResolvedValue(active);
});

describe('Escolha seu plano (M4, critérios 10, 11 e 12)', () => {
  beforeEach(() => api.getPlanSummary.mockResolvedValue({ needsChoice: true, trialDays: 30 }));

  it('mostra sugestão e teste sem cartão, e começa o teste', async () => {
    const view = render(<PlanScreen />);
    expect((await view.findAllByText('Escolha seu plano')).length).toBeGreaterThan(0);
    expect(view.getByText(/30 dias de teste, sem cartão/)).toBeTruthy();
    expect(view.getByText(/Profissional · Sugerido/)).toBeTruthy();
    fireEvent.press(view.getAllByText('Começar o teste')[0]);
    await waitFor(() => expect(api.choosePlan).toHaveBeenCalledWith('r1', 'essencial', 'monthly'));
  });

  it('Enterprise é sob consulta', async () => {
    const view = render(<PlanScreen />);
    expect(await view.findByText('Sob consulta')).toBeTruthy();
    fireEvent.press(view.getByText('Falar com a NOOWE'));
    expect(alert).toHaveBeenCalledWith('Falar com a NOOWE', expect.any(String));
    expect(api.choosePlan).not.toHaveBeenCalled();
  });

  it('anual mostra a economia', async () => {
    const view = render(<PlanScreen />);
    fireEvent.press(await view.findByText('Anual'));
    expect(view.getAllByText(/Economize/).length).toBeGreaterThan(0);
  });
});

describe('Meu plano (M4 e M5)', () => {
  it('uso, previsão e código com até quando vale', async () => {
    const view = render(<PlanScreen />);
    expect(await view.findByText(/900 de 1000 pedidos/)).toBeTruthy();
    expect(view.getByText(/excedente de R\$\s15,00/)).toBeTruthy();
    expect(view.getByText(/Código METADE até/)).toBeTruthy();
  });

  it('créditos: índice, quanto falta, saldo, a liberar e extrato', async () => {
    const view = render(<PlanScreen />);
    expect(await view.findByText(/Índice do mês: 50% · Prata/)).toBeTruthy();
    expect(view.getByText(/Se mais R\$\s4\.500,00 forem pagos pelo app/)).toBeTruthy();
    expect(view.getByText(/Saldo: R\$\s5,00/)).toBeTruthy();
    expect(view.getByText(/A liberar:/)).toBeTruthy();
    expect(view.getByText('Gerado')).toBeTruthy();
  });

  it('recurso fora do plano aparece com cadeado para o Dono', async () => {
    const view = render(<PlanScreen />);
    expect(await view.findByText(/🔒 Reservas/)).toBeTruthy();
  });

  it('upgrade avisa que vale na hora; downgrade, no próximo ciclo', async () => {
    const view = render(<PlanScreen />);
    fireEvent.press((await view.findAllByText('Trocar para este'))[0]);
    expect(alert).toHaveBeenCalledWith('Trocar de plano', expect.stringContaining('diferença proporcional'), expect.anything());
    alert.mock.calls[0][2]!.find((b) => b.text === 'Trocar')!.onPress!();
    await waitFor(() => expect(api.changePlan).toHaveBeenCalledWith('r1', 'profissional', 'monthly'));
    expect(planChangeKind(plans as any, 'profissional', 'essencial')).toBe('downgrade');
  });

  it('fatura com linhas e link de pagamento', async () => {
    const view = render(<PlanScreen />);
    expect(await view.findByText(/Em atraso/)).toBeTruthy();
    expect(view.getByText('Código promocional METADE')).toBeTruthy();
    expect(view.getByText('Pagar')).toBeTruthy();
  });

  it('aplicar código e cancelar com motivo', async () => {
    const view = render(<PlanScreen />);
    fireEvent.changeText(await view.findByLabelText('Código promocional'), 'FUNDADOR');
    fireEvent.press(view.getByText('Aplicar'));
    await waitFor(() => expect(api.applyPromoCode).toHaveBeenCalledWith('r1', 'FUNDADOR'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Pronto', 'Código aplicado.'));
    fireEvent.press(view.getAllByText('Cancelar assinatura')[1]);
    expect(alert).toHaveBeenCalledWith('Motivo obrigatório', expect.any(String));
    fireEvent.changeText(view.getByLabelText('Motivo do cancelamento'), 'Fechando');
    fireEvent.press(view.getAllByText('Cancelar assinatura')[1]);
    const call = alert.mock.calls.find((c) => c[0] === 'Cancelar assinatura')!;
    expect(call[1]).toMatch(/sem reembolso/);
    call[2]!.find((b) => b.style === 'destructive')!.onPress!();
    await waitFor(() => expect(api.cancelSubscription).toHaveBeenCalledWith('r1', 'Fechando'));
  });

  it('barra de uso', () => {
    expect(usagePercent(500, 1000)).toBe(50);
    expect(usagePercent(5000, 1000)).toBe(100);
    expect(usagePercent(5, null)).toBe(0);
  });
});

describe('aviso de plano', () => {
  it('leva o Dono à escolha do plano', async () => {
    api.getPlanSummary.mockResolvedValue({ needsChoice: true });
    const view = render(<PlanGateBanner />);
    fireEvent.press(await view.findByText('Escolha seu plano'));
    expect(mockNavigate).toHaveBeenCalledWith('Plan');
  });

  it('atraso avisa sem bloquear', async () => {
    api.getPlanSummary.mockResolvedValue({ ...active, ordersSuspended: true });
    const view = render(<PlanGateBanner />);
    expect(await view.findByText(/Comandas abertas continuam/)).toBeTruthy();
  });

  it('quem não é Dono não vê nem consulta', async () => {
    mockRoles = ['manager'];
    const view = render(<PlanGateBanner />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(api.getPlanSummary).not.toHaveBeenCalled();
    expect(view.toJSON()).toBeNull();
  });
});
