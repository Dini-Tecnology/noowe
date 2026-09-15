/**
 * Error Handler Utility Tests
 * 
 * Tests for error classification, message generation, and toast notifications.
 * 
 * @module shared/utils/__tests__/error-handler.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Toast
vi.mock('react-native-toast-message', () => ({
  default: {
    show: vi.fn(),
  },
}));

// Import after mocking
import {
  getErrorMessage,
  showErrorToast,
  showSuccessToast,
  showInfoToast,
  showWarningToast,
  handleApiError,
  isNetworkError,
  isAuthError,
  isValidationError,
} from '../error-handler';
import Toast from 'react-native-toast-message';
import { t } from '../../i18n';
import {
  isEmailAlreadyRegisteredError,
  isEmailNotConfirmedError,
  localizeAuthError,
} from '../auth-errors';

// ============================================================
// GET ERROR MESSAGE TESTS
// ============================================================

describe('getErrorMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('null/undefined errors', () => {
    it('should return unknown error for null', () => {
      expect(getErrorMessage(null)).toBe(t('common.genericError'));
    });

    it('should return unknown error for undefined', () => {
      expect(getErrorMessage(undefined)).toBe(t('common.genericError'));
    });
  });

  describe('Auth errors', () => {
    it('should localize Supabase duplicate email error', () => {
      const error = {
        message: 'A user with this email address has already been registered',
      };
      expect(getErrorMessage(error)).toBe(t('auth.emailAlreadyExists'));
      expect(localizeAuthError(error.message)).toBe(t('auth.emailAlreadyExists'));
    });

    it('detects an unconfirmed Supabase email by code or message', () => {
      expect(isEmailNotConfirmedError({ code: 'email_not_confirmed' })).toBe(true);
      expect(isEmailNotConfirmedError(new Error('Email not confirmed'))).toBe(true);
      expect(isEmailNotConfirmedError(new Error('Invalid login credentials'))).toBe(false);
    });

    it('detects an already registered email from the signup function', () => {
      expect(
        isEmailAlreadyRegisteredError(
          new Error('A user with this email address has already been registered'),
        ),
      ).toBe(true);
      expect(isEmailAlreadyRegisteredError(new Error('Network error'))).toBe(false);
    });
  });

  describe('Axios errors', () => {
    it('should return server message when available', () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { message: 'Custom server error' },
        },
      };
      expect(getErrorMessage(error)).toBe('Custom server error');
    });

    it('should return 400 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 400, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.validation'));
    });

    it('should return 401 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 401, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.unauthorized'));
    });

    it('should return 403 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 403, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.forbidden'));
    });

    it('should return 404 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 404, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.notFound'));
    });

    it('should return 409 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 409, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('auth.emailAlreadyExists'));
    });

    it('should return 422 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 422, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.validation'));
    });

    it('should return 429 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 429, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('auth.rateLimitExceeded'));
    });

    it('should return 500 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 500, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.serverError'));
    });

    it('should return 502 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 502, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.serverError'));
    });

    it('should return 503 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 503, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.serverError'));
    });

    it('should return 504 message', () => {
      const error = {
        isAxiosError: true,
        response: { status: 504, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.serverError'));
    });

    it('should return default connection error for unknown status', () => {
      const error = {
        isAxiosError: true,
        response: { status: 418, data: {} },
      };
      expect(getErrorMessage(error)).toBe(t('errors.network'));
    });
  });

  describe('Network errors', () => {
    it('should handle Network Error message', () => {
      const error = { message: 'Network Error' };
      expect(getErrorMessage(error)).toBe(t('errors.network'));
    });

    it('should handle ERR_NETWORK code', () => {
      const error = { code: 'ERR_NETWORK' };
      expect(getErrorMessage(error)).toBe(t('errors.network'));
    });
  });

  describe('Timeout errors', () => {
    it('should handle ECONNABORTED code', () => {
      const error = { code: 'ECONNABORTED' };
      expect(getErrorMessage(error)).toBe(t('errors.timeout'));
    });

    it('should handle timeout in message', () => {
      const error = { message: 'Request timeout' };
      expect(getErrorMessage(error)).toBe(t('errors.timeout'));
    });
  });

  describe('Generic errors', () => {
    it('should return error message if available', () => {
      const error = { message: 'Custom error message' };
      expect(getErrorMessage(error)).toBe('Custom error message');
    });

    it('should return fallback for empty message', () => {
      const error = { message: '' };
      expect(getErrorMessage(error)).toBe(t('common.genericError'));
    });
  });
});

// ============================================================
// TOAST NOTIFICATION TESTS
// ============================================================

describe('Toast Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('showErrorToast', () => {
    it('should show error toast with error message', () => {
      const error = { message: 'Test error' };
      showErrorToast(error);
      
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Erro',
        })
      );
    });

    it('should use fallback message when provided', () => {
      const error = { message: 'Original error' };
      showErrorToast(error, 'Fallback message');
      
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          text2: 'Fallback message',
        })
      );
    });
  });

  describe('showSuccessToast', () => {
    it('should show success toast', () => {
      showSuccessToast('Success!', 'Description');
      
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          text1: 'Success!',
          text2: 'Description',
        })
      );
    });

    it('should work without description', () => {
      showSuccessToast('Success!');
      
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          text1: 'Success!',
        })
      );
    });
  });

  describe('showInfoToast', () => {
    it('should show info toast', () => {
      showInfoToast('Info message', 'Details');
      
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text1: 'Info message',
          text2: 'Details',
        })
      );
    });
  });

  describe('showWarningToast', () => {
    it('should show warning toast', () => {
      showWarningToast('Warning!', 'Be careful');
      
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          text1: 'Warning!',
          text2: 'Be careful',
        })
      );
    });
  });
});

// ============================================================
// ERROR CLASSIFICATION TESTS
// ============================================================

describe('Error Classification', () => {
  describe('isNetworkError', () => {
    it('should return true for Network Error message', () => {
      expect(isNetworkError({ message: 'Network Error' })).toBe(true);
    });

    it('should return true for ERR_NETWORK code', () => {
      expect(isNetworkError({ code: 'ERR_NETWORK' })).toBe(true);
    });

    it('should return true for ECONNABORTED code', () => {
      expect(isNetworkError({ code: 'ECONNABORTED' })).toBe(true);
    });

    it('should return true for missing response', () => {
      expect(isNetworkError({ message: 'Error' })).toBe(true);
    });

    it('should return false for server errors', () => {
      expect(isNetworkError({ response: { status: 500 } })).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('should return true for 401 status', () => {
      expect(isAuthError({ response: { status: 401 } })).toBe(true);
    });

    it('should return true for 403 status', () => {
      expect(isAuthError({ response: { status: 403 } })).toBe(true);
    });

    it('should return false for other status codes', () => {
      expect(isAuthError({ response: { status: 500 } })).toBe(false);
    });

    it('should return false for no response', () => {
      expect(isAuthError({ message: 'Error' })).toBe(false);
    });
  });

  describe('isValidationError', () => {
    it('should return true for 400 status', () => {
      expect(isValidationError({ response: { status: 400 } })).toBe(true);
    });

    it('should return true for 422 status', () => {
      expect(isValidationError({ response: { status: 422 } })).toBe(true);
    });

    it('should return false for other status codes', () => {
      expect(isValidationError({ response: { status: 500 } })).toBe(false);
    });
  });
});

console.log('✅ Error handler utility tests defined');
