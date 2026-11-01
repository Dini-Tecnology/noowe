import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommonActions } from '@react-navigation/native';

jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({
  useColors: () => new Proxy({}, { get: () => '#000' }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

const mockList = jest.fn();
let mockOnChange: (() => void) | undefined;
const mockUnsubscribe = jest.fn();
jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: {
    listSessionOrders: (...args: unknown[]) => mockList(...args),
    subscribeToTableSessionOrders: (_id: string, cb: () => void) => {
      mockOnChange = cb;
      return Promise.resolve({ unsubscribe: mockUnsubscribe });
    },
  },
}));

import SessionOrdersSection from '../components/table/SessionOrdersSection';

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1', orderNumber: '#101', status: 'pending', createdAt: '2026-10-27T15:30:00Z',
  items: [{ quantity: 2 }, { quantity: 1 }], ...overrides,
});

const stackNav = () => {
  const stack = { dispatch: jest.fn(), getState: () => ({ routeNames: ['Main', 'Cart', 'OrderDetail'], routes: [{ name: 'Main' }] }), getParent: () => undefined };
  return stack;
};

function renderSection(navigation: any) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionOrdersSection tableSessionId="s1" navigation={navigation} />
    </QueryClientProvider>,
  );
}

describe('SessionOrdersSection', () => {
  afterEach(() => jest.clearAllMocks());

  it('lista os pedidos da sessão com o rótulo de status e a contagem de itens', async () => {
    mockList.mockResolvedValue([order()]);
    const { findByText } = renderSection(stackNav());
    expect(await findByText('Pedido #101')).toBeTruthy();
    expect(await findByText('Recebido')).toBeTruthy();
    expect(await findByText(/3 itens/)).toBeTruthy();
    expect(mockList).toHaveBeenCalledWith('s1');
  });

  it('tocar no pedido abre o status como filho da comanda', async () => {
    mockList.mockResolvedValue([order()]);
    const nav = stackNav();
    const { findByLabelText } = renderSection(nav);
    fireEvent.press(await findByLabelText('Acompanhar pedido #101'));
    expect(nav.dispatch).toHaveBeenCalledTimes(1);
    const action = nav.dispatch.mock.calls[0][0];
    expect(action).toEqual(CommonActions.reset({
      index: 2,
      routes: [{ name: 'Main' }, { name: 'Cart' }, { name: 'OrderDetail', params: { orderId: 'o1' } }],
    }));
  });

  it('mudança em tempo real relê a lista e atualiza o status', async () => {
    mockList.mockResolvedValueOnce([order()]);
    const { findByText } = renderSection(stackNav());
    await findByText('Recebido');
    mockList.mockResolvedValue([order({ status: 'preparing' })]);
    await waitFor(() => expect(mockOnChange).toBeDefined());
    await act(async () => { mockOnChange!(); });
    expect(await findByText('Preparando')).toBeTruthy();
  });

  it('sem pedidos não renderiza nada', async () => {
    mockList.mockResolvedValue([]);
    const { toJSON } = renderSection(stackNav());
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(toJSON()).toBeNull();
  });
});
