import React from 'react';
import { NavigationContainerRef } from '@react-navigation/native';
import analytics from '@/shared/services/analytics';

/**
 * Configura tracking automático de navegação entre telas
 * Registra cada mudança de tela no Firebase Analytics
 *
 * @param navigationRef - Referência do NavigationContainer
 * @returns Handlers para onReady e onStateChange
 *
 * @example
 * ```tsx
 * import { trackScreenChanges } from './analytics-tracker';
 *
 * export default function Navigation() {
 *   const navigationRef = useRef(null);
 *   const screenTracking = trackScreenChanges(navigationRef);
 *
 *   return (
 *     <NavigationContainer
 *       ref={navigationRef}
 *       onReady={screenTracking.onReady}
 *       onStateChange={screenTracking.onStateChange}
 *     >
 *       <Stack.Navigator>...</Stack.Navigator>
 *     </NavigationContainer>
 *   );
 * }
 * ```
 */
export function trackScreenChanges(
  navigationRef: React.RefObject<NavigationContainerRef<any>>,
) {
  const routeNameRef: { current: string | undefined } = { current: undefined };

  return {
    /**
     * Handler chamado quando navegação está pronta
     * Registra a tela inicial
     */
    onReady: () => {
      const currentRoute = navigationRef.current?.getCurrentRoute();

      if (currentRoute) {
        routeNameRef.current = currentRoute.name;
        analytics.logScreenView(currentRoute.name);
      }
    },

    /**
     * Handler chamado quando estado da navegação muda
     * Registra mudanças de tela
     */
    onStateChange: () => {
      const previousRouteName = routeNameRef.current;
      const currentRoute = navigationRef.current?.getCurrentRoute();

      if (currentRoute && previousRouteName !== currentRoute.name) {
        // Log screen view no Firebase Analytics
        analytics.logScreenView(currentRoute.name);

        // Atualiza referência
        routeNameRef.current = currentRoute.name;
      }
    },
  };
}
