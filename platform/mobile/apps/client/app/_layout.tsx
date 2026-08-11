import { Slot } from 'expo-router';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';

/**
 * O ThemeProvider precisa envolver o Slot: qualquer rota (e o analisador do expo-router)
 * usa os hooks de tema; se o provider ficasse só dentro de App, a árvore do router
 * poderia avaliar imports/órbita sem o contexto correto.
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <Slot />
    </ThemeProvider>
  );
}