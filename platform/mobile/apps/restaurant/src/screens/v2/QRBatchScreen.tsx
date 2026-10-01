import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Download, PlusCircle } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type TableQRCode } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from './shared/V2Shell';
import { useRestaurantTables } from './shared/useRestaurantOperations';
import { exportTableQrPdf } from './shared/tableQrExport';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

export default function QRBatchScreen() {
  const colors = useColors();
  const { data: tables, loading: tablesLoading, refresh: refreshTables } = useRestaurantTables();
  const [codes, setCodes] = useState<TableQRCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    setError(null);
    try {
      setCodes(await supabaseApiAdapter.getTableQRCodes());
    } catch (reason) {
      setError(userErrorMessage(reason, 'Não foi possível carregar os QR Codes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabaseApiAdapter.getTableQRCodes()
      .then((rows) => { if (!cancelled) setCodes(rows); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(userErrorMessage(reason, 'Não foi possível carregar os QR Codes.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const activeCodes = useMemo(() => codes.filter((code) => Boolean(code.qr_code_data)), [codes]);
  const missingTables = useMemo(
    () => tables.filter((table) => !codes.some((code) => code.table_id === table.id && code.qr_code_data)),
    [codes, tables],
  );

  const generateMissing = async (): Promise<TableQRCode[]> => {
    if (missingTables.length === 0) return activeCodes;
    setBusy(true);
    setError(null);
    try {
      let failures = 0;
      for (let index = 0; index < missingTables.length; index += 1) {
        setProgress(`Gerando ${index + 1} de ${missingTables.length}…`);
        try {
          await supabaseApiAdapter.generateTableQR(missingTables[index].id);
        } catch {
          failures += 1;
        }
      }
      const next = await supabaseApiAdapter.getTableQRCodes();
      setCodes(next);
      await refreshTables();
      if (failures > 0) {
        throw new Error(`${failures} QR Code${failures === 1 ? '' : 's'} não puderam ser gerados. Tente novamente.`);
      }
      return next.filter((code) => Boolean(code.qr_code_data));
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const exportAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const printable = missingTables.length > 0 ? await generateMissing() : activeCodes;
      setBusy(true);
      setProgress('Preparando PDF…');
      await exportTableQrPdf(printable, 'qrcodes-de-todas-as-mesas');
    } catch (reason) {
      setError(userErrorMessage(reason, 'Não foi possível exportar os QR Codes.'));
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const createMissingOnly = async () => {
    try {
      await generateMissing();
    } catch (reason) {
      setError(userErrorMessage(reason, 'Não foi possível gerar todos os QR Codes.'));
    }
  };

  return (
    <V2Shell
      title="QR Codes em Lote"
      subtitle="Uma página pronta para impressão por mesa"
      showBack
      onRefresh={async () => { await Promise.all([loadCodes(), refreshTables()]); }}
    >
      {(loading || tablesLoading) ? <ActivityIndicator color={colors.primary} /> : null}
      <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View><Text style={[styles.summaryNumber, { color: colors.foreground }]}>{tables.length}</Text><Text style={{ color: colors.foregroundSecondary }}>mesas</Text></View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View><Text style={[styles.summaryNumber, { color: colors.primary }]}>{activeCodes.length}</Text><Text style={{ color: colors.foregroundSecondary }}>QR ativos</Text></View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View><Text style={[styles.summaryNumber, { color: missingTables.length ? '#B54708' : '#16A66A' }]}>{missingTables.length}</Text><Text style={{ color: colors.foregroundSecondary }}>pendentes</Text></View>
      </View>

      {missingTables.length > 0 ? (
        <Pressable disabled={busy} onPress={() => { void createMissingOnly(); }} style={[styles.missingButton, { borderColor: colors.border }, busy && styles.disabled]}>
          <PlusCircle size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '800' }}>Gerar somente os {missingTables.length} pendentes</Text>
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        {activeCodes.map((code) => (
          <View key={code.table_id} style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <QRCode value={code.qr_code_data!} size={92} ecl="H" />
            <View style={styles.previewText}>
              <Text style={[styles.previewTitle, { color: colors.foreground }]}>Mesa {code.table_number}</Text>
              <Text style={{ color: colors.foregroundSecondary, fontSize: 12 }}>{code.section || 'Salão'}</Text>
            </View>
          </View>
        ))}
      </View>

      {progress ? <Text style={[styles.progress, { color: colors.foregroundSecondary }]}>{progress}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={busy || tables.length === 0} onPress={() => { void exportAll(); }} style={[styles.exportButton, { backgroundColor: colors.primary }, busy && styles.disabled]}>
        {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Download size={18} color="#FFF" />}
        <Text style={styles.exportLabel}>Exportar PDF com todas as mesas</Text>
      </Pressable>
      <Text style={[styles.notice, { color: colors.foregroundSecondary }]}>Códigos já ativos são preservados. A exportação não invalida materiais impressos anteriormente.</Text>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  summary: { borderWidth: 1, borderRadius: 18, padding: 18, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 14 },
  summaryNumber: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 38 },
  missingButton: { borderWidth: 1, borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 14 },
  grid: { gap: 10 },
  previewCard: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 16 },
  previewText: { flex: 1 },
  previewTitle: { fontSize: 17, fontWeight: '800' },
  exportButton: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 18 },
  exportLabel: { color: '#FFF', fontWeight: '800' },
  notice: { fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 9 },
  progress: { textAlign: 'center', marginTop: 12 },
  error: { color: '#B42318', textAlign: 'center', marginTop: 12 },
  disabled: { opacity: 0.55 },
});
