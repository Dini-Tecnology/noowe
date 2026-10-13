import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
import Toast from 'react-native-toast-message';

const mockRefresh = jest.fn().mockResolvedValue(null);
let mockSession: { tableSessionId: string } | null = { tableSessionId: 's1' };
jest.mock('../contexts/VisitSessionContext', () => ({
  useVisitSession: () => ({ session: mockSession, refreshSession: mockRefresh }),
}));

let mockOnInsert: ((n: { type: string; metadata: Record<string, unknown> }) => void) | null = null;
const mockUnsubscribe = jest.fn();
const mockSubscribe = jest.fn((cb: (n: any) => void) => { mockOnInsert = cb; return Promise.resolve({ unsubscribe: mockUnsubscribe }); });
jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: { subscribeToUserNotifications: (cb: any) => mockSubscribe(cb) },
}));

import { VisitTableSync } from '../components/VisitTableSync';

describe('VisitTableSync — troca de mesa pela recepção (ADR-018)', () => {
  beforeEach(() => { mockSession = { tableSessionId: 's1' }; mockOnInsert = null; });
  afterEach(() => jest.clearAllMocks());

  it('atualiza a visita e avisa a mesa nova quando a troca é da sessão atual', async () => {
    render(<VisitTableSync />);
    await act(async () => { await Promise.resolve(); });
    act(() => { mockOnInsert!({ type: 'table_moved', metadata: { table_session_id: 's1', table_number: '9' } }); });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text2: 'Sua mesa agora é a 9' }));
  });

  it('ignora troca de outra sessão e outros tipos de notificação', async () => {
    render(<VisitTableSync />);
    await act(async () => { await Promise.resolve(); });
    act(() => { mockOnInsert!({ type: 'table_moved', metadata: { table_session_id: 'outra', table_number: '9' } }); });
    act(() => { mockOnInsert!({ type: 'order_ready', metadata: { table_session_id: 's1' } }); });
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('sem mesa aberta não assina nada', async () => {
    mockSession = null;
    render(<VisitTableSync />);
    await act(async () => { await Promise.resolve(); });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
