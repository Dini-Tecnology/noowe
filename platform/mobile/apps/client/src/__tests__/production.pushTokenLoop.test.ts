/**
 * O `getDevicePushTokenAsync` nativo emite `onDevicePushToken` a cada chamada, mesmo com o token igual.
 * Se o listener volta a resolver o token por ele, o app entra em loop e martela
 * `customer_register_push_token` enquanto estiver aberto.
 *
 * O mock reproduz o comportamento de expo-notifications 0.32: `PushTokenModule` (iOS e Android) e
 * `getExpoPushTokenAsync`, que só chama o nativo quando não recebe `devicePushToken`.
 */
const MAX_NATIVE_CALLS = 25;
let mockListener: ((token: { type: string; data: string }) => void) | null = null;
let mockNativeToken = 'apns-1';
const mockGetDevicePushToken = jest.fn();
const mockRegisterPushToken = jest.fn();

jest.mock('@/shared/services/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
  }),
}));
jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: { registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args) },
}));
jest.mock('expo-device', () => ({
  __esModule: true, isDevice: true, deviceName: 'iPhone', modelName: 'iPhone 16', osVersion: '26',
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'p1' } } } } }));
jest.mock('expo-notifications', () => {
  const getDevicePushTokenAsync = async () => {
    mockGetDevicePushToken();
    const token = { type: 'ios', data: mockNativeToken };
    // O limite só impede que a regressão trave a suíte: ela falha na contagem, não por timeout.
    if (mockGetDevicePushToken.mock.calls.length <= MAX_NATIVE_CALLS) {
      setTimeout(() => mockListener?.(token), 0);
    }
    return token;
  };
  return {
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
    requestPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
    setNotificationChannelAsync: jest.fn(),
    AndroidImportance: { HIGH: 4 },
    getDevicePushTokenAsync,
    getExpoPushTokenAsync: async ({ devicePushToken }: { devicePushToken?: { data: string } }) => {
      const device = devicePushToken ?? (await getDevicePushTokenAsync());
      return { data: `ExponentPushToken[${device.data}]` };
    },
    addPushTokenListener: (listener: typeof mockListener) => {
      mockListener = listener;
      return { remove: () => { mockListener = null; } };
    },
  };
});

import { registerCustomerPushToken, subscribeCustomerPushTokenChanges } from '../services/customer-push';

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('registro do token de push do cliente', () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    mockNativeToken = 'apns-1';
    mockRegisterPushToken.mockResolvedValue(undefined);
    unsubscribe = subscribeCustomerPushTokenChanges();
  });
  afterEach(() => {
    unsubscribe();
    jest.clearAllMocks();
  });

  it('abrir o app registra o token uma vez, sem loop com o listener', async () => {
    await registerCustomerPushToken({ askPermission: false });
    await settle();
    expect(mockGetDevicePushToken).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[apns-1]', expect.anything(), expect.anything());
  });

  it('token novo vindo do listener é registrado sem voltar ao nativo', async () => {
    await registerCustomerPushToken({ askPermission: false });
    await settle();
    jest.clearAllMocks();

    mockListener?.({ type: 'ios', data: 'apns-2' });
    await settle();

    expect(mockGetDevicePushToken).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[apns-2]', expect.anything(), expect.anything());
  });

  it('o evento repetido com o mesmo token não registra de novo', async () => {
    await registerCustomerPushToken({ askPermission: false });
    await settle();
    jest.clearAllMocks();

    mockListener?.({ type: 'ios', data: 'apns-1' });
    await settle();

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });
});
