import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useCart } from '@/shared/contexts/CartContext';
import customerBackend, { type CustomerOrder } from '../services/customer-backend';
import { buildReorder } from '../screens/production/quick-service-ui';

/**
 * "Pedir novamente" (T-Q1-16): devolve os itens de um pedido anterior ao carrinho
 * com o cardápio de hoje e abre o carrinho. O servidor recalcula preços na criação.
 */
export function useQuickReorder(navigation: { navigate: (route: string, params?: object) => void }) {
  const cart = useCart();
  const [pending, setPending] = useState(false);

  const reorder = useCallback(async (order: Pick<CustomerOrder, 'restaurantId' | 'restaurantName' | 'items'>) => {
    if (pending) return;
    setPending(true);
    try {
      // Sem a personalização de hoje, o item com escolha obrigatória cairia no servidor.
      const [menu, customizations] = await Promise.all([
        customerBackend.getMenu(order.restaurantId),
        customerBackend.getMenuCustomizations(order.restaurantId).catch(() => ({})),
      ]);
      const { cartItems, unavailable, needsChoice } = buildReorder(order.items, menu.items, customizations);
      if (cartItems.length === 0) {
        Alert.alert('Pedir novamente', needsChoice.length > 0
          ? `As opções de ${needsChoice.join(', ')} mudaram. Escolha de novo pelo cardápio.`
          : 'Os itens deste pedido não estão mais disponíveis no cardápio.');
        return;
      }
      cart.clearCart();
      cart.setRestaurant(order.restaurantId, order.restaurantName);
      cartItems.forEach((item) => cart.addItem(item));
      const leftOut = [
        unavailable.length > 0 ? `Não estão mais disponíveis: ${unavailable.join(', ')}.` : '',
        needsChoice.length > 0 ? `As opções mudaram, escolha de novo pelo cardápio: ${needsChoice.join(', ')}.` : '',
      ].filter(Boolean);
      if (leftOut.length > 0) Alert.alert('Alguns itens ficaram de fora', leftOut.join('\n\n'));
      navigation.navigate('Cart');
    } catch {
      Alert.alert('Pedir novamente', 'Não foi possível montar o pedido agora. Tente novamente.');
    } finally {
      setPending(false);
    }
  }, [cart, navigation, pending]);

  return { reorder, pending };
}
