/**
 * Lotação (ADR-007 / G2b) — the host stand decides entries above tables.seats.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CapacityRequestsScreen from '../screens/v2/CapacityRequestsScreen';

jest.mock('lucide-react-native', () => ({ Check: 'Check', Users: 'Users', X: 'X' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({
  V2Shell: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: () => ({ restaurantId: 'r1' }) }));
jest.mock('../screens/v2/shared/useRealtimeSubscription', () => ({ useRealtimeSubscription: jest.fn() }));

const mockTables = jest.fn();
jest.mock('../screens/v2/shared/useRestaurantOperations', () => ({
  useRestaurantTables: () => ({ data: mockTables(), loading: false, error: null, refresh: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const table = (id: string, label: string, seats: number, overrides: Record<string, unknown> = {}) => ({
  id, label, seats, effectiveSeats: seats, status: 'available', sessionId: null, mergedIntoId: null, mergedChildren: [],
  section: 'Salão', ...overrides,
});

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
  mockTables.mockReturnValue([
    table('t1', '7', 2, { status: 'occupied', sessionId: 's1' }),
    table('t2', '8', 2),
    table('t3', '9', 6),
    table('t4', '10', 4),
  ]);
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

const openRequest = (reason: 'capacity' | 'queue_active') => request({
  tableSessionId: null, requestKind: 'open', reason, seatCount: 5, seats: 4, occupiedSeats: 0, invitedBy: null,
});

it('pedido de abertura por grupo grande mostra o tamanho e oferece os motivos de lotação (ADR-016)', async () => {
  mockGet.mockResolvedValue([openRequest('capacity')]);
  const view = render(<CapacityRequestsScreen />);
  expect(await view.findByText('Abrir mesa 7 · 5 pessoa(s)')).toBeTruthy();
  expect(view.getByText(/ela tem 4 lugares/)).toBeTruthy();
  expect(view.getByText('Aprovar · cadeira extra')).toBeTruthy();
  expect(view.queryByText('Liberar mesa')).toBeNull();
});

it('pedido de abertura com fila ativa só se libera ou se recusa, e envia walk_in_liberado', async () => {
  mockGet.mockResolvedValueOnce([openRequest('queue_active')]).mockResolvedValue([]);
  mockResolve.mockResolvedValue(request({ status: 'approved' }));
  const view = render(<CapacityRequestsScreen />);
  expect(await view.findByText(/há grupos na fila/)).toBeTruthy();
  expect(view.queryByText('Aprovar · cadeira extra')).toBeNull();
  fireEvent.press(view.getByText('Liberar mesa'));
  fireEvent.press(view.getByText('Liberar'));
  await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('c1', { approve: true, reason: 'walk_in_liberado', note: undefined }));
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

describe('troca e junção de mesas (ADR-018)', () => {
  it('lotação oferece trocar e juntar mesas; fila ativa só libera', async () => {
    mockGet.mockResolvedValue([request(), openRequest('queue_active')]);
    const view = render(<CapacityRequestsScreen />);
    expect((await view.findAllByText('Trocar mesa')).length).toBe(1);
    expect(view.getAllByText('Juntar mesas').length).toBe(1);
  });

  it('troca: o seletor mostra o que não comporta, e a decisão envia a mesa de destino', async () => {
    mockGet.mockResolvedValueOnce([request({ headcount: 2, seatCount: 1 })]).mockResolvedValue([]);
    mockResolve.mockResolvedValue(request({ status: 'approved' }));
    const view = render(<CapacityRequestsScreen />);
    fireEvent.press(await view.findByText('Trocar mesa'));
    // precisa de 3 lugares (2 na mesa + 1 que quer entrar): a mesa 8 (2 lugares) não comporta.
    expect(view.getByText(/2 lugares · não comporta/)).toBeTruthy();
    fireEvent.press(view.getByTestId('table-pick-t3'));
    expect(view.getByTestId('table-picker-summary')).toBeTruthy();
    fireEvent.press(view.getByText('Continuar'));
    expect(await view.findByText(/vai para a mesa 9 \(6 lugares\)/)).toBeTruthy();
    fireEvent.press(view.getByText('Liberar'));
    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('c1', { approve: true, reason: 'troca_de_mesa', targetTableId: 't3', note: undefined }));
  });

  it('junção: soma os lugares e só deixa continuar quando o grupo cabe', async () => {
    mockGet.mockResolvedValueOnce([openRequest('capacity')]).mockResolvedValue([]);
    mockResolve.mockResolvedValue(request({ status: 'approved' }));
    const view = render(<CapacityRequestsScreen />);
    fireEvent.press(await view.findByText('Juntar mesas'));
    // grupo de 5 numa mesa de 4 lugares: unir a mesa 8 (2) dá 6.
    fireEvent.press(view.getByTestId('table-pick-t2'));
    expect(view.getByText(/Capacidade resultante: 6 · grupo: 5/)).toBeTruthy();
    fireEvent.press(view.getByText('Continuar'));
    fireEvent.press(await view.findByText('Liberar'));
    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('c1', { approve: true, reason: 'juncao_mesas', tableIds: ['t2'], note: undefined }));
  });

  it('erro P0015 do servidor chega explicado', async () => {
    mockGet.mockResolvedValueOnce([openRequest('capacity')]).mockResolvedValue([]);
    mockResolve.mockRejectedValue(Object.assign(new Error('Mesa com 4 lugares para 5 pessoas'), { code: 'P0015' }));
    const view = render(<CapacityRequestsScreen />);
    fireEvent.press(await view.findByText('Juntar mesas'));
    fireEvent.press(view.getByTestId('table-pick-t2'));
    fireEvent.press(view.getByText('Continuar'));
    fireEvent.press(await view.findByText('Liberar'));
    expect(await view.findByTestId('capacity-action-error')).toBeTruthy();
    expect(view.getByText('Mesa com 4 lugares para 5 pessoas')).toBeTruthy();
  });
});
