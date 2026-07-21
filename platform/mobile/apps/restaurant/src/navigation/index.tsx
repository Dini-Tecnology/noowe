/**
 * Restaurant App Navigation — V2 production flow
 *
 * Auth stack + bottom tabs (Liquid Glass) + stack modals for telas secundárias V2.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as WebBrowser from 'expo-web-browser';
import { authService } from '@/shared/services/auth';
import { socialAuthService } from '@/shared/services/social-auth';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { logger } from '@/shared/utils/logger';
import {
  isAppleAuthProviderConfigured,
  isBiometricAuthConfigured,
  isGoogleAuthProviderConfigured,
} from '@/shared/config/auth-providers';
import { captureException } from '@/shared/config/sentry';
import { showErrorToast } from '@/shared/utils/error-handler';
import {
  fadeScreenOptions,
  modalScreenOptions,
  scaleFadeScreenOptions,
  defaultScreenOptions,
} from '@/shared/config/navigation-animations';
import { RestaurantTabBar } from '../components/navigation/RestaurantTabBar';
import { liquidGlassTabNavigatorScreenOptions } from '@okinawa/shared/components/LiquidGlassBottomNav';
import {
  WelcomeScreen,
  PhoneAuthScreen,
  PhoneRegisterScreen,
  BiometricEnrollmentScreen,
  AuthCallbackScreen,
  ResetPasswordScreen,
} from '@/shared/screens/auth';
import { PrivacyPolicyScreen, TermsOfServiceScreen, ReConsentScreen } from '@/shared/screens/legal';
import { MaintenanceScreen } from '@/shared/screens/MaintenanceScreen';
import { useMaintenanceCheck } from '@/shared/hooks/useMaintenanceCheck';
import { onConsentRequired } from '@/shared/services/api';
import ApiService from '@okinawa/shared/services/api';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import PostSignupRoleScreen from '../screens/auth/PostSignupRoleScreen';
import WaitingAccessScreen from '../screens/auth/WaitingAccessScreen';
import CreateRestaurantScreen from '../screens/auth/CreateRestaurantScreen';
import { RESTAURANT_BRANDING } from '../constants/branding';
import {
  clearRoleIntent,
  getRoleIntent,
  setRoleIntent,
  type RoleIntent,
} from '../services/role-intent';
import { getOptionalSupabaseSessionUser } from '@okinawa/shared/services/supabase-auth';

// V2 production screens
import OwnerHubScreen from '../screens/v2/OwnerHubScreen';
import OrdersScreen from '../screens/v2/OrdersScreen';
import KitchenDisplayScreen from '../screens/v2/KitchenDisplayScreen';
import TablesScreen from '../screens/v2/TablesScreen';
import SettingsScreen from '../screens/v2/SettingsScreen';
import BarKDSScreen from '../screens/v2/BarKDSScreen';
import MenuScreen from '../screens/v2/MenuScreen';
import ReservationsScreen from '../screens/v2/ReservationsScreen';
import StaffScreen from '../screens/v2/StaffScreen';
import TipsScreen from '../screens/v2/TipsScreen';
import FinancialScreen from '../screens/v2/FinancialScreen';
import ReportsScreen from '../screens/v2/ReportsScreen';
import ReviewsScreen from '../screens/v2/ReviewsScreen';
import PromotionsScreen from '../screens/v2/PromotionsScreen';
import LoyaltyScreen from '../screens/v2/LoyaltyScreen';
import RoleDashboardScreen from '../screens/v2/RoleDashboardScreen';
import WaiterScreen from '../screens/v2/WaiterScreen';
import MaitreScreen from '../screens/v2/MaitreScreen';
import QRGeneratorScreen from '../screens/v2/QRGeneratorScreen';
import QRBatchScreen from '../screens/v2/QRBatchScreen';
import OrderPaymentScreen from '../screens/v2/OrderPaymentScreen';
import RestaurantSelectorScreen from '../screens/v2/RestaurantSelectorScreen';
import ServiceConfigScreen from '../screens/v2/ServiceConfigScreen';
import WaitlistScreen from '../screens/v2/WaitlistScreen';
import CallsScreen from '../screens/v2/CallsScreen';
import CasualDiningScreen from '../screens/v2/CasualDiningScreen';
import RestaurantProfileScreen from '../screens/v2/RestaurantProfileScreen';
import BusinessHoursScreen from '../screens/v2/BusinessHoursScreen';
import NotificationSettingsScreen from '../screens/v2/NotificationSettingsScreen';
import PaymentSettingsScreen from '../screens/v2/PaymentSettingsScreen';
import CustomersScreen from '../screens/v2/CustomersScreen';
import ShiftsScreen from '../screens/v2/ShiftsScreen';
import IntegrationsScreen from '../screens/v2/IntegrationsScreen';
import ConfigExperienceScreen from '../screens/v2/config/ConfigExperienceScreen';
import ConfigFloorScreen from '../screens/v2/config/ConfigFloorScreen';
import ConfigKitchenScreen from '../screens/v2/config/ConfigKitchenScreen';
import ConfigPaymentsScreen from '../screens/v2/config/ConfigPaymentsScreen';
import ConfigMarketplaceScreen from '../screens/v2/config/ConfigMarketplaceScreen';
import UserAccountScreen from '../screens/v2/UserAccountScreen';
import { RestaurantRoleProvider, useRestaurantRole, RestaurantRole } from '../contexts/RestaurantRoleContext';

WebBrowser.maybeCompleteAuthSession();

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function BootFallback() {
  return (
    <View style={bootStyles.container}>
      <ActivityIndicator size="large" color="#FF6B35" />
      <Text style={bootStyles.label}>Carregando Noowe Restaurant...</Text>
    </View>
  );
}

const bootStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  label: {
    marginTop: 16,
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

/** Renders the screen only if the authenticated user's server role is allowed. */
function withRoleGuard<P extends object>(
  Component: React.ComponentType<P>,
  allowedRoles: RestaurantRole[],
): React.ComponentType<P> {
  return function RoleGuardedScreen(props: P) {
    const { serverRole, roleLoading } = useRestaurantRole();
    if (roleLoading) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      );
    }
    // null means user has no role record — deny by default, never allow through
    if (!serverRole || !allowedRoles.includes(serverRole)) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 }}>
            Acesso restrito
          </Text>
          <Text style={{ color: '#6B7280', textAlign: 'center' }}>
            {serverRole
              ? `Seu perfil (${serverRole}) não tem permissão para acessar esta área.`
              : 'Sem permissão de acesso. Contacte o administrador do restaurante.'}
          </Text>
        </View>
      );
    }
    return <Component {...props} />;
  };
}

const GuardedFinancial = withRoleGuard(FinancialScreen, ['owner', 'manager']);
const GuardedReports = withRoleGuard(ReportsScreen, ['owner', 'manager']);
const GuardedStaff = withRoleGuard(StaffScreen, ['owner', 'manager']);
const GuardedRestaurantProfile = withRoleGuard(RestaurantProfileScreen, ['owner', 'manager']);
const GuardedBusinessHours = withRoleGuard(BusinessHoursScreen, ['owner', 'manager']);
const GuardedServiceConfig = withRoleGuard(ServiceConfigScreen, ['owner', 'manager']);
const GuardedNotificationSettings = withRoleGuard(NotificationSettingsScreen, ['owner', 'manager']);
const GuardedPaymentSettings = withRoleGuard(PaymentSettingsScreen, ['owner', 'manager']);
const GuardedConfigExperience = withRoleGuard(ConfigExperienceScreen, ['owner', 'manager']);
const GuardedConfigFloor = withRoleGuard(ConfigFloorScreen, ['owner', 'manager']);
const GuardedConfigKitchen = withRoleGuard(ConfigKitchenScreen, ['owner', 'manager']);
const GuardedConfigPayments = withRoleGuard(ConfigPaymentsScreen, ['owner', 'manager']);
const GuardedConfigMarketplace = withRoleGuard(ConfigMarketplaceScreen, ['owner', 'manager']);
const GuardedWaiter = withRoleGuard(WaiterScreen, ['owner', 'manager', 'waiter', 'maitre']);
const GuardedBarKDS = withRoleGuard(BarKDSScreen, ['owner', 'manager', 'barman', 'chef']);
const GuardedMaitre = withRoleGuard(MaitreScreen, ['owner', 'manager', 'maitre']);
const GuardedKitchen = withRoleGuard(KitchenDisplayScreen, ['owner', 'manager', 'chef', 'cook']);
const GuardedMenu = withRoleGuard(MenuScreen, ['owner', 'manager', 'chef']);
const GuardedTips = withRoleGuard(TipsScreen, ['owner', 'manager', 'waiter']);
const GuardedReservations = withRoleGuard(ReservationsScreen, ['owner', 'manager', 'maitre']);
const GuardedCalls = withRoleGuard(CallsScreen, ['owner', 'manager', 'waiter', 'maitre']);
const GuardedTables = withRoleGuard(TablesScreen, ['owner', 'manager', 'maitre', 'waiter']);
const GuardedCustomers = withRoleGuard(CustomersScreen, ['owner', 'manager']);
const GuardedShifts = withRoleGuard(ShiftsScreen, ['owner', 'manager']);
const GuardedIntegrations = withRoleGuard(IntegrationsScreen, ['owner', 'manager']);

interface AuthStackBodyProps {
  googleLoginAvailable: boolean;
  appleLoginAvailable: boolean;
  biometricLoginAvailable: boolean;
}

function AuthStackBody({
  googleLoginAvailable,
  appleLoginAvailable,
  biometricLoginAvailable,
}: AuthStackBodyProps) {
  const [authLoading, setAuthLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const handleAppleLogin = useCallback(async () => {
    if (!appleLoginAvailable) return;
    setAuthLoading(true);
    try {
      const result = await socialAuthService.signInWithApple();
      if (result.success && result.idToken) {
        const authResult = await authService.socialLogin('apple', result.idToken);
        if (!authResult.success) {
          showErrorToast(new Error(authResult.error || 'Não foi possível entrar com Apple.'));
        }
      } else if (!result.success) {
        showErrorToast(new Error(result.error || 'Não foi possível entrar com Apple.'));
      } else {
        showErrorToast(new Error('A Apple não retornou uma credencial de acesso.'));
      }
    } catch (error) {
      logger.error('Apple login failed:', error);
      showErrorToast(error, 'Não foi possível entrar com Apple.');
    } finally {
      setAuthLoading(false);
    }
  }, [appleLoginAvailable]);

  const handleGoogleLogin = useCallback(async () => {
    if (!googleLoginAvailable) return;
    setAuthLoading(true);
    try {
      const result = await socialAuthService.signInWithGoogleOAuth();
      if (result.success && result.callbackUrl) {
        await authService.recoverSessionFromUrl(result.callbackUrl);
      } else if (!result.success) {
        showErrorToast(new Error(result.error || 'Não foi possível entrar com Google.'));
      } else {
        showErrorToast(new Error('O Google não retornou ao aplicativo.'));
      }
    } catch (error) {
      logger.error('Google login failed:', error);
      showErrorToast(error, 'Não foi possível entrar com Google.');
    } finally {
      setAuthLoading(false);
    }
  }, [googleLoginAvailable]);

  const handlePhoneLogin = useCallback((navigation: any) => {
    navigation.navigate('PhoneAuth');
  }, []);

  const handleBiometricLogin = useCallback(async () => {
    if (!biometricLoginAvailable) return;
    setBiometricLoading(true);
    try {
      const result = await authService.biometricLogin('supabase-session');
      if (!result.success) {
        logger.warn('Biometric login failed:', result.error);
        showErrorToast(new Error(result.error || 'Não foi possível entrar com biometria.'));
      }
    } catch (error) {
      logger.error('Biometric login error:', error);
      showErrorToast(error, 'Não foi possível entrar com biometria.');
    } finally {
      setBiometricLoading(false);
    }
  }, [biometricLoginAvailable]);

  const handleAuthSuccess = useCallback((result: any) => {
    logger.info('Auth success:', { userId: result.user?.id });
  }, []);

  return (
    <Stack.Navigator id="restaurant-auth-stack" screenOptions={fadeScreenOptions} initialRouteName="Login">
      <Stack.Screen name="Login" options={{ headerShown: false }}>
        {(props) => (
          <LoginScreen
            {...props}
            onAppleLogin={handleAppleLogin}
            onGoogleLogin={handleGoogleLogin}
            onBiometricLogin={handleBiometricLogin}
            googleLoginAvailable={googleLoginAvailable}
            appleLoginAvailable={appleLoginAvailable}
            loading={authLoading}
            biometricLoading={biometricLoading}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="AuthCallback" options={{ headerShown: false }}>
        {(props) => <AuthCallbackScreen {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ResetPassword" options={{ headerShown: false }}>
        {(props) => <ResetPasswordScreen {...props} />}
      </Stack.Screen>
      <Stack.Screen name="Register" options={{ headerShown: false }}>
        {(props) => (
          <RegisterScreen
            {...props}
            onAppleLogin={handleAppleLogin}
            onGoogleLogin={handleGoogleLogin}
            onBiometricLogin={handleBiometricLogin}
            googleLoginAvailable={googleLoginAvailable}
            appleLoginAvailable={appleLoginAvailable}
            loading={authLoading}
            biometricLoading={biometricLoading}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Welcome" options={{ headerShown: false }}>
        {(props) => (
          <WelcomeScreen
            {...props}
            logoIconSource={RESTAURANT_BRANDING.icon}
            logoFullSource={RESTAURANT_BRANDING.logoFull}
            brandTitle="NOOWE Restaurant"
            googleLoginAvailable={googleLoginAvailable}
            appleLoginAvailable={appleLoginAvailable}
            biometricLoginAvailable={biometricLoginAvailable}
            onAppleLogin={handleAppleLogin}
            onGoogleLogin={handleGoogleLogin}
            onPhoneLogin={() => handlePhoneLogin(props.navigation)}
            onBiometricLogin={handleBiometricLogin}
            loading={authLoading}
            biometricLoading={biometricLoading}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="PhoneAuth" options={{ ...modalScreenOptions, headerShown: false }}>
        {(props) => <PhoneAuthScreen {...props} onSuccess={handleAuthSuccess} />}
      </Stack.Screen>
      <Stack.Screen name="PhoneRegister" options={{ headerShown: false }}>
        {(props) => (
          <PhoneRegisterScreen
            {...props}
            onSuccess={handleAuthSuccess}
            onBiometricPrompt={(enrollmentToken) =>
              props.navigation.navigate('BiometricEnrollment', {
                enrollmentToken,
                userId: enrollmentToken,
              })
            }
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="BiometricEnrollment" options={{ headerShown: false }}>
        {(props) => (
          <BiometricEnrollmentScreen
            {...props}
            onComplete={() => props.navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
            onSkip={() => props.navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="RestaurantSelector" component={RestaurantSelectorScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function AuthStack() {
  const appleLoginAvailable = isAppleAuthProviderConfigured();
  const biometricLoginAvailable = isBiometricAuthConfigured();
  return (
    <AuthStackBody
      googleLoginAvailable={isGoogleAuthProviderConfigured()}
      appleLoginAvailable={appleLoginAvailable}
      biometricLoginAvailable={biometricLoginAvailable}
    />
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      id="restaurant-main-tabs"
      initialRouteName="Hub"
      backBehavior="initialRoute"
      tabBar={(props) => <RestaurantTabBar {...props} />}
      screenOptions={{
        ...liquidGlassTabNavigatorScreenOptions,
        sceneContainerStyle: { backgroundColor: '#FFFFFF' },
        sceneStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Tab.Screen name="Hub" component={OwnerHubScreen} options={{ title: 'Início' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Pedidos' }} />
      <Tab.Screen name="Kitchen" component={GuardedKitchen} options={{ title: 'Cozinha' }} />
      <Tab.Screen name="Tables" component={GuardedTables} options={{ title: 'Mesas' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Config' }} />
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator
      id="restaurant-main-stack"
      initialRouteName="Tabs"
      screenOptions={{
        ...defaultScreenOptions,
        headerShown: false,
        cardStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Menu" component={GuardedMenu} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Reservations" component={GuardedReservations} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Staff" component={GuardedStaff} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Tips" component={GuardedTips} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Financial" component={GuardedFinancial} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Reports" component={GuardedReports} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Reviews" component={ReviewsScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Promotions" component={PromotionsScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Loyalty" component={LoyaltyScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="RoleDashboard" component={RoleDashboardScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Waiter" component={GuardedWaiter} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Maitre" component={GuardedMaitre} options={scaleFadeScreenOptions} />
      <Stack.Screen name="BarKDS" component={GuardedBarKDS} options={scaleFadeScreenOptions} />
      <Stack.Screen name="QRGenerator" component={QRGeneratorScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="QRBatch" component={QRBatchScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="OrderPayment" component={OrderPaymentScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="ServiceConfig" component={GuardedServiceConfig} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Waitlist" component={WaitlistScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Calls" component={GuardedCalls} options={scaleFadeScreenOptions} />
      <Stack.Screen name="CasualDining" component={CasualDiningScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="RestaurantProfile" component={GuardedRestaurantProfile} options={scaleFadeScreenOptions} />
      <Stack.Screen name="UserAccount" component={UserAccountScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="BusinessHours" component={GuardedBusinessHours} options={scaleFadeScreenOptions} />
      <Stack.Screen name="NotificationSettings" component={GuardedNotificationSettings} options={scaleFadeScreenOptions} />
      <Stack.Screen name="PaymentSettings" component={GuardedPaymentSettings} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Customers" component={GuardedCustomers} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Shifts" component={GuardedShifts} options={scaleFadeScreenOptions} />
      <Stack.Screen name="Integrations" component={GuardedIntegrations} options={scaleFadeScreenOptions} />
      <Stack.Screen name="ConfigExperience" component={GuardedConfigExperience} options={scaleFadeScreenOptions} />
      <Stack.Screen name="ConfigFloor" component={GuardedConfigFloor} options={scaleFadeScreenOptions} />
      <Stack.Screen name="ConfigKitchen" component={GuardedConfigKitchen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="ConfigPayments" component={GuardedConfigPayments} options={scaleFadeScreenOptions} />
      <Stack.Screen name="ConfigMarketplace" component={GuardedConfigMarketplace} options={scaleFadeScreenOptions} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={scaleFadeScreenOptions} />
      <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} options={scaleFadeScreenOptions} />
    </Stack.Navigator>
  );
}

function AuthenticatedGate() {
  const { serverRole, roleLoading, reloadRole } = useRestaurantRole();
  const [roleIntent, setRoleIntentState] = useState<RoleIntent | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadIntent() {
      try {
        const { user } = await getOptionalSupabaseSessionUser();
        if (!user) {
          if (!cancelled) setRoleIntentState(null);
          return;
        }
        const intent = await getRoleIntent(user.id);
        if (!cancelled) setRoleIntentState(intent);
      } catch (error) {
        logger.warn('Failed to load role intent:', error);
        if (!cancelled) setRoleIntentState(null);
      }
    }

    void loadIntent();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectIntent = useCallback(async (intent: RoleIntent) => {
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) return;
    await setRoleIntent(user.id, intent);
    setRoleIntentState(intent);
  }, []);

  const handleChangeRole = useCallback(async () => {
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) return;
    await clearRoleIntent(user.id);
    setRoleIntentState(null);
  }, []);

  const handleRefreshAccess = useCallback(async () => {
    return reloadRole();
  }, [reloadRole]);

  if (roleLoading || roleIntent === undefined) {
    return <BootFallback />;
  }

  // Already linked to a restaurant — full app access
  if (serverRole) {
    return <MainStack key="restaurant-main" />;
  }

  // Owner intent without a restaurant yet — create establishment + owner role
  if (roleIntent === 'owner') {
    return (
      <CreateRestaurantScreen
        onCreated={async () => {
          await reloadRole();
        }}
      />
    );
  }

  // Staff intent without a linked role — wait for owner to grant access
  if (roleIntent === 'staff') {
    return (
      <WaitingAccessScreen
        onRefresh={handleRefreshAccess}
        onChangeRole={handleChangeRole}
      />
    );
  }

  // First authenticated session without a choice yet
  return <PostSignupRoleScreen onSelect={handleSelectIntent} />;
}

function AuthenticatedRoot() {
  return (
    <RestaurantRoleProvider>
      <AuthenticatedGate />
    </RestaurantRoleProvider>
  );
}

export default function Navigation() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresConsent, setRequiresConsent] = useState(false);
  const [consentVersions, setConsentVersions] = useState<{
    currentTermsVersion: string;
    currentPrivacyVersion: string;
  } | null>(null);
  const { isInMaintenance, message: maintenanceMessage, estimatedEnd, clearMaintenance } = useMaintenanceCheck();

  useEffect(() => {
    checkAuth();
    const unsubscribe = authService.onAuthStateChange(setIsAuthenticated);
    const unsubscribeConsent = onConsentRequired((data) => {
      setConsentVersions(data);
      setRequiresConsent(true);
    });
    return () => {
      unsubscribe?.();
      unsubscribeConsent();
    };
  }, []);

  const checkAuth = async () => {
    try {
      const user = await authService.restoreSession();
      setIsAuthenticated(!!user);
    } catch (error) {
      logger.error('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigationError = (error: Error, errorInfo: React.ErrorInfo) => {
    logger.error('Navigation error:', { error: error.message, stack: error.stack });
    captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  };

  if (isLoading) return <BootFallback />;

  if (requiresConsent && consentVersions) {
    return (
      <ReConsentScreen
        termsVersion={consentVersions.currentTermsVersion}
        privacyVersion={consentVersions.currentPrivacyVersion}
        onConsentAccepted={() => {
          setRequiresConsent(false);
          setConsentVersions(null);
          ApiService.resolveConsentQueue();
        }}
      />
    );
  }

  if (isInMaintenance) {
    return (
      <MaintenanceScreen
        message={maintenanceMessage}
        estimatedEnd={estimatedEnd}
        onMaintenanceOver={clearMaintenance}
      />
    );
  }

  return (
    <View style={styles.appSurface}>
      <ErrorBoundary onError={handleNavigationError}>
        {isAuthenticated ? <AuthenticatedRoot key="restaurant-main" /> : <AuthStack key="restaurant-auth" />}
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  appSurface: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
