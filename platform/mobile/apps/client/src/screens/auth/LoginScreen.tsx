import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Text, HelperText } from 'react-native-paper';
import { authService } from '@/shared/services/auth';
import { biometricAuthService } from '@/shared/services/biometric-auth';
import { useBiometricAuth } from '@/shared/hooks/useBiometricAuth';
import { secureStorage } from '@/shared/services/secure-storage';
import { showErrorToast, showSuccessToast } from '@/shared/utils/error-handler';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useAnalyticsContext } from '@/shared/contexts/AnalyticsContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import logger from '@okinawa/shared/utils/logger';
import { loginSchema, validateForm } from '@/shared/validation/schemas';
import Haptic from '@/shared/utils/haptics';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { NooweDialog } from '@okinawa/shared/components/NooweDialog';
import { AuthScreenHeader } from '../../components/auth/AuthScreenHeader';
import { AuthTextField } from '../../components/auth/AuthTextField';
import { SocialAuthChips } from '../../components/auth/SocialAuthChips';
import { AUTH_BRAND } from '../../components/auth/authScreenTheme';
import {
  getLocalizedAuthErrorMessage,
  isEmailNotConfirmedError,
} from '@/shared/utils/auth-errors';

interface LoginScreenProps {
  navigation: any;
  onAppleLogin?: () => void;
  onGoogleLogin?: () => void;
  onBiometricLogin?: () => void;
  googleLoginAvailable?: boolean;
  appleLoginAvailable?: boolean;
  loading?: boolean;
  biometricLoading?: boolean;
}

export default function LoginScreen({
  navigation,
  onAppleLogin,
  onGoogleLogin,
  onBiometricLogin,
  googleLoginAvailable = false,
  appleLoginAvailable = false,
  loading: externalLoading = false,
  biometricLoading = false,
}: LoginScreenProps) {
  useScreenTracking('Login');
  const { t } = useI18n();
  const colors = useColors();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [biometricQuickLoginAvailable, setBiometricQuickLoginAvailable] = useState(false);
  const [emailDialog, setEmailDialog] = useState<'confirmation' | 'success' | 'error' | null>(null);
  const [emailDialogMessage, setEmailDialogMessage] = useState('');

  const analytics = useAnalytics();
  const { setUser } = useAnalyticsContext();

  const { isAvailable, isEnrolled, biometricType } = useBiometricAuth();
  const biometricIcon =
    biometricType === 'FaceID' ? 'face-recognition' : 'fingerprint';

  const isBusy = loading || externalLoading || biometricLoading;
  const hasSecondaryAuth = true;

  useEffect(() => {
    let active = true;

    const tryQuickBiometric = async () => {
      try {
        const canQuickLogin = Boolean(onBiometricLogin) && await biometricAuthService.canQuickLogin();
        if (!active) return;
        setBiometricQuickLoginAvailable(canQuickLogin);
        if (canQuickLogin && onBiometricLogin) {
          onBiometricLogin();
        }
      } catch (err) {
        logger.error('Error loading biometric preference:', err);
        if (active) setBiometricQuickLoginAvailable(false);
      }
    };
    tryQuickBiometric();
    return () => {
      active = false;
    };
  }, [isAvailable, isEnrolled, onBiometricLogin]);

  const validateFields = useCallback((): boolean => {
    const result = validateForm(loginSchema, { email, password });

    if (!result.success) {
      setFieldErrors(result.errors);
      Haptic.errorNotification();
      return false;
    }

    setFieldErrors({});
    return true;
  }, [email, password]);

  const handleResendConfirmation = async () => {
    setLoading(true);
    setError('');

    try {
      await authService.resendSignupConfirmation(email.trim().toLowerCase());
      const message = t('auth.resendConfirmationSent');
      setEmailDialogMessage(message);
      setEmailDialog('success');
      Haptic.successNotification();
    } catch (err) {
      const message = getLocalizedAuthErrorMessage(err, 'auth.resendConfirmationFailed');
      setError(message);
      setEmailDialogMessage(message);
      setEmailDialog('error');
      Haptic.errorNotification();
    } finally {
      setLoading(false);
    }
  };

  const showEmailConfirmationDialog = () => {
    setEmailDialogMessage(t('auth.confirmEmailRequired'));
    setEmailDialog('confirmation');
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      if (!validateFields()) {
        return;
      }

      const result = await authService.login(email, password);
      const biometricEnabled = await secureStorage.getBiometricEnabled();
      if (biometricEnabled) {
        await secureStorage.setUserEmail(email);
      }

      await analytics.logLogin('email');

      if (result?.user) {
        await setUser(result.user.id, {
          account_type: result.user.role || 'customer',
        });
      }

      Haptic.successNotification();
      showSuccessToast(t('auth.loginSuccess'));
    } catch (err: any) {
      if (isEmailNotConfirmedError(err)) {
        setError('');
        showEmailConfirmationDialog();
      } else {
        setError(getLocalizedAuthErrorMessage(err, 'auth.loginFailed'));
        showErrorToast(err);
      }
      Haptic.errorNotification();
      await analytics.logError('Login failed', err.code || 'LOGIN_ERROR', false);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setInfoMessage('');

    if (!email) {
      setError(t('auth.emailRequired') || 'Informe seu e-mail para redefinir a senha.');
      Haptic.errorNotification();
      return;
    }

    setLoading(true);
    try {
      await authService.sendPasswordReset(email);
      const message = t('auth.passwordResetSent') || 'Enviamos um link de redefinição para seu e-mail.';
      setInfoMessage(message);
      showSuccessToast(message);
      Haptic.successNotification();
    } catch (err: any) {
      setError(getLocalizedAuthErrorMessage(err, 'auth.resetPasswordFailed'));
      showErrorToast(err);
      Haptic.errorNotification();
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScreenContainer hasKeyboard>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthScreenHeader
            title={t('auth.welcomeToNoowe')}
            subtitle={t('auth.loginSubtitle')}
          />

          <AuthTextField
            label={t('auth.email')}
            icon="email-outline"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: '' }));
              }
            }}
            placeholder={t('auth.emailPlaceholder')}
            error={fieldErrors.email}
            accessibilityLabel={t('auth.a11y.email')}
            accessibilityHint={t('auth.a11y.emailLoginHint')}
            inputProps={{
              keyboardType: 'email-address',
              autoCapitalize: 'none',
              autoCorrect: false,
            }}
          />

          <AuthTextField
            label={t('auth.password')}
            icon="lock-outline"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (fieldErrors.password) {
                setFieldErrors((prev) => ({ ...prev, password: '' }));
              }
            }}
            placeholder={t('auth.passwordPlaceholder')}
            error={fieldErrors.password}
            secureTextEntry={!showPassword}
            showPasswordToggle
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((v) => !v)}
            accessibilityLabel={t('auth.a11y.password')}
            accessibilityHint={t('auth.a11y.passwordLoginHint')}
          />

          {error ? <HelperText type="error" style={styles.errorText}>{error}</HelperText> : null}
          {infoMessage ? <HelperText type="info" style={styles.infoText}>{infoMessage}</HelperText> : null}

          <TouchableOpacity
            onPress={handleForgotPassword}
            disabled={isBusy}
            accessibilityLabel={t('auth.a11y.resetPassword')}
            accessibilityRole="button"
            style={styles.forgotPasswordButton}
          >
            <Text style={styles.forgotPasswordText}>{t('auth.resetPassword')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, isBusy && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isBusy}
            accessibilityLabel={t('auth.a11y.login')}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('auth.login')}</Text>
            )}
          </TouchableOpacity>

          {hasSecondaryAuth ? (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('auth.or')}</Text>
                <View style={styles.dividerLine} />
              </View>

              <SocialAuthChips
                onGoogleLogin={onGoogleLogin}
                onAppleLogin={onAppleLogin}
                onBiometricLogin={onBiometricLogin}
                googleAvailable={googleLoginAvailable}
                appleAvailable={appleLoginAvailable}
                showBiometric
                biometricAvailable={biometricQuickLoginAvailable}
                biometricLoading={biometricLoading}
                biometricIcon={biometricIcon}
                disabled={isBusy}
              />
            </>
          ) : null}

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.noAccountQuestion')} </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              accessibilityLabel={t('auth.a11y.goToRegister')}
              accessibilityRole="link"
            >
              <Text style={styles.footerLink}>{t('auth.signUp')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <NooweDialog
        visible={emailDialog !== null}
        title={emailDialog === 'error' ? t('common.error') : t('auth.confirmEmailTitle')}
        message={emailDialogMessage}
        icon={emailDialog === 'success' ? 'email-check-outline' : emailDialog === 'error' ? 'alert-circle-outline' : 'email-fast-outline'}
        tone={emailDialog === 'success' ? 'success' : emailDialog === 'error' ? 'error' : 'brand'}
        onDismiss={() => setEmailDialog(null)}
        actions={emailDialog === 'confirmation'
          ? [
              {
                label: t('auth.resendConfirmation'),
                onPress: () => void handleResendConfirmation(),
                variant: 'primary',
                loading,
              },
              {
                label: t('common.cancel'),
                onPress: () => setEmailDialog(null),
                variant: 'ghost',
              },
            ]
          : [
              {
                label: t('common.ok'),
                onPress: () => setEmailDialog(null),
                variant: 'primary',
              },
            ]}
      />
    </ScreenContainer>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 48,
      paddingBottom: 32,
    },
    errorText: {
      marginBottom: 8,
    },
    infoText: {
      marginBottom: 8,
      color: colors.primary,
    },
    forgotPasswordButton: {
      alignSelf: 'flex-end',
      marginBottom: 12,
    },
    forgotPasswordText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: AUTH_BRAND.borderRadius,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 28,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 24,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: AUTH_BRAND.inputBorder,
    },
    dividerText: {
      marginHorizontal: 16,
      fontSize: 14,
      color: colors.mutedForeground ?? colors.foregroundSecondary,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    footerText: {
      fontSize: 15,
      color: colors.mutedForeground ?? colors.foregroundSecondary,
    },
    footerLink: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
      textDecorationLine: 'underline',
    },
  });
