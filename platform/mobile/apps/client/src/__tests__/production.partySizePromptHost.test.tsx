import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@okinawa/shared/contexts/ThemeContext';
import { requestPartySize } from '../components/table/PartySizePrompt';
import ProductionNavigation from '../navigation/production';

/*
 * Nenhuma tela da pilha é desenhada aqui: é o que acontece com a Main no iOS quando o scanner
 * está por cima (a view sai da janela e o Modal não se apresenta). Se o "Quantas pessoas?"
 * dependesse de uma tela, ele não estaria montado e a leitura do QR ficaria girando.
 */
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../screens/production', () => ({}));
jest.mock('../screens/auth/LoginScreen', () => () => null);
jest.mock('../screens/auth/RegisterScreen', () => () => null);
jest.mock('../screens/wallet/WalletScreen', () => () => null);
jest.mock('../components/navigation/ClientTabBar', () => ({ ClientTabBar: () => null }));
jest.mock('@okinawa/shared/components/LiquidGlassBottomNav', () => ({ liquidGlassTabNavigatorScreenOptions: {} }));
jest.mock('../services/customer-push', () => ({ Notifications: {} }));
jest.mock('../services/customer-backend', () => ({
  __esModule: true,
  default: { restoreAuth: () => Promise.resolve(true) },
}));
jest.mock('@/shared/services/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }),
    },
  }),
}));

async function renderSignedIn() {
  render(<ThemeProvider defaultMode="light"><ProductionNavigation /></ThemeProvider>);
  await act(async () => undefined);
}

describe('PartySizePromptHost fora da pilha de telas', () => {
  it('pergunta quantas pessoas mesmo sem nenhuma tela visível e devolve o tamanho escolhido', async () => {
    await renderSignedIn();
    let answer: Promise<number | null> | undefined;
    act(() => { answer = requestPartySize({ seats: 4 }); });

    expect(screen.getByText('Quantas pessoas?')).toBeTruthy();
    expect(screen.getByText('Esta mesa tem 4 lugares.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('party-size-plus'));
    fireEvent.press(screen.getByTestId('party-size-plus'));
    fireEvent.press(screen.getByTestId('party-size-confirm'));

    await expect(answer).resolves.toBe(3);
    expect(screen.queryByText('Quantas pessoas?')).toBeNull();
  });

  it('cancelar devolve null para o scanner desistir em vez de travar', async () => {
    await renderSignedIn();
    let answer: Promise<number | null> | undefined;
    act(() => { answer = requestPartySize({ seats: null }); });

    fireEvent.press(screen.getByTestId('party-size-cancel'));

    await expect(answer).resolves.toBeNull();
  });
});
