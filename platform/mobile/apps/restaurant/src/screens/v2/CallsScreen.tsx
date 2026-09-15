import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Bell, Check, Clock, AlertCircle } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useServiceCallsRealtime } from './shared/useRealtimeSubscription';
import { V2Shell } from './shared/V2Shell';

interface ServiceCall {
  id: string;
  table_id?: string;
  table_number?: number | string;
  call_type: string;
  message?: string;
  status: string;
  created_at: string;
  elapsed_minutes?: number;
}

function callTypeLabel(type: string): string {
  const map: Record<string, string> = {
    waiter: 'Chamar garçom',
    payment: 'Solicitar conta',
    assistance: 'Precisa de ajuda',
    water: 'Água',
    napkin: 'Guardanapo',
  };
  return map[type] ?? type;
}

function elapsedLabel(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'Agora';
  if (diff === 1) return '1 min atrás';
  return `${diff} min atrás`;
}

function statusTone(status: string): { bg: string; border: string; icon: typeof Bell } {
  if (status === 'open') return { bg: '#FEF2F2', border: '#EF4444', icon: AlertCircle };
  if (status === 'acknowledged') return { bg: '#FFFBEB', border: '#F59E0B', icon: Clock };
  return { bg: '#F0FDF4', border: '#22C55E', icon: Check };
}

export default function CallsScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await supabaseApiAdapter.getServiceCalls(undefined, ['open', 'acknowledged']);
      setCalls(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar chamados');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useServiceCallsRealtime(restaurantId, load);

  const onRefresh = () => { setRefreshing(true); void load(); };

  const acknowledge = async (id: string) => {
    setActing(id);
    try {
      await supabaseApiAdapter.acknowledgeServiceCall(id);
      void load();
    } catch (err) {
      console.warn('Erro ao reconhecer chamado:', err);
    } finally {
      setActing(null);
    }
  };

  const resolve = async (id: string) => {
    setActing(id);
    try {
      await supabaseApiAdapter.resolveServiceCall(id);
      void load();
    } catch (err) {
      console.warn('Erro ao resolver chamado:', err);
    } finally {
      setActing(null);
    }
  };

  const openCalls = calls.filter((c) => c.status === 'open');
  const ackCalls = calls.filter((c) => c.status === 'acknowledged');

  return (
    <V2Shell title="Chamados" subtitle="Solicitações de mesa" showBack>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
            Carregando chamados…
          </Text>
        )}
        {error && (
          <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
        )}
        {!loading && !error && calls.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Check size={32} color="#22C55E" />
            <Text style={{ color: colors.foreground, fontWeight: '700', marginTop: 10, fontSize: 16 }}>
              Tudo certo
            </Text>
            <Text style={{ color: colors.foregroundSecondary, marginTop: 4, textAlign: 'center' }}>
              Nenhum chamado aberto no momento.
            </Text>
          </View>
        )}

        {openCalls.length > 0 && (
          <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>
            Aguardando atendimento ({openCalls.length})
          </Text>
        )}
        {openCalls.map((call) => {
          const tone = statusTone(call.status);
          const Icon = tone.icon;
          return (
            <View key={call.id} style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <View style={styles.cardHeader}>
                <Icon size={18} color={tone.border} />
                <Text style={{ fontWeight: '700', color: colors.foreground, flex: 1, marginLeft: 8 }}>
                  {call.table_number ? `Mesa ${call.table_number}` : 'Mesa'} · {callTypeLabel(call.call_type)}
                </Text>
                <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
                  {elapsedLabel(call.created_at)}
                </Text>
              </View>
              {call.message ? (
                <Text style={{ fontSize: 13, color: colors.foregroundSecondary, marginTop: 4, marginLeft: 26 }}>
                  "{call.message}"
                </Text>
              ) : null}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: '#F59E0B', opacity: acting === call.id ? 0.6 : 1 }]}
                  onPress={() => void acknowledge(call.id)}
                  disabled={acting === call.id}
                >
                  <Text style={styles.btnText}>Reconhecer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: '#22C55E', opacity: acting === call.id ? 0.6 : 1 }]}
                  onPress={() => void resolve(call.id)}
                  disabled={acting === call.id}
                >
                  <Text style={styles.btnText}>Resolver</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {ackCalls.length > 0 && (
          <Text style={[styles.sectionTitle, { color: '#F59E0B', marginTop: 8 }]}>
            Em atendimento ({ackCalls.length})
          </Text>
        )}
        {ackCalls.map((call) => {
          const tone = statusTone(call.status);
          const Icon = tone.icon;
          return (
            <View key={call.id} style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <View style={styles.cardHeader}>
                <Icon size={18} color={tone.border} />
                <Text style={{ fontWeight: '700', color: colors.foreground, flex: 1, marginLeft: 8 }}>
                  {call.table_number ? `Mesa ${call.table_number}` : 'Mesa'} · {callTypeLabel(call.call_type)}
                </Text>
                <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
                  {elapsedLabel(call.created_at)}
                </Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: '#22C55E', opacity: acting === call.id ? 0.6 : 1 }]}
                  onPress={() => void resolve(call.id)}
                  disabled={acting === call.id}
                >
                  <Text style={styles.btnText}>Marcar resolvido</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    marginTop: 24,
  },
});
