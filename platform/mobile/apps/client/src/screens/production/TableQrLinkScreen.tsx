import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { stashPendingTableQr } from '../../utils/pending-table-qr';

/**
 * Entry point for a table QR opened outside the in-app scanner — the OS
 * camera, another app, or a cold launch. This route mounts on its own,
 * without VisitSessionProvider/CartProvider (expo-router screens outside
 * app/index.tsx don't get the inner app's provider tree), so it can't open
 * the table session itself. It stashes the payload and hands off to the
 * main app, which consumes it once mounted and authenticated (HomeScreen).
 */
export function TableQrLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    (async () => {
      if (code) await stashPendingTableQr(`noowe://t/${code}`);
      router.replace('/');
    })();
  }, [code]);

  return (
    <View style={styles.page}>
      <ActivityIndicator />
      <Text>Abrindo sua mesa…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
});
