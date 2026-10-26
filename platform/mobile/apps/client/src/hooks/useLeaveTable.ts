import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useVisitSession } from '../contexts/VisitSessionContext';
import { openInComanda } from '../navigation/comanda';
import { tableLabel } from '../screens/production/shared';
import { useMyTableBalance } from './useMyTableBalance';

/**
 * "Sair da mesa" (ADR-021): só sem consumo ou com a parte da pessoa paga. Com saldo, o botão vira
 * "Pagar minha parte" e leva à conta, dentro da comanda. O servidor continua sendo quem recusa (P0004).
 */
export function useLeaveTable(navigation: any) {
  const { session, leaveTable } = useVisitSession();
  const tableSessionId = session?.tableSessionId;
  const balance = useMyTableBalance(tableSessionId);
  const mustPay = (balance.data?.owedCents ?? 0) > 0;

  const goPay = useCallback(
    () => openInComanda(navigation, 'FecharConta', { tableSessionId }),
    [navigation, tableSessionId],
  );

  const run = useCallback(() => {
    if (mustPay) {
      goPay();
      return;
    }
    Alert.alert(
      'Sair da mesa',
      `Encerrar sua sessão na ${tableLabel(session?.tableNumber)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: () => {
            void leaveTable().catch((error: { code?: string }) => {
              if (error?.code === 'P0004') {
                Alert.alert('Quite sua parte', 'Você ainda tem saldo nesta mesa.', [
                  { text: 'Agora não', style: 'cancel' },
                  { text: 'Pagar minha parte', onPress: goPay },
                ]);
                return;
              }
              Alert.alert('Não foi possível sair', 'Verifique sua conexão e tente novamente.');
            });
          },
        },
      ],
    );
  }, [mustPay, goPay, leaveTable, session?.tableNumber]);

  return { run, mustPay, label: mustPay ? 'Pagar minha parte' : 'Sair da mesa' };
}
