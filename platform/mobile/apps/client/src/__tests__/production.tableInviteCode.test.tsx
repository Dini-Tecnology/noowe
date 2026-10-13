import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@okinawa/shared/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockInvoke = jest.fn();
jest.mock('@/shared/services/supabase', () => ({
  getSupabaseClient: () => ({
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    rpc: jest.fn(),
  }),
}));
jest.mock('expo-crypto', () => ({}));
jest.mock('@/shared/contexts/CartContext', () => ({
  useCart: () => ({ items: [], restaurantId: null, clearCart: jest.fn() }),
}));

import customerBackend from '../services/customer-backend';
import { VisitSessionProvider } from '../contexts/VisitSessionContext';
import { classifyInviteError, useTableInviteHandler } from '../hooks/useTableInviteHandler';
import { classifyQrPayload, extractInviteToken } from '../hooks/qr-payload';
import { formatInviteCode } from '../components/table/InviteToTableSheet';

const visit = { restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '1' };
const httpError = (status: number) => ({ message: 'Edge Function returned a non-2xx status code', context: { status } });

describe('joinTableByCode — Edge Function join-table-by-code (ADR-019)', () => {
  afterEach(() => jest.clearAllMocks());

  it('devolve a visita da sessão', async () => {
    mockInvoke.mockResolvedValue({ data: { visit }, error: null });
    await expect(customerBackend.joinTableByCode('123456')).resolves.toEqual(visit);
    expect(mockInvoke).toHaveBeenCalledWith('join-table-by-code', { body: { code: '123456' } });
  });

  it.each([
    [429, 'TOO_MANY_ATTEMPTS'],
    [404, 'P0001'],
    [400, '22023'],
  ])('HTTP %i vira o código %s', async (status, code) => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(status) });
    await expect(customerBackend.joinTableByCode('123456')).rejects.toMatchObject({ code });
  });

  it('lotação vira P0008 com o id da solicitação, nunca uma entrada silenciosa', async () => {
    mockInvoke.mockResolvedValue({ data: { visit: { status: 'awaiting_capacity', capacityRequestId: 'c1' } }, error: null });
    await expect(customerBackend.joinTableByCode('123456')).rejects.toMatchObject({ code: 'P0008', capacityRequestId: 'c1' });
  });

  it('falha sem resposta HTTP segue como erro de rede', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(customerBackend.joinTableByCode('123456')).rejects.toMatchObject({ message: 'Failed to fetch' });
  });
});

describe('classifyInviteError', () => {
  it.each([
    ['P0001', 'invalid'],
    ['P0008', 'awaiting_capacity'],
    ['TOO_MANY_ATTEMPTS', 'too_many'],
    ['22023', 'bad_format'],
    [undefined, 'network'],
    ['XX000', 'network'],
  ])('%s → %s', (code, reason) => {
    expect(classifyInviteError(code ? { code } : new Error('x'))).toBe(reason);
  });
});

describe('useTableInviteHandler — entrada por código', () => {
  const setup = () => renderHook(() => useTableInviteHandler(), {
    wrapper: ({ children }) => <VisitSessionProvider>{children}</VisitSessionProvider>,
  });
  afterEach(() => jest.clearAllMocks());

  it('código válido entra na mesa e devolve o restaurante', async () => {
    mockInvoke.mockResolvedValue({ data: { visit }, error: null });
    const { result } = setup();
    let outcome: Awaited<ReturnType<typeof result.current.handleInviteCode>>;
    await act(async () => { outcome = await result.current.handleInviteCode('123456'); });
    expect(outcome!).toEqual({ ok: true, restaurantId: 'r1' });
  });

  it('muitas tentativas é explicado, não vira "sem conexão"', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(429) });
    const { result } = setup();
    let outcome: Awaited<ReturnType<typeof result.current.handleInviteCode>>;
    await act(async () => { outcome = await result.current.handleInviteCode('123456'); });
    expect(outcome!).toEqual({ ok: false, reason: 'too_many' });
  });
});

describe('QR do convite e código', () => {
  it('o scanner reconhece o link de convite e extrai o token', () => {
    const token = 'a'.repeat(48);
    expect(extractInviteToken(`https://noowebr.com/t/invite/${token}`)).toBe(token);
    expect(extractInviteToken(`https://www.noowebr.com/t/invite/${token}\n`)).toBe(token);
  });
  it('outros links não são convite, e o convite não é QR de mesa', () => {
    expect(extractInviteToken('https://evil.example/t/invite/' + 'a'.repeat(48))).toBeNull();
    expect(extractInviteToken('https://noowebr.com/t/invite/curto')).toBeNull();
    expect(classifyQrPayload('https://noowebr.com/t/invite/' + 'a'.repeat(48))).toBeNull();
  });
  it('o código é mostrado em dois grupos de três', () => {
    expect(formatInviteCode('123456')).toBe('123 456');
  });
});
