import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type TeamCashInHand } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { centsFromText } from '../config/cashSettings';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/**
 * Acerto do garçom (ADR-029): quem recebeu dinheiro entrega ao caixa. O Gerente digita quanto recebeu sem ver o devido,
 * como no fechamento cego; o Dono vê o valor. Se não conferir, o servidor pede o motivo.
 */
export function TeamCashPanel() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [team, setTeam] = useState<TeamCashInHand[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [needsReason, setNeedsReason] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!restaurantId) return;
    supabaseApiAdapter.getTeamCashInHand(restaurantId).then((value) => setTeam(Array.isArray(value) ? value : [])).catch(() => setTeam([]));
  }, [restaurantId]);
  useFocusEffect(load);

  const open = (userId: string) => {
    setOpenId(userId);
    setAmount('');
    setReason('');
    setNeedsReason(false);
  };

  const settle = async (person: TeamCashInHand) => {
    const cents = centsFromText(amount);
    if (cents === null || !restaurantId) {
      Alert.alert('Valor inválido', 'Digite quanto foi entregue.');
      return;
    }
    setSaving(true);
    try {
      const result = await supabaseApiAdapter.settleStaffCash(restaurantId, person.userId, cents, reason.trim() || null);
      setOpenId(null);
      load();
      Alert.alert('Acerto registrado', result.hasDifference ? 'A diferença ficou registrada com o motivo.' : `Acerto de ${person.name} concluído.`);
    } catch (err) {
      const message = userErrorMessage(err, 'Tente novamente.');
      if (/informe o motivo/i.test(message)) setNeedsReason(true);
      Alert.alert('Não foi possível acertar', message);
    } finally {
      setSaving(false);
    }
  };

  if (team.length === 0) return null;

  const inputStyle = [styles.input, { borderColor: colors.border, color: colors.foreground }];
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Dinheiro com a equipe</Text>
      <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>Faça o acerto antes de fechar o caixa.</Text>
      {team.map((person) => (
        <View key={person.userId} style={styles.person}>
          <View style={styles.row}>
            <Text style={{ flex: 1, fontWeight: '700', color: colors.foreground }}>{person.name}</Text>
            {person.cents === null ? null : <Text style={{ fontWeight: '700', color: colors.foreground }}>{formatCents(person.cents)}</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel={`Acertar com ${person.name}`} onPress={() => open(person.userId)} style={styles.action}>
              <Text style={[styles.actionText, { color: colors.primary }]}>Acertar</Text>
            </Pressable>
          </View>
          {openId === person.userId ? (
            <View style={styles.form}>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Valor entregue (R$)" placeholderTextColor={colors.foregroundSecondary} accessibilityLabel="Valor entregue" style={inputStyle} />
              {needsReason ? (
                <TextInput value={reason} onChangeText={setReason} placeholder="Motivo da diferença" placeholderTextColor={colors.foregroundSecondary} accessibilityLabel="Motivo da diferença" style={inputStyle} />
              ) : null}
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void settle(person)} style={[styles.confirm, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
                <Text style={styles.confirmText}>Confirmar acerto</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12, gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 12 },
  person: { gap: 8, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { paddingVertical: 4, paddingHorizontal: 4 },
  actionText: { fontWeight: '800' },
  form: { gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  confirm: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  confirmText: { color: '#FFFFFF', fontWeight: '800' },
});
