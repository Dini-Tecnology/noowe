import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { SelectChip, SelectionSection } from '../../components/restaurant/SelectionControls';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { FeatureUnavailableMessage } from '../../components/ServiceTypeAdapter';
import customerBackend, { type CustomerWaitlistEntry, type WaitlistOccupancyLevel } from '../../services/customer-backend';
import { StateView, rootNavigate, useQueryRefreshControl } from './shared';

const PARTY_SIZES = ['1', '2', '3', '4', '5+'] as const;
const PREFERENCES = [
  { id: 'salao', label: 'Salão' },
  { id: 'terraco', label: 'Terraço' },
  { id: 'qualquer', label: 'Qualquer' },
] as const;

const OCCUPANCY_LABELS: Record<WaitlistOccupancyLevel, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  indisponivel: 'Indisponível',
};

const OCCUPANCY_COLORS: Record<WaitlistOccupancyLevel, string> = {
  baixa: '#16A34A',
  media: '#D97706',
  alta: '#DC2626',
  indisponivel: '#94A3B8',
};

const RING_SIZE = 116;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** A purely decorative progress ring — there's no reliable "queue depth" to
 * measure real progress against, so it frames the position, it doesn't
 * claim to plot it precisely. */
function PositionRing({ position, colors }: { position: number; colors: ReturnType<typeof useColors> }) {
  const progress = 0.72;
  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          stroke={colors.backgroundTertiary} strokeWidth={RING_STROKE} fill="none"
        />
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          stroke={colors.primary} strokeWidth={RING_STROKE} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE * progress} ${RING_CIRCUMFERENCE}`}
        />
      </Svg>
      <Text style={{ fontSize: 30, fontWeight: '800', color: colors.foreground }}>{position}º</Text>
      <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>na fila</Text>
    </View>
  );
}

export default function WaitlistScreen({ route, navigation }: any) {
  const colors = useColors();
  const visit = useVisitSession();
  const queryClient = useQueryClient();
  const [party, setParty] = useState('2');
  const [preference, setPreference] = useState<string>('qualquer');
  const restaurantId = route.params?.restaurantId ?? visit.session?.restaurantId;
  const { status: serviceTypeStatus, features } = useServiceTypeFor(restaurantId);
  const virtualQueueEnabled = features.virtualQueue;

  const query = useQuery({ queryKey: ['waitlist'], queryFn: () => customerBackend.listMyWaitlist() });
  const refreshControl = useQueryRefreshControl([query]);
  const restaurantQuery = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => customerBackend.getRestaurant(restaurantId),
    enabled: !!restaurantId,
  });
  const statsQuery = useQuery({
    queryKey: ['waitlist-stats', restaurantId],
    queryFn: () => customerBackend.getWaitlistStats(restaurantId),
    enabled: !!restaurantId && virtualQueueEnabled,
    refetchInterval: 20_000,
  });

  const myEntry: CustomerWaitlistEntry | undefined = useMemo(
    () => (query.data ?? []).find((entry) => entry.restaurantId === restaurantId && entry.status !== 'cancelled' && entry.status !== 'no_show'),
    [query.data, restaurantId],
  );

  const join = useMutation({
    mutationFn: () => customerBackend.joinWaitlist({ restaurantId, partySize: party === '5+' ? 5 : Number(party), preference }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats', restaurantId] });
    },
    onError: (error: Error) => Alert.alert('Fila', error.message),
  });
  const update = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'arrive' }) => customerBackend.updateWaitlist(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats', restaurantId] });
    },
  });
  const toggleKids = useMutation({
    mutationFn: ({ id, hasKids }: { id: string; hasKids: boolean }) => customerBackend.setWaitlistHasKids(id, hasKids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
    onError: (error: Error) => Alert.alert('Modo Família', error.message),
  });

  const openMenu = () => rootNavigate(navigation, 'Menu', { restaurantId });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
        summaryCard: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundTertiary, marginBottom: 20,
        },
        summaryIcon: {
          width: 44, height: 44, borderRadius: 14, backgroundColor: `${colors.primary}1A`,
          alignItems: 'center', justifyContent: 'center',
        },
        summaryName: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        summarySub: { fontSize: 13, color: colors.foregroundSecondary, marginTop: 2 },
        summarySubHighlight: { fontWeight: '700' },
        statusBlock: { alignItems: 'center', marginBottom: 20 },
        statusSub: { fontSize: 14, color: colors.foregroundSecondary, marginTop: 8 },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        prefRow: { flexDirection: 'row', gap: 10 },
        prefChip: { flex: 1 },
        sectionLoader: { marginVertical: 32 },
        cta: { marginTop: 8, marginBottom: 24, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
        pillsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
        pill: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: colors.backgroundTertiary, gap: 4 },
        pillValue: { fontSize: 13, fontWeight: '700', color: colors.foreground },
        pillLabel: { fontSize: 11, color: colors.foregroundSecondary },
        whileWaitCard: {
          borderRadius: 18, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: colors.backgroundSecondary,
          padding: 14, marginBottom: 16,
        },
        whileWaitTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
        whileWaitTitleText: { fontSize: 13, fontWeight: '700', color: colors.foreground },
        actionRow: {
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
        },
        actionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
        actionTitle: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        actionSub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 1 },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
        familyRow: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 16,
        },
        familyTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        familySub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        familyBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.primary },
        familyBtnActive: { backgroundColor: colors.success },
        familyBtnText: { fontSize: 13, fontWeight: '700', color: colors.primaryForeground },
        readyBanner: {
          alignItems: 'center', gap: 8, paddingVertical: 20, borderRadius: 18,
          backgroundColor: colors.successBackground, marginBottom: 16,
        },
        readyText: { fontSize: 15, fontWeight: '700', color: colors.success },
        readySub: { fontSize: 13, color: colors.foregroundSecondary },
        leaveBtn: { alignItems: 'center', paddingVertical: 14 },
        leaveBtnText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
        entryCard: { padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 12, gap: 6 },
        position: { fontSize: 18, fontWeight: '800', color: colors.foreground },
        meta: { fontSize: 13, color: colors.foregroundSecondary },
      }),
    [colors],
  );

  const otherEntries = (query.data ?? []).filter((entry) => entry.id !== myEntry?.id);

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        alwaysBounceVertical
      >
        {!restaurantId || serviceTypeStatus === 'idle' ? (
          <StateView empty="Escolha um restaurante para entrar na fila." emptyIcon="restaurant-outline" />
        ) : serviceTypeStatus === 'loading' ? (
          <ActivityIndicator color={colors.primary} style={styles.sectionLoader} />
        ) : !virtualQueueEnabled ? (
          <FeatureUnavailableMessage feature="Fila de Espera" />
        ) : myEntry ? (
          <>
            {myEntry.status === 'called' && (
              <View style={styles.readyBanner}>
                <Ionicons name="notifications" size={28} color={colors.success} />
                <Text style={styles.readyText}>Sua mesa está pronta!</Text>
                <Text style={styles.readySub}>
                  {myEntry.tableNumber ? `Mesa ${myEntry.tableNumber} · ` : ''}Dirija-se à recepção
                </Text>
              </View>
            )}

            <View style={styles.statusBlock}>
              <PositionRing position={myEntry.position} colors={colors} />
              <Text style={styles.statusSub}>
                Estimativa: {myEntry.estimatedWaitMinutes != null ? `~${myEntry.estimatedWaitMinutes} min` : '—'}
              </Text>
            </View>

            <View style={styles.pillsRow}>
              <View style={styles.pill}>
                <Ionicons name="people-outline" size={16} color={colors.foregroundSecondary} />
                <Text style={styles.pillValue}>{myEntry.partySize}</Text>
                <Text style={styles.pillLabel}>Pessoas</Text>
              </View>
              <View style={styles.pill}>
                <Ionicons name="restaurant-outline" size={16} color={colors.foregroundSecondary} />
                <Text style={styles.pillValue}>{myEntry.tableNumber ?? 'A definir'}</Text>
                <Text style={styles.pillLabel}>Mesa</Text>
              </View>
              <View style={styles.pill}>
                <Ionicons name="time-outline" size={16} color={colors.foregroundSecondary} />
                <Text style={styles.pillValue}>{myEntry.status === 'called' ? 'Chamado' : 'Na fila'}</Text>
                <Text style={styles.pillLabel}>Status</Text>
              </View>
            </View>

            <View style={styles.whileWaitCard}>
              <View style={styles.whileWaitTitle}>
                <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                <Text style={styles.whileWaitTitleText}>Enquanto espera:</Text>
              </View>
              <TouchableOpacity style={styles.actionRow} onPress={openMenu} accessibilityRole="button">
                <View style={styles.actionIcon}>
                  <Ionicons name="beer-outline" size={17} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>Pedir drinks e aperitivos</Text>
                  <Text style={styles.actionSub}>Vai direto pra sua comanda</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.foregroundMuted} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.actionRow} onPress={openMenu} accessibilityRole="button">
                <View style={styles.actionIcon}>
                  <Ionicons name="reader-outline" size={17} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>Ver cardápio e favoritar</Text>
                  <Text style={styles.actionSub}>Adiante seu pedido</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.foregroundMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.familyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.familyTitle}>Modo Família</Text>
                <Text style={styles.familySub}>Cardápio kids, cadeirão e atividades</Text>
              </View>
              <TouchableOpacity
                style={[styles.familyBtn, myEntry.hasKids && styles.familyBtnActive]}
                onPress={() => toggleKids.mutate({ id: myEntry.id, hasKids: !myEntry.hasKids })}
                disabled={toggleKids.isPending}
                accessibilityRole="button"
                accessibilityState={{ selected: myEntry.hasKids }}
              >
                <Text style={styles.familyBtnText}>{myEntry.hasKids ? 'Ativado' : 'Ativar'}</Text>
              </TouchableOpacity>
            </View>

            {myEntry.status === 'waiting' && (
              <TouchableOpacity
                style={styles.leaveBtn}
                onPress={() => update.mutate({ id: myEntry.id, action: 'cancel' })}
                accessibilityRole="button"
              >
                <Text style={styles.leaveBtnText}>Sair da fila</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {restaurantQuery.data && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryIcon}>
                  <Ionicons name="restaurant" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryName}>{restaurantQuery.data.name}</Text>
                  {statsQuery.data && statsQuery.data.occupancyLevel !== 'indisponivel' && (
                    <Text style={styles.summarySub}>
                      Lotação atual:{' '}
                      <Text style={[styles.summarySubHighlight, { color: OCCUPANCY_COLORS[statsQuery.data.occupancyLevel] }]}>
                        {OCCUPANCY_LABELS[statsQuery.data.occupancyLevel]}
                      </Text>
                    </Text>
                  )}
                </View>
              </View>
            )}

            <SelectionSection title="Quantas pessoas?">
              <View style={styles.chipRow}>
                {PARTY_SIZES.map((n) => (
                  <SelectChip key={n} label={n} selected={party === n} onPress={() => setParty(n)} />
                ))}
              </View>
            </SelectionSection>

            <SelectionSection title="Preferência">
              <View style={styles.prefRow}>
                {PREFERENCES.map((pref) => (
                  <View key={pref.id} style={styles.prefChip}>
                    <SelectChip label={pref.label} selected={preference === pref.id} onPress={() => setPreference(pref.id)} />
                  </View>
                ))}
              </View>
            </SelectionSection>

            <TouchableOpacity
              style={[styles.cta, join.isPending && styles.ctaDisabled]}
              onPress={() => join.mutate()}
              disabled={join.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{join.isPending ? 'Entrando...' : 'Entrar na Fila Virtual'}</Text>
            </TouchableOpacity>
          </>
        )}

        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />

        {otherEntries.map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <Text style={styles.position}>Posição {entry.position}</Text>
            <Text style={styles.meta}>
              {entry.partySize} pessoas · {entry.status}{entry.estimatedWaitMinutes ? ` · ~${entry.estimatedWaitMinutes} min` : ''}
            </Text>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
