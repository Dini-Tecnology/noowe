import { Alert } from 'react-native';

export type QrScanFailureReason =
  | 'invalid'
  | 'not_noowe'
  | 'closed'
  | 'cancelled'
  | 'booking_required'
  | 'replaced'
  | 'expired'
  | 'table_unavailable'
  | 'awaiting_capacity'
  | 'active_account'
  | 'network';

export type QrScanOutcome =
  /** `switched`: o QR era de outro restaurante e o usuário confirmou a troca. */
  | { ok: true; restaurantId: string; switched?: boolean }
  | { ok: false; reason: QrScanFailureReason };

export function showTableQrOutcome(
  outcome: QrScanOutcome,
  actions: {
    onOpened: (restaurantId: string, info: { switched: boolean }) => void;
    onRetry: () => void;
    onOpenAccount: () => void;
  },
): void {
  if (outcome.ok) {
    actions.onOpened(outcome.restaurantId, { switched: outcome.switched === true });
    return;
  }
  if (outcome.reason === 'cancelled') {
    // O usuário mesmo recusou (ex.: não quis trocar de restaurante): sem alerta.
    actions.onRetry();
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
  if (outcome.reason === 'awaiting_capacity') {
    Alert.alert(
      'Aguardando liberação',
      'A mesa atingiu a capacidade. A recepção recebeu sua solicitação e precisa liberar um lugar adicional.',
      [{ text: 'Entendi', onPress: actions.onRetry }],
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
