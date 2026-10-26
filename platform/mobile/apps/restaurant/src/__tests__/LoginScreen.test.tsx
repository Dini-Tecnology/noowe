/**
 * LoginScreen Tests — Restaurant App
 *
 * Validates rendering of the restaurant login form, Zod validation,
 * authentication success/error, loading state, and haptic feedback.
 *
 * @module apps/restaurant/__tests__/LoginScreen.test
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

// ============================================================
// MOCKS
// ============================================================

const mockNavigate = vi.fn();
const mockReplace = vi.fn();
const mockLogin = vi.fn();
const mockValidateForm = vi.fn((...args: any[]) => ({ success: true, errors: {} }));
const mockHaptic = {
  successNotification: vi.fn(),
  errorNotification: vi.fn(),
};

// `vi` é só um alias de `jest` neste projeto (vitest-shim): apenas `jest.mock` é içado acima dos
// imports. Com `vi.mock` a tela carregava os módulos reais. As fábricas só tocam os espiões na hora
// da chamada, porque os `const` acima ainda não existem quando a fábrica roda.
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: (...a: unknown[]) => mockNavigate(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    goBack: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(),
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
}));

jest.mock('@/shared/services/auth', () => ({
  authService: {
    login: (...a: unknown[]) => mockLogin(...a),
    logout: jest.fn(),
    getCurrentUser: jest.fn(),
  },
}));

jest.mock('@/shared/services/secure-storage', () => ({
  secureStorage: {
    getBiometricEnabled: jest.fn().mockResolvedValue(false),
    setUserEmail: jest.fn(),
  },
}));

jest.mock('@/shared/hooks/useBiometricAuth', () => ({
  useBiometricAuth: () => ({
    isAvailable: false,
    isEnrolled: false,
    biometricType: 'TouchID',
  }),
}));

jest.mock('@okinawa/shared/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}));

jest.mock('@/shared/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'pt-BR',
  }),
}));

jest.mock('@/shared/validation/schemas', () => ({
  loginSchema: {},
  validateForm: (...args: unknown[]) => mockValidateForm(...args),
}));

jest.mock('@/shared/utils/haptics', () => ({
  __esModule: true,
  default: {
    successNotification: (...a: unknown[]) => mockHaptic.successNotification(...a),
    errorNotification: (...a: unknown[]) => mockHaptic.errorNotification(...a),
  },
}));

import { ThemeProvider } from '@okinawa/shared/contexts/ThemeContext';
import LoginScreen from '../screens/auth/LoginScreen';

// A tela lê o tema de componentes compartilhados: precisa do provedor real.
// O setup troca o HelperText do react-native-paper por um elemento simples: o texto fica na árvore,
// mas não em um Text nativo, então getByText não o encontra.
const hasText = (text: string) => JSON.stringify(screen.toJSON()).includes(JSON.stringify(text).slice(1, -1));

const renderLogin = (props: React.ComponentProps<typeof LoginScreen>) =>
  render(<ThemeProvider defaultMode="light"><LoginScreen {...props} /></ThemeProvider>);

// ============================================================
// TESTS
// ============================================================

describe('Restaurant LoginScreen', () => {
  const defaultProps = {
    navigation: {
      navigate: mockNavigate,
      replace: mockReplace,
      goBack: vi.fn(),
      setOptions: vi.fn(),
      addListener: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateForm.mockReturnValue({ success: true, errors: {} });
  });

  // ---- Rendering ----

  it('renders the restaurant auth title', () => {
    renderLogin(defaultProps);
    expect(screen.getByText('NOOWE Restaurant')).toBeTruthy();
  });

  it('renders email and password inputs with accessibility labels', () => {
    renderLogin(defaultProps);
    expect(screen.getByLabelText('auth.a11y.email')).toBeTruthy();
    expect(screen.getByLabelText('auth.a11y.password')).toBeTruthy();
  });

  it('renders login button with accessibility role', () => {
    renderLogin(defaultProps);
    expect(screen.getByLabelText('auth.a11y.login')).toBeTruthy();
  });

  // ---- Field interaction ----

  it('updates email input value', () => {
    renderLogin(defaultProps);
    const emailInput = screen.getByLabelText('auth.a11y.email');
    fireEvent.changeText(emailInput, 'manager@restaurant.com');
    expect(emailInput.props.value).toBe('manager@restaurant.com');
  });

  it('updates password input value', () => {
    renderLogin(defaultProps);
    const passwordInput = screen.getByLabelText('auth.a11y.password');
    fireEvent.changeText(passwordInput, 'StaffPass99');
    expect(passwordInput.props.value).toBe('StaffPass99');
  });

  // ---- Validation ----

  it('shows field errors when Zod validation fails', async () => {
    mockValidateForm.mockReturnValue({
      success: false,
      errors: { email: 'Email is required' },
    });

    renderLogin(defaultProps);
    fireEvent.press(screen.getByLabelText('auth.a11y.login'));

    await waitFor(() => {
      expect(hasText('Email is required')).toBe(true);
    });
  });

  it('triggers error haptic on validation failure', async () => {
    mockValidateForm.mockReturnValue({
      success: false,
      errors: { password: 'Password is required' },
    });

    renderLogin(defaultProps);
    fireEvent.press(screen.getByLabelText('auth.a11y.login'));

    await waitFor(() => {
      expect(mockHaptic.errorNotification).toHaveBeenCalled();
    });
  });

  it('does not call authService.login when validation fails', async () => {
    mockValidateForm.mockReturnValue({
      success: false,
      errors: { email: 'Invalid email' },
    });

    renderLogin(defaultProps);
    fireEvent.press(screen.getByLabelText('auth.a11y.login'));

    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  // ---- Login success ----

  it('calls authService.login with the typed credentials on success', async () => {
    mockLogin.mockResolvedValueOnce({
      user: { id: 'staff-1', email: 'staff@rest.com' },
      access_token: 'token',
    });

    renderLogin(defaultProps);

    fireEvent.changeText(screen.getByLabelText('auth.a11y.email'), 'staff@rest.com');
    fireEvent.changeText(screen.getByLabelText('auth.a11y.password'), 'ValidPass1');
    fireEvent.press(screen.getByLabelText('auth.a11y.login'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('staff@rest.com', 'ValidPass1');
    });

    // A tela não navega: a troca para o app principal vem do listener de sessão (ProductionNavigation).
    await waitFor(() => expect(mockHaptic.successNotification).toHaveBeenCalled());
    expect(defaultProps.navigation.replace).not.toHaveBeenCalled();
  });

  it('triggers success haptic on successful login', async () => {
    mockLogin.mockResolvedValueOnce({ user: { id: '1' } });

    renderLogin(defaultProps);

    fireEvent.changeText(screen.getByLabelText('auth.a11y.email'), 'a@b.com');
    fireEvent.changeText(screen.getByLabelText('auth.a11y.password'), 'Pass1');
    fireEvent.press(screen.getByLabelText('auth.a11y.login'));

    await waitFor(() => {
      expect(mockHaptic.successNotification).toHaveBeenCalled();
    });
  });

  // ---- Login error ----

  it('displays server error message on login failure', async () => {
    mockLogin.mockRejectedValueOnce({
      response: { data: { message: 'Account suspended' } },
    });

    renderLogin(defaultProps);

    fireEvent.changeText(screen.getByLabelText('auth.a11y.email'), 'bad@rest.com');
    fireEvent.changeText(screen.getByLabelText('auth.a11y.password'), 'wrong');
    fireEvent.press(screen.getByLabelText('auth.a11y.login'));

    await waitFor(() => {
      expect(hasText('Account suspended')).toBe(true);
    });
  });

  it('shows generic error when server provides no message', async () => {
    mockLogin.mockRejectedValueOnce(new Error(''));

    renderLogin(defaultProps);

    fireEvent.changeText(screen.getByLabelText('auth.a11y.email'), 'a@b.com');
    fireEvent.changeText(screen.getByLabelText('auth.a11y.password'), 'pass');
    fireEvent.press(screen.getByLabelText('auth.a11y.login'));

    await waitFor(() => {
      expect(hasText('Falha no login')).toBe(true);
    });
  });

  // ---- Field error clearing ----

  it('clears field error when user starts typing', async () => {
    mockValidateForm.mockReturnValueOnce({
      success: false,
      errors: { email: 'Email is required' },
    });

    renderLogin(defaultProps);
    fireEvent.press(screen.getByLabelText('auth.a11y.login'));

    await waitFor(() => {
      expect(hasText('Email is required')).toBe(true);
    });

    // Type in email to clear error
    fireEvent.changeText(screen.getByLabelText('auth.a11y.email'), 'new@email.com');

    await waitFor(() => {
      expect(hasText('Email is required')).toBe(false);
    });
  });
});
