/**
 * Troca e junção de mesas no mapa (ADR-018): o painel mostra a ação certa para cada mesa e envia a
 * operação ao servidor, que decide e audita.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TableLayoutPanel } from '../screens/v2/tables/TableLayoutPanel';
import { mapTable } from '../screens/v2/shared/useRestaurantOperations';

jest.mock('lucide-react-native', () => ({ X: 'X', Link2: 'Link2', Unlink2: 'Unlink2', ArrowRightLeft: 'ArrowRightLeft' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockMove = jest.fn();
const mockMerge = jest.fn();
const mockUnmerge = jest.fn();
jest.mock('@okinawa/shared/services/supabase-api', () => ({
  supabaseApiAdapter: {
    moveTableSession: (...a: unknown[]) => mockMove(...a),
    mergeTables: (...a: unknown[]) => mockMerge(...a),
    unmergeTables: (...a: unknown[]) => mockUnmerge(...a),
  },
}));

const table = (id: string, label: string, seats: number, overrides: Record<string, unknown> = {}) => ({
  id, label, seats, effectiveSeats: seats, status: 'available', sessionId: null, mergedIntoId: null, mergedIntoLabel: null,
  mergedChildren: [], headcount: 0, canRearrange: true, section: 'Salão', ...overrides,
}) as any;

describe('mapTable — campos da junção', () => {
  it('lê a mesa principal, os lugares efetivos e as filhas', () => {
    const mapped = mapTable({
      id: 'a', table_number: '1', seats: 4, status: 'occupied', effective_seats: 6, can_rearrange: true,
      merged_children: [{ id: 'b', table_number: '2', seats: 2 }],
      active_session: { id: 's', guest_count: 3, headcount: 5 },
    });
    expect(mapped).toMatchObject({ effectiveSeats: 6, canRearrange: true, headcount: 5, mergedIntoId: null });
    expect(mapped.mergedChildren).toEqual([{ id: 'b', label: '2', seats: 2 }]);
  });

  it('mesa filha aponta para a principal, e sem os campos novos vale a mesa sozinha', () => {
    expect(mapTable({ id: 'b', table_number: '2', seats: 2, merged_into_id: 'a', merged_into_number: '1' }))
      .toMatchObject({ mergedIntoId: 'a', mergedIntoLabel: '1', effectiveSeats: 2, canRearrange: false });
  });
});

describe('TableLayoutPanel', () => {
  const tables = [
    table('a', '1', 2, { status: 'occupied', sessionId: 's1', headcount: 2 }),
    table('b', '2', 2),
    table('c', '3', 6),
  ];
  const onChanged = jest.fn();
  const onError = jest.fn();
  afterEach(() => jest.clearAllMocks());

  it('quem o servidor não autoriza não vê nada', () => {
    const view = render(<TableLayoutPanel table={table('a', '1', 2, { canRearrange: false })} tables={tables} onChanged={onChanged} onError={onError} />);
    expect(view.queryByTestId('table-layout-panel')).toBeNull();
  });

  it('mesa ocupada oferece trocar e juntar; trocar envia a sessão e o destino', async () => {
    mockMove.mockResolvedValue({});
    const view = render(<TableLayoutPanel table={tables[0]} tables={tables} onChanged={onChanged} onError={onError} />);
    expect(view.getByTestId('layout-swap')).toBeTruthy();
    expect(view.getByTestId('layout-join')).toBeTruthy();
    fireEvent.press(view.getByTestId('layout-swap'));
    fireEvent.press(view.getByTestId('table-pick-c'));
    fireEvent.press(view.getByText('Trocar'));
    await waitFor(() => expect(mockMove).toHaveBeenCalledWith('s1', 'c'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('juntar envia a principal e as mesas escolhidas', async () => {
    mockMerge.mockResolvedValue({});
    const view = render(<TableLayoutPanel table={tables[1]} tables={tables} onChanged={onChanged} onError={onError} />);
    expect(view.queryByTestId('layout-swap')).toBeNull(); // sem sessão não há o que trocar
    fireEvent.press(view.getByTestId('layout-join'));
    fireEvent.press(view.getByTestId('table-pick-c'));
    fireEvent.press(view.getByText('Juntar'));
    await waitFor(() => expect(mockMerge).toHaveBeenCalledWith('b', ['c']));
  });

  it('mesa filha só oferece separar, e separa só ela', async () => {
    mockUnmerge.mockResolvedValue({});
    const child = table('b', '2', 2, { mergedIntoId: 'a', mergedIntoLabel: '1' });
    const view = render(<TableLayoutPanel table={child} tables={tables} onChanged={onChanged} onError={onError} />);
    expect(view.getByTestId('table-layout-child-note')).toBeTruthy();
    expect(view.queryByTestId('layout-join')).toBeNull();
    fireEvent.press(view.getByTestId('layout-split'));
    fireEvent.press(view.getByText('Separar'));
    await waitFor(() => expect(mockUnmerge).toHaveBeenCalledWith('a', ['b']));
  });

  it('erro do servidor aparece no próprio seletor, sem fechar', async () => {
    mockMove.mockRejectedValue(Object.assign(new Error('Mesa de destino com 2 lugares para 5 pessoas'), { code: 'P0015' }));
    const view = render(<TableLayoutPanel table={tables[0]} tables={tables} onChanged={onChanged} onError={onError} />);
    fireEvent.press(view.getByTestId('layout-swap'));
    fireEvent.press(view.getByTestId('table-pick-c'));
    fireEvent.press(view.getByText('Trocar'));
    expect(await view.findByTestId('table-picker-error')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
