import { useEffect, useRef } from 'react';
import { useVisitSession } from '../contexts/VisitSessionContext';
import { Notifications } from '../services/customer-push';
import { hasPendingTableInvite } from '../utils/pending-table-invite';
import { hasPendingTableQr } from '../utils/pending-table-qr';
import { goToComanda } from './comanda';

/**
 * ADR-021: abrir o app com uma comanda ativa leva direto a ela. A comanda vem do servidor (a sessão é
 * restaurada por `customer_get_active_visit`), então vale igual depois de fechar o app ou em outro
 * celular. Roda uma vez por abertura e cede a quem já tem destino: QR/convite pendente ou push tocado.
 */
export function useResumeActiveComanda(navigation: any) {
  const { session, restoring } = useVisitSession();
  const decided = useRef(false);

  useEffect(() => {
    if (restoring || decided.current) return;
    decided.current = true;
    if (!session?.tableSessionId) return;
    void (async () => {
      const [qr, invite, push] = await Promise.all([
        hasPendingTableQr(),
        hasPendingTableInvite(),
        Notifications.getLastNotificationResponseAsync().catch(() => null),
      ]);
      if (qr || invite || push) return;
      goToComanda(navigation);
    })();
  }, [restoring, session?.tableSessionId, navigation]);
}
