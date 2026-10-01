import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import customerBackend from '../../services/customer-backend';
import { devScanErrorMessage } from './dev-table-scan';

declare const __DEV__: boolean;

type Props = {
  orderId: string;
  onSkipped: () => void;
};

/**
 * Development-only stand-in for the kitchen marking a dish ready. Hidden in
 * release builds. The database still owns the status change.
 */
export function DevSkipPrepButton({ orderId, onSkipped }: Props) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);

  const skip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await customerBackend.devSkipPrep(orderId);
      onSkipped();
    } catch (error) {
      Alert.alert('Pular preparo', devScanErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!__DEV__) return null;

  return (
    <TouchableOpacity
      onPress={() => { void skip(); }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Pular tempo de preparo"
      style={[styles.base, { backgroundColor: colors.backgroundTertiary }]}
    >
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons name="flask-outline" size={16} color={colors.primary} />
      )}
      <Text style={[styles.label, { color: colors.primary }]}>Pular preparo</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  label: { fontSize: 13, fontWeight: '700' },
});
