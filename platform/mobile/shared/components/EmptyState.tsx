/**
 * EmptyState Component
 * 
 * Displays empty state with icon, message, and optional action.
 * Uses semantic tokens for consistent theming.
 * 
 * @module shared/components/EmptyState
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../contexts/ThemeContext';

interface EmptyStateProps {
  /** Icon name from MaterialCommunityIcons */
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Title text */
  title: string;
  /** Description message */
  message: string;
  /** Optional action button label */
  actionLabel?: string;
  /** Optional action callback */
  onAction?: () => void;
}

/**
 * Empty state component with semantic token styling
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox',
  title,
  message,
  actionLabel,
  onAction,
}) => {
  const colors = useColors();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      backgroundColor: colors.background,
    },
    title: {
      marginTop: 20,
      marginBottom: 10,
      color: colors.foreground,
    },
    message: {
      color: colors.mutedForeground,
      textAlign: 'center',
      marginBottom: 20,
    },
    button: {
      marginTop: 10,
      backgroundColor: colors.primary,
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon} size={64} color={colors.muted} />
      <Text variant="titleLarge" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {message}
      </Text>
      {actionLabel && onAction && (
        <Button mode="contained" onPress={onAction} style={styles.button}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
};
