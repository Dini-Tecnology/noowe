import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  Notifications,
  registerStaffPushToken,
  staffPushRoute,
  subscribeStaffPushTokenChanges,
} from '../services/staff-push';

/**
 * Registra o push da equipe depois do login e leva o toque na notificação à tela certa
 * (Lotação para solicitação nova, Garçom para check-in). Não renderiza nada.
 */
export function StaffPushBridge() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    void registerStaffPushToken().catch(() => undefined);
    const unsubscribeToken = subscribeStaffPushTokenChanges();

    const handled = new Set<string>();
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      const route = staffPushRoute(response.notification.request.content.data);
      if (!route) return;
      handled.add(id);
      navigation.navigate(route);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);

    return () => {
      unsubscribeToken();
      subscription.remove();
    };
  }, [navigation]);

  return null;
}
