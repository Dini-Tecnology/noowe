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

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: vi.fn(),
    setOptions: vi.fn(),
    addListener: vi.fn(),
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: vi.fn(),
}));

const mockLogin = vi.fn();
vi.mock('@/shared/services/auth', () => ({
  authService: {
    login: mockLogin,
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

vi.mock('@/shared/services/secure-storage', () => ({
  secureStorage: {
    getBiometricEnabled: vi.fn().mockResolvedValue(false),
    setUserEmail: vi.fn(),
  },
}));

vi.mock('@/shared/hooks/useBiometricAuth', () => ({
  useBiometricAuth: () => ({
    isAvailable: false,
    isEnrolled: false,
    biometricType: 'TouchID',
  }),
}));

vi.mock('@okinawa/shared/utils/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock('@/shared/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'pt-BR',
  }),
}));

vi.mock('@okinawa/shared/contexts/ThemeContext', () => ({
  useColors: () => ({
    background: '#FFFFFF',
    foreground: '#111827',
    foregroundSecondary: '#6B7280',
    mutedForeground: '#6B7280',
    card: '#F9FAFB',
    primary: '#EA580C',
    border: '#E5E7EB',
    error: '#DC2626',
  }),
}));

const mockValidateForm = vi.fn((...args: any[]) => ({ success: true, errors: {} }));
vi.mock('@/shared/validation/schemas', () => ({
  loginSchema: {},
  validateForm: (...args: any[]) => mockValidateForm(...args),
}));

const mockHaptic = {
  successNotification: vi.fn(),
  errorNotification: vi.fn(),
};
vi.mock('@/shared/utils/haptics', () => ({
  default: mockHaptic,
}));

import LoginScreen from '../screens/auth/LoginScreen';

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
    render(<LoginScreen {...defaultProps} />);
    expect(screen.getByText('NOOWE Restaurant')).toBeTruthy();
  });

  it('renders email and password inputs with accessibility labels', () => {
    render(<LoginScreen {...defaultProps} />);
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('renders login button with accessibility role', () => {
    render(<LoginScreen {...defaultProps} />);
    expect(screen.getByLabelText('Log in')).toBeTruthy();
  });

  // ---- Field interaction ----

  it('updates email input value', () => {
    render(<LoginScreen {...defaultProps} />);
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.changeText(emailInput, 'manager@restaurant.com');
    expect(emailInput.props.value).toBe('manager@restaurant.com');
  });

  it('updates password input value', () => {
    render(<LoginScreen {...defaultProps} />);
    const passwordInput = screen.getByLabelText('Password');
    fireEvent.changeText(passwordInput, 'StaffPass99');
    expect(passwordInput.props.value).toBe('StaffPass99');
  });

  // ---- Validation ----

  it('shows field errors when Zod validation fails', async () => {
    mockValidateForm.mockReturnValue({
      success: false,
      errors: { email: 'Email is required' },
    });

    render(<LoginScreen {...defaultProps} />);
    fireEvent.press(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeTruthy();
    });
  });

  it('triggers error haptic on validation failure', async () => {
    mockValidateForm.mockReturnValue({
      success: false,
      errors: { password: 'Password is required' },
    });

    render(<LoginScreen {...defaultProps} />);
    fireEvent.press(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(mockHaptic.errorNotification).toHaveBeenCalled();
    });
  });

  it('does not call authService.login when validation fails', async () => {
    mockValidateForm.mockReturnValue({
      success: false,
      errors: { email: 'Invalid email' },
    });

    render(<LoginScreen {...defaultProps} />);
    fireEvent.press(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  // ---- Login success ----

  it('calls authService.login and navigates to Main on success', async () => {
    mockLogin.mockResolvedValueOnce({
      user: { id: 'staff-1', email: 'staff@rest.com' },
      access_token: 'token',
    });

    render(<LoginScreen {...defaultProps} />);

    fireEvent.changeText(screen.getByLabelText('Email address'), 'staff@rest.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'ValidPass1');
    fireEvent.press(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('staff@rest.com', 'ValidPass1');
    });

    await waitFor(() => {
      expect(defaultProps.navigation.replace).toHaveBeenCalledWith('Main');
    });
  });

  it('triggers success haptic on successful login', async () => {
    mockLogin.mockResolvedValueOnce({ user: { id: '1' } });

    render(<LoginScreen {...defaultProps} />);

    fireEvent.changeText(screen.getByLabelText('Email address'), 'a@b.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Pass1');
    fireEvent.press(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(mockHaptic.successNotification).toHaveBeenCalled();
    });
  });

  // ---- Login error ----

  it('displays server error message on login failure', async () => {
    mockLogin.mockRejectedValueOnce({
      response: { data: { message: 'Account suspended' } },
    });

    render(<LoginScreen {...defaultProps} />);

    fireEvent.changeText(screen.getByLabelText('Email address'), 'bad@rest.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.getByText('Account suspended')).toBeTruthy();
    });
  });

  it('shows generic error when server provides no message', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Timeout'));

    render(<LoginScreen {...defaultProps} />);

    fireEvent.changeText(screen.getByLabelText('Email address'), 'a@b.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'pass');
    fireEvent.press(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.getByText('auth.loginFailed')).toBeTruthy();
    });
  });

  // ---- Field error clearing ----

  it('clears field error when user starts typing', async () => {
    mockValidateForm.mockReturnValueOnce({
      success: false,
      errors: { email: 'Email is required' },
    });

    render(<LoginScreen {...defaultProps} />);
    fireEvent.press(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeTruthy();
    });

    // Type in email to clear error
    fireEvent.changeText(screen.getByLabelText('Email address'), 'new@email.com');

    await waitFor(() => {
      expect(screen.queryByText('Email is required')).toBeNull();
    });
  });
});
