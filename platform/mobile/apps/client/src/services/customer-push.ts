import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { getSupabaseClient } from '@/shared/services/supabase';
import customerBackend from './customer-backend';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let lastDevicePushToken: unknown = null;

/**
 * `askPermission: false` só registra o token quando o usuário já autorizou. A permissão é pedida na
 * abertura da comanda (ADR-021: "Para avisarmos sobre seus pedidos e sua mesa"), não no boot do app.
 * `devicePushToken` é o token que o listener já recebeu: quem o informa não pode voltar ao nativo.
 */
export async function registerCustomerPushToken(
  options: { askPermission?: boolean; devicePushToken?: Notifications.DevicePushToken } = {},
): Promise<void> {
  const { askPermission = true } = options;
  if (!Device.isDevice || Platform.OS === 'web') return;
  const { data } = await getSupabaseClient().auth.getSession();
  if (!data.session) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('noowe-default', {
      name: 'Noowe',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#FF4B22',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted' || !askPermission ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return;

  // Expo Push works on both platforms and avoids coupling Android delivery to
  // Firebase service-account credentials in the Edge Function.
  const provider = 'expo';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId is required for push notifications');
  const devicePushToken = options.devicePushToken ?? (await Notifications.getDevicePushTokenAsync());
  lastDevicePushToken = devicePushToken.data;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken })).data;
  await customerBackend.registerPushToken(token, Platform.OS as 'ios' | 'android', {
    provider,
    deviceName: Device.deviceName,
    modelName: Device.modelName,
    osVersion: Device.osVersion,
  });
}

export function subscribeCustomerPushTokenChanges() {
  if (!Device.isDevice || Platform.OS === 'web') return () => undefined;
  const subscription = Notifications.addPushTokenListener((devicePushToken) => {
    // `getDevicePushTokenAsync` emite este evento a cada chamada, mesmo com o token igual. Chamá-lo
    // daqui, direto ou por `getExpoPushTokenAsync` sem `devicePushToken`, vira loop infinito.
    if (devicePushToken.data === lastDevicePushToken) return;
    void registerCustomerPushToken({ askPermission: false, devicePushToken }).catch(() => undefined);
  });
  return () => subscription.remove();
}

export { Notifications };
