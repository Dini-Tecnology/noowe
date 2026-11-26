import React, { useMemo } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { savedCards } from '../../services/saved-cards';
import { CardBrandIcon } from './CardBrandIcon';

/** "Meus cartões" (Perfil): os cartões salvos de verdade, com padrão e remoção no servidor. */
/** Sem `onAddCard`: o cadastro é por restaurante (subconta), então acontece no checkout. */
export function SavedCardsSection({ onAddCard }: { onAddCard?: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const cards = useQuery({ queryKey: ['saved-cards'], queryFn: () => savedCards.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['saved-cards'] });
  const setDefault = useMutation({ mutationFn: savedCards.setDefault, onSettled: refresh, onError: (e: Error) => Alert.alert('Meus cartões', e.message) });
  const remove = useMutation({ mutationFn: savedCards.remove, onSettled: refresh, onError: (e: Error) => Alert.alert('Meus cartões', e.message) });

  const styles = useMemo(() => StyleSheet.create({
    wrap: { gap: 10, marginBottom: 16 },
    title: { fontSize: 15, fontWeight: '700', color: colors.foreground },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    label: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.foreground },
    action: { fontSize: 13, fontWeight: '700', color: colors.primary },
    muted: { fontSize: 12, fontWeight: '700', color: colors.foregroundSecondary },
    danger: { fontSize: 13, fontWeight: '700', color: colors.error },
  }), [colors]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Meus cartões</Text>
      {cards.data?.length === 0 && <Text style={styles.muted}>Nenhum cartão salvo.</Text>}
      {(cards.data ?? []).map((card) => (
        <View key={card.id} style={styles.row} testID={`my-card-${card.id}`}>
          <CardBrandIcon brand={card.brand} width={36} />
          <Text style={styles.label}>{(card.brand ?? 'Cartão').toUpperCase()} •••• {card.lastFour}</Text>
          {card.isDefault ? (
            <Text style={styles.muted}>Padrão</Text>
          ) : (
            <TouchableOpacity onPress={() => setDefault.mutate(card.id)} disabled={setDefault.isPending} accessibilityRole="button" accessibilityLabel={`Tornar padrão o cartão final ${card.lastFour}`}>
              <Text style={styles.action}>Tornar padrão</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => Alert.alert('Remover cartão?', `O cartão final ${card.lastFour} deixa de ficar salvo.`, [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Remover', style: 'destructive', onPress: () => remove.mutate(card.id) },
            ])}
            accessibilityRole="button"
            accessibilityLabel={`Remover o cartão final ${card.lastFour}`}
          >
            <Text style={styles.danger}>Remover</Text>
          </TouchableOpacity>
        </View>
      ))}
      {onAddCard ? (
        <TouchableOpacity style={styles.row} onPress={onAddCard} accessibilityRole="button">
          <Text style={[styles.label, { color: colors.primary }]}>Adicionar novo cartão</Text>
        </TouchableOpacity>
      ) : <Text style={styles.muted}>Para adicionar um cartão, use "Adicionar novo cartão" no pagamento do restaurante.</Text>}
    </View>
  );
}
