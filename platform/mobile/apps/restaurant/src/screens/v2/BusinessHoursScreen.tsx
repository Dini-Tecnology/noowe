import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { V2Shell } from './shared/V2Shell';

/** Legacy route — horários agora vivem na tab do Perfil do Restaurante. */
export default function BusinessHoursScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();

  useEffect(() => {
    navigation.replace('RestaurantProfile', { initialTab: 'hours' });
  }, [navigation]);

  return (
    <V2Shell title="Horário de Funcionamento" subtitle="Redirecionando…" showBack>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
    </V2Shell>
  );
}
