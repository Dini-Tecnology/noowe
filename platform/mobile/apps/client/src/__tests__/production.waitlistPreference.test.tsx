import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WaitlistScreen from '../screens/production/WaitlistScreen';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('../hooks/useServiceTypeFeatures', () => ({
  useServiceTypeFor: () => ({ status: 'ready', features: { virtualQueue: true }, type: 'casual_dining' }),
}));
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({ session: null }) }));
jest.mock('../services/customer-push', () => ({ registerCustomerPushToken: jest.fn().mockResolvedValue(undefined) }));
const mockSections = jest.fn();
const mockJoin = jest.fn();
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  listMyWaitlist: async () => [],
  getRestaurantLiveStatus: async () => ({ isOpen: true }),
  getRestaurant: async () => ({ name: 'Noowe' }),
  getWaitlistStats: async () => null,
  getWaitlistSections: (...args: unknown[]) => mockSections(...args),
  joinWaitlist: (...args: unknown[]) => mockJoin(...args),
  subscribeToWaitlistChanges: async () => ({ unsubscribe: jest.fn() }),
} }));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <WaitlistScreen route={{ params: { restaurantId: 'r1' } }} navigation={{ navigate: jest.fn() }} />
    </QueryClientProvider>,
  );
  return { view, client };
}

beforeEach(() => {
  mockSections.mockReset();
  mockJoin.mockReset().mockResolvedValue({ id: 'w1' });
});

describe('Fila Virtual · preferência de setor', () => {
  it('keeps the chosen sector while it stays on the table map', async () => {
    mockSections.mockResolvedValue(['Varanda', 'Salão']);
    const { view, client } = renderScreen();
    fireEvent.press(await view.findByText('Varanda'));
    fireEvent.press(view.getByText('Entrar na Fila Virtual'));
    await waitFor(() => expect(mockJoin).toHaveBeenCalledWith({ restaurantId: 'r1', partySize: 2, preference: 'Varanda' }));
    client.clear();
  });

  it('falls back to "Qualquer" when the chosen sector leaves the table map', async () => {
    mockSections.mockResolvedValue(['Varanda', 'Salão']);
    const { view, client } = renderScreen();
    fireEvent.press(await view.findByText('Varanda'));

    mockSections.mockResolvedValue(['Salão']);
    await act(async () => { await client.invalidateQueries({ queryKey: ['waitlist-sections', 'r1'] }); });
    await waitFor(() => expect(view.queryByText('Varanda')).toBeNull());

    fireEvent.press(view.getByText('Entrar na Fila Virtual'));
    await waitFor(() => expect(mockJoin).toHaveBeenCalledWith({ restaurantId: 'r1', partySize: 2, preference: 'qualquer' }));
    client.clear();
  });
});
