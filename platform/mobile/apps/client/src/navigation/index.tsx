/**
 * Client App Navigation Configuration
 * 
 * Root navigation structure for the customer-facing mobile application.
 * Implements modern passwordless-first authentication flow.
 * 
 * Navigation Structure:
 * - AuthStack: Welcome, Social Login, Phone OTP, Biometric screens
 * - MainStack: Authenticated user screens with bottom tab navigation
 * 
 * @module client/navigation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { authService } from '@/shared/services/auth';
import { socialAuthService } from '@/shared/services/social-auth';
import { biometricAuthService } from '@/shared/services/biometric-auth';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { logger } from '@/shared/utils/logger';
import { captureException } from '@/shared/config/sentry';
import { useColors } from '@/shared/contexts/ThemeContext';
import {
  defaultScreenOptions,
  fadeScreenOptions,
  modalScreenOptions,
  scaleFadeScreenOptions,
} from '@/shared/config/navigation-animations';

// ============================================
// AUTH SCREENS (Modern Passwordless-First)
// ============================================
import { 
  WelcomeScreen,
  PhoneAuthScreen,
  PhoneRegisterScreen,
  BiometricEnrollmentScreen,
} from '@/shared/screens/auth';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// ============================================
// MAIN SCREENS (Bottom Tab Navigation)
// ============================================
import HomeScreen from '../screens/home/HomeScreen';
import ExploreScreen from '../screens/home/ExploreScreen';
import OrdersScreen from '../screens/orders/OrdersScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

// ============================================
// SECONDARY SCREENS (Stack Navigation)
// ============================================
import MenuScreen from '../screens/menu/MenuScreen';
import CartScreen from '../screens/cart/CartScreen';
import RestaurantScreen from '../screens/restaurant/RestaurantScreen';
import UnifiedPaymentScreen from '../screens/payment/UnifiedPaymentScreen';
import CheckoutScreen from '../screens/payment/CheckoutScreen';
import PaymentSuccessScreen from '../screens/payment/PaymentSuccessScreen';
import SplitPaymentScreen from '../screens/payment/SplitPaymentScreen';

// ============================================
// EPIC 3 — Missing Screens
// ============================================
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import AddressesScreen from '../screens/profile/AddressesScreen';
import LoyaltyDetailScreen from '../screens/loyalty/LoyaltyDetailScreen';
import CouponsScreen from '../screens/promotions/CouponsScreen';

// ============================================
// EPIC 14 — Pub & Bar Comanda (Tab System)
// ============================================
import TabScreen from '../screens/pub-bar/TabScreen';
import TabPaymentScreen from '../screens/pub-bar/TabPaymentScreen';

// ============================================
// MISSING SCREENS — Navigation Registration
// ============================================
import OrderStatusScreen from '../screens/orders/OrderStatusScreen';
import WalletScreen from '../screens/wallet/WalletScreen';
import ReservationsScreen from '../screens/reservations/ReservationsScreen';
import ReservationDetailScreen from '../screens/reservations/ReservationDetailScreen';
import CreateReservationScreen from '../screens/reservations/CreateReservationScreen';
import FavoritesScreen from '../screens/favorites/FavoritesScreen';
import SharedOrderScreen from '../screens/orders/SharedOrderScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import QRScannerScreen from '../screens/scanner/QRScannerScreen';
import ReviewsScreen from '../screens/reviews/ReviewsScreen';
import WaitlistScreen from '../screens/waitlist/WaitlistScreen';
import ClubHomeScreen from '../screens/club/ClubHomeScreen';
import ClubQueueScreen from '../screens/club/ClubQueueScreen';
import TicketPurchaseScreen from '../screens/club/TicketPurchaseScreen';
import VipTableScreen from '../screens/club/VipTableScreen';
import LineupScreen from '../screens/club/LineupScreen';
import PartialOrderScreen from '../screens/orders/PartialOrderScreen';
import CallWaiterScreen from '../screens/calls/CallWaiterScreen';
import GroupBookingScreen from '../screens/reservations/GroupBookingScreen';
import GuestInvitationScreen from '../screens/reservations/GuestInvitationScreen';
import ManageConsentsScreen from '../screens/settings/ManageConsentsScreen';
import TipsScreen from '../screens/tips/TipsScreen';
import StampCardsScreen from '../screens/loyalty/StampCardsScreen';
import LoyaltyHomeScreen from '../screens/loyalty/LoyaltyHomeScreen';
import BuffetCheckinScreen from '../screens/buffet/BuffetCheckinScreen';
import BirthdayBookingScreen from '../screens/club/BirthdayBookingScreen';
import WaitlistBarScreen from '../screens/waitlist/WaitlistBarScreen';
import EntryChoiceScreen from '../screens/waitlist/EntryChoiceScreen';
import DigitalReceiptScreen from '../screens/payment/DigitalReceiptScreen';
import SupportScreen from '../screens/support/SupportScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import PaymentScreen from '../screens/payment/PaymentScreen';

// ============================================
// LEGAL SCREENS (Privacy Policy & Terms of Service)
// ============================================
import { PrivacyPolicyScreen, TermsOfServiceScreen, ReConsentScreen } from '@/shared/screens/legal';

// ============================================
// MAINTENANCE SCREEN
// ============================================
import { MaintenanceScreen } from '@/shared/screens/MaintenanceScreen';
import { useMaintenanceCheck } from '@/shared/hooks/useMaintenanceCheck';
import { onConsentRequired } from '@/shared/services/api';
import ApiService from '@okinawa/shared/services/api';

// Complete auth session for web-based OAuth
WebBrowser.maybeCompleteAuthSession();

// ============================================
// NAVIGATOR INSTANCES
// ============================================
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ============================================
// AUTH STACK (Passwordless-First)
// ============================================

/**
 * Modern authentication navigation stack.
 * Prioritizes Social Login and Phone OTP with biometric quick-login.
 */
function AuthStack() {
  const [authLoading, setAuthLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Google OAuth configuration
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    // These would be configured in app.json / app.config.js
    expoClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });

  const handleAppleLogin = useCallback(async () => {
    setAuthLoading(true);
    try {
      const result = await socialAuthService.signInWithApple();
      if (result.success && result.idToken) {
        // Send to backend for JWT generation
        await authService.socialLogin('apple', result.idToken);
      }
    } catch (error) {
      logger.error('Apple login failed:', error);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    setAuthLoading(true);
    try {
      const result = await socialAuthService.signInWithGoogle(
        googleRequest,
        googleResponse,
        googlePromptAsync,
      );
      if (result.success && result.idToken) {
        await authService.socialLogin('google', result.idToken);
      }
    } catch (error) {
      logger.error('Google login failed:', error);
    } finally {
      setAuthLoading(false);
    }
  }, [googleRequest, googleResponse, googlePromptAsync]);

  const handlePhoneLogin = useCallback((navigation: any) => {
    navigation.navigate('PhoneAuth');
  }, []);

  const handleBiometricLogin = useCallback(async () => {
    setBiometricLoading(true);
    try {
      const result = await biometricAuthService.authenticate();
      if (!result.success) {
        logger.warn('Biometric login failed:', result.error);
      }
      // If successful, auth state will update and switch to MainStack
    } catch (error) {
      logger.error('Biometric login error:', error);
    } finally {
      setBiometricLoading(false);
    }
  }, []);

  const handleAuthSuccess = useCallback((result: any) => {
    // Auth state will be updated by authService, triggering navigation change
    logger.info('Auth success:', { userId: result.user?.id });
  }, []);

  const handleBiometricPrompt = useCallback((enrollmentToken: string, navigation: any) => {
    navigation.navigate('BiometricEnrollment', { enrollmentToken });
  }, []);

  const handleBiometricComplete = useCallback((navigation: any) => {
    // Biometric enrolled, auth is complete
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  }, []);

  const handleBiometricSkip = useCallback((navigation: any) => {
    // User skipped biometric, proceed to main app
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  }, []);

  return (
    <Stack.Navigator screenOptions={fadeScreenOptions}>
      {/* Welcome Screen - Entry Point */}
      <Stack.Screen name="Welcome" options={{ headerShown: false }}>
        {(props) => (
          <WelcomeScreen
            {...props}
            onAppleLogin={handleAppleLogin}
            onGoogleLogin={handleGoogleLogin}
            onPhoneLogin={() => handlePhoneLogin(props.navigation)}
            onBiometricLogin={handleBiometricLogin}
            loading={authLoading}
            biometricLoading={biometricLoading}
          />
        )}
      </Stack.Screen>

      {/* Phone OTP Authentication */}
      <Stack.Screen 
        name="PhoneAuth" 
        options={{ ...modalScreenOptions, headerShown: false }}
      >
        {(props) => (
          <PhoneAuthScreen
            {...props}
            onSuccess={handleAuthSuccess}
          />
        )}
      </Stack.Screen>

      {/* Complete Registration After Phone Verification */}
      <Stack.Screen 
        name="PhoneRegister" 
        options={{ headerShown: false }}
      >
        {(props) => (
          <PhoneRegisterScreen
            {...props}
            onSuccess={handleAuthSuccess}
            onBiometricPrompt={(token) => handleBiometricPrompt(token, props.navigation)}
          />
        )}
      </Stack.Screen>

      {/* Biometric Enrollment (After Registration) */}
      <Stack.Screen 
        name="BiometricEnrollment" 
        options={{ headerShown: false }}
      >
        {(props) => (
          <BiometricEnrollmentScreen
            {...props}
            onComplete={() => handleBiometricComplete(props.navigation)}
            onSkip={() => handleBiometricSkip(props.navigation)}
          />
        )}
      </Stack.Screen>

      {/* Legacy Email/Password (Fallback) */}
      <Stack.Screen 
        name="Login" 
        component={LoginScreen} 
        options={{ title: 'Login with Email' }}
      />
      <Stack.Screen 
        name="Register" 
        component={RegisterScreen} 
        options={{ title: 'Create Account' }}
      />
    </Stack.Navigator>
  );
}

// ============================================
// MAIN TAB NAVIGATOR
// ============================================

/**
 * Main bottom tab navigation for authenticated users.
 * Provides access to Home, Explore, Orders, and Profile screens.
 * Uses semantic theme colors for consistent styling.
 */
function MainTabs() {
  const colors = useColors();
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.foregroundMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{ tabBarLabel: 'Explore' }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ tabBarLabel: 'Orders' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

// ============================================
// MAIN STACK NAVIGATOR
// ============================================

/**
 * Main stack navigator containing tab navigation and secondary screens.
 * Provides navigation to Restaurant, Menu, Cart, and Payment screens.
 */
function MainStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Restaurant"
        component={RestaurantScreen}
        options={{ title: 'Restaurant Details', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="Menu"
        component={MenuScreen}
        options={{ title: 'Menu' }}
      />
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{ title: 'Cart', ...modalScreenOptions }}
      />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ title: 'Checkout', ...modalScreenOptions }}
      />
      <Stack.Screen
        name="Payment"
        component={UnifiedPaymentScreen}
        options={{ title: 'Payment', ...modalScreenOptions }}
      />
      <Stack.Screen
        name="UnifiedPayment"
        component={UnifiedPaymentScreen}
        options={{ title: 'Payment', ...modalScreenOptions }}
      />
      <Stack.Screen
        name="SplitPayment"
        component={SplitPaymentScreen}
        options={{ title: 'Split Bill', ...modalScreenOptions }}
      />
      <Stack.Screen
        name="PaymentSuccess"
        component={PaymentSuccessScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />

      {/* EPIC 3 — Missing Screens */}
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications', headerShown: false }}
      />
      <Stack.Screen
        name="Addresses"
        component={AddressesScreen}
        options={{ title: 'Addresses', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="LoyaltyDetail"
        component={LoyaltyDetailScreen}
        options={{ title: 'Loyalty', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="Coupons"
        component={CouponsScreen}
        options={{ title: 'Coupons', ...scaleFadeScreenOptions }}
      />

      {/* EPIC 14 — Pub & Bar Comanda */}
      <Stack.Screen
        name="TabScreen"
        component={TabScreen}
        options={{ title: 'Comanda', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="TabPayment"
        component={TabPaymentScreen}
        options={{ title: 'Payment', ...modalScreenOptions }}
      />

      {/* Orders — Status, Shared, Partial */}
      <Stack.Screen
        name="OrderStatus"
        component={OrderStatusScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SharedOrder"
        component={SharedOrderScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PartialOrder"
        component={PartialOrderScreen}
        options={{ headerShown: false }}
      />

      {/* Wallet */}
      <Stack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ headerShown: false }}
      />

      {/* Reservations */}
      <Stack.Screen
        name="Reservations"
        component={ReservationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReservationDetail"
        component={ReservationDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateReservation"
        component={CreateReservationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GroupBooking"
        component={GroupBookingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GuestInvitation"
        component={GuestInvitationScreen}
        options={{ headerShown: false }}
      />

      {/* Favorites */}
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ headerShown: false }}
      />

      {/* Settings */}
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ManageConsents"
        component={ManageConsentsScreen}
        options={{ headerShown: false }}
      />

      {/* Scanner */}
      <Stack.Screen
        name="QRScanner"
        component={QRScannerScreen}
        options={{ headerShown: false }}
      />

      {/* Reviews */}
      <Stack.Screen
        name="Reviews"
        component={ReviewsScreen}
        options={{ headerShown: false }}
      />

      {/* Tips */}
      <Stack.Screen
        name="Tips"
        component={TipsScreen}
        options={{ headerShown: false }}
      />

      {/* Waitlist */}
      <Stack.Screen
        name="Waitlist"
        component={WaitlistScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WaitlistBar"
        component={WaitlistBarScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EntryChoice"
        component={EntryChoiceScreen}
        options={{ headerShown: false }}
      />

      {/* Club */}
      <Stack.Screen
        name="ClubHome"
        component={ClubHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ClubQueue"
        component={ClubQueueScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TicketPurchase"
        component={TicketPurchaseScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VipTable"
        component={VipTableScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Lineup"
        component={LineupScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BirthdayBooking"
        component={BirthdayBookingScreen}
        options={{ headerShown: false }}
      />

      {/* Loyalty */}
      <Stack.Screen
        name="LoyaltyHome"
        component={LoyaltyHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StampCards"
        component={StampCardsScreen}
        options={{ headerShown: false }}
      />

      {/* Buffet */}
      <Stack.Screen
        name="BuffetCheckin"
        component={BuffetCheckinScreen}
        options={{ headerShown: false }}
      />

      {/* Calls */}
      <Stack.Screen
        name="CallWaiter"
        component={CallWaiterScreen}
        options={{ headerShown: false }}
      />

      {/* Digital Receipt */}
      <Stack.Screen
        name="DigitalReceipt"
        component={DigitalReceiptScreen}
        options={{ headerShown: false }}
      />

      {/* Support */}
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{ headerShown: false }}
      />

      {/* Onboarding */}
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ headerShown: false }}
      />

      {/* PaymentMethods alias */}
      <Stack.Screen
        name="PaymentMethods"
        component={PaymentScreen}
        options={{ headerShown: false }}
      />

      {/* LoyaltyHistory alias */}
      <Stack.Screen
        name="LoyaltyHistory"
        component={LoyaltyDetailScreen}
        options={{ headerShown: false }}
      />

      {/* Legal Screens */}
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ title: 'Privacy Policy', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="TermsOfService"
        component={TermsOfServiceScreen}
        options={{ title: 'Terms of Service', ...scaleFadeScreenOptions }}
      />

      {/* LGPD Sprint 2 — Re-consent when terms/privacy version changes */}
      <Stack.Screen
        name="ReConsent"
        component={ReConsentScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}

// ============================================
// ROOT NAVIGATION COMPONENT
// ============================================

/**
 * Root navigation component with authentication state management.
 * Wraps all navigation with ErrorBoundary for crash protection.
 * 
 * Features:
 * - Automatic authentication state detection
 * - Biometric quick-login attempt on app launch
 * - Conditional rendering of Auth/Main stacks
 * - Global error boundary protection
 * - Error logging to analytics services
 */
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

    // Listen for auth state changes
    const unsubscribe = authService.onAuthStateChange((authenticated) => {
      setIsAuthenticated(authenticated);
    });

    // LGPD Sprint 2: Listen for 451 (re-consent required) events from API
    const unsubscribeConsent = onConsentRequired((data) => {
      setConsentVersions(data);
      setRequiresConsent(true);
    });

    return () => {
      if (unsubscribe) unsubscribe();
      unsubscribeConsent();
    };
  }, []);

  /**
   * Checks stored authentication state on app launch.
   * Updates isAuthenticated state based on stored user data.
   */
  const checkAuth = async () => {
    try {
      const user = await authService.getStoredUser();
      setIsAuthenticated(!!user);
    } catch (error) {
      logger.error('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles navigation-level errors by logging to analytics.
   * Called by ErrorBoundary when a component error occurs.
   */
  const handleNavigationError = (error: Error, errorInfo: React.ErrorInfo) => {
    logger.error('Navigation error boundary triggered:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    // Report to Sentry for production error tracking
    captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  };

  // Show nothing while checking auth (splash screen should be visible)
  if (isLoading) {
    return null;
  }

  // LGPD Sprint 2: Show re-consent screen when terms/privacy version changed (HTTP 451)
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

  // Show maintenance screen when backend returns 503 with maintenance flag
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
    <ErrorBoundary onError={handleNavigationError}>
      <NavigationContainer>
        {isAuthenticated ? <MainStack /> : <AuthStack />}
      </NavigationContainer>
    </ErrorBoundary>
  );
}
