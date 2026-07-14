import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { DollarSign, ShoppingBag, Star, Repeat, Download, TrendingUp } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';

interface Reports {
  revenue?: { total?: number };
  orders?: { total?: number };
}

interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
}

type Period = 'today' | 'week' | 'month';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
];

function periodDates(period: Period): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === 'week') from.setDate(to.getDate() - 7);
  else if (period === 'month') from.setDate(to.getDate() - 30);
  else from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function fmt(value?: number): string {
  if (value == null || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export default function ReportsScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [period, setPeriod] = useState<Period>('month');
  const [reports, setReports] = useState<Reports | null>(null);
  const [satisfaction, setSatisfaction] = useState<{ average_rating?: number; recurrence_rate?: number } | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (p: Period) => {
    try {
      setError(null);
      const { from, to } = periodDates(p);
      const [reportsData, satisfactionData, financialSummary] = await Promise.all([
        supabaseApiAdapter.getReports(restaurantId ?? undefined, from, to),
        supabaseApiAdapter.getSatisfactionRecurrence(restaurantId ?? undefined, from, to),
        supabaseApiAdapter.getFinancialSummary(restaurantId ?? undefined, from, to),
      ]);
      setReports(reportsData ?? {});
      setSatisfaction(satisfactionData ?? {});
      setTopItems(Array.isArray(financialSummary?.top_selling_items) ? financialSummary.top_selling_items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => { void load(period); }, [load, period]);

  const onRefresh = () => { setRefreshing(true); void load(period); };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = [
        ['metrica', 'valor'],
        ['receita_total', String(reports?.revenue?.total ?? 0)],
        ['pedidos_total', String(reports?.orders?.total ?? 0)],
        ['satisfacao_media', String(satisfaction?.average_rating ?? '')],
        ['recorrencia_pct', String(satisfaction?.recurrence_rate ?? '')],
        [],
        ['item', 'quantidade_vendida', 'receita'],
        ...topItems.map((item) => [item.name, String(item.quantity), String(item.revenue)]),
      ];
      const csv = rows.map((row) => row.map((cell) => csvEscape(String(cell))).join(',')).join('\n');

      const fileUri = `${FileSystem.cacheDirectory}relatorio-${period}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Exportar relatório', UTI: 'public.comma-separated-values-text' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível exportar o CSV.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <V2Shell
      title="Relatórios"
      subtitle="Análises e métricas"
      showBack
      headerRight={
        <TouchableOpacity
          accessibilityLabel="Exportar CSV"
          disabled={exporting}
          style={[styles.exportButton, { backgroundColor: colors.primary, opacity: exporting ? 0.6 : 1 }]}
          onPress={() => void exportCsv()}
        >
          <Download size={16} color="#FFF" />
          <Text style={styles.exportLabel}>CSV</Text>
        </TouchableOpacity>
      }
    >
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[
                styles.periodChip,
                period === p.key
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: period === p.key ? '#FFF' : colors.foreground }}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && (
          <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
            Carregando relatórios…
          </Text>
        )}
        {error && (
          <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
        )}

        {!loading && !error && (
          <>
            <View style={styles.grid}>
              <StatTile icon={<DollarSign size={17} color="#22C55E" />} label="Receita" value={fmt(reports?.revenue?.total)} bg="#F0FDF4" />
              <StatTile icon={<ShoppingBag size={17} color="#EF4444" />} label="Pedidos" value={String(reports?.orders?.total ?? 0)} bg="#FEF2F2" />
              <StatTile
                icon={<Star size={17} color="#F59E0B" />}
                label="Satisfação"
                value={satisfaction?.average_rating != null ? satisfaction.average_rating.toFixed(1) : '—'}
                bg="#FFFBEB"
              />
              <StatTile
                icon={<Repeat size={17} color="#3B82F6" />}
                label="Recorrência"
                value={satisfaction?.recurrence_rate != null ? `${satisfaction.recurrence_rate}%` : '—'}
                bg="#EFF6FF"
              />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top vendidos</Text>
            {topItems.length === 0 ? (
              <Text style={{ color: colors.foregroundSecondary }}>Sem vendas no período.</Text>
            ) : (
              <View style={styles.topList}>
                {topItems.slice(0, 10).map((item, index) => (
                  <View key={item.name} style={[styles.topRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.rankBadge, { backgroundColor: `${colors.primary}15` }]}>
                      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>#{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: colors.foreground }}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{item.quantity} vendidos</Text>
                    </View>
                    <TrendingUp size={18} color="#22C55E" />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </V2Shell>
  );
}

function StatTile({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statTile, { backgroundColor: bg }]}>
      {icon}
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.foregroundSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: 13 },
  exportLabel: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  statTile: { width: '48%', borderRadius: 15, padding: 14 },
  statValue: { fontSize: 22, fontWeight: '800', marginTop: 8 },
  statLabel: { fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  topList: { gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  rankBadge: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
