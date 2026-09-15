import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { stashPendingTableInvite } from '../../utils/pending-table-invite';

/**
 * Entry point for a table-invite link (https://noowebr.com/t/invite/<token>)
 * opened outside the running app. Same hand-off pattern as TableQrLinkScreen:
 * stash the token and let HomeScreen consume it once the app — and its
 * providers — are mounted and authenticated.
 */
export function TableInviteLinkScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();

  useEffect(() => {
    (async () => {
      if (token) await stashPendingTableInvite(token);
      router.replace('/');
    })();
  }, [token]);

  return (
    <View style={styles.page}>
      <ActivityIndicator />
      <Text>Entrando na mesa…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
});
