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

export type InviteFailureReason = 'invalid' | 'awaiting_capacity' | 'too_many' | 'bad_format' | 'network';

export type InviteOutcome =
  | { ok: true; restaurantId: string }
  | { ok: false; reason: InviteFailureReason };

/** Traduz o erro do servidor (link, QR do convite ou código) no motivo que a tela explica. */
export function classifyInviteError(error: unknown): InviteFailureReason {
  const code = error && typeof error === 'object' ? (error as { code?: string }).code : undefined;
  if (code === 'P0001') return 'invalid';
  if (code === 'P0008') return 'awaiting_capacity';
  if (code === 'TOO_MANY_ATTEMPTS') return 'too_many';
  if (code === '22023') return 'bad_format';
  return 'network';
}

/** Texto do alerta de cada motivo, igual para link, QR e código. */
export const INVITE_FAILURE_MESSAGES: Record<InviteFailureReason, { title: string; message: string }> = {
  invalid: { title: 'Convite inválido', message: 'Este convite não é válido, expirou ou foi encerrado com a conta da mesa. Peça um novo ao anfitrião.' },
  awaiting_capacity: { title: 'Aguardando liberação', message: 'A mesa está cheia. A recepção recebeu seu pedido e vai liberar sua entrada. Avisaremos você.' },
  too_many: { title: 'Muitas tentativas', message: 'Você tentou códigos demais. Aguarde alguns minutos e peça o código de novo ao anfitrião.' },
  bad_format: { title: 'Código inválido', message: 'O código tem 6 dígitos. Confira e tente de novo.' },
  network: { title: 'Sem conexão', message: 'Não foi possível entrar na mesa agora. Tente novamente.' },
};

/**
 * Shared logic for every way a table-invite link can be opened: tapped
 * directly (Share sheet, Messages, WhatsApp) or opened cold via deep link.
 * Mirrors useTableQrHandler — see its comments for the cart-mismatch flow.
 */
export function useTableInviteHandler() {
  const { joinFromInvite, joinFromInviteCode } = useVisitSession();
  const cart = useCart();

  const handleInviteToken = useCallback(async (token: string): Promise<InviteOutcome> => {
    let restaurantId: string;
    try {
      const visit = await joinFromInvite(token);
      restaurantId = visit.restaurantId;
    } catch (error) {
      return { ok: false, reason: classifyInviteError(error) };
    }

    await confirmCartForRestaurant(cart, restaurantId);

    return { ok: true, restaurantId };
  }, [joinFromInvite, cart]);

  const handleInviteCode = useCallback(async (code: string): Promise<InviteOutcome> => {
    let restaurantId: string;
    try {
      const visit = await joinFromInviteCode(code);
      restaurantId = visit.restaurantId;
    } catch (error) {
      return { ok: false, reason: classifyInviteError(error) };
    }

    await confirmCartForRestaurant(cart, restaurantId);

    return { ok: true, restaurantId };
  }, [joinFromInviteCode, cart]);

  return { handleInviteToken, handleInviteCode };
}
