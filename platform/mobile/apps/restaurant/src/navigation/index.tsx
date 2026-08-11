/**
 * Restaurant App Navigation Configuration
 * 
 * Root navigation structure for the restaurant management mobile application.
 * Implements modern passwordless-first authentication flow.
 * 
 * Navigation Structure:
 * - AuthStack: Welcome, Social Login, Phone OTP, Biometric screens
 * - MainStack: Authenticated staff screens with drawer navigation
 * 
 * @module restaurant/navigation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { authService } from '@/shared/services/auth';
import { socialAuthService } from '@/shared/services/social-auth';
import { biometricAuthService } from '@/shared/services/biometric-auth';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { logger } from '@/shared/utils/logger';
import { captureException } from '@/shared/config/sentry';
import { useColors } from '@/shared/contexts/ThemeContext';
import { useRestaurantRole } from '@/shared/contexts/RestaurantContext';
import { useAuth } from '@/shared/hooks/useAuth';
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

// ============================================
// MAIN DASHBOARD SCREENS
// ============================================
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import KDSScreen from '../screens/kds/KDSScreen';
import BarmanKDSScreen from '../screens/barman-kds/BarmanKDSScreen';
import CookStationScreen from '../screens/cook/CookStationScreen';
import WaiterCommandCenter from '../screens/waiter/WaiterCommandCenter';
import MaitreDashboardScreen from '../screens/maitre-dashboard/MaitreDashboardScreen';
import OrdersScreen from '../screens/orders/OrdersScreen';
import ReservationsScreen from '../screens/reservations/ReservationsScreen';
import FloorPlanScreen from '../screens/floor-plan/FloorPlanScreen';
import MenuScreen from '../screens/menu/MenuScreen';
import FinancialScreen from '../screens/financial/FinancialScreen';
import TipsScreen from '../screens/tips/TipsScreen';
import StaffScreen from '../screens/staff/StaffScreen';
import HRScreen from '../screens/hr/HRScreen';
import ServiceConfigScreen from '../screens/service-config/ServiceConfigScreen';
import SetupHubScreen from '../screens/setup-hub/SetupHubScreen';

// ============================================
// DETAIL SCREENS
// ============================================
import OrderDetailScreen from '../screens/orders/OrderDetailScreen';
import ReservationDetailScreen from '../screens/reservations/ReservationDetailScreen';
import TableDetailScreen from '../screens/floor-plan/TableDetailScreen';
import MenuItemDetailScreen from '../screens/menu/MenuItemDetailScreen';
import StaffDetailScreen from '../screens/staff/StaffDetailScreen';
import FinancialReportScreen from '../screens/financial/FinancialReportScreen';
import TipsDistributionScreen from '../screens/tips/TipsDistributionScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

// ============================================
// STOCK / INVENTORY SCREENS (Epic 5)
// ============================================
import StockScreen from '../screens/stock/StockScreen';
import StockItemDetailScreen from '../screens/stock/StockItemDetailScreen';

// ============================================
// CONFIG HUB SCREENS (Epic 8)
// ============================================
import ConfigHubScreen from '../screens/config/ConfigHubScreen';
import ConfigProfileScreen from '../screens/config/ConfigProfileScreen';
import ConfigServiceTypesScreen from '../screens/config/ConfigServiceTypesScreen';
import ConfigExperienceScreen from '../screens/config/ConfigExperienceScreen';
import ConfigFloorScreen from '../screens/config/ConfigFloorScreen';
import ConfigKitchenScreen from '../screens/config/ConfigKitchenScreen';
import ConfigPaymentsScreen from '../screens/config/ConfigPaymentsScreen';
import ConfigFeaturesScreen from '../screens/config/ConfigFeaturesScreen';
import ConfigTeamScreen from '../screens/config/ConfigTeamScreen';
import ConfigNotificationsScreen from '../screens/config/ConfigNotificationsScreen';
import ConfigLanguageScreen from '../screens/config/ConfigLanguageScreen';

// ============================================
// EPIC 3 — Missing Screens
// ============================================
import WaiterCallsScreen from '../screens/waiter-calls/WaiterCallsScreen';
import FloorFlowScreen from '../screens/maitre/FloorFlowScreen';

// ============================================
// EPIC 15 — Restaurant Quick Wins
// ============================================
import RoleDashboardScreen from '../screens/dashboard/RoleDashboardScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import RestaurantReviewsScreen from '../screens/reviews/RestaurantReviewsScreen';
import LoyaltyManagementScreen from '../screens/loyalty/LoyaltyManagementScreen';

// ============================================
// EPIC 6 — Drink Recipes & Barman Station
// ============================================
import BarmanStationScreen from '../screens/barman/BarmanStationScreen';
import RecipeDetailScreen from '../screens/barman/RecipeDetailScreen';
import DrinkRecipesScreen from '../screens/drink-recipes/DrinkRecipesScreen';

// ============================================
// KDS Brain — Station Settings & Chef View
// ============================================
import StationSettingsScreen from '../screens/kds-settings/StationSettingsScreen';
import ChefViewScreen from '../screens/chef-view/ChefViewScreen';

// ============================================
// KDS Brain Sprint 3 — Integration Settings
// ============================================
import IntegrationSettingsScreen from '../screens/integrations/IntegrationSettingsScreen';

// ============================================
// KDS Brain Sprint 4 — Analytics & Config
// ============================================
import KdsAnalyticsScreen from '../screens/analytics/KdsAnalyticsScreen';
import KdsBrainConfigScreen from '../screens/kds-settings/KdsBrainConfigScreen';

// ============================================
// EPIC 12 — Service Calls Management
// ============================================
import CallsManagementScreen from '../screens/calls/CallsManagementScreen';
import QRScannerScreen from '../screens/scanner/QRScannerScreen';

// ============================================
// FINANCIAL BRAIN SPRINT 1 — Tap to Pay & Cash Register
// ============================================
import TapToPayScreen from '../screens/payment/TapToPayScreen';
import CashRegisterScreen from '../screens/cash-register/CashRegisterScreen';

// ============================================
// FINANCIAL BRAIN SPRINT 2 — COGS, Margins & Cost Control
// ============================================
import RecipeScreen from '../screens/cost-control/RecipeScreen';
import MarginDashboardScreen from '../screens/cost-control/MarginDashboardScreen';

// ============================================
// FINANCIAL BRAIN SPRINT 3 — Fiscal (NFC-e) Setup
// ============================================
import FiscalSetupScreen from '../screens/fiscal/FiscalSetupScreen';

// ============================================
// FINANCIAL BRAIN SPRINT 4 — Forecast & Bills
// ============================================
import ForecastScreen from '../screens/financial/ForecastScreen';
import BillsScreen from '../screens/financial/BillsScreen';

// ============================================
// GAP SPRINT 2 — Stock Management + Customer CRM
// ============================================
import CustomerCrmScreen from '../screens/crm/CustomerCrmScreen';
import FoodTruckScreen from '../screens/food-truck/FoodTruckScreen';
import ChefTableScreen from '../screens/chef-table/ChefTableScreen';
import DriveThruScreen from '../screens/drive-thru/DriveThruScreen';
import DoorControlScreen from '../screens/club/DoorControlScreen';

// ============================================
// MISSING SCREENS — Navigation Registration
// ============================================
import ApprovalsScreen from '../screens/manager/ApprovalsScreen';
import DailyReportScreen from '../screens/manager/DailyReportScreen';
import ManagerOpsScreen from '../screens/manager/ManagerOpsScreen';
import PromotionsManagerScreen from '../screens/manager/PromotionsManagerScreen';
import TableFormScreen from '../screens/tables/TableFormScreen';
import TableListScreen from '../screens/tables/TableListScreen';
import QRCodeBatchScreen from '../screens/qr-codes/QRCodeBatchScreen';
import QRCodeGeneratorScreen from '../screens/qr-codes/QRCodeGeneratorScreen';
import VipTableManagementScreen from '../screens/club/VipTableManagementScreen';
import ClubQueueManagementScreen from '../screens/club/ClubQueueManagementScreen';
import PromoterDashboardScreen from '../screens/club/PromoterDashboardScreen';
import DoorManagementScreen from '../screens/club/DoorManagementScreen';
import CasualDiningConfigScreen from '../screens/config/CasualDiningConfigScreen';
import ChefApprovalsScreen from '../screens/chef/ChefApprovalsScreen';
import MaitreWaitlistScreen from '../screens/maitre/MaitreWaitlistScreen';

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
const Drawer = createDrawerNavigator();

// ============================================
// AUTH STACK (Passwordless-First)
// ============================================

/**
 * Modern authentication navigation stack for restaurant staff.
 * Prioritizes Social Login and Phone OTP with biometric quick-login.
 */
function AuthStack() {
  const [authLoading, setAuthLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Google OAuth configuration
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
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
    } catch (error) {
      logger.error('Biometric login error:', error);
    } finally {
      setBiometricLoading(false);
    }
  }, []);

  const handleAuthSuccess = useCallback((result: any) => {
    logger.info('Auth success:', { userId: result.user?.id });
  }, []);

  const handleBiometricPrompt = useCallback((enrollmentToken: string, navigation: any) => {
    navigation.navigate('BiometricEnrollment', { enrollmentToken });
  }, []);

  const handleBiometricComplete = useCallback((navigation: any) => {
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  }, []);

  const handleBiometricSkip = useCallback((navigation: any) => {
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

      {/* Biometric Enrollment */}
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
    </Stack.Navigator>
  );
}

// ============================================
// MAIN STACK NAVIGATOR
// ============================================

/**
 * Main stack navigator containing drawer navigation and detail screens.
 * Provides access to all restaurant management functionality.
 */
function MainStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      {/* Drawer Navigation as Root */}
      <Stack.Screen
        name="MainDrawer"
        component={MainDrawer}
        options={{ headerShown: false }}
      />
      
      {/* Detail Screens with custom animations */}
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ title: 'Detalhes do Pedido', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ReservationDetail"
        component={ReservationDetailScreen}
        options={{ title: 'Detalhes da Reserva', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="TableDetail"
        component={TableDetailScreen}
        options={{ title: 'Detalhes da Mesa', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="MenuItemDetail"
        component={MenuItemDetailScreen}
        options={{ title: 'Detalhes do Item', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="StaffDetail"
        component={StaffDetailScreen}
        options={{ title: 'Detalhes do Funcionário', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="FinancialReport"
        component={FinancialReportScreen}
        options={{ title: 'Relatório Financeiro', ...modalScreenOptions }}
      />
      <Stack.Screen
        name="TipsDistribution"
        component={TipsDistributionScreen}
        options={{ title: 'Distribuição de Gorjetas', ...modalScreenOptions }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Configurações' }}
      />
      <Stack.Screen
        name="ServiceConfig"
        component={ServiceConfigScreen}
        options={{ title: 'Configuração de Serviço' }}
      />
      <Stack.Screen
        name="SetupHub"
        component={SetupHubScreen}
        options={{ title: 'Central de Configuração' }}
      />

      {/* Stock Detail (Epic 5) */}
      <Stack.Screen
        name="StockItemDetail"
        component={StockItemDetailScreen as any}
        options={{ title: 'Detalhes do Item', ...scaleFadeScreenOptions }}
      />

      {/* Drink Recipes (Epic 6) */}
      <Stack.Screen
        name="DrinkRecipes"
        component={DrinkRecipesScreen}
        options={{ title: 'Receitas de Drinks', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={{ title: 'Detalhe da Receita', ...scaleFadeScreenOptions }}
      />

      {/* Config Hub (Epic 8) */}
      <Stack.Screen
        name="ConfigHub"
        component={ConfigHubScreen}
        options={{ title: 'Config Hub', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigProfile"
        component={ConfigProfileScreen}
        options={{ title: 'Restaurant Profile', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigServiceTypes"
        component={ConfigServiceTypesScreen}
        options={{ title: 'Service Types', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigExperience"
        component={ConfigExperienceScreen}
        options={{ title: 'Customer Experience', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigFloor"
        component={ConfigFloorScreen}
        options={{ title: 'Floor Layout', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigKitchen"
        component={ConfigKitchenScreen}
        options={{ title: 'Kitchen Stations', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigPayments"
        component={ConfigPaymentsScreen}
        options={{ title: 'Payments', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigFeatures"
        component={ConfigFeaturesScreen}
        options={{ title: 'Features', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigTeam"
        component={ConfigTeamScreen}
        options={{ title: 'Team Configuration', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigNotifications"
        component={ConfigNotificationsScreen}
        options={{ title: 'Notifications', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="ConfigLanguage"
        component={ConfigLanguageScreen}
        options={{ title: 'Language & Format', ...scaleFadeScreenOptions }}
      />

      {/* Epic 15 — Restaurant Quick Wins */}
      <Stack.Screen
        name="RestaurantReviews"
        component={RestaurantReviewsScreen}
        options={{ title: 'Reviews', ...scaleFadeScreenOptions }}
      />

      {/* Manager Screens */}
      <Stack.Screen
        name="Approvals"
        component={ApprovalsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DailyReport"
        component={DailyReportScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ManagerOps"
        component={ManagerOpsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PromotionsManager"
        component={PromotionsManagerScreen}
        options={{ headerShown: false }}
      />

      {/* Customer CRM (Stack entry for direct navigation) */}
      <Stack.Screen
        name="CustomerCrm"
        component={CustomerCrmScreen}
        options={{ headerShown: false }}
      />

      {/* Integration Settings (Stack entry for direct navigation) */}
      <Stack.Screen
        name="IntegrationSettings"
        component={IntegrationSettingsScreen}
        options={{ headerShown: false }}
      />

      {/* Cost Control — Recipe */}
      <Stack.Screen
        name="Recipe"
        component={RecipeScreen}
        options={{ headerShown: false }}
      />

      {/* Tables */}
      <Stack.Screen
        name="TableForm"
        component={TableFormScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TableList"
        component={TableListScreen}
        options={{ headerShown: false }}
      />

      {/* QR Codes */}
      <Stack.Screen
        name="QRCodeBatch"
        component={QRCodeBatchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="QRCodeGenerator"
        component={QRCodeGeneratorScreen}
        options={{ headerShown: false }}
      />

      {/* Club Management */}
      <Stack.Screen
        name="VipTableManagement"
        component={VipTableManagementScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ClubQueueManagement"
        component={ClubQueueManagementScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PromoterDashboard"
        component={PromoterDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DoorManagement"
        component={DoorManagementScreen}
        options={{ headerShown: false }}
      />

      {/* Config */}
      <Stack.Screen
        name="CasualDiningConfig"
        component={CasualDiningConfigScreen}
        options={{ headerShown: false }}
      />

      {/* Chef */}
      <Stack.Screen
        name="ChefApprovals"
        component={ChefApprovalsScreen}
        options={{ headerShown: false }}
      />

      {/* Maitre */}
      <Stack.Screen
        name="MaitreWaitlist"
        component={MaitreWaitlistScreen}
        options={{ headerShown: false }}
      />

      {/* Reservation Creation (reuses ReservationDetailScreen in create mode) */}
      <Stack.Screen
        name="CreateReservation"
        component={ReservationDetailScreen}
        options={{ headerShown: false }}
      />

      {/* Menu Item Edit & Create (reuses MenuItemDetailScreen) */}
      <Stack.Screen
        name="EditMenuItem"
        component={MenuItemDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateMenuItem"
        component={MenuItemDetailScreen}
        options={{ headerShown: false }}
      />

      {/* Staff Schedule & Add Staff (reuses StaffDetailScreen) */}
      <Stack.Screen
        name="StaffSchedule"
        component={StaffDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddStaff"
        component={StaffDetailScreen}
        options={{ headerShown: false }}
      />

      {/* QR Scanner */}
      <Stack.Screen
        name="QRScanner"
        component={QRScannerScreen}
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

      {/* Financial Brain Sprint 1 — Tap to Pay */}
      <Stack.Screen
        name="TapToPay"
        component={TapToPayScreen}
        options={{ title: 'Tap to Pay', ...modalScreenOptions }}
      />

      {/* Financial Brain Sprint 2 — Recipe Detail */}
      <Stack.Screen
        name="RecipeSheet"
        component={RecipeScreen}
        options={{ title: 'Recipe Sheets', ...scaleFadeScreenOptions }}
      />

      {/* Financial Brain Sprint 3 — Fiscal Setup */}
      <Stack.Screen
        name="FiscalSetup"
        component={FiscalSetupScreen}
        options={{ title: 'Fiscal Setup', ...scaleFadeScreenOptions }}
      />

      {/* Financial Brain Sprint 4 — Forecast & Bills */}
      <Stack.Screen
        name="Forecast"
        component={ForecastScreen}
        options={{ title: 'Cash Flow Forecast', ...scaleFadeScreenOptions }}
      />
      <Stack.Screen
        name="Bills"
        component={BillsScreen}
        options={{ title: 'Accounts Payable', ...scaleFadeScreenOptions }}
      />
    </Stack.Navigator>
  );
}

// ============================================
// MAIN DRAWER NAVIGATOR
// ============================================

// ============================================
// ROLE-BASED SCREEN ACCESS CONTROL
// ============================================

/**
 * Defines which drawer screens each staff role can access.
 * Owner sees everything; other roles see only relevant screens.
 */
const ROLE_SCREENS: Record<string, string[]> = {
  owner: [
    'Dashboard', 'KDS', 'BarmanKDS', 'BarmanStation', 'CookStation',
    'StationSettings', 'ChefView', 'WaiterDashboard', 'MaitreDashboard',
    'WaiterCalls', 'FloorFlow', 'CallsManagement', 'Orders', 'Reservations',
    'FloorPlan', 'Menu', 'Stock', 'Financial', 'Tips', 'CashRegister',
    'MarginDashboard', 'Staff', 'HR', 'RoleDashboard', 'Reports',
    'LoyaltyManagement', 'Integrations', 'KdsAnalytics', 'KdsBrainConfig',
    'CustomerCRM', 'DriveThru', 'FoodTruck', 'ChefTable', 'DoorControl',
  ],
  manager: [
    'Dashboard', 'KDS', 'BarmanKDS', 'Orders', 'Reservations', 'FloorPlan',
    'Menu', 'Stock', 'Financial', 'Tips', 'CashRegister', 'MarginDashboard',
    'Staff', 'HR', 'RoleDashboard', 'Reports', 'LoyaltyManagement',
    'Integrations', 'KdsAnalytics', 'CustomerCRM', 'CallsManagement',
  ],
  chef: [
    'KDS', 'CookStation', 'ChefView', 'StationSettings', 'KdsAnalytics',
    'KdsBrainConfig', 'RoleDashboard', 'Stock',
  ],
  barman: [
    'BarmanKDS', 'BarmanStation', 'RoleDashboard',
  ],
  waiter: [
    'WaiterDashboard', 'Orders', 'WaiterCalls', 'CallsManagement',
    'RoleDashboard',
  ],
  maitre: [
    'MaitreDashboard', 'Reservations', 'FloorPlan', 'FloorFlow',
    'RoleDashboard',
  ],
  chef: [
    'KDS', 'CookStation', 'StationSettings', 'RoleDashboard',
  ],
};

/**
 * Main drawer navigation for restaurant management screens.
 * Provides slide-out navigation to all major app sections.
 * Uses semantic theme colors for consistent styling.
 * Filters visible screens based on the authenticated user's role.
 */
function MainDrawer() {
  const colors = useColors();
  const { roles } = useRestaurantRole();

  const normalizedRoles = roles.map((role) => role.toLowerCase());
  const allowedScreens = new Set<string>(['Dashboard']);
  normalizedRoles.forEach((role) => {
    (ROLE_SCREENS[role] || []).forEach((screen) => allowedScreens.add(screen));
  });
  const canSee = (screen: string) => allowedScreens.has(screen);
  
  return (
    <Drawer.Navigator
      screenOptions={{
        drawerActiveTintColor: colors.primary,
        drawerInactiveTintColor: colors.foregroundSecondary,
        drawerType: 'slide',
        drawerStyle: {
          backgroundColor: colors.background,
        },
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.foreground,
      }}
    >
      {/* Primary Dashboard — always visible */}
      <Drawer.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ drawerLabel: 'Dashboard', title: 'Dashboard' }}
      />

      {/* Role-Filtered Screens */}
      {canSee('KDS') && (
        <Drawer.Screen
          name="KDS"
          component={KDSScreen}
          options={{ drawerLabel: 'Kitchen Display', title: 'Kitchen Display System' }}
        />
      )}
      {canSee('BarmanKDS') && (
        <Drawer.Screen
          name="BarmanKDS"
          component={BarmanKDSScreen}
          options={{ drawerLabel: 'Bar Display', title: 'Bar Display System' }}
        />
      )}
      {canSee('BarmanStation') && (
        <Drawer.Screen
          name="BarmanStation"
          component={BarmanStationScreen}
          options={{ drawerLabel: 'Barman Station', title: 'Barman Station' }}
        />
      )}
      {canSee('CookStation') && (
        <Drawer.Screen
          name="CookStation"
          component={CookStationScreen}
          options={{ drawerLabel: 'Cook Station', title: 'Cook Station' }}
        />
      )}
      {canSee('StationSettings') && (
        <Drawer.Screen
          name="StationSettings"
          component={StationSettingsScreen}
          options={{ drawerLabel: 'Station Settings', title: 'Kitchen Station Settings' }}
        />
      )}
      {canSee('ChefView') && (
        <Drawer.Screen
          name="ChefView"
          component={ChefViewScreen}
          options={{ drawerLabel: 'Chef View', title: 'Chef View' }}
        />
      )}
      {canSee('WaiterDashboard') && (
        <Drawer.Screen
          name="WaiterDashboard"
          component={WaiterCommandCenter}
          options={{ drawerLabel: 'Waiter Panel', title: 'Waiter Command Center', headerShown: false }}
        />
      )}
      {canSee('MaitreDashboard') && (
        <Drawer.Screen
          name="MaitreDashboard"
          component={MaitreDashboardScreen}
          options={{ drawerLabel: 'Maitre Panel', title: 'Maitre Dashboard' }}
        />
      )}

      {/* EPIC 3 — Waiter Calls */}
      {canSee('WaiterCalls') && (
        <Drawer.Screen
          name="WaiterCalls"
          component={WaiterCallsScreen}
          options={{ drawerLabel: 'Waiter Calls', title: 'Waiter Calls', headerShown: false }}
        />
      )}

      {/* EPIC 3 — Floor Flow */}
      {canSee('FloorFlow') && (
        <Drawer.Screen
          name="FloorFlow"
          component={FloorFlowScreen}
          options={{ drawerLabel: 'Floor Flow', title: 'Floor Flow', headerShown: false }}
        />
      )}

      {/* EPIC 12 — Service Calls Management */}
      {canSee('CallsManagement') && (
        <Drawer.Screen
          name="CallsManagement"
          component={CallsManagementScreen}
          options={{ drawerLabel: 'Service Calls', title: 'Service Calls', headerShown: false }}
        />
      )}

      {/* Operations Management */}
      {canSee('Orders') && (
        <Drawer.Screen
          name="Orders"
          component={OrdersScreen}
          options={{ drawerLabel: 'Orders', title: 'Orders Management' }}
        />
      )}
      {canSee('Reservations') && (
        <Drawer.Screen
          name="Reservations"
          component={ReservationsScreen}
          options={{ drawerLabel: 'Reservations', title: 'Reservations' }}
        />
      )}
      {canSee('FloorPlan') && (
        <Drawer.Screen
          name="FloorPlan"
          component={FloorPlanScreen}
          options={{ drawerLabel: 'Floor Plan', title: 'Floor Plan' }}
        />
      )}

      {/* Content Management */}
      {canSee('Menu') && (
        <Drawer.Screen
          name="Menu"
          component={MenuScreen}
          options={{ drawerLabel: 'Menu', title: 'Menu Management' }}
        />
      )}

      {/* Stock / Inventory (Epic 5) */}
      {canSee('Stock') && (
        <Drawer.Screen
          name="Stock"
          component={StockScreen}
          options={{ drawerLabel: 'Inventory', title: 'Stock Inventory' }}
        />
      )}

      {/* Financial Management */}
      {canSee('Financial') && (
        <Drawer.Screen
          name="Financial"
          component={FinancialScreen}
          options={{ drawerLabel: 'Financial', title: 'Financial Reports' }}
        />
      )}
      {canSee('Tips') && (
        <Drawer.Screen
          name="Tips"
          component={TipsScreen}
          options={{ drawerLabel: 'Tips', title: 'Tips Management' }}
        />
      )}

      {/* Financial Brain Sprint 1 — Cash Register */}
      {canSee('CashRegister') && (
        <Drawer.Screen
          name="CashRegister"
          component={CashRegisterScreen}
          options={{ drawerLabel: 'Cash Register', title: 'Cash Register' }}
        />
      )}

      {/* Financial Brain Sprint 2 — Cost Control */}
      {canSee('MarginDashboard') && (
        <Drawer.Screen
          name="MarginDashboard"
          component={MarginDashboardScreen}
          options={{ drawerLabel: 'Margin Dashboard', title: 'Margin Dashboard' }}
        />
      )}

      {/* Staff Management */}
      {canSee('Staff') && (
        <Drawer.Screen
          name="Staff"
          component={StaffScreen}
          options={{ drawerLabel: 'Staff', title: 'Staff Management' }}
        />
      )}
      {canSee('HR') && (
        <Drawer.Screen
          name="HR"
          component={HRScreen}
          options={{ drawerLabel: 'HR', title: 'Human Resources' }}
        />
      )}

      {/* EPIC 15 — Restaurant Quick Wins */}
      {canSee('RoleDashboard') && (
        <Drawer.Screen
          name="RoleDashboard"
          component={RoleDashboardScreen}
          options={{ drawerLabel: 'My Dashboard', title: 'Role Dashboard' }}
        />
      )}
      {canSee('Reports') && (
        <Drawer.Screen
          name="Reports"
          component={ReportsScreen}
          options={{ drawerLabel: 'Reports', title: 'Analytics Reports' }}
        />
      )}
      {canSee('LoyaltyManagement') && (
        <Drawer.Screen
          name="LoyaltyManagement"
          component={LoyaltyManagementScreen}
          options={{ drawerLabel: 'Loyalty', title: 'Loyalty Management' }}
        />
      )}

      {/* KDS Brain Sprint 3 — Delivery Integrations */}
      {canSee('Integrations') && (
        <Drawer.Screen
          name="Integrations"
          component={IntegrationSettingsScreen}
          options={{ drawerLabel: 'Integrations', title: 'Delivery Integrations' }}
        />
      )}

      {/* KDS Brain Sprint 4 — Analytics & Config */}
      {canSee('KdsAnalytics') && (
        <Drawer.Screen
          name="KdsAnalytics"
          component={KdsAnalyticsScreen}
          options={{ drawerLabel: 'Kitchen Analytics', title: 'Kitchen Analytics' }}
        />
      )}
      {canSee('KdsBrainConfig') && (
        <Drawer.Screen
          name="KdsBrainConfig"
          component={KdsBrainConfigScreen}
          options={{ drawerLabel: 'KDS Brain Config', title: 'KDS Brain Configuration' }}
        />
      )}

      {/* GAP Sprint 2 — Customer CRM */}
      {canSee('CustomerCRM') && (
        <Drawer.Screen
          name="CustomerCRM"
          component={CustomerCrmScreen}
          options={{ drawerLabel: 'Customer CRM', title: 'Customer CRM' }}
        />
      )}

      {/* Service-Type Specific Screens */}
      {canSee('DriveThru') && (
        <Drawer.Screen
          name="DriveThru"
          component={DriveThruScreen}
          options={{ drawerLabel: 'Drive-Thru', title: 'Drive-Thru' }}
        />
      )}
      {canSee('FoodTruck') && (
        <Drawer.Screen
          name="FoodTruck"
          component={FoodTruckScreen}
          options={{ drawerLabel: 'Food Truck', title: 'Food Truck' }}
        />
      )}
      {canSee('ChefTable') && (
        <Drawer.Screen
          name="ChefTable"
          component={ChefTableScreen}
          options={{ drawerLabel: "Chef's Table", title: "Chef's Table" }}
        />
      )}
      {canSee('DoorControl') && (
        <Drawer.Screen
          name="DoorControl"
          component={DoorControlScreen}
          options={{ drawerLabel: 'Door Control', title: 'Door Control' }}
        />
      )}
    </Drawer.Navigator>
  );
}

// ============================================
// ROOT NAVIGATION COMPONENT
// ============================================

/**
 * Root navigation component with authentication state management.
 * Wraps all navigation with ErrorBoundary for crash protection.
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
   */
  const handleNavigationError = (error: Error, errorInfo: React.ErrorInfo) => {
    logger.error('Navigation error boundary triggered:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
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
