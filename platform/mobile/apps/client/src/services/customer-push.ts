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

/**
 * `askPermission: false` só registra o token quando o usuário já autorizou. A permissão é pedida na
 * abertura da comanda (ADR-021: "Para avisarmos sobre seus pedidos e sua mesa"), não no boot do app.
 */
export async function registerCustomerPushToken(options: { askPermission?: boolean } = {}): Promise<void> {
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
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await customerBackend.registerPushToken(token, Platform.OS as 'ios' | 'android', {
    provider,
    deviceName: Device.deviceName,
    modelName: Device.modelName,
    osVersion: Device.osVersion,
  });
}

export function subscribeCustomerPushTokenChanges() {
  if (!Device.isDevice || Platform.OS === 'web') return () => undefined;
  const subscription = Notifications.addPushTokenListener(() => {
    // Re-resolve the Expo token whenever the underlying native token rotates.
    void registerCustomerPushToken({ askPermission: false });
  });
  return () => subscription.remove();
}

export { Notifications };
