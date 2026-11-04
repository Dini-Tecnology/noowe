import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { stashPendingCouponLink } from '../../utils/pending-coupon-link';

/** Entrada do link `https://noowebr.com/c/<restaurante>/<código>`, como o convite de mesa: guarda e deixa a Home abrir. */
export function CouponLinkScreen() {
  const { restaurantId, code } = useLocalSearchParams<{ restaurantId?: string; code?: string }>();

  useEffect(() => {
    (async () => {
      if (restaurantId && code) await stashPendingCouponLink({ restaurantId, code });
      router.replace('/');
    })();
  }, [restaurantId, code]);

  return (
    <View style={styles.page}>
      <ActivityIndicator />
      <Text>Abrindo o cupom…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
});
