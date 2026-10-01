import { useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../contexts/VisitSessionContext';

/**
 * Mantém o carrinho consistente com o restaurante da sessão de mesa ativa.
 *
 * O bug que motivou este sync: o carrinho persistia itens do restaurante A
 * mesmo depois de abrir uma sessão de mesa no restaurante B (via QR ou
 * convite). A comanda/checkout enviava então items com menu_item_id do
 * restaurante A para o restaurantId B, e o RPC `place_order` rejeitava com
 * "O item pertence a outro restaurante".
 *
 * A regra: se o cliente sentou em uma mesa (sessão ativa com tableSessionId),
 * o carrinho só pode conter itens desse restaurante. Ao detectar divergência
 * o carrinho é limpo e o usuário é avisado — nunca aceitamos a divergência em
 * silêncio, e nunca a resolvemos apagando a sessão (a mesa foi escaneada de
 * verdade, o carrinho é o rascunho descartável).
 */
export function SessionCartSync() {
  const { session } = useVisitSession();
  const cart = useCart();
  const notifiedForSession = useRef<string | null>(null);

  useEffect(() => {
    const sessionRestaurantId = session?.restaurantId ?? null;
    const tableSessionId = session?.tableSessionId ?? null;
    const cartRestaurantId = cart.restaurantId;
    const hasItems = cart.items.length > 0;

    // Só age se o cliente está de fato sentado (mesa aberta). Fora de uma
    // sessão de mesa o cliente pode "colecionar" itens de qualquer cardápio
    // que estiver explorando — a checagem final acontece no submit.
    if (!tableSessionId || !sessionRestaurantId) return;

    if (!hasItems || !cartRestaurantId) return;

    if (cartRestaurantId === sessionRestaurantId) {
      notifiedForSession.current = null;
      return;
    }

    // Evita disparar o toast a cada re-render enquanto a mesma sessão estiver
    // ativa (o cart limpo re-renderiza este componente).
    if (notifiedForSession.current === tableSessionId) return;
    notifiedForSession.current = tableSessionId;

    cart.clearCart();
    Toast.show({
      type: 'info',
      text1: 'Carrinho atualizado',
      text2: 'Removemos itens de outro restaurante para você pedir nesta mesa.',
      visibilityTime: 4000,
    });
  }, [cart, session?.restaurantId, session?.tableSessionId]);

  return null;
}
