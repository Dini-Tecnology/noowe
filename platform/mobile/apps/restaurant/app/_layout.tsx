import { Slot } from 'expo-router';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';

/**
 * Sem um `_layout` raiz o expo-router usa o navegador padrão, que envolve TODO o
 * app num SafeAreaView nativo (iOS e Android sem edge-to-edge). O app já aplica as
 * áreas seguras por tela (ScreenContainer/V2Shell) — com o SafeAreaView do router
 * por cima a margem era aplicada duas vezes e só se acertava depois da primeira
 * medição nativa, o que aparecia como "tela fora do tamanho na primeira abertura".
 * Aqui o layout raiz é só o Slot, igual ao app do cliente. As rotas de autenticação
 * (`app/auth`) não usam ScreenContainer e mantêm a área segura no próprio layout.
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <Slot />
    </ThemeProvider>
  );
}
