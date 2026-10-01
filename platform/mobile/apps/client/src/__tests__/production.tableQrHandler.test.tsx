import React from 'react';
import { Alert } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';

// The shared logger transitively loads @sentry/react-native which is shipped
// as ESM and blows up jest's CJS runtime. The hook only calls logger.error,
// so a stub is enough here.
jest.mock('@okinawa/shared/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { useTableQrHandler } from '../hooks/useTableQrHandler';

const QR = 'noowe://t/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const mockOpenFromQr = jest.fn();
jest.mock('../contexts/VisitSessionContext', () => {
  class QrCheckInCancelled extends Error {}
  return { QrCheckInCancelled, useVisitSession: () => ({ openFromQr: mockOpenFromQr }) };
});

const mockGetRestaurant = jest.fn();
jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: { getRestaurant: (id: string) => mockGetRestaurant(id) },
}));

const mockClearCart = jest.fn();
let mockCart = { items: [] as { id: string }[], restaurantId: null as string | null, clearCart: mockClearCart };
jest.mock('@/shared/contexts/CartContext', () => ({
  useCart: () => mockCart,
}));

function renderTableQrHandler() {
  return renderHook(() => useTableQrHandler());
}

describe('useTableQrHandler — classifies customer_open_table_session errors', () => {
  beforeEach(() => {
    mockCart = { items: [], restaurantId: null, clearCart: mockClearCart };
  });

  afterEach(() => jest.clearAllMocks());

  it('returns ok with the restaurantId on success', async () => {
    mockOpenFromQr.mockResolvedValueOnce({ restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '10' });
    const { result } = renderTableQrHandler();

    let outcome: Awaited<ReturnType<typeof result.current.handleQrScanned>>;
    await act(async () => {
      outcome = await result.current.handleQrScanned(QR);
    });

    expect(outcome!).toEqual({ ok: true, restaurantId: 'r1' });
  });

  it.each([
    ['22023', 'invalid'],
    ['P0006', 'replaced'],
    ['P0007', 'expired'],
    ['P0005', 'table_unavailable'],
    ['P0002', 'invalid'],
    ['P0008', 'awaiting_capacity'],
    ['P0010', 'closed'],
    ['P0004', 'active_account'],
    ['28000', 'network'],
    ['ECONNABORTED', 'network'],
  ])('maps errcode %s to reason "%s"', async (code, expectedReason) => {
    mockOpenFromQr.mockRejectedValueOnce({ code, message: 'RPC failure' });
    const { result } = renderTableQrHandler();

    let outcome: Awaited<ReturnType<typeof result.current.handleQrScanned>>;
    await act(async () => {
      outcome = await result.current.handleQrScanned(QR);
    });

    expect(outcome!).toEqual({ ok: false, reason: expectedReason });
  });

  it('treats a thrown non-object value as a network error', async () => {
    mockOpenFromQr.mockRejectedValueOnce('timeout');
    const { result } = renderTableQrHandler();

    let outcome: Awaited<ReturnType<typeof result.current.handleQrScanned>>;
    await act(async () => {
      outcome = await result.current.handleQrScanned(QR);
    });

    expect(outcome!).toEqual({ ok: false, reason: 'network' });
  });

  it('offers to clear the cart on a counter QR when it belongs to a different restaurant', async () => {
    mockCart = { items: [{ id: 'item-1' }], restaurantId: 'other-restaurant', clearCart: mockClearCart };
    mockOpenFromQr.mockResolvedValueOnce({ restaurantId: 'r1', tableId: '', tableSessionId: '', tableNumber: 'Balcão' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const clearButton = buttons?.find((b) => b.text === 'Limpar carrinho');
      clearButton?.onPress?.();
    });

    const { result } = renderTableQrHandler();
    let outcome: Awaited<ReturnType<typeof result.current.handleQrScanned>>;
    await act(async () => {
      outcome = await result.current.handleQrScanned(QR);
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(mockClearCart).toHaveBeenCalled();
    expect(outcome!).toEqual({ ok: true, restaurantId: 'r1' });
  });

  it('does not prompt about the cart when it already belongs to the same restaurant', async () => {
    mockCart = { items: [{ id: 'item-1' }], restaurantId: 'r1', clearCart: mockClearCart };
    mockOpenFromQr.mockResolvedValueOnce({ restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '10' });
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderTableQrHandler();
    await act(async () => {
      await result.current.handleQrScanned(QR);
    });

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not prompt about the cart on a table session — SessionCartSync already handles it', async () => {
    mockCart = { items: [{ id: 'item-1' }], restaurantId: 'other-restaurant', clearCart: mockClearCart };
    mockOpenFromQr.mockResolvedValueOnce({ restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '10' });
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderTableQrHandler();
    await act(async () => {
      await result.current.handleQrScanned(QR);
    });

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('tells "reserva necessária" apart from "mesa indisponível" (both P0005)', async () => {
    mockOpenFromQr.mockRejectedValueOnce({ code: 'P0005', message: 'Check-in exige reserva confirmada ou chamada válida da fila' });
    const { result } = renderTableQrHandler();
    let outcome: Awaited<ReturnType<typeof result.current.handleQrScanned>>;
    await act(async () => {
      outcome = await result.current.handleQrScanned(QR);
    });
    expect(outcome!).toEqual({ ok: false, reason: 'booking_required' });
  });
});

describe('useTableQrHandler — QR que não é do NOOWE', () => {
  afterEach(() => jest.clearAllMocks());

  it.each([
    'https://google.com',
    'https://noowe.app/t/0123456789abcdef',
    'texto qualquer que passa de oito caracteres',
    'noowe://t/curto',
    'noowe://other/0123456789abcdef',
    '',
  ])('recusa "%s" sem chamar o servidor', async (payload) => {
    const { result } = renderTableQrHandler();
    let outcome: Awaited<ReturnType<typeof result.current.handleQrScanned>>;
    await act(async () => {
      outcome = await result.current.handleQrScanned(payload);
    });
    expect(outcome!).toEqual({ ok: false, reason: 'not_noowe' });
    expect(mockOpenFromQr).not.toHaveBeenCalled();
  });

  it('aceita o QR de balcão e ignora quebra de linha no fim', async () => {
    mockOpenFromQr.mockResolvedValueOnce({ restaurantId: 'r1', tableId: '', tableSessionId: '', tableNumber: 'Balcão' });
    const { result } = renderTableQrHandler();
    await act(async () => {
      await result.current.handleQrScanned('noowe://counter/0123456789abcdef\r\n');
    });
    expect(mockOpenFromQr).toHaveBeenCalledWith('noowe://counter/0123456789abcdef', expect.anything());
  });
});

describe('useTableQrHandler — QR de outro restaurante', () => {
  const context = { id: 'atelie', name: 'Ateliê Noowe' };

  beforeEach(() => {
    mockCart = { items: [{ id: 'item-1' }], restaurantId: 'atelie', clearCart: mockClearCart };
    mockGetRestaurant.mockResolvedValue({ id: 'parrilaria', name: 'Parrilaria Noowe' });
  });
  afterEach(() => jest.clearAllMocks());

  /** openFromQr real: resolve -> beforeCheckIn -> check-in. */
  function fakeOpenFromQr(qrRestaurantId: string) {
    mockOpenFromQr.mockImplementationOnce(async (_qr: string, options?: { beforeCheckIn?: (r: unknown) => Promise<boolean> }) => {
      const allowed = options?.beforeCheckIn
        ? await options.beforeCheckIn({ kind: 'table', restaurantId: qrRestaurantId })
        : true;
      if (!allowed) {
        const { QrCheckInCancelled } = jest.requireMock('../contexts/VisitSessionContext');
        throw new QrCheckInCancelled();
      }
      return { restaurantId: qrRestaurantId, tableId: 't1', tableSessionId: 's1', tableNumber: '3' };
    });
  }

  it('recusa o QR de outro restaurante: sem alerta do hook, sem check-in, sem buscar nem nomear o outro restaurante', async () => {
    fakeOpenFromQr('parrilaria');
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderTableQrHandler();
    let outcome: Awaited<ReturnType<typeof result.current.handleQrScanned>>;
    await act(async () => {
      outcome = await result.current.handleQrScanned(QR, { contextRestaurant: context });
    });

    expect(outcome!).toEqual({ ok: false, reason: 'other_restaurant' });
    expect(mockGetRestaurant).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockClearCart).not.toHaveBeenCalled();
  });

  it('QR do próprio restaurante não pergunta nada', async () => {
    fakeOpenFromQr('atelie');
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderTableQrHandler();
    let outcome: Awaited<ReturnType<typeof result.current.handleQrScanned>>;
    await act(async () => {
      outcome = await result.current.handleQrScanned(QR, { contextRestaurant: context });
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(outcome!).toEqual({ ok: true, restaurantId: 'atelie' });
  });
});
