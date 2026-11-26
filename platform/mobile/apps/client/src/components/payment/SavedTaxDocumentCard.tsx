import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { billShares } from '../../services/bill-shares';
import { maskTaxDocument } from '../../services/tax-document';

/** Perfil (RV-09): o CPF salvo com consentimento, mascarado, com opção de excluir. Sem CPF salvo, não aparece. */
export function SavedTaxDocumentCard() {
  const colors = useColors();
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    billShares.myTaxDocument().then((d) => { if (alive) setSaved(d); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!saved) return null;
  const remove = () => Alert.alert('Excluir CPF salvo', 'Nas próximas compras, você digita o CPF de novo se quiser na nota.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: () => {
      billShares.deleteMyTaxDocument().then(() => setSaved(null))
        .catch(() => Alert.alert('Não foi possível excluir', 'Tente novamente.'));
    } },
  ]);
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]} testID="saved-tax-document">
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.foreground }]}>CPF salvo para a nota</Text>
        <Text style={{ color: colors.foregroundMuted }}>{maskTaxDocument(saved)}</Text>
      </View>
      <TouchableOpacity onPress={remove} accessibilityRole="button" accessibilityLabel="Excluir CPF salvo" testID="saved-tax-document-delete">
        <Text style={{ color: colors.error, fontWeight: '600' }}>Excluir</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '600' },
});
