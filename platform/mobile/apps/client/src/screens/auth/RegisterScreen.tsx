import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Text, HelperText, IconButton } from 'react-native-paper';
import { authService } from '@/shared/services/auth';
import { useBiometricAuth } from '@/shared/hooks/useBiometricAuth';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useAnalyticsContext } from '@/shared/contexts/AnalyticsContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { registerSchema, validateForm } from '@/shared/validation/schemas';
import { LegalConsentSection } from '@okinawa/shared/components/LegalConsentSection';
import Haptic from '@/shared/utils/haptics';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { NooweDialog } from '@okinawa/shared/components/NooweDialog';
import { AuthScreenHeader } from '../../components/auth/AuthScreenHeader';
import { AuthTextField } from '../../components/auth/AuthTextField';
import { SocialAuthChips } from '../../components/auth/SocialAuthChips';
import { AUTH_BRAND } from '../../components/auth/authScreenTheme';
import { AuthConsentCheckbox } from '../../components/auth/AuthConsentCheckbox';
import {
  getLocalizedAuthErrorMessage,
  isEmailAlreadyRegisteredError,
} from '@/shared/utils/auth-errors';

interface RegisterScreenProps {
  navigation: any;
  onAppleLogin?: () => void;
  onGoogleLogin?: () => void;
  onBiometricLogin?: () => void;
  googleLoginAvailable?: boolean;
  appleLoginAvailable?: boolean;
  loading?: boolean;
  biometricLoading?: boolean;
}

export default function RegisterScreen({
  navigation,
  onAppleLogin,
  onGoogleLogin,
  onBiometricLogin,
  googleLoginAvailable = false,
  appleLoginAvailable = false,
  loading: externalLoading = false,
  biometricLoading = false,
}: RegisterScreenProps) {
  useScreenTracking('Register');
  const { t } = useI18n();
  const colors = useColors();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConsentError, setShowConsentError] = useState(false);
  const [showAgeError, setShowAgeError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [emailDialog, setEmailDialog] = useState<'sent' | 'existing' | 'success' | 'error' | null>(null);
  const [emailDialogMessage, setEmailDialogMessage] = useState('');

  const analytics = useAnalytics();
  const { setUser } = useAnalyticsContext();
  const { biometricType } = useBiometricAuth();
  const biometricIcon =
    biometricType === 'FaceID' ? 'face-recognition' : 'fingerprint';

  const isBusy = loading || externalLoading || biometricLoading;
  const hasSecondaryAuth = true;

  const clearFieldError = useCallback((field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    }
  }, [fieldErrors]);

  const validateFields = useCallback((): boolean => {
    const result = validateForm(registerSchema, {
      fullName,
      email,
      password,
      confirmPassword,
    });

    if (!result.success) {
      setFieldErrors(result.errors);
      Haptic.errorNotification();
      return false;
    }

    setFieldErrors({});
    return true;
  }, [fullName, email, password, confirmPassword]);

  const showConfirmEmailDialog = useCallback((message: string) => {
    setEmailDialogMessage(message);
    setEmailDialog('sent');
  }, []);

  const handleResendConfirmation = async () => {
    setLoading(true);
    setError('');

    try {
      await authService.resendSignupConfirmation(email.trim().toLowerCase());
      setEmailDialogMessage(t('auth.resendConfirmationSent'));
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

  const showExistingEmailDialog = () => {
    setEmailDialogMessage(t('auth.existingEmailConfirmation'));
    setEmailDialog('existing');
  };

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    setShowConsentError(false);

    try {
      if (!validateFields()) return;

      if (!confirmedAge) {
        setShowAgeError(true);
        Haptic.errorNotification();
        return;
      }

      if (!acceptedLegal) {
        setShowConsentError(true);
        Haptic.errorNotification();
        return;
      }

      const result = await authService.register(email, password, fullName);

      if (result?.needsEmailConfirmation) {
        const message = t('auth.confirmEmailSent') || 'Enviamos um e-mail de confirmação para ativar sua conta.';
        Haptic.successNotification();
        showConfirmEmailDialog(message);
        return;
      }

      await analytics.logSignUp('email');

      if (result?.user) {
        await setUser(result.user.id, {
          account_type: result.user.role || 'customer',
        });
      }

      Haptic.successNotification();
    } catch (err: any) {
      if (isEmailAlreadyRegisteredError(err)) {
        setError('');
        showExistingEmailDialog();
      } else {
        setError(getLocalizedAuthErrorMessage(err, 'auth.registerFailed'));
      }
      Haptic.errorNotification();
      await analytics.logError('Registration failed', err.code || 'REGISTER_ERROR', false);
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
        <View style={styles.topBar}>
          <IconButton
            icon="arrow-left"
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
            style={styles.backButton}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthScreenHeader
            title={t('auth.createAccount')}
            subtitle={t('auth.registerSubtitle')}
          />

          <AuthTextField
            label={t('auth.fullName')}
            icon="account-outline"
            value={fullName}
            onChangeText={(text) => {
              setFullName(text);
              clearFieldError('fullName');
            }}
            placeholder={t('auth.fullNamePlaceholder')}
            error={fieldErrors.fullName}
            accessibilityLabel={t('auth.a11y.fullName')}
            accessibilityHint={t('auth.a11y.fullNameHint')}
            inputProps={{ autoCapitalize: 'words' }}
          />

          <AuthTextField
            label={t('auth.email')}
            icon="email-outline"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              clearFieldError('email');
            }}
            placeholder={t('auth.emailPlaceholder')}
            error={fieldErrors.email}
            accessibilityLabel={t('auth.a11y.email')}
            accessibilityHint={t('auth.a11y.emailHint')}
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
              clearFieldError('password');
            }}
            placeholder={t('auth.passwordPlaceholder')}
            error={fieldErrors.password}
            secureTextEntry={!showPassword}
            showPasswordToggle
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((v) => !v)}
            accessibilityLabel={t('auth.a11y.password')}
            accessibilityHint={t('auth.a11y.passwordRegisterHint')}
          />

          <AuthTextField
            label={t('auth.confirmPassword')}
            icon="lock-check-outline"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              clearFieldError('confirmPassword');
            }}
            placeholder={t('auth.passwordPlaceholder')}
            error={fieldErrors.confirmPassword}
            secureTextEntry={!showConfirmPassword}
            showPasswordToggle
            showPassword={showConfirmPassword}
            onTogglePassword={() => setShowConfirmPassword((v) => !v)}
            accessibilityLabel={t('auth.a11y.confirmPassword')}
            accessibilityHint={t('auth.a11y.confirmPasswordHint')}
          />

          <AuthConsentCheckbox
            checked={confirmedAge}
            onToggle={() => {
              setConfirmedAge(!confirmedAge);
              setShowAgeError(false);
              Haptic.lightImpact();
            }}
            label={t('auth.confirmAge18')}
            showError={showAgeError}
            errorMessage={t('auth.ageRequired')}
          />

          <LegalConsentSection
            acceptedLegal={acceptedLegal}
            onToggleLegal={(value) => {
              setAcceptedLegal(value);
              setShowConsentError(false);
              Haptic.lightImpact();
            }}
            marketingOptIn={marketingConsent}
            onToggleMarketing={(value) => {
              setMarketingConsent(value);
              Haptic.lightImpact();
            }}
            showError={showConsentError}
          />

          {error ? <HelperText type="error">{error}</HelperText> : null}

          <TouchableOpacity
            style={[styles.primaryButton, isBusy && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isBusy}
            accessibilityLabel={t('auth.a11y.createAccount')}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('auth.register')}</Text>
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
                showBiometric={false}
                biometricLoading={biometricLoading}
                biometricIcon={biometricIcon}
                disabled={isBusy}
              />
            </>
          ) : null}

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.hasAccountQuestion')} </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              accessibilityLabel={t('auth.a11y.goToLogin')}
              accessibilityRole="link"
            >
              <Text style={styles.footerLink}>{t('auth.signIn')}</Text>
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
        dismissible={emailDialog !== 'sent'}
        onDismiss={() => setEmailDialog(null)}
        actions={emailDialog === 'existing'
          ? [
              {
                label: t('auth.resendConfirmation'),
                onPress: () => void handleResendConfirmation(),
                variant: 'primary',
                loading,
              },
              {
                label: t('auth.a11y.goToLogin'),
                onPress: () => navigation.navigate('Login'),
                variant: 'secondary',
              },
              {
                label: t('common.cancel'),
                onPress: () => setEmailDialog(null),
                variant: 'ghost',
              },
            ]
          : emailDialog === 'sent'
            ? [
                {
                  label: t('auth.a11y.goToLogin'),
                  onPress: () => navigation.navigate('Login'),
                  variant: 'primary',
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
    topBar: {
      paddingHorizontal: 8,
      paddingTop: 4,
    },
    backButton: {
      margin: 0,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 32,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: AUTH_BRAND.borderRadius,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 12,
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
