/**
 * Cadastro fiscal e notas com problema (ADR-030): o gerente cadastra, vê a nota bloqueada, corrige
 * e reenvia. O token sai do formulário direto para o servidor e nunca volta para a tela.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import FiscalSetupScreen from '../screens/fiscal/FiscalSetupScreen';
import FiscalDocumentsScreen from '../screens/fiscal/FiscalDocumentsScreen';
import { calculateFiscalProgress } from '../screens/v2/config/configTypes';

jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, name) => String(name) }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({
  V2Shell: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../screens/v2/config/ConfigSectionCard', () => {
  const { Text, View } = require('react-native');
  return { ConfigSectionCard: ({ title, children }: any) => <View><Text>{title}</Text>{children}</View> };
});
jest.mock('../contexts/RestaurantRoleContext', () => ({
  useRestaurantRole: () => ({ restaurantId: 'r1', serverRole: 'manager' }),
}));

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

const mockGetConfig = jest.fn();
const mockSaveConfig = jest.fn();
const mockGetIssues = jest.fn();
const mockRetry = jest.fn();
jest.mock('@okinawa/shared/services/supabase-api', () => ({
  supabaseApiAdapter: {
    getFiscalConfig: (...args: unknown[]) => mockGetConfig(...args),
    saveFiscalConfig: (...args: unknown[]) => mockSaveConfig(...args),
    getFiscalIssues: (...args: unknown[]) => mockGetIssues(...args),
    retryFiscalDocument: (...args: unknown[]) => mockRetry(...args),
  },
}));

const SAVED_CONFIG = {
  cnpj: '11222333000181', ie: null, razaoSocial: 'Casa LTDA', nomeFantasia: null, stateCode: 'SP',
  regimeTributario: 'lucro_real', environment: 'homologation', serviceFeeInDocument: false, isActive: true, hasToken: true,
  taxDefaults: { ncm: '21069090', cfop: '5102', icms_origem: '0', icms_situacao_tributaria: '102', pis_situacao_tributaria: '49', cofins_situacao_tributaria: '49' },
};

const fillForm = (screen: ReturnType<typeof render>) => {
  const values: Record<string, string> = {
    CNPJ: '11.222.333/0001-81', 'Razão social': 'Casa LTDA', UF: 'sp', 'NCM padrão': '21069090', 'CFOP padrão': '5102',
    'Origem do ICMS': '0', 'Situação tributária do ICMS': '102', 'Situação tributária do PIS': '49', 'Situação tributária do COFINS': '49',
  };
  Object.entries(values).forEach(([label, value]) => fireEvent.changeText(screen.getByLabelText(label), value));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cadastro fiscal', () => {
  test('primeiro cadastro: o formulário não pede certificado nem CSC e não vem preenchido', async () => {
    mockGetConfig.mockResolvedValue({ config: null, openIssues: 0 });
    const screen = render(<FiscalSetupScreen />);
    await waitFor(() => screen.getByText('Salvar cadastro'));
    expect(screen.queryByText(/enviar certificado/i)).toBeNull();
    expect(screen.queryByLabelText(/CSC/)).toBeNull();
    expect(screen.getByLabelText('NCM padrão').props.value).toBe('');
    expect(screen.getByLabelText('CFOP padrão').props.value).toBe('');
    expect(screen.getByLabelText('Token da Focus NFe').props.secureTextEntry).toBe(true);
    screen.getByText('Ambiente: homologação');
  });

  test('sem token, o primeiro cadastro não chama o servidor', async () => {
    mockGetConfig.mockResolvedValue({ config: null, openIssues: 0 });
    const screen = render(<FiscalSetupScreen />);
    await waitFor(() => screen.getByText('Salvar cadastro'));
    fillForm(screen);
    fireEvent.press(screen.getByText('Salvar cadastro'));
    await waitFor(() => screen.getByText('Informe o token da Focus NFe.'));
    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  test('dado fora do formato não chama o servidor', async () => {
    mockGetConfig.mockResolvedValue({ config: null, openIssues: 0 });
    const screen = render(<FiscalSetupScreen />);
    await waitFor(() => screen.getByText('Salvar cadastro'));
    fillForm(screen);
    fireEvent.changeText(screen.getByLabelText('NCM padrão'), '00000000');
    fireEvent.changeText(screen.getByLabelText('Token da Focus NFe'), 'tok-1');
    fireEvent.press(screen.getByText('Salvar cadastro'));
    await waitFor(() => screen.getByText('Informe o NCM padrão com 8 dígitos.'));
    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  test('salva sem escolher ambiente e limpa o token da tela', async () => {
    mockGetConfig.mockResolvedValue({ config: null, openIssues: 0 });
    mockSaveConfig.mockResolvedValue(SAVED_CONFIG);
    const screen = render(<FiscalSetupScreen />);
    await waitFor(() => screen.getByText('Salvar cadastro'));
    fillForm(screen);
    fireEvent.press(screen.getByText('Lucro Real'));
    fireEvent.changeText(screen.getByLabelText('Token da Focus NFe'), 'tok-1');
    fireEvent.press(screen.getByText('Salvar cadastro'));
    await waitFor(() => screen.getByTestId('fiscal-setup-saved'));

    const [restaurantId, config, token] = mockSaveConfig.mock.calls[0];
    expect(restaurantId).toBe('r1');
    expect(token).toBe('tok-1');
    expect(config.environment).toBeUndefined();
    expect(config.isActive).toBeUndefined();
    expect(config.regimeTributario).toBe('lucro_real');
    expect(config.stateCode).toBe('SP');
    expect(config.taxDefaults.icms_situacao_tributaria).toBe('102');
    expect(JSON.stringify(config)).not.toContain('tok-1');
    expect(screen.getByLabelText('Token da Focus NFe').props.value).toBe('');
    expect(screen.getByTestId('fiscal-token-status').props.children).toMatch(/Já existe um token/);
  });

  test('corrigir traz o cadastro atual e o token em branco mantém o guardado', async () => {
    mockGetConfig.mockResolvedValue({ config: SAVED_CONFIG, openIssues: 1 });
    mockSaveConfig.mockResolvedValue(SAVED_CONFIG);
    const screen = render(<FiscalSetupScreen />);
    await waitFor(() => screen.getByText('Salvar cadastro'));
    expect(screen.getByLabelText('NCM padrão').props.value).toBe('21069090');
    expect(screen.getByLabelText('Token da Focus NFe').props.value).toBe('');
    fireEvent.changeText(screen.getByLabelText('NCM padrão'), '19059090');
    fireEvent.press(screen.getByText('Salvar cadastro'));
    await waitFor(() => screen.getByText(/não voltam sozinhas/));
    expect(mockSaveConfig.mock.calls[0][1].taxDefaults.ncm).toBe('19059090');
    expect(mockSaveConfig.mock.calls[0][2]).toBe('');
  });

  test('mostra as notas paradas e leva para a lista', async () => {
    mockGetConfig.mockResolvedValue({ config: SAVED_CONFIG, openIssues: 2 });
    const screen = render(<FiscalSetupScreen />);
    await waitFor(() => screen.getByText('Notas com problema (2)'));
    fireEvent.press(screen.getByText('Notas com problema (2)'));
    expect(mockNavigate).toHaveBeenCalledWith('FiscalDocuments');
  });

  test('erro do servidor aparece em português', async () => {
    mockGetConfig.mockResolvedValue({ config: SAVED_CONFIG, openIssues: 0 });
    mockSaveConfig.mockRejectedValue({ code: '42501', message: 'Sem permissão para este restaurante' });
    const screen = render(<FiscalSetupScreen />);
    await waitFor(() => screen.getByText('Salvar cadastro'));
    fireEvent.press(screen.getByText('Salvar cadastro'));
    await waitFor(() => screen.getByText('Sem permissão para este restaurante'));
    expect(screen.queryByTestId('fiscal-setup-saved')).toBeNull();
  });
});

describe('notas com problema', () => {
  const ISSUES = [
    { id: 'd1', status: 'blocked', error_message: 'Dados fiscais incompletos: ncm: Prato', total_cents: 6000, created_at: '2026-11-02T18:00:00Z', table_sessions: { tables: { table_number: '5' } }, orders: null },
    { id: 'd2', status: 'rejected', error_message: 'Rejeição 704', total_cents: 123456, created_at: '2026-11-02T18:00:00Z', table_sessions: null, orders: { order_number: 'A12' } },
    { id: 'd3', status: 'failed', error_message: null, total_cents: 100, created_at: '2026-11-02T18:00:00Z', table_sessions: null, orders: null },
  ];

  test('lista cada nota com o motivo, o estado e o valor formatado', async () => {
    mockGetIssues.mockResolvedValue(ISSUES);
    const screen = render(<FiscalDocumentsScreen />);
    await waitFor(() => screen.getByText('Mesa 5'));
    expect(mockGetIssues).toHaveBeenCalledWith('r1');
    screen.getByText('Dados fiscais incompletos: ncm: Prato');
    screen.getByText('Bloqueada');
    screen.getByText('Pedido A12');
    screen.getByText('Rejeição 704');
    screen.getByText('Rejeitada');
    screen.getByText('Falhou');
    screen.getByText('O emissor não informou o motivo.');
    screen.getByText(/R\$ 1\.234,56/);
  });

  test('lista vazia diz que não há problema', async () => {
    mockGetIssues.mockResolvedValue([]);
    const screen = render(<FiscalDocumentsScreen />);
    await waitFor(() => screen.getByText('Nenhuma nota com problema.'));
  });

  test('reenviar exige motivo, manda o motivo e tira a nota da lista', async () => {
    mockGetIssues.mockResolvedValue([ISSUES[0]]);
    mockRetry.mockResolvedValue({ documentId: 'd1', status: 'pending' });
    const screen = render(<FiscalDocumentsScreen />);
    await waitFor(() => screen.getByText('Mesa 5'));
    fireEvent.press(screen.getByText('Reenviar'));

    fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
    expect(mockRetry).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('confirm-dialog-reason'), '  NCM corrigido  ');
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
    });
    expect(mockRetry).toHaveBeenCalledWith('d1', 'NCM corrigido');
    await waitFor(() => screen.getByTestId('fiscal-documents-notice'));
    expect(screen.queryByText('Mesa 5')).toBeNull();
  });

  test('falha no reenvio mantém a nota e avisa', async () => {
    mockGetIssues.mockResolvedValue([ISSUES[0]]);
    mockRetry.mockRejectedValue({ code: 'P0001', message: 'Documento fiscal não pode ser reenviado neste estado' });
    const screen = render(<FiscalDocumentsScreen />);
    await waitFor(() => screen.getByText('Mesa 5'));
    fireEvent.press(screen.getByText('Reenviar'));
    fireEvent.changeText(screen.getByTestId('confirm-dialog-reason'), 'tentativa');
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
    });
    await waitFor(() => screen.getByText('Documento fiscal não pode ser reenviado neste estado'));
    screen.getByText('Mesa 5');
    expect(screen.queryByTestId('fiscal-documents-notice')).toBeNull();
  });

  test('corrigir cadastro leva para a tela de cadastro', async () => {
    mockGetIssues.mockResolvedValue([ISSUES[0]]);
    const screen = render(<FiscalDocumentsScreen />);
    await waitFor(() => screen.getByText('Corrigir cadastro'));
    fireEvent.press(screen.getByText('Corrigir cadastro'));
    expect(mockNavigate).toHaveBeenCalledWith('FiscalSetup');
  });
});

describe('módulo fiscal no hub', () => {
  test('cadastro sem token ou com nota parada não aparece como completo', () => {
    expect(calculateFiscalProgress(null)).toBe(0);
    expect(calculateFiscalProgress({ config: null, openIssues: 0 })).toBe(0);
    expect(calculateFiscalProgress({ config: { hasToken: false }, openIssues: 0 })).toBe(0);
    expect(calculateFiscalProgress({ config: { hasToken: true }, openIssues: 1 })).toBeLessThan(70);
    expect(calculateFiscalProgress({ config: { hasToken: true }, openIssues: 0 })).toBe(100);
  });
});
