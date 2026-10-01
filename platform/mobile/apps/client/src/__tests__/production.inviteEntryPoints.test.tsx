import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FecharContaScreen from '../screens/production/FecharContaScreen';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockSubscribe = jest.fn();
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  getTableBill: async () => ({
    items: [], subtotal: 0, serviceFeePercent: 10,
    participants: [
      { dinerId: 'd1', isMe: true, displayName: 'Eu', isHost: true },
      { dinerId: 'd2', isMe: false, displayName: 'Ana', isHost: false },
    ],
  }),
  getRestaurant: async () => ({ name: 'Restaurante' }),
  listTableSessionUserInvites: async () => [],
  searchUsersForTable: async () => [],
  subscribeToTableInvites: (sessionId: string | null) => {
    mockSubscribe(sessionId);
    return Promise.resolve({ unsubscribe: jest.fn() });
  },
} }));
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({
  session: { restaurantId: 'r1', tableSessionId: 's1', tableId: 't1', tableNumber: '1' }, leaveTable: jest.fn(),
}) }));

let mockCapabilities: { guestLink: boolean; userInvite: boolean } | null = null;
jest.mock('../hooks/useServiceTypeFeatures', () => ({
  useServiceTypeFor: () => ({
    capabilities: mockCapabilities,
    policies: mockCapabilities ? { userSearchMinChars: 3 } : null,
  }),
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <FecharContaScreen navigation={{ navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() }} route={{}} />
    </QueryClientProvider>,
  );
  return { view, client };
}

beforeEach(() => {
  mockSubscribe.mockReset();
});

test('Fechar Conta hides "Convidar" when the restaurant enables neither invite channel', async () => {
  mockCapabilities = { guestLink: false, userInvite: false };
  const { view, client } = renderScreen();
  await waitFor(() => expect(view.getByText(/Na mesa \(2\)/)).toBeTruthy());
  expect(view.queryByTestId('fechar-conta-invite-chip')).toBeNull();
  expect(mockSubscribe).not.toHaveBeenCalled();
  client.clear();
});

test('Fechar Conta hides "Convidar" while capabilities are unknown', async () => {
  mockCapabilities = null;
  const { view, client } = renderScreen();
  await waitFor(() => expect(view.getByText(/Na mesa \(2\)/)).toBeTruthy());
  expect(view.queryByTestId('fechar-conta-invite-chip')).toBeNull();
  client.clear();
});

test('Fechar Conta opens the @username invite when enabled and follows the table in realtime', async () => {
  mockCapabilities = { guestLink: false, userInvite: true };
  const { view, client } = renderScreen();
  fireEvent.press(await view.findByTestId('fechar-conta-invite-chip'));
  expect(view.getByText('Convidar para a mesa')).toBeTruthy();
  expect(view.getByTestId('invite-search-input')).toBeTruthy();
  expect(view.queryByText('Por link')).toBeNull();
  await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith('s1'));
  client.clear();
});

test('Fechar Conta keeps the share link for restaurants with only the link enabled', async () => {
  mockCapabilities = { guestLink: true, userInvite: false };
  const { view, client } = renderScreen();
  fireEvent.press(await view.findByTestId('fechar-conta-invite-chip'));
  expect(view.getByText('Compartilhar link')).toBeTruthy();
  expect(view.queryByTestId('invite-search-input')).toBeNull();
  client.clear();
});
