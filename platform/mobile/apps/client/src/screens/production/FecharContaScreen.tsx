import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';
import { billShares, SPLIT_ERRORS } from '../../services/bill-shares';
import { useBillShares } from '../../hooks/useBillShares';
import InviteToTableSheet from '../../components/table/InviteToTableSheet';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { useTableInvitesRealtime } from '../../hooks/useTableUserInvites';
import { BILL_CALL_COOLDOWN_SECONDS, useCooldown } from '../../hooks/useCooldown';
import { money, moneyCents, StateView, tableLabel } from './shared';

export default function FecharContaScreen({ route, navigation }: any) {
  const colors = useColors();
  const { session, leaveTable } = useVisitSession();
  const tableSessionId: string | undefined = route?.params?.tableSessionId ?? session?.tableSessionId;
  const queryClient = useQueryClient();

  const bill = useQuery({
    queryKey: ['table-bill', tableSessionId],
    queryFn: () => customerBackend.getTableBill(tableSessionId!),
    enabled: !!tableSessionId,
  });
  const restaurant = useQuery({
    queryKey: ['restaurant', session?.restaurantId],
    queryFn: () => customerBackend.getRestaurant(session!.restaurantId),
    enabled: !!session?.restaurantId,
  });

  // Inviting is a capability of the restaurant, never shown unconditionally.
  const { capabilities, policies } = useServiceTypeFor(session?.restaurantId);
  const canInvite = !!capabilities && (capabilities.guestLink || capabilities.userInvite);
  const [inviteOpen, setInviteOpen] = useState(false);
  useTableInvitesRealtime(tableSessionId, canInvite && !!tableSessionId);

  // A parte de cada um vem do servidor em centavos (invariante 2); a gorjeta é escolhida na próxima tela.
  const me = bill.data?.participants.find((p) => p.isMe);
  const plan = useQuery({
    queryKey: ['bill-split-preview', tableSessionId, 'by_owner', bill.dataUpdatedAt],
    queryFn: () => billShares.preview(tableSessionId!, 'by_owner'),
    enabled: !!tableSessionId && !!bill.data?.items.length,
    retry: false,
  });
  const myShare = plan.data?.shares.find((share) => share.participantId === me?.dinerId);
  const { shares } = useBillShares(tableSessionId);
  // Parcela já criada (ou cobrança em andamento): retoma em vez de refazer a divisão.
  const myActiveShare = shares.data?.find((share) => share.participantId === me?.dinerId && (share.status === 'open' || share.status === 'pending_payment'));

  const payMine = useMutation({
    mutationFn: () => billShares.commit({ tableSessionId: tableSessionId!, mode: 'by_owner', version: plan.data!.version }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] });
      navigation.navigate('SharePayment', { tableSessionId, restaurantName: restaurant.data?.name });
    },
    onError: (error: Error & { code?: string }) => {
      Alert.alert('Não foi possível continuar', SPLIT_ERRORS[error.code ?? ''] ?? error.message);
      void plan.refetch();
    },
  });

  const finishVisit = useMutation({
    mutationFn: leaveTable,
    onSuccess: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }),
    onError: (error: Error) => Alert.alert('Não foi possível encerrar a visita', error.message),
  });

  const billCooldown = useCooldown(tableSessionId ? `bill:${tableSessionId}` : undefined, BILL_CALL_COOLDOWN_SECONDS);
  const requestClose = useMutation({
    mutationFn: () =>
      customerBackend.callWaiter({
        restaurantId: session!.restaurantId,
        tableId: session!.tableId,
        type: 'bill',
        message: `Fechar conta — total da mesa ${money(bill.data?.subtotal ?? 0)}`,
      }),
    onSuccess: () => {
      billCooldown.start();
      Alert.alert('Chamado enviado', 'A equipe foi avisada e vai preparar o fechamento da sua conta.');
    },
    onError: (error: Error) => Alert.alert('Não foi possível chamar a equipe', error.message),
  });

  const openInvite = useCallback(() => setInviteOpen(true), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        gradientHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
        headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
        backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
        headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
        headerTotalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', textAlign: 'right' },
        headerTotalValue: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', textAlign: 'right' },
        headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 14 },
        sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        inviteLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        inviteLinkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
        participantsRow: { flexDirection: 'row', gap: 10 },
        participantChip: {
          flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
          borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.backgroundSecondary,
        },
        participantAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
        participantAvatarText: { fontSize: 12, fontWeight: '700', color: colors.primaryForeground },
        participantChipText: { fontSize: 12, fontWeight: '600', color: colors.foreground },
        inviteChip: {
          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10,
          borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
        },
        inviteChipText: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary },
        itemRow: {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        },
        itemName: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        itemOwner: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        itemPrice: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 8 },
        cardTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
        summaryLabel: { fontSize: 13, color: colors.foregroundSecondary },
        summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        payRow: {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 4,
        },
        payLabel: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        payValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
        cta: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
        successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
        successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
        successTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground },
        successSub: { fontSize: 14, color: colors.foregroundSecondary, textAlign: 'center' },
        successBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, marginTop: 16 },
        successBtnText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
      }),
    [colors],
  );

  if (!tableSessionId) {
    return (
      <ScreenContainer edges={['top']}>
        <StateView empty="Nenhuma mesa aberta no momento." emptyIcon="receipt-outline" />
        <TouchableOpacity style={{ alignSelf: 'center' }} onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Voltar</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.primary, colors.primaryDark ?? colors.primary]} style={styles.gradientHeader}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTotalLabel}>Falta pagar</Text>
            <Text style={styles.headerTotalValue}>{plan.data ? moneyCents(plan.data.totalRemCents) : '—'}</Text>
          </View>
        </View>
        <Text style={styles.headerTitle}>Fechar Conta</Text>
        <Text style={styles.headerSub}>
          {tableLabel(session?.tableNumber)}{restaurant.data?.name ? ` · ${restaurant.data.name}` : ''}
        </Text>
      </LinearGradient>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StateView loading={bill.isLoading} error={bill.error} onRetry={() => bill.refetch()} />

        {bill.data && (
          <>
            <View>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Na mesa ({bill.data.participants.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.participantsRow, { marginTop: 10 }]}>
                {bill.data.participants.map((p) => (
                  <View key={p.dinerId} style={styles.participantChip}>
                    <View style={styles.participantAvatar}>
                      <Text style={styles.participantAvatarText}>{(p.isMe ? 'V' : (p.displayName ?? 'C')[0]).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.participantChipText}>
                      {p.isMe ? 'Você' : (p.displayName ?? 'Convidado')}{p.isHost ? ' · Anfitrião' : ''}
                    </Text>
                  </View>
                ))}
                {canInvite ? (
                  <TouchableOpacity style={styles.inviteChip} onPress={openInvite} accessibilityRole="button" testID="fechar-conta-invite-chip">
                    <Ionicons name="person-add-outline" size={14} color={colors.foregroundSecondary} />
                    <Text style={styles.inviteChipText}>Convidar</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            </View>

            <View>
              <Text style={styles.sectionTitle}>Itens da comanda</Text>
              <View style={{ marginTop: 6 }}>
                {bill.data.items.map((item) => (
                  <View key={item.orderItemId} style={styles.itemRow}>
                    <View>
                      <Text style={styles.itemName}>{item.name}{item.quantity > 1 ? ` (${item.quantity}x)` : ''}</Text>
                      <Text style={styles.itemOwner}>{item.placedByIsMe ? 'Você' : item.placedByName}</Text>
                    </View>
                    <Text style={styles.itemPrice}>{money(item.totalPrice)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Resumo</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{moneyCents(myShare?.baseCents ?? 0)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Taxa de serviço{bill.data.serviceFeePercent != null ? ` (${bill.data.serviceFeePercent}%)` : ''}</Text>
                <Text style={styles.summaryValue}>{moneyCents(myShare?.feeCents ?? 0)}</Text>
              </View>
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>Você paga</Text>
                <Text style={styles.payValue}>{moneyCents(myShare?.amountCents ?? 0)}</Text>
              </View>
              <Text style={styles.summaryLabel}>A gorjeta é opcional e escolhida na próxima etapa.</Text>
            </View>

            <TouchableOpacity
              style={styles.cta}
              onPress={() => {
                if (myActiveShare) navigation.navigate('SharePayment', { tableSessionId, restaurantName: restaurant.data?.name });
                else if (myShare) payMine.mutate();
                else finishVisit.mutate();
              }}
              disabled={finishVisit.isPending || payMine.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>
                {myActiveShare
                  ? 'Continuar pagamento'
                  : myShare
                    ? (payMine.isPending ? 'Preparando…' : 'Pagar e concluir minha conta')
                    : finishVisit.isPending ? 'Encerrando…' : 'Encerrar visita sem saldo pendente'}
              </Text>
            </TouchableOpacity>
            {bill.data.participants.length > 1 ? (
              <TouchableOpacity onPress={() => navigation.navigate('SplitBill', {
                tableSessionId, restaurantName: restaurant.data?.name,
              })} accessibilityRole="button">
                <Text style={styles.inviteLinkText}>Dividir a conta</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.cta, (requestClose.isPending || billCooldown.active) && styles.ctaDisabled]}
              onPress={() => requestClose.mutate()}
              disabled={requestClose.isPending || billCooldown.active}
              accessibilityRole="button"
              accessibilityState={{ disabled: requestClose.isPending || billCooldown.active }}
            >
              <Text style={styles.ctaText}>
                {requestClose.isPending
                  ? 'Chamando...'
                  : billCooldown.active
                    ? `Chamado enviado · aguarde ${billCooldown.remaining}s`
                    : 'Chamar para Fechar a Conta'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      {canInvite && tableSessionId ? (
        <InviteToTableSheet
          visible={inviteOpen}
          onClose={() => setInviteOpen(false)}
          tableSessionId={tableSessionId}
          restaurantName={restaurant.data?.name}
          userInviteEnabled={capabilities?.userInvite ?? false}
          guestLinkEnabled={capabilities?.guestLink ?? false}
          searchMinChars={policies?.userSearchMinChars ?? null}
        />
      ) : null}
    </ScreenContainer>
  );
}
