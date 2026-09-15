import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { featureFlags } from 'react-native-screens';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { getSupabaseClient, isSupabaseConfigured } from '@/shared/services/supabase';
import customerBackend from '../services/customer-backend';
import { ClientTabBar } from '../components/navigation/ClientTabBar';
import { liquidGlassTabNavigatorScreenOptions } from '@okinawa/shared/components/LiquidGlassBottomNav';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import WalletScreen from '../screens/wallet/WalletScreen';
import {
  BirthdayScreen, CallWaiterScreen, CartScreen, ComboBuilderScreen, CreateReservationScreen, DigitalReceiptScreen, EditProfileScreen, EntryOptionsScreen, FavoritesScreen, FecharContaScreen, HarmonizacaoScreen,
  HomeScreen, KidsActivitiesScreen, LoyaltyScreen,
  MenuScreen, ModoFamiliaScreen, NotificationsScreen, OrderDetailScreen, OrderReadyScreen, OrdersScreen, PaymentSuccessScreen, PrivacyScreen,
  PaymentMethodsScreen, ProfileScreen, PromotionsScreen, QrScannerScreen, QuickServiceCheckoutScreen, QuickServiceRatingScreen, ReservationConfirmationScreen, ReservationRestaurantScreen,
  ReservationsScreen, RestaurantScreen, ReviewScreen, ReviewsScreen, SplitBillScreen, SupportScreen, TipPaymentScreen,
  WaitlistScreen,
} from '../screens/production';

const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

// SDK 54 native tabs are driven by UITabBarController. Keeping this flag in
// native-managed mode prevents the host from mounting only the selected scene
// while leaving the system tab bar detached.
featureFlags.experiment.controlledBottomTabs = false;

const tabIcons = {
  Home: ['home-outline', 'home'],
  Wallet: ['wallet-outline', 'wallet'],
  Orders: ['receipt-outline', 'receipt'],
  Profile: ['person-outline', 'person'],
} as const;

/**
 * Auth flow using the app's own login/register design. Both screens sign in
 * through the shared auth service (Supabase), so the session listener in
 * ProductionNavigation picks the change up and swaps to the main stack.
 */
function AuthNavigator() {
  const [socialLoading, setSocialLoading] = useState(false);

  const handleGoogleLogin = useCallback(async () => {
    setSocialLoading(true);
    try {
      const supabase = getSupabaseClient();
      const redirectTo = makeRedirectUri({ scheme: 'noowe', path: 'auth/callback' });
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) throw error ?? new Error('OAuth indisponível');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') {
        const params = new URL(result.url.replace('#', '?')).searchParams;
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (!accessToken || !refreshToken) throw new Error('Sessão OAuth inválida');
        const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionError) throw sessionError;
      }
    } catch (error) {
      Alert.alert('Google', error instanceof Error ? error.message : 'Login indisponível.');
    } finally {
      setSocialLoading(false);
    }
  }, []);

  const handleAppleLogin = useCallback(async () => {
    setSocialLoading(true);
    try {
      if (!await AppleAuthentication.isAvailableAsync()) throw new Error('Apple Sign In não está disponível neste dispositivo.');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!credential.identityToken) throw new Error('A Apple não retornou uma identidade válida.');
      const { error } = await getSupabaseClient().auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error) throw error;
    } catch (error) {
      if ((error as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple', error instanceof Error ? error.message : 'Login indisponível.');
      }
    } finally {
      setSocialLoading(false);
    }
  }, []);

  const socialProps = {
    onGoogleLogin: handleGoogleLogin,
    onAppleLogin: handleAppleLogin,
    googleLoginAvailable: true,
    appleLoginAvailable: Platform.OS === 'ios',
    loading: socialLoading,
  };

  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login">
        {(props) => <LoginScreen {...props} {...socialProps} />}
      </AuthStack.Screen>
      <AuthStack.Screen name="Register">
        {(props) => <RegisterScreen {...props} {...socialProps} />}
      </AuthStack.Screen>
    </AuthStack.Navigator>
  );
}

function DefaultMainTabs() {
  return (
    <Tabs.Navigator
      tabBar={(props) => <ClientTabBar {...props} />}
      screenOptions={({ route }) => ({
        ...liquidGlassTabNavigatorScreenOptions,
        headerShown: false,
        tabBarActiveTintColor: '#ef6c2f',
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={tabIcons[route.name as keyof typeof tabIcons]?.[0] ?? 'ellipse-outline'}
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Início' }} />
      <Tabs.Screen name="Wallet" component={WalletScreen} options={{ title: 'Carteira' }} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{ title: 'Pedidos' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tabs.Navigator>
  );
}

function MainTabs() {
  // TODO: LiquidGlassMainTabs (native BottomTabs/BottomTabsScreen from react-native-screens)
  // creates a UITabBarController natively but it never becomes visible on-screen — confirmed via
  // device log (UITabBarController prefs lookups fire, but no bar renders). Needs a react-native-screens
  // fix/upgrade before this can replace the fallback.
  return <DefaultMainTabs />;
}

export default function ProductionNavigation() {
  const supabaseConfigured = isSupabaseConfigured();
  const [ready, setReady] = useState(!supabaseConfigured);
  const [authenticated, setAuthenticated] = useState(false);
  const [bootError, setBootError] = useState<string | null>(() => (
    supabaseConfigured
      ? null
      : 'Configuração do app incompleta (Supabase). Recompile com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
  ));

  useEffect(() => {
    if (!supabaseConfigured) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const bootstrap = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!cancelled) setAuthenticated(!!session);
        });
        unsubscribe = () => data.subscription.unsubscribe();

        const active = await customerBackend.restoreAuth();
        if (!cancelled) setAuthenticated(active);
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : 'Falha ao iniciar o app.');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [supabaseConfigured]);

  if (!ready) {
    return (
      <View style={authStyles.loading}>
        <ActivityIndicator color="#ef6c2f" />
      </View>
    );
  }

  if (bootError) {
    return (
      <View style={authStyles.loading}>
        <Text variant="titleMedium" style={authStyles.bootErrorTitle}>Não foi possível iniciar</Text>
        <Text style={authStyles.bootErrorBody}>{bootError}</Text>
      </View>
    );
  }

  if (!authenticated) return <AuthNavigator />;
  return <Stack.Navigator screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false }}>
    <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
    <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Restaurant" component={RestaurantScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Menu" component={MenuScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ComboBuilder" component={ComboBuilderScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Cart" component={CartScreen} options={{ headerShown: false }} />
    <Stack.Screen name="QuickServiceCheckout" component={QuickServiceCheckoutScreen} options={{ headerShown: false }} />
    <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ headerShown: false }} />
    <Stack.Screen name="OrderReady" component={OrderReadyScreen} options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="QuickServiceRating" component={QuickServiceRatingScreen} options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="QrScanner" component={QrScannerScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Reservations" component={ReservationsScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ReservationRestaurant" component={ReservationRestaurantScreen} options={{ headerShown: false }} />
    <Stack.Screen name="CreateReservation" component={CreateReservationScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ReservationConfirmation" component={ReservationConfirmationScreen} options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="Waitlist" component={WaitlistScreen} options={{ title: 'Fila de espera' }} />
    <Stack.Screen name="EntryOptions" component={EntryOptionsScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Birthday" component={BirthdayScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ModoFamilia" component={ModoFamiliaScreen} options={{ headerShown: false }} />
    <Stack.Screen name="KidsActivities" component={KidsActivitiesScreen} options={{ headerShown: false }} />
    <Stack.Screen name="SplitBill" component={SplitBillScreen} options={{ headerShown: false }} />
    <Stack.Screen name="TipPayment" component={TipPaymentScreen} options={{ headerShown: false }} />
    <Stack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="Review" component={ReviewScreen} options={{ headerShown: false }} />
    <Stack.Screen name="DigitalReceipt" component={DigitalReceiptScreen} options={{ headerShown: false }} />
    <Stack.Screen name="CallWaiter" component={CallWaiterScreen} options={{ title: 'Atendimento' }} />
    <Stack.Screen name="Harmonizacao" component={HarmonizacaoScreen} options={{ headerShown: false }} />
    <Stack.Screen name="FecharConta" component={FecharContaScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Loyalty" component={LoyaltyScreen} options={{ headerShown: false }} />
    <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Promotions" component={PromotionsScreen} options={{ title: 'Cupons' }} />
    <Stack.Screen name="Reviews" component={ReviewsScreen} options={{ title: 'Avaliações' }} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacidade' }} />
    <Stack.Screen name="Support" component={SupportScreen} options={{ title: 'Ajuda' }} />
  </Stack.Navigator>;
}

const authStyles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 28, gap: 12 },
  bootErrorTitle: { textAlign: 'center', color: '#1a1a1a' },
  bootErrorBody: { textAlign: 'center', color: '#666', lineHeight: 22 },
});
