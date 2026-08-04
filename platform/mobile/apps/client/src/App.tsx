import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import { CartProvider } from '@/shared/contexts/CartContext';
import { queryClient } from '@/shared/config/react-query';
import Navigation from './navigation/production';
import { theme } from './theme';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { initSentry } from '@/shared/config/sentry';
import { VisitSessionProvider } from './contexts/VisitSessionContext';
import { registerCustomerPushToken } from './services/customer-push';
import { getSupabaseClient, isSupabaseConfigured } from '@/shared/services/supabase';

// Capture crashes/errors in production as early as possible, before the
// provider tree mounts. No-ops with a console warning if EXPO_PUBLIC_SENTRY_DSN
// isn't set (see shared/config/sentry.ts).
initSentry();

export default function App() {
  useEffect(() => {
    registerCustomerPushToken().catch(() => undefined);
    if (!isSupabaseConfigured()) return;
    const { data } = getSupabaseClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') registerCustomerPushToken().catch(() => undefined);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <VisitSessionProvider>
            <CartProvider>
              <PaperProvider theme={theme}>
                <Navigation />
                <StatusBar style="auto" />
                <Toast />
              </PaperProvider>
            </CartProvider>
          </VisitSessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
