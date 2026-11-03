import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getErrorMessage } from '@/shared/utils/error-handler';
import { useRestaurantRole } from '../contexts/RestaurantRoleContext';
import {
  Notifications,
  registerStaffPushCategories,
  registerStaffPushToken,
  runStaffPushAction,
  staffPushAction,
  staffPushRestaurantId,
  staffPushRoute,
  subscribeStaffPushTokenChanges,
} from '../services/staff-push';

/** Registra o push da equipe depois do login. Não renderiza nada. */
export function StaffPushBridge() {
  useEffect(() => {
    void registerStaffPushCategories().catch(() => undefined);
    void registerStaffPushToken().catch(() => undefined);
    return subscribeStaffPushTokenChanges();
  }, []);

  return null;
}

// Fora do componente: a pilha desmonta enquanto o papel carrega ou a unidade troca.
const handled = new Set<string>();
const switched = new Set<string>();

/**
 * Leva o toque na notificação à tela certa (Lotação, Garçom, notas fiscais). Fica depois do
 * navigator, dentro da pilha: com o app fechado, o toque só pode navegar quando ela já montou.
 * Push de outra unidade troca o restaurante antes; a pilha remonta e o último toque volta aqui.
 */
export function StaffPushOpener() {
  const navigation = useNavigation<any>();
  const { restaurantId, switchRestaurant } = useRestaurantRole();

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      const { data } = response.notification.request.content;
      // Botão da notificação: o servidor decide por tarefa, sem precisar trocar de unidade.
      const action = staffPushAction(response.actionIdentifier, data);
      if (action) {
        handled.add(id);
        // A última resposta volta a cada abertura do app, e o toque não pode se repetir sozinho.
        Notifications.clearLastNotificationResponse();
        runStaffPushAction(action, data?.recipientId).catch((error) => {
          Alert.alert('Não foi possível concluir', getErrorMessage(error));
        });
        return;
      }
      const route = staffPushRoute(data);
      if (!route) return;
      const target = staffPushRestaurantId(data);
      if (target && target !== restaurantId && !switched.has(id)) {
        switched.add(id);
        void switchRestaurant(target);
        return;
      }
      handled.add(id);
      navigation.navigate(route);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);

    return () => subscription.remove();
  }, [navigation, restaurantId, switchRestaurant]);

  return null;
}
