import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Users, UserPlus, Repeat } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';

interface Customer {
  user_id: string;
  full_name?: string;
  avatar_url?: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  total_visits: number;
  total_spent: number;
  last_visit?: string;
}

interface Summary {
  total_customers?: number;
  new_last_30_days?: number;
  recurrence_rate?: number;
}

const TIER_META: Record<Customer['tier'], { label: string; bg: string; color: string }> = {
  bronze: { label: 'Bronze', bg: '#FEF3C7', color: '#92400E' },
  silver: { label: 'Silver', bg: '#F1F5F9', color: '#475569' },
  gold: { label: 'Gold', bg: '#FEF9C3', color: '#A16207' },
  platinum: { label: 'Platinum', bg: '#F3E8FF', color: '#7C3AED' },
};

function fmt(value?: number): string {
  if (value == null || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function lastVisitLabel(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `${days} dias`;
}

export default function CustomersScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await supabaseApiAdapter.getCustomers(restaurantId ?? undefined, 100);
      setSummary(data?.summary ?? {});
      setCustomers(Array.isArray(data?.customers) ? data.customers : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); void load(); };

  const sorted = useMemo(() => [...customers].sort((a, b) => b.total_spent - a.total_spent), [customers]);

  return (
    <V2Shell title="Clientes" subtitle="CRM e recorrência" showBack>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
            Carregando clientes…
          </Text>
        ) : error ? (
          <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <SummaryCard icon={<Users size={17} color={colors.primary} />} value={String(summary?.total_customers ?? 0)} label="Total Clientes" />
              <SummaryCard icon={<UserPlus size={17} color="#22C55E" />} value={`+${summary?.new_last_30_days ?? 0}`} label="Novos (30d)" valueColor="#22C55E" />
              <SummaryCard icon={<Repeat size={17} color="#EF4444" />} value={`${summary?.recurrence_rate ?? 0}%`} label="Recorrentes" valueColor="#EF4444" />
            </View>

            {sorted.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Users size={30} color={colors.foregroundSecondary} />
                <Text style={{ color: colors.foregroundSecondary, marginTop: 10, textAlign: 'center' }}>
                  Nenhum cliente com pedidos registrados ainda.
                </Text>
              </View>
            ) : (
              sorted.map((customer) => {
                const tier = TIER_META[customer.tier] ?? TIER_META.bronze;
                return (
                  <View key={customer.user_id} style={[styles.customerRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.avatar, { backgroundColor: `${colors.primary}15` }]}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>
                        {(customer.full_name ?? '?')[0]?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={{ fontWeight: '700', color: colors.foreground }} numberOfLines={1}>
                          {customer.full_name ?? 'Cliente'}
                        </Text>
                        <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: tier.color }}>{tier.label}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }}>
                        {customer.total_visits} visitas · Última {lastVisitLabel(customer.last_visit)} · Total {fmt(customer.total_spent)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </V2Shell>
  );
}

function SummaryCard({ icon, value, label, valueColor }: { icon: React.ReactNode; value: string; label: string; valueColor?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {icon}
      <Text style={{ fontSize: 20, fontWeight: '800', color: valueColor ?? colors.foreground, marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.foregroundSecondary, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 9, marginBottom: 18 },
  summaryCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center' },
  emptyBox: { borderRadius: 16, borderWidth: 1, padding: 28, alignItems: 'center', marginTop: 12 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 15, borderWidth: 1, padding: 12, marginBottom: 9 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
});
