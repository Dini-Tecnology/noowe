import { Alert } from 'react-native';

export type QrScanFailureReason =
  | 'invalid'
  | 'not_noowe'
  | 'closed'
  | 'cancelled'
  | 'other_restaurant'
  | 'booking_required'
  | 'replaced'
  | 'expired'
  | 'table_unavailable'
  | 'awaiting_capacity'
  | 'table_too_small'
  | 'pickup_only'
  | 'active_account'
  | 'active_comanda'
  | 'network';

export type QrScanOutcome =
  | { ok: true; restaurantId: string }
  | { ok: false; reason: QrScanFailureReason; /** Para `awaiting_capacity`: por que a recepção precisa decidir. */ detail?: 'queue_active' | 'capacity' };

export function showTableQrOutcome(
  outcome: QrScanOutcome,
  actions: {
    onOpened: (restaurantId: string) => void;
    onRetry: () => void;
    onOpenAccount: () => void;
    /** ADR-021: leva à comanda ativa (outra mesa). Sem ela, o alerta só volta ao scanner. */
    onOpenComanda?: () => void;
  },
): void {
  if (outcome.ok) {
    actions.onOpened(outcome.restaurantId);
    return;
  }
  if (outcome.reason === 'cancelled') {
    // O usuário mesmo desistiu: sem alerta.
    actions.onRetry();
    return;
  }
  if (outcome.reason === 'other_restaurant') {
    // Propositalmente genérico: não nomeia o restaurante dono do QR nem oferece trocar.
    Alert.alert(
      'QR Code inválido',
      'Este QR Code não pertence a este restaurante.',
      [{ text: 'OK', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'not_noowe') {
    Alert.alert(
      'QR Code não reconhecido',
      'Este QR Code não é de uma mesa ou balcão do NOOWE. Escaneie o QR Code que está na mesa do restaurante.',
      [{ text: 'Escanear outro', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'closed') {
    Alert.alert(
      'Restaurante fechado',
      'Este restaurante está fechado no momento. Volte no horário de funcionamento para abrir a mesa.',
      [{ text: 'Entendi', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'booking_required') {
    Alert.alert(
      'Reserva necessária',
      'Para abrir esta mesa você precisa de uma reserva confirmada ou de ter sido chamado pela fila de espera.',
      [{ text: 'Entendi', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'invalid') {
    Alert.alert(
      'QR inválido',
      'Este QR Code não é válido. Peça um novo QR na mesa.',
      [{ text: 'Tentar novamente', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'replaced') {
    Alert.alert(
      'QR substituído',
      'Este QR Code foi substituído por um mais recente. Escaneie o código atual impresso na mesa.',
      [{ text: 'Tentar novamente', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'expired') {
    Alert.alert(
      'QR expirado',
      'A validade deste QR Code acabou. Peça um novo QR na mesa.',
      [{ text: 'Tentar novamente', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'table_unavailable') {
    Alert.alert(
      'Mesa indisponível',
      'Esta mesa está reservada para outro cliente ou ainda não foi liberada pela equipe.',
      [{ text: 'Tentar outra mesa', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'table_too_small') {
    Alert.alert(
      'Mesa precisa de ajuste',
      'Seu grupo é maior que esta mesa. Procure a recepção para juntar ou trocar a mesa antes do check-in.',
      [{ text: 'Entendi', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'pickup_only') {
    Alert.alert(
      'Restaurante de retirada',
      'Este restaurante não atende na mesa. Faça seu pedido para retirada pelo app ou pelo QR do balcão.',
      [{ text: 'Entendi', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'awaiting_capacity') {
    Alert.alert(
      'Aguardando liberação',
      outcome.detail === 'queue_active'
        ? 'Há grupos aguardando na fila. A recepção recebeu sua solicitação e vai liberar a mesa. Avisaremos você.'
        : 'Seu grupo é maior que a mesa. A recepção recebeu sua solicitação e precisa liberar a entrada. Avisaremos você.',
      [{ text: 'Entendi', onPress: actions.onRetry }],
    );
    return;
  }
  if (outcome.reason === 'active_comanda') {
    // ADR-021: uma comanda ativa por cliente. Nada é movido nem aberto; a saída é encerrar a atual.
    Alert.alert(
      'Você já está em uma comanda',
      'Encerre a comanda atual para escanear outra mesa.',
      [
        { text: 'Voltar', style: 'cancel', onPress: actions.onRetry },
        ...(actions.onOpenComanda ? [{ text: 'Ver minha comanda', onPress: actions.onOpenComanda }] : []),
      ],
    );
    return;
  }
  if (outcome.reason === 'active_account') {
    Alert.alert(
      'Você já tem uma conta aberta',
      'Feche a conta da mesa atual antes de entrar em outra mesa.',
      [
        { text: 'Voltar', style: 'cancel', onPress: actions.onRetry },
        { text: 'Ver minha conta', onPress: actions.onOpenAccount },
      ],
    );
    return;
  }
  Alert.alert(
    'Não foi possível ler o QR',
    'Verifique sua conexão com a internet e tente novamente. Se o problema continuar, peça outro QR à equipe.',
    [{ text: 'Tentar novamente', onPress: actions.onRetry }],
  );
}
