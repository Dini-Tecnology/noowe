import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
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
import { StateView, rootNavigate, useQueryRefreshControl, tableLabel } from './shared';
import {
  ANY_SECTION,
  closedQueueMessage,
  isActiveWaitlistStatus,
  pastWaitlistEntries,
  waitlistErrorMessage,
  waitlistPreferenceOptions,
  waitlistStatusLabel,
} from './waitlist-ui';

const PARTY_SIZES = ['1', '2', '3', '4', '5+'] as const;

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

function formatEntryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function WaitlistScreen({ route, navigation }: any) {
  const colors = useColors();
  const visit = useVisitSession();
  const queryClient = useQueryClient();
  const [party, setParty] = useState('2');
  const [preference, setPreference] = useState<string>(ANY_SECTION);
  const restaurantId = route.params?.restaurantId ?? visit.session?.restaurantId;
  const { status: serviceTypeStatus, features, type: serviceModel } = useServiceTypeFor(restaurantId);
  const virtualQueueEnabled = features.virtualQueue;

  const query = useQuery({ queryKey: ['waitlist'], queryFn: () => customerBackend.listMyWaitlist() });
  // Same key as the restaurant page, so "Fechado" there and here never disagree.
  const liveStatus = useQuery({
    queryKey: ['restaurant-live-status', restaurantId],
    queryFn: () => customerBackend.getRestaurantLiveStatus(restaurantId),
    enabled: !!restaurantId,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
  const refreshControl = useQueryRefreshControl([query, liveStatus]);
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

  // "Preferência" = setores do mapa de mesas do restaurante, não uma lista fixa.
  const sectionsQuery = useQuery({
    queryKey: ['waitlist-sections', restaurantId],
    queryFn: () => customerBackend.getWaitlistSections(restaurantId),
    enabled: !!restaurantId && virtualQueueEnabled,
    staleTime: 5 * 60 * 1000,
  });
  const preferenceOptions = useMemo(() => waitlistPreferenceOptions(sectionsQuery.data), [sectionsQuery.data]);
  // Setor que sumiu do mapa (o restaurante mexeu nas mesas): volta para "Qualquer".
  useEffect(() => {
    if (!preferenceOptions.some((option) => option.id === preference)) setPreference(ANY_SECTION);
  }, [preferenceOptions, preference]);

  const myEntry: CustomerWaitlistEntry | undefined = useMemo(
    () => (query.data ?? []).find((entry) => entry.restaurantId === restaurantId && isActiveWaitlistStatus(entry.status)),
    [query.data, restaurantId],
  );

  // The maitre calls/seats the customer from the restaurant panel — without
  // Realtime the "Sua mesa está pronta!" banner only showed after a manual pull.
  useEffect(() => {
    if (!restaurantId) return undefined;
    let channel: { unsubscribe: () => unknown } | undefined;
    let cancelled = false;
    customerBackend.subscribeToWaitlistChanges(restaurantId, () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats', restaurantId] });
    })
      .then((value) => {
        if (cancelled) void value.unsubscribe();
        else channel = value;
      })
      .catch(() => {
        // Pull-to-refresh remains available when Realtime is temporarily offline.
      });
    return () => {
      cancelled = true;
      channel?.unsubscribe();
    };
  }, [restaurantId, queryClient]);

  // iOS suspends the Realtime socket in the background and missed events are
  // not replayed — coming back to the app must re-read the entry, or a "called"
  // status that arrived meanwhile stays hidden behind the old "Na fila".
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-live-status', restaurantId] });
    });
    return () => subscription.remove();
  }, [restaurantId, queryClient]);

  const join = useMutation({
    mutationFn: () => customerBackend.joinWaitlist({ restaurantId, partySize: party === '5+' ? 5 : Number(party), preference }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats', restaurantId] });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-live-status', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-sections', restaurantId] });
      Alert.alert('Fila Virtual', waitlistErrorMessage(error));
    },
  });
  const update = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'arrive' }) => customerBackend.updateWaitlist(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats', restaurantId] });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      Alert.alert('Não foi possível sair da fila', waitlistErrorMessage(error));
    },
  });
  const toggleKids = useMutation({
    mutationFn: ({ id, hasKids }: { id: string; hasKids: boolean }) => customerBackend.setWaitlistHasKids(id, hasKids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
    onError: (error: Error) => Alert.alert('Modo Família', waitlistErrorMessage(error)),
  });

  const confirmLeave = useCallback((entryId: string) => {
    Alert.alert(
      'Sair da fila',
      'Você perderá sua posição na fila. Deseja sair mesmo assim?',
      [
        { text: 'Continuar na fila', style: 'cancel' },
        { text: 'Sair da fila', style: 'destructive', onPress: () => update.mutate({ id: entryId, action: 'cancel' }) },
      ],
    );
  }, [update]);

  const openMenu = () => {
    if (myEntry && (serviceModel === 'fine_dining' || serviceModel === 'casual_dining')) {
      void visit.selectWaitlistJourney(restaurantId, myEntry.id, serviceModel);
    }
    rootNavigate(navigation, 'Menu', { restaurantId });
  };
  const callWaiter = () => rootNavigate(navigation, 'CallWaiter');

  // Convite para a fila. A fila é individual — cada pessoa precisa da própria
  // entrada, então o link não "gruda" convidados na entrada atual. Ele apenas
  // aponta para o mesmo restaurante para que o amigo entre na fila também.
  // O universal link noowebr.com já abre no app (app.json/associatedDomains);
  // sem app instalado, o site cai numa página que oferece o download.
  const shareInvite = useCallback(async () => {
    const name = restaurantQuery.data?.name ?? 'no restaurante';
    const url = `https://noowebr.com/r/${restaurantId}`;
    const position = myEntry?.position;
    const eta = myEntry?.estimatedWaitMinutes ?? statsQuery.data?.estimatedWaitMinutes;
    const partOne = position != null
      ? `Estou na fila do ${name} (posição ${position}º${eta != null ? `, ~${eta} min` : ''}).`
      : `Estou entrando na fila do ${name}.`;
    try {
      await Share.share({ message: `${partOne} Vem também: ${url}`, url });
    } catch (error) {
      // Share.share can throw on iOS if the user cancels — a normal case, not
      // an error worth surfacing. Anything else we surface once, without
      // retry, since re-opening the sheet automatically would fight the user.
      const message = error instanceof Error ? error.message : '';
      if (message && !/dismissed|cancel/i.test(message)) {
        Alert.alert('Não foi possível abrir o compartilhamento', message);
      }
    }
  }, [myEntry, restaurantId, restaurantQuery.data, statsQuery.data]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        header: { height: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        back: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { fontSize: 17, fontWeight: '800', color: colors.foreground },
        headerSpacer: { width: 32 },
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
        summaryCard: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundTertiary, marginBottom: 20,
        },
        summaryIcon: {
          width: 44, height: 44, borderRadius: 14, backgroundColor: `${colors.primary}1A`,
          alignItems: 'center', justifyContent: 'center',
        },
        summaryPhoto: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.backgroundSecondary },
        summaryName: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        summarySub: { fontSize: 13, color: colors.foregroundSecondary, marginTop: 2 },
        summarySubHighlight: { fontWeight: '700' },
        statusBlock: { alignItems: 'center', marginBottom: 20 },
        statusSub: { fontSize: 14, color: colors.foregroundSecondary, marginTop: 8 },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        prefRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        prefChip: { minWidth: '30%', flexGrow: 1 },
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
        closedCard: {
          alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 20, borderRadius: 18,
          backgroundColor: colors.backgroundTertiary, marginBottom: 24,
        },
        closedTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        closedSub: { fontSize: 13, lineHeight: 19, color: colors.foregroundSecondary, textAlign: 'center' },
        historyTitle: { fontSize: 13, fontWeight: '700', color: colors.foregroundSecondary, marginTop: 8, marginBottom: 10 },
        position: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        meta: { fontSize: 13, color: colors.foregroundSecondary },
        inviteBtn: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingVertical: 12, marginBottom: 16, borderRadius: 14, borderWidth: 1.5,
          borderColor: colors.primary, backgroundColor: colors.backgroundSecondary,
        },
        inviteBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
      }),
    [colors],
  );

  // The maitre's own estimate wins; until they set one, fall back to the
  // restaurant-wide estimate the server already computes for the queue.
  // The queue only takes new entries while the restaurant is open. The server
  // enforces it (customer_join_waitlist); this just avoids offering a form that
  // can only fail. An unknown status doesn't block — the server has the final word.
  const restaurantClosed = liveStatus.data?.isOpen === false;

  const entryWaitMinutes = myEntry?.estimatedWaitMinutes ?? statsQuery.data?.estimatedWaitMinutes ?? null;

  // Past entries in this restaurant's queue only — other restaurants' history
  // has no context here and an "active" entry elsewhere is shown on its own page.
  const pastEntries = pastWaitlistEntries(query.data, restaurantId);

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fila de espera</Text>
        <View style={styles.headerSpacer} />
      </View>
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
                  {myEntry.tableNumber ? `${tableLabel(myEntry.tableNumber)} · ` : ''}Dirija-se à recepção
                </Text>
              </View>
            )}

            <View style={styles.statusBlock}>
              <PositionRing position={myEntry.position} colors={colors} />
              <Text style={styles.statusSub}>
                Estimativa: {entryWaitMinutes != null ? `~${entryWaitMinutes} min` : '—'}
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
                <Text style={styles.pillValue}>{waitlistStatusLabel(myEntry.status)}</Text>
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
              {features.callWaiter && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity style={styles.actionRow} onPress={callWaiter} accessibilityRole="button">
                    <View style={styles.actionIcon}>
                      <Ionicons name="hand-left-outline" size={17} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionTitle}>Chamar Garçom</Text>
                      <Text style={styles.actionSub}>Tire dúvidas sem perder a vez</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.foregroundMuted} />
                  </TouchableOpacity>
                </>
              )}
            </View>

            <TouchableOpacity
              style={styles.inviteBtn}
              onPress={shareInvite}
              accessibilityRole="button"
              accessibilityLabel="Convidar alguém para a fila"
            >
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={styles.inviteBtnText}>Convidar alguém para a fila</Text>
            </TouchableOpacity>

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

            <TouchableOpacity
              style={[styles.leaveBtn, update.isPending && styles.ctaDisabled]}
              onPress={() => confirmLeave(myEntry.id)}
              disabled={update.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.leaveBtnText}>{update.isPending ? 'Saindo...' : 'Sair da fila'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {restaurantQuery.data && (
              <View style={styles.summaryCard}>
                {restaurantQuery.data.bannerUrl || restaurantQuery.data.logoUrl ? (
                  <Image source={{ uri: restaurantQuery.data.bannerUrl || restaurantQuery.data.logoUrl || undefined }} style={styles.summaryPhoto} resizeMode="cover" />
                ) : (
                  <View style={styles.summaryIcon}>
                    <Ionicons name="restaurant" size={22} color={colors.primary} />
                  </View>
                )}
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

            {restaurantClosed ? (
              <View style={styles.closedCard}>
                <Ionicons name="moon-outline" size={26} color={colors.foregroundSecondary} />
                <Text style={styles.closedTitle}>Restaurante fechado agora</Text>
                <Text style={styles.closedSub}>{closedQueueMessage(liveStatus.data?.opensAt ?? null)}</Text>
              </View>
            ) : (
              <>
                <SelectionSection title="Quantas pessoas?">
                  <View style={styles.chipRow}>
                    {PARTY_SIZES.map((n) => (
                      <SelectChip key={n} label={n} selected={party === n} onPress={() => setParty(n)} />
                    ))}
                  </View>
                </SelectionSection>

                <SelectionSection title="Preferência">
                  <View style={styles.prefRow}>
                    {preferenceOptions.map((pref) => (
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
          </>
        )}

        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />

        {virtualQueueEnabled && !myEntry && pastEntries.length > 0 && (
          <>
            <Text style={styles.historyTitle}>Histórico nesta fila</Text>
            {pastEntries.map((entry) => (
              <View key={entry.id} style={styles.entryCard}>
                <Text style={styles.position}>{waitlistStatusLabel(entry.status)}</Text>
                <Text style={styles.meta}>
                  {formatEntryDate(entry.createdAt)} · {entry.partySize} {entry.partySize === 1 ? 'pessoa' : 'pessoas'}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
