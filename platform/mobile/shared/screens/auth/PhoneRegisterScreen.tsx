/**
 * PhoneRegisterScreen - Complete Registration After Phone Verification
 *
 * Collects additional user information after phone number is verified.
 * Follows passwordless-first approach with optional email.
 *
 * LGPD compliance: requires separate consent checkboxes for terms,
 * privacy policy, and optional marketing opt-in. Birth date is required
 * with 18+ age validation.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Text, TextInput, Button, IconButton, HelperText } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '../../components/ScreenContainer';
import { useI18n } from '@/shared/hooks/useI18n';
import { LegalConsentSection } from '@okinawa/shared/components/LegalConsentSection';
import { otpAuthService } from '@/shared/services/otp-auth';
import { validateForm, phoneRegisterSchema } from '@/shared/validation/schemas';
import { getLocalizedAuthErrorMessage } from '@/shared/utils/auth-errors';
import Haptic from '@/shared/utils/haptics';
import { useScreenTracking } from '@/shared/hooks/useAnalytics';

const TERMS_URL = 'https://noowe.com/legal/terms';
const PRIVACY_URL = 'https://noowe.com/legal/privacy';
const CURRENT_TERMS_VERSION = '1.0';
const CURRENT_PRIVACY_VERSION = '1.0';

/**
 * Validates that a DD/MM/YYYY birth date represents a person 18+ years old
 */
function isAtLeast18(dateStr: string): boolean {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return false;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);

  const birthDate = new Date(year, month, day);
  if (isNaN(birthDate.getTime())) return false;

  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    return age - 1 >= 18;
  }
  return age >= 18;
}

/**
 * Converts DD/MM/YYYY to ISO date string YYYY-MM-DD for the API
 */
function toISODate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

interface PhoneRegisterScreenProps {
  navigation: any;
  route: {
    params?: {
      tempToken?: string;
      phoneNumber?: string;
    };
  };
  onSuccess: (result: any) => void;
  onBiometricPrompt: (enrollmentToken: string) => void;
}

export const PhoneRegisterScreen: React.FC<PhoneRegisterScreenProps> = ({
  navigation,
  route,
  onSuccess,
  onBiometricPrompt,
}) => {
  useScreenTracking('PhoneRegister');
  const { t } = useI18n();
  const colors = useColors();

  const tempToken = route.params?.tempToken;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);

  const clearFieldError = useCallback((field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [fieldErrors]);

  const validateFields = useCallback((): boolean => {
    const result = validateForm(phoneRegisterSchema, {
      fullName,
      email: email || undefined,
      birthDate,
    });

    const errors: Record<string, string> = {};

    if (!result.success) {
      Object.assign(errors, result.errors);
    }

    // Birth date is required (LGPD)
    if (!birthDate) {
      errors.birthDate = t('auth.birthDateRequired');
    } else if (!isAtLeast18(birthDate)) {
      errors.birthDate = t('auth.mustBe18');
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      Haptic.errorNotification();
      return false;
    }

    if (!acceptTerms) {
      setError(t('auth.acceptTermsRequired'));
      Haptic.errorNotification();
      return false;
    }

    if (!acceptPrivacy) {
      setError(t('auth.acceptPrivacyRequired'));
      Haptic.errorNotification();
      return false;
    }

    setFieldErrors({});
    setError('');
    return true;
  }, [fullName, email, birthDate, acceptTerms, acceptPrivacy, t]);

  const handleRegister = async () => {
    if (!validateFields()) return;
    if (!tempToken) {
      setError(t('auth.sessionExpired'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await otpAuthService.completeRegistration({
        tempToken,
        fullName,
        email: email || undefined,
        birthDate: toISODate(birthDate),
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
        acceptedPrivacyVersion: CURRENT_PRIVACY_VERSION,
        marketingConsent,
      });

      if (result.success) {
        Haptic.successNotification();

        // Prompt for biometric enrollment if token available
        if (result.biometricEnrollmentToken) {
          onBiometricPrompt(result.biometricEnrollmentToken);
        } else {
          onSuccess(result);
        }
      } else {
        setError(getLocalizedAuthErrorMessage(result.message, 'auth.registerFailed'));
        Haptic.errorNotification();
      }
    } catch (err: any) {
      setError(getLocalizedAuthErrorMessage(err, 'auth.registerFailed'));
      Haptic.errorNotification();
    } finally {
      setLoading(false);
    }
  };

  // Links are handled internally by LegalConsentSection component

  return (
    <ScreenContainer hasKeyboard>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>
          {t('auth.completeProfile') || 'Complete your profile'}
        </Text>
        <Text style={styles.subtitle}>
          {t('auth.profileDescription') || 'Tell us a bit about yourself'}
        </Text>

        {/* Full Name */}
        <TextInput
          mode="outlined"
          label={t('auth.fullName') || 'Full Name'}
          value={fullName}
          onChangeText={(text) => {
            setFullName(text);
            clearFieldError('fullName');
          }}
          style={styles.input}
          outlineStyle={styles.inputOutline}
          error={!!fieldErrors.fullName}
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
        />
        {fieldErrors.fullName && (
          <HelperText type="error">{fieldErrors.fullName}</HelperText>
        )}

        {/* Email (Optional) */}
        <TextInput
          mode="outlined"
          label={t('auth.emailOptional') || 'Email (optional)'}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            clearFieldError('email');
          }}
          style={styles.input}
          outlineStyle={styles.inputOutline}
          error={!!fieldErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        {fieldErrors.email && (
          <HelperText type="error">{fieldErrors.email}</HelperText>
        )}
        <Text style={styles.helperText}>
          {t('auth.emailHelper') || 'Add email for account recovery and receipts'}
        </Text>

        {/* Birth Date (Required - LGPD) */}
        <TextInput
          mode="outlined"
          label={t('auth.birthDate') || 'Birth Date'}
          value={birthDate}
          onChangeText={(text) => {
            setBirthDate(text);
            clearFieldError('birthDate');
          }}
          style={styles.input}
          outlineStyle={styles.inputOutline}
          error={!!fieldErrors.birthDate}
          placeholder={t('placeholders.dateFormatBR')}
          keyboardType="numeric"
        />
        {fieldErrors.birthDate && (
          <HelperText type="error">{fieldErrors.birthDate}</HelperText>
        )}
        <Text style={styles.helperText}>
          {t('auth.birthDateHelper') || 'Required. You must be at least 18 years old.'}
        </Text>

        {/* Legal Consent — Terms of Use + Privacy Policy */}
        <LegalConsentSection
          acceptedLegal={acceptTerms && acceptPrivacy}
          onToggleLegal={(value) => {
            setAcceptTerms(value);
            setAcceptPrivacy(value);
            setError('');
            Haptic.lightImpact();
          }}
          marketingOptIn={marketingConsent}
          onToggleMarketing={(value) => {
            setMarketingConsent(value);
            Haptic.lightImpact();
          }}
          showError={!!error && (!acceptTerms || !acceptPrivacy)}
        />

        {error && (
          <HelperText type="error" style={styles.errorText}>
            {error}
          </HelperText>
        )}

        <Button
          mode="contained"
          onPress={handleRegister}
          loading={loading}
          disabled={loading || !fullName || !birthDate || !acceptTerms || !acceptPrivacy}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          {t('auth.createAccount') || 'Create Account'}
        </Button>
      </ScrollView>
    </ScreenContainer>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  backButton: {
    margin: 0,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginBottom: 32,
  },
  input: {
    marginBottom: 4,
    backgroundColor: colors.card,
  },
  inputOutline: {
    borderRadius: 12,
  },
  helperText: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 16,
    marginLeft: 4,
  },
  // Legal consent styles are handled by LegalConsentSection component
  errorText: {
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    borderRadius: 12,
    marginTop: 16,
  },
  buttonContent: {
    height: 56,
  },
});

export default PhoneRegisterScreen;
