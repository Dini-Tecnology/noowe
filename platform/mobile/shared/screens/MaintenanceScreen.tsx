/**
 * MaintenanceScreen — Full-screen overlay shown when the backend returns 503.
 *
 * Displays a maintenance icon, title, message, optional estimated end time,
 * and a retry button that checks if maintenance is over via the health endpoint.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '../components/ScreenContainer';
import { useI18n } from '@/shared/hooks/useI18n';
import ApiService from '@okinawa/shared/services/api';

interface MaintenanceScreenProps {
  message?: string;
  estimatedEnd?: string | null;
  onMaintenanceOver?: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  message,
  estimatedEnd,
  onMaintenanceOver,
}) => {
  const colors = useColors();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isChecking, setIsChecking] = useState(false);

  const handleRetry = useCallback(async () => {
    setIsChecking(true);
    try {
      const status = await ApiService.getMaintenanceStatus();
      if (!status.maintenance) {
        onMaintenanceOver?.();
      }
    } catch {
      // If the health endpoint itself fails, stay on maintenance screen
    } finally {
      setIsChecking(false);
    }
  }, [onMaintenanceOver]);

  return (
    <ScreenContainer>
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      alwaysBounceVertical
      refreshControl={<RefreshControl refreshing={isChecking} onRefresh={() => { void handleRetry(); }} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <View style={styles.content}>
        {/* Maintenance Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>&#x1F6E0;</Text>
        </View>

        <Text style={styles.title}>{t('maintenance.title')}</Text>

        <Text style={styles.message}>
          {message || t('maintenance.message')}
        </Text>

        {estimatedEnd && (
          <View style={styles.estimatedEndContainer}>
            <Text style={styles.estimatedEndLabel}>
              {t('maintenance.estimatedEnd')}:
            </Text>
            <Text style={styles.estimatedEndValue}>{estimatedEnd}</Text>
          </View>
        )}

        <Button
          mode="contained"
          onPress={handleRetry}
          loading={isChecking}
          disabled={isChecking}
          style={styles.retryButton}
          contentStyle={styles.retryButtonContent}
        >
          {isChecking ? t('common.loading') : t('maintenance.retry')}
        </Button>
      </View>
    </ScrollView>
    </ScreenContainer>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    content: {
      alignItems: 'center',
      maxWidth: 320,
    },
    iconContainer: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.warning + '20',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    icon: {
      fontSize: 48,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.foreground,
      textAlign: 'center',
      marginBottom: 12,
    },
    message: {
      fontSize: 16,
      color: colors.mutedForeground,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 24,
    },
    estimatedEndContainer: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      padding: 16,
      marginBottom: 32,
      width: '100%',
      alignItems: 'center',
    },
    estimatedEndLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginBottom: 4,
    },
    estimatedEndValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.foreground,
    },
    retryButton: {
      borderRadius: 12,
      width: '100%',
    },
    retryButtonContent: {
      height: 48,
    },
  });

export default MaintenanceScreen;
