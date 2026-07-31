import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Calendar, Check, X, Users, Clock } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';

interface Reservation {
  id: string;
  customer_name?: string | null;
  customer?: { full_name?: string | null; email?: string | null } | null;
  reservation_time: string;
  party_size: number;
  status: string;
  table_id?: string;
  table_number?: number | string | null;
  special_requests?: string;
}

function reservationCustomerName(res: Reservation): string {
  return res.customer_name?.trim()
    || res.customer?.full_name?.trim()
    || res.customer?.email?.trim()
    || 'Cliente';
}

const STATUS_FILTERS = ['Todas', 'pending', 'confirmed', 'seated', 'completed', 'cancelled'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  seated: 'Sentada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

function statusTone(status: string): { bg: string; border: string; color: string } {
  if (status === 'pending') return { bg: '#FFFBEB', border: '#F59E0B', color: '#92400E' };
  if (status === 'confirmed') return { bg: '#EFF6FF', border: '#3B82F6', color: '#1E40AF' };
  if (status === 'seated') return { bg: '#F0FDF4', border: '#22C55E', color: '#166534' };
  if (status === 'completed') return { bg: '#F8FAFC', border: '#CBD5E1', color: '#64748B' };
  return { bg: '#FEF2F2', border: '#EF4444', color: '#991B1B' };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function ReservationsScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('Todas');
  const [acting, setActing] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    try {
      setError(null);
      let data: Reservation[] = [];
      if (restaurantId) {
        try {
          data = await supabaseApiAdapter.getRestaurantReservations(restaurantId, todayStr);
        } catch {
          data = await supabaseApiAdapter.getReservations({ date: todayStr });
        }
      } else {
        data = await supabaseApiAdapter.getReservations({ date: todayStr });
      }
      setReservations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar reservas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, todayStr]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); void load(); };

  const updateStatus = async (id: string, status: string) => {
    setActing(id);
    try {
      await supabaseApiAdapter.updateReservationStatus(id, status);
      void load();
    } catch (err) {
      console.warn('Erro ao atualizar reserva:', err);
    } finally {
      setActing(null);
    }
  };

  const filtered = activeFilter === 'Todas'
    ? reservations
    : reservations.filter((r) => r.status === activeFilter);

  return (
    <V2Shell title="Reservas" subtitle="Hoje e próximos dias" showBack>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterChip,
              activeFilter === f
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
            ]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: activeFilter === f ? '#FFF' : colors.foreground }}>
              {f === 'Todas' ? 'Todas' : STATUS_LABEL[f] ?? f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
            Carregando reservas…
          </Text>
        )}
        {error && (
          <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
        )}
        {!loading && !error && filtered.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Calendar size={32} color={colors.foregroundSecondary} />
            <Text style={{ color: colors.foregroundSecondary, marginTop: 10, textAlign: 'center' }}>
              Nenhuma reserva encontrada.
            </Text>
          </View>
        )}
        {filtered.map((res) => {
          const tone = statusTone(res.status);
          return (
            <View key={res.id} style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>
                    {reservationCustomerName(res)}
                  </Text>
                  <View style={styles.metaRow}>
                    <Clock size={13} color={colors.foregroundSecondary} />
                    <Text style={{ fontSize: 13, color: colors.foregroundSecondary, marginLeft: 4 }}>
                      {formatDate(res.reservation_time)} · {formatTime(res.reservation_time)}
                    </Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Users size={13} color={colors.foregroundSecondary} />
                    <Text style={{ fontSize: 13, color: colors.foregroundSecondary, marginLeft: 4 }}>
                      {res.party_size} {res.party_size === 1 ? 'pessoa' : 'pessoas'}
                      {res.table_number ? ` · Mesa ${res.table_number}` : ''}
                    </Text>
                  </View>
                  {res.special_requests ? (
                    <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 4, fontStyle: 'italic' }}>
                      "{res.special_requests}"
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.badge, { backgroundColor: tone.border }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>
                    {STATUS_LABEL[res.status] ?? res.status}
                  </Text>
                </View>
              </View>

              {res.status === 'pending' && (
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: '#EF4444', opacity: acting === res.id ? 0.6 : 1 }]}
                    onPress={() => void updateStatus(res.id, 'cancelled')}
                    disabled={acting === res.id}
                  >
                    <X size={14} color="#FFF" />
                    <Text style={styles.btnText}>Recusar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: '#22C55E', opacity: acting === res.id ? 0.6 : 1 }]}
                    onPress={() => void updateStatus(res.id, 'confirmed')}
                    disabled={acting === res.id}
                  >
                    <Check size={14} color="#FFF" />
                    <Text style={styles.btnText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              )}
              {res.status === 'confirmed' && (
                <TouchableOpacity
                  style={[styles.wideBtn, { backgroundColor: colors.primary, opacity: acting === res.id ? 0.6 : 1 }]}
                  onPress={() => void updateStatus(res.id, 'seated')}
                  disabled={acting === res.id}
                >
                  <Text style={styles.btnText}>Sentar cliente</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  filterBar: { marginBottom: 16 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  wideBtn: { marginTop: 12, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  emptyBox: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', marginTop: 24 },
});
