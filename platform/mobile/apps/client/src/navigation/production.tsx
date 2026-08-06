import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Button, Text, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { getSupabaseClient, isSupabaseConfigured } from '@/shared/services/supabase';
import customerBackend from '../services/customer-backend';
import {
  CallWaiterScreen, CartScreen, CreateReservationScreen, FavoritesScreen, HomeScreen, LoyaltyScreen,
  MenuScreen, NotificationsScreen, OrderDetailScreen, OrdersScreen, PrivacyScreen,
  ProfileScreen, PromotionsScreen, QrScannerScreen, ReservationsScreen, RestaurantScreen, ReviewsScreen, SupportScreen,
  WaitlistScreen,
} from '../screens/production';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'login') {
        await customerBackend.signIn(email, password);
      } else if (mode === 'register') {
        await customerBackend.signUp({ email, password, fullName: name, emailRedirectTo: 'https://noowebr.com/auth/callback' });
        Alert.alert('Confirme seu e-mail', 'Enviamos um link para concluir o cadastro.');
        setMode('login');
      } else {
        await customerBackend.requestPasswordReset(email, 'https://noowebr.com/auth/reset-password');
        Alert.alert('E-mail enviado', 'Use o link recebido para definir uma nova senha.');
        setMode('login');
      }
    } catch (error) { Alert.alert('Não foi possível continuar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };
  const googleLogin = async () => {
    setBusy(true);
    try {
      const supabase = getSupabaseClient(); const redirectTo = makeRedirectUri({ scheme: 'noowe', path: 'auth/callback' });
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) throw error ?? new Error('OAuth indisponível');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') {
        const params = new URL(result.url.replace('#', '?')).searchParams;
        const accessToken = params.get('access_token'); const refreshToken = params.get('refresh_token');
        if (!accessToken || !refreshToken) throw new Error('Sessão OAuth inválida');
        const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionError) throw sessionError;
      }
    } catch (error) { Alert.alert('Google', error instanceof Error ? error.message : 'Login indisponível.'); } finally { setBusy(false); }
  };
  const appleLogin = async () => {
    setBusy(true);
    try {
      if (!await AppleAuthentication.isAvailableAsync()) throw new Error('Apple Sign In não está disponível neste dispositivo.');
      const credential = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] });
      if (!credential.identityToken) throw new Error('A Apple não retornou uma identidade válida.');
      const { error } = await getSupabaseClient().auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error) throw error;
    } catch (error) { if ((error as { code?: string }).code !== 'ERR_REQUEST_CANCELED') Alert.alert('Apple', error instanceof Error ? error.message : 'Login indisponível.'); } finally { setBusy(false); }
  };
  return <KeyboardAvoidingView style={authStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={authStyles.content} keyboardShouldPersistTaps="handled"><Text variant="displaySmall">NOOWE</Text><Text variant="titleMedium">{mode === 'login' ? 'Entre na sua conta' : mode === 'register' ? 'Crie sua conta' : 'Recupere sua senha'}</Text>{mode === 'register' && <TextInput mode="outlined" label="Nome" value={name} onChangeText={setName} />}<TextInput mode="outlined" autoCapitalize="none" keyboardType="email-address" label="E-mail" value={email} onChangeText={setEmail} />{mode !== 'reset' && <TextInput mode="outlined" secureTextEntry label="Senha" value={password} onChangeText={setPassword} />}<Button mode="contained" loading={busy} disabled={busy || !email || (mode !== 'reset' && password.length < 6) || (mode === 'register' && !name)} onPress={submit}>{mode === 'login' ? 'Entrar' : mode === 'register' ? 'Cadastrar' : 'Enviar recuperação'}</Button>{mode === 'login' ? <><Button icon="google" mode="outlined" onPress={googleLogin}>Continuar com Google</Button>{Platform.OS === 'ios' && <Button icon="apple" mode="outlined" onPress={appleLogin}>Continuar com Apple</Button>}<Button onPress={() => setMode('register')}>Criar conta</Button><Button onPress={() => setMode('reset')}>Esqueci minha senha</Button></> : <Button onPress={() => setMode('login')}>Voltar ao login</Button>}</ScrollView></KeyboardAvoidingView>;
}

function MainTabs() {
  return <Tabs.Navigator screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: '#ef6c2f', tabBarIcon: ({ color, size }) => <Ionicons name={({ Home: 'home-outline', Menu: 'restaurant-outline', Orders: 'receipt-outline', Profile: 'person-outline' } as const)[route.name as 'Home'] ?? 'ellipse-outline'} color={color} size={size} /> })}>
    <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Início' }} />
    <Tabs.Screen name="Menu" component={MenuScreen} options={{ title: 'Cardápio' }} />
    <Tabs.Screen name="Orders" component={OrdersScreen} options={{ title: 'Pedidos' }} />
    <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
  </Tabs.Navigator>;
}

export default function ProductionNavigation() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setBootError('Configuração do app incompleta (Supabase). Recompile com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
      setReady(true);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      customerBackend.restoreAuth()
        .then((active) => { setAuthenticated(active); setReady(true); })
        .catch(() => setReady(true));
      const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(!!session));
      return () => data.subscription.unsubscribe();
    } catch (error) {
      setBootError(error instanceof Error ? error.message : 'Falha ao iniciar o app.');
      setReady(true);
    }
  }, []);

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

  if (!authenticated) return <AuthScreen />;
  return <Stack.Navigator>
    <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
    <Stack.Screen name="Restaurant" component={RestaurantScreen} options={{ title: 'Restaurante' }} />
    <Stack.Screen name="Menu" component={MenuScreen} options={{ title: 'Cardápio' }} />
    <Stack.Screen name="Cart" component={CartScreen} options={{ title: 'Pedido' }} />
    <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Detalhes do pedido' }} />
    <Stack.Screen name="QrScanner" component={QrScannerScreen} options={{ title: 'Mesa' }} />
    <Stack.Screen name="Reservations" component={ReservationsScreen} options={{ title: 'Reservas' }} />
    <Stack.Screen name="CreateReservation" component={CreateReservationScreen} options={{ title: 'Nova reserva' }} />
    <Stack.Screen name="Waitlist" component={WaitlistScreen} options={{ title: 'Fila de espera' }} />
    <Stack.Screen name="CallWaiter" component={CallWaiterScreen} options={{ title: 'Atendimento' }} />
    <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'Favoritos' }} />
    <Stack.Screen name="Loyalty" component={LoyaltyScreen} options={{ title: 'Fidelidade' }} />
    <Stack.Screen name="Promotions" component={PromotionsScreen} options={{ title: 'Cupons' }} />
    <Stack.Screen name="Reviews" component={ReviewsScreen} options={{ title: 'Avaliações' }} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notificações' }} />
    <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacidade' }} />
    <Stack.Screen name="Support" component={SupportScreen} options={{ title: 'Ajuda' }} />
  </Stack.Navigator>;
}

const authStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 14 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 28, gap: 12 },
  bootErrorTitle: { textAlign: 'center', color: '#1a1a1a' },
  bootErrorBody: { textAlign: 'center', color: '#666', lineHeight: 22 },
});
