import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type ManagerSummary } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { statementLabel } from './PaymentStatementCard';
import { ROLE_LABELS } from './staffRoles';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const formatDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const STATUS_LABEL: Record<string, string> = { trial: 'em teste', active: 'ativo', past_due: 'em atraso' };

/** Painel do Gerente: plano atual, caixa líquido do dia por forma e gorjeta da equipe. Sem preço, fatura nem taxa por pagamento. */
export function ManagerSummaryCard() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [summary, setSummary] = useState<ManagerSummary | null>(null);

  useFocusEffect(useCallback(() => {
    if (!restaurantId) return;
    supabaseApiAdapter.getManagerSummary(restaurantId).then(setSummary).catch(() => setSummary(null));
  }, [restaurantId]));

  if (!summary) return null;
  const { plan, cash, tips } = summary;
  const muted = { color: colors.foregroundSecondary };
  const strong = { color: colors.foreground, fontWeight: '700' as const };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {plan.name ? `Plano ${plan.name}${plan.status && STATUS_LABEL[plan.status] ? ` · ${STATUS_LABEL[plan.status]}` : ''}` : 'Sem plano escolhido'}
      </Text>

      <Text style={[styles.title, { color: colors.foreground }]}>Caixa do dia (líquido)</Text>
      {cash.length === 0 ? <Text style={muted}>Nenhum pagamento no dia.</Text> : null}
      {cash.map((line) => (
        <View key={`${line.method}-${line.external}`} style={styles.row}>
          <Text style={muted}>{statementLabel(line.method, line.external)}</Text>
          <Text style={strong}>{line.netCents === null ? 'Na contagem do fechamento' : formatCents(line.netCents)}</Text>
        </View>
      ))}

      <Text style={[styles.title, { color: colors.foreground }]}>Gorjeta da equipe</Text>
      <View style={styles.row}>
        <Text style={muted}>Hoje, até agora</Text>
        <Text style={strong}>{formatCents(tips.poolTodayCents)}</Text>
      </View>
      {tips.last ? (
        <>
          <Text style={muted}>Rateio de {formatDay(tips.last.businessDate)}</Text>
          {tips.last.lines.map((line, index) => (
            <View key={`${line.name}-${index}`} style={styles.row}>
              <Text style={muted}>{line.name}{line.role ? ` · ${ROLE_LABELS[line.role] ?? line.role}` : ''}</Text>
              <Text style={strong}>{formatCents(line.amountCents)}</Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16, gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
