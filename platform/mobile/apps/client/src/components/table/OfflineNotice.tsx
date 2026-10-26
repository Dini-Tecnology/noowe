import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVisitSession } from '../../contexts/VisitSessionContext';

/**
 * ADR-021: sem internet a comanda continua na tela (guardada no aparelho). Nada novo é pedido até a
 * conexão voltar, e o servidor reconfirma a comanda sozinho.
 */
export function OfflineNotice() {
  const { session, offline } = useVisitSession();
  if (!offline || !session?.tableSessionId) return null;
  return (
    <View style={styles.strip} accessibilityRole="alert" testID="offline-notice">
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text style={styles.text}>Sem conexão — sua comanda está salva. Os pedidos voltam quando a internet voltar.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#64748B' },
  text: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
});
