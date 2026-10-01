/**
 * Lotação (ADR-007 / G2b) — the host stand decides entries above tables.seats.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CapacityRequestsScreen from '../screens/v2/CapacityRequestsScreen';

jest.mock('lucide-react-native', () => ({ Check: 'Check', Users: 'Users' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({
  V2Shell: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: () => ({ restaurantId: 'r1' }) }));
jest.mock('../screens/v2/shared/useRealtimeSubscription', () => ({ useRealtimeSubscription: jest.fn() }));

const mockGet = jest.fn();
const mockResolve = jest.fn();
jest.mock('@okinawa/shared/services/supabase-api', () => ({
  supabaseApiAdapter: {
    getCapacityRequests: (...args: unknown[]) => mockGet(...args),
    resolveCapacityRequest: (...args: unknown[]) => mockResolve(...args),
  },
}));

const user = (username: string) => ({ userId: `u-${username}`, username, displayName: 'Caio T.', avatarUrl: null });
const request = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1', restaurantId: 'r1', tableSessionId: 's1', tableId: 't1', tableNumber: '7', seats: 2, occupiedSeats: 2,
  occupiedSeatsAtRequest: 2, capacityAtRequest: 2, seatCount: 1, status: 'pending', decisionReason: null, decisionNote: null,
  decidedAt: null, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  requestedUser: user('caio'), invitedBy: user('ana'), canDecide: true, ...overrides,
});

beforeEach(() => {
  mockGet.mockReset();
  mockResolve.mockReset();
});

it('lists pending entries with the table occupancy and who invited', async () => {
  mockGet.mockResolvedValue([request()]);
  const view = render(<CapacityRequestsScreen />);
  expect(await view.findByText('Mesa 7 · 2/2 lugares')).toBeTruthy();
  expect(view.getByText(/@caio \(Caio T\.\)/)).toBeTruthy();
  expect(view.getByText(/convidado por @ana/)).toBeTruthy();
  expect(mockGet).toHaveBeenCalledWith('r1', 'pending');
});

it('the waiter sees the request but cannot decide', async () => {
  mockGet.mockResolvedValue([request({ canDecide: false })]);
  const view = render(<CapacityRequestsScreen />);
  expect(await view.findByText('Aguardando o maître ou o gerente decidir.')).toBeTruthy();
  expect(view.queryByText('Recusar')).toBeNull();
  expect(view.queryByText('Aprovar · cadeira extra')).toBeNull();
});

it('approving asks for confirmation and sends reason and note', async () => {
  mockGet.mockResolvedValueOnce([request()]).mockResolvedValue([]);
  mockResolve.mockResolvedValue(request({ status: 'approved' }));
  const view = render(<CapacityRequestsScreen />);
  fireEvent.changeText(await view.findByLabelText('Observação da mesa 7'), 'cadeira da mesa 5');
  fireEvent.press(view.getByText('Aprovar · cadeira extra'));
  expect(view.getByText('Liberar entrada?')).toBeTruthy();
  fireEvent.press(view.getByText('Liberar'));
  await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('c1', { approve: true, reason: 'cadeira_extra', note: 'cadeira da mesa 5' }));
  expect(await view.findByText('Nenhuma solicitação')).toBeTruthy();
});

it('rejecting is confirmed as a destructive action', async () => {
  mockGet.mockResolvedValueOnce([request()]).mockResolvedValue([]);
  mockResolve.mockResolvedValue(request({ status: 'rejected' }));
  const view = render(<CapacityRequestsScreen />);
  fireEvent.press(await view.findByText('Recusar'));
  expect(view.getByText('Recusar entrada?')).toBeTruthy();
  fireEvent.press(view.getAllByText('Recusar')[1]);
  await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('c1', { approve: false, note: undefined }));
});

it.each([
  ['P0004', 'O cliente tem conta em aberto em outra mesa. Peça para ele quitar antes de entrar.'],
  ['42501', 'Seu papel não pode decidir sobre lotação neste restaurante.'],
  ['23514', 'Outra pessoa da equipe já decidiu esta solicitação.'],
])('explains a refused decision (%s)', async (code, message) => {
  mockGet.mockResolvedValue([request()]);
  mockResolve.mockRejectedValue(Object.assign(new Error('x'), { code }));
  const view = render(<CapacityRequestsScreen />);
  fireEvent.press(await view.findByText('Aprovar · cadeira extra'));
  fireEvent.press(view.getByText('Liberar'));
  expect((await view.findByTestId('capacity-action-error')).props.children).toBe(message);
});
