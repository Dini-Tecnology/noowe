/** Carrinho vazio: "Ver cardápio" volta ao cardápio do restaurante do carrinho. */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CartScreen from '../screens/production/CartScreen';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/shared/contexts/CartContext', () => ({
  useCart: () => ({ items: [], restaurantId: 'r1', updateQuantity: jest.fn(), clearCart: jest.fn(), removeItem: jest.fn() }),
}));
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({ session: null, offline: false }) }));
jest.mock('../hooks/useServiceTypeFeatures', () => ({
  useServiceTypeFor: () => ({ capabilities: null, features: {}, policies: null, status: 'loading' }),
}));
jest.mock('../hooks/useTableUserInvites', () => ({ useTableInvitesRealtime: () => undefined }));
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => null }) }));

test('carrinho vazio leva ao cardápio do restaurante', () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><CartScreen navigation={navigation} route={{ params: {} }} /></QueryClientProvider>);
  fireEvent.press(view.getByLabelText('Ver cardápio'));
  expect(navigation.navigate).toHaveBeenCalledWith('Menu', { restaurantId: 'r1' });
});
