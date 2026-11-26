/** "Fila" no painel do Dono e do Gerente segue a capacidade virtualQueue, não o modelo de serviço. */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

let mockVirtualQueue = true;
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'Icon' }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ supabaseApiAdapter: {} }));
jest.mock('../contexts/RestaurantRoleContext', () => ({
  useRestaurantRole: () => ({ role: 'owner', serviceFeatures: { virtualQueue: mockVirtualQueue, callWaiter: false, tableManagement: true }, capabilities: null }),
}));
jest.mock('../screens/v2/shared/usePlanLocks', () => ({ usePlanLocks: () => [] }));
jest.mock('../screens/v2/shared/useRestaurantOperations', () => {
  const list = () => ({ data: [], loading: false, error: null, refresh: jest.fn() });
  return new Proxy({}, {
    get: (_t, key: string) => (key === 'useDashboardSnapshot' ? () => ({ data: null, loading: false, error: null, refresh: jest.fn() })
      : key.startsWith('use') ? list : key === '__esModule' ? true : () => ''),
  });
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DashboardTab, ManagerDashboardTab } = require('../screens/v2/OwnerHubScreen');
const colors = new Proxy({}, { get: () => '#333333' }) as any;

describe.each([
  ['Dono', (nav: jest.Mock) => <DashboardTab onNavigate={nav} colors={colors} />],
  ['Gerente', (nav: jest.Mock) => <ManagerDashboardTab onNavigate={nav} setView={jest.fn()} colors={colors} />],
])('atalho Fila (%s)', (_who, ui) => {
  it('aparece com virtualQueue ligado e abre a Waitlist', () => {
    mockVirtualQueue = true;
    const nav = jest.fn();
    const { getAllByText } = render(ui(nav));
    fireEvent.press(getAllByText('Fila')[0]);
    expect(nav).toHaveBeenCalledWith('Waitlist');
  });
  it('some com virtualQueue desligado', () => {
    mockVirtualQueue = false;
    expect(render(ui(jest.fn())).queryByText('Fila')).toBeNull();
  });
});
