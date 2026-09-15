/* Hallmark · macrostructure: Stat-Led · genre: modern-minimal · theme: studied-DNA (user reference) + Noowe tokens · enrichment: none · designed-as-app · pre-emit critique: P5 H5 E4 S5 R4 V5 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { StateView, useQueryRefreshControl } from './shared';

const ORANGE = '#FF4B22';
const ORANGE_DARK = '#F2360C';
const SUCCESS = '#18A865';

const LEVELS = [
  { name: 'Silver', threshold: 0 },
  { name: 'Gold', threshold: 500 },
  { name: 'Platinum', threshold: 2000 },
  { name: 'Black', threshold: 5000 },
] as const;

const REWARDS: {
  code: string;
  title: string;
  pointsCost: number;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { code: 'dessert', title: 'Sobremesa grátis', pointsCost: 500, icon: 'ice-cream-outline' },
  { code: 'house_drink', title: 'Drink da casa', pointsCost: 800, icon: 'wine-outline' },
  { code: 'premium_starter', title: 'Entrada premium', pointsCost: 1200, icon: 'leaf-outline' },
  { code: 'dinner_for_two', title: 'Jantar para 2', pointsCost: 3000, icon: 'restaurant-outline' },
];

const formatPoints = (value: number) => Math.round(value).toLocaleString('pt-BR');
const formatHistoryDate = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
};

export default function LoyaltyScreen({ navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const programsQuery = useQuery({ queryKey: ['loyalty'], queryFn: () => customerBackend.listLoyalty() });
  const ordersQuery = useQuery({ queryKey: ['orders', 'loyalty-history'], queryFn: () => customerBackend.listOrders(50) });
  const refreshControl = useQueryRefreshControl([programsQuery, ordersQuery]);
  const programs = programsQuery.data ?? [];
  const program = programs.find((item) => item.id === selectedProgramId) ?? programs[0];
  const points = Math.round(program?.points ?? 0);
  const levelIndex = LEVELS.reduce((current, item, index) => points >= item.threshold ? index : current, 0);
  const level = LEVELS[levelIndex];
  const nextLevel = LEVELS[levelIndex + 1];
  const pointsToNext = nextLevel ? Math.max(0, nextLevel.threshold - points) : 0;
  const progress = nextLevel
    ? Math.min(1, Math.max(0, (points - level.threshold) / (nextLevel.threshold - level.threshold)))
    : 1;

  const redeem = useMutation({
    mutationFn: (rewardCode: string) => {
      if (!program) throw new Error('Programa de fidelidade indisponível.');
      return customerBackend.redeemLoyaltyReward(program.id, rewardCode);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['loyalty'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-wallet'] }),
      ]);
      Alert.alert('Recompensa resgatada', 'Ela já está vinculada à sua conta e pronta para uso.');
    },
    onError: (error: Error) => Alert.alert('Não foi possível resgatar', error.message),
  });

  const history = useMemo(() => {
    if (!program) return [];
    const visits = (ordersQuery.data?.data ?? [])
      .filter((order) => order.restaurantId === program.restaurantId && ['completed', 'delivered'].includes(order.status))
      .map((order) => ({
        id: `order:${order.id}`,
        title: `Visita ao ${program.restaurantName}`,
        date: order.createdAt,
        points: Math.max(1, Math.floor(order.total)),
      }));
    const redemptions = program.claimedRewards.map((claim, index) => ({
      id: `claim:${claim.code}:${claim.createdAt}:${index}`,
      title: `Resgate: ${claim.title}`,
      date: claim.createdAt,
      points: -claim.pointsCost,
    }));
    return [...visits, ...redemptions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }, [ordersQuery.data, program]);

  const confirmRedeem = (reward: typeof REWARDS[number]) => {
    if (!program || points < reward.pointsCost || redeem.isPending) return;
    Alert.alert(
      'Resgatar recompensa?',
      `${reward.title} por ${formatPoints(reward.pointsCost)} pontos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Resgatar', onPress: () => redeem.mutate(reward.code) },
      ],
    );
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 22, paddingBottom: 44 },
    header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: colors.foreground },
    headerSpacer: { width: 34 },
    hero: { minHeight: 186, borderRadius: 21, padding: 23, overflow: 'hidden', justifyContent: 'flex-end' },
    heroCircle: { position: 'absolute', width: 132, height: 132, right: -26, top: -68, borderRadius: 66, backgroundColor: 'rgba(255,255,255,0.14)' },
    heroLabel: { marginTop: 14, color: '#FFE8E1', fontSize: 12, letterSpacing: 0.45 },
    heroPoints: { marginTop: 3, color: '#FFFFFF', fontSize: 37, lineHeight: 44, fontWeight: '900', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
    heroNext: { marginTop: 5, marginBottom: 13, color: '#FFE8E1', fontSize: 12 },
    progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.33)' },
    progressBar: { height: '100%', borderRadius: 3, backgroundColor: '#FFFFFF' },
    programStrip: { marginTop: 12, marginHorizontal: -22 },
    programContent: { paddingHorizontal: 22, gap: 8 },
    programChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.backgroundTertiary },
    programChipActive: { backgroundColor: '#FFF5E6', borderWidth: 1, borderColor: '#F59E0B' },
    programText: { color: colors.foregroundSecondary, fontSize: 11, fontWeight: '700' },
    programTextActive: { color: colors.foreground },
    tiers: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 23 },
    tier: { flex: 1, minHeight: 33, borderRadius: 11, backgroundColor: colors.backgroundTertiary, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    tierActive: { backgroundColor: '#FFF5E6', borderColor: '#F59E0B' },
    tierText: { color: colors.foregroundMuted, fontSize: 10, fontWeight: '700' },
    tierTextActive: { color: colors.foreground },
    sectionTitle: { marginBottom: 12, fontSize: 15, fontWeight: '800', color: colors.foreground },
    rewardRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
    rewardIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
    rewardInfo: { flex: 1, minWidth: 0 },
    rewardTitle: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
    rewardPoints: { marginTop: 3, color: colors.foregroundSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
    redeemButton: { minWidth: 76, minHeight: 36, paddingHorizontal: 13, borderRadius: 13, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
    redeemDisabled: { backgroundColor: colors.backgroundTertiary },
    redeemText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    redeemDisabledText: { color: colors.foregroundMuted },
    historySection: { marginTop: 25 },
    historyRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    historyInfo: { flex: 1, minWidth: 0 },
    historyTitle: { color: colors.foreground, fontSize: 13 },
    historyDate: { marginTop: 3, color: colors.foregroundSecondary, fontSize: 11 },
    historyPoints: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
    emptyHistory: { paddingVertical: 18, color: colors.foregroundSecondary, fontSize: 12 },
  }), [colors]);

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Fidelidade</Text>
          <View style={styles.headerSpacer} />
        </View>

        <StateView
          loading={programsQuery.isLoading}
          error={programsQuery.error}
          onRetry={() => programsQuery.refetch()}
          empty={!programsQuery.isLoading && !programsQuery.error && programs.length === 0 ? 'Você ainda não acumulou pontos.' : undefined}
          emptyIcon="ribbon-outline"
        />

        {program ? (
          <>
            <LinearGradient colors={[ORANGE, ORANGE_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.heroCircle} />
              <Ionicons name="trophy-outline" size={27} color="#FFFFFF" />
              <Text style={styles.heroLabel}>SEUS PONTOS</Text>
              <Text style={styles.heroPoints}>{formatPoints(points)}</Text>
              <Text style={styles.heroNext}>
                {nextLevel ? `Nível: ${level.name} · próximo nível em ${formatPoints(pointsToNext)} pts` : 'Nível: Black · nível máximo alcançado'}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${Math.max(4, progress * 100)}%` }]} />
              </View>
            </LinearGradient>

            {programs.length > 1 ? (
              <ScrollView horizontal style={styles.programStrip} contentContainerStyle={styles.programContent} showsHorizontalScrollIndicator={false}>
                {programs.map((item) => {
                  const active = item.id === program.id;
                  return (
                    <TouchableOpacity key={item.id} style={[styles.programChip, active && styles.programChipActive]} onPress={() => setSelectedProgramId(item.id)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                      <Text style={[styles.programText, active && styles.programTextActive]}>{item.restaurantName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.tiers}>
              {LEVELS.map((item) => {
                const active = item.name === level.name;
                return (
                  <View key={item.name} style={[styles.tier, active && styles.tierActive]}>
                    <Text style={[styles.tierText, active && styles.tierTextActive]}>{item.name}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Recompensas</Text>
            {REWARDS.map((reward) => {
              const available = points >= reward.pointsCost;
              const pending = redeem.isPending && redeem.variables === reward.code;
              return (
                <View key={reward.code} style={styles.rewardRow}>
                  <View style={styles.rewardIcon}><Ionicons name={reward.icon} size={19} color={ORANGE} /></View>
                  <View style={styles.rewardInfo}>
                    <Text style={styles.rewardTitle}>{reward.title}</Text>
                    <Text style={styles.rewardPoints}>{formatPoints(reward.pointsCost)} pontos</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.redeemButton, !available && styles.redeemDisabled]}
                    onPress={() => confirmRedeem(reward)}
                    disabled={!available || redeem.isPending}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !available || redeem.isPending }}
                    accessibilityLabel={`${available ? 'Resgatar' : 'Faltam pontos para'} ${reward.title}`}
                  >
                    {pending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                      <Text style={[styles.redeemText, !available && styles.redeemDisabledText]}>
                        {available ? 'Resgatar' : `${formatPoints(reward.pointsCost - points)} pts`}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}

            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>Histórico</Text>
              {ordersQuery.isLoading ? <ActivityIndicator color={ORANGE} /> : history.length ? history.map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <View style={styles.historyInfo}>
                    <Text numberOfLines={1} style={styles.historyTitle}>{item.title}</Text>
                    <Text style={styles.historyDate}>{formatHistoryDate(item.date)}</Text>
                  </View>
                  <Text style={[styles.historyPoints, { color: item.points >= 0 ? SUCCESS : colors.foregroundSecondary }]}>
                    {item.points >= 0 ? '+' : '−'}{formatPoints(Math.abs(item.points))}
                  </Text>
                </View>
              )) : <Text style={styles.emptyHistory}>Seu histórico de pontos aparecerá aqui.</Text>}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
