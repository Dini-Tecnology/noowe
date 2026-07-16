import Toast from 'react-native-toast-message';
import { AxiosError } from 'axios';
import { getLocalizedAuthErrorMessage, localizeAuthError } from './auth-errors';
import { t } from '../i18n';

interface ErrorResponse {
  message?: string;
  statusCode?: number;
  error?: string;
}

/**
 * Get user-friendly error message based on HTTP status code
 */
export const getErrorMessage = (error: any): string => {
  if (!error) return t('common.genericError');

  // Check if it's an Axios error
  if (error.isAxiosError || error.response) {
    const axiosError = error as AxiosError<ErrorResponse>;
    const status = axiosError.response?.status;
    const serverMessage = axiosError.response?.data?.message;

    if (serverMessage) {
      const localized = localizeAuthError(serverMessage);
      if (localized) return localized;
    }

    switch (status) {
      case 400:
        return t('errors.validation');
      case 401:
        return t('errors.unauthorized');
      case 403:
        return t('errors.forbidden');
      case 404:
        return t('errors.notFound');
      case 409:
        return t('auth.emailAlreadyExists');
      case 422:
        return t('errors.validation');
      case 429:
        return t('auth.rateLimitExceeded');
      case 500:
        return t('errors.serverError');
      case 502:
      case 503:
      case 504:
        return t('errors.serverError');
      default:
        return t('errors.network');
    }
  }

  if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
    return t('errors.network');
  }

  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return t('errors.timeout');
  }

  return getLocalizedAuthErrorMessage(error, 'common.genericError');
};

/**
 * Show error toast notification
 */
export const showErrorToast = (error: any, fallbackMessage?: string) => {
  const message = getErrorMessage(error);

  Toast.show({
    type: 'error',
    text1: 'Erro',
    text2: fallbackMessage || message,
    visibilityTime: 4000,
    autoHide: true,
    topOffset: 60,
  });
};

/**
 * Show success toast notification
 */
export const showSuccessToast = (message: string, description?: string) => {
  Toast.show({
    type: 'success',
    text1: message,
    text2: description,
    visibilityTime: 3000,
    autoHide: true,
    topOffset: 60,
  });
};

/**
 * Show info toast notification
 */
export const showInfoToast = (message: string, description?: string) => {
  Toast.show({
    type: 'info',
    text1: message,
    text2: description,
    visibilityTime: 3000,
    autoHide: true,
    topOffset: 60,
  });
};

/**
 * Show warning toast notification
 */
export const showWarningToast = (message: string, description?: string) => {
  Toast.show({
    type: 'warning',
    text1: message,
    text2: description,
    visibilityTime: 3500,
    autoHide: true,
    topOffset: 60,
  });
};

/**
 * Handle API errors with automatic toast notification
 */
export const handleApiError = (
  error: any,
  customMessage?: string,
  options?: {
    showToast?: boolean;
    logError?: boolean;
  }
): string => {
  const { showToast = true, logError = true } = options || {};

  const errorMessage = getErrorMessage(error);

  // Log error in development
  if (logError && __DEV__) {
    console.error('[API Error]', {
      message: errorMessage,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
    });
  }

  // Show toast notification
  if (showToast) {
    showErrorToast(error, customMessage);
  }

  return errorMessage;
};

/**
 * Check if error is network-related
 */
export const isNetworkError = (error: any): boolean => {
  return (
    error.message === 'Network Error' ||
    error.code === 'ERR_NETWORK' ||
    error.code === 'ECONNABORTED' ||
    !error.response
  );
};

/**
 * Check if error is authentication-related
 */
export const isAuthError = (error: any): boolean => {
  return error.response?.status === 401 || error.response?.status === 403;
};

/**
 * Check if error is validation-related
 */
export const isValidationError = (error: any): boolean => {
  return error.response?.status === 400 || error.response?.status === 422;
};
