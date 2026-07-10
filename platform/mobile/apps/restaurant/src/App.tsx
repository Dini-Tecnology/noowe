/**
 * Restaurant App Entry Point
 * 
 * Main application component for the Restaurant management app.
 * Provides context providers for:
 * - React Query for server state management
 * - Paper UI theming
 * - Theme context for light/dark mode
 * - Restaurant context for authenticated restaurant data
 * - WebSocket connection for real-time updates
 * 
 * @module App
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { Appearance, AppState, AppStateStatus } from 'react-native';
import Navigation from './navigation';
import { theme } from './theme';
import socketService from './services/socket';
import { authService } from '@/shared/services/auth';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';
import { RestaurantProvider } from '@/shared/contexts/RestaurantContext';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { initDeepLinking } from '@/shared/utils/deep-linking';
import { initSentry } from '@/shared/config/sentry';

// Capture crashes/errors in production as early as possible, before the
// provider tree mounts. No-ops with a console warning if EXPO_PUBLIC_SENTRY_DSN
// isn't set (see shared/config/sentry.ts).
initSentry();

// Configure React Query with sensible defaults for restaurant operations
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes - balance between freshness and API load
    },
  },
});

let webSocketDebugListenersBound = false;

function bindWebSocketDebugListeners() {
  if (webSocketDebugListenersBound) return;

  socketService.on('connect', () => {
    console.log('[WebSocket] Connected successfully');
  });

  socketService.on('disconnect', () => {
    console.log('[WebSocket] Disconnected');
  });

  socketService.on('error', (error: any) => {
    console.warn('[WebSocket] Error:', error);
  });

  webSocketDebugListenersBound = true;
}

/**
 * AppContent component
 * 
 * Handles WebSocket initialization and app lifecycle events.
 * Separated from App to access context providers.
 */
function AppContent() {
  useEffect(() => {
    Appearance.setColorScheme('light');
    const appearanceSubscription = Appearance.addChangeListener(() => {
      Appearance.setColorScheme('light');
    });
    const cleanupDeepLinking = initDeepLinking();

    // Initialize WebSocket connection when app starts
    initializeWebSocket();

    // Handle app state changes (foreground/background)
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup on unmount
    return () => {
      appearanceSubscription.remove();
      cleanupDeepLinking();
      subscription.remove();
      socketService.disconnect();
    };
  }, []);

  /**
   * Initialize WebSocket connection with authenticated user
   * Joins restaurant room for real-time order/reservation updates
   */
  const initializeWebSocket = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (!user) return;

      bindWebSocketDebugListeners();
      const connected = await socketService.connect();
      if (!connected) return;

      const legacyRestaurantId = (user as { restaurant_id?: unknown }).restaurant_id;
      const restaurantIds = (user as { restaurant_ids?: unknown }).restaurant_ids;
      const restaurantId =
        typeof legacyRestaurantId === 'string'
          ? legacyRestaurantId
          : Array.isArray(restaurantIds) && typeof restaurantIds[0] === 'string'
            ? restaurantIds[0]
            : null;

      if (restaurantId) {
        socketService.joinRestaurantRoom(restaurantId);
      }
    } catch (error) {
      console.warn('[WebSocket] Failed to initialize:', error);
    }
  };

  /**
   * Handle app lifecycle state changes
   * Manages WebSocket connection based on app visibility
   * 
   * @param nextAppState - New app state (active, background, inactive)
   */
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      // App came to foreground - reconnect if needed
      if (!socketService.isConnected) {
        initializeWebSocket();
      }
    } else if (nextAppState === 'background') {
      // App went to background - disconnect to save battery/resources
      socketService.disconnect();
    }
  };

  return (
    <>
      <Navigation />
      <StatusBar style="dark" />
    </>
  );
}

/**
 * Main App component
 * 
 * Sets up the provider hierarchy for the Restaurant app:
 * 1. SafeAreaProvider - handles device safe areas (notch, etc.)
 * 2. QueryClientProvider - React Query for API state
 * 3. ThemeProvider - light/dark mode theming
 * 4. RestaurantProvider - authenticated restaurant context
 * 5. PaperProvider - React Native Paper UI components
 */
export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultMode="light">
            <RestaurantProvider>
              <PaperProvider theme={theme}>
                <AppContent />
              </PaperProvider>
            </RestaurantProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
