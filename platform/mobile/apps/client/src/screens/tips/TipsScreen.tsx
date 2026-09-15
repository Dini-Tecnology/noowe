import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Card, IconButton, ActivityIndicator, FAB, Chip } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { ptBR as dateFnsPtBR } from 'date-fns/locale';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

interface Tip {
  id: string;
  order_id: string;
  amount: number;
  payment_method: string;
  restaurant_id: string;
  created_at: string;
  order?: {
    order_number?: string;
    restaurant?: {
      name: string;
    };
  };
}

export default function TipsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalTips, setTotalTips] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      loadTips();
    }, [])
  );

  const loadTips = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getMyTips();
      setTips(data.tips || data);
      setTotalTips(data.total || data.reduce((sum: number, tip: Tip) => sum + Number(tip.amount), 0));
    } catch (error) {
      console.error(error);
      setTips([]);
      setTotalTips(0);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTips();
    setRefreshing(false);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryCard: {
      margin: 16,
      marginBottom: 8,
      elevation: 2,
      backgroundColor: colors.card,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    summaryText: {
      flex: 1,
      marginLeft: 8,
    },
    summaryLabel: {
      color: colors.foregroundSecondary,
    },
    summaryAmount: {
      color: colors.success,
      fontWeight: 'bold',
    },
    listContent: {
      padding: 16,
      paddingTop: 8,
    },
    card: {
      marginBottom: 16,
      elevation: 2,
      backgroundColor: colors.card,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    headerLeft: {
      flex: 1,
      marginRight: 8,
    },
    orderNumber: {
      color: colors.foregroundSecondary,
      marginTop: 4,
    },
    amount: {
      color: colors.success,
      fontWeight: 'bold',
    },
    details: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      margin: 0,
      padding: 0,
      marginRight: 4,
    },
    paymentChip: {
      height: 24,
      backgroundColor: colors.infoBackground,
    },
    chipText: {
      fontSize: 12,
      color: colors.info,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
    },
    emptyText: {
      marginTop: 16,
      textAlign: 'center',
      color: colors.foregroundSecondary,
      paddingHorizontal: 32,
    },
  });

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={styles.container} accessibilityLabel="Tips history">
      <Card style={styles.summaryCard}>
        <Card.Content>
          <View style={styles.summaryHeader}>
            <IconButton icon="cash-multiple" size={32} iconColor={colors.success} />
            <View style={styles.summaryText}>
              <Text variant="labelLarge" style={styles.summaryLabel}>
                {t('tips.totalTips')}
              </Text>
              <Text variant="displaySmall" style={styles.summaryAmount}>
                {formatCurrency(totalTips, getLanguage())}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      <FlatList
        data={tips}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 100,
          offset: 100 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconButton icon="cash-multiple" size={48} iconColor={colors.foregroundMuted} />
            <Text variant="headlineSmall" style={{ color: colors.foreground }}>{t('tips.noTipsReceived')}</Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {t('tips.tipsWillAppear')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Text variant="titleMedium" style={{ color: colors.foreground }}>
                    {item.order?.restaurant?.name || 'Restaurante'}
                  </Text>
                  <Text variant="bodySmall" style={styles.orderNumber}>
                    {t('orders.title')} #{item.order?.order_number || item.order_id.slice(0, 8)}
                  </Text>
                </View>
                <Text variant="titleLarge" style={styles.amount}>
                  {formatCurrency(item.amount, getLanguage())}
                </Text>
              </View>

              <View style={styles.details}>
                <View style={styles.detailRow}>
                  <IconButton icon="calendar" size={16} style={styles.icon} iconColor={colors.foregroundSecondary} />
                  <Text variant="bodySmall" style={{ color: colors.foregroundSecondary }}>
                    {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm', { locale: dateFnsPtBR })}
                  </Text>
                </View>
                <Chip style={styles.paymentChip} textStyle={styles.chipText} icon="credit-card">
                  {item.payment_method === 'credit_card'
                    ? t('payment.creditCard')
                    : item.payment_method === 'debit_card'
                    ? t('payment.debitCard')
                    : item.payment_method === 'pix'
                    ? t('payment.pix')
                    : t('payment.cash')}
                </Chip>
              </View>
            </Card.Content>
          </Card>
        )}
      />
    </View>
  
    </ScreenContainer>
  );
}
