import { useEffect } from 'react';
import { AppState } from 'react-native';
import Toast from 'react-native-toast-message';
import customerBackend from '../services/customer-backend';
import { useVisitSession } from '../contexts/VisitSessionContext';

/**
 * Quando a recepção troca a mesa do cliente (ADR-018), a sessão continua a mesma mas o número da
 * mesa muda. O servidor avisa pela notificação `table_moved`; aqui atualizamos a visita e dizemos
 * ao cliente onde sentar. Também atualiza ao voltar ao app, caso o evento tenha se perdido.
 */
export function VisitTableSync() {
  const { session, refreshSession } = useVisitSession();
  const tableSessionId = session?.tableSessionId ?? null;

  useEffect(() => {
    if (!tableSessionId) return undefined;
    let active = true;
    let channel: { unsubscribe?: () => unknown } | null = null;
    void customerBackend.subscribeToUserNotifications((notification) => {
      if (notification.type !== 'table_moved' || notification.metadata.table_session_id !== tableSessionId) return;
      void refreshSession().catch(() => undefined);
      Toast.show({
        type: 'info',
        text1: 'Sua mesa mudou',
        text2: `Sua mesa agora é a ${String(notification.metadata.table_number ?? '')}`.trim(),
      });
    }).then((created) => {
      if (active) channel = created; else void created.unsubscribe?.();
    }).catch(() => undefined);

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshSession().catch(() => undefined);
    });
    return () => {
      active = false;
      void channel?.unsubscribe?.();
      appState.remove();
    };
  }, [tableSessionId, refreshSession]);

  return null;
}
