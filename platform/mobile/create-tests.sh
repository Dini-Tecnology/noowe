#!/bin/bash

# Script para criar testes mobile
# Cria estrutura completa de testes para atingir 70%+ de cobertura

echo "🧪 Criando testes para Mobile..."

# Criar testes para serviços
mkdir -p shared/services/__tests__

# Teste para API Service
cat > shared/services/__tests__/api.test.ts << 'EOF'
import ApiService from '../api';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRestaurant', () => {
    it('should fetch restaurant data', async () => {
      const mockRestaurant = { id: '1', name: 'Test Restaurant' };
      mockedAxios.get.mockResolvedValueOnce({ data: mockRestaurant });

      const result = await ApiService.getRestaurant('1');

      expect(result).toEqual(mockRestaurant);
      expect(mockedAxios.get).toHaveBeenCalledWith('/restaurants/1');
    });

    it('should handle errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(ApiService.getRestaurant('1')).rejects.toThrow('Network error');
    });
  });

  describe('getRestaurantMenu', () => {
    it('should fetch menu items', async () => {
      const mockMenu = [{ id: '1', name: 'Pizza' }];
      mockedAxios.get.mockResolvedValueOnce({ data: mockMenu });

      const result = await ApiService.getRestaurantMenu('1');

      expect(result).toEqual(mockMenu);
    });
  });

  describe('createReservation', () => {
    it('should create a reservation', async () => {
      const reservationData = {
        restaurant_id: '1',
        party_size: 4,
        reservation_time: new Date().toISOString(),
      };
      const mockReservation = { id: 'res-1', ...reservationData };
      mockedAxios.post.mockResolvedValueOnce({ data: mockReservation });

      const result = await ApiService.createReservation(reservationData);

      expect(result).toEqual(mockReservation);
      expect(mockedAxios.post).toHaveBeenCalledWith('/reservations', reservationData);
    });
  });

  describe('processPayment', () => {
    it('should process payment', async () => {
      const paymentData = {
        order_id: 'order-1',
        amount: 99.99,
        payment_method: 'credit_card',
      };
      const mockPayment = { id: 'payment-1', status: 'completed' };
      mockedAxios.post.mockResolvedValueOnce({ data: mockPayment });

      const result = await ApiService.processPayment(paymentData);

      expect(result).toEqual(mockPayment);
      expect(mockedAxios.post).toHaveBeenCalledWith('/payments', paymentData);
    });
  });
});
EOF

# Teste para Auth Service
cat > shared/services/__tests__/auth.test.ts << 'EOF'
import { authService } from '../auth';
import { secureStorage } from '../secure-storage';
import { supabaseAuthAdapter } from '../supabase-auth';

jest.mock('../secure-storage');
jest.mock('../supabase-auth');

const mockedSupabaseAuth = supabaseAuthAdapter as jest.Mocked<typeof supabaseAuthAdapter>;
const mockedSecureStorage = secureStorage as jest.Mocked<typeof secureStorage>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully through Supabase Auth', async () => {
      const mockResponse = {
        user: {
          id: '1',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'customer',
          roles: [{ role: 'customer' }],
          restaurant_ids: [],
        },
        access_token: 'token123',
        refresh_token: 'refresh123',
      };
      mockedSupabaseAuth.login.mockResolvedValueOnce(mockResponse);

      const result = await authService.login('test@example.com', 'password123');

      expect(result).toEqual(mockResponse);
      expect(mockedSupabaseAuth.login).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockedSecureStorage.setAccessToken).toHaveBeenCalledWith('token123');
      expect(mockedSecureStorage.setRefreshToken).toHaveBeenCalledWith('refresh123');
    });

    it('should handle login errors', async () => {
      mockedSupabaseAuth.login.mockRejectedValueOnce(new Error('Invalid credentials'));

      await expect(authService.login('test@example.com', 'wrong')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('should register through Supabase Auth', async () => {
      const mockResponse = {
        user: {
          id: '1',
          email: 'new@example.com',
          full_name: 'John Doe',
          role: 'customer',
          roles: [{ role: 'customer' }],
          restaurant_ids: [],
        },
        needsEmailConfirmation: true,
      };
      mockedSupabaseAuth.register.mockResolvedValueOnce(mockResponse);

      const result = await authService.register('new@example.com', 'password123', 'John Doe');

      expect(result).toEqual(mockResponse);
      expect(mockedSupabaseAuth.register).toHaveBeenCalledWith('new@example.com', 'password123', 'John Doe');
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      await authService.logout();

      expect(mockedSupabaseAuth.logout).toHaveBeenCalled();
      expect(mockedSecureStorage.clearAuth).toHaveBeenCalled();
    });
  });
});
EOF

# Teste para Storage Service
cat > shared/services/__tests__/storage.test.ts << 'EOF'
import { secureStorage } from '../storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage');

describe('SecureStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setAccessToken', () => {
    it('should store access token', async () => {
      await secureStorage.setAccessToken('token123');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@access_token', 'token123');
    });
  });

  describe('getAccessToken', () => {
    it('should retrieve access token', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('token123');

      const token = await secureStorage.getAccessToken();

      expect(token).toBe('token123');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('@access_token');
    });

    it('should return null if no token exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const token = await secureStorage.getAccessToken();

      expect(token).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('should clear all storage', async () => {
      await secureStorage.clearAll();

      expect(AsyncStorage.clear).toHaveBeenCalled();
    });
  });
});
EOF

# Criar testes para contextos
mkdir -p shared/contexts/__tests__

# Teste para CartContext
cat > shared/contexts/__tests__/CartContext.test.tsx << 'EOF'
import React from 'react';
import { renderHook, act } from '@testing-library/react-hooks';
import { CartProvider, useCart } from '../CartContext';

describe('CartContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CartProvider>{children}</CartProvider>
  );

  it('should start with empty cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it('should add item to cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        menu_item_id: '1',
        name: 'Pizza',
        price: 19.99,
        quantity: 1,
      });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('Pizza');
  });

  it('should remove item from cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        menu_item_id: '1',
        name: 'Pizza',
        price: 19.99,
        quantity: 1,
      });
    });

    const itemId = result.current.items[0].id;

    act(() => {
      result.current.removeItem(itemId);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('should update item quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        menu_item_id: '1',
        name: 'Pizza',
        price: 19.99,
        quantity: 1,
      });
    });

    const itemId = result.current.items[0].id;

    act(() => {
      result.current.updateQuantity(itemId, 3);
    });

    expect(result.current.items[0].quantity).toBe(3);
  });

  it('should clear cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        menu_item_id: '1',
        name: 'Pizza',
        price: 19.99,
        quantity: 1,
      });
    });

    act(() => {
      result.current.clearCart();
    });

    expect(result.current.items).toHaveLength(0);
  });
});
EOF

echo "✅ Testes criados com sucesso!"
echo ""
echo "Arquivos criados:"
echo "  - shared/services/__tests__/api.test.ts"
echo "  - shared/services/__tests__/auth.test.ts"
echo "  - shared/services/__tests__/storage.test.ts"
echo "  - shared/contexts/__tests__/CartContext.test.tsx"
echo ""
echo "Execute 'npm test' para rodar os testes"
