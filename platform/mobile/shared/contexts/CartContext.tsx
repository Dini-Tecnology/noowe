import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { secureStorage } from '../services/secure-storage';

/** ADR-013 §2.9: ids das opções e ingredientes retirados. O servidor valida e precifica. */
export interface CartItemCustomization {
  options: string[];
  removed: string[];
}

export interface CartItem {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  special_instructions?: string;
  image_url?: string;
  category?: string;
  /**
   * Casual dining group ordering: which diner at the table the item is for.
   * Undefined for solo/counter ordering, where the order belongs to whoever
   * placed it.
   */
  diner_id?: string;
  diner_name?: string;
  /**
   * Preparation time in minutes. Captured when the item is added so the cart
   * can preview an ETA before placing the order. Optional for backwards
   * compatibility with carts persisted before this field existed.
   */
  preparation_time?: number | null;
  /**
   * Personalização escolhida no detalhe do item. `price` já inclui a prévia dos extras;
   * o valor cobrado é recalculado no servidor.
   */
  customizations?: CartItemCustomization;
  /** Texto pronto para o carrinho: "Ponto: Ao ponto · Sem cebola". */
  customization_summary?: string;
  /** Quick-service combo kept locally until checkout confirms the order. */
  combo?: {
    lancheItemId: string;
    acompanhamentoItemId: string;
    bebidaItemId: string;
    /** Soma dos itens avulsos, antes do desconto — para o carrinho mostrar o desconto explícito. */
    listPrice?: number;
    /** Personalização de cada etapa do combo, quando o item da etapa tem opções. */
    customizations?: Partial<Record<'lanche' | 'acompanhamento' | 'bebida', CartItemCustomization>>;
  };
}

/** Quick Service (ADR-013): o cliente quer retirar agora ou em um horário agendado. */
export type PickupIntent = 'now' | 'scheduled';

export interface CartContextData {
  /** Preferência de retirada herdada da página do restaurante ("Fazer pedido" × "Agendar retirada"). Não persiste. */
  pickupIntent: PickupIntent;
  setPickupIntent: (intent: PickupIntent) => void;
  items: CartItem[];
  restaurantId: string | null;
  restaurantName: string | null;
  total: number;
  itemCount: number;
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  setRestaurant: (restaurantId: string, restaurantName: string) => void;
  loadCart: () => Promise<void>;
}

const CartContext = createContext<CartContextData>({} as CartContextData);

interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pickupIntent, setPickupIntent] = useState<PickupIntent>('now');

  useEffect(() => {
    void loadCart();
  }, []);

  // Only persist after the stored cart has been read, otherwise the initial
  // empty state can overwrite a saved cart.
  useEffect(() => {
    if (!hydrated) return;
    void saveCart();
  }, [items, restaurantId, restaurantName, hydrated]);

  const loadCart = async () => {
    try {
      const cartData = await secureStorage.getCart() as any;
      if (cartData) {
        setItems(cartData.items || []);
        setRestaurantId(cartData.restaurantId || null);
        setRestaurantName(cartData.restaurantName || null);
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    } finally {
      setHydrated(true);
    }
  };

  const saveCart = async () => {
    try {
      await secureStorage.setCart({
        items,
        restaurantId,
        restaurantName,
      });
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  };

  // All mutations use functional updates: MenuScreen calls setRestaurant() and
  // addItem() back to back in one tick, and closing over `items` made the second
  // call overwrite the first (stale items survived a restaurant switch, or the
  // new item was lost).
  const addItem = (newItem: Omit<CartItem, 'id'>) => {
    // Two lines only merge when they are the same dish, for the same diner,
    // with the same note and the same customization — a family table ordering one lasanha for Maria and
    // another for João must keep them apart so the comanda can bill each
    // person and the kitchen knows who gets what.
    setItems((current) => {
      const existingItemIndex = current.findIndex(
        (item) =>
          item.menu_item_id === newItem.menu_item_id &&
          JSON.stringify(item.combo ?? null) === JSON.stringify(newItem.combo ?? null) &&
          JSON.stringify(item.customizations ?? null) === JSON.stringify(newItem.customizations ?? null) &&
          (item.diner_id ?? null) === (newItem.diner_id ?? null) &&
          (item.special_instructions ?? '') === (newItem.special_instructions ?? '')
      );

      if (existingItemIndex !== -1) {
        return current.map((item, index) =>
          index === existingItemIndex ? { ...item, quantity: item.quantity + newItem.quantity } : item
        );
      }

      return [
        ...current,
        {
          ...newItem,
          id: `${newItem.menu_item_id}-${newItem.diner_id ?? 'me'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        },
      ];
    });
  };

  const removeItem = (itemId: string) => {
    setItems((current) => current.filter((item) => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }

    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setPickupIntent('now');
    setItems([]);
    setRestaurantId(null);
    setRestaurantName(null);
  };

  const setRestaurant = (id: string, name: string) => {
    // Switching restaurant drops items that belong to the previous one.
    setRestaurantId((current) => {
      if (current && current !== id) setItems([]);
      return id;
    });
    setRestaurantName(name);
  };

  // Calculate total
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // Calculate item count
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        pickupIntent,
        setPickupIntent,
        items,
        restaurantId,
        restaurantName,
        total,
        itemCount,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        setRestaurant,
        loadCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
