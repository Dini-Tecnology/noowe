/**
 * ReConsentScreen - Shown when the API returns HTTP 451 (Unavailable For Legal Reasons).
 *
 * Displays the current terms of service and privacy policy text with a
 * scroll-to-bottom requirement before the "Accept" button becomes active.
 * On acceptance, calls POST /users/me/consent for each required consent type.
 * On decline, offers the option to delete the user account.
 *
 * LGPD Sprint 2: Ensures users re-accept whenever document versions change.
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
  RefreshControl,
} from 'react-native';
import { Text, Button, ActivityIndicator, Divider, Banner } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '../../components/ScreenContainer';
import ApiService from '@okinawa/shared/services/api';

const FALLBACK_TERMS: LegalDocument = {
  title: 'Termos de Uso',
  content:
    'Termos de Uso v1.1.0 — Versão offline. Conecte-se à internet para ver a versão completa.',
  version: '1.1.0',
  lastUpdated: '',
};

const FALLBACK_PRIVACY: LegalDocument = {
  title: 'Política de Privacidade',
  content:
    'Política de Privacidade v1.1.0 — Versão offline. Conecte-se à internet para ver a versão completa.',
  version: '1.1.0',
  lastUpdated: '',
};

interface ReConsentScreenProps {
  navigation?: any;
  /** Terms version the user must accept (from 451 response). */
  termsVersion?: string;
  /** Privacy policy version the user must accept (from 451 response). */
  privacyVersion?: string;
  /** Called after consent is successfully recorded. */
  onConsentAccepted?: () => void;
}

interface LegalDocument {
  title: string;
  content: string;
  version: string;
  lastUpdated: string;
}

export const ReConsentScreen: React.FC<ReConsentScreenProps> = ({
  navigation,
  termsVersion,
  privacyVersion,
  onConsentAccepted,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [acceptingConsent, setAcceptingConsent] = useState(false);

  // Fetch both legal documents with offline fallback
  const {
    data: termsDoc,
    isLoading: termsLoading,
    isError: termsError,
    refetch: refetchTerms,
    isRefetching: termsRefetching,
  } = useQuery<LegalDocument>({
    queryKey: ['legal', 'terms-of-service', 'reconsent'],
    queryFn: () => ApiService.getTermsOfService(),
    retry: 2,
  });

  const {
    data: privacyDoc,
    isLoading: privacyLoading,
    isError: privacyError,
    refetch: refetchPrivacy,
    isRefetching: privacyRefetching,
  } = useQuery<LegalDocument>({
    queryKey: ['legal', 'privacy-policy', 'reconsent'],
    queryFn: () => ApiService.getPrivacyPolicy(),
    retry: 2,
  });

  const isLoading = termsLoading || privacyLoading;
  const isOffline = termsError || privacyError;

  // Use fallback documents when API fails
  const resolvedTerms = termsDoc ?? (termsError ? FALLBACK_TERMS : undefined);
  const resolvedPrivacy = privacyDoc ?? (privacyError ? FALLBACK_PRIVACY : undefined);

  const handleRetry = useCallback(() => {
    if (termsError) refetchTerms();
    if (privacyError) refetchPrivacy();
  }, [termsError, privacyError, refetchTerms, refetchPrivacy]);

  // Track scroll position to enable the accept button only when the user scrolled to the bottom
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const paddingBottom = 40;
      const isAtBottom =
        layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingBottom;
      if (isAtBottom && !hasScrolledToBottom) {
        setHasScrolledToBottom(true);
      }
    },
    [hasScrolledToBottom],
  );

  // Accept consent mutation
  const acceptConsentMutation = useMutation({
    mutationFn: async () => {
      const resolvedTermsVersion = termsVersion || termsDoc?.version || '1.0.0';
      const resolvedPrivacyVersion = privacyVersion || privacyDoc?.version || '1.0.0';

      // Accept both consent types
      await ApiService.post('/users/me/consent', {
        consent_type: 'terms_of_service',
        version: resolvedTermsVersion,
      });
      await ApiService.post('/users/me/consent', {
        consent_type: 'privacy_policy',
        version: resolvedPrivacyVersion,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal'] });
      onConsentAccepted?.();
    },
    onError: () => {
      Alert.alert(
        'Error',
        'Failed to record your consent. Please try again.',
        [{ text: 'OK' }],
      );
    },
  });

  const handleAccept = async () => {
    setAcceptingConsent(true);
    try {
      await acceptConsentMutation.mutateAsync();
    } finally {
      setAcceptingConsent(false);
    }
  };

  const handleDecline = () => {
    Alert.alert(
      'Decline Terms',
      'If you decline the updated terms, you will need to delete your account. Do you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.deleteAccount();
              navigation?.reset?.({
                index: 0,
                routes: [{ name: 'Welcome' }],
              });
            } catch {
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading legal documents...</Text>
        </View>
      </ScreenContainer>
    );
  }

  // If both queries failed and we have no data at all, show error with retry
  if (isOffline && !resolvedTerms && !resolvedPrivacy) {
    return (
      <ScreenContainer>
        <View style={styles.centeredContainer}>
          <Text style={styles.headerTitle}>Erro de conexão</Text>
          <Text style={[styles.loadingText, { marginBottom: 16 }]}>
            Não foi possível carregar os documentos legais. Verifique sua conexão.
          </Text>
          <Button mode="contained" onPress={handleRetry}>
            Tentar Novamente
          </Button>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Offline banner */}
      {isOffline && (
        <Banner
          visible
          actions={[{ label: 'Tentar Novamente', onPress: handleRetry }]}
          icon="wifi-off"
          style={styles.offlineBanner}
        >
          Você está visualizando uma versão offline dos documentos.
        </Banner>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Updated Terms</Text>
        <Text style={styles.headerSubtitle}>
          Our terms of service and privacy policy have been updated. Please review and accept to continue using the app.
        </Text>
      </View>

      {/* Scrollable legal content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        refreshControl={(
          <RefreshControl
            refreshing={termsRefetching || privacyRefetching}
            onRefresh={() => { void Promise.all([refetchTerms(), refetchPrivacy()]); }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        )}
      >
        {/* Terms of Service */}
        {resolvedTerms && (
          <>
            <Text style={styles.sectionTitle}>{resolvedTerms.title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                Version: {resolvedTerms.version}
              </Text>
              {resolvedTerms.lastUpdated ? (
                <Text style={styles.metaText}>
                  Updated: {resolvedTerms.lastUpdated}
                </Text>
              ) : null}
            </View>
            <Text style={styles.content}>{resolvedTerms.content}</Text>
          </>
        )}

        <Divider style={styles.divider} />

        {/* Privacy Policy */}
        {resolvedPrivacy && (
          <>
            <Text style={styles.sectionTitle}>{resolvedPrivacy.title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                Version: {resolvedPrivacy.version}
              </Text>
              {resolvedPrivacy.lastUpdated ? (
                <Text style={styles.metaText}>
                  Updated: {resolvedPrivacy.lastUpdated}
                </Text>
              ) : null}
            </View>
            <Text style={styles.content}>{resolvedPrivacy.content}</Text>
          </>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Scroll hint */}
      {!hasScrolledToBottom && (
        <Text style={styles.scrollHint}>
          Scroll to the bottom to accept
        </Text>
      )}

      {/* Action buttons */}
      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={handleAccept}
          disabled={!hasScrolledToBottom || acceptingConsent}
          loading={acceptingConsent}
          style={styles.acceptButton}
          contentStyle={styles.buttonContent}
          accessibilityLabel="Accept updated terms and privacy policy"
        >
          I Accept
        </Button>

        <Button
          mode="text"
          onPress={handleDecline}
          textColor={colors.destructive}
          style={styles.declineButton}
          accessibilityLabel="Decline updated terms"
        >
          Decline
        </Button>
      </View>
    </View>
    </ScreenContainer>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centeredContainer: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.mutedForeground,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.foreground,
      marginBottom: 8,
    },
    headerSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.mutedForeground,
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.foreground,
      marginBottom: 8,
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
    content: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.foreground,
    },
    divider: {
      marginVertical: 24,
    },
    scrollHint: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.mutedForeground,
      paddingVertical: 4,
      backgroundColor: colors.muted,
    },
    footer: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      paddingBottom: 34, // Safe area bottom
    },
    acceptButton: {
      borderRadius: 8,
      marginBottom: 8,
    },
    buttonContent: {
      paddingVertical: 6,
    },
    declineButton: {
      borderRadius: 8,
    },
    offlineBanner: {
      backgroundColor: colors.warning ?? colors.warningBackground,
    },
  });

export default ReConsentScreen;
