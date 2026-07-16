import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import { CartProvider } from '@/shared/contexts/CartContext';
import { queryClient } from '@/shared/config/react-query';
import { disableConsoleLogs } from '@/shared/utils/logger';
import { initDeepLinking } from '@/shared/utils/deep-linking';
import { pushNotificationService } from '@/shared/services/push-notifications';
import Navigation from './navigation';
import { theme } from './theme';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';
import { AnalyticsProvider } from '@/shared/contexts/AnalyticsContext';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { initSentry } from '@/shared/config/sentry';

// Capture crashes/errors in production as early as possible, before the
// provider tree mounts. No-ops with a console warning if EXPO_PUBLIC_SENTRY_DSN
// isn't set (see shared/config/sentry.ts).
initSentry();

export default function App() {
  useEffect(() => {
    // Disable console logs in production
    disableConsoleLogs();

    // Initialize deep linking
    const cleanupDeepLinking = initDeepLinking();

    // Initialize push notifications
    pushNotificationService.initialize();

    return () => {
      cleanupDeepLinking();
      pushNotificationService.cleanup();
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <CartProvider>
            <AnalyticsProvider>
              <ThemeProvider>
                <PaperProvider theme={theme}>
                  <Navigation />
                  <StatusBar style="auto" />
                  <Toast />
                </PaperProvider>
              </ThemeProvider>
            </AnalyticsProvider>
          </CartProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
