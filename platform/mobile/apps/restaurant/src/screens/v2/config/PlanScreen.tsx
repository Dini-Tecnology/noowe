import React, { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react-native';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type BillingCycle, type CreditsView, type PlanInvoice, type PlanOption, type PlanSummary } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { V2Shell } from '../shared/V2Shell';
import { FEATURE_LABELS, formatCents, formatDate, INVOICE_STATUS, planChangeKind, usagePercent } from './planView';

/** Módulos e plano: Meu plano, Uso do mês, Créditos, Comparar e trocar, Código, Cobrança, Módulos extras e Cancelar. Só o Dono. */
export default function PlanScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurantId } = useRestaurantRole();
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [invoices, setInvoices] = useState<PlanInvoice[]>([]);
  const [credits, setCredits] = useState<CreditsView | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [code, setCode] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [nextSummary, nextPlans] = await Promise.all([supabaseApiAdapter.getPlanSummary(restaurantId), supabaseApiAdapter.listPlans(restaurantId)]);
      setSummary(nextSummary);
      setPlans(nextPlans);
      if (nextSummary.cycle) setCycle(nextSummary.cycle);
      if (!nextSummary.needsChoice) {
        const [nextInvoices, nextCredits] = await Promise.all([supabaseApiAdapter.listInvoices(restaurantId), supabaseApiAdapter.getCredits(restaurantId)]);
        setInvoices(nextInvoices);
        setCredits(nextCredits);
      }
    } catch (err) {
      Alert.alert('Não foi possível carregar', userErrorMessage(err, 'Tente novamente.'));
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      await load();
      if (done) Alert.alert('Pronto', done);
    } catch (err) {
      Alert.alert('Não foi possível concluir', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setBusy(false);
    }
  };

  const pick = (plan: PlanOption) => {
    if (!restaurantId) return;
    if (plan.isContract) {
      Alert.alert('Falar com a NOOWE', 'Este plano é por contrato. Fale com a equipe comercial da NOOWE.');
      return;
    }
    if (summary?.needsChoice) {
      void act(() => supabaseApiAdapter.choosePlan(restaurantId, plan.code, cycle), `Teste de ${summary.trialDays ?? 30} dias começou, sem cartão.`);
      return;
    }
    const kind = planChangeKind(plans, summary?.planCode, plan.code);
    Alert.alert('Trocar de plano', kind === 'upgrade' ? 'Vale na hora, cobrando a diferença proporcional.' : 'Vale a partir do próximo ciclo.', [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Trocar', onPress: () => void act(() => supabaseApiAdapter.changePlan(restaurantId, plan.code, cycle)) },
    ]);
  };

  const cancel = () => {
    if (!restaurantId) return;
    if (!cancelReason.trim()) {
      Alert.alert('Motivo obrigatório', 'Conte por que está cancelando.');
      return;
    }
    Alert.alert('Cancelar assinatura', 'O serviço segue até o fim do período pago, sem reembolso. Os créditos se perdem. Seus dados e a exportação continuam disponíveis.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar assinatura', style: 'destructive', onPress: () => void act(() => supabaseApiAdapter.cancelSubscription(restaurantId, cancelReason.trim())) },
    ]);
  };

  if (!summary) {
    return (
      <V2Shell title="Módulos e plano" showBack>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </V2Shell>
    );
  }

  const panel = [styles.panel, { backgroundColor: colors.card, borderColor: colors.border }];
  const title = [styles.title, { color: colors.foreground }];
  const muted = { color: colors.foregroundSecondary };

  return (
    <V2Shell title={summary.needsChoice ? 'Escolha seu plano' : 'Módulos e plano'} subtitle="Só o Dono altera" showBack>
      {!summary.needsChoice ? (
        <View style={panel}>
          <Text style={title}>Meu plano</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.foreground }}>{summary.planName}{summary.category ? ` · ${summary.category}` : ''}</Text>
          <Text style={muted}>
            {summary.isContract ? 'Por contrato' : `${formatCents(summary.priceCents ?? 0)} ${summary.cycle === 'annual' ? 'por ano' : 'por mês'}`}
          </Text>
          {summary.status === 'trial' && summary.trialEndsAt ? <Text style={muted}>Teste até {formatDate(summary.trialEndsAt)}, sem cartão.</Text> : null}
          {summary.periodEnd ? <Text style={muted}>Próxima cobrança: {formatDate(summary.periodEnd)}</Text> : null}
          {summary.nextPlanCode ? <Text style={muted}>Muda de plano no próximo ciclo.</Text> : null}
          {summary.cancelAt ? <Text style={{ color: colors.error ?? colors.primary, fontWeight: '700' }}>Cancelada: segue até {formatDate(summary.cancelAt)}.</Text> : null}
          {summary.promo ? (
            <Text style={muted}>
              {summary.promo.lifetime
                ? `Código ${summary.promo.code}: desconto vitalício enquanto o restaurante estiver em dia.`
                : `Código ${summary.promo.code}${summary.promo.endsAt ? ` até ${formatDate(summary.promo.endsAt)}` : ''}. Depois, ${formatCents(summary.promo.priceAfterCents)}.`}
            </Text>
          ) : null}
        </View>
      ) : (
        summary.status === 'canceled' ? (
          <View style={panel}>
            <Text style={title}>Plano encerrado</Text>
            <Text style={muted}>O restaurante saiu da busca, e pedidos e pagamentos pelo app estão suspensos. As comandas abertas fecham normalmente.</Text>
            {summary.dataAccessUntil ? <Text style={muted}>Seus dados e a exportação ficam disponíveis até {formatDate(summary.dataAccessUntil)}.</Text> : null}
            <Text style={muted}>Escolha um plano para voltar: tudo fica como estava.</Text>
          </View>
        ) : (
          <View style={panel}>
            <Text style={title}>Comece pelo plano certo para a sua casa</Text>
            <Text style={muted}>São {summary.trialDays ?? 30} dias de teste, sem cartão. Você troca quando quiser.</Text>
          </View>
        )
      )}

      {summary.usage ? (
        <View style={panel}>
          <Text style={title}>Uso do mês</Text>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>{summary.usage.orders} de {summary.usage.allowance ?? '∞'} pedidos</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.backgroundTertiary }]}>
            <View style={[styles.barFill, { backgroundColor: colors.primary, width: `${usagePercent(summary.usage.orders, summary.usage.allowance)}%` }]} />
          </View>
          {summary.usage.projectedOverageCents > 0 ? <Text style={muted}>Neste ritmo, excedente de {formatCents(summary.usage.projectedOverageCents)}.</Text> : <Text style={muted}>Neste ritmo, sem excedente.</Text>}
        </View>
      ) : null}

      {credits ? (
        <View style={panel}>
          <Text style={title}>Créditos NOOWE Pay</Text>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>Índice do mês: {Math.round(credits.indexBps / 100)}%{credits.marks.find((m) => m.code === credits.tierCode) ? ` · ${credits.marks.find((m) => m.code === credits.tierCode)!.name}` : ''}</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.backgroundTertiary }]}>
            <View style={[styles.barFill, { backgroundColor: colors.primary, width: `${Math.min(100, credits.indexBps / 100)}%` }]} />
            {credits.marks.map((mark) => <View key={mark.code} style={[styles.mark, { left: `${mark.minIndexBps / 100}%`, backgroundColor: colors.foreground }]} />)}
          </View>
          <Text style={muted}>Pago pelo app: {formatCents(credits.paidCents)}{credits.minVolumeCents != null ? ` de ${formatCents(credits.minVolumeCents)} mínimos` : ''}</Text>
          <Text style={muted}>Previsão do mês: {formatCents(credits.forecastCents)}</Text>
          {credits.nextTier && credits.nextTier.missingCents > 0 ? <Text style={muted}>Se mais {formatCents(credits.nextTier.missingCents)} forem pagos pelo app este mês, você chega à faixa {credits.nextTier.name}.</Text> : null}
          <Text style={{ color: colors.foreground }}>Saldo: {formatCents(credits.balanceCents)}</Text>
          {credits.toRelease.map((lot) => <Text key={lot.availableFrom} style={muted}>A liberar: {formatCents(lot.amountCents)} em {formatDate(lot.availableFrom)}</Text>)}
          {credits.expiringSoonCents > 0 ? <Text style={muted}>Expira em breve: {formatCents(credits.expiringSoonCents)}</Text> : null}
          {credits.statement.slice(0, 12).map((line, index) => (
            <View key={`${line.at}-${index}`} style={styles.row}>
              <Text style={muted}>{({ generated: 'Gerado', used: 'Usado', expired: 'Expirado', lost: 'Perdido' } as Record<string, string>)[line.kind] ?? line.kind}</Text>
              <Text style={{ color: colors.foreground }}>{formatCents(line.amountCents)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={panel}>
        <Text style={title}>{summary.needsChoice ? 'Planos' : 'Comparar e trocar'}</Text>
        <View style={styles.leftRow}>
          {(['monthly', 'annual'] as const).map((value) => (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: cycle === value }} onPress={() => setCycle(value)}
              style={[styles.chip, { borderColor: cycle === value ? colors.primary : colors.border, backgroundColor: cycle === value ? `${colors.primary}18` : colors.card }]}>
              <Text style={{ fontWeight: '700', color: cycle === value ? colors.primary : colors.foreground }}>{value === 'monthly' ? 'Mensal' : 'Anual'}</Text>
            </Pressable>
          ))}
        </View>
        {plans.map((plan) => {
          const current = summary.planCode === plan.code;
          return (
            <View key={plan.code} style={[styles.planBox, { borderColor: current ? colors.primary : colors.border }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.foreground }}>{plan.name}{plan.suggested ? ' · Sugerido' : ''}{current ? ' · Atual' : ''}</Text>
              {plan.isContract ? <Text style={muted}>Sob consulta</Text> : (
                <>
                  <Text style={{ color: colors.foreground, fontWeight: '700' }}>{formatCents((cycle === 'annual' ? plan.annualCents : plan.monthlyCents) ?? 0)} {cycle === 'annual' ? 'por ano' : 'por mês'}</Text>
                  {cycle === 'annual' && plan.annualSavingsCents ? <Text style={muted}>Economize {formatCents(plan.annualSavingsCents)} por ano</Text> : null}
                  {plan.orderAllowance != null ? <Text style={muted}>{plan.orderAllowance} pedidos por mês; acima disso, {formatCents(plan.overageCents ?? 0)} cada</Text> : null}
                </>
              )}
              <Text style={[muted, { fontSize: 12 }]}>{plan.features.map((key) => FEATURE_LABELS[key] ?? key).join(' · ')}</Text>
              {current && !summary.needsChoice && !plan.isContract && cycle !== summary.cycle ? (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act(() => supabaseApiAdapter.changePlan(restaurantId!, plan.code, cycle), 'Muda no próximo ciclo.')} style={[styles.action, { backgroundColor: colors.primary }]}>
                  <Text style={styles.actionText}>{cycle === 'annual' ? 'Mudar para anual' : 'Mudar para mensal'}</Text>
                </Pressable>
              ) : null}
              {!current ? (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => pick(plan)} style={[styles.action, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
                  <Text style={styles.actionText}>{plan.isContract ? 'Falar com a NOOWE' : summary.needsChoice ? 'Começar o teste' : 'Trocar para este'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {summary.locked?.length ? (
        <View style={panel}>
          <Text style={title}>Fora do seu plano</Text>
          {summary.locked.map((key) => (
            <View key={key} style={styles.leftRow} accessibilityLabel={`${FEATURE_LABELS[key] ?? key}, fora do plano`}>
              <Lock size={14} color={colors.foregroundSecondary} />
              <Text style={muted}>{FEATURE_LABELS[key] ?? key}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!summary.needsChoice ? (
        <>
          <View style={panel}>
            <Text style={title}>Código promocional</Text>
            <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Código" placeholderTextColor={colors.foregroundSecondary}
              accessibilityLabel="Código promocional" style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} />
            <Pressable accessibilityRole="button" disabled={busy || !code.trim()} onPress={() => void act(() => supabaseApiAdapter.applyPromoCode(restaurantId!, code.trim()), 'Código aplicado.')}
              style={[styles.action, { backgroundColor: colors.primary, opacity: busy || !code.trim() ? 0.6 : 1 }]}>
              <Text style={styles.actionText}>Aplicar</Text>
            </Pressable>
          </View>

          <View style={panel}>
            <Text style={title}>Cobrança</Text>
            {invoices.length === 0 ? <Text style={muted}>Nenhuma fatura ainda.</Text> : invoices.map((invoice) => (
              <View key={invoice.id} style={styles.invoice}>
                <View style={styles.row}>
                  <Text style={{ color: colors.foreground, fontWeight: '700' }}>{formatDate(invoice.periodStart)}</Text>
                  <Text style={{ color: colors.foreground, fontWeight: '700' }}>{formatCents(invoice.totalCents)}</Text>
                </View>
                <Text style={muted}>{INVOICE_STATUS[invoice.status] ?? invoice.status}{invoice.nfseUrl ? '' : invoice.status === 'paid' ? ' · nota da NOOWE em breve' : ''}</Text>
                {invoice.lines.map((line, index) => (
                  <View key={`${line.kind}-${index}`} style={styles.row}>
                    <Text style={[muted, { fontSize: 12 }]}>{line.description}</Text>
                    <Text style={[muted, { fontSize: 12 }]}>{formatCents(line.amountCents)}</Text>
                  </View>
                ))}
                {invoice.checkoutUrl && invoice.status !== 'paid' ? (
                  <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(invoice.checkoutUrl!)}><Text style={{ color: colors.primary, fontWeight: '700' }}>Pagar</Text></Pressable>
                ) : null}
                {invoice.nfseUrl ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(invoice.nfseUrl!)}><Text style={{ color: colors.primary, fontWeight: '700' }}>Baixar nota</Text></Pressable> : null}
              </View>
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('ConfigMarketplace')} style={panel}>
            <Text style={title}>Módulos extras</Text>
            <Text style={muted}>Ver e ativar módulos</Text>
          </Pressable>

          {!summary.cancelAt ? (
            <View style={panel}>
              <Text style={title}>Cancelar assinatura</Text>
              <TextInput value={cancelReason} onChangeText={setCancelReason} placeholder="Motivo" placeholderTextColor={colors.foregroundSecondary}
                accessibilityLabel="Motivo do cancelamento" style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={cancel}><Text style={{ color: colors.error ?? colors.primary, fontWeight: '700' }}>Cancelar assinatura</Text></Pressable>
            </View>
          ) : null}
        </>
      ) : null}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  leftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  planBox: { borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 4 },
  action: { marginTop: 6, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  actionText: { color: '#FFFFFF', fontWeight: '800' },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  invoice: { gap: 3, paddingVertical: 6 },
});
