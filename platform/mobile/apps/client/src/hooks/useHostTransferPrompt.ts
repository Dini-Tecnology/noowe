import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hostTransfer } from '../services/host-transfer';

const POLL_MS = 20_000;

/** Quem recebeu um pedido de titularidade (resposta 49) responde aqui. Pergunta uma vez por pedido. */
export function useHostTransferPrompt(tableSessionId: string | undefined) {
  const queryClient = useQueryClient();
  const asked = useRef<string | null>(null);
  const pending = useQuery({
    queryKey: ['host-transfer', tableSessionId],
    queryFn: () => hostTransfer.pending(tableSessionId!),
    enabled: !!tableSessionId,
    refetchInterval: POLL_MS,
  });
  const offer = pending.data;

  useEffect(() => {
    if (!offer?.incoming || asked.current === offer.transferId) return;
    asked.current = offer.transferId;
    const answer = (accept: boolean) => {
      void hostTransfer.respond(offer.transferId, accept)
        .then(({ accepted }) => {
          if (accepted) Alert.alert('Agora você é o titular', 'A comanda da mesa fica com você.');
          void queryClient.invalidateQueries({ queryKey: ['host-transfer', tableSessionId] });
          void queryClient.invalidateQueries({ queryKey: ['my-table-balance', tableSessionId] });
        })
        .catch((error: Error) => Alert.alert('Não foi possível responder', error.message));
    };
    Alert.alert('Titularidade da mesa', `${offer.fromName} quer passar a titularidade da mesa para você. Você passa a responder pela comanda.`, [
      { text: 'Recusar', style: 'cancel', onPress: () => answer(false) },
      { text: 'Aceitar', onPress: () => answer(true) },
    ]);
  }, [offer, queryClient, tableSessionId]);
}
