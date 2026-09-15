import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { authService } from '@/shared/services/auth';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { resetPasswordSchema, validateForm } from '@/shared/validation/schemas';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { NooweDialog } from '@okinawa/shared/components/NooweDialog';
import logger from '@okinawa/shared/utils/logger';
import { AuthScreenHeader } from '../../components/auth/AuthScreenHeader';
import { AuthTextField } from '../../components/auth/AuthTextField';
import { AUTH_BRAND } from '../../components/auth/authScreenTheme';
import Haptic from '@/shared/utils/haptics';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ResetPasswordScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const params = useLocalSearchParams<{
    url?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
  }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [ready, setReady] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resultDialog, setResultDialog] = useState<'success' | 'error' | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      try {
        const tokenHash = firstParam(params.token_hash);
        const url = firstParam(params.url) ?? (await Linking.getInitialURL());

        if (tokenHash) {
          // Deep link direto do app: noowe://auth/reset-password?token_hash=...&type=recovery
          await authService.verifyEmailTokenHash(tokenHash, 'recovery');
        } else if (url) {
          await authService.recoverSessionFromUrl(url);
        } else if (!(await authService.isAuthenticated())) {
          throw new Error(t('auth.resetLinkMissing'));
        }

        if (!active) return;
        setReady(true);
      } catch (error) {
        if (!active) return;
        logger.warn('[Auth] Password recovery session failed:', error);
        setLinkError(error instanceof Error ? error.message : t('auth.resetLinkInvalid'));
      } finally {
        if (active) setCheckingLink(false);
      }
    }

    prepareRecoverySession();
    return () => {
      active = false;
    };
  }, [params.token_hash, params.url, t]);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
  }, []);

  const handleSubmit = async () => {
    const parsed = validateForm(resetPasswordSchema, { password, confirmPassword });
    if (!parsed.success) {
      setFieldErrors(parsed.errors);
      Haptic.errorNotification();
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      await authService.updatePassword(password);
      await authService.logout();
      Haptic.successNotification();
      setResultMessage(t('auth.passwordUpdatedLoginAgain'));
      setResultDialog('success');
    } catch (error) {
      logger.warn('[Auth] Password update failed:', error);
      Haptic.errorNotification();
      setResultMessage(error instanceof Error ? error.message : t('auth.updatePasswordFailed'));
      setResultDialog('error');
    } finally {
      setSaving(false);
    }
  };

  const goToLogin = useCallback(() => {
    router.replace('/');
  }, []);

  return (
    <ScreenContainer hasKeyboard>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthScreenHeader
          title={t('auth.resetPassword')}
          subtitle={checkingLink ? t('auth.validatingResetLink') : ready ? t('auth.enterNewPassword') : linkError ?? t('auth.resetLinkInvalid')}
        />

        {checkingLink ? (
          <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
        ) : ready ? (
          <>
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
              inputProps={{ textContentType: 'newPassword' }}
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
              inputProps={{ textContentType: 'newPassword' }}
            />

            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={saving}
              accessibilityLabel={t('auth.resetPassword')}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('auth.resetPassword')}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={goToLogin}
            accessibilityLabel={t('auth.signIn')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{t('auth.signIn')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <NooweDialog
        visible={resultDialog !== null}
        title={resultDialog === 'success' ? t('auth.resetPassword') : t('common.error')}
        message={resultMessage}
        icon={resultDialog === 'success' ? 'check-circle-outline' : 'alert-circle-outline'}
        tone={resultDialog === 'success' ? 'success' : 'error'}
        dismissible={resultDialog !== 'success'}
        onDismiss={() => setResultDialog(null)}
        actions={
          resultDialog === 'success'
            ? [
                {
                  label: t('auth.signIn'),
                  onPress: () => {
                    setResultDialog(null);
                    goToLogin();
                  },
                  variant: 'primary',
                },
              ]
            : [
                {
                  label: t('common.ok'),
                  onPress: () => setResultDialog(null),
                  variant: 'primary',
                },
              ]
        }
      />
    </ScreenContainer>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 32,
      justifyContent: 'center',
    },
    loader: {
      marginTop: 12,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: AUTH_BRAND.borderRadius,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    secondaryButton: {
      marginTop: 8,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: AUTH_BRAND.borderRadius,
      borderWidth: 1,
      borderColor: AUTH_BRAND.inputBorder,
    },
    secondaryButtonText: {
      color: colors.foreground,
      fontSize: 16,
      fontWeight: '700',
    },
  });
