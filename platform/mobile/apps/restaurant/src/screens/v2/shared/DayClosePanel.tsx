import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type DayStatus } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const formatDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Fechamento do dia: bloqueia com comanda ou caixa abertos, gera o rateio e manda o resumo ao Dono. */
export function DayClosePanel() {
  const colors = useColors();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const [day, setDay] = useState<DayStatus | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isOwner = serverRoles.includes('owner');

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setDay(await supabaseApiAdapter.getDayStatus(restaurantId));
    } catch {
      setDay(null);
    }
  }, [restaurantId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const close = async (dayId?: string) => {
    if (!restaurantId) return;
    setBusy(true);
    try {
      const summary = await supabaseApiAdapter.closeOperationalDay(restaurantId, dayId ?? null);
      Alert.alert('Dia fechado', `Gorjeta do dia: ${formatCents(Number(summary?.tipPoolCents ?? 0))}. O resumo foi para o Dono.`);
      await load();
    } catch (err) {
      Alert.alert('Não foi possível fechar o dia', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setBusy(false);
    }
  };

  const review = async (sessionId: string) => {
    const note = notes[sessionId]?.trim();
    if (!note) {
      Alert.alert('Motivo obrigatório', 'Diga como a diferença foi resolvida.');
      return;
    }
    try {
      await supabaseApiAdapter.reviewCashBreak(sessionId, note);
      await load();
    } catch (err) {
      Alert.alert('Não foi possível registrar', userErrorMessage(err, 'Tente novamente.'));
    }
  };

  if (!day) return null;
  const blocked = day.openSessions > 0 || day.cashOpen;

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Fechamento do dia · {formatDay(day.businessDate)}</Text>
      {day.openSessions > 0 ? <Text style={{ color: colors.foregroundSecondary }}>{day.openSessions} comanda(s) aberta(s).</Text> : null}
      {day.cashOpen ? <Text style={{ color: colors.foregroundSecondary }}>O caixa ainda está aberto.</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={blocked || busy}
        onPress={() => void close()}
        style={[styles.action, { backgroundColor: colors.primary, opacity: blocked || busy ? 0.5 : 1 }]}
      >
        <Text style={styles.actionText}>Fechar o dia</Text>
      </Pressable>

      {day.unclosedDays.map((pending) => (
        <View key={pending.dayId} style={styles.row}>
          <Text style={{ flex: 1, color: colors.foreground }}>Dia {formatDay(pending.businessDate)} sem fechamento</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void close(pending.dayId)}>
            <Text style={{ fontWeight: '700', color: colors.primary }}>Fechar</Text>
          </Pressable>
        </View>
      ))}

      {day.pendingBreaks.map((item) => (
        <View key={item.sessionId} style={styles.breakBox}>
          <Text style={{ color: colors.foreground, fontWeight: '600' }}>Quebra de {formatCents(item.differenceCents)} acima do limite</Text>
          {isOwner ? (
            <>
              <TextInput
                value={notes[item.sessionId] ?? ''}
                onChangeText={(text) => setNotes((current) => ({ ...current, [item.sessionId]: text }))}
                placeholder="Como foi resolvida"
                placeholderTextColor={colors.foregroundSecondary}
                accessibilityLabel="Como a quebra foi resolvida"
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              />
              <Pressable accessibilityRole="button" onPress={() => void review(item.sessionId)}>
                <Text style={{ fontWeight: '700', color: colors.primary }}>Registrar</Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>Aguardando o Dono.</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 16, gap: 10 },
  title: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  actionText: { color: '#FFFFFF', fontWeight: '800' },
  breakBox: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
});
