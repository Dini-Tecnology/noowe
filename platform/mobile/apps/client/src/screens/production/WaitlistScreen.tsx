import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { SelectChip, SelectionSection } from '../../components/restaurant/SelectionControls';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';
import { StateView } from './shared';

const PARTY_SIZES = ['1', '2', '3', '4', '5+'] as const;

export default function WaitlistScreen({ route }: any) {
  const colors = useColors();
  const visit = useVisitSession();
  const queryClient = useQueryClient();
  const [party, setParty] = useState('2');
  const restaurantId = route.params?.restaurantId ?? visit.session?.restaurantId;

  const query = useQuery({ queryKey: ['waitlist'], queryFn: () => customerBackend.listMyWaitlist() });
  const join = useMutation({
    mutationFn: () => customerBackend.joinWaitlist({ restaurantId, partySize: party === '5+' ? 5 : Number(party) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
    onError: (error: Error) => Alert.alert('Fila', error.message),
  });
  const update = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'arrive' }) => customerBackend.updateWaitlist(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
        title: { fontSize: 22, fontWeight: '700', color: colors.foreground, marginBottom: 16 },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        cta: { marginTop: 8, marginBottom: 24, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
        entryCard: { padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 12, gap: 6 },
        position: { fontSize: 18, fontWeight: '800', color: colors.foreground },
        meta: { fontSize: 13, color: colors.foregroundSecondary },
        actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
        actionBtn: { fontSize: 13, fontWeight: '700', color: colors.primary },
        cancelBtn: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Fila de Espera</Text>

        <SelectionSection title="Quantas pessoas?">
          <View style={styles.chipRow}>
            {PARTY_SIZES.map((n) => (
              <SelectChip key={n} label={n} selected={party === n} onPress={() => setParty(n)} />
            ))}
          </View>
        </SelectionSection>

        <TouchableOpacity
          style={[styles.cta, (!restaurantId || join.isPending) && styles.ctaDisabled]}
          onPress={() => join.mutate()}
          disabled={!restaurantId || join.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{join.isPending ? 'Entrando...' : 'Entrar na Fila'}</Text>
        </TouchableOpacity>

        <StateView
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={query.data?.length === 0 ? 'Você não está em nenhuma fila.' : undefined}
          emptyIcon="timer-outline"
        />

        {(query.data ?? []).map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <Text style={styles.position}>Posição {entry.position}</Text>
            <Text style={styles.meta}>
              {entry.partySize} pessoas · {entry.status}{entry.estimatedWaitMinutes ? ` · ~${entry.estimatedWaitMinutes} min` : ''}
            </Text>
            {entry.status === 'waiting' && (
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => update.mutate({ id: entry.id, action: 'arrive' })} accessibilityRole="button">
                  <Text style={styles.actionBtn}>Cheguei</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => update.mutate({ id: entry.id, action: 'cancel' })} accessibilityRole="button">
                  <Text style={styles.cancelBtn}>Sair da fila</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
