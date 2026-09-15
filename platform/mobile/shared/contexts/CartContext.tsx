import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { secureStorage } from '../services/secure-storage';

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
}

export interface CartContextData {
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

  // Load cart from storage on mount
  useEffect(() => {
    loadCart();
  }, []);

  // Save cart to storage whenever it changes
  useEffect(() => {
    saveCart();
  }, [items, restaurantId, restaurantName]);

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

  const addItem = (newItem: Omit<CartItem, 'id'>) => {
    // Two lines only merge when they are the same dish, for the same diner,
    // with the same note — a family table ordering one lasanha for Maria and
    // another for João must keep them apart so the comanda can bill each
    // person and the kitchen knows who gets what.
    const existingItemIndex = items.findIndex(
      (item) =>
        item.menu_item_id === newItem.menu_item_id &&
        (item.diner_id ?? null) === (newItem.diner_id ?? null) &&
        (item.special_instructions ?? '') === (newItem.special_instructions ?? '')
    );

    if (existingItemIndex !== -1) {
      // Update quantity if item exists
      const updatedItems = [...items];
      updatedItems[existingItemIndex].quantity += newItem.quantity;
      setItems(updatedItems);
    } else {
      // Add new item
      const item: CartItem = {
        ...newItem,
        id: `${newItem.menu_item_id}-${newItem.diner_id ?? 'me'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      setItems([...items, item]);
    }
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter((item) => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }

    const updatedItems = items.map((item) =>
      item.id === itemId ? { ...item, quantity } : item
    );
    setItems(updatedItems);
  };

  const clearCart = () => {
    setItems([]);
    setRestaurantId(null);
    setRestaurantName(null);
  };

  const setRestaurant = (id: string, name: string) => {
    // If changing restaurant, clear cart
    if (restaurantId && restaurantId !== id) {
      clearCart();
    }
    setRestaurantId(id);
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
