/**
 * ErrorMessage Component
 * 
 * Displays error state with optional retry action.
 * Uses semantic tokens for consistent theming.
 * 
 * @module shared/components/ErrorMessage
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useColors } from '../contexts/ThemeContext';

interface ErrorMessageProps {
  /** Error message to display */
  message: string;
  /** Optional retry callback */
  onRetry?: () => void;
}

/**
 * Error message component with semantic token styling
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
}) => {
  const colors = useColors();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      backgroundColor: colors.background,
    },
    title: {
      color: colors.destructive,
      marginBottom: 10,
    },
    message: {
      color: colors.mutedForeground,
      textAlign: 'center',
      marginBottom: 20,
    },
    button: {
      backgroundColor: colors.primary,
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.title}>
        Oops!
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {message}
      </Text>
      {onRetry && (
        <Button mode="contained" onPress={onRetry} style={styles.button}>
          Try Again
        </Button>
      )}
    </View>
  );
};
