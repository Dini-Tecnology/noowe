import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useCart } from '@/shared/contexts/CartContext';
import logger from '@okinawa/shared/utils/logger';
import { QrCheckInCancelled, useVisitSession } from '../contexts/VisitSessionContext';
import customerBackend, { type ServiceQrResolution } from '../services/customer-backend';
import { classifyQrPayload } from './qr-payload';
import type { QrScanOutcome } from './qr-scan-outcome';

export type { QrScanOutcome } from './qr-scan-outcome';

/** Nenhuma chamada de QR pode deixar o scanner girando para sempre. */
const QR_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Códigos que o servidor devolve para o fluxo de QR:
 *  22023 QR nunca gerado/assinatura inválida · P0002 QR não existe ou expirou na resolução ·
 *  P0006 substituído por um QR mais novo · P0007 vencido · P0004 já tem conta aberta ·
 *  P0005 mesa indisponível OU check-in sem reserva/fila (a mensagem diferencia) ·
 *  P0008 mesa lotada, aguardando a recepção · P0010 restaurante fechado.
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject({ code: 'TIMEOUT', message: 'QR request timed out' }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type ContextRestaurant = { id: string; name?: string | null };

/** "Este QR é de outro restaurante": pergunta antes de trocar; nunca troca em silêncio. */
async function confirmRestaurantSwitch(target: ServiceQrResolution, current: ContextRestaurant): Promise<boolean> {
  let targetName = 'outro restaurante';
  try {
    const restaurant = await customerBackend.getRestaurant(target.restaurantId);
    if (restaurant?.name) targetName = restaurant.name;
  } catch {
    // Sem o nome ainda dá para perguntar; o servidor valida o QR de qualquer forma.
  }
  const where = current.name ? ` Você está em ${current.name}.` : '';
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Este QR Code é de outro restaurante',
      `Este QR Code pertence a ${targetName}.${where} Deseja ir para ${targetName}?`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: `Ir para ${targetName}`, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Shared logic for every way a table QR can be opened: the in-app scanner
 * and a deep link opened by the OS (native camera, another app, cold
 * launch). Rejects anything that is not a NOOWE QR before touching the
 * server, classifies failures so the caller can show the right message, and —
 * when the scanner was opened from inside a restaurant — asks before jumping
 * to the restaurant that actually owns the scanned table.
 */
export function useTableQrHandler() {
  const { openFromQr } = useVisitSession();
  const cart = useCart();

  const handleQrScanned = useCallback(async (
    qrData: string,
    options?: { dev?: boolean; contextRestaurant?: ContextRestaurant },
  ): Promise<QrScanOutcome> => {
    // Generic QR (site, text, another app's code): never reaches the server.
    // The camera occasionally hands back a trailing newline (batch printers embed
    // CR/LF), so classify and send the trimmed payload.
    const payload = qrData.trim();
    if (!classifyQrPayload(payload)) return { ok: false, reason: 'not_noowe' };

    const context = options?.contextRestaurant;
    let switched = false;
    let visit: Awaited<ReturnType<typeof openFromQr>>;
    try {
      visit = await withTimeout(openFromQr(payload, {
        dev: options?.dev,
        beforeCheckIn: context
          ? async (resolution) => {
              if (resolution.restaurantId === context.id) return true;
              switched = await confirmRestaurantSwitch(resolution, context);
              return switched;
            }
          : undefined,
      }), QR_REQUEST_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof QrCheckInCancelled) return { ok: false, reason: 'cancelled' };
      const code = errorCode(error);
      if (code === '22023' || code === 'P0002') return { ok: false, reason: 'invalid' };
      if (code === 'P0006') return { ok: false, reason: 'replaced' };
      if (code === 'P0007') return { ok: false, reason: 'expired' };
      if (code === 'P0010') return { ok: false, reason: 'closed' };
      if (isBookingRequiredError(error)) return { ok: false, reason: 'booking_required' };
      if (code === 'P0005') return { ok: false, reason: 'table_unavailable' };
      if (code === 'P0008') return { ok: false, reason: 'awaiting_capacity' };
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

    if (switched) {
      // The user chose to leave the previous restaurant: its cart goes with it.
      cart.clearCart();
      return { ok: true, restaurantId, switched: true };
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
  }, [openFromQr, cart]);

  return { handleQrScanned };
}
