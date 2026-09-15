import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { RestaurantSubscreenHeader } from '../../components/restaurant/RestaurantSubscreenHeader';
import { useRestaurant } from '@okinawa/shared/hooks/useRestaurants';
import ApiService from '@/shared/services/api';

const CALL_TEAM_OPTIONS = [
  {
    id: 'waiter',
    icon: 'hand-left-outline' as const,
    iconColor: '#FF4B22',
    iconBg: '#FFF0EA',
    title: 'Chamar Garçom',
    subtitle: 'Dúvidas sobre pratos, pedidos especiais',
  },
  {
    id: 'help',
    icon: 'help-circle-outline' as const,
    iconColor: '#6B7280',
    iconBg: '#F3F4F6',
    title: 'Preciso de Ajuda',
    subtitle: 'Acessibilidade, limpeza, outros',
  },
] as const;

type RouteParams = {
  restaurantId?: string;
  tableId?: string;
};

export default function RestaurantCallTeamScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const params = (route.params ?? {}) as RouteParams;
  const { data: restaurant } = useRestaurant(params.restaurantId ?? '');
  const [sending, setSending] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1 },
        content: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 18,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        iconBox: {
          width: 48,
          height: 48,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cardTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.foreground,
          marginBottom: 4,
        },
        cardSub: {
          fontSize: 13,
          lineHeight: 18,
          color: colors.foregroundSecondary,
        },
        emptyState: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          gap: 12,
        },
        emptyStateText: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          textAlign: 'center',
        },
        emptyStateBtn: {
          marginTop: 8,
          backgroundColor: colors.primary,
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 14,
        },
        emptyStateBtnText: {
          color: colors.primaryForeground,
          fontSize: 14,
          fontWeight: '700',
        },
      }),
    [colors],
  );

  const handleCall = async (option: (typeof CALL_TEAM_OPTIONS)[number]) => {
    if (!params.restaurantId || !params.tableId) return;
    setSending(true);
    try {
      await ApiService.callWaiterForTable(params.restaurantId, params.tableId, option.subtitle);
      Alert.alert('Chamado enviado', `${option.title} — equipe notificada.`, [{ text: 'OK' }]);
    } catch (err: any) {
      Alert.alert('Não foi possível chamar a equipe', err?.message ?? 'Tente novamente em instantes.');
    } finally {
      setSending(false);
    }
  };

  if (!params.restaurantId || !params.tableId) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <RestaurantSubscreenHeader title="Chamar Equipe" />
        <View style={styles.emptyState}>
          <Ionicons name="qr-code-outline" size={40} color={colors.foregroundMuted} />
          <Text style={styles.emptyStateText}>
            Escaneie o QR Code da mesa para poder chamar a equipe
          </Text>
          <TouchableOpacity
            style={styles.emptyStateBtn}
            onPress={() => navigation.navigate('QRScanner')}
            accessibilityRole="button"
          >
            <Text style={styles.emptyStateBtnText}>Escanear QR</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <RestaurantSubscreenHeader
        title="Chamar Equipe"
        subtitle={restaurant?.name}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {CALL_TEAM_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={styles.card}
            onPress={() => handleCall(option)}
            activeOpacity={0.85}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={option.title}
          >
            <View style={[styles.iconBox, { backgroundColor: option.iconBg }]}>
              <Ionicons name={option.icon} size={24} color={option.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{option.title}</Text>
              <Text style={styles.cardSub}>{option.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
