import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { getSupabaseClient } from '@/shared/services/supabase';

/** Telas do app do restaurante que um push da equipe abre. */
export type StaffPushRoute = 'CapacityRequests' | 'Waiter' | 'FiscalDocuments';

/**
 * Para onde um toque no push leva, pelo `kind` que o servidor grava na notificação
 * (`private.notify_capacity_request_created`, `private.notify_table_check_in` e
 * `private.fiscal_send_issue_notice`).
 */
export function staffPushRoute(data: Record<string, unknown> | null | undefined): StaffPushRoute | null {
  switch (data?.kind) {
    case 'capacity_request_pending': return 'CapacityRequests';
    case 'staff_table_check_in': return 'Waiter';
    case 'fiscal_document_issue': return 'FiscalDocuments';
    default: return null;
  }
}

/** A unidade de que o push fala: quem tem mais de uma precisa abrir a tela nela. */
export function staffPushRestaurantId(data: Record<string, unknown> | null | undefined): string | null {
  return typeof data?.restaurant_id === 'string' ? data.restaurant_id : null;
}

/**
 * Botões do push por categoria: a tarefa se resolve sem abrir a tela dela (ADR-022).
 * Abrem o app: em segundo plano, com o app fechado, o JS não roda e o toque se perde sem aviso.
 */
const STAFF_PUSH_CATEGORIES = {
  staff_task: [
    { identifier: 'task_complete', buttonTitle: 'Concluir', options: { opensAppToForeground: true } },
    { identifier: 'task_claim', buttonTitle: 'Assumir', options: { opensAppToForeground: true } },
  ],
  // Tarefa que pede uma decisão na tela dela: Concluir seria recusado pelo servidor.
  staff_task_claim: [{ identifier: 'task_claim', buttonTitle: 'Assumir', options: { opensAppToForeground: true } }],
  approval: [
    { identifier: 'approval_approve', buttonTitle: 'Aprovar', options: { opensAppToForeground: true } },
    { identifier: 'approval_reject', buttonTitle: 'Recusar', options: { opensAppToForeground: true, isDestructive: true } },
  ],
};

/** Cada toque em um botão vira uma chamada ao servidor, que confere quem pode. */
export function staffPushAction(
  actionIdentifier: string,
  data: Record<string, unknown> | null | undefined,
): { rpc: string; params: Record<string, unknown> } | null {
  const taskId = data?.taskId;
  const approvalId = data?.approvalId;
  switch (actionIdentifier) {
    case 'task_complete':
      return typeof taskId === 'string' ? { rpc: 'restaurant_complete_task', params: { p_task_id: taskId } } : null;
    case 'task_claim':
      return typeof taskId === 'string' ? { rpc: 'restaurant_claim_task', params: { p_task_id: taskId } } : null;
    case 'approval_approve':
    case 'approval_reject':
      return typeof approvalId === 'string'
        ? {
            rpc: 'restaurant_resolve_approval',
            params: { p_approval_id: approvalId, p_status: actionIdentifier === 'approval_approve' ? 'approved' : 'rejected' },
          }
        : null;
    default:
      return null;
  }
}

export async function registerStaffPushCategories(): Promise<void> {
  if (Platform.OS === 'web') return;
  // Uma por vez: no iOS cada chamada regrava a lista inteira, e em paralelo só a última fica.
  for (const [category, actions] of Object.entries(STAFF_PUSH_CATEGORIES)) {
    await Notifications.setNotificationCategoryAsync(category, actions);
  }
}

export async function runStaffPushAction(
  action: { rpc: string; params: Record<string, unknown> },
  recipientId?: unknown,
): Promise<void> {
  const client = getSupabaseClient();
  // Quem tocou pode não ser quem está logado agora: a ação não sai no nome de outra pessoa.
  if (typeof recipientId === 'string') {
    const { data } = await client.auth.getSession();
    if (data.session?.user.id !== recipientId) return;
  }
  const { error } = await client.rpc(action.rpc, action.params);
  // Outra pessoa já resolveu o pedido: Gerente e Dono recebem juntos, e isso não é erro de tela.
  const alreadyResolved = action.rpc === 'restaurant_resolve_approval' && error?.code === '23514';
  if (error && !alreadyResolved) throw error;
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
