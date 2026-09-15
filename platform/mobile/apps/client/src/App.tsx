import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import { CartProvider } from '@/shared/contexts/CartContext';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';
import { AnalyticsProvider } from '@/shared/contexts/AnalyticsContext';
import { queryClient } from '@/shared/config/react-query';
import { appFonts, applyDefaultFonts } from '@/shared/theme/fonts';
import Navigation from './navigation/production';
import { theme } from './theme';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { initSentry } from '@/shared/config/sentry';
import { VisitSessionProvider } from './contexts/VisitSessionContext';
import { ServiceTypeProvider } from './contexts/ServiceTypeContext';
import { ServiceTypeSync } from './components/ServiceTypeSync';
import { Notifications, registerCustomerPushToken, subscribeCustomerPushTokenChanges } from './services/customer-push';
import { getSupabaseClient, isSupabaseConfigured } from '@/shared/services/supabase';

// Capture crashes/errors in production as early as possible, before the
// provider tree mounts. No-ops with a console warning if EXPO_PUBLIC_SENTRY_DSN
// isn't set (see shared/config/sentry.ts).
initSentry();

export default function App() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [fontWaitExpired, setFontWaitExpired] = useState(false);

  useEffect(() => {
    // A migração do AppDelegate para ExpoAppDelegate pode manter a launch view
    // sobre a árvore React mesmo depois do primeiro frame no dev client.
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setFontWaitExpired(true), 3000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    registerCustomerPushToken().catch(() => undefined);
    const unsubscribeToken = subscribeCustomerPushTokenChanges();
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notification-count'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    });
    if (!isSupabaseConfigured()) {
      return () => {
        unsubscribeToken();
        received.remove();
      };
    }
    const { data } = getSupabaseClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') registerCustomerPushToken().catch(() => undefined);
    });
    return () => {
      data.subscription.unsubscribe();
      unsubscribeToken();
      received.remove();
    };
  }, []);

  if (!fontsLoaded && !fontError && !fontWaitExpired) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator color="#ef6c2f" />
      </View>
    );
  }
  if (fontError) {
    console.warn('[fonts] Não foi possível carregar as fontes customizadas; usando fontes do sistema.', fontError);
  }
  if (fontsLoaded) {
    applyDefaultFonts();
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultMode="light">
            <AnalyticsProvider>
              <VisitSessionProvider>
                <ServiceTypeProvider>
                  <ServiceTypeSync />
                  <CartProvider>
                    <PaperProvider theme={theme}>
                      <Navigation />
                      <StatusBar style="auto" />
                      <Toast />
                    </PaperProvider>
                  </CartProvider>
                </ServiceTypeProvider>
              </VisitSessionProvider>
            </AnalyticsProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
