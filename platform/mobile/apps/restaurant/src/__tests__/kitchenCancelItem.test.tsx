import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import KitchenDisplayScreen from '../screens/v2/KitchenDisplayScreen';

jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({ V2Shell: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('../screens/v2/shared/V2DetailDialog', () => ({ V2DetailDialog: () => null }));
jest.mock('lucide-react-native', () => ({ Info: () => null }));
const mockRefresh = jest.fn();
jest.mock('../screens/v2/shared/useRestaurantOperations', () => ({
  useKdsOrders: () => ({
    loading: false, error: null, refresh: mockRefresh,
    data: [{ id: 'o1', table: 'Mesa 1', meta: '1min na fila', status: 'preparing', itemIds: ['i1', 'i2'],
      itemStates: [{ id: 'i1', status: 'preparing' }, { id: 'i2', status: 'ready' }],
      items: [['1x Risoto', '1min'], ['1x Salada', '2min']] }],
  }),
}));
const mockApi = { updateOrderItemStatus: jest.fn(async () => ({})) };
jest.mock('@okinawa/shared/services/supabase-api', () => ({ get supabaseApiAdapter() { return mockApi; } }));

// AUD-ITEM (QA 25/11): a cozinha não tinha como cancelar item; agora cancela por item, com motivo obrigatório.
test('cozinha cancela o item certo, só com motivo; item pronto não mostra cancelar', async () => {
  const view = render(<KitchenDisplayScreen />);
  expect(view.queryByLabelText('Cancelar 1x Salada')).toBeNull();
  fireEvent.press(view.getByLabelText('Cancelar 1x Risoto'));
  fireEvent.press(view.getAllByText('Cancelar item').at(-1)!);
  expect(mockApi.updateOrderItemStatus).not.toHaveBeenCalled();
  fireEvent.changeText(view.getByTestId('confirm-dialog-reason'), '  Cliente desistiu ');
  fireEvent.press(view.getAllByText('Cancelar item').at(-1)!);
  await waitFor(() => expect(mockApi.updateOrderItemStatus).toHaveBeenCalledWith('i1', 'cancelled', 'Cliente desistiu'));
  expect(mockRefresh).toHaveBeenCalled();
});
