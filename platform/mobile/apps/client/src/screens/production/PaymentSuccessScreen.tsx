/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: green */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import type { TableCheckoutResult } from '../../services/customer-backend';
import { money } from './shared';

const FAMILY_TIER_LABELS: Record<string, string> = {
  bronze: 'Família Bronze',
  silver: 'Família Prata',
  gold: 'Família Ouro',
};

export default function PaymentSuccessScreen({ route, navigation }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const result: TableCheckoutResult = route?.params?.result;
  const restaurantName: string | undefined = route?.params?.restaurantName;
  const paidAmount: number = route?.params?.paidAmount ?? result?.charged ?? 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingBottom: 40, alignItems: 'center' },
        successCircle: {
          width: 88, height: 88, borderRadius: 44, backgroundColor: colors.successBackground,
          alignItems: 'center', justifyContent: 'center', marginTop: 32, marginBottom: 20,
        },
        title: { fontSize: 24, fontWeight: '800', color: colors.foreground, textAlign: 'center' },
        subtitle: { fontSize: 14, color: colors.foregroundSecondary, marginTop: 6, marginBottom: 24, textAlign: 'center' },
        card: {
          width: '100%', borderRadius: 18, padding: 16, backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 10, marginBottom: 16,
        },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        rowLabel: { fontSize: 13, color: colors.foregroundSecondary },
        rowValue: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        rowValueGreen: { fontSize: 15, fontWeight: '700', color: colors.success },
        rewardCard: {
          width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: '#FFF3EE', marginBottom: 12,
        },
        rewardIcon: {
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE1D3',
        },
        rewardTitle: { fontSize: 13, fontWeight: '700', color: colors.primary },
        rewardSub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        badgeRow: {
          width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundTertiary, marginBottom: 24,
        },
        badgeText: { fontSize: 13, fontWeight: '600', color: colors.foreground, flex: 1 },
        receiptLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
        receiptLinkText: { fontSize: 14, fontWeight: '700', color: colors.primary },
        cta: { width: '100%', paddingVertical: 17, borderRadius: 18, alignItems: 'center', backgroundColor: colors.primary },
        ctaText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={44} color={colors.success} />
        </View>
        <Text style={styles.title}>Pagamento Confirmado!</Text>
        <Text style={styles.subtitle}>{restaurantName ?? 'O restaurante'} agradece sua visita</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Pago por você</Text>
            <Text style={styles.rowValue}>{money(paidAmount)}</Text>
          </View>
          {result?.tableTotalCount != null && result.tableTotalCount > 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Status mesa</Text>
              <Text style={styles.rowValueGreen}>
                {result.tablePaidCount}/{result.tableTotalCount} pagaram
              </Text>
            </View>
          )}
        </View>

        {result?.pointsAwarded > 0 && (
          <View style={styles.rewardCard}>
            <View style={styles.rewardIcon}>
              <Ionicons name="gift-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardTitle}>+{result.pointsAwarded} pontos ganhos!</Text>
              {result.visitsUntilNextReward != null && (
                <Text style={styles.rewardSub}>
                  {result.visitsUntilNextReward === 5
                    ? 'Sobremesa kids grátis resgatada nesta visita!'
                    : `Próxima sobremesa kids grátis em ${result.visitsUntilNextReward} visita${result.visitsUntilNextReward > 1 ? 's' : ''}`}
                </Text>
              )}
            </View>
          </View>
        )}

        {result?.familyTier && (
          <View style={styles.badgeRow}>
            <Ionicons name="trophy-outline" size={20} color={colors.primary} />
            <Text style={styles.badgeText}>
              Selo de família ganho! Nível: {FAMILY_TIER_LABELS[result.familyTier] ?? result.familyTier}
            </Text>
          </View>
        )}

        {result?.receiptId && (
          <TouchableOpacity
            style={styles.receiptLink}
            onPress={() => navigation.navigate('DigitalReceipt', { receiptId: result.receiptId })}
            accessibilityRole="button"
          >
            <Ionicons name="receipt-outline" size={16} color={colors.primary} />
            <Text style={styles.receiptLinkText}>Ver recibo digital</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.cta}
          onPress={() => navigation.navigate('Review', {
            orderId: result?.orderId ?? null,
            restaurantId: result?.restaurantId,
            restaurantName,
          })}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Avaliar Experiência</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
