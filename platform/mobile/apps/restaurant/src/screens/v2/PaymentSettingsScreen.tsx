import React, { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { V2Shell } from './shared/V2Shell';

/** Legacy route — redirects to the full ConfigPayments screen. */
export default function PaymentSettingsScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();

  useEffect(() => {
    navigation.replace('ConfigPayments');
  }, [navigation]);

  return (
    <V2Shell title="Pagamentos" subtitle="Carregando…" showBack>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
    </V2Shell>
  );
}
