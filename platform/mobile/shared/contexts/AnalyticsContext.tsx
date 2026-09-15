import React, { createContext, useContext, ReactNode } from 'react';
import analytics from '../services/analytics';

interface AnalyticsContextData {
  /**
   * Define o ID e propriedades do usuário atual
   * Chamado após login/signup bem-sucedido
   */
  setUser: (userId: string, properties?: Record<string, string>) => Promise<void>;

  /**
   * Remove identificação do usuário
   * Chamado no logout
   */
  clearUser: () => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextData>({} as AnalyticsContextData);

interface AnalyticsProviderProps {
  children: ReactNode;
}

/**
 * Provider para gerenciar analytics globalmente
 * Encapsula configurações de usuário e lifecycle
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <AnalyticsProvider>
 *       <Navigation />
 *     </AnalyticsProvider>
 *   );
 * }
 * ```
 */
export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const setUser = async (userId: string, properties?: Record<string, string>) => {
    await analytics.setUserId(userId);

    if (properties) {
      await analytics.setUserProperties(properties);
    }
  };

  const clearUser = async () => {
    await analytics.setUserId(null);
  };

  return (
    <AnalyticsContext.Provider value={{ setUser, clearUser }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

/**
 * Hook para acessar o contexto de analytics
 * Fornece métodos para gerenciar usuário
 *
 * @example
 * ```tsx
 * function LoginScreen() {
 *   const { setUser } = useAnalyticsContext();
 *
 *   const handleLogin = async (email, password) => {
 *     const user = await login(email, password);
 *     await setUser(user.id, {
 *       account_type: user.role,
 *       plan: user.plan,
 *     });
 *   };
 *
 *   return <LoginForm onSubmit={handleLogin} />;
 * }
 * ```
 */
export const useAnalyticsContext = () => {
  const context = useContext(AnalyticsContext);

  if (!context?.setUser) {
    throw new Error('useAnalyticsContext must be used within AnalyticsProvider');
  }

  return context;
};
