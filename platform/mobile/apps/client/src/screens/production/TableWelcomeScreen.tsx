import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';
import { registerCustomerPushToken } from '../../services/customer-push';
import { goToComanda } from '../../navigation/comanda';
import { tableLabel } from './shared';

/** Tempo na tela de boas-vindas antes de cair sozinho na comanda. */
const AUTO_ADVANCE_MS = 1800;

/**
 * ADR-021: toda porta de entrada (QR, convite, reserva, fila) termina aqui — "Você está na Mesa
 * Salão 1 · Parrilaria Noowe" — e em seguida na comanda, que é o início da experiência. É também o
 * momento de pedir a permissão de notificação, com o motivo à vista.
 */
export default function TableWelcomeScreen({ navigation }: any) {
  const colors = useColors();
  const { session } = useVisitSession();
  const restaurantId = session?.restaurantId ?? '';
  const restaurant = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => customerBackend.getRestaurant(restaurantId),
    enabled: !!restaurantId && !session?.restaurantName,
  });
  const restaurantName = session?.restaurantName ?? restaurant.data?.name;
  const advanced = useRef(false);

  const continueToComanda = () => {
    if (advanced.current) return;
    advanced.current = true;
    goToComanda(navigation);
  };

  useEffect(() => {
    // Sem mesa ativa não há o que mostrar: a Home é o lugar certo.
    if (!session?.tableSessionId) {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      return;
    }
    void registerCustomerPushToken().catch(() => undefined);
    const timer = setTimeout(continueToComanda, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.tableSessionId]);

  const styles = useMemo(() => StyleSheet.create({
    page: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 14 },
    badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    title: { fontSize: 26, fontWeight: '800', color: colors.foreground, textAlign: 'center' },
    place: { fontSize: 17, color: colors.foregroundSecondary, textAlign: 'center' },
    hint: { fontSize: 14, lineHeight: 20, color: colors.foregroundSecondary, textAlign: 'center', paddingHorizontal: 12 },
    primary: { height: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: 12 },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  }), [colors]);

  return (
    <ScreenContainer>
      <View style={styles.page} testID="table-welcome-screen">
        <View style={styles.badge}>
          <Ionicons name="restaurant" size={40} color={colors.primary} />
        </View>
        <Text style={styles.title}>Você está na {tableLabel(session?.tableNumber)}</Text>
        {!!restaurantName && <Text style={styles.place} testID="table-welcome-restaurant">{restaurantName}</Text>}
        <Text style={styles.hint}>Para avisarmos sobre seus pedidos e sua mesa, ative as notificações.</Text>
        <TouchableOpacity
          style={styles.primary}
          onPress={continueToComanda}
          accessibilityRole="button"
          testID="table-welcome-continue"
        >
          <Text style={styles.primaryText}>Ver minha comanda</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
