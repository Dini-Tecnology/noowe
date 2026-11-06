import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type FiscalIssue, type FiscalRefundReview, type FiscalSaleLine } from '@okinawa/shared/services/supabase-api';
import { formatCentsBRL } from '@okinawa/shared/utils/money-input';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from '../v2/shared/V2Shell';
import { V2ConfirmDialog } from '../v2/shared/V2ConfirmDialog';
import { formatTableLabel } from '../v2/shared/tableLabel';

const STATUS_COPY: Record<FiscalIssue['status'], { label: string; hint: string }> = {
  blocked: { label: 'Bloqueada', hint: 'Não chegou a ir para a Focus. Corrija o cadastro e reenvie.' },
  rejected: { label: 'Rejeitada', hint: 'A SEFAZ ou a Focus recusou. Corrija o dado indicado e reenvie.' },
  failed: { label: 'Falhou', hint: 'O emissor não respondeu nas tentativas automáticas. Reenvie quando ele voltar.' },
};

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const cents = (value: number) => (value / 100).toFixed(2);

/** CSV das vendas do dia para o sistema fiscal do restaurante: uma linha por item, com valores em reais. */
export function fiscalSalesCsv(lines: FiscalSaleLine[]): string {
  const header = ['data_hora', 'mesa', 'pedido', 'item', 'quantidade', 'valor', 'desconto', 'taxa_servico', 'formas_pagamento'];
  const rows = lines.map((line) => [
    new Date(line.at).toLocaleString('pt-BR'), line.table ?? '', line.orderNumber ?? '', line.description, String(line.quantity),
    cents(line.grossCents), cents(line.discountCents), cents(line.feeCents), (line.payments ?? []).map((p) => p.method).join(' + '),
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(',')).join('\n');
}

function issueLabel(issue: Pick<FiscalIssue, 'table_sessions' | 'orders'>): string {
  const table = issue.table_sessions?.tables?.table_number;
  if (table) return formatTableLabel(table);
  return issue.orders?.order_number ? `Pedido ${issue.orders.order_number}` : 'Nota sem mesa ou pedido';
}

export default function FiscalDocumentsScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const isOwner = (serverRoles ?? []).includes('owner');
  const [externalNotes, setExternalNotes] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [issues, setIssues] = useState<FiscalIssue[]>([]);
  const [reviews, setReviews] = useState<FiscalRefundReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<FiscalIssue | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    try {
      const [nextIssues, nextReviews] = await Promise.all([
        supabaseApiAdapter.getFiscalIssues(restaurantId),
        supabaseApiAdapter.getFiscalRefundReviews(restaurantId),
      ]);
      setIssues(nextIssues);
      setReviews(nextReviews ?? []);
      // Sem NFC-e no plano, a nota é do sistema fiscal do restaurante (resposta 81).
      const summary = await supabaseApiAdapter.getPlanSummary(restaurantId).catch(() => null);
      setExternalNotes(Boolean(summary?.locked?.includes('nfce')));
    } catch (err) {
      setError(userErrorMessage(err, 'Não foi possível carregar as notas.'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // Volta do cadastro e nota que a emissão devolveu aparecem sem precisar puxar a tela.
  useEffect(() => {
    void load();
    const unsubscribe = navigation.addListener?.('focus', () => void load());
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [load, navigation]);

  const exportDay = useCallback(async () => {
    if (!restaurantId) return;
    setExporting(true);
    setError(null);
    try {
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const lines = await supabaseApiAdapter.exportFiscalSales(restaurantId, day);
      const fileUri = `${FileSystem.cacheDirectory}vendas-${day}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, fiscalSalesCsv(lines), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Vendas do dia', UTI: 'public.comma-separated-values-text' });
      }
      setNotice(lines.length ? `${lines.length} ${lines.length === 1 ? 'item exportado' : 'itens exportados'}.` : 'Nenhuma venda hoje.');
    } catch (err) {
      setError(userErrorMessage(err, 'Não foi possível exportar as vendas do dia.'));
    } finally {
      setExporting(false);
    }
  }, [restaurantId]);

  const closeDialog = useCallback(() => {
    setRetrying(null);
    setReason('');
  }, []);

  const confirmRetry = useCallback(async () => {
    if (!retrying) return;
    const target = retrying;
    closeDialog();
    setError(null);
    setNotice(null);
    try {
      await supabaseApiAdapter.retryFiscalDocument(target.id, reason.trim());
      setIssues((current) => current.filter((issue) => issue.id !== target.id));
      setNotice('Nota reenviada. Se o emissor recusar de novo, ela volta para esta lista.');
    } catch (err) {
      // A nota pode ter mudado de estado: atualiza a lista primeiro, porque a carga limpa o erro.
      await load();
      setError(userErrorMessage(err, 'Não foi possível reenviar a nota. Tente de novo.'));
    }
  }, [closeDialog, load, reason, retrying]);

  return (
    <V2Shell title="Notas com problema" subtitle="NFC-e que esperam a gerência" showBack onRefresh={load}>
      {loading ? (
        <ActivityIndicator testID="fiscal-documents-loading" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {externalNotes ? (
            <View testID="fiscal-external" style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Nota fiscal emitida pelo sistema do restaurante</Text>
              <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>
                O plano atual não inclui NFC-e. O app não bloqueia nada: o cliente que pedir nota vê "Solicite a nota ao restaurante".
              </Text>
              {isOwner ? (
                <TouchableOpacity accessibilityRole="button" disabled={exporting} onPress={() => void exportDay()}
                  style={[styles.button, { backgroundColor: colors.primary, opacity: exporting ? 0.6 : 1 }]}>
                  <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{exporting ? 'Exportando…' : 'Exportar vendas do dia'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {error ? <Text testID="fiscal-documents-error" style={[styles.message, { color: colors.error }]}>{error}</Text> : null}
          {notice ? <Text testID="fiscal-documents-notice" style={[styles.message, { color: colors.success }]}>{notice}</Text> : null}
          {issues.length === 0 && !error ? (
            <Text style={[styles.empty, { color: colors.foregroundSecondary }]}>Nenhuma nota com problema.</Text>
          ) : null}
          {issues.map((issue) => {
            const copy = STATUS_COPY[issue.status];
            return (
              <View key={issue.id} testID={`fiscal-issue-${issue.id}`} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{issueLabel(issue)}</Text>
                  <Text style={[styles.status, { color: colors.warning }]}>{copy.label}</Text>
                </View>
                <Text style={{ color: colors.foregroundSecondary }}>
                  {formatCentsBRL(issue.total_cents)} · {new Date(issue.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </Text>
                <Text style={{ color: colors.foreground }}>{issue.error_message ?? 'O emissor não informou o motivo.'}</Text>
                <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>{copy.hint}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => navigation.navigate('FiscalSetup')}
                  >
                    <Text style={[styles.buttonText, { color: colors.foreground }]}>Corrigir cadastro</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[styles.button, { backgroundColor: colors.primary }]}
                    onPress={() => setRetrying(issue)}
                  >
                    <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Reenviar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {reviews.length > 0 ? (
            <>
              <Text style={[styles.section, { color: colors.foreground }]}>Estornos para o contador</Text>
              <Text style={[styles.hint, { color: colors.foregroundSecondary, marginBottom: 8 }]}>
                A nota continua valendo. Entregue esta lista ao contador do restaurante.
              </Text>
              {reviews.map((review) => (
                <View key={review.id} testID={`fiscal-refund-${review.id}`} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{issueLabel(review)}{review.number ? ` · Nota ${review.number}` : ''}</Text>
                    <Text style={[styles.status, { color: colors.warning }]}>{formatCentsBRL(review.refund_review_cents)} estornado</Text>
                  </View>
                  <Text style={{ color: colors.foregroundSecondary }}>
                    Nota de {formatCentsBRL(review.total_cents)} · {new Date(review.refund_review_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                  <Text style={{ color: colors.foreground }}>{review.refund_review_reason ?? 'Estorno'}</Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
      <V2ConfirmDialog
        visible={retrying !== null}
        title="Reenviar a nota?"
        message={retrying ? `${issueLabel(retrying)}: a nota volta para a fila de emissão. O motivo fica registrado.` : ''}
        confirmLabel="Reenviar"
        reasonLabel="Motivo do reenvio"
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() => void confirmRetry()}
        onCancel={closeDialog}
      />
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  message: { fontSize: 13, marginBottom: 12 },
  empty: { textAlign: 'center', marginTop: 40 },
  section: { fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  status: { fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { flex: 1, borderRadius: 12, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonText: { fontSize: 13, fontWeight: '700' },
});
