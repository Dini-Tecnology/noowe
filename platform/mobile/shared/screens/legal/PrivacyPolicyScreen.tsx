/**
 * PrivacyPolicyScreen — Displays the platform privacy policy.
 *
 * Fetches legal content from the backend API in the user's current language.
 * Supports loading, error, and empty states.
 */

import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, ActivityIndicator, Button, Divider } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '../../components/ScreenContainer';
import { useI18n } from '@/shared/hooks/useI18n';
import ApiService from '@okinawa/shared/services/api';

interface LegalDocument {
  title: string;
  content: string;
  version: string;
  lastUpdated: string;
}

export const PrivacyPolicyScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const colors = useColors();
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    data: document,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<LegalDocument>({
    queryKey: ['legal', 'privacy-policy', language],
    queryFn: () => ApiService.getPrivacyPolicy(language),
  });

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('legal.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (isError || !document) {
    return (
      <ScreenContainer>
        <View style={styles.centeredContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>{t('legal.error')}</Text>
          <Button mode="contained" onPress={() => refetch()} style={styles.retryButton}>
            {t('common.retry')}
          </Button>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <Text style={styles.title}>{document.title}</Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {t('legal.version')}: {document.version}
        </Text>
        <Text style={styles.metaText}>
          {t('legal.lastUpdated')}: {document.lastUpdated}
        </Text>
      </View>

      <Divider style={styles.divider} />

      <Text style={styles.content}>{document.content}</Text>
    </ScrollView>
    </ScreenContainer>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    contentContainer: {
      padding: 20,
      paddingBottom: 40,
    },
    centeredContainer: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.foreground,
      marginBottom: 12,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    metaText: {
      fontSize: 12,
      color: colors.mutedForeground,
    },
    divider: {
      marginBottom: 20,
    },
    content: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.foreground,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.mutedForeground,
    },
    errorIcon: {
      fontSize: 48,
      fontWeight: 'bold',
      color: colors.destructive,
      marginBottom: 12,
    },
    errorText: {
      fontSize: 16,
      color: colors.destructive,
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      borderRadius: 8,
    },
  });

export default PrivacyPolicyScreen;
