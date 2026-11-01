import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockResolve = jest.fn();
const mockCheckIn = jest.fn();
const mockDevCheckIn = jest.fn();
jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: {
    resolveServiceQr: (...args: unknown[]) => mockResolve(...args),
    checkIn: (...args: unknown[]) => mockCheckIn(...args),
    devCheckIn: (...args: unknown[]) => mockDevCheckIn(...args),
    getActiveVisit: () => Promise.resolve(null),
  },
}));

import { VisitSessionProvider, useVisitSession } from '../contexts/VisitSessionContext';

const QR = 'noowe://t/abc12345';
const visit = { restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '1' };
const table = (overrides: Record<string, unknown>) => ({
  kind: 'table', restaurantId: 'r1', serviceModel: 'casual_dining', tableId: 't1', tableQrId: 'q1',
  allowedServiceModels: ['casual_dining'], seats: 4, hasActiveSession: false, isParticipant: false, ...overrides,
});

function setup() {
  return renderHook(() => useVisitSession(), { wrapper: ({ children }) => <VisitSessionProvider>{children}</VisitSessionProvider> });
}

describe('openFromQr — pergunta de nº de pessoas (ADR-016)', () => {
  beforeEach(() => { mockCheckIn.mockResolvedValue(visit); mockDevCheckIn.mockResolvedValue(visit); });
  afterEach(() => jest.clearAllMocks());

  it('Casual abrindo a mesa pergunta e envia o tamanho do grupo', async () => {
    mockResolve.mockResolvedValue(table({}));
    const ask = jest.fn().mockResolvedValue(3);
    const { result } = setup();
    await act(async () => { await result.current.openFromQr(QR, { askPartySize: ask }); });
    expect(ask).toHaveBeenCalledWith({ seats: 4 });
    expect(mockCheckIn).toHaveBeenCalledWith(QR, 'casual_dining', 3);
  });

  it('Fine não pergunta: o grupo vem da reserva ou da fila', async () => {
    mockResolve.mockResolvedValue(table({ serviceModel: 'fine_dining', asksPartySize: false }));
    const ask = jest.fn();
    const { result } = setup();
    await act(async () => { await result.current.openFromQr(QR, { askPartySize: ask }); });
    expect(ask).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledWith(QR, 'fine_dining', undefined);
  });

  it('quem entra numa mesa já aberta não é perguntado', async () => {
    mockResolve.mockResolvedValue(table({ hasActiveSession: true }));
    const ask = jest.fn();
    const { result } = setup();
    await act(async () => { await result.current.openFromQr(QR, { askPartySize: ask }); });
    expect(ask).not.toHaveBeenCalled();
  });

  it('desistir na pergunta não chama o servidor', async () => {
    mockResolve.mockResolvedValue(table({}));
    const { result } = setup();
    await act(async () => {
      await expect(result.current.openFromQr(QR, { askPartySize: () => Promise.resolve(null) })).rejects.toThrow('QR check-in cancelled');
    });
    expect(mockCheckIn).not.toHaveBeenCalled();
  });

  it('restaurante fechado avisa antes de perguntar e não faz check-in (P0010)', async () => {
    mockResolve.mockResolvedValue(table({ isOpen: false }));
    const ask = jest.fn();
    const { result } = setup();
    await act(async () => {
      await expect(result.current.openFromQr(QR, { askPartySize: ask })).rejects.toMatchObject({ code: 'P0010' });
    });
    expect(ask).not.toHaveBeenCalled();
    expect(mockCheckIn).not.toHaveBeenCalled();
  });

  it('fechado no emulador (dev) segue para o check-in', async () => {
    mockResolve.mockResolvedValue(table({ isOpen: false }));
    const { result } = setup();
    await act(async () => { await result.current.openFromQr(QR, { dev: true }); });
    expect(mockDevCheckIn).toHaveBeenCalled();
  });

  it('isOpen true ou ausente mantém o fluxo atual', async () => {
    mockResolve.mockResolvedValue(table({ isOpen: true }));
    const ask = jest.fn().mockResolvedValue(2);
    const { result } = setup();
    await act(async () => { await result.current.openFromQr(QR, { askPartySize: ask }); });
    expect(ask).toHaveBeenCalled();
  });
});
