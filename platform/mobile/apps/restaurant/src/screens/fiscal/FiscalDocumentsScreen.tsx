import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type FiscalIssue } from '@okinawa/shared/services/supabase-api';
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

function issueLabel(issue: FiscalIssue): string {
  const table = issue.table_sessions?.tables?.table_number;
  if (table) return formatTableLabel(table);
  return issue.orders?.order_number ? `Pedido ${issue.orders.order_number}` : 'Nota sem mesa ou pedido';
}

export default function FiscalDocumentsScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurantId } = useRestaurantRole();
  const [issues, setIssues] = useState<FiscalIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<FiscalIssue | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    try {
      setIssues(await supabaseApiAdapter.getFiscalIssues(restaurantId));
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
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  status: { fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { flex: 1, borderRadius: 12, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonText: { fontSize: 13, fontWeight: '700' },
});
