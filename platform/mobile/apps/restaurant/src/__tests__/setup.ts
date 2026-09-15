/**
 * Vitest Setup File for Restaurant App
 * 
 * Configures test environment with mocks for React Native modules,
 * Expo modules, and global utilities used across tests.
 * 
 * @module __tests__/setup
 */

import { vi, beforeAll, afterAll, beforeEach } from 'vitest';

// ============================================================
// REACT NATIVE MOCKS
// ============================================================
//
// Intentionally NOT mocking 'react-native' itself: @testing-library/react-native
// needs the real module (via the 'react-native' Jest preset's own native-module
// shims) to detect host component names when rendering a real screen. None of
// the fixture-only test files in this directory import 'react-native' directly,
// so removing this blanket mock doesn't affect them — it only unblocks the one
// suite (LoginScreen.test.tsx) that actually renders a component tree.

// ============================================================
// EXPO MODULE MOCKS
// ============================================================

vi.mock('expo-camera', () => ({
  requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  Camera: 'Camera',
  CameraView: 'CameraView',
  useCameraPermissions: vi.fn(() => [{ status: 'granted' }, vi.fn()]),
}));

// '@expo/vector-icons' (barrel import and any subpath, e.g.
// '@expo/vector-icons/MaterialCommunityIcons') is redirected via
// moduleNameMapper in jest.config.js — see src/__mocks__/vectorIconMock.js.

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  SafeAreaProvider: 'SafeAreaProvider',
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// react-native-paper pulls in @expo/vector-icons -> expo-font ->
// expo-modules-core, which requires real native modules that don't exist
// under the plain 'react-native' Jest preset (no jest-expo). Mock it with
// plain host-component strings instead of loading the real library.
vi.mock('react-native-paper', () => ({
  Text: 'Text',
  HelperText: 'HelperText',
  Button: 'Button',
  TextInput: 'TextInput',
  Provider: 'Provider',
  PaperProvider: 'PaperProvider',
  ActivityIndicator: 'ActivityIndicator',
  Card: 'Card',
  Chip: 'Chip',
  Switch: 'Switch',
  Divider: 'Divider',
  IconButton: 'IconButton',
}));

// ============================================================
// STORAGE MOCKS
// ============================================================

vi.mock('@react-native-async-storage/async-storage', () => ({
  setItem: vi.fn(),
  getItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

// Side-effect-only polyfill import (URL/URLSearchParams); not needed under
// the Jest/node test environment and ships as untranspiled ESM.
vi.mock('react-native-url-polyfill/auto', () => ({}));

vi.mock('expo-linking', () => ({
  createURL: vi.fn((path: string) => `okinawa-restaurant://${path}`),
  parse: vi.fn(() => ({ path: null, queryParams: {} })),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  getInitialURL: vi.fn().mockResolvedValue(null),
}));

vi.mock('expo-local-authentication', () => ({
  authenticateAsync: vi.fn(),
  hasHardwareAsync: vi.fn().mockResolvedValue(true),
  isEnrolledAsync: vi.fn().mockResolvedValue(true),
  getEnrolledLevelAsync: vi.fn().mockResolvedValue(1),
  supportedAuthenticationTypesAsync: vi.fn().mockResolvedValue([1]),
}));

// ============================================================
// NAVIGATION MOCKS
// ============================================================

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
    setOptions: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }),
  useRoute: () => ({
    params: {},
  }),
  useFocusEffect: vi.fn(),
}));

// ============================================================
// WEBSOCKET MOCKS
// ============================================================

(globalThis as any).WebSocket = vi.fn().mockImplementation(() => ({
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 1,
}));

// ============================================================
// FETCH MOCKS
// ============================================================

(globalThis as any).fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
);

// ============================================================
// CONSOLE MOCKS
// ============================================================

const originalConsole = { ...console };

beforeAll(() => {
  console.log = vi.fn();
  console.info = vi.fn();
  console.warn = vi.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
});

// ============================================================
// GLOBAL TEST UTILITIES
// ============================================================

export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockNavigation = {
  navigate: vi.fn(),
  goBack: vi.fn(),
  setOptions: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatch: vi.fn(),
  reset: vi.fn(),
  canGoBack: vi.fn(() => true),
};

export const mockRoute = (params: any = {}) => ({
  key: 'test-route',
  name: 'TestScreen',
  params,
});

export const mockRestaurant = {
  id: 'rest-123',
  name: 'Test Restaurant',
  description: 'A test restaurant',
  cuisine_type: ['Italian', 'Pizza'],
  address: '123 Test St',
  city: 'São Paulo',
  state: 'SP',
  phone: '(11) 99999-9999',
  email: 'test@restaurant.com',
  is_active: true,
};

export const mockStaffMember = {
  id: 'staff-123',
  user_id: 'user-123',
  restaurant_id: 'rest-123',
  role: 'manager',
  status: 'active',
  permissions: ['orders', 'reservations', 'menu'],
};

// ============================================================
// RESET MOCKS BETWEEN TESTS
// ============================================================

beforeEach(() => {
  vi.clearAllMocks();
});

console.log = originalConsole.log;
console.log('✅ Restaurant App test environment configured');
