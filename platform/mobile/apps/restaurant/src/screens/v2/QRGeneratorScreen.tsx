import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Download, RefreshCw } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useRoute } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type TableQRCode } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from './shared/V2Shell';
import { useRestaurantTables } from './shared/useRestaurantOperations';
import { exportTableQrPdf } from './shared/tableQrExport';

export default function QRGeneratorScreen() {
  const colors = useColors();
  const route = useRoute<any>();
  const { data: tables, loading: tablesLoading, refresh: refreshTables } = useRestaurantTables();
  const [codes, setCodes] = useState<TableQRCode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(route.params?.tableId ?? null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    setError(null);
    try {
      const rows = await supabaseApiAdapter.getTableQRCodes();
      setCodes(rows);
      setSelectedId((current) => current ?? rows[0]?.table_id ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os QR Codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabaseApiAdapter.getTableQRCodes()
      .then((rows) => {
        if (cancelled) return;
        setCodes(rows);
        setSelectedId((current) => current ?? rows[0]?.table_id ?? null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os QR Codes.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedTable = tables.find((table) => table.id === selectedId);
  const selectedCode = codes.find((code) => code.table_id === selectedId && code.qr_code_data);
  const expiresLabel = selectedCode?.expires_at
    ? new Intl.DateTimeFormat('pt-BR').format(new Date(selectedCode.expires_at))
    : null;

  const generate = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await supabaseApiAdapter.generateTableQR(selectedId);
      await Promise.all([loadCodes(), refreshTables()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o QR Code.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRegeneration = () => {
    if (!selectedCode) {
      void generate();
      return;
    }
    Alert.alert(
      'Substituir QR Code?',
      'O material impresso com o código atual deixará de funcionar imediatamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Substituir', style: 'destructive', onPress: () => { void generate(); } },
      ],
    );
  };

  const exportPdf = async () => {
    if (!selectedCode) return;
    setBusy(true);
    setError(null);
    try {
      await exportTableQrPdf([selectedCode], `qr-mesa-${selectedCode.table_number}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível exportar o PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <V2Shell
      title="QR Code da Mesa"
      subtitle="Visualize, imprima ou substitua o código"
      showBack
      onRefresh={async () => { await Promise.all([loadCodes(), refreshTables()]); }}
    >
      {(loading || tablesLoading) ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={[styles.label, { color: colors.foregroundSecondary }]}>SELECIONE A MESA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tablePicker}>
        {tables.map((table) => {
          const active = table.id === selectedId;
          return (
            <Pressable
              key={table.id}
              onPress={() => setSelectedId(table.id)}
              style={[styles.tableChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}14` : colors.card }]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={{ color: active ? colors.primary : colors.foreground, fontWeight: '700' }}>Mesa {table.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedCode?.qr_code_data ? (
        <View style={[styles.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.tableTitle, { color: colors.foreground }]}>Mesa {selectedCode.table_number}</Text>
          <Text style={[styles.section, { color: colors.foregroundSecondary }]}>{selectedCode.section || selectedTable?.section || 'Salão'}</Text>
          <View style={styles.qrFrame}>
            <QRCode value={selectedCode.qr_code_data} size={238} ecl="H" backgroundColor="#FFFFFF" color="#111827" />
          </View>
          <Text style={[styles.scanText, { color: colors.foreground }]}>Escaneie para entrar na mesa</Text>
          {expiresLabel ? <Text style={[styles.expiry, { color: colors.foregroundSecondary }]}>Válido até {expiresLabel}</Text> : null}
        </View>
      ) : selectedId ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Esta mesa ainda não tem um QR ativo</Text>
          <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>Gere um código antes de imprimir o material da mesa.</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        {selectedCode ? (
          <Pressable disabled={busy} onPress={() => { void exportPdf(); }} style={[styles.primaryButton, { backgroundColor: colors.primary }, busy && styles.disabled]}>
            <Download size={18} color="#FFF" />
            <Text style={styles.primaryLabel}>Exportar PDF para impressão</Text>
          </Pressable>
        ) : null}
        <Pressable disabled={busy || !selectedId} onPress={confirmRegeneration} style={[styles.secondaryButton, { borderColor: colors.border }, busy && styles.disabled]}>
          {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={18} color={colors.primary} />}
          <Text style={{ color: colors.primary, fontWeight: '800' }}>{selectedCode ? 'Substituir código' : 'Gerar QR Code'}</Text>
        </Pressable>
      </View>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 4, marginBottom: 8, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  tablePicker: { gap: 8, paddingBottom: 18 },
  tableChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  qrCard: { borderWidth: 1, borderRadius: 24, padding: 24, alignItems: 'center' },
  tableTitle: { fontSize: 26, fontWeight: '900' },
  section: { marginTop: 2, marginBottom: 18, fontSize: 14 },
  qrFrame: { padding: 14, borderRadius: 18, backgroundColor: '#FFF' },
  scanText: { marginTop: 18, fontSize: 16, fontWeight: '800' },
  expiry: { marginTop: 5, fontSize: 12 },
  emptyCard: { borderWidth: 1, borderRadius: 20, padding: 28, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  actions: { marginTop: 16, gap: 10 },
  primaryButton: { minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryLabel: { color: '#FFF', fontWeight: '800' },
  secondaryButton: { minHeight: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  disabled: { opacity: 0.55 },
  error: { color: '#B42318', marginTop: 12, textAlign: 'center' },
});
