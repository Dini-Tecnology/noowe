import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { TrendingUp, TrendingDown, DollarSign, Percent, Receipt, Plus, Check, Trash2 } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { V2FormSheet } from './shared/V2FormSheet';
import { V2ConfirmDialog } from './shared/V2ConfirmDialog';
import { CurrencyInput } from './shared/CurrencyInput';
import { DateInput } from './shared/DateInput';

interface DashboardData {
  gross_revenue?: number;
  previous_gross_revenue?: number;
  orders_count?: number;
  average_ticket?: number;
  cost_of_goods_available?: boolean;
  revenue_composition?: { category: string; amount: number }[];
}

interface Bill {
  id: string;
  supplier?: string;
  description: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
  category?: string;
}

type Period = 'today' | 'week' | 'month';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
];

const COMPOSITION_COLORS = ['#F97316', '#3B82F6', '#F59E0B', '#8B5CF6', '#94A3B8'];

function fmt(value?: number): string {
  if (value == null || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function pctChange(current?: number, previous?: number): number | null {
  if (!previous || previous <= 0) return null;
  return Math.round((((current ?? 0) - previous) / previous) * 100);
}

function periodDates(period: Period): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === 'week') from.setDate(to.getDate() - 7);
  else if (period === 'month') from.setDate(to.getDate() - 30);
  else from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export default function FinancialScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [period, setPeriod] = useState<Period>('today');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [billSheetOpen, setBillSheetOpen] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);

  const load = useCallback(async (p: Period) => {
    try {
      setError(null);
      const { from, to } = periodDates(p);
      const [dashboardData, billsData] = await Promise.all([
        supabaseApiAdapter.getFinancialDashboard(restaurantId ?? undefined, from, to),
        supabaseApiAdapter.getBills(restaurantId ?? undefined),
      ]);
      setDashboard(dashboardData ?? null);
      setBills(Array.isArray(billsData) ? billsData : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar financeiro'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => { void load(period); }, [load, period]);

  const onRefresh = () => { setRefreshing(true); void load(period); };

  const revenueChange = pctChange(dashboard?.gross_revenue, dashboard?.previous_gross_revenue);

  const composition = useMemo(() => {
    const rows = dashboard?.revenue_composition ?? [];
    const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
    if (total <= 0) return [];
    return rows
      .map((r) => ({ ...r, pct: Math.round((r.amount / total) * 100) }))
      .sort((a, b) => b.pct - a.pct);
  }, [dashboard?.revenue_composition]);

  const pendingBills = useMemo(() => bills.filter((b) => b.status !== 'paid'), [bills]);

  const openBillSheet = () => {
    setSupplierName('');
    setAmount(0);
    setDueDate('');
    setFormError(null);
    setBillSheetOpen(true);
  };

  const saveBill = async () => {
    if (!restaurantId) return;
    if (!supplierName.trim() || amount <= 0 || !dueDate) {
      setFormError('Preencha fornecedor, valor e vencimento.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await supabaseApiAdapter.createBill(restaurantId, supplierName.trim(), amount, dueDate);
      setBillSheetOpen(false);
      await load(period);
    } catch (err) {
      setFormError(getErrorMessage(err, 'Não foi possível salvar a conta.'));
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (bill: Bill) => {
    try {
      await supabaseApiAdapter.updateBillStatus(bill.id, 'paid');
      await load(period);
    } catch (err) {
      Alert.alert('Erro', getErrorMessage(err, 'Não foi possível atualizar a conta.'));
    }
  };

  const confirmDeleteBill = async () => {
    if (!deletingBill) return;
    try {
      await supabaseApiAdapter.deleteBill(deletingBill.id);
      setDeletingBill(null);
      await load(period);
    } catch (err) {
      setDeletingBill(null);
      Alert.alert('Erro', getErrorMessage(err, 'Não foi possível excluir a conta.'));
    }
  };

  return (
    <>
      <V2Shell title="Financeiro" subtitle="Painel financeiro" showBack>
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
              Carregando financeiro…
            </Text>
          )}
          {error && (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
          )}

          {!loading && !error && (
            <>
              <View style={styles.grid}>
                <MetricCard
                  icon={<DollarSign size={17} color={colors.primary} />}
                  label="Receita Bruta"
                  value={fmt(dashboard?.gross_revenue)}
                  trend={revenueChange != null ? `${revenueChange >= 0 ? '↑' : '↓'} ${Math.abs(revenueChange)}% vs anterior` : undefined}
                  trendPositive={revenueChange != null ? revenueChange >= 0 : undefined}
                />
                <MetricCard
                  icon={<Receipt size={17} color="#EF4444" />}
                  label="Custos (CMV)"
                  value={dashboard?.cost_of_goods_available ? fmt(0) : 'N/D'}
                  hint={dashboard?.cost_of_goods_available ? undefined : 'Cadastre o custo dos pratos para calcular'}
                />
                <MetricCard
                  icon={<Percent size={17} color="#22C55E" />}
                  label="Margem Líquida"
                  value={dashboard?.cost_of_goods_available ? '—' : 'N/D'}
                  hint={dashboard?.cost_of_goods_available ? undefined : 'Depende do CMV'}
                />
                <MetricCard
                  icon={<TrendingUp size={17} color={colors.primary} />}
                  label="Ticket Médio"
                  value={fmt(dashboard?.average_ticket)}
                  trend={`${dashboard?.orders_count ?? 0} pedidos`}
                />
              </View>

              <SectionCard title="Composição da Receita">
                {composition.length === 0 ? (
                  <Text style={{ color: colors.foregroundSecondary, fontSize: 13 }}>Sem vendas no período.</Text>
                ) : (
                  composition.map((row, index) => (
                    <View key={row.category} style={styles.compositionRow}>
                      <Text style={[styles.compositionLabel, { color: colors.foreground }]} numberOfLines={1}>
                        {row.category}
                      </Text>
                      <View style={[styles.compositionTrack, { backgroundColor: colors.backgroundSecondary }]}>
                        <View
                          style={[
                            styles.compositionFill,
                            { width: `${row.pct}%`, backgroundColor: COMPOSITION_COLORS[index % COMPOSITION_COLORS.length] },
                          ]}
                        />
                      </View>
                      <Text style={[styles.compositionPct, { color: colors.foregroundSecondary }]}>{row.pct}%</Text>
                    </View>
                  ))
                )}
              </SectionCard>

              <SectionCard
                title="Contas a Pagar"
                action={<Pressable onPress={openBillSheet} style={[styles.addBillButton, { backgroundColor: `${colors.primary}15` }]}>
                  <Plus size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Nova conta</Text>
                </Pressable>}
              >
                {pendingBills.length === 0 ? (
                  <Text style={{ color: colors.foregroundSecondary, fontSize: 13 }}>Nenhuma conta pendente.</Text>
                ) : (
                  pendingBills.map((bill, index) => {
                    const overdue = bill.status === 'overdue' || new Date(bill.due_date) < new Date(new Date().toDateString());
                    return (
                      <View
                        key={bill.id}
                        style={[
                          styles.billRow,
                          index < pendingBills.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '700', color: colors.foreground }}>{bill.supplier ?? bill.description}</Text>
                          <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
                            Venc: {new Date(bill.due_date).toLocaleDateString('pt-BR')}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={{ fontWeight: '800', color: colors.foreground }}>{fmt(bill.amount)}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: overdue ? '#FEF2F2' : '#FFFBEB' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: overdue ? '#DC2626' : '#B45309' }}>
                              {overdue ? 'Atrasada' : 'Pendente'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.billActions}>
                          <IconAction label="Marcar como paga" onPress={() => void markPaid(bill)}>
                            <Check size={15} color="#22C55E" />
                          </IconAction>
                          <IconAction label="Excluir conta" onPress={() => setDeletingBill(bill)}>
                            <Trash2 size={15} color="#EF4444" />
                          </IconAction>
                        </View>
                      </View>
                    );
                  })
                )}
              </SectionCard>
            </>
          )}
        </ScrollView>
      </V2Shell>

      <V2FormSheet
        visible={billSheetOpen}
        title="Nova conta a pagar"
        subtitle="Registre uma conta de fornecedor"
        saveLabel="Cadastrar"
        saving={saving}
        onClose={() => !saving && setBillSheetOpen(false)}
        onSave={() => void saveBill()}
      >
        <Field label="Fornecedor" required>
          <TextInput
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder="Ex.: Carnes Premium"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Valor" required>
          <CurrencyInput value={amount} onChangeValue={setAmount} />
        </Field>
        <Field label="Vencimento" required>
          <DateInput value={dueDate} onChangeValue={setDueDate} placeholder="Selecione o vencimento" />
        </Field>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      </V2FormSheet>

      <V2ConfirmDialog
        visible={deletingBill !== null}
        title="Excluir conta?"
        message={`A conta de "${deletingBill?.supplier ?? deletingBill?.description}" será removida.`}
        confirmLabel="Excluir"
        destructive
        onCancel={() => setDeletingBill(null)}
        onConfirm={() => void confirmDeleteBill()}
      />
    </>
  );
}

function MetricCard({ icon, label, value, trend, trendPositive, hint }: {
  icon: React.ReactNode; label: string; value: string; trend?: string; trendPositive?: boolean; hint?: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.metricHeader}>{icon}<Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginLeft: 6 }}>{label}</Text></View>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
      {trend ? (
        <View style={styles.metricTrendRow}>
          {trendPositive !== undefined ? (
            trendPositive ? <TrendingUp size={12} color="#22C55E" /> : <TrendingDown size={12} color="#EF4444" />
          ) : null}
          <Text style={{ fontSize: 11, color: trendPositive === undefined ? colors.foregroundSecondary : trendPositive ? '#22C55E' : '#EF4444' }}>
            {trend}
          </Text>
        </View>
      ) : null}
      {hint ? <Text style={{ fontSize: 10, color: colors.foregroundMuted, marginTop: 3 }}>{hint}</Text> : null}
    </View>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function IconAction({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={7}
      onPress={onPress}
      style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.backgroundSecondary }, pressed && { opacity: 0.72 }]}
    >
      {children}
    </Pressable>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {label}{required ? <Text style={{ color: colors.primary }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  metricCard: { width: '48%', borderRadius: 15, borderWidth: 1, padding: 14 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  metricValue: { fontSize: 20, fontWeight: '800' },
  metricTrendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  sectionCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  addBillButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  compositionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  compositionLabel: { width: 90, fontSize: 12, fontWeight: '600' },
  compositionTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  compositionFill: { height: '100%', borderRadius: 4 },
  compositionPct: { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  billActions: { flexDirection: 'column', gap: 5 },
  iconAction: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 },
  formError: { color: '#DC2626', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, fontSize: 13 },
});
