import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type StaffShift } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { useRegisterRemoteRefresh } from './remoteRefreshRegistry';

const ROLE_LABEL: Record<string, string> = { waiter: 'Garçom', maitre: 'Maître', host: 'Recepção', chef: 'Chef', cook: 'Cozinha', barman: 'Bar', cashier: 'Caixa' };
const MAX_OWN = 3;

function dayLabel(date: string): string {
  const day = new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (day === today) return 'Hoje';
  return new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
}
const hours = (shift: StaffShift) => `${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}`;
const place = (shift: StaffShift) => shift.station_name ?? shift.area ?? (shift.role ? ROLE_LABEL[shift.role] ?? '' : '');

/**
 * Escala (resposta 45): cada pessoa vê a própria; o Maître vê a do salão no dia, para distribuir as mesas, e o Chef a da cozinha.
 * Dono e Gerente editam na tela Escala, e por isso não veem este cartão.
 */
export function ShiftsTodayCard() {
  const colors = useColors();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const roles = serverRoles ?? [];
  const manages = roles.includes('owner') || roles.includes('manager');
  const area: 'floor' | 'kitchen' | null = roles.includes('maitre') ? 'floor' : roles.includes('chef') ? 'kitchen' : null;
  const [own, setOwn] = useState<StaffShift[]>([]);
  const [team, setTeam] = useState<StaffShift[]>([]);

  const load = useCallback(() => {
    if (!restaurantId || manages) return;
    supabaseApiAdapter.getMyShifts(restaurantId).then((rows) => setOwn(Array.isArray(rows) ? rows : [])).catch(() => setOwn([]));
    if (area) supabaseApiAdapter.getDayTeamShifts(restaurantId, area).then((rows) => setTeam(Array.isArray(rows) ? rows : [])).catch(() => setTeam([]));
  }, [restaurantId, manages, area]);
  useFocusEffect(load);
  // Puxar para atualizar traz a escala editada pelo Gerente sem sair da tela.
  useRegisterRemoteRefresh(load);

  if (manages || (own.length === 0 && team.length === 0)) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {own.length > 0 ? (
        <>
          <Text style={[styles.title, { color: colors.foreground }]}>Minha escala</Text>
          {own.slice(0, MAX_OWN).map((shift) => (
            <Text key={shift.id} style={{ color: colors.foreground }}>
              {dayLabel(shift.date)} · {hours(shift)}{place(shift) ? ` · ${place(shift)}` : ''}
            </Text>
          ))}
        </>
      ) : null}
      {team.length > 0 ? (
        <>
          <Text style={[styles.title, { color: colors.foreground, marginTop: own.length > 0 ? 8 : 0 }]}>
            {area === 'floor' ? 'Escala do salão hoje' : 'Escala da cozinha hoje'}
          </Text>
          {team.map((shift) => (
            <Text key={shift.id} style={{ color: colors.foregroundSecondary }}>
              {shift.staff_name ?? 'Sem nome'} · {hours(shift)}{place(shift) ? ` · ${place(shift)}` : ''}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, gap: 4 },
  title: { fontSize: 15, fontWeight: '800' },
});
