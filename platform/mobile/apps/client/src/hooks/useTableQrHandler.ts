import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../contexts/VisitSessionContext';

export type QrScanOutcome =
  | { ok: true; restaurantId: string }
  | { ok: false; reason: 'invalid' | 'replaced' | 'expired' | 'table_unavailable' | 'active_account' | 'network' };

/**
 * The RPC behind openFromQr (customer_open_table_session) raises with
 * errcode 22023 for a QR that was never generated or fails its signature
 * check, P0006 when it was revoked by a newer QR for the same table, and
 * P0007 when it's past its own expiry date. Anything else (timeout,
 * offline, 5xx) is worth a retry, not "QR inválido" — see PostgrestError in
 * @supabase/supabase-js.
 */
function isInvalidQrError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === '22023';
}

function isReplacedQrError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === 'P0006';
}

function isExpiredQrError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === 'P0007';
}

function isActiveAccountError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === 'P0004';
}

function isTableUnavailableError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === 'P0005';
}

/**
 * Shared logic for every way a table QR can be opened: the in-app scanner
 * and a deep link opened by the OS (native camera, another app, cold
 * launch). Classifies failures so the caller can show the right message,
 * and — since the table session switch already happened server-side by the
 * time we know about it — offers to clear a cart that belongs to a
 * different restaurant instead of silently leaving it in a state the
 * checkout will reject.
 */
export function useTableQrHandler() {
  const { openFromQr } = useVisitSession();
  const cart = useCart();

  const handleQrScanned = useCallback(async (qrData: string): Promise<QrScanOutcome> => {
    let restaurantId: string;
    try {
      const visit = await openFromQr(qrData);
      restaurantId = visit.restaurantId;
    } catch (error) {
      if (isInvalidQrError(error)) return { ok: false, reason: 'invalid' };
      if (isReplacedQrError(error)) return { ok: false, reason: 'replaced' };
      if (isExpiredQrError(error)) return { ok: false, reason: 'expired' };
      if (isTableUnavailableError(error)) return { ok: false, reason: 'table_unavailable' };
      if (isActiveAccountError(error)) return { ok: false, reason: 'active_account' };
      return { ok: false, reason: 'network' };
    }

    if (cart.items.length > 0 && cart.restaurantId && cart.restaurantId !== restaurantId) {
      await new Promise<void>((resolve) => {
        Alert.alert(
          'Carrinho de outro restaurante',
          'Seu carrinho tem itens de outro restaurante. Deseja limpar o carrinho para pedir aqui?',
          [
            { text: 'Manter carrinho', style: 'cancel', onPress: () => resolve() },
            { text: 'Limpar carrinho', style: 'destructive', onPress: () => { cart.clearCart(); resolve(); } },
          ],
        );
      });
    }

    return { ok: true, restaurantId };
  }, [openFromQr, cart]);

  return { handleQrScanned };
}
