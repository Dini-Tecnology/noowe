import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Text, Card, Chip, IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { t } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ApiService } from '@okinawa/shared/services/api';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';

interface WaitlistStatsData {
  totalWaiting: number;
  avgWaitMinutes: number;
  tablesAvailable: number;
  groupsWithKids: number;
}

interface EntryChoiceScreenProps {
  route?: {
    params?: {
      restaurantId: string;
    };
  };
}

const SkeletonCard = () => {
  const colors = useColors();
  return (
    <View
      style={[
        skeletonStyles.card,
        { backgroundColor: colors.card },
      ]}
      accessibilityLabel={t('common.loading')}
    >
      <View style={[skeletonStyles.title, { backgroundColor: colors.backgroundTertiary }]} />
      <View style={[skeletonStyles.subtitle, { backgroundColor: colors.backgroundTertiary }]} />
    </View>
  );
};

const skeletonStyles = StyleSheet.create({
  card: {
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    height: 120,
  },
  title: {
    height: 20,
    width: '60%',
    borderRadius: 4,
    marginBottom: 8,
  },
  subtitle: {
    height: 14,
    width: '80%',
    borderRadius: 4,
  },
});

export default function EntryChoiceScreen({ route }: EntryChoiceScreenProps) {
  const colors = useColors();
  const navigation = useNavigation();
  const restaurantId = route?.params?.restaurantId || '';

  const [stats, setStats] = useState<WaitlistStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const response = await ApiService.get(
        `/restaurant/waitlist/${restaurantId}/stats`,
      );
      setStats(response.data);
    } catch (error) {
      // Fallback to default values
      setStats({
        totalWaiting: 3,
        avgWaitMinutes: 15,
        tablesAvailable: 0,
        groupsWithKids: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  const pullToRefresh = usePullToRefresh(fetchStats);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleWalkIn = useCallback(() => {
    (navigation as any).navigate('WaitlistScreen', { restaurantId });
  }, [navigation, restaurantId]);

  const handleReservation = useCallback(() => {
    (navigation as any).navigate('ReservationScreen', { restaurantId });
  }, [navigation, restaurantId]);

  const handleAlreadySeated = useCallback(() => {
    (navigation as any).navigate('QRScanScreen', { restaurantId });
  }, [navigation, restaurantId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        content: {
          padding: 16,
          paddingTop: 24,
        },
        title: {
          fontSize: 24,
          fontWeight: '700',
          color: colors.foreground,
          marginBottom: 8,
        },
        hint: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          marginBottom: 24,
        },
        optionCard: {
          marginBottom: 16,
          borderRadius: 16,
          overflow: 'hidden',
        },
        walkInCard: {
          borderWidth: 2,
          borderColor: colors.primary,
        },
        cardContent: {
          padding: 20,
        },
        cardHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 8,
        },
        cardTitle: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.foreground,
          marginLeft: 8,
        },
        cardDescription: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          marginBottom: 12,
        },
        chipsRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        chip: {
          backgroundColor: `${colors.primary}15`,
        },
        chipText: {
          fontSize: 12,
          color: colors.primary,
        },
        defaultCard: {
          borderWidth: 1,
          borderColor: colors.border,
        },
        loadingContainer: {
          flex: 1,
          backgroundColor: colors.background,
          padding: 16,
          paddingTop: 24,
        },
      }),
    [colors],
  );

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={pullToRefresh.refreshing} onRefresh={() => { void pullToRefresh.onRefresh(); }} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{t('entryChoice.title')}</Text>
        <Text style={styles.hint}>{t('entryChoice.hint')}</Text>

        {/* Walk-in Inteligente — primary highlight */}
        <TouchableOpacity
          onPress={handleWalkIn}
          activeOpacity={0.7}
          accessibilityLabel={t('entryChoice.walkIn')}
          accessibilityRole="button"
        >
          <Card style={[styles.optionCard, styles.walkInCard]}>
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <IconButton
                  icon="walk"
                  size={24}
                  iconColor={colors.primary}
                  accessibilityLabel={t('entryChoice.walkIn')}
                />
                <Text style={styles.cardTitle}>
                  {t('entryChoice.walkIn')}
                </Text>
              </View>
              <Text style={styles.cardDescription}>
                {t('entryChoice.walkInDesc', {
                  wait: stats?.avgWaitMinutes || 15,
                  groups: stats?.totalWaiting || 0,
                })}
              </Text>
              <View style={styles.chipsRow}>
                <Chip
                  style={styles.chip}
                  textStyle={styles.chipText}
                  icon="glass-cocktail"
                  compact
                >
                  {t('entryChoice.walkInChipDrinks')}
                </Chip>
                <Chip
                  style={styles.chip}
                  textStyle={styles.chipText}
                  icon="bell-outline"
                  compact
                >
                  {t('entryChoice.walkInChipNotify')}
                </Chip>
                <Chip
                  style={styles.chip}
                  textStyle={styles.chipText}
                  icon="book-open-outline"
                  compact
                >
                  {t('entryChoice.walkInChipMenu')}
                </Chip>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Reserva Antecipada */}
        <TouchableOpacity
          onPress={handleReservation}
          activeOpacity={0.7}
          accessibilityLabel={t('entryChoice.reservation')}
          accessibilityRole="button"
        >
          <Card style={[styles.optionCard, styles.defaultCard]}>
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <IconButton
                  icon="calendar-clock"
                  size={24}
                  iconColor={colors.secondary}
                  accessibilityLabel={t('entryChoice.reservation')}
                />
                <Text style={styles.cardTitle}>
                  {t('entryChoice.reservation')}
                </Text>
              </View>
              <Text style={styles.cardDescription}>
                {t('entryChoice.reservationDesc')}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Ja estou na mesa */}
        <TouchableOpacity
          onPress={handleAlreadySeated}
          activeOpacity={0.7}
          accessibilityLabel={t('entryChoice.alreadySeated')}
          accessibilityRole="button"
        >
          <Card style={[styles.optionCard, styles.defaultCard]}>
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <IconButton
                  icon="qrcode-scan"
                  size={24}
                  iconColor={colors.foregroundSecondary}
                  accessibilityLabel={t('entryChoice.alreadySeated')}
                />
                <Text style={styles.cardTitle}>
                  {t('entryChoice.alreadySeated')}
                </Text>
              </View>
              <Text style={styles.cardDescription}>
                {t('entryChoice.alreadySeatedDesc')}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      </View>
    </ScrollView>
  
    </ScreenContainer>
  );
}
