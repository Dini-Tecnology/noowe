import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useVisitSession } from '../contexts/VisitSessionContext';
import { openInComanda } from '../navigation/comanda';
import { tableLabel } from '../screens/production/shared';
import { useMyTableBalance } from './useMyTableBalance';
import { hostTransfer } from '../services/host-transfer';

/**
 * "Sair da mesa" (ADR-021 e ADR-032): com saldo, o botão vira "Pagar minha parte". Quem abriu a comanda responde por
 * ela: paga a parte dele ou passa a titularidade a outro participante presente, que precisa aceitar (resposta 49).
 * Os demais podem sair confirmando, e a parte fica com o titular. O servidor é quem recusa (P0004).
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

  const offerTransfer = useCallback(async () => {
    if (!tableSessionId) return;
    try {
      const people = await hostTransfer.candidates(tableSessionId);
      if (!people.length) {
        Alert.alert('Ninguém para receber', 'Só quem está na mesa com o app pode virar titular.');
        return;
      }
      Alert.alert('Passar a titularidade', 'Quem vai responder pela comanda? A pessoa precisa aceitar.', [
        ...people.slice(0, 5).map((person) => ({
          text: person.name,
          onPress: () => {
            void hostTransfer.offer(tableSessionId, person.participantId)
              .then(({ toName }) => Alert.alert('Pedido enviado', `Quando ${toName} aceitar, você pode sair pagando só a sua parte, ou deixando-a com a nova titular.`))
              .catch((error: Error) => Alert.alert('Não foi possível enviar', error.message));
          },
        })),
        { text: 'Cancelar', style: 'cancel' as const },
      ]);
    } catch (error) {
      Alert.alert('Não foi possível carregar', (error as Error).message);
    }
  }, [tableSessionId]);

  const run = useCallback(() => {
    if (mustPay && balance.data?.isHost) {
      Alert.alert(
        'Você é o titular desta mesa',
        'Para sair, pague a sua parte ou passe a titularidade para alguém que está na mesa.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Passar a titularidade', onPress: () => void offerTransfer() },
          { text: 'Pagar minha parte', onPress: goPay },
        ],
      );
      return;
    }
    if (mustPay) {
      Alert.alert(
        'Você ainda tem saldo nesta mesa',
        'Se sair sem pagar, sua parte fica com quem abriu a comanda, e essa pessoa será avisada.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Pagar minha parte', onPress: goPay },
          {
            text: 'Sair sem pagar',
            style: 'destructive',
            onPress: () => {
              void leaveTable(true).catch(() => Alert.alert('Não foi possível sair', 'Verifique sua conexão e tente novamente.'));
            },
          },
        ],
      );
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
  }, [mustPay, balance.data?.isHost, goPay, offerTransfer, leaveTable, session?.tableNumber]);

  return { run, mustPay, label: mustPay ? 'Pagar minha parte' : 'Sair da mesa' };
}
