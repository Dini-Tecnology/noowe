import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import BarKDSScreen from '../screens/v2/BarKDSScreen';

jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({ V2Shell: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('lucide-react-native', () => ({ Wine: () => null }));
const mockApi = { getBarQueue: jest.fn(), updateOrderItemStatus: jest.fn() };
jest.mock('@okinawa/shared/services/supabase-api', () => ({ get supabaseApiAdapter() { return mockApi; } }));

// QA 26/11: o card do Bar KDS aparecia vazio — a tela lia item_name/table_label, a RPC devolve name/table_number.
test('mostra bebida, mesa e observação com os campos que restaurant_get_bar_queue devolve', async () => {
  mockApi.getBarQueue.mockResolvedValue([
    { id: 'i1', order_id: 'o1', table_number: '1', name: 'Suco de laranja', quantity: 2, status: 'preparing', special_instructions: 'sem gelo', created_at: new Date().toISOString() },
  ]);
  const view = render(<BarKDSScreen />);
  await waitFor(() => expect(view.getByText('2x Suco de laranja')).toBeTruthy());
  expect(view.getByText(/Mesa 1/)).toBeTruthy();
  expect(view.getByText('sem gelo')).toBeTruthy();
});

// AUD-ITEM (QA 25/11): o bar cancela um item só com motivo digitado; o motivo vai ao servidor.
test('cancelar item no bar exige motivo e manda o motivo', async () => {
  mockApi.getBarQueue.mockResolvedValue([{ id: 'i1', order_id: 'o1', table_number: '1', name: 'Suco', quantity: 1, status: 'preparing' }]);
  mockApi.updateOrderItemStatus.mockResolvedValue({});
  const view = render(<BarKDSScreen />);
  fireEvent.press(await view.findByLabelText('Cancelar Suco'));
  fireEvent.press(view.getAllByText('Cancelar item').at(-1)!);
  expect(mockApi.updateOrderItemStatus).not.toHaveBeenCalled();
  fireEvent.changeText(view.getByTestId('confirm-dialog-reason'), 'Acabou a laranja');
  fireEvent.press(view.getAllByText('Cancelar item').at(-1)!);
  await waitFor(() => expect(mockApi.updateOrderItemStatus).toHaveBeenCalledWith('i1', 'cancelled', 'Acabou a laranja'));
});
