/**
 * Push da equipe: o toque na notificação abre a tela certa e o token só é registrado em aparelho real.
 */
const mockRpc = jest.fn();
const mockGetSession = jest.fn();
jest.mock('@/shared/services/supabase', () => ({
  getSupabaseClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args), auth: { getSession: () => mockGetSession() } }),
}));

jest.mock('expo-device', () => ({
  __esModule: true, isDevice: true, deviceName: 'iPhone', modelName: 'iPhone 16', osVersion: '26',
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'p1' } } } } }));
const mockGetPermissions = jest.fn();
const mockGetToken = jest.fn();
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied' })),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
  setNotificationChannelAsync: jest.fn(),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
}));

import * as Device from 'expo-device';
import { registerStaffPushToken, staffPushRoute } from '../services/staff-push';

const mockDevice = Device as unknown as { isDevice: boolean };

describe('staffPushRoute', () => {
  it('solicitação nova abre a Lotação', () => {
    expect(staffPushRoute({ kind: 'capacity_request_pending', capacity_request_id: 'c1' })).toBe('CapacityRequests');
  });
  it('check-in de cliente abre o painel do garçom', () => {
    expect(staffPushRoute({ kind: 'staff_table_check_in', table_id: 't1' })).toBe('Waiter');
  });
  it.each([[{ kind: 'order_ready' }], [{}], [null], [undefined]])('ignora %j', (data) => {
    expect(staffPushRoute(data as Record<string, unknown> | null | undefined)).toBeNull();
  });
});

describe('registerStaffPushToken', () => {
  beforeEach(() => {
    mockDevice.isDevice = true;
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetToken.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    mockRpc.mockResolvedValue({ error: null });
  });
  afterEach(() => jest.clearAllMocks());

  it('registra o token pela RPC de push', async () => {
    await registerStaffPushToken();
    expect(mockRpc).toHaveBeenCalledWith('customer_register_push_token', expect.objectContaining({ p_token: 'ExponentPushToken[abc]' }));
  });

  it('não registra em simulador nem sem sessão nem sem permissão', async () => {
    mockDevice.isDevice = false;
    await registerStaffPushToken();
    mockDevice.isDevice = true;
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    await registerStaffPushToken();
    mockGetPermissions.mockResolvedValueOnce({ status: 'denied' });
    await registerStaffPushToken();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
