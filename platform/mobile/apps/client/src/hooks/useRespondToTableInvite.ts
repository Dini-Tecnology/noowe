import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../contexts/VisitSessionContext';
import customerBackend, { type TableUserInvite, type VisitSession } from '../services/customer-backend';
import { confirmCartForRestaurant } from './useTableInviteHandler';
import { describeClosedInvite, describeTableInviteError, tableInviteKeys } from './useTableUserInvites';

export type RespondOutcome =
  | { kind: 'joined'; visit: VisitSession }
  | { kind: 'awaiting_capacity' }
  | { kind: 'closed' }
  | { kind: 'declined' }
  | { kind: 'dismissed' }
  | { kind: 'error' };

function confirm(title: string, message: string, confirmText: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** Everything the invitee can do with an @username invite, with the same wording everywhere. */
export function useRespondToTableInvite() {
  const { session, joinFromUserInvite } = useVisitSession();
  const cart = useCart();
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: tableInviteKeys.incoming });
    void queryClient.invalidateQueries({ queryKey: ['table-user-invites-by-id'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const accept = useCallback(async (invite: TableUserInvite): Promise<RespondOutcome> => {
    // Accepting moves me out of the table I'm at (the server refuses while I owe there).
    if (session?.tableSessionId && session.tableSessionId !== invite.tableSessionId) {
      const proceed = await confirm(
        'Trocar de mesa?',
        `Ao aceitar, você sai da mesa ${session.tableNumber || 'atual'} e entra na mesa ${invite.tableNumber} no ${invite.restaurantName}.`,
        'Aceitar',
      );
      if (!proceed) return { kind: 'dismissed' };
    }

    try {
      const result = await joinFromUserInvite(invite.id);
      refresh();
      if (result.status === 'accepted' && result.visit) {
        await confirmCartForRestaurant(cart, result.visit.restaurantId);
        return { kind: 'joined', visit: result.visit };
      }
      if (result.status === 'awaiting_capacity') {
        Alert.alert('Mesa cheia', 'Avisamos a recepção. Você entra assim que liberarem um lugar.');
        return { kind: 'awaiting_capacity' };
      }
      Alert.alert('Convite indisponível', describeClosedInvite(result.invite ?? { status: result.status, closedReason: null }));
      return { kind: 'closed' };
    } catch (error) {
      Alert.alert('Não foi possível entrar', describeTableInviteError(error));
      return { kind: 'error' };
    }
  }, [cart, joinFromUserInvite, refresh, session]);

  const decline = useCallback(async (invite: TableUserInvite): Promise<RespondOutcome> => {
    try {
      await customerBackend.declineTableUserInvite(invite.id);
      refresh();
      return { kind: 'declined' };
    } catch (error) {
      Alert.alert('Não foi possível recusar', describeTableInviteError(error));
      return { kind: 'error' };
    }
  }, [refresh]);

  return { accept, decline };
}
