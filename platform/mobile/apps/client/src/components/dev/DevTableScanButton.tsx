import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { showTableQrOutcome } from '../../hooks/qr-scan-outcome';
import { useTableQrHandler } from '../../hooks/useTableQrHandler';
import customerBackend from '../../services/customer-backend';
import { devScanErrorMessage, runDevTableScan } from './dev-table-scan';

declare const __DEV__: boolean;

type Props = {
  onOpened: (restaurantId: string) => void;
  onOpenAccount: (tableSessionId: string) => void;
  restaurantId?: string;
  variant?: 'chip' | 'light' | 'dark';
};

/**
 * Development-only stand-in for the table camera. Picks a real table QR and
 * runs the same open path as a scan, so the emulator can sit down without a
 * camera. Hidden in release builds.
 */
export function DevTableScanButton({ onOpened, onOpenAccount, restaurantId, variant = 'chip' }: Props) {
  const colors = useColors();
  const { handleQrScanned } = useTableQrHandler();
  const { refreshSession } = useVisitSession();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const retryRef = useRef<() => void>(() => {});

  const openExistingAccount = useCallback(async () => {
    try {
      const active = await refreshSession();
      if (active) onOpenAccount(active.tableSessionId);
      else Alert.alert('Não foi possível abrir a conta', 'Verifique a conexão e tente novamente.');
    } catch {
      Alert.alert('Não foi possível abrir a conta', 'Verifique a conexão e tente novamente.');
    }
  }, [onOpenAccount, refreshSession]);

  const open = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const outcome = await runDevTableScan(
        (id) => customerBackend.devPickTableQr(id),
        (qrData) => handleQrScanned(qrData, { dev: true }),
        restaurantId,
      );
      showTableQrOutcome(outcome, {
        onOpened,
        onRetry: () => retryRef.current(),
        onOpenAccount: () => { void openExistingAccount(); },
      });
    } catch (error) {
      Alert.alert('Mesa de teste', devScanErrorMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [handleQrScanned, onOpened, openExistingAccount, restaurantId]);

  useEffect(() => {
    retryRef.current = () => { void open(); };
  }, [open]);

  if (!__DEV__) return null;

  const dark = variant === 'dark';
  const filled = variant === 'light';

  return (
    <TouchableOpacity
      onPress={() => { void open(); }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Abrir mesa de teste sem câmera"
      style={[
        styles.base,
        variant === 'chip' && { alignSelf: 'flex-start', marginBottom: 12, backgroundColor: colors.backgroundTertiary },
        filled && { backgroundColor: colors.primary, paddingHorizontal: 18 },
        dark && { marginTop: 20, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={dark || filled ? '#FFFFFF' : colors.primary} />
      ) : (
        <Ionicons name="flask-outline" size={16} color={dark || filled ? '#FFFFFF' : colors.primary} />
      )}
      <Text style={[styles.label, { color: dark || filled ? '#FFFFFF' : colors.primary }]}>
        Mesa teste
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  label: { fontSize: 13, fontWeight: '700' },
});
