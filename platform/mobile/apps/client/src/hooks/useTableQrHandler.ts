import { useCallback } from 'react';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { useCart } from '@/shared/contexts/CartContext';
import logger from '@okinawa/shared/utils/logger';
import { QrCheckInCancelled, useVisitSession } from '../contexts/VisitSessionContext';
import { classifyQrPayload, extractInviteToken } from './qr-payload';
import { classifyInviteError, confirmCartForRestaurant } from './useTableInviteHandler';
import { requestPartySize } from '../components/table/PartySizePrompt';
import type { QrScanOutcome } from './qr-scan-outcome';

export type { QrScanOutcome } from './qr-scan-outcome';

/** Nenhuma chamada de QR pode deixar o scanner girando para sempre. */
const QR_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Códigos que o servidor devolve para o fluxo de QR:
 *  22023 QR nunca gerado/assinatura inválida · P0002 QR não existe ou expirou na resolução ·
 *  P0006 substituído por um QR mais novo · P0007 vencido · P0004 já tem conta aberta ·
 *  P0005 mesa indisponível OU check-in sem reserva/fila (a mensagem diferencia) ·
 *  P0008 mesa lotada, aguardando a recepção · P0010 restaurante fechado ·
 *  P0011 grupo maior que a mesa onde a recepção ajusta a mesa antes (Fine) ·
 *  P0012 QR de mesa num restaurante só de retirada.
 * Qualquer outra coisa (timeout, offline, 5xx) merece nova tentativa, não "QR inválido".
 */
function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' ? (error as { code?: string }).code : undefined;
}

function errorMessage(error: unknown): string {
  return error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
}

function isBookingRequiredError(error: unknown): boolean {
  return errorCode(error) === 'P0005' && /reserva confirmada|fila/i.test(errorMessage(error));
}

/**
 * Timeout da chamada de QR. `pauseWhile` suspende o relógio enquanto o cliente decide
 * algo na tela (ex.: quantas pessoas): o tempo de espera humana não é falha de rede.
 */
function withTimeout<T>(
  run: (pauseWhile: <R>(work: Promise<R>) => Promise<R>) => Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: (reason: unknown) => void = () => undefined;
  const arm = () => {
    timer = setTimeout(() => rejectTimeout({ code: 'TIMEOUT', message: 'QR request timed out' }), ms);
  };
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
    arm();
  });
  async function pauseWhile<R>(work: Promise<R>): Promise<R> {
    clearTimeout(timer);
    try {
      return await work;
    } finally {
      arm();
    }
  }
  return Promise.race([run(pauseWhile), timeout]).finally(() => clearTimeout(timer));
}

type ContextRestaurant = { id: string; name?: string | null };

/**
 * Shared logic for every way a table QR can be opened: the in-app scanner
 * and a deep link opened by the OS (native camera, another app, cold
 * launch). Rejects anything that is not a NOOWE QR before touching the
 * server, classifies failures so the caller can show the right message, and —
 * when the scanner was opened from inside a restaurant — refuses a QR that
 * belongs to another one. It never says which restaurant owns it and never
 * offers to switch: a QR printed for the wrong place is simply invalid here.
 */
export function useTableQrHandler() {
  const { openFromQr, joinFromInvite } = useVisitSession();
  const cart = useCart();

  const handleQrScanned = useCallback(async (
    qrData: string,
    options?: { dev?: boolean; contextRestaurant?: ContextRestaurant },
  ): Promise<QrScanOutcome> => {
    // Generic QR (site, text, another app's code): never reaches the server.
    // The camera occasionally hands back a trailing newline (batch printers embed
    // CR/LF), so classify and send the trimmed payload.
    const payload = qrData.trim();

    // QR do convite no celular do anfitrião (ADR-019): entra na mesa dele, sem check-in próprio.
    const inviteToken = extractInviteToken(payload);
    if (inviteToken) {
      try {
        const visit = await withTimeout(() => joinFromInvite(inviteToken), QR_REQUEST_TIMEOUT_MS);
        await confirmCartForRestaurant(cart, visit.restaurantId);
        return { ok: true, restaurantId: visit.restaurantId };
      } catch (error) {
        const reason = classifyInviteError(error);
        if (reason === 'invalid') return { ok: false, reason: 'invalid' };
        if (reason === 'awaiting_capacity') return { ok: false, reason: 'awaiting_capacity', detail: 'capacity' };
        return { ok: false, reason: 'network' };
      }
    }

    if (!classifyQrPayload(payload)) return { ok: false, reason: 'not_noowe' };

    const context = options?.contextRestaurant;
    let foreignRestaurant = false;
    let visit: Awaited<ReturnType<typeof openFromQr>>;
    try {
      visit = await withTimeout((pauseWhile) => openFromQr(payload, {
        dev: options?.dev,
        askPartySize: (info) => pauseWhile(requestPartySize(info)),
        beforeCheckIn: context
          ? async (resolution) => {
              if (resolution.restaurantId === context.id) return true;
              foreignRestaurant = true;
              return false;
            }
          : undefined,
      }), QR_REQUEST_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof QrCheckInCancelled) {
        return { ok: false, reason: foreignRestaurant ? 'other_restaurant' : 'cancelled' };
      }
      const code = errorCode(error);
      if (code === '22023' || code === 'P0002') return { ok: false, reason: 'invalid' };
      if (code === 'P0006') return { ok: false, reason: 'replaced' };
      if (code === 'P0007') return { ok: false, reason: 'expired' };
      if (code === 'P0010') return { ok: false, reason: 'closed' };
      if (code === 'P0011') return { ok: false, reason: 'table_too_small' };
      if (code === 'P0012') return { ok: false, reason: 'pickup_only' };
      if (isBookingRequiredError(error)) return { ok: false, reason: 'booking_required' };
      if (code === 'P0005' || code === 'P0013') return { ok: false, reason: 'table_unavailable' };
      if (code === 'P0008') {
        const detail = (error as { reason?: string }).reason;
        return {
          ok: false,
          reason: 'awaiting_capacity',
          ...(detail === 'queue_active' || detail === 'capacity' ? { detail } : {}),
        };
      }
      if (code === 'P0004') return { ok: false, reason: 'active_account' };
      // Anything else lands in the network fallback. Log the shape so we can
      // tell an offline hiccup apart from an unrecognized error code the RPC
      // will start throwing when the schema grows — those need to become
      // typed reasons instead of "sem conexão".
      logger.error('QR scan failed with unclassified error', {
        code,
        message: error instanceof Error ? error.message : errorMessage(error) || String(error),
        details: (error as { details?: unknown })?.details,
      });
      return { ok: false, reason: 'network' };
    }

    const restaurantId = visit.restaurantId;

    // QR da mesa antiga depois de uma troca: o cliente segue na mesma sessão, na mesa nova.
    if (visit.tableMoved) {
      Toast.show({ type: 'info', text1: 'Sua mesa mudou', text2: `Sua mesa agora é a ${visit.tableNumber}` });
    }

    // A seated table session already makes SessionCartSync drop a foreign cart;
    // the prompt only matters for counter QRs, which have no table session.
    if (!visit.tableSessionId && cart.items.length > 0 && cart.restaurantId && cart.restaurantId !== restaurantId) {
      await new Promise<void>((resolve) => {
        Alert.alert(
          'Carrinho de outro restaurante',
          'Seu carrinho tem itens de outro restaurante. Deseja limpar o carrinho para pedir aqui?',
          [
            { text: 'Manter carrinho', style: 'cancel', onPress: () => resolve() },
            { text: 'Limpar carrinho', style: 'destructive', onPress: () => { cart.clearCart(); resolve(); } },
          ],
          { cancelable: true, onDismiss: () => resolve() },
        );
      });
    }

    return { ok: true, restaurantId };
  }, [openFromQr, joinFromInvite, cart]);

  return { handleQrScanned };
}
