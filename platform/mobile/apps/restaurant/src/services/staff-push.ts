import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { getSupabaseClient } from '@/shared/services/supabase';

/** Telas do app do restaurante que um push da equipe abre. */
export type StaffPushRoute = 'CapacityRequests' | 'Waiter';

/**
 * Para onde um toque no push leva, pelo `kind` que o servidor grava na notificação
 * (`private.notify_capacity_request_created` e `private.notify_table_check_in`).
 */
export function staffPushRoute(data: Record<string, unknown> | null | undefined): StaffPushRoute | null {
  switch (data?.kind) {
    case 'capacity_request_pending': return 'CapacityRequests';
    case 'staff_table_check_in': return 'Waiter';
    default: return null;
  }
}

let lastDevicePushToken: unknown = null;

/**
 * Registra o token Expo desta equipe. A RPC não restringe papel: serve para qualquer usuário logado.
 * `receivedDevicePushToken` é o token que o listener já recebeu: quem o informa não pode voltar ao nativo.
 */
export async function registerStaffPushToken(receivedDevicePushToken?: Notifications.DevicePushToken): Promise<void> {
  if (!Device.isDevice || Platform.OS === 'web') return;
  const { data } = await getSupabaseClient().auth.getSession();
  if (!data.session) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('noowe-staff', {
      name: 'Noowe equipe',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#FF4B22',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId is required for push notifications');
  const devicePushToken = receivedDevicePushToken ?? (await Notifications.getDevicePushTokenAsync());
  lastDevicePushToken = devicePushToken.data;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken })).data;
  const { error } = await getSupabaseClient().rpc('customer_register_push_token', {
    p_token: token,
    p_platform: Platform.OS,
    p_device_info: { provider: 'expo', deviceName: Device.deviceName, modelName: Device.modelName, osVersion: Device.osVersion },
  });
  if (error) throw error;
}

export function subscribeStaffPushTokenChanges(): () => void {
  if (!Device.isDevice || Platform.OS === 'web') return () => undefined;
  const subscription = Notifications.addPushTokenListener((devicePushToken) => {
    // `getDevicePushTokenAsync` emite este evento a cada chamada, mesmo com o token igual. Chamá-lo
    // daqui, direto ou por `getExpoPushTokenAsync` sem `devicePushToken`, vira loop infinito.
    if (devicePushToken.data === lastDevicePushToken) return;
    void registerStaffPushToken(devicePushToken).catch(() => undefined);
  });
  return () => subscription.remove();
}

export { Notifications };
