import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../contexts/VisitSessionContext';

type CartLike = Pick<ReturnType<typeof useCart>, 'items' | 'restaurantId' | 'clearCart'>;

/**
 * Joining a table at another restaurant while the cart holds items from a
 * different one: ask instead of silently mixing or dropping them. Shared by
 * the invite link and the @username invite.
 */
export async function confirmCartForRestaurant(cart: CartLike, restaurantId: string): Promise<void> {
  if (!(cart.items.length > 0 && cart.restaurantId && cart.restaurantId !== restaurantId)) return;
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

export type InviteOutcome =
  | { ok: true; restaurantId: string }
  | { ok: false; reason: 'invalid' | 'network' };

function isInvalidInviteError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === 'P0001';
}

/**
 * Shared logic for every way a table-invite link can be opened: tapped
 * directly (Share sheet, Messages, WhatsApp) or opened cold via deep link.
 * Mirrors useTableQrHandler — see its comments for the cart-mismatch flow.
 */
export function useTableInviteHandler() {
  const { joinFromInvite } = useVisitSession();
  const cart = useCart();

  const handleInviteToken = useCallback(async (token: string): Promise<InviteOutcome> => {
    let restaurantId: string;
    try {
      const visit = await joinFromInvite(token);
      restaurantId = visit.restaurantId;
    } catch (error) {
      return { ok: false, reason: isInvalidInviteError(error) ? 'invalid' : 'network' };
    }

    await confirmCartForRestaurant(cart, restaurantId);

    return { ok: true, restaurantId };
  }, [joinFromInvite, cart]);

  return { handleInviteToken };
}
