import React, { useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { authService } from '../../services/auth';
import { resetPasswordSchema, validateForm } from '../../validation/schemas';
import { localizeValidationMessage } from '../../validation/messages';
import { useI18n } from '../../hooks/useI18n';
import logger from '../../utils/logger';

type NavigationLike = {
  reset?: (state: { index: number; routes: Array<{ name: string }> }) => void;
};

interface ResetPasswordScreenProps {
  navigation?: NavigationLike;
  route?: {
    params?: {
      url?: string;
    };
  };
  onComplete?: () => void;
}

function leaveReset(navigation?: NavigationLike, onComplete?: () => void) {
  if (onComplete) {
    onComplete();
    return;
  }

  if (navigation?.reset) {
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    return;
  }

  router.replace('/');
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function ResetPasswordScreen({ navigation, route, onComplete }: ResetPasswordScreenProps) {
  const { t } = useI18n();
  const localParams = useLocalSearchParams<{ url?: string | string[] }>();
  const resolvedRoute = useMemo(
    () =>
      route ?? {
        params: {
          url: firstParam(localParams.url),
        },
      },
    [localParams.url, route]
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(t('auth.validatingResetLink'));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      try {
        const url = resolvedRoute?.params?.url ?? (await Linking.getInitialURL());
        if (url) {
          await authService.recoverSessionFromUrl(url);
        } else if (!(await authService.isAuthenticated())) {
          throw new Error(t('auth.resetLinkMissing'));
        }

        if (!active) return;
        setReady(true);
        setMessage(t('auth.enterNewPassword'));
      } catch (prepareError) {
        if (!active) return;
        logger.warn('[Auth] Password recovery session failed:', prepareError);
        setError(
          prepareError instanceof Error
            ? localizeValidationMessage(prepareError.message)
            : t('auth.resetLinkInvalid'),
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    prepareRecoverySession();

    return () => {
      active = false;
    };
  }, [resolvedRoute]);

  const handleSubmit = async () => {
    const parsed = validateForm(resetPasswordSchema, { password, confirmPassword });
    if (!parsed.success) {
      const firstError = Object.values(parsed.errors)[0];
      setError(firstError ?? t('auth.checkNewPassword'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await authService.updatePassword(password);
      await authService.logout();
      setMessage(t('auth.passwordUpdatedLoginAgain'));
      setTimeout(() => leaveReset(navigation, onComplete), 900);
    } catch (saveError) {
      logger.warn('[Auth] Password update failed:', saveError);
      setError(saveError instanceof Error ? saveError.message : t('auth.updatePasswordFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.resetPassword')}</Text>
      <Text style={styles.message}>{error ?? message}</Text>

      {loading && <ActivityIndicator style={styles.loader} size="large" color="#FF6B35" />}

      {!loading && ready && (
        <View style={styles.form}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.password')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            textContentType="newPassword"
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t('auth.confirmPassword')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            textContentType="newPassword"
          />
          <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSubmit} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? t('common.loading') : t('auth.resetPassword')}</Text>
          </Pressable>
        </View>
      )}

      {!loading && !ready && (
        <Pressable style={styles.secondaryButton} onPress={() => leaveReset(navigation, onComplete)}>
          <Text style={styles.secondaryButtonText}>{t('auth.signIn')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  title: {
    color: '#1A1A1A',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    color: '#4B5563',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  loader: {
    marginTop: 28,
  },
  form: {
    marginTop: 26,
    gap: 14,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    color: '#111827',
    fontSize: 16,
    paddingHorizontal: 14,
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#FF6B35',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  secondaryButtonText: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ResetPasswordScreen;
