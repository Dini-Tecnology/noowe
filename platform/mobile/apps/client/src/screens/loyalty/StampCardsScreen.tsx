import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Dimensions,
} from 'react-native';
import {
  Text,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import logger from '@okinawa/shared/utils/logger';
import ApiService from '@/shared/services/api';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

// Types
interface StampCard {
  id: string;
  service_type: string;
  current_stamps: number;
  required_stamps: number;
  reward_description: string;
  completed: boolean;
  completed_cycles: number;
  completed_at: string | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - CARD_GAP) / 2;
const STAMP_SIZE = 24;

// Service type icon map
const SERVICE_TYPE_ICONS: Record<string, string> = {
  'dine-in': 'silverware-fork-knife',
  delivery: 'moped',
  takeout: 'shopping',
};

// Skeleton Components
const SkeletonCard = ({ colors }: { colors: any }) => (
  <View
    style={{
      width: CARD_WIDTH,
      height: 200,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: 12,
      margin: CARD_GAP / 2,
    }}
  />
);

const SkeletonLoader = ({ colors }: { colors: any }) => (
  <View
    style={{
      flex: 1,
      backgroundColor: colors.background,
      padding: CARD_PADDING,
      flexDirection: 'row',
      flexWrap: 'wrap',
    }}
  >
    <SkeletonCard colors={colors} />
    <SkeletonCard colors={colors} />
    <SkeletonCard colors={colors} />
  </View>
);

// Stamp Grid component
const StampGrid = ({
  total,
  filled,
  completed,
  colors,
}: {
  total: number;
  filled: number;
  completed: boolean;
  colors: any;
}) => {
  const cols = 5;
  const rows = Math.ceil(total / cols);

  return (
    <View style={{ marginTop: 12 }}>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <View
          key={rowIndex}
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-start',
            gap: 6,
            marginBottom: 6,
          }}
        >
          {Array.from(
            { length: Math.min(cols, total - rowIndex * cols) },
            (_, colIndex) => {
              const index = rowIndex * cols + colIndex;
              const isFilled = index < filled;

              return (
                <View
                  key={colIndex}
                  style={{
                    width: STAMP_SIZE,
                    height: STAMP_SIZE,
                    borderRadius: STAMP_SIZE / 2,
                    backgroundColor: isFilled
                      ? completed
                        ? colors.success
                        : colors.primary
                      : colors.backgroundTertiary,
                    borderWidth: 1.5,
                    borderColor: isFilled
                      ? completed
                        ? colors.success
                        : colors.primary
                      : colors.border,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {isFilled && (
                    <IconButton
                      icon="check"
                      size={12}
                      iconColor={colors.premiumCardForeground}
                      style={{ margin: 0 }}
                    />
                  )}
                </View>
              );
            },
          )}
        </View>
      ))}
    </View>
  );
};

export default function StampCardsScreen() {
  const colors = useColors();

  const [stampCards, setStampCards] = useState<StampCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStampCards = useCallback(async () => {
    try {
      const response = await ApiService.get('/loyalty/stamp-cards/current');
      setStampCards(response.data || []);
    } catch (err) {
      logger.error('Error fetching stamp cards:', err);
      // Demo data fallback
      setStampCards([
        {
          id: '1',
          service_type: 'dine-in',
          current_stamps: 7,
          required_stamps: 10,
          reward_description: 'Sobremesa grátis',
          completed: false,
          completed_cycles: 2,
          completed_at: null,
        },
        {
          id: '2',
          service_type: 'delivery',
          current_stamps: 3,
          required_stamps: 10,
          reward_description: 'Frete grátis',
          completed: false,
          completed_cycles: 0,
          completed_at: null,
        },
        {
          id: '3',
          service_type: 'takeout',
          current_stamps: 10,
          required_stamps: 10,
          reward_description: 'Bebida grátis',
          completed: true,
          completed_cycles: 1,
          completed_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStampCards();
  }, [fetchStampCards]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStampCards();
  }, [fetchStampCards]);

  const getServiceTypeLabel = useCallback((type: string): string => {
    switch (type) {
      case 'dine-in':
        return t('loyalty.stamps.dineIn');
      case 'delivery':
        return t('loyalty.stamps.delivery');
      case 'takeout':
        return t('loyalty.stamps.takeout');
      default:
        return type;
    }
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          paddingHorizontal: CARD_PADDING,
          paddingTop: 16,
          paddingBottom: 8,
        },
        headerTitle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.foreground,
        },
        list: {
          padding: CARD_PADDING / 2,
        },
        cardWrapper: {
          width: CARD_WIDTH,
          margin: CARD_GAP / 2,
        },
        card: {
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          position: 'relative',
          overflow: 'hidden',
        },
        cardCompleted: {
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 16,
          borderWidth: 2,
          borderColor: colors.success,
          position: 'relative',
          overflow: 'hidden',
        },
        completedOverlay: {
          position: 'absolute',
          top: 0,
          right: 0,
          backgroundColor: colors.success,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderBottomLeftRadius: 12,
        },
        completedOverlayText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        cardHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 8,
        },
        cardServiceType: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
          marginLeft: 4,
        },
        cardCounter: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          marginTop: 4,
        },
        cardReward: {
          fontSize: 12,
          color: colors.primary,
          marginTop: 10,
          fontStyle: 'italic',
        },
        cyclesText: {
          fontSize: 12,
          color: colors.foregroundMuted,
          marginTop: 6,
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 40,
        },
        emptyText: {
          fontSize: 16,
          color: colors.foregroundMuted,
          textAlign: 'center',
          marginTop: 12,
        },
      }),
    [colors],
  );

  if (loading) {
    return (<ScreenContainer><SkeletonLoader colors={colors} /></ScreenContainer>);
  }

  const renderCard = ({ item }: { item: StampCard }) => (
    <View style={styles.cardWrapper}>
      <View style={item.completed ? styles.cardCompleted : styles.card}>
        {item.completed && (
          <View style={styles.completedOverlay}>
            <Text style={styles.completedOverlayText}>
              {t('loyalty.stamps.completed')}
            </Text>
          </View>
        )}
        <View style={styles.cardHeader}>
          <IconButton
            icon={SERVICE_TYPE_ICONS[item.service_type] || 'store'}
            size={20}
            iconColor={item.completed ? colors.success : colors.primary}
            style={{ margin: 0 }}
          />
          <Text style={styles.cardServiceType}>
            {getServiceTypeLabel(item.service_type)}
          </Text>
        </View>
        <Text style={styles.cardCounter}>
          {t('loyalty.stamps.earned', {
            count: item.current_stamps.toString(),
          })}{' '}
          {t('loyalty.stamps.required', {
            count: item.required_stamps.toString(),
          })}
        </Text>
        <StampGrid
          total={item.required_stamps}
          filled={item.current_stamps}
          completed={item.completed}
          colors={colors}
        />
        {item.reward_description ? (
          <Text style={styles.cardReward}>
            {t('loyalty.stamps.reward')}: {item.reward_description}
          </Text>
        ) : null}
        {item.completed_cycles > 0 && (
          <Text style={styles.cyclesText}>
            {t('loyalty.stamps.completedCycles', {
              count: item.completed_cycles.toString(),
            })}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {t('loyalty.stamps.title')}
        </Text>
      </View>
      <FlatList
        data={stampCards}
        renderItem={renderCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        getItemLayout={(_, index) => ({
          length: 180,
          offset: 180 * index,
          index,
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconButton
              icon="cards-outline"
              size={64}
              iconColor={colors.foregroundMuted}
              accessibilityLabel="No stamp cards"
            />
            <Text style={styles.emptyText}>
              {t('loyalty.detail.emptyMessage')}
            </Text>
          </View>
        }
      />
    </View>
  
    </ScreenContainer>
  );
}
