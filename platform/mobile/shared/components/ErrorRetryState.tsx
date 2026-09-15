/**
 * ErrorRetryState Component
 *
 * Displays an error message with a retry button.
 * Supports both inline and full-screen layouts.
 * Uses semantic tokens, i18n, and haptic feedback.
 *
 * @module shared/components/ErrorRetryState
 */

import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../contexts/ThemeContext';
import { t } from '../i18n';
import { trigger } from '../utils/haptics';

interface ErrorRetryStateProps {
  /** Error message to display. When null/undefined the component renders nothing. */
  error: string | null | undefined;
  /** Callback invoked when the user taps the retry button */
  onRetry: () => void;
  /** When true the component fills the entire screen */
  fullScreen?: boolean;
  /** Optional custom title (defaults to i18n common.error) */
  title?: string;
}

/**
 * Reusable error state with retry capability.
 *
 * Usage:
 * ```tsx
 * <ErrorRetryState error={error} onRetry={refetch} fullScreen />
 * ```
 */
export const ErrorRetryState: React.FC<ErrorRetryStateProps> = ({
  error,
  onRetry,
  fullScreen = false,
  title,
}) => {
  const colors = useColors();

  const handleRetry = useCallback(() => {
    trigger('medium');
    onRetry();
  }, [onRetry]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: fullScreen ? 1 : undefined,
          justifyContent: 'center',
          alignItems: 'center',
          padding: fullScreen ? 40 : 24,
          backgroundColor: fullScreen ? colors.background : 'transparent',
        },
        iconContainer: {
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.destructive + '14', // 8% opacity
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 16,
        },
        title: {
          color: colors.foreground,
          marginBottom: 8,
          textAlign: 'center',
        },
        message: {
          color: colors.mutedForeground,
          textAlign: 'center',
          marginBottom: 24,
          paddingHorizontal: 16,
        },
        button: {
          backgroundColor: colors.primary,
          borderRadius: 8,
          minWidth: 140,
        },
        buttonLabel: {
          color: '#FFFFFF',
        },
      }),
    [colors, fullScreen],
  );

  if (!error) return null;

  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={36}
          color={colors.destructive}
        />
      </View>
      <Text variant="titleMedium" style={styles.title}>
        {title ?? t('common.error')}
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {error}
      </Text>
      <Button
        mode="contained"
        onPress={handleRetry}
        style={styles.button}
        labelStyle={styles.buttonLabel}
        icon="refresh"
        accessibilityLabel={t('common.retry')}
      >
        {t('common.retry')}
      </Button>
    </View>
  );
};

export default ErrorRetryState;
