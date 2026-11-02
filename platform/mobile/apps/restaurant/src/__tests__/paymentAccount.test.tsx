/**
 * Conta de recebimento (ADR-020): o dono cadastra, o gerente só acompanha, e a tela nunca
 * mostra a conta como ativa antes de o servidor dizer que o KYC terminou.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PaymentAccountScreen from '../screens/v2/config/PaymentAccountScreen';

jest.mock('lucide-react-native', () => ({ Landmark: 'Landmark' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({
  V2Shell: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../screens/v2/config/ConfigSectionCard', () => {
  const { Text, View } = require('react-native');
  return { ConfigSectionCard: ({ title, children }: any) => <View><Text>{title}</Text>{children}</View> };
});

const mockRole = jest.fn();
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: () => mockRole() }));

const mockOpen = jest.fn();
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...args: unknown[]) => mockOpen(...args) }));

const mockGet = jest.fn();
const mockStart = jest.fn();
jest.mock('@okinawa/shared/services/supabase-api', () => ({
  supabaseApiAdapter: {
    getPaymentAccount: (...args: unknown[]) => mockGet(...args),
    startPaymentAccount: (...args: unknown[]) => mockStart(...args),
  },
}));

const fill = (screen: ReturnType<typeof render>) => {
  const values: Record<string, string> = {
    'Razão social': 'Bistrô LTDA', CNPJ: '11222333000181', 'E-mail da conta': 'dono@bistro.test', 'Celular com DDD': '11987650000',
    'Faturamento mensal (R$)': '50.000', CEP: '01310100', 'Endereço': 'Av. Paulista', 'Número': '1000', Bairro: 'Bela Vista',
  };
  Object.entries(values).forEach(([label, value]) => fireEvent.changeText(screen.getByLabelText(label), value));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockReturnValue({ restaurantId: 'r1', serverRole: 'owner' });
});

test('dono sem conta preenche o formulário; a renda vai em centavos', async () => {
  mockGet.mockResolvedValue({ status: 'none', onboardingUrl: null });
  mockStart.mockResolvedValue({ status: 'pending_kyc', onboardingUrl: 'https://asaas.test/link' });
  const screen = render(<PaymentAccountScreen />);
  await waitFor(() => screen.getByText('Cadastrar conta'));
  fill(screen);
  fireEvent.press(screen.getByText('Cadastrar conta'));
  await waitFor(() => screen.getByText('Aguardando aprovação'));
  expect(mockStart).toHaveBeenCalledTimes(1);
  const [restaurantId, account] = mockStart.mock.calls[0];
  expect(restaurantId).toBe('r1');
  expect(account.incomeCents).toBe(5_000_000);
  expect(account.income).toBeUndefined();
  expect(account.cnpj).toBe('11222333000181');
  expect(account.companyType).toBe('LIMITED');
});

test('formulário incompleto não chama o servidor', async () => {
  mockGet.mockResolvedValue({ status: 'none', onboardingUrl: null });
  const screen = render(<PaymentAccountScreen />);
  await waitFor(() => screen.getByText('Cadastrar conta'));
  fireEvent.press(screen.getByText('Cadastrar conta'));
  await waitFor(() => screen.getByText('Preencha todos os campos.'));
  expect(mockStart).not.toHaveBeenCalled();
});

test('gerente vê a situação, mas não o formulário', async () => {
  mockRole.mockReturnValue({ restaurantId: 'r1', serverRole: 'manager' });
  mockGet.mockResolvedValue({ status: 'none', onboardingUrl: null });
  const screen = render(<PaymentAccountScreen />);
  await waitFor(() => screen.getByText('Sem conta de recebimento'));
  expect(screen.queryByText('Cadastrar conta')).toBeNull();
});

test('pendente abre o link de documentos e não diz que está ativo', async () => {
  mockGet.mockResolvedValue({ status: 'pending_kyc', onboardingUrl: 'https://asaas.test/link' });
  const screen = render(<PaymentAccountScreen />);
  await waitFor(() => screen.getByText('Enviar documentos'));
  expect(screen.queryByText('Pagamento online ativo')).toBeNull();
  fireEvent.press(screen.getByText('Enviar documentos'));
  expect(mockOpen).toHaveBeenCalledWith('https://asaas.test/link');
});

test('ativa só quando o servidor responde active', async () => {
  mockGet.mockResolvedValue({ status: 'active', onboardingUrl: null });
  const screen = render(<PaymentAccountScreen />);
  await waitFor(() => screen.getByText('Pagamento online ativo'));
  expect(screen.queryByText('Enviar documentos')).toBeNull();
});

test('erros do servidor viram mensagem em português', async () => {
  mockGet.mockResolvedValue({ status: 'none', onboardingUrl: null });
  mockStart.mockRejectedValue(Object.assign(new Error('x'), { code: 'provider_account_exists' }));
  const screen = render(<PaymentAccountScreen />);
  await waitFor(() => screen.getByText('Cadastrar conta'));
  fill(screen);
  fireEvent.press(screen.getByText('Cadastrar conta'));
  await waitFor(() => screen.getByText(/Este CNPJ já tem uma conta no Asaas/));
});
