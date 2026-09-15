/**
 * LegalConsentSection — Modern Terms & Privacy Consent Component
 *
 * Styled after modern apps (Nubank, Uber, iFood) with:
 * - Unified single-tap consent for Terms + Privacy (legally linked)
 * - Tappable inline links that open the full documents
 * - Optional marketing opt-in as separate toggle
 * - Clean, minimal design with proper accessibility
 * - Shield icon for trust signal
 *
 * Legally binds to:
 * - NOOWE Termos e Condições Gerais de Uso v1.0 (22/03/2026)
 * - NOOWE Política de Privacidade v1.0 (22/03/2026)
 */

import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Text, Switch } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import { ENV } from '@okinawa/shared/config/env';

const TERMS_URL = ENV.TERMS_OF_SERVICE_URL;
const PRIVACY_URL = ENV.PRIVACY_POLICY_URL;

export interface LegalConsentProps {
  /** Whether the user accepted Terms + Privacy (required) */
  acceptedLegal: boolean;
  /** Toggle handler for Terms + Privacy */
  onToggleLegal: (value: boolean) => void;
  /** Whether the user opted into marketing (optional) */
  marketingOptIn: boolean;
  /** Toggle handler for marketing */
  onToggleMarketing: (value: boolean) => void;
  /** Show validation error state */
  showError?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

export function LegalConsentSection({
  acceptedLegal,
  onToggleLegal,
  marketingOptIn,
  onToggleMarketing,
  showError = false,
  errorMessage,
}: LegalConsentProps) {
  const colors = useColors();
  // t() imported directly from i18n module

  const openTerms = useCallback(() => {
    Linking.openURL(TERMS_URL);
  }, []);

  const openPrivacy = useCallback(() => {
    Linking.openURL(PRIVACY_URL);
  }, []);

  const styles = createStyles(colors, showError && !acceptedLegal);

  return (
    <View style={styles.container}>
      {/* Divider with shield icon */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <View style={styles.shieldContainer}>
          <Icon
            name="shield-check-outline"
            size={18}
            color={acceptedLegal ? colors.success : colors.foregroundMuted}
          />
        </View>
        <View style={styles.dividerLine} />
      </View>

      {/* Main legal consent — single tap covers both documents */}
      <TouchableOpacity
        style={[
          styles.legalCard,
          acceptedLegal && styles.legalCardAccepted,
          showError && !acceptedLegal && styles.legalCardError,
        ]}
        onPress={() => onToggleLegal(!acceptedLegal)}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acceptedLegal }}
        accessibilityLabel={t('auth.legalConsent.a11yLabel')}
      >
        <View style={styles.checkboxArea}>
          <View
            style={[
              styles.checkbox,
              acceptedLegal && styles.checkboxChecked,
            ]}
          >
            {acceptedLegal && (
              <Icon name="check" size={14} color="#FFFFFF" />
            )}
          </View>
        </View>

        <View style={styles.legalTextArea}>
          <Text style={styles.legalMainText}>
            {t('auth.legalConsent.prefix')}{' '}
            <Text style={styles.link} onPress={openTerms}>
              {t('auth.legalConsent.terms')}
            </Text>
            {' '}{t('auth.legalConsent.and')}{' '}
            <Text style={styles.link} onPress={openPrivacy}>
              {t('auth.legalConsent.privacy')}
            </Text>
          </Text>
          <Text style={styles.legalSubText}>
            {t('auth.legalConsent.description')}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Error message */}
      {showError && !acceptedLegal && (
        <View style={styles.errorRow}>
          <Icon name="alert-circle-outline" size={14} color={colors.error} />
          <Text style={styles.errorText}>
            {errorMessage || t('auth.legalConsent.required')}
          </Text>
        </View>
      )}

      {/* Marketing opt-in — separate, optional, modern toggle */}
      <View style={styles.marketingRow}>
        <View style={styles.marketingTextArea}>
          <Text style={styles.marketingText}>
            {t('auth.legalConsent.marketingLabel')}
          </Text>
          <Text style={styles.marketingSubText}>
            {t('auth.legalConsent.marketingDescription')}
          </Text>
        </View>
        <Switch
          value={marketingOptIn}
          onValueChange={onToggleMarketing}
          color={colors.primary}
          accessibilityRole="switch"
          accessibilityLabel={t('auth.legalConsent.marketingA11y')}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: any, hasError: boolean) =>
  StyleSheet.create({
    container: {
      marginTop: 24,
      marginBottom: 8,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    shieldContainer: {
      paddingHorizontal: 12,
    },
    legalCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    legalCardAccepted: {
      borderColor: colors.success,
      backgroundColor: colors.successLight + '15',
    },
    legalCardError: {
      borderColor: colors.error,
      backgroundColor: colors.error + '08',
    },
    checkboxArea: {
      marginRight: 14,
      marginTop: 2,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: hasError ? colors.error : colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxChecked: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    legalTextArea: {
      flex: 1,
    },
    legalMainText: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.foreground,
      fontWeight: '500',
    },
    link: {
      color: colors.primary,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    legalSubText: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.foregroundMuted,
      marginTop: 4,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      marginLeft: 4,
      gap: 6,
    },
    errorText: {
      fontSize: 12,
      color: colors.error,
      fontWeight: '500',
    },
    marketingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 4,
      marginTop: 12,
    },
    marketingTextArea: {
      flex: 1,
      marginRight: 12,
    },
    marketingText: {
      fontSize: 14,
      color: colors.foreground,
      fontWeight: '500',
    },
    marketingSubText: {
      fontSize: 12,
      color: colors.foregroundMuted,
      marginTop: 2,
    },
  });

export default LegalConsentSection;
