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
const mockGetDeviceToken = jest.fn();
const mockGetToken = jest.fn();
let mockTokenListener: ((token: { type: string; data: string }) => void) | null = null;
// Como no expo-notifications 0.32: o nativo emite `onDevicePushToken` a cada chamada, mesmo com o token
// igual, e `getExpoPushTokenAsync` só chama o nativo quando não recebe `devicePushToken`.
const MAX_NATIVE_CALLS = 25;
const mockNativeDeviceToken = async () => {
  mockGetDeviceToken();
  const token = { type: 'ios', data: 'apns-1' };
  // O limite só impede que a regressão trave a suíte: ela falha na contagem, não por timeout.
  if (mockGetDeviceToken.mock.calls.length <= MAX_NATIVE_CALLS) setTimeout(() => mockTokenListener?.(token), 0);
  return token;
};
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied' })),
  getDevicePushTokenAsync: () => mockNativeDeviceToken(),
  getExpoPushTokenAsync: async (options: { devicePushToken?: unknown }) => {
    if (!options.devicePushToken) await mockNativeDeviceToken();
    return mockGetToken(options);
  },
  setNotificationChannelAsync: jest.fn(),
  addPushTokenListener: jest.fn((listener: typeof mockTokenListener) => {
    mockTokenListener = listener;
    return { remove: () => { mockTokenListener = null; } };
  }),
  AndroidImportance: { HIGH: 4 },
}));

import * as Device from 'expo-device';
import { registerStaffPushToken, staffPushRoute, subscribeStaffPushTokenChanges } from '../services/staff-push';

const mockDevice = Device as unknown as { isDevice: boolean };
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('staffPushRoute', () => {
  it('solicitação nova abre a Lotação', () => {
    expect(staffPushRoute({ kind: 'capacity_request_pending', capacity_request_id: 'c1' })).toBe('CapacityRequests');
  });
  it('check-in de cliente abre o painel do garçom', () => {
    expect(staffPushRoute({ kind: 'staff_table_check_in', table_id: 't1' })).toBe('Waiter');
  });
  it('nota fiscal parada abre a lista de notas', () => {
    expect(staffPushRoute({ kind: 'fiscal_document_issue', fiscal_document_id: 'd1' })).toBe('FiscalDocuments');
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

  describe('com o listener de token ativo', () => {
    let unsubscribe: () => void;
    beforeEach(() => { unsubscribe = subscribeStaffPushTokenChanges(); });
    afterEach(() => unsubscribe());

    it('abrir o app registra o token uma vez, sem loop com o listener', async () => {
      await registerStaffPushToken();
      await settle();
      expect(mockGetDeviceToken).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('token novo vindo do listener é registrado sem voltar ao nativo', async () => {
      await registerStaffPushToken();
      await settle();
      jest.clearAllMocks();

      mockTokenListener?.({ type: 'ios', data: 'apns-2' });
      await settle();

      expect(mockGetDeviceToken).not.toHaveBeenCalled();
      expect(mockGetToken).toHaveBeenCalledWith(expect.objectContaining({ devicePushToken: { type: 'ios', data: 'apns-2' } }));
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('o evento repetido com o mesmo token não registra de novo', async () => {
      await registerStaffPushToken();
      await settle();
      jest.clearAllMocks();

      mockTokenListener?.({ type: 'ios', data: 'apns-1' });
      await settle();

      expect(mockRpc).not.toHaveBeenCalled();
    });
  });
});
